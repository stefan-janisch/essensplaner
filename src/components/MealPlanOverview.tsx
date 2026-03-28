import React, { useState } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import { ShareDialog } from './ShareDialog';
import type { MealPlan } from '../types/index.js';

interface MealPlanOverviewProps {
  onOpenPlan: (planId: number) => void;
}

export const MealPlanOverview: React.FC<MealPlanOverviewProps> = ({ onOpenPlan }) => {
  const { state, createPlan, deletePlan, leavePlan, selectPlan, renamePlan, refreshPlans } = useMealPlan();
  const [showCreate, setShowCreate] = useState(false);
  const [planName, setPlanName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [shareDialogPlan, setShareDialogPlan] = useState<MealPlan | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleCreate = async () => {
    if (!startDate || !endDate) return;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      alert('Startdatum muss vor Enddatum liegen');
      return;
    }
    setCreating(true);
    try {
      await createPlan(planName || `Plan ${startDate}`, start, end);
      setPlanName('');
      setStartDate('');
      setEndDate('');
      setShowCreate(false);
      // Open the newly created plan
      if (state.activePlanId) {
        onOpenPlan(state.activePlanId);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Erstellen');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (plan: MealPlan) => {
    try {
      if (plan.isOwner === false) {
        await leavePlan(plan.id);
      } else {
        await deletePlan(plan.id);
      }
      setDeleteConfirmId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler');
    }
  };

  const handleRename = async (planId: number) => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== state.plans.find(p => p.id === planId)?.name) {
      await renamePlan(planId, trimmed);
    }
    setRenamingId(null);
  };

  const handleOpenPlan = (planId: number) => {
    selectPlan(planId);
    onOpenPlan(planId);
  };

  const filledEntryCount = (plan: MealPlan) => {
    if (!plan.entries) return '?';
    return plan.entries.filter(e => e.mealId).length;
  };

  return (
    <div style={{ padding: '24px 32px', width: '85%', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, color: 'var(--text-h)' }}>Essenspläne</h2>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + Neuer Plan
        </button>
      </div>

      {showCreate && (
        <div className="panel" style={{ marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0' }}>Neuen Plan erstellen</h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Name</label>
              <input
                className="input"
                type="text"
                placeholder="Planname (optional)"
                value={planName}
                onChange={e => setPlanName(e.target.value)}
                style={{ width: '180px' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Von</label>
              <input
                className="input"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Bis</label>
              <input
                className="input"
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={!startDate || !endDate || creating}
              >
                {creating ? '...' : 'Erstellen'}
              </button>
              <button className="btn btn-muted" onClick={() => setShowCreate(false)}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {state.plans.length === 0 && !showCreate ? (
        <div className="panel" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--text)', marginBottom: '16px' }}>
            Du hast noch keine Essenspläne. Erstelle deinen ersten Plan!
          </p>
          <button className="btn btn-primary btn-lg" onClick={() => setShowCreate(true)}>
            + Neuer Plan
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {state.plans.map(plan => (
            <div key={plan.id} className="card" style={{ padding: '20px', textAlign: 'center' }}>
              <div style={{ marginBottom: '12px' }}>
                {renamingId === plan.id ? (
                  <input
                    className="input"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={() => handleRename(plan.id)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRename(plan.id); if (e.key === 'Escape') setRenamingId(null); }}
                    autoFocus
                    style={{ fontSize: '18px', fontWeight: 700, padding: '2px 6px', width: '100%', textAlign: 'center' }}
                  />
                ) : (
                  <h3
                    style={{ margin: 0, color: 'var(--text-h)', fontSize: '18px', cursor: plan.isOwner !== false ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => { if (plan.isOwner !== false) { setRenamingId(plan.id); setRenameValue(plan.name); } }}
                    title={plan.isOwner !== false ? 'Klicken zum Umbenennen' : undefined}
                  >
                    {plan.name}
                    {plan.isOwner !== false && (
                      <span style={{ fontSize: '14px', opacity: 0.5 }}>&#9998;</span>
                    )}
                  </h3>
                )}
                {plan.isOwner === false && (
                  <div style={{ marginTop: '4px' }}>
                    <span style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: 'var(--accent-bg)',
                      color: 'var(--accent)',
                      fontWeight: 500,
                    }}>
                      Geteilt
                    </span>
                  </div>
                )}
              </div>

              {plan.startDate && plan.endDate && (
                <div style={{ fontSize: '14px', color: 'var(--text)', marginBottom: '8px' }}>
                  {plan.startDate} bis {plan.endDate}
                </div>
              )}

              {plan.isOwner === false && plan.ownerEmail && (
                <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '8px' }}>
                  Von: {plan.ownerEmail}
                </div>
              )}

              {plan.collaborators && plan.collaborators.length > 0 && (
                <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '8px' }}>
                  {plan.collaborators.length} Mitglied{plan.collaborators.length !== 1 ? 'er' : ''}
                </div>
              )}

              <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '16px' }}>
                {filledEntryCount(plan)} Mahlzeiten geplant
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button className="btn btn-primary btn-sm" onClick={() => handleOpenPlan(plan.id)}>
                  Öffnen
                </button>
                {plan.isOwner !== false && (
                  <button className="btn btn-accent btn-sm" onClick={() => setShareDialogPlan(plan)}>
                    Teilen
                  </button>
                )}
                {deleteConfirmId === plan.id ? (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ color: 'var(--color-danger)', fontSize: '13px', fontWeight: 500 }}>Sicher?</span>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(plan)}>
                      Ja
                    </button>
                    <button className="btn btn-muted btn-sm" onClick={() => setDeleteConfirmId(null)}>
                      Nein
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => setDeleteConfirmId(plan.id)}
                  >
                    {plan.isOwner === false ? 'Verlassen' : 'Löschen'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {shareDialogPlan && (
        <ShareDialog
          planId={shareDialogPlan.id}
          collaborators={shareDialogPlan.collaborators || []}
          onClose={() => setShareDialogPlan(null)}
          onCollaboratorRemoved={() => {
            refreshPlans();
            setShareDialogPlan(null);
          }}
        />
      )}
    </div>
  );
};
