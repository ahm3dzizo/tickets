import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
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

// Register PWA service worker
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
