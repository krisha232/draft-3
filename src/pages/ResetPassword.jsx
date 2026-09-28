import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorText } from '../lib/format';

export default function ResetPassword() {
  const { setRecovering } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(errorText(error));
    else setRecovering(false);
  };

  return (
    <div className="center-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Choose a new password</h1>
        <label className="field">
          <span>New password</span>
          <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          <small className="muted">At least 8 characters.</small>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn block" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </div>
  );
}
