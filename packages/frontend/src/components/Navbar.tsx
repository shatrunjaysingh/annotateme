import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useTenantStore } from '../store/tenantStore';
import client from '../api/client';

const baseLinks = [
  { to: '/projects', label: 'Projects' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/annotations', label: 'Annotations' },
  { to: '/cloud-storage', label: 'Cloud Storages' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/reports', label: 'Reports' },
];

function TenantSwitcher() {
  const { user } = useAuthStore();
  const { tenants, activeTenant, setActiveTenant, setTenants } = useTenantStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === 'admin';
  const showDropdown = tenants.length > 1 || isAdmin;

  // Repopulate tenant list after a browser refresh (store resets but localStorage token survives)
  useEffect(() => {
    if (!user || tenants.length > 0) return;
    client.get('/tenants')
      .then(({ data }) => {
        if (Array.isArray(data)) setTenants(data.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
      })
      .catch(() => {});
  }, [user, tenants.length, setTenants]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (tenants.length === 0 && !isAdmin) return null;

  const handleSelect = (tenant: { id: string; name: string } | null) => {
    setActiveTenant(tenant);
    setOpen(false);
    navigate('/projects');
  };

  const displayName = activeTenant?.name || (isAdmin ? 'All tenants' : 'No tenant');

  if (!showDropdown) {
    // Single tenant — non-clickable badge
    return (
      <div style={styles.tenantBadge} title={displayName}>
        <OrgIcon />
        <span style={styles.tenantName}>{displayName}</span>
      </div>
    );
  }

  return (
    <div ref={ref} style={styles.tenantDropdownWrap}>
      <button style={styles.tenantBtn} onClick={() => setOpen(o => !o)} title="Switch tenant">
        <OrgIcon />
        <span style={styles.tenantName}>{displayName}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ opacity: 0.5, flexShrink: 0 }}>
          <path d="M5 7L1 3h8z" />
        </svg>
      </button>
      {open && (
        <div style={styles.tenantMenu}>
          {isAdmin && (
            <button
              style={{ ...styles.tenantMenuItem, ...(activeTenant === null ? styles.tenantMenuItemActive : {}) }}
              onClick={() => handleSelect(null)}>
              All tenants
            </button>
          )}
          {tenants.map(t => (
            <button
              key={t.id}
              style={{ ...styles.tenantMenuItem, ...(activeTenant?.id === t.id ? styles.tenantMenuItemActive : {}) }}
              onClick={() => handleSelect(t)}>
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OrgIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  );
}

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    ...baseLinks,
    ...(user?.role === 'admin' || user?.role === 'manager' ? [{ to: '/supervisor', label: 'Supervisor' }] : []),
    ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav style={styles.nav}>
      <div style={styles.left}>
        <div style={styles.logo}>
          <span style={styles.logoText}>AnnotateMe</span>
        </div>
        <TenantSwitcher />
        <div style={styles.links}>
          {navLinks.map(link => (
            <NavLink key={link.to} to={link.to} style={({ isActive }) => ({ ...styles.link, ...(isActive ? styles.linkActive : {}) })}>
              {link.label}
            </NavLink>
          ))}
        </div>
      </div>
      <div style={styles.right}>
        <a href="https://github.com" target="_blank" rel="noreferrer" style={styles.iconBtn} title="GitHub">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
          </svg>
        </a>
        <div style={styles.dropdown}>
          <button style={styles.userBtn} onClick={() => setMenuOpen(!menuOpen)}>
            <div style={styles.avatar}>{(user?.username?.[0] || 'U').toUpperCase()}</div>
            <span style={styles.username}>{user?.username || 'User'}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 8L1 3h10z"/></svg>
          </button>
          {menuOpen && (
            <div style={styles.dropdownMenu} onMouseLeave={() => setMenuOpen(false)}>
              <div style={styles.dropdownInfo}>
                <div style={{ fontWeight: 600, color: '#e0e0e0' }}>{user?.username}</div>
                <div style={{ fontSize: 12, color: '#707070' }}>{user?.email}</div>
                <div style={{ fontSize: 11, color: '#4dabf7', marginTop: 2 }}>{user?.role?.toUpperCase()}</div>
              </div>
              <div style={styles.dropdownDivider} />
              {(user?.role === 'admin' || user?.role === 'manager') && (
                <button style={styles.dropdownItem} onClick={() => { navigate('/supervisor'); setMenuOpen(false); }}>
                  Supervisor Dashboard
                </button>
              )}
              {user?.role === 'admin' && (
                <button style={styles.dropdownItem} onClick={() => { navigate('/admin'); setMenuOpen(false); }}>
                  Admin Panel
                </button>
              )}
              <button style={{ ...styles.dropdownItem, color: '#ff4d4f' }} onClick={handleLogout}>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

const styles: Record<string, React.CSSProperties> = {
  nav: { height: 48, background: '#141414', borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 6px rgba(0,0,0,0.4)' },
  left: { display: 'flex', alignItems: 'center', gap: 16 },
  logo: { display: 'flex', alignItems: 'center', gap: 8 },
  logoText: { fontWeight: 700, fontSize: 16, color: '#4dabf7', letterSpacing: '-0.3px' },
  links: { display: 'flex', alignItems: 'center', gap: 4 },
  link: { padding: '4px 12px', borderRadius: 4, fontSize: 14, color: '#a0a0a0', textDecoration: 'none', transition: 'color 0.15s, background 0.15s' },
  linkActive: { color: '#4dabf7', fontWeight: 500, background: 'rgba(77,171,247,0.12)' },
  right: { display: 'flex', alignItems: 'center', gap: 12 },
  iconBtn: { color: '#a0a0a0', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4 },
  dropdown: { position: 'relative' },
  userBtn: { display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, fontSize: 14, color: '#e0e0e0' },
  avatar: { width: 28, height: 28, borderRadius: '50%', background: '#1890ff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 },
  username: { color: '#e0e0e0', fontSize: 14 },
  dropdownMenu: { position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: '#1f1f1f', border: '1px solid #2a2a2a', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', minWidth: 200, overflow: 'hidden', zIndex: 200 },
  dropdownInfo: { padding: '12px 16px', borderBottom: '1px solid #2a2a2a' },
  dropdownDivider: { height: 1, background: '#2a2a2a', margin: '4px 0' },
  dropdownItem: { display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#e0e0e0', transition: 'background 0.15s' },
  // Tenant switcher
  tenantBadge: { display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6, background: '#2a2a2a', color: '#a0a0a0', fontSize: 13 },
  tenantDropdownWrap: { position: 'relative' },
  tenantBtn: { display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6, background: '#2a2a2a', border: 'none', cursor: 'pointer', fontSize: 13, color: '#a0a0a0', transition: 'background 0.15s' },
  tenantName: { maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tenantMenu: { position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#1f1f1f', border: '1px solid #2a2a2a', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', minWidth: 180, zIndex: 200, overflow: 'hidden' },
  tenantMenuItem: { display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#e0e0e0' },
  tenantMenuItemActive: { background: 'rgba(77,171,247,0.12)', color: '#4dabf7', fontWeight: 500 },
};
