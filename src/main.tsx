import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { findUrl } from './shared/parse.ts';
import './styles.css';

// Android share sheet → /share?url=…&text=… : turn it into the in-app "add" route.
if (location.pathname === '/share') {
  const p = new URLSearchParams(location.search);
  const url = p.get('url') || findUrl(p.get('text')) || findUrl(p.get('title')) || '';
  // Keep the accompanying text: it often has the title and price when the site blocks us.
  const text = [p.get('title'), p.get('text')].filter(Boolean).join(' ');
  history.replaceState(null, '', `/#/add?via=share&url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

createRoot(document.getElementById('root')!).render(<App />);
