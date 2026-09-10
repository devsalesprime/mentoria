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

/**
 * POST /api/script/ficha/materials/submit: telefone opcional para o aviso no WhatsApp.
 * O numero SO e guardado com `consentimento: true` (a marcacao de permissao da tela).
 */
const scriptMaterialsSubmitSchema = z.object({
    notify_phone: z.string().max(40).optional(),
    notify: z.boolean().optional().default(true),
    consentimento: z.boolean().optional(),
    consent_texto: z.string().max(1000).optional(),
});

/** PUT /api/script/ficha/notify-phone: `consentimento` e obrigatorio (sem ele a rota devolve 400). */
const notifyPhoneSchema = z.object({
    notify_phone: z.string().max(40).optional(),
    consentimento: z.boolean().optional(),
    consent_texto: z.string().max(1000).optional(),
});

/**
 * Frase da permissao mostrada na tela (components/script/materiais/ConsentimentoWhatsApp.tsx).
 * Vale de padrao quando o cliente nao manda `consent_texto`; o que fica guardado e sempre o que a pessoa viu.
 */
const CONSENT_TEXTO = 'Quero receber no meu WhatsApp, pelo número do Danilo (Prosperus), as atualizações do meu script: quando a ficha ficar pronta, quando o script sair e se faltar alguma informação.';

/** Recusa padrao de quem tenta guardar numero sem a permissao marcada. */
const CONSENT_FALTANDO = 'Marque a permissão para receber as atualizações no seu WhatsApp.';

/**
 * Aplica o WhatsApp na entrada da pessoa SO com a permissao marcada: grava numero, quando a permissao foi
 * dada e a frase que ela viu. Sem permissao (ou sem numero novo) devolve a entrada intacta.
 * `sugerido` (notify_phone_sugerido) nunca entra aqui: ele so pre-preenche o campo da tela.
 */
function applyNotifyConsent(pessoa, { phone, consentimento, texto, agora }) {
    if (consentimento !== true || !phone) return pessoa;
    return {
        ...pessoa,
        notify_phone: phone,
        notify_consent_at: agora || new Date().toISOString(),
        notify_consent_texto: typeof texto === 'string' && texto.trim() ? texto.trim().slice(0, 1000) : CONSENT_TEXTO,
    };
}

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

/**
 * PUT /api/admin/cohort/config: o corpo e PARCIAL. A rota grava so as chaves que vieram
 * (routes/admin-cohort.cjs pula `undefined`), entao NENHUMA chave pode ter `.default()`: com um default,
 * salvar so a amostra reescreveria o prazo de todo mundo com vazio. String vazia continua limpando a chave,
 * porque ai o admin mandou limpar de proposito.
 */
const cohortConfigSchema = z.object({
    prazo_materiais: z.string().trim().max(200).optional(),
    // Amostra da tela "Como funciona" (onda I, item A1): JSON {"club_slug":"...","versao":5}. Vazio esconde o bloco.
    amostra_script: z.string().trim().max(300).optional(),
});

const COHORT_CONFIG_KEYS = ['prazo_materiais', 'amostra_script'];

/**
 * `amostra_script` guardado pelo admin -> { club_slug, versao } ou null (vazio, JSON quebrado, sem clube
 * ou versao invalida). Nunca ha clube nem versao no codigo: quem escolhe e o admin.
 */
function parseAmostra(valor) {
    if (!valor) return null;
    let obj = valor;
    if (typeof valor === 'string') {
        const bruto = valor.trim();
        if (!bruto) return null;
        try { obj = JSON.parse(bruto); } catch { return null; }
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const club_slug = String(obj.club_slug || '').trim();
    const versao = Number(obj.versao);
    if (!club_slug || !Number.isInteger(versao) || versao < 1) return null;
    return { club_slug, versao };
}

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
// prefill = pre-preenchimento da ficha; script = escrever o script do zero (ficha confirmada); refinar = nova sugestao para 1 campo (payload.field_key);
// revisar = nova versao do script a partir de uma versao existente + comentarios dela (payload.versao, content_md, comentarios)
// pendencia = o worker abriu uma pendencia com o mentor (WhatsApp) para os campos que faltaram (payload.campos); 1 ativa por clube
// slides = apresentacao comercial (PPTX + PDF + notas + contato) de UMA versao do script (payload.versao); 1 ativo por (clube, versao).
//         O worker publica o resultado em PUT /api/jobs/:id/entregavel (multipart).
// conector = publicacao do conector de IA do clube para UMA versao aprovada (payload.versao); 1 por (clube, versao),
//         contando tambem os ja concluidos. Payload exatamente { club_slug, nome_clube, versao, refresh_pedido_em };
//         o runner recusa payload com a chave `tool`, que fica reservada para outro tipo. O worker le a ficha, os
//         materiais e o script pelas mesmas rotas do `slides` e publica em PUT /api/jobs/:id/entregavel (JSON).
const JOB_TIPOS = ['prefill', 'script', 'refinar', 'revisar', 'pendencia', 'slides', 'conector'];

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
  progresso TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  finished_at DATETIME,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
const COHORT_JOBS_INDEX_DDL = `CREATE INDEX IF NOT EXISTS idx_cohort_jobs_status_created ON cohort_jobs(status, created_at)`;
// Progresso do worker em marcos (JSON): { fase: 'extracao'|'bloco'|'finalizando', etapa_atual, etapas_total, rotulo,
// arquivos_lidos?, arquivos_total?, blocos_concluidos: number[], blocos_com_erro?: number[], atualizado_em }.
// ALTER idempotente para bancos criados antes da coluna ("duplicate column" e ignorado). Registro: migrations/019_cohort_jobs_progresso.sql
const COHORT_JOBS_PROGRESSO_DDL = `ALTER TABLE cohort_jobs ADD COLUMN progresso TEXT`;

/** Idempotente; chamado pelos routers (script, admin-cohort, jobs). Registro: migrations/017_cohort_jobs.sql */
async function ensureCohortJobsTable(dbRun) {
    await dbRun(COHORT_JOBS_DDL);
    await dbRun(COHORT_JOBS_INDEX_DDL);
    try {
        await dbRun(COHORT_JOBS_PROGRESSO_DDL);
    } catch (e) {
        if (!/duplicate column/i.test(String(e && e.message))) throw e;
    }
}

// ─── cohort_clubs: colunas do conector (migrations/029_cohort_clubs_conector.sql) ───

/** ALTERs idempotentes de cohort_clubs; "duplicate column" e ignorado (mesmo molde de ensureCohortJobsTable). */
const COHORT_CLUBS_CONECTOR_DDL = [
    `ALTER TABLE cohort_clubs ADD COLUMN conector INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE cohort_clubs ADD COLUMN conector_porta INTEGER`,
    `ALTER TABLE cohort_clubs ADD COLUMN conector_url TEXT`,
];

/** Idempotente; chamado pelos routers (script, admin-cohort, jobs) alem do server.cjs. Registro: migrations/029. */
async function ensureConectorColumns(dbRun) {
    for (const sql of COHORT_CLUBS_CONECTOR_DDL) {
        try {
            await dbRun(sql);
        } catch (e) {
            if (!/duplicate column/i.test(String(e && e.message))) throw e;
        }
    }
}

// ─── script_entregaveis (arquivos que o worker publica para uma versao do script) ───

/**
 * Tipos de entregavel aceitos em PUT /api/jobs/:id/entregavel.
 *   slides   -> apresentacao comercial (multipart, um arquivo por campo)
 *   conector -> conector de IA do clube (JSON: meta com o endereco + o texto de instalacao.md)
 */
const ENTREGAVEL_TIPOS = ['slides', 'conector'];

/**
 * Campos de arquivo do multipart por tipo: extensao obrigatoria, mime gravado e como o navegador recebe
 * (attachment = baixa; inline = abre, para a imagem do contato). Nome no disco e fixo por campo (substituir = sobrescrever).
 */
const ENTREGAVEL_CAMPOS = {
    slides: {
        pptx: { ext: '.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', disposition: 'attachment', rotulo: 'Apresentação (PPTX)' },
        pdf: { ext: '.pdf', mime: 'application/pdf', disposition: 'attachment', rotulo: 'Apresentação em PDF' },
        notas: { ext: '.md', mime: 'text/markdown; charset=utf-8', disposition: 'attachment', rotulo: 'Notas do apresentador' },
        contact: { ext: '.png', mime: 'image/png', disposition: 'inline', rotulo: 'Contato' },
    },
    conector: {
        instalacao: { ext: '.md', mime: 'text/markdown; charset=utf-8', disposition: 'attachment', rotulo: 'Instruções de instalação' },
    },
};

/**
 * Nome de arquivo do corpo JSON -> campo do entregavel ("instalacao.md" -> "instalacao").
 * Casa pelo nome sem extensao; quando o tipo tem UM campo so e o nome nao bate, usa esse campo.
 * Devolve null quando nao da para decidir (o chamador responde 400).
 */
function campoDoArquivo(tipo, nome) {
    const defs = ENTREGAVEL_CAMPOS[tipo] || {};
    const chaves = Object.keys(defs);
    const base = String(nome || '').split(/[\\/]/).pop() || '';
    const semExt = base.replace(/\.[^.]+$/, '').toLowerCase();
    if (chaves.includes(semExt)) return semExt;
    if (chaves.length === 1) return chaves[0];
    return null;
}

/** Teto do conteudo de texto que chega no corpo JSON de PUT /api/jobs/:id/entregavel (por arquivo). */
const ENTREGAVEL_TEXTO_MAX = 400000;

/**
 * Corpo JSON de PUT /api/jobs/:id/entregavel (usado pelo `conector`):
 * { tipo, versao, meta: { url, pagina, tools, atualizado_em, refresh }, arquivos: [{ nome, conteudo }] }.
 * `meta` chega como objeto (no multipart ele vem como string JSON); os arquivos vem como texto UTF-8.
 */
const entregavelJsonSchema = z.object({
    tipo: z.enum(ENTREGAVEL_TIPOS),
    versao: z.coerce.number().int().min(1),
    meta: z.record(z.string(), z.unknown()).nullable().optional(),
    arquivos: z.array(z.object({
        nome: z.string().trim().min(1).max(200),
        conteudo: z.string().max(ENTREGAVEL_TEXTO_MAX),
    })).max(8).optional().default([]),
});

/** Limite por arquivo do multipart de entregaveis (a apresentacao com imagens fica na casa das dezenas de MB). */
const ENTREGAVEL_MAX_BYTES = 80 * 1024 * 1024;

/** Campos de texto de PUT /api/jobs/:id/entregavel (os arquivos vem por multer). `meta` chega como string JSON. */
const entregavelBodySchema = z.object({
    tipo: z.enum(ENTREGAVEL_TIPOS),
    versao: z.coerce.number().int().min(1),
    meta: z.string().max(20000).optional(),
});

/** Nome de arquivo seguro para gravar/devolver: so letras, numeros, ponto, hifen e underscore; nunca caminho. */
function safeFileName(name, fallback = 'arquivo') {
    const base = String(name || '').split(/[\\/]/).pop() || '';
    const limpo = base.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
    return (limpo || fallback).slice(0, 120);
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
    // "Não tenho materiais, ir para a ficha": segue para a ficha sem leitura de material nenhum
    if (typeof o.skipped_at === 'string' && o.skipped_at) out.skipped_at = o.skipped_at;
    if (typeof o.nome === 'string' && o.nome) out.nome = o.nome;
    if (typeof o.notify_phone === 'string' && o.notify_phone) out.notify_phone = o.notify_phone;
    // Permissao do WhatsApp: quando foi dada e a frase que a pessoa viu (o numero so existe com as duas)
    if (typeof o.notify_consent_at === 'string' && o.notify_consent_at) out.notify_consent_at = o.notify_consent_at;
    if (typeof o.notify_consent_texto === 'string' && o.notify_consent_texto) out.notify_consent_texto = o.notify_consent_texto;
    // Numero que veio do cadastro (admin): SO pre-preenche o campo; nunca e usado para mandar mensagem
    if (typeof o.notify_phone_sugerido === 'string' && o.notify_phone_sugerido) out.notify_phone_sugerido = o.notify_phone_sugerido;
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
    if (p.skipped_at) out.skipped_at = p.skipped_at;
    if (p.resposta_ia) out.resposta_ia = p.resposta_ia;
    if (p.notify_phone) out.notify_phone = p.notify_phone;
    if (p.notify_consent_at) out.notify_consent_at = p.notify_consent_at;
    // A tela usa a sugestao so para pre-preencher o campo do WhatsApp
    if (p.notify_phone_sugerido) out.notify_phone_sugerido = p.notify_phone_sugerido;
    return out;
}

/**
 * Estado dos materiais DESTA pessoa: 'submitted' (clicou em "Enviei o que tinha"),
 * 'skipped' ("Não tenho materiais, ir para a ficha") ou 'pending'. Enviar vence pular.
 */
function memberMaterialsStatus(materials, email) {
    const p = pessoaFor(materials, email);
    if (p.submitted_at) return 'submitted';
    return p.skipped_at ? 'skipped' : 'pending';
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
    notifyPhoneSchema,
    CONSENT_TEXTO,
    CONSENT_FALTANDO,
    applyNotifyConsent,
    normalizePhone,
    cohortConfigSchema,
    COHORT_CONFIG_KEYS,
    parseAmostra,
    COHORT_CONFIG_DDL,
    ensureCohortConfigTable,
    JOB_STATUSES,
    JOB_TIPOS,
    ENTREGAVEL_TIPOS,
    ENTREGAVEL_CAMPOS,
    ENTREGAVEL_MAX_BYTES,
    ENTREGAVEL_TEXTO_MAX,
    entregavelBodySchema,
    entregavelJsonSchema,
    campoDoArquivo,
    COHORT_CLUBS_CONECTOR_DDL,
    ensureConectorColumns,
    safeFileName,
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
