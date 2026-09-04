const { Router } = require('express');
const SF = require('../utils/script-ficha.cjs');
const { scriptPrefillSchema, cohortMembersSchema, validateBody } = require('../utils/validation.cjs');
const VM = require('../utils/validation-materials.cjs');
const CM = require('../utils/cohort-materials.cjs');
const JOBS = require('../utils/cohort-jobs.cjs');
const CTX = require('../utils/script-context.cjs');
const SV = require('../utils/script-versions.cjs');
const SUF = require('../utils/suficiencia.cjs');

/**
 * Admin do cohort (clubes do Exclusive) e da Ficha do Script.
 * Rotas por CLUBE (:slug), nao por usuario. Materiais sao por PESSOA: o admin e o unico que ve tudo
 * (arquivos, links, observacoes e acessos de plataforma de cada membro, mais o `legado` da forma antiga).
 */
module.exports = function createAdminCohortRoutes({ dbGet, dbRun, dbAll, authMiddleware, adminMiddleware, uuidv4, safeJsonParse }) {
  const router = Router();

  VM.ensureCohortConfigTable(dbRun).catch((e) => console.error('cohort_config DDL error:', e.message));
  VM.ensureCohortJobsTable(dbRun).catch((e) => console.error('cohort_jobs DDL error:', e.message));
  CTX.ensureScriptContextTable(dbRun).catch((e) => console.error('script_field_context DDL error:', e.message));
  SV.ensureScriptVersionsTables(dbRun).catch((e) => console.error('script_versions DDL error:', e.message));
  SUF.ensureSuficienciaColumns(dbRun).catch((e) => console.error('script_fichas suficiencia DDL error:', e.message));

  const normEmail = VM.normEmail;

  /** Quem esta logado no admin, para o registro de "forcado por". */
  function quemForcou(req) {
    const u = req.user || {};
    return String(u.email || u.user || u.name || u.userId || 'admin');
  }

  /** Pendencias abertas pelo worker (job `pendencia` queued/running) por clube: { [slug]: { job_id, campos: [{ key, nome }], desde, email } }. */
  async function pendenciasAbertas(slugs) {
    if (!slugs.length) return {};
    const rows = await dbAll(
      `SELECT * FROM cohort_jobs WHERE tipo = 'pendencia' AND status IN ('queued', 'running') AND club_slug IN (${slugs.map(() => '?').join(',')})
        ORDER BY created_at DESC`,
      slugs
    );
    const out = {};
    for (const r of rows) {
      const j = JOBS.rowToJob(r);
      if (out[j.club_slug]) continue;
      const campos = ((j.payload && j.payload.campos) || []).filter((k) => SF.FIELD_BY_KEY[k]).map((k) => ({ key: k, nome: SF.FIELD_BY_KEY[k].nome }));
      out[j.club_slug] = { job_id: j.id, status: j.status, campos, desde: (j.payload && (j.payload.enviado_em || j.payload.aberta_em)) || j.created_at, email: j.email };
    }
    return out;
  }

  async function getClub(slug) {
    return dbGet(`SELECT * FROM cohort_clubs WHERE slug = ?`, [slug]);
  }

  async function ensureFicha(clubSlug) {
    await dbRun(
      `INSERT OR IGNORE INTO script_fichas (id, club_slug, fields, materials, materials_status, ficha_status)
       VALUES (?, ?, '{}', '{"por_pessoa":{}}', 'pending', 'vazia')`,
      [`ficha-${uuidv4()}`, clubSlug]
    );
    return dbGet(`SELECT * FROM script_fichas WHERE club_slug = ?`, [clubSlug]);
  }

  // 1 linha por e-mail mesmo se users tiver duplicata por caixa (fica a de updated_at mais recente)
  const LATEST_USER_JOIN = CM.LATEST_USER_JOIN;

  // Membros, arquivos e materiais por pessoa: compartilhados com routes/jobs.cjs (utils/cohort-materials.cjs)
  const listMembers = (slug) => CM.listClubMembers({ dbAll }, slug);
  const listFiles = (slug) => CM.listClubFiles({ dbAll }, slug);
  const buildPessoas = CM.buildPessoas;

  /** Reaplica users.cohort para os membros do clube conforme cohort_clubs.ativo. */
  async function resyncClubUsers(slug) {
    const club = await getClub(slug);
    if (!club) return;
    if (club.ativo === 1) {
      await dbRun(
        `UPDATE users SET cohort = 'exclusive', club_slug = ?, updated_at = CURRENT_TIMESTAMP
          WHERE lower(email) IN (SELECT email FROM cohort_members WHERE club_slug = ?)`,
        [slug, slug]
      );
    } else {
      await dbRun(`UPDATE users SET cohort = NULL, updated_at = CURRENT_TIMESTAMP WHERE club_slug = ?`, [slug]);
    }
  }

  /** Marca users.cohort/club_slug para os e-mails informados (se ja tem conta); clube inativo so aponta o club_slug. */
  async function markUsers(emails, slug) {
    const club = await getClub(slug);
    const cohortValue = club && club.ativo === 1 ? 'exclusive' : null;
    for (const email of emails) {
      await dbRun(
        `UPDATE users SET cohort = ?, club_slug = ?, updated_at = CURRENT_TIMESTAMP WHERE lower(email) = ?`,
        [cohortValue, slug, email]
      );
    }
  }

  // GET /api/admin/cohort  (visao geral por clube)
  router.get('/api/admin/cohort', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const clubs = await dbAll(
        `SELECT cc.slug, cc.nome, cc.ativo, cc.created_at,
                sf.materials, sf.materials_status, sf.materials_submitted_at, sf.ficha_status, sf.fields,
                sf.prefilled_at, sf.reviewed_at, sf.last_user_activity_at, sf.suficiencia, sf.confirmada_por
           FROM cohort_clubs cc
           LEFT JOIN script_fichas sf ON sf.club_slug = cc.slug
          ORDER BY cc.nome COLLATE NOCASE ASC`
      );
      const members = await dbAll(
        `SELECT cm.email, cm.nome, cm.club_slug, u.id AS user_id, u.updated_at AS ultimo_login
           FROM cohort_members cm
           ${LATEST_USER_JOIN}
          ORDER BY cm.created_at ASC`
      );
      const fileCounts = await dbAll(
        `SELECT u.club_slug, COUNT(*) AS c
           FROM uploaded_files f JOIN users u ON u.id = f.user_id
          WHERE f.category LIKE 'script_%' AND f.category <> 'script_contexto' AND u.club_slug IS NOT NULL
          GROUP BY u.club_slug`
      );
      const countBySlug = Object.fromEntries(fileCounts.map((r) => [r.club_slug, r.c]));
      const pendencias = await pendenciasAbertas(clubs.map((c) => c.slug));
      const membersBySlug = {};
      for (const m of members) {
        (membersBySlug[m.club_slug] = membersBySlug[m.club_slug] || []).push({
          email: m.email, nome: m.nome, user_id: m.user_id, ultimo_login: m.user_id ? m.ultimo_login : null,
        });
      }

      const rows = clubs.map((c) => {
        const ms = membersBySlug[c.slug] || [];
        const summary = SF.summarize(safeJsonParse(c.fields, {}));
        const logins = ms.map((m) => m.ultimo_login).filter(Boolean).sort();
        const materials = VM.normalizeMaterials(c.materials);
        return {
          club_slug: c.slug,
          club_nome: c.nome,
          ativo: c.ativo === 1,
          membros: ms,
          materiais_count: countBySlug[c.slug] || 0, // arquivos de todos os membros
          links_count: VM.countItems(materials), // links + acessos de todos os membros
          pessoas_enviaram: VM.countSubmitted(materials),
          materials_status: c.materials_status || 'pending',
          materials_submitted_at: c.materials_submitted_at || null,
          ficha_status: c.ficha_status || 'vazia',
          confirmada_por: c.confirmada_por || null,
          // Gates de suficiencia: { resultado, faltam, faltam_n, forcado_por, ... } ou null antes do pre-preenchimento
          suficiencia: SUF.resumoSuficiencia(safeJsonParse(c.suficiencia, null)),
          // Pendencia aberta pelo worker com o mentor ("Aguardando resposta do mentor"): campos com nome, sem codigo
          pendencia: pendencias[c.slug] || null,
          confirmados: summary.obrigatorios_decididos,
          obrigatorios: summary.obrigatorios,
          decididos: summary.decididos,
          total: summary.total,
          prefilled_at: c.prefilled_at || null,
          reviewed_at: c.reviewed_at || null,
          ultima_atividade: c.last_user_activity_at || null,
          ultimo_login: logins.length ? logins[logins.length - 1] : null,
        };
      });

      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('Error in GET /api/admin/cohort:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/admin/clubs/:slug/script-ficha
  router.get('/api/admin/clubs/:slug/script-ficha', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const club = await getClub(req.params.slug);
      if (!club) return res.status(404).json({ success: false, message: 'Clube não encontrado.' });
      const ficha = await ensureFicha(club.slug);
      const view = SF.buildFichaView(safeJsonParse(ficha.fields, {}), { includeInternal: true });
      const [membros, files, jobs, contextoItems, versoes, comentarios] = await Promise.all([
        listMembers(club.slug),
        listFiles(club.slug),
        dbAll(`SELECT * FROM cohort_jobs WHERE club_slug = ? ORDER BY created_at DESC LIMIT 50`, [club.slug]),
        CTX.listContext({ dbAll }, club.slug, { fileUrl: (id) => `/api/admin/files/${encodeURIComponent(id)}` }),
        SV.listVersions({ dbAll }, club.slug),
        SV.listComments({ dbAll }, club.slug),
      ]);
      const materials = VM.normalizeMaterials(ficha.materials);
      const contexto = CTX.groupByField(contextoItems);
      view.blocos = view.blocos.map((b) => ({ ...b, campos: b.campos.map((c) => ({ ...c, contexto_count: (contexto[c.key] || []).length })) }));
      res.json({
        success: true,
        data: {
          club: { slug: club.slug, nome: club.nome, ativo: club.ativo === 1 },
          membros,
          files,
          // Por pessoa (arquivos, links, observacoes, acessos, resposta_ia, notify_phone, submitted_at). `legado` = forma antiga por clube.
          pessoas: buildPessoas(membros, files, materials),
          pessoas_enviaram: VM.countSubmitted(materials),
          // Fila deste clube (prefill, script, refinar; mais recentes primeiro)
          jobs: jobs.map(JOBS.rowToJob),
          // Contexto por pergunta (do clube, com autor) e script escrito (versoes sem conteudo + comentarios)
          contexto,
          versoes,
          comentarios,
          legado: materials.legado || null,
          materials,
          materials_status: ficha.materials_status,
          materials_submitted_at: ficha.materials_submitted_at,
          ficha_status: ficha.ficha_status,
          confirmada_por: ficha.confirmada_por || null,
          // Gates de suficiencia completos (resultado, faltam, motivos, forcado_por, script_job_id)
          suficiencia: safeJsonParse(ficha.suficiencia, null),
          pendencia: (await pendenciasAbertas([club.slug]))[club.slug] || null,
          prefill_meta: safeJsonParse(ficha.prefill_meta, null),
          prefilled_at: ficha.prefilled_at,
          reviewed_at: ficha.reviewed_at,
          last_user_activity_at: ficha.last_user_activity_at,
          ...view,
        },
      });
    } catch (error) {
      console.error('Error in GET /api/admin/clubs/:slug/script-ficha:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/admin/clubs/:slug/suficiencia/forcar-revisao  -> ficha volta para em_revisao (o mentor ve a ficha completa)
  // Registra quem forcou em suficiencia.forcado_por; o resultado vira `parcial` (sem `faltam` = wizard completo com aviso).
  router.post('/api/admin/clubs/:slug/suficiencia/forcar-revisao', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const club = await getClub(req.params.slug);
      if (!club) return res.status(404).json({ success: false, message: 'Clube não encontrado.' });
      const ficha = await ensureFicha(club.slug);
      const suf = safeJsonParse(ficha.suficiencia, null) || {};
      const registro = {
        ...suf,
        resultado_original: suf.resultado_original || suf.resultado || null,
        resultado: 'parcial',
        faltam: Array.isArray(suf.faltam) ? suf.faltam : [],
        motivos: Array.isArray(suf.motivos) ? suf.motivos : [],
        forcado_por: { acao: 'revisao', por: quemForcou(req), em: new Date().toISOString() },
      };
      await dbRun(
        `UPDATE script_fichas SET ficha_status = 'em_revisao', confirmada_por = NULL, suficiencia = ?, updated_at = CURRENT_TIMESTAMP WHERE club_slug = ?`,
        [JSON.stringify(registro), club.slug]
      );
      res.json({ success: true, ficha_status: 'em_revisao', suficiencia: registro });
    } catch (error) {
      console.error('Error in POST /api/admin/clubs/:slug/suficiencia/forcar-revisao:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/admin/clubs/:slug/suficiencia/forcar-script  -> gera o script mesmo assim: confirma o que os materiais trouxeram
  // (origem automatica), ficha confirmada (confirmada_por 'admin:<quem>'), job `script` na fila. 6.2 vazio nunca gera script (400).
  router.post('/api/admin/clubs/:slug/suficiencia/forcar-script', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const club = await getClub(req.params.slug);
      if (!club) return res.status(404).json({ success: false, message: 'Clube não encontrado.' });
      const ficha = await ensureFicha(club.slug);
      const ac = SUF.autoConfirmar(safeJsonParse(ficha.fields, {}));
      const quemVende = String(SF.effectiveValue(ac.fields['6.2']) || '').trim();
      if (!quemVende) {
        return res.status(400).json({ success: false, message: 'Quem vende e de onde vem o lead está vazio: sem isso o script não pode ser gerado.', faltam: ['6.2'] });
      }
      const por = quemForcou(req);
      const suf = safeJsonParse(ficha.suficiencia, null) || {};
      const registro = {
        ...suf,
        resultado_original: suf.resultado_original || suf.resultado || null,
        resultado: 'suficiente',
        faltam: [],
        motivos: Array.isArray(suf.motivos) ? suf.motivos : [],
        forcado_por: { acao: 'script', por, em: new Date().toISOString() },
        campos_automaticos: ac.confirmados.length,
        vazios_automaticos: ac.vazios.length,
        pendentes_ignorados: ac.pendentes,
      };
      const membro = await dbGet(`SELECT email FROM cohort_members WHERE club_slug = ? ORDER BY created_at ASC LIMIT 1`, [club.slug]);
      const ultimoPrefill = await dbGet(
        `SELECT email, notify_phone FROM cohort_jobs WHERE club_slug = ? AND tipo = 'prefill' ORDER BY created_at DESC LIMIT 1`,
        [club.slug]
      );
      const email = (ultimoPrefill && ultimoPrefill.email) || (membro && membro.email) || `admin@${club.slug}`;
      const { job, existing } = await JOBS.enqueueJob({ dbGet, dbRun, uuidv4 }, {
        tipo: 'script',
        club_slug: club.slug,
        email,
        notify_phone: (ultimoPrefill && ultimoPrefill.notify_phone) || null,
        payload: { nome: null, motivo: 'forcado', origem: 'admin', forcado_por: por, pedido_em: new Date().toISOString() },
      });
      registro.script_job_id = job.id;
      await dbRun(
        `UPDATE script_fichas
            SET fields = ?, ficha_status = 'confirmada', confirmada_por = ?, suficiencia = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE club_slug = ?`,
        [JSON.stringify(ac.fields), `admin:${por}`, JSON.stringify(registro), club.slug]
      );
      res.json({ success: true, ficha_status: 'confirmada', confirmada_por: `admin:${por}`, suficiencia: registro, job: { ...job, existing } });
    } catch (error) {
      console.error('Error in POST /api/admin/clubs/:slug/suficiencia/forcar-script:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // PUT /api/admin/clubs/:slug/script-ficha  (JSON do contrato de pre-preenchimento)
  router.put('/api/admin/clubs/:slug/script-ficha', authMiddleware, adminMiddleware, validateBody(scriptPrefillSchema), async (req, res) => {
    try {
      const slug = req.params.slug;
      // Validacao e import compartilhados com PUT /api/jobs/:id/prefill (utils/script-ficha.cjs)
      const { errors, warnings } = SF.validatePrefillBody(req.body, slug);
      if (errors.length) {
        return res.status(400).json({ success: false, message: 'JSON fora do contrato.', errors, warnings });
      }

      const club = await getClub(slug);
      if (!club) {
        return res.status(404).json({ success: false, message: `Clube "${slug}" não encontrado. Cadastre o clube (membros) antes de importar.` });
      }

      const r = await SF.importPrefill({ dbGet, dbRun, uuidv4, safeJsonParse }, slug, req.body, { importado_por: 'admin' });
      res.json({
        success: true,
        message: `Importados ${r.imported.length} campos; ${r.complementos.length} já decididos ganharam complemento; ${r.skipped.length} mantidos.`,
        imported: r.imported.length,
        importados: r.imported,
        complementos: r.complementos,
        skipped: r.skipped,
        parcial: r.parcial,
        blocos_importados: r.blocos_importados,
        warnings,
        ficha_status: r.ficha_status,
        resumo: r.resumo,
      });
    } catch (error) {
      console.error('Error in PUT /api/admin/clubs/:slug/script-ficha:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/admin/clubs/:slug/script-versoes/:versao  -> versao com conteudo + comentarios (ver / baixar .md)
  router.get('/api/admin/clubs/:slug/script-versoes/:versao', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const n = Number(req.params.versao);
      if (!Number.isInteger(n) || n < 1) return res.status(400).json({ success: false, message: 'Versão inválida.' });
      const versao = await SV.getVersion({ dbGet }, req.params.slug, n);
      if (!versao) return res.status(404).json({ success: false, message: 'Versão não encontrada.' });
      res.json({ success: true, versao, comentarios: await SV.listComments({ dbAll }, req.params.slug, n) });
    } catch (error) {
      console.error('Error in GET /api/admin/clubs/:slug/script-versoes/:versao:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/admin/cohort/config  (chave/valor; hoje so prazo_materiais)
  router.get('/api/admin/cohort/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      res.json({ success: true, data: await VM.readCohortConfig(dbAll) });
    } catch (error) {
      console.error('Error in GET /api/admin/cohort/config:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // PUT /api/admin/cohort/config  { prazo_materiais }
  router.put('/api/admin/cohort/config', authMiddleware, adminMiddleware, validateBody(VM.cohortConfigSchema), async (req, res) => {
    try {
      for (const key of VM.COHORT_CONFIG_KEYS) {
        if (req.body[key] === undefined) continue;
        await dbRun(
          `INSERT INTO cohort_config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
          [key, req.body[key]]
        );
      }
      res.json({ success: true, data: await VM.readCohortConfig(dbAll) });
    } catch (error) {
      console.error('Error in PUT /api/admin/cohort/config:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/admin/cohort/jobs?status=  (fila de pre-preenchimento; mesma lista que GET /api/jobs)
  router.get('/api/admin/cohort/jobs', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const status = req.query.status ? String(req.query.status) : null;
      if (status && !VM.JOB_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: `status inválido (use ${VM.JOB_STATUSES.join('|')}).` });
      }
      const tipo = req.query.tipo ? String(req.query.tipo) : null;
      if (tipo && !VM.JOB_TIPOS.includes(tipo)) {
        return res.status(400).json({ success: false, message: `tipo inválido (use ${VM.JOB_TIPOS.join('|')}).` });
      }
      const jobs = await JOBS.listJobs({ dbAll }, { status, tipo, limit: req.query.limit });
      const slugs = [...new Set(jobs.map((j) => j.club_slug))];
      const clubs = slugs.length
        ? await dbAll(`SELECT slug, nome FROM cohort_clubs WHERE slug IN (${slugs.map(() => '?').join(',')})`, slugs)
        : [];
      const nomeBySlug = Object.fromEntries(clubs.map((c) => [c.slug, c.nome]));
      const emails = [...new Set(jobs.map((j) => j.email))];
      const membros = emails.length
        ? await dbAll(`SELECT email, nome FROM cohort_members WHERE email IN (${emails.map(() => '?').join(',')})`, emails)
        : [];
      const nomeByEmail = Object.fromEntries(membros.map((m) => [m.email, m.nome]));
      res.json({
        success: true,
        data: jobs.map((j) => ({
          ...j,
          club_nome: nomeBySlug[j.club_slug] || null,
          pessoa_nome: nomeByEmail[j.email] || (j.payload && j.payload.nome) || null,
        })),
        fila_ligada: !!String(process.env.COHORT_JOBS_TOKEN || '').trim(),
      });
    } catch (error) {
      console.error('Error in GET /api/admin/cohort/jobs:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/admin/cohort/jobs/:id/requeue  (volta para queued; nao duplica)
  router.post('/api/admin/cohort/jobs/:id/requeue', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const job = await JOBS.getJob({ dbGet }, req.params.id);
      if (!job) return res.status(404).json({ success: false, message: 'Job não encontrado.' });
      if (job.status === 'running') {
        return res.status(409).json({ success: false, message: 'Job em execução. Espere terminar (ou marque como erro pela API da fila).' });
      }
      const updated = await JOBS.requeueJob({ dbGet, dbRun }, job.id);
      res.json({ success: true, job: updated });
    } catch (error) {
      console.error('Error in POST /api/admin/cohort/jobs/:id/requeue:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // PUT /api/admin/clubs/:slug/members  { nome?, ativo?, add: [{email, nome}], remove: [email] }
  router.put('/api/admin/clubs/:slug/members', authMiddleware, adminMiddleware, validateBody(cohortMembersSchema), async (req, res) => {
    try {
      const slug = req.params.slug;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        return res.status(400).json({ success: false, message: 'Slug inválido (use letras minúsculas, números e hífen).' });
      }
      const { nome, ativo, add = [], remove = [] } = req.body;

      let club = await getClub(slug);
      if (!club) {
        if (!nome) return res.status(404).json({ success: false, message: 'Clube não encontrado. Informe "nome" para criar.' });
        await dbRun(`INSERT INTO cohort_clubs (slug, nome, ativo) VALUES (?, ?, ?)`, [slug, nome.trim(), ativo === 0 ? 0 : 1]);
      } else {
        if (nome) await dbRun(`UPDATE cohort_clubs SET nome = ? WHERE slug = ?`, [nome.trim(), slug]);
        if (ativo === 0 || ativo === 1) {
          await dbRun(`UPDATE cohort_clubs SET ativo = ? WHERE slug = ?`, [ativo, slug]);
          await resyncClubUsers(slug); // desativar tira o cohort dos membros; ativar devolve
        }
      }

      const added = [];
      for (const m of add) {
        const email = normEmail(m.email);
        if (!email) continue;
        await dbRun(
          `INSERT INTO cohort_members (email, club_slug, nome) VALUES (?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET club_slug = excluded.club_slug,
             nome = COALESCE(NULLIF(excluded.nome, ''), cohort_members.nome)`,
          [email, slug, m.nome ? m.nome.trim() : null]
        );
        added.push(email);
      }
      await markUsers(added, slug);

      const removed = [];
      for (const e of remove) {
        const email = normEmail(e);
        if (!email) continue;
        const r = await dbRun(`DELETE FROM cohort_members WHERE email = ? AND club_slug = ?`, [email, slug]);
        if (r.changes) {
          removed.push(email);
          await dbRun(`UPDATE users SET cohort = NULL, club_slug = NULL, updated_at = CURRENT_TIMESTAMP WHERE lower(email) = ? AND club_slug = ?`, [email, slug]);
        }
      }

      club = await getClub(slug);
      res.json({
        success: true,
        club: { slug: club.slug, nome: club.nome, ativo: club.ativo === 1 },
        added,
        removed,
        membros: await listMembers(slug),
      });
    } catch (error) {
      console.error('Error in PUT /api/admin/clubs/:slug/members:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  return router;
};
