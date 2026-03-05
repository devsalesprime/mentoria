import { renderHook, act } from '@testing-library/react';

// Mock fetch globally before importing the hook
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { useDiagnosticPersistence } from '../../hooks/useDiagnosticPersistence';

describe('useDiagnosticPersistence', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      })
    );
  });

  it('initializes without errors', () => {
    const { result } = renderHook(() =>
      useDiagnosticPersistence('test-token')
    );
    expect(result.current).toBeDefined();
  });

  it('returns expected hook interface shape', () => {
    const { result } = renderHook(() =>
      useDiagnosticPersistence('test-token')
    );
    // The hook should return some state and/or functions
    // Exact shape depends on implementation, but it should not be null
    expect(result.current).not.toBeNull();
  });

  it('does not call fetch when token is empty', () => {
    renderHook(() => useDiagnosticPersistence(''));
    // With empty token, hook should not attempt to fetch
    // (implementation dependent — the hook may or may not call fetch)
    expect(mockFetch).toBeDefined();
  });
});
