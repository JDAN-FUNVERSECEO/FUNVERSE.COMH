const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createReadStream, createWriteStream, existsSync, readFileSync } = require('node:fs');
const { mkdir, readFile, rename, rm, stat, writeFile } = require('node:fs/promises');
const nodemailer = require('nodemailer');

const root = __dirname;
const localEnvironmentKeys = new Set();
function loadLocalEnvironment() {
  const filename = path.join(root, '.env');
  if (!existsSync(filename)) return;
  for (const line of readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && process.env[key] === undefined) { process.env[key] = value; localEnvironmentKeys.add(key); }
  }
}
loadLocalEnvironment();

function refreshLocalMailEnvironment() {
  const filename = path.join(root, '.env');
  if (!existsSync(filename)) return;
  const seen = new Set();
  for (const line of readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    if (!/^(?:SMTP_|MAIL_)/.test(key)) continue;
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    seen.add(key);
    if (process.env[key] === undefined || localEnvironmentKeys.has(key)) {
      process.env[key] = value;
      localEnvironmentKeys.add(key);
    }
  }
  for (const key of localEnvironmentKeys) if (/^(?:SMTP_|MAIL_)/.test(key) && !seen.has(key)) process.env[key] = '';
}

const port = Number(process.env.PORT || 3000);
const dataDir = path.resolve(process.env.FUNVERSE_DATA_DIR || path.join(root, '.data'));
const videosDir = path.join(dataDir, 'videos');
const ownerFile = path.join(dataDir, 'owner.json');
const usersFile = path.join(dataDir, 'users.json');
const reportsFile = path.join(dataDir, 'reports.json');
const socialFile = path.join(dataDir, 'social.json');
const videosFile = path.join(dataDir, 'videos.json');
const eventSettingsFile = path.join(dataDir, 'events.json');
const siteSettingsFile = path.join(dataDir, 'site-settings.json');
const twoFactorKeyFile = path.join(dataDir, 'two-factor.key');
const MAX_VIDEO_SIZE = 300 * 1024 * 1024;
const SESSION_MAX_AGE = 12 * 60 * 60;
const EVENT_EFFECTS = Object.freeze(['confetti', 'rainbow', 'big-head', 'spotlight', 'low-gravity', 'super-speed', 'giant', 'mini', 'meteor', 'bouncy', 'ufo', 'pet-parade', 'reverse-gravity', 'party-chaos', 'points-rain']);
const EVENT_MUSIC = Object.freeze(['Chasing_The_Spotlight.mp3', 'Baneo_Masivo.mp3', 'Beyond_The_Door.mp3', 'Breaking_the_Cage.mp3', 'Rewrite_the_Scene.mp3']);
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
};
const videoMime = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };
const scrypt = promisify(crypto.scrypt);
const sessions = new Map();
const loginAttempts = new Map();
let registrationBusy = false;
const pendingTwoFactorEnrollments = new Map();
const loginEmailChallenges = new Map();
let twoFactorKeyPromise = null;
const DUMMY_PASSWORD_SALT = 'funverse-local-login-check';
function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function localOrigin(origin) {
  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(hostname);
  } catch { return false; }
}

function applyApiCors(request, response) {
  const origin = request.headers.origin;
  if (origin) {
    if (!localOrigin(origin)) {
      json(response, 403, { error: 'FUNVERSE solo acepta conexiones locales.' });
      return false;
    }
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Vary', 'Origin');
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Video-Name',
      'Access-Control-Max-Age': '600',
    });
    response.end();
    return false;
  }
  return true;
}

async function readBody(request, limit = 32_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('La solicitud es demasiado grande.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('No pude leer los datos enviados.'), { status: 400 }); }
}

function readOwner() {
  try { return JSON.parse(readFileSync(ownerFile, 'utf8')); }
  catch { return null; }
}

function publicProfile(account, email) {
  return { displayName: typeof account?.displayName === 'string' && account.displayName.trim() ? account.displayName.trim().slice(0, 24) : String(email || '').split('@')[0].slice(0, 24), avatar: typeof account?.avatarData === 'string' ? account.avatarData : null };
}

function validateAvatarData(value) {
  if (value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string' || value.length > 360_000) return { ok: false };
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return { ok: false };
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 256 * 1024) return { ok: false };
  const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if ((match[1] === 'png' && !png) || (match[1] === 'jpeg' && !jpeg) || (match[1] === 'webp' && !webp)) return { ok: false };
  return { ok: true, value: `data:image/${match[1]};base64,${match[2]}` };
}

async function readUsers() {
  try {
    const users = JSON.parse(await readFile(usersFile, 'utf8'));
    return Array.isArray(users) ? users : [];
  } catch { return []; }
}

async function saveUsers(users) {
  await mkdir(dataDir, { recursive: true });
  const temporary = `${usersFile}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await writeFile(temporary, JSON.stringify(users, null, 2), { flag: 'wx' });
  await rename(temporary, usersFile);
}

function isStaff(user) {
  return Boolean(user && ['owner', 'admin'].includes(user.role));
}

async function readReports() {
  try {
    const reports = JSON.parse(await readFile(reportsFile, 'utf8'));
    return Array.isArray(reports) ? reports : [];
  } catch { return []; }
}

async function saveReports(reports) {
  await mkdir(dataDir, { recursive: true });
  const temporary = `${reportsFile}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await writeFile(temporary, JSON.stringify(reports, null, 2), { flag: 'wx' });
  await rename(temporary, reportsFile);
}

async function readSocial() {
  try {
    const social = JSON.parse(await readFile(socialFile, 'utf8'));
    return { friends: Array.isArray(social.friends) ? social.friends : [], requests: Array.isArray(social.requests) ? social.requests : [], messages: Array.isArray(social.messages) ? social.messages : [] };
  } catch { return { friends: [], requests: [], messages: [] }; }
}

async function saveSocial(social) {
  await mkdir(dataDir, { recursive: true });
  const temporary = `${socialFile}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await writeFile(temporary, JSON.stringify(social, null, 2), { flag: 'wx' });
  await rename(temporary, socialFile);
}

function publicAccountByEmail(email, owner, users) {
  if (owner?.email === email) return { ...publicProfile(owner, email), email, role: 'owner' };
  const account = users.find((item) => item.email === email);
  if (!account) return null;
  const role = ['admin', 'parent'].includes(account.role) ? account.role : 'user';
  return { ...publicProfile(account, email), email, role };
}

function areFriends(social, first, second) {
  return social.friends.some((friendship) => (friendship.userA === first && friendship.userB === second) || (friendship.userA === second && friendship.userB === first));
}

function emailNotificationsReady() {
  refreshLocalMailEnvironment();
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && (process.env.MAIL_FROM || process.env.SMTP_USER));
}

async function sendOwnerLoginNotice(ownerEmail) {
  if (!emailNotificationsReady()) return;
  const portNumber = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === undefined ? portNumber === 465 : process.env.SMTP_SECURE.toLowerCase() === 'true';
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: portNumber,
    secure,
    requireTLS: !secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 7_000,
    greetingTimeout: 7_000,
    socketTimeout: 12_000,
  });
  try {
    const recipient = process.env.MAIL_TO || ownerEmail;
    const loggedAt = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: recipient,
      subject: 'Inicio de sesión en FUNVERSE',
      text: `Se inició sesión en la cuenta propietaria de FUNVERSE.\nCuenta: ${ownerEmail}\nFecha y hora: ${loggedAt}\n\nSi no fuiste tú, cambia la contraseña desde tu cuenta de correo y revisa el acceso a esta computadora.`,
    });
    console.log('Aviso de inicio de sesión enviado por correo.');
  } catch (error) {
    console.error(`No pude enviar el aviso de inicio de sesión: ${error.message}`);
  } finally {
    transporter.close();
  }
}

async function sendLoginVerificationCode(accountEmail, code) {
  if (!emailNotificationsReady()) throw new Error('El correo de verificación todavía no está configurado. Completa SMTP en .env.');
  const portNumber = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === undefined ? portNumber === 465 : process.env.SMTP_SECURE.toLowerCase() === 'true';
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: portNumber,
    secure,
    requireTLS: !secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 7_000,
    greetingTimeout: 7_000,
    socketTimeout: 12_000,
  });
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: accountEmail,
      subject: 'Código de acceso a FUNVERSE',
      text: `Tu código de verificación de FUNVERSE es ${code}. Vence en 10 minutos. Si no intentaste iniciar sesión, ignora este mensaje. No compartas este código.`,
    });
  } finally { transporter.close(); }
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    const value = part.slice(index + 1).trim();
    try { return [part.slice(0, index).trim(), decodeURIComponent(value)]; }
    catch { return [part.slice(0, index).trim(), '']; }
  }).filter(([key]) => key));
}

function currentUser(request) {
  const token = parseCookies(request.headers.cookie).fvsid;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { email: session.email, role: session.role, token };
}

function sessionCookie(token, maxAge = SESSION_MAX_AGE) {
  return `fvsid=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

async function createSession(email, role) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { email, role, expires: Date.now() + SESSION_MAX_AGE * 1_000 });
  return token;
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64);
  return { salt, hash: Buffer.from(derived).toString('hex') };
}

async function getTwoFactorEncryptionKey() {
  if (!twoFactorKeyPromise) twoFactorKeyPromise = (async () => {
    await mkdir(dataDir, { recursive: true });
    try {
      const saved = await readFile(twoFactorKeyFile);
      if (saved.length === 32) return saved;
    } catch {}
    const generated = crypto.randomBytes(32);
    try { await writeFile(twoFactorKeyFile, generated, { flag: 'wx', mode: 0o600 }); return generated; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const saved = await readFile(twoFactorKeyFile);
      if (saved.length !== 32) throw new Error('La clave local de verificación en dos pasos no es válida.');
      return saved;
    }
  })();
  return twoFactorKeyPromise;
}

async function encryptTwoFactorSecret(secret) {
  const key = await getTwoFactorEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ciphertext.toString('base64') };
}

async function decryptTwoFactorSecret(encrypted) {
  if (!encrypted || typeof encrypted.iv !== 'string' || typeof encrypted.tag !== 'string' || typeof encrypted.data !== 'string') return '';
  const key = await getTwoFactorEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted.data, 'base64')), decipher.final()]).toString('utf8');
}

function createTotpSecret() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0; let value = 0; let result = '';
  for (const byte of crypto.randomBytes(20)) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0; let buffer = 0; const bytes = [];
  for (const character of String(value).toUpperCase().replace(/=+$/g, '')) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error('La clave de verificación no es válida.');
    buffer = (buffer << 5) | digit; bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >>> bits) & 255); }
  }
  return Buffer.from(bytes);
}

function verifyTotp(secret, submittedCode, timestamp = Date.now()) {
  const code = String(submittedCode || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) return false;
  const key = decodeBase32(secret);
  const step = Math.floor(timestamp / 30_000);
  for (let offset = -1; offset <= 1; offset += 1) {
    const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step + offset));
    const digest = crypto.createHmac('sha1', key).update(counter).digest();
    const index = digest[digest.length - 1] & 0x0f;
    const binary = digest.readUInt32BE(index) & 0x7fffffff;
    const expected = Buffer.from(String(binary % 1_000_000).padStart(6, '0'));
    if (crypto.timingSafeEqual(expected, Buffer.from(code))) return true;
  }
  return false;
}

async function loadAccountForUser(user) {
  const owner = readOwner();
  if (user.role === 'owner') return { kind: 'owner', account: owner?.email === user.email ? owner : null };
  const users = await readUsers();
  return { kind: 'user', account: users.find((account) => account.email === user.email) || null, users };
}

async function saveAccountForUser(user, account, users) {
  if (user.role === 'owner') {
    const temporary = `${ownerFile}.${crypto.randomBytes(5).toString('hex')}.tmp`;
    await writeFile(temporary, JSON.stringify(account, null, 2), { flag: 'wx' });
    await rename(temporary, ownerFile);
    return;
  }
  const index = users.findIndex((item) => item.email === user.email);
  if (index < 0) throw new Error('No encontré tu cuenta.');
  users[index] = account;
  await saveUsers(users);
}

async function authApi(request, response, pathname) {
  if (pathname === '/api/auth/status' && request.method === 'GET') {
    const owner = readOwner();
    const user = currentUser(request);
    let profile = null;
    if (user?.role === 'owner') profile = publicProfile(owner, user.email);
    else if (user) profile = publicProfile((await readUsers()).find((account) => account.email === user.email), user.email);
    return json(response, 200, {
      setupRequired: !owner,
      signedIn: Boolean(user),
      email: user?.email || null,
      role: user?.role || null,
      displayName: profile?.displayName || null,
      avatar: profile?.avatar || null,
      emailNotificationsReady: emailNotificationsReady(),
    });
  }
  if (pathname === '/api/auth/progress') {
    const user = currentUser(request);
    if (!user) return json(response, 401, { error: 'Inicia sesión para sincronizar tu progreso.' });
    const loaded = await loadAccountForUser(user);
    if (!loaded.account) return json(response, 401, { error: 'No encontré tu cuenta.' });
    const initialized = Number.isSafeInteger(loaded.account.progress?.xp);
    const currentXp = initialized ? loaded.account.progress.xp : 0;
    if (request.method === 'GET') return json(response, 200, { xp: currentXp, initialized });
    if (request.method !== 'POST') return json(response, 405, { error: 'Usa GET o POST para consultar el progreso.' });
    let body;
    try { body = await readBody(request); }
    catch (error) { return json(response, error.status || 400, { error: error.message }); }
    const submittedXp = Number(body?.xp);
    if (!Number.isSafeInteger(submittedXp) || submittedXp < 0 || submittedXp > 1_000_000) return json(response, 400, { error: 'El XP debe ser un número entero de 0 a 1,000,000.' });
    loaded.account.progress = loaded.account.progress && typeof loaded.account.progress === 'object' ? loaded.account.progress : {};
    loaded.account.progress.xp = Math.max(currentXp, submittedXp);
    loaded.account.progress.updatedAt = new Date().toISOString();
    await saveAccountForUser(user, loaded.account, loaded.users);
    return json(response, 200, { xp: loaded.account.progress.xp });
  }
  if (pathname === '/api/auth/profile' && request.method === 'POST') {
    const user = currentUser(request);
    if (!user) return json(response, 401, { error: 'Inicia sesión para editar tu perfil.' });
    let body;
    try { body = await readBody(request); }
    catch (error) { return json(response, error.status || 400, { error: error.message }); }
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim().replace(/\s+/g, ' ').slice(0, 24) : '';
    if (displayName.length < 2) return json(response, 400, { error: 'El nombre visible debe tener entre 2 y 24 caracteres.' });
    const avatar = body && Object.prototype.hasOwnProperty.call(body, 'avatar') ? validateAvatarData(body.avatar) : null;
    if (avatar && !avatar.ok) return json(response, 400, { error: 'La foto debe ser PNG, JPG o WebP y pesar como máximo 256 KB.' });
    if (user.role === 'owner') {
      const account = readOwner();
      if (!account || account.email !== user.email) return json(response, 401, { error: 'La sesión propietaria ya no es válida.' });
      account.displayName = displayName;
      if (avatar) account.avatarData = avatar.value;
      const temporary = ownerFile + '.profile.tmp';
      await writeFile(temporary, JSON.stringify(account, null, 2), 'utf8');
      await rename(temporary, ownerFile);
      return json(response, 200, publicProfile(account, account.email));
    }
    const users = await readUsers();
    const account = users.find((item) => item.email === user.email);
    if (!account) return json(response, 404, { error: 'No encontré tu cuenta.' });
    account.displayName = displayName;
    if (avatar) account.avatarData = avatar.value;
    await saveUsers(users);
    return json(response, 200, publicProfile(account, account.email));
  }
  if (pathname === '/api/auth/two-factor' && ['GET', 'POST'].includes(request.method)) {
    const user = currentUser(request);
    if (!user) return json(response, 401, { error: 'Inicia sesión para configurar la verificación en dos pasos.' });
    const loaded = await loadAccountForUser(user);
    if (!loaded.account) return json(response, 404, { error: 'No encontré tu cuenta.' });
    if (request.method === 'GET') {
      const pending = pendingTwoFactorEnrollments.get(user.token);
      const activePending = pending && pending.expiresAt > Date.now() ? pending : null;
      if (!activePending) pendingTwoFactorEnrollments.delete(user.token);
      const label = `FUNVERSE:${user.email}`;
      return json(response, 200, {
        enabled: Boolean(loaded.account.twoFactor),
        pendingSecret: activePending?.secret || null,
        otpauthUri: activePending ? `otpauth://totp/${encodeURIComponent(label)}?secret=${activePending.secret}&issuer=FUNVERSE&algorithm=SHA1&digits=6&period=30` : null,
      });
    }
    let body;
    try { body = await readBody(request); }
    catch (error) { return json(response, error.status || 400, { error: error.message }); }
    if (body.action === 'begin') {
      if (loaded.account.twoFactor) return json(response, 409, { error: 'La verificación en dos pasos ya está activada.' });
      const secret = createTotpSecret();
      pendingTwoFactorEnrollments.set(user.token, { secret, expiresAt: Date.now() + 10 * 60_000 });
      const label = `FUNVERSE:${user.email}`;
      return json(response, 200, { enabled: false, pendingSecret: secret, otpauthUri: `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=FUNVERSE&algorithm=SHA1&digits=6&period=30` });
    }
    if (body.action === 'enable') {
      const pending = pendingTwoFactorEnrollments.get(user.token);
      if (!pending || pending.expiresAt < Date.now()) return json(response, 409, { error: 'La configuración venció. Inicia el proceso otra vez.' });
      if (!verifyTotp(pending.secret, body.code)) return json(response, 401, { error: 'Ese código no coincide. Revisa el reloj de tu aplicación y vuelve a intentar.' });
      loaded.account.twoFactor = await encryptTwoFactorSecret(pending.secret);
      await saveAccountForUser(user, loaded.account, loaded.users);
      pendingTwoFactorEnrollments.delete(user.token);
      return json(response, 200, { enabled: true, message: 'Verificación en dos pasos activada para esta cuenta.' });
    }
    if (body.action === 'disable') {
      if (!loaded.account.twoFactor) return json(response, 409, { error: 'La verificación en dos pasos ya está desactivada.' });
      const password = String(body.password || '');
      const candidate = await hashPassword(password, loaded.account.salt);
      const expected = Buffer.from(loaded.account.hash, 'hex');
      const actual = Buffer.from(candidate.hash, 'hex');
      const validPassword = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
      const secret = await decryptTwoFactorSecret(loaded.account.twoFactor);
      if (!validPassword || !verifyTotp(secret, body.code)) return json(response, 401, { error: 'La contraseña o el código no coincide.' });
      delete loaded.account.twoFactor;
      await saveAccountForUser(user, loaded.account, loaded.users);
      return json(response, 200, { enabled: false, message: 'Verificación en dos pasos desactivada.' });
    }
    return json(response, 400, { error: 'Elige activar o desactivar la verificación.' });
  }
  if (pathname === '/api/auth/setup' && request.method === 'POST') {
    if (readOwner()) return json(response, 409, { error: 'La cuenta propietaria ya está configurada. Inicia sesión.' });
    let body;
    try { body = await readBody(request); }
    catch (error) { return json(response, error.status || 400, { error: error.message }); }
    if (!body || typeof body !== 'object') return json(response, 400, { error: 'Escribe el correo y la contraseña nueva.' });
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(response, 400, { error: 'Escribe un correo válido.' });
    if (password.length < 12 || password.length > 200) return json(response, 400, { error: 'La nueva contraseña debe tener al menos 12 caracteres.' });
    const secured = await hashPassword(password);
    await mkdir(dataDir, { recursive: true });
    try {
      await writeFile(ownerFile, JSON.stringify({ email, displayName: email.split('@')[0].slice(0, 24), salt: secured.salt, hash: secured.hash, createdAt: new Date().toISOString() }), { flag: 'wx' });
    } catch (error) {
      if (error.code === 'EEXIST') return json(response, 409, { error: 'La cuenta propietaria ya está configurada. Inicia sesión.' });
      throw error;
    }
    const token = await createSession(email, 'owner');
    return json(response, 201, { signedIn: true, email, role: 'owner', emailNotificationsReady: emailNotificationsReady() }, { 'Set-Cookie': sessionCookie(token) });
  }
  if (pathname === '/api/auth/register' && request.method === 'POST') {
    if (registrationBusy) return json(response, 429, { error: 'Ya se está creando otra cuenta. Espera un momento.' });
    if (!readOwner()) return json(response, 409, { error: 'Primero configura la cuenta propietaria de FUNVERSE.' });
    let body;
    try { body = await readBody(request); }
    catch (error) { return json(response, error.status || 400, { error: error.message }); }
    if (!body || typeof body !== 'object') return json(response, 400, { error: 'Escribe el correo y la contraseña nueva.' });
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(response, 400, { error: 'Escribe un correo válido.' });
    if (password.length < 12 || password.length > 200) return json(response, 400, { error: 'La contraseña debe tener al menos 12 caracteres.' });
    registrationBusy = true;
    try {
      const owner = readOwner();
      const users = await readUsers();
      if (email === owner.email || users.some((user) => user.email === email)) return json(response, 409, { error: 'Ya existe una cuenta con ese correo.' });
      const secured = await hashPassword(password);
      const role = body.accountType === 'parent' ? 'parent' : 'user';
      users.push({ email, displayName: (typeof body.displayName === 'string' ? body.displayName.trim().replace(/\s+/g, ' ').slice(0, 24) : '') || email.split('@')[0].slice(0, 24), salt: secured.salt, hash: secured.hash, createdAt: new Date().toISOString(), role, banned: false });
      await saveUsers(users);
      const token = await createSession(email, role);
      return json(response, 201, { signedIn: true, email, role }, { 'Set-Cookie': sessionCookie(token) });
    } finally {
      registrationBusy = false;
    }
  }
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    const key = request.socket.remoteAddress || 'local';
    const attempt = loginAttempts.get(key);
    if (attempt && attempt.blockedUntil > Date.now()) return json(response, 429, { error: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.' });
    let body;
    try { body = await readBody(request); }
    catch (error) { return json(response, error.status || 400, { error: error.message }); }
    const owner = readOwner();
    if (!body || typeof body !== 'object') return json(response, 400, { error: 'Escribe el correo y la contraseña.' });
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!owner) return json(response, 409, { error: 'Primero configura la cuenta propietaria.' });
    const users = await readUsers();
    const savedUser = users.find((user) => user.email === email);
    const savedRole = ['admin', 'parent'].includes(savedUser?.role) ? savedUser.role : 'user';
    const account = email === owner.email ? { ...owner, role: 'owner' } : savedUser ? { ...savedUser, role: savedRole } : null;
    const candidate = await hashPassword(password, account?.salt || DUMMY_PASSWORD_SALT);
    const candidateHash = Buffer.from(candidate.hash, 'hex');
    const savedHash = /^[a-f0-9]{128}$/i.test(account?.hash || '') ? Buffer.from(account.hash, 'hex') : Buffer.alloc(64);
    if (account && account.role !== 'owner' && account.banned === true) return json(response, 403, { error: 'Esta cuenta está suspendida por la cuenta OWNER.' });
    const matches = Boolean(account) && crypto.timingSafeEqual(candidateHash, savedHash);
    if (!matches) {
      const failures = (attempt?.failures || 0) + 1;
      loginAttempts.set(key, { failures, blockedUntil: failures >= 5 ? Date.now() + 5 * 60_000 : 0 });
      return json(response, 401, { error: 'El correo o la contraseña no coinciden.' });
    }
    if (account.twoFactor) {
      if (!body.otp) return json(response, 200, { twoFactorRequired: true, role: account.role });
      const secret = await decryptTwoFactorSecret(account.twoFactor);
      if (!secret || !verifyTotp(secret, body.otp)) {
        const failures = (attempt?.failures || 0) + 1;
        loginAttempts.set(key, { failures, blockedUntil: failures >= 5 ? Date.now() + 5 * 60_000 : 0 });
        return json(response, 401, { error: 'El código de verificación no coincide. Revisa tu aplicación e inténtalo de nuevo.' });
      }
    } else if (account.role === 'owner' && emailNotificationsReady()) {
      const challengeKey = `${key}:${email}`;
      let challenge = loginEmailChallenges.get(challengeKey);
      if (!challenge || challenge.expiresAt <= Date.now()) {
        const code = String(crypto.randomInt(100_000, 1_000_000));
        challenge = { hash: crypto.createHash('sha256').update(code).digest(), expiresAt: Date.now() + 10 * 60_000, lastSentAt: Date.now(), attempts: 0 };
        loginEmailChallenges.set(challengeKey, challenge);
        try { await sendLoginVerificationCode(email, code); }
        catch (error) {
          loginEmailChallenges.delete(challengeKey);
          console.error(`No pude enviar el código de acceso de FUNVERSE: ${error.message}`);
          return json(response, 503, { error: 'No pude enviar el código por correo. Revisa la configuración SMTP y vuelve a intentar.' });
        }
        return json(response, 200, { emailCodeRequired: true, emailCodeSent: true, role: account.role });
      }
      if (!body.otp) return json(response, 200, { emailCodeRequired: true, emailCodeSent: false, role: account.role });
      if (challenge.attempts >= 5) {
        loginEmailChallenges.delete(challengeKey);
        loginAttempts.set(key, { failures: 5, blockedUntil: Date.now() + 5 * 60_000 });
        return json(response, 429, { error: 'Se agotaron los intentos del código. Espera cinco minutos.' });
      }
      const submittedCode = String(body.otp).replace(/\s+/g, '');
      const submittedHash = crypto.createHash('sha256').update(submittedCode).digest();
      if (!/^\d{6}$/.test(submittedCode) || !crypto.timingSafeEqual(challenge.hash, submittedHash)) {
        challenge.attempts += 1;
        return json(response, 401, { error: 'El código enviado al correo no coincide o ya venció.' });
      }
      loginEmailChallenges.delete(challengeKey);
    }
    loginAttempts.delete(key);
    const token = await createSession(email, account.role);
    if (account.role === 'owner') void sendOwnerLoginNotice(email);
    return json(response, 200, { signedIn: true, email, role: account.role, ...publicProfile(account, email), emailNotificationsReady: emailNotificationsReady() }, { 'Set-Cookie': sessionCookie(token) });
  }
  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    const user = currentUser(request);
    if (user) sessions.delete(user.token);
    return json(response, 200, { signedIn: false, email: null, role: null }, { 'Set-Cookie': sessionCookie('', 0) });
  }
  return json(response, 405, { error: 'Método o ruta de cuenta no disponible.' });
}

async function readVideos() {
  try {
    const videos = JSON.parse(await readFile(videosFile, 'utf8'));
    return Array.isArray(videos) ? videos : [];
  } catch { return []; }
}

async function saveVideos(videos) {
  await mkdir(dataDir, { recursive: true });
  const temporary = `${videosFile}.tmp`;
  await writeFile(temporary, JSON.stringify(videos, null, 2));
  await rename(temporary, videosFile);
}

async function videoApi(request, response, pathname) {
  if (pathname === '/api/videos' && request.method === 'GET') {
    const videos = await readVideos();
    return json(response, 200, { videos: videos.map(({ id, title, fileName, size, uploadedAt }) => ({ id, title, fileName, size, uploadedAt, url: `/api/videos/${id}/stream` })) });
  }
  const streamMatch = pathname.match(/^\/api\/videos\/([a-f0-9]{24})\/stream$/);
  if (streamMatch && request.method === 'GET') return streamVideo(request, response, streamMatch[1]);

  if (request.method === 'POST' && pathname === '/api/videos') {
    const user = currentUser(request);
    if (!user) return json(response, 401, { error: 'Inicia sesión como propietario para subir videos.' });
    if (!isStaff(user)) return json(response, 403, { error: 'Solo OWNER o ADMIN pueden subir videos.' });
    let rawName = '';
    try { rawName = decodeURIComponent(String(request.headers['x-video-name'] || '')); }
    catch { return json(response, 400, { error: 'El nombre del video no es válido.' }); }
    const fileName = path.basename(rawName).replace(/[\x00-\x1f<>:"/\\|?*]/g, '').trim().slice(0, 180);
    const extension = path.extname(fileName).toLowerCase();
    if (!fileName || !videoMime[extension]) return json(response, 415, { error: 'Usa un archivo MP4, WebM o MOV.' });
    const declaredLength = Number(request.headers['content-length'] || 0);
    if (declaredLength > MAX_VIDEO_SIZE) return json(response, 413, { error: 'El video supera el límite de 300 MB.' });
    const id = crypto.randomBytes(12).toString('hex');
    await mkdir(videosDir, { recursive: true });
    const destination = path.join(videosDir, `${id}${extension}`);
    let size = 0;
    try {
      const guard = new Transform({
        transform(chunk, encoding, callback) {
          size += chunk.length;
          callback(size > MAX_VIDEO_SIZE ? Object.assign(new Error('El video supera el límite de 300 MB.'), { code: 'LIMIT' }) : null, chunk);
        },
      });
      await pipeline(request, guard, createWriteStream(destination, { flags: 'wx' }));
    } catch (error) {
      await rm(destination, { force: true }).catch(() => {});
      if (error.code === 'LIMIT') return json(response, 413, { error: 'El video supera el límite de 300 MB.' });
      if (!response.headersSent) return json(response, 400, { error: 'No pude guardar el video. Inténtalo de nuevo.' });
      return response.destroy();
    }
    if (!size) {
      await rm(destination, { force: true });
      return json(response, 400, { error: 'El archivo está vacío.' });
    }
    const videos = await readVideos();
    const video = { id, title: path.basename(fileName, extension).replace(/[_-]+/g, ' ').trim() || 'Video FUNVERSE', fileName, size, uploadedAt: new Date().toISOString(), owner: user.email };
    videos.unshift(video);
    await saveVideos(videos);
    return json(response, 201, { video: { ...video, url: `/api/videos/${id}/stream` } });
  }

  const idMatch = pathname.match(/^\/api\/videos\/([a-f0-9]{24})$/);
  if (idMatch && request.method === 'DELETE') {
    const user = currentUser(request);
    if (!user) return json(response, 401, { error: 'Inicia sesión como propietario para borrar videos.' });
    if (!isStaff(user)) return json(response, 403, { error: 'Solo OWNER o ADMIN pueden quitar videos.' });
    const videos = await readVideos();
    const target = videos.find((video) => video.id === idMatch[1]);
    if (!target) return json(response, 404, { error: 'No encontré ese video.' });
    await rm(path.join(videosDir, `${target.id}${path.extname(target.fileName).toLowerCase()}`), { force: true });
    await saveVideos(videos.filter((video) => video.id !== target.id));
    return json(response, 200, { removed: true });
  }
  return json(response, 405, { error: 'Método o ruta de video no disponible.' });
}

async function streamVideo(request, response, id) {
  const video = (await readVideos()).find((item) => item.id === id);
  if (!video) return json(response, 404, { error: 'No encontré ese video.' });
  const filename = path.join(videosDir, `${video.id}${path.extname(video.fileName).toLowerCase()}`);
  let info;
  try { info = await stat(filename); }
  catch { return json(response, 404, { error: 'El archivo de video ya no está disponible.' }); }
  const baseHeaders = { 'Content-Type': videoMime[path.extname(video.fileName).toLowerCase()], 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' };
  const range = request.headers.range;
  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) {
      response.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${info.size}` }).end();
      return;
    }
    let start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
    let end = match[2] && match[1] ? Number(match[2]) : info.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) {
      response.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${info.size}` }).end();
      return;
    }
    end = Math.min(end, info.size - 1);
    response.writeHead(206, { ...baseHeaders, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${info.size}` });
    return pipeline(createReadStream(filename, { start, end }), response).catch(() => {});
  }
  response.writeHead(200, { ...baseHeaders, 'Content-Length': info.size });
  return pipeline(createReadStream(filename), response).catch(() => {});
}

function mexicoDateParts(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

function mexicoOffsetMilliseconds(date) {
  const parts = mexicoDateParts(date);
  const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return localAsUtc - Math.floor(date.getTime() / 1_000) * 1_000;
}

function mexicoWallTimeToUtc(year, month, day, hour, minute = 0) {
  const wallTimeAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(wallTimeAsUtc);
  guess = new Date(wallTimeAsUtc - mexicoOffsetMilliseconds(guess));
  return new Date(wallTimeAsUtc - mexicoOffsetMilliseconds(guess));
}

async function readEventSettings() {
  try {
    const settings = JSON.parse(await readFile(eventSettingsFile, 'utf8'));
    const normalizeEffects = (values, fallback) => {
      const list = Array.isArray(values) ? values.filter((item) => EVENT_EFFECTS.includes(item)) : [];
      const result = [...new Set(list)].slice(0, 5);
      return result.length ? result : [EVENT_EFFECTS.includes(fallback) ? fallback : 'confetti'];
    };
    const effects = normalizeEffects(settings.effects, settings.effect);
    const manualEvent = settings.manualEvent && Number.isFinite(Date.parse(settings.manualEvent.startedAt)) && Number.isFinite(Date.parse(settings.manualEvent.endsAt))
      && EVENT_EFFECTS.includes(settings.manualEvent.effect)
      ? (() => { const avatar = validateAvatarData(settings.manualEvent.presenterAvatar); return { startedAt: settings.manualEvent.startedAt, endsAt: settings.manualEvent.endsAt, effect: settings.manualEvent.effect, effects: normalizeEffects(settings.manualEvent.effects, settings.manualEvent.effect), music: EVENT_MUSIC.includes(settings.manualEvent.music) ? settings.manualEvent.music : null, startedBy: typeof settings.manualEvent.startedBy === 'string' ? settings.manualEvent.startedBy : null, presenterName: typeof settings.manualEvent.presenterName === 'string' ? settings.manualEvent.presenterName.trim().replace(/\s+/g, ' ').slice(0, 24) : null, presenterAvatar: avatar.ok ? avatar.value : null }; })()
      : null;
    const announcementAvatar = validateAvatarData(settings.announcement?.authorAvatar);
    const announcement = settings.announcement && typeof settings.announcement.title === 'string' && typeof settings.announcement.body === 'string'
      && Number.isFinite(Date.parse(settings.announcement.expiresAt)) && Date.parse(settings.announcement.expiresAt) > Date.now()
      ? { title: settings.announcement.title.trim().slice(0, 70), body: settings.announcement.body.trim().slice(0, 260), authorName: typeof settings.announcement.authorName === 'string' ? settings.announcement.authorName.trim().replace(/\s+/g, ' ').slice(0, 24) : null, authorAvatar: announcementAvatar.ok ? announcementAvatar.value : null, publishedAt: settings.announcement.publishedAt, expiresAt: settings.announcement.expiresAt }
      : null;
    return {
      weeklyEnabled: settings.weeklyEnabled !== false,
      durationMinutes: [30, 60, 90].includes(Number(settings.durationMinutes)) ? Number(settings.durationMinutes) : 60,
      effect: effects[0],
      effects,
      music: EVENT_MUSIC.includes(settings.music) ? settings.music : 'Chasing_The_Spotlight.mp3',
      manualEvent,
      announcement,
      announcementEventId: typeof settings.announcementEventId === 'string' ? settings.announcementEventId : '',
      seasonalEvents: Array.isArray(settings.seasonalEvents) ? settings.seasonalEvents.filter((item) => Number.isInteger(item?.month) && item.month >= 0 && item.month <= 11 && Number.isFinite(Date.parse(item.startedAt)) && Number.isFinite(Date.parse(item.endsAt))).slice(-12) : [],
    };
  } catch { return { weeklyEnabled: true, durationMinutes: 60, effect: 'confetti', effects: ['confetti'], music: 'Chasing_The_Spotlight.mp3', manualEvent: null, announcement: null, announcementEventId: '', seasonalEvents: [] }; }
}

async function saveEventSettings(settings) {
  await mkdir(dataDir, { recursive: true });
  const temporary = `${eventSettingsFile}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await writeFile(temporary, JSON.stringify(settings, null, 2), { flag: 'wx' });
  await rename(temporary, eventSettingsFile);
}

async function adminEventsApi(request, response) {
  const user = currentUser(request);
  if (!user) return json(response, 401, { error: 'Inicia sesión como OWNER o ADMIN para gestionar eventos.' });
  if (!isStaff(user)) return json(response, 403, { error: 'Solo OWNER o ADMIN pueden gestionar eventos.' });
  if (request.method === 'GET') {
    const settings = await readEventSettings();
    const eventState = weeklyAdminAbuseState(new Date(), settings);
    return json(response, 200, { ...settings, manualActive: eventState.manualActive, manualEndsAt: eventState.source === 'manual' ? eventState.endsAt : null, eventState });
  }
  if (request.method !== 'POST') return json(response, 405, { error: 'Usa GET o POST para configurar el evento.' });
  let body;
  try { body = await readBody(request); }
  catch (error) { return json(response, error.status || 400, { error: error.message }); }
  if (!body || typeof body !== 'object') return json(response, 400, { error: 'La configuración del evento no es válida.' });
  const actorAccount = await loadAccountForUser(user);
  const actorProfile = publicProfile(actorAccount.account, user.email);
  const actorName = actorProfile.displayName;
  const previous = await readEventSettings();
  const action = body.action;
  if (action !== undefined && !['start', 'stop', 'announce', 'clear-announcement', 'start-season', 'stop-season'].includes(action)) return json(response, 400, { error: 'La acción del evento no es válida.' });
  if (action === 'announce' && (typeof body.body !== 'string' || !body.body.trim() || body.body.trim().length > 260)) {
    return json(response, 400, { error: 'Escribe un mensaje de hasta 260 caracteres.' });
  }
  const weeklyEnabled = body.weeklyEnabled === undefined ? previous.weeklyEnabled : body.weeklyEnabled;
  const durationMinutes = body.durationMinutes === undefined ? previous.durationMinutes : Number(body.durationMinutes);
  const requestedEffects = body.effects === undefined ? (body.effect === undefined ? previous.effects : [body.effect]) : body.effects;
  const effects = Array.isArray(requestedEffects) ? [...new Set(requestedEffects.filter((item) => EVENT_EFFECTS.includes(item)))].slice(0, 5) : [];
  const effect = effects[0] || previous.effect;
  const music = body.music === undefined ? previous.music : body.music;
  if (typeof weeklyEnabled !== 'boolean') return json(response, 400, { error: 'Elige si el evento semanal está activo o pausado.' });
  if (![30, 60, 90].includes(durationMinutes)) return json(response, 400, { error: 'La duración debe ser de 30, 60 o 90 minutos.' });
  if (!effects.length || !EVENT_EFFECTS.includes(effect)) return json(response, 400, { error: 'Selecciona de 1 a 5 efectos válidos para el evento.' });
  if (!EVENT_MUSIC.includes(music)) return json(response, 400, { error: 'Elige una canción disponible para los eventos.' });
  let manualEvent = previous.manualEvent;
  let announcement = previous.announcement;
  let announcementEventId = previous.announcementEventId;
  let seasonalEvents = previous.seasonalEvents.filter((item) => Date.parse(item.endsAt) > Date.now());
  if (action === 'start') {
    const startedAt = new Date();
    manualEvent = { startedAt: startedAt.toISOString(), endsAt: new Date(startedAt.getTime() + durationMinutes * 60_000).toISOString(), effect, effects, music, startedBy: user.email, presenterName: actorName, presenterAvatar: actorProfile.avatar };
    announcementEventId = startedAt.toISOString();
    announcement = { title: 'ADMIN ABUSE EN VIVO', body: `¡${actorName} inició la fiesta! Recoge las estrellas y gana hasta 100 XP durante esta sesión.`, authorName: actorName, authorAvatar: actorProfile.avatar, publishedAt: startedAt.toISOString(), expiresAt: new Date(startedAt.getTime() + 10_000).toISOString() };
    console.log(`La cuenta propietaria inició FUNVERSE ADMIN ABUSE por ${durationMinutes} minutos.`);
  } else if (action === 'stop') {
    manualEvent = null;
    console.log('La cuenta propietaria terminó FUNVERSE ADMIN ABUSE manual.');
  } else if (action === 'announce') {
    const publishedAt = new Date();
    announcement = { title: '', body: body.body.trim().replace(/\s+/g, ' ').slice(0, 260), authorName: actorName, authorAvatar: actorProfile.avatar, publishedAt: publishedAt.toISOString(), expiresAt: new Date(publishedAt.getTime() + 10_000).toISOString() };
    console.log(`${actorName} publicó un mensaje global FUNVERSE.`);
  } else if (action === 'clear-announcement') {
    announcement = null;
    console.log(`${actorName} retiró el anuncio global.`);
  } else if (action === 'start-season') {
    const month = Number(body.month);
    if (!Number.isInteger(month) || month < 0 || month > 11) return json(response, 400, { error: 'Elige una celebración de enero a diciembre.' });
    const startedAt = new Date();
    seasonalEvents = seasonalEvents.filter((item) => item.month !== month);
    seasonalEvents.push({ id: crypto.randomUUID(), month, startedAt: startedAt.toISOString(), endsAt: new Date(startedAt.getTime() + durationMinutes * 60_000).toISOString(), music, startedBy: user.email, presenterName: actorName, presenterAvatar: actorProfile.avatar });
    announcement = { title: '', body: `¡${actorName} inició una celebración de temporada en FUNVERSE! Entra al reto y gana puntos.`, authorName: actorName, authorAvatar: actorProfile.avatar, publishedAt: startedAt.toISOString(), expiresAt: new Date(startedAt.getTime() + 10_000).toISOString() };
  } else if (action === 'stop-season') {
    const month = Number(body.month);
    if (!Number.isInteger(month) || month < 0 || month > 11) return json(response, 400, { error: 'Elige la celebración que quieres terminar.' });
    seasonalEvents = seasonalEvents.filter((item) => item.month !== month);
  }
  const settings = { weeklyEnabled, durationMinutes, effect, effects, music, manualEvent, announcement, announcementEventId, seasonalEvents, updatedAt: new Date().toISOString(), updatedBy: user.email };
  await saveEventSettings(settings);
  if (weeklyEnabled !== previous.weeklyEnabled) console.log(`La cuenta propietaria ${weeklyEnabled ? 'activó' : 'pausó'} FUNVERSE ADMIN ABUSE.`);
  const eventState = weeklyAdminAbuseState(new Date(), settings);
  return json(response, 200, { weeklyEnabled: settings.weeklyEnabled, durationMinutes: settings.durationMinutes, effect: settings.effect, effects: settings.effects, music: settings.music, manualActive: eventState.manualActive, manualEndsAt: eventState.source === 'manual' ? eventState.endsAt : null, seasonalEvents: eventState.seasonalEvents, announcement: settings.announcement });
}

async function adminUsersApi(request, response) {
  const actor = currentUser(request);
  if (!actor) return json(response, 401, { error: 'Inicia sesión como OWNER o ADMIN para abrir el panel.' });
  if (!isStaff(actor)) return json(response, 403, { error: 'Solo OWNER o ADMIN pueden abrir el panel.' });
  const ownerAccount = readOwner();
  if (request.method === 'GET') {
    const [users, reports] = await Promise.all([readUsers(), readReports()]);
    return json(response, 200, { users: users.map((account) => {
      const targetReports = reports.filter((report) => report.targetEmail === account.email);
      return { ...publicProfile(account, account.email), email: account.email, role: ['admin', 'parent'].includes(account.role) ? account.role : 'user', xp: Number.isSafeInteger(account.progress?.xp) ? account.progress.xp : 0, reportsCount: targetReports.length, openReportsCount: targetReports.filter((report) => ['new', 'reviewing'].includes(report.status)).length, createdAt: account.createdAt || null, banned: account.banned === true, banReason: typeof account.banReason === 'string' ? account.banReason : '' };
    }) });
  }
  if (request.method !== 'POST') return json(response, 405, { error: 'Usa GET o POST para administrar cuentas.' });
  let body;
  try { body = await readBody(request); }
  catch (error) { return json(response, error.status || 400, { error: error.message }); }
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email === ownerAccount?.email) return json(response, 400, { error: 'No puedes suspender ni modificar la cuenta OWNER.' });
  const users = await readUsers();
  const account = users.find((item) => item.email === email);
  if (!account) return json(response, 404, { error: 'No encontré esa cuenta.' });
  if (body.action === 'reset-xp') {
    account.progress = account.progress && typeof account.progress === 'object' ? account.progress : {};
    account.progress.xp = 0;
    account.progress.updatedAt = new Date().toISOString();
    await saveUsers(users);
    return json(response, 200, { email, xp: 0 });
  }
  if (body.action === 'set-xp' || body.action === 'add-xp') {
    const value = body.action === 'set-xp' ? Number(body.xp) : Number(body.amount);
    if (!Number.isSafeInteger(value) || value < (body.action === 'set-xp' ? 0 : 1) || value > 1_000_000) return json(response, 400, { error: 'XP debe ser un número entero de 0 a 1,000,000.' });
    account.progress = account.progress && typeof account.progress === 'object' ? account.progress : {};
    account.progress.xp = body.action === 'set-xp' ? value : Math.min(1_000_000, (Number.isSafeInteger(account.progress.xp) ? account.progress.xp : 0) + value);
    account.progress.updatedAt = new Date().toISOString();
    await saveUsers(users);
    return json(response, 200, { email, xp: account.progress.xp });
  }
  if (actor.role !== 'owner') return json(response, 403, { error: 'ADMIN puede gestionar XP, pero solo OWNER puede suspender cuentas o cambiar roles.' });
  if (body.action === 'set-role') {
    const role = body.role;
    if (!['admin', 'user', 'parent'].includes(role)) return json(response, 400, { error: 'Elige Admin, Usuario o Adulto responsable.' });
    if (account.banned && role === 'admin') return json(response, 409, { error: 'Reactiva la cuenta antes de asignarle el rol Admin.' });
    account.role = role;
    account.roleUpdatedAt = new Date().toISOString();
    for (const session of sessions.values()) if (session.email === email) session.role = role;
    await saveUsers(users);
    return json(response, 200, { email, role: account.role });
  }
  if (!['ban', 'unban'].includes(body.action)) return json(response, 400, { error: 'Elige suspender, reactivar o cambiar el rol.' });
  if (body.action === 'ban') {
    account.banned = true;
    account.bannedAt = new Date().toISOString();
    account.banReason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 160) : '';
    for (const [token, session] of sessions) if (session.email === email) sessions.delete(token);
  } else {
    account.banned = false;
    delete account.bannedAt;
    delete account.banReason;
  }
  await saveUsers(users);
  return json(response, 200, { email, banned: account.banned });
}

async function adminReportsApi(request, response) {
  const actor = currentUser(request);
  if (!actor) return json(response, 401, { error: 'Inicia sesión como OWNER o ADMIN para revisar denuncias.' });
  if (!isStaff(actor)) return json(response, 403, { error: 'Solo OWNER o ADMIN pueden revisar denuncias.' });
  if (request.method === 'GET') return json(response, 200, { reports: (await readReports()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
  if (request.method !== 'POST') return json(response, 405, { error: 'Usa GET o POST para revisar denuncias.' });
  let body;
  try { body = await readBody(request); }
  catch (error) { return json(response, error.status || 400, { error: error.message }); }
  const statuses = ['new', 'reviewing', 'resolved', 'dismissed'];
  if (typeof body?.id !== 'string' || !statuses.includes(body.status)) return json(response, 400, { error: 'Elige una denuncia y un estado válido.' });
  const reports = await readReports();
  const report = reports.find((item) => item.id === body.id);
  if (!report) return json(response, 404, { error: 'No encontré esa denuncia.' });
  report.status = body.status;
  report.updatedAt = new Date().toISOString();
  report.reviewedBy = actor.email;
  await saveReports(reports);
  return json(response, 200, { id: report.id, status: report.status });
}

async function adminRewardsApi(request, response) {
  const actor = currentUser(request);
  if (!actor) return json(response, 401, { error: 'Inicia sesión como OWNER o ADMIN para regalar puntos.' });
  if (!isStaff(actor)) return json(response, 403, { error: 'Solo OWNER o ADMIN pueden regalar puntos globales.' });
  if (request.method !== 'POST') return json(response, 405, { error: 'Usa POST para regalar puntos.' });
  let body;
  try { body = await readBody(request); }
  catch (error) { return json(response, error.status || 400, { error: error.message }); }
  const amount = Number(body?.amount);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100_000) return json(response, 400, { error: 'El regalo debe ser de 1 a 100,000 XP por cuenta.' });
  const users = await readUsers();
  let recipients = 0;
  let totalAwarded = 0;
  const addReward = (account) => {
    if (!account) return;
    account.progress = account.progress && typeof account.progress === 'object' ? account.progress : {};
    const current = Number.isSafeInteger(account.progress.xp) ? account.progress.xp : 0;
    const awarded = Math.min(amount, 1_000_000 - current);
    if (awarded <= 0) return;
    account.progress.xp = current + awarded;
    account.progress.updatedAt = new Date().toISOString();
    recipients += 1;
    totalAwarded += awarded;
  };
  for (const account of users) if (!account.banned) addReward(account);
  const owner = readOwner();
  if (owner) {
    addReward(owner);
    const temporary = `${ownerFile}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    await writeFile(temporary, JSON.stringify(owner, null, 2), { flag: 'wx' });
    await rename(temporary, ownerFile);
  }
  await saveUsers(users);
  console.log(`${actor.email} regaló ${amount} XP a ${recipients} cuentas de FUNVERSE.`);
  return json(response, 200, { amount, recipients, totalAwarded });
}

async function userReportsApi(request, response) {
  const reporter = currentUser(request);
  if (!reporter) return json(response, 401, { error: 'Inicia sesión antes de enviar una denuncia.' });
  if (request.method !== 'POST') return json(response, 405, { error: 'Usa POST para enviar una denuncia.' });
  let body;
  try { body = await readBody(request); }
  catch (error) { return json(response, error.status || 400, { error: error.message }); }
  const targetEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const reason = typeof body?.reason === 'string' ? body.reason : '';
  const details = typeof body?.details === 'string' ? body.details.trim().slice(0, 600) : '';
  const validReasons = ['acoso', 'contenido', 'suplantacion', 'seguridad', 'otro'];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) return json(response, 400, { error: 'Escribe el correo de la cuenta que quieres denunciar.' });
  if (targetEmail === reporter.email) return json(response, 400, { error: 'No puedes denunciar tu propia cuenta.' });
  if (!validReasons.includes(reason)) return json(response, 400, { error: 'Elige un motivo para la denuncia.' });
  if (details.length < 10) return json(response, 400, { error: 'Describe lo ocurrido con al menos 10 caracteres.' });
  const owner = readOwner();
  const users = await readUsers();
  const target = publicAccountByEmail(targetEmail, owner, users);
  if (!target) return json(response, 404, { error: 'No encontré esa cuenta de FUNVERSE.' });
  const reports = await readReports();
  const recentDuplicate = reports.some((report) => report.reporterEmail === reporter.email && report.targetEmail === targetEmail && Date.now() - Date.parse(report.createdAt) < 60_000);
  if (recentDuplicate) return json(response, 429, { error: 'Ya enviaste una denuncia reciente para esa cuenta. Espera un minuto.' });
  reports.push({ id: crypto.randomUUID(), reporterEmail: reporter.email, targetEmail, targetName: target.displayName, reason, details, status: 'new', createdAt: new Date().toISOString() });
  await saveReports(reports.slice(-500));
  return json(response, 201, { submitted: true, message: 'Denuncia enviada al equipo de FUNVERSE.' });
}

async function friendsApi(request, response) {
  const user = currentUser(request);
  if (!user) return json(response, 401, { error: 'Inicia sesión para usar Amigos.' });
  const social = await readSocial();
  const owner = readOwner();
  const users = await readUsers();
  if (request.method === 'GET') {
    const friends = social.friends
      .filter((item) => item.userA === user.email || item.userB === user.email)
      .map((item) => publicAccountByEmail(item.userA === user.email ? item.userB : item.userA, owner, users))
      .filter(Boolean);
    const formatRequest = (item) => ({ id: item.id, createdAt: item.createdAt, account: publicAccountByEmail(item.from === user.email ? item.to : item.from, owner, users) });
    const incoming = social.requests.filter((item) => item.to === user.email && item.status === 'pending').map(formatRequest).filter((item) => item.account);
    const outgoing = social.requests.filter((item) => item.from === user.email && item.status === 'pending').map(formatRequest).filter((item) => item.account);
    return json(response, 200, { friends, incoming, outgoing });
  }
  if (request.method !== 'POST') return json(response, 405, { error: 'Usa GET o POST para administrar amistades.' });
  let body;
  try { body = await readBody(request); }
  catch (error) { return json(response, error.status || 400, { error: error.message }); }
  const action = body?.action;
  if (action === 'request') {
    const targetEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) return json(response, 400, { error: 'Escribe el correo de tu amigo.' });
    if (targetEmail === user.email) return json(response, 400, { error: 'No puedes agregarte a ti mismo.' });
    const target = publicAccountByEmail(targetEmail, owner, users);
    if (!target || (target.role !== 'owner' && users.find((item) => item.email === targetEmail)?.banned)) return json(response, 404, { error: 'No encontré una cuenta activa con ese correo.' });
    if (areFriends(social, user.email, targetEmail)) return json(response, 409, { error: 'Esa cuenta ya está en tu lista de amigos.' });
    const reverse = social.requests.find((item) => item.from === targetEmail && item.to === user.email && item.status === 'pending');
    if (reverse) {
      reverse.status = 'accepted';
      reverse.updatedAt = new Date().toISOString();
      social.friends.push({ userA: user.email, userB: targetEmail, createdAt: reverse.updatedAt });
      await saveSocial(social);
      return json(response, 200, { accepted: true, message: `Ahora tú y ${target.displayName} son amigos.` });
    }
    if (social.requests.some((item) => item.from === user.email && item.to === targetEmail && item.status === 'pending')) return json(response, 409, { error: 'Ya enviaste una solicitud a esa cuenta.' });
    const createdAt = new Date().toISOString();
    social.requests.push({ id: crypto.randomUUID(), from: user.email, to: targetEmail, status: 'pending', createdAt });
    await saveSocial(social);
    return json(response, 201, { requested: true, message: `Solicitud enviada a ${target.displayName}.` });
  }
  if (action === 'accept' || action === 'decline') {
    const request = social.requests.find((item) => item.id === body.id && item.to === user.email && item.status === 'pending');
    if (!request) return json(response, 404, { error: 'La solicitud ya no está disponible.' });
    request.status = action === 'accept' ? 'accepted' : 'declined';
    request.updatedAt = new Date().toISOString();
    if (action === 'accept' && !areFriends(social, request.from, request.to)) social.friends.push({ userA: request.from, userB: request.to, createdAt: request.updatedAt });
    await saveSocial(social);
    return json(response, 200, { status: request.status });
  }
  if (action === 'remove') {
    const targetEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!areFriends(social, user.email, targetEmail)) return json(response, 404, { error: 'Esa cuenta no está en tu lista de amigos.' });
    social.friends = social.friends.filter((item) => !((item.userA === user.email && item.userB === targetEmail) || (item.userA === targetEmail && item.userB === user.email)));
    await saveSocial(social);
    return json(response, 200, { removed: true });
  }
  return json(response, 400, { error: 'La acción de amistad no es válida.' });
}

async function chatApi(request, response, url) {
  const user = currentUser(request);
  if (!user) return json(response, 401, { error: 'Inicia sesión para usar el chat.' });
  if (request.method === 'GET') {
    const targetEmail = String(url.searchParams.get('with') || '').trim().toLowerCase();
    if (!targetEmail || !areFriends(await readSocial(), user.email, targetEmail)) return json(response, 403, { error: 'Solo puedes chatear con tus amigos.' });
    const social = await readSocial();
    const messages = social.messages.filter((item) => (item.from === user.email && item.to === targetEmail) || (item.from === targetEmail && item.to === user.email)).slice(-100);
    return json(response, 200, { messages });
  }
  if (request.method !== 'POST') return json(response, 405, { error: 'Usa GET o POST para el chat.' });
  let body;
  try { body = await readBody(request); }
  catch (error) { return json(response, error.status || 400, { error: error.message }); }
  const targetEmail = typeof body?.to === 'string' ? body.to.trim().toLowerCase() : '';
  const message = typeof body?.text === 'string' ? body.text.trim().slice(0, 500) : '';
  const social = await readSocial();
  if (!areFriends(social, user.email, targetEmail)) return json(response, 403, { error: 'Solo puedes enviar mensajes a tus amigos.' });
  if (!message) return json(response, 400, { error: 'Escribe un mensaje antes de enviarlo.' });
  const item = { id: crypto.randomUUID(), from: user.email, to: targetEmail, text: message, createdAt: new Date().toISOString() };
  social.messages.push(item);
  social.messages = social.messages.slice(-2_000);
  await saveSocial(social);
  return json(response, 201, { message: item });
}

function weeklyAdminAbuseState(now = new Date(), settings = {}) {
  const local = mexicoDateParts(now);
  const year = Number(local.year);
  const month = Number(local.month);
  const day = Number(local.day);
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(local.weekday);
  const saturdayAtNoon = mexicoWallTimeToUtc(year, month, day + ((6 - weekdayIndex + 7) % 7), 12);
  const durationMinutes = [30, 60, 90].includes(Number(settings.durationMinutes)) ? Number(settings.durationMinutes) : 60;
  const enabled = settings.weeklyEnabled !== false;
  const configuredEffects = Array.isArray(settings.effects) ? [...new Set(settings.effects.filter((item) => EVENT_EFFECTS.includes(item)))].slice(0, 5) : [];
  const effects = configuredEffects.length ? configuredEffects : [EVENT_EFFECTS.includes(settings.effect) ? settings.effect : 'confetti'];
  const effect = effects[0];
  const eventEnd = new Date(saturdayAtNoon.getTime() + durationMinutes * 60 * 1_000);
  const manualEvent = settings.manualEvent;
  const manualStart = manualEvent ? new Date(manualEvent.startedAt) : null;
  const manualEnd = manualEvent ? new Date(manualEvent.endsAt) : null;
  const manualActive = Boolean(manualStart && manualEnd && Number.isFinite(manualStart.getTime()) && Number.isFinite(manualEnd.getTime()) && now >= manualStart && now < manualEnd);
  const weeklyActive = enabled && weekdayIndex === 6 && now >= saturdayAtNoon && now < eventEnd;
  const active = manualActive || weeklyActive;
  const source = manualActive ? 'manual' : weeklyActive ? 'weekly' : null;
  const activeSeasonalEvents = (Array.isArray(settings.seasonalEvents) ? settings.seasonalEvents : []).filter((item) => Number.isInteger(item.month) && item.month >= 0 && item.month <= 11 && Number.isFinite(Date.parse(item.startedAt)) && Number.isFinite(Date.parse(item.endsAt)) && now >= new Date(item.startedAt) && now < new Date(item.endsAt)).map((item) => ({ id: item.id, month: item.month, startedAt: item.startedAt, endsAt: item.endsAt, music: EVENT_MUSIC.includes(item.music) ? item.music : 'Chasing_The_Spotlight.mp3' }));
  const manualEffects = manualActive && Array.isArray(manualEvent.effects) ? [...new Set(manualEvent.effects.filter((item) => EVENT_EFFECTS.includes(item)))].slice(0, 5) : [];
  let nextStart = saturdayAtNoon;
  if (weekdayIndex === 6 && now >= saturdayAtNoon) {
    nextStart = mexicoWallTimeToUtc(year, month, day + 7, 12);
  }
  return {
    active,
    enabled,
    manualActive,
    source,
    durationMinutes,
    effect: manualEffects[0] || (manualActive && EVENT_EFFECTS.includes(manualEvent.effect) ? manualEvent.effect : effect),
    effects: manualEffects.length ? manualEffects : effects,
    music: manualActive && EVENT_MUSIC.includes(manualEvent.music) ? manualEvent.music : (EVENT_MUSIC.includes(settings.music) ? settings.music : 'Chasing_The_Spotlight.mp3'),
    seasonalEvents: activeSeasonalEvents,
    presenterName: source === 'manual' ? manualEvent?.presenterName || 'FUNVERSE' : active ? 'FUNVERSE' : null,
    presenterAvatar: source === 'manual' ? manualEvent?.presenterAvatar || null : null,
    timezone: 'America/Mexico_City',
    startsAt: source === 'manual' ? manualStart.toISOString() : weeklyActive ? saturdayAtNoon.toISOString() : null,
    endsAt: source === 'manual' ? manualEnd.toISOString() : weeklyActive ? eventEnd.toISOString() : null,
    nextAt: nextStart.toISOString(),
  };
}

const DEFAULT_SITE_SETTINGS = Object.freeze({ seasonMonth: 'auto', heroTitle: 'El universo de diversión empieza aquí.', heroTagline: 'Juega, crea y explora a tu manera. Tu siguiente aventura está a un clic.', parentalEnabled: false, dailyLimitMinutes: 60 });

async function readSiteSettings() {
  try {
    const saved = JSON.parse(await readFile(siteSettingsFile, 'utf8'));
    const month = saved.seasonMonth === 'auto' || (Number.isInteger(Number(saved.seasonMonth)) && Number(saved.seasonMonth) >= 0 && Number(saved.seasonMonth) <= 11) ? String(saved.seasonMonth) : 'auto';
    return {
      seasonMonth: month,
      heroTitle: typeof saved.heroTitle === 'string' && saved.heroTitle.trim() ? saved.heroTitle.trim().slice(0, 80) : DEFAULT_SITE_SETTINGS.heroTitle,
      heroTagline: typeof saved.heroTagline === 'string' && saved.heroTagline.trim() ? saved.heroTagline.trim().slice(0, 160) : DEFAULT_SITE_SETTINGS.heroTagline,
      parentalEnabled: saved.parentalEnabled === true,
      dailyLimitMinutes: [30, 60, 90, 120].includes(Number(saved.dailyLimitMinutes)) ? Number(saved.dailyLimitMinutes) : DEFAULT_SITE_SETTINGS.dailyLimitMinutes,
    };
  } catch { return { ...DEFAULT_SITE_SETTINGS }; }
}

async function siteSettingsApi(request, response) {
  if (request.method === 'GET') return json(response, 200, await readSiteSettings());
  if (request.method !== 'POST') return json(response, 405, { error: 'Usa GET o POST para cambiar la apariencia.' });
  const user = currentUser(request);
  if (!user) return json(response, 401, { error: 'Inicia sesión como OWNER o ADMIN para editar FUNVERSE.' });
  if (!isStaff(user)) return json(response, 403, { error: 'Solo OWNER o ADMIN pueden editar la apariencia y los controles parentales.' });
  let body;
  try { body = await readBody(request); }
  catch (error) { return json(response, error.status || 400, { error: error.message }); }
  if (!body || typeof body !== 'object') return json(response, 400, { error: 'La configuración de la página no es válida.' });
  const month = body.seasonMonth === 'auto' ? 'auto' : Number(body.seasonMonth);
  const dailyLimitMinutes = Number(body.dailyLimitMinutes);
  if (!(month === 'auto' || (Number.isInteger(month) && month >= 0 && month <= 11))) return json(response, 400, { error: 'Elige un mes o el modo automático.' });
  if (![30, 60, 90, 120].includes(dailyLimitMinutes)) return json(response, 400, { error: 'El límite diario debe ser 30, 60, 90 o 120 minutos.' });
  const heroTitle = typeof body.heroTitle === 'string' ? body.heroTitle.trim() : '';
  const heroTagline = typeof body.heroTagline === 'string' ? body.heroTagline.trim() : '';
  if (!heroTitle || heroTitle.length > 80 || !heroTagline || heroTagline.length > 160) return json(response, 400, { error: 'El título acepta hasta 80 caracteres y el mensaje hasta 160.' });
  const settings = { seasonMonth: month === 'auto' ? 'auto' : String(month), heroTitle, heroTagline, parentalEnabled: body.parentalEnabled === true, dailyLimitMinutes, updatedAt: new Date().toISOString(), updatedBy: user.email };
  await mkdir(dataDir, { recursive: true });
  await writeFile(siteSettingsFile, JSON.stringify(settings, null, 2), 'utf8');
  return json(response, 200, settings);
}

async function ensureEventAnnouncement(settings, now = new Date()) {
  const event = weeklyAdminAbuseState(now, settings);
  if (!event.active || !event.startsAt || settings.announcementEventId === event.startsAt) return settings;
  const publishedAt = now.toISOString();
  settings.announcementEventId = event.startsAt;
  const presenterName = event.presenterName || 'FUNVERSE';
  settings.announcement = { title: 'ADMIN ABUSE EN VIVO', body: event.source === 'manual' ? `¡${presenterName} inició la fiesta! Recoge las estrellas y gana hasta 100 XP durante esta sesión.` : '¡El evento semanal está en vivo! Recoge las estrellas y gana hasta 100 XP durante esta sesión.', authorName: presenterName, authorAvatar: event.presenterAvatar || null, publishedAt, expiresAt: new Date(now.getTime() + 10_000).toISOString() };
  await saveEventSettings({ ...settings, updatedAt: publishedAt });
  return settings;
}

async function statusApi(request, response) {
  const owner = readOwner();
  const user = currentUser(request);
  const eventSettings = await ensureEventAnnouncement(await readEventSettings());
  return json(response, 200, {
    site: 'ok',
    setupRequired: !owner,
    signedIn: Boolean(user),
    email: user?.email || null,
    weeklyEvent: weeklyAdminAbuseState(new Date(), eventSettings),
    announcement: eventSettings.announcement,
  });
}async function announcementApi(request, response) {
  if (request.method !== 'GET') return json(response, 405, { error: 'Usa GET para consultar el anuncio.' });
  const settings = await readEventSettings();
  return json(response, 200, { announcement: settings.announcement });
}

async function eventStatusApi(request, response) {
  if (request.method !== 'GET') return json(response, 405, { error: 'Usa GET para consultar los eventos.' });
  const settings = await ensureEventAnnouncement(await readEventSettings());
  const eventState = weeklyAdminAbuseState(new Date(), settings);
  return json(response, 200, { weeklyEvent: eventState, seasonalEvents: eventState.seasonalEvents });
}

async function page(request, response, pathname) {
  let name;
  try { name = decodeURIComponent(pathname); }
  catch { response.writeHead(400).end('Ruta no válida.'); return; }
  if (name === '/') name = '/index.html';
  const allowed = new Set(['/index.html', '/chat.html', '/chat.css', '/admin.html', '/style.css', '/script.js', '/chat.js', '/admin.js', '/adminpanelstyle.css']);
  const asset = name.startsWith('/assets/') && !name.split('/').some((part) => part.startsWith('.'));
  if (!allowed.has(name) && !asset) { response.writeHead(404).end('No encontré esa página.'); return; }
  const filename = path.resolve(root, `.${name}`);
  if (filename !== root && !filename.startsWith(`${root}${path.sep}`)) { response.writeHead(404).end('No encontré esa página.'); return; }
  const type = mime[path.extname(filename).toLowerCase()];
  if (!type) { response.writeHead(415).end('Tipo de archivo no permitido.'); return; }
  try {
    const content = await readFile(filename);
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404).end('No encontré ese archivo.'); }
}

const server = http.createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    console.error(`Error de FUNVERSE: ${error.stack || error.message}`);
    if (response.headersSent) response.destroy();
    else json(response, 500, { error: 'Ocurrió un error interno en FUNVERSE. Revisa la ventana del servidor.' });
  });
});

async function handleRequest(request, response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' blob:; frame-src https://open.spotify.com; connect-src 'self' http://127.0.0.1:3000 http://localhost:3000; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    if (!applyApiCors(request, response)) return;
    if (url.pathname === '/api/status') return statusApi(request, response);
    if (url.pathname === '/api/announcement') return announcementApi(request, response);
    if (url.pathname === '/api/site-settings') return siteSettingsApi(request, response);
    if (url.pathname === '/api/events/status') return eventStatusApi(request, response);
    if (url.pathname === '/api/admin/events') return adminEventsApi(request, response);
    if (url.pathname === '/api/admin/users') return adminUsersApi(request, response);
    if (url.pathname === '/api/admin/reports') return adminReportsApi(request, response);
    if (url.pathname === '/api/admin/rewards') return adminRewardsApi(request, response);
    if (url.pathname === '/api/reports') return userReportsApi(request, response);
    if (url.pathname === '/api/friends') return friendsApi(request, response);
    if (url.pathname === '/api/chat') return chatApi(request, response, url);
    if (url.pathname.startsWith('/api/auth/')) return authApi(request, response, url.pathname);
    if (url.pathname.startsWith('/api/videos')) return videoApi(request, response, url.pathname);
    return json(response, 404, { error: 'No encontré esa ruta de FUNVERSE.' });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405).end('Método no permitido.'); return; }
  return page(request, response, url.pathname);
}

server.listen(port, '127.0.0.1', () => {
  console.log('FUNVERSE está listo en http://127.0.0.1:' + port);
});
process.once('SIGINT', () => server.close(() => process.exit(0)));
process.once('SIGTERM', () => server.close(() => process.exit(0)));
