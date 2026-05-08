import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [devLink, setDevLink] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await client.post('/auth/forgot-password', { email });
      setSubmitted(true);
      if (data.devResetUrl) setDevLink(data.devResetUrl);
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
          <p style={styles.subtitle}>Reset your password</p>
        </div>

        {submitted ? (
          <div>
            <div style={styles.successBox}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#52c41a" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span>Check your email for a reset link. It expires in 1 hour.</span>
            </div>
            {devLink && (
              <div style={styles.devBox}>
                <div style={{ fontWeight: 600, marginBottom: 6, color: '#fa8c16' }}>Dev mode — no SMTP configured</div>
                <div style={{ fontSize: 12, color: '#595959', marginBottom: 8 }}>Use this link to reset your password:</div>
                <a href={devLink} style={{ fontSize: 12, color: '#1890ff', wordBreak: 'break-all' }}>{devLink}</a>
              </div>
            )}
            <Link to="/login" style={styles.backLink}>← Back to Sign In</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <p style={{ fontSize: 14, color: '#595959', marginBottom: 20, marginTop: 0 }}>
              Enter your account email and we'll send you a link to reset your password.
            </p>
            <div className="form-group">
              <label className="form-label required">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                autoFocus
              />
            </div>
            {error && <div style={styles.error}>{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={loading}
              style={{ width: '100%', justifyContent: 'center', padding: '8px' }}>
              {loading ? <span className="spinner" /> : 'Send Reset Link'}
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

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { background: '#fff', borderRadius: 12, padding: 40, width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' },
  header: { textAlign: 'center', marginBottom: 28 },
  logo: { fontSize: 28, fontWeight: 800, color: '#1890ff', marginBottom: 8, letterSpacing: '-0.5px' },
  subtitle: { color: '#8c8c8c', fontSize: 14, margin: 0 },
  error: { background: '#fff1f0', border: '1px solid #ffa39e', color: '#cf1322', borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 13 },
  successBox: { display: 'flex', alignItems: 'flex-start', gap: 10, background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 14, color: '#389e0d' },
  devBox: { background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8, padding: '12px 16px', marginBottom: 20 },
  backLink: { display: 'block', textAlign: 'center', fontSize: 14, color: '#8c8c8c', textDecoration: 'none', marginTop: 8 },
};
