import React from 'react';
import { render, screen } from '@testing-library/react';

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

import { AccordionSection } from '../../../components/shared/AccordionSection';

describe('AccordionSection', () => {
  const defaultProps = {
    title: 'Test Section',
    icon: '📋',
    isComplete: false,
    isOpen: true,
    onToggle: vi.fn(),
  };

  it('renders without crashing', () => {
    const { container } = render(
      <AccordionSection {...defaultProps}>
        <div>Content</div>
      </AccordionSection>
    );
    expect(container).toBeTruthy();
  });

  it('renders the title text', () => {
    render(
      <AccordionSection {...defaultProps} title="My Accordion">
        <div>Inner content</div>
      </AccordionSection>
    );
    expect(screen.getByText('My Accordion')).toBeInTheDocument();
  });

  it('renders children content when open', () => {
    render(
      <AccordionSection {...defaultProps}>
        <span>Visible child</span>
      </AccordionSection>
    );
    expect(document.body.textContent).toContain('Test Section');
  });
});
