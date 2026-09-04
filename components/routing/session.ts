/**
 * Sessao do membro/admin lida do localStorage de forma SINCRONA (lazy initializer do App).
 *
 * Por que sincrono: quando a sessao era restaurada num useEffect, o primeiro render de um
 * acesso frio em /dashboard/... saia desautenticado -> AuthGuard mandava para /login -> o
 * LoginPage montava ja autenticado, chamava navigate() durante o render (descartado pelo
 * React Router 7) e devolvia null: tela em branco ate o F5.
 */

export interface MemberSession {
  name: string;
  email: string;
  description?: string;
  token: string;
}

/** Payload do JWT (base64url) sem verificar assinatura; null quando o token e ilegivel. */
export function decodeJwtPayload(token: string | null | undefined): Record<string, any> | null {
  if (!token) return null;
  try {
    const parte = (token.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/');
    if (!parte) return null;
    const payload = JSON.parse(atob(parte));
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

function tokenVigente(payload: Record<string, any> | null): boolean {
  return !!payload && typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
}

function remover(chave: string) {
  try { localStorage.removeItem(chave); } catch { /* sem storage */ }
}

export function lerSessaoMembro(): MemberSession | null {
  let token: string | null = null;
  try { token = localStorage.getItem('memberToken'); } catch { return null; }
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!tokenVigente(payload)) {
    remover('memberToken');
    return null;
  }
  return {
    name: payload!.name || 'Membro',
    email: payload!.user || '',
    description: '',
    token,
  };
}

export function lerSessaoAdmin(): string {
  let token: string | null = null;
  try { token = localStorage.getItem('adminToken'); } catch { return ''; }
  if (!token) return '';
  if (!tokenVigente(decodeJwtPayload(token))) {
    remover('adminToken');
    return '';
  }
  return token;
}
