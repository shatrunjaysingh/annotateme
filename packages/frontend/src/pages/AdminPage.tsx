import React, { useEffect, useState, useCallback } from 'react';
import Navbar from '../components/Navbar';
import client from '../api/client';
import Modal from '../components/Modal';
import { useTenantStore } from '../store/tenantStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'manager' | 'user';
  firstName?: string;
  lastName?: string;
  isActive: boolean;
  createdAt: string;
}

interface Tenant {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
}

interface TenantMember {
  id: string;
  username: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
}

interface Stats {
  users: number;
  projects: number;
  tasks: number;
  jobs: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  admin: '#eb2f96',
  manager: '#722ed1',
  user: '#1890ff',
};

const ROLE_BG: Record<string, string> = {
  admin: '#fff0f6',
  manager: '#f9f0ff',
  user: '#e6f4ff',
};

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

interface UsersTabProps {
  stats: Stats;
  setStats: React.Dispatch<React.SetStateAction<Stats>>;
}

function UsersTab({ stats, setStats }: UsersTabProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'user' as User['role'], firstName: '', lastName: '' });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/users');
      const list: User[] = Array.isArray(data) ? data : data.users || [];
      setUsers(list);
      setStats(s => ({ ...s, users: list.length }));
    } catch { /* no-op */ }
    finally { setLoading(false); }
  }, [setStats]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const filtered = users.filter(u => {
    const matchSearch = !search || u.username.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = !filterRole || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const openCreate = () => {
    setForm({ username: '', email: '', password: '', role: 'user', firstName: '', lastName: '' });
    setEditUser(null);
    setShowCreate(true);
  };

  const openEdit = (u: User) => {
    setForm({ username: u.username, email: u.email, password: '', role: u.role, firstName: u.firstName || '', lastName: u.lastName || '' });
    setEditUser(u);
    setShowCreate(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editUser) {
        const patch: Record<string, unknown> = { username: form.username, firstName: form.firstName, lastName: form.lastName, role: form.role };
        if (form.password) patch.password = form.password;
        await client.patch(`/users/${editUser.id}`, patch);
      } else {
        await client.post('/auth/register', { username: form.username, email: form.email, password: form.password, role: form.role, firstName: form.firstName, lastName: form.lastName });
      }
      setShowCreate(false);
      loadUsers();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      alert(e?.response?.data?.error || 'Failed to save user');
    } finally { setSaving(false); }
  };

  const handleToggleActive = async (u: User) => {
    try {
      await client.patch(`/users/${u.id}`, { isActive: !u.isActive });
      loadUsers();
    } catch { /* no-op */ }
  };

  const handleDelete = async (u: User) => {
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    try {
      await client.delete(`/users/${u.id}`);
      setUsers(prev => prev.filter(x => x.id !== u.id));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      alert(e?.response?.data?.error || 'Delete failed');
    }
  };

  const handleRoleChange = async (u: User, role: User['role']) => {
    try {
      await client.patch(`/users/${u.id}`, { role });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role } : x));
    } catch { /* no-op */ }
  };

  return (
    <>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>User Management</h2>
          <div className="search-bar" style={{ width: 240 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input" style={{ width: 140 }} value={filterRole} onChange={e => setFilterRole(e.target.value)}>
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="user">User</option>
          </select>
          <span style={{ fontSize: 13, color: '#8c8c8c' }}>{filtered.length} user{filtered.length !== 1 ? 's' : ''}</span>
          <button className="btn btn-primary" onClick={openCreate} style={{ gap: 6, padding: '4px 14px' }}>
            + Create User
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" /></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: ROLE_BG[u.role], color: ROLE_COLORS[u.role], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                          {u.username[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{u.username}</div>
                          {(u.firstName || u.lastName) && <div style={{ fontSize: 12, color: '#8c8c8c' }}>{[u.firstName, u.lastName].filter(Boolean).join(' ')}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: '#595959' }}>{u.email}</td>
                    <td>
                      <select
                        value={u.role}
                        onChange={e => handleRoleChange(u, e.target.value as User['role'])}
                        style={{ padding: '3px 8px', border: `1px solid ${ROLE_COLORS[u.role]}`, borderRadius: 20, fontSize: 12, fontWeight: 600, color: ROLE_COLORS[u.role], background: ROLE_BG[u.role], cursor: 'pointer', outline: 'none' }}>
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="user">User</option>
                      </select>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: u.isActive ? '#52c41a' : '#8c8c8c' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: u.isActive ? '#52c41a' : '#d9d9d9', display: 'inline-block' }} />
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: '#8c8c8c' }}>{timeAgo(u.createdAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-default btn-sm" onClick={() => openEdit(u)}>Edit</button>
                        <button className="btn btn-default btn-sm" onClick={() => handleToggleActive(u)}
                          style={{ color: u.isActive ? '#fa8c16' : '#52c41a', borderColor: u.isActive ? '#ffd591' : '#b7eb8f' }}>
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="btn btn-sm" onClick={() => handleDelete(u)}
                          style={{ color: '#ff4d4f', borderColor: '#ffa39e', background: '#fff1f0', border: '1px solid #ffa39e' }}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="empty-state"><p>No users found</p></div>
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <Modal
          title={editUser ? `Edit User: ${editUser.username}` : 'Create New User'}
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <button className="btn btn-default" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : (editUser ? 'Save Changes' : 'Create User')}
              </button>
            </>
          }>
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">First Name</label>
                <input className="input" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First name" />
              </div>
              <div className="form-group">
                <label className="form-label">Last Name</label>
                <input className="input" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last name" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label required">Username</label>
              <input className="input" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="username" required autoFocus={!editUser} />
            </div>
            {!editUser && (
              <div className="form-group">
                <label className="form-label required">Email</label>
                <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" required />
              </div>
            )}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Password {editUser && <span style={{ fontSize: 11, color: '#8c8c8c', fontWeight: 400 }}>Leave blank to keep current</span>}
              </label>
              <input className="input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={editUser ? '••••••••' : 'Min 6 characters'} required={!editUser} minLength={editUser ? 0 : 6} />
            </div>
            <div className="form-group">
              <label className="form-label required">Role</label>
              <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as User['role'] }))}>
                <option value="user">User (Annotator)</option>
                <option value="manager">Manager (Supervisor)</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ─── Tenants Tab ──────────────────────────────────────────────────────────────

function TenantsTab() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, TenantMember[]>>({});
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [addUserId, setAddUserId] = useState<Record<string, string>>({});

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [editSaving, setEditSaving] = useState(false);

  const { setTenants: setGlobalTenants } = useTenantStore();

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/tenants');
      const list = Array.isArray(data) ? data : [];
      setTenants(list);
      setGlobalTenants(list.map((t: Tenant) => ({ id: t.id, name: t.name })));
    } catch { /* no-op */ }
    finally { setLoading(false); }
  }, [setGlobalTenants]);

  const loadAllUsers = useCallback(async () => {
    try {
      const { data } = await client.get('/users');
      setAllUsers(Array.isArray(data) ? data : data.users || []);
    } catch { /* no-op */ }
  }, []);

  useEffect(() => { loadTenants(); loadAllUsers(); }, [loadTenants, loadAllUsers]);

  const loadMembers = async (tenantId: string) => {
    try {
      const { data } = await client.get(`/tenants/${tenantId}/users`);
      setMembers(m => ({ ...m, [tenantId]: data }));
    } catch { /* no-op */ }
  };

  const handleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      loadMembers(id);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name) return;
    setSaving(true);
    try {
      await client.post('/tenants', createForm);
      setShowCreate(false);
      setCreateForm({ name: '', description: '' });
      loadTenants();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      alert(e?.response?.data?.error || 'Failed to create tenant');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete tenant "${name}"? This cannot be undone.`)) return;
    try {
      await client.delete(`/tenants/${id}`);
      setTenants(prev => prev.filter(t => t.id !== id));
    } catch { /* no-op */ }
  };

  const openEdit = (t: Tenant) => {
    setEditTenant(t);
    setEditForm({ name: t.name, description: t.description || '' });
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTenant) return;
    setEditSaving(true);
    try {
      await client.patch(`/tenants/${editTenant.id}`, editForm);
      setTenants(prev => prev.map(t => t.id === editTenant.id ? { ...t, ...editForm } : t));
      setEditTenant(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      alert(e?.response?.data?.error || 'Failed to update tenant');
    } finally { setEditSaving(false); }
  };

  const handleRemoveMember = async (tenantId: string, userId: string) => {
    try {
      await client.delete(`/tenants/${tenantId}/users/${userId}`);
      setMembers(m => ({ ...m, [tenantId]: (m[tenantId] || []).filter(u => u.id !== userId) }));
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, memberCount: Math.max(0, t.memberCount - 1) } : t));
    } catch { /* no-op */ }
  };

  const handleAddMember = async (tenantId: string) => {
    const userId = addUserId[tenantId];
    if (!userId) return;
    try {
      await client.post(`/tenants/${tenantId}/users`, { userId });
      setAddUserId(a => ({ ...a, [tenantId]: '' }));
      loadMembers(tenantId);
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, memberCount: t.memberCount + 1 } : t));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      alert(e?.response?.data?.error || 'Failed to add user');
    }
  };

  return (
    <>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>Tenant Management</h2>
          <span style={{ fontSize: 13, color: '#8c8c8c' }}>{tenants.length} tenant{tenants.length !== 1 ? 's' : ''}</span>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ gap: 6, padding: '4px 14px' }}>
            + Create Tenant
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" /></div>
        ) : tenants.length === 0 ? (
          <div className="empty-state"><p>No tenants yet</p><span>Create a tenant to group users and projects</span></div>
        ) : (
          <div>
            {tenants.map(t => (
              <div key={t.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                {/* Row */}
                <div
                  style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', gap: 16, cursor: 'pointer', background: expandedId === t.id ? '#fafafa' : '#fff', transition: 'background 0.15s' }}
                  onClick={() => handleExpand(t.id)}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#e6f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    🏢
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                    {t.description && <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>{t.description}</div>}
                  </div>
                  <div style={{ fontSize: 13, color: '#8c8c8c', flexShrink: 0 }}>
                    {t.memberCount} member{t.memberCount !== 1 ? 's' : ''}
                  </div>
                  <div style={{ fontSize: 12, color: '#8c8c8c', flexShrink: 0 }}>
                    {timeAgo(t.createdAt)}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button className="btn btn-default btn-sm" onClick={() => openEdit(t)}>Edit</button>
                    <button className="btn btn-sm" onClick={() => handleDelete(t.id, t.name)}
                      style={{ color: '#ff4d4f', borderColor: '#ffa39e', background: '#fff1f0', border: '1px solid #ffa39e' }}>
                      Delete
                    </button>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ flexShrink: 0, transform: expandedId === t.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.4 }}>
                    <path d="M6 8L1 3h10z" />
                  </svg>
                </div>

                {/* Expanded members panel */}
                {expandedId === t.id && (
                  <div style={{ background: '#fafafa', padding: '0 20px 16px 72px', borderTop: '1px solid #f0f0f0' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', margin: '12px 0 8px' }}>Members</div>
                    {!members[t.id] ? (
                      <span className="spinner" style={{ width: 14, height: 14 }} />
                    ) : members[t.id].length === 0 ? (
                      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 12 }}>No members yet</div>
                    ) : (
                      <div style={{ marginBottom: 12 }}>
                        {members[t.id].map(m => (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: ROLE_BG[m.role] || '#e6f4ff', color: ROLE_COLORS[m.role] || '#1890ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                              {m.username[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontWeight: 500, fontSize: 13 }}>{m.username}</span>
                              <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 8 }}>{m.email}</span>
                            </div>
                            <span style={{ fontSize: 11, color: ROLE_COLORS[m.role] || '#595959', fontWeight: 600 }}>{m.role.toUpperCase()}</span>
                            <button className="btn btn-sm" onClick={() => handleRemoveMember(t.id, m.id)}
                              style={{ color: '#ff4d4f', borderColor: '#ffa39e', background: '#fff1f0', border: '1px solid #ffa39e', fontSize: 12, padding: '2px 8px' }}>
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Add user */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <select
                        className="input"
                        style={{ flex: 1, maxWidth: 280 }}
                        value={addUserId[t.id] || ''}
                        onChange={e => setAddUserId(a => ({ ...a, [t.id]: e.target.value }))}>
                        <option value="">Select user to add...</option>
                        {allUsers
                          .filter(u => !(members[t.id] || []).some(m => m.id === u.id))
                          .map(u => (
                            <option key={u.id} value={u.id}>{u.username} ({u.email})</option>
                          ))}
                      </select>
                      <button className="btn btn-primary btn-sm" onClick={() => handleAddMember(t.id)} disabled={!addUserId[t.id]}>
                        Add User
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Tenant Modal */}
      {showCreate && (
        <Modal
          title="Create New Tenant"
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <button className="btn btn-default" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Create Tenant'}
              </button>
            </>
          }>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label required">Tenant Name</label>
              <input className="input" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Acme Corp" required autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="input" value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description..." rows={3} />
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Tenant Modal */}
      {editTenant && (
        <Modal
          title={`Edit Tenant: ${editTenant.name}`}
          onClose={() => setEditTenant(null)}
          footer={
            <>
              <button className="btn btn-default" onClick={() => setEditTenant(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEditSave} disabled={editSaving}>
                {editSaving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Save Changes'}
              </button>
            </>
          }>
          <form onSubmit={handleEditSave}>
            <div className="form-group">
              <label className="form-label required">Tenant Name</label>
              <input className="input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} required autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="input" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ─── Main AdminPage ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'tenants'>('users');
  const [stats, setStats] = useState<Stats>({ users: 0, projects: 0, tasks: 0, jobs: 0 });

  const loadStats = useCallback(async () => {
    try {
      const [projRes, taskRes] = await Promise.all([
        client.get('/projects').catch(() => ({ data: [] })),
        client.get('/tasks').catch(() => ({ data: [] })),
      ]);
      const projects = Array.isArray(projRes.data) ? projRes.data : [];
      const tasks = Array.isArray(taskRes.data) ? taskRes.data : [];
      const jobs = tasks.reduce((acc: number, t: { jobs?: unknown[] }) => acc + (t.jobs?.length || 0), 0);
      setStats(s => ({ ...s, projects: projects.length, tasks: tasks.length, jobs }));
    } catch { /* no-op */ }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const statCards = [
    { label: 'Total Users', value: stats.users, icon: '👥', color: '#1890ff', bg: '#e6f4ff' },
    { label: 'Projects', value: stats.projects, icon: '📁', color: '#52c41a', bg: '#f6ffed' },
    { label: 'Tasks', value: stats.tasks, icon: '📋', color: '#fa8c16', bg: '#fff7e6' },
    { label: 'Jobs', value: stats.jobs, icon: '⚙️', color: '#722ed1', bg: '#f9f0ff' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Navbar />
      <div style={{ padding: '24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#262626' }}>Admin Panel</h1>
            <p style={{ margin: '4px 0 0', color: '#8c8c8c', fontSize: 14 }}>Manage users, tenants, roles, and system settings</p>
          </div>
        </div>

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {statCards.map(c => (
            <div key={c.label} className="card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{c.icon}</div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: c.color, lineHeight: 1 }}>{c.value}</div>
                <div style={{ fontSize: 13, color: '#8c8c8c', marginTop: 4 }}>{c.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tab Bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #f0f0f0' }}>
          {(['users', 'tenants'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 20px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? '#1890ff' : '#595959',
                borderBottom: activeTab === tab ? '2px solid #1890ff' : '2px solid transparent',
                marginBottom: -2,
                transition: 'color 0.15s',
              }}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'users' ? (
          <UsersTab stats={stats} setStats={setStats} />
        ) : (
          <TenantsTab />
        )}
      </div>
    </div>
  );
}
