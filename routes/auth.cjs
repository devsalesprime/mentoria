const { Router } = require('express');
const { verifyMemberSchema, adminLoginSchema, validateBody } = require('../utils/validation.cjs');

module.exports = function createAuthRoutes({ db, dbGet, dbRun, dbAll, jwt, axios, JWT_SECRET, HUBSPOT_TOKEN, HUBSPOT_WIN_STAGE, ADMIN_EMAIL, ADMIN_PASSWORD_HASH, generateId, logToFile }) {
  const router = Router();

  // 1. Verify Member (HubSpot)
  router.post('/auth/verify-member', validateBody(verifyMemberSchema), async (req, res) => {
    try {
      const { email } = req.body;

      if (!HUBSPOT_TOKEN) {
        return res.status(500).json({ success: false, message: 'Token HubSpot não configurado.' });
      }

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
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
        console.log(`❌ Email não encontrado no HubSpot: ${email}`);
        return res.status(404).json({ success: false, message: 'Email não encontrado.' });
      }

      const contact = searchResponse.data.results[0];
      const contactId = contact.id;
      const firstName = contact.properties.firstname || '';
      const lastName = contact.properties.lastname || '';
      const fullName = `${firstName} ${lastName}`.trim() || 'Membro';

      console.log(`✅ Contato encontrado: ${fullName} (${contactId})`);

      const dealsResponse = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/deals`,
        {
          headers: {
            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      let hasWonDeal = false;

      if (dealsResponse.data.results && dealsResponse.data.results.length > 0) {
        for (const dealAssoc of dealsResponse.data.results) {
          const dealId = dealAssoc.id;

          const dealResponse = await axios.get(
            `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`,
            {
              headers: {
                'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
                'Content-Type': 'application/json'
              },
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

      if (!hasWonDeal) {
        console.log(`❌ Nenhum deal "closedwon" encontrado para ${email}`);
        return res.status(403).json({
          success: false,
          message: 'Usuário não encontrado.'
        });
      }

      // Verificar se usuário já existe
      const existingRow = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
      let userId = existingRow ? existingRow.id : null;
      const isExistingUser = !!userId;
      if (!userId) {
        userId = `user-${generateId()}`;
      }

      const hubspotId = contact.id;
      const token = jwt.sign(
        {
          userId,
          user: email,
          role: 'member',
          hubspotId,
          name: fullName
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // SAFE upsert: We already know if user exists from dbGet() above.
      // NEVER use INSERT OR REPLACE — it triggers DELETE + INSERT,
      // which cascades ON DELETE CASCADE and wipes diagnostic_data.
      // IMPORTANT: Await DB operations before returning token to prevent race conditions
      // where the frontend starts saving before the user/diagnostic rows exist.
      if (isExistingUser) {
        await dbRun(
          `UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [fullName, userId]
        );
      } else {
        await dbRun(
          `INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)`,
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

      console.log(`✅ Login bem-sucedido para ${email}`);

      res.status(200).json({
        success: true,
        allowed: true,
        token,
        user: {
          userId,
          email,
          role: 'member',
          name: fullName
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
