
import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import App from './App';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { reportClientError } from './components/shared/clientError';

// Chunk antigo apos deploy (index.html em cache apontando para assets que nao existem mais):
// relata e recarrega uma vez em vez de deixar a tela em branco.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const payload = (event as Event & { payload?: { message?: string; stack?: string } }).payload;
  reportClientError({
    origem: 'vite:preloadError',
    message: (payload && payload.message) || 'falha ao carregar chunk',
    stack: payload && payload.stack,
  });
  const chave = 'recarregado-por-chunk';
  if (!sessionStorage.getItem(chave)) {
    sessionStorage.setItem(chave, String(Date.now()));
    window.location.reload();
  }
});

// Erros fora da arvore React (script, promise rejeitada): so relato, sem recarregar.
window.addEventListener('error', (event) => {
  const erro = event.error as { stack?: string } | undefined;
  reportClientError({
    origem: 'window.error',
    message: event.message || String(event.error || 'erro'),
    stack: erro && erro.stack,
  });
});
window.addEventListener('unhandledrejection', (event) => {
  const razao = event.reason as { message?: string; stack?: string } | undefined;
  reportClientError({
    origem: 'unhandledrejection',
    message: (razao && razao.message) || String(razao ?? 'promise rejeitada'),
    stack: razao && razao.stack,
  });
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
