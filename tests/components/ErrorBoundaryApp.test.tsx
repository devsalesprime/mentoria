import React from 'react';
import { render } from '@testing-library/react';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_: any, tag: string) => React.forwardRef((props: any, ref: any) => {
      const { children, initial, animate, exit, transition, whileHover, whileTap, variants, ...rest } = props;
      return React.createElement(tag, { ...rest, ref }, children);
    }),
  }),
  AnimatePresence: ({ children }: any) => children,
  useReducedMotion: () => false,
}));

vi.mock('html2pdf.js', () => ({ default: {} }));

const mockFetch = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
);
vi.stubGlobal('fetch', mockFetch);

// Mock heavy dependencies that App imports
vi.mock('../../components/Dashboard', () => ({
  Dashboard: () => React.createElement('div', null, 'Dashboard'),
}));
vi.mock('../../components/LoginModal', () => ({
  LoginModal: () => React.createElement('div', null, 'LoginModal'),
}));
vi.mock('../../components/Header', () => ({
  Header: () => React.createElement('div', null, 'Header'),
}));
vi.mock('../../components/Hero', () => ({
  Hero: () => React.createElement('div', null, 'Hero'),
}));
vi.mock('../../components/Footer', () => ({
  Footer: () => React.createElement('div', null, 'Footer'),
}));

import App from '../../App';

describe('App with ErrorBoundary', () => {
  it('renders App without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });

  it('renders some visible content', () => {
    const { container } = render(<App />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});
