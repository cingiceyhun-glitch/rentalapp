import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { findUrl } from './shared/parse.ts';
import './styles.css';

// Android share sheet → /share?url=…&text=… : turn it into the in-app "add" route.
if (location.pathname === '/share') {
  const p = new URLSearchParams(location.search);
  const url = p.get('url') || findUrl(p.get('text')) || findUrl(p.get('title')) || '';
  history.replaceState(null, '', `/#/add?via=share&url=${encodeURIComponent(url)}`);
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

createRoot(document.getElementById('root')!).render(<App />);
