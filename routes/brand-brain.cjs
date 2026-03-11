const { Router } = require('express');

module.exports = function createBrandBrainRoutes({ db, dbGet, dbRun, dbAll, authMiddleware, safeJsonParse }) {
  const router = Router();

  // GET /api/brand-brain — Get my Brand Brain (simplified: no validation fields)
  router.get('/api/brand-brain', authMiddleware, async (req, res) => {
    try {
      const { userId } = req.user;
      console.log(`🧠 Buscando Brand Brain do mentor: ${userId}`);

      const row = await dbGet('SELECT brand_brain, brand_brain_status, research_status, expert_notes FROM pipeline WHERE user_id = ?', [userId]);

      if (!row) {
        return res.json({ success: true, data: null });
      }

      const VISIBLE_STATUSES = ['mentor_review', 'approved'];
      if (!VISIBLE_STATUSES.includes(row.brand_brain_status)) {
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
          expertNotes: row.expert_notes ? safeJsonParse(row.expert_notes, null) : null,
        }
      });
    } catch (error) {
      console.error('❌ Erro em GET /api/brand-brain:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar Brand Brain.' });
    }
  });

  // GET /api/suggestions — Get educational suggestions for the mentor
  router.get('/api/suggestions', authMiddleware, async (req, res) => {
    try {
      const { userId } = req.user;
      console.log(`📚 Buscando sugestões educacionais para: ${userId}`);

      const row = await dbGet('SELECT educational_suggestions FROM pipeline WHERE user_id = ?', [userId]);

      if (!row || !row.educational_suggestions) {
        return res.json({ success: true, data: null, message: 'Sugestões ainda não disponíveis' });
      }

      const suggestions = safeJsonParse(row.educational_suggestions, null);

      if (!suggestions) {
        return res.json({ success: true, data: null, message: 'Sugestões ainda não disponíveis' });
      }

      res.json({ success: true, data: suggestions });
    } catch (error) {
      console.error('❌ Erro em GET /api/suggestions:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar sugestões.' });
    }
  });

  // POST /api/analytics/bb-event — Track Brand Brain engagement events
  router.post('/api/analytics/bb-event', authMiddleware, async (req, res) => {
    try {
      const { userId } = req.user;
      const { eventType, eventData } = req.body;

      const VALID_EVENTS = ['bb_full_viewed', 'expert_notes_viewed', 'bb_full_download'];
      if (!VALID_EVENTS.includes(eventType)) {
        return res.status(400).json({ success: false, message: `Evento inválido: ${eventType}` });
      }

      await dbRun(
        'INSERT INTO bb_analytics (user_id, event_type, event_data) VALUES (?, ?, ?)',
        [userId, eventType, eventData ? JSON.stringify(eventData) : null]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('❌ Erro em POST /api/analytics/bb-event:', error);
      res.status(500).json({ success: false, message: 'Erro ao registrar evento.' });
    }
  });

  // GET /api/admin/bb-analytics/:userId — Get analytics for a user (admin only)
  router.get('/api/admin/bb-analytics/:userId', authMiddleware, async (req, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({ success: false, message: 'Acesso negado.' });
      }

      const { userId } = req.params;
      const events = await dbAll(
        'SELECT event_type, event_data, created_at FROM bb_analytics WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );

      const analytics = { fullBBViews: [], expertNotesViews: [], downloads: [] };

      for (const evt of events) {
        const data = safeJsonParse(evt.event_data, {});
        const entry = { ...data, timestamp: evt.created_at };
        switch (evt.event_type) {
          case 'bb_full_viewed':
            analytics.fullBBViews.push(entry);
            break;
          case 'expert_notes_viewed':
            analytics.expertNotesViews.push(entry);
            break;
          case 'bb_full_download':
            analytics.downloads.push(entry);
            break;
        }
      }

      res.json({ success: true, data: analytics });
    } catch (error) {
      console.error('❌ Erro em GET /api/admin/bb-analytics:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar analytics.' });
    }
  });

  return router;
};
