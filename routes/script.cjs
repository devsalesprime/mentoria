const { Router } = require('express');
const SF = require('../utils/script-ficha.cjs');
const { scriptFieldsUpdateSchema, scriptMaterialsSchema, validateBody } = require('../utils/validation.cjs');

/**
 * Script 7 Passos (membro): Materiais + Ficha do Script.
 * Tudo por CLUBE: socios do mesmo clube leem e editam a mesma ficha.
 * Habilitado so para users.cohort != NULL (403 { enabled: false } caso contrario).
 */
module.exports = function createScriptRoutes({ dbGet, dbRun, dbAll, authMiddleware, uuidv4, fs, path, safeJsonParse }) {
  const router = Router();

  const SCRIPT_CATEGORIES = [
    'script_transcricao_venda',
    'script_crm',
    'script_apostila_slides',
    'script_proposta_roteiro',
    'script_outros',
  ];

  function emptyMaterials() {
    return { links: [], observacoes: '' };
  }

  function parseMaterials(raw) {
    const m = safeJsonParse(raw, {});
    return {
      links: Array.isArray(m.links) ? m.links : [],
      observacoes: typeof m.observacoes === 'string' ? m.observacoes : '',
    };
  }

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
       VALUES (?, ?, '{}', ?, 'pending', 'vazia')`,
      [`ficha-${uuidv4()}`, clubSlug, JSON.stringify(emptyMaterials())]
    );
    return dbGet(`SELECT * FROM script_fichas WHERE club_slug = ?`, [clubSlug]);
  }

  async function listClubFiles(clubSlug, currentUserId) {
    const rows = await dbAll(
      `SELECT f.id, f.user_id, f.category, f.file_name, f.file_type, f.file_size, f.created_at, u.email AS owner_email, u.name AS owner_name
         FROM uploaded_files f
         JOIN users u ON u.id = f.user_id
        WHERE u.club_slug = ? AND f.category LIKE 'script_%'
        ORDER BY f.created_at ASC`,
      [clubSlug]
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      category: r.category,
      fileName: r.file_name,
      fileType: r.file_type,
      fileSize: r.file_size,
      createdAt: r.created_at,
      ownerEmail: r.owner_email,
      ownerName: r.owner_name,
      mine: r.user_id === currentUserId,
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
      req.cohort = user;
      req.ficha = await ensureFicha(user.club_slug);
      next();
    } catch (error) {
      console.error('Error in cohortGuard:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  }

  function fichaPayload(ficha, user, files) {
    const view = SF.buildFichaView(safeJsonParse(ficha.fields, {}), { includeInternal: false });
    return {
      club: { slug: user.club_slug, nome: user.club_nome },
      ficha_status: ficha.ficha_status,
      materials_status: ficha.materials_status,
      materials_submitted_at: ficha.materials_submitted_at,
      materials: parseMaterials(ficha.materials),
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

  // GET /api/script/ficha
  router.get('/api/script/ficha', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const files = await listClubFiles(req.cohort.club_slug, req.user.userId);
      res.json({ success: true, enabled: true, data: fichaPayload(req.ficha, req.cohort, files) });
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

  // PUT /api/script/ficha/materials  { links: [{url, rotulo, tipo}], observacoes }
  router.put('/api/script/ficha/materials', authMiddleware, cohortGuard, validateBody(scriptMaterialsSchema), async (req, res) => {
    try {
      const materials = { links: req.body.links, observacoes: req.body.observacoes || '' };
      await touchActivity(req.cohort.club_slug, ', materials = ?', [JSON.stringify(materials)]);
      res.json({ success: true, materials });
    } catch (error) {
      console.error('Error in PUT /api/script/ficha/materials:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/ficha/materials/submit  ("Enviei o que tinha")
  router.post('/api/script/ficha/materials/submit', authMiddleware, cohortGuard, async (req, res) => {
    try {
      await dbRun(
        `UPDATE script_fichas
            SET materials_status = 'submitted', materials_submitted_at = CURRENT_TIMESTAMP,
                last_user_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE club_slug = ?`,
        [req.cohort.club_slug]
      );
      const fresh = await dbGet(`SELECT materials_status, materials_submitted_at FROM script_fichas WHERE club_slug = ?`, [req.cohort.club_slug]);
      res.json({ success: true, materials_status: fresh.materials_status, materials_submitted_at: fresh.materials_submitted_at });
    } catch (error) {
      console.error('Error in POST /api/script/ficha/materials/submit:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/script/materials/files  (arquivos de todos os socios do clube)
  router.get('/api/script/materials/files', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const files = await listClubFiles(req.cohort.club_slug, req.user.userId);
      res.json({ success: true, data: files });
    } catch (error) {
      console.error('Error in GET /api/script/materials/files:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/script/materials/files/:id/download  (qualquer socio do clube)
  router.get('/api/script/materials/files/:id/download', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const row = await dbGet(
        `SELECT f.* FROM uploaded_files f JOIN users u ON u.id = f.user_id
          WHERE f.id = ? AND u.club_slug = ? AND f.category LIKE 'script_%'`,
        [req.params.id, req.cohort.club_slug]
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
