
import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import App from './App';
import { ErrorBoundary } from './components/shared/ErrorBoundary';

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
