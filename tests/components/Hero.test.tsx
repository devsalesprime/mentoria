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

import { Hero } from '../../components/Hero';

describe('Hero', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <Hero onStartDiagnosis={vi.fn()} />
    );
    expect(container).toBeTruthy();
  });

  it('accepts onStartDiagnosis callback', () => {
    const onStartDiagnosis = vi.fn();
    const { container } = render(
      <Hero onStartDiagnosis={onStartDiagnosis} />
    );
    expect(container).toBeTruthy();
    expect(onStartDiagnosis).not.toHaveBeenCalled();
  });
});
