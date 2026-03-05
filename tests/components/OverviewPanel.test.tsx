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

import { OverviewPanel } from '../../components/OverviewPanel';

describe('OverviewPanel', () => {
  it('renders without crashing with basic props', () => {
    const { container } = render(
      <OverviewPanel
        diagnosticData={{} as any}
        currentModule="preModule"
        onModuleSelect={vi.fn()}
      />
    );
    expect(container).toBeTruthy();
  });

  it('accepts a module selection callback', () => {
    const onModuleSelect = vi.fn();
    const { container } = render(
      <OverviewPanel
        diagnosticData={{} as any}
        currentModule="mentor"
        onModuleSelect={onModuleSelect}
      />
    );
    expect(container).toBeTruthy();
    expect(onModuleSelect).not.toHaveBeenCalled();
  });
});
