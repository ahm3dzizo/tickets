import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from '@/components/theme-provider';
import './index.css';

import { registerSW } from 'virtual:pwa-register';

// ── Capture beforeinstallprompt IMMEDIATELY before React mounts ──────────
// The browser fires this event very early (often before React finishes loading auth).
// We store it globally so PWAInstallPrompt can pick it up whenever it mounts.
(window as any).__deferredPWAPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).__deferredPWAPrompt = e;
  // Notify any mounted React component that the prompt is now available
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
