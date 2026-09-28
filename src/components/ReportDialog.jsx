import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { errorText } from '../lib/format';

export default function ReportDialog({ targetType, targetId, onClose }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase
      .from('reports')
      .insert({ target_type: targetType, target_id: targetId, reason: reason.trim() });
    setBusy(false);
    if (error) setError(errorText(error));
    else setDone(true);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="report-title" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <h2 id="report-title">Report sent</h2>
            <p className="muted">A school admin will review it. Thank you for helping keep this space safe.</p>
            <div className="row-end">
              <button className="btn" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <h2 id="report-title">Report this {targetType}</h2>
            <p className="muted">Only school admins see reports. The person you report is not told who reported them.</p>
            <label className="field">
              <span>What's wrong?</span>
              <textarea
                required
                maxLength={1000}
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
            </label>
            {error && <p className="error">{error}</p>}
            <div className="row-end">
              <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
              <button className="btn danger" disabled={busy || !reason.trim()}>{busy ? 'Sending…' : 'Send report'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
