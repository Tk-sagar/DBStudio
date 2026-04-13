import { hydrateRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Read the server-injected initial state — no bootstrap API calls needed
const ssrDataEl   = document.getElementById('__ssr_data__');
const initialData = ssrDataEl ? JSON.parse(ssrDataEl.textContent) : null;

hydrateRoot(
  document.getElementById('root'),
  <App initialData={initialData} />
);
