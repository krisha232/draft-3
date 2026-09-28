import { useState } from 'react';
import { supabase, SCHOOL_NAME } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorText } from '../lib/format';

const MESSAGES = {
  no_match:
    'That ID number and name don\u2019t match the school\u2019s records. Check both against the ID you were given (spelling counts, capitals don\u2019t).',
  already_claimed:
    'This ID is already linked to another account. If that wasn\u2019t you, contact the school office.',
};

export default function ClaimId() {
  const { user, refreshProfile, signOut } = useAuth();
  const [idNumber, setIdNumber] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { data, error } = await supabase.rpc('claim_id', { p_id_number: idNumber, p_full_name: name });
    setBusy(false);
    if (error) return setError(errorText(error));
    if (data === 'ok') return refreshProfile();
    setError(MESSAGES[data] || 'Something went wrong. Try again.');
  };

  return (
    <div className="center-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Verify your school ID</h1>
        <p className="muted">
          Enter the ID number {SCHOOL_NAME} gave you for this site, and your full name exactly as the school has it.
          Each ID can be linked to one account only.
        </p>
        <label className="field">
          <span>School ID number</span>
          <input required value={idNumber} onChange={(e) => setIdNumber(e.target.value)} autoComplete="off" spellCheck={false} autoFocus />
        </label>
        <label className="field">
          <span>Full name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn block" disabled={busy}>{busy ? 'Checking…' : 'Verify ID'}</button>
        <p className="muted small center">
          Signed in as {user?.email}. <button type="button" className="link-btn" onClick={signOut}>Sign out</button>
        </p>
      </form>
    </div>
  );
}
