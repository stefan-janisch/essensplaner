import { useSyncExternalStore } from 'react';
import type { OptimizeMode } from '../utils/dayScore';

const STORAGE_KEY = 'essensplaner_optimizer_mode';

const MODES: OptimizeMode[] = ['score', 'protein', 'deficit'];

function read(): OptimizeMode {
  try {
    if (typeof window === 'undefined') return 'protein';
    const stored = localStorage.getItem(STORAGE_KEY) as OptimizeMode | null;
    return stored && MODES.includes(stored) ? stored : 'protein';
  } catch {
    return 'protein';
  }
}

let mode: OptimizeMode = read();
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function setOptimizerMode(value: OptimizeMode) {
  mode = value;
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* per-browser convenience only */ }
  listeners.forEach(listener => listener());
}

/** Portion optimizer mode shared by the plan popup and the per-day popup; default "protein first". */
export function useOptimizerMode(): [OptimizeMode, (value: OptimizeMode) => void] {
  const value = useSyncExternalStore(subscribe, () => mode, () => 'protein' as OptimizeMode);
  return [value, setOptimizerMode];
}
