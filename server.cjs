const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Nginx)
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

// SEC-02: JWT_SECRET is REQUIRED — no hardcoded fallback
if (!process.env.JWT_SECRET) {
  console.error('❌ [FATAL] JWT_SECRET environment variable is required. Set it in .env');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

const ADMIN_EMAIL = 'admin@salesprime.com.br';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

// Database path
const DB_PATH = path.join(__dirname, 'data', 'prosperus.db');
const DATA_DIR = path.join(__dirname, 'data');

// Criar pasta data se não existir
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Criar pastas para uploads e audio
const AUDIO_DIR = path.join(DATA_DIR, 'audio');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ============================================
// SAFE JSON PARSE HELPER
// ============================================

function safeJsonParse(str, fallback = {}) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

// ============================================
// MIDDLEWARE GLOBAL
// ============================================

// SEC-07: Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  },
}));

// SEC-05: Restrict CORS to known origins
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:3005'];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, Postman, curl)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
}));

// SEC-06: Rate limiting
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: 'Muitas tentativas de login. Tente novamente em 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { success: false, message: 'Limite de requisições excedido. Tente novamente em 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/auth/', loginLimiter);
app.use('/api/', apiLimiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Helper para logs em arquivo
function logToFile(msg) {
  const logPath = path.join(__dirname, 'server-error.log');
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
}

// Logger simples para ver as requisições
app.use((req, res, next) => {
  const msg = `${req.method} ${req.path}`;
  console.log(`[${new Date().toISOString()}] ${msg}`);
  logToFile(msg);
  next();
});

// ============================================
// DATABASE
// ============================================

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar com banco:', err);
  } else {
    // v2.0: Enable PRAGMAs on every connection
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA foreign_keys = ON');
    db.run('PRAGMA busy_timeout = 5000');
    db.run('PRAGMA synchronous = NORMAL');
    db.run('PRAGMA cache_size = -8000');
    console.log('✅ Banco SQLite conectado:', DB_PATH);
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    // v2.0 Schema — Tables with FK constraints, CHECK constraints, and indexes
    // Migration from v1.x is handled by migrations/run-migration.cjs

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'member'
          CHECK(role IN ('member', 'admin')),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS diagnostic_data (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL
          REFERENCES users(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        name TEXT,
        pre_module JSON,
        mentor JSON,
        mentee JSON,
        method JSON,
        offer JSON,
        current_module TEXT DEFAULT 'pre_module'
          CHECK(current_module IN ('pre_module', 'mentor', 'mentee', 'method', 'offer')),
        current_step INTEGER DEFAULT 0,
        progress_percentage INTEGER DEFAULT 0
          CHECK(progress_percentage BETWEEN 0 AND 100),
        status TEXT NOT NULL DEFAULT 'in_progress'
          CHECK(status IN ('in_progress', 'submitted')),
        submitted_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS pipeline (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL
          REFERENCES users(id) ON DELETE CASCADE,
        research_dossier JSON,
        research_status TEXT DEFAULT 'pending'
          CHECK(research_status IN ('pending', 'in_progress', 'complete')),
        research_completed_at DATETIME,
        brand_brain JSON,
        brand_brain_status TEXT DEFAULT 'pending'
          CHECK(brand_brain_status IN ('pending', 'generated', 'danilo_review', 'mentor_review', 'approved')),
        brand_brain_version INTEGER DEFAULT 0,
        brand_brain_completed_at DATETIME,
        section_approvals JSON,
        review_notes JSON,
        assets JSON,
        assets_status TEXT DEFAULT 'pending'
          CHECK(assets_status IN ('pending', 'ready', 'delivered')),
        assets_delivered_at DATETIME,
        toolkit_enabled INTEGER DEFAULT 0
          CHECK(toolkit_enabled IN (0, 1)),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add expert_notes column if missing (safe migration for existing DBs)
    db.run(`ALTER TABLE pipeline ADD COLUMN expert_notes JSON`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('⚠️ expert_notes migration error:', err.message);
      }
    });

    // Add is_legacy column if missing (tags users who completed the old long diagnostic)
    db.run(`ALTER TABLE diagnostic_data ADD COLUMN is_legacy INTEGER DEFAULT 0 CHECK(is_legacy IN (0, 1))`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('⚠️ is_legacy migration error:', err.message);
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS audio_recordings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL
          REFERENCES users(id) ON DELETE CASCADE,
        module TEXT NOT NULL
          CHECK(module IN ('pre_module', 'mentor', 'mentee', 'method', 'offer')),
        question_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        transcript TEXT,
        duration_seconds INTEGER
          CHECK(duration_seconds >= 0),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL
          REFERENCES users(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT,
        file_size INTEGER
          CHECK(file_size >= 0),
        url TEXT,
        module TEXT DEFAULT 'general',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(
      `INSERT OR IGNORE INTO users (id, email, name, role)
       VALUES (?, ?, ?, ?)`,
      ['admin-001', ADMIN_EMAIL, 'Admin', 'admin']
    );

    // ---- v2.1: UNIQUE constraint, indexes, triggers, schema_migrations ----

    // Enforce one pipeline row per user (the CREATE TABLE lacks UNIQUE on user_id)
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_user_id_unique ON pipeline(user_id)`);

    // Performance indexes (migration 009)
    db.run(`CREATE INDEX IF NOT EXISTS idx_diagnostic_status ON diagnostic_data(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_pipeline_user_id ON pipeline(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_pipeline_status_composite ON pipeline(research_status, brand_brain_status, assets_status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_audio_user_id ON audio_recordings(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_audio_user_module ON audio_recordings(user_id, module)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_files_user_id ON uploaded_files(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_files_user_category ON uploaded_files(user_id, category)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);

    // Auto-update updated_at triggers (migration 010)
    db.run(`CREATE TRIGGER IF NOT EXISTS trg_users_updated_at AFTER UPDATE ON users FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at BEGIN UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id; END`);
    db.run(`CREATE TRIGGER IF NOT EXISTS trg_diagnostic_data_updated_at AFTER UPDATE ON diagnostic_data FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at BEGIN UPDATE diagnostic_data SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id; END`);
    db.run(`CREATE TRIGGER IF NOT EXISTS trg_pipeline_updated_at AFTER UPDATE ON pipeline FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at BEGIN UPDATE pipeline SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id; END`);
    db.run(`CREATE TRIGGER IF NOT EXISTS trg_uploaded_files_updated_at AFTER UPDATE ON uploaded_files FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at BEGIN UPDATE uploaded_files SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id; END`);

    // Schema migrations tracking
    db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        description TEXT
      )
    `);
    db.run(`INSERT OR IGNORE INTO schema_migrations (version, description) VALUES ('012', 'Add UNIQUE on pipeline.user_id, indexes, triggers')`);

    console.log('✅ Banco inicializado com sucesso (Schema v2.1)');
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
  // Accept token from header or query param (needed for <audio src> and direct file links)
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;

  const rawToken = authHeader ? authHeader.replace('Bearer ', '') : queryToken;

  if (!rawToken) {
    return res.status(401).json({ success: false, message: 'Token ausente.' });
  }

  const decoded = validateToken(rawToken);

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
// DEPENDENCY BUNDLE FOR ROUTE MODULES
// ============================================

const { dbGet, dbRun, dbAll } = require('./utils/db-helpers.cjs')(db);

const deps = {
  db, dbGet, dbRun, dbAll,
  jwt, axios, fs, path, uuidv4, multer,
  JWT_SECRET, HUBSPOT_TOKEN, HUBSPOT_WIN_STAGE,
  ADMIN_EMAIL, ADMIN_PASSWORD_HASH,
  DATA_DIR, AUDIO_DIR, UPLOADS_DIR,
  authMiddleware, adminMiddleware,
  generateId, validateToken, logToFile, safeJsonParse,
};

// ============================================
// MOUNT ROUTES (ORDER MATTERS)
// ============================================

app.use(require('./routes/health.cjs')(deps));
app.use(require('./routes/auth.cjs')(deps));
app.use(require('./routes/user-progress.cjs')(deps));
app.use(require('./routes/admin-users.cjs')(deps));
app.use(require('./routes/admin-pipeline.cjs')(deps));
app.use(require('./routes/brand-brain.cjs')(deps));
app.use(require('./routes/assets.cjs')(deps));
app.use(require('./routes/diagnostic.cjs')(deps));
app.use(require('./routes/files.cjs')(deps));
app.use(require('./routes/audio.cjs')(deps));

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
