/**
 * Materiais de um CLUBE agrupados por pessoa (visao completa: admin e worker da fila).
 * Compartilhado por routes/admin-cohort.cjs e routes/jobs.cjs. Inclui `acessos` (login/senha):
 * quem chama e responsavel por nao logar nem expor a outro membro.
 */
const VM = require('./validation-materials.cjs');

const normEmail = VM.normEmail;

// 1 linha por e-mail mesmo se users tiver duplicata por caixa (fica a de updated_at mais recente)
const LATEST_USER_JOIN = `LEFT JOIN users u ON u.id = (
      SELECT u2.id FROM users u2 WHERE lower(u2.email) = cm.email ORDER BY u2.updated_at DESC, u2.created_at DESC LIMIT 1)`;

async function listClubMembers({ dbAll }, slug) {
  return dbAll(
    `SELECT cm.email, cm.nome, cm.created_at, u.id AS user_id, u.name AS user_name, u.updated_at AS ultimo_login
       FROM cohort_members cm
       ${LATEST_USER_JOIN}
      WHERE cm.club_slug = ?
      ORDER BY cm.created_at ASC`,
    [slug]
  );
}

/** Materiais do clube (arquivos script_*), SEM os anexos de contexto por campo (script_contexto: utils/script-context.cjs). */
async function listClubFiles({ dbAll }, slug) {
  const rows = await dbAll(
    `SELECT f.id, f.user_id, f.category, f.file_name, f.file_type, f.file_size, f.created_at,
            u.email AS owner_email, u.name AS owner_name
       FROM uploaded_files f JOIN users u ON u.id = f.user_id
      WHERE u.club_slug = ? AND f.category LIKE 'script_%' AND f.category <> 'script_contexto'
      ORDER BY f.created_at ASC`,
    [slug]
  );
  return rows.map((r) => ({
    id: r.id, userId: r.user_id, category: r.category, fileName: r.file_name,
    fileType: r.file_type, fileSize: r.file_size, createdAt: r.created_at,
    ownerEmail: normEmail(r.owner_email), ownerName: r.owner_name || null,
  }));
}

/** Arquivo do clube (para stream): so se o dono esta no clube e a categoria e de script (inclui script_contexto). */
async function getClubFile({ dbGet }, slug, fileId) {
  return dbGet(
    `SELECT f.* FROM uploaded_files f JOIN users u ON u.id = f.user_id
      WHERE f.id = ? AND u.club_slug = ? AND f.category LIKE 'script_%'`,
    [fileId, slug]
  );
}

/**
 * Uniao de membros do clube, entradas em por_pessoa e donos de arquivo (ex-membro que enviou).
 * @param {(f: object) => string} [fileUrl] monta a URL de download de cada arquivo (worker)
 */
function buildPessoas(membros, files, materials, fileUrl) {
  const emails = new Set([
    ...membros.map((m) => normEmail(m.email)),
    ...Object.keys(materials.por_pessoa),
    ...files.map((f) => f.ownerEmail),
  ]);
  return [...emails].filter(Boolean).map((email) => {
    const m = membros.find((x) => normEmail(x.email) === email);
    const p = materials.por_pessoa[email] || VM.emptyPessoa();
    const own = files.filter((f) => f.ownerEmail === email);
    return {
      email,
      nome: (m && (m.nome || m.user_name)) || p.nome || null,
      user_id: m ? m.user_id : null,
      membro: !!m,
      files: fileUrl ? own.map((f) => ({ ...f, download_url: fileUrl(f) })) : own,
      links: p.links,
      observacoes: p.observacoes,
      acessos: p.acessos,
      resposta_ia: p.resposta_ia || null,
      notify_phone: p.notify_phone || null,
      submitted_at: p.submitted_at,
    };
  });
}

module.exports = { LATEST_USER_JOIN, listClubMembers, listClubFiles, getClubFile, buildPessoas };
