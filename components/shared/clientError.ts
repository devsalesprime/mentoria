/// <reference types="vite/client" />
/**
 * Relato de erro do cliente para o servidor (POST /api/client-error -> data/client-errors.log)
 * e utilitarios da recuperacao (recarga unica por sessao, sair e entrar de novo).
 * Nunca lanca: um relato que falha nao pode derrubar a UI que ja esta caindo.
 */

export const CHAVE_RECARGA_ERRO = 'recarregado-por-erro';

const LIMITE_POR_PAGINA = 5;
let enviados = 0;
const vistos = new Set<string>();

export interface ClientErrorReport {
  /** De onde veio: ErrorBoundary, ModuleErrorBoundary:<modulo>, window.error, unhandledrejection, vite:preloadError */
  origem: string;
  message: string;
  stack?: string | null;
  componentStack?: string | null;
}

function temToken(): boolean {
  try {
    return !!(localStorage.getItem('memberToken') || localStorage.getItem('adminToken'));
  } catch {
    return false;
  }
}

export function reportClientError(r: ClientErrorReport): void {
  try {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    const message = String(r.message || 'erro sem mensagem').slice(0, 500);
    const chave = `${r.origem}|${message}`;
    if (enviados >= LIMITE_POR_PAGINA || vistos.has(chave)) return;
    vistos.add(chave);
    enviados += 1;
    const body = {
      origem: String(r.origem || 'desconhecida').slice(0, 100),
      message,
      stack: String(r.stack || '').slice(0, 4096),
      componentStack: String(r.componentStack || '').slice(0, 2048),
      url: String(window.location?.href || '').slice(0, 500),
      userAgent: String(navigator?.userAgent || '').slice(0, 300),
      hasToken: temToken(),
      timestamp: new Date().toISOString(),
    };
    const p = fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
    if (p && typeof (p as Promise<unknown>).catch === 'function') (p as Promise<unknown>).catch(() => { /* silencioso */ });
  } catch {
    /* nunca derruba a UI por causa do relato */
  }
}

/** Testes: zera o limite por pagina. */
export function _resetClientErrorReporter(): void {
  enviados = 0;
  vistos.clear();
}

/** true na primeira chamada da sessao (e marca); false nas seguintes. */
export function deveRecarregarUmaVez(chave: string = CHAVE_RECARGA_ERRO): boolean {
  try {
    if (sessionStorage.getItem(chave)) return false;
    sessionStorage.setItem(chave, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

export function recarregarPagina(): void {
  try { window.location.reload(); } catch { /* jsdom */ }
}

/** Limpa as sessoes salvas e leva para a tela de login (respeitando o base path do app). */
export function sairEEntrarDeNovo(): void {
  try {
    localStorage.removeItem('memberToken');
    localStorage.removeItem('adminToken');
  } catch { /* sem storage */ }
  try { sessionStorage.removeItem(CHAVE_RECARGA_ERRO); } catch { /* sem storage */ }
  const base = (import.meta.env?.BASE_URL as string) || '/';
  const destino = `${base.endsWith('/') ? base : `${base}/`}login`;
  try { window.location.assign(destino); } catch { /* jsdom */ }
}
