import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from '@/components/theme-provider';
import './index.css';

import { registerSW } from 'virtual:pwa-register';

const CHUNK_RECOVERY_KEY = 'retal:chunk-recovery-attempt';

function recoverFromStaleChunk(event: Event) {
  const preloadEvent = event as Event & { payload?: { message?: string } };
  const marker = `${window.location.pathname}:${preloadEvent.payload?.message || 'preload-error'}`;

  // A single automatic retry prevents a broken deployment/cache from creating
  // an endless reload loop. A later healthy boot clears the guard.
  try {
    if (sessionStorage.getItem(CHUNK_RECOVERY_KEY) === marker) return;
    sessionStorage.setItem(CHUNK_RECOVERY_KEY, marker);
  } catch {
    // Storage may be unavailable in private browsing; continue with recovery.
  }

  void (async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter(key => key.startsWith('retal-app-assets-') || key.startsWith('workbox-precache-'))
            .map(key => caches.delete(key)),
        );
      }
    } catch (error) {
      console.warn('[app] Could not clear stale asset caches:', error);
    } finally {
      window.location.reload();
    }
  })();
}

// Vite emits this when a lazy-loaded route chunk cannot be fetched, commonly
// when an already-open tab requests assets from the previous deployment.
window.addEventListener('vite:preloadError', event => {
  event.preventDefault();
  recoverFromStaleChunk(event);
});

// If the retry booted successfully, allow a future deployment to recover too.
window.setTimeout(() => {
  try {
    sessionStorage.removeItem(CHUNK_RECOVERY_KEY);
  } catch {
    // Ignore unavailable session storage.
  }
}, 15000);

function applyRouteManifest() {
  const isTechRoute = window.location.pathname === '/tech' || window.location.pathname.startsWith('/tech/');
  const manifestHref = isTechRoute ? '/tech-manifest.webmanifest' : '/manifest.webmanifest';
  let manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!manifest) {
    manifest = document.createElement('link');
    manifest.rel = 'manifest';
    document.head.appendChild(manifest);
  }
  if (manifest.getAttribute('href') !== manifestHref) manifest.setAttribute('href', manifestHref);

  const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (theme && isTechRoute) theme.setAttribute('content', '#09192d');
}

// Select the technician manifest before Chrome evaluates installability and
// before beforeinstallprompt can fire. This makes an install started from /tech
// reopen the standalone technician app at /tech rather than the admin dashboard.
applyRouteManifest();
window.addEventListener('popstate', applyRouteManifest);

// ── Capture beforeinstallprompt IMMEDIATELY before React mounts ──────────
(window as any).__deferredPWAPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).__deferredPWAPrompt = e;
  window.dispatchEvent(new Event('pwa-prompt-captured'));
});

// Do not let service-worker installation/precache compete with the initial app
// boot. Register after the first page load and when the main thread is idle.
// Auto-update/offline behavior stays enabled; only startup contention is removed.
function registerPwaWhenIdle() {
  const register = () => registerSW({ immediate: true });

  const requestIdle = (window as any).requestIdleCallback as
    | ((callback: () => void, options?: { timeout: number }) => number)
    | undefined;

  if (typeof requestIdle === 'function') {
    requestIdle(register, { timeout: 4000 });
  } else {
    globalThis.setTimeout(register, 1500);
  }
}

if (document.readyState === 'complete') {
  registerPwaWhenIdle();
} else {
  window.addEventListener('load', registerPwaWhenIdle, { once: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
