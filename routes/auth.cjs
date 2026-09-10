const { Router } = require('express');
const { verifyMemberSchema, adminLoginSchema, validateBody } = require('../utils/validation.cjs');

module.exports = function createAuthRoutes({ db, dbGet, dbRun, dbAll, jwt, axios, JWT_SECRET, HUBSPOT_TOKEN, HUBSPOT_WIN_STAGE, ADMIN_EMAIL, ADMIN_PASSWORD_HASH, generateId, logToFile }) {
  const router = Router();

  const hubspotHeaders = () => ({
    'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
    'Content-Type': 'application/json'
  });

  /**
   * Busca contato + deals no HubSpot.
   * Retorna { contact: null } quando o e-mail nao existe; lanca erro em falha de rede/API.
   */
  async function lookupHubSpot(email) {
    console.log(`🔍 Verificando email no HubSpot: ${email}`);

    const searchResponse = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/contacts/search',
      {
        filterGroups: [{
          filters: [{
            propertyName: 'email',
            operator: 'EQ',
            value: email
          }]
        }],
        properties: ['firstname', 'lastname', 'email'],
        limit: 1
      },
      { headers: hubspotHeaders() }
    );

    if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
      return { contact: null, fullName: '', hasWonDeal: false };
    }

    const contact = searchResponse.data.results[0];
    const contactId = contact.id;
    const firstName = contact.properties.firstname || '';
    const lastName = contact.properties.lastname || '';
    const fullName = `${firstName} ${lastName}`.trim() || 'Membro';

    console.log(`✅ Contato encontrado: ${fullName} (${contactId})`);

    const dealsResponse = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/deals`,
      { headers: hubspotHeaders() }
    );

    let hasWonDeal = false;

    if (dealsResponse.data.results && dealsResponse.data.results.length > 0) {
      for (const dealAssoc of dealsResponse.data.results) {
        const dealId = dealAssoc.id;

        const dealResponse = await axios.get(
          `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`,
          {
            headers: hubspotHeaders(),
            params: {
              properties: ['dealstage', 'dealname']
            }
          }
        );

        const dealStage = dealResponse.data.properties?.dealstage || '';
        console.log(`🔍 Deal encontrado - Stage: ${dealStage}`);

        if (dealStage === HUBSPOT_WIN_STAGE || dealStage.toLowerCase().includes('won')) {
          hasWonDeal = true;
          console.log(`✅ Deal com stage "${dealStage}" encontrado!`);
          break;
        }
      }
    }

    return { contact, fullName, hasWonDeal };
  }

  /**
   * Linha do cohort desta pessoa, com o clube ativo ou nao e o produto do clube
   * ('exclusive' = roster do Exclusive; 'club' = clube proprio criado no login).
   * Ter a linha, mesmo de clube desativado, e o que impede o login de criar um segundo clube para ela.
   */
  async function lookupCohortRow(email) {
    try {
      return await dbGet(
        `SELECT cm.club_slug, cm.nome, cc.nome AS club_nome, cc.ativo AS club_ativo,
                COALESCE(cc.produto, 'exclusive') AS club_produto
           FROM cohort_members cm
           JOIN cohort_clubs cc ON cc.slug = cm.club_slug
          WHERE cm.email = ?`,
        [email.trim().toLowerCase()]
      );
    } catch (err) {
      // Tabela ainda nao existe (boot antigo) ou erro de leitura: segue o fluxo normal do HubSpot
      console.error('⚠️ Cohort lookup error:', err.message);
      return null;
    }
  }

  /** 'Ana Paula' / 'ana.paula+x' -> 'ana-paula'. Sem acento, so minuscula, numero e hifen. */
  function slugify(texto) {
    return String(texto || '')
      // NFD separa a letra do acento; tudo o que sobra fora do ASCII (o acento solto, inclusive) cai fora
      .normalize('NFD').replace(/[^\x00-\x7F]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24)
      .replace(/-+$/g, '');
  }

  /** 6 caracteres derivados do e-mail: o mesmo e-mail sempre gera o mesmo slug, e dois "ana@" nao colidem. */
  function hashCurto(email) {
    return require('crypto').createHash('sha1').update(String(email).trim().toLowerCase()).digest('hex').slice(0, 6);
  }

  /**
   * Clube proprio de quem entrou pelo HubSpot e nao esta no roster do Exclusive (decisao do Danilo, 10/09).
   * Idempotente: o slug vem do e-mail, o INSERT do clube e OR IGNORE e o do membro tem a PK do e-mail,
   * entao o segundo login reaproveita o mesmo clube e a mesma ficha. Produto 'club', nunca 'exclusive'.
   * Falhou (coluna `produto` ainda nao criada, banco travado): devolve null e a pessoa entra sem o cohort,
   * exatamente como entrava antes.
   */
  async function criarClubeProprio(email, nome) {
    const local = String(email).split('@')[0];
    const slug = `u-${slugify(local) || 'membro'}-${hashCurto(email)}`;
    const clubNome = (nome || '').trim() || email;
    try {
      await dbRun(
        `INSERT OR IGNORE INTO cohort_clubs (slug, nome, ativo, produto) VALUES (?, ?, 1, 'club')`,
        [slug, clubNome]
      );
      await dbRun(
        `INSERT INTO cohort_members (email, club_slug, nome) VALUES (?, ?, ?)
         ON CONFLICT(email) DO NOTHING`,
        [email, slug, clubNome]
      );
      console.log(`✅ Clube próprio criado para ${email}: ${slug}`);
      return { club_slug: slug, club_nome: clubNome, club_produto: 'club', nome: clubNome };
    } catch (err) {
      console.error(`⚠️ Não deu para criar o clube próprio de ${email}:`, err.message);
      return null;
    }
  }

  // 1. Verify Member (HubSpot, com bypass para o roster do Exclusive)
  // Quem entra nao mudou: roster do Exclusive OU negocio ganho no HubSpot. O que mudou (10/09) e que
  // quem entra pelo HubSpot e nao esta no roster ganha um clube proprio (produto 'club') e passa a ver
  // o Script 7 Passos, em vez de entrar sem cohort nenhum.
  router.post('/auth/verify-member', validateBody(verifyMemberSchema), async (req, res) => {
    try {
      const { email } = req.body;

      // A linha do cohort existe mesmo com o clube desativado; so clube ativo dispensa a etapa do HubSpot.
      const cohortRow = await lookupCohortRow(email);
      const cohortMember = cohortRow && cohortRow.club_ativo === 1 ? cohortRow : null;

      if (!HUBSPOT_TOKEN && !cohortMember) {
        return res.status(500).json({ success: false, message: 'Token HubSpot não configurado.' });
      }

      let fullName = '';
      let hubspotId = null;
      let hasWonDeal = false;

      if (HUBSPOT_TOKEN) {
        try {
          const hs = await lookupHubSpot(email);
          if (!hs.contact) {
            if (!cohortMember) {
              console.log(`❌ Email não encontrado no HubSpot: ${email}`);
              return res.status(404).json({ success: false, message: 'Email não encontrado.' });
            }
            console.log(`ℹ️ Cohort: ${email} sem contato no HubSpot; segue pelo cohort_members`);
          } else {
            fullName = hs.fullName;
            hubspotId = hs.contact.id;
            hasWonDeal = hs.hasWonDeal;
          }
        } catch (hsError) {
          if (!cohortMember) throw hsError;
          console.error(`⚠️ Cohort: HubSpot falhou para ${email} (${hsError.message}); segue pelo cohort_members`);
        }
      }

      if (!hasWonDeal && !cohortMember) {
        console.log(`❌ Nenhum deal "closedwon" encontrado para ${email}`);
        return res.status(403).json({
          success: false,
          message: 'Usuário não encontrado.'
        });
      }

      /**
       * Como a pessoa passa a ser chamada (decisao do Danilo, 10/09). Quem tem linha em cohort_members e
       * chamada pelo nome da linha: o contato do HubSpot pode ser um contato de teste, e nao pode apelidar
       * quem esta na lista. Sem linha, vale o nome do HubSpot; sem os dois, 'Membro'. O nome escolhido aqui
       * e o que vai para o token, para users.name e para diagnostic_data.name, entao entrar de novo conserta
       * um nome errado gravado antes.
       */
      const nomeDaLista = String((cohortRow && cohortRow.nome) || '').trim();
      fullName = nomeDaLista || fullName || 'Membro';

      // Verificar se usuário já existe (e-mail chega normalizado; contas antigas podem ter caixa diferente)
      const existingRow = await dbGet(
        'SELECT id, cohort, club_slug FROM users WHERE lower(email) = ? ORDER BY created_at ASC LIMIT 1',
        [email]
      );
      let userId = existingRow ? existingRow.id : null;
      const isExistingUser = !!userId;
      if (!userId) {
        userId = `user-${generateId()}`;
      }

      /**
       * Onde esta pessoa entra (decisao do Danilo, 10/09). Nesta ordem:
       *   1. roster do Exclusive (cohort_members de clube ativo) -> o clube dela, produto do clube;
       *   2. conta que ja tem cohort no banco -> fica como esta (roster nunca vira clube proprio);
       *   3. passou pelo HubSpot e nao tem linha nenhuma no cohort -> ganha o clube proprio ('club').
       * Quem tem linha de clube DESATIVADO (cohortRow sem cohortMember) nao cria nada: o clube dela existe,
       * so esta fechado, e criar um segundo separaria a pessoa da propria ficha.
       */
      let acesso = cohortMember
        ? { club_slug: cohortMember.club_slug, produto: cohortMember.club_produto || 'exclusive' }
        : null;
      if (!acesso && !cohortRow && existingRow && existingRow.cohort && existingRow.club_slug) {
        acesso = { club_slug: existingRow.club_slug, produto: existingRow.cohort };
      }
      if (!acesso && !cohortRow && hasWonDeal) {
        const proprio = await criarClubeProprio(email, fullName);
        if (proprio) acesso = { club_slug: proprio.club_slug, produto: 'club' };
      }

      const tokenPayload = {
        userId,
        user: email,
        role: 'member',
        hubspotId,
        name: fullName
      };
      if (acesso) {
        tokenPayload.cohort = acesso.produto;
        tokenPayload.clubSlug = acesso.club_slug;
      }
      const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

      // SAFE upsert: We already know if user exists from dbGet() above.
      // NEVER use INSERT OR REPLACE — it triggers DELETE + INSERT,
      // which cascades ON DELETE CASCADE and wipes diagnostic_data.
      // IMPORTANT: Await DB operations before returning token to prevent race conditions
      // where the frontend starts saving before the user/diagnostic rows exist.
      // last_login_at: a hora em que a pessoa ENTROU. E a unica escrita desta data no sistema, e por isso
      // o admin pode confiar nela. `updated_at` continua marcando "a linha mudou" (resync de clube,
      // troca de nome) e nunca mais e lido como login. Idempotente: entrar de novo so move a data.
      if (isExistingUser) {
        if (acesso) {
          await dbRun(
            `UPDATE users SET name = ?, cohort = ?, club_slug = ?, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [fullName, acesso.produto, acesso.club_slug, userId]
          );
        } else {
          await dbRun(
            `UPDATE users SET name = ?, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [fullName, userId]
          );
        }
      } else if (acesso) {
        await dbRun(
          `INSERT INTO users (id, email, name, role, cohort, club_slug, last_login_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [userId, email, fullName, 'member', acesso.produto, acesso.club_slug]
        );
      } else {
        await dbRun(
          `INSERT INTO users (id, email, name, role, last_login_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [userId, email, fullName, 'member']
        );
      }

      // Sequential: user must exist before diagnostic_data (FK constraint)
      await dbRun(
        `INSERT OR IGNORE INTO diagnostic_data (id, user_id, email, name, progress_percentage, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          `diag-${userId}`,
          userId,
          email,
          fullName,
          0,
          'in_progress'
        ]
      );

      console.log(`✅ Login bem-sucedido para ${email}${acesso ? ` (${acesso.produto}: ${acesso.club_slug})` : ''}`);

      res.status(200).json({
        success: true,
        allowed: true,
        token,
        user: {
          userId,
          email,
          role: 'member',
          name: fullName,
          cohort: acesso ? acesso.produto : null,
          clubSlug: acesso ? acesso.club_slug : null
        }
      });

    } catch (error) {
      console.error('❌ Erro ao verificar membro:', error.message);
      res.status(500).json({
        success: false,
        message: 'Erro ao verificar matrícula. Tente novamente.'
      });
    }
  });

  // 2. Admin Login (SEC-01: bcrypt comparison, UX-16: no debug logging)
  router.post('/auth/admin-login', validateBody(adminLoginSchema), async (req, res) => {
    try {
      const bcrypt = require('bcryptjs');
      const { email, password } = req.body;

      if (!ADMIN_PASSWORD_HASH) {
        console.error('❌ ADMIN_PASSWORD_HASH não está configurada no .env');
        return res.status(500).json({ success: false, message: 'Configuração do servidor incompleta.' });
      }

      if (email !== ADMIN_EMAIL) {
        return res.status(401).json({ success: false, message: 'Credenciais inválidas.' });
      }

      const isMatch = await bcrypt.compare(password || '', ADMIN_PASSWORD_HASH);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Credenciais inválidas.' });
      }

      const token = jwt.sign(
        {
          userId: 'admin-001',
          user: email,
          name: 'Admin',
          role: 'admin'
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(200).json({
        success: true,
        token,
        user: {
          userId: 'admin-001',
          email,
          name: 'Admin'
        }
      });

    } catch (error) {
      console.error('❌ Erro ao fazer login admin:', error.message);
      logToFile(`ERROR /auth/admin-login: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Erro ao fazer login.'
      });
    }
  });

  return router;
};
