const path = require('node:path');
const fs = require('node:fs');

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { nanoid } = require('nanoid');

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required');
}

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'app.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    pin_hash TEXT,
    profile_json TEXT,
    balance_cents INTEGER NOT NULL DEFAULT 0,
    is_verified INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL,
    admin_notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    meta_json TEXT NOT NULL,
    transfer_code TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS admin_logs (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details_json TEXT,
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
if (!userColumns.has('balance_cents')) {
  db.exec('ALTER TABLE users ADD COLUMN balance_cents INTEGER NOT NULL DEFAULT 0');
}
if (!userColumns.has('is_verified')) {
  db.exec('ALTER TABLE users ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 0');
}
if (!userColumns.has('is_active')) {
  db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
}

const appColumns = new Set(db.prepare("PRAGMA table_info(applications)").all().map((r) => r.name));
if (!appColumns.has('admin_notes')) {
  db.exec('ALTER TABLE applications ADD COLUMN admin_notes TEXT');
}

const txColumns = new Set(db.prepare("PRAGMA table_info(transactions)").all().map((r) => r.name));
if (!txColumns.has('transfer_code')) {
  db.exec('ALTER TABLE transactions ADD COLUMN transfer_code TEXT');
}

const app = express();

app.set('trust proxy', IS_PROD ? 1 : false);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  })
);

app.use(express.json({ limit: '100kb' }));

app.use(
  cookieSession({
    name: 'gvt_session',
    secret: SESSION_SECRET,
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
);

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    res.redirect('/login.html');
    return;
  }
  next();
}

function requireApiAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

function requireSameOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }

  const allowed = process.env.APP_ORIGIN || `http://localhost:${PORT}`;
  if (origin !== allowed) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
}

app.post('/api/auth/login', requireSameOrigin, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(400).json({ error: 'missing_credentials' });
    return;
  }

  const row = db
    .prepare('SELECT id, email, full_name, password_hash, pin_hash FROM users WHERE email = ?')
    .get(email);

  if (!row) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  req.session.userId = null;
  req.session.pendingUserId = row.id;
  res.json({ ok: true, next: row.pin_hash ? 'pin' : 'pin_setup' });
});

app.post('/api/auth/register', requireSameOrigin, async (req, res) => {
  const firstName = typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : '';
  const lastName = typeof req.body?.lastName === 'string' ? req.body.lastName.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const dob = typeof req.body?.dob === 'string' ? req.body.dob.trim() : '';
  const ssnLast4 = typeof req.body?.ssnLast4 === 'string' ? req.body.ssnLast4.trim() : '';
  const address1 = typeof req.body?.address1 === 'string' ? req.body.address1.trim() : '';
  const address2 = typeof req.body?.address2 === 'string' ? req.body.address2.trim() : '';
  const city = typeof req.body?.city === 'string' ? req.body.city.trim() : '';
  const state = typeof req.body?.state === 'string' ? req.body.state.trim() : '';
  const postalCode = typeof req.body?.postalCode === 'string' ? req.body.postalCode.trim() : '';
  const country = typeof req.body?.country === 'string' ? req.body.country.trim() : '';
  const accountType = typeof req.body?.accountType === 'string' ? req.body.accountType.trim() : '';
  const idType = typeof req.body?.idType === 'string' ? req.body.idType.trim() : '';
  const idNumber = typeof req.body?.idNumber === 'string' ? req.body.idNumber.trim() : '';
  const employmentStatus = typeof req.body?.employmentStatus === 'string' ? req.body.employmentStatus.trim() : '';
  const annualIncome = typeof req.body?.annualIncome === 'string' ? req.body.annualIncome.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';

  if (
    !firstName ||
    !lastName ||
    !email ||
    !phone ||
    !dob ||
    !address1 ||
    !city ||
    !state ||
    !postalCode ||
    !country ||
    !accountType ||
    !idType ||
    !idNumber ||
    !employmentStatus ||
    !annualIncome
  ) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const allowedAccountTypes = new Set(['checking', 'savings', 'checking_savings']);
  if (!allowedAccountTypes.has(accountType)) {
    res.status(400).json({ error: 'invalid_account_type' });
    return;
  }

  const allowedIdTypes = new Set(['drivers_license', 'state_id', 'passport']);
  if (!allowedIdTypes.has(idType) || idNumber.length < 3 || idNumber.length > 64) {
    res.status(400).json({ error: 'invalid_id' });
    return;
  }

  const allowedEmployment = new Set(['employed', 'self_employed', 'student', 'retired', 'unemployed']);
  if (!allowedEmployment.has(employmentStatus)) {
    res.status(400).json({ error: 'invalid_employment_status' });
    return;
  }

  const allowedIncome = new Set(['under_25k', '25k_50k', '50k_100k', '100k_250k', 'over_250k']);
  if (!allowedIncome.has(annualIncome)) {
    res.status(400).json({ error: 'invalid_income' });
    return;
  }

  if (!/^\d{4}$/.test(ssnLast4)) {
    res.status(400).json({ error: 'invalid_ssn_last4' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'weak_password' });
    return;
  }

  if (!/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'invalid_pin' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'email_in_use' });
    return;
  }

  const id = nanoid();
  const createdAt = new Date().toISOString();
  const fullName = `${firstName} ${lastName}`.trim();
  const passwordHash = await bcrypt.hash(password, 12);
  const pinHash = await bcrypt.hash(pin, 12);
  const profile = {
    firstName,
    lastName,
    phone,
    dob,
    ssnLast4,
    address1,
    address2,
    city,
    state,
    postalCode,
    country,
    accountType,
    idType,
    idNumber,
    employmentStatus,
    annualIncome,
  };

  db.prepare(
    'INSERT INTO users (id, email, full_name, password_hash, pin_hash, profile_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, email, fullName, passwordHash, pinHash, JSON.stringify(profile), createdAt);

  res.json({ ok: true });
});

app.post('/api/auth/verify-pin', requireSameOrigin, async (req, res) => {
  const pendingUserId = req.session?.pendingUserId ? String(req.session.pendingUserId) : '';
  const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';

  if (!pendingUserId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  if (!/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'invalid_pin' });
    return;
  }

  const row = db.prepare('SELECT id, pin_hash FROM users WHERE id = ?').get(pendingUserId);
  if (!row) {
    req.session = null;
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  if (!row.pin_hash) {
    res.status(409).json({ error: 'pin_not_set' });
    return;
  }

  const ok = await bcrypt.compare(pin, row.pin_hash);
  if (!ok) {
    res.status(401).json({ error: 'invalid_pin' });
    return;
  }

  req.session.userId = row.id;
  req.session.pendingUserId = null;
  res.json({ ok: true });
});

app.post('/api/auth/logout', requireSameOrigin, (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.post('/api/cards/apply', requireSameOrigin, requireApiAuth, (req, res) => {
  const product = typeof req.body?.product === 'string' ? req.body.product.trim() : '';
  const network = typeof req.body?.network === 'string' ? req.body.network.trim() : '';
  const cardName = typeof req.body?.cardName === 'string' ? req.body.cardName.trim() : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const billingAddress1 = typeof req.body?.billingAddress1 === 'string' ? req.body.billingAddress1.trim() : '';
  const billingAddress2 = typeof req.body?.billingAddress2 === 'string' ? req.body.billingAddress2.trim() : '';
  const city = typeof req.body?.city === 'string' ? req.body.city.trim() : '';
  const state = typeof req.body?.state === 'string' ? req.body.state.trim() : '';
  const postalCode = typeof req.body?.postalCode === 'string' ? req.body.postalCode.trim() : '';
  const country = typeof req.body?.country === 'string' ? req.body.country.trim() : '';
  const delivery = typeof req.body?.delivery === 'string' ? req.body.delivery.trim() : '';
  const spendingLimit = typeof req.body?.spendingLimit === 'number' ? req.body.spendingLimit : Number(req.body?.spendingLimit);
  const fees = typeof req.body?.fees === 'object' && req.body.fees ? req.body.fees : null;
  const acceptFees = Boolean(req.body?.acceptFees);

  const allowedProducts = new Set(['virtual', 'debit_standard', 'credit_platinum', 'business_debit']);
  const allowedNetworks = new Set(['visa', 'mastercard', 'amex']);
  const allowedDelivery = new Set(['digital', 'standard_mail', 'express']);

  if (
    !allowedProducts.has(product) ||
    !allowedNetworks.has(network) ||
    !cardName ||
    !phone ||
    !email ||
    !billingAddress1 ||
    !city ||
    !state ||
    !postalCode ||
    !country ||
    !allowedDelivery.has(delivery) ||
    !Number.isFinite(spendingLimit) ||
    spendingLimit <= 0 ||
    spendingLimit > 25000 ||
    !acceptFees
  ) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const feeTable = {
    virtual: { issuanceFeeUsd: 2, monthlyFeeUsd: 0, deliveryFeeUsd: 0 },
    debit_standard: { issuanceFeeUsd: 10, monthlyFeeUsd: 2, deliveryFeeUsd: delivery === 'express' ? 25 : delivery === 'standard_mail' ? 5 : 0 },
    credit_platinum: { issuanceFeeUsd: 25, monthlyFeeUsd: 5, deliveryFeeUsd: delivery === 'express' ? 25 : delivery === 'standard_mail' ? 5 : 0 },
    business_debit: { issuanceFeeUsd: 15, monthlyFeeUsd: 3, deliveryFeeUsd: delivery === 'express' ? 25 : delivery === 'standard_mail' ? 5 : 0 },
  };

  const computedFees = feeTable[product];
  const clientFeesOk =
    fees &&
    Number(fees.issuanceFeeUsd) === computedFees.issuanceFeeUsd &&
    Number(fees.monthlyFeeUsd) === computedFees.monthlyFeeUsd &&
    Number(fees.deliveryFeeUsd) === computedFees.deliveryFeeUsd;

  if (!clientFeesOk) {
    res.status(400).json({ error: 'fee_mismatch' });
    return;
  }

  const id = nanoid();
  const payload = {
    userId: req.session.userId,
    product,
    network,
    cardName,
    phone,
    email,
    billingAddress1,
    billingAddress2,
    city,
    state,
    postalCode,
    country,
    delivery,
    spendingLimit,
    fees: computedFees,
  };

  db.prepare('INSERT INTO applications (id, type, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    'card_application',
    JSON.stringify(payload),
    'received',
    new Date().toISOString()
  );

  res.json({ ok: true, applicationId: id });
});

app.post('/api/grants/apply', requireSameOrigin, requireApiAuth, (req, res) => {
  const applicantType = typeof req.body?.applicantType === 'string' ? req.body.applicantType.trim() : '';
  const program = typeof req.body?.program === 'string' ? req.body.program.trim() : '';
  const requestedAmount = typeof req.body?.requestedAmount === 'number' ? req.body.requestedAmount : Number(req.body?.requestedAmount);

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';

  const allowedTypes = new Set(['individual', 'company']);
  if (!allowedTypes.has(applicantType) || !program || !Number.isFinite(requestedAmount) || requestedAmount <= 0 || !email || !phone) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  if (applicantType === 'individual') {
    const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
    const dob = typeof req.body?.dob === 'string' ? req.body.dob.trim() : '';
    const ssnLast4 = typeof req.body?.ssnLast4 === 'string' ? req.body.ssnLast4.trim() : '';
    const address1 = typeof req.body?.address1 === 'string' ? req.body.address1.trim() : '';
    const address2 = typeof req.body?.address2 === 'string' ? req.body.address2.trim() : '';
    const city = typeof req.body?.city === 'string' ? req.body.city.trim() : '';
    const state = typeof req.body?.state === 'string' ? req.body.state.trim() : '';
    const postalCode = typeof req.body?.postalCode === 'string' ? req.body.postalCode.trim() : '';
    const country = typeof req.body?.country === 'string' ? req.body.country.trim() : '';
    const useOfFunds = typeof req.body?.useOfFunds === 'string' ? req.body.useOfFunds.trim() : '';
    const timeline = typeof req.body?.timeline === 'string' ? req.body.timeline.trim() : '';
    const payoutMethod = typeof req.body?.payoutMethod === 'string' ? req.body.payoutMethod.trim() : '';
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
    const declarationsOk = Boolean(req.body?.declarationsOk);

    if (
      !fullName ||
      !dob ||
      !address1 ||
      !city ||
      !state ||
      !postalCode ||
      !country ||
      !useOfFunds ||
      !timeline ||
      !payoutMethod ||
      !declarationsOk
    ) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }

    const id = nanoid();
    const payload = {
      userId: req.session.userId,
      applicantType,
      program,
      requestedAmountUsd: requestedAmount,
      fullName,
      dob,
      ssnLast4,
      email,
      phone,
      address1,
      address2,
      city,
      state,
      postalCode,
      country,
      useOfFunds,
      timeline,
      payoutMethod,
      notes,
    };

    db.prepare('INSERT INTO applications (id, type, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?)').run(
      id,
      'grant_application',
      JSON.stringify(payload),
      'received',
      new Date().toISOString()
    );

    res.json({ ok: true, applicationId: id });
    return;
  }

  const companyName = typeof req.body?.companyName === 'string' ? req.body.companyName.trim() : '';
  const ein = typeof req.body?.ein === 'string' ? req.body.ein.trim() : '';
  const registrationNumber = typeof req.body?.registrationNumber === 'string' ? req.body.registrationNumber.trim() : '';
  const establishedDate = typeof req.body?.establishedDate === 'string' ? req.body.establishedDate.trim() : '';
  const industry = typeof req.body?.industry === 'string' ? req.body.industry.trim() : '';
  const website = typeof req.body?.website === 'string' ? req.body.website.trim() : '';
  const contactName = typeof req.body?.contactName === 'string' ? req.body.contactName.trim() : '';
  const contactTitle = typeof req.body?.contactTitle === 'string' ? req.body.contactTitle.trim() : '';
  const employees = typeof req.body?.employees === 'number' ? req.body.employees : Number(req.body?.employees);
  const annualRevenue = typeof req.body?.annualRevenue === 'string' ? req.body.annualRevenue.trim() : '';
  const address1 = typeof req.body?.address1 === 'string' ? req.body.address1.trim() : '';
  const address2 = typeof req.body?.address2 === 'string' ? req.body.address2.trim() : '';
  const city = typeof req.body?.city === 'string' ? req.body.city.trim() : '';
  const state = typeof req.body?.state === 'string' ? req.body.state.trim() : '';
  const postalCode = typeof req.body?.postalCode === 'string' ? req.body.postalCode.trim() : '';
  const country = typeof req.body?.country === 'string' ? req.body.country.trim() : '';
  const useOfFunds = typeof req.body?.useOfFunds === 'string' ? req.body.useOfFunds.trim() : '';
  const mission = typeof req.body?.mission === 'string' ? req.body.mission.trim() : '';
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
  const declarationsOk = Boolean(req.body?.declarationsOk);

  if (
    !companyName ||
    !ein ||
    !registrationNumber ||
    !establishedDate ||
    !industry ||
    !contactName ||
    !contactTitle ||
    !Number.isFinite(employees) ||
    employees < 0 ||
    !annualRevenue ||
    !address1 ||
    !city ||
    !state ||
    !postalCode ||
    !country ||
    !useOfFunds ||
    !mission ||
    !declarationsOk
  ) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const id = nanoid();
  const payload = {
    userId: req.session.userId,
    applicantType,
    program,
    requestedAmountUsd: requestedAmount,
    companyName,
    ein,
    registrationNumber,
    establishedDate,
    industry,
    website,
    contactName,
    contactTitle,
    email,
    phone,
    employees,
    annualRevenue,
    address1,
    address2,
    city,
    state,
    postalCode,
    country,
    useOfFunds,
    mission,
    notes,
  };

  db.prepare('INSERT INTO applications (id, type, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    'grant_application',
    JSON.stringify(payload),
    'received',
    new Date().toISOString()
  );

  res.json({ ok: true, applicationId: id });
});

app.get('/api/me', requireApiAuth, (req, res) => {
  const row = db.prepare('SELECT id, email, full_name FROM users WHERE id = ?').get(req.session.userId);
  if (!row) {
    req.session = null;
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  res.json({ id: row.id, email: row.email, fullName: row.full_name });
});

app.post('/api/applications/open-account', requireSameOrigin, (req, res) => {
  const firstName = typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : '';
  const lastName = typeof req.body?.lastName === 'string' ? req.body.lastName.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const accountType = typeof req.body?.accountType === 'string' ? req.body.accountType.trim() : '';

  if (!firstName || !lastName || !email || !accountType) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const id = nanoid();
  const payload = { firstName, lastName, email, accountType };
  db.prepare(
    'INSERT INTO applications (id, type, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, 'open_account', JSON.stringify(payload), 'received', new Date().toISOString());

  res.json({ ok: true, applicationId: id });
});

app.post('/api/applications/online-banking', requireSameOrigin, (req, res) => {
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

  if (!fullName || !phone || !email) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const id = nanoid();
  const payload = { fullName, phone, email };
  db.prepare(
    'INSERT INTO applications (id, type, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, 'online_banking', JSON.stringify(payload), 'received', new Date().toISOString());

  res.json({ ok: true, applicationId: id });
});

app.post('/api/applications/card-request', requireSameOrigin, (req, res) => {
  const cardType = typeof req.body?.cardType === 'string' ? req.body.cardType.trim() : '';
  const monthlySpend = typeof req.body?.monthlySpend === 'string' ? req.body.monthlySpend.trim() : '';
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';

  if (!cardType || !fullName || !email) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const id = nanoid();
  const payload = { cardType, monthlySpend, fullName, email, notes };
  db.prepare(
    'INSERT INTO applications (id, type, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, 'card_request', JSON.stringify(payload), 'received', new Date().toISOString());

  res.json({ ok: true, applicationId: id });
});

app.post('/api/applications/grants-aid', requireSameOrigin, (req, res) => {
  const program = typeof req.body?.program === 'string' ? req.body.program.trim() : '';
  const requestedAmount = typeof req.body?.requestedAmount === 'string' ? req.body.requestedAmount.trim() : '';
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';

  if (!program || !fullName || !email) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const id = nanoid();
  const payload = { program, requestedAmount, fullName, email, notes };
  db.prepare(
    'INSERT INTO applications (id, type, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, 'grants_aid', JSON.stringify(payload), 'received', new Date().toISOString());

  res.json({ ok: true, applicationId: id });
});

app.post('/api/applications/loan', requireSameOrigin, (req, res) => {
  const loanType = typeof req.body?.loanType === 'string' ? req.body.loanType.trim() : '';
  const requestedAmount = typeof req.body?.requestedAmount === 'string' ? req.body.requestedAmount.trim() : '';
  const term = typeof req.body?.term === 'string' ? req.body.term.trim() : '';
  const purpose = typeof req.body?.purpose === 'string' ? req.body.purpose.trim() : '';
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const details = typeof req.body?.details === 'string' ? req.body.details.trim() : '';

  if (!loanType || !requestedAmount || !term || !fullName || !email) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const id = nanoid();
  const payload = { loanType, requestedAmount, term, purpose, fullName, email, details };
  db.prepare(
    'INSERT INTO applications (id, type, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, 'loan', JSON.stringify(payload), 'received', new Date().toISOString());

  res.json({ ok: true, applicationId: id });
});

app.post('/api/applications/tax-refund-status', requireSameOrigin, (req, res) => {
  const taxYear = typeof req.body?.taxYear === 'string' ? req.body.taxYear.trim() : '';
  const filingStatus = typeof req.body?.filingStatus === 'string' ? req.body.filingStatus.trim() : '';
  const refundAmount = typeof req.body?.refundAmount === 'string' ? req.body.refundAmount.trim() : '';
  const last4 = typeof req.body?.last4 === 'string' ? req.body.last4.trim() : '';
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';

  if (!taxYear || !filingStatus || !last4) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const id = nanoid();
  const payload = { taxYear, filingStatus, refundAmount, last4, notes };
  db.prepare(
    'INSERT INTO applications (id, type, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, 'tax_refund_status', JSON.stringify(payload), 'received', new Date().toISOString());

  res.json({ ok: true, applicationId: id });
});

app.post('/api/applications/personal-account', requireSameOrigin, (req, res) => {
  const accountType = typeof req.body?.accountType === 'string' ? req.body.accountType.trim() : '';
  const branchCity = typeof req.body?.branchCity === 'string' ? req.body.branchCity.trim() : '';
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';

  if (!accountType || !fullName || !email) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const id = nanoid();
  const payload = { accountType, branchCity, fullName, email, notes };
  db.prepare(
    'INSERT INTO applications (id, type, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, 'personal_account', JSON.stringify(payload), 'received', new Date().toISOString());

  res.json({ ok: true, applicationId: id });
});

app.post('/api/applications/business-sales', requireSameOrigin, (req, res) => {
  const companyName = typeof req.body?.companyName === 'string' ? req.body.companyName.trim() : '';
  const industry = typeof req.body?.industry === 'string' ? req.body.industry.trim() : '';
  const contactName = typeof req.body?.contactName === 'string' ? req.body.contactName.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const help = typeof req.body?.help === 'string' ? req.body.help.trim() : '';

  if (!companyName || !contactName || !email) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const id = nanoid();
  const payload = { companyName, industry, contactName, email, help };
  db.prepare(
    'INSERT INTO applications (id, type, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, 'business_sales', JSON.stringify(payload), 'received', new Date().toISOString());

  res.json({ ok: true, applicationId: id });
});

app.get('/api/transactions', requireApiAuth, (req, res) => {
  const rows = db
    .prepare(
      'SELECT id, kind, description, amount_cents, currency, status, created_at, meta_json FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
    )
    .all(req.session.userId);

  res.json(
    rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      description: r.description,
      amountCents: r.amount_cents,
      currency: r.currency,
      status: r.status,
      createdAt: r.created_at,
      meta: JSON.parse(r.meta_json),
    })
  );
});

app.post('/api/transfers/local', requireSameOrigin, requireApiAuth, (req, res) => {
  const beneficiaryName = typeof req.body?.beneficiaryName === 'string' ? req.body.beneficiaryName.trim() : '';
  const bankName = typeof req.body?.bankName === 'string' ? req.body.bankName.trim() : '';
  const accountNumber = typeof req.body?.accountNumber === 'string' ? req.body.accountNumber.trim() : '';
  const amount = typeof req.body?.amount === 'number' ? req.body.amount : Number(req.body?.amount);
  const narration = typeof req.body?.narration === 'string' ? req.body.narration.trim() : '';

  if (!beneficiaryName || !bankName || !accountNumber || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const id = nanoid();
  const now = new Date().toISOString();
  const amountCents = Math.round(amount * 100);
  const description = `Local transfer to ${beneficiaryName}`;
  const meta = { bankName, accountNumber, narration };

  db.prepare(
    'INSERT INTO transactions (id, user_id, kind, description, amount_cents, currency, status, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.session.userId, 'transfer_local', description, -Math.abs(amountCents), 'USD', 'pending', JSON.stringify(meta), now);

  res.json({ ok: true, transactionId: id });
});

app.post('/api/transfers/international', requireSameOrigin, requireApiAuth, (req, res) => {
  const beneficiaryName = typeof req.body?.beneficiaryName === 'string' ? req.body.beneficiaryName.trim() : '';
  const country = typeof req.body?.country === 'string' ? req.body.country.trim() : '';
  const iban = typeof req.body?.iban === 'string' ? req.body.iban.trim() : '';
  const swift = typeof req.body?.swift === 'string' ? req.body.swift.trim() : '';
  const bankName = typeof req.body?.bankName === 'string' ? req.body.bankName.trim() : '';
  const amount = typeof req.body?.amount === 'number' ? req.body.amount : Number(req.body?.amount);
  const purpose = typeof req.body?.purpose === 'string' ? req.body.purpose.trim() : '';

  if (!beneficiaryName || !country || !iban || !swift || !bankName || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const id = nanoid();
  const now = new Date().toISOString();
  const amountCents = Math.round(amount * 100);
  const description = `International transfer to ${beneficiaryName}`;
  const meta = { country, iban, swift, bankName, purpose };

  db.prepare(
    'INSERT INTO transactions (id, user_id, kind, description, amount_cents, currency, status, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.session.userId, 'transfer_international', description, -Math.abs(amountCents), 'USD', 'pending', JSON.stringify(meta), now);

  res.json({ ok: true, transactionId: id });
});

// Admin API Endpoints
app.get('/api/admin/users', requireSameOrigin, requireApiAuth, (req, res) => {
  // For demo, we'll allow any authenticated user to access admin features
  const rows = db.prepare('SELECT id, email, full_name, balance_cents, is_verified, is_active, created_at FROM users ORDER BY created_at DESC').all();
  res.json(rows.map(r => ({
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    balanceCents: r.balance_cents,
    isVerified: Boolean(r.is_verified),
    isActive: Boolean(r.is_active),
    createdAt: r.created_at
  })));
});

app.put('/api/admin/users/:id', requireSameOrigin, requireApiAuth, (req, res) => {
  const id = req.params.id;
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const balanceCents = typeof req.body?.balanceCents === 'number' ? req.body.balanceCents : null;
  const isVerified = typeof req.body?.isVerified === 'boolean' ? req.body.isVerified : null;
  const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : null;

  const updates = [];
  const params = [];

  if (fullName) {
    updates.push('full_name = ?');
    params.push(fullName);
  }
  if (email) {
    updates.push('email = ?');
    params.push(email);
  }
  if (balanceCents !== null) {
    updates.push('balance_cents = ?');
    params.push(balanceCents);
  }
  if (isVerified !== null) {
    updates.push('is_verified = ?');
    params.push(isVerified ? 1 : 0);
  }
  if (isActive !== null) {
    updates.push('is_active = ?');
    params.push(isActive ? 1 : 0);
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'no_updates' });
    return;
  }

  params.push(id);

  const stmt = db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...params);

  // Log admin action
  const logId = nanoid();
  db.prepare('INSERT INTO admin_logs (id, admin_id, action, target_type, target_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    logId,
    req.session.userId,
    'update_user',
    'user',
    id,
    JSON.stringify(req.body),
    new Date().toISOString()
  );

  res.json({ ok: true });
});

app.get('/api/admin/applications', requireSameOrigin, requireApiAuth, (req, res) => {
  const rows = db.prepare('SELECT id, type, payload_json, status, admin_notes, created_at FROM applications ORDER BY created_at DESC').all();
  res.json(rows.map(r => ({
    id: r.id,
    type: r.type,
    payload: JSON.parse(r.payload_json),
    status: r.status,
    adminNotes: r.admin_notes,
    createdAt: r.created_at
  })));
});

app.put('/api/admin/applications/:id', requireSameOrigin, requireApiAuth, (req, res) => {
  const id = req.params.id;
  const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
  const adminNotes = typeof req.body?.adminNotes === 'string' ? req.body.adminNotes.trim() : null;

  if (!status) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const updates = ['status = ?'];
  const params = [status];

  if (adminNotes !== null) {
    updates.push('admin_notes = ?');
    params.push(adminNotes);
  }

  params.push(id);

  const stmt = db.prepare(`UPDATE applications SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...params);

  res.json({ ok: true });
});

app.get('/api/admin/transactions', requireSameOrigin, requireApiAuth, (req, res) => {
  const rows = db.prepare('SELECT t.*, u.full_name FROM transactions t JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC LIMIT 100').all();
  res.json(rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    userFullName: r.full_name,
    kind: r.kind,
    description: r.description,
    amountCents: r.amount_cents,
    currency: r.currency,
    status: r.status,
    transferCode: r.transfer_code,
    meta: JSON.parse(r.meta_json),
    createdAt: r.created_at
  })));
});

app.put('/api/admin/transactions/:id', requireSameOrigin, requireApiAuth, (req, res) => {
  const id = req.params.id;
  const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
  const transferCode = typeof req.body?.transferCode === 'string' ? req.body.transferCode.trim() : null;

  if (!status) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const updates = ['status = ?'];
  const params = [status];

  if (transferCode !== null) {
    updates.push('transfer_code = ?');
    params.push(transferCode);
  }

  params.push(id);

  const stmt = db.prepare(`UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...params);

  // If we're approving a transfer, update user balance
  if (status === 'completed') {
    const tx = db.prepare('SELECT user_id, amount_cents FROM transactions WHERE id = ?').get(id);
    if (tx) {
      // Debit the user's balance (since amount_cents is negative for outgoing transfers)
      db.prepare('UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?').run(tx.amount_cents, tx.user_id);
    }
  }

  res.json({ ok: true });
});

app.use(
  ['/dashboard.html', '/dashboard-transactions.html', '/dashboard-cards.html', '/dashboard-local-transfer.html', '/dashboard-international-transfer.html', '/dashboard-deposit.html', '/dashboard-currency-swap.html', '/dashboard-grants.html', '/dashboard-settings.html', '/dashboard-support.html', '/admin.html'],
  requireAuth
);

app.use(express.static(__dirname, { extensions: ['html'] }));

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  process.stdout.write(`Server running on http://localhost:${PORT}\n`);
});
