import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'essensplaner_visual_mode';

/**
 * Tablets (iPad): Ohne eigene Wahl ist der visuelle Modus Standard — dort ist die
 * Kachelansicht besser bedienbar als die enge 5-Spalten-Tabelle.
 * Untere Grenze 769px = oberhalb des Mobile-Breakpoints, obere 1400px deckt
 * auch das iPad Pro 12,9" im Querformat (1366px) ab.
 */
function prefersVisualByDefault(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(min-width: 769px) and (max-width: 1400px) and (pointer: coarse)').matches;
}

function readInitialVisualMode(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === '1') return true;
  if (stored === '0') return false;
  return prefersVisualByDefault();
}

let visualMode = readInitialVisualMode();
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return visualMode;
}

export function setVisualMode(value: boolean) {
  visualMode = value;
  localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  listeners.forEach(listener => listener());
}

export function useVisualMode(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribe, getSnapshot, () => false);
  return [value, setVisualMode];
}
