const { Router } = require('express');
const { VALID_SECTIONS, SECTION_KEY_MAP, SECTION_ALT_KEY_MAP } = require('./shared/brand-brain-constants.cjs');

module.exports = function createBrandBrainRoutes({ db, dbGet, dbRun, dbAll, authMiddleware, safeJsonParse }) {
  const router = Router();

  // GET /api/brand-brain — Get my Brand Brain
  router.get('/api/brand-brain', authMiddleware, async (req, res) => {
    try {
      const { userId } = req.user;
      console.log(`🧠 Buscando Brand Brain do mentor: ${userId}`);

      const row = await dbGet('SELECT brand_brain, brand_brain_status, research_status, section_approvals, review_notes, expert_notes FROM pipeline WHERE user_id = ?', [userId]);

      if (!row) {
        return res.json({ success: true, data: null });
      }

      const VISIBLE_STATUSES = ['mentor_review', 'approved'];
      if (!VISIBLE_STATUSES.includes(row.brand_brain_status)) {
        // Brand Brain not ready yet — still return pipeline progress info
        return res.json({ success: true, data: {
          brandBrainStatus: row.brand_brain_status || 'pending',
          researchStatus: row.research_status || 'pending',
        }});
      }

      res.json({
        success: true,
        data: {
          name: req.user.name || null,
          brandBrain: row.brand_brain ? safeJsonParse(row.brand_brain, null) : null,
          brandBrainStatus: row.brand_brain_status,
          researchStatus: row.research_status || 'pending',
          sectionApprovals: row.section_approvals ? safeJsonParse(row.section_approvals, null) : null,
          reviewNotes: row.review_notes ? safeJsonParse(row.review_notes, null) : null,
          expertNotes: row.expert_notes ? safeJsonParse(row.expert_notes, null) : null,
        }
      });
    } catch (error) {
      console.error('❌ Erro em GET /api/brand-brain:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar Brand Brain.' });
    }
  });

  // POST /api/brand-brain/approve-all — Lock Brand Brain (must come before /section/:id routes)
  router.post('/api/brand-brain/approve-all', authMiddleware, async (req, res) => {
    try {
      const { userId } = req.user;
      console.log(`🔒 Aprovando todas as seções para mentor: ${userId}`);

      const row = await dbGet('SELECT id, brand_brain_status, section_approvals FROM pipeline WHERE user_id = ?', [userId]);

      if (!row || row.brand_brain_status !== 'mentor_review') {
        return res.status(400).json({ success: false, message: 'Brand Brain não está disponível para aprovação final.' });
      }

      const DEFAULT_APPROVALS = { s1: 'pending', s2: 'pending', s3: 'pending', s4: 'pending', s5: 'pending' };
      const approvals = { ...DEFAULT_APPROVALS, ...safeJsonParse(row.section_approvals) };
      const SECTIONS = ['s1', 's2', 's3', 's4', 's5'];
      const unapproved = SECTIONS.filter(s => approvals[s] !== 'approved');

      if (unapproved.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Seções ainda não aprovadas: ${unapproved.join(', ')}. Todas as seções devem ser aprovadas antes de finalizar.`,
          unapprovedSections: unapproved
        });
      }

      await dbRun(
        `UPDATE pipeline SET brand_brain_status = 'approved', brand_brain_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
        [userId]
      );

      console.log(`✅ Brand Brain aprovado e bloqueado para ${userId}`);
      res.json({ success: true, message: 'Brand Brain aprovado e bloqueado com sucesso.' });
    } catch (error) {
      console.error('❌ Erro em POST /api/brand-brain/approve-all:', error);
      res.status(500).json({ success: false, message: 'Erro ao aprovar Brand Brain.' });
    }
  });

  // POST /api/brand-brain/section/:id/approve — Approve a single section
  router.post('/api/brand-brain/section/:id/approve', authMiddleware, async (req, res) => {
    try {
      const { userId } = req.user;
      const { id: sectionId } = req.params;
      const { notes } = req.body || {};
      console.log(`✅ Aprovando seção ${sectionId} para mentor: ${userId}`);

      if (!VALID_SECTIONS.includes(sectionId)) {
        return res.status(400).json({ success: false, message: `Seção inválida: ${sectionId}. Use: s1, s2, s3, s4 ou s5.` });
      }

      const row = await dbGet('SELECT id, brand_brain_status, section_approvals, review_notes FROM pipeline WHERE user_id = ?', [userId]);

      if (!row || row.brand_brain_status !== 'mentor_review') {
        return res.status(400).json({ success: false, message: 'Brand Brain não está disponível para revisão.' });
      }

      const approvals = { s1: 'pending', s2: 'pending', s3: 'pending', s4: 'pending', s5: 'pending', ...safeJsonParse(row.section_approvals) };

      if (approvals[sectionId] === 'approved') {
        return res.status(400).json({ success: false, message: `Seção ${sectionId} já foi aprovada.` });
      }

      approvals[sectionId] = 'approved';

      // Save observations alongside approval if provided
      const reviewNotes = safeJsonParse(row.review_notes);
      if (notes && notes.trim()) {
        reviewNotes[sectionId] = notes;
      }

      await dbRun(
        'UPDATE pipeline SET section_approvals = ?, review_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
        [JSON.stringify(approvals), JSON.stringify(reviewNotes), userId]
      );

      console.log(`✅ Seção ${sectionId} aprovada para ${userId}`);
      res.json({ success: true, message: `Seção ${sectionId} aprovada com sucesso.`, sectionApprovals: approvals });
    } catch (error) {
      console.error('❌ Erro em POST /api/brand-brain/section/:id/approve:', error);
      res.status(500).json({ success: false, message: 'Erro ao aprovar seção.' });
    }
  });

  // POST /api/brand-brain/section/:id/edit — Submit edit notes for a section
  router.post('/api/brand-brain/section/:id/edit', authMiddleware, async (req, res) => {
    try {
      const { userId } = req.user;
      const { id: sectionId } = req.params;
      const { notes } = req.body;
      console.log(`✏️ Editando seção ${sectionId} para mentor: ${userId}`);

      if (!VALID_SECTIONS.includes(sectionId)) {
        return res.status(400).json({ success: false, message: `Seção inválida: ${sectionId}. Use: s1, s2, s3, s4 ou s5.` });
      }

      if (!notes) {
        return res.status(400).json({ success: false, message: 'Campo notes é obrigatório.' });
      }

      const row = await dbGet('SELECT id, brand_brain_status, section_approvals, review_notes FROM pipeline WHERE user_id = ?', [userId]);

      if (!row || row.brand_brain_status !== 'mentor_review') {
        return res.status(400).json({ success: false, message: 'Brand Brain não está disponível para revisão.' });
      }

      const approvals = { s1: 'pending', s2: 'pending', s3: 'pending', s4: 'pending', s5: 'pending', ...safeJsonParse(row.section_approvals) };
      const reviewNotes = safeJsonParse(row.review_notes);

      approvals[sectionId] = 'editing';
      reviewNotes[sectionId] = notes;

      await dbRun(
        'UPDATE pipeline SET section_approvals = ?, review_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
        [JSON.stringify(approvals), JSON.stringify(reviewNotes), userId]
      );

      console.log(`✅ Notas de edição salvas para seção ${sectionId} (${userId})`);
      res.json({ success: true, message: `Notas enviadas para seção ${sectionId}.`, sectionApprovals: approvals });
    } catch (error) {
      console.error('❌ Erro em POST /api/brand-brain/section/:id/edit:', error);
      res.status(500).json({ success: false, message: 'Erro ao salvar notas de edição.' });
    }
  });

  // POST /api/brand-brain/section/:id/update-content — Mentor edits section content during review
  router.post('/api/brand-brain/section/:id/update-content', authMiddleware, async (req, res) => {
    try {
      const { userId } = req.user;
      const { id: sectionId } = req.params;
      const { content } = req.body;
      console.log(`📝 Mentor editando conteúdo da seção ${sectionId}: ${userId}`);

      if (!VALID_SECTIONS.includes(sectionId)) {
        return res.status(400).json({ success: false, message: `Seção inválida: ${sectionId}.` });
      }

      if (!content || !content.trim()) {
        return res.status(400).json({ success: false, message: 'Conteúdo não pode estar vazio.' });
      }

      const row = await dbGet('SELECT brand_brain, brand_brain_status FROM pipeline WHERE user_id = ?', [userId]);

      const EDITABLE_STATUSES = ['mentor_review', 'approved'];
      if (!row || !EDITABLE_STATUSES.includes(row.brand_brain_status)) {
        return res.status(400).json({ success: false, message: 'Brand Brain não está disponível para edição.' });
      }

      const brandBrain = safeJsonParse(row.brand_brain);
      const sectionKey = SECTION_KEY_MAP[sectionId];
      const altKey = SECTION_ALT_KEY_MAP[sectionId];
      const existingKey = (sectionKey in brandBrain) ? sectionKey : (altKey && altKey in brandBrain) ? altKey : sectionKey;

      if (typeof brandBrain[existingKey] === 'object' && brandBrain[existingKey] !== null) {
        brandBrain[existingKey].content = content;
      } else {
        brandBrain[existingKey] = { content };
      }

      // Track edit timestamp: mentorEditedAt for review, userEditedAt for post-approval
      if (row.brand_brain_status === 'approved') {
        brandBrain.userEditedAt = new Date().toISOString();
      } else {
        brandBrain.mentorEditedAt = new Date().toISOString();
      }

      await dbRun(
        'UPDATE pipeline SET brand_brain = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
        [JSON.stringify(brandBrain), userId]
      );

      console.log(`✅ Edição do mentor salva para seção ${sectionId} (${userId}) [status: ${row.brand_brain_status}]`);
      res.json({ success: true, message: 'Edição salva com sucesso.' });
    } catch (error) {
      console.error('❌ Erro em POST /api/brand-brain/section/:id/update-content:', error);
      res.status(500).json({ success: false, message: 'Erro ao salvar edição.' });
    }
  });

  return router;
};
