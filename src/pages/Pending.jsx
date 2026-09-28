import { useState } from 'react';
import { useAuth } from '../lib/auth';

export default function Pending() {
  const { profile, refreshProfile, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const suspended = profile.status === 'suspended';

  const check = async () => {
    setChecking(true);
    await refreshProfile();
    setChecking(false);
  };

  return (
    <div className="center-page">
      <div className="auth-card">
        <h1>{suspended ? 'Your account is suspended' : `Thanks, ${profile.full_name.split(' ')[0]}`}</h1>
        <p className="muted">
          {suspended
            ? 'You can\u2019t use the site while your account is suspended. Contact the school office if you think this is a mistake.'
            : 'Your school ID is verified. A school admin will approve your account shortly, usually within a day.'}
        </p>
        <div className="row-end">
          <button className="btn ghost" onClick={signOut}>Sign out</button>
          {!suspended && <button className="btn" onClick={check} disabled={checking}>{checking ? 'Checking…' : 'Check again'}</button>}
        </div>
      </div>
    </div>
  );
}
