const express = require('express');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure folders exist
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
if (!fs.existsSync('./logs')) fs.mkdirSync('./logs');

// ─── SIEM LOGGER ─────────────────────────────────────────────────────────────
const LOG_FILE = './logs/memoire.log';

function siemLog(event) {
  const entry = {
    timestamp: new Date().toISOString(),
    app: 'memoire',
    ...event
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  console.log(JSON.stringify(entry));
}
// ─────────────────────────────────────────────────────────────────────────────

// DB setup
const db = new Database('photos.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    caption TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Seed default user
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!existing) {
  const hash = bcrypt.hashSync('memories123', 10);
  db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('admin', hash);
}

// Multer
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'super-secret-key-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// Log every request
app.use((req, res, next) => {
  siemLog({
    event_type: 'http_request',
    method: req.method,
    path: req.path,
    ip: req.ip || req.connection.remoteAddress,
    user_agent: req.headers['user-agent'],
    user: req.session && req.session.username ? req.session.username : 'unauthenticated'
  });
  next();
});

app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));

// Auth guard
const requireAuth = (req, res, next) => {
  if (req.session.userId) return next();
  siemLog({
    event_type: 'unauthorized_access',
    severity: 'warning',
    path: req.path,
    ip: req.ip || req.connection.remoteAddress
  });
  res.status(401).json({ error: 'Not authenticated' });
};

// AUTH ROUTES
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    siemLog({
      event_type: 'login_failed',
      severity: 'warning',
      username: username || 'unknown',
      ip,
      reason: !user ? 'user_not_found' : 'wrong_password'
    });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  siemLog({
    event_type: 'login_success',
    severity: 'info',
    username: user.username,
    ip
  });
  res.json({ success: true, username: user.username });
});

app.post('/api/logout', (req, res) => {
  siemLog({
    event_type: 'logout',
    severity: 'info',
    username: req.session.username || 'unknown',
    ip: req.ip || req.connection.remoteAddress
  });
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  if (req.session.userId) {
    res.json({ loggedIn: true, username: req.session.username });
  } else {
    res.json({ loggedIn: false });
  }
});

// PHOTO ROUTES
app.post('/api/photos', requireAuth, upload.array('photos', 50), (req, res) => {
  const { caption } = req.body;
  const inserted = [];
  for (const file of req.files) {
    const result = db.prepare(
      'INSERT INTO photos (user_id, filename, original_name, caption) VALUES (?, ?, ?, ?)'
    ).run(req.session.userId, file.filename, file.originalname, caption || '');
    inserted.push(result.lastInsertRowid);

    siemLog({
      event_type: 'photo_uploaded',
      severity: 'info',
      username: req.session.username,
      ip: req.ip || req.connection.remoteAddress,
      filename: file.originalname,
      size_bytes: file.size,
      photo_id: result.lastInsertRowid
    });
  }
  res.json({ success: true, count: inserted.length });
});

app.get('/api/photos', requireAuth, (req, res) => {
  const photos = db.prepare(
    'SELECT * FROM photos WHERE user_id = ? ORDER BY uploaded_at DESC'
  ).all(req.session.userId);
  res.json(photos);
});

app.delete('/api/photos/:id', requireAuth, (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!photo) return res.status(404).json({ error: 'Not found' });

  fs.unlink('./uploads/' + photo.filename, () => {});
  db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);

  siemLog({
    event_type: 'photo_deleted',
    severity: 'info',
    username: req.session.username,
    ip: req.ip || req.connection.remoteAddress,
    photo_id: photo.id,
    filename: photo.original_name
  });

  res.json({ success: true });
});

app.listen(PORT, () => {
  siemLog({ event_type: 'server_start', severity: 'info', port: PORT });
  console.log('Server running on http://localhost:' + PORT);
});
