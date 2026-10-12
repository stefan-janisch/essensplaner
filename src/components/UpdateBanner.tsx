import { useEffect, useState } from 'react';

const CHECK_MIN_INTERVAL_MS = 60 * 1000;
const CHECK_PERIOD_MS = 5 * 60 * 1000;
const BUNDLE_SRC = /src="(\/assets\/index-[^"]+\.js)"/;

/**
 * A tab (especially the home-screen app on phones) can keep an old build loaded for days while the
 * server already ships a new one. When the app comes back to the foreground (and every few minutes)
 * compare the loaded bundle with the one the current index.html references; if they differ,
 * offer a reload. Reloading is left to the user so nothing typed gets lost.
 */
function useNewVersionAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return; // Vite dev server hot-reloads anyway
    const loaded = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.getAttribute('src');
    if (!loaded) return;

    let lastCheck = 0;
    const check = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < CHECK_MIN_INTERVAL_MS) return;
      lastCheck = Date.now();
      try {
        const html = await (await fetch('/index.html', { cache: 'no-store' })).text();
        const current = html.match(BUNDLE_SRC)?.[1];
        if (current && current !== loaded) setAvailable(true);
      } catch {
        // offline — try again next time
      }
    };

    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    const timer = window.setInterval(check, CHECK_PERIOD_MS);
    check();
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      window.clearInterval(timer);
    };
  }, []);

  return available;
}

export function UpdateBanner() {
  const available = useNewVersionAvailable();
  if (!available) return null;
  return (
    <button type="button" className="update-banner" onClick={() => window.location.reload()}>
      Neue Version verfügbar – <strong>tippen zum Neuladen</strong>
    </button>
  );
}
