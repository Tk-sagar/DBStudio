import { renderToString } from 'react-dom/server';
import App from './App.jsx';

export function render(initialData) {
  return renderToString(
    <App initialData={initialData} />
  );
}
