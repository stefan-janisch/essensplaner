import { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import type { Meal } from '../types/index.js';
import { RecipeDetailModal } from './RecipeManagement.js';

export function SharedMealView({
  token,
  isAuthenticated,
  onImport,
}: {
  token: string;
  isAuthenticated: boolean;
  onImport: () => void;
}) {
  const [meal, setMeal] = useState<Meal | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Meal>(`/api/meals/public/${token}`)
      .then(setMeal)
      .catch(() => setError('Rezept nicht gefunden oder Link ungültig.'));
  }, [token]);

  const handleImport = async () => {
    if (!isAuthenticated) {
      const url = new URL(window.location.href);
      url.searchParams.delete('shared-meal');
      url.searchParams.set('import-meal', token);
      window.location.href = url.toString();
      return;
    }
    await api.post(`/api/meals/public/${token}/import`);
    onImport();
  };

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{error}</div>
      </div>
    );
  }

  if (!meal) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Laden…</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--accent)', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'white', fontWeight: 700, fontSize: '16px' }}>Essensplaner</span>
        <a href="/" style={{ color: 'rgba(255,255,255,.85)', fontSize: '13px', textDecoration: 'none' }}>
          {isAuthenticated ? 'Zur App →' : 'Anmelden →'}
        </a>
      </div>
      <RecipeDetailModal
        meal={meal}
        onClose={() => { window.location.href = '/'; }}
        onImport={handleImport}
      />
    </div>
  );
}
