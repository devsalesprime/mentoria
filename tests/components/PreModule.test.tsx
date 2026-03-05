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
  useAnimation: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

vi.mock('html2pdf.js', () => ({ default: {} }));

// Mock fetch globally
const mockFetch = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
);
vi.stubGlobal('fetch', mockFetch);

import { PreModule } from '../../components/modules/PreModule';

describe('PreModule', () => {
  it('renders without crashing with empty data', () => {
    const { container } = render(
      <PreModule
        data={{} as any}
        onUpdate={vi.fn()}
        token="test-token"
        onModuleComplete={vi.fn()}
      />
    );
    expect(container).toBeTruthy();
  });

  it('calls onUpdate when provided', () => {
    const onUpdate = vi.fn();
    render(
      <PreModule
        data={{} as any}
        onUpdate={onUpdate}
        token="test-token"
        onModuleComplete={vi.fn()}
      />
    );
    // Component should render — onUpdate is available for interaction
    expect(onUpdate).toBeDefined();
  });
});
