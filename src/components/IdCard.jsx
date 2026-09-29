import { SCHOOL_NAME } from '../lib/supabase';
import { ROLE_LABEL, initials } from '../lib/format';
import { useSignedUrl } from '../lib/files';

// The member's profile header, drawn as a school ID card.
export default function IdCard({ person, idNumber }) {
  const photo = useSignedUrl('avatars', person.avatar_path);
  const since = new Date(person.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  return (
    <div className={`idcard role-${person.role}`}>
      <span className="idcard-slot" aria-hidden="true" />
      <div className="idcard-top">
        <span className="idcard-school">{SCHOOL_NAME}</span>
        <span className="idcard-role">{ROLE_LABEL[person.role]}</span>
      </div>
      <div className="idcard-body">
        <div className="idcard-photo">
          {photo ? <img src={photo} alt={`Photo of ${person.full_name}`} /> : <span aria-hidden="true">{initials(person.full_name)}</span>}
        </div>
        <div className="idcard-info">
          <h1 className="idcard-name">{person.full_name}</h1>
          {person.headline && <p className="idcard-headline">{person.headline}</p>}
          <dl className="idcard-fields">
            {person.role !== 'staff' && person.batch_year && (
              <div>
                <dt>Class of</dt>
                <dd>{person.batch_year}</dd>
              </div>
            )}
            {person.role === 'alumni' && (person.major || person.field) && (
              <div>
                <dt>Studied</dt>
                <dd>{person.major || person.field}</dd>
              </div>
            )}
            {person.role === 'alumni' && person.university && (
              <div>
                <dt>College</dt>
                <dd>{person.university}</dd>
              </div>
            )}
            {person.role === 'alumni' && person.subjects && (
              <div>
                <dt>School subjects</dt>
                <dd>{person.subjects}</dd>
              </div>
            )}
            {person.role === 'student' && person.subjects && (
              <div>
                <dt>Subjects</dt>
                <dd>{person.subjects}</dd>
              </div>
            )}
            {person.role === 'staff' && person.department && (
              <div>
                <dt>Department</dt>
                <dd>{person.department}</dd>
              </div>
            )}
            {person.role === 'staff' && person.teaches && (
              <div>
                <dt>Teaches</dt>
                <dd>{person.teaches}</dd>
              </div>
            )}
            {person.role === 'staff' && person.shared_email && (
              <div>
                <dt>Email</dt>
                <dd><a href={`mailto:${person.shared_email}`}>{person.shared_email}</a></dd>
              </div>
            )}
            {person.location && (
              <div>
                <dt>Based in</dt>
                <dd>{person.location}</dd>
              </div>
            )}
            <div>
              <dt>Member since</dt>
              <dd>{since}</dd>
            </div>
            {idNumber && (
              <div>
                <dt>ID number (only you see this)</dt>
                <dd className="idcard-number">{idNumber}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}
