import { initials } from '../lib/format';
import { useSignedUrl } from '../lib/files';

export default function Avatar({ person, size = 40 }) {
  const url = useSignedUrl('avatars', person?.avatar_path);
  return (
    <span
      className={`avatar role-${person?.role || 'student'}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" /> : initials(person?.full_name)}
    </span>
  );
}
