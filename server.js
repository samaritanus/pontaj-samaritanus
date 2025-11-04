const express = require('express');
const cors = require('cors');
const fs = require('fs');
const http = require('http');
const https = require('https');
const app = express();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const PORT = 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
// Serve assets (logos, images) from /assets URL
app.use('/assets', express.static(__dirname + '/assets'));

const PONTAJE_FILE = 'pontaje.json';
const USERS_FILE = __dirname + '/assets/users.json';
const AVANS_FILE = 'avansuri.json';

function loadPontaje() {
  if (!fs.existsSync(PONTAJE_FILE)) return [];
  return JSON.parse(fs.readFileSync(PONTAJE_FILE));
}
function savePontaje(pontaje) {
  fs.writeFileSync(PONTAJE_FILE, JSON.stringify(pontaje, null, 2));
}

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    const raw = fs.readFileSync(USERS_FILE);
    const list = JSON.parse(raw);
    if (Array.isArray(list)) return list;
    return [];
  } catch (e) {
    console.warn('Nu pot citi users.json:', e.message);
    return [];
  }
}
function saveUsers(users){
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
function buildUserIndex(users){
  const byEmail = new Map();
  const byName = new Map();
  const byNameNorm = new Map();
  const norm = (s)=> String(s||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ')
    .trim();
  users.forEach(u=>{
    if (u.email) byEmail.set(String(u.email).toLowerCase(), u);
    if (u.name) byName.set(String(u.name).toLowerCase(), u);
    if (u.name) byNameNorm.set(norm(u.name), u);
  });
  return { byEmail, byName, byNameNorm, norm };
}

function issueToken(user){
  const payload = { email: user.email || '', name: user.name || '' };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next){
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if(!m) return res.status(401).json({ error: 'Necesită autentificare' });
  try{
    const payload = jwt.verify(m[1], JWT_SECRET);
    req.auth = payload; // { email, name }
    next();
  }catch(e){
    return res.status(401).json({ error: 'Token invalid sau expirat' });
  }
}

function optionalAuth(req, _res, next){
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if(m){
    try{ req.auth = jwt.verify(m[1], JWT_SECRET); }catch{ /* ignore */ }
  }
  next();
}

function loadAvansuri(){
  try{
    if (!fs.existsSync(AVANS_FILE)) return [];
    return JSON.parse(fs.readFileSync(AVANS_FILE));
  }catch(e){ console.warn('Nu pot citi avansuri:', e.message); return []; }
}
function saveAvansuri(arr){ fs.writeFileSync(AVANS_FILE, JSON.stringify(arr, null, 2)); }

async function fetchUrl(u){
  return new Promise((resolve, reject) => {
    try{
      const client = u.startsWith('https') ? https : http;
      const req = client.get(u, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // follow redirect
          fetchUrl(res.headers.location).then(resolve, reject);
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode || 0, body: data, headers: res.headers }));
      });
      req.on('error', reject);
    }catch(e){ reject(e); }
  });
}

function normalizeHeader(h){
  return String(h||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // remove diacritics
    .replace(/\s+/g,' ')
    .trim();
}
function parseUsersCSV(csv){
  const lines = String(csv).split(/\r?\n/).filter(l=>l!=null);
  // keep empty strings to preserve columns count; we'll trim later per cell
  if (!lines.length) return [];
  const first = lines[0];
  const sep = first.includes(';') && !first.includes(',') ? ';' : ','; // allow ; as separator if no commas
  const cells = first.split(sep).map(c=>c.trim());
  const headers = cells.map(normalizeHeader);
  const hasHeader = headers.some(h=>['name','nume','email','rol','role','max ore suplimentare','maxim ore suplimentare','maxim de ore suplimentare','tarif orar','tariful orar','suma pe ora','suma ora','hourly rate','overtime max'].includes(h));

  const rows = hasHeader ? lines.slice(1) : lines;
  let idx = { name: 0, email: 1, role: -1, maxOvertime: -1, hourlyRate: -1, tariff: -1 };
  if (hasHeader){
    headers.forEach((h,i)=>{
      if (['name','nume'].includes(h)) idx.name = i;
      if (['email','mail','e-mail'].includes(h)) idx.email = i;
      if (['rol','role','functie','funcție'].includes(h)) idx.role = i;
      if (['max ore suplimentare','maxim ore suplimentare','maxim de ore suplimentare','overtime max'].includes(h)) idx.maxOvertime = i;
      if (['tarif orar','tariful orar','hourly rate'].includes(h)) idx.hourlyRate = i;
      if (['suma pe ora','suma ora','plata pe ora','platit pe ora'].includes(h)) idx.tariff = i; // alt sinonim; îl păstrăm separat dacă apare
    });
  }
  const users = rows.map(line=>{
    const parts = line.split(sep).map(c=>String(c||'').trim());
    const get = (i)=> i>=0 && i<parts.length ? parts[i] : '';
    const name = get(idx.name);
    const email = get(idx.email);
    const role = idx.role>=0 ? get(idx.role) : '';
    const maxOvertime = idx.maxOvertime>=0 ? Number(get(idx.maxOvertime).replace(',','.')) : undefined;
    const hourlyRate = idx.hourlyRate>=0 ? Number(get(idx.hourlyRate).replace(',','.')) : undefined;
    const tariff = idx.tariff>=0 ? Number(get(idx.tariff).replace(',','.')) : undefined;
    return { name, email, role, maxOvertime, hourlyRate, tariff };
  }).filter(u=> (u.name||u.email));
  return users;
}

// Endpoint pentru listare pontaje
app.get('/api/pontaje', optionalAuth, (req, res) => {
  const pontaje = loadPontaje();
  if (req.auth){
    const meEmail = (req.auth?.email||'').toLowerCase();
    const meName = (req.auth?.name||'').toLowerCase();
    const mine = pontaje.filter(e =>
      (e.email && String(e.email).toLowerCase() === meEmail) ||
      (e.user && String(e.user).toLowerCase() === meName)
    );
    return res.json(mine);
  }
  res.json(pontaje);
});

// Lista utilizatori (dacă există)
app.get('/api/users', (req, res) => {
  const users = loadUsers();
  res.json(users);
});

// Avansuri: listare și adăugare
// GET /api/avansuri?email=...&name=...&month=YYYY-MM
app.get('/api/avansuri', optionalAuth, (req, res) => {
  const { month } = req.query || {};
  const meEmail = (req.query.email || req.auth?.email || '').toString().toLowerCase();
  const meName = (req.query.name || req.auth?.name || '').toString().toLowerCase();
  const list = loadAvansuri();
  const filt = list.filter(a => {
    const aEmail = String(a.email||'').toLowerCase();
    const aUser = String(a.user||'').toLowerCase();
    if (meEmail && aEmail !== meEmail) return false;
    if (!meEmail && meName && aUser !== meName) return false;
    if (month && a.month !== month) return false;
    return true;
  });
  res.json(filt);
});

// POST /api/avans { email|user, month: 'YYYY-MM', suma }
app.post('/api/avans', optionalAuth, (req, res) => {
  try{
    const { month, suma, email, user } = req.body || {};
    if (!month || !/\d{4}-\d{2}/.test(String(month))) return res.status(400).json({ error: 'Lipseste month (YYYY-MM)' });
    const users = loadUsers();
    const idx = buildUserIndex(users);
    const meEmail = (req.auth?.email||'').toLowerCase();
    let found = (meEmail && idx.byEmail.get(meEmail)) || null;
    if (!found && email && idx.byEmail.has(String(email).toLowerCase())) found = idx.byEmail.get(String(email).toLowerCase());
    if (!found && user){
      const nm = String(user).trim();
      found = idx.byName.get(nm.toLowerCase()) || idx.byNameNorm.get(idx.norm(nm));
    }
    if (!found && users.length>0) return res.status(400).json({ error: 'Utilizator necunoscut pentru avans' });
    const entry = {
      user: found?.name || req.auth?.name || (user||''),
      email: found?.email || req.auth?.email || (email||''),
      month: String(month),
      suma: Number(String(suma||0).replace(',','.')) || 0,
      createdAt: new Date().toISOString(),
    };
    const list = loadAvansuri();
    list.push(entry);
    saveAvansuri(list);
    res.json({ success:true, avans: entry });
  }catch(e){ console.error('Eroare POST /api/avans', e); res.status(500).json({ error: 'Eroare server' }); }
});

// Import utilizatori: primește un array de obiecte { name, email }
app.post('/api/users', (req, res) => {
  try {
    const body = req.body;
    if (!Array.isArray(body)){
      return res.status(400).json({ error: 'Trimite un array de utilizatori' });
    }
    const cleaned = body
      .filter(u => u && (u.name || u.email))
      .map(u => ({
        name: (u.name||'').toString().trim(),
        email: (u.email||'').toString().trim(),
        role: (u.role||u.rol||'').toString().trim(),
        maxOvertime: u.maxOvertime!=null ? Number(String(u.maxOvertime).replace(',','.')) : (u.max_ore_suplimentare!=null ? Number(String(u.max_ore_suplimentare).replace(',','.')) : undefined),
        hourlyRate: u.hourlyRate!=null ? Number(String(u.hourlyRate).replace(',','.')) : (u.tarifOrar!=null ? Number(String(u.tarifOrar).replace(',','.')) : undefined),
        tariff: u.tariff!=null ? Number(String(u.tariff).replace(',','.')) : (u.sumaOra!=null ? Number(String(u.sumaOra).replace(',','.')) : undefined)
      }));
    if (!cleaned.length){
      return res.status(400).json({ error: 'Lista este goală după validare' });
    }
  saveUsers(cleaned);
    console.log(`Import utilizatori: ${cleaned.length} înregistrări`);
    return res.json({ success: true, count: cleaned.length });
  } catch (e){
    console.error('Eroare import utilizatori:', e);
    return res.status(500).json({ error: 'Eroare la salvarea utilizatorilor' });
  }
});

// Import direct din Google Sheets (CSV export)
// Body: { url: 'https://docs.google.com/spreadsheets/d/<ID>/edit#gid=<GID>' }
app.post('/api/users/import-gsheet', async (req, res) => {
  try{
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Lipsește url' });
    const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const gidMatch = url.match(/[?&#]gid=(\d+)/);
    const sheetId = idMatch ? idMatch[1] : null;
    const gid = gidMatch ? gidMatch[1] : '0';
    if (!sheetId) return res.status(400).json({ error: 'URL Google Sheets invalid' });
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const resp = await fetchUrl(csvUrl);
    if (!resp || resp.status !== 200) return res.status(502).json({ error: 'Nu pot descărca CSV din Google Sheets' });
    const users = parseUsersCSV(resp.body);
    if (!users.length) return res.status(400).json({ error: 'CSV gol sau fără coloane name/email' });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    console.log(`Import Google Sheets: ${users.length} utilizatori`);
    res.json({ success: true, count: users.length });
  }catch(e){
    console.error('Eroare import-gsheet:', e);
    res.status(500).json({ error: 'Eroare import din Google Sheets' });
  }
});

// Adăugare/actualizare utilizator (upsert după email sau name)
app.post('/api/user', (req, res) => {
  try{
    const { name, email, role, maxOvertime, hourlyRate, tariff } = req.body || {};
    const nm = (name||'').toString().trim();
    const em = (email||'').toString().trim();
    if (!nm && !em) return res.status(400).json({ error: 'Lipsește name sau email' });
    const users = loadUsers();
    let idx = -1;
    if (em) idx = users.findIndex(u => (u.email||'').toLowerCase() === em.toLowerCase());
    if (idx<0 && nm) idx = users.findIndex(u => (u.name||'').toLowerCase() === nm.toLowerCase());
    const entry = {
      name: nm,
      email: em,
      role: (role||'').toString().trim(),
      maxOvertime: maxOvertime!=null && maxOvertime!=='' ? Number(String(maxOvertime).replace(',','.')) : undefined,
      hourlyRate: hourlyRate!=null && hourlyRate!=='' ? Number(String(hourlyRate).replace(',','.')) : undefined,
      tariff: tariff!=null && tariff!=='' ? Number(String(tariff).replace(',','.')) : undefined,
    };
    if (idx>=0) users[idx] = { ...users[idx], ...entry };
    else users.push(entry);
    saveUsers(users);
    return res.json({ success:true, user: entry });
  }catch(e){
    console.error('Eroare upsert utilizator:', e);
    return res.status(500).json({ error: 'Eroare upsert utilizator' });
  }
});

// Ștergere utilizator după email sau nume
app.delete('/api/user', (req, res) => {
  try{
    const email = (req.query.email || req.body?.email || '').toString().trim();
    const name = (req.query.name || req.body?.name || '').toString().trim();
    if (!email && !name) return res.status(400).json({ error: 'Specificați email sau name' });
    const users = loadUsers();
    const filtered = users.filter(u => {
      const matchEmail = email && (u.email||'').toLowerCase() === email.toLowerCase();
      const matchName = name && (u.name||'').toLowerCase() === name.toLowerCase();
      return !(matchEmail || matchName);
    });
    if (filtered.length === users.length) return res.status(404).json({ error: 'Utilizator inexistent' });
    saveUsers(filtered);
    return res.json({ success:true });
  }catch(e){
    console.error('Eroare ștergere utilizator:', e);
    return res.status(500).json({ error: 'Eroare ștergere utilizator' });
  }
});

// Healthcheck simplu
app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Auth endpoints (web-only)
// Register a user: { name, email, password }
app.post('/api/auth/register', (req, res) => {
  try{
    const { name, email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email și parolă sunt obligatorii' });
    const users = loadUsers();
    const idxEmail = users.findIndex(u => (u.email||'').toLowerCase() === String(email).toLowerCase());
    const hash = bcrypt.hashSync(String(password), 10);
    if (idxEmail >= 0){
      // If exists and has password, block duplicate registration
      if (users[idxEmail].passwordHash) return res.status(409).json({ error: 'Utilizator deja înregistrat' });
      users[idxEmail] = { ...users[idxEmail], name: name || users[idxEmail].name, email, passwordHash: hash };
    } else {
      users.push({ name: name || email, email, passwordHash: hash });
    }
    saveUsers(users);
    const user = users[idxEmail >= 0 ? idxEmail : users.length-1];
    const token = issueToken(user);
    res.json({ token, user: { name: user.name, email: user.email, hourlyRate: user.hourlyRate } });
  }catch(e){
    console.error('Eroare register:', e);
    res.status(500).json({ error: 'Eroare server' });
  }
});

// Login: { email, password }
app.post('/api/auth/login', (req, res) => {
  try{
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email și parolă sunt obligatorii' });
    const users = loadUsers();
    const user = users.find(u => (u.email||'').toLowerCase() === String(email).toLowerCase());
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Credențiale invalide' });
    const ok = bcrypt.compareSync(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Credențiale invalide' });
    const token = issueToken(user);
    res.json({ token, user: { name: user.name, email: user.email, hourlyRate: user.hourlyRate } });
  }catch(e){
    console.error('Eroare login:', e);
    res.status(500).json({ error: 'Eroare server' });
  }
});

// Current user
app.get('/api/me', authMiddleware, (req, res) => {
  try{
    const users = loadUsers();
    const u = users.find(x => (x.email||'').toLowerCase() === String(req.auth?.email||'').toLowerCase());
    if (!u) return res.status(404).json({ error: 'Utilizator inexistent' });
    res.json({ name: u.name, email: u.email, hourlyRate: u.hourlyRate });
  }catch(e){ res.status(500).json({ error: 'Eroare server' }); }
});

// Endpoint de test simplu (eco) pentru depanare din mobil sau rețea
app.get('/api/ping', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.json({ ok: true, method: 'GET', ip, time: new Date().toISOString() });
});
app.post('/api/ping', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.json({ ok: true, method: 'POST', ip, time: new Date().toISOString(), body: req.body });
});

// GET informativ pentru /api/pontaj ca să clarifice că trebuie POST
app.get('/api/pontaj', (req, res) => {
  res.status(405).json({
    error: 'Folosește metoda POST pentru /api/pontaj',
    hint: {
      body: { user: 'Nume din /api/users', punct: 'DISPECERAT SAMARITANUS', action: 'sosire|plecare' }
    }
  });
});

// Endpoint pentru adăugare pontaj
app.post('/api/pontaj', optionalAuth, (req, res) => {
  const { user, username, email, punct, action, timestamp, latitude, longitude } = req.body || {};
  const users = loadUsers();
  const idx = buildUserIndex(users);

  // prefer email if present, else fallback to user/username
  const providedEmail = (req.auth?.email ? String(req.auth.email) : (email && String(email)))?.trim();
  const providedName = (req.auth?.name ? String(req.auth.name) : ((user||username) && String(user||username)))?.trim();

  let canonicalUser = null; // { name, email }
  if (providedEmail && idx.byEmail.has(providedEmail.toLowerCase())) {
    const u = idx.byEmail.get(providedEmail.toLowerCase());
    canonicalUser = { name: u.name || providedName || providedEmail, email: u.email };
  } else if (providedName && idx.byName.has(providedName.toLowerCase())) {
    const u = idx.byName.get(providedName.toLowerCase());
    canonicalUser = { name: u.name, email: u.email || providedEmail };
  } else if (providedName && idx.byNameNorm.has(idx.norm(providedName))) {
    // acceptă și variante fără diacritice/spații multiple
    const u = idx.byNameNorm.get(idx.norm(providedName));
    canonicalUser = { name: u.name, email: u.email || providedEmail };
  } else if (users.length > 0) {
    // dacă avem o listă de utilizatori definită, validăm strict
    console.warn('POST /api/pontaj - utilizator necunoscut:', { providedName, providedEmail });
    return res.status(400).json({ error: 'Utilizator necunoscut. Trimiteți email sau nume din lista configurată.' });
  } else {
    // nu avem listă -> acceptăm orice, dar păstrăm ce vine
    canonicalUser = { name: providedName || (providedEmail || ''), email: providedEmail || '' };
  }

  const finalUser = canonicalUser.name;
  const finalTimestamp = timestamp || new Date().toISOString();
  if (!finalUser || !punct || !action) {
    console.warn('POST /api/pontaj - body invalid:', req.body);
    return res.status(400).json({ error: 'Date lipsă (necesar: user/username, punct, action)' });
  }
  const punctNorm = String(punct).trim().toUpperCase();
  const entry = { user: finalUser, email: canonicalUser.email || undefined, punct: punctNorm, action, timestamp: finalTimestamp, latitude, longitude };
  const pontaje = loadPontaje();
  pontaje.push(entry);
  savePontaje(pontaje);
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log('POST /api/pontaj - salvat:', entry, 'de la', ip);
  res.json({ success: true });
});

const HOST = '0.0.0.0';
// Tiny diagnostics for unhandled errors to help when start fails
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exitCode = 1;
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exitCode = 1;
});

// Minimal endpoint for points of work consumed by mobile app
app.get('/api/puncte_lucru', (req, res) => {
  try {
    const file = __dirname + '/assets/puncte_lucru.json';
    if (!fs.existsSync(file)) return res.json([]);
    const data = JSON.parse(fs.readFileSync(file));
    if (Array.isArray(data)) return res.json(data);
    return res.json([]);
  } catch (e) {
    console.error('Eroare /api/puncte_lucru:', e);
    res.json([]);
  }
});

const server = app.listen(PORT, HOST, () => {
  const ip = process.env.LAN_IP || '192.168.1.200';
  console.log(`Server pontaj rulează pe:`);
  console.log(`- local:   http://localhost:${PORT}`);
  console.log(`- rețea:   http://${ip}:${PORT}`);
});
server.on('error', (err) => {
  console.error('Eroare la pornirea serverului (listen):', err);
  process.exit(1);
});
