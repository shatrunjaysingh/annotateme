import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import client from '../api/client';
import { useAuthStore } from '../store/authStore';

interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export default function Users() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await client.get('/users');
        setUsers(data);
      } catch (e: any) {
        setError(e.response?.data?.error || 'Failed to load users');
      } finally { setLoading(false); }
    };
    load();
  }, []);

  const updateRole = async (id: string, role: string) => {
    try {
      await client.patch(`/users/${id}`, { role });
      setUsers(u => u.map(x => x.id === id ? { ...x, role } : x));
    } catch { /* no-op */ }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await client.patch(`/users/${id}`, { isActive: !isActive });
      setUsers(u => u.map(x => x.id === id ? { ...x, isActive: !isActive } : x));
    } catch { /* no-op */ }
  };

  const deleteUser = async (id: string) => {
    if (!confirm('Delete this user?')) return;
    try {
      await client.delete(`/users/${id}`);
      setUsers(u => u.filter(x => x.id !== id));
    } catch { /* no-op */ }
  };

  if (currentUser?.role !== 'admin') {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
        <Navbar />
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <p>Access Denied</p>
          <span>Admin role required to view user management.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Navbar />
      <div style={{ padding: '24px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>User Management</h1>
        {error && <div style={{ background: '#fff1f0', border: '1px solid #ffa39e', borderRadius: 6, padding: '10px 14px', marginBottom: 16, color: '#cf1322' }}>{error}</div>}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><span className="spinner" /></div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1890ff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                            {u.username[0].toUpperCase()}
                          </div>
                          <span style={{ fontWeight: 500 }}>{u.username}</span>
                        </div>
                      </td>
                      <td style={{ color: '#8c8c8c' }}>{u.email}</td>
                      <td>
                        <select className="input" style={{ width: 120, fontSize: 12, padding: '3px 6px' }}
                          value={u.role} onChange={e => updateRole(u.id, e.target.value)} disabled={u.id === currentUser?.id}>
                          <option value="admin">Admin</option>
                          <option value="manager">Manager</option>
                          <option value="user">User</option>
                        </select>
                      </td>
                      <td>
                        <span className={`badge ${u.isActive ? 'badge-green' : 'badge-red'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td style={{ color: '#8c8c8c', fontSize: 13 }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {u.id !== currentUser?.id && (
                            <>
                              <button className="btn btn-default btn-sm" onClick={() => toggleActive(u.id, u.isActive)}>
                                {u.isActive ? 'Deactivate' : 'Activate'}
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u.id)}>Delete</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
