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

import { MenteeModule } from '../../components/modules/MenteeModule';

describe('MenteeModule', () => {
  it('renders without crashing with empty data', () => {
    const { container } = render(
      <MenteeModule
        data={{} as any}
        onUpdate={vi.fn()}
        token="test-token"
        onModuleComplete={vi.fn()}
      />
    );
    expect(container).toBeTruthy();
  });

  it('renders with minimal valid data shape', () => {
    const data = {
      hasClients: false,
      beforeInternal: '',
      beforeExternal: '',
      decisionFears: '',
      decisionTrigger: '',
      afterExternal: '',
      afterInternal: '',
      idealClientGeneral: '',
    } as any;
    const { container } = render(
      <MenteeModule
        data={data}
        onUpdate={vi.fn()}
        token="test-token"
        onModuleComplete={vi.fn()}
      />
    );
    expect(container).toBeTruthy();
  });
});
