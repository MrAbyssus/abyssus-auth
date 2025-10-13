// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.static('public'));
app.use(express.json());

// ----------------- In-memory stores -----------------
const usuariosAutenticados = new Map();
const codigosUsados = new Set();

// ----------------- Permissions store -----------------
const PERMS_FILE = path.join(__dirname, 'panel_perms.json');
let PANEL_PERMS = { global: {}, perGuild: {} };
const LEVEL_ORDER = ['viewer', 'moderator', 'admin', 'owner'];

function ensurePermsFile() {
  try {
    if (!fs.existsSync(PERMS_FILE)) {
      fs.writeFileSync(PERMS_FILE, JSON.stringify(PANEL_PERMS, null, 2), 'utf8');
    } else {
      const raw = fs.readFileSync(PERMS_FILE, 'utf8');
      PANEL_PERMS = JSON.parse(raw || '{}');
      if (!PANEL_PERMS.global) PANEL_PERMS.global = {};
      if (!PANEL_PERMS.perGuild) PANEL_PERMS.perGuild = {};
    }
  } catch (e) {
    console.error('Error reading/creating perms file:', e);
  }
}
function savePermsFile() {
  try {
    fs.writeFileSync(PERMS_FILE, JSON.stringify(PANEL_PERMS, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving perms file:', e);
  }
}
ensurePermsFile();

function levelIndex(level) {
  const i = LEVEL_ORDER.indexOf(level);
  return i === -1 ? 0 : i;
}
function getUserLevel(userId, guildId) {
  try {
    if (guildId && PANEL_PERMS.perGuild[guildId] && PANEL_PERMS.perGuild[guildId][userId])
      return PANEL_PERMS.perGuild[guildId][userId];
    if (PANEL_PERMS.global[userId]) return PANEL_PERMS.global[userId];
    return 'viewer';
  } catch {
    return 'viewer';
  }
}
function hasPermission(userId, guildId, requiredLevel) {
  return levelIndex(getUserLevel(userId, guildId)) >= levelIndex(requiredLevel);
}

// ----------------- Helpers -----------------
function safeJson(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}
function escapeHtml(s = '') {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}
function logAction(type, details) {
  try {
    const line = `[${new Date().toISOString()}] ${type}: ${JSON.stringify(details)}\n`;
    fs.appendFileSync(path.join(__dirname, 'acciones.log'), line, 'utf8');
  } catch (e) {
    console.error('Error escribiendo log:', e);
  }
}

// ----------------- Session cleanup -----------------
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of usuariosAutenticados) {
    if (now - s.createdAt > 1000 * 60 * 30) usuariosAutenticados.delete(id);
  }
}, 1000 * 60 * 5);

// ----------------- OAuth2 login -----------------
app.get('/login', (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const redirect = process.env.REDIRECT_URI;
  const url = `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=identify%20guilds`;
  res.redirect(url);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login');
  if (codigosUsados.has(code)) return res.send('Código ya usado.');
  codigosUsados.add(code);
  try {
    const tokenResp = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.REDIRECT_URI
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const accessToken = tokenResp.data.access_token;
    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    usuariosAutenticados.set(userRes.data.id, {
      accessToken,
      username: userRes.data.username,
      avatar: userRes.data.avatar,
      createdAt: Date.now()
    });
    res.redirect(`/mis-guilds/${userRes.data.id}`);
  } catch (err) {
    res.status(500).send('Error de autenticación: ' + err.message);
  }
});

// ----------------- Require session -----------------
function requireSession(req, res, next) {
  const userId = req.query.userId || req.body.userId;
  if (!userId) return res.status(400).send('Falta userId');
  const ses = usuariosAutenticados.get(userId);
  if (!ses) return res.status(401).send('No autenticado');
  req.sessionUserId = userId;
  req.session = ses;
  next();
}

// ----------------- API endpoints -----------------
async function discordRequest(method, url, body = null) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  return axios({
    method,
    url: `https://discord.com/api/v10${url}`,
    headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    data: body
  });
}

// --- Moderación ---
app.post('/api/guilds/:guildId/kick', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId } = req.body;
  if (!hasPermission(req.sessionUserId, guildId, 'moderator')) return res.status(403).send('Sin permisos');
  try {
    await discordRequest('DELETE', `/guilds/${guildId}/members/${targetId}`);
    logAction('kick', { guildId, targetId, by: req.sessionUserId });
    res.send('Usuario expulsado');
  } catch (e) {
    res.status(500).send('Error al expulsar: ' + e.message);
  }
});

app.post('/api/guilds/:guildId/ban', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId, reason, deleteMessageDays } = req.body;
  if (!hasPermission(req.sessionUserId, guildId, 'moderator')) return res.status(403).send('Sin permisos');
  try {
    await discordRequest('PUT', `/guilds/${guildId}/bans/${targetId}`, { delete_message_days: deleteMessageDays || 0, reason: reason || 'Baneado via panel' });
    logAction('ban', { guildId, targetId, by: req.sessionUserId, reason });
    res.send('Usuario baneado');
  } catch (e) {
    res.status(500).send('Error al banear: ' + e.message);
  }
});

app.post('/api/guilds/:guildId/timeout', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId, minutes } = req.body;
  if (!hasPermission(req.sessionUserId, guildId, 'moderator')) return res.status(403).send('Sin permisos');
  try {
    const until = new Date(Date.now() + minutes * 60000).toISOString();
    await discordRequest('PATCH', `/guilds/${guildId}/members/${targetId}`, { communication_disabled_until: until });
    logAction('timeout', { guildId, targetId, by: req.sessionUserId, minutes });
    res.send('Timeout aplicado');
  } catch (e) {
    res.status(500).send('Error timeout: ' + e.message);
  }
});

// --- Mensajes ---
app.post('/api/guilds/:guildId/message', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { channelId, content } = req.body;
  if (!hasPermission(req.sessionUserId, guildId, 'moderator')) return res.status(403).send('Sin permisos');
  try {
    await discordRequest('POST', `/channels/${channelId}/messages`, { content });
    logAction('message', { guildId, channelId, content, by: req.sessionUserId });
    res.send('Mensaje enviado');
  } catch (e) {
    res.status(500).send('Error enviando mensaje: ' + e.message);
  }
});

// --- Roles / Canales ---
app.post('/api/guilds/:guildId/create-role', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { name } = req.body;
  if (!hasPermission(req.sessionUserId, guildId, 'admin')) return res.status(403).send('Sin permisos');
  try {
    await discordRequest('POST', `/guilds/${guildId}/roles`, { name });
    logAction('createRole', { guildId, name, by: req.sessionUserId });
    res.send('Rol creado');
  } catch (e) {
    res.status(500).send('Error creando rol: ' + e.message);
  }
});
app.post('/api/guilds/:guildId/delete-role', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { roleId } = req.body;
  if (!hasPermission(req.sessionUserId, guildId, 'admin')) return res.status(403).send('Sin permisos');
  try {
    await discordRequest('DELETE', `/guilds/${guildId}/roles/${roleId}`);
    logAction('deleteRole', { guildId, roleId, by: req.sessionUserId });
    res.send('Rol eliminado');
  } catch (e) {
    res.status(500).send('Error eliminando rol: ' + e.message);
  }
});
app.post('/api/guilds/:guildId/create-channel', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { name } = req.body;
  if (!hasPermission(req.sessionUserId, guildId, 'admin')) return res.status(403).send('Sin permisos');
  try {
    await discordRequest('POST', `/guilds/${guildId}/channels`, { name, type: 0 });
    logAction('createChannel', { guildId, name, by: req.sessionUserId });
    res.send('Canal creado');
  } catch (e) {
    res.status(500).send('Error creando canal: ' + e.message);
  }
});
app.post('/api/guilds/:guildId/delete-channel', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { channelId } = req.body;
  if (!hasPermission(req.sessionUserId, guildId, 'admin')) return res.status(403).send('Sin permisos');
  try {
    await discordRequest('DELETE', `/channels/${channelId}`);
    logAction('deleteChannel', { guildId, channelId, by: req.sessionUserId });
    res.send('Canal eliminado');
  } catch (e) {
    res.status(500).send('Error eliminando canal: ' + e.message);
  }
});

// --- Permisos internos ---
app.post('/api/guilds/:guildId/set-perm', requireSession, (req, res) => {
  const { guildId } = req.params;
  const { targetId, level } = req.body;
  if (!hasPermission(req.sessionUserId, guildId, 'owner')) return res.status(403).send('Solo owner puede asignar permisos');
  if (!PANEL_PERMS.perGuild[guildId]) PANEL_PERMS.perGuild[guildId] = {};
  PANEL_PERMS.perGuild[guildId][targetId] = level;
  savePermsFile();
  logAction('setPerm', { guildId, targetId, level, by: req.sessionUserId });
  res.send(`Nivel ${level} asignado a ${targetId}`);
});

// --- Logs ---
app.get('/logs/:guildId', requireSession, (req, res) => {
  const { guildId } = req.params;
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'acciones.log'), 'utf8');
    const lines = raw.split('\n').filter(l => l.includes(guildId)).slice(-200).join('\n');
    res.type('text').send(lines || 'No hay logs');
  } catch {
    res.status(500).send('Error leyendo logs');
  }
});
app.post('/logs/:guildId/clear', requireSession, (req, res) => {
  const { guildId } = req.params;
  if (!hasPermission(req.sessionUserId, guildId, 'owner')) return res.status(403).send('Sin permisos');
  try {
    const file = path.join(__dirname, 'acciones.log');
    const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n') : [];
    const filtered = lines.filter(l => !l.includes(guildId));
    fs.writeFileSync(file, filtered.join('\n'), 'utf8');
    res.send('Logs del servidor borrados');
  } catch {
    res.status(500).send('Error borrando logs');
  }
});

// ----------------- Start -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Panel Abyssus activo en http://localhost:${PORT}`));

































































































