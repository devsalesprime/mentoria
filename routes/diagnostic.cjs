const { Router } = require('express');
const axios = require('axios');
const { saveDiagnosticSchema, submitDiagnosticSchema, validateBody } = require('../utils/validation.cjs');

module.exports = function createDiagnosticRoutes({ db, dbGet, dbRun, dbAll, authMiddleware, uuidv4, safeJsonParse }) {
  const router = Router();

  // GET /api/diagnostic — Load user's diagnostic data
  router.get('/api/diagnostic', authMiddleware, async (req, res) => {
    try {
      const { userId } = req.user;

      const row = await dbGet(
        `SELECT * FROM diagnostic_data WHERE user_id = ?`,
        [userId]
      );

      if (!row) {
        return res.json({
          success: true,
          data: {
            pre_module: {},
            mentor: {},
            mentee: {},
            method: {},
            offer: {},
            current_module: 'pre_module',
            current_step: 0,
            progress_percentage: 0,
            status: 'in_progress'
          }
        });
      }

      // Parse JSON columns
      const data = {
        id: row.id,
        userId: row.user_id,
        pre_module: safeJsonParse(row.pre_module),
        mentor: safeJsonParse(row.mentor),
        mentee: safeJsonParse(row.mentee),
        method: safeJsonParse(row.method),
        offer: safeJsonParse(row.offer),
        current_module: row.current_module,
        current_step: row.current_step,
        progress_percentage: row.progress_percentage,
        status: row.status,
        is_legacy: row.is_legacy === 1,
        submitted_at: row.submitted_at,
        last_updated: row.updated_at,
        created_at: row.created_at
      };

      res.json({ success: true, data });
    } catch (error) {
      console.error('Error in GET /api/diagnostic:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/diagnostic — Save diagnostic data (auto-save, accepts partial updates)
  router.post('/api/diagnostic', authMiddleware, async (req, res) => {
    try {
      const { userId, user: email, name } = req.user;
      const { pre_module, mentor, mentee, method, offer, current_module, current_step, progress_percentage } = req.body;

      // Check if record exists
      const existing = await dbGet('SELECT id FROM diagnostic_data WHERE user_id = ?', [userId]);

      const id = existing ? existing.id : uuidv4();

      // Build SET clauses for partial updates
      const updates = {};
      if (pre_module !== undefined) updates.pre_module = JSON.stringify(pre_module);
      if (mentor !== undefined) updates.mentor = JSON.stringify(mentor);
      if (mentee !== undefined) updates.mentee = JSON.stringify(mentee);
      if (method !== undefined) updates.method = JSON.stringify(method);
      if (offer !== undefined) updates.offer = JSON.stringify(offer);
      if (current_module !== undefined) updates.current_module = current_module;
      if (current_step !== undefined) updates.current_step = current_step;
      if (progress_percentage !== undefined) updates.progress_percentage = progress_percentage;

      if (existing) {
        // Update existing record
        const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);

        if (setClauses.length === 0) {
          return res.json({ success: true, message: 'Nenhuma alteração.' });
        }

        await dbRun(
          `UPDATE diagnostic_data SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
          [...values, userId]
        );
        res.json({ success: true, message: 'Dados salvos.', id });
      } else {
        // Ensure user record exists (FK constraint) before inserting diagnostic_data
        const userRow = await dbGet('SELECT id FROM users WHERE id = ?', [userId]);
        if (!userRow) {
          // User row missing — create it first, then insert diagnostic
          await dbRun(
            `INSERT OR IGNORE INTO users (id, email, name, role) VALUES (?, ?, ?, 'member')`,
            [userId, email, name || '']
          );
        }

        await dbRun(
          `INSERT INTO diagnostic_data (id, user_id, email, name, pre_module, mentor, mentee, method, offer, current_module, current_step, progress_percentage)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            userId,
            email,
            name || '',
            updates.pre_module || '{}',
            updates.mentor || '{}',
            updates.mentee || '{}',
            updates.method || '{}',
            updates.offer || '{}',
            updates.current_module || 'pre_module',
            updates.current_step || 0,
            updates.progress_percentage || 0
          ]
        );
        res.json({ success: true, message: 'Dados criados.', id });
      }
    } catch (error) {
      console.error('Error in POST /api/diagnostic:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/diagnostic/submit — Mark diagnostic as submitted + trigger webhook
  router.post('/api/diagnostic/submit', authMiddleware, async (req, res) => {
    try {
      const { userId, user: email } = req.user;

      // Guard: check current status to avoid duplicate submissions
      const row = await dbGet('SELECT status FROM diagnostic_data WHERE user_id = ?', [userId]);

      if (!row) {
        return res.status(404).json({ success: false, message: 'Diagnóstico não encontrado.' });
      }

      if (row.status === 'submitted') {
        return res.json({ success: true, message: 'Diagnóstico já submetido.' });
      }

      const result = await dbRun(
        `UPDATE diagnostic_data SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
        [userId]
      );

      if (result.changes === 0) {
        return res.status(404).json({ success: false, message: 'Diagnóstico não encontrado.' });
      }

      // Trigger webhook to n8n — only on explicit submit
      const webhookUrl = 'https://n8n.salesprime.com.br/webhook/diagostico-100';
      console.log(`🚀 [WEBHOOK] Diagnostic submitted for ${email}`);
      axios.post(webhookUrl, { email })
        .then(() => console.log('✅ [WEBHOOK] Sent successfully'))
        .catch(e => console.error('❌ [WEBHOOK] Error:', e.message));

      res.json({ success: true, message: 'Diagnóstico submetido.' });
    } catch (error) {
      console.error('Error in POST /api/diagnostic/submit:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  return router;
};
