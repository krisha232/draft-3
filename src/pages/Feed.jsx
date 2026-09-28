import { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorText } from '../lib/format';
import PostCard, { POST_SELECT } from '../components/PostCard';
import Avatar from '../components/Avatar';
import { ACCEPT, MAX_FILES, checkFile, formatSize, isImage, uploadAttachments } from '../lib/files';

const PAGE = 20;
const FILTERS = [
  { key: 'all', label: 'Everything' },
  { key: 'announcement', label: 'Announcements' },
  { key: 'question', label: 'Questions' },
  { key: 'opportunity', label: 'Opportunities' },
];

export default function Feed() {
  const [filter, setFilter] = useState('all');
  const [posts, setPosts] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (offset = 0) => {
      let q = supabase.from('posts').select(POST_SELECT).order('created_at', { ascending: false }).range(offset, offset + PAGE - 1);
      if (filter !== 'all') q = q.eq('kind', filter);
      const { data, error } = await q;
      if (error) return setError(errorText(error));
      setPosts((prev) => (offset === 0 ? data : [...(prev || []), ...data]));
      setHasMore(data.length === PAGE);
    },
    [filter]
  );

  useEffect(() => {
    setPosts(null);
    load(0);
  }, [load]);

  return (
    <div className="page">
      <h1 className="page-title">Feed</h1>
      <Composer onPosted={(p) => setPosts((prev) => [p, ...(prev || [])])} />
      <div className="chips" role="tablist" aria-label="Filter posts">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {posts === null && !error && <p className="muted">Loading posts…</p>}
      {posts?.length === 0 && (
        <div className="empty">
          <p>No posts here yet. Write the first one above.</p>
        </div>
      )}
      <div className="stack">
        {posts?.map((p) => (
          <PostCard key={p.id} post={p} onDeleted={(id) => setPosts((ps) => ps.filter((x) => x.id !== id))} />
        ))}
      </div>
      {hasMore && (
        <button className="btn ghost block" onClick={() => load(posts.length)}>Show older posts</button>
      )}
    </div>
  );
}

function Composer({ onPosted }) {
  const { profile } = useAuth();
  const [body, setBody] = useState('');
  const [kind, setKind] = useState('general');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef(null);

  const addFiles = (e) => {
    const picked = [...e.target.files];
    e.target.value = '';
    setError('');
    for (const f of picked) {
      const problem = checkFile(f);
      if (problem) return setError(problem);
    }
    if (files.length + picked.length > MAX_FILES) return setError(`You can attach up to ${MAX_FILES} files to a post.`);
    setFiles((cur) => [...cur, ...picked]);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    let attachments = [];
    try {
      attachments = await uploadAttachments(profile.id, files);
    } catch (err) {
      setBusy(false);
      return setError(err.message);
    }
    const { data, error } = await supabase
      .from('posts')
      .insert({ body: body.trim(), kind, attachments })
      .select(POST_SELECT)
      .single();
    setBusy(false);
    if (error) {
      if (attachments.length) await supabase.storage.from('attachments').remove(attachments.map((a) => a.path));
      return setError(errorText(error));
    }
    setBody('');
    setKind('general');
    setFiles([]);
    onPosted(data);
  };

  const canPost = body.trim() || files.length;

  return (
    <form className="composer" onSubmit={submit}>
      <Avatar person={profile} />
      <div className="composer-main">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share news, ask a question, or post an opportunity"
          rows={3}
          maxLength={5000}
          aria-label="Write a post"
        />
        {files.length > 0 && (
          <ul className="file-chips">
            {files.map((f, i) => (
              <li key={i} className="file-chip">
                {isImage(f.type) ? <ImageIcon size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}
                <span className="file-chip-name">{f.name}</span>
                <span className="muted small">{formatSize(f.size)}</span>
                <button type="button" className="icon-btn tiny" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="composer-bar">
          <button
            type="button"
            className="icon-btn"
            onClick={() => fileInput.current.click()}
            disabled={files.length >= MAX_FILES}
            title="Attach photos or files (up to 4, 10 MB each)"
            aria-label="Attach photos or files"
          >
            <Paperclip size={20} />
          </button>
          <input ref={fileInput} type="file" multiple accept={ACCEPT} onChange={addFiles} hidden />
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Post type">
            <option value="general">General post</option>
            <option value="question">Question</option>
            <option value="opportunity">Opportunity (job, internship, program)</option>
            {profile.is_admin && <option value="announcement">Announcement</option>}
          </select>
          <span className="spacer" />
          <button className="btn" disabled={busy || !canPost}>{busy ? (files.length ? 'Uploading…' : 'Posting…') : 'Post'}</button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </form>
  );
}
