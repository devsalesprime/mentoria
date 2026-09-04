import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ErrorBoundary } from '../../components/shared/ErrorBoundary';
import { CHAVE_RECARGA_ERRO, _resetClientErrorReporter } from '../../components/shared/clientError';

// A component that throws on demand
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>Child content</div>;
}

const mockFetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) }));
vi.stubGlobal('fetch', mockFetch);

describe('ErrorBoundary', () => {
  // Suppress console.error for expected errors
  const originalError = console.error;
  beforeAll(() => {
    console.error = vi.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    mockFetch.mockClear();
    _resetClientErrorReporter();
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary reload={vi.fn()}>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('renders the visible navy card when child throws', () => {
    render(
      <ErrorBoundary reload={vi.fn()}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.queryByText('Child content')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Algo travou ao abrir a página')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
  });

  it('shows "Recarregar" and "Sair e entrar de novo" buttons in error state', () => {
    const reload = vi.fn();
    render(
      <ErrorBoundary reload={reload}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    const recarregar = screen.getByRole('button', { name: 'Recarregar' });
    expect(screen.getByRole('button', { name: 'Sair e entrar de novo' })).toBeInTheDocument();
    reload.mockClear(); // o auto-reload ja consumiu a primeira chamada
    fireEvent.click(recarregar);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads automatically once per session (sessionStorage guard) and not on the second error', () => {
    const reload = vi.fn();
    render(
      <ErrorBoundary reload={reload}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CHAVE_RECARGA_ERRO)).toBeTruthy();

    const reload2 = vi.fn();
    render(
      <ErrorBoundary reload={reload2}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(reload2).not.toHaveBeenCalled();
  });

  it('POSTs the error to /api/client-error with message, url, userAgent, token presence and timestamp', async () => {
    localStorage.setItem('memberToken', 'abc');
    render(
      <ErrorBoundary reload={vi.fn()}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url, init] = (mockFetch.mock.calls[0] as unknown as [string, RequestInit]);
    expect(url).toBe('/api/client-error');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ origem: 'ErrorBoundary', message: 'Test error', hasToken: true });
    expect(typeof body.url).toBe('string');
    expect(typeof body.userAgent).toBe('string');
    expect(typeof body.timestamp).toBe('string');
    expect(body.stack.length).toBeLessThanOrEqual(4096);
  });

  it('"Sair e entrar de novo" clears the saved sessions', () => {
    localStorage.setItem('memberToken', 'abc');
    localStorage.setItem('adminToken', 'def');
    render(
      <ErrorBoundary reload={vi.fn()}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sair e entrar de novo' }));
    expect(localStorage.getItem('memberToken')).toBeNull();
    expect(localStorage.getItem('adminToken')).toBeNull();
  });

  it('uses the custom fallback when provided', () => {
    render(
      <ErrorBoundary reload={vi.fn()} fallback={<div>Fallback custom</div>}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Fallback custom')).toBeInTheDocument();
  });
});
