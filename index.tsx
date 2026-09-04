
import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import App from './App';
import { ErrorBoundary } from './components/shared/ErrorBoundary';

// Chunk antigo apos deploy (index.html em cache apontando para assets que nao existem mais):
// recarrega uma vez em vez de deixar a tela em branco.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const chave = 'recarregado-por-chunk';
  if (!sessionStorage.getItem(chave)) {
    sessionStorage.setItem(chave, String(Date.now()));
    window.location.reload();
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
