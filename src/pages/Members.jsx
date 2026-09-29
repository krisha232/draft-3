import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, PROFILE_COLS } from '../lib/supabase';
import { errorText, roleLine } from '../lib/format';
import { FIELDS, studyLine } from '../lib/fields';
import Avatar from '../components/Avatar';

export default function Members() {
  const [people, setPeople] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [year, setYear] = useState('');
  const [course, setCourse] = useState('');

  useEffect(() => {
    supabase
      .from('profiles')
      .select(PROFILE_COLS)
      .eq('status', 'active')
      .order('full_name')
      .then(({ data, error }) => {
        if (error) setError(errorText(error));
        setPeople(data || []);
      });
  }, []);

  const years = useMemo(
    () => [...new Set((people || []).map((p) => p.batch_year).filter(Boolean))].sort((a, b) => b - a),
    [people]
  );

  // How many alumni studied each area, for the sort menu
  const courseCounts = useMemo(() => {
    const c = {};
    for (const p of people || []) if (p.role === 'alumni' && p.field) c[p.field] = (c[p.field] || 0) + 1;
    return c;
  }, [people]);

  const shown = (people || []).filter((p) => {
    if (role !== 'all' && p.role !== role) return false;
    if (year && String(p.batch_year) !== year) return false;
    if (q) {
      const hay = `${p.full_name} ${p.headline || ''} ${p.location || ''} ${p.university || ''} ${p.major || ''} ${p.subjects || ''} ${p.field || ''} ${p.teaches || ''} ${p.department || ''}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  // When a course is picked, alumni who studied it come first
  const matches = course ? shown.filter((p) => p.role === 'alumni' && p.field === course) : [];
  const rest = course ? shown.filter((p) => !(p.role === 'alumni' && p.field === course)) : shown;

  return (
    <div className="page">
      <h1 className="page-title">Members</h1>
      <div className="filters">
        <input type="search" placeholder="Search name, subject, college or course" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
          <option value="all">Everyone</option>
          <option value="student">Students</option>
          <option value="alumni">Alumni</option>
          <option value="staff">Teachers</option>
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Class year">
          <option value="">Any year</option>
          {years.map((y) => <option key={y} value={y}>Class of {y}</option>)}
        </select>
      </div>
      <label className="course-sort">
        <span>Sort alumni by the course you want to pursue</span>
        <select value={course} onChange={(e) => setCourse(e.target.value)}>
          <option value="">No preference</option>
          {FIELDS.map((f) => (
            <option key={f} value={f}>{f}{courseCounts[f] ? ` (${courseCounts[f]})` : ''}</option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      {people === null && <p className="muted">Loading members…</p>}
      {people && <p className="muted small">{shown.length} of {people.length} members</p>}

      {course && (
        <>
          <h2 className="list-heading">Alumni who studied {course} <span className="muted">({matches.length})</span></h2>
          {matches.length === 0 ? (
            <p className="muted small">No alumni have added this yet. Try searching for a subject instead.</p>
          ) : (
            <MemberList people={matches} />
          )}
          <h2 className="list-heading">Everyone else</h2>
        </>
      )}
      <MemberList people={rest} />
    </div>
  );
}

function MemberList({ people }) {
  if (!people.length) return null;
  return (
    <ul className="member-list">
      {people.map((p) => (
        <li key={p.id}>
          <Link to={`/profile/${p.id}`} className="member">
            <Avatar person={p} size={44} />
            <span className="member-text">
              <strong>{p.full_name}</strong>
              <span className="muted small">{roleLine(p)}</span>
              {p.headline && <span className="small">{p.headline}</span>}
              {p.role === 'alumni' && <AlumniStudy p={p} />}
              {p.role === 'student' && p.subjects && <span className="small muted">Subjects: {p.subjects}</span>}
              {p.role === 'staff' && p.teaches && <span className="small muted">Teaches: {p.teaches}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function AlumniStudy({ p }) {
  const line = studyLine(p);
  if (!line && !p.subjects && !p.field) return null;
  return (
    <span className="study">
      {p.field && <span className="tag tag-field">{p.field}</span>}
      {line && <span className="small">{line}</span>}
      {p.subjects && <span className="small muted">School subjects: {p.subjects}</span>}
    </span>
  );
}
