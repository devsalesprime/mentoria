const { Router } = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const SF = require('../utils/script-ficha.cjs');
const VM = require('../utils/validation-materials.cjs');
const JOBS = require('../utils/cohort-jobs.cjs');
const CM = require('../utils/cohort-materials.cjs');
const { scriptPrefillSchema, validateBody } = require('../utils/validation.cjs');

/**
 * API da fila (/api/jobs/*) para o worker externo (a Naia, no VPS). Contrato: docs/SCRIPT-7-PASSOS.md secao 5.2.
 * Auth: Authorization: Bearer <COHORT_JOBS_TOKEN>. Sem a variavel, tudo responde 503 "fila desligada".
 * Nunca logar o body nem os materiais (acessos de plataforma trazem login/senha).
 */
module.exports = function createJobsRoutes({ dbGet, dbRun, dbAll, uuidv4, fs, safeJsonParse, COHORT_JOBS_TOKEN, APP_URL }) {
  const router = Router();

  VM.ensureCohortJobsTable(dbRun).catch((e) => console.error('cohort_jobs DDL error:', e.message));

  const jobPatchSchema = z.object({
    status: z.enum(['queued', 'running', 'done', 'error', 'needs_human']),
    result: z.any().optional(),
    error: z.string().max(4000).nullable().optional(),
  });

  const jobNextSchema = z.object({
    tipo: z.enum(VM.JOB_TIPOS).optional().default('prefill'),
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

  // POST /api/jobs/next  { tipo: 'prefill' }  -> reivindica o job mais antigo em queued (atomico) ou 204
  router.post('/api/jobs/next', validateBody(jobNextSchema), async (req, res) => {
    try {
      const job = await JOBS.claimNextJob({ dbGet }, req.body.tipo);
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

  // GET /api/jobs/:id/files/:fileId  -> stream do arquivo (so se pertence ao clube do job)
  router.get('/api/jobs/:id/files/:fileId', loadJob, async (req, res) => {
    try {
      const row = await CM.getClubFile({ dbGet }, req.job.club_slug, req.params.fileId);
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

  // GET /api/jobs/:id/ficha  -> campos com status (o que o mentor ja decidiu) + metadados do clube/prefill
  router.get('/api/jobs/:id/ficha', loadJob, async (req, res) => {
    try {
      const slug = req.job.club_slug;
      const club = await getClub(slug);
      const ficha = await SF.ensureFichaRow({ dbGet, dbRun, uuidv4 }, slug);
      const view = SF.buildFichaView(safeJsonParse(ficha.fields, {}), { includeInternal: true });
      const decididos = view.blocos.flatMap((b) => b.campos.filter((c) => c.decidido).map((c) => c.key));
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
        ...view,
      });
    } catch (error) {
      console.error('Error in GET /api/jobs/:id/ficha:', error.message);
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
