/**
 * Leitura de números escritos do jeito que o mentor fala: "R$ 14 mil/mês", "3,6 milhões", "140k",
 * "10.000", "5.000,00", "12 meses". Puro (sem React), só para medir barras e réguas: o `valor`
 * salvo continua sendo o texto que o mentor escreveu.
 */

// Fronteiras por letra (unicode): "mês" não pode virar o "M" de milhão, e "mil/mês" é mil.
const MULT: { re: RegExp; m: number }[] = [
  { re: /(?:^|[^\p{L}])(?:milh(?:ão|ao|ões|oes)|mi)(?![\p{L}])/iu, m: 1_000_000 },
  { re: /(?:^|[^\p{L}])M(?![\p{L}])/u, m: 1_000_000 },
  { re: /(?:^|[^\p{L}])(?:mil|k)(?![\p{L}])/iu, m: 1_000 },
];

/** "R$ 3,6 milhões" -> 3600000 · "14 mil/mês" -> 14000 · "10.000" -> 10000 · "5.000,00" -> 5000 · sem número -> null. */
export function moedaNumero(s: string | null | undefined): number | null {
  const t = (s || '').replace(/R\$/gi, ' ').trim();
  if (!t) return null;
  const m = t.match(/(\d[\d.\s]*(?:,\d+)?|\d+(?:\.\d+)?)/);
  if (!m) return null;
  let bruto = m[1].replace(/\s/g, '');
  const depois = t.slice((m.index ?? 0) + m[1].length);
  let n: number;
  if (/,\d{1,2}$/.test(bruto) && bruto.includes('.')) {
    n = parseFloat(bruto.replace(/\./g, '').replace(',', '.'));
  } else if (bruto.includes(',')) {
    n = parseFloat(bruto.replace(/\./g, '').replace(',', '.'));
  } else if (/^\d{1,3}(\.\d{3})+$/.test(bruto)) {
    n = parseFloat(bruto.replace(/\./g, ''));
  } else {
    n = parseFloat(bruto);
  }
  if (!Number.isFinite(n)) return null;
  for (const { re, m: mult } of MULT) {
    if (re.test(depois.slice(0, 12))) { n *= mult; break; }
  }
  return n;
}

/** Só o inteiro de um texto ("3 conversas" -> 3); null sem dígito. */
export function inteiro(s: string | null | undefined): number | null {
  const m = (s || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/** Prazo em meses ("90 dias" -> 3, "6 meses" -> 6, "1 ano" -> 12, "2 anos" -> 24, "8 semanas" -> 2); null quando não lê. */
export function prazoEmMeses(s: string | null | undefined): number | null {
  const t = (s || '').toLowerCase();
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(dias?|semanas?|mes(?:es)?|m[êe]s|anos?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  const u = m[2];
  if (u.startsWith('dia')) return Math.max(1, Math.round(n / 30));
  if (u.startsWith('semana')) return Math.max(1, Math.round(n / 4.3));
  if (u.startsWith('ano')) return Math.round(n * 12);
  return Math.round(n);
}

/** Compacta para a etiqueta: 14000 -> "14 mil" · 3600000 -> "3,6 mi" · 950 -> "950". */
export function compacto(n: number): string {
  if (n >= 1_000_000) return `${trocaPonto(n / 1_000_000)} mi`;
  if (n >= 1_000) return `${trocaPonto(n / 1_000)} mil`;
  return trocaPonto(n);
}

function trocaPonto(n: number): string {
  const r = Math.round(n * 10) / 10;
  return String(Number.isInteger(r) ? r : r.toFixed(1)).replace('.', ',');
}

/** Periodicidade dita no texto: "/mês", "mensal", "por mês", "ao mês" -> 'mes' · "/ano", "anual", "por ano" -> 'ano' · nada -> null. */
export function periodicidade(s: string | null | undefined): 'mes' | 'ano' | null {
  const t = (s || '').toLowerCase();
  if (/\/\s*m[êe]s\b|\bmensal|\bmensais\b|\bpor m[êe]s\b|\bao m[êe]s\b|\bo m[êe]s\b|\bcada m[êe]s\b/.test(t)) return 'mes';
  if (/\/\s*ano\b|\banual\b|\banuais\b|\bpor ano\b|\bao ano\b|\bno ano\b|\bcada ano\b/.test(t)) return 'ano';
  return null;
}

/**
 * Total do primeiro ano de um degrau da escada de preço: valor mensal × 12; valor anual = ele mesmo;
 * sem periodicidade dita no valor, no nome ou no "o que muda" devolve null (a ficha não inventa a conta).
 * O multiplicador ("mil", "milhões") pode estar no nome quando o parse separou só o número ("14" + "mil/mês").
 */
export function totalAnual(valor: string | null | undefined, ...textos: (string | null | undefined)[]): number | null {
  const v = (valor || '').trim();
  if (!v) return null;
  const junto = [v, ...textos].filter(Boolean).join(' ');
  const n = moedaNumero(junto);
  if (n == null) return null;
  const p = periodicidade(junto);
  if (p === 'mes') return n * 12;
  if (p === 'ano') return n;
  return null;
}

/** "R$ 168 mil" a partir de um número; usa a forma compacta. */
export function moedaCompacta(n: number): string {
  return `R$ ${compacto(n)}`;
}
