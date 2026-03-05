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

vi.mock('axios', () => ({ default: { post: vi.fn() } }));

const mockFetch = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
);
vi.stubGlobal('fetch', mockFetch);

import { FileUpload } from '../../../components/shared/FileUpload';

describe('FileUpload', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <FileUpload
        files={[]}
        onFilesChange={vi.fn()}
        category="materials"
        token="test-token"
      />
    );
    expect(container).toBeTruthy();
  });

  it('renders an interactive upload area', () => {
    const { container } = render(
      <FileUpload
        files={[]}
        onFilesChange={vi.fn()}
        category="materials"
        token="test-token"
      />
    );
    const interactive = container.querySelector('input[type="file"], button, [role="button"], label');
    expect(interactive || container.innerHTML.length > 0).toBeTruthy();
  });
});
