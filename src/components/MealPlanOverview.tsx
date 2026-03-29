import React, { useState, useMemo } from 'react';
import { DateRange, type RangeKeyDict } from 'react-date-range';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { de } from 'date-fns/locale';
import { format } from 'date-fns';
import { useMealPlan } from '../context/MealPlanContext';
import { ShareDialog } from './ShareDialog';
import type { MealPlan } from '../types/index.js';

interface MealPlanOverviewProps {
  onOpenPlan: (planId: number) => void;
}

export const MealPlanOverview: React.FC<MealPlanOverviewProps> = ({ onOpenPlan }) => {
  const { state, createPlan, deletePlan, leavePlan, selectPlan, renamePlan, archivePlan, refreshPlans } = useMealPlan();
  const [showCreate, setShowCreate] = useState(false);
  const [planName, setPlanName] = useState('');
  const [selectionRange, setSelectionRange] = useState({
    startDate: new Date(),
    endDate: new Date(),
    key: 'selection',
  });
  const [hasSelected, setHasSelected] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [shareDialogPlan, setShareDialogPlan] = useState<MealPlan | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const activePlans = useMemo(() =>
    state.plans.filter(p => !p.archived),
    [state.plans]
  );

  const archivedPlans = useMemo(() =>
    state.plans.filter(p => p.archived),
    [state.plans]
  );

  const filterPlans = (plans: MealPlan[]) => {
    if (!searchQuery.trim()) return plans;
    const q = searchQuery.toLowerCase();
    return plans.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.startDate?.includes(q) ||
      p.endDate?.includes(q) ||
      p.ownerEmail?.toLowerCase().includes(q)
    );
  };

  const filteredActive = filterPlans(activePlans);
  const filteredArchived = filterPlans(archivedPlans);

  const handleSelect = (ranges: RangeKeyDict) => {
    const sel = ranges.selection;
    if (sel.startDate && sel.endDate) {
      setSelectionRange({ startDate: sel.startDate, endDate: sel.endDate, key: 'selection' });
      setHasSelected(true);
    }
  };

  const handleCreate = async () => {
    if (!hasSelected) return;
    setCreating(true);
    try {
      const defaultName = planName || `Plan ${format(selectionRange.startDate, 'dd.MM.yy')}`;
      const newPlanId = await createPlan(defaultName, selectionRange.startDate, selectionRange.endDate);
      setPlanName('');
      setHasSelected(false);
      setSelectionRange({ startDate: new Date(), endDate: new Date(), key: 'selection' });
      setShowCreate(false);
      onOpenPlan(newPlanId);
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
    if (plan.entries) return plan.entries.length;
    if (plan.entryCount != null) return plan.entryCount;
    return '?';
  };

  const renderPlanCard = (plan: MealPlan) => (
    <div key={plan.id} className="card" style={{ padding: '20px', textAlign: 'center', cursor: 'pointer' }} onClick={() => handleOpenPlan(plan.id)}>
      <div style={{ marginBottom: '12px' }}>
        {renamingId === plan.id ? (
          <input
            className="input"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={() => handleRename(plan.id)}
            onKeyDown={e => { if (e.key === 'Enter') handleRename(plan.id); if (e.key === 'Escape') setRenamingId(null); }}
            onClick={e => e.stopPropagation()}
            autoFocus
            style={{ fontSize: '18px', fontWeight: 700, padding: '2px 6px', width: '100%', textAlign: 'center' }}
          />
        ) : (
          <h3
            style={{ margin: 0, color: 'var(--text-h)', fontSize: '18px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            {plan.name}
            {plan.isOwner !== false && (
              <span
                style={{ fontSize: '14px', opacity: 0.5, cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); setRenamingId(plan.id); setRenameValue(plan.name); }}
                title="Klicken zum Umbenennen"
              >&#9998;</span>
            )}
          </h3>
        )}
        {(plan.isOwner === false || (plan.collaborators && plan.collaborators.length > 0)) && (
          <div style={{ marginTop: '4px' }}>
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '10px',
              background: 'var(--accent-bg)',
              color: 'var(--accent)',
              fontWeight: 500,
            }}>
              {plan.isOwner === false ? 'Geteilt mit dir' : `Geteilt (${plan.collaborators!.length})`}
            </span>
          </div>
        )}
      </div>

      {plan.startDate && plan.endDate && (
        <div style={{ fontSize: '14px', color: 'var(--text)', marginBottom: '8px' }}>
          {plan.startDate.slice(8)}.{plan.startDate.slice(5,7)}.{plan.startDate.slice(2,4)} bis {plan.endDate.slice(8)}.{plan.endDate.slice(5,7)}.{plan.endDate.slice(2,4)}
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

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
        {plan.isOwner !== false && (
          <button className="btn btn-accent btn-sm" onClick={() => setShareDialogPlan(plan)}>
            Teilen
          </button>
        )}
        <button
          className="btn btn-muted btn-sm"
          onClick={() => archivePlan(plan.id, !plan.archived)}
        >
          {plan.archived ? 'Wiederherstellen' : 'Archivieren'}
        </button>
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
  );

  return (
    <div style={{ padding: '24px 32px', width: '85%', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, color: 'var(--text-h)' }}>Essenspläne</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            className="input"
            type="text"
            placeholder="Pläne suchen..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '200px' }}
          />
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Neuer Plan
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="panel" style={{ marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', textAlign: 'center' }}>Neuen Plan erstellen</h3>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
            <div className="date-range-picker-wrapper">
              <DateRange
                ranges={[selectionRange]}
                onChange={handleSelect}
                locale={de}
                months={2}
                direction="horizontal"
                showDateDisplay={false}
                rangeColors={['var(--accent)']}
                color="var(--accent)"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '200px', justifyContent: 'center', alignItems: 'center' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Name</label>
                <input
                  className="input"
                  type="text"
                  placeholder="Planname (optional)"
                  value={planName}
                  onChange={e => setPlanName(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              {hasSelected && (
                <div style={{ fontSize: '14px', color: 'var(--text)' }}>
                  {format(selectionRange.startDate, 'dd.MM.yyyy')} — {format(selectionRange.endDate, 'dd.MM.yyyy')}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleCreate}
                  disabled={!hasSelected || creating}
                >
                  {creating ? '...' : 'Erstellen'}
                </button>
                <button className="btn btn-muted" onClick={() => { setShowCreate(false); setHasSelected(false); setPlanName(''); }}>
                  Abbrechen
                </button>
              </div>
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
        <>
          {filteredActive.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {filteredActive.map(renderPlanCard)}
            </div>
          ) : activePlans.length > 0 && searchQuery.trim() ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text)' }}>
              Keine aktiven Pläne gefunden für "{searchQuery}"
            </div>
          ) : null}

          {archivedPlans.length > 0 && (
            <div style={{ marginTop: '32px' }}>
              <button
                className="btn btn-ghost"
                onClick={() => setShowArchived(!showArchived)}
                style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}
              >
                {showArchived ? '\u25BC' : '\u25B6'} Archiv ({archivedPlans.length})
              </button>
              {showArchived && (
                filteredArchived.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px', opacity: 0.75 }}>
                    {filteredArchived.map(renderPlanCard)}
                  </div>
                ) : searchQuery.trim() ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text)' }}>
                    Keine archivierten Pläne gefunden für "{searchQuery}"
                  </div>
                ) : null
              )}
            </div>
          )}
        </>
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
