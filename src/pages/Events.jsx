import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock } from 'lucide-react';
import { supabase, AUTHOR_COLS } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorText, eventWhen } from '../lib/format';
import ReportDialog from '../components/ReportDialog';

const EVENT_SELECT = `id, title, description, location, starts_at, ends_at, created_by,
  host:profiles!events_created_by_fkey(${AUTHOR_COLS}),
  event_rsvps(user_id, status, person:profiles!event_rsvps_user_id_fkey(id, full_name))`;

export default function Events() {
  const [past, setPast] = useState(false);
  const [events, setEvents] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const cutoff = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    let q = supabase.from('events').select(EVENT_SELECT);
    q = past ? q.lt('starts_at', cutoff).order('starts_at', { ascending: false }).limit(50) : q.gte('starts_at', cutoff).order('starts_at');
    const { data, error } = await q;
    if (error) setError(errorText(error));
    setEvents(data || []);
  }, [past]);

  useEffect(() => {
    setEvents(null);
    load();
  }, [load]);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Events</h1>
        {!creating && <button className="btn" onClick={() => setCreating(true)}>Create event</button>}
      </div>
      {creating && <EventForm onDone={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />}
      <div className="chips" role="tablist">
        <button role="tab" aria-selected={!past} className={`chip ${!past ? 'on' : ''}`} onClick={() => setPast(false)}>Upcoming</button>
        <button role="tab" aria-selected={past} className={`chip ${past ? 'on' : ''}`} onClick={() => setPast(true)}>Past</button>
      </div>
      {error && <p className="error">{error}</p>}
      {events === null && <p className="muted">Loading events…</p>}
      {events?.length === 0 && (
        <div className="empty">
          <p>{past ? 'No past events.' : 'Nothing planned yet. Organise a reunion, a study group or a career talk.'}</p>
        </div>
      )}
      <div className="stack">
        {events?.map((ev) => <EventCard key={ev.id} ev={ev} onChange={load} />)}
      </div>
    </div>
  );
}

function EventCard({ ev, onChange }) {
  const { profile } = useAuth();
  const [reporting, setReporting] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const mine = ev.event_rsvps.find((r) => r.user_id === profile.id)?.status;
  const going = ev.event_rsvps.filter((r) => r.status === 'going');
  const interested = ev.event_rsvps.filter((r) => r.status === 'interested');
  const d = new Date(ev.starts_at);

  const rsvp = async (status) => {
    if (mine === status) {
      await supabase.from('event_rsvps').delete().match({ event_id: ev.id, user_id: profile.id });
    } else if (mine) {
      await supabase.from('event_rsvps').update({ status }).match({ event_id: ev.id, user_id: profile.id });
    } else {
      await supabase.from('event_rsvps').insert({ event_id: ev.id, status });
    }
    onChange();
  };

  const remove = async () => {
    if (!confirm('Delete this event?')) return;
    const { error } = await supabase.from('events').delete().eq('id', ev.id);
    if (error) alert(errorText(error));
    onChange();
  };

  return (
    <article className="event">
      <div className="event-date" aria-hidden="true">
        <span className="event-month">{d.toLocaleString(undefined, { month: 'short' })}</span>
        <span className="event-day">{d.getDate()}</span>
      </div>
      <div className="event-main">
        <h2 className="event-title">{ev.title}</h2>
        <p className="event-line"><Clock size={16} aria-hidden="true" /> {eventWhen(ev.starts_at, ev.ends_at)}</p>
        {ev.location && <p className="event-line"><MapPin size={16} aria-hidden="true" /> {ev.location}</p>}
        {ev.description && <p className="event-desc">{ev.description}</p>}
        <p className="muted small">
          Hosted by <Link to={`/profile/${ev.host?.id}`}>{ev.host?.full_name}</Link>
          {' '}
          <button className="link-btn" onClick={() => setShowPeople((s) => !s)}>
            {going.length} going, {interested.length} interested
          </button>
        </p>
        {showPeople && (
          <p className="small">
            {[...going, ...interested].map((r, i) => (
              <span key={r.user_id}>
                {i > 0 && ', '}
                <Link to={`/profile/${r.user_id}`}>{r.person?.full_name}</Link>
                {r.status === 'interested' && <span className="muted"> (interested)</span>}
              </span>
            ))}
          </p>
        )}
        <div className="event-actions">
          <button className={`btn small ${mine === 'going' ? '' : 'ghost'}`} onClick={() => rsvp('going')} aria-pressed={mine === 'going'}>
            {mine === 'going' ? 'Going' : 'I\u2019m going'}
          </button>
          <button className={`btn small ${mine === 'interested' ? '' : 'ghost'}`} onClick={() => rsvp('interested')} aria-pressed={mine === 'interested'}>
            Interested
          </button>
          <span className="spacer" />
          {(ev.created_by === profile.id || profile.is_admin) && <button className="action text" onClick={remove}>Delete</button>}
          {ev.created_by !== profile.id && <button className="action text" onClick={() => setReporting(true)}>Report</button>}
        </div>
      </div>
      {reporting && <ReportDialog targetType="event" targetId={ev.id} onClose={() => setReporting(false)} />}
    </article>
  );
}

function EventForm({ onDone, onCancel }) {
  const [f, setF] = useState({ title: '', starts_at: '', ends_at: '', location: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.from('events').insert({
      title: f.title.trim(),
      starts_at: new Date(f.starts_at).toISOString(),
      ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null,
      location: f.location.trim() || null,
      description: f.description.trim() || null,
    });
    setBusy(false);
    if (error) setError(/ends_at/.test(error.message) ? 'The end time must be after the start time.' : errorText(error));
    else onDone();
  };

  return (
    <form className="panel" onSubmit={submit}>
      <h2>New event</h2>
      <label className="field"><span>Title</span><input required maxLength={150} value={f.title} onChange={set('title')} /></label>
      <div className="two-col">
        <label className="field"><span>Starts</span><input type="datetime-local" required value={f.starts_at} onChange={set('starts_at')} /></label>
        <label className="field"><span>Ends (optional)</span><input type="datetime-local" value={f.ends_at} onChange={set('ends_at')} /></label>
      </div>
      <label className="field"><span>Where</span><input maxLength={150} value={f.location} onChange={set('location')} placeholder="School auditorium, or an online link" /></label>
      <label className="field"><span>Details</span><textarea rows={4} maxLength={3000} value={f.description} onChange={set('description')} /></label>
      {error && <p className="error">{error}</p>}
      <div className="row-end">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create event'}</button>
      </div>
    </form>
  );
}
