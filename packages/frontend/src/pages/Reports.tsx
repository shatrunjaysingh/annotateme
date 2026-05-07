import React, { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { useNavigate } from 'react-router-dom';

type Tab = 'org' | 'user' | 'label';

interface OrgRow { org_id: string; org_name: string; project_count: number; task_count: number; job_count: number; completed_jobs: number; annotated_frames: number; }
interface UserRow { user_id: string; username: string; email: string; role: string; assigned_jobs: number; completed_jobs: number; annotated_frames: number; }
interface LabelRow { label_name: string; shape_count: number; job_count: number; project_count: number; }
interface Summary { total_projects: number; total_tasks: number; total_jobs: number; total_users: number; total_annotated_frames: number; completed_jobs: number; }

interface DrillDown {
  title: string;
  columns: string[];
  rows: any[];
  loading: boolean;
}

function StatCard({ label, value, color = '#1890ff' }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, padding: '16px 20px', minWidth: 150, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#262626' }}>{value}</div>
      <div style={{ fontSize: 13, color: '#8c8c8c', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function DownloadBtn({ endpoint, filename }: { endpoint: string; filename: string }) {
  const [loading, setLoading] = useState(false);
  const download = async () => {
    setLoading(true);
    try {
      const res = await client.get(`${endpoint}?format=csv`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch { /* no-op */ }
    setLoading(false);
  };
  return (
    <button className="btn btn-default btn-sm" onClick={download} disabled={loading}
      style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {loading ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '⬇'}
      Download CSV
    </button>
  );
}

function CountCell({ value, onClick, active }: { value: number; onClick: () => void; active: boolean }) {
  return (
    <td style={{ padding: '10px 12px', cursor: value > 0 ? 'pointer' : 'default' }} onClick={value > 0 ? onClick : undefined}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 32, padding: '3px 10px', borderRadius: 12,
        background: active ? '#1890ff' : value > 0 ? '#e6f4ff' : '#f5f5f5',
        color: active ? '#fff' : value > 0 ? '#1890ff' : '#bfbfbf',
        fontWeight: 600, fontSize: 13,
        transition: 'all 0.15s',
        border: active ? 'none' : value > 0 ? '1px solid #91caff' : '1px solid #f0f0f0',
        textDecoration: value > 0 ? 'underline' : 'none',
        textDecorationColor: active ? 'transparent' : '#91caff',
      }}>
        {value}
      </span>
    </td>
  );
}

function DrillDownPanel({ drill, onClose }: { drill: DrillDown; onClose: () => void }) {
  if (drill.loading) {
    return (
      <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: 24, marginTop: 16, textAlign: 'center' }}>
        <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2, display: 'inline-block' }} />
        <span style={{ marginLeft: 10, color: '#52c41a' }}>Loading details...</span>
      </div>
    );
  }

  return (
    <div style={{ background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 8, padding: 16, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, color: '#2f54eb', fontSize: 14 }}>
          ▸ {drill.title}
          <span style={{ fontWeight: 400, color: '#8c8c8c', marginLeft: 8 }}>({drill.rows.length} records)</span>
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8c8c8c', fontSize: 18, lineHeight: 1 }}>×</button>
      </div>

      {drill.rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#8c8c8c', fontSize: 13 }}>No records found</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #adc6ff' }}>
                {drill.columns.map(c => (
                  <th key={c} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#2f54eb', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drill.rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #d6e4ff' }}>
                  {drill.columns.map((col, j) => {
                    const colKey = Object.keys(row)[j + (drill.columns.length < Object.keys(row).length ? Object.keys(row).length - drill.columns.length : 0)];
                    const val = row[Object.keys(row)[j + (Object.keys(row).length > drill.columns.length ? Object.keys(row).length - drill.columns.length : 0)]];
                    return (
                      <td key={col} style={{ padding: '7px 10px', color: '#262626', whiteSpace: 'nowrap' }}>
                        {val !== null && val !== undefined ? String(val) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function renderDrillRows(columns: string[], rows: any[]) {
  if (rows.length === 0) return (
    <div style={{ textAlign: 'center', padding: '20px 0', color: '#8c8c8c', fontSize: 13 }}>No records found</div>
  );
  const keys = Object.keys(rows[0]);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #adc6ff' }}>
            {columns.map(c => (
              <th key={c} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#2f54eb', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #d6e4ff' }}>
              {columns.map((_, j) => (
                <td key={j} style={{ padding: '7px 10px', color: '#262626', whiteSpace: 'nowrap' }}>
                  {row[keys[j]] !== null && row[keys[j]] !== undefined ? String(row[keys[j]]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Reports() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('org');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [orgData, setOrgData] = useState<OrgRow[]>([]);
  const [userData, setUserData] = useState<UserRow[]>([]);
  const [labelData, setLabelData] = useState<LabelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [drill, setDrill] = useState<(DrillDown & { key: string }) | null>(null);

  useEffect(() => {
    client.get('/reports/summary').then(r => setSummary(r.data)).catch(() => {});
  }, []);

  const loadTab = useCallback(async (t: Tab) => {
    setLoading(true);
    setDrill(null);
    try {
      if (t === 'org') { const r = await client.get('/reports/by-org'); setOrgData(r.data); }
      if (t === 'user') { const r = await client.get('/reports/by-user'); setUserData(r.data); }
      if (t === 'label') { const r = await client.get('/reports/by-label'); setLabelData(r.data); }
    } catch { /* no-op */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  const drillDown = useCallback(async (key: string, title: string, type: string, params: string) => {
    if (drill?.key === key) { setDrill(null); return; }
    setDrill({ key, title, columns: [], rows: [], loading: true });
    try {
      const { data } = await client.get(`/reports/drill?type=${type}&${params}`);
      setDrill({ key, title, columns: data.columns, rows: data.rows, loading: false });
    } catch {
      setDrill({ key, title, columns: [], rows: [], loading: false });
    }
  }, [drill]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'org', label: 'By Organization' },
    { key: 'user', label: 'By User' },
    { key: 'label', label: 'By Label Type' },
  ];

  const summaryCards = summary ? [
    { label: 'Total Projects', value: summary.total_projects, color: '#1890ff' },
    { label: 'Total Tasks', value: summary.total_tasks, color: '#722ed1' },
    { label: 'Total Jobs', value: summary.total_jobs, color: '#13c2c2' },
    { label: 'Completed Jobs', value: summary.completed_jobs, color: '#52c41a' },
    { label: 'Total Users', value: summary.total_users, color: '#fa8c16' },
    { label: 'Annotated Frames', value: summary.total_annotated_frames, color: '#eb2f96' },
  ] : [];

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <div style={{ background: '#001529', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 20 }}>
        <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.65)', cursor: 'pointer', fontSize: 13 }} onClick={() => navigate('/projects')}>← Back</button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Reports & Analytics</span>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
        {/* Summary cards */}
        {summary && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            {summaryCards.map(c => <StatCard key={c.label} label={c.label} value={c.value} color={c.color} />)}
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e8e8e8', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e8e8e8', padding: '0 16px', alignItems: 'center' }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ padding: '14px 20px', background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid #1890ff' : '2px solid transparent', color: tab === t.key ? '#1890ff' : '#595959', cursor: 'pointer', fontSize: 14, fontWeight: tab === t.key ? 600 : 400, marginBottom: -1, transition: 'all 0.15s' }}>
                {t.label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <div style={{ padding: '0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              {drill && (
                <button className="btn btn-ghost btn-sm" onClick={() => setDrill(null)} style={{ color: '#8c8c8c', fontSize: 12 }}>
                  × Clear Detail
                </button>
              )}
              <DownloadBtn
                endpoint={tab === 'org' ? '/reports/by-org' : tab === 'user' ? '/reports/by-user' : '/reports/by-label'}
                filename={`report-by-${tab}.csv`}
              />
            </div>
          </div>

          <div style={{ padding: 16, minHeight: 300 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#8c8c8c' }}>
                <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3, display: 'inline-block', marginBottom: 12 }} />
                <div>Loading report...</div>
              </div>
            ) : (
              <>
                {/* Hint */}
                {!drill && (
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    Click any count to see the details below
                  </div>
                )}

                {/* By Org table */}
                {tab === 'org' && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                        {['Organization', 'Projects', 'Tasks', 'Jobs', 'Completed Jobs', 'Annotated Frames'].map(h => (
                          <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#8c8c8c', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orgData.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: '#8c8c8c' }}>No data</td></tr>
                      ) : orgData.map((row) => (
                        <React.Fragment key={row.org_id}>
                          <tr style={{ borderBottom: drill?.key?.startsWith(row.org_id) ? 'none' : '1px solid #f5f5f5', background: drill?.key?.startsWith(row.org_id) ? '#f0f5ff' : undefined }}>
                            <td style={{ padding: '12px 12px', fontWeight: 600 }}>{row.org_name}</td>
                            <CountCell value={row.project_count} active={drill?.key === `${row.org_id}-projects`}
                              onClick={() => drillDown(`${row.org_id}-projects`, `Projects in "${row.org_name}"`, 'projects', `orgId=${row.org_id}`)} />
                            <CountCell value={row.task_count} active={drill?.key === `${row.org_id}-tasks`}
                              onClick={() => drillDown(`${row.org_id}-tasks`, `Tasks in "${row.org_name}"`, 'tasks', `orgId=${row.org_id}`)} />
                            <CountCell value={row.job_count} active={drill?.key === `${row.org_id}-jobs`}
                              onClick={() => drillDown(`${row.org_id}-jobs`, `Jobs in "${row.org_name}"`, 'jobs', `orgId=${row.org_id}`)} />
                            <CountCell value={row.completed_jobs} active={drill?.key === `${row.org_id}-completed`}
                              onClick={() => drillDown(`${row.org_id}-completed`, `Completed jobs in "${row.org_name}"`, 'jobs', `orgId=${row.org_id}&state=completed`)} />
                            <CountCell value={row.annotated_frames} active={drill?.key === `${row.org_id}-frames`}
                              onClick={() => drillDown(`${row.org_id}-frames`, `Annotated frames in "${row.org_name}"`, 'jobs', `orgId=${row.org_id}`)} />
                          </tr>
                          {drill?.key?.startsWith(row.org_id) && (
                            <tr>
                              <td colSpan={6} style={{ padding: '0 12px 12px' }}>
                                {renderDrillPanel(drill, () => setDrill(null))}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* By User table */}
                {tab === 'user' && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                        {['Username', 'Email', 'Role', 'Assigned Jobs', 'Completed Jobs', 'Annotated Frames'].map(h => (
                          <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#8c8c8c', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {userData.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: '#8c8c8c' }}>No data</td></tr>
                      ) : userData.map((row) => (
                        <React.Fragment key={row.user_id}>
                          <tr style={{ borderBottom: drill?.key?.startsWith(row.user_id) ? 'none' : '1px solid #f5f5f5', background: drill?.key?.startsWith(row.user_id) ? '#f0f5ff' : undefined }}>
                            <td style={{ padding: '12px 12px', fontWeight: 600 }}>{row.username}</td>
                            <td style={{ padding: '12px 12px', color: '#595959' }}>{row.email}</td>
                            <td style={{ padding: '12px 12px' }}><RoleBadge role={row.role} /></td>
                            <CountCell value={row.assigned_jobs} active={drill?.key === `${row.user_id}-jobs`}
                              onClick={() => drillDown(`${row.user_id}-jobs`, `Jobs assigned to "${row.username}"`, 'user_jobs', `userId=${row.user_id}`)} />
                            <CountCell value={row.completed_jobs} active={drill?.key === `${row.user_id}-completed`}
                              onClick={() => drillDown(`${row.user_id}-completed`, `Completed jobs for "${row.username}"`, 'user_jobs', `userId=${row.user_id}&state=completed`)} />
                            <CountCell value={row.annotated_frames} active={drill?.key === `${row.user_id}-frames`}
                              onClick={() => drillDown(`${row.user_id}-frames`, `Annotated frames by "${row.username}"`, 'user_frames', `userId=${row.user_id}`)} />
                          </tr>
                          {drill?.key?.startsWith(row.user_id) && (
                            <tr>
                              <td colSpan={6} style={{ padding: '0 12px 12px' }}>
                                {renderDrillPanel(drill, () => setDrill(null))}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* By Label table */}
                {tab === 'label' && (() => {
                  const max = Math.max(...labelData.map(r => r.shape_count), 1);
                  return (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                          {['Label', 'Shapes', 'Jobs', 'Projects', 'Usage'].map(h => (
                            <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#8c8c8c', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {labelData.length === 0 ? (
                          <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: '#8c8c8c' }}>No label usage yet. Annotate frames to see label reports.</td></tr>
                        ) : labelData.map((row) => (
                          <React.Fragment key={row.label_name}>
                            <tr style={{ borderBottom: drill?.key?.startsWith(row.label_name) ? 'none' : '1px solid #f5f5f5', background: drill?.key?.startsWith(row.label_name) ? '#f0f5ff' : undefined }}>
                              <td style={{ padding: '12px 12px', fontWeight: 600 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#1890ff', display: 'inline-block' }} />
                                  {row.label_name}
                                </span>
                              </td>
                              <CountCell value={row.shape_count} active={drill?.key === `${row.label_name}-shapes`}
                                onClick={() => drillDown(`${row.label_name}-shapes`, `Frames with "${row.label_name}" annotations`, 'label_frames', `label=${encodeURIComponent(row.label_name)}`)} />
                              <CountCell value={row.job_count} active={drill?.key === `${row.label_name}-jobs`}
                                onClick={() => drillDown(`${row.label_name}-jobs`, `Jobs using label "${row.label_name}"`, 'label_jobs', `label=${encodeURIComponent(row.label_name)}`)} />
                              <CountCell value={row.project_count} active={drill?.key === `${row.label_name}-projects`}
                                onClick={() => drillDown(`${row.label_name}-projects`, `Projects using label "${row.label_name}"`, 'label_jobs', `label=${encodeURIComponent(row.label_name)}`)} />
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ background: '#f0f0f0', borderRadius: 4, height: 8, width: '100%', maxWidth: 160 }}>
                                  <div style={{ background: '#1890ff', height: '100%', borderRadius: 4, width: `${(row.shape_count / max) * 100}%`, transition: 'width 0.3s' }} />
                                </div>
                              </td>
                            </tr>
                            {drill?.key?.startsWith(row.label_name) && (
                              <tr>
                                <td colSpan={5} style={{ padding: '0 12px 12px' }}>
                                  {renderDrillPanel(drill, () => setDrill(null))}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function renderDrillPanel(drill: DrillDown & { key: string }, onClose: () => void) {
  return (
    <div style={{ background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 8, padding: 16, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, color: '#2f54eb', fontSize: 13 }}>
          {drill.title}
          {!drill.loading && <span style={{ fontWeight: 400, color: '#8c8c8c', marginLeft: 8 }}>({drill.rows.length} records)</span>}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8c8c8c', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button>
      </div>
      {drill.loading ? (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2, display: 'inline-block' }} />
          <span style={{ marginLeft: 8, color: '#8c8c8c', fontSize: 13 }}>Loading...</span>
        </div>
      ) : drill.rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '12px 0', color: '#8c8c8c', fontSize: 13 }}>No records found</div>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f0f5ff' }}>
              <tr style={{ borderBottom: '2px solid #adc6ff' }}>
                {drill.columns.map(c => (
                  <th key={c} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#2f54eb', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drill.rows.map((row, i) => {
                const vals = Object.values(row) as any[];
                const nonIdVals = drill.columns.length < vals.length ? vals.slice(vals.length - drill.columns.length) : vals;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #d6e4ff' }}>
                    {drill.columns.map((_, j) => (
                      <td key={j} style={{ padding: '6px 10px', color: '#262626', whiteSpace: 'nowrap', fontSize: 13 }}>
                        {nonIdVals[j] !== null && nonIdVals[j] !== undefined ? String(nonIdVals[j]) : '—'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = { admin: '#ff4d4f', manager: '#fa8c16', annotator: '#1890ff', reviewer: '#722ed1', user: '#595959' };
  const c = colors[role] || '#8c8c8c';
  return <span style={{ padding: '2px 8px', borderRadius: 4, background: `${c}18`, color: c, fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{role}</span>;
}
