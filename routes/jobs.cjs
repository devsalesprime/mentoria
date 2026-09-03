const { Router } = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const SF = require('../utils/script-ficha.cjs');
const VM = require('../utils/validation-materials.cjs');
const JOBS = require('../utils/cohort-jobs.cjs');
const CM = require('../utils/cohort-materials.cjs');
const CTX = require('../utils/script-context.cjs');
const SV = require('../utils/script-versions.cjs');
const { scriptPrefillSchema, validateBody } = require('../utils/validation.cjs');

/**
 * API da fila (/api/jobs/*) para o worker externo (a Naia, no VPS). Contrato: docs/SCRIPT-7-PASSOS.md secao 5.2.
 * Auth: Authorization: Bearer <COHORT_JOBS_TOKEN>. Sem a variavel, tudo responde 503 "fila desligada".
 * Nunca logar o body nem os materiais (acessos de plataforma trazem login/senha).
 */
module.exports = function createJobsRoutes({ dbGet, dbRun, dbAll, uuidv4, fs, safeJsonParse, COHORT_JOBS_TOKEN, APP_URL }) {
  const router = Router();

  VM.ensureCohortJobsTable(dbRun).catch((e) => console.error('cohort_jobs DDL error:', e.message));
  CTX.ensureScriptContextTable(dbRun).catch((e) => console.error('script_field_context DDL error:', e.message));
  SV.ensureScriptVersionsTables(dbRun).catch((e) => console.error('script_versions DDL error:', e.message));

  const jobPatchSchema = z.object({
    status: z.enum(['queued', 'running', 'done', 'error', 'needs_human']),
    result: z.any().optional(),
    error: z.string().max(4000).nullable().optional(),
  });

  // tipo ausente ou 'any' = o mais antigo de qualquer tipo
  const jobNextSchema = z.object({
    tipo: z.enum([...VM.JOB_TIPOS, 'any']).optional().default('any'),
  });

  // PUT /api/jobs/:id/campo (job refinar): nova sugestao para 1 campo
  const jobCampoSchema = z.object({
    field_key: z.string().trim().min(3).max(8),
    sugerido: z.string().max(20000).optional().default(''),
    classe: z.enum(['Fato', 'DER', 'VZ']),
    fonte: z.string().max(1000).optional().default(''),
    alternativas: z.array(z.object({ sugerido: z.string().max(20000), fonte: z.string().max(1000).optional().default('') })).max(2).optional().default([]),
    nota_interna: z.string().max(5000).optional().default(''),
  });

  function currentToken() {
    return String(COHORT_JOBS_TOKEN || process.env.COHORT_JOBS_TOKEN || '').trim();
  }

  function safeEqual(a, b) {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  }

  /** Bearer <COHORT_JOBS_TOKEN>. 503 quando a fila esta desligada (variavel vazia). */
  function jobsAuth(req, res, next) {
    const expected = currentToken();
    if (!expected) return res.status(503).json({ success: false, message: 'fila desligada' });
    const header = String(req.headers.authorization || '');
    const given = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!given || !safeEqual(given, expected)) {
      return res.status(401).json({ success: false, message: 'Token da fila inválido.' });
    }
    next();
  }

  /** Carrega o job em req.job (404 se nao existe). */
  async function loadJob(req, res, next) {
    try {
      const job = await JOBS.getJob({ dbGet }, req.params.id);
      if (!job) return res.status(404).json({ success: false, message: 'Job não encontrado.' });
      req.job = job;
      next();
    } catch (error) {
      console.error('Error loading job:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  }

  async function getClub(slug) {
    return dbGet(`SELECT slug, nome, ativo FROM cohort_clubs WHERE slug = ?`, [slug]);
  }

  async function getPessoa(job) {
    const m = await dbGet(
      `SELECT cm.email, cm.nome, u.name AS user_name FROM cohort_members cm ${CM.LATEST_USER_JOIN} WHERE cm.email = ?`,
      [job.email]
    );
    const payload = job.payload || {};
    return {
      email: job.email,
      nome: (m && (m.nome || m.user_name)) || payload.nome || null,
      notify_phone: job.notify_phone || null,
    };
  }

  function appUrl(req) {
    const fixed = String(APP_URL || process.env.APP_URL || '').trim();
    if (fixed) return fixed.replace(/\/+$/, '');
    return `${req.protocol}://${req.get('host')}`;
  }

  router.use('/api/jobs', jobsAuth);

  // POST /api/jobs/next  { tipo?: 'prefill'|'script'|'refinar'|'revisar'|'any' }  -> reivindica o job mais antigo em queued (atomico) ou 204
  router.post('/api/jobs/next', validateBody(jobNextSchema), async (req, res) => {
    try {
      const job = await JOBS.claimNextJob({ dbGet }, req.body.tipo === 'any' ? null : req.body.tipo);
      if (!job) return res.status(204).end();
      const club = await getClub(job.club_slug);
      res.json({
        success: true,
        job,
        club: club ? { slug: club.slug, nome: club.nome, ativo: club.ativo === 1 } : { slug: job.club_slug, nome: null, ativo: null },
        pessoa: await getPessoa(job),
        app_url: appUrl(req),
      });
    } catch (error) {
      console.error('Error in POST /api/jobs/next:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/jobs?status=queued|running|done|error|needs_human&tipo=prefill&limit=200
  router.get('/api/jobs', async (req, res) => {
    try {
      const status = req.query.status ? String(req.query.status) : null;
      if (status && !VM.JOB_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: `status inválido (use ${VM.JOB_STATUSES.join('|')}).` });
      }
      const tipo = req.query.tipo ? String(req.query.tipo) : null;
      const jobs = await JOBS.listJobs({ dbAll }, { status, tipo, limit: req.query.limit });
      res.json({ success: true, data: jobs });
    } catch (error) {
      console.error('Error in GET /api/jobs:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/jobs/phones  -> { phones: [...] } (allowlist do WhatsApp no VPS)
  router.get('/api/jobs/phones', async (req, res) => {
    try {
      res.json({ success: true, phones: await JOBS.listPhones({ dbAll }) });
    } catch (error) {
      console.error('Error in GET /api/jobs/phones:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/jobs/:id
  router.get('/api/jobs/:id', loadJob, (req, res) => {
    res.json({ success: true, job: req.job });
  });

  // PATCH /api/jobs/:id  { status, result?, error? }
  router.patch('/api/jobs/:id', loadJob, validateBody(jobPatchSchema), async (req, res) => {
    try {
      const job = await JOBS.updateJobStatus({ dbGet, dbRun }, req.job.id, req.body);
      res.json({ success: true, job });
    } catch (error) {
      console.error('Error in PATCH /api/jobs/:id:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/jobs/:id/materials  -> TODOS os materiais do CLUBE do job, por pessoa (inclui acessos; nunca logar)
  router.get('/api/jobs/:id/materials', loadJob, async (req, res) => {
    try {
      const slug = req.job.club_slug;
      const club = await getClub(slug);
      const ficha = await SF.ensureFichaRow({ dbGet, dbRun, uuidv4 }, slug);
      const [membros, files] = await Promise.all([CM.listClubMembers({ dbAll }, slug), CM.listClubFiles({ dbAll }, slug)]);
      const materials = VM.normalizeMaterials(ficha.materials);
      const fileUrl = (f) => `/api/jobs/${encodeURIComponent(req.job.id)}/files/${encodeURIComponent(f.id)}`;
      const pessoas = CM.buildPessoas(membros, files, materials, fileUrl).map((p) => ({
        email: p.email,
        nome: p.nome,
        membro: p.membro,
        files: p.files.map((f) => ({
          id: f.id, name: f.fileName, type: f.fileType, size: f.fileSize, category: f.category,
          created_at: f.createdAt, download_url: f.download_url,
        })),
        links: p.links,
        observacoes: p.observacoes,
        acessos: p.acessos,
        resposta_ia: p.resposta_ia,
        notify_phone: p.notify_phone,
        submitted_at: p.submitted_at,
      }));
      res.json({
        success: true,
        job_id: req.job.id,
        club: club ? { slug: club.slug, nome: club.nome, ativo: club.ativo === 1 } : { slug, nome: null, ativo: null },
        pessoas,
        legado: materials.legado || null,
        materials_status: ficha.materials_status,
        materials_submitted_at: ficha.materials_submitted_at,
      });
    } catch (error) {
      console.error('Error in GET /api/jobs/:id/materials:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/jobs/:id/files/:fileId  -> stream do arquivo (materiais ou contexto; so se pertence ao clube do job)
  router.get('/api/jobs/:id/files/:fileId', loadJob, async (req, res) => {
    try {
      const row = (await CM.getClubFile({ dbGet }, req.job.club_slug, req.params.fileId))
        || (await CTX.getContextFile({ dbGet }, req.job.club_slug, req.params.fileId));
      if (!row) return res.status(404).json({ success: false, message: 'Arquivo não encontrado.' });
      if (!fs.existsSync(row.file_path)) return res.status(404).json({ success: false, message: 'Arquivo não encontrado no disco.' });
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.file_name)}"`);
      if (row.file_type) res.setHeader('Content-Type', row.file_type);
      fs.createReadStream(row.file_path).pipe(res);
    } catch (error) {
      console.error('Error in GET /api/jobs/:id/files/:fileId:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/jobs/:id/ficha  -> campos com status (o que o mentor ja decidiu) + contexto por campo + valores planos
  router.get('/api/jobs/:id/ficha', loadJob, async (req, res) => {
    try {
      const slug = req.job.club_slug;
      const club = await getClub(slug);
      const ficha = await SF.ensureFichaRow({ dbGet, dbRun, uuidv4 }, slug);
      const view = SF.buildFichaView(safeJsonParse(ficha.fields, {}), { includeInternal: true });
      const decididos = view.blocos.flatMap((b) => b.campos.filter((c) => c.decidido).map((c) => c.key));
      const fileUrl = (fileId) => `/api/jobs/${encodeURIComponent(req.job.id)}/files/${encodeURIComponent(fileId)}`;
      const contextoItems = await CTX.listContext({ dbAll }, slug, { fileUrl });
      const contexto = CTX.groupByField(contextoItems.map((it) => ({
        id: it.id, tipo: it.tipo, texto: it.texto, url: it.url, legenda: it.legenda, transcricao: it.transcricao,
        erro_transcricao: it.erro_transcricao, file_id: it.file_id, file_name: it.file_name, file_type: it.file_type,
        download_url: it.download_url, autor_email: it.autor_email, autor_nome: it.autor_nome, created_at: it.created_at,
        field_key: it.field_key,
      })));
      // Valor plano por campo: o decidido (valor_efetivo) ou, sem decisao, a sugestao
      const valores = {};
      for (const b of view.blocos) for (const c of b.campos) valores[c.key] = c.decidido ? c.valor_efetivo : c.sugerido;
      res.json({
        success: true,
        job_id: req.job.id,
        club: club ? { slug: club.slug, nome: club.nome, ativo: club.ativo === 1 } : { slug, nome: null, ativo: null },
        ficha_status: ficha.ficha_status,
        prefill_meta: safeJsonParse(ficha.prefill_meta, null),
        prefilled_at: ficha.prefilled_at,
        reviewed_at: ficha.reviewed_at,
        last_user_activity_at: ficha.last_user_activity_at,
        decididos,
        valores,
        contexto,
        ...view,
      });
    } catch (error) {
      console.error('Error in GET /api/jobs/:id/ficha:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // PUT /api/jobs/:id/campo  { field_key, sugerido, classe, fonte, alternativas?, nota_interna? }
  // Nova sugestao para UM campo (job refinar). Volta o campo para `sugerido` mesmo se estava decidido:
  // o valor anterior fica em alternativas[0] ("sua versão anterior"). Regra "sem a definir" aplicada.
  router.put('/api/jobs/:id/campo', loadJob, validateBody(jobCampoSchema), async (req, res) => {
    try {
      const slug = req.job.club_slug;
      const key = req.body.field_key;
      if (!SF.FIELD_BY_KEY[key]) return res.status(400).json({ success: false, message: `Campo desconhecido: ${key}.` });
      const ficha = await SF.ensureFichaRow({ dbGet, dbRun, uuidv4 }, slug);
      const r = SF.applyWorkerSuggestion(safeJsonParse(ficha.fields, {}), key, req.body, { job_id: req.job.id });
      // Campo decidido reaberto numa ficha confirmada: a ficha volta para em_revisao (o mentor precisa olhar de novo)
      const nextStatus = r.reaberto && ficha.ficha_status === 'confirmada' ? 'em_revisao' : (ficha.ficha_status === 'vazia' ? 'pre_preenchida' : ficha.ficha_status);
      await dbRun(
        `UPDATE script_fichas SET fields = ?, ficha_status = ?, updated_at = CURRENT_TIMESTAMP WHERE club_slug = ?`,
        [JSON.stringify(r.fields), nextStatus, slug]
      );
      const view = SF.buildFichaView(r.fields, { includeInternal: true });
      const campo = view.blocos.flatMap((b) => b.campos).find((c) => c.key === key);
      const warnings = [];
      if (r.limpo) warnings.push(`${key}: a sugestão era um "a definir"; o campo ficou vazio e o texto foi para nota_interna.`);
      if (String(req.body.sugerido || '').includes('—')) warnings.push(`${key}: contém travessão.`);
      res.json({ success: true, field_key: key, reaberto: r.reaberto, limpo: r.limpo, ficha_status: nextStatus, campo, warnings });
    } catch (error) {
      console.error('Error in PUT /api/jobs/:id/campo:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  /** Uma versao do script do clube do job, com conteudo e comentarios (n = null -> a ultima). 404 se nao existe. */
  async function sendScriptVersion(req, res, n) {
    const slug = req.job.club_slug;
    const versao = n == null
      ? await SV.getLatestVersion({ dbGet }, slug)
      : await SV.getVersion({ dbGet }, slug, n);
    if (!versao) {
      return res.status(404).json({ success: false, message: n == null ? 'O clube ainda não tem versão do script.' : 'Versão não encontrada.' });
    }
    const comentarios = await SV.listComments({ dbAll }, slug, versao.versao);
    res.json({
      success: true,
      job_id: req.job.id,
      club_slug: slug,
      versao: versao.versao,
      status: versao.status,
      resumo: versao.resumo,
      meta: versao.meta,
      created_at: versao.created_at,
      content_md: versao.content_md,
      comentarios,
    });
  }

  // GET /api/jobs/:id/script  -> ULTIMA versao do script do clube do job { versao, content_md, meta, comentarios }
  router.get('/api/jobs/:id/script', loadJob, async (req, res) => {
    try {
      await sendScriptVersion(req, res, null);
    } catch (error) {
      console.error('Error in GET /api/jobs/:id/script:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/jobs/:id/script/:versao  -> aquela versao (a base do job `revisar` e payload.versao)
  router.get('/api/jobs/:id/script/:versao', loadJob, async (req, res) => {
    try {
      const n = Number(req.params.versao);
      if (!Number.isInteger(n) || n < 1) return res.status(400).json({ success: false, message: 'Versão inválida.' });
      await sendScriptVersion(req, res, n);
    } catch (error) {
      console.error('Error in GET /api/jobs/:id/script/:versao:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // PUT /api/jobs/:id/script  { content_md, resumo?, meta? }  -> nova versao (max + 1) do script do clube
  // Job `revisar`: meta ganha { tipo: 'revisao', base_versao: payload.versao } (o resto do meta do worker e mantido).
  router.put('/api/jobs/:id/script', loadJob, validateBody(SV.scriptVersionBodySchema), async (req, res) => {
    try {
      const slug = req.job.club_slug;
      const club = await getClub(slug);
      if (!club) return res.status(404).json({ success: false, message: `Clube "${slug}" não encontrado.` });
      let meta = req.body.meta ?? null;
      if (req.job.tipo === 'revisar') {
        const baseRaw = req.job.payload && req.job.payload.versao != null ? Number(req.job.payload.versao) : NaN;
        const base = Number.isInteger(baseRaw) && baseRaw >= 1 ? baseRaw : null;
        const extra = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : (meta == null ? {} : { meta_original: meta });
        meta = { ...extra, tipo: 'revisao', base_versao: base };
      }
      const versao = await SV.insertVersion({ dbGet, dbRun, uuidv4 }, {
        club_slug: slug, content_md: req.body.content_md, resumo: req.body.resumo || '', meta, job_id: req.job.id,
      });
      const warnings = [];
      if (req.body.content_md.includes('—')) warnings.push('content_md contém travessão.');
      if (/diagn[oó]stico/i.test(req.body.content_md)) warnings.push('content_md contém a palavra "diagnóstico".');
      res.json({
        success: true,
        versao: versao.versao,
        id: versao.id,
        status: versao.status,
        meta: versao.meta,
        url: `${appUrl(req)}/prosperus-mentor-diagnosis/dashboard/script`,
        warnings,
      });
    } catch (error) {
      console.error('Error in PUT /api/jobs/:id/script:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // PUT /api/jobs/:id/prefill  -> mesmo JSON/validacao/semantica de PUT /api/admin/clubs/:slug/script-ficha
  router.put('/api/jobs/:id/prefill', loadJob, validateBody(scriptPrefillSchema), async (req, res) => {
    try {
      const slug = req.job.club_slug;
      const { errors, warnings } = SF.validatePrefillBody(req.body, slug);
      if (errors.length) {
        return res.status(400).json({ success: false, message: 'JSON fora do contrato.', errors, warnings });
      }
      const club = await getClub(slug);
      if (!club) return res.status(404).json({ success: false, message: `Clube "${slug}" não encontrado.` });

      const r = await SF.importPrefill({ dbGet, dbRun, uuidv4, safeJsonParse }, slug, req.body, { job_id: req.job.id });
      res.json({
        success: true,
        message: `Importados ${r.imported.length} campos; ${r.skipped.length} mantidos (já decididos pelo mentor).`,
        imported: r.imported.length,
        skipped: r.skipped,
        warnings,
        ficha_status: r.ficha_status,
        resumo: r.resumo,
      });
    } catch (error) {
      console.error('Error in PUT /api/jobs/:id/prefill:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  return router;
};
