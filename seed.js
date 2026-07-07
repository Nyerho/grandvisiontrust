
const path = require('node:path');
const fs = require('node:fs');
const initSqlJs = require('sql.js');

const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');

const email = (process.env.SEED_EMAIL || '').trim().toLowerCase();
const password = process.env.SEED_PASSWORD || '';
const pin = (process.env.SEED_PIN || '').trim();
const fullName = (process.env.SEED_FULL_NAME || 'GrandVisionTrust User').trim();

if (!email || !password || !pin) {
  throw new Error('SEED_EMAIL, SEED_PASSWORD, and SEED_PIN are required');
}

async function seed() {
  const SQL = await initSqlJs({ locateFile: (file) => `node_modules/sql.js/dist/${file}` });
  const dataDir = path.join(__dirname, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'app.db');

  let dbBuffer;
  try {
    dbBuffer = fs.readFileSync(dbPath);
  } catch (e) {
    dbBuffer = null;
  }

  const db = new SQL.Database(dbBuffer);

  db.run(`
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

  const userColumnsResult = db.exec("PRAGMA table_info(users)");
  const userColumns = new Set(userColumnsResult[0]?.values.map((r) => r[1]) || []);
  if (!userColumns.has('pin_hash')) {
    db.run('ALTER TABLE users ADD COLUMN pin_hash TEXT');
  }
  if (!userColumns.has('profile_json')) {
    db.run('ALTER TABLE users ADD COLUMN profile_json TEXT');
  }

  function prepare(query) {
    return {
      get: (...params) => {
        const result = db.exec(query, params);
        if (!result[0]) return undefined;
        const columns = result[0].columns;
        const values = result[0].values[0];
        if (!values) return undefined;
        const row = {};
        columns.forEach((col, i) => row[col] = values[i]);
        return row;
      },
      run: (...params) => {
        db.run(query, params);
      }
    };
  }

  const existing = prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    process.stdout.write(`User already exists: ${email}\n`);
    process.exit(0);
  }

  const id = nanoid();
  const passwordHash = bcrypt.hashSync(password, 12);
  const pinHash = bcrypt.hashSync(pin, 12);

  prepare('INSERT INTO users (id, email, full_name, password_hash, pin_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    email,
    fullName,
    passwordHash,
    pinHash,
    new Date().toISOString()
  );

  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);

  process.stdout.write(`Created user: ${email}\n`);
}

seed();
