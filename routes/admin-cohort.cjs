const { Router } = require('express');
const SF = require('../utils/script-ficha.cjs');
const { scriptPrefillSchema, cohortMembersSchema, validateBody } = require('../utils/validation.cjs');

/**
 * Admin do cohort (clubes do Exclusive) e da Ficha do Script.
 * Rotas por CLUBE (:slug), nao por usuario.
 */
module.exports = function createAdminCohortRoutes({ dbGet, dbRun, dbAll, authMiddleware, adminMiddleware, uuidv4, safeJsonParse }) {
  const router = Router();

  function normEmail(e) {
    return String(e || '').trim().toLowerCase();
  }

  function parseMaterials(raw) {
    const m = safeJsonParse(raw, {});
    return {
      links: Array.isArray(m.links) ? m.links : [],
      observacoes: typeof m.observacoes === 'string' ? m.observacoes : '',
    };
  }

  async function getClub(slug) {
    return dbGet(`SELECT * FROM cohort_clubs WHERE slug = ?`, [slug]);
  }

  async function ensureFicha(clubSlug) {
    await dbRun(
      `INSERT OR IGNORE INTO script_fichas (id, club_slug, fields, materials, materials_status, ficha_status)
       VALUES (?, ?, '{}', '{"links":[],"observacoes":""}', 'pending', 'vazia')`,
      [`ficha-${uuidv4()}`, clubSlug]
    );
    return dbGet(`SELECT * FROM script_fichas WHERE club_slug = ?`, [clubSlug]);
  }

  async function listMembers(slug) {
    return dbAll(
      `SELECT cm.email, cm.nome, cm.created_at, u.id AS user_id, u.name AS user_name, u.updated_at AS ultimo_login
         FROM cohort_members cm
         LEFT JOIN users u ON lower(u.email) = cm.email
        WHERE cm.club_slug = ?
        ORDER BY cm.created_at ASC`,
      [slug]
    );
  }

  async function listFiles(slug) {
    const rows = await dbAll(
      `SELECT f.id, f.user_id, f.category, f.file_name, f.file_type, f.file_size, f.created_at, u.email AS owner_email
         FROM uploaded_files f JOIN users u ON u.id = f.user_id
        WHERE u.club_slug = ? AND f.category LIKE 'script_%'
        ORDER BY f.created_at ASC`,
      [slug]
    );
    return rows.map((r) => ({
      id: r.id, userId: r.user_id, category: r.category, fileName: r.file_name,
      fileType: r.file_type, fileSize: r.file_size, createdAt: r.created_at, ownerEmail: r.owner_email,
    }));
  }

  /** Marca users.cohort/club_slug para os e-mails informados (se ja tem conta). */
  async function markUsers(emails, slug) {
    for (const email of emails) {
      await dbRun(
        `UPDATE users SET cohort = 'exclusive', club_slug = ?, updated_at = CURRENT_TIMESTAMP WHERE lower(email) = ?`,
        [slug, email]
      );
    }
  }

  // GET /api/admin/cohort  (visao geral por clube)
  router.get('/api/admin/cohort', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const clubs = await dbAll(
        `SELECT cc.slug, cc.nome, cc.ativo, cc.created_at,
                sf.materials_status, sf.materials_submitted_at, sf.ficha_status, sf.fields,
                sf.prefilled_at, sf.reviewed_at, sf.last_user_activity_at
           FROM cohort_clubs cc
           LEFT JOIN script_fichas sf ON sf.club_slug = cc.slug
          ORDER BY cc.nome COLLATE NOCASE ASC`
      );
      const members = await dbAll(
        `SELECT cm.email, cm.nome, cm.club_slug, u.id AS user_id, u.updated_at AS ultimo_login
           FROM cohort_members cm
           LEFT JOIN users u ON lower(u.email) = cm.email
          ORDER BY cm.created_at ASC`
      );
      const fileCounts = await dbAll(
        `SELECT u.club_slug, COUNT(*) AS c
           FROM uploaded_files f JOIN users u ON u.id = f.user_id
          WHERE f.category LIKE 'script_%' AND u.club_slug IS NOT NULL
          GROUP BY u.club_slug`
      );
      const countBySlug = Object.fromEntries(fileCounts.map((r) => [r.club_slug, r.c]));
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
        return {
          club_slug: c.slug,
          club_nome: c.nome,
          ativo: c.ativo === 1,
          membros: ms,
          materiais_count: countBySlug[c.slug] || 0,
          materials_status: c.materials_status || 'pending',
          materials_submitted_at: c.materials_submitted_at || null,
          ficha_status: c.ficha_status || 'vazia',
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
      res.json({
        success: true,
        data: {
          club: { slug: club.slug, nome: club.nome, ativo: club.ativo === 1 },
          membros: await listMembers(club.slug),
          files: await listFiles(club.slug),
          materials: parseMaterials(ficha.materials),
          materials_status: ficha.materials_status,
          materials_submitted_at: ficha.materials_submitted_at,
          ficha_status: ficha.ficha_status,
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

  // PUT /api/admin/clubs/:slug/script-ficha  (JSON do contrato de pre-preenchimento)
  router.put('/api/admin/clubs/:slug/script-ficha', authMiddleware, adminMiddleware, validateBody(scriptPrefillSchema), async (req, res) => {
    try {
      const slug = req.params.slug;
      const body = req.body;
      const errors = [];
      const warnings = [];

      if (body.club_slug && body.club_slug !== slug) {
        errors.push(`club_slug do JSON ("${body.club_slug}") difere da rota ("${slug}").`);
      }

      const keys = Object.keys(body.campos || {});
      const missing = SF.FIELD_KEYS.filter((k) => !keys.includes(k));
      const extra = keys.filter((k) => !SF.FIELD_BY_KEY[k]);
      if (missing.length) errors.push(`Faltam ${missing.length} campos: ${missing.join(', ')}.`);
      if (extra.length) errors.push(`Chaves desconhecidas: ${extra.join(', ')}.`);

      for (const k of keys) {
        const c = body.campos[k];
        if (!SF.FIELD_BY_KEY[k] || !c) continue;
        if (c.classe !== 'VZ') {
          if (!String(c.fonte || '').trim()) errors.push(`${k}: fonte obrigatória quando classe é ${c.classe}.`);
          if (!String(c.sugerido || '').trim()) errors.push(`${k}: sugerido vazio com classe ${c.classe} (use classe VZ).`);
        } else if (String(c.sugerido || '').trim()) {
          warnings.push(`${k}: classe VZ com sugerido preenchido; o texto será ignorado.`);
        }
        if ((c.alternativas || []).length > 2) errors.push(`${k}: no máximo 2 alternativas.`);
        const textos = [c.sugerido, ...(c.alternativas || []).map((a) => a.sugerido)].filter(Boolean);
        if (textos.some((t) => String(t).includes('—'))) warnings.push(`${k}: contém travessão.`);
      }

      if (errors.length) {
        return res.status(400).json({ success: false, message: 'JSON fora do contrato.', errors, warnings });
      }

      const club = await getClub(slug);
      if (!club) {
        return res.status(404).json({ success: false, message: `Clube "${slug}" não encontrado. Cadastre o clube (membros) antes de importar.` });
      }

      const ficha = await ensureFicha(slug);
      const { fields, imported, skipped } = SF.applyPrefill(safeJsonParse(ficha.fields, {}), body.campos);
      const nextStatus = ficha.ficha_status === 'vazia' ? 'pre_preenchida' : ficha.ficha_status;
      const meta = {
        club_nome: body.club_nome || null,
        membros: body.membros || [],
        gerado_em: body.gerado_em || null,
        gerado_por: body.gerado_por || null,
        fontes_lidas: body.fontes_lidas || [],
        importado_em: new Date().toISOString(),
      };

      await dbRun(
        `UPDATE script_fichas
            SET fields = ?, ficha_status = ?, prefill_meta = ?, prefilled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE club_slug = ?`,
        [JSON.stringify(fields), nextStatus, JSON.stringify(meta), slug]
      );

      const summary = SF.summarize(fields);
      res.json({
        success: true,
        message: `Importados ${imported.length} campos; ${skipped.length} mantidos (já decididos pelo mentor).`,
        imported: imported.length,
        skipped,
        warnings,
        ficha_status: nextStatus,
        resumo: summary,
      });
    } catch (error) {
      console.error('Error in PUT /api/admin/clubs/:slug/script-ficha:', error);
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
        if (ativo === 0 || ativo === 1) await dbRun(`UPDATE cohort_clubs SET ativo = ? WHERE slug = ?`, [ativo, slug]);
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
