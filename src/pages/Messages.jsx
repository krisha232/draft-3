import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { supabase, AUTHOR_COLS, PROFILE_COLS } from '../lib/supabase';
import { FIELDS, matchesStudy, studyLine } from '../lib/fields';
import { useAuth } from '../lib/auth';
import { errorText, roleLine, timeAgo } from '../lib/format';
import Avatar from '../components/Avatar';
import ReportDialog from '../components/ReportDialog';

export default function Messages() {
  const { id } = useParams();
  const { profile } = useAuth();
  const [convs, setConvs] = useState(null);
  const [course, setCourse] = useState('');

  const loadConvs = useCallback(async () => {
    const { data } = await supabase
      .from('conversations')
      .select(`id, created_at, last_message_at, conversation_members(user_id, last_read_at, person:profiles!conversation_members_user_id_fkey(${AUTHOR_COLS}))`)
      .order('last_message_at', { ascending: false });
    const list = data || [];
    const ids = list.map((c) => c.id);
    const previews = {};
    if (ids.length) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('conversation_id, body, sender_id, created_at')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false })
        .limit(500);
      for (const m of msgs || []) if (!previews[m.conversation_id]) previews[m.conversation_id] = m;
    }
    setConvs(
      list
        .map((c) => {
          const meRow = c.conversation_members.find((m) => m.user_id === profile.id);
          const other = c.conversation_members.find((m) => m.user_id !== profile.id);
          return {
            id: c.id,
            other: other?.person,
            otherId: other?.user_id,
            last: previews[c.id],
            unread: previews[c.id] && new Date(c.last_message_at) > new Date(meRow?.last_read_at),
          };
        })
        .filter((c) => c.last || c.id === id)
    );
  }, [profile.id, id]);

  useEffect(() => {
    loadConvs();
    const ch = supabase
      .channel('conv-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => loadConvs())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [loadConvs]);

  const active = convs?.find((c) => c.id === id);
  // When a course is picked, chats with alumni who studied it come first
  const sorted = course && convs
    ? [...convs].sort((a, b) => (b.other?.field === course) - (a.other?.field === course))
    : convs;

  return (
    <div className={`messages-page ${id ? 'has-thread' : ''}`}>
      <section className="conv-list" aria-label="Conversations">
        <h1 className="page-title">Messages</h1>
        <AlumniFinder course={course} setCourse={setCourse} />
        {convs === null && <p className="muted">Loading…</p>}
        {convs?.length > 0 && <h2 className="list-heading conv-heading">Your conversations</h2>}
        {convs?.length === 0 && (
          <div className="empty">
            <p>No conversations yet. Open someone’s profile from <Link to="/members">Members</Link> and choose Message.</p>
          </div>
        )}
        <ul>
          {sorted?.map((c) => (
            <li key={c.id}>
              <Link to={`/messages/${c.id}`} className={`conv ${c.id === id ? 'on' : ''} ${c.unread ? 'unread' : ''}`}>
                <Avatar person={c.other} size={40} />
                <span className="conv-text">
                  <span className="conv-top">
                    <strong>
                      {c.other?.full_name || 'Former member'}
                      {course && c.other?.field === course && <span className="tag tag-field">{course.split(' (')[0]}</span>}
                    </strong>
                    {c.last && <span className="muted small">{timeAgo(c.last.created_at)}</span>}
                  </span>
                  <span className="conv-preview small">
                    {c.last ? (c.last.sender_id === profile.id ? 'You: ' : '') + c.last.body : 'No messages yet'}
                  </span>
                </span>
                {c.unread && <span className="dot" aria-label="Unread" />}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="thread-pane">
        {id ? (
          <Thread key={id} convId={id} other={active?.other} otherId={active?.otherId} onSent={loadConvs} />
        ) : (
          <div className="thread-empty muted">Choose a conversation.</div>
        )}
      </section>
    </div>
  );
}

function AlumniFinder({ course, setCourse }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [alumni, setAlumni] = useState(null);
  const [error, setError] = useState('');
  const searching = Boolean(course || text.trim());

  useEffect(() => {
    if (!searching || alumni) return;
    supabase
      .from('profiles')
      .select(PROFILE_COLS)
      .eq('status', 'active')
      .eq('role', 'alumni')
      .order('batch_year', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(errorText(error));
        setAlumni(data || []);
      });
  }, [searching, alumni]);

  const results = (alumni || []).filter((p) => matchesStudy(p, course, text));

  const message = async (p) => {
    setError('');
    const { data, error } = await supabase.rpc('get_or_create_dm', { other: p.id });
    if (error) setError(errorText(error));
    else navigate(`/messages/${data}`);
  };

  return (
    <div className="finder">
      <label className="course-sort">
        <span>Find alumni by the course you want to pursue</span>
        <select value={course} onChange={(e) => setCourse(e.target.value)}>
          <option value="">Choose a course</option>
          {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="or search a subject, course or college"
        aria-label="Search alumni by subject, course or college"
      />
      {error && <p className="error">{error}</p>}
      {searching && (
        <div className="finder-results">
          {alumni === null && <p className="muted small">Loading alumni…</p>}
          {alumni && results.length === 0 && <p className="muted small">No alumni match yet.</p>}
          {results.slice(0, 20).map((p) => (
            <div key={p.id} className="finder-row">
              <Link to={`/profile/${p.id}`} className="person">
                <Avatar person={p} size={36} />
                <span>
                  <strong>{p.full_name}</strong>
                  <span className="muted small">
                    {[p.batch_year && `Class of ${p.batch_year}`, studyLine(p) || p.field].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </Link>
              <button className="btn small" onClick={() => message(p)}>Message</button>
            </div>
          ))}
          {results.length > 20 && <p className="muted small">Showing 20 of {results.length}. Narrow your search to see others.</p>}
        </div>
      )}
    </div>
  );
}

function Thread({ convId, other, otherId, onSent }) {
  const { profile } = useAuth();
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState('');
  const [canSend, setCanSend] = useState(true);
  const [error, setError] = useState('');
  const [reportId, setReportId] = useState(null);
  const endRef = useRef(null);

  const markRead = useCallback(async () => {
    await supabase
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .match({ conversation_id: convId, user_id: profile.id });
    window.dispatchEvent(new Event('messages-read'));
  }, [convId, profile.id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data, error }, { data: ok }] = await Promise.all([
        supabase.from('messages').select('id, body, sender_id, created_at').eq('conversation_id', convId).order('created_at').limit(500),
        supabase.rpc('can_send', { conv: convId }),
      ]);
      if (!alive) return;
      if (error) setError(errorText(error));
      setMsgs(data || []);
      setCanSend(Boolean(ok));
      markRead();
    })();

    const ch = supabase
      .channel(`thread-${convId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
        (payload) => {
          setMsgs((m) => (m && !m.some((x) => x.id === payload.new.id) ? [...m, payload.new] : m));
          markRead();
        }
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [convId, markRead]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs?.length]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    setError('');
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: convId, body })
      .select('id, body, sender_id, created_at')
      .single();
    if (error) {
      setText(body);
      setError(/row-level security/i.test(error.message) ? 'You can’t send messages in this conversation.' : errorText(error));
      return;
    }
    setMsgs((m) => (m.some((x) => x.id === data.id) ? m : [...m, data]));
    markRead();
    onSent();
  };

  return (
    <div className="thread">
      <header className="thread-head">
        <Link to="/messages" className="icon-btn back" aria-label="Back to conversations"><ArrowLeft size={20} /></Link>
        {other ? (
          <Link to={`/profile/${otherId}`} className="person">
            <Avatar person={other} size={36} />
            <span>
              <strong>{other.full_name}</strong>
              <span className="muted small">{roleLine(other)}</span>
            </span>
          </Link>
        ) : (
          <strong>Conversation</strong>
        )}
      </header>
      <div className="thread-body">
        {msgs === null && <p className="muted">Loading…</p>}
        {msgs?.length === 0 && <p className="muted center">Say hello.</p>}
        {msgs?.map((m) => {
          const mine = m.sender_id === profile.id;
          return (
            <div key={m.id} className={`bubble-row ${mine ? 'mine' : ''}`}>
              <div className="bubble">
                <p>{m.body}</p>
                <span className="bubble-meta">
                  {timeAgo(m.created_at)}
                  {!mine && (
                    <button className="link-btn report-msg" onClick={() => setReportId(m.id)}>Report</button>
                  )}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {canSend ? (
        <form className="thread-form" onSubmit={send}>
          <textarea
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) send(e);
            }}
            placeholder="Write a message"
            maxLength={4000}
            aria-label="Write a message"
          />
          <button className="btn" disabled={!text.trim()}>Send</button>
        </form>
      ) : (
        <p className="thread-closed muted small">You can’t send messages in this conversation.</p>
      )}
      {error && <p className="error thread-error">{error}</p>}
      {reportId && <ReportDialog targetType="message" targetId={reportId} onClose={() => setReportId(null)} />}
    </div>
  );
}
