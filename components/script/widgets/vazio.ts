/**
 * Texto "vazio" da Ficha do Script: além da string em branco, marcadores que a IA ou o mentor
 * possam ter deixado no lugar de um valor ("a definir", "a confirmar", "não sei", "???").
 * Defensivo: o servidor não deveria mandar isso, mas a tela nunca mostra placeholder como valor.
 */
export const PLACEHOLDER_RE = /(\ba definir\b|\ba confirmar\b|\bn[aã]o sei\b|\?\?\?)/i;

/** true quando não há texto de verdade (vazio ou só um marcador). */
export function textoVazio(s: string | null | undefined): boolean {
  const t = (s || '').trim();
  if (!t) return true;
  return PLACEHOLDER_RE.test(t);
}

/** O texto limpo, ou string vazia quando é só marcador. */
export function textoLimpo(s: string | null | undefined): string {
  return textoVazio(s) ? '' : (s || '').trim();
}
