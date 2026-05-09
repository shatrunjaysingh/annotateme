import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import client from '../api/client';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  if (!token) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.header}>
            <div style={styles.logo}>AnnotateMe</div>
          </div>
          <div style={styles.errorBox}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Invalid or missing reset token.
          </div>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Link to="/forgot-password" style={{ color: '#1890ff', fontSize: 14 }}>Request a new reset link</Link>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await client.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logo}>AnnotateMe</div>
          <p style={styles.subtitle}>Set a new password</p>
        </div>

        {done ? (
          <div>
            <div style={styles.successBox}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#52c41a" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span>Password updated! Redirecting to sign in…</span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label required">New Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label required">Confirm Password</label>
              <input
                className="input"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your new password"
                required
              />
            </div>

            {/* Strength indicator */}
            {password.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: strengthScore(password) >= i ? strengthColor(password) : '#f0f0f0', transition: 'background 0.2s' }} />
                  ))}
                </div>
                <div style={{ fontSize: 11, color: strengthColor(password) }}>{strengthLabel(password)}</div>
              </div>
            )}

            {error && <div style={styles.error}>{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={loading}
              style={{ width: '100%', justifyContent: 'center', padding: '8px' }}>
              {loading ? <span className="spinner" /> : 'Update Password'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Link to="/login" style={{ fontSize: 14, color: '#8c8c8c', textDecoration: 'none' }}>← Back to Sign In</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function strengthScore(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  return s;
}
function strengthColor(p: string) {
  const s = strengthScore(p);
  return ['#ff4d4f', '#fa8c16', '#fadb14', '#52c41a'][s - 1] || '#ff4d4f';
}
function strengthLabel(p: string) {
  return ['Weak', 'Fair', 'Good', 'Strong'][strengthScore(p) - 1] || 'Weak';
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { background: '#fff', borderRadius: 12, padding: 40, width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' },
  header: { textAlign: 'center', marginBottom: 28 },
  logo: { fontSize: 28, fontWeight: 800, color: '#1890ff', marginBottom: 8, letterSpacing: '-0.5px' },
  subtitle: { color: '#8c8c8c', fontSize: 14, margin: 0 },
  error: { background: '#fff1f0', border: '1px solid #ffa39e', color: '#cf1322', borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 13 },
  errorBox: { display: 'flex', alignItems: 'center', gap: 8, background: '#fff1f0', border: '1px solid #ffa39e', color: '#cf1322', borderRadius: 8, padding: '12px 16px', fontSize: 14 },
  successBox: { display: 'flex', alignItems: 'flex-start', gap: 10, background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '12px 16px', fontSize: 14, color: '#389e0d' },
};
