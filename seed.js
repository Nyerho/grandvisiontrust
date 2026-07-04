const path = require('node:path');
const fs = require('node:fs');

const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { nanoid } = require('nanoid');

const email = (process.env.SEED_EMAIL || '').trim().toLowerCase();
const password = process.env.SEED_PASSWORD || '';
const pin = (process.env.SEED_PIN || '').trim();
const fullName = (process.env.SEED_FULL_NAME || 'GrandVisionTrust User').trim();

if (!email || !password || !pin) {
  throw new Error('SEED_EMAIL, SEED_PASSWORD, and SEED_PIN are required');
}

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'app.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    pin_hash TEXT,
    profile_json TEXT,
    created_at TEXT NOT NULL
  );
`);

const userColumns = new Set(db.prepare("PRAGMA table_info(users)").all().map((r) => r.name));
if (!userColumns.has('pin_hash')) {
  db.exec('ALTER TABLE users ADD COLUMN pin_hash TEXT');
}
if (!userColumns.has('profile_json')) {
  db.exec('ALTER TABLE users ADD COLUMN profile_json TEXT');
}

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  process.stdout.write(`User already exists: ${email}\n`);
  process.exit(0);
}

const id = nanoid();
const passwordHash = bcrypt.hashSync(password, 12);
const pinHash = bcrypt.hashSync(pin, 12);

db.prepare('INSERT INTO users (id, email, full_name, password_hash, pin_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
  id,
  email,
  fullName,
  passwordHash,
  pinHash,
  new Date().toISOString()
);

process.stdout.write(`Created user: ${email}\n`);
