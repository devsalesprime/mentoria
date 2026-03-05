const { Router } = require('express');
const { VALID_SECTIONS, SECTION_KEY_MAP, SECTION_ALT_KEY_MAP } = require('./shared/brand-brain-constants.cjs');

module.exports = function createAdminPipelineRoutes({ db, dbGet, dbRun, dbAll, authMiddleware, adminMiddleware, uuidv4, safeJsonParse }) {
  const router = Router();

  // GET /api/admin/pipeline — List all users with pipeline status — supports ?page=1&limit=20
  router.get('/api/admin/pipeline', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      console.log('📋 [Admin] Listando pipeline de todos os usuários');

      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const offset = (page - 1) * limit;

      const countRow = await dbGet('SELECT COUNT(*) as total FROM diagnostic_data', []);
      const total = countRow ? countRow.total : 0;
      const pages = Math.ceil(total / limit);

      const rows = await dbAll(
        `SELECT
          d.id, d.id AS userId, d.name, d.email, d.status AS diagnostic_status, d.is_legacy, d.updated_at, d.submitted_at,
          p.research_status, p.brand_brain_status, p.assets_status,
          p.research_completed_at, p.brand_brain_completed_at, p.assets_delivered_at
         FROM diagnostic_data d
         LEFT JOIN pipeline p ON d.user_id = p.user_id
         ORDER BY d.updated_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      res.json({
        success: true,
        data: rows,
        pagination: { page, limit, total, pages }
      });
    } catch (error) {
      console.error('❌ Erro em GET /api/admin/pipeline:', error);
      res.status(500).json({ success: false, message: 'Erro ao listar pipeline.' });
    }
  });

  // GET /api/admin/pipeline/:userId — Full pipeline detail for one user
  router.get('/api/admin/pipeline/:userId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      console.log(`📋 [Admin] Buscando pipeline do usuário: ${userId}`);

      const row = await dbGet(
        `SELECT
          d.id, d.name, d.email, d.status AS diagnostic_status, d.updated_at, d.submitted_at,
          p.research_dossier, p.research_status, p.research_completed_at,
          p.brand_brain, p.brand_brain_status, p.brand_brain_version, p.brand_brain_completed_at,
          p.section_approvals, p.review_notes, p.expert_notes,
          p.assets, p.assets_status, p.assets_delivered_at
         FROM diagnostic_data d
         LEFT JOIN pipeline p ON d.user_id = p.user_id
         WHERE d.id = ?`,
        [userId]
      );

      if (!row) {
        return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
      }

      // For research_dossier: if it's a URL string, pass through as-is; otherwise JSON parse
      const rawResearch = row.research_dossier || null;
      const parsedResearch = rawResearch
        ? (rawResearch.trim().startsWith('{') || rawResearch.trim().startsWith('[')
          ? safeJsonParse(rawResearch, null)
          : rawResearch)  // URL or plain text — return as string
        : null;

      const data = {
        ...row,
        research_dossier: parsedResearch,
        brand_brain: row.brand_brain ? safeJsonParse(row.brand_brain, null) : null,
        section_approvals: row.section_approvals ? safeJsonParse(row.section_approvals, null) : null,
        review_notes: row.review_notes ? safeJsonParse(row.review_notes, null) : null,
        expert_notes: row.expert_notes ? safeJsonParse(row.expert_notes, null) : null,
        assets: row.assets ? safeJsonParse(row.assets, null) : null,
      };

      res.json({ success: true, data });
    } catch (error) {
      console.error('❌ Erro em GET /api/admin/pipeline/:userId:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar pipeline.' });
    }
  });

  // POST /api/pipeline/:userId/brand-brain — Save/update Brand Brain (admin only)
  // Accepts either:
  //   (A) New format: { section1_offer, section2_icp, section3_positioning, section4_copy, mentorName?, programName? }
  //   (B) Legacy format: { brandBrain: <object> }
  //   (C) Status-only: { status }
  router.post('/api/pipeline/:userId/brand-brain', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      let { brandBrain, status, section1_offer, section2_icp, section3_positioning, section4_copy, section5_method, mentorName, programName } = req.body;
      console.log(`🧠 [Admin] Salvando Brand Brain para usuário: ${userId}`);

      // (A) New per-section markdown format → construct standard JSON object
      if (section1_offer !== undefined || section2_icp !== undefined || section3_positioning !== undefined || section4_copy !== undefined || section5_method !== undefined) {
        brandBrain = {
          section1_offer:       section1_offer       || '',
          section2_icp:         section2_icp         || '',
          section3_positioning: section3_positioning || '',
          section4_copy:        section4_copy        || '',
          section5_method:      section5_method      || '',
          mentorName:           mentorName           || '',
          programName:          programName          || '',
          version:              '2.0',
          generatedAt:          new Date().toISOString(),
        };
      }

      const VALID_TRANSITIONS = {
        'pending': ['generated'],
        'generated': ['danilo_review', 'mentor_review'],
        'danilo_review': ['mentor_review'],
      };

      const user = await dbGet('SELECT id, user_id FROM diagnostic_data WHERE id = ?', [userId]);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
      }
      const userUid = user.user_id;

      const pipeline = await dbGet('SELECT id, brand_brain_status, section_approvals FROM pipeline WHERE user_id = ?', [userUid]);

      // Validate status transition if status provided
      let newStatus = null;
      if (status) {
        const currentStatus = pipeline ? (pipeline.brand_brain_status || 'pending') : 'pending';
        const allowed = VALID_TRANSITIONS[currentStatus];
        if (!allowed || !allowed.includes(status)) {
          return res.status(400).json({
            success: false,
            message: `Transição inválida: ${currentStatus} → ${status}.`
          });
        }
        newStatus = status;
      }

      if (!pipeline) {
        // INSERT new pipeline row
        const pipelineId = uuidv4();
        const bbStatus = newStatus || (brandBrain ? 'generated' : 'pending');
        const initialApprovals = brandBrain ? JSON.stringify({ s1: 'pending', s2: 'pending', s3: 'pending', s4: 'pending', s5: 'pending' }) : null;

        await dbRun(
          `INSERT INTO pipeline (id, user_id, brand_brain, brand_brain_status, section_approvals, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [pipelineId, userUid, brandBrain ? JSON.stringify(brandBrain) : null, bbStatus, initialApprovals]
        );

        console.log(`✅ Pipeline criada e Brand Brain salvo para ${userId}`);
        res.json({ success: true, message: 'Brand Brain salvo com sucesso.', brand_brain_status: bbStatus });
      } else {
        // UPDATE existing row — build updates/params cleanly
        const updates = [];
        const params = [];

        // Determine final status to set
        const currentBbStatus = pipeline.brand_brain_status || 'pending';
        let finalStatus = newStatus; // explicit transition takes priority
        if (!finalStatus && brandBrain && currentBbStatus === 'pending') {
          finalStatus = 'generated'; // auto-set when saving brand brain for first time
        }

        if (brandBrain) {
          updates.push('brand_brain = ?');
          params.push(JSON.stringify(brandBrain));
          // Initialize approvals only when transitioning from pending
          if (currentBbStatus === 'pending') {
            updates.push('section_approvals = ?');
            params.push(JSON.stringify({ s1: 'pending', s2: 'pending', s3: 'pending', s4: 'pending', s5: 'pending' }));
          }
        }

        if (finalStatus) {
          updates.push('brand_brain_status = ?');
          params.push(finalStatus);
        }

        if (updates.length === 0) {
          return res.status(400).json({ success: false, message: 'Nenhum dado para atualizar.' });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(userUid);

        await dbRun(
          `UPDATE pipeline SET ${updates.join(', ')} WHERE user_id = ?`,
          params
        );

        console.log(`✅ Brand Brain atualizado para ${userId}`);
        res.json({ success: true, message: 'Brand Brain atualizado com sucesso.', brand_brain_status: finalStatus || currentBbStatus });
      }
    } catch (error) {
      console.error('❌ Erro em POST /api/pipeline/:userId/brand-brain:', error);
      res.status(500).json({ success: false, message: 'Erro ao salvar Brand Brain.' });
    }
  });

  // POST /api/pipeline/:userId/assets — Save generated assets (admin only)
  router.post('/api/pipeline/:userId/assets', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      let { assets } = req.body;
      console.log(`📦 [Admin] Salvando assets para usuário: ${userId}`);

      if (!assets) {
        return res.status(400).json({ success: false, message: 'Campo assets é obrigatório.' });
      }

      // Unwrap double-nesting: if admin pasted { "assets": { "readyToSell":... } }
      // the frontend wraps it again as { assets: parsed }, resulting in assets.assets
      if (assets.assets && (assets.assets.readyToSell || assets.assets.bonus)) {
        assets = assets.assets;
      }

      const user = await dbGet('SELECT id, user_id FROM diagnostic_data WHERE id = ?', [userId]);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
      }
      const userUid = user.user_id;

      const pipeline = await dbGet('SELECT id FROM pipeline WHERE user_id = ?', [userUid]);

      if (!pipeline) {
        const pipelineId = uuidv4();
        await dbRun(
          `INSERT INTO pipeline (id, user_id, assets, assets_status, updated_at)
           VALUES (?, ?, ?, 'ready', CURRENT_TIMESTAMP)`,
          [pipelineId, userUid, JSON.stringify(assets)]
        );

        console.log(`✅ Assets salvos para ${userId}`);
        res.json({ success: true, message: 'Assets salvos com sucesso.' });
      } else {
        // Preserve 'delivered' status if assets were already delivered — allows
        // admin to correct content without breaking the mentor's view.
        // Only set to 'ready' if not yet delivered (pending → ready).
        const statusRow = await dbGet('SELECT assets_status FROM pipeline WHERE user_id = ?', [userUid]);
        const newStatus = statusRow && statusRow.assets_status === 'delivered' ? 'delivered' : 'ready';

        await dbRun(
          `UPDATE pipeline SET assets = ?, assets_status = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
          [JSON.stringify(assets), newStatus, userUid]
        );

        console.log(`✅ Assets atualizados para ${userId} (status: ${newStatus})`);
        res.json({ success: true, message: 'Assets atualizados com sucesso.' });
      }
    } catch (error) {
      console.error('❌ Erro em POST /api/pipeline/:userId/assets:', error);
      res.status(500).json({ success: false, message: 'Erro ao salvar assets.' });
    }
  });

  // POST /api/pipeline/:userId/deliver — Mark assets as delivered (admin only)
  router.post('/api/pipeline/:userId/deliver', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      console.log(`🚀 [Admin] Entregando assets para usuário: ${userId}`);

      const user = await dbGet('SELECT id, user_id FROM diagnostic_data WHERE id = ?', [userId]);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
      }
      const userUid = user.user_id;

      const pipeline = await dbGet('SELECT id, assets_status FROM pipeline WHERE user_id = ?', [userUid]);

      if (!pipeline || pipeline.assets_status === 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Assets não estão prontos para entrega. Status atual: ' + (pipeline ? pipeline.assets_status : 'sem pipeline')
        });
      }

      await dbRun(
        `UPDATE pipeline SET assets_status = 'delivered', assets_delivered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
        [userUid]
      );

      console.log(`✅ Assets entregues para ${userId}`);
      res.json({ success: true, message: 'Assets entregues com sucesso.' });
    } catch (error) {
      console.error('❌ Erro em POST /api/pipeline/:userId/deliver:', error);
      res.status(500).json({ success: false, message: 'Erro ao entregar assets.' });
    }
  });

  // POST /api/pipeline/:userId/research — Save research dossier (admin only)
  // Accepts either a URL string (new format) or a JSON object (legacy format)
  router.post('/api/pipeline/:userId/research', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      const { researchDossier, researchLink } = req.body;
      console.log(`🔬 [Admin] Salvando pesquisa para usuário: ${userId}`);

      // Support both new (researchLink URL) and legacy (researchDossier JSON) fields
      const inputValue = researchLink !== undefined ? researchLink : researchDossier;

      if (!inputValue) {
        return res.status(400).json({ success: false, message: 'Campo researchDossier ou researchLink é obrigatório.' });
      }

      // Determine how to store: URL strings stored as-is, objects/JSON stringified
      const valueToStore = typeof inputValue === 'string' ? inputValue : JSON.stringify(inputValue);

      const user = await dbGet('SELECT id, user_id FROM diagnostic_data WHERE id = ?', [userId]);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
      }
      const userUid = user.user_id;

      const pipeline = await dbGet('SELECT id FROM pipeline WHERE user_id = ?', [userUid]);

      if (!pipeline) {
        const pipelineId = uuidv4();
        await dbRun(
          `INSERT INTO pipeline (id, user_id, research_dossier, research_status, research_completed_at, updated_at)
           VALUES (?, ?, ?, 'complete', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [pipelineId, userUid, valueToStore]
        );

        console.log(`✅ Pesquisa salva para ${userId}`);
        res.json({ success: true, message: 'Pesquisa salva com sucesso.' });
      } else {
        await dbRun(
          `UPDATE pipeline SET research_dossier = ?, research_status = 'complete', research_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
          [valueToStore, userUid]
        );

        console.log(`✅ Pesquisa atualizada para ${userId}`);
        res.json({ success: true, message: 'Pesquisa atualizada com sucesso.' });
      }
    } catch (error) {
      console.error('❌ Erro em POST /api/pipeline/:userId/research:', error);
      res.status(500).json({ success: false, message: 'Erro ao salvar pesquisa.' });
    }
  });

  // POST /api/admin/pipeline/:userId/brand-brain/section/:sectionId/revise — Revise a single BB section (admin only)
  router.post('/api/admin/pipeline/:userId/brand-brain/section/:sectionId/revise', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { userId, sectionId } = req.params;
      const { content } = req.body;
      console.log(`✏️ [Admin] Revisando seção ${sectionId} do Brand Brain para: ${userId}`);

      if (!VALID_SECTIONS.includes(sectionId)) {
        return res.status(400).json({ success: false, message: `Seção inválida: ${sectionId}. Use: s1, s2, s3, s4 ou s5.` });
      }

      if (!content) {
        return res.status(400).json({ success: false, message: 'Campo content é obrigatório.' });
      }

      const user = await dbGet('SELECT id, user_id FROM diagnostic_data WHERE id = ?', [userId]);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
      }
      const userUid = user.user_id;

      const pipeline = await dbGet('SELECT brand_brain, brand_brain_status, brand_brain_version, section_approvals, review_notes FROM pipeline WHERE user_id = ?', [userUid]);

      if (!pipeline) {
        return res.status(404).json({ success: false, message: 'Pipeline não encontrada.' });
      }

      const brandBrain = safeJsonParse(pipeline.brand_brain);
      const approvals = { s1: 'pending', s2: 'pending', s3: 'pending', s4: 'pending', s5: 'pending', ...safeJsonParse(pipeline.section_approvals) };
      const reviewNotes = safeJsonParse(pipeline.review_notes);

      // Update the section content
      const sectionKey = SECTION_KEY_MAP[sectionId];
      const altKey = SECTION_ALT_KEY_MAP[sectionId];
      const existingKey = (sectionKey in brandBrain) ? sectionKey : (altKey && altKey in brandBrain) ? altKey : sectionKey;
      if (typeof brandBrain[existingKey] === 'object' && brandBrain[existingKey] !== null) {
        brandBrain[existingKey].content = content;
      } else {
        brandBrain[existingKey] = { content };
      }

      // Set status to 'revised' and clear review notes for this section
      approvals[sectionId] = 'revised';
      delete reviewNotes[sectionId];

      const newVersion = (pipeline.brand_brain_version || 0) + 1;

      await dbRun(
        `UPDATE pipeline SET brand_brain = ?, section_approvals = ?, review_notes = ?, brand_brain_version = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
        [JSON.stringify(brandBrain), JSON.stringify(approvals), JSON.stringify(reviewNotes), newVersion, userUid]
      );

      console.log(`✅ Seção ${sectionId} revisada para ${userId} (v${newVersion})`);
      res.json({
        success: true,
        message: `Seção ${sectionId} revisada com sucesso.`,
        sectionApprovals: approvals,
        version: newVersion,
      });
    } catch (error) {
      console.error('❌ Erro em POST /api/admin/pipeline/:userId/brand-brain/section/:sectionId/revise:', error);
      res.status(500).json({ success: false, message: 'Erro ao salvar revisão.' });
    }
  });

  // POST /api/admin/pipeline/:userId/expert-notes — Save expert notes for Brand Brain sections
  router.post('/api/admin/pipeline/:userId/expert-notes', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      const { notes } = req.body;
      console.log(`📋 Salvando notas do especialista para: ${userId}`);

      if (!notes || typeof notes !== 'object') {
        return res.status(400).json({ success: false, message: 'Campo notes é obrigatório (objeto com chaves s1-s4).' });
      }

      const user = await dbGet('SELECT user_id FROM diagnostic_data WHERE id = ?', [userId]);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
      }
      const userUid = user.user_id;

      await dbRun(
        'UPDATE pipeline SET expert_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
        [JSON.stringify(notes), userUid]
      );

      console.log(`✅ Notas do especialista salvas para ${userId}`);
      res.json({ success: true, message: 'Notas salvas com sucesso.' });
    } catch (error) {
      console.error('❌ Erro em POST /api/admin/pipeline/:userId/expert-notes:', error);
      res.status(500).json({ success: false, message: 'Erro ao salvar notas do especialista.' });
    }
  });

  // POST /api/admin/pipeline/:userId/set-legacy — Tag user as legacy (completed old long diagnostic)
  router.post('/api/admin/pipeline/:userId/set-legacy', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      const { isLegacy } = req.body;
      const legacyValue = isLegacy === false ? 0 : 1;

      console.log(`🏷️ [Admin] Setting legacy=${legacyValue} for: ${userId}`);

      const user = await dbGet('SELECT user_id FROM diagnostic_data WHERE id = ?', [userId]);
      if (!user) {
        return res.status(404).json({ success: false, message: 'Usuario nao encontrado.' });
      }

      await dbRun(
        `UPDATE diagnostic_data SET is_legacy = ?, status = CASE WHEN ? = 1 THEN 'submitted' ELSE status END, submitted_at = CASE WHEN ? = 1 AND submitted_at IS NULL THEN CURRENT_TIMESTAMP ELSE submitted_at END, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
        [legacyValue, legacyValue, legacyValue, user.user_id]
      );

      console.log(`✅ Legacy flag set for ${userId}`);
      res.json({ success: true, message: `Usuario marcado como legacy=${legacyValue}.` });
    } catch (error) {
      console.error('❌ Erro em POST /api/admin/pipeline/:userId/set-legacy:', error);
      res.status(500).json({ success: false, message: 'Erro ao marcar usuario como legacy.' });
    }
  });

  return router;
};
