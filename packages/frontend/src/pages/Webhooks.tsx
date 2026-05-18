import React, { useEffect, useState, useCallback } from 'react';
import Navbar from '../components/Navbar';
import client from '../api/client';
import { useToast } from '../components/Toast';

interface Webhook {
  id: string; url: string; events: string[]; secret: string | null;
  projectId: string | null; active: boolean; createdAt: string;
}

const ALL_EVENTS = ['job.completed', 'job.rejected', 'job.stage_changed'];

export default function Webhooks() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['job.completed']);
  const [secret, setSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/webhooks');
      setWebhooks(data);
    } catch { toast.error('Failed to load webhooks'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!url.trim() || !selectedEvents.length) return;
    setSaving(true);
    try {
      await client.post('/webhooks', { url: url.trim(), events: selectedEvents, secret: secret.trim() || undefined });
      setUrl(''); setSecret(''); setSelectedEvents(['job.completed']); setShowForm(false);
      toast.success('Webhook created');
      load();
    } catch { toast.error('Failed to create webhook'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (wh: Webhook) => {
    try {
      await client.patch(`/webhooks/${wh.id}`, {});
      setWebhooks(prev => prev.map(w => w.id === wh.id ? { ...w, active: !w.active } : w));
    } catch { toast.error('Failed to update webhook'); }
  };

  const deleteWebhook = async (id: string) => {
    try {
      await client.delete(`/webhooks/${id}`);
      setWebhooks(prev => prev.filter(w => w.id !== id));
      toast.success('Webhook deleted');
    } catch { toast.error('Failed to delete webhook'); }
  };

  const toggleEvent = (ev: string) => {
    setSelectedEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Navbar />
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Webhooks</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8c8c8c' }}>
              Receive HTTP POST notifications when jobs change state.
            </p>
          </div>
          <button onClick={() => setShowForm(f => !f)}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#1890ff', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + Add Webhook
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>New Webhook</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#595959', marginBottom: 5 }}>Endpoint URL *</label>
                <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-server.com/webhook"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d9d9d9', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#595959', marginBottom: 5 }}>Events *</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {ALL_EVENTS.map(ev => (
                    <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', padding: '6px 10px', borderRadius: 6, border: `1px solid ${selectedEvents.includes(ev) ? '#1890ff' : '#d9d9d9'}`, background: selectedEvents.includes(ev) ? '#e6f4ff' : '#fff' }}>
                      <input type="checkbox" checked={selectedEvents.includes(ev)} onChange={() => toggleEvent(ev)} />
                      <code style={{ fontSize: 12 }}>{ev}</code>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#595959', marginBottom: 5 }}>Secret (optional)</label>
                <input value={secret} onChange={e => setSecret(e.target.value)} placeholder="Used to sign payloads via X-Signature header"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d9d9d9', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleCreate} disabled={saving || !url.trim() || !selectedEvents.length}
                  style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: '#1890ff', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Creating…' : 'Create'}
                </button>
                <button onClick={() => setShowForm(false)}
                  style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d9d9d9', background: '#fff', fontSize: 13, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Webhook list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /></div>
        ) : webhooks.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d9d9d9" strokeWidth="1.5" style={{ marginBottom: 12 }}><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
            <div style={{ fontSize: 14, color: '#8c8c8c' }}>No webhooks configured yet.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {webhooks.map(wh => (
              <div key={wh.id} className="card" style={{ padding: '14px 18px', borderLeft: `3px solid ${wh.active ? '#52c41a' : '#d9d9d9'}`, opacity: wh.active ? 1 : 0.7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wh.url}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {wh.events.map(ev => (
                        <span key={ev} style={{ fontSize: 11, background: '#f0f0f0', borderRadius: 4, padding: '2px 7px', color: '#595959' }}>
                          <code>{ev}</code>
                        </span>
                      ))}
                      {wh.secret && <span style={{ fontSize: 11, background: '#f6ffed', borderRadius: 4, padding: '2px 7px', color: '#389e0d' }}>signed</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: wh.active ? '#52c41a' : '#8c8c8c', fontWeight: 600 }}>{wh.active ? 'Active' : 'Paused'}</span>
                    <button onClick={() => toggleActive(wh)} title={wh.active ? 'Pause' : 'Enable'}
                      style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid #d9d9d9', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#595959' }}>
                      {wh.active ? 'Pause' : 'Enable'}
                    </button>
                    <button onClick={() => deleteWebhook(wh.id)} title="Delete"
                      style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid #ff4d4f', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#ff4d4f' }}>
                      Delete
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#bfbfbf', marginTop: 8 }}>
                  Created {new Date(wh.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Payload docs */}
        <div className="card" style={{ padding: 16, marginTop: 20, background: '#fafafa' }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 13 }}>Payload format</h4>
          <pre style={{ margin: 0, fontSize: 12, color: '#595959', background: '#f5f5f5', padding: '10px 12px', borderRadius: 6, overflowX: 'auto' }}>{JSON.stringify({ event: 'job.completed', timestamp: new Date().toISOString(), payload: { jobId: '...', taskId: '...', stage: 'acceptance', state: 'completed', assigneeId: '...' } }, null, 2)}</pre>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#8c8c8c' }}>
            If a secret is set, the request includes an <code>X-Signature: sha256=&lt;hmac&gt;</code> header for verification.
          </p>
        </div>
      </div>
    </div>
  );
}
