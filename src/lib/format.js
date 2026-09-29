export const ROLE_LABEL = { student: 'Student', alumni: 'Alumni', staff: 'Teacher' };

export function roleLine(p) {
  if (!p) return '';
  const role = ROLE_LABEL[p.role] || p.role;
  if (p.role === 'staff') return p.department ? `${role}, ${p.department}` : role;
  if (!p.batch_year) return role;
  return `${role}, class of ${p.batch_year}`;
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function timeAgo(iso) {
  const then = new Date(iso);
  const secs = Math.round((Date.now() - then.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return then.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: then.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export function eventWhen(start, end) {
  const s = new Date(start);
  const opts = { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' };
  let out = s.toLocaleString(undefined, opts);
  if (end) {
    const e = new Date(end);
    const sameDay = e.toDateString() === s.toDateString();
    out += ' to ' + (sameDay ? e.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : e.toLocaleString(undefined, opts));
  }
  return out;
}

// Turn a Supabase/Postgres error into a sentence a person can act on.
export function errorText(err) {
  if (!err) return '';
  const msg = err.message || String(err);
  if (/row-level security|permission denied/i.test(msg)) return "You don't have permission to do that.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Could not reach the server. Check your connection and try again.';
  return msg;
}
