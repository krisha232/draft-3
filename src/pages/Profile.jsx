import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, PROFILE_COLS } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorText } from '../lib/format';
import IdCard from '../components/IdCard';
import PostCard, { POST_SELECT } from '../components/PostCard';
import ReportDialog from '../components/ReportDialog';
import Avatar from '../components/Avatar';
import { uploadAvatar, removeAvatar } from '../lib/files';
import { FIELDS } from '../lib/fields';
import ThemeToggle from '../components/ThemeToggle';

export default function Profile() {
  const { id } = useParams();
  const { profile: me, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const isMe = id === me.id;

  const [person, setPerson] = useState(undefined);
  const [idNumber, setIdNumber] = useState('');
  const [posts, setPosts] = useState([]);
  const [canDm, setCanDm] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const [{ data: p }, { data: ps }] = await Promise.all([
      supabase.from('profiles').select(PROFILE_COLS).eq('id', id).maybeSingle(),
      supabase.from('posts').select(POST_SELECT).eq('author_id', id).order('created_at', { ascending: false }).limit(10),
    ]);
    setPerson(p ?? null);
    setPosts(ps || []);
    if (isMe) {
      const { data: r } = await supabase.from('roster').select('id_number').eq('claimed_by', id).maybeSingle();
      setIdNumber(r?.id_number || '');
    } else {
      const [{ data: dm }, { data: b }] = await Promise.all([
        supabase.rpc('can_dm', { other: id }),
        supabase.from('user_blocks').select('blocked').eq('blocked', id).maybeSingle(),
      ]);
      setCanDm(Boolean(dm));
      setBlocked(Boolean(b));
    }
  }, [id, isMe]);

  useEffect(() => {
    setPerson(undefined);
    setEditing(false);
    load();
  }, [load]);

  const message = async () => {
    const { data, error } = await supabase.rpc('get_or_create_dm', { other: id });
    if (error) setError(errorText(error));
    else navigate(`/messages/${data}`);
  };

  const toggleBlock = async () => {
    if (blocked) {
      await supabase.from('user_blocks').delete().eq('blocked', id);
    } else {
      if (!confirm(`Block ${person.full_name}? Neither of you will be able to send the other private messages.`)) return;
      await supabase.from('user_blocks').insert({ blocked: id });
    }
    load();
  };

  if (person === undefined) return <div className="page"><p className="muted">Loading profile…</p></div>;
  if (person === null) return <div className="page"><p>This member doesn’t exist or isn’t active.</p></div>;

  return (
    <div className="page">
      <IdCard person={person} idNumber={isMe ? idNumber : null} />

      <div className="profile-actions">
        {isMe ? (
          <>
            {!editing && <button className="btn" onClick={() => setEditing(true)}>Edit profile</button>}
            <ThemeToggle withLabel />
            <button className="btn ghost" onClick={signOut}>Sign out</button>
          </>
        ) : (
          <>
            {canDm && <button className="btn" onClick={message}>Message</button>}
            <button className="btn ghost" onClick={toggleBlock}>{blocked ? 'Unblock' : 'Block'}</button>
            <button className="btn ghost" onClick={() => setReporting(true)}>Report</button>
          </>
        )}
      </div>
      {!isMe && !canDm && !blocked && (
        <p className="muted small">Private messages aren’t available with this member. You can still comment on their posts.</p>
      )}
      {error && <p className="error">{error}</p>}

      {editing ? (
        <EditProfile
          person={person}
          onPhotoChange={async () => {
            await refreshProfile();
            load();
          }}
          onDone={async () => {
            setEditing(false);
            await refreshProfile();
            load();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        person.bio && (
          <section className="panel">
            <h2>About</h2>
            <p className="prewrap">{person.bio}</p>
          </section>
        )
      )}

      <h2 className="section-title">Recent posts</h2>
      {posts.length === 0 && <p className="muted">No posts yet.</p>}
      <div className="stack">
        {posts.map((p) => (
          <PostCard key={p.id} post={p} onDeleted={(pid) => setPosts((ps) => ps.filter((x) => x.id !== pid))} />
        ))}
      </div>
      {reporting && <ReportDialog targetType="user" targetId={person.id} onClose={() => setReporting(false)} />}
    </div>
  );
}

function EditProfile({ person, onDone, onCancel, onPhotoChange }) {
  const [f, setF] = useState({
    headline: person.headline || '',
    location: person.location || '',
    bio: person.bio || '',
    university: person.university || '',
    field: person.field || '',
    major: person.major || '',
    subjects: person.subjects || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        headline: f.headline.trim() || null,
        location: f.location.trim() || null,
        bio: f.bio.trim() || null,
        ...(person.role === 'alumni' && {
          university: f.university.trim() || null,
          field: f.field || null,
          major: f.major.trim() || null,
          subjects: f.subjects.trim() || null,
        }),
      })
      .eq('id', person.id);
    setBusy(false);
    if (error) setError(errorText(error));
    else onDone();
  };

  return (
    <form className="panel" onSubmit={submit}>
      <h2>Edit profile</h2>
      <p className="muted small">Your name, role and class year come from school records. Ask an admin to correct them.</p>
      <PhotoPicker person={person} onChange={onPhotoChange} />
      <label className="field">
        <span>Headline</span>
        <input maxLength={120} value={f.headline} onChange={set('headline')} placeholder="e.g. Engineer at Infosys, or Class 11 science" />
      </label>
      {person.role === 'alumni' && (
        <fieldset className="study-fields">
          <legend>What you studied</legend>
          <p className="muted small">Students use this to find alumni who took the path they’re interested in.</p>
          <label className="field">
            <span>Subjects you took at school</span>
            <input maxLength={200} value={f.subjects} onChange={set('subjects')} placeholder="e.g. Physics, Chemistry, Maths, Computer Science" />
          </label>
          <label className="field">
            <span>Area of study</span>
            <select value={f.field} onChange={set('field')}>
              <option value="">Choose one</option>
              {FIELDS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <div className="two-col">
            <label className="field">
              <span>Course / major</span>
              <input maxLength={120} value={f.major} onChange={set('major')} placeholder="e.g. B.Tech Computer Science" />
            </label>
            <label className="field">
              <span>University or college</span>
              <input maxLength={120} value={f.university} onChange={set('university')} placeholder="e.g. IIT Madras" />
            </label>
          </div>
        </fieldset>
      )}
      <label className="field">
        <span>City</span>
        <input maxLength={80} value={f.location} onChange={set('location')} />
      </label>
      <label className="field">
        <span>About you</span>
        <textarea rows={5} maxLength={2000} value={f.bio} onChange={set('bio')} placeholder="What you do, what you can help with, what you're looking for" />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row-end">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
      </div>
    </form>
  );
}

function PhotoPicker({ person, onChange }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Choose a photo (JPG or PNG).');
    if (file.size > 15 * 1024 * 1024) return setError('That photo is larger than 15 MB.');
    setBusy(true);
    setError('');
    try {
      await uploadAvatar(person.id, file, person.avatar_path);
      await onChange();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await removeAvatar(person.id, person.avatar_path);
      await onChange();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  };

  return (
    <div className="photo-picker">
      <Avatar person={person} size={72} />
      <div>
        <span className="field-label">Profile photo</span>
        <div className="photo-actions">
          <button type="button" className="btn small" onClick={() => input.current.click()} disabled={busy}>
            {busy ? 'Saving…' : person.avatar_path ? 'Change photo' : 'Upload photo'}
          </button>
          {person.avatar_path && (
            <button type="button" className="btn small ghost" onClick={remove} disabled={busy}>Remove photo</button>
          )}
        </div>
        <small className="muted">Only approved members can see it.</small>
        <input ref={input} type="file" accept="image/*" onChange={pick} hidden />
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
