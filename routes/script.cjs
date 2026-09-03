const { Router } = require('express');
const SF = require('../utils/script-ficha.cjs');
const { scriptFieldsUpdateSchema, validateBody } = require('../utils/validation.cjs');
const VM = require('../utils/validation-materials.cjs');

/**
 * Script 7 Passos (membro): Materiais + Ficha do Script.
 * Ficha (campos) e por CLUBE: socios do mesmo clube leem e editam a mesma ficha.
 * Materiais (arquivos, links, observacoes, acessos) sao por PESSOA: cada membro ve so o que ele mesmo enviou;
 * socios nao veem uns aos outros; so o admin ve tudo (routes/admin-cohort.cjs).
 * Habilitado so para users.cohort != NULL (403 { enabled: false } caso contrario).
 */
module.exports = function createScriptRoutes({ dbGet, dbRun, dbAll, authMiddleware, uuidv4, fs, path, safeJsonParse }) {
  const router = Router();

  VM.ensureCohortConfigTable(dbRun).catch((e) => console.error('cohort_config DDL error:', e.message));

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

  /** Arquivos do PROPRIO usuario (nunca os dos socios). */
  async function listOwnFiles(userId) {
    const rows = await dbAll(
      `SELECT id, user_id, category, file_name, file_type, file_size, created_at
         FROM uploaded_files
        WHERE user_id = ? AND category LIKE 'script_%'
        ORDER BY created_at ASC`,
      [userId]
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

  function fichaPayload(ficha, user, files, config) {
    const view = SF.buildFichaView(safeJsonParse(ficha.fields, {}), { includeInternal: false });
    const materials = VM.normalizeMaterials(ficha.materials);
    const mine = VM.memberMaterialsView(materials, user.email);
    return {
      club: { slug: user.club_slug, nome: user.club_nome },
      ficha_status: ficha.ficha_status,
      // Por pessoa: "submitted" quando ESTE membro clicou em "Enviei o que tinha"
      materials_status: mine.submitted_at ? 'submitted' : 'pending',
      materials_submitted_at: mine.submitted_at,
      materials: mine,
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
      const [files, config] = await Promise.all([listOwnFiles(req.user.userId), VM.readCohortConfig(dbAll)]);
      res.json({ success: true, enabled: true, data: fichaPayload(req.ficha, req.cohort, files, config) });
    } catch (error) {
      console.error('Error in GET /api/script/ficha:', error);
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

  // POST /api/script/ficha/complete
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
      res.json({ success: true, ficha_status: 'confirmada' });
    } catch (error) {
      console.error('Error in POST /api/script/ficha/complete:', error);
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
      if (req.body.links !== undefined) next.links = req.body.links;
      if (req.body.observacoes !== undefined) next.observacoes = req.body.observacoes;
      if (req.body.acessos !== undefined) next.acessos = req.body.acessos;
      if (req.cohort.name) next.nome = req.cohort.name;
      materials.por_pessoa[key] = next;
      await touchActivity(req.cohort.club_slug, ', materials = ?', [JSON.stringify(materials)]);
      res.json({ success: true, materials: VM.memberMaterialsView(materials, key) });
    } catch (error) {
      // Nunca logar o body: pode conter login/senha de plataforma.
      console.error('Error in PUT /api/script/ficha/materials:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/ficha/materials/submit  ("Enviei o que tinha", por pessoa; o clube vira submitted com o primeiro)
  router.post('/api/script/ficha/materials/submit', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const key = VM.normEmail(req.cohort.email);
      const materials = await freshMaterials(req.cohort.club_slug);
      const cur = materials.por_pessoa[key] || VM.emptyPessoa();
      const submittedAt = new Date().toISOString();
      materials.por_pessoa[key] = { ...cur, submitted_at: submittedAt, ...(req.cohort.name ? { nome: req.cohort.name } : {}) };
      await dbRun(
        `UPDATE script_fichas
            SET materials = ?, materials_status = 'submitted',
                materials_submitted_at = COALESCE(materials_submitted_at, CURRENT_TIMESTAMP),
                last_user_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE club_slug = ?`,
        [JSON.stringify(materials), req.cohort.club_slug]
      );
      res.json({ success: true, materials_status: 'submitted', materials_submitted_at: submittedAt });
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
