import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { ModalPortal } from './Modal';
import type { Collaborator } from '../types/index.js';

interface ShareInfo {
  token: string;
  url: string;
  expiresAt: string | null;
}

interface ShareDialogProps {
  planId: number;
  collaborators: Collaborator[];
  onClose: () => void;
  onCollaboratorRemoved: () => void;
}

export const ShareDialog: React.FC<ShareDialogProps> = ({ planId, collaborators, onClose, onCollaboratorRemoved }) => {
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get<ShareInfo | null>(`/api/plans/${planId}/share`)
      .then(info => setShareInfo(info))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [planId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const info = await api.post<ShareInfo>(`/api/plans/${planId}/share`, {});
      setShareInfo(info);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Erstellen');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    try {
      await api.delete(`/api/plans/${planId}/share`);
      setShareInfo(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Widerrufen');
    }
  };

  const handleCopy = () => {
    if (!shareInfo) return;
    navigator.clipboard.writeText(shareInfo.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleRemoveCollaborator = async (userId: number) => {
    try {
      await api.delete(`/api/plans/${planId}/collaborators/${userId}`);
      onCollaboratorRemoved();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler');
    }
  };

  return (
    <ModalPortal>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Plan teilen</h2>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize: '24px' }}>x</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text)' }}>Laden...</div>
        ) : shareInfo ? (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px' }}>Einladungslink:</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="input"
                  readOnly
                  value={shareInfo.url}
                  style={{ flex: 1, fontSize: '13px' }}
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
                <button className="btn btn-primary" onClick={handleCopy}>
                  {copied ? 'Kopiert!' : 'Kopieren'}
                </button>
              </div>
            </div>

            {shareInfo.expiresAt && (
              <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '16px' }}>
                Gültig bis: {new Date(shareInfo.expiresAt).toLocaleDateString('de-DE')}
              </div>
            )}

            <button className="btn btn-danger btn-sm" onClick={handleRevoke}>
              Link widerrufen
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--text)', marginBottom: '16px' }}>
              Erstelle einen Einladungslink, um diesen Plan mit anderen zu teilen.
              Eingeladene Personen können den Plan gemeinsam bearbeiten.
            </p>
            <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? 'Erstelle...' : 'Link erstellen'}
            </button>
          </div>
        )}

        {collaborators.length > 0 && (
          <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>Mitglieder</h3>
            {collaborators.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                <span style={{ fontSize: '14px' }}>{c.email}</span>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleRemoveCollaborator(c.id)}
                >
                  Entfernen
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </ModalPortal>
  );
};
