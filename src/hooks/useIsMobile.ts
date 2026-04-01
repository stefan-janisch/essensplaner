import { useSyncExternalStore } from 'react';

function subscribe(breakpoint: number, callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

export function useIsMobile(breakpoint = 768): boolean {
  return useSyncExternalStore(
    (callback) => subscribe(breakpoint, callback),
    () => window.matchMedia(`(max-width: ${breakpoint}px)`).matches,
    () => false,
  );
}
