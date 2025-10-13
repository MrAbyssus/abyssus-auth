// index.js — Abyssus panel (single-file) + role permissions editor + bot-permissions check
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ---- Config ----
const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !BOT_TOKEN) {
  console.error('Falta CLIENT_ID, CLIENT_SECRET, REDIRECT_URI o BOT_TOKEN en .env');
  process.exit(1);
}

// ---- Files & persistence ----
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'panel.log');
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

let sessions = new Map();
try {
  if (fs.existsSync(SESSIONS_FILE)) {
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf8') || '{}';
    const obj = JSON.parse(raw);
    for (const k of Object.keys(obj)) sessions.set(k, obj[k]);
  }
} catch (e) {
  console.warn('No se pudieron cargar sesiones:', e.message);
}
function persistSessions() {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(sessions), null, 2), 'utf8');
  } catch (e) { console.error('Error guardando sesiones:', e.message); }
}
setInterval(() => {
  // limpiar sesiones >30min
  const now = Date.now();
  for (const [k, s] of sessions) {
    if (now - (s.createdAt || 0) > 1000 * 60 * 30) sessions.delete(k);
  }
  persistSessions();
}, 1000 * 60 * 5);

function appendLog(line) {
  try { fs.appendFileSync(LOG_FILE, line + '\n', 'utf8'); } catch (e) { console.error('Error escribiendo log:', e.message); }
}
function logAction(type, details = {}) {
  const line = `[${new Date().toISOString()}] ${type}: ${JSON.stringify(details)}`;
  appendLog(line);
  console.log(line);
}

function escapeHtml(s = '') {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

// ---- Discord helpers ----
const discordBase = 'https://discord.com/api/v10';
async function discordRequest(method, url, body = null) {
  // url like '/guilds/ID/...'
  const res = await axios({
    method,
    url: discordBase + url,
    headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    data: body,
    validateStatus: () => true
  });
  return res;
}

// get bot id at startup
let BOT_ID = null;
(async () => {
  try {
    const r = await axios.get(`${discordBase}/users/@me`, { headers: { Authorization: `Bot ${BOT_TOKEN}` }});
    BOT_ID = r.data.id;
    console.log('Bot ID:', BOT_ID);
  } catch (e) { console.error('No pude obtener BOT_ID:', e.response?.data || e.message); }
})();

// permission bits map
const PERM_BITS = {
  CREATE_INSTANT_INVITE: 1n << 0n,
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  VIEW_AUDIT_LOG: 1n << 7n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  MANAGE_NICKNAMES: 1n << 27n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_WEBHOOKS: 1n << 29n,
  MANAGE_EMOJIS_AND_STICKERS: 1n << 30n
};

// helper: check if user is owner or admin
async function verifyOwnerOrAdmin(userAccessToken, guildId) {
  try {
    const r = await axios.get(`${discordBase}/users/@me/guilds`, { headers: { Authorization: `Bearer ${userAccessToken}` }});
    if (!Array.isArray(r.data)) return false;
    const g = r.data.find(x => x.id === guildId);
    if (!g) return false;
    if (g.owner === true) return true;
    try {
      const perms = BigInt(g.permissions || '0');
      const ADMIN = BigInt(0x8);
      return (perms & ADMIN) !== BigInt(0);
    } catch { return false; }
  } catch (e) {
    console.error('verifyOwnerOrAdmin error', e.response?.data || e.message);
    return false;
  }
}

// ---- OAuth login & callback ----
const usedCodes = new Set();

app.get('/login', (req, res) => {
  const url = 'https://discord.com/oauth2/authorize' +
    `?client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code&scope=identify%20guilds`;
  res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abyssus — Login</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
    :root{--accent:#5865F2;--accent2:#764ba2}
    body{font-family:Inter,Arial;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0f14;color:#eaf2ff;padding:24px}
    .card{width:100%;max-width:720px;background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));padding:28px;border-radius:12px;border:1px solid rgba(255,255,255,0.03);display:flex;gap:20px;align-items:center}
    .logo{width:72px;height:72px;border-radius:12px;background:linear-gradient(135deg,#243b6b,#5b3a86);display:flex;align-items:center;justify-content:center;font-weight:800;color:white;font-size:20px}
    .btn{background:linear-gradient(90deg,var(--accent),var(--accent2));color:white;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700}
  </style></head><body>
  <div class="card"><div class="logo">A</div><div style="flex:1"><h1 style="margin:0 0 .3rem">Abyssus — Panel</h1><p style="margin:0 0 12px">Inicia sesión con Discord para ver tus servidores donde eres owner o tienes permisos de administrador y Abyssus está instalado.</p><a class="btn" href="${url}">Iniciar con Discord</a></div></div></body></html>`);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login');
  if (usedCodes.has(code)) return res.send('<h2>⚠️ Código ya usado — vuelve a iniciar sesión</h2>');
  usedCodes.add(code);

  try {
    const tokenResp = await axios.post(`${discordBase}/oauth2/token`,
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const accessToken = tokenResp.data.access_token;
    const refreshToken = tokenResp.data.refresh_token;

    const userRes = await axios.get(`${discordBase}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` }});
    const u = userRes.data;

    sessions.set(u.id, { id: u.id, username: u.username, discriminator: u.discriminator, avatar: u.avatar, accessToken, refreshToken, createdAt: Date.now() });
    persistSessions();

    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autenticado</title>
      <style>body{font-family:Inter,Arial;background:#071022;color:#eaf2ff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#071022;padding:28px;border-radius:12px;border:1px solid rgba(255,255,255,0.03);text-align:center}</style>
      </head><body><div class="card"><img src="https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png" style="width:84px;height:84px;border-radius:12px;margin-bottom:12px" onerror="this.style.display='none'"/><h2>¡Autenticación exitosa!</h2><p style="opacity:.9">${escapeHtml(u.username)}#${escapeHtml(u.discriminator)}</p><a style="display:inline-block;margin-top:12px;padding:10px 14px;border-radius:10px;background:linear-gradient(90deg,#5865F2,#764ba2);color:#fff;text-decoration:none" href="/mis-guilds/${u.id}">Ver mis servidores</a></div></body></html>`);
  } catch (e) {
    console.error('callback error:', e.response?.data || e.message);
    res.status(500).send(`<h2>Error OAuth2</h2><pre>${escapeHtml(JSON.stringify(e.response?.data || e.message, null, 2))}</pre>`);
  }
});

// ---- List guilds (owner or admin) where bot is present ----
app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const ses = sessions.get(userId);
  if (!ses) return res.redirect('/login');

  try {
    const guildsRes = await axios.get(`${discordBase}/users/@me/guilds`, { headers: { Authorization: `Bearer ${ses.accessToken}` }});
    const allGuilds = Array.isArray(guildsRes.data) ? guildsRes.data : [];
    const allowed = allGuilds.filter(g => g.owner === true || ((BigInt(g.permissions || '0') & BigInt(0x8)) !== BigInt(0)));

    // check bot presence
    const botPresent = [];
    const CONC = 6;
    for (let i = 0; i < allowed.length; i += CONC) {
      const chunk = allowed.slice(i, i+CONC);
      await Promise.all(chunk.map(async g => {
        try {
          const info = await discordRequest('get', `/guilds/${g.id}?with_counts=true`);
          if (info.status === 200) {
            botPresent.push({ id: g.id, name: g.name, icon: g.icon, member_count: info.data.approximate_member_count || 'N/A', roles_count: Array.isArray(info.data.roles) ? info.data.roles.length : 'N/A' });
          }
        } catch {}
      }));
    }

    const htmlItems = botPresent.length ? botPresent.map(g => {
      const icon = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : 'https://via.placeholder.com/64/111318/ffffff?text=?';
      return `<li class="card-item"><img src="${icon}" class="gicon"/><div class="meta"><div class="name">${escapeHtml(g.name)}</div><div class="sub">👥 ${g.member_count} • 🧾 ${g.roles_count}</div></div><div class="actions"><a class="btn" href="/panel/${g.id}?userId=${userId}">Abrir panel</a></div></li>`;
    }).join('') : `<div class="empty">No hay servidores (owner/admin) donde Abyssus esté presente.</div>`;

    res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abyssus — Mis servidores</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
      :root{--accent:#5865F2;--accent2:#764ba2}
      body{font-family:Inter,Arial;background:#0a0d12;color:#eaf2ff;margin:0;padding:28px}
      .wrap{max-width:1100px;margin:0 auto}
      header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
      .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
      .card-item{display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));border:1px solid rgba(255,255,255,0.03)}
      .gicon{width:56px;height:56px;border-radius:10px;object-fit:cover}
      .meta{flex:1}
      .name{font-weight:600}
      .sub{opacity:.85;font-size:.92rem;margin-top:6px}
      .btn{background:linear-gradient(90deg,var(--accent),var(--accent2));color:white;padding:8px 12px;border-radius:8px;text-decoration:none;font-weight:700}
      .empty{padding:18px;border-radius:10px;background:#071022;text-align:center}
    </style></head><body>
    <div class="wrap"><header><div><h2>Dashboard Abyssus</h2><div style="opacity:.8">Usa el panel para moderación, gestión de roles/perm y logs</div></div><div><a class="btn" href="/login">Cambiar cuenta</a></div></header><section class="grid">${htmlItems}</section><p style="opacity:.8;margin-top:14px">Si no ves un servidor, verifica permisos o que Abyssus esté invitado.</p></div></body></html>`);
  } catch (e) {
    console.error('mis-guilds err:', e.response?.data || e.message);
    res.status(500).send(`<h2>Error</h2><pre>${escapeHtml(JSON.stringify(e.response?.data || e.message, null, 2))}</pre>`);
  }
});

// ---- require session middleware ----
function requireSession(req, res, next) {
  const userId = req.query.userId || req.body.userId;
  if (!userId) return res.status(400).send('Falta userId');
  const s = sessions.get(userId);
  if (!s) return res.status(401).send('No autenticado');
  req.sessionUserId = userId;
  req.session = s;
  next();
}

// ---- API: check bot permissions & role position ----
app.get('/api/check-bot-permissions/:guildId', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  try {
    // check bot in guild
    const guildRes = await discordRequest('get', `/guilds/${guildId}`);
    if (guildRes.status !== 200) return res.json({ botInGuild: false, reason: 'Bot no en guild o sin acceso' });

    // roles and botMember
    const [rolesRes, botMemberRes] = await Promise.all([
      discordRequest('get', `/guilds/${guildId}/roles`),
      BOT_ID ? discordRequest('get', `/guilds/${guildId}/members/${BOT_ID}`) : { status: 404 }
    ]);

    const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
    const botMember = botMemberRes.status === 200 ? botMemberRes.data : null;

    // compute permissions from botMember (guild-level role union)
    // discord returns member.roles array (role ids), and roles list contains permission per role
    let botPermBit = 0n;
    let botRolePosition = null;
    if (botMember) {
      for (const rid of botMember.roles || []) {
        const r = roles.find(x => x.id === rid);
        if (r) {
          try { botPermBit |= BigInt(r.permissions || '0'); } catch {}
          if (botRolePosition === null || (r.position > botRolePosition)) botRolePosition = r.position;
        }
      }
    }

    // helper to test bit
    const hasPerm = (bit) => (BigInt(botPermBit || 0n) & BigInt(bit)) !== 0n;

    // determine highest editable role (role with highest position less than botRolePosition)
    let highestEditable = null;
    if (botRolePosition !== null) {
      // role positions: higher number => higher rank
      const editable = roles.filter(r => r.position < botRolePosition);
      if (editable.length) highestEditable = Math.max(...editable.map(r => r.position));
    }

    res.json({
      botInGuild: !!botMember,
      botRolePosition,
      highestEditableRolePosition: highestEditable,
      permissions: {
        MANAGE_ROLES: hasPerm(PERM_BITS.MANAGE_ROLES),
        MANAGE_CHANNELS: hasPerm(PERM_BITS.MANAGE_CHANNELS),
        KICK_MEMBERS: hasPerm(PERM_BITS.KICK_MEMBERS),
        BAN_MEMBERS: hasPerm(PERM_BITS.BAN_MEMBERS),
        MANAGE_MESSAGES: hasPerm(PERM_BITS.MANAGE_MESSAGES),
        ADMINISTRATOR: hasPerm(PERM_BITS.ADMINISTRATOR)
      }
    });
  } catch (e) {
    console.error('check-bot-perms err:', e.response?.data || e.message);
    res.status(500).json({ error: 'Error verificando permisos', details: e.response?.data || e.message });
  }
});

// ---- invite generator helper (permissions integer) ----
function buildInviteUrl(clientId, permsNumber) {
  // scopes: bot + applications.commands (optional)
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=${permsNumber}`;
}

// ---- Panel: guild page with roles UI including edit permissions ----
app.get('/panel/:guildId', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const userId = req.sessionUserId;
  const ses = req.session;

  try {
    const allowed = await verifyOwnerOrAdmin(ses.accessToken, guildId);
    if (!allowed) return res.status(403).send('No autorizado (owner/admin requerido)');

    // fetch guild data with bot
    const [giRes, rolesRes, channelsRes, membersRes] = await Promise.all([
      discordRequest('get', `/guilds/${guildId}?with_counts=true`),
      discordRequest('get', `/guilds/${guildId}/roles`),
      discordRequest('get', `/guilds/${guildId}/channels`),
      discordRequest('get', `/guilds/${guildId}/members?limit=100`)
    ]);

    if (giRes.status >= 400) return res.status(giRes.status).send(`Error guild: ${safeString(giRes.data)}`);
    const guild = giRes.data;
    const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
    const channels = Array.isArray(channelsRes.data) ? channelsRes.data : [];
    const members = Array.isArray(membersRes.data) ? membersRes.data : [];

    const iconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : '';

    // build roles UI rows (we'll embed the permissions value to the page)
    const rolesRows = roles.map(r => {
      return `<tr data-roleid="${r.id}">
        <td style="width:1px">${escapeHtml(r.name)}</td>
        <td style="width:220px"><code>${r.id}</code></td>
        <td style="width:120px">${r.position}</td>
        <td style="width:160px"><button onclick="openEditPerms('${r.id}')" class="btn small">Editar permisos</button></td>
      </tr>`;
    }).join('');

    // default invite perms recommended (Manage Roles + Manage Channels + Kick + Ban + Send Messages)
    const recommendedPerms = (
      Number(PERM_BITS.MANAGE_ROLES) +
      Number(PERM_BITS.MANAGE_CHANNELS) +
      Number(PERM_BITS.KICK_MEMBERS) +
      Number(PERM_BITS.BAN_MEMBERS) +
      Number(PERM_BITS.SEND_MESSAGES || 0n)
    );

    // read guild logs
    let logsForGuild = '';
    try {
      const raw = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8') : '';
      const lines = raw.split('\n').filter(l => l && l.includes(guildId));
      logsForGuild = lines.reverse().slice(0,200).join('\n') || 'No hay logs para este servidor.';
    } catch (e) { logsForGuild = 'Error leyendo logs'; }

    // render page (HTML + JS)
    res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abyssus — Panel ${escapeHtml(guild.name)}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
      :root{--accent:#5865F2;--accent2:#764ba2}
      body{font-family:Inter,Arial;margin:0;background:#090b0f;color:#eaf2ff;padding:18px}
      .wrap{max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
      .top{display:flex;gap:12px;align-items:center}
      .icon{width:96px;height:96px;border-radius:12px;object-fit:cover}
      .stats{display:flex;gap:8px;margin-top:8px}
      .stat{background:rgba(255,255,255,0.02);padding:8px 10px;border-radius:8px;font-weight:600}
      .main{display:flex;gap:12px;flex-wrap:wrap}
      .panel{flex:1 1 420px;background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.03);max-height:720px;overflow:auto}
      table{width:100%;border-collapse:collapse}
      tr{border-bottom:1px solid rgba(255,255,255,0.03)}
      td,th{padding:8px;text-align:left}
      .btn{background:linear-gradient(90deg,var(--accent),var(--accent2));color:white;padding:8px 10px;border-radius:8px;text-decoration:none;font-weight:700;border:0;cursor:pointer}
      .btn.small{padding:6px 8px;font-size:.9rem}
      .danger{background:#ff7b7b;color:#2b0505}
      .muted{opacity:.9}
      input,select,textarea{width:100%;padding:8px;border-radius:8px;border:0;outline:none;background:#0f1216;color:#eaf2ff;margin-bottom:8px}
      .modal{position:fixed;left:0;right:0;top:0;bottom:0;background:rgba(0,0,0,0.6);display:none;align-items:center;justify-content:center;padding:16px}
      .modal .card{background:#0b0f14;padding:18px;border-radius:10px;max-width:760px;width:100%}
      .perms-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}
      label.perm{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.02);padding:8px;border-radius:8px}
      .logbox{background:#071018;padding:12px;border-radius:8px;color:#bfe0ff;max-height:220px;overflow:auto;white-space:pre-wrap}
      @media(max-width:900px){ .main{flex-direction:column} }
    </style></head><body>
    <div class="wrap">
      <div class="top"><img class="icon" src="${iconUrl}" alt="icon"/><div><h1>${escapeHtml(guild.name)}</h1><div style="opacity:.85">ID: ${guild.id}</div><div class="stats"><div class="stat">👥 ${guild.approximate_member_count || 'N/A'}</div><div class="stat">💬 ${channels.length}</div><div class="stat">🧾 ${roles.length}</div></div></div></div>

      <div class="main">
        <div class="panel">
          <h2>Roles</h2>
          <table><thead><tr><th>Nombre</th><th>ID</th><th>Pos</th><th>Acciones</th></tr></thead><tbody id="rolesTable">${rolesRows}</tbody></table>
          <div style="margin-top:12px"><input id="newRoleName" placeholder="Nombre del rol"/><button class="btn" onclick="createRole()">Crear rol</button></div>
          <hr style="margin:12px 0;border-top:1px solid rgba(255,255,255,0.03)"/>
          <h3>Editar permisos (rol)</h3>
          <p class="muted">Usa "Editar permisos" junto al rol que quieras modificar. Requiere que el rol del bot esté por encima del rol a editar y que el bot tenga Manage Roles.</p>
        </div>

        <div class="panel">
          <h2>Canales</h2>
          <div style="margin-bottom:8px">${channels.map(c => `<div># ${escapeHtml(c.name)} <small style="opacity:.8">(${c.id})</small></div>`).join('')}</div>
          <input id="newChannelName" placeholder="nombre-del-canal"/><button class="btn" onclick="createChannel()">Crear canal</button>
        </div>
      </div>

      <div class="main">
        <div class="panel">
          <h2>Verificación del bot</h2>
          <div id="botPermsBox">Cargando verificación...</div>
          <div style="margin-top:8px"><button class="btn" onclick="checkBotPerms()">Actualizar verificación</button> <a class="btn" id="inviteBtn" href="#" target="_blank">Generar invite corregido</a></div>
        </div>

        <div class="panel">
          <h2>Logs del servidor</h2>
          <div class="logbox" id="logBox">${escapeHtml(logsForGuild)}</div>
          <div style="margin-top:8px"><button onclick="refreshLogs()" class="btn">Actualizar logs</button> <button class="danger" onclick="clearLogs()">Borrar logs</button></div>
        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:space-between;margin-top:6px"><a class="btn" href="/mis-guilds/${userId}">← Volver</a><a class="btn" href="https://discord.com/channels/${guild.id}" target="_blank">Abrir en Discord</a></div>
    </div>

    <!-- Modal editar permisos -->
    <div id="modal" class="modal"><div class="card"><h3 id="modalTitle">Editar permisos</h3>
      <div style="display:flex;gap:12px">
        <div style="flex:1">
          <div class="perms-grid" id="permsGrid">
            <!-- checkboxes in JS -->
          </div>
        </div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" onclick="applyPerms()">Guardar permisos</button>
        <button class="danger" onclick="closeModal()">Cancelar</button>
      </div>
    </div></div>

    <script>
      const userId = '${userId}';
      const guildId = '${guild.id}';
      const BOT_ID = '${BOT_ID || ''}';
      const RECOMMENDED_PERMS = ${Number(recommendedPerms)};

      // permissions to expose in UI (key => {bit, label})
      const PERMS_UI = {
        MANAGE_ROLES: { bit: ${PERM_BITS.MANAGE_ROLES} , label: 'Manage Roles' },
        MANAGE_CHANNELS: { bit: ${PERM_BITS.MANAGE_CHANNELS} , label: 'Manage Channels' },
        KICK_MEMBERS: { bit: ${PERM_BITS.KICK_MEMBERS} , label: 'Kick Members' },
        BAN_MEMBERS: { bit: ${PERM_BITS.BAN_MEMBERS} , label: 'Ban Members' },
        MANAGE_MESSAGES: { bit: ${PERM_BITS.MANAGE_MESSAGES} , label: 'Manage Messages' },
        ADMINISTRATOR: { bit: ${PERM_BITS.ADMINISTRATOR} , label: 'Administrator' },
        MANAGE_NICKNAMES: { bit: ${PERM_BITS.MANAGE_NICKNAMES} , label: 'Manage Nicknames' },
        MANAGE_EMOJIS_AND_STICKERS: { bit: ${PERM_BITS.MANAGE_EMOJIS_AND_STICKERS} , label: 'Manage Emojis' }
      };

      let editingRoleId = null;
      async function openEditPerms(roleId) {
        editingRoleId = roleId;
        document.getElementById('modalTitle').textContent = 'Editar permisos — ' + roleId;
        // fetch role info from server (we already have full roles data on page? but fetch latest)
        try {
          const res = await fetch('/api/guilds/' + guildId + '/role-info?roleId=' + roleId + '&userId=' + userId);
          if (!res.ok) { alert(await res.text()); return; }
          const r = await res.json();
          const permVal = BigInt(r.permissions || '0');
          const grid = document.getElementById('permsGrid');
          grid.innerHTML = '';
          for (const key of Object.keys(PERMS_UI)) {
            const item = PERMS_UI[key];
            const checked = (permVal & BigInt(item.bit)) !== 0n;
            const id = 'chk_' + key;
            const label = document.createElement('label');
            label.className = 'perm';
            label.innerHTML = \`<input id="\${id}" type="checkbox" \${checked ? 'checked' : ''}/> <span>\${item.label}</span>\`;
            grid.appendChild(label);
          }
          // show modal
          document.getElementById('modal').style.display = 'flex';
        } catch (e) { alert('Error al obtener role info'); }
      }
      function closeModal() { document.getElementById('modal').style.display = 'none'; editingRoleId = null; }

      async function applyPerms() {
        if (!editingRoleId) return;
        // compute new permissions bit
        let total = 0n;
        for (const key of Object.keys(PERMS_UI)) {
          const item = PERMS_UI[key];
          const el = document.getElementById('chk_' + key);
          if (el && el.checked) total |= BigInt(item.bit);
        }
        // send to server
        try {
          const res = await fetch('/api/guilds/' + guildId + '/edit-role-perms', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ userId, roleId: editingRoleId, permissions: total.toString() })
          });
          const txt = await res.text();
          if (!res.ok) throw new Error(txt);
          alert('Permisos actualizados');
          closeModal();
          location.reload();
        } catch (e) { alert('Error: ' + e.message); }
      }

      async function createRole() {
        const name = document.getElementById('newRoleName').value.trim();
        if (!name) return alert('Nombre requerido');
        if (!confirm('Crear rol: ' + name + ' ?')) return;
        const res = await fetch('/api/guilds/' + guildId + '/create-role', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId, name })});
        const txt = await res.text();
        if (!res.ok) return alert('Error: ' + txt);
        alert(txt); location.reload();
      }

      async function createChannel() {
        const name = document.getElementById('newChannelName').value.trim();
        if (!name) return alert('Nombre requerido');
        if (!confirm('Crear canal: ' + name + ' ?')) return;
        const res = await fetch('/api/guilds/' + guildId + '/create-channel', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId, name })});
        const txt = await res.text();
        if (!res.ok) return alert('Error: ' + txt);
        alert(txt); location.reload();
      }

      async function checkBotPerms() {
        try {
          const res = await fetch('/api/check-bot-permissions/' + guildId + '?userId=' + userId);
          const j = await res.json();
          const box = document.getElementById('botPermsBox');
          if (!j.botInGuild) {
            box.innerHTML = '<div style="color:#ffb3b3">El bot no está en el servidor o no se puede acceder.</div>';
            const invite = buildInviteUrl(RECOMMENDED_PERMS);
            document.getElementById('inviteBtn').href = invite;
            document.getElementById('inviteBtn').textContent = 'Invitar bot (permisos recomendados)';
            return;
          }
          let html = '';
          html += '<div><strong>Bot presente</strong></div>';
          html += '<ul>';
          for (const k of Object.keys(j.permissions)) {
            html += '<li>' + k + ': ' + (j.permissions[k] ? '✅' : '❌') + '</li>';
          }
          html += '</ul>';
          html += '<div style="margin-top:8px">Bot role pos: ' + (j.botRolePosition ?? 'N/A') + ' — Highest editable role pos: ' + (j.highestEditableRolePosition ?? 'N/A') + '</div>';
          if (!j.permissions.MANAGE_ROLES || !j.permissions.MANAGE_CHANNELS) {
            html += '<div style="color:#ffd88c;margin-top:6px">⚠️ Al bot le faltan permisos importantes para gestionar roles o canales.</div>';
            document.getElementById('inviteBtn').href = buildInviteUrl(RECOMMENDED_PERMS);
            document.getElementById('inviteBtn').textContent = 'Invitar con permisos recomendados';
          } else {
            html += '<div style="color:#bfffbf;margin-top:6px">✅ Permisos básicos OK</div>';
            document.getElementById('inviteBtn').href = '#';
            document.getElementById('inviteBtn').textContent = 'Invitar (no necesario)';
          }
          box.innerHTML = html;
        } catch (e) { alert('Error al verificar permisos'); }
      }

      function buildInviteUrl(permsNum) {
        return '/api/invite?perms=' + permsNum; // server endpoint will redirect or return URL
      }

      async function refreshLogs() {
        try {
          const res = await fetch('/logs/' + guildId + '?userId=' + userId);
          const txt = await res.text();
          document.getElementById('logBox').textContent = txt;
        } catch { alert('Error al obtener logs'); }
      }
      async function clearLogs() {
        if (!confirm('Borrar logs de este servidor?')) return;
        try {
          const res = await fetch('/logs/' + guildId + '/clear', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId })});
          const txt = await res.text();
          alert(txt);
          refreshLogs();
        } catch { alert('Error al borrar logs'); }
      }

      // initial
      checkBotPerms();
    </script>
    </body></html>`);
  } catch (e) {
    console.error('panel err:', e.response?.data || e.message);
    res.status(500).send(`<h2>Error</h2><pre>${escapeHtml(JSON.stringify(e.response?.data || e.message, null, 2))}</pre>`);
  }
});

// ---- API: role info (used by modal) ----
app.get('/api/guilds/:guildId/role-info', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const roleId = req.query.roleId;
  const ses = req.session;
  if (!roleId) return res.status(400).send('Falta roleId');

  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('get', `/guilds/${guildId}/roles`);
    if (r.status >= 400) return res.status(r.status).send(safeString(r.data));
    const role = (r.data || []).find(x => x.id === roleId);
    if (!role) return res.status(404).send('Rol no encontrado');
    res.json(role);
  } catch (e) {
    console.error('role-info err:', e.response?.data || e.message);
    res.status(500).send('Error');
  }
});

// ---- API: edit role permissions (applies PATCH to role) ----
app.post('/api/guilds/:guildId/edit-role-perms', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { roleId, permissions } = req.body;
  const ses = req.session;
  if (!roleId || typeof permissions === 'undefined') return res.status(400).send('Falta roleId o permissions');

  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');

    // check bot role position too
    const [rolesRes, botMemberRes] = await Promise.all([
      discordRequest('get', `/guilds/${guildId}/roles`),
      BOT_ID ? discordRequest('get', `/guilds/${guildId}/members/${BOT_ID}`) : { status:404 }
    ]);
    if (rolesRes.status >= 400) return res.status(rolesRes.status).send('Error roles');
    const roles = rolesRes.data;
    const botMember = botMemberRes.status === 200 ? botMemberRes.data : null;
    if (!botMember) return res.status(403).send('Bot no en el servidor o sin acceso');

    const botHighest = Math.max(...(roles.filter(r => (botMember.roles||[]).includes(r.id)).map(r=>r.position).concat([-999])));
    const targetRole = roles.find(r => r.id === roleId);
    if (!targetRole) return res.status(404).send('Rol no encontrado');
    if (targetRole.position >= botHighest) return res.status(403).send('No puedes editar un rol igual o superior al rol del bot. Sube el rol del bot en la jerarquía.');

    // apply patch
    const r = await discordRequest('patch', `/guilds/${guildId}/roles/${roleId}`, { permissions: String(permissions) });
    if (r.status >= 400) return res.status(r.status).send(JSON.stringify(r.data));
    logAction('EDIT_ROLE_PERMS', { guildId, roleId, by: ses.id, permissions });
    appendLog(`[${new Date().toISOString()}] GUILD:${guildId} EDIT_ROLE_PERMS role:${roleId} by:${ses.id} perms:${permissions}`);
    return res.send('✅ Permisos actualizados');
  } catch (e) {
    console.error('edit-role-perms err:', e.response?.data || e.message);
    res.status(500).send(e.response?.data ? JSON.stringify(e.response.data) : e.message);
  }
});

// ---- other management API endpoints (create/delete role/channel, message, kick/ban/timeout) ----
// Implement similar to earlier but with owner/admin check and logging
app.post('/api/guilds/:guildId/create-role', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const { name } = req.body; const ses = req.session;
  if (!name) return res.status(400).send('Falta name');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('post', `/guilds/${guildId}/roles`, { name });
    if (r.status >= 400) return res.status(r.status).send(JSON.stringify(r.data));
    logAction('CREATE_ROLE', { guildId, name, by: ses.id });
    appendLog(`[${new Date().toISOString()}] GUILD:${guildId} CREATE_ROLE name:${name} by:${ses.id}`);
    res.send('✅ Rol creado');
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

app.post('/api/guilds/:guildId/create-channel', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const { name } = req.body; const ses = req.session;
  if (!name) return res.status(400).send('Falta name');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('post', `/guilds/${guildId}/channels`, { name, type: 0 });
    if (r.status >= 400) return res.status(r.status).send(JSON.stringify(r.data));
    logAction('CREATE_CHANNEL', { guildId, name, by: ses.id });
    appendLog(`[${new Date().toISOString()}] GUILD:${guildId} CREATE_CHANNEL name:${name} by:${ses.id}`);
    res.send('✅ Canal creado');
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

// message
app.post('/api/guilds/:guildId/message', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const { channelId, content } = req.body; const ses = req.session;
  if (!channelId || !content) return res.status(400).send('Falta channelId o content');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('post', `/channels/${channelId}/messages`, { content });
    if (r.status >= 400) return res.status(r.status).send(JSON.stringify(r.data));
    logAction('MESSAGE', { guildId, channelId, by: ses.id, content: content.slice(0,2000) });
    appendLog(`[${new Date().toISOString()}] GUILD:${guildId} MESSAGE channel:${channelId} by:${ses.id}`);
    res.send('✅ Mensaje enviado');
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

// kick/ban/timeout
app.post('/api/guilds/:guildId/kick', requireSession, async (req, res) => {
  const { guildId } = req.params; const { targetId } = req.body; const ses = req.session;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('delete', `/guilds/${guildId}/members/${targetId}`);
    if (r.status >= 400) return res.status(r.status).send(JSON.stringify(r.data));
    logAction('KICK', { guildId, targetId, by: ses.id });
    appendLog(`[${new Date().toISOString()}] GUILD:${guildId} KICK target:${targetId} by:${ses.id}`);
    res.send('✅ Usuario expulsado');
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

app.post('/api/guilds/:guildId/ban', requireSession, async (req, res) => {
  const { guildId } = req.params; const { targetId, deleteMessageDays = 0, reason = 'Banned via panel' } = req.body; const ses = req.session;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const payload = { reason };
    if (deleteMessageDays) payload.delete_message_seconds = deleteMessageDays * 24 * 3600;
    const r = await discordRequest('put', `/guilds/${guildId}/bans/${targetId}`, payload);
    if (r.status >= 400) return res.status(r.status).send(JSON.stringify(r.data));
    logAction('BAN', { guildId, targetId, by: ses.id, reason });
    appendLog(`[${new Date().toISOString()}] GUILD:${guildId} BAN target:${targetId} by:${ses.id}`);
    res.send('✅ Usuario baneado');
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

app.post('/api/guilds/:guildId/timeout', requireSession, async (req, res) => {
  const { guildId } = req.params; const { targetId, minutes = 10 } = req.body; const ses = req.session;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const until = new Date(Date.now() + (minutes||10)*60*1000).toISOString();
    const r = await discordRequest('patch', `/guilds/${guildId}/members/${targetId}`, { communication_disabled_until: until });
    if (r.status >= 400) return res.status(r.status).send(JSON.stringify(r.data));
    logAction('TIMEOUT', { guildId, targetId, by: ses.id, minutes });
    appendLog(`[${new Date().toISOString()}] GUILD:${guildId} TIMEOUT target:${targetId} by:${ses.id} minutes:${minutes}`);
    res.send('✅ Timeout aplicado');
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

// ---- Logs endpoints ----
app.get('/logs/:guildId', requireSession, async (req, res) => {
  const { guildId } = req.params; const ses = req.session;
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    if (!fs.existsSync(LOG_FILE)) return res.send('No hay logs.');
    const raw = fs.readFileSync(LOG_FILE,'utf8');
    const lines = raw.split('\n').filter(l=>l && l.includes(guildId));
    res.send(lines.reverse().join('\n') || 'No hay logs para este servidor.');
  } catch (e) { console.error(e); res.status(500).send('Error leyendo logs'); }
});

app.post('/logs/:guildId/clear', requireSession, async (req, res) => {
  const { guildId } = req.params; const ses = req.session;
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    if (!fs.existsSync(LOG_FILE)) return res.send('No hay logs.');
    const raw = fs.readFileSync(LOG_FILE,'utf8');
    const lines = raw.split('\n').filter(l => l && !l.includes(guildId));
    fs.writeFileSync(LOG_FILE, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
    res.send('✅ Logs borrados para el servidor');
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

// ---- Invite endpoint (returns redirect to invite URL) ----
app.get('/api/invite', (req, res) => {
  const perms = req.query.perms || 0;
  const url = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=bot%20applications.commands&permissions=${perms}`;
  res.redirect(url);
});

// ---- util ----
function safeString(o) { try { return JSON.stringify(o); } catch { return String(o); } }

// ---- Start ----
app.listen(PORT, () => {
  console.log(`Abyssus Panel escuchando en puerto ${PORT}`);
});


























































































