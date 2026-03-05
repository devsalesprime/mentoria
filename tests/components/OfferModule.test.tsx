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

import { OfferModule } from '../../components/modules/OfferModule';

describe('OfferModule', () => {
  it('renders without crashing with empty data', () => {
    const { container } = render(
      <OfferModule
        data={{} as any}
        onUpdate={vi.fn()}
        token="test-token"
        onModuleComplete={vi.fn()}
      />
    );
    expect(container).toBeTruthy();
  });

  it('renders with minimal offer data', () => {
    const data = {
      goal: '',
      description: '',
      deliverables: [],
      pricing: 0,
    } as any;
    const { container } = render(
      <OfferModule
        data={data}
        onUpdate={vi.fn()}
        token="test-token"
        onModuleComplete={vi.fn()}
      />
    );
    expect(container).toBeTruthy();
  });
});
