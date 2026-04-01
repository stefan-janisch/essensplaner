import React from 'react';

export type MobileTab = 'plan' | 'recipes' | 'shopping';

interface MobileBottomTabsProps {
  activeTab: MobileTab;
  onChange: (tab: MobileTab) => void;
}

const tabs: { id: MobileTab; icon: string; label: string }[] = [
  { id: 'plan', icon: '\u{1F4C5}', label: 'Plan' },
  { id: 'shopping', icon: '\u{1F6D2}', label: 'Einkaufsliste' },
];

export const MobileBottomTabs: React.FC<MobileBottomTabsProps> = ({ activeTab, onChange }) => {
  return (
    <nav className="mobile-bottom-tabs">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={activeTab === tab.id ? 'active' : ''}
          onClick={() => onChange(tab.id)}
        >
          <span className="tab-icon">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
};
