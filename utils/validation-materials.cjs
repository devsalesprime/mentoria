/**
 * Script 7 Passos: materiais POR PESSOA (links, observacoes, acessos de plataforma).
 * Schemas zod + normalizacao do JSON de script_fichas.materials.
 *
 * Forma atual de script_fichas.materials:
 *   { por_pessoa: { "<email minusculo>": { links[], observacoes, acessos[], submitted_at, nome? } }, legado?: { links[], observacoes } }
 * Forma antiga (por clube): { links[], observacoes } -> vira `legado` (so o admin ve).
 *
 * Regra de ouro: `acessos` (login/senha de plataforma) nunca aparece em log nem em resposta de outro membro.
 */
const { z } = require('zod');

const isHttpUrl = (v) => /^https?:\/\//i.test(v);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const scriptMaterialLinkSchema = z.object({
    url: z.string().trim().max(2000).refine(isHttpUrl, 'URL deve começar com http:// ou https://'),
    rotulo: z.string().max(200).optional().default(''),
    tipo: z.enum(['drive', 'site', 'plataforma', 'outro']).optional().default('outro'),
});

const scriptAcessoSchema = z.object({
    plataforma_url: z.string().trim().max(2000).refine(isHttpUrl, 'URL da plataforma deve começar com http:// ou https://'),
    login: z.string().trim().max(320).optional().default(''),
    senha: z.string().max(500).optional().default(''),
    observacoes: z.string().max(2000).optional().default(''),
});

/** PUT /api/script/ficha/materials: cada chave e opcional; chave ausente mantem o que ja esta salvo. */
const scriptMaterialsPessoaSchema = z.object({
    links: z.array(scriptMaterialLinkSchema).max(50).optional(),
    observacoes: z.string().max(5000).optional(),
    acessos: z.array(scriptAcessoSchema).max(10).optional(),
    // Resposta colada da IA do mentor ("Peca para a sua IA preencher"); vira { texto, salvo_em, resumo }
    resposta_ia: z.string().max(200000).optional(),
});

/** POST /api/script/ficha/materials/submit: telefone opcional para o aviso no WhatsApp. */
const scriptMaterialsSubmitSchema = z.object({
    notify_phone: z.string().max(40).optional(),
    notify: z.boolean().optional().default(true),
});

// ─── Telefone (aviso no WhatsApp) ────────────────────────────────────────────

/**
 * Normaliza o telefone digitado: tira tudo que nao e digito; 10 ou 11 digitos (DDD + numero) ganham o 55;
 * 12 ou 13 digitos precisam comecar com 55. Devolve { ok: true, phone } (phone = null quando veio vazio)
 * ou { ok: false, message }.
 */
function normalizePhone(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return { ok: true, phone: null };
    const digits = trimmed.replace(/\D+/g, '');
    if (!digits) return { ok: false, message: 'WhatsApp inválido: use DDD + número (10 a 11 dígitos), com ou sem o 55.' };
    if (digits.length === 10 || digits.length === 11) return { ok: true, phone: `55${digits}` };
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return { ok: true, phone: digits };
    return { ok: false, message: 'WhatsApp inválido: use DDD + número (10 a 11 dígitos), com ou sem o 55.' };
}

/** PUT /api/admin/cohort/config */
const cohortConfigSchema = z.object({
    prazo_materiais: z.string().trim().max(200).optional().default(''),
});

const COHORT_CONFIG_KEYS = ['prazo_materiais'];

// ─── cohort_config (chave/valor) ─────────────────────────────────────────────

const COHORT_CONFIG_DDL = `CREATE TABLE IF NOT EXISTS cohort_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

/** Idempotente; chamado na criacao dos routers para nao depender de mudanca no server.cjs. Registro: migrations/016_cohort_config.sql */
function ensureCohortConfigTable(dbRun) {
    return dbRun(COHORT_CONFIG_DDL);
}

// ─── cohort_jobs (fila para o worker externo, a Naia) ────────────────────────

const JOB_STATUSES = ['queued', 'running', 'done', 'error', 'needs_human'];
const JOB_TIPOS = ['prefill'];

const COHORT_JOBS_DDL = `CREATE TABLE IF NOT EXISTS cohort_jobs (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'prefill',
  club_slug TEXT NOT NULL,
  email TEXT NOT NULL,
  notify_phone TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'running', 'done', 'error', 'needs_human')),
  attempts INTEGER NOT NULL DEFAULT 0,
  payload JSON,
  result JSON,
  error TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  finished_at DATETIME,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
const COHORT_JOBS_INDEX_DDL = `CREATE INDEX IF NOT EXISTS idx_cohort_jobs_status_created ON cohort_jobs(status, created_at)`;

/** Idempotente; chamado pelos routers (script, admin-cohort, jobs). Registro: migrations/017_cohort_jobs.sql */
async function ensureCohortJobsTable(dbRun) {
    await dbRun(COHORT_JOBS_DDL);
    await dbRun(COHORT_JOBS_INDEX_DDL);
}

async function readCohortConfig(dbAll) {
    const rows = await dbAll(`SELECT key, value FROM cohort_config`);
    const out = {};
    for (const k of COHORT_CONFIG_KEYS) out[k] = '';
    for (const r of rows) if (COHORT_CONFIG_KEYS.includes(r.key)) out[r.key] = typeof r.value === 'string' ? r.value : '';
    return out;
}

// ─── Normalizacao ─────────────────────────────────────────────────────────────

function normEmail(e) {
    return String(e || '').trim().toLowerCase();
}

function emptyPessoa() {
    return { links: [], observacoes: '', acessos: [], submitted_at: null };
}

function sanitizePessoa(p) {
    const o = p && typeof p === 'object' ? p : {};
    const out = {
        links: Array.isArray(o.links) ? o.links : [],
        observacoes: typeof o.observacoes === 'string' ? o.observacoes : '',
        acessos: Array.isArray(o.acessos) ? o.acessos : [],
        submitted_at: typeof o.submitted_at === 'string' && o.submitted_at ? o.submitted_at : null,
    };
    if (typeof o.nome === 'string' && o.nome) out.nome = o.nome;
    if (typeof o.notify_phone === 'string' && o.notify_phone) out.notify_phone = o.notify_phone;
    if (o.resposta_ia && typeof o.resposta_ia === 'object' && typeof o.resposta_ia.texto === 'string') {
        out.resposta_ia = {
            texto: o.resposta_ia.texto,
            salvo_em: typeof o.resposta_ia.salvo_em === 'string' ? o.resposta_ia.salvo_em : null,
            resumo: typeof o.resposta_ia.resumo === 'string' ? o.resposta_ia.resumo : '',
        };
    }
    return out;
}

/** Normaliza o JSON (string ou objeto) de script_fichas.materials para { por_pessoa, legado? }. */
function normalizeMaterials(raw) {
    let m = raw;
    if (typeof raw === 'string') {
        try { m = JSON.parse(raw); } catch { m = {}; }
    }
    if (!m || typeof m !== 'object' || Array.isArray(m)) m = {};

    const out = { por_pessoa: {} };
    if (m.por_pessoa && typeof m.por_pessoa === 'object' && !Array.isArray(m.por_pessoa)) {
        for (const [email, p] of Object.entries(m.por_pessoa)) {
            const k = normEmail(email);
            if (!k) continue;
            out.por_pessoa[k] = sanitizePessoa(p);
        }
        if (m.legado && typeof m.legado === 'object') {
            const l = sanitizePessoa(m.legado);
            if (l.links.length || l.observacoes) out.legado = { links: l.links, observacoes: l.observacoes };
        }
        return out;
    }

    // Forma antiga (por clube). So vira legado se tinha algo; senao e uma ficha vazia.
    const links = Array.isArray(m.links) ? m.links : [];
    const observacoes = typeof m.observacoes === 'string' ? m.observacoes : '';
    if (links.length || observacoes) out.legado = { links, observacoes };
    return out;
}

function pessoaFor(materials, email) {
    return materials.por_pessoa[normEmail(email)] || emptyPessoa();
}

/** O que o membro ve: SO a entrada dele. Nunca `legado`, nunca outra pessoa. resposta_ia/notify_phone so quando existem. */
function memberMaterialsView(materials, email) {
    const p = pessoaFor(materials, email);
    const out = { links: p.links, observacoes: p.observacoes, acessos: p.acessos, submitted_at: p.submitted_at };
    if (p.resposta_ia) out.resposta_ia = p.resposta_ia;
    if (p.notify_phone) out.notify_phone = p.notify_phone;
    return out;
}

function memberMaterialsStatus(materials, email) {
    return pessoaFor(materials, email).submitted_at ? 'submitted' : 'pending';
}

function countSubmitted(materials) {
    return Object.values(materials.por_pessoa).filter((p) => p.submitted_at).length;
}

function countItems(materials) {
    return Object.values(materials.por_pessoa).reduce((s, p) => s + p.links.length + p.acessos.length, 0);
}

module.exports = {
    scriptMaterialLinkSchema,
    scriptAcessoSchema,
    scriptMaterialsPessoaSchema,
    scriptMaterialsSubmitSchema,
    normalizePhone,
    cohortConfigSchema,
    COHORT_CONFIG_KEYS,
    COHORT_CONFIG_DDL,
    ensureCohortConfigTable,
    JOB_STATUSES,
    JOB_TIPOS,
    COHORT_JOBS_DDL,
    COHORT_JOBS_INDEX_DDL,
    ensureCohortJobsTable,
    readCohortConfig,
    normEmail,
    emptyPessoa,
    sanitizePessoa,
    normalizeMaterials,
    pessoaFor,
    memberMaterialsView,
    memberMaterialsStatus,
    countSubmitted,
    countItems,
};
