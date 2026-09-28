import { SCHOOL_NAME } from '../lib/supabase';

// The school logo. In dark mode a version with lighter lettering is shown,
// unless variant="light" forces the normal one (e.g. on a white background).
export default function Logo({ height = 48, className = '', variant }) {
  return (
    <span className={`logo ${variant === 'light' ? 'logo-fixed' : ''} ${className}`}>
      <img className="logo-img-light" src="/neev-logo.png" alt={`${SCHOOL_NAME} logo`} style={{ height }} />
      <img className="logo-img-dark" src="/neev-logo-dark.png" alt={`${SCHOOL_NAME} logo`} style={{ height }} />
    </span>
  );
}
