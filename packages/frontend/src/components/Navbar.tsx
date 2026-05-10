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

function OrgIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  );
}

function TenantSwitcher() {
  const { user } = useAuthStore();
  const { tenants, activeTenant, setActiveTenant, setTenants } = useTenantStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === 'admin';
  const showDropdown = tenants.length > 1 || isAdmin;

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
    return (
      <div style={s.tenantBadge} title={displayName}>
        <OrgIcon />
        <span style={s.tenantName}>{displayName}</span>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button style={s.tenantBtn} onClick={() => setOpen(o => !o)}>
        <OrgIcon />
        <span style={s.tenantName}>{displayName}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ opacity: 0.5, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M5 7L1 3h8z" />
        </svg>
      </button>
      {open && (
        <div style={s.tenantMenu}>
          {isAdmin && (
            <button
              style={{ ...s.tenantMenuItem, ...(activeTenant === null ? s.tenantMenuItemActive : {}) }}
              onClick={() => handleSelect(null)}>
              All tenants
            </button>
          )}
          {tenants.map(t => (
            <button
              key={t.id}
              style={{ ...s.tenantMenuItem, ...(activeTenant?.id === t.id ? s.tenantMenuItemActive : {}) }}
              onClick={() => handleSelect(t)}>
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const navLinks = [
    ...baseLinks,
    ...(user?.role === 'admin' || user?.role === 'manager' ? [{ to: '/supervisor', label: 'Supervisor' }] : []),
    ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initial = (user?.username?.[0] || 'U').toUpperCase();

  return (
    <nav style={s.nav}>
      <div style={s.left}>
        <div style={s.logo}>
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#2563EB"/>
            <path d="M8 22L14 10l6 8 4-5 4 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={s.logoText}>AnnotateMe</span>
        </div>

        <div style={s.separator} />
        <TenantSwitcher />

        <nav style={s.links} aria-label="Main navigation">
          {navLinks.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              style={({ isActive }) => ({ ...s.link, ...(isActive ? s.linkActive : {}) })}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div style={s.right}>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          style={s.iconBtn}
          title="GitHub"
          aria-label="GitHub"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
          </svg>
        </a>

        <div ref={menuRef} style={{ position: 'relative' }}>
          <button style={s.userBtn} onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen}>
            <div style={s.avatar}>{initial}</div>
            <span style={s.username}>{user?.username || 'User'}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ opacity: 0.5, transition: 'transform 0.15s', transform: menuOpen ? 'rotate(180deg)' : 'none' }}>
              <path d="M6 8L1 3h10z"/>
            </svg>
          </button>

          {menuOpen && (
            <div style={s.dropdownMenu}>
              <div style={s.dropdownInfo}>
                <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: 14 }}>{user?.username}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{user?.email}</div>
                <span style={s.roleBadge}>{user?.role?.toUpperCase()}</span>
              </div>
              <div style={s.dropdownDivider} />
              {(user?.role === 'admin' || user?.role === 'manager') && (
                <button style={s.dropdownItem} onClick={() => { navigate('/supervisor'); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                  Supervisor Dashboard
                </button>
              )}
              {user?.role === 'admin' && (
                <button style={s.dropdownItem} onClick={() => { navigate('/admin'); setMenuOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Admin Panel
                </button>
              )}
              <div style={s.dropdownDivider} />
              <button style={{ ...s.dropdownItem, color: '#f87171' }} onClick={handleLogout}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

const s: Record<string, React.CSSProperties> = {
  nav: {
    height: 'var(--nav-height, 56px)',
    background: 'var(--nav-bg, #0F172A)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 1px 0 rgba(255,255,255,0.05)',
  },
  left: { display: 'flex', alignItems: 'center', gap: 0, overflow: 'hidden', flex: 1 },
  logo: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginRight: 8 },
  logoText: { fontWeight: 700, fontSize: 15, color: '#f1f5f9', letterSpacing: '-0.3px' },
  separator: { width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 12px', flexShrink: 0 },
  links: { display: 'flex', alignItems: 'center', gap: 2, overflow: 'hidden' },
  link: {
    padding: '5px 10px',
    borderRadius: 6,
    fontSize: 13,
    color: 'rgba(241,245,249,0.6)',
    textDecoration: 'none',
    transition: 'color 0.15s, background 0.15s',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  linkActive: { color: '#f1f5f9', background: 'rgba(255,255,255,0.1)' },
  right: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  iconBtn: {
    color: 'rgba(241,245,249,0.5)',
    display: 'flex',
    alignItems: 'center',
    padding: '6px',
    borderRadius: 6,
    transition: 'color 0.15s, background 0.15s',
    cursor: 'pointer',
  },
  userBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer',
    padding: '5px 10px 5px 6px',
    borderRadius: 8,
    fontSize: 13,
    color: '#f1f5f9',
    transition: 'background 0.15s',
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 11,
    flexShrink: 0,
  },
  username: { color: '#f1f5f9', fontSize: 13, fontWeight: 500 },
  dropdownMenu: {
    position: 'absolute',
    right: 0,
    top: 'calc(100% + 8px)',
    background: '#1E293B',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
    minWidth: 220,
    overflow: 'hidden',
    zIndex: 200,
    animation: 'dropIn 0.15s ease',
  },
  dropdownInfo: { padding: '14px 16px' },
  roleBadge: {
    display: 'inline-block',
    marginTop: 6,
    padding: '2px 8px',
    background: 'rgba(37,99,235,0.25)',
    color: '#60a5fa',
    borderRadius: 20,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
  },
  dropdownDivider: { height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    textAlign: 'left',
    padding: '9px 16px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    color: 'rgba(241,245,249,0.8)',
    transition: 'background 0.12s',
  },
  tenantBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 10px',
    borderRadius: 6,
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(241,245,249,0.5)',
    fontSize: 12,
    marginRight: 4,
  },
  tenantBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 10px',
    borderRadius: 6,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer',
    fontSize: 12,
    color: 'rgba(241,245,249,0.6)',
    transition: 'background 0.15s',
    marginRight: 4,
  },
  tenantName: { maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tenantMenu: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    background: '#1E293B',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    minWidth: 180,
    zIndex: 200,
    overflow: 'hidden',
    animation: 'dropIn 0.15s ease',
  },
  tenantMenuItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 14px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    color: 'rgba(241,245,249,0.75)',
    transition: 'background 0.12s',
  },
  tenantMenuItemActive: {
    background: 'rgba(37,99,235,0.2)',
    color: '#60a5fa',
    fontWeight: 600,
  },
};
