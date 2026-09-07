/**
 * Tempo real de cada etapa e posicao na fila (onda I, SPEC-experiencia-pre-script-v1 §3, itens I3 e I4).
 *
 * Regra do tempo (I3): um numero so por tipo de trabalho, vindo do historico de `cohort_jobs`.
 *   - so entram linhas com status 'done' e com `started_at` E `finished_at` gravados
 *     (o requeue zera `started_at`, entao meia-vida de job devolvido nao conta);
 *   - MEDIANA dos ultimos 20 por tipo, do mais recente para o mais antigo por `finished_at`
 *     (a media enviesa: um job preso de madrugada empurra tudo);
 *   - minutos arredondados para CIMA, com piso de 5 min (nunca prometer 1 min);
 *   - sem historico, `mediana_min` vem null e a copy da tela sai sem numero nenhum.
 *
 * Regra da fila (I4, decisao D8): quantos trabalhos do mesmo tipo entraram ANTES do da pessoa e ainda
 * estao em 'queued' ou 'running', com o nome dos clubes na ordem de entrada.
 *
 * So leitura: nada aqui grava.
 */

/** Tipos que a tela do membro pergunta. `script` cobre a familia que escreve a proxima versao. */
const TEMPO_TIPOS = ['prefill', 'script', 'refinar', 'slides'];
/** Quantos jobs concluidos entram no calculo, por tipo. */
const JANELA = 20;
/** Piso em minutos: abaixo disso a promessa vira mentira na primeira vez que atrasa. */
const PISO_MIN = 5;
/** `script` e `revisar` escrevem a mesma coisa (a proxima versao do script), entao contam juntos. */
const FAMILIA = { script: ['script', 'revisar'] };

/** Tipos de job que respondem por um tipo pedido pela tela. */
function tiposDe(tipo) {
  return FAMILIA[tipo] || [tipo];
}

/** Timestamp do SQLite ('YYYY-MM-DD HH:MM:SS', UTC) ou ISO -> ms; NaN quando nao da para ler. */
function tsMs(s) {
  if (!s) return NaN;
  const str = String(s);
  return Date.parse(/T|Z|[+-]\d\d:?\d\d$/.test(str) ? str : `${str.replace(' ', 'T')}Z`);
}

/** Mediana de uma lista de numeros (par = media dos dois do meio). null na lista vazia. */
function mediana(valores) {
  const ns = valores.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (!ns.length) return null;
  const meio = Math.floor(ns.length / 2);
  return ns.length % 2 ? ns[meio] : (ns[meio - 1] + ns[meio]) / 2;
}

/**
 * Duracoes em ms -> minutos da copy: mediana, arredondada para cima, com piso.
 * @returns {number|null} null quando nao ha duracao nenhuma.
 */
function medianaMinutos(duracoesMs) {
  const m = mediana((duracoesMs || []).filter((d) => Number.isFinite(d) && d >= 0));
  if (m == null) return null;
  return Math.max(PISO_MIN, Math.ceil(m / 60000));
}

/**
 * { [tipo]: { mediana_min, n } } para os tipos pedidos.
 * `n` e quantos jobs concluidos entraram no calculo (0 = sem historico, mediana_min null).
 */
async function temposPorTipo({ dbAll }, tipos = TEMPO_TIPOS) {
  const out = {};
  for (const tipo of tipos) {
    const alvos = tiposDe(tipo);
    let rows = [];
    try {
      rows = await dbAll(
        `SELECT started_at, finished_at FROM cohort_jobs
          WHERE tipo IN (${alvos.map(() => '?').join(', ')})
            AND status = 'done'
            AND started_at IS NOT NULL AND started_at <> ''
            AND finished_at IS NOT NULL AND finished_at <> ''
          ORDER BY finished_at DESC, rowid DESC
          LIMIT ?`,
        [...alvos, JANELA]
      );
    } catch {
      rows = []; // banco sem a tabela ainda: a tela cai na copy sem numero
    }
    const duracoes = rows
      .map((r) => tsMs(r.finished_at) - tsMs(r.started_at))
      .filter((d) => Number.isFinite(d) && d >= 0);
    out[tipo] = { mediana_min: medianaMinutos(duracoes), n: duracoes.length };
  }
  return out;
}

/**
 * Fila da pessoa para um tipo: quantos trabalhos entraram antes do dela e ainda estao em andamento,
 * com o nome dos clubes na ordem (decisao D8). Sem job proprio devolve a fila vazia.
 *
 * @param {{tipo: string, club_slug: string, email: string}} alvo
 * @returns {{na_frente: number, clubes: string[], status: string|null, tem_job: boolean}}
 */
async function filaDoMembro({ dbAll, dbGet }, { tipo, club_slug, email }) {
  const alvos = tiposDe(tipo);
  const marcadores = alvos.map(() => '?').join(', ');
  const doProprio = tipo === 'prefill'
    ? { where: 'club_slug = ? AND email = ?', params: [club_slug, String(email || '').trim().toLowerCase()] }
    : { where: 'club_slug = ?', params: [club_slug] };
  let meu = null;
  try {
    meu = await dbGet(
      `SELECT id, status, created_at, rowid AS rid FROM cohort_jobs
        WHERE tipo IN (${marcadores}) AND ${doProprio.where} AND status IN ('queued', 'running')
        ORDER BY created_at ASC, rowid ASC LIMIT 1`,
      [...alvos, ...doProprio.params]
    );
  } catch {
    meu = null;
  }
  if (!meu) return { na_frente: 0, clubes: [], status: null, tem_job: false };

  let antes = [];
  try {
    antes = await dbAll(
      `SELECT j.club_slug AS slug, c.nome AS nome FROM cohort_jobs j
         LEFT JOIN cohort_clubs c ON c.slug = j.club_slug
        WHERE j.tipo IN (${marcadores}) AND j.status IN ('queued', 'running') AND j.id <> ?
          AND (j.created_at < ? OR (j.created_at = ? AND j.rowid < ?))
        ORDER BY j.created_at ASC, j.rowid ASC`,
      [...alvos, meu.id, meu.created_at, meu.created_at, meu.rid]
    );
  } catch {
    antes = [];
  }
  const clubes = [];
  for (const r of antes) {
    const nome = String(r.nome || '').trim();
    if (nome && !clubes.includes(nome)) clubes.push(nome);
  }
  return { na_frente: antes.length, clubes, status: meu.status, tem_job: true };
}

module.exports = {
  TEMPO_TIPOS,
  JANELA,
  PISO_MIN,
  tiposDe,
  tsMs,
  mediana,
  medianaMinutos,
  temposPorTipo,
  filaDoMembro,
};
