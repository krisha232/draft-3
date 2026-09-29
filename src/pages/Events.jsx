import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock } from 'lucide-react';
import { supabase, AUTHOR_COLS } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorText, eventWhen } from '../lib/format';
import ReportDialog from '../components/ReportDialog';
import FilePicker from '../components/FilePicker';
import { Attachments } from '../components/PostCard';
import { uploadAttachments, deleteAttachments } from '../lib/files';

export const EVENT_SELECT = `id, title, description, location, starts_at, ends_at, created_by, attachments, status,
  host:profiles!events_created_by_fkey(${AUTHOR_COLS}),
  event_rsvps(user_id, status, person:profiles!event_rsvps_user_id_fkey(id, full_name))`;

export default function Events() {
  const { profile } = useAuth();
  const [past, setPast] = useState(false);
  const [events, setEvents] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const cutoff = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    let q = supabase.from('events').select(EVENT_SELECT);
    q = past ? q.lt('starts_at', cutoff).order('starts_at', { ascending: false }).limit(50) : q.gte('starts_at', cutoff).order('starts_at');
    const { data, error } = await q;
    if (error) setError(errorText(error));
    // Published events for everyone; your own events whatever their status;
    // admins also see events waiting for approval (others' rejected ones stay hidden)
    setEvents(
      (data || []).filter(
        (ev) => ev.status === 'approved' || ev.created_by === profile.id || (profile.is_admin && ev.status === 'pending')
      )
    );
  }, [past, profile.id, profile.is_admin]);

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
      {creating && (
        <EventForm
          onDone={(status) => {
            setCreating(false);
            setNotice(
              status === 'pending'
                ? 'Your event was sent to the school admins. It will appear for everyone once an admin approves it.'
                : ''
            );
            load();
          }}
          onCancel={() => setCreating(false)}
        />
      )}
      {notice && <p className="notice">{notice}</p>}
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

export function EventCard({ ev, onChange }) {
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

  const review = async (approve) => {
    if (!approve && !confirm(`Reject “${ev.title}”? It won’t be published. ${ev.host?.full_name || 'The organiser'} will see that it wasn’t approved.`)) return;
    const { error } = await supabase.rpc('admin_review_event', { event: ev.id, approve });
    if (error) alert(errorText(error));
    onChange();
  };

  const remove = async () => {
    if (!confirm('Delete this event?')) return;
    const { error } = await supabase.from('events').delete().eq('id', ev.id);
    if (error) alert(errorText(error));
    else await deleteAttachments(ev.attachments);
    onChange();
  };

  return (
    <article className={`event event-${ev.status}`}>
      <div className="event-date" aria-hidden="true">
        <span className="event-month">{d.toLocaleString(undefined, { month: 'short' })}</span>
        <span className="event-day">{d.getDate()}</span>
      </div>
      <div className="event-main">
        {ev.status === 'pending' && (
          <p className="event-status pending">
            {ev.created_by === profile.id ? 'Waiting for admin approval. Only you and the admins can see this.' : 'Waiting for your approval'}
          </p>
        )}
        {ev.status === 'rejected' && (
          <p className="event-status rejected">Not approved by an admin. Only you can see this. You can delete it, or ask an admin why.</p>
        )}
        <h2 className="event-title">{ev.title}</h2>
        <p className="event-line"><Clock size={16} aria-hidden="true" /> {eventWhen(ev.starts_at, ev.ends_at)}</p>
        {ev.location && <p className="event-line"><MapPin size={16} aria-hidden="true" /> {ev.location}</p>}
        {ev.description && <p className="event-desc">{ev.description}</p>}
        {ev.attachments?.length > 0 && <Attachments items={ev.attachments} />}
        <p className="muted small">
          Hosted by <Link to={`/profile/${ev.host?.id}`}>{ev.host?.full_name}</Link>
          {ev.status === 'approved' && (
            <>
              {' · '}
              <button className="link-btn" onClick={() => setShowPeople((s) => !s)}>
                {going.length} going, {interested.length} interested
              </button>
            </>
          )}
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
          {ev.status === 'approved' && (
            <>
              <button className={`btn small ${mine === 'going' ? '' : 'ghost'}`} onClick={() => rsvp('going')} aria-pressed={mine === 'going'}>
                {mine === 'going' ? 'Going' : 'I\u2019m going'}
              </button>
              <button className={`btn small ${mine === 'interested' ? '' : 'ghost'}`} onClick={() => rsvp('interested')} aria-pressed={mine === 'interested'}>
                Interested
              </button>
            </>
          )}
          {ev.status === 'pending' && profile.is_admin && (
            <>
              <button className="btn small" onClick={() => review(true)}>Approve</button>
              <button className="btn small ghost danger-text" onClick={() => review(false)}>Reject</button>
            </>
          )}
          <span className="spacer" />
          {(ev.created_by === profile.id || profile.is_admin) && <button className="action text" onClick={remove}>Delete</button>}
          {ev.created_by !== profile.id && <button className="action text" onClick={() => setReporting(true)}>Report</button>}
        </div>
      </div>
      {reporting && <ReportDialog targetType="event" targetId={ev.id} onClose={() => setReporting(false)} />}
    </article>
  );
}

// "2026-10-05T19:00" for a datetime-local input, in local time
function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function EventForm({ onDone, onCancel }) {
  const { profile } = useAuth();
  const [f, setF] = useState({ title: '', starts_at: '', ends_at: '', location: '', description: '' });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const start = f.starts_at ? new Date(f.starts_at) : null;
  const end = f.ends_at ? new Date(f.ends_at) : null;
  const startOk = start && !isNaN(start);
  const endOk = !f.ends_at || (end && !isNaN(end));
  const endBeforeStart = startOk && end && !isNaN(end) && end <= start;

  // When the start changes and the end would now be before it, move the end to 2 hours after the start
  const setStart = (e) => {
    const value = e.target.value;
    const s = new Date(value);
    let ends_at = f.ends_at;
    if (value && !isNaN(s) && ends_at && new Date(ends_at) <= s) ends_at = toLocalInput(new Date(s.getTime() + 2 * 3600 * 1000));
    setF({ ...f, starts_at: value, ends_at });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!startOk) return setError('Choose when the event starts.');
    if (!endOk) return setError('The end time isn’t a valid date and time.');
    if (endBeforeStart) return setError('The event ends before it starts. Check the end time (and AM/PM).');
    setBusy(true);
    let attachments = [];
    try {
      attachments = await uploadAttachments(profile.id, files);
    } catch (err) {
      setBusy(false);
      return setError(err.message);
    }
    const { data, error } = await supabase
      .from('events')
      .insert({
        title: f.title.trim(),
        starts_at: start.toISOString(),
        ends_at: end ? end.toISOString() : null,
        location: f.location.trim() || null,
        description: f.description.trim() || null,
        attachments,
      })
      .select('status')
      .single();
    setBusy(false);
    if (error) {
      await deleteAttachments(attachments);
      setError(/events_check|ends_at/.test(error.message) ? 'The event ends before it starts. Check the end time (and AM/PM).' : errorText(error));
    } else onDone(data?.status);
  };

  return (
    <form className="panel" onSubmit={submit}>
      <h2>New event</h2>
      {!(profile.is_admin || profile.role === 'staff') && (
        <p className="muted small">A school admin will review your event before it's published.</p>
      )}
      <label className="field"><span>Title</span><input required maxLength={150} value={f.title} onChange={set('title')} /></label>
      <div className="two-col">
        <label className="field"><span>Starts</span><input type="datetime-local" required value={f.starts_at} onChange={setStart} /></label>
        <label className="field">
          <span>Ends (optional)</span>
          <input type="datetime-local" min={f.starts_at || undefined} value={f.ends_at} onChange={set('ends_at')} aria-invalid={endBeforeStart || undefined} />
        </label>
      </div>
      {startOk && !endBeforeStart && endOk && (
        <p className="notice small">Your event: {eventWhen(start.toISOString(), end ? end.toISOString() : null)}</p>
      )}
      {endBeforeStart && (
        <p className="error small">
          This ends before it starts. Check the end time, especially AM and PM: an evening event ending at 9:00 should be 9:00 PM.
        </p>
      )}
      <label className="field"><span>Where</span><input maxLength={150} value={f.location} onChange={set('location')} placeholder="School auditorium, or an online link" /></label>
      <label className="field"><span>Details</span><textarea rows={4} maxLength={3000} value={f.description} onChange={set('description')} /></label>
      <FilePicker files={files} setFiles={setFiles} onError={setError} />
      {error && <p className="error">{error}</p>}
      <div className="row-end">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn" disabled={busy || endBeforeStart}>{busy ? (files.length ? 'Uploading…' : 'Creating…') : 'Create event'}</button>
      </div>
    </form>
  );
}
