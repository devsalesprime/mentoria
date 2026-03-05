import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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

// Mock heavy child modules to keep Dashboard test as a smoke test
vi.mock('../../components/modules/PreModule', () => ({
  PreModule: () => React.createElement('div', null, 'PreModule'),
}));
vi.mock('../../components/modules/MentorModule', () => ({
  MentorModule: () => React.createElement('div', null, 'MentorModule'),
}));
vi.mock('../../components/modules/MenteeModule', () => ({
  MenteeModule: () => React.createElement('div', null, 'MenteeModule'),
}));
vi.mock('../../components/modules/MethodModule', () => ({
  MethodModule: () => React.createElement('div', null, 'MethodModule'),
}));
vi.mock('../../components/modules/OfferModule', () => ({
  OfferModule: () => React.createElement('div', null, 'OfferModule'),
}));
vi.mock('../../components/OverviewPanel', () => ({
  OverviewPanel: () => React.createElement('div', null, 'OverviewPanel'),
}));

const mockFetch = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
);
vi.stubGlobal('fetch', mockFetch);

import { Dashboard } from '../../components/Dashboard';

describe('Dashboard', () => {
  it('renders without crashing with required props', () => {
    const { container } = render(
      <MemoryRouter>
        <Dashboard
          userEmail="test@example.com"
          userName="Test User"
          userDescription=""
          onUpdateProfile={vi.fn()}
          onLogout={vi.fn()}
          initialModule="preModule"
          token="test-token"
        />
      </MemoryRouter>
    );
    expect(container).toBeTruthy();
  });

  it('renders with all string props provided', () => {
    const { container } = render(
      <MemoryRouter>
        <Dashboard
          userEmail="user@test.com"
          userName="Full Name"
          userDescription="A description"
          onUpdateProfile={vi.fn()}
          onLogout={vi.fn()}
          initialModule="mentor"
          token="test-token-123"
        />
      </MemoryRouter>
    );
    expect(container).toBeTruthy();
  });
});
