const { Router } = require('express');
const { z } = require('zod');
const SF = require('../utils/script-ficha.cjs');
const { scriptFieldsUpdateSchema, validateBody } = require('../utils/validation.cjs');
const VM = require('../utils/validation-materials.cjs');
const PIA = require('../utils/script-prompt-ia.cjs');
const JOBS = require('../utils/cohort-jobs.cjs');
const CTX = require('../utils/script-context.cjs');
const SV = require('../utils/script-versions.cjs');

/**
 * Script 7 Passos (membro): Materiais + Ficha do Script + contexto por pergunta + versoes do script.
 * Ficha (campos) e por CLUBE: socios do mesmo clube leem e editam a mesma ficha.
 * Materiais (arquivos, links, observacoes, acessos) sao por PESSOA: cada membro ve so o que ele mesmo enviou;
 * socios nao veem uns aos outros; so o admin ve tudo (routes/admin-cohort.cjs).
 * Contexto por campo (audio/imagem/video/link/nota) e do CLUBE, com autor (so o autor apaga).
 * Versoes do script sao do CLUBE (o worker grava; o membro le, comenta, aprova e pede a proxima versao a partir dos comentarios).
 * Habilitado so para users.cohort != NULL (403 { enabled: false } caso contrario).
 */
module.exports = function createScriptRoutes({ dbGet, dbRun, dbAll, authMiddleware, uuidv4, fs, path, safeJsonParse, multer, DATA_DIR }) {
  const router = Router();
  const multerLib = multer || require('multer');
  const dataDir = DATA_DIR || path.join(__dirname, '..', 'data');

  VM.ensureCohortConfigTable(dbRun).catch((e) => console.error('cohort_config DDL error:', e.message));
  VM.ensureCohortJobsTable(dbRun).catch((e) => console.error('cohort_jobs DDL error:', e.message));
  CTX.ensureScriptContextTable(dbRun).catch((e) => console.error('script_field_context DDL error:', e.message));
  SV.ensureScriptVersionsTables(dbRun).catch((e) => console.error('script_versions DDL error:', e.message));

  // Mesmo diskStorage de routes/files.cjs (data/uploads/<userId>/<timestamp>-<nome>); limite por tipo em CTX.fileError
  const contextStorage = multerLib.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(dataDir, 'uploads', req.user.userId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  });
  const uploadContext = multerLib({ storage: contextStorage, limits: { fileSize: 50 * 1024 * 1024 } });

  const refinarSchema = z.object({
    field_key: z.string().trim().min(3).max(8),
    pedido: z.string().trim().max(2000).optional().default(''),
  });

  // POST /api/script/versoes/:versao/revisar  { pedido? }
  const revisarSchema = z.object({
    pedido: z.string().trim().max(5000).optional().default(''),
  });

  const SCRIPT_CATEGORIES = [
    'script_transcricao_venda',
    'script_apostila_slides',
    'script_proposta_roteiro',
    'script_crm',
    'script_outros',
  ];

  async function getCohortUser(userId) {
    return dbGet(
      `SELECT u.id, u.email, u.name, u.cohort, u.club_slug, cc.nome AS club_nome, cc.ativo AS club_ativo
         FROM users u
         LEFT JOIN cohort_clubs cc ON cc.slug = u.club_slug
        WHERE u.id = ?`,
      [userId]
    );
  }

  async function ensureFicha(clubSlug) {
    await dbRun(
      `INSERT OR IGNORE INTO script_fichas (id, club_slug, fields, materials, materials_status, ficha_status)
       VALUES (?, ?, '{}', '{"por_pessoa":{}}', 'pending', 'vazia')`,
      [`ficha-${uuidv4()}`, clubSlug]
    );
    return dbGet(`SELECT * FROM script_fichas WHERE club_slug = ?`, [clubSlug]);
  }

  /** Arquivos de MATERIAIS do PROPRIO usuario (nunca os dos socios; anexos de contexto ficam fora). */
  async function listOwnFiles(userId) {
    const rows = await dbAll(
      `SELECT id, user_id, category, file_name, file_type, file_size, created_at
         FROM uploaded_files
        WHERE user_id = ? AND category LIKE 'script_%' AND category <> ?
        ORDER BY created_at ASC`,
      [userId, CTX.CONTEXT_CATEGORY]
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      category: r.category,
      fileName: r.file_name,
      fileType: r.file_type,
      fileSize: r.file_size,
      createdAt: r.created_at,
      mine: true,
    }));
  }

  /** Middleware: carrega o usuario do cohort e a ficha do clube em req.cohort / req.ficha. */
  async function cohortGuard(req, res, next) {
    try {
      const user = await getCohortUser(req.user.userId);
      if (!user || !user.cohort || !user.club_slug) {
        return res.status(403).json({ success: false, enabled: false, message: 'Área disponível apenas para o Exclusive.' });
      }
      if (!user.club_nome) {
        return res.status(403).json({ success: false, enabled: false, message: 'Clube não encontrado. Fale com o Caio.' });
      }
      if (user.club_ativo !== 1) {
        return res.status(403).json({ success: false, enabled: false, message: 'Clube inativo. Fale com o Caio.' });
      }
      req.cohort = user;
      req.ficha = await ensureFicha(user.club_slug);
      next();
    } catch (error) {
      console.error('Error in cohortGuard:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  }

  /** Resumo do job da pessoa para o front (sem payload/result). */
  function jobView(job) {
    if (!job) return null;
    return {
      id: job.id, tipo: job.tipo, status: job.status, attempts: job.attempts,
      created_at: job.created_at, started_at: job.started_at, finished_at: job.finished_at,
    };
  }

  function fichaPayload(ficha, user, files, config, job, extra = {}) {
    const view = SF.buildFichaView(safeJsonParse(ficha.fields, {}), { includeInternal: false });
    const materials = VM.normalizeMaterials(ficha.materials);
    const mine = VM.memberMaterialsView(materials, user.email);
    // Por campo: quantos itens de contexto o clube anexou e se ha job `refinar` na fila para ele
    const counts = extra.contextoCounts || {};
    const refinando = new Set(extra.refinandoKeys || []);
    view.blocos = view.blocos.map((b) => ({
      ...b,
      campos: b.campos.map((c) => ({ ...c, contexto_count: counts[c.key] || 0, refinando: refinando.has(c.key) })),
    }));
    return {
      club: { slug: user.club_slug, nome: user.club_nome },
      ficha_status: ficha.ficha_status,
      // Por pessoa: "submitted" quando ESTE membro clicou em "Enviei o que tinha"
      materials_status: mine.submitted_at ? 'submitted' : 'pending',
      materials_submitted_at: mine.submitted_at,
      materials: mine,
      // Ultimo job de pre-preenchimento DESTA pessoa (queued/running = "ja estamos processando")
      job: jobView(job),
      // Script escrito: versoes do clube + ultimo job `script` do clube (a tela "Seu script" usa)
      script: { ...(extra.scriptSummary || { versoes: 0, ultima: null, aprovada: null }), job: jobView(extra.scriptJob) },
      config,
      prefilled_at: ficha.prefilled_at,
      reviewed_at: ficha.reviewed_at,
      last_user_activity_at: ficha.last_user_activity_at,
      categorias: SCRIPT_CATEGORIES,
      files,
      ...view,
    };
  }

  async function touchActivity(clubSlug, extraSet = '', extraParams = []) {
    await dbRun(
      `UPDATE script_fichas SET last_user_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP ${extraSet} WHERE club_slug = ?`,
      [...extraParams, clubSlug]
    );
  }

  /** Le o JSON de materiais fresco (evita sobrescrever o que um socio salvou entre o guard e o write). */
  async function freshMaterials(clubSlug) {
    const row = await dbGet(`SELECT materials FROM script_fichas WHERE club_slug = ?`, [clubSlug]);
    return VM.normalizeMaterials(row ? row.materials : null);
  }

  // GET /api/script/ficha
  router.get('/api/script/ficha', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const slug = req.cohort.club_slug;
      const [files, config, job, contextoCounts, refinandoKeys, scriptSummary, scriptJob] = await Promise.all([
        listOwnFiles(req.user.userId),
        VM.readCohortConfig(dbAll),
        JOBS.findLatestJob({ dbGet }, { club_slug: slug, email: req.cohort.email }),
        CTX.countByField({ dbAll }, slug),
        JOBS.listRefiningKeys({ dbAll }, slug),
        SV.scriptSummary({ dbGet }, slug),
        JOBS.findLatestJob({ dbGet }, { tipo: 'script', club_slug: slug }),
      ]);
      res.json({
        success: true,
        enabled: true,
        data: fichaPayload(req.ficha, req.cohort, files, config, job, { contextoCounts, refinandoKeys, scriptSummary, scriptJob }),
      });
    } catch (error) {
      console.error('Error in GET /api/script/ficha:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/script/prompt-ia  -> { prompt } gerado por clube ("Peca para a sua IA preencher")
  router.get('/api/script/prompt-ia', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const membros = await dbAll(
        `SELECT cm.email, cm.nome, u.name AS user_name FROM cohort_members cm
           LEFT JOIN users u ON lower(u.email) = cm.email
          WHERE cm.club_slug = ? ORDER BY cm.created_at ASC`,
        [req.cohort.club_slug]
      );
      const nomes = [];
      for (const m of membros) {
        const n = m.nome || m.user_name;
        if (n && !nomes.includes(n)) nomes.push(n);
      }
      const prompt = PIA.buildPromptIA({ mentorNome: req.cohort.name, clubNome: req.cohort.club_nome, membros: nomes });
      res.json({ success: true, prompt, campos: SF.FIELD_KEYS.length });
    } catch (error) {
      console.error('Error in GET /api/script/prompt-ia:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // PUT /api/script/ficha/fields  { updates: { "3.3": { valor, status } } }
  router.put('/api/script/ficha/fields', authMiddleware, cohortGuard, validateBody(scriptFieldsUpdateSchema), async (req, res) => {
    try {
      const { updates } = req.body;
      const current = safeJsonParse(req.ficha.fields, {});
      const { fields, applied, rejected } = SF.applyUpdates(current, updates, req.cohort.email);

      if (applied.length) {
        // Primeira acao do mentor move a ficha para em_revisao; alterar depois de confirmada reabre.
        const nextStatus = ['vazia', 'pre_preenchida', 'confirmada'].includes(req.ficha.ficha_status)
          ? 'em_revisao'
          : req.ficha.ficha_status;
        await dbRun(
          `UPDATE script_fichas
              SET fields = ?, ficha_status = ?, last_user_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE club_slug = ?`,
          [JSON.stringify(fields), nextStatus, req.cohort.club_slug]
        );
      }

      const fresh = await dbGet(`SELECT * FROM script_fichas WHERE club_slug = ?`, [req.cohort.club_slug]);
      const view = SF.buildFichaView(safeJsonParse(fresh.fields, {}));
      res.json({
        success: true,
        applied,
        rejected,
        ficha_status: fresh.ficha_status,
        progresso: view.progresso,
        hoje: view.hoje,
        blocos: view.blocos.map((b) => ({
          numero: b.numero, decididos: b.decididos, total: b.total,
          obrigatorios: b.obrigatorios, obrigatorios_decididos: b.obrigatorios_decididos, fechado: b.fechado,
        })),
      });
    } catch (error) {
      console.error('Error in PUT /api/script/ficha/fields:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  /**
   * Enfileira o job `script` do clube: escreve o script DO ZERO a partir da ficha (1 ativo por clube, junto com `revisar`).
   * motivo = 'complete' (fechou a ficha) | 'gerar-script' (botao "Gerar do zero").
   */
  async function enqueueScriptJob(req, motivo) {
    const key = VM.normEmail(req.cohort.email);
    return JOBS.enqueueJob({ dbGet, dbRun, uuidv4 }, {
      tipo: 'script',
      club_slug: req.cohort.club_slug,
      email: key,
      notify_phone: await lastNotifyPhone(req.cohort.club_slug, key),
      payload: { nome: req.cohort.name || null, motivo, pedido_em: new Date().toISOString() },
    });
  }

  /** WhatsApp que a pessoa deixou no "Confirmar e ir para a ficha" (para o aviso de script pronto), se houver. */
  async function lastNotifyPhone(clubSlug, email) {
    const materials = await freshMaterials(clubSlug);
    const p = materials.por_pessoa[email];
    return p && p.notify_phone ? p.notify_phone : null;
  }

  // POST /api/script/ficha/complete  -> ficha confirmada + job `script` na fila (1 ativo por clube)
  router.post('/api/script/ficha/complete', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const missing = SF.missingRequired(safeJsonParse(req.ficha.fields, {}));
      if (missing.length) {
        return res.status(400).json({
          success: false,
          message: `Ainda faltam ${missing.length} campos obrigatórios com decisão.`,
          faltam: missing,
        });
      }
      await dbRun(
        `UPDATE script_fichas
            SET ficha_status = 'confirmada', reviewed_at = CURRENT_TIMESTAMP,
                last_user_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE club_slug = ?`,
        [req.cohort.club_slug]
      );
      const { job, existing } = await enqueueScriptJob(req, 'complete');
      res.json({ success: true, ficha_status: 'confirmada', job: { ...jobView(job), existing } });
    } catch (error) {
      console.error('Error in POST /api/script/ficha/complete:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/ficha/gerar-script  -> "Gerar do zero": job `script` (ignora versoes e comentarios); so com a ficha confirmada.
  // "Pedir nova versao" a partir dos comentarios e POST /api/script/versoes/:versao/revisar.
  router.post('/api/script/ficha/gerar-script', authMiddleware, cohortGuard, async (req, res) => {
    try {
      if (req.ficha.ficha_status !== 'confirmada') {
        const missing = SF.missingRequired(safeJsonParse(req.ficha.fields, {}));
        return res.status(400).json({
          success: false,
          message: missing.length ? `Feche a ficha antes: faltam ${missing.length} campos obrigatórios.` : 'Feche a ficha antes de pedir o script.',
          faltam: missing,
        });
      }
      const { job, existing } = await enqueueScriptJob(req, 'gerar-script');
      await touchActivity(req.cohort.club_slug);
      res.json({ success: true, job: { ...jobView(job), existing } });
    } catch (error) {
      console.error('Error in POST /api/script/ficha/gerar-script:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/ficha/refinar  { field_key, pedido? }  -> job `refinar` (1 ativo por clube + campo); vale mesmo com o campo decidido
  router.post('/api/script/ficha/refinar', authMiddleware, cohortGuard, validateBody(refinarSchema), async (req, res) => {
    try {
      const key = req.body.field_key;
      if (!SF.FIELD_BY_KEY[key]) return res.status(400).json({ success: false, message: 'Campo desconhecido.' });
      const { job, existing } = await JOBS.enqueueJob({ dbGet, dbRun, uuidv4 }, {
        tipo: 'refinar',
        club_slug: req.cohort.club_slug,
        email: VM.normEmail(req.cohort.email),
        payload: { field_key: key, nome: req.cohort.name || null, pedido: req.body.pedido || '', pedido_em: new Date().toISOString() },
      });
      await touchActivity(req.cohort.club_slug);
      res.json({ success: true, field_key: key, job: { ...jobView(job), existing } });
    } catch (error) {
      console.error('Error in POST /api/script/ficha/refinar:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // ─── Contexto por pergunta (do clube, com autor) ───────────────────────────

  const contextFileUrl = (fileId) => `/api/script/context/files/${encodeURIComponent(fileId)}/download`;

  // GET /api/script/context?field=3.3  -> { items } ; sem field -> { items, por_campo }
  router.get('/api/script/context', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const field = req.query.field ? String(req.query.field) : null;
      if (field && !SF.FIELD_BY_KEY[field]) return res.status(400).json({ success: false, message: 'Campo desconhecido.' });
      const items = await CTX.listContext({ dbAll }, req.cohort.club_slug, { field, fileUrl: contextFileUrl });
      res.json({ success: true, field, items, ...(field ? {} : { por_campo: CTX.groupByField(items) }) });
    } catch (error) {
      console.error('Error in GET /api/script/context:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/context  multipart: field_key, tipo, file?, url?, texto?, legenda?
  router.post('/api/script/context', authMiddleware, cohortGuard, (req, res, next) => {
    uploadContext.single('file')(req, res, (err) => {
      if (!err) return next();
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      res.status(400).json({ success: false, message: tooBig ? 'Arquivo grande demais (máximo 50 MB).' : `Upload inválido: ${err.message}` });
    });
  }, async (req, res) => {
    const dropFile = () => { if (req.file) { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } } };
    try {
      const parsed = CTX.contextBodySchema.safeParse(req.body || {});
      if (!parsed.success) {
        dropFile();
        return res.status(400).json({ success: false, message: 'Dados inválidos', errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
      }
      const v = CTX.validateContextRequest(parsed.data, req.file, SF.FIELD_KEYS);
      if (!v.ok) { dropFile(); return res.status(400).json({ success: false, message: v.message }); }
      const { item } = v;
      const fieldKey = parsed.data.field_key;

      let fileId = null;
      if (req.file) {
        fileId = uuidv4();
        await dbRun(
          `INSERT INTO uploaded_files (id, user_id, category, module, file_name, file_path, file_type, file_size)
           VALUES (?, ?, ?, 'script', ?, ?, ?, ?)`,
          [fileId, req.user.userId, CTX.CONTEXT_CATEGORY, req.file.originalname, req.file.path, req.file.mimetype, req.file.size]
        );
      }

      let transcricao = null;
      let erro = null;
      if (item.tipo === 'audio') {
        const t = await CTX.transcribeAudio(req.file.path, { mimetype: req.file.mimetype, fileName: req.file.originalname, fs });
        if (t.ok) transcricao = t.texto; else erro = t.erro;
      }

      const id = `ctx-${uuidv4()}`;
      await CTX.insertContext({ dbRun }, {
        id, club_slug: req.cohort.club_slug, user_id: req.user.userId, field_key: fieldKey,
        tipo: item.tipo, file_id: fileId, url: item.url, texto: item.texto, legenda: item.legenda,
        transcricao, erro_transcricao: erro,
      });
      await touchActivity(req.cohort.club_slug);
      const saved = await CTX.getContextItem({ dbGet }, req.cohort.club_slug, id, contextFileUrl);
      res.json({
        success: true,
        item: saved,
        ...(erro ? { warning: `Áudio guardado, mas a transcrição falhou (${erro}). Você pode escrever o essencial numa nota.` } : {}),
      });
    } catch (error) {
      dropFile();
      console.error('Error in POST /api/script/context:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // DELETE /api/script/context/:id  (so o autor)
  router.delete('/api/script/context/:id', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const item = await CTX.getContextItem({ dbGet }, req.cohort.club_slug, req.params.id);
      if (!item) return res.status(404).json({ success: false, message: 'Item não encontrado.' });
      if (item.autor_user_id !== req.user.userId) return res.status(403).json({ success: false, message: 'Só quem enviou pode apagar.' });
      await CTX.deleteContext({ dbGet, dbRun }, req.cohort.club_slug, req.params.id, { fs });
      res.json({ success: true, id: req.params.id, field_key: item.field_key });
    } catch (error) {
      console.error('Error in DELETE /api/script/context/:id:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/script/context/files/:fileId/download  (qualquer socio do clube)
  router.get('/api/script/context/files/:fileId/download', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const row = await CTX.getContextFile({ dbGet }, req.cohort.club_slug, req.params.fileId);
      if (!row) return res.status(404).json({ success: false, message: 'Arquivo não encontrado.' });
      if (!fs.existsSync(row.file_path)) return res.status(404).json({ success: false, message: 'Arquivo não encontrado no disco.' });
      const inline = req.query.inline === '1';
      res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(row.file_name)}"`);
      if (row.file_type) res.setHeader('Content-Type', row.file_type);
      fs.createReadStream(row.file_path).pipe(res);
    } catch (error) {
      console.error('Error in GET /api/script/context/files/:fileId/download:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // ─── Versoes do script (do clube) ─────────────────────────────────────────

  function parseVersao(req, res) {
    const n = Number(req.params.versao);
    if (!Number.isInteger(n) || n < 1) { res.status(400).json({ success: false, message: 'Versão inválida.' }); return null; }
    return n;
  }

  // GET /api/script/versoes  -> { versoes: [...sem conteudo], job }
  router.get('/api/script/versoes', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const slug = req.cohort.club_slug;
      const [versoes, job] = await Promise.all([
        SV.listVersions({ dbAll }, slug),
        JOBS.findLatestJob({ dbGet }, { tipo: 'script', club_slug: slug }),
      ]);
      res.json({ success: true, versoes, job: jobView(job), ficha_status: req.ficha.ficha_status });
    } catch (error) {
      console.error('Error in GET /api/script/versoes:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/script/versoes/:versao  -> { versao: { ..., content_md }, comentarios }
  router.get('/api/script/versoes/:versao', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      const versao = await SV.getVersion({ dbGet }, req.cohort.club_slug, n);
      if (!versao) return res.status(404).json({ success: false, message: 'Versão não encontrada.' });
      const comentarios = await SV.listComments({ dbAll }, req.cohort.club_slug, n);
      res.json({ success: true, versao, comentarios });
    } catch (error) {
      console.error('Error in GET /api/script/versoes/:versao:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/script/versoes/:versao/comentarios
  router.get('/api/script/versoes/:versao/comentarios', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      const versao = await SV.getVersion({ dbGet }, req.cohort.club_slug, n, { withContent: false });
      if (!versao) return res.status(404).json({ success: false, message: 'Versão não encontrada.' });
      res.json({ success: true, comentarios: await SV.listComments({ dbAll }, req.cohort.club_slug, n) });
    } catch (error) {
      console.error('Error in GET /api/script/versoes/:versao/comentarios:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/versoes/:versao/comentarios  { passo (0 = geral, 1..7), texto }
  router.post('/api/script/versoes/:versao/comentarios', authMiddleware, cohortGuard, validateBody(SV.scriptCommentSchema), async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      const versao = await SV.getVersion({ dbGet }, req.cohort.club_slug, n, { withContent: false });
      if (!versao) return res.status(404).json({ success: false, message: 'Versão não encontrada.' });
      const comentario = await SV.insertComment({ dbGet, dbRun, uuidv4 }, {
        club_slug: req.cohort.club_slug, versao: n, passo: req.body.passo, texto: req.body.texto, autor_email: req.cohort.email,
      });
      await touchActivity(req.cohort.club_slug);
      res.json({ success: true, comentario });
    } catch (error) {
      console.error('Error in POST /api/script/versoes/:versao/comentarios:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/versoes/:versao/aprovar
  router.post('/api/script/versoes/:versao/aprovar', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      const versao = await SV.approveVersion({ dbGet, dbRun }, req.cohort.club_slug, n, VM.normEmail(req.cohort.email));
      if (!versao) return res.status(404).json({ success: false, message: 'Versão não encontrada.' });
      await touchActivity(req.cohort.club_slug);
      res.json({ success: true, versao });
    } catch (error) {
      console.error('Error in POST /api/script/versoes/:versao/aprovar:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/versoes/:versao/revisar  { pedido? }  -> "Pedir nova versao": job `revisar` (1 ativo por clube, junto com `script`)
  // payload = a versao base (content_md) + TODOS os comentarios dela + pedido livre; o worker escreve a proxima versao a partir disso.
  // Nao exige ficha confirmada: a base e a versao ja escrita.
  router.post('/api/script/versoes/:versao/revisar', authMiddleware, cohortGuard, validateBody(revisarSchema), async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      const slug = req.cohort.club_slug;
      const versao = await SV.getVersion({ dbGet }, slug, n);
      if (!versao) return res.status(404).json({ success: false, message: 'Versão não encontrada.' });
      const comentarios = (await SV.listComments({ dbAll }, slug, n)).map((c) => ({
        passo: c.passo, texto: c.texto, autor: c.autor_nome || c.autor_email || null, created_at: c.created_at,
      }));
      const key = VM.normEmail(req.cohort.email);
      const payload = {
        versao: n,
        content_md: versao.content_md,
        comentarios,
        nome: req.cohort.name || null,
        pedido_em: new Date().toISOString(),
      };
      if (req.body.pedido) payload.pedido = req.body.pedido;
      const { job, existing } = await JOBS.enqueueJob({ dbGet, dbRun, uuidv4 }, {
        tipo: 'revisar',
        club_slug: slug,
        email: key,
        notify_phone: await lastNotifyPhone(slug, key),
        payload,
      });
      await touchActivity(slug);
      res.json({ success: true, versao: n, comentarios: comentarios.length, job: { ...jobView(job), existing } });
    } catch (error) {
      console.error('Error in POST /api/script/versoes/:versao/revisar:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // PUT /api/script/ficha/materials  { links?, observacoes?, acessos? }  (so a entrada da PROPRIA pessoa; chave ausente = mantem)
  router.put('/api/script/ficha/materials', authMiddleware, cohortGuard, validateBody(VM.scriptMaterialsPessoaSchema), async (req, res) => {
    try {
      const key = VM.normEmail(req.cohort.email);
      const materials = await freshMaterials(req.cohort.club_slug);
      const cur = materials.por_pessoa[key] || VM.emptyPessoa();
      const next = { ...cur };
      let leitura = null;
      if (req.body.links !== undefined) next.links = req.body.links;
      if (req.body.observacoes !== undefined) next.observacoes = req.body.observacoes;
      if (req.body.acessos !== undefined) next.acessos = req.body.acessos;
      if (req.body.resposta_ia !== undefined) {
        const texto = String(req.body.resposta_ia);
        if (texto.trim()) {
          leitura = PIA.parseRespostaIA(texto);
          next.resposta_ia = { texto, salvo_em: new Date().toISOString(), resumo: leitura.resumo };
        } else {
          delete next.resposta_ia;
        }
      }
      if (req.cohort.name) next.nome = req.cohort.name;
      materials.por_pessoa[key] = next;
      await touchActivity(req.cohort.club_slug, ', materials = ?', [JSON.stringify(materials)]);
      res.json({ success: true, materials: VM.memberMaterialsView(materials, key), ...(leitura ? { resposta_ia: leitura } : {}) });
    } catch (error) {
      // Nunca logar o body: pode conter login/senha de plataforma.
      console.error('Error in PUT /api/script/ficha/materials:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/ficha/materials/submit  { notify_phone?, notify? }
  // "Confirmar e ir para a ficha": marca o submit DESTA pessoa (o clube vira submitted com o primeiro)
  // e enfileira 1 job de pre-preenchimento para o worker. Job ativo da mesma pessoa = devolve o existente.
  router.post('/api/script/ficha/materials/submit', authMiddleware, cohortGuard, validateBody(VM.scriptMaterialsSubmitSchema), async (req, res) => {
    try {
      const phone = VM.normalizePhone(req.body.notify_phone);
      if (!phone.ok) return res.status(400).json({ success: false, message: phone.message, errors: [phone.message] });
      const notifyPhone = req.body.notify === false ? null : phone.phone;

      const key = VM.normEmail(req.cohort.email);
      const materials = await freshMaterials(req.cohort.club_slug);
      const cur = materials.por_pessoa[key] || VM.emptyPessoa();
      const submittedAt = new Date().toISOString();
      const next = { ...cur, submitted_at: submittedAt, ...(req.cohort.name ? { nome: req.cohort.name } : {}) };
      if (notifyPhone) next.notify_phone = notifyPhone;
      materials.por_pessoa[key] = next;
      await dbRun(
        `UPDATE script_fichas
            SET materials = ?, materials_status = 'submitted',
                materials_submitted_at = COALESCE(materials_submitted_at, CURRENT_TIMESTAMP),
                last_user_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE club_slug = ?`,
        [JSON.stringify(materials), req.cohort.club_slug]
      );

      const { job, existing } = await JOBS.enqueueJob({ dbGet, dbRun, uuidv4 }, {
        tipo: 'prefill',
        club_slug: req.cohort.club_slug,
        email: key,
        notify_phone: notifyPhone,
        payload: { nome: req.cohort.name || null, submitted_at: submittedAt, notify: req.body.notify !== false },
      });

      res.json({
        success: true,
        materials_status: 'submitted',
        materials_submitted_at: submittedAt,
        notify_phone: notifyPhone,
        job: { ...jobView(job), existing },
      });
    } catch (error) {
      console.error('Error in POST /api/script/ficha/materials/submit:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/script/materials/files  (so os arquivos da propria pessoa)
  router.get('/api/script/materials/files', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const files = await listOwnFiles(req.user.userId);
      res.json({ success: true, data: files });
    } catch (error) {
      console.error('Error in GET /api/script/materials/files:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/script/materials/files/:id/download  (so o dono; socio recebe 404)
  router.get('/api/script/materials/files/:id/download', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const row = await dbGet(
        `SELECT * FROM uploaded_files WHERE id = ? AND user_id = ? AND category LIKE 'script_%'`,
        [req.params.id, req.user.userId]
      );
      if (!row) return res.status(404).json({ success: false, message: 'Arquivo não encontrado.' });
      if (!fs.existsSync(row.file_path)) return res.status(404).json({ success: false, message: 'Arquivo não encontrado no disco.' });
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.file_name)}"`);
      if (row.file_type) res.setHeader('Content-Type', row.file_type);
      fs.createReadStream(row.file_path).pipe(res);
    } catch (error) {
      console.error('Error in GET /api/script/materials/files/:id/download:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  return router;
};
