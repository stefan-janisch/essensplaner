import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';

export const MigrationPrompt: React.FC = () => {
  const { runMigration, skipMigration } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleMigrate = async () => {
    setLoading(true);
    setError('');
    try {
      await runMigration();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Migration fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Lokale Daten gefunden</h2>
        <p style={{ color: 'var(--text-p)', marginBottom: '16px' }}>
          Es wurden bestehende Mahlzeiten und Pläne in deinem Browser gefunden.
          Möchtest du diese auf den Server hochladen?
        </p>

        {error && <div className="auth-error">{error}</div>}

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className="btn btn-primary"
            onClick={handleMigrate}
            disabled={loading}
            style={{ flex: 1 }}
          >
            {loading ? 'Wird hochgeladen...' : 'Ja, hochladen'}
          </button>
          <button
            className="btn btn-muted"
            onClick={skipMigration}
            disabled={loading}
            style={{ flex: 1 }}
          >
            Nein, verwerfen
          </button>
        </div>
      </div>
    </div>
  );
};
