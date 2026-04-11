import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client.js';

type GroupBy = 'none' | 'endpoint' | 'user' | 'day';
type AdminSection = 'ai-costs' | 'users';

interface UsageSummary {
  call_count: number;
  total_cost: number | null;
  total_tokens: number | null;
}

interface SummaryData {
  total: UsageSummary;
  today: UsageSummary;
  thisMonth: UsageSummary;
}

interface UsageRow {
  id?: number;
  user_id?: number;
  email?: string;
  endpoint?: string;
  model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_prompt_tokens?: number;
  total_completion_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
  total_cost?: number;
  call_count?: number;
  day?: string;
  created_at?: string;
}

function formatCost(usd: number | null | undefined): string {
  if (usd == null) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number | null | undefined): string {
  if (n == null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const ENDPOINT_LABELS: Record<string, string> = {
  'parse-recipe-url': 'Rezept-URL parsen',
  'parse-ingredients': 'Zutaten parsen',
  'clean-recipe-text': 'Rezepttext aufräumen',
  'convert-units': 'Einheiten umrechnen',
  'recipe-chat': 'Rezept-Chat',
};

function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split('T')[0];
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  return { from, to };
}

function AiCostsView() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [dateRange, setDateRange] = useState(getDefaultDateRange);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await api.get<SummaryData>('/api/admin/ai-usage/summary');
      setSummary(data);
    } catch (err) {
      console.error('Failed to load summary:', err);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateRange.from) params.set('from', dateRange.from);
      if (dateRange.to) params.set('to', dateRange.to);
      if (groupBy !== 'none') params.set('groupBy', groupBy);
      const result = await api.get<{ data: UsageRow[] }>(`/api/admin/ai-usage?${params}`);
      setRows(result.data);
    } catch (err) {
      console.error('Failed to load AI usage:', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange, groupBy]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      {/* Summary cards */}
      {summary && (
        <div className="admin-summary-cards">
          <div className="admin-summary-card">
            <div className="admin-summary-label">Heute</div>
            <div className="admin-summary-value">{formatCost(summary.today.total_cost)}</div>
            <div className="admin-summary-sub">{summary.today.call_count} Aufrufe</div>
          </div>
          <div className="admin-summary-card">
            <div className="admin-summary-label">Dieser Monat</div>
            <div className="admin-summary-value">{formatCost(summary.thisMonth.total_cost)}</div>
            <div className="admin-summary-sub">{summary.thisMonth.call_count} Aufrufe</div>
          </div>
          <div className="admin-summary-card">
            <div className="admin-summary-label">Gesamt</div>
            <div className="admin-summary-value">{formatCost(summary.total.total_cost)}</div>
            <div className="admin-summary-sub">{summary.total.call_count} Aufrufe / {formatTokens(summary.total.total_tokens)} Tokens</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="admin-filters">
        <label>
          Von:
          <input type="date" value={dateRange.from} onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))} />
        </label>
        <label>
          Bis:
          <input type="date" value={dateRange.to} onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))} />
        </label>
        <label>
          Gruppierung:
          <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)}>
            <option value="day">Pro Tag</option>
            <option value="endpoint">Pro Endpoint</option>
            <option value="user">Pro Benutzer</option>
            <option value="none">Einzeln</option>
          </select>
        </label>
      </div>

      {/* Data table */}
      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center' }}>Laden...</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#888' }}>Keine Daten im gewählten Zeitraum</div>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                {groupBy === 'day' && <th>Tag</th>}
                {groupBy === 'endpoint' && <><th>Endpoint</th><th>Modell</th></>}
                {groupBy === 'user' && <><th>Benutzer</th></>}
                {groupBy === 'none' && <><th>Zeitpunkt</th><th>Benutzer</th><th>Endpoint</th><th>Modell</th></>}
                <th style={{ textAlign: 'right' }}>Aufrufe</th>
                <th style={{ textAlign: 'right' }}>Prompt-Tokens</th>
                <th style={{ textAlign: 'right' }}>Compl.-Tokens</th>
                <th style={{ textAlign: 'right' }}>Tokens gesamt</th>
                <th style={{ textAlign: 'right' }}>Kosten</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {groupBy === 'day' && <td>{row.day}</td>}
                  {groupBy === 'endpoint' && <><td>{ENDPOINT_LABELS[row.endpoint || ''] || row.endpoint}</td><td>{row.model}</td></>}
                  {groupBy === 'user' && <td>{row.email}</td>}
                  {groupBy === 'none' && (
                    <>
                      <td>{row.created_at?.replace('T', ' ').slice(0, 19)}</td>
                      <td>{row.email}</td>
                      <td>{ENDPOINT_LABELS[row.endpoint || ''] || row.endpoint}</td>
                      <td>{row.model}</td>
                    </>
                  )}
                  <td style={{ textAlign: 'right' }}>{groupBy === 'none' ? 1 : row.call_count}</td>
                  <td style={{ textAlign: 'right' }}>{formatTokens(row.total_prompt_tokens ?? row.prompt_tokens)}</td>
                  <td style={{ textAlign: 'right' }}>{formatTokens(row.total_completion_tokens ?? row.completion_tokens)}</td>
                  <td style={{ textAlign: 'right' }}>{formatTokens(row.total_tokens)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCost(row.total_cost ?? row.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface AdminUser {
  id: number;
  email: string;
  is_admin: number;
  is_approved: number;
  created_at: string;
}

function UsersView() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ users: AdminUser[] }>('/api/admin/users');
      setUsers(data.users);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleApprove = async (userId: number) => {
    try {
      await api.patch(`/api/admin/users/${userId}/approve`, {});
      fetchUsers();
    } catch (err) {
      console.error('Failed to approve user:', err);
    }
  };

  const handleDelete = async (userId: number, email: string) => {
    if (!confirm(`Benutzer "${email}" wirklich löschen? Alle Daten werden unwiderruflich gelöscht.`)) return;
    try {
      await api.delete(`/api/admin/users/${userId}`);
      fetchUsers();
    } catch (err) {
      console.error('Failed to delete user:', err);
    }
  };

  if (loading) {
    return <div style={{ padding: '24px', textAlign: 'center' }}>Laden...</div>;
  }

  const pending = users.filter(u => !u.is_approved);
  const approved = users.filter(u => u.is_approved);

  return (
    <div>
      {pending.length > 0 && (
        <>
          <h3 style={{ marginBottom: '12px' }}>Ausstehende Freischaltung ({pending.length})</h3>
          <div className="admin-table-wrapper" style={{ marginBottom: '32px' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>E-Mail</th>
                  <th>Registriert am</th>
                  <th style={{ textAlign: 'right' }}>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(u => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.created_at?.replace('T', ' ').slice(0, 16)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="admin-user-actions" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn-approve" onClick={() => handleApprove(u.id)}>Freischalten</button>
                        <button className="btn-deny" onClick={() => handleDelete(u.id, u.email)}>Löschen</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 style={{ marginBottom: '12px' }}>Freigeschaltete Benutzer ({approved.length})</h3>
      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>E-Mail</th>
              <th>Rolle</th>
              <th>Registriert am</th>
              <th style={{ textAlign: 'right' }}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {approved.map(u => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.is_admin ? 'Admin' : 'Benutzer'}</td>
                <td>{u.created_at?.replace('T', ' ').slice(0, 16)}</td>
                <td style={{ textAlign: 'right' }}>
                  {u.is_admin ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>(Du)</span>
                  ) : (
                    <button className="btn-deny" onClick={() => handleDelete(u.id, u.email)}>Löschen</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminPanel() {
  const [section, setSection] = useState<AdminSection>('ai-costs');

  return (
    <div className="admin-panel">
      <div className="admin-sidebar">
        <h3>Admin</h3>
        <nav>
          <button
            className={`admin-nav-item ${section === 'users' ? 'active' : ''}`}
            onClick={() => setSection('users')}
          >
            Benutzer
          </button>
          <button
            className={`admin-nav-item ${section === 'ai-costs' ? 'active' : ''}`}
            onClick={() => setSection('ai-costs')}
          >
            API-Kosten
          </button>
        </nav>
      </div>
      <div className="admin-content">
        <h2>{section === 'ai-costs' ? 'API-Kosten' : section === 'users' ? 'Benutzerverwaltung' : ''}</h2>
        {section === 'ai-costs' && <AiCostsView />}
        {section === 'users' && <UsersView />}
      </div>
    </div>
  );
}
