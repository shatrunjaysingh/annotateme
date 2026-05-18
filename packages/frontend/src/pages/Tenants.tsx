import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../components/Navbar';
import Modal from '../components/Modal';
import client from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useTenantStore } from '../store/tenantStore';

interface Tenant {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
}

interface Member {
  id: string;
  username: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
}

interface UserOption {
  id: string;
  username: string;
  email: string;
}

const ROLE_COLOR: Record<string, string> = {
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

function BuildingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  );
}

export default function Tenants() {
  const { user } = useAuthStore();
  const { setTenants: setGlobalTenants } = useTenantStore();
  const isAdmin = user?.role === 'admin';

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Expanded members panel
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, Member[]>>({});
  const [membersLoading, setMembersLoading] = useState<Record<string, boolean>>({});
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [addUserId, setAddUserId] = useState<Record<string, string>>({});

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Edit modal
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/tenants');
      const list: Tenant[] = Array.isArray(data) ? data : [];
      setTenants(list);
      setGlobalTenants(list.map(t => ({ id: t.id, name: t.name })));
    } catch { /* no-op */ }
    finally { setLoading(false); }
  }, [setGlobalTenants]);

  const loadAllUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { data } = await client.get('/users');
      setAllUsers(Array.isArray(data) ? data : data.users || []);
    } catch { /* no-op */ }
  }, [isAdmin]);

  useEffect(() => { loadTenants(); loadAllUsers(); }, [loadTenants, loadAllUsers]);

  const loadMembers = async (tenantId: string) => {
    setMembersLoading(m => ({ ...m, [tenantId]: true }));
    try {
      const { data } = await client.get(`/tenants/${tenantId}/users`);
      setMembers(m => ({ ...m, [tenantId]: data }));
    } catch { /* no-op */ }
    finally { setMembersLoading(m => ({ ...m, [tenantId]: false })); }
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!members[id]) loadMembers(id);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      await client.post('/tenants', createForm);
      setShowCreate(false);
      setCreateForm({ name: '', description: '' });
      loadTenants();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setCreateError(e?.response?.data?.error || 'Failed to create tenant');
    } finally { setCreating(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete tenant "${name}"? Projects and members will be unlinked. This cannot be undone.`)) return;
    try {
      await client.delete(`/tenants/${id}`);
      setTenants(prev => prev.filter(t => t.id !== id));
      setGlobalTenants(tenants.filter(t => t.id !== id).map(t => ({ id: t.id, name: t.name })));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      alert(e?.response?.data?.error || 'Failed to delete tenant');
    }
  };

  const openEdit = (t: Tenant) => {
    setEditTenant(t);
    setEditForm({ name: t.name, description: t.description || '' });
    setEditError('');
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTenant) return;
    setEditSaving(true);
    setEditError('');
    try {
      await client.patch(`/tenants/${editTenant.id}`, editForm);
      setTenants(prev => prev.map(t => t.id === editTenant.id ? { ...t, ...editForm } : t));
      setEditTenant(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setEditError(e?.response?.data?.error || 'Failed to update tenant');
    } finally { setEditSaving(false); }
  };

  const handleRemoveMember = async (tenantId: string, userId: string) => {
    try {
      await client.delete(`/tenants/${tenantId}/users/${userId}`);
      setMembers(m => ({ ...m, [tenantId]: (m[tenantId] || []).filter(u => u.id !== userId) }));
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, memberCount: Math.max(0, t.memberCount - 1) } : t));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      alert(e?.response?.data?.error || 'Failed to remove member');
    }
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

  const filtered = tenants.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Navbar />
      <div style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#262626' }}>Tenants</h1>
            <p style={{ margin: '4px 0 0', color: '#8c8c8c', fontSize: 14 }}>
              {isAdmin ? 'Manage organisations, members, and access.' : 'Organisations you belong to.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={s.searchWrap}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                style={s.searchInput}
                placeholder="Search tenants…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => { setShowCreate(true); setCreateError(''); setCreateForm({ name: '', description: '' }); }}>
                + New Tenant
              </button>
            )}
          </div>
        </div>

        {/* Tenant list */}
        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <span className="spinner" />
            </div>
          ) : filtered.length === 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}><BuildingIcon /></div>
              <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 4 }}>
                {search ? 'No tenants match your search' : 'No tenants yet'}
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                {isAdmin && !search ? 'Create a tenant to group users and projects.' : ''}
              </div>
            </div>
          ) : (
            filtered.map((t, i) => (
              <div key={t.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                {/* Row */}
                <div
                  style={{
                    display: 'flex', alignItems: 'center', padding: '14px 20px', gap: 14,
                    cursor: 'pointer',
                    background: expandedId === t.id ? '#f9fafb' : '#fff',
                    transition: 'background 0.15s',
                  }}
                  onClick={() => toggleExpand(t.id)}
                >
                  <div style={s.tenantIcon}>
                    <BuildingIcon />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{t.name}</div>
                    {t.description && (
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.description}
                      </div>
                    )}
                  </div>
                  <div style={s.metaChip}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    {t.memberCount} member{t.memberCount !== 1 ? 's' : ''}
                  </div>
                  <div style={s.metaChip}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    {timeAgo(t.createdAt)}
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button
                        className="btn btn-default btn-sm"
                        onClick={() => openEdit(t)}
                        style={{ fontSize: 12, padding: '3px 10px' }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => handleDelete(t.id, t.name)}
                        style={{ fontSize: 12, padding: '3px 10px', color: '#ef4444', borderColor: '#fca5a5', background: '#fef2f2', border: '1px solid #fca5a5' }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                  <svg
                    width="12" height="12" viewBox="0 0 12 12" fill="currentColor"
                    style={{ flexShrink: 0, transform: expandedId === t.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.4 }}
                  >
                    <path d="M6 8L1 3h10z" />
                  </svg>
                </div>

                {/* Members panel */}
                {expandedId === t.id && (
                  <div style={{ background: '#f9fafb', borderTop: '1px solid #f0f0f0', padding: '12px 20px 16px 64px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
                      Members
                    </div>

                    {membersLoading[t.id] ? (
                      <span className="spinner" style={{ width: 14, height: 14 }} />
                    ) : !members[t.id] || members[t.id].length === 0 ? (
                      <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12 }}>No members yet.</div>
                    ) : (
                      <div style={{ marginBottom: 12 }}>
                        {members[t.id].map(m => (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f3f4f6' }}>
                            <div style={{
                              width: 30, height: 30, borderRadius: '50%',
                              background: ROLE_BG[m.role] || '#e6f4ff',
                              color: ROLE_COLOR[m.role] || '#1890ff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 700, fontSize: 12, flexShrink: 0,
                            }}>
                              {m.username[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontWeight: 500, fontSize: 13, color: '#111827' }}>{m.username}</span>
                              {(m.firstName || m.lastName) && (
                                <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 6 }}>
                                  {[m.firstName, m.lastName].filter(Boolean).join(' ')}
                                </span>
                              )}
                              <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>{m.email}</span>
                            </div>
                            <span style={{
                              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                              color: ROLE_COLOR[m.role] || '#6b7280',
                              background: ROLE_BG[m.role] || '#f3f4f6',
                              padding: '2px 7px', borderRadius: 20,
                            }}>
                              {m.role.toUpperCase()}
                            </span>
                            {isAdmin && (
                              <button
                                className="btn btn-sm"
                                onClick={() => handleRemoveMember(t.id, m.id)}
                                style={{ fontSize: 11, padding: '2px 8px', color: '#ef4444', borderColor: '#fca5a5', background: '#fef2f2', border: '1px solid #fca5a5' }}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                        <select
                          className="input"
                          style={{ flex: 1, maxWidth: 300, fontSize: 13 }}
                          value={addUserId[t.id] || ''}
                          onChange={e => setAddUserId(a => ({ ...a, [t.id]: e.target.value }))}
                        >
                          <option value="">Select user to add…</option>
                          {allUsers
                            .filter(u => !(members[t.id] || []).some(m => m.id === u.id))
                            .map(u => (
                              <option key={u.id} value={u.id}>{u.username} ({u.email})</option>
                            ))}
                        </select>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleAddMember(t.id)}
                          disabled={!addUserId[t.id]}
                          style={{ fontSize: 13 }}
                        >
                          Add User
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Summary */}
        {!loading && filtered.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 13, color: '#9ca3af', textAlign: 'right' }}>
            {filtered.length} tenant{filtered.length !== 1 ? 's' : ''}
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
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !createForm.name.trim()}>
                {creating ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Create Tenant'}
              </button>
            </>
          }
        >
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label required">Tenant Name</label>
              <input
                className="input"
                value={createForm.name}
                onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Acme Corp"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="input"
                value={createForm.description}
                onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description…"
                rows={3}
              />
            </div>
            {createError && <div style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{createError}</div>}
          </form>
        </Modal>
      )}

      {/* Edit Tenant Modal */}
      {editTenant && (
        <Modal
          title={`Edit: ${editTenant.name}`}
          onClose={() => setEditTenant(null)}
          footer={
            <>
              <button className="btn btn-default" onClick={() => setEditTenant(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEditSave} disabled={editSaving || !editForm.name.trim()}>
                {editSaving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Save Changes'}
              </button>
            </>
          }
        >
          <form onSubmit={handleEditSave}>
            <div className="form-group">
              <label className="form-label required">Tenant Name</label>
              <input
                className="input"
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="input"
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>
            {editError && <div style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{editError}</div>}
          </form>
        </Modal>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  searchWrap: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
    padding: '6px 12px', width: 220,
  },
  searchInput: {
    border: 'none', outline: 'none', background: 'transparent',
    fontSize: 13, color: '#374151', width: '100%',
  },
  tenantIcon: {
    width: 38, height: 38, borderRadius: 10,
    background: '#eff6ff', color: '#3b82f6',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  metaChip: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 12, color: '#6b7280', flexShrink: 0,
  },
  empty: {
    padding: '60px 20px', textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  },
  emptyIcon: {
    width: 52, height: 52, borderRadius: 16,
    background: '#eff6ff', color: '#3b82f6',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
};
