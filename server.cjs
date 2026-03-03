const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3005;
const VERSION = '1.2.0-DEBUG';

console.log(`\n🚀 [SERVER] Iniciando Prosperus Mentor Diagnosis v${VERSION}`);
console.log(`📅 [SERVER] Horário: ${new Date().toISOString()}`);
console.log(`🆔 [SERVER] PID: ${process.pid}`);

// ============================================
// CONFIGURAÇÕES
// ============================================

const HUBSPOT_TOKEN = process.env.HUBSPOT_PRIVATE_TOKEN;
const HUBSPOT_WIN_STAGE = process.env.HUBSPOT_WIN_STAGE || 'closedwon';
const JWT_SECRET = process.env.JWT_SECRET || 'prosperus-secret-key-2024';
const ADMIN_EMAIL = 'admin@salesprime.com.br';
const ADMIN_PASSWORD = '1L/0_C%pAY5u';

// Database path
const DB_PATH = path.join(__dirname, 'data', 'prosperus.db');
const DATA_DIR = path.join(__dirname, 'data');

// Criar pasta data se não existir
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================
// MIDDLEWARE GLOBAL
// ============================================

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Logger simples para ver as requisições
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// DATABASE
// ============================================

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar com banco:', err);
  } else {
    console.log('✅ Banco SQLite conectado:', DB_PATH);
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        role TEXT DEFAULT 'member',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS user_progress (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        name TEXT,
        form_data JSON,
        progress_percentage INTEGER DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'in_progress'
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT,
        description TEXT,
        module TEXT,
        status TEXT DEFAULT 'in_progress',
        data JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        module TEXT,
        data JSON,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(
      `INSERT OR IGNORE INTO users (id, email, name, role) 
       VALUES (?, ?, ?, ?)`,
      ['admin-001', ADMIN_EMAIL, 'Admin', 'admin']
    );

    // MIGRATION: Adicionar colunas se não existirem (para bancos antigos)
    db.all("PRAGMA table_info(user_progress)", (err, columns) => {
      if (err) return console.error('❌ Erro ao verificar schema:', err);

      const hasStatus = columns.some(c => c.name === 'status');
      const hasLastUpdated = columns.some(c => c.name === 'last_updated');

      if (!hasStatus) {
        console.log('🔄 Migração: Adicionando coluna [status] em user_progress');
        db.run("ALTER TABLE user_progress ADD COLUMN status TEXT DEFAULT 'in_progress'");
      }

      if (!hasLastUpdated) {
        console.log('🔄 Migração: Adicionando coluna [last_updated] em user_progress');
        db.run("ALTER TABLE user_progress ADD COLUMN last_updated DATETIME DEFAULT CURRENT_TIMESTAMP");
      }
    });

    console.log('✅ Banco inicializado com sucesso');
  });
}

// ============================================
// UTILITIES
// ============================================

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function validateToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// ============================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Token ausente.' });
  }

  const token = authHeader.replace('Bearer ', '');
  const decoded = validateToken(token);

  if (!decoded) {
    return res.status(401).json({ success: false, message: 'Token inválido.' });
  }

  req.user = decoded;
  next();
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Acesso negado. Apenas admin.' });
  }
  next();
}

// ============================================
// ⭐ ROTAS DE SAÚDE E AUTENTICAÇÃO (ANTES DE TUDO)
// ============================================

app.get('/health', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({ success: true, service: 'Prosperus Mentor Diagnosis', status: 'online' });
});

// Rota de teste para verificar se o servidor está recebendo requisições
app.get('/api/test', (req, res) => {
  console.log('✅ Rota de teste /api/test foi chamada');
  res.json({ success: true, message: 'API está funcionando', timestamp: new Date().toISOString() });
});

app.post('/api/test', (req, res) => {
  console.log('✅ Rota de teste POST /api/test foi chamada');
  console.log('📍 Body:', req.body);
  res.json({ success: true, message: 'API POST está funcionando', body: req.body, timestamp: new Date().toISOString() });
});

// 1. Verify Member (HubSpot)
app.post('/auth/verify-member', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email é obrigatório.' });
    }

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
    const getExistingUser = () => new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.id : null);
      });
    });

    let userId = await getExistingUser();
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

    db.run(
      `INSERT OR REPLACE INTO users (id, email, name, role) VALUES (?, ?, ?, ?)`,
      [userId, email, fullName, 'member'],
      (err) => {
        if (err) console.error('❌ Erro ao salvar usuário:', err);
      }
    );

    db.run(
      `INSERT OR IGNORE INTO user_progress (id, user_id, email, name, form_data, progress_percentage)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        `prog-${userId}`,
        userId,
        email,
        fullName,
        JSON.stringify({
          mentor: {},
          mentee: {},
          method: {},
          delivery: {}
        }),
        0
      ],
      (err) => {
        if (err) console.error('❌ Erro ao criar progresso:', err);
      }
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

// 2. Admin Login
app.post('/auth/admin-login', (req, res) => {
  try {
    const { email, password } = req.body;

    console.log(`🔐 Tentativa de login admin: ${email}`);
    console.log(`🔑 Senha recebida: ${password ? password.length + ' chars' : 'vazia'}`);
    console.log(`Expected: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD.length} chars`);

    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      console.log(`❌ Credenciais inválidas para: ${email}`);
      console.log(`Match? Email: ${email === ADMIN_EMAIL}, Pass: ${password === ADMIN_PASSWORD}`);
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

    console.log('✅ Login admin bem-sucedido');

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
    console.error('❌ Erro ao fazer login admin:', error);
    res.status(500).json({ success: false, message: 'Erro ao fazer login.' });
  }
});

// ============================================
// ⭐ ROTAS DE API (ANTES DOS ESTÁTICOS)
// ============================================

// 3. Get User Progress
app.get('/api/user/progress', authMiddleware, (req, res) => {
  try {
    const { user: email, userId } = req.user;
    console.log(`📥 Buscando progresso de ${email} (ID: ${userId})`);

    db.get(
      `SELECT form_data, progress_percentage 
       FROM user_progress 
       WHERE user_id = ?`,
      [userId],
      (err, row) => {
        if (err) {
          console.error('❌ Erro na query:', err.message);
          return res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados'
          });
        }

        if (!row || !row.form_data) {
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
          const formData = JSON.parse(row.form_data);
          console.log(`✅ Dados encontrados: ${Object.keys(formData).length} módulos`);
          console.log(`📊 Progress do banco: ${row.progress_percentage}%`);
          console.log(`📦 FormData (primeiros 200 chars):`, JSON.stringify(formData).substring(0, 200));

          res.json({
            success: true,
            progress: {
              formData,
              progressPercentage: row.progress_percentage || 0
            }
          });
        } catch (parseError) {
          console.error('❌ Erro ao parsear form_data:', parseError.message);
          res.json({
            success: true,
            progress: {
              formData: { mentor: {}, mentee: {}, method: {}, delivery: {} },
              progressPercentage: 0
            }
          });
        }
      }
    );

  } catch (error) {
    console.error('❌ Erro no get progress:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro interno'
    });
  }
});

// 4. Save User Progress
app.post('/api/user/save-progress', authMiddleware, (req, res) => {
  try {
    console.log('📥 POST /api/user/save-progress - Requisição recebida');
    console.log('📍 URL:', req.url);
    console.log('📍 Path:', req.path);
    console.log('📍 Headers:', JSON.stringify(req.headers, null, 2));

    const { user: email, userId, name } = req.user;
    const { formData, progressPercentage } = req.body;

    console.log(`💾 [${new Date().toISOString()}] Salvando dados para ${email} (${progressPercentage}%)`);

    // Validação de dados
    if (!formData) {
      console.error('❌ Dados ausentes na requisição');
      return res.status(400).json({ success: false, message: 'Dados são obrigatórios' });
    }

    // Validar estrutura básica do formData
    if (typeof formData !== 'object') {
      console.error('❌ formData não é um objeto válido');
      return res.status(400).json({ success: false, message: 'Formato de dados inválido' });
    }

    // Validar que pelo menos um módulo existe
    const modules = ['mentor', 'mentee', 'method', 'delivery'];
    const hasValidModule = modules.some(mod => formData[mod] && typeof formData[mod] === 'object');

    if (!hasValidModule) {
      console.warn('⚠️ Nenhum módulo válido encontrado nos dados');
    }

    // Log detalhado dos módulos sendo salvos
    console.log('📊 Módulos recebidos:', {
      mentor: formData.mentor ? Object.keys(formData.mentor).length + ' campos' : 'vazio',
      mentee: formData.mentee ? Object.keys(formData.mentee).length + ' campos' : 'vazio',
      method: formData.method ? Object.keys(formData.method).length + ' campos' : 'vazio',
      delivery: formData.delivery ? Object.keys(formData.delivery).length + ' campos' : 'vazio'
    });

    // Log das etapas salvas
    if (formData.mentor?._currentStep) {
      console.log(`📍 Etapa salva - Mentor: ${formData.mentor._currentStep}`);
    }
    if (formData.mentee?._currentStep) {
      console.log(`📍 Etapa salva - Mentee: ${formData.mentee._currentStep}`);
    }
    if (formData.method?._currentStep) {
      console.log(`📍 Etapa salva - Method: ${formData.method._currentStep}`);
    }
    if (formData.delivery?._currentStep) {
      console.log(`📍 Etapa salva - Delivery: ${formData.delivery._currentStep}`);
    }

    // 4.1 Check existing status to avoid duplicate webhooks and preserve status
    db.get('SELECT status FROM user_progress WHERE user_id = ?', [userId], (err, row) => {
      let currentStatus = 'in_progress';
      if (!err && row) {
        currentStatus = row.status;
      }

      let newStatus = currentStatus;
      const isComplete = progressPercentage === 100;

      if (isComplete && currentStatus !== 'completed') {
        newStatus = 'completed';
        
        // TRIGGER WEBHOOK
        const webhookUrl = 'https://n8n.salesprime.com.br/webhook/diagostico-100';
        console.log(`🚀 [WEBHOOK] Enviando notificação de conclusão para ${email}`);
        
        axios.post(webhookUrl, { email })
          .then(() => console.log('✅ [WEBHOOK] Enviado com sucesso'))
          .catch(e => console.error('❌ [WEBHOOK] Erro ao enviar:', e.message));
      } else if (!isComplete && currentStatus === 'completed') {
        // Did they un-complete it? Maybe keep it completed or revert? 
        // Let's revert to in_progress if they dropped below 100%
        newStatus = 'in_progress';
      }

      // Query que inclui last_updated para registrar quando o progresso foi salvo
      // ADDED: status
      const query = `
        INSERT OR REPLACE INTO user_progress 
        (id, user_id, email, name, form_data, progress_percentage, last_updated, status)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      `;

      const params = [
        `prog-${userId}`,
        userId,
        email,
        name || 'Usuário',
        JSON.stringify(formData),
        progressPercentage || 0,
        newStatus
      ];

      console.log('💾 Salvando no banco de dados:');
      console.log('  📧 Email:', email);
      console.log('  🆔 User ID:', userId);
      console.log('  📊 Progress:', progressPercentage + '%');
      console.log('  🚩 Status:', newStatus);
      console.log('  📦 FormData (primeiros 200 chars):', JSON.stringify(formData).substring(0, 200));

      db.run(query, params, function (err) {
        if (err) {
          console.error('❌ Erro ao salvar no banco:', err.message);
          return res.status(500).json({
            success: false,
            message: 'Erro ao salvar dados',
            error: err.message
          });
        }

        console.log(`✅ [${new Date().toISOString()}] Dados salvos com sucesso: ${this.changes} alterações`);
        console.log(`📈 Progresso total: ${progressPercentage}%`);

        res.json({
          success: true,
          message: 'Dados salvos com sucesso',
          progressPercentage,
          timestamp: new Date().toISOString()
        });
      });
    });

  } catch (error) {
    console.error('❌ Erro no save-progress:', error.message);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Erro interno',
      error: error.message
    });
  }
});

// 5. Submit Module
app.post('/api/user/submit-module', authMiddleware, (req, res) => {
  try {
    const { user: email, userId } = req.user;
    const { module, data } = req.body;

    if (!module || !data) {
      return res.status(400).json({ success: false, message: 'Módulo e dados são obrigatórios.' });
    }

    console.log(`💾 Salvando módulo ${module} para ${email}`);

    // Buscar progresso atual
    db.get(
      `SELECT * FROM user_progress WHERE email = ?`,
      [email],
      (err, row) => {
        if (err) {
          console.error('❌ Erro ao buscar progresso:', err);
          return res.status(500).json({ success: false, message: 'Erro ao salvar módulo.' });
        }

        let formData = { mentor: {}, mentee: {}, method: {}, delivery: {} };
        let progressPercentage = 0;

        if (row) {
          formData = JSON.parse(row.form_data || '{}');
          progressPercentage = row.progress_percentage || 0;
        }

        // Atualizar apenas o módulo específico
        formData[module] = data;

        // Recalcular progresso (exemplo simples)
        const completedModules = Object.values(formData).filter(
          moduleData => moduleData && Object.keys(moduleData).length > 0
        ).length;
        const newProgress = Math.round((completedModules / 4) * 100);

        // Check Logic for Webhook
        let currentStatus = row ? row.status : 'in_progress';
        let newStatus = currentStatus;
        if (newProgress === 100 && currentStatus !== 'completed') {
           newStatus = 'completed';
           // TRIGGER WEBHOOK
           const webhookUrl = 'https://n8n.salesprime.com.br/webhook/diagostico-100';
           console.log(`🚀 [WEBHOOK] Enviando notificação de conclusão (via submit) para ${email}`);
           
           axios.post(webhookUrl, { email })
             .then(() => console.log('✅ [WEBHOOK] Enviado com sucesso'))
             .catch(e => console.error('❌ [WEBHOOK] Erro ao enviar:', e.message));
        } else if (newProgress < 100 && currentStatus === 'completed') {
           newStatus = 'in_progress';
        }

        // Salvar no banco
        db.run(
          `INSERT OR REPLACE INTO user_progress (id, user_id, email, name, form_data, progress_percentage, last_updated, status)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
          [
            row?.id || `prog-${userId}`,
            userId,
            email,
            row?.name || '',
            JSON.stringify(formData),
            newProgress,
            newStatus
          ],
          (err) => {
            if (err) {
              console.error('❌ Erro ao salvar módulo:', err);
              return res.status(500).json({ success: false, message: 'Erro ao salvar módulo.' });
            }

            console.log(`✅ Módulo ${module} salvo para ${email}`);
            res.json({
              success: true,
              message: 'Módulo salvo com sucesso.',
              progressPercentage: newProgress
            });
          }
        );
      }
    );

  } catch (error) {
    console.error('❌ Erro ao salvar módulo:', error);
    res.status(500).json({ success: false, message: 'Erro ao salvar módulo.' });
  }
});

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

// 5. List All Users (Admin)
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  try {
    console.log('📋 Listando todos os usuários (Admin)');

    db.all(
      `SELECT up.id, up.user_id, up.email, up.name, up.progress_percentage, up.last_updated, up.status, up.form_data, u.created_at as user_created_at
       FROM user_progress up
       LEFT JOIN users u ON up.user_id = u.id
       WHERE up.email != ?
       ORDER BY COALESCE(up.last_updated, u.created_at, CURRENT_TIMESTAMP) DESC`,
      ['admin@prosperus.com'],
      (err, rows) => {
        if (err) {
          console.error('❌ Erro ao listar usuários:', err);
          return res.status(500).json({ success: false, message: 'Erro ao listar usuários.' });
        }

        // Mapear para garantir que last_updated nunca é NULL e preferir o progresso salvo
        const users = (rows || []).map(user => {
          let formData = {};
          try {
            formData = JSON.parse(user.form_data || '{}');
          } catch (e) {
            console.error('Erro ao fazer parse do form_data no list users:', e);
          }

          // Recalcular progresso (prioridade para o cálculo em tempo real para corrigir o bug de 89%)
          const calculatedProgress = calculateProgressServer(formData);
          // Se o armazenado for menor que o calculado (ex: estava travado em 89), usa o calculado
          const finalProgress = Math.max(calculatedProgress, (user.progress_percentage || 0));

          // Normalizar lastUpdated
          // Prioridade: last_updated do progresso > created_at do usuário > Agora
          let lastUpdatedIso = new Date().toISOString();
          if (user.last_updated) {
            lastUpdatedIso = new Date(user.last_updated).toISOString();
          } else if (user.user_created_at) {
            lastUpdatedIso = new Date(user.user_created_at).toISOString();
          }

          return {
            id: user.id,
            user_id: user.user_id,
            email: user.email,
            name: user.name,
            progressPercentage: finalProgress,
            lastUpdated: lastUpdatedIso,
            status: user.status
          };
        });

        res.json({
          success: true,
          users,
          total: users.length
        });
      }
    );

  } catch (error) {
    console.error('❌ Erro ao listar usuários:', error);
    res.status(500).json({ success: false, message: 'Erro ao listar usuários.' });
  }
});

// 6. Get User Details (Admin)
app.get('/api/admin/users/:userId', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { userId } = req.params;

    // Buscar progresso e tentar obter a data de criação a partir da tabela users
    db.get(
      `SELECT up.*, u.created_at as created_at
       FROM user_progress up
       LEFT JOIN users u ON up.user_id = u.id
       WHERE up.id = ?`,
      [userId],
      (err, row) => {
        if (err) {
          console.error('❌ Erro ao buscar usuário:', err);
          return res.status(500).json({ success: false, message: 'Erro ao buscar usuário.' });
        }

        if (!row) {
          return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        }

        // Helper para inferir createdAt: users.created_at -> last_updated -> tentar extrair timestamp do user_id
        function inferCreatedAt(row) {
          if (row.created_at) return row.created_at;
          if (row.last_updated) return row.last_updated;
          const src = (row.user_id || row.id || '').toString();
          const m = src.match(/(\d{13})/);
          if (m) {
            const ms = parseInt(m[1], 10);
            if (!isNaN(ms) && ms > 0) return new Date(ms).toISOString();
          }
          return null;
        }

        // Caso existam tarefas cadastradas, calcular progresso a partir delas
        db.all(
          `SELECT status FROM tasks WHERE user_id = ?`,
          [row.user_id],
          (tasksErr, tasksRows) => {
            if (tasksErr) {
              console.error('❌ Erro ao buscar tarefas do usuário:', tasksErr);
              // Fallback: usar o progresso armazenado
              const responseUser = {
                id: row.id,
                userId: row.user_id,
                email: row.email,
                name: row.name,
                createdAt: inferCreatedAt(row),
                progressPercentage: row.progress_percentage,
                formData: (() => {
                  try { return JSON.parse(row.form_data || '{}'); } catch (e) { return { mentor: {}, mentee: {}, method: {}, delivery: {} }; }
                })(),
                lastUpdated: row.last_updated,
                status: row.status || 'in_progress'
              };

              return res.json({ success: true, user: responseUser });
            }

            let computedProgress = row.progress_percentage || 0;

            if (tasksRows && tasksRows.length > 0) {
              const total = tasksRows.length;
              const completed = tasksRows.filter(t => {
                const s = (t.status || '').toString().toLowerCase();
                return s.includes('complete') || s.includes('done') || s.includes('finish') || s.includes('conclu');
              }).length;
              computedProgress = Math.round((completed / total) * 100);
            }

            const responseUser = {
              id: row.id,
              userId: row.user_id,
              email: row.email,
              name: row.name,
              createdAt: inferCreatedAt(row),
              progressPercentage: computedProgress,
              formData: (() => {
                try { return JSON.parse(row.form_data || '{}'); } catch (e) { return { mentor: {}, mentee: {}, method: {}, delivery: {} }; }
              })(),
              lastUpdated: row.last_updated,
              status: row.status || 'in_progress'
            };

            res.json({ success: true, user: responseUser });
          }
        );
      }
    );

  } catch (error) {
    console.error('❌ Erro ao buscar usuário:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar usuário.' });
  }
});

// 7. Download User Data (Admin)
app.get('/api/admin/users/:userId/download', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { userId } = req.params;

    db.get(
      `SELECT * FROM user_progress WHERE id = ?`,
      [userId],
      (err, row) => {
        if (err) {
          console.error('❌ Erro ao buscar usuário para download:', err);
          return res.status(500).json({ success: false, message: 'Erro ao buscar usuário.' });
        }

        if (!row) {
          return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        }

        const formData = JSON.parse(row.form_data || '{}');



        // Forçar recalculo para garantir 100% no relatório se os dados estiverem completos
        const calculatedProgress = calculateProgressServer(formData);

        const relatorio = `
RELATÓRIO DE PROGRESSO - PROSPERUS MENTOR DIAGNOSIS
${'='.repeat(60)}

INFORMAÇÕES DO USUÁRIO
${'='.repeat(60)}
Nome: ${row.name}
Email: ${row.email}
Progresso: ${calculatedProgress}%
Data da Última Atualização: ${row.last_updated}

DADOS PREENCHIDOS
${'='.repeat(60)}

✅ O Mentor
${'-'.repeat(60)}
${JSON.stringify(formData.mentor, null, 2)}

✅ O Mentorado
${'-'.repeat(60)}
${JSON.stringify(formData.mentee, null, 2)}

✅ O Método
${'-'.repeat(60)}
${JSON.stringify(formData.method, null, 2)}

✅ A Entrega
${'-'.repeat(60)}
${JSON.stringify(formData.delivery, null, 2)}

${'='.repeat(60)}
Relatório gerado em: ${new Date().toLocaleString('pt-BR')}
${'='.repeat(60)}
        `.trim();

        const fileName = `relatorio-${row.name.replace(/\s+/g, '-')}-${Date.now()}.txt`;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(relatorio);

        console.log(`✅ Relatório baixado para ${row.name}`);
      }
    );

  } catch (error) {
    console.error('❌ Erro ao baixar relatório:', error);
    res.status(500).json({ success: false, message: 'Erro ao baixar relatório.' });
  }
});

// 8. Delete User (Admin)
app.delete('/api/admin/users/:userId', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`🗑️ Tentando deletar usuário com ID: [${userId}]`);

    // VERIFICAÇÃO DE DEBUG
    db.get('SELECT id, user_id FROM user_progress WHERE id = ?', [userId], (debugErr, debugRow) => {
      if (debugErr) console.error('❌ Erro no debug select:', debugErr);
      console.log('🔍 Debug dados encontrados:', debugRow || 'Nenhum registro encontrado');
    });

    db.run(
      `DELETE FROM user_progress WHERE id = ?`,
      [userId],
      function (err) {
        if (err) {
          console.error('❌ Erro ao deletar usuário:', err);
          return res.status(500).json({ success: false, message: 'Erro ao deletar usuário.' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        }

        db.run(`DELETE FROM users WHERE id = ?`, [userId]);

        console.log(`✅ Usuário deletado: ${userId}`);
        res.json({ success: true, message: 'Usuário deletado com sucesso.' });
      }
    );

  } catch (error) {
    console.error('❌ Erro ao deletar usuário:', error);
    res.status(500).json({ success: false, message: 'Erro ao deletar usuário.' });
  }
});

// ============================================
// ⭐ ARQUIVOS ESTÁTICOS E FALLBACK
// ============================================

// Servir arquivos estáticos da pasta dist
app.use(express.static(path.join(__dirname, 'dist')));

// Middleware de Erro Global (CAPTURAR 500s)
app.use((err, req, res, next) => {
  console.error('🔥 [ERROR-HANDLER] Erro não tratado:', err);
  console.error('📍 Rota:', req.method, req.path);
  console.error('📦 Stack:', err.stack);

  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: 'Erro interno no servidor',
      message: err.message,
      path: req.path
    });
  }
});

// Fallback para o Frontend (Single Page Application)
app.use((req, res) => {
  // Se for uma rota de API que chegou aqui, é porque não foi encontrada
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    console.log('⚠️ [FALLBACK] Rota de API não encontrada:', req.method, req.path);
    return res.status(404).json({
      success: false,
      error: 'Rota de API não encontrada',
      path: req.path
    });
  }

  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    console.error('❌ [FALLBACK] Frontend (index.html) não encontrado em:', indexPath);
    res.status(404).send('Página não encontrada (Frontend não disponível)');
  }
});

console.log('🚀 Preparando para iniciar o listener do Express...');

// ============================================
// INICIAR SERVIDOR
// ============================================
try {
  app.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════╗');
    console.log(`║  ✅ SERVIDOR v${VERSION} RODANDO        ║`);
    console.log('╚════════════════════════════════════════╝');
    console.log('');
    console.log(`📡 Porta: ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`💾 Banco de dados: ${DB_PATH}`);
    console.log(`🔐 Autenticação HubSpot: ${HUBSPOT_TOKEN ? '✅ Ativa' : '❌ Inativa'}`);
    console.log(`📊 Win Stage: ${HUBSPOT_WIN_STAGE}`);
    console.log('');
  });
} catch (listenError) {
  console.error('❌ [FATAL] Erro ao iniciar o servidor:', listenError);
  process.exit(1);
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGINT', () => {
  console.log('\n🛑 Encerrando servidor...');
  db.close((err) => {
    if (err) console.error('Erro ao fechar banco:', err);
    process.exit(0);
  });
});
