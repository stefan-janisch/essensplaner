import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';

export const AuthForm: React.FC = () => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">Essensplaner</h1>

        <div className="auth-tabs">
          <button
            className={`pill ${mode === 'login' ? 'pill-active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Anmelden
          </button>
          <button
            className={`pill ${mode === 'register' ? 'pill-active' : ''}`}
            onClick={() => { setMode('register'); setError(''); }}
          >
            Registrieren
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">E-Mail</label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Passwort</label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {mode === 'register' && (
              <small style={{ color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Mindestens 8 Zeichen
              </small>
            )}
          </div>

          {error && (
            <div className="auth-error">{error}</div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? '...' : mode === 'login' ? 'Anmelden' : 'Registrieren'}
          </button>
        </form>
      </div>
    </div>
  );
};
