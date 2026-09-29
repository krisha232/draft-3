import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorText, ROLE_LABEL, timeAgo } from '../lib/format';
import { EventCard, EVENT_SELECT } from './Events';

const TABS = ['Approvals', 'Events', 'Members', 'Roster', 'Reports'];

export default function Admin() {
  const [tab, setTab] = useState('Approvals');
  const [members, setMembers] = useState(null);
  const [openReports, setOpenReports] = useState(0);
  const [pendingEvents, setPendingEvents] = useState(0);
  const [error, setError] = useState('');

  const loadMembers = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_members');
    if (error) setError(errorText(error));
    setMembers(data || []);
    const { count } = await supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open');
    setOpenReports(count || 0);
    const ev = await supabase.from('events').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    setPendingEvents(ev.count || 0);
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const pending = members?.filter((m) => m.status === 'pending') || [];
  const counts = { Approvals: pending.length, Events: pendingEvents, Reports: openReports };

  return (
    <div className="page wide">
      <h1 className="page-title">Admin</h1>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t}
            {counts[t] > 0 && <span className="badge">{counts[t]}</span>}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {tab === 'Approvals' && <Approvals pending={pending} loading={!members} reload={loadMembers} />}
      {tab === 'Events' && <EventApprovals reload={loadMembers} />}
      {tab === 'Members' && <MembersAdmin members={members} reload={loadMembers} />}
      {tab === 'Roster' && <Roster />}
      {tab === 'Reports' && <Reports reload={loadMembers} />}
    </div>
  );
}

async function run(fn, reload) {
  const { error } = await fn;
  if (error) alert(errorText(error));
  reload();
}

function Approvals({ pending, loading, reload }) {
  if (loading) return <p className="muted">Loading…</p>;
  if (!pending.length) return <div className="empty"><p>No one is waiting for approval.</p></div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Name</th><th>ID number</th><th>Email</th><th>Role</th><th>Signed up</th><th /></tr>
        </thead>
        <tbody>
          {pending.map((m) => (
            <tr key={m.user_id}>
              <td>{m.full_name}</td>
              <td className="mono">{m.id_number}</td>
              <td>{m.email}</td>
              <td>{ROLE_LABEL[m.role]}{m.batch_year ? `, ${m.batch_year}` : ''}</td>
              <td>{timeAgo(m.created_at)}</td>
              <td className="actions-cell">
                <button className="btn small" onClick={() => run(supabase.rpc('admin_set_status', { target: m.user_id, new_status: 'active' }), reload)}>Approve</button>
                <button
                  className="btn small ghost"
                  onClick={() => {
                    if (confirm(`Reject ${m.full_name}? Their account will be unlinked from ID ${m.id_number}, and the ID can be claimed again.`))
                      run(supabase.rpc('admin_unlink', { target: m.user_id }), reload);
                  }}
                >
                  Reject
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MembersAdmin({ members, reload }) {
  const { profile } = useAuth();
  const [q, setQ] = useState('');
  if (!members) return <p className="muted">Loading…</p>;
  const shown = members.filter((m) =>
    `${m.full_name} ${m.email} ${m.id_number || ''}`.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <>
      <div className="filters">
        <input type="search" placeholder="Search name, email or ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>ID number</th><th>Email</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.user_id}>
                <td>
                  <Link to={`/profile/${m.user_id}`}>{m.full_name}</Link>
                  {m.is_admin && <span className="tag tag-announcement">Admin</span>}
                  <div className="muted small">{ROLE_LABEL[m.role]}{m.batch_year ? `, ${m.batch_year}` : ''}</div>
                </td>
                <td className="mono">{m.id_number}</td>
                <td>{m.email}</td>
                <td><span className={`status status-${m.status}`}>{m.status}</span></td>
                <td className="actions-cell">
                  {m.user_id !== profile.id && (
                    <>
                      {m.status === 'active' ? (
                        <button className="btn small ghost" onClick={() => run(supabase.rpc('admin_set_status', { target: m.user_id, new_status: 'suspended' }), reload)}>Suspend</button>
                      ) : (
                        <button className="btn small" onClick={() => run(supabase.rpc('admin_set_status', { target: m.user_id, new_status: 'active' }), reload)}>{m.status === 'pending' ? 'Approve' : 'Reactivate'}</button>
                      )}
                      <button
                        className="btn small ghost"
                        onClick={() => {
                          const verb = m.is_admin ? 'Remove admin access from' : 'Make admin:';
                          if (confirm(`${verb} ${m.full_name}?`)) run(supabase.rpc('admin_set_admin', { target: m.user_id, make_admin: !m.is_admin }), reload);
                        }}
                      >
                        {m.is_admin ? 'Remove admin' : 'Make admin'}
                      </button>
                      <button
                        className="btn small ghost danger-text"
                        onClick={() => {
                          if (confirm(`Unlink ${m.full_name} from ID ${m.id_number}? This deletes their profile, posts and messages. Use it when the wrong person claimed an ID.`))
                            run(supabase.rpc('admin_unlink', { target: m.user_id }), reload);
                        }}
                      >
                        Unlink ID
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------- Roster ----------------

function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.trim()));
  }
  return rows;
}

function toRosterRow(cells, lineNo) {
  const [id, name, role, year] = cells;
  const r = (role || '').toLowerCase();
  if (!id || !name) throw new Error(`Line ${lineNo}: ID number and name are required.`);
  if (!['student', 'alumni', 'staff'].includes(r)) throw new Error(`Line ${lineNo}: role must be student, alumni or staff (got "${role || ''}").`);
  const y = year ? Number(year) : null;
  if (year && !Number.isInteger(y)) throw new Error(`Line ${lineNo}: class year "${year}" isn’t a year.`);
  return {
    id_number: id.toUpperCase().trim(),
    full_name: name.replace(/\s+/g, ' ').trim(),
    role: r,
    batch_year: y,
  };
}

function Roster() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [csv, setCsv] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [one, setOne] = useState({ id_number: '', full_name: '', role: 'student', batch_year: '' });

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('roster')
      .select('id_number, full_name, role, batch_year, claimed_by, claimed_at')
      .order('id_number');
    if (error) setError(errorText(error));
    setRows(data || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const importCsv = async () => {
    setMsg('');
    setError('');
    let parsed;
    try {
      const lines = parseCsv(csv);
      if (lines.length && /id/i.test(lines[0][0]) && /name/i.test(lines[0][1] || '')) lines.shift();
      parsed = lines.map((c, i) => toRosterRow(c, i + 1));
    } catch (e) {
      return setError(e.message);
    }
    if (!parsed.length) return setError('Paste at least one row.');
    const dupes = parsed.map((p) => p.id_number).filter((id, i, a) => a.indexOf(id) !== i);
    if (dupes.length) return setError(`These ID numbers appear more than once: ${[...new Set(dupes)].join(', ')}`);
    setBusy(true);
    for (let i = 0; i < parsed.length; i += 500) {
      const { error } = await supabase.from('roster').upsert(parsed.slice(i, i + 500), { onConflict: 'id_number' });
      if (error) {
        setBusy(false);
        return setError(errorText(error));
      }
    }
    setBusy(false);
    setCsv('');
    setMsg(`Saved ${parsed.length} roster entries. Existing IDs were updated.`);
    load();
  };

  const addOne = async (e) => {
    e.preventDefault();
    setMsg('');
    setError('');
    let row;
    try {
      row = toRosterRow([one.id_number, one.full_name, one.role, one.batch_year], 1);
    } catch (err) {
      return setError(err.message.replace('Line 1: ', ''));
    }
    const { error } = await supabase.from('roster').insert(row);
    if (error) return setError(/duplicate key/.test(error.message) ? `ID ${row.id_number} is already on the roster.` : errorText(error));
    setOne({ id_number: '', full_name: '', role: 'student', batch_year: '' });
    setMsg(`Added ${row.full_name} (${row.id_number}).`);
    load();
  };

  const remove = async (r) => {
    if (!confirm(`Remove ${r.full_name} (${r.id_number}) from the roster?`)) return;
    const { error } = await supabase.from('roster').delete().eq('id_number', r.id_number);
    if (error) alert(errorText(error));
    load();
  };

  const shown = (rows || []).filter((r) => `${r.id_number} ${r.full_name}`.toLowerCase().includes(q.toLowerCase()));
  const claimed = (rows || []).filter((r) => r.claimed_by).length;

  return (
    <>
      <p className="muted">
        The roster is the list of ID numbers allowed to join. Only admins can see it. People sign up, then enter their ID
        number and name; both must match a row here.
      </p>
      <div className="two-col">
        <form className="panel" onSubmit={addOne}>
          <h2>Add one person</h2>
          <label className="field"><span>ID number</span><input required value={one.id_number} onChange={(e) => setOne({ ...one, id_number: e.target.value })} /></label>
          <label className="field"><span>Full name</span><input required value={one.full_name} onChange={(e) => setOne({ ...one, full_name: e.target.value })} /></label>
          <div className="two-col">
            <label className="field">
              <span>Role</span>
              <select value={one.role} onChange={(e) => setOne({ ...one, role: e.target.value })}>
                <option value="student">Student</option>
                <option value="alumni">Alumni</option>
                <option value="staff">Staff</option>
              </select>
            </label>
            <label className="field"><span>Class of</span><input inputMode="numeric" value={one.batch_year} onChange={(e) => setOne({ ...one, batch_year: e.target.value })} /></label>
          </div>
          <button className="btn">Add to roster</button>
        </form>
        <div className="panel">
          <h2>Import many from a spreadsheet</h2>
          <p className="muted small">
            Paste rows as CSV with columns: id_number, full_name, role, batch_year. Role is student, alumni or
            staff. Re-importing an existing ID updates it.
          </p>
          <textarea
            rows={7}
            className="mono"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={'id_number,full_name,role,batch_year\nSTU1001,Arjun Mehta,student,2028\nALU0450,Kavya Iyer,alumni,2015'}
            aria-label="CSV rows"
          />
          <div className="row-end">
            <button className="btn" onClick={importCsv} disabled={busy || !csv.trim()}>{busy ? 'Importing…' : 'Import rows'}</button>
          </div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {msg && <p className="notice">{msg}</p>}

      <div className="filters">
        <input type="search" placeholder="Search roster" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search roster" />
        {rows && <span className="muted small">{rows.length} IDs, {claimed} claimed</span>}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>ID number</th><th>Name</th><th>Role</th><th>Class of</th><th>Claimed</th><th /></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id_number}>
                <td className="mono">{r.id_number}</td>
                <td>{r.full_name}</td>
                <td>{ROLE_LABEL[r.role]}</td>
                <td>{r.batch_year || ''}</td>
                <td>{r.claimed_by ? timeAgo(r.claimed_at) : <span className="muted">Not yet</span>}</td>
                <td className="actions-cell">
                  {!r.claimed_by && <button className="btn small ghost" onClick={() => remove(r)}>Remove</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------- Reports ----------------

const TABLE_FOR = { post: 'posts', comment: 'comments', event: 'events', message: 'messages' };

function Reports({ reload }) {
  const [showResolved, setShowResolved] = useState(false);
  const [items, setItems] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('reports')
      .select(`id, target_type, target_id, target_author_id, snapshot, reason, status, created_at,
        reporter:profiles!reports_reporter_id_fkey(id, full_name),
        author:profiles!reports_target_author_id_fkey(id, full_name)`)
      .eq('status', showResolved ? 'resolved' : 'open')
      .order('created_at', { ascending: false })
      .limit(100);
    setItems(data || []);
  }, [showResolved]);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (r) => {
    await supabase.from('reports').update({ status: 'resolved' }).eq('id', r.id);
    load();
    reload();
  };

  const deleteContent = async (r) => {
    if (!confirm(`Delete this ${r.target_type}? This cannot be undone.`)) return;
    const { error } = await supabase.from(TABLE_FOR[r.target_type]).delete().eq('id', r.target_id);
    if (error) return alert(errorText(error));
    resolve(r);
  };

  const suspend = async (r) => {
    if (!confirm(`Suspend ${r.author?.full_name || 'this member'}? They won’t be able to use the site until reactivated.`)) return;
    const { error } = await supabase.rpc('admin_set_status', { target: r.target_author_id, new_status: 'suspended' });
    if (error) return alert(errorText(error));
    resolve(r);
  };

  return (
    <>
      <div className="chips">
        <button className={`chip ${!showResolved ? 'on' : ''}`} onClick={() => setShowResolved(false)}>Open</button>
        <button className={`chip ${showResolved ? 'on' : ''}`} onClick={() => setShowResolved(true)}>Resolved</button>
      </div>
      {items === null && <p className="muted">Loading…</p>}
      {items?.length === 0 && <div className="empty"><p>{showResolved ? 'No resolved reports.' : 'No open reports.'}</p></div>}
      <div className="stack">
        {items?.map((r) => (
          <article key={r.id} className="panel report">
            <p className="small muted">
              {r.reporter?.full_name || 'A member'} reported a {r.target_type}
              {r.author && <> by <Link to={`/profile/${r.author.id}`}>{r.author.full_name}</Link></>} {timeAgo(r.created_at)}
            </p>
            <blockquote className="report-snapshot">{r.snapshot || '(content unavailable)'}</blockquote>
            <p><strong>Reason:</strong> {r.reason}</p>
            {r.status === 'open' && (
              <div className="row-end">
                {TABLE_FOR[r.target_type] && <button className="btn small ghost danger-text" onClick={() => deleteContent(r)}>Delete {r.target_type}</button>}
                {r.target_author_id && <button className="btn small ghost danger-text" onClick={() => suspend(r)}>Suspend {r.target_type === 'user' ? 'member' : 'author'}</button>}
                <button className="btn small" onClick={() => resolve(r)}>Mark resolved</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

function EventApprovals({ reload }) {
  const [events, setEvents] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('events').select(EVENT_SELECT).eq('status', 'pending').order('created_at');
    setEvents(data || []);
    reload();
  }, [reload]);

  useEffect(() => {
    load();
  }, [load]);

  if (events === null) return <p className="muted">Loading…</p>;
  return (
    <>
      <p className="muted">
        Events created by students and alumni wait here until you approve them. Staff and admin events are published
        straight away.
      </p>
      {events.length === 0 ? (
        <div className="empty"><p>No events waiting for approval.</p></div>
      ) : (
        <div className="stack">
          {events.map((ev) => <EventCard key={ev.id} ev={ev} onChange={load} />)}
        </div>
      )}
    </>
  );
}
