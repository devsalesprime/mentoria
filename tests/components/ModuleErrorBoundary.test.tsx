import React from 'react';
import { render, screen } from '@testing-library/react';
import { ModuleErrorBoundary } from '../../components/shared/ModuleErrorBoundary';

function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Module crash');
  }
  return <div>Module content</div>;
}

describe('ModuleErrorBoundary', () => {
  const originalError = console.error;
  beforeAll(() => {
    console.error = vi.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });

  it('renders children when no error occurs', () => {
    render(
      <ModuleErrorBoundary moduleName="TestModule">
        <ThrowError shouldThrow={false} />
      </ModuleErrorBoundary>
    );
    expect(screen.getByText('Module content')).toBeInTheDocument();
  });

  it('shows module name in error fallback when child throws', () => {
    render(
      <ModuleErrorBoundary moduleName="TestModule">
        <ThrowError shouldThrow={true} />
      </ModuleErrorBoundary>
    );
    expect(screen.queryByText('Module content')).not.toBeInTheDocument();
    // Should show some error UI — at minimum a button or error message
    const errorUI = screen.queryByRole('button') ||
      screen.queryByText(/erro|error|testmodule/i);
    expect(errorUI).toBeTruthy();
  });

  it('provides a retry mechanism in error state', () => {
    render(
      <ModuleErrorBoundary moduleName="TestModule">
        <ThrowError shouldThrow={true} />
      </ModuleErrorBoundary>
    );
    const retryButton = screen.queryByRole('button') ||
      screen.queryByText(/tentar|retry|recarregar|reload/i);
    expect(retryButton).toBeTruthy();
  });
});
