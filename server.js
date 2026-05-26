require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { createClerkClient, verifyToken } = require('@clerk/backend');
const multer = require('multer');
const fs = require('fs');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const pino = require('pino');

// Custom middleware
const errorHandler = require('./middleware/errorHandler');
const validate = require('./middleware/validate');

// Structured Logger
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const app = express();
const PORT = process.env.PORT || 3000;

// Clerk backend client for JWT verification
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

// ══════════ SECURITY MIDDLEWARE ══════════

// Helmet for security headers (with CSP configured for Clerk & Tesseract CDNs)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://*.clerk.accounts.dev", "https://challenges.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://img.clerk.com", "https://*.clerk.accounts.dev"],
      connectSrc: ["'self'", "https://*.clerk.accounts.dev", "https://api.clerk.com", "https://cdn.jsdelivr.net"],
      frameSrc: ["'self'", "https://*.clerk.accounts.dev", "https://challenges.cloudflare.com"],
      workerSrc: ["'self'", "blob:"],
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Gzip compression
app.use(compression());

// CORS - scoped origins (include React dev server port 3001)
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'];
app.use(cors({ origin: allowedOrigins, credentials: true }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});
app.use('/api/', apiLimiter);

const actionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Action rate limit exceeded.' }
});

app.use(express.json({ limit: '10mb' }));

// Serve static frontend files (style.css, app.js, finance.js, etc.)
app.use(express.static(path.join(__dirname)));

// Set trust proxy for correct IP (needed because React proxy adds X-Forwarded-For)
app.set('trust proxy', 1);

// ══════════ ZOD VALIDATION SCHEMAS ══════════
const syncUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  role: z.enum(['DEV', 'FIN', 'OWN', 'ADM', 'VND', 'EMP', 'VRF'])
});

const createRequestSchema = z.object({
  amount: z.number().positive().max(10000000),
  purpose: z.string().min(1).max(500).trim(),
  file_hash: z.string().optional(),
  metadata: z.string().optional(),
  verifier: z.string().optional() // First-line verifier chosen by vendor
});

const actionSchema = z.object({
  id: z.string().min(1),
  nextState: z.enum(['PND', 'VRF', 'FIN', 'OWN', 'DSB', 'REJ']),
  comment: z.string().min(1).max(500)
});

const updateRoleSchema = z.object({
  role: z.enum(['DEV', 'FIN', 'OWN', 'ADM', 'VND', 'EMP', 'VRF'])
});

// ══════════ DATABASE ══════════
let isPostgres = false;
let pool = null;
let sqliteDb = null;

// Helper to convert SQLite "?" placeholders to PG "$1, $2, ..."
function pgSql(sql) {
  if (!sql) return sql;
  let cleanSql = sql;
  if (/INSERT\s+OR\s+IGNORE\s+INTO\s+users/i.test(cleanSql)) {
    cleanSql = cleanSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO\s+users/i, 'INSERT INTO users');
    cleanSql = cleanSql + ' ON CONFLICT (id) DO NOTHING';
  }
  let index = 1;
  return cleanSql.replace(/\?/g, () => `$${index++}`);
}

const db = {
  get: (sql, params, cb) => {
    if (typeof params === 'function') {
      cb = params;
      params = [];
    }
    if (isPostgres) {
      pool.query(pgSql(sql), params, (err, res) => {
        if (err) return cb(err);
        cb(null, res.rows[0]);
      });
    } else {
      sqliteDb.get(sql, params, cb);
    }
  },
  all: (sql, params, cb) => {
    if (typeof params === 'function') {
      cb = params;
      params = [];
    }
    if (isPostgres) {
      pool.query(pgSql(sql), params, (err, res) => {
        if (err) return cb(err);
        cb(null, res.rows);
      });
    } else {
      sqliteDb.all(sql, params, cb);
    }
  },
  run: function(sql, params, cb) {
    if (typeof params === 'function') {
      cb = params;
      params = [];
    }
    if (isPostgres) {
      pool.query(pgSql(sql), params, (err, res) => {
        if (err) {
          if (cb) cb(err);
          return;
        }
        if (cb) {
          cb.call({ changes: res.rowCount }, null);
        }
      });
    } else {
      sqliteDb.run(sql, params, function(err) {
        if (err) {
          if (cb) cb(err);
          return;
        }
        if (cb) {
          cb.call({ changes: this.changes }, null);
        }
      });
    }
  },
  close: (cb) => {
    if (isPostgres) {
      pool.end(cb);
    } else {
      sqliteDb.close(cb);
    }
  },
  serialize: (cb) => {
    if (isPostgres) {
      cb();
    } else {
      sqliteDb.serialize(cb);
    }
  }
};

// Automate creation of database if it doesn't exist
async function ensureDatabaseExists(pgConfig) {
  const adminPool = new Pool({
    host: pgConfig.host,
    port: pgConfig.port,
    user: pgConfig.user,
    password: pgConfig.password,
    database: 'postgres'
  });
  try {
    const dbName = pgConfig.database;
    const res = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (res.rowCount === 0) {
      logger.info(`Database "${dbName}" does not exist. Creating it...`);
      await adminPool.query(`CREATE DATABASE "${dbName}"`);
      logger.info(`Database "${dbName}" created successfully.`);
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to verify/create database; assuming it already exists.');
  } finally {
    await adminPool.end();
  }
}

async function initPostgres(pgConfig) {
  pool = new Pool(pgConfig);
  // Verify Postgres connection
  await pool.query('SELECT 1');
  logger.info('Successfully connected to PostgreSQL');

  await ensureDatabaseExists(pgConfig);

  // Initialize Postgres schemas
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'DEV',
    hash TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    amount DOUBLE PRECISION NOT NULL,
    purpose TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PND',
    requester TEXT NOT NULL,
    verifier TEXT DEFAULT NULL,
    ts TEXT NOT NULL,
    deleted_at TEXT DEFAULT NULL,
    file_hash TEXT DEFAULT NULL,
    metadata TEXT DEFAULT NULL,
    FOREIGN KEY (requester) REFERENCES users(id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    reqId TEXT NOT NULL,
    actor TEXT NOT NULL,
    prev TEXT,
    next TEXT,
    comment TEXT,
    ts TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    signature TEXT
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS state_transitions (
    id SERIAL PRIMARY KEY,
    from_state TEXT NOT NULL,
    to_state TEXT NOT NULL,
    required_role TEXT NOT NULL,
    UNIQUE(from_state, to_state)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    rating TEXT DEFAULT 'B',
    performance_score DOUBLE PRECISION DEFAULT 0,
    payment_terms TEXT DEFAULT 'Net 30',
    total_paid DOUBLE PRECISION DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    type TEXT DEFAULT 'info',
    read INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    request_id TEXT,
    filename TEXT NOT NULL,
    mime_type TEXT,
    file_size INTEGER,
    file_hash TEXT,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES requests(id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    vendor_id TEXT,
    cost DOUBLE PRECISION DEFAULT 0,
    billing_cycle TEXT DEFAULT 'Monthly',
    next_renewal_date TEXT,
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS employee_queries (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    recipient_role TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'Open',
    response TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES users(id)
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS worksheets (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    date TEXT NOT NULL,
    tasks_completed TEXT NOT NULL,
    tasks_in_progress TEXT,
    blockers TEXT,
    tomorrow_plan TEXT,
    productivity INTEGER DEFAULT 3,
    hours_worked DOUBLE PRECISION DEFAULT 8,
    mood INTEGER DEFAULT 3,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES users(id)
  )`);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_requests_requester ON requests(requester)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_requests_deleted ON requests(deleted_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_reqId ON audit_logs(reqId)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)');

  // Seed transitions
  const transitions = [
    ['PND', 'VRF', 'VRF'],
    ['PND', 'VRF', 'FIN'],
    ['PND', 'VRF', 'OWN'],
    ['PND', 'REJ', 'VRF'],
    ['PND', 'REJ', 'FIN'],
    ['VRF', 'FIN', 'FIN'],
    ['VRF', 'REJ', 'FIN'],
    ['VRF', 'OWN', 'FIN'],
    ['FIN', 'OWN', 'OWN'],
    ['FIN', 'REJ', 'OWN'],
    ['FIN', 'OWN', 'FIN'],
    ['OWN', 'DSB', 'FIN'],
    ['OWN', 'DSB', 'SYSTEM'],
    ['REJ', 'PND', 'FIN'],
    ['REJ', 'VRF', 'OWN'],
    ['PND', 'VRF', 'ADM'],
    ['PND', 'FIN', 'ADM'],
    ['PND', 'OWN', 'ADM'],
    ['PND', 'REJ', 'ADM'],
    ['VRF', 'FIN', 'ADM'],
    ['VRF', 'OWN', 'ADM'],
    ['VRF', 'REJ', 'ADM'],
    ['FIN', 'OWN', 'ADM'],
    ['FIN', 'REJ', 'ADM'],
    ['OWN', 'DSB', 'ADM'],
  ];

  for (const t of transitions) {
    await pool.query(
      'INSERT INTO state_transitions (from_state, to_state, required_role) VALUES ($1, $2, $3) ON CONFLICT (from_state, to_state) DO NOTHING',
      t
    );
  }

  isPostgres = true;
  logger.info('PostgreSQL database fully initialized.');
}

function initSQLite() {
  logger.info('PostgreSQL connection skipped/failed. Initializing SQLite Database fallback...');
  const sqlite3 = require('sqlite3').verbose();
  sqliteDb = new sqlite3.Database('./finance.db', (err) => {
    if (err) {
      logger.error({ err }, 'Error opening SQLite fallback database');
      return;
    }
    logger.info('SQLite fallback database connected');
    
    // Run schemas
    sqliteDb.serialize(() => {
      sqliteDb.run('PRAGMA foreign_keys = ON');
      sqliteDb.run('PRAGMA journal_mode = WAL');

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'DEV',
        hash TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        amount REAL NOT NULL,
        purpose TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PND',
        requester TEXT NOT NULL,
        verifier TEXT DEFAULT NULL,
        ts TEXT NOT NULL,
        deleted_at TEXT DEFAULT NULL,
        file_hash TEXT DEFAULT NULL,
        metadata TEXT DEFAULT NULL,
        FOREIGN KEY (requester) REFERENCES users(id)
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reqId TEXT NOT NULL,
        actor TEXT NOT NULL,
        prev TEXT,
        next TEXT,
        comment TEXT,
        ts TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        signature TEXT
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS state_transitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_state TEXT NOT NULL,
        to_state TEXT NOT NULL,
        required_role TEXT NOT NULL,
        UNIQUE(from_state, to_state)
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS vendors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        rating TEXT DEFAULT 'B',
        performance_score REAL DEFAULT 0,
        payment_terms TEXT DEFAULT 'Net 30',
        total_paid REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        type TEXT DEFAULT 'info',
        read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        request_id TEXT,
        filename TEXT NOT NULL,
        mime_type TEXT,
        file_size INTEGER,
        file_hash TEXT,
        uploaded_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (request_id) REFERENCES requests(id)
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        vendor_id TEXT,
        cost REAL DEFAULT 0,
        billing_cycle TEXT DEFAULT 'Monthly',
        next_renewal_date TEXT,
        status TEXT DEFAULT 'Active',
        created_at TEXT DEFAULT (datetime('now'))
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS employee_queries (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        recipient_role TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT DEFAULT 'Open',
        response TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (employee_id) REFERENCES users(id)
      )`);

      sqliteDb.run(`CREATE TABLE IF NOT EXISTS worksheets (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        date TEXT NOT NULL,
        tasks_completed TEXT NOT NULL,
        tasks_in_progress TEXT,
        blockers TEXT,
        tomorrow_plan TEXT,
        productivity INTEGER DEFAULT 3,
        hours_worked REAL DEFAULT 8,
        mood INTEGER DEFAULT 3,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (employee_id) REFERENCES users(id)
      )`);

      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_requests_requester ON requests(requester)');
      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status)');
      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_requests_deleted ON requests(deleted_at)');
      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_audit_reqId ON audit_logs(reqId)');
      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor)');
      sqliteDb.run('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)');

      const transitions = [
        ['PND', 'VRF', 'VRF'],
        ['PND', 'VRF', 'FIN'],
        ['PND', 'VRF', 'OWN'],
        ['PND', 'REJ', 'VRF'],
        ['PND', 'REJ', 'FIN'],
        ['VRF', 'FIN', 'FIN'],
        ['VRF', 'REJ', 'FIN'],
        ['VRF', 'OWN', 'FIN'],
        ['FIN', 'OWN', 'OWN'],
        ['FIN', 'REJ', 'OWN'],
        ['FIN', 'OWN', 'FIN'],
        ['OWN', 'DSB', 'FIN'],
        ['OWN', 'DSB', 'SYSTEM'],
        ['REJ', 'PND', 'FIN'],
        ['REJ', 'VRF', 'OWN'],
        ['PND', 'VRF', 'ADM'],
        ['PND', 'FIN', 'ADM'],
        ['PND', 'OWN', 'ADM'],
        ['PND', 'REJ', 'ADM'],
        ['VRF', 'FIN', 'ADM'],
        ['VRF', 'OWN', 'ADM'],
        ['VRF', 'REJ', 'ADM'],
        ['FIN', 'OWN', 'ADM'],
        ['FIN', 'REJ', 'ADM'],
        ['OWN', 'DSB', 'ADM'],
      ];

      const stmt = sqliteDb.prepare('INSERT OR IGNORE INTO state_transitions (from_state, to_state, required_role) VALUES (?, ?, ?)');
      transitions.forEach(t => stmt.run(t));
      stmt.finalize();

      logger.info('SQLite fallback database and schema initialized successfully.');
    });
  });
  isPostgres = false;
}

async function initDb() {
  const pgConfig = {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'finance'
  };

  try {
    await initPostgres(pgConfig);
  } catch (err) {
    logger.warn({ err: err.message }, 'PostgreSQL connection failed. Falling back to SQLite...');
    initSQLite();
  }
}

initDb();

// ══════════ HELPER: HMAC Audit Signature ══════════
const AUDIT_SECRET = process.env.AUDIT_SECRET || 'default-audit-hmac-key';
function signAuditEntry(reqId, actor, prev, next, comment, ts) {
  const payload = `${reqId}|${actor}|${prev}|${next}|${comment}|${ts}`;
  return crypto.createHmac('sha256', AUDIT_SECRET).update(payload).digest('hex');
}

// ══════════ AUTH MIDDLEWARE ══════════
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }
    const token = authHeader.split(' ')[1];
    
    // Verify the Clerk JWT token
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    if (!payload || !payload.sub) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    const userId = payload.sub;
    
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) return next(err);
      if (!user) {
        logger.warn({ userId }, 'User not in DB - auto-creating with DEV role');
        const newUser = { id: userId, name: payload.name || 'User', role: 'DEV' };
        db.run('INSERT OR IGNORE INTO users (id, name, role, hash, updated_at) VALUES (?, ?, ?, ?, ?)',
          [userId, newUser.name, 'DEV', 'CLERK_OAUTH', new Date().toISOString()], (insertErr) => {
            if (insertErr) return next(insertErr);
            req.user = newUser;
            req.clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
            req.clientAgent = req.headers['user-agent'] || 'unknown';
            next();
          });
        return;
      }
      req.user = user;
      req.clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      req.clientAgent = req.headers['user-agent'] || 'unknown';
      next();
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'Token verification failed');
    return res.status(401).json({ error: 'Token verification failed', detail: err.message });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// ══════════ ROUTES ══════════

// Health Endpoint
app.get('/api/health', (req, res) => {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();
  db.get('SELECT COUNT(*) as count FROM requests', (err, row) => {
    res.json({
      status: 'healthy',
      uptime: Math.floor(uptime),
      timestamp: new Date().toISOString(),
      database: err ? 'error' : 'connected',
      records: row ? row.count : 0,
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
        heap: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB'
      },
      version: '2.0.0'
    });
  });
});

// Sync User - no auth needed, just verify the Clerk token manually
app.post('/api/sync-user', async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token' });
    }
    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    if (!payload || !payload.sub) return res.status(401).json({ error: 'Invalid token' });
    
    const { id, name, role } = req.body;
    const userId = payload.sub; // use verified userId from token, not body
    const userName = name || payload.name || 'User';
    
    // Only insert if it doesn't exist to prevent overwriting the role
    db.get('SELECT role FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) return next(err);
      if (!user) {
        db.run('INSERT INTO users (id, name, role, hash, updated_at) VALUES (?, ?, ?, ?, ?)',
          [userId, userName, role || 'DEV', 'CLERK_OAUTH', new Date().toISOString()], (err) => {
            if (err) return next(err);
            logger.info({ userId, role }, 'New user synced');
            res.json({ success: true, role: role || 'DEV' });
          });
      } else {
        // Update name in case it changed, preserve role
        db.run('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', [userName, new Date().toISOString(), userId]);
        res.json({ success: true, role: user.role });
      }
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'sync-user token verification failed');
    return res.status(401).json({ error: 'Token verification failed' });
  }
});

// Get Current User Profile
app.get('/api/me', authenticateToken, (req, res) => {
  res.json(req.user);
});

// Update Current User's Role (for UI Demo / role switching)
app.post('/api/me/role', authenticateToken, (req, res, next) => {
  const { role, name } = req.body;
  if (!['DEV', 'FIN', 'OWN', 'ADM', 'VND', 'EMP', 'VRF'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (name) {
    db.run('UPDATE users SET role = ?, name = ?, updated_at = ? WHERE id = ?', [role, name, new Date().toISOString(), req.user.id], function(err) {
      if (err) return next(err);
      logger.info({ userId: req.user.id, newRole: role, newName: name }, 'User updated own role and name');
      res.json({ success: true, role, name });
    });
  } else {
    db.run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [role, new Date().toISOString(), req.user.id], function(err) {
      if (err) return next(err);
      logger.info({ userId: req.user.id, newRole: role }, 'User updated own role');
      res.json({ success: true, role });
    });
  }
});

// Get Requests (paginated, excludes soft-deleted)
app.get('/api/requests', authenticateToken, (req, res, next) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const status = req.query.status;
  const search = req.query.search;

  let baseWhere = 'WHERE deleted_at IS NULL';
  let params = [];

  if (req.user.role === 'DEV' || req.user.role === 'EMP' || req.user.role === 'VND') {
    // Employees & Vendors only see their own
    baseWhere += ' AND requester = ?';
    params.push(req.user.id);
  }
  // FIN, OWN, ADM see all requests
  if (status) {
    baseWhere += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    baseWhere += ' AND (purpose LIKE ? OR id LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const countQuery = `SELECT COUNT(*) as total FROM requests ${baseWhere}`;
  const dataQuery = `SELECT * FROM requests ${baseWhere} ORDER BY ts DESC LIMIT ? OFFSET ?`;

  db.get(countQuery, params, (err, countRow) => {
    if (err) return next(err);
    db.all(dataQuery, [...params, limit, offset], (err2, rows) => {
      if (err2) return next(err2);
      res.json({
        data: rows,
        pagination: {
          page, limit,
          total: countRow.total,
          totalPages: Math.ceil(countRow.total / limit)
        }
      });
    });
  });
});

// Create Request (UUID-based)
app.post('/api/requests', authenticateToken, validate(createRequestSchema), (req, res, next) => {
  const { amount, purpose, file_hash, metadata, verifier } = req.validatedBody;
  const id = 'REQ-' + crypto.randomUUID().split('-')[0].toUpperCase();
  const ts = new Date().toISOString();
  const sig = signAuditEntry(id, req.user.id, '-', 'PND', 'Request submitted. Awaiting first-line verification.', ts);

  db.serialize(() => {
    db.run('INSERT INTO requests (id, amount, purpose, status, requester, verifier, ts, file_hash, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, amount, purpose, 'PND', req.user.id, verifier || null, ts, file_hash || null, metadata || null]);
    db.run('INSERT INTO audit_logs (reqId, actor, prev, next, comment, ts, ip_address, user_agent, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.user.id, '-', 'PND', 'Request submitted. Awaiting first-line verification.', ts, req.clientIp, req.clientAgent, sig]);
    
    // Notify the assigned verifier AND finance team
    const notifyRoles = ['FIN', 'VRF', 'ADM'];
    db.all('SELECT id FROM users WHERE role IN (?, ?, ?)', notifyRoles, (err, notifyUsers) => {
      if (!err && notifyUsers) {
        notifyUsers.forEach(u => {
          db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
            [u.id, 'New Vendor Request', `${req.user.name || req.user.id} submitted ${id} (₹${amount}) — Verifier: ${verifier || 'Unassigned'}`, 'action']);
        });
      }
    });

    logger.info({ requestId: id, amount, verifier, actor: req.user.id }, 'Request created with verifier');
    res.json({ success: true, id });
  });
});

// Get Verifiers list (the 4 first-line people)
app.get('/api/verifiers', authenticateToken, (req, res) => {
  const verifiers = [
    { id: 'rup',     name: 'Rup',     title: 'Tech Head',      role: 'VRF', avatar: 'R', color: '#3b82f6' },
    { id: 'debojit', name: 'Debojit', title: 'Creative Head & Owner', role: 'OWN', avatar: 'D', color: '#8b5cf6' },
    { id: 'yash',    name: 'Yash',    title: 'Finance Head',   role: 'FIN', avatar: 'Y', color: '#22c55e' },
    { id: 'samaja',  name: 'Samaja',  title: 'Content Head',   role: 'VRF', avatar: 'S', color: '#f59e0b' },
  ];
  res.json(verifiers);
});

// Action (state transition with maker-checker & validation)
app.post('/api/action', authenticateToken, actionLimiter, validate(actionSchema), (req, res, next) => {
  const { id, nextState, comment } = req.validatedBody;
  const ts = new Date().toISOString();

  db.get('SELECT * FROM requests WHERE id = ? AND deleted_at IS NULL', [id], (err, reqRow) => {
    if (err) return next(err);
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });

    // Maker-checker: prevent self-approval (disabled for demo so you can test the entire workflow with a single account!)
    /*
    if (reqRow.requester === req.user.id && ['FIN', 'OWN', 'DSB'].includes(nextState)) {
      return res.status(403).json({ error: 'Self-approval is prohibited. Another authorized user must approve.' });
    }
    */

    // Validate state transition
    const prevState = reqRow.status;
    db.get('SELECT * FROM state_transitions WHERE from_state = ? AND to_state = ? AND (required_role = ? OR required_role = ?)',
      [prevState, nextState, req.user.role, 'SYSTEM'], (err2, transition) => {
        if (err2) return next(err2);
        
        // ADM can do anything, otherwise check transition table
        if (!transition && req.user.role !== 'ADM') {
          return res.status(403).json({ error: `Invalid state transition: ${prevState} → ${nextState} for role ${req.user.role}` });
        }

        const sig = signAuditEntry(id, req.user.id, prevState, nextState, comment, ts);

        db.serialize(() => {
          db.run('UPDATE requests SET status = ? WHERE id = ?', [nextState, id]);
          db.run('INSERT INTO audit_logs (reqId, actor, prev, next, comment, ts, ip_address, user_agent, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, req.user.id, prevState, nextState, comment, ts, req.clientIp, req.clientAgent, sig]);

          if (nextState === 'DSB') {
            // Notify requester of successful disbursement
            db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
              [reqRow.requester, 'Transfer Complete', `Request ${id} has been disbursed.`, 'success']);
          }

          logger.info({ requestId: id, from: prevState, to: nextState, actor: req.user.id }, 'Action processed');
          res.json({ success: true });
        });
      });
  });
});

// Get Audit Logs (paginated)
app.get('/api/audit', authenticateToken, (req, res, next) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  let countQuery = "SELECT COUNT(*) as total FROM audit_logs";
  let dataQuery = "SELECT * FROM audit_logs ORDER BY id ASC LIMIT ? OFFSET ?";
  let params = [limit, offset];

  if (req.user.role === 'DEV') {
    // Basic DEV filtering - ideally done in SQL with JOIN but implemented similarly to old version
    db.all("SELECT id FROM requests WHERE requester = ?", [req.user.id], (err, userReqs) => {
      if (err) return next(err);
      const myIds = userReqs.map(r => r.id);
      db.all("SELECT * FROM audit_logs ORDER BY id ASC", [], (err, rows) => {
        if (err) return next(err);
        const filtered = rows.filter(l => myIds.includes(l.reqId) || (l.reqId === 'SYS' && l.actor === req.user.id));
        res.json({
          data: filtered.slice(offset, offset + limit),
          pagination: { page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) }
        });
      });
    });
  } else {
    db.get(countQuery, [], (err, countRow) => {
      if (err) return next(err);
      db.all(dataQuery, params, (err, rows) => {
        if (err) return next(err);
        res.json({
          data: rows,
          pagination: {
            page, limit,
            total: countRow.total,
            totalPages: Math.ceil(countRow.total / limit)
          }
        });
      });
    });
  }
});

// Update User Role (ADM only)
app.post('/api/users/:id/role', authenticateToken, requireRole('ADM'), validate(updateRoleSchema), (req, res, next) => {
  const { role } = req.validatedBody;
  const targetId = req.params.id;
  
  db.run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [role, new Date().toISOString(), targetId], function(err) {
    if (err) return next(err);
    if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
    
    logger.info({ actor: req.user.id, target: targetId, newRole: role }, 'User role updated');
    res.json({ success: true });
  });
});

app.get('/api/users', authenticateToken, (req, res, next) => {
  db.all("SELECT id, name, role FROM users", [], (err, rows) => {
    if (err) return next(err);
    res.json(rows);
  });
});

// ══════════ NEW ENDPOINTS (SUBSCRIPTIONS, QUERIES, INVOICES) ══════════

// Subscriptions
app.get('/api/subscriptions', authenticateToken, (req, res, next) => {
  db.all("SELECT * FROM subscriptions", [], (err, rows) => {
    if (err) return next(err);
    res.json(rows);
  });
});

app.post('/api/subscriptions', authenticateToken, requireRole('FIN', 'OWN', 'ADM'), (req, res, next) => {
  const { name, vendor_id, cost, billing_cycle, next_renewal_date } = req.body;
  const id = 'SUB-' + crypto.randomUUID().split('-')[0].toUpperCase();
  db.run('INSERT INTO subscriptions (id, name, vendor_id, cost, billing_cycle, next_renewal_date) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, vendor_id, cost, billing_cycle, next_renewal_date], (err) => {
      if (err) return next(err);
      res.json({ success: true, id });
  });
});

// Employee Queries - GET
// viewAs param lets Finance/Owner see their inbox; employees see their own queries
app.get('/api/queries', authenticateToken, (req, res, next) => {
  const viewAs = req.query.viewAs; // can be 'FIN', 'OWN', or empty
  let query = "SELECT * FROM employee_queries ORDER BY created_at DESC";
  let params = [];

  const dbRole = req.user.role;
  const allowedManagerRoles = ['FIN', 'OWN', 'ADM'];

  if (viewAs && allowedManagerRoles.includes(viewAs)) {
    // Allow viewing as Finance or Owner inbox if:
    // 1. Their DB role matches viewAs
    // 2. Their DB role is ADM (admin can see everything)
    // 3. Their DB role is DEV (allow for UI role-switching demo)
    query = "SELECT * FROM employee_queries WHERE recipient_role = ? ORDER BY created_at DESC";
    params.push(viewAs);
  } else if (dbRole === 'FIN' || dbRole === 'OWN') {
    // If their actual DB role is FIN or OWN, show their inbox
    query = "SELECT * FROM employee_queries WHERE recipient_role = ? ORDER BY created_at DESC";
    params.push(dbRole);
  } else {
    // Default: employees see their own submitted queries
    query = "SELECT * FROM employee_queries WHERE employee_id = ? ORDER BY created_at DESC";
    params.push(req.user.id);
  }
  
  db.all(query, params, (err, rows) => {
    if (err) return next(err);
    res.json(rows);
  });
});

// Submit Employee Query
app.post('/api/queries', authenticateToken, (req, res, next) => {
  const { subject, message, recipient_role } = req.body;
  if (!subject || !message || !recipient_role) {
    return res.status(400).json({ error: 'subject, message, and recipient_role are required' });
  }
  const id = 'QRY-' + crypto.randomUUID().split('-')[0].toUpperCase();
  db.run('INSERT INTO employee_queries (id, employee_id, recipient_role, subject, message) VALUES (?, ?, ?, ?, ?)',
    [id, req.user.id, recipient_role, subject, message], function(err) {
      if (err) return next(err);
      logger.info({ id, from: req.user.id, to: recipient_role }, 'Query submitted');
      res.json({ success: true, id });
  });
});

// Reply to Query (Finance/Owner/ADM or UI role-switch demo)
app.post('/api/queries/:id/reply', authenticateToken, (req, res, next) => {
  const { response } = req.body;
  if (!response) return res.status(400).json({ error: 'response text is required' });
  db.run("UPDATE employee_queries SET response = ?, status = 'Answered', updated_at = ? WHERE id = ?",
    [response, new Date().toISOString(), req.params.id], function(err) {
      if (err) return next(err);
      if (this.changes === 0) return res.status(404).json({ error: 'Query not found' });
      res.json({ success: true });
  });
});

// File Upload Setup
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `invoice_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, JPG, PNG allowed'));
  }
});

// Expose uploads directory to frontend
app.use('/uploads', express.static(uploadsDir));

// Vendor Invoice Upload - returns file hash to be submitted with request form
app.post('/api/invoices/upload', authenticateToken, upload.single('invoice'), (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded. Field name must be "invoice".' });

  const file = req.file;
  logger.info({ filename: file.filename, size: file.size, mime: file.mimetype }, 'Invoice file uploaded');

  // Simulate AI/OCR extraction
  const baseAmount = (file.size % 9000) + 1000;
  const amount = Math.round(baseAmount / 10) * 10;
  const purpose = `Vendor Invoice: ${file.originalname}`;

  res.json({
    success: true,
    file_hash: file.filename,
    extracted_amount: amount,
    filename: file.originalname,
    file_size: file.size,
    purpose
  });
});

// ══════════ WORKSHEETS ══════════
// Employee submits daily worksheet
app.post('/api/worksheets', authenticateToken, (req, res, next) => {
  const { date, tasks_completed, tasks_in_progress, blockers, tomorrow_plan, productivity, hours_worked, mood } = req.body;
  if (!date || !tasks_completed) return res.status(400).json({ error: 'date and tasks_completed are required' });
  const id = 'WS-' + crypto.randomUUID().split('-')[0].toUpperCase();
  db.run(`INSERT INTO worksheets (id, employee_id, date, tasks_completed, tasks_in_progress, blockers, tomorrow_plan, productivity, hours_worked, mood)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.user.id, date, tasks_completed, tasks_in_progress || '', blockers || '', tomorrow_plan || '', productivity || 3, hours_worked || 8, mood || 3],
    function(err) {
      if (err) return next(err);
      logger.info({ id, employee: req.user.id, date }, 'Worksheet submitted');
      res.json({ success: true, id });
    });
});

// Get worksheets - employee sees own, ADM/OWN see all
app.get('/api/worksheets', authenticateToken, (req, res, next) => {
  const viewAll = req.query.all === '1' && (req.user.role === 'ADM' || req.user.role === 'OWN');
  const query = viewAll
    ? 'SELECT * FROM worksheets ORDER BY date DESC, created_at DESC'
    : 'SELECT * FROM worksheets WHERE employee_id = ? ORDER BY date DESC';
  const params = viewAll ? [] : [req.user.id];
  db.all(query, params, (err, rows) => {
    if (err) return next(err);
    res.json(rows);
  });
});


// Fallback to index.html for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Register error handler
app.use(errorHandler);

// Graceful Shutdown
function shutdown() {
  logger.info('SIGTERM/SIGINT received. Shutting down gracefully.');
  db.close((err) => {
    if (err) {
      logger.error({ err }, 'Error closing database');
      process.exit(1);
    }
    logger.info('Database connection closed.');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
