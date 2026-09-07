/**
 * Marcos por PESSOA do Script 7 Passos (colunas anulaveis em cohort_members). Onda I:
 *   como_funciona -> a pessoa ja clicou em "Começar o meu script" na tela inicial (decisao D1:
 *                    a tela aparece na primeira entrada; depois vive no menu).
 *   whatsapp_lembrete -> a pessoa dispensou o lembrete unico do WhatsApp numa tela de espera.
 *                    Com a marca, o lembrete nao volta (nunca insistir uma terceira vez).
 * Registro: migrations/027_cohort_members_marcos.sql
 */

const MARCOS = {
  como_funciona: 'como_funciona_visto_em',
  whatsapp_lembrete: 'whatsapp_lembrete_em',
};

const MARCOS_DDL = [
  `ALTER TABLE cohort_members ADD COLUMN como_funciona_visto_em DATETIME`,
  `ALTER TABLE cohort_members ADD COLUMN whatsapp_lembrete_em DATETIME`,
];

/** Idempotente; roda na criacao do router ("duplicate column" e ignorado). */
async function ensureMarcosColumns(dbRun) {
  for (const ddl of MARCOS_DDL) {
    try {
      await dbRun(ddl);
    } catch (e) {
      if (!/duplicate column/i.test(String(e && e.message))) throw e;
    }
  }
}

function normEmail(e) {
  return String(e || '').trim().toLowerCase();
}

/** { como_funciona, whatsapp_lembrete }: data ISO do banco ou null. Pessoa sem linha devolve os dois null. */
async function lerMarcos({ dbGet }, email) {
  try {
    const row = await dbGet(
      `SELECT como_funciona_visto_em, whatsapp_lembrete_em FROM cohort_members WHERE email = ?`,
      [normEmail(email)]
    );
    return {
      como_funciona: (row && row.como_funciona_visto_em) || null,
      whatsapp_lembrete: (row && row.whatsapp_lembrete_em) || null,
    };
  } catch {
    return { como_funciona: null, whatsapp_lembrete: null };
  }
}

/**
 * Grava o marco (idempotente: regravar mantem a primeira data). SO UPDATE, nunca INSERT:
 * `cohort_members` e a lista que libera login sem passar pelo HubSpot (routes/auth.cjs lookupCohortMember)
 * e o roster do clube no admin. Marca de "ja vi a tela" jamais pode virar acesso permanente. Quem chega
 * aqui ja passou pelo cohortGuard e entra pelo `users.club_slug`; sem linha na lista, nao grava nada e a
 * tela apenas volta a aparecer na proxima visita.
 * @returns {{gravado: boolean}|null} null quando o marco nao existe.
 */
async function marcarMarco({ dbRun }, { email, marco }) {
  const coluna = MARCOS[marco];
  if (!coluna) return null;
  const r = await dbRun(
    `UPDATE cohort_members SET ${coluna} = COALESCE(${coluna}, CURRENT_TIMESTAMP) WHERE email = ?`,
    [normEmail(email)]
  );
  return { gravado: !!(r && r.changes) };
}

module.exports = {
  MARCOS,
  MARCOS_DDL,
  ensureMarcosColumns,
  lerMarcos,
  marcarMarco,
};
