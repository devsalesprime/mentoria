const { Router } = require('express');
const { z } = require('zod');
const SF = require('../utils/script-ficha.cjs');
const { scriptFieldsUpdateSchema, validateBody } = require('../utils/validation.cjs');
const VM = require('../utils/validation-materials.cjs');
const PIA = require('../utils/script-prompt-ia.cjs');
const JOBS = require('../utils/cohort-jobs.cjs');
const CTX = require('../utils/script-context.cjs');
const SV = require('../utils/script-versions.cjs');
const SG = require('../utils/script-grifos.cjs');
const ST = require('../utils/script-tarefas.cjs');
const SUF = require('../utils/suficiencia.cjs');
const TEMPOS = require('../utils/script-tempos.cjs');
const MARCOS = require('../utils/script-marcos.cjs');

/**
 * Script 7 Passos (membro): Materiais + Ficha do Script + contexto por pergunta + versoes do script.
 * Ficha (campos) e por CLUBE: socios do mesmo clube leem e editam a mesma ficha.
 * Materiais (arquivos, links, observacoes, acessos) sao por PESSOA: cada membro ve so o que ele mesmo enviou;
 * socios nao veem uns aos outros; so o admin ve tudo (routes/admin-cohort.cjs).
 * Contexto por campo (audio/imagem/video/link/nota) e do CLUBE, com autor (so o autor apaga).
 * Versoes do script sao do CLUBE (o worker grava; o membro le, comenta, aprova e pede a proxima versao a partir dos comentarios).
 * Habilitado so para users.cohort != NULL (403 { enabled: false } caso contrario).
 */
module.exports = function createScriptRoutes({ dbGet, dbRun, dbAll, authMiddleware, uuidv4, fs, path, safeJsonParse, multer, DATA_DIR }) {
  const router = Router();
  const multerLib = multer || require('multer');
  const dataDir = DATA_DIR || path.join(__dirname, '..', 'data');

  VM.ensureCohortConfigTable(dbRun).catch((e) => console.error('cohort_config DDL error:', e.message));
  VM.ensureCohortJobsTable(dbRun).catch((e) => console.error('cohort_jobs DDL error:', e.message));
  CTX.ensureScriptContextTable(dbRun).catch((e) => console.error('script_field_context DDL error:', e.message));
  SV.ensureScriptVersionsTables(dbRun).catch((e) => console.error('script_versions DDL error:', e.message));
  SG.ensureScriptGrifosTable(dbRun).catch((e) => console.error('script_grifos DDL error:', e.message));
  ST.ensureScriptTarefasTable(dbRun).catch((e) => console.error('script_tarefas DDL error:', e.message));
  SUF.ensureSuficienciaColumns(dbRun).catch((e) => console.error('script_fichas suficiencia DDL error:', e.message));
  SF.ensureModoColumn(dbRun).catch((e) => console.error('script_fichas modo DDL error:', e.message));
  MARCOS.ensureMarcosColumns(dbRun).catch((e) => console.error('cohort_members marcos DDL error:', e.message));

  // Mesmo diskStorage de routes/files.cjs (data/uploads/<userId>/<timestamp>-<nome>); limite por tipo em CTX.fileError
  const contextStorage = multerLib.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(dataDir, 'uploads', req.user.userId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  });
  const uploadContext = multerLib({ storage: contextStorage, limits: { fileSize: 50 * 1024 * 1024 } });

  // POST /api/script/ficha/fields/:key/complemento
  const complementoSchema = z.object({
    acao: z.enum(['incorporar', 'dispensar']),
  });

  const refinarSchema = z.object({
    field_key: z.string().trim().min(3).max(8),
    pedido: z.string().trim().max(2000).optional().default(''),
  });

  // PUT /api/script/ficha/modo  { modo: 'essencial' | 'completo' }
  const modoSchema = z.object({ modo: z.enum(['essencial', 'completo']) });

  // PUT /api/script/visto  { marco: 'como_funciona' | 'whatsapp_lembrete' }
  const marcoSchema = z.object({ marco: z.enum(Object.keys(MARCOS.MARCOS)) });

  // POST /api/script/versoes/:versao/revisar  { pedido?, comentarios? }
  // comentarios = os grifos ja convertidos pelo front ("[GRIFO ajustar] «trecho» → nota", passo 0..7 ou 9); opcional.
  const revisarSchema = z.object({
    pedido: z.string().trim().max(5000).optional().default(''),
    comentarios: z.array(SG.grifoComentarioSchema).max(300).optional(),
  });

  const SCRIPT_CATEGORIES = [
    'script_transcricao_venda',
    'script_apostila_slides',
    'script_proposta_roteiro',
    'script_crm',
    'script_outros',
  ];

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
       VALUES (?, ?, '{}', '{"por_pessoa":{}}', 'pending', 'vazia')`,
      [`ficha-${uuidv4()}`, clubSlug]
    );
    return dbGet(`SELECT * FROM script_fichas WHERE club_slug = ?`, [clubSlug]);
  }

  /** Arquivos de MATERIAIS do PROPRIO usuario (nunca os dos socios; anexos de contexto ficam fora). */
  async function listOwnFiles(userId) {
    const rows = await dbAll(
      `SELECT id, user_id, category, file_name, file_type, file_size, created_at
         FROM uploaded_files
        WHERE user_id = ? AND category LIKE 'script_%' AND category <> ?
        ORDER BY created_at ASC`,
      [userId, CTX.CONTEXT_CATEGORY]
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      category: r.category,
      fileName: r.file_name,
      fileType: r.file_type,
      fileSize: r.file_size,
      createdAt: r.created_at,
      mine: true,
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
      if (user.club_ativo !== 1) {
        return res.status(403).json({ success: false, enabled: false, message: 'Clube inativo. Fale com o Caio.' });
      }
      req.cohort = user;
      req.ficha = await ensureFicha(user.club_slug);
      next();
    } catch (error) {
      console.error('Error in cohortGuard:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  }

  /** Resumo do job da pessoa para o front (sem payload/result): inclui `progresso` (marcos do worker) e `error`. */
  function jobView(job) {
    if (!job) return null;
    return {
      id: job.id, tipo: job.tipo, status: job.status, attempts: job.attempts,
      progresso: job.progresso || null, error: job.error || null,
      created_at: job.created_at, started_at: job.started_at, finished_at: job.finished_at,
    };
  }

  const PREFILL_DONE_VISIVEL_MS = 10 * 60 * 1000;

  /** Timestamp do SQLite ('YYYY-MM-DD HH:MM:SS', UTC) ou ISO -> ms; NaN quando nao da para ler. */
  function tsMs(s) {
    if (!s) return NaN;
    const str = String(s);
    return Date.parse(/T|Z|[+-]\d\d:?\d\d$/.test(str) ? str : `${str.replace(' ', 'T')}Z`);
  }

  /**
   * Job `prefill` que o membro ve na ficha: queued/running/needs_human/error sempre; done so por 10 minutos
   * depois de finished_at (o painel "Pronto" some sozinho); depois disso, null.
   */
  function prefillJobParaMembro(job, agora = Date.now()) {
    if (!job) return null;
    if (job.status !== 'done') return job;
    const fim = tsMs(job.finished_at);
    if (Number.isNaN(fim)) return job;
    return agora - fim <= PREFILL_DONE_VISIVEL_MS ? job : null;
  }

  /**
   * Nomes das pessoas do clube por e-mail ({ "a@x.com": "Ana" }): o campo da ficha diz quem respondeu
   * quando foi o socio, e o aviso de escrita concorrente chama a pessoa pelo nome. Nome do cohort primeiro
   * (o admin edita la), depois o da conta.
   */
  async function nomesDoClube(clubSlug) {
    const linhas = await dbAll(
      `SELECT cm.email AS email, cm.nome AS nome, u.name AS user_name
         FROM cohort_members cm
         LEFT JOIN users u ON lower(u.email) = cm.email
        WHERE cm.club_slug = ?
        UNION
       SELECT lower(u.email) AS email, NULL AS nome, u.name AS user_name
         FROM users u WHERE u.club_slug = ?`,
      [clubSlug, clubSlug]
    );
    const out = {};
    for (const l of linhas) {
      const email = String(l.email || '').trim().toLowerCase();
      const nome = String(l.nome || l.user_name || '').trim();
      if (email && nome && !out[email]) out[email] = nome;
    }
    return out;
  }

  function fichaPayload(ficha, user, files, config, job, extra = {}) {
    const view = SF.buildFichaView(safeJsonParse(ficha.fields, {}), { includeInternal: false, nomes: extra.nomes || null });
    const prefillMeta = safeJsonParse(ficha.prefill_meta, null) || {};
    const materials = VM.normalizeMaterials(ficha.materials);
    const mine = VM.memberMaterialsView(materials, user.email);
    // Por campo: quantos itens de contexto o clube anexou e se ha job `refinar` na fila para ele
    const counts = extra.contextoCounts || {};
    const refinando = new Set(extra.refinandoKeys || []);
    view.blocos = view.blocos.map((b) => ({
      ...b,
      campos: b.campos.map((c) => ({ ...c, contexto_count: counts[c.key] || 0, refinando: refinando.has(c.key) })),
    }));
    return {
      club: { slug: user.club_slug, nome: user.club_nome },
      ficha_status: ficha.ficha_status,
      // Caminho escolhido na entrada: 'essencial' (16 perguntas) | 'completo' (34) | null (ainda nao escolheu)
      modo: ficha.modo === 'essencial' || ficha.modo === 'completo' ? ficha.modo : null,
      // 'automatico' quando o app escolheu o completo sozinho (os materiais bastaram antes da tela de escolha):
      // a ficha mostra uma vez "Você está no caminho completo. Prefere o essencial?"
      modo_origem: prefillMeta.modo_origem === SF.MODO_ORIGEM_AUTOMATICO ? SF.MODO_ORIGEM_AUTOMATICO : null,
      // 'automatica' quando os materiais bastaram e o app fechou a ficha sozinho; 'mentor' quando ele fechou; null reaberta
      confirmada_por: ficha.confirmada_por || null,
      // Gates de suficiencia (GATES-suficiencia.md): { resultado, faltam, motivos, ... } depois do pre-preenchimento; null antes
      suficiencia: safeJsonParse(ficha.suficiencia, null),
      // Por pessoa: "submitted" com "Enviei o que tinha"; "skipped" com "Não tenho materiais, ir para a ficha"
      materials_status: VM.memberMaterialsStatus(materials, user.email),
      materials_submitted_at: mine.submitted_at,
      materials: mine,
      // Ultimo job de pre-preenchimento DESTA pessoa (queued/running = "ja estamos processando")
      job: jobView(job),
      // Script escrito: versoes do clube + ultimo job `script` do clube (a tela "Seu script" usa)
      // `entregaveis` = { "3": [{ tipo, arquivos: [{ campo, nome, bytes, url }], created_at }] } por versao (apresentacao comercial)
      script: {
        ...(extra.scriptSummary || { versoes: 0, ultima: null, aprovada: null }),
        job: jobView(extra.scriptJob),
        entregaveis: extra.entregaveis || {},
        // Rodada de ajustes do clube (onda E4): quantos pedidos de nova versao ja sairam e qual e o teto
        ajustes_usados: extra.ajustes ? extra.ajustes.usados : 0,
        ajustes_limite: extra.ajustes ? extra.ajustes.limite : 1,
      },
      // So o que a tela do membro precisa: o prazo escrito pelo admin e se existe amostra configurada
      // (o clube e a versao da amostra ficam so no servidor; quem os le e GET /api/script/amostra)
      config: {
        prazo_materiais: (config && config.prazo_materiais) || '',
        amostra_disponivel: !!VM.parseAmostra(config && config.amostra_script),
      },
      // Marcos desta PESSOA (onda I): data ISO ou null. `null` na primeira = a tela "Como funciona" abre antes de tudo
      visto_como_funciona: extra.marcos ? extra.marcos.como_funciona : null,
      visto_whatsapp_lembrete: extra.marcos ? extra.marcos.whatsapp_lembrete : null,
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

  /** Le o JSON de materiais fresco (evita sobrescrever o que um socio salvou entre o guard e o write). */
  async function freshMaterials(clubSlug) {
    const row = await dbGet(`SELECT materials FROM script_fichas WHERE club_slug = ?`, [clubSlug]);
    return VM.normalizeMaterials(row ? row.materials : null);
  }

  // GET /api/script/ficha
  router.get('/api/script/ficha', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const slug = req.cohort.club_slug;
      const [files, config, job, contextoCounts, refinandoKeys, scriptSummary, scriptJob, entregaveis, nomes, ajustes, marcos] = await Promise.all([
        listOwnFiles(req.user.userId),
        VM.readCohortConfig(dbAll),
        JOBS.findLatestJob({ dbGet }, { club_slug: slug, email: req.cohort.email }),
        CTX.countByField({ dbAll }, slug),
        JOBS.listRefiningKeys({ dbAll }, slug),
        SV.scriptSummary({ dbGet }, slug),
        JOBS.findLatestJob({ dbGet }, { tipo: 'script', club_slug: slug }),
        SV.entregaveisPorVersao({ dbAll }, slug, entregavelUrl),
        nomesDoClube(slug),
        contarAjustes(slug),
        MARCOS.lerMarcos({ dbGet }, req.cohort.email),
      ]);
      res.json({
        success: true,
        enabled: true,
        data: fichaPayload(req.ficha, req.cohort, files, config, prefillJobParaMembro(job), { contextoCounts, refinandoKeys, scriptSummary, scriptJob, entregaveis, nomes, ajustes, marcos }),
      });
    } catch (error) {
      console.error('Error in GET /api/script/ficha:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // PUT /api/script/ficha/modo  { modo: 'essencial' | 'completo' }
  // Escolha na entrada (SPEC-workflow-v2-decisoes-06-09 §1 e §2): 'essencial' abre so as 16 perguntas que
  // fecham o cartao de bolso; 'completo' abre a ficha inteira. Do essencial da para aprofundar para o completo
  // quando quiser (mesmas chaves, mesmo estado: nada se perde). O caminho de volta nao e oferecido na tela.
  router.put('/api/script/ficha/modo', authMiddleware, cohortGuard, validateBody(modoSchema), async (req, res) => {
    try {
      const modo = SF.normalizeModo(req.body.modo);
      // A escolha passou a ser da pessoa: a marca de "quem escolheu foi o app" sai junto (a oferta do
      // essencial nao volta depois que ela decidiu).
      const meta = safeJsonParse(req.ficha.prefill_meta, null);
      let metaJson = null;
      if (meta && typeof meta === 'object' && meta.modo_origem) {
        const { modo_origem: _fora, modo_definido_em: _tambem, ...resto } = meta;
        metaJson = JSON.stringify({ ...resto, modo_escolhido_em: new Date().toISOString() });
      }
      await dbRun(
        `UPDATE script_fichas
            SET modo = ?, prefill_meta = COALESCE(?, prefill_meta),
                last_user_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE club_slug = ?`,
        [modo, metaJson, req.cohort.club_slug]
      );
      res.json({ success: true, modo });
    } catch (error) {
      console.error('Error in PUT /api/script/ficha/modo:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // ─── Onda I: entrada, tempo real das etapas, fila e amostra ───────────────

  /**
   * PUT /api/script/visto  { marco: 'como_funciona' | 'whatsapp_lembrete' }
   * Marca por PESSOA, idempotente (regravar mantem a primeira data):
   *   como_funciona     -> "Começar o meu script" na tela inicial; a tela sai da frente e vira item de menu
   *   whatsapp_lembrete -> a pessoa dispensou o lembrete unico do WhatsApp numa tela de espera
   */
  router.put('/api/script/visto', authMiddleware, cohortGuard, validateBody(marcoSchema), async (req, res) => {
    try {
      const r = await MARCOS.marcarMarco({ dbRun }, { email: req.cohort.email, marco: req.body.marco });
      if (!r) return res.status(400).json({ success: false, message: 'Marco desconhecido.' });
      // `gravado: false` = a pessoa nao esta na lista do clube; a marca nao persiste e a tela volta depois
      res.json({ success: true, gravado: r.gravado, marcos: await MARCOS.lerMarcos({ dbGet }, req.cohort.email) });
    } catch (error) {
      console.error('Error in PUT /api/script/visto:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  /**
   * GET /api/script/tempos -> { tempos: { prefill: { mediana_min, n }, script, refinar, slides } }
   * Mediana dos ultimos 20 trabalhos concluidos por tipo, em minutos, arredondada para cima, piso de 5.
   * `mediana_min` null = sem historico: a tela mostra a copy sem numero. So leitura.
   */
  router.get('/api/script/tempos', authMiddleware, cohortGuard, async (req, res) => {
    try {
      res.json({ success: true, tempos: await TEMPOS.temposPorTipo({ dbAll }) });
    } catch (error) {
      console.error('Error in GET /api/script/tempos:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  /**
   * GET /api/script/fila?tipo=prefill|script -> { na_frente, clubes: [nome], status, tem_job }
   * Quantos trabalhos do mesmo tipo entraram antes do desta pessoa e ainda estao em andamento, com o
   * nome dos clubes na ordem de entrada (decisao D8). So leitura.
   */
  router.get('/api/script/fila', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const tipo = req.query.tipo ? String(req.query.tipo) : 'prefill';
      if (tipo !== 'prefill' && tipo !== 'script') {
        return res.status(400).json({ success: false, message: 'tipo inválido (use prefill|script).' });
      }
      const fila = await TEMPOS.filaDoMembro({ dbAll, dbGet }, {
        tipo,
        club_slug: req.cohort.club_slug,
        email: req.cohort.email,
      });
      res.json({ success: true, tipo, ...fila });
    } catch (error) {
      console.error('Error in GET /api/script/fila:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  /**
   * GET /api/script/amostra -> o script de exemplo configurado pelo admin (cohort_config.amostra_script,
   * um JSON { club_slug, versao }), no mesmo formato que o leitor ja consome. 404 sem configuracao,
   * com configuracao quebrada ou quando a versao nao existe mais. Nenhum clube nem versao no codigo.
   */
  router.get('/api/script/amostra', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const config = await VM.readCohortConfig(dbAll);
      const alvo = VM.parseAmostra(config.amostra_script);
      if (!alvo) return res.status(404).json({ success: false, message: 'Ainda não há um exemplo publicado.' });
      const versao = await SV.getVersion({ dbGet }, alvo.club_slug, alvo.versao);
      if (!versao) return res.status(404).json({ success: false, message: 'Ainda não há um exemplo publicado.' });
      const clube = await dbGet(`SELECT nome FROM cohort_clubs WHERE slug = ?`, [alvo.club_slug]);
      res.json({
        success: true,
        amostra: {
          club_slug: alvo.club_slug,
          club_nome: (clube && clube.nome) || alvo.club_slug,
          versao: versao.versao,
          content_md: versao.content_md,
          created_at: versao.created_at,
        },
      });
    } catch (error) {
      console.error('Error in GET /api/script/amostra:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/script/prompt-ia  -> { prompt } gerado por clube ("Peca para a sua IA preencher")
  router.get('/api/script/prompt-ia', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const membros = await dbAll(
        `SELECT cm.email, cm.nome, u.name AS user_name FROM cohort_members cm
           LEFT JOIN users u ON lower(u.email) = cm.email
          WHERE cm.club_slug = ? ORDER BY cm.created_at ASC`,
        [req.cohort.club_slug]
      );
      const nomes = [];
      for (const m of membros) {
        const n = m.nome || m.user_name;
        if (n && !nomes.includes(n)) nomes.push(n);
      }
      const prompt = PIA.buildPromptIA({ mentorNome: req.cohort.name, clubNome: req.cohort.club_nome, membros: nomes });
      res.json({ success: true, prompt, campos: SF.FIELD_KEYS.length });
    } catch (error) {
      console.error('Error in GET /api/script/prompt-ia:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // PUT /api/script/ficha/fields  { updates: { "3.3": { valor, status, rev?, forcar? } } }
  // Escrita concorrente de socios: cada campo carrega `rev`; se o socio respondeu depois da leitura desta
  // tela, o campo nao e gravado e volta em `conflitos` (resposta 409) para a pessoa escolher qual fica.
  router.put('/api/script/ficha/fields', authMiddleware, cohortGuard, validateBody(scriptFieldsUpdateSchema), async (req, res) => {
    try {
      const { updates } = req.body;
      const current = safeJsonParse(req.ficha.fields, {});
      const { fields, applied, rejected, conflitos } = SF.applyUpdates(current, updates, req.cohort.email, { checarRev: true });

      if (applied.length) {
        // Primeira acao do mentor move a ficha para em_revisao; alterar depois de confirmada reabre (e limpa quem confirmou).
        const nextStatus = ['vazia', 'pre_preenchida', 'confirmada'].includes(req.ficha.ficha_status)
          ? 'em_revisao'
          : req.ficha.ficha_status;
        const reabriu = req.ficha.ficha_status === 'confirmada';
        await dbRun(
          `UPDATE script_fichas
              SET fields = ?, ficha_status = ?, last_user_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                  ${reabriu ? ', confirmada_por = NULL' : ''}
            WHERE club_slug = ?`,
          [JSON.stringify(fields), nextStatus, req.cohort.club_slug]
        );
      }

      const fresh = await dbGet(`SELECT * FROM script_fichas WHERE club_slug = ?`, [req.cohort.club_slug]);
      const nomes = conflitos.length ? await nomesDoClube(req.cohort.club_slug) : null;
      const view = SF.buildFichaView(safeJsonParse(fresh.fields, {}), { nomes });
      const campos = view.blocos.flatMap((b) => b.campos);
      const corpo = {
        success: !conflitos.length,
        applied,
        rejected,
        // Versao de cada campo gravado: a tela guarda para o proximo PUT
        revs: Object.fromEntries(applied.map((k) => [k, (campos.find((c) => c.key === k) || {}).rev || 0])),
        ficha_status: fresh.ficha_status,
        progresso: view.progresso,
        hoje: view.hoje,
        blocos: view.blocos.map((b) => ({
          numero: b.numero, decididos: b.decididos, total: b.total,
          obrigatorios: b.obrigatorios, obrigatorios_decididos: b.obrigatorios_decididos, fechado: b.fechado,
        })),
      };
      if (conflitos.length) {
        corpo.message = conflitos.length === 1
          ? 'O seu sócio respondeu este campo antes de você.'
          : 'O seu sócio respondeu estes campos antes de você.';
        corpo.conflitos = conflitos.map((c) => {
          const campo = campos.find((x) => x.key === c.key) || {};
          return {
            field_key: c.key,
            rev: c.rev,
            status: c.status,
            valor: c.valor,
            sugerido: c.sugerido,
            valor_efetivo: campo.valor_efetivo != null ? campo.valor_efetivo : c.valor,
            decidido_por: SF.autorDoCampo({ atualizado_por: c.atualizado_por }, nomes),
            atualizado_em: c.atualizado_em,
          };
        });
        return res.status(409).json(corpo);
      }
      res.json(corpo);
    } catch (error) {
      console.error('Error in PUT /api/script/ficha/fields:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/ficha/fields/:key/complemento  { acao: 'incorporar' | 'dispensar' }
  // Achado do worker em cima de um campo JA decidido (campo.complemento). incorporar = anexa ao texto atual
  // (linha em branco no meio), status `editado`, o mentor lapida depois; dispensar = so apaga. Sem complemento -> 400.
  router.post('/api/script/ficha/fields/:key/complemento', authMiddleware, cohortGuard, validateBody(complementoSchema), async (req, res) => {
    try {
      const key = String(req.params.key || '');
      if (!SF.FIELD_BY_KEY[key]) return res.status(400).json({ success: false, message: `Campo desconhecido: ${key}.` });
      const r = SF.applyComplemento(safeJsonParse(req.ficha.fields, {}), key, req.body.acao, req.cohort.email);
      if (!r.ok) {
        return res.status(400).json({ success: false, message: r.motivo === 'sem complemento' ? 'Este campo não tem complemento.' : 'Ação inválida.' });
      }
      // Incorporar e decisao do mentor: a ficha vai para em_revisao (confirmada reabre); dispensar nao muda o status
      const nextStatus = r.decidiu && ['vazia', 'pre_preenchida', 'confirmada'].includes(req.ficha.ficha_status) ? 'em_revisao' : req.ficha.ficha_status;
      const reabriu = r.decidiu && req.ficha.ficha_status === 'confirmada';
      await dbRun(
        `UPDATE script_fichas
            SET fields = ?, ficha_status = ?, last_user_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                ${reabriu ? ', confirmada_por = NULL' : ''}
          WHERE club_slug = ?`,
        [JSON.stringify(r.fields), nextStatus, req.cohort.club_slug]
      );
      const view = SF.buildFichaView(r.fields);
      const campo = view.blocos.flatMap((b) => b.campos).find((c) => c.key === key);
      res.json({
        success: true,
        field_key: key,
        acao: req.body.acao,
        campo,
        ficha_status: nextStatus,
        progresso: view.progresso,
        hoje: view.hoje,
        blocos: view.blocos.map((b) => ({
          numero: b.numero, decididos: b.decididos, total: b.total,
          obrigatorios: b.obrigatorios, obrigatorios_decididos: b.obrigatorios_decididos, fechado: b.fechado,
        })),
      });
    } catch (error) {
      console.error('Error in POST /api/script/ficha/fields/:key/complemento:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  /**
   * Enfileira o job `script` do clube: escreve o script DO ZERO a partir da ficha (1 ativo por clube, junto com `revisar`).
   * motivo = 'complete' (fechou a ficha) | 'gerar-script' (botao "Gerar do zero").
   */
  async function enqueueScriptJob(req, motivo) {
    const key = VM.normEmail(req.cohort.email);
    return JOBS.enqueueJob({ dbGet, dbRun, uuidv4 }, {
      tipo: 'script',
      club_slug: req.cohort.club_slug,
      email: key,
      notify_phone: await lastNotifyPhone(req.cohort.club_slug, key),
      payload: { nome: req.cohort.name || null, motivo, pedido_em: new Date().toISOString() },
    });
  }

  /** WhatsApp que a pessoa deixou no "Confirmar e ir para a ficha" (para o aviso de script pronto), se houver. */
  async function lastNotifyPhone(clubSlug, email) {
    const materials = await freshMaterials(clubSlug);
    const p = materials.por_pessoa[email];
    return p && p.notify_phone ? p.notify_phone : null;
  }

  // POST /api/script/ficha/complete  -> ficha confirmada + job `script` na fila (1 ativo por clube)
  // Com suficiencia `parcial`/`suficiente` (GATES-suficiencia.md): basta o mentor decidir os campos em `faltam`;
  // o resto do que os materiais trouxeram e confirmado em nome dele (origem 'automatica') na hora de fechar.
  router.post('/api/script/ficha/complete', authMiddleware, cohortGuard, async (req, res) => {
    try {
      // Modo essencial: fecha com as 16 perguntas decididas; o resto fica em aberto para quando aprofundar
      const modo = SF.normalizeModo(req.ficha.modo);
      let fields = safeJsonParse(req.ficha.fields, {});
      let missing = SF.missingPorModo(fields, modo);
      let automaticos = [];
      const suf = safeJsonParse(req.ficha.suficiencia, null);
      if (modo === 'completo' && missing.length && suf && ['parcial', 'suficiente'].includes(suf.resultado)) {
        const norm = SF.normalizeFields(fields);
        const pendentes = (suf.faltam || []).filter((k) => SF.FIELD_BY_KEY[k] && !SF.isDecided(norm[k]));
        if (pendentes.length) {
          return res.status(400).json({
            success: false,
            message: pendentes.length === 1 ? 'Falta 1 resposta sua para o script.' : `Faltam ${pendentes.length} respostas suas para o script.`,
            faltam: pendentes,
          });
        }
        const ac = SUF.autoConfirmar(fields);
        fields = ac.fields;
        automaticos = ac.confirmados;
        missing = SF.missingRequired(fields);
      }
      if (missing.length) {
        return res.status(400).json({
          success: false,
          message: modo === 'essencial'
            ? `Ainda faltam ${missing.length} perguntas essenciais com decisão.`
            : `Ainda faltam ${missing.length} campos obrigatórios com decisão.`,
          faltam: missing,
        });
      }
      // Doutrina de papeis: 6.2 vazio nunca gera script
      if (!String(SF.effectiveValue(SF.normalizeFields(fields)['6.2']) || '').trim()) {
        return res.status(400).json({ success: false, message: 'Diga quem conduz a venda (Quem vende e de onde vem o lead) antes de fechar a ficha.', faltam: ['6.2'] });
      }
      await dbRun(
        `UPDATE script_fichas
            SET fields = ?, ficha_status = 'confirmada', confirmada_por = 'mentor', reviewed_at = CURRENT_TIMESTAMP,
                last_user_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE club_slug = ?`,
        [JSON.stringify(fields), req.cohort.club_slug]
      );
      const { job, existing } = await enqueueScriptJob(req, 'complete');
      res.json({ success: true, ficha_status: 'confirmada', confirmada_por: 'mentor', modo, automaticos, job: { ...jobView(job), existing } });
    } catch (error) {
      console.error('Error in POST /api/script/ficha/complete:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/ficha/gerar-script  -> "Gerar do zero": job `script` (ignora versoes e comentarios); so com a ficha confirmada.
  // "Pedir nova versao" a partir dos comentarios e POST /api/script/versoes/:versao/revisar.
  router.post('/api/script/ficha/gerar-script', authMiddleware, cohortGuard, async (req, res) => {
    try {
      if (req.ficha.ficha_status !== 'confirmada') {
        const missing = SF.missingPorModo(safeJsonParse(req.ficha.fields, {}), req.ficha.modo);
        return res.status(400).json({
          success: false,
          message: missing.length ? `Feche a ficha antes: faltam ${missing.length} campos obrigatórios.` : 'Feche a ficha antes de pedir o script.',
          faltam: missing,
        });
      }
      const { job, existing } = await enqueueScriptJob(req, 'gerar-script');
      await touchActivity(req.cohort.club_slug);
      res.json({ success: true, job: { ...jobView(job), existing } });
    } catch (error) {
      console.error('Error in POST /api/script/ficha/gerar-script:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/ficha/refinar  { field_key, pedido? }  -> job `refinar` (1 ativo por clube + campo); vale mesmo com o campo decidido
  router.post('/api/script/ficha/refinar', authMiddleware, cohortGuard, validateBody(refinarSchema), async (req, res) => {
    try {
      const key = req.body.field_key;
      if (!SF.FIELD_BY_KEY[key]) return res.status(400).json({ success: false, message: 'Campo desconhecido.' });
      const { job, existing } = await JOBS.enqueueJob({ dbGet, dbRun, uuidv4 }, {
        tipo: 'refinar',
        club_slug: req.cohort.club_slug,
        email: VM.normEmail(req.cohort.email),
        payload: { field_key: key, nome: req.cohort.name || null, pedido: req.body.pedido || '', pedido_em: new Date().toISOString() },
      });
      await touchActivity(req.cohort.club_slug);
      res.json({ success: true, field_key: key, job: { ...jobView(job), existing } });
    } catch (error) {
      console.error('Error in POST /api/script/ficha/refinar:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // ─── Contexto por pergunta (do clube, com autor) ───────────────────────────

  // A mesma URL que o pedido de revisao usa nos anexos do grifo (SV): uma so definicao para as duas rotas
  const contextFileUrl = SV.contextFileUrl;

  // GET /api/script/context?field=3.3  -> { items } ; sem field -> { items, por_campo }
  router.get('/api/script/context', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const field = req.query.field ? String(req.query.field) : null;
      if (field && !SF.FIELD_BY_KEY[field]) return res.status(400).json({ success: false, message: 'Campo desconhecido.' });
      const items = await CTX.listContext({ dbAll }, req.cohort.club_slug, { field, fileUrl: contextFileUrl });
      res.json({ success: true, field, items, ...(field ? {} : { por_campo: CTX.groupByField(items) }) });
    } catch (error) {
      console.error('Error in GET /api/script/context:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/context  multipart: field_key, tipo, file?, url?, texto?, legenda?
  router.post('/api/script/context', authMiddleware, cohortGuard, (req, res, next) => {
    uploadContext.single('file')(req, res, (err) => {
      if (!err) return next();
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      res.status(400).json({ success: false, message: tooBig ? 'Arquivo grande demais (máximo 50 MB).' : `Upload inválido: ${err.message}` });
    });
  }, async (req, res) => {
    const dropFile = () => { if (req.file) { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } } };
    try {
      const parsed = CTX.contextBodySchema.safeParse(req.body || {});
      if (!parsed.success) {
        dropFile();
        return res.status(400).json({ success: false, message: 'Dados inválidos', errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
      }
      const v = CTX.validateContextRequest(parsed.data, req.file, SF.FIELD_KEYS);
      if (!v.ok) { dropFile(); return res.status(400).json({ success: false, message: v.message }); }
      const { item } = v;
      const fieldKey = parsed.data.field_key;

      let fileId = null;
      if (req.file) {
        fileId = uuidv4();
        await dbRun(
          `INSERT INTO uploaded_files (id, user_id, category, module, file_name, file_path, file_type, file_size)
           VALUES (?, ?, ?, 'script', ?, ?, ?, ?)`,
          [fileId, req.user.userId, CTX.CONTEXT_CATEGORY, req.file.originalname, req.file.path, req.file.mimetype, req.file.size]
        );
      }

      let transcricao = null;
      let erro = null;
      if (item.tipo === 'audio') {
        const t = await CTX.transcribeAudio(req.file.path, { mimetype: req.file.mimetype, fileName: req.file.originalname, fs });
        if (t.ok) transcricao = t.texto; else erro = t.erro;
      }

      const id = `ctx-${uuidv4()}`;
      await CTX.insertContext({ dbRun }, {
        id, club_slug: req.cohort.club_slug, user_id: req.user.userId, field_key: fieldKey,
        tipo: item.tipo, file_id: fileId, url: item.url, texto: item.texto, legenda: item.legenda,
        transcricao, erro_transcricao: erro,
      });
      await touchActivity(req.cohort.club_slug);
      const saved = await CTX.getContextItem({ dbGet }, req.cohort.club_slug, id, contextFileUrl);
      res.json({
        success: true,
        item: saved,
        ...(erro ? { warning: `Áudio guardado, mas a transcrição falhou (${erro}). Você pode escrever o essencial numa nota.` } : {}),
      });
    } catch (error) {
      dropFile();
      console.error('Error in POST /api/script/context:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // DELETE /api/script/context/:id  (so o autor)
  router.delete('/api/script/context/:id', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const item = await CTX.getContextItem({ dbGet }, req.cohort.club_slug, req.params.id);
      if (!item) return res.status(404).json({ success: false, message: 'Item não encontrado.' });
      if (item.autor_user_id !== req.user.userId) return res.status(403).json({ success: false, message: 'Só quem enviou pode apagar.' });
      await CTX.deleteContext({ dbGet, dbRun }, req.cohort.club_slug, req.params.id, { fs });
      res.json({ success: true, id: req.params.id, field_key: item.field_key });
    } catch (error) {
      console.error('Error in DELETE /api/script/context/:id:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/script/context/files/:fileId/download  (qualquer socio do clube)
  router.get('/api/script/context/files/:fileId/download', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const row = await CTX.getContextFile({ dbGet }, req.cohort.club_slug, req.params.fileId);
      if (!row) return res.status(404).json({ success: false, message: 'Arquivo não encontrado.' });
      if (!fs.existsSync(row.file_path)) return res.status(404).json({ success: false, message: 'Arquivo não encontrado no disco.' });
      const inline = req.query.inline === '1';
      res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(row.file_name)}"`);
      if (row.file_type) res.setHeader('Content-Type', row.file_type);
      fs.createReadStream(row.file_path).pipe(res);
    } catch (error) {
      console.error('Error in GET /api/script/context/files/:fileId/download:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // ─── Versoes do script (do clube) ─────────────────────────────────────────

  function parseVersao(req, res) {
    const n = Number(req.params.versao);
    if (!Number.isInteger(n) || n < 1) { res.status(400).json({ success: false, message: 'Versão inválida.' }); return null; }
    return n;
  }

  /** URL de download de um arquivo do entregavel (o membro nunca recebe caminho de disco). */
  const entregavelUrl = (versao, tipo, campo) =>
    `/api/script/versoes/${Number(versao)}/entregaveis/${encodeURIComponent(tipo)}/${encodeURIComponent(campo)}`;

  /**
   * Pendura em cada versao o que a tela "Seu script" precisa sem uma chamada a mais:
   * `entregaveis` (a apresentacao comercial ja publicada) e `slides_job` (o job `slides` na fila / sendo montado).
   */
  async function decorarVersoes(slug, versoes) {
    const [porVersao, jobs] = await Promise.all([
      SV.entregaveisPorVersao({ dbAll }, slug, entregavelUrl),
      JOBS.listActiveSlidesJobs({ dbAll }, slug),
    ]);
    return versoes.map((v) => ({ ...v, entregaveis: porVersao[v.versao] || [], slides_job: jobView(jobs[v.versao]) }));
  }

  // GET /api/script/versoes  -> { versoes: [...sem conteudo, com entregaveis e slides_job], job }
  router.get('/api/script/versoes', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const slug = req.cohort.club_slug;
      const [versoes, job] = await Promise.all([
        SV.listVersions({ dbAll }, slug),
        JOBS.findLatestJob({ dbGet }, { tipo: 'script', club_slug: slug }),
      ]);
      res.json({ success: true, versoes: await decorarVersoes(slug, versoes), job: jobView(job), ficha_status: req.ficha.ficha_status });
    } catch (error) {
      console.error('Error in GET /api/script/versoes:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/script/versoes/:versao  -> { versao: { ..., content_md, entregaveis, slides_job }, comentarios }
  router.get('/api/script/versoes/:versao', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      const versao = await SV.getVersion({ dbGet }, req.cohort.club_slug, n);
      if (!versao) return res.status(404).json({ success: false, message: 'Versão não encontrada.' });
      const comentarios = await SV.listComments({ dbAll }, req.cohort.club_slug, n);
      const [decorada] = await decorarVersoes(req.cohort.club_slug, [versao]);
      res.json({ success: true, versao: decorada, comentarios });
    } catch (error) {
      console.error('Error in GET /api/script/versoes/:versao:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // ─── Apresentacao comercial (entregavel `slides` de uma versao) ───────────

  /** Enfileira o job `slides` da versao (1 ativo por clube + versao) e responde no formato do front. */
  async function pedirSlides(req, res, n) {
    const slug = req.cohort.club_slug;
    const r = await SV.enqueueSlidesJob({ dbGet, dbRun, uuidv4, safeJsonParse, JOBS }, {
      club_slug: slug,
      nome_clube: req.cohort.club_nome || null,
      versao: n,
      email: req.cohort.email,
    });
    if (!r) return res.status(404).json({ success: false, message: 'Versão não encontrada.' });
    await touchActivity(slug);
    res.json({ success: true, versao: n, job: { ...jobView(r.job), existing: r.existing } });
  }

  // POST /api/script/versoes/:versao/slides  -> "Gerar apresentação" (job `slides` da versao)
  router.post('/api/script/versoes/:versao/slides', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      await pedirSlides(req, res, n);
    } catch (error) {
      console.error('Error in POST /api/script/versoes/:versao/slides:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/script/versoes/:versao/entregaveis  -> { entregaveis: [{ tipo, arquivos: [{ campo, nome, bytes, url }] }] }
  router.get('/api/script/versoes/:versao/entregaveis', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      const versao = await SV.getVersion({ dbGet }, req.cohort.club_slug, n, { withContent: false });
      if (!versao) return res.status(404).json({ success: false, message: 'Versão não encontrada.' });
      res.json({ success: true, versao: n, entregaveis: await SV.listEntregaveis({ dbAll }, req.cohort.club_slug, n, entregavelUrl) });
    } catch (error) {
      console.error('Error in GET /api/script/versoes/:versao/entregaveis:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/script/versoes/:versao/entregaveis/:tipo/:campo  -> stream (attachment; ?inline=1 abre no navegador)
  router.get('/api/script/versoes/:versao/entregaveis/:tipo/:campo', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      const row = await SV.getEntregavelRow({ dbGet }, req.cohort.club_slug, n, req.params.tipo);
      const arquivo = SV.arquivoDoEntregavel(row, req.params.campo);
      if (!arquivo) return res.status(404).json({ success: false, message: 'Arquivo não encontrado.' });
      if (!fs.existsSync(arquivo.path)) return res.status(404).json({ success: false, message: 'Arquivo não encontrado no disco.' });
      const inline = req.query.inline === '1' || arquivo.disposition === 'inline';
      res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(arquivo.nome)}"`);
      res.setHeader('Content-Type', arquivo.mime);
      fs.createReadStream(arquivo.path).pipe(res);
    } catch (error) {
      console.error('Error in GET /api/script/versoes/:versao/entregaveis/:tipo/:campo:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/script/versoes/:versao/comentarios
  router.get('/api/script/versoes/:versao/comentarios', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      const versao = await SV.getVersion({ dbGet }, req.cohort.club_slug, n, { withContent: false });
      if (!versao) return res.status(404).json({ success: false, message: 'Versão não encontrada.' });
      res.json({ success: true, comentarios: await SV.listComments({ dbAll }, req.cohort.club_slug, n) });
    } catch (error) {
      console.error('Error in GET /api/script/versoes/:versao/comentarios:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/versoes/:versao/comentarios  { passo (0 = geral, 1..7), texto }
  router.post('/api/script/versoes/:versao/comentarios', authMiddleware, cohortGuard, validateBody(SV.scriptCommentSchema), async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      const versao = await SV.getVersion({ dbGet }, req.cohort.club_slug, n, { withContent: false });
      if (!versao) return res.status(404).json({ success: false, message: 'Versão não encontrada.' });
      const comentario = await SV.insertComment({ dbGet, dbRun, uuidv4 }, {
        club_slug: req.cohort.club_slug, versao: n, passo: req.body.passo, texto: req.body.texto, autor_email: req.cohort.email,
      });
      await touchActivity(req.cohort.club_slug);
      res.json({ success: true, comentario });
    } catch (error) {
      console.error('Error in POST /api/script/versoes/:versao/comentarios:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/versoes/:versao/aprovar
  // Aprovar tambem manda montar a apresentacao comercial desta versao (job `slides`, 1 ativo por clube + versao).
  router.post('/api/script/versoes/:versao/aprovar', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      const slug = req.cohort.club_slug;
      const versao = await SV.approveVersion({ dbGet, dbRun }, slug, n, VM.normEmail(req.cohort.email));
      if (!versao) return res.status(404).json({ success: false, message: 'Versão não encontrada.' });
      await touchActivity(slug);
      let slidesJob = null;
      try {
        const r = await SV.enqueueSlidesJob({ dbGet, dbRun, uuidv4, safeJsonParse, JOBS }, {
          club_slug: slug, nome_clube: req.cohort.club_nome || null, versao: n, email: req.cohort.email, aprovada: true,
        });
        if (r) slidesJob = { ...jobView(r.job), existing: r.existing };
      } catch (e) {
        console.error('slides na aprovação:', e.message);
      }
      res.json({ success: true, versao, slides_job: slidesJob });
    } catch (error) {
      console.error('Error in POST /api/script/versoes/:versao/aprovar:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // ─── Rodada de ajustes (onda E4) ─────────────────────────────────────────
  // O clube tem UMA rodada de ajustes incluida: um pedido de nova versao feito pelo mentor
  // (POST /api/script/versoes/:versao/revisar). Job forcado pelo admin ou nascido dentro do worker marca
  // `payload.origem` diferente e nao entra na conta; o historico antigo (sem `origem`) conta como do mentor,
  // entao clube que ja pediu revisao aparece com a rodada gasta.
  const ORIGEM_MEMBRO = SV.ORIGEM_MEMBRO;
  const AJUSTES_LIMITE_PADRAO = 1;
  const COPY_LIMITE_AJUSTES = 'A sua rodada de ajustes já foi usada. Precisa de mais? Fale com a equipe.';

  /** Teto de ajustes: `cohort_config.ajustes_limite` quando existir, senao 1. */
  async function limiteDeAjustes() {
    try {
      const row = await dbGet(`SELECT value FROM cohort_config WHERE key = 'ajustes_limite'`);
      const n = row == null ? NaN : Number(row.value);
      return Number.isInteger(n) && n >= 0 ? n : AJUSTES_LIMITE_PADRAO;
    } catch {
      return AJUSTES_LIMITE_PADRAO;
    }
  }

  /** { usados, limite } do clube. `usados` = jobs `revisar` pedidos pelo mentor, em qualquer status. */
  async function contarAjustes(clubSlug) {
    const limite = await limiteDeAjustes();
    try {
      const row = await dbGet(
        `SELECT COUNT(*) AS n FROM cohort_jobs
          WHERE tipo = 'revisar' AND club_slug = ?
            AND COALESCE(json_extract(payload, '$.origem'), ?) = ?`,
        [clubSlug, ORIGEM_MEMBRO, ORIGEM_MEMBRO]
      );
      return { usados: row ? Number(row.n) || 0 : 0, limite };
    } catch {
      return { usados: 0, limite };
    }
  }

  // Grifos -> comentarios e o payload do job: em utils/script-versions.cjs (SV.montarPedidoRevisar),
  // porque a rota do admin monta o mesmo pedido e o worker precisa receber sempre a mesma forma.

  // POST /api/script/versoes/:versao/revisar  { pedido?, comentarios? }  -> "Pedir nova versao": job `revisar` (1 ativo por clube, junto com `script`)
  // payload = a versao base (content_md) + TODOS os comentarios dela (inclusive os grifos convertidos) + pedido livre;
  // o worker escreve a proxima versao a partir disso. Nao exige ficha confirmada: a base e a versao ja escrita.
  // Onda E4: uma rodada de ajustes por clube. Gasta a rodada, o membro recebe 409 { motivo: 'limite_ajustes' };
  // o admin nao passa por aqui: ele forca em POST /api/admin/clubs/:slug/script-versoes/:versao/revisar
  // (payload com `origem: 'admin'`, que nao consome a rodada do clube).
  router.post('/api/script/versoes/:versao/revisar', authMiddleware, cohortGuard, validateBody(revisarSchema), async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      const slug = req.cohort.club_slug;
      const versao = await SV.getVersion({ dbGet }, slug, n);
      if (!versao) return res.status(404).json({ success: false, message: 'Versão não encontrada.' });
      const rodada = await contarAjustes(slug);
      if (rodada.limite > 0 && rodada.usados >= rodada.limite) {
        return res.status(409).json({
          success: false,
          motivo: 'limite_ajustes',
          message: COPY_LIMITE_AJUSTES,
          ajustes_usados: rodada.usados,
          ajustes_limite: rodada.limite,
        });
      }
      const key = VM.normEmail(req.cohort.email);
      const { payload, comentarios, grifos } = await SV.montarPedidoRevisar({ dbGet, dbAll, dbRun, uuidv4 }, {
        club_slug: slug,
        versao: n,
        content_md: versao.content_md,
        comentarios: req.body.comentarios,
        autor_email: key,
        nome: req.cohort.name || null,
        pedido: req.body.pedido,
        origem: ORIGEM_MEMBRO,
        fileUrl: contextFileUrl,
      });
      const { job, existing } = await JOBS.enqueueJob({ dbGet, dbRun, uuidv4 }, {
        tipo: 'revisar',
        club_slug: slug,
        email: key,
        notify_phone: await lastNotifyPhone(slug, key),
        payload,
      });
      await touchActivity(slug);
      res.json({ success: true, versao: n, comentarios: comentarios.length, grifos: grifos.length, job: { ...jobView(job), existing } });
    } catch (error) {
      console.error('Error in POST /api/script/versoes/:versao/revisar:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // ─── Grifos (do clube; so o autor edita e apaga) ─────────────────────────

  // GET /api/script/versoes/:versao/grifos  -> { grifos } (os da versao + os pendentes de versoes anteriores),
  // cada um com `contexto: [...]` (os anexos: áudio, imagem, vídeo, link, nota)
  router.get('/api/script/versoes/:versao/grifos', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      const versao = await SV.getVersion({ dbGet }, req.cohort.club_slug, n, { withContent: false });
      if (!versao) return res.status(404).json({ success: false, message: 'Versão não encontrada.' });
      const lista = await SG.listGrifosDaVersao({ dbAll }, req.cohort.club_slug, n);
      res.json({ success: true, grifos: await SG.comContexto({ dbAll }, req.cohort.club_slug, lista, { fileUrl: contextFileUrl }) });
    } catch (error) {
      console.error('Error in GET /api/script/versoes/:versao/grifos:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/versoes/:versao/grifos  { passo (tela 0..9), documento, texto (20..600), prefixo, sufixo, cor, nota? }
  router.post('/api/script/versoes/:versao/grifos', authMiddleware, cohortGuard, validateBody(SG.grifoCreateSchema), async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      const versao = await SV.getVersion({ dbGet }, req.cohort.club_slug, n, { withContent: false });
      if (!versao) return res.status(404).json({ success: false, message: 'Versão não encontrada.' });
      const grifo = await SG.insertGrifo({ dbGet, dbRun, uuidv4 }, {
        ...req.body, club_slug: req.cohort.club_slug, versao: n, autor_email: req.cohort.email, autor_nome: req.cohort.name || null,
      });
      await touchActivity(req.cohort.club_slug);
      res.json({ success: true, grifo });
    } catch (error) {
      console.error('Error in POST /api/script/versoes/:versao/grifos:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  /** O grifo do clube, ou 404; 403 quando nao e do autor. */
  async function grifoDoAutor(req, res) {
    const grifo = await SG.getGrifo({ dbGet }, req.cohort.club_slug, req.params.id);
    if (!grifo) { res.status(404).json({ success: false, message: 'Grifo não encontrado.' }); return null; }
    if (VM.normEmail(grifo.autor_email || '') !== VM.normEmail(req.cohort.email)) {
      res.status(403).json({ success: false, message: 'Só quem fez o grifo pode mudar ou apagar.' });
      return null;
    }
    return grifo;
  }

  // PATCH /api/script/grifos/:id  { nota?, cor? }  (so o autor)
  router.patch('/api/script/grifos/:id', authMiddleware, cohortGuard, validateBody(SG.grifoPatchSchema), async (req, res) => {
    try {
      const grifo = await grifoDoAutor(req, res); if (!grifo) return;
      const atualizado = await SG.updateGrifo({ dbGet, dbRun }, req.cohort.club_slug, grifo.id, req.body);
      await touchActivity(req.cohort.club_slug);
      res.json({ success: true, grifo: atualizado });
    } catch (error) {
      console.error('Error in PATCH /api/script/grifos/:id:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // DELETE /api/script/grifos/:id  (so o autor; leva junto os anexos e os arquivos deles)
  router.delete('/api/script/grifos/:id', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const grifo = await grifoDoAutor(req, res); if (!grifo) return;
      await SG.deleteGrifo({ dbGet, dbAll, dbRun }, req.cohort.club_slug, grifo.id, { fs });
      await touchActivity(req.cohort.club_slug);
      res.json({ success: true, id: grifo.id });
    } catch (error) {
      console.error('Error in DELETE /api/script/grifos/:id:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // ─── Anexos do grifo (mesma mecanica do contexto por pergunta da ficha) ──
  // Qualquer sócio do clube anexa material a um grifo do clube (como no contexto da ficha); só o autor do
  // item apaga. Áudio é transcrito na hora pela Groq, igual ao da ficha. Arquivos: uploaded_files com
  // category 'script_contexto' (o worker baixa pela rota que já existe).

  // POST /api/script/grifos/:id/contexto  multipart (arquivo) ou JSON (link, nota): { tipo, file?, url?, texto?, legenda? }
  router.post('/api/script/grifos/:id/contexto', authMiddleware, cohortGuard, (req, res, next) => {
    uploadContext.single('file')(req, res, (err) => {
      if (!err) return next();
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      res.status(400).json({ success: false, message: tooBig ? 'Arquivo grande demais (máximo 50 MB).' : `Upload inválido: ${err.message}` });
    });
  }, async (req, res) => {
    const dropFile = () => { if (req.file) { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } } };
    try {
      const grifo = await SG.getGrifo({ dbGet }, req.cohort.club_slug, req.params.id);
      if (!grifo) { dropFile(); return res.status(404).json({ success: false, message: 'Grifo não encontrado.' }); }
      const parsed = CTX.grifoContextBodySchema.safeParse(req.body || {});
      if (!parsed.success) {
        dropFile();
        return res.status(400).json({ success: false, message: 'Dados inválidos', errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
      }
      const v = CTX.validateContextItem(parsed.data, req.file);
      if (!v.ok) { dropFile(); return res.status(400).json({ success: false, message: v.message }); }
      const { item } = v;

      let fileId = null;
      if (req.file) {
        fileId = uuidv4();
        await dbRun(
          `INSERT INTO uploaded_files (id, user_id, category, module, file_name, file_path, file_type, file_size)
           VALUES (?, ?, ?, 'script', ?, ?, ?, ?)`,
          [fileId, req.user.userId, CTX.CONTEXT_CATEGORY, req.file.originalname, req.file.path, req.file.mimetype, req.file.size]
        );
      }

      let transcricao = null;
      let erro = null;
      if (item.tipo === 'audio') {
        const t = await CTX.transcribeAudio(req.file.path, { mimetype: req.file.mimetype, fileName: req.file.originalname, fs });
        if (t.ok) transcricao = t.texto; else erro = t.erro;
      }

      const id = `ctx-${uuidv4()}`;
      await CTX.insertContext({ dbRun }, {
        id, club_slug: req.cohort.club_slug, user_id: req.user.userId, field_key: '', grifo_id: grifo.id,
        tipo: item.tipo, file_id: fileId, url: item.url, texto: item.texto, legenda: item.legenda,
        transcricao, erro_transcricao: erro,
      });
      await touchActivity(req.cohort.club_slug);
      const saved = await CTX.getGrifoContextItem({ dbGet }, req.cohort.club_slug, grifo.id, id, contextFileUrl);
      res.json({
        success: true,
        grifo_id: grifo.id,
        item: saved,
        ...(erro ? { warning: `Áudio guardado, mas a transcrição falhou (${erro}). Você pode escrever o essencial numa nota.` } : {}),
      });
    } catch (error) {
      dropFile();
      console.error('Error in POST /api/script/grifos/:id/contexto:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // DELETE /api/script/grifos/:id/contexto/:itemId  (só quem anexou)
  router.delete('/api/script/grifos/:id/contexto/:itemId', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const grifo = await SG.getGrifo({ dbGet }, req.cohort.club_slug, req.params.id);
      if (!grifo) return res.status(404).json({ success: false, message: 'Grifo não encontrado.' });
      const item = await CTX.getGrifoContextItem({ dbGet }, req.cohort.club_slug, grifo.id, req.params.itemId);
      if (!item) return res.status(404).json({ success: false, message: 'Item não encontrado.' });
      if (item.autor_user_id !== req.user.userId) return res.status(403).json({ success: false, message: 'Só quem anexou pode apagar.' });
      await CTX.deleteContext({ dbGet, dbRun }, req.cohort.club_slug, item.id, { fs });
      await touchActivity(req.cohort.club_slug);
      res.json({ success: true, grifo_id: grifo.id, id: item.id });
    } catch (error) {
      console.error('Error in DELETE /api/script/grifos/:id/contexto/:itemId:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // ─── Tarefas dos movimentos (por pessoa e por versao) ────────────────────
  // Cada Passo do leitor e um movimento: treinamentos recomendados + script + guia pratico + tarefas com
  // checkbox. O script e do clube, mas a execucao e de cada socio, entao a chave e
  // (clube, versao, e-mail, passo, tarefa). Persistencia no servidor de proposito: as trilhas guardaram
  // os checkboxes no localStorage e quem limpava o navegador perdia o parcial.

  // GET /api/script/versoes/:versao/tarefas  -> { tarefas } (os 7 passos DESTA pessoa nesta versao)
  router.get('/api/script/versoes/:versao/tarefas', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      const versao = await SV.getVersion({ dbGet }, req.cohort.club_slug, n, { withContent: false });
      if (!versao) return res.status(404).json({ success: false, message: 'Versão não encontrada.' });
      const tarefas = await ST.listTarefas({ dbAll }, req.cohort.club_slug, n, req.cohort.email);
      res.json({ success: true, versao: n, tarefas });
    } catch (error) {
      console.error('Error in GET /api/script/versoes/:versao/tarefas:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // PUT /api/script/versoes/:versao/tarefas/:passo/:tarefa_id  { concluida }
  // Idempotente: repetir o mesmo PUT devolve a mesma linha e preserva `concluida_em` (a primeira marcacao).
  router.put('/api/script/versoes/:versao/tarefas/:passo/:tarefa_id', authMiddleware, cohortGuard, validateBody(ST.tarefaPutSchema), async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      const passo = ST.parsePasso(req.params.passo);
      if (passo == null) return res.status(400).json({ success: false, message: 'Passo inválido: use de 1 a 7.' });
      const tarefaId = ST.parseTarefaId(req.params.tarefa_id);
      if (!tarefaId) return res.status(400).json({ success: false, message: 'Tarefa inválida.' });
      const versao = await SV.getVersion({ dbGet }, req.cohort.club_slug, n, { withContent: false });
      if (!versao) return res.status(404).json({ success: false, message: 'Versão não encontrada.' });
      const tarefa = await ST.setTarefa({ dbGet, dbRun, uuidv4 }, {
        club_slug: req.cohort.club_slug, versao: n, email: req.cohort.email,
        passo, tarefa_id: tarefaId, concluida: req.body.concluida,
      });
      await touchActivity(req.cohort.club_slug);
      res.json({ success: true, versao: n, tarefa });
    } catch (error) {
      console.error('Error in PUT /api/script/versoes/:versao/tarefas/:passo/:tarefa_id:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/admin/clubs/:slug/script-grifos  -> { grifos } (admin, so leitura; fica aqui porque a tabela e deste modulo)
  const adminOnly = (req, res, next) => (req.user && req.user.role === 'admin' ? next() : res.status(403).json({ success: false, message: 'Acesso negado. Apenas admin.' }));
  router.get('/api/admin/clubs/:slug/script-grifos', authMiddleware, adminOnly, async (req, res) => {
    try {
      const lista = await SG.listGrifos({ dbAll }, req.params.slug);
      res.json({ success: true, grifos: await SG.comContexto({ dbAll }, req.params.slug, lista, { fileUrl: contextFileUrl }) });
    } catch (error) {
      console.error('Error in GET /api/admin/clubs/:slug/script-grifos:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/admin/clubs/:slug/script-versoes/:versao/tarefas  -> { tarefas } de todo mundo do clube (admin, so leitura)
  // Membro de outro clube que tentar ler por aqui recebe 403.
  router.get('/api/admin/clubs/:slug/script-versoes/:versao/tarefas', authMiddleware, adminOnly, async (req, res) => {
    try {
      const n = parseVersao(req, res); if (n == null) return;
      const tarefas = await ST.listTarefasDoClube({ dbAll }, req.params.slug, n);
      res.json({ success: true, club_slug: req.params.slug, versao: n, tarefas });
    } catch (error) {
      console.error('Error in GET /api/admin/clubs/:slug/script-versoes/:versao/tarefas:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // PUT /api/script/ficha/materials  { links?, observacoes?, acessos? }  (so a entrada da PROPRIA pessoa; chave ausente = mantem)
  router.put('/api/script/ficha/materials', authMiddleware, cohortGuard, validateBody(VM.scriptMaterialsPessoaSchema), async (req, res) => {
    try {
      const key = VM.normEmail(req.cohort.email);
      const materials = await freshMaterials(req.cohort.club_slug);
      const cur = materials.por_pessoa[key] || VM.emptyPessoa();
      const next = { ...cur };
      let leitura = null;
      if (req.body.links !== undefined) next.links = req.body.links;
      if (req.body.observacoes !== undefined) next.observacoes = req.body.observacoes;
      if (req.body.acessos !== undefined) next.acessos = req.body.acessos;
      if (req.body.resposta_ia !== undefined) {
        const texto = String(req.body.resposta_ia);
        if (texto.trim()) {
          leitura = PIA.parseRespostaIA(texto);
          next.resposta_ia = { texto, salvo_em: new Date().toISOString(), resumo: leitura.resumo };
        } else {
          delete next.resposta_ia;
        }
      }
      if (req.cohort.name) next.nome = req.cohort.name;
      materials.por_pessoa[key] = next;
      await touchActivity(req.cohort.club_slug, ', materials = ?', [JSON.stringify(materials)]);
      res.json({ success: true, materials: VM.memberMaterialsView(materials, key), ...(leitura ? { resposta_ia: leitura } : {}) });
    } catch (error) {
      // Nunca logar o body: pode conter login/senha de plataforma.
      console.error('Error in PUT /api/script/ficha/materials:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/ficha/materials/submit  { notify_phone?, notify? }
  // "Confirmar e ir para a ficha": marca o submit DESTA pessoa (o clube vira submitted com o primeiro)
  // e enfileira 1 job de pre-preenchimento para o worker. Job ativo da mesma pessoa = devolve o existente.
  router.post('/api/script/ficha/materials/submit', authMiddleware, cohortGuard, validateBody(VM.scriptMaterialsSubmitSchema), async (req, res) => {
    try {
      const phone = VM.normalizePhone(req.body.notify_phone);
      if (!phone.ok) return res.status(400).json({ success: false, message: phone.message, errors: [phone.message] });

      const key = VM.normEmail(req.cohort.email);
      const materials = await freshMaterials(req.cohort.club_slug);
      const cur = materials.por_pessoa[key] || VM.emptyPessoa();
      // Numero novo so entra com a permissao marcada (`consentimento: true`); sem ela vale o que ja estava guardado.
      const comConsent = VM.applyNotifyConsent(cur, {
        phone: phone.phone, consentimento: req.body.consentimento === true, texto: req.body.consent_texto,
      });
      const notifyPhone = req.body.notify === false ? null : (comConsent.notify_phone || null);
      const submittedAt = new Date().toISOString();
      const next = { ...comConsent, submitted_at: submittedAt, ...(req.cohort.name ? { nome: req.cohort.name } : {}) };
      materials.por_pessoa[key] = next;
      await dbRun(
        `UPDATE script_fichas
            SET materials = ?, materials_status = 'submitted',
                materials_submitted_at = COALESCE(materials_submitted_at, CURRENT_TIMESTAMP),
                last_user_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE club_slug = ?`,
        [JSON.stringify(materials), req.cohort.club_slug]
      );

      const { job, existing } = await JOBS.enqueueJob({ dbGet, dbRun, uuidv4 }, {
        tipo: 'prefill',
        club_slug: req.cohort.club_slug,
        email: key,
        notify_phone: notifyPhone,
        payload: { nome: req.cohort.name || null, submitted_at: submittedAt, notify: req.body.notify !== false },
      });

      res.json({
        success: true,
        materials_status: 'submitted',
        materials_submitted_at: submittedAt,
        notify_phone: notifyPhone,
        job: { ...jobView(job), existing },
      });
    } catch (error) {
      console.error('Error in POST /api/script/ficha/materials/submit:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/script/ficha/materials/skip  { notify_phone?, notify? }
  // "Não tenho materiais, ir para a ficha" (SPEC-workflow-v2-decisoes-06-09 §1, decisao 1): marca o pulo
  // DESTA pessoa (`por_pessoa[e-mail].skipped_at`) e NAO enfileira leitura de material nenhuma. O estado do
  // clube (`materials_status`) nao muda: quem enviou continua enviado. Quem ja enviou recebe 'submitted'.
  // O WhatsApp e opcional e vai para o MESMO campo do envio (`notify_phone`): sem ele, o runner nao tem por
  // onde avisar pendencia, script pronto nem janela de ajuste de quem pulou os materiais.
  router.post('/api/script/ficha/materials/skip', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const body = req.body || {};
      const phone = VM.normalizePhone(body.notify_phone);
      if (!phone.ok) return res.status(400).json({ success: false, message: phone.message, errors: [phone.message] });
      const key = VM.normEmail(req.cohort.email);
      const materials = await freshMaterials(req.cohort.club_slug);
      const cur = materials.por_pessoa[key] || VM.emptyPessoa();
      const comConsent = VM.applyNotifyConsent(cur, {
        phone: phone.phone, consentimento: body.consentimento === true, texto: body.consent_texto,
      });
      const notifyPhone = body.notify === false ? null : (comConsent.notify_phone || null);
      const skippedAt = new Date().toISOString();
      const next = { ...comConsent, skipped_at: cur.skipped_at || skippedAt, ...(req.cohort.name ? { nome: req.cohort.name } : {}) };
      materials.por_pessoa[key] = next;
      await dbRun(
        `UPDATE script_fichas SET materials = ?, last_user_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE club_slug = ?`,
        [JSON.stringify(materials), req.cohort.club_slug]
      );
      res.json({
        success: true,
        materials_status: VM.memberMaterialsStatus(materials, req.cohort.email),
        materials_skipped_at: materials.por_pessoa[key].skipped_at,
        notify_phone: notifyPhone,
      });
    } catch (error) {
      console.error('Error in POST /api/script/ficha/materials/skip:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // PUT /api/script/ficha/notify-phone  { notify_phone, consentimento: true, consent_texto? }
  // WhatsApp dos avisos com a permissao da pessoa (bloco ConsentimentoWhatsApp: envio, pulo e fim da ficha).
  // Sem `consentimento: true` a rota devolve 400 e NADA e guardado: o runner so tem numero de quem autorizou.
  // Guarda `notify_phone`, `notify_consent_at` (ISO) e `notify_consent_texto` (a frase que a pessoa viu).
  // `notify_phone_sugerido` (o numero que veio do cadastro) nunca vira `notify_phone` sozinho.
  router.put('/api/script/ficha/notify-phone', authMiddleware, cohortGuard, validateBody(VM.notifyPhoneSchema), async (req, res) => {
    try {
      if (req.body.consentimento !== true) {
        return res.status(400).json({ success: false, message: VM.CONSENT_FALTANDO, errors: [VM.CONSENT_FALTANDO] });
      }
      const phone = VM.normalizePhone(req.body.notify_phone);
      if (!phone.ok) return res.status(400).json({ success: false, message: phone.message, errors: [phone.message] });
      if (!phone.phone) {
        const semNumero = 'WhatsApp inválido: use DDD + número (10 a 11 dígitos), com ou sem o 55.';
        return res.status(400).json({ success: false, message: semNumero, errors: [semNumero] });
      }
      const key = VM.normEmail(req.cohort.email);
      const materials = await freshMaterials(req.cohort.club_slug);
      const base = { ...(materials.por_pessoa[key] || VM.emptyPessoa()), ...(req.cohort.name ? { nome: req.cohort.name } : {}) };
      const next = VM.applyNotifyConsent(base, { phone: phone.phone, consentimento: true, texto: req.body.consent_texto });
      materials.por_pessoa[key] = next;
      await touchActivity(req.cohort.club_slug, ', materials = ?', [JSON.stringify(materials)]);
      res.json({ success: true, notify_phone: next.notify_phone, notify_consent_at: next.notify_consent_at });
    } catch (error) {
      console.error('Error in PUT /api/script/ficha/notify-phone:', error.message);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/script/materials/files  (so os arquivos da propria pessoa)
  router.get('/api/script/materials/files', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const files = await listOwnFiles(req.user.userId);
      res.json({ success: true, data: files });
    } catch (error) {
      console.error('Error in GET /api/script/materials/files:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/script/materials/files/:id/download  (so o dono; socio recebe 404)
  router.get('/api/script/materials/files/:id/download', authMiddleware, cohortGuard, async (req, res) => {
    try {
      const row = await dbGet(
        `SELECT * FROM uploaded_files WHERE id = ? AND user_id = ? AND category LIKE 'script_%'`,
        [req.params.id, req.user.userId]
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
