import React, { useEffect } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}

export default function Modal({ title, onClose, children, footer, width = 520 }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal fade-in" style={{ maxWidth: width }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
