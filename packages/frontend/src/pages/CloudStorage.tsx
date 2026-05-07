import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import Modal from '../components/Modal';

export default function CloudStorage() {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Navbar />
      <div style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div className="search-bar" style={{ width: 260 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Search cloud storages..." />
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn btn-default btn-sm">Sort by</button>
          <button className="btn btn-default btn-sm">Quick filters ▾</button>
          <button className="btn btn-default btn-sm">Filter ▾</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+</button>
        </div>

        <div className="empty-state">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          <p>No cloud storages configured</p>
          <span>Connect an S3, Google Cloud, or Azure storage to import datasets</span>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAdd(true)}>Add Cloud Storage</button>
        </div>
      </div>

      {showAdd && (
        <Modal title="Add Cloud Storage" onClose={() => setShowAdd(false)}
          footer={<><button className="btn btn-default" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn btn-primary">Connect</button></>}>
          <div className="form-group">
            <label className="form-label required">Storage Type</label>
            <select className="input">
              <option>Amazon S3</option>
              <option>Google Cloud Storage</option>
              <option>Azure Blob Storage</option>
              <option>MinIO</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Display Name</label>
            <input className="input" placeholder="My S3 Bucket" />
          </div>
          <div className="form-group">
            <label className="form-label required">Bucket Name</label>
            <input className="input" placeholder="my-annotation-bucket" />
          </div>
          <div className="form-group">
            <label className="form-label">Prefix (optional)</label>
            <input className="input" placeholder="datasets/images/" />
          </div>
          <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#614700' }}>
            ⚠️ Cloud storage integration requires MinIO or S3 credentials configured in the server environment.
          </div>
        </Modal>
      )}
    </div>
  );
}
