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

const mockFetch = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
);
vi.stubGlobal('fetch', mockFetch);

import { MethodModule } from '../../components/modules/MethodModule';

describe('MethodModule', () => {
  it('renders without crashing with empty data', () => {
    const { container } = render(
      <MethodModule
        data={{} as any}
        onUpdate={vi.fn()}
        token="test-token"
        onModuleComplete={vi.fn()}
        edges={{ pointA: '', pointB: '' }}
      />
    );
    expect(container).toBeTruthy();
  });

  it('renders with edges provided', () => {
    const { container } = render(
      <MethodModule
        data={{} as any}
        onUpdate={vi.fn()}
        token="test-token"
        onModuleComplete={vi.fn()}
        edges={{ pointA: 'Start', pointB: 'End' }}
      />
    );
    expect(container).toBeTruthy();
  });
});
