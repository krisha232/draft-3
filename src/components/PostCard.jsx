import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageSquare, FileText } from 'lucide-react';
import { supabase, AUTHOR_COLS } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { roleLine, timeAgo, errorText } from '../lib/format';
import { useSignedUrl, isImage, formatSize, deleteAttachments } from '../lib/files';
import Avatar from './Avatar';
import ReportDialog from './ReportDialog';

export const POST_SELECT = `id, body, kind, attachments, created_at, author_id,
  author:profiles!posts_author_id_fkey(${AUTHOR_COLS}),
  comments(count),
  post_likes(user_id)`;

const KIND_LABEL = { question: 'Question', opportunity: 'Opportunity', announcement: 'Announcement' };

export default function PostCard({ post, onDeleted }) {
  const { profile } = useAuth();
  const [likes, setLikes] = useState(post.post_likes.map((l) => l.user_id));
  const [commentCount, setCommentCount] = useState(post.comments?.[0]?.count ?? 0);
  const [showComments, setShowComments] = useState(false);
  const [reporting, setReporting] = useState(false);
  const liked = likes.includes(profile.id);
  const mine = post.author_id === profile.id;

  const toggleLike = async () => {
    if (liked) {
      setLikes((l) => l.filter((id) => id !== profile.id));
      await supabase.from('post_likes').delete().match({ post_id: post.id, user_id: profile.id });
    } else {
      setLikes((l) => [...l, profile.id]);
      await supabase.from('post_likes').insert({ post_id: post.id });
    }
  };

  const remove = async () => {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    const { error } = await supabase.from('posts').delete().eq('id', post.id);
    if (error) return alert(errorText(error));
    await deleteAttachments(post.attachments);
    onDeleted?.(post.id);
  };

  return (
    <article className={`post kind-${post.kind}`}>
      <header className="post-head">
        <Link to={`/profile/${post.author?.id}`} className="person">
          <Avatar person={post.author} />
          <span>
            <strong>{post.author?.full_name}</strong>
            <span className="muted small">{roleLine(post.author)}</span>
          </span>
        </Link>
        <span className="post-meta">
          {KIND_LABEL[post.kind] && <span className={`tag tag-${post.kind}`}>{KIND_LABEL[post.kind]}</span>}
          <time className="muted small" dateTime={post.created_at}>{timeAgo(post.created_at)}</time>
        </span>
      </header>
      {post.body?.trim() && <p className="post-body">{post.body}</p>}
      {post.attachments?.length > 0 && <Attachments items={post.attachments} />}
      <footer className="post-actions">
        <button className={`action ${liked ? 'on' : ''}`} onClick={toggleLike} aria-pressed={liked}>
          <Heart size={18} fill={liked ? 'currentColor' : 'none'} /> {likes.length || ''}
          <span className="sr-only">{liked ? 'Unlike' : 'Like'}</span>
        </button>
        <button className="action" onClick={() => setShowComments((s) => !s)} aria-expanded={showComments}>
          <MessageSquare size={18} /> {commentCount || ''}
          <span className="sr-only">Comments</span>
        </button>
        <span className="spacer" />
        {(mine || profile.is_admin) && (
          <button className="action text" onClick={remove}>Delete</button>
        )}
        {!mine && (
          <button className="action text" onClick={() => setReporting(true)}>Report</button>
        )}
      </footer>
      {showComments && <Comments postId={post.id} onCountChange={setCommentCount} />}
      {reporting && <ReportDialog targetType="post" targetId={post.id} onClose={() => setReporting(false)} />}
    </article>
  );
}

function Comments({ postId, onCountChange }) {
  const { profile } = useAuth();
  const [items, setItems] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reportId, setReportId] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('comments')
      .select(`id, body, created_at, author_id, author:profiles!comments_author_id_fkey(${AUTHOR_COLS})`)
      .eq('post_id', postId)
      .order('created_at');
    if (error) setError(errorText(error));
    setItems(data || []);
    onCountChange(data?.length ?? 0);
  }, [postId, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('comments').insert({ post_id: postId, body: text.trim() });
    setBusy(false);
    if (error) return setError(errorText(error));
    setText('');
    load();
  };

  const remove = async (id) => {
    if (!confirm('Delete this comment?')) return;
    await supabase.from('comments').delete().eq('id', id);
    load();
  };

  return (
    <div className="comments">
      {items === null && <p className="muted small">Loading comments…</p>}
      {items?.map((c) => (
        <div key={c.id} className="comment">
          <Avatar person={c.author} size={30} />
          <div className="comment-bubble">
            <div className="comment-head">
              <Link to={`/profile/${c.author?.id}`}><strong>{c.author?.full_name}</strong></Link>
              <span className="muted small">{timeAgo(c.created_at)}</span>
            </div>
            <p>{c.body}</p>
            <div className="comment-actions">
              {(c.author_id === profile.id || profile.is_admin) && (
                <button className="link-btn" onClick={() => remove(c.id)}>Delete</button>
              )}
              {c.author_id !== profile.id && (
                <button className="link-btn" onClick={() => setReportId(c.id)}>Report</button>
              )}
            </div>
          </div>
        </div>
      ))}
      <form className="comment-form" onSubmit={add}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment"
          maxLength={2000}
          aria-label="Write a comment"
        />
        <button className="btn small" disabled={busy || !text.trim()}>Reply</button>
      </form>
      {error && <p className="error">{error}</p>}
      {reportId && <ReportDialog targetType="comment" targetId={reportId} onClose={() => setReportId(null)} />}
    </div>
  );
}

export function Attachments({ items }) {
  const images = items.filter((a) => isImage(a.type));
  const files = items.filter((a) => !isImage(a.type));
  return (
    <div className="attachments">
      {images.length > 0 && (
        <div className={`attach-images n${Math.min(images.length, 4)}`}>
          {images.map((a) => <AttachedImage key={a.path} item={a} />)}
        </div>
      )}
      {files.map((a) => <AttachedFile key={a.path} item={a} />)}
    </div>
  );
}

function AttachedImage({ item }) {
  const url = useSignedUrl('attachments', item.path);
  return (
    <a className="attach-image" href={url || undefined} target="_blank" rel="noopener noreferrer" aria-label={`Open ${item.name}`}>
      {url ? <img src={url} alt={item.name} loading="lazy" /> : <span className="attach-loading" />}
    </a>
  );
}

function AttachedFile({ item }) {
  const url = useSignedUrl('attachments', item.path);
  return (
    <a className="attach-file" href={url || undefined} target="_blank" rel="noopener noreferrer">
      <FileText size={22} aria-hidden="true" />
      <span className="attach-file-text">
        <strong>{item.name}</strong>
        <span className="muted small">{formatSize(item.size)}</span>
      </span>
    </a>
  );
}
