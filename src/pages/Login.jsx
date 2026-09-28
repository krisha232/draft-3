import { useState } from 'react';
import { supabase, SITE_NAME, SCHOOL_NAME } from '../lib/supabase';
import { errorText } from '../lib/format';
import Logo from '../components/Logo';

export default function Login() {
  const [mode, setMode] = useState('signin'); // signin | signup | forgot
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const switchTo = (m) => {
    setMode(m);
    setError('');
    setNotice('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const redirect = window.location.origin;
    let res;
    if (mode === 'signin') {
      res = await supabase.auth.signInWithPassword({ email, password });
      if (res.error && /confirm/i.test(res.error.message)) {
        res.error.message = 'Confirm your email first. Check your inbox for the link we sent.';
      } else if (res.error && /invalid login/i.test(res.error.message)) {
        res.error.message = 'That email and password don\u2019t match an account.';
      }
    } else if (mode === 'signup') {
      res = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
      if (!res.error && !res.data.session) {
        setNotice(`We sent a confirmation link to ${email}. Open it to continue, then verify your school ID.`);
      }
    } else {
      res = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect });
      if (!res.error) setNotice(`If ${email} has an account, a reset link is on its way.`);
    }
    setBusy(false);
    if (res.error) setError(errorText(res.error));
  };

  return (
    <div className="auth-page">
      <section className="auth-intro">
        <div className="auth-logo-plate"><Logo height={76} variant="light" /></div>
        <div className="brand large">{SITE_NAME}</div>
        <p className="auth-lede">
          Students and alumni of {SCHOOL_NAME}, in one place. Ask questions, share opportunities, plan meetups
          and keep in touch after you graduate.
        </p>
        <p className="muted">Only members with a valid school ID can join.</p>
      </section>

      <section className="auth-card">
        <h1>{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create your account' : 'Reset your password'}</h1>
        <form onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode !== 'forgot' && (
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === 'signup' && <small className="muted">At least 8 characters.</small>}
            </label>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          {notice && <p className="notice" role="status">{notice}</p>}
          <button className="btn block" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>
        </form>
        <div className="auth-switch">
          {mode === 'signin' && (
            <>
              <button className="link-btn" onClick={() => switchTo('signup')}>New here? Create an account</button>
              <button className="link-btn" onClick={() => switchTo('forgot')}>Forgot password?</button>
            </>
          )}
          {mode !== 'signin' && (
            <button className="link-btn" onClick={() => switchTo('signin')}>Back to sign in</button>
          )}
        </div>
      </section>
    </div>
  );
}
