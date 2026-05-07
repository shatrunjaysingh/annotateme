import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useTenantStore } from '../store/tenantStore';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { setTenants, setActiveTenant } = useTenantStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        if (!username) { setError('Username is required'); setLoading(false); return; }
        const { data } = await client.post('/auth/register', { email, password, username });
        login(data.token, data.user);
        setTenants([]);
        setActiveTenant(null);
      } else {
        const { data } = await client.post('/auth/login', { email, password });
        login(data.token, data.user);
        const tenants = data.tenants || [];
        setTenants(tenants);
        if (tenants.length === 1) {
          setActiveTenant(tenants[0]);
        } else {
          setActiveTenant(null);
        }
      }
      navigate('/projects');
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
          <p style={styles.subtitle}>Professional Data Annotation Platform</p>
        </div>
        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="form-group">
              <label className="form-label required">Username</label>
              <input className="input" type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Choose a username" required autoFocus />
            </div>
          )}
          <div className="form-group">
            <label className="form-label required">Email</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email" required autoFocus={!isRegister} />
          </div>
          <div className="form-group">
            <label className="form-label required">Password</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required />
          </div>
          {error && <div style={styles.error}>{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: '8px' }}>
            {loading ? <span className="spinner" /> : (isRegister ? 'Create Account' : 'Sign In')}
          </button>
        </form>
        <div style={styles.switchMode}>
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button style={styles.linkBtn} onClick={() => { setIsRegister(!isRegister); setError(''); }}>
            {isRegister ? 'Sign In' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { background: '#fff', borderRadius: 12, padding: 40, width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' },
  header: { textAlign: 'center', marginBottom: 32 },
  logo: { fontSize: 28, fontWeight: 800, color: '#1890ff', marginBottom: 8, letterSpacing: '-0.5px' },
  subtitle: { color: '#8c8c8c', fontSize: 14 },
  error: { background: '#fff1f0', border: '1px solid #ffa39e', color: '#cf1322', borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 13 },
  switchMode: { textAlign: 'center', marginTop: 20, fontSize: 14, color: '#8c8c8c' },
  linkBtn: { background: 'none', border: 'none', color: '#1890ff', cursor: 'pointer', fontSize: 14, padding: 0, fontWeight: 500 },
};
