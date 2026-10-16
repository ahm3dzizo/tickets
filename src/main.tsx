import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from '@/components/theme-provider';
import './index.css';

import { registerSW } from 'virtual:pwa-register';

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
  const register = () => registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      // Chrome can keep an existing Tickets tab open for hours (especially on
      // Android) without navigating. The previous bundle then keeps running
      // even after a successful production deployment. Check for a newer SW
      // whenever the tab becomes active, instead of waiting for navigation.
      // Vite PWA autoUpdate handles activation and reload when one is found.
      let lastCheckAt = 0;
      const checkForUpdate = () => {
        if (!navigator.onLine || document.visibilityState === 'hidden') return;
        const now = Date.now();
        if (now - lastCheckAt < 60_000) return;
        lastCheckAt = now;
        void registration.update().catch(() => {
          // An offline or transient network error should not interrupt tickets.
        });
      };

      window.addEventListener('focus', checkForUpdate);
      window.addEventListener('pageshow', checkForUpdate);
      document.addEventListener('visibilitychange', checkForUpdate);
      window.addEventListener('online', checkForUpdate);
      window.setInterval(checkForUpdate, 10 * 60_000);
      checkForUpdate();
    },
  });

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
