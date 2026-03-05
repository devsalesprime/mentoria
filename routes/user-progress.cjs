const { Router } = require('express');

module.exports = function createUserProgressRoutes({ db, dbGet, dbRun, dbAll, authMiddleware, axios, safeJsonParse }) {
  const router = Router();

  // --- HELPER FUNCTION: Recalcular Progresso (Global) ---
  const calculateProgressServer = (data) => {
    const modules = ['mentor', 'mentee', 'method', 'delivery'];
    let totalProgress = 0;

    modules.forEach(moduleKey => {
      const moduleData = data[moduleKey];

      // 1. Explicitamente concluído
      if (moduleData && moduleData._completed) {
        totalProgress += 25;
        return;
      }

      // 2. Heurística de Completude (Legacy)
      let isLegacyComplete = false;
      if (moduleData && typeof moduleData === 'object') {
        if (moduleKey === 'mentor') {
          const s7 = moduleData.step7;
          const s6 = moduleData.step6;
          if (s7 && (s7.myDifference || s7.marketStandard)) isLegacyComplete = true;
          else if (s6 && (s6.testimonials?.length > 0 || s6.hasNoTestimonials)) isLegacyComplete = true;
        } else if (moduleKey === 'mentee') {
          const synth = moduleData.icpSynthesis;
          const journey = moduleData.consumptionJourney;
          if (synth && synth.phrase && synth.phrase.length > 3) isLegacyComplete = true;
          else if (journey && journey.steps && journey.steps.length > 0) isLegacyComplete = true;
        } else if (moduleKey === 'method') {
          if (moduleData.pillars && moduleData.pillars.length > 0) isLegacyComplete = true;
          else if (moduleData.journeyMap && moduleData.journeyMap.length > 0) isLegacyComplete = true;
          else if (moduleData.name && moduleData.transformation) isLegacyComplete = true;
        } else if (moduleKey === 'delivery') {
          if (moduleData.mandatory && moduleData.mandatory.frequency) isLegacyComplete = true;
        }
      }

      if (isLegacyComplete) {
        totalProgress += 25;
        return;
      }

      // 3. Score por Steps
      let stepScore = 0;
      if (moduleData && moduleData._currentStep) {
        const step = moduleData._currentStep;
        let max = 0;
        if (moduleKey === 'mentor') max = 7;
        else if (moduleKey === 'mentee') max = moduleData.hasClients === 'no' ? 6 : 5;
        else if (moduleKey === 'method') max = moduleData.stage === 'structured' ? 2 : 4;
        else if (moduleKey === 'delivery') max = 3;

        if (max > 0) {
          const ratio = Math.min(1, step / max);
          stepScore = ratio * 25;
        }
      }

      // 4. Score por Densidade (Campos preenchidos)
      let densityScore = 0;
      if (moduleData && typeof moduleData === 'object') {
        const fields = Object.keys(moduleData).filter(key => key !== '_completed' && key !== '_currentStep');
        let localFilled = 0;
        let localTotal = fields.length;
        fields.forEach(field => {
          const value = moduleData[field];
          if (value !== null && value !== undefined && value !== '') {
            if (Array.isArray(value) && value.length > 0) localFilled++;
            else if (typeof value === 'object' && Object.keys(value).length > 0) localFilled++;
            else if (typeof value === 'string' && value.trim().length > 0) localFilled++;
            else if (typeof value === 'number' || typeof value === 'boolean') localFilled++;
          }
        });
        if (localTotal > 0) densityScore = (localFilled / localTotal) * 25;
      }

      // USAR O MAIOR SCORE (Corrige problema de passos travados com dados preenchidos)
      totalProgress += Math.max(stepScore, densityScore);
    });

    return Math.min(100, Math.round(totalProgress));
  };

  // 3. Get User Progress (v2.0: reads from diagnostic_data instead of user_progress)
  router.get('/api/user/progress', authMiddleware, async (req, res) => {
    try {
      const { user: email, userId } = req.user;
      console.log(`📥 Buscando progresso de ${email} (ID: ${userId})`);

      const row = await dbGet(
        `SELECT mentor, mentee, method, offer, progress_percentage
         FROM diagnostic_data
         WHERE user_id = ?`,
        [userId]
      );

      if (!row) {
        console.log(`📭 Nenhum dado encontrado para ${email}`);
        return res.json({
          success: true,
          progress: {
            formData: { mentor: {}, mentee: {}, method: {}, delivery: {} },
            progressPercentage: 0
          }
        });
      }

      try {
        // Reconstruct legacy formData format from individual module columns
        const formData = {
          mentor: safeJsonParse(row.mentor),
          mentee: safeJsonParse(row.mentee),
          method: safeJsonParse(row.method),
          delivery: safeJsonParse(row.offer),
        };
        console.log(`✅ Dados encontrados para ${email}`);
        console.log(`📊 Progress do banco: ${row.progress_percentage}%`);

        res.json({
          success: true,
          progress: {
            formData,
            progressPercentage: row.progress_percentage || 0
          }
        });
      } catch (parseError) {
        console.error('❌ Erro ao parsear module data:', parseError.message);
        res.json({
          success: true,
          progress: {
            formData: { mentor: {}, mentee: {}, method: {}, delivery: {} },
            progressPercentage: 0
          }
        });
      }
    } catch (error) {
      console.error('❌ Erro no get progress:', error.message);
      res.status(500).json({
        success: false,
        message: 'Erro interno'
      });
    }
  });

  // 4. Save User Progress (v2.0: writes to diagnostic_data instead of user_progress)
  router.post('/api/user/save-progress', authMiddleware, async (req, res) => {
    try {
      const { user: email, userId, name } = req.user;
      const { formData, progressPercentage } = req.body;

      console.log(`💾 [${new Date().toISOString()}] Salvando dados para ${email} (${progressPercentage}%)`);

      if (!formData || typeof formData !== 'object') {
        return res.status(400).json({ success: false, message: 'Dados são obrigatórios' });
      }

      // Check existing status to avoid duplicate webhooks
      const row = await dbGet('SELECT status FROM diagnostic_data WHERE user_id = ?', [userId]);
      let currentStatus = 'in_progress';
      if (row) {
        currentStatus = row.status;
      }

      // Auto-save NEVER changes status or triggers webhooks.
      // Webhook is triggered only by explicit POST /api/diagnostic/submit.
      const newStatus = currentStatus;

      // v2.0: Partial update — only SET columns that are actually provided.
      // Map 'delivery' key (legacy frontend) to 'offer' column (new schema)
      const updates = {};
      if (formData.mentor) updates.mentor = JSON.stringify(formData.mentor);
      if (formData.mentee) updates.mentee = JSON.stringify(formData.mentee);
      if (formData.method) updates.method = JSON.stringify(formData.method);
      if (formData.delivery) updates.offer = JSON.stringify(formData.delivery);
      if (progressPercentage !== undefined) updates.progress_percentage = Math.min(100, Math.max(0, progressPercentage || 0));
      updates.status = newStatus;

      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const values = Object.values(updates);

      if (!setClauses) {
        return res.json({ success: true, message: 'Nenhuma alteração.' });
      }

      const query = `UPDATE diagnostic_data SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`;

      const result = await dbRun(query, [...values, userId]);

      console.log(`✅ Dados salvos: ${result.changes} alterações (${progressPercentage}%)`);
      res.json({
        success: true,
        message: 'Dados salvos com sucesso',
        progressPercentage,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Erro no save-progress:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno' });
    }
  });

  // 5. Submit Module (v2.0: writes to diagnostic_data)
  router.post('/api/user/submit-module', authMiddleware, async (req, res) => {
    try {
      const { user: email, userId } = req.user;
      const { module, data } = req.body;

      if (!module || !data) {
        return res.status(400).json({ success: false, message: 'Módulo e dados são obrigatórios.' });
      }

      console.log(`💾 Salvando módulo ${module} para ${email}`);

      // Map legacy 'delivery' module name to 'offer' column
      const columnMap = { mentor: 'mentor', mentee: 'mentee', method: 'method', delivery: 'offer' };
      const column = columnMap[module] || module;

      // Validate column name to prevent injection
      const validColumns = ['mentor', 'mentee', 'method', 'offer', 'pre_module'];
      if (!validColumns.includes(column)) {
        return res.status(400).json({ success: false, message: `Módulo inválido: ${module}` });
      }

      await dbRun(
        `UPDATE diagnostic_data SET ${column} = ? WHERE user_id = ?`,
        [JSON.stringify(data), userId]
      );

      console.log(`✅ Módulo ${module} salvo para ${email}`);
      res.json({
        success: true,
        message: 'Módulo salvo com sucesso.',
      });
    } catch (error) {
      console.error('❌ Erro ao salvar módulo:', error);
      res.status(500).json({ success: false, message: 'Erro ao salvar módulo.' });
    }
  });

  return router;
};
