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

import { Header } from '../../components/Header';

describe('Header', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <Header
        onOpenLogin={vi.fn()}
      />
    );
    expect(container).toBeTruthy();
  });

  it('accepts callback props', () => {
    const onOpenLogin = vi.fn();
    const { container } = render(
      <Header
        onOpenLogin={onOpenLogin}
      />
    );
    expect(container).toBeTruthy();
    expect(onOpenLogin).not.toHaveBeenCalled();
  });
});
