import React, { useState } from 'react';
import { useMealPlan } from '../context/MealPlanContext';
import { generateShoppingList } from '../utils/shoppingListAggregator';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const ShoppingList: React.FC = () => {
  const { allMealsForActivePlan, activePlan, renameIngredientInAllMeals } = useMealPlan();
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const entries = activePlan?.entries || [];
  const shoppingList = generateShoppingList(entries, allMealsForActivePlan);

  const handlePrint = () => {
    const printWindow = window.open('', '', 'width=800,height=600');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Einkaufsliste</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; }
            ul { list-style-type: none; padding: 0; }
            li { margin: 8px 0; padding: 8px; border-bottom: 1px solid #eee; }
            .amounts { color: #666; margin-left: 10px; }
          </style>
        </head>
        <body>
          <h1>Einkaufsliste</h1>
          <ul>
            ${shoppingList
              .map(
                item =>
                  `<li>
                    <strong>${item.name}</strong>
                    <span class="amounts">
                      ${item.amounts.map(a => `${a.amount} ${a.unit}`).join(', ')}
                    </span>
                  </li>`
              )
              .join('')}
          </ul>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  const handleCopyToClipboard = () => {
    const text = shoppingList
      .map(item => {
        const amounts = item.amounts.map(a => `${a.amount} ${a.unit}`).join(', ');
        return `${item.name}: ${amounts}`;
      })
      .join('\n');

    navigator.clipboard.writeText(text).then(() => {
      alert('Einkaufsliste in Zwischenablage kopiert!');
    });
  };

  const handleExportToBring = () => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${API_URL}/api/bring-export`;
    form.target = '_blank';

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'shoppingList';
    input.value = JSON.stringify(shoppingList);

    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  };

  const handleStartEdit = (index: number, currentName: string) => {
    setEditingIndex(index);
    setEditingName(currentName);
  };

  const handleSaveEdit = (oldName: string) => {
    if (editingName.trim() && editingName !== oldName) {
      renameIngredientInAllMeals(oldName, editingName.trim());
    }
    setEditingIndex(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingName('');
  };

  if (shoppingList.length === 0) {
    return null;
  }

  return (
    <div className="panel" style={{ marginTop: '20px', backgroundColor: 'var(--color-primary-light)' }}>
      {!isExpanded ? (
        <button
          className="btn btn-primary btn-lg"
          onClick={() => setIsExpanded(true)}
          style={{ width: '100%' }}
        >
          🛒 Einkaufsliste anzeigen ({shoppingList.length} Zutaten)
        </button>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0, color: 'var(--text-h)' }}>Einkaufsliste</h3>
            <button className="btn-ghost" onClick={() => setIsExpanded(false)} style={{ fontSize: '20px' }}>
              ✕
            </button>
          </div>

          <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn btn-accent" onClick={handlePrint}>
              🖨️ Drucken
            </button>
            <button className="btn btn-accent" onClick={handleCopyToClipboard}>
              📋 Kopieren
            </button>
            <button className="btn btn-warning" onClick={handleExportToBring}>
              🛍️ Export to Bring!
            </button>
          </div>

          <div className="card" style={{ padding: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
            <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
              {shoppingList.map((item, index) => (
                <li
                  key={index}
                  style={{
                    padding: '10px',
                    borderBottom: index < shoppingList.length - 1 ? '1px solid var(--border-light)' : 'none',
                  }}
                >
                  {editingIndex === index ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                      <input
                        className="input"
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(item.name);
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        autoFocus
                        style={{ flex: 1, fontWeight: 'bold' }}
                      />
                      <button className="btn btn-primary btn-sm" onClick={() => handleSaveEdit(item.name)}>
                        ✓
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={handleCancelEdit}>
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      <div style={{ fontWeight: 'bold', flex: 1, color: 'var(--text-h)' }}>{item.name}</div>
                      <button
                        className="btn-ghost"
                        onClick={() => handleStartEdit(index, item.name)}
                        style={{ fontSize: '14px', color: 'var(--accent)' }}
                        title="Zutat umbenennen"
                      >
                        ✏️
                      </button>
                    </div>
                  )}
                  <div style={{ fontSize: '14px', color: 'var(--text)' }}>
                    {item.amounts.map((a, i) => (
                      <span key={i}>
                        {a.amount} {a.unit}
                        {i < item.amounts.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
