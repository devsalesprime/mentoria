const { Router } = require('express');

module.exports = function createAdminUsersRoutes({ db, dbGet, dbRun, dbAll, authMiddleware, adminMiddleware, fs, path, AUDIO_DIR, UPLOADS_DIR, safeJsonParse }) {
  const router = Router();

  // Reliable recursive directory removal (avoids fs.rmSync force:true silently swallowing errors)
  function rmDirRecursive(dirPath) {
    if (!fs.existsSync(dirPath)) return false;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, entry.name);
      entry.isDirectory() ? rmDirRecursive(full) : fs.unlinkSync(full);
    }
    fs.rmdirSync(dirPath);
    return true;
  }

  // 5. List All Users (Admin) — supports ?page=1&limit=20 pagination
  router.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      console.log('📋 Listando todos os usuários (Admin)');

      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const offset = (page - 1) * limit;

      // First get total count
      const countRow = await dbGet(
        `SELECT COUNT(*) as total FROM diagnostic_data dd WHERE dd.email != ?`,
        ['admin@prosperus.com']
      );

      const total = countRow ? countRow.total : 0;
      const pages = Math.ceil(total / limit);

      const rows = await dbAll(
        `SELECT dd.id, dd.user_id, dd.email, dd.name, dd.progress_percentage, dd.updated_at, dd.status, dd.current_module, u.created_at as user_created_at,
                p.research_status, p.brand_brain_status, p.assets_status
         FROM diagnostic_data dd
         LEFT JOIN users u ON dd.user_id = u.id
         LEFT JOIN pipeline p ON dd.user_id = p.user_id
         WHERE dd.email != ?
         ORDER BY COALESCE(dd.updated_at, u.created_at, CURRENT_TIMESTAMP) DESC
         LIMIT ? OFFSET ?`,
        ['admin@prosperus.com', limit, offset]
      );

      const users = (rows || []).map(user => {
        let lastUpdatedIso = new Date().toISOString();
        if (user.updated_at) {
          lastUpdatedIso = new Date(user.updated_at).toISOString();
        } else if (user.user_created_at) {
          lastUpdatedIso = new Date(user.user_created_at).toISOString();
        }

        const ds = user.status;
        const rs = user.research_status;
        const bbs = user.brand_brain_status;
        const as_ = user.assets_status;
        const pipelineStage = (() => {
          if (ds !== 'submitted') return 'Diagnóstico';
          if (as_ === 'delivered') return 'Entregue';
          if (bbs === 'ready') return 'Entregáveis';
          if (bbs === 'generating') return 'Brand Brain';
          if (bbs && bbs !== 'pending') return 'Brand Brain';
          if (rs === 'complete') return 'Brand Brain';
          return 'Pesquisa';
        })();

        return {
          id: user.id,
          user_id: user.user_id,
          email: user.email,
          name: user.name,
          progressPercentage: user.progress_percentage || 0,
          lastUpdated: lastUpdatedIso,
          status: user.status || 'in_progress',
          currentModule: user.current_module || 'pre_module',
          pipelineStage
        };
      });

      res.json({
        success: true,
        users,
        pagination: { page, limit, total, pages }
      });

    } catch (error) {
      console.error('❌ Erro ao listar usuários:', error);
      res.status(500).json({ success: false, message: 'Erro ao listar usuários.' });
    }
  });

  // 6. Get User Details (Admin)
  router.get('/api/admin/users/:userId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;

      const row = await dbGet(
        `SELECT dd.*, u.created_at as created_at
         FROM diagnostic_data dd
         LEFT JOIN users u ON dd.user_id = u.id
         WHERE dd.id = ?`,
        [userId]
      );

      if (!row) {
        return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
      }

      const responseUser = {
        id: row.id,
        userId: row.user_id,
        email: row.email,
        name: row.name,
        createdAt: row.created_at || row.updated_at || null,
        progressPercentage: row.progress_percentage || 0,
        lastUpdated: row.updated_at,
        status: row.status || 'in_progress',
        submittedAt: row.submitted_at || null,
        currentModule: row.current_module || 'pre_module',
        currentStep: row.current_step || 0,
        diagnosticData: {
          preModule: safeJsonParse(row.pre_module),
          mentor: safeJsonParse(row.mentor),
          mentee: safeJsonParse(row.mentee),
          method: safeJsonParse(row.method),
          offer: safeJsonParse(row.offer)
        }
      };

      res.json({ success: true, user: responseUser });

    } catch (error) {
      console.error('❌ Erro ao buscar usuário:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar usuário.' });
    }
  });

  // 7. Download User Data (Admin)
  router.get('/api/admin/users/:userId/download', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;

      const row = await dbGet(
        `SELECT * FROM diagnostic_data WHERE id = ?`,
        [userId]
      );

      if (!row) {
        return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
      }

      // Fetch audio recordings for this user to annotate the report
      let audioRows;
      try {
        audioRows = await dbAll(
          `SELECT module, question_id, transcript, duration_seconds FROM audio_recordings WHERE user_id = ? ORDER BY created_at ASC`,
          [row.user_id]
        );
      } catch (_audioErr) {
        audioRows = [];
      }
      audioRows = audioRows || [];

      // Build lookup: "module:question_id" → { transcript, duration }
      const audioByQuestion = {};
      for (const a of audioRows) {
        const key = `${a.module}:${a.question_id}`;
        if (!audioByQuestion[key]) audioByQuestion[key] = [];
        audioByQuestion[key].push(a);
      }
      const audioTag = (mod, qid) => {
        const entries = audioByQuestion[`${mod}:${qid}`];
        if (!entries || entries.length === 0) return '';
        const parts = entries.map((e, i) => {
          const dur = e.duration_seconds ? ` (${e.duration_seconds}s)` : '';
          const t = e.transcript ? `\n     Transcrição: ${e.transcript}` : '';
          return `  [Audio ${i + 1}${dur}]${t}`;
        });
        return '\n' + parts.join('\n');
      };

      const dash = '—';
      const sep = '='.repeat(60);

      const isEmpty = (obj) => !obj || Object.keys(obj).length === 0;
      const val = (v) => (v !== null && v !== undefined && String(v).trim()) ? String(v).trim() : dash;
      const listOrDash = (arr, fn) => (!arr || !Array.isArray(arr) || arr.length === 0) ? dash : arr.map(fn).join('\n');

      const preModule = safeJsonParse(row.pre_module);
      const mentor = safeJsonParse(row.mentor);
      const mentee = safeJsonParse(row.mentee);
      const method = safeJsonParse(row.method);
      const offer = safeJsonParse(row.offer);

      const statusLabel = row.status === 'submitted' ? 'Enviado' : 'Em Progresso';
      const dateLabel = row.submitted_at
        ? new Date(row.submitted_at).toLocaleDateString('pt-BR')
        : row.updated_at
          ? new Date(row.updated_at).toLocaleDateString('pt-BR')
          : dash;

      const maturityMap = { not_yet: 'Ainda não tenho', in_head: 'Na minha cabeça', structured: 'Estruturado' };
      const goalMap = { mls: 'MLS', independent: 'Programa independente', unsure: 'Ainda não sei' };
      const formatPricing = (n) => (!n && n !== 0) ? dash : `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

      const step1 = mentor.step1 || {};
      const step2 = mentor.step2 || {};
      const step3 = mentor.step3 || {};
      const step4 = mentor.step4 || {};
      const step5 = mentor.step5 || {};

      const lines = [];

      lines.push('RELATÓRIO DE DIAGNÓSTICO — PROSPERUS MENTORES');
      lines.push(sep);
      lines.push(`Nome: ${val(row.name)}`);
      lines.push(`Email: ${val(row.email)}`);
      lines.push(`Status: ${statusLabel}`);
      lines.push(`Progresso: ${row.progress_percentage || 0}%`);
      lines.push(`Data: ${dateLabel}`);
      lines.push('');

      // PRÉ-MÓDULO
      lines.push(sep);
      lines.push('INÍCIO — PRÉ-MÓDULO: MATERIAIS EXISTENTES');
      lines.push(sep);
      if (isEmpty(preModule)) {
        lines.push('Nenhum dado preenchido');
      } else {
        lines.push(`Materiais de negócio: ${listOrDash(preModule.materials, m => `- ${val(m.name || m.url || m)}`)}`);
        lines.push(`Links de conteúdo: ${listOrDash(preModule.contentLinks, l => `- ${val(l)}`)}`);
        lines.push('Perfis públicos:');
        const profiles = preModule.profiles || {};
        lines.push(`  - Website: ${val(profiles.website)}`);
        lines.push(`  - Instagram: ${val(profiles.instagram)}`);
        lines.push(`  - LinkedIn: ${val(profiles.linkedin)}`);
        lines.push(`  - YouTube: ${val(profiles.youtube)}`);
        lines.push(`  - Outro: ${val(profiles.other)}`);
        lines.push(`Concorrentes/Referências: ${listOrDash(preModule.competitors, c => `- ${val(c)}`)}`);
      }
      lines.push('');
      lines.push(sep);
      lines.push('FIM — PRÉ-MÓDULO: MATERIAIS EXISTENTES');
      lines.push(sep);
      lines.push('');

      // MÓDULO 1: O MENTOR
      lines.push(sep);
      lines.push('INÍCIO — MÓDULO 1: O MENTOR');
      lines.push(sep);
      if (isEmpty(mentor)) {
        lines.push('Nenhum dado preenchido');
        lines.push('');
        lines.push(sep);
        lines.push('FIM — MÓDULO 1: O MENTOR');
        lines.push(sep);
        lines.push('');
      } else {
      lines.push('1.1 O que você faz:');
      lines.push(val(step1.explanation));
      lines.push(audioTag('mentor', '1.1'));
      lines.push('');
      lines.push('1.2 Momentos-chave de autoridade:');
      lines.push(val(step2.authorityStory));
      lines.push(audioTag('mentor', '1.2'));
      if (step2.link && String(step2.link).trim()) lines.push(`Link: ${step2.link}`);
      lines.push('');
      lines.push('1.3 Top 3 conquistas:');
      lines.push(`  🥇 Ouro: ${val(step3.gold)}`);
      lines.push(`  🥈 Prata: ${val(step3.silver)}`);
      lines.push(`  🥉 Bronze: ${val(step3.bronze)}`);
      lines.push('');
      lines.push('1.4 Provas e depoimentos:');
      const testimonials = step4.testimonials || [];
      if (testimonials.length === 0) {
        lines.push(dash);
      } else {
        testimonials.forEach((t, i) => {
          lines.push(`  ${i + 1}. ${val(t.clientName)}: ${val(t.result)}`);
          if (t.quote && String(t.quote).trim()) lines.push(`     "${t.quote}"`);
          if (t.videoUrl || t.videoLink) lines.push(`     Vídeo: ${t.videoUrl || t.videoLink}`);
        });
      }
      const videoLinks = step4.videoLinks || [];
      if (videoLinks.length > 0) {
        lines.push('Links de vídeo gerais:');
        videoLinks.forEach(l => lines.push(`  - ${val(l)}`));
      }
      lines.push(`Começando do zero: ${step4.startingFromZero ? 'Sim' : 'Não'}`);
      lines.push('');
      lines.push('1.5 Diferenciação:');
      lines.push(`  Padrão do mercado: ${val(step5.marketStandard)}`);
      lines.push(audioTag('mentor', '1.5a'));
      lines.push(`  Meu diferencial: ${val(step5.myDifference)}`);
      lines.push(audioTag('mentor', '1.5b'));
      lines.push('');
      lines.push(sep);
      lines.push('FIM — MÓDULO 1: O MENTOR');
      lines.push(sep);
      lines.push('');
      } // end isEmpty(mentor) else

      // MÓDULO 2: O MENTORADO
      lines.push(sep);
      lines.push('INÍCIO — MÓDULO 2: O MENTORADO');
      lines.push(sep);
      if (isEmpty(mentee)) { lines.push('Nenhum dado preenchido'); } else {
      lines.push(`Já tem clientes pagantes: ${mentee.hasClients === 'yes' ? 'Sim' : mentee.hasClients === 'no' ? 'Não' : dash}`);
      lines.push('');
      lines.push('2.2a ANTES — Dor interna (emocional):');
      lines.push(val(mentee.beforeInternal));
      lines.push(audioTag('mentee', '2.2a'));
      lines.push('');
      lines.push('2.2b ANTES — Situação externa (fatos):');
      lines.push(val(mentee.beforeExternal));
      lines.push(audioTag('mentee', '2.2b'));
      lines.push('');
      lines.push('2.3a DECISÃO — Medos e hesitações:');
      lines.push(val(mentee.decisionFears));
      lines.push(audioTag('mentee', '2.3a'));
      lines.push('');
      lines.push('2.3b DECISÃO — Gatilho de compra:');
      lines.push(val(mentee.decisionTrigger));
      lines.push(audioTag('mentee', '2.3b'));
      lines.push('');
      lines.push('2.4a DEPOIS — Resultados mensuráveis:');
      lines.push(val(mentee.afterExternal));
      lines.push(audioTag('mentee', '2.4a'));
      lines.push('');
      lines.push('2.4b DEPOIS — Estado emocional:');
      lines.push(val(mentee.afterInternal));
      lines.push(audioTag('mentee', '2.4b'));
      lines.push('');
      lines.push('2.5 Cliente ideal (geral):');
      lines.push(val(mentee.idealClientGeneral));
      lines.push(audioTag('mentee', '2.5'));
      lines.push('');
      lines.push('2.6 Péssimo encaixe (anti-avatar):');
      lines.push(val(mentee.terribleFit));
      lines.push(audioTag('mentee', '2.6'));
      } // end isEmpty(mentee) else
      lines.push('');
      lines.push(sep);
      lines.push('FIM — MÓDULO 2: O MENTORADO');
      lines.push(sep);
      lines.push('');

      // MÓDULO 3: O MÉTODO
      lines.push(sep);
      lines.push('INÍCIO — MÓDULO 3: O MÉTODO');
      lines.push(sep);
      if (isEmpty(method)) { lines.push('Nenhum dado preenchido'); } else {
      lines.push(`Maturidade: ${maturityMap[method.maturity] || val(method.maturity)}`);
      lines.push('');
      lines.push('Ponto A (Antes):');
      lines.push(`  Interno: ${val(mentee.beforeInternal)}`);
      lines.push(`  Externo: ${val(mentee.beforeExternal)}`);
      lines.push('');
      lines.push('Ponto B (Depois):');
      lines.push(`  Interno: ${val(mentee.afterInternal)}`);
      lines.push(`  Externo: ${val(mentee.afterExternal)}`);
      lines.push('');
      if (method.maturity === 'structured') {
        lines.push(`Nome do método: ${val(method.name)}`);
        lines.push(`Promessa: ${val(method.promise)}`);
        lines.push('Pilares:');
        const pillars = method.pillars || [];
        if (pillars.length === 0) {
          lines.push(`  ${dash}`);
        } else {
          pillars.forEach((p, i) => {
            lines.push(`  ${i + 1}. ${val(p.name)}: ${val(p.what)} / ${val(p.why)} / ${val(p.how)}`);
          });
        }
      } else {
        lines.push('Etapas:');
        const steps = method.steps || [];
        if (steps.length === 0) {
          lines.push(`  ${dash}`);
        } else {
          steps.forEach((s, i) => {
            lines.push(`  ${i + 1}. ${val(s.title)}: ${val(s.description)}`);
            const stepAudio = audioTag('method', `method-step-${s.id || i + 1}`);
            if (stepAudio) lines.push(stepAudio);
          });
        }
      }
      lines.push('');
      lines.push('Obstáculos-chave:');
      const obstacles = method.obstacles || [];
      if (obstacles.length === 0) {
        lines.push(`  ${dash}`);
      } else {
        obstacles.forEach(o => {
          lines.push(`  Etapa: ${val(o.referenceName)}`);
          const pairs = (o.pairs && o.pairs.length > 0) ? o.pairs : [{ obstacle: o.obstacle || '', solution: o.solution || '' }];
          pairs.forEach(pair => {
            lines.push(`    - Obstáculo: ${val(pair.obstacle)}`);
            lines.push(`      Solução: ${val(pair.solution)}`);
          });
        });
      }
      } // end isEmpty(method) else
      lines.push('');
      lines.push(sep);
      lines.push('FIM — MÓDULO 3: O MÉTODO');
      lines.push(sep);
      lines.push('');

      // MÓDULO 4: A OFERTA
      lines.push(sep);
      lines.push('INÍCIO — MÓDULO 4: A OFERTA');
      lines.push(sep);
      if (isEmpty(offer)) { lines.push('Nenhum dado preenchido'); } else {
      lines.push(`Objetivo: ${goalMap[offer.goal] || val(offer.goal)}`);
      lines.push('');
      lines.push('4.2 Descrição da oferta:');
      lines.push(val(offer.description));
      lines.push(audioTag('offer', '4.2'));
      lines.push('');
      lines.push('4.3 Entregáveis:');
      const deliverables = offer.deliverables || [];
      if (deliverables.length === 0) {
        lines.push(dash);
      } else {
        deliverables.forEach(d => {
          const mlsFlag = d.isMLS ? ' [MLS]' : '';
          const freq = d.frequency ? ` (${d.frequency})` : '';
          const desc = d.description ? ` — ${d.description}` : '';
          lines.push(`  - ${val(d.name)}${freq}${desc}${mlsFlag}`);
        });
      }
      lines.push('');
      lines.push('4.4 Bônus:');
      const bonuses = offer.bonuses || [];
      if (bonuses.length === 0) {
        lines.push(dash);
      } else {
        bonuses.forEach(b => {
          lines.push(`  - ${val(b.name)}`);
          lines.push(`    Descrição: ${val(b.description)}`);
          lines.push(`    Objeção que elimina: ${val(b.objectionsItKills || b.objection)}`);
        });
      }
      lines.push('');
      lines.push(`4.5 Preço: ${formatPricing(offer.pricing)}`);
      lines.push('');
      lines.push('4.6 Materiais de venda existentes:');
      const salesMaterials = offer.salesMaterials || [];
      const salesFiles = offer.salesFiles || [];
      if (salesMaterials.length === 0 && salesFiles.length === 0) {
        lines.push(dash);
      } else {
        salesMaterials.forEach(u => lines.push(`  - ${val(u)}`));
        salesFiles.forEach(f => lines.push(`  - ${val(f.name || f.url || f)}`));
      }
      } // end isEmpty(offer) else
      lines.push('');
      lines.push(sep);
      lines.push('FIM — MÓDULO 4: A OFERTA');
      lines.push(sep);
      lines.push('');

      if (audioRows.length > 0) {
        lines.push(sep);
        lines.push(`RESPOSTAS EM AUDIO: ${audioRows.length} gravação(ões)`);
        lines.push('As transcrições estão incluídas acima junto às respectivas perguntas.');
        lines.push('');
      }

      lines.push(sep);
      lines.push(`Relatório gerado em: ${new Date().toLocaleString('pt-BR')}`);
      lines.push(sep);

      const relatorio = lines.join('\n');
      const safeName = (row.name || 'mentor').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '');
      const fileName = `diagnostico-${safeName}-${Date.now()}.txt`;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(relatorio);

      console.log(`✅ Relatório baixado para ${row.name}`);

    } catch (error) {
      console.error('❌ Erro ao baixar relatório:', error);
      res.status(500).json({ success: false, message: 'Erro ao baixar relatório.' });
    }
  });

  // 8. Delete User (Admin)
  router.delete('/api/admin/users/:userId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      console.log(`🗑️ Tentando deletar usuário com ID: [${userId}]`);

      const row = await dbGet('SELECT id, user_id FROM diagnostic_data WHERE id = ?', [userId]);

      if (!row) {
        return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
      }

      const userUid = row.user_id;

      // v2.0: FK ON DELETE CASCADE handles all child records automatically
      await dbRun('DELETE FROM users WHERE id = ?', [userUid]);

      console.log(`✅ Usuário deletado: ${userId} (user_id: ${userUid}) — CASCADE removed all related data`);

      // Physical file cleanup with feedback
      const userAudioDir = path.join(AUDIO_DIR, userUid);
      const userUploadsDir = path.join(UPLOADS_DIR, userUid);
      const cleanup = { audioDeleted: false, uploadsDeleted: false };

      try {
        cleanup.audioDeleted = rmDirRecursive(userAudioDir);
        if (cleanup.audioDeleted) console.log(`✅ Áudios removidos: ${userAudioDir}`);
      } catch (fsErr) {
        console.error(`⚠️ Erro ao limpar áudios:`, fsErr);
      }

      try {
        cleanup.uploadsDeleted = rmDirRecursive(userUploadsDir);
        if (cleanup.uploadsDeleted) console.log(`✅ Uploads removidos: ${userUploadsDir}`);
      } catch (fsErr) {
        console.error(`⚠️ Erro ao limpar uploads:`, fsErr);
      }

      res.json({
        success: true,
        message: 'Usuário deletado com sucesso.',
        cleanup,
      });

    } catch (error) {
      console.error('❌ Erro ao deletar usuário:', error);
      res.status(500).json({ success: false, message: 'Erro ao deletar usuário.' });
    }
  });

  // 9. Cleanup Orphaned User Directories (Admin)
  router.post('/api/admin/cleanup-orphans', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      console.log('🧹 Iniciando limpeza de diretórios órfãos...');

      // Collect all subdirectories from audio and uploads
      const scanDir = (dir) => {
        try {
          if (!fs.existsSync(dir)) return [];
          return fs.readdirSync(dir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);
        } catch (e) {
          console.error(`⚠️ Erro ao escanear ${dir}:`, e);
          return [];
        }
      };

      const audioDirs = scanDir(AUDIO_DIR);
      const uploadDirs = scanDir(UPLOADS_DIR);
      const allDirNames = [...new Set([...audioDirs, ...uploadDirs])];

      if (allDirNames.length === 0) {
        return res.json({
          success: true,
          message: 'Nenhum diretório encontrado para verificar.',
          orphansFound: [],
          deleted: [],
        });
      }

      // Query all existing user IDs
      const rows = await dbAll('SELECT id FROM users', []);

      const existingIds = new Set((rows || []).map(r => r.id));
      const orphans = allDirNames.filter(name => !existingIds.has(name));

      if (orphans.length === 0) {
        console.log('✅ Nenhum diretório órfão encontrado.');
        return res.json({
          success: true,
          message: 'Nenhum diretório órfão encontrado.',
          orphansFound: [],
          deleted: [],
        });
      }

      console.log(`🔍 ${orphans.length} diretório(s) órfão(s) encontrado(s): ${orphans.join(', ')}`);

      const deleted = [];
      for (const orphanId of orphans) {
        const audioPath = path.join(AUDIO_DIR, orphanId);
        const uploadsPath = path.join(UPLOADS_DIR, orphanId);

        try {
          if (rmDirRecursive(audioPath)) {
            deleted.push({ id: orphanId, type: 'audio', path: audioPath });
            console.log(`✅ Órfão removido (audio): ${audioPath}`);
          }
        } catch (fsErr) {
          console.error(`⚠️ Erro ao remover órfão audio ${orphanId}:`, fsErr);
        }

        try {
          if (rmDirRecursive(uploadsPath)) {
            deleted.push({ id: orphanId, type: 'uploads', path: uploadsPath });
            console.log(`✅ Órfão removido (uploads): ${uploadsPath}`);
          }
        } catch (fsErr) {
          console.error(`⚠️ Erro ao remover órfão uploads ${orphanId}:`, fsErr);
        }
      }

      console.log(`🧹 Limpeza concluída: ${deleted.length} diretório(s) removido(s).`);
      res.json({
        success: true,
        message: `${orphans.length} órfão(s) encontrado(s), ${deleted.length} diretório(s) removido(s).`,
        orphansFound: orphans,
        deleted,
      });

    } catch (error) {
      console.error('❌ Erro na limpeza de órfãos:', error);
      res.status(500).json({ success: false, message: 'Erro ao executar limpeza de órfãos.' });
    }
  });

  // ============================================
  // ADMIN MEDIA ACCESS (Audio & Files)
  // ============================================

  // GET /api/admin/users/:userId/audio — List audio recordings for a user
  router.get('/api/admin/users/:userId/audio', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      const row = await dbGet(`SELECT user_id FROM diagnostic_data WHERE id = ?`, [userId]);
      if (!row) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
      const rows = await dbAll(
        `SELECT * FROM audio_recordings WHERE user_id = ? ORDER BY created_at ASC`,
        [row.user_id]
      );
      res.json({ success: true, data: rows || [] });
    } catch (error) {
      console.error('❌ Erro ao buscar áudios:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar áudios.' });
    }
  });

  // GET /api/admin/audio/:id — Stream audio file (admin access)
  router.get('/api/admin/audio/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const row = await dbGet(`SELECT * FROM audio_recordings WHERE id = ?`, [id]);
      if (!row) return res.status(404).json({ success: false, message: 'Áudio não encontrado.' });
      if (!fs.existsSync(row.file_path)) return res.status(404).json({ success: false, message: 'Arquivo não encontrado no disco.' });
      const ext = path.extname(row.file_path).toLowerCase();
      const contentType = ext === '.wav' ? 'audio/wav' : 'audio/webm';
      res.setHeader('Content-Type', contentType);
      fs.createReadStream(row.file_path).pipe(res);
    } catch (error) {
      console.error('❌ Erro ao buscar áudio:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar áudio.' });
    }
  });

  // GET /api/admin/users/:userId/files — List uploaded files for a user
  router.get('/api/admin/users/:userId/files', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { userId } = req.params;
      const row = await dbGet(`SELECT user_id FROM diagnostic_data WHERE id = ?`, [userId]);
      if (!row) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
      const rows = await dbAll(
        `SELECT * FROM uploaded_files WHERE user_id = ? ORDER BY created_at ASC`,
        [row.user_id]
      );
      res.json({ success: true, data: rows || [] });
    } catch (error) {
      console.error('❌ Erro ao buscar arquivos:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar arquivos.' });
    }
  });

  // GET /api/admin/files/:id — Download uploaded file (admin access)
  router.get('/api/admin/files/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const row = await dbGet(`SELECT * FROM uploaded_files WHERE id = ?`, [id]);
      if (!row) return res.status(404).json({ success: false, message: 'Arquivo não encontrado.' });
      if (!fs.existsSync(row.file_path)) return res.status(404).json({ success: false, message: 'Arquivo não encontrado no disco.' });
      res.setHeader('Content-Disposition', `attachment; filename="${row.file_name}"`);
      if (row.file_type) res.setHeader('Content-Type', row.file_type);
      fs.createReadStream(row.file_path).pipe(res);
    } catch (error) {
      console.error('❌ Erro ao buscar arquivo:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar arquivo.' });
    }
  });

  return router;
};
