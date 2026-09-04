import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModuleErrorBoundary } from '../../components/shared/ModuleErrorBoundary';
import { CHAVE_RECARGA_ERRO, _resetClientErrorReporter } from '../../components/shared/clientError';

function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Module crash');
  }
  return <div>Module content</div>;
}

const mockFetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) }));
vi.stubGlobal('fetch', mockFetch);

describe('ModuleErrorBoundary', () => {
  const originalError = console.error;
  beforeAll(() => {
    console.error = vi.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });
  beforeEach(() => {
    sessionStorage.clear();
    mockFetch.mockClear();
    _resetClientErrorReporter();
  });

  it('renders children when no error occurs', () => {
    render(
      <ModuleErrorBoundary moduleName="TestModule" reload={vi.fn()}>
        <ThrowError shouldThrow={false} />
      </ModuleErrorBoundary>
    );
    expect(screen.getByText('Module content')).toBeInTheDocument();
  });

  it('shows the module name in the visible card when child throws', () => {
    render(
      <ModuleErrorBoundary moduleName="TestModule" reload={vi.fn()}>
        <ThrowError shouldThrow={true} />
      </ModuleErrorBoundary>
    );
    expect(screen.queryByText('Module content')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Algo travou ao abrir a página')).toBeInTheDocument();
    expect(screen.getByText(/TestModule/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair e entrar de novo' })).toBeInTheDocument();
  });

  it('provides a retry mechanism in error state', () => {
    let shouldThrow = true;
    const Flaky = () => {
      if (shouldThrow) throw new Error('Module crash');
      return <div>Module content</div>;
    };
    const onRetry = vi.fn();
    render(
      <ModuleErrorBoundary moduleName="TestModule" onRetry={onRetry} reload={vi.fn()}>
        <Flaky />
      </ModuleErrorBoundary>
    );
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Module content')).toBeInTheDocument();
  });

  it('reloads once per session and reports the error with the module name', async () => {
    const reload = vi.fn();
    render(
      <ModuleErrorBoundary moduleName="Ficha do Script" reload={reload}>
        <ThrowError shouldThrow={true} />
      </ModuleErrorBoundary>
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CHAVE_RECARGA_ERRO)).toBeTruthy();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url, init] = (mockFetch.mock.calls[0] as unknown as [string, RequestInit]);
    expect(url).toBe('/api/client-error');
    expect(JSON.parse(String(init.body))).toMatchObject({ origem: 'ModuleErrorBoundary:Ficha do Script', message: 'Module crash' });

    const reload2 = vi.fn();
    render(
      <ModuleErrorBoundary moduleName="Outro" reload={reload2}>
        <ThrowError shouldThrow={true} />
      </ModuleErrorBoundary>
    );
    expect(reload2).not.toHaveBeenCalled();
  });
});
