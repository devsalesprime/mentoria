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

import { TagInput } from '../../../components/shared/TagInput';

describe('TagInput', () => {
  it('renders without crashing with empty tags', () => {
    const { container } = render(
      <TagInput
        value={[]}
        onChange={vi.fn()}
      />
    );
    expect(container).toBeTruthy();
  });

  it('renders with pre-existing tags', () => {
    const { container } = render(
      <TagInput
        value={['React', 'TypeScript', 'Vitest']}
        onChange={vi.fn()}
      />
    );
    expect(container).toBeTruthy();
    expect(container.textContent).toContain('React');
  });

  it('accepts onChange callback', () => {
    const onChange = vi.fn();
    const { container } = render(
      <TagInput
        value={['tag1']}
        onChange={onChange}
      />
    );
    expect(container).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});
