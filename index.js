// index.js
// Abyssus - Panel completo (single-file)
// Requisitos: .env con BOT_TOKEN, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI
// npm install express axios dotenv
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.static('public'));
app.use(express.json());

// ----------------- In-memory stores -----------------
const usuariosAutenticados = new Map(); // userId -> { accessToken, refreshToken, username, ... , createdAt }
const codigosUsados = new Set();
const MODS_FILE = path.join(__dirname, 'moderators.json');

// ensure moderators file exists
if (!fs.existsSync(MODS_FILE)) {
  try { fs.writeFileSync(MODS_FILE, JSON.stringify({}, null, 2), 'utf8'); } catch (e) { console.error('Error creando moderators.json', e); }
}
function readModeratorsFile() {
  try { return JSON.parse(fs.readFileSync(MODS_FILE, 'utf8') || '{}'); } catch { return {}; }
}
function writeModeratorsFile(obj) {
  try { fs.writeFileSync(MODS_FILE, JSON.stringify(obj, null, 2), 'utf8'); } catch (e) { console.error('Error escribiendo moderators.json', e); }
}

// ----------------- Discord permission bits (constants) -----------------
const PERMS = {
  KICK_MEMBERS: BigInt(1 << 1),            // 2
  BAN_MEMBERS: BigInt(1 << 2),             // 4
  ADMINISTRATOR: BigInt(1 << 3),           // 8
  MANAGE_CHANNELS: BigInt(1 << 4),         // 16
  MANAGE_GUILD: BigInt(1 << 5),            // 32
  MANAGE_ROLES: BigInt(1 << 28),           // 268435456
  // add more if needed
};

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
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function logAction(type, details) {
  try {
    const line = `[${new Date().toISOString()}] ${type}: ${JSON.stringify(details)}\n`;
    fs.appendFileSync(path.join(__dirname, 'acciones.log'), line, { encoding: 'utf8' });
  } catch (e) {
    console.error('Error escribiendo log:', e);
  }
}
async function discordRequest(method, url, body = null, headers = {}) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) throw new Error('Falta BOT_TOKEN en .env');
  return axios({
    method,
    url: `https://discord.com/api/v10${url}`,
    headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json', ...headers },
    data: body
  });
}

// ----------------- Session cleanup -----------------
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of usuariosAutenticados) {
    if (now - s.createdAt > 1000 * 60 * 30) usuariosAutenticados.delete(id); // 30 min
  }
}, 1000 * 60 * 5);

// ----------------- /login -----------------
app.get('/login', (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const redirect = process.env.REDIRECT_URI;
  if (!clientId || !redirect) return res.status(500).send('Falta CLIENT_ID o REDIRECT_URI en .env');

  const authorizeUrl =
    'https://discord.com/oauth2/authorize' +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&response_type=code` +
    `&scope=identify%20guilds`;

  return res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Abyssus — Login</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
    :root{--accent:#5865F2;--accent2:#764ba2}
    body{font-family:Inter,system-ui,Arial;background:#0b0f14;color:#eaf2ff;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{width:100%;max-width:720px;background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));padding:28px;border-radius:12px;border:1px solid rgba(255,255,255,0.03);display:flex;gap:20px;align-items:center}
    .logo{width:72px;height:72px;border-radius:12px;background:linear-gradient(135deg,#243b6b,#5b3a86);display:flex;align-items:center;justify-content:center;font-weight:800;color:white;font-size:20px}
    h1{margin:0;font-size:1.4rem}
    p{margin:6px 0 14px;color:rgba(234,242,255,0.85)}
    .btn{background:linear-gradient(90deg,var(--accent),var(--accent2));color:white;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700}
  </style></head><body>
  <div class="card">
    <div class="logo">A</div>
    <div style="flex:1">
      <h1>Abyssus — Panel</h1>
      <p>Inicia sesión con Discord para ver los servidores donde tienes permisos (owner/admin/mod).</p>
      <a class="btn" href="${authorizeUrl}">Iniciar sesión con Discord</a>
    </div>
  </div>
  </body></html>`);
});

// ----------------- /callback -----------------
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login');

  if (codigosUsados.has(code)) {
    return res.send('<h2>⚠️ Este código ya fue usado. Vuelve a <a href="/login">iniciar sesión</a>.</h2>');
  }
  codigosUsados.add(code);

  try {
    const tokenResp = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResp.data.access_token;
    const refreshToken = tokenResp.data.refresh_token;

    const userRes = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` }});
    const user = userRes.data;

    usuariosAutenticados.set(user.id, {
      accessToken,
      refreshToken,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      createdAt: Date.now()
    });

    return res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abyssus — Autenticado</title>
      <style>body{font-family:Inter,Arial;background:#0b0f14;color:#eaf2ff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#071022;padding:28px;border-radius:12px;border:1px solid rgba(255,255,255,0.03);text-align:center}</style>
      </head><body>
      <div class="card">
        <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" alt="" style="width:84px;height:84px;border-radius:12px;margin-bottom:12px" onerror="this.style.display='none'"/>
        <h2>¡Autenticación exitosa!</h2>
        <p style="opacity:.9">${escapeHtml(user.username)}#${escapeHtml(user.discriminator)}</p>
        <a style="display:inline-block;margin-top:12px;padding:10px 14px;border-radius:10px;background:linear-gradient(90deg,#5865F2,#764ba2);color:#fff;text-decoration:none" href="/mis-guilds/${user.id}">Ver mis servidores</a>
      </div>
      </body></html>`);
  } catch (err) {
    console.error('callback error:', err.response?.data || err.message);
    return res.status(500).send(`<h2>Error OAuth2</h2><pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// ----------------- requireSession middleware -----------------
function requireSession(req, res, next) {
  const userId = req.query.userId || req.body.userId;
  if (!userId) return res.status(400).send('Falta userId');
  const ses = usuariosAutenticados.get(userId);
  if (!ses) return res.status(401).send('No autenticado. Por favor inicia sesión.');
  req.sessionUserId = userId;
  req.session = ses;
  next();
}

// ----------------- Helpers for permission checks -----------------

// parse permissions string (from /users/@me/guilds) into BigInt
function parsePerms(permStr) {
  try {
    return BigInt(permStr);
  } catch {
    return BigInt(0);
  }
}

// compute effective permissions for a user in a guild (using Bot API to inspect roles)
async function computePermissionsForUserInGuild(userId, guildId) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) throw new Error('Falta BOT_TOKEN en .env');

  // fetch guild info and roles and member
  const [guildRes, rolesRes, memberRes] = await Promise.all([
    axios.get(`https://discord.com/api/v10/guilds/${guildId}`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
    axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
    axios.get(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }).catch(e => null)
  ]);

  const guild = guildRes.data;
  const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
  const member = memberRes && memberRes.data ? memberRes.data : null;

  // If member not found (bot has no access to members endpoint), return unknown
  if (!member) {
    return { known: false, isOwner: false, permissions: BigInt(0) };
  }

  // if user is guild owner => full permissions
  if (member.user && String(member.user.id) === String(guild.owner_id)) {
    return { known: true, isOwner: true, permissions: BigInt(-1) }; // -1 meaning all perms
  }

  // start with 0 and OR all role permissions
  let permBig = BigInt(0);
  for (const rid of member.roles || []) {
    const role = roles.find(r => r.id === rid);
    if (role && role.permissions) {
      permBig = permBig | BigInt(role.permissions);
    }
  }

  return { known: true, isOwner: false, permissions: permBig };
}

// wrapper used in route to check a textual permission name
async function hasPermission(userId, guildId, permName) {
  const info = await computePermissionsForUserInGuild(userId, guildId);
  if (!info.known) return false;
  if (info.isOwner) return true;
  const permBit = PERMS[permName];
  if (!permBit) return false;
  return (info.permissions & permBit) !== BigInt(0);
}

// quick check via oauth /users/@me/guilds response to see whether user should see guild in list
function oauthGuildHasRelevantPerms(guildObj) {
  const p = parsePerms(guildObj.permissions || '0');
  const mask = PERMS.ADMINISTRATOR | PERMS.MANAGE_GUILD | PERMS.MANAGE_ROLES | PERMS.MANAGE_CHANNELS | PERMS.KICK_MEMBERS | PERMS.BAN_MEMBERS;
  return (p & mask) !== BigInt(0) || guildObj.owner === true;
}

// ----------------- /mis-guilds/:userId -----------------
app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const ses = usuariosAutenticados.get(userId);
  if (!ses) return res.redirect('/login');

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send('Falta BOT_TOKEN en .env');

  try {
    // guilds the user is in (from OAuth)
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${ses.accessToken}` }});
    const allGuilds = Array.isArray(guildsRes.data) ? guildsRes.data : [];

    // filter for owner/admin/mod-like permissions (via oauth perms)
    const candidateGuilds = allGuilds.filter(g => oauthGuildHasRelevantPerms(g));

    // For each candidate, check if bot is present (via bot Guild GET)
    const botPresent = [];
    const CONCURRENCY = 6;
    for (let i = 0; i < candidateGuilds.length; i += CONCURRENCY) {
      const chunk = candidateGuilds.slice(i, i + CONCURRENCY);
      const promises = chunk.map(async g => {
        try {
          const info = await axios.get(`https://discord.com/api/v10/guilds/${g.id}?with_counts=true`, {
            headers: { Authorization: `Bot ${BOT_TOKEN}` }, timeout: 8000
          });
          botPresent.push({
            id: g.id,
            name: g.name,
            icon: g.icon,
            member_count: info.data.approximate_member_count || 'N/A',
            roles_count: Array.isArray(info.data.roles) ? info.data.roles.length : 'N/A',
            bot_installed: true,
            invite_url: `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&scope=bot%20applications.commands&permissions=8&guild_id=${g.id}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}`
          });
        } catch (e) {
          // bot not present or no access -> still include but mark absent
          botPresent.push({
            id: g.id,
            name: g.name,
            icon: g.icon,
            member_count: g.approximate_member_count || 'N/A',
            roles_count: 'N/A',
            bot_installed: false,
            invite_url: `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&scope=bot%20applications.commands&permissions=8&guild_id=${g.id}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}`
          });
        }
      });
      await Promise.all(promises);
      await sleep(100);
    }

    // Build HTML
    const guildsHtml = botPresent.length ? botPresent.map(g => {
      const icon = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : 'https://via.placeholder.com/64/111318/ffffff?text=?';
      const inviteBtn = g.bot_installed
        ? `<span style="opacity:.85">Bot presente</span>`
        : `<a class="invite-btn" href="${g.invite_url}" target="_blank" rel="noopener">Invitar Abyssus</a>`;
      return `<li class="card-item">
        <img src="${icon}" class="gicon" onerror="this.src='https://via.placeholder.com/64/111318/ffffff?text=?'"/>
        <div class="meta"><div class="name">${escapeHtml(g.name)}</div><div class="sub">👥 ${g.member_count} • 🧾 ${g.roles_count}</div></div>
        <div class="actions"><a class="btn" href="/panel/${g.id}?userId=${userId}">Abrir panel</a> ${inviteBtn}</div>
      </li>`;
    }).join('') : `<div class="empty">No eres owner/administrador/moderador en ningún servidor donde estés presente.</div>`;

    return res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Abyssus — Mis servidores</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
      :root{--accent:#5865F2;--accent2:#764ba2}
      body{font-family:Inter,system-ui,Arial;background:#0a0d12;color:#eaf2ff;margin:0;padding:28px}
      .wrap{max-width:1100px;margin:0 auto}
      header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
      .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
      .card-item{display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));border:1px solid rgba(255,255,255,0.03)}
      .gicon{width:56px;height:56px;border-radius:10px;object-fit:cover}
      .meta{flex:1}
      .name{font-weight:600}
      .sub{opacity:.85;font-size:.92rem;margin-top:6px}
      .btn{background:linear-gradient(90deg,var(--accent),var(--accent2));color:white;padding:8px 12px;border-radius:8px;text-decoration:none;font-weight:700}
      .invite-btn{display:inline-block;margin-left:8px;padding:8px 10px;border-radius:8px;background:transparent;border:1px solid rgba(255,255,255,0.06);color:inherit;text-decoration:none;font-weight:600;transition:transform .12s}
      .invite-btn:hover{transform:translateY(-3px)}
      .empty{padding:18px;border-radius:10px;background:#071022;text-align:center}
    </style></head><body>
    <div class="wrap">
      <header><div><h2>Dashboard Abyssus</h2><div style="opacity:.8">Accede al panel para moderación, comandos y logs</div></div><div><a class="btn" href="/login">Cambiar cuenta</a></div></header>
      <section class="grid">${guildsHtml}</section>
     <p style="opacity: 0.85; margin-top: 14px;">
  <strong>Versión Beta:</strong> Verifica que tengas los permisos adecuados si no vez el servidor en la lista.<br>
  ¿Problemas o errores? Contactanos en <a href="mailto:soporte@abyssusbot.info">soporte@abyssusbot.info</a>
</p>
    </div></body></html>`);
  } catch (err) {
    console.error('mis-guilds err:', err.response?.data || err.message);
    return res.status(500).send(`<h2>Error obteniendo servidores</h2><pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// ----------------- /panel/:guildId -----------------
app.get('/panel/:guildId', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const userId = req.sessionUserId;
  const ses = req.session;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send('Falta BOT_TOKEN en .env');

  try {
    // quick verify from oauth list: user must be owner or have relevant perms
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${ses.accessToken}` }});
    const guilds = Array.isArray(guildsRes.data) ? guildsRes.data : [];
    const guildEntry = guilds.find(g => g.id === guildId);

    // If not present in user's oauth guild list or no relevant perms -> 403
    if (!guildEntry || !oauthGuildHasRelevantPerms(guildEntry)) {
      return res.status(403).send('No eres owner/administrador/moderador de este servidor o no tienes permisos suficientes.');
    }

    // Fetch data required for panel via bot
    const [guildInfoRes, rolesRes, channelsRes, membersRes] = await Promise.all([
      axios.get(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/channels`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/members?limit=100`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }).catch(e=>({ data: [] }))
    ]);

    const guild = guildInfoRes.data;
    const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
    const channels = Array.isArray(channelsRes.data) ? channelsRes.data : [];
    const members = Array.isArray(membersRes.data) ? membersRes.data : [];

    // compute permission flags for current user (to enable/disable UI controls)
    const permInfo = await computePermissionsForUserInGuild(userId, guildId);
    const isOwner = permInfo.known && permInfo.isOwner;
    const permissionsBig = permInfo.isOwner ? BigInt(-1) : (permInfo.permissions || BigInt(0));

    const canKick = isOwner || (permissionsBig & PERMS.KICK_MEMBERS) !== BigInt(0);
    const canBan = isOwner || (permissionsBig & PERMS.BAN_MEMBERS) !== BigInt(0);
    const canManageRoles = isOwner || (permissionsBig & PERMS.MANAGE_ROLES) !== BigInt(0) || (permissionsBig & PERMS.ADMINISTRATOR) !== BigInt(0);
    const canManageChannels = isOwner || (permissionsBig & PERMS.MANAGE_CHANNELS) !== BigInt(0) || (permissionsBig & PERMS.ADMINISTRATOR) !== BigInt(0);
    const canSendMessage = isOwner || (permissionsBig & PERMS.ADMINISTRATOR) !== BigInt(0) || (permissionsBig & PERMS.MANAGE_GUILD) !== BigInt(0);

    // load moderator role config for this guild
    const modConfig = readModeratorsFile();
    const markedModRoleIds = Array.isArray(modConfig[guildId]) ? modConfig[guildId] : [];

    const iconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : 'https://via.placeholder.com/128/111318/ffffff?text=?';
    const tipoCanalEmoji = {0:'📝',2:'🎤',4:'📂',13:'🎙️',15:'🗂️'};

    const rolesListHtml = roles.map(r => `<li>${escapeHtml(r.name)} <small style="opacity:.7">(${r.id})</small></li>`).join('');
    const channelsListHtml = channels.map(c => `<li>${tipoCanalEmoji[c.type]||'❔'} ${escapeHtml(c.name)} <small style="opacity:.7">(${c.id})</small></li>`).join('');
    const channelOptions = channels.filter(c=>c.type===0).map(c => `<option value="${c.id}"># ${escapeHtml(c.name)}</option>`).join('');
    const roleOptions = roles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    const membersHtml = members.map(m => {
      const tag = m.user ? `${escapeHtml(m.user.username)}#${escapeHtml(m.user.discriminator)}` : escapeHtml(m.nick || 'Unknown');
      const avatar = m.user?.avatar ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/${(parseInt(m.user?.discriminator||'0')%5)}.png`;
      const rolesForUser = Array.isArray(m.roles) ? m.roles.map(rid=>escapeHtml(rid)).join(', ') : '';
      return `<li class="member"><img src="${avatar}" class="mav"/><div class="md"><div class="mn"><strong>${tag}</strong> <small style="opacity:.75">(${m.user?.id||'N/A'})</small></div><div class="mr" style="opacity:.8">Roles: ${rolesForUser||'—'}</div></div><div class="ma">
        <button ${!canKick ? 'disabled' : ''} onclick="moderate('${guildId}','${m.user?.id}','kick')" class="danger">🚫 Kick</button>
        <button ${!canBan ? 'disabled' : ''} onclick="moderate('${guildId}','${m.user?.id}','ban')" class="danger">🔨 Ban</button>
        <button ${!canKick ? 'disabled' : ''} onclick="moderateTimeout('${guildId}','${m.user?.id}')" class="warn">🔇 Timeout</button>
      </div></li>`;
    }).join('');

    // create HTML representation for roles with checkboxes to mark moderator roles
    const modRolesHtml = roles.map(r => {
      const checked = markedModRoleIds.includes(r.id) ? 'checked' : '';
      return `<label class="modrole"><input type="checkbox" value="${r.id}" ${checked}/> ${escapeHtml(r.name)}</label>`;
    }).join('');

    // read recent logs for this guild
    let logsForGuild = '';
    try {
      const raw = fs.existsSync(path.join(__dirname,'acciones.log')) ? fs.readFileSync(path.join(__dirname,'acciones.log'),'utf8') : '';
      const lines = raw.split('\n').filter(l=>l && l.includes(guildId));
      logsForGuild = lines.reverse().slice(0,150).join('\n') || 'No hay acciones registradas para este servidor.';
    } catch(e){ logsForGuild = 'Error leyendo logs'; }

    // Render panel (modern forms)
    return res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abyssus — Panel ${escapeHtml(guild.name)}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
      :root{--accent:#5865F2;--accent2:#764ba2}
      body{font-family:Inter,system-ui,Arial;margin:0;background:#090b0f;color:#eaf2ff;padding:18px}
      .wrap{max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
      .top{display:flex;gap:12px;align-items:center}
      .icon{width:96px;height:96px;border-radius:12px;object-fit:cover}
      h1{margin:0}
      .stats{display:flex;gap:8px;margin-top:8px}
      .stat{background:rgba(255,255,255,0.02);padding:8px 10px;border-radius:8px;font-weight:600}
      .main{display:flex;gap:12px;flex-wrap:wrap}
      .panel{flex:1 1 420px;background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.03);max-height:720px;overflow:auto}
      ul{list-style:none;padding:0;margin:0}
      .member{display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;margin-bottom:8px;background:rgba(0,0,0,0.25)}
      .mav{width:44px;height:44px;border-radius:8px;object-fit:cover}
      .md{flex:1}
      .ma{display:flex;flex-direction:column;gap:6px}
      button{border:0;padding:8px 10px;border-radius:8px;cursor:pointer}
      button[disabled]{opacity:.45;cursor:not-allowed;transform:none}
      .danger{background:#ff7b7b;color:#2b0505}
      .warn{background:#ffd88c;color:#2b1500}
      .primary{background:linear-gradient(90deg,var(--accent),var(--accent2));color:white}
      input,select,textarea{width:100%;padding:10px;border-radius:8px;border:0;outline:none;background:#0f1216;color:#eaf2ff;margin-bottom:8px}
      label{display:block;margin-bottom:6px}
      .form-row{margin-bottom:10px}
      .footer{display:flex;justify-content:space-between;align-items:center;padding:10px}
      pre.logbox{background:#071018;padding:12px;border-radius:8px;color:#bfe0ff;max-height:220px;overflow:auto}
      a.back{color:inherit;text-decoration:none;opacity:.9}
      .invite-btn{display:inline-block;margin-left:8px;padding:8px 10px;border-radius:8px;background:transparent;border:1px solid rgba(255,255,255,0.06);color:inherit;text-decoration:none;font-weight:600;transition:transform .12s}
      .invite-btn:hover{transform:translateY(-3px)}
      .modrole{display:block;padding:6px 8px;margin:6px 0;border-radius:8px;background:rgba(0,0,0,0.15);cursor:pointer}
      .panel-forms{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      @media(max-width:900px){ .main{flex-direction:column} .panel-forms{grid-template-columns:1fr} }
    </style></head><body>
    <div class="wrap">
      <div class="top"><img class="icon" src="${iconUrl}" alt="icon"/><div><h1>${escapeHtml(guild.name)}</h1><div style="opacity:.85">ID: ${guild.id}</div><div class="stats"><div class="stat">👥 ${guild.approximate_member_count||'N/A'}</div><div class="stat">💬 ${channels.length}</div><div class="stat">🧾 ${roles.length}</div></div></div></div>

      <div class="main">
        <div class="panel">
          <h2>Miembros (hasta 100)</h2>
          <ul id="members">${membersHtml}</ul>
        </div>

        <div class="panel">
          <h2>Enviar mensaje como Abyssus</h2>
          <div class="form-row"><label>Canal</label><select id="channelSelect">${channelOptions}</select></div>
          <div class="form-row"><label>Mensaje</label><textarea id="messageContent" rows="4"></textarea></div>
          <div style="display:flex;gap:8px"><button class="primary" ${!canSendMessage ? 'disabled' : ''} onclick="sendMessage()">Enviar</button><button onclick="document.getElementById('messageContent').value='/help'">Comando: /help</button></div>
          <hr style="margin:12px 0;border-top:1px solid rgba(255,255,255,0.03)"/>
          <h3>Roles</h3><ul>${rolesListHtml}</ul>
          <h3>Canales</h3><ul>${channelsListHtml}</ul>
        </div>
      </div>

      <div class="main">
        <div class="panel">
          <h2>Moderación rápida</h2>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <label>ID usuario</label><input id="modUserId" placeholder="ID del usuario"/>
              <label>Motivo</label><input id="modReason" placeholder="Motivo (opcional)"/>
            </div>
            <div>
              <label>Días de mensajes a eliminar (ban)</label><input id="modDays" type="number" min="0" max="7" value="0"/>
              <label>Timeout min</label><input id="modTimeout" type="number" min="1" max="1440" value="10"/>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="danger" ${!canKick ? 'disabled' : ''} onclick="kickFromInputs()">🚫 Kick</button>
            <button class="danger" ${!canBan ? 'disabled' : ''} onclick="banFromInputs()">🔨 Ban</button>
            <button class="warn" ${!canKick ? 'disabled' : ''} onclick="timeoutFromInputs()">🔇 Timeout</button>
          </div>
        </div>

        <div class="panel">
          <h2>Gestionar Roles / Canales</h2>
          <div class="panel-forms">
            <div>
              <label>Crear rol — nombre</label><input id="newRoleName" placeholder="Nombre del rol"/>
              <label>Color (hex, opcional)</label><input id="newRoleColor" placeholder="#RRGGBB"/>
              <div style="display:flex;gap:8px;margin-top:6px">
                <button onclick="createRole()" class="primary" ${!canManageRoles ? 'disabled' : ''}>Crear rol</button>
              </div>
              <hr style="margin:10px 0;border-top:1px solid rgba(255,255,255,0.03)"/>
              <label>Eliminar rol</label><select id="deleteRoleSelect">${roleOptions}</select>
              <div style="display:flex;gap:8px;margin-top:6px"><button class="danger" ${!canManageRoles ? 'disabled' : ''} onclick="deleteRole()">Eliminar rol</button></div>
            </div>

            <div>
              <label>Crear canal (texto)</label><input id="newChannelName" placeholder="nombre-del-canal"/>
              <div style="display:flex;gap:8px;margin-top:6px"><button class="primary" ${!canManageChannels ? 'disabled' : ''} onclick="createChannel()">Crear canal</button></div>
              <label style="margin-top:10px">Eliminar canal</label><select id="deleteChannelSelect">${channels.filter(c=>c.type!==4).map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select>
              <div style="display:flex;gap:8px;margin-top:6px"><button class="danger" ${!canManageChannels ? 'disabled' : ''} onclick="deleteChannel()">Eliminar canal</button></div>
            </div>
          </div>

          <hr style="margin:10px 0;border-top:1px solid rgba(255,255,255,0.03)"/>
          <h3>Roles de Moderador para panel</h3>
          <div id="modRolesContainer">${modRolesHtml}</div>
          <div style="display:flex;gap:8px;margin-top:8px"><button class="primary" onclick="saveModRoles()">Guardar roles de moderador</button><button onclick="clearModRoles()">Limpiar</button></div>
          <small style="opacity:.8;display:block;margin-top:8px">Marcar roles aquí hace que miembros con ese rol puedan usar las herramientas de moderación del panel (sujeto a permisos reales de Discord).</small>
        </div>
      </div>

      <div class="panel">
        <h2>Logs del servidor</h2>
        <pre class="logbox" id="logsBox">${escapeHtml(logsForGuild)}</pre>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button onclick="refreshLogs()">Actualizar logs</button>
          <button class="danger" onclick="clearLogs()">Borrar logs de este servidor</button>
        </div>
      </div>

      <div class="panel">
  <h2>🎭 Reaction Role</h2>
  <p>Crea un panel de roles autoasignables desde el Dashboard.</p>
  <a class="primary" 
   href="/dashboard/${guild.id}/reactionrole?userId=${userId}" 
   style="display:inline-block;margin-top:8px;">
   ➕ Crear Panel de Reaction Roles
</a>
</div>

<div class="panel">
  <h2>🎬 Notificaciones de YouTube</h2>
  <p>Agrega y administra canales de YouTube conectados al servidor.</p>

  <a class="primary"
     href="/dashboard/${guild.id}/youtube?userId=${userId}"
     style="display:inline-block;margin-top:8px;">
     📺 Configurar Notificaciones de YouTube
  </a>
</div>

    <div class="footer">
  <a class="back" href="/mis-guilds/${userId}">← Volver</a>
  <div>
    <a class="primary" href="https://discord.com/channels/${guild.id}" target="_blank">Abrir en Discord</a>
    <a class="invite-btn" href="https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&scope=bot%20applications.commands&permissions=8&guild_id=${guild.id}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}" target="_blank">Invitar Abyssus</a>
  </div>
</div>

    <script>
      const userId = '${userId}';
      const guildId = '${guild.id}';

      async function postApi(path, body) {
        body = {...body, userId};
        const res = await fetch(path, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        const txt = await res.text();
        if (!res.ok) throw new Error(txt || res.statusText);
        return txt;
      }

      async function moderate(guildId, targetId, action) {
        if (!confirm(action + ' a ' + targetId + ' ?')) return;
        try {
          const txt = await postApi('/api/guilds/'+guildId+'/'+action, { targetId });
          alert(txt);
          location.reload();
        } catch(e){ alert('Error: '+e.message); }
      }

      function kickFromInputs(){ const id=document.getElementById('modUserId').value.trim(); if(!id) return alert('ID requerido'); if(!confirm('Kick '+id+'?')) return; postApi('/api/guilds/'+guildId+'/kick',{ targetId:id }).then(a=>{alert(a);location.reload()}).catch(e=>alert('Error:'+e.message)); }
      function banFromInputs(){ const id=document.getElementById('modUserId').value.trim(); const reason=document.getElementById('modReason').value||'Banned via panel'; const days=parseInt(document.getElementById('modDays').value||'0',10); if(!id) return alert('ID requerido'); if(!confirm('Ban '+id+'?')) return; postApi('/api/guilds/'+guildId+'/ban',{ targetId:id, reason, deleteMessageDays:days }).then(a=>{alert(a);location.reload()}).catch(e=>alert('Error:'+e.message)); }
      function timeoutFromInputs(){ const id=document.getElementById('modUserId').value.trim(); const mins=parseInt(document.getElementById('modTimeout').value||'10',10); if(!id) return alert('ID requerido'); if(!confirm('Timeout '+id+' por '+mins+' min?')) return; postApi('/api/guilds/'+guildId+'/timeout',{ targetId:id, minutes:mins }).then(a=>{alert(a);location.reload()}).catch(e=>alert('Error:'+e.message)); }

      async function sendMessage(){
        const channelId = document.getElementById('channelSelect').value;
        const content = document.getElementById('messageContent').value.trim();
        if(!channelId || !content) return alert('Selecciona canal y escribe mensaje');
        try {
          const r = await postApi('/api/guilds/'+guildId+'/message',{ channelId, content });
          alert('Mensaje enviado');
          document.getElementById('messageContent').value='';
        } catch(e){ alert('Error: '+e.message); }
      }

      async function createRole(){
        const name = document.getElementById('newRoleName').value.trim();
        const color = document.getElementById('newRoleColor').value.trim();
        if(!name) return alert('Nombre requerido');
        if(!confirm('Crear rol '+name+'?')) return;
        try{ const r = await postApi('/api/guilds/'+guildId+'/create-role',{ name, color }); alert(r); location.reload(); } catch(e){ alert('Error:'+e.message); }
      }
      async function deleteRole(){
        const roleId = document.getElementById('deleteRoleSelect').value;
        if(!roleId) return alert('Selecciona rol'); if(!confirm('Eliminar rol '+roleId+'?')) return;
        try{ const r = await postApi('/api/guilds/'+guildId+'/delete-role',{ roleId }); alert(r); location.reload(); } catch(e){ alert('Error:'+e.message); }
      }
      async function createChannel(){
        const name = document.getElementById('newChannelName').value.trim();
        if(!name) return alert('Nombre requerido');
        if(!confirm('Crear canal '+name+'?')) return;
        try{ const r = await postApi('/api/guilds/'+guildId+'/create-channel',{ name }); alert(r); location.reload(); } catch(e){ alert('Error:'+e.message); }
      }
      async function deleteChannel(){
        const channelId = document.getElementById('deleteChannelSelect').value;
        if(!channelId) return alert('Selecciona canal'); if(!confirm('Eliminar canal '+channelId+'?')) return;
        try{ const r = await postApi('/api/guilds/'+guildId+'/delete-channel',{ channelId }); alert(r); location.reload(); } catch(e){ alert('Error:'+e.message); }
      }

      async function refreshLogs(){
        try{
          const res = await fetch('/logs/'+guildId+'?userId='+userId);
          const txt = await res.text();
          document.getElementById('logsBox').textContent = txt;
        } catch(e){ alert('Error al obtener logs'); }
      }
      async function clearLogs(){
        if(!confirm('Borrar todas las entradas del log para este servidor?')) return;
        try{
          const res = await fetch('/logs/'+guildId+'/clear', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ userId })});
          const txt = await res.text();
          alert(txt);
          refreshLogs();
        } catch(e){ alert('Error al borrar logs'); }
      }

      function saveModRoles(){
        const checkboxes = Array.from(document.querySelectorAll('#modRolesContainer input[type="checkbox"]'));
        const selected = checkboxes.filter(c=>c.checked).map(c=>c.value);
        fetch('/api/guilds/'+guildId+'/set-mod-roles', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ userId, roleIds: selected })})
          .then(r=>r.text()).then(t=>{ alert(t); location.reload(); }).catch(e=>alert('Error: '+e.message));
      }
      function clearModRoles(){
        if(!confirm('Quitar todos los roles de moderador configurados?')) return;
        fetch('/api/guilds/'+guildId+'/set-mod-roles', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ userId, roleIds: [] })})
          .then(r=>r.text()).then(t=>{ alert(t); location.reload(); }).catch(e=>alert('Error: '+e.message));
      }
    </script>
    </body></html>`);
  } catch (err) {
    console.error('panel err:', err.response?.data || err.message);
    return res.status(500).send(`<h2>Error cargando panel</h2><pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// ----------------- API endpoints for moderation & management -----------------

// helper to check owner quickly (OAuth)
async function verifyOwnerUsingOAuth(userAccessToken, guildId) {
  const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${userAccessToken}` }});
  const guilds = Array.isArray(guildsRes.data) ? guildsRes.data : [];
  return guilds.some(g => g.id === guildId && g.owner === true);
}

// Endpoint to set moderator roles for the panel (persist)
app.post('/api/guilds/:guildId/set-mod-roles', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { roleIds } = req.body;
  const ses = req.session;
  const userId = req.sessionUserId;
  if (!Array.isArray(roleIds)) return res.status(400).send('roleIds debe ser arreglo');
  try {
    const isOwner = await verifyOwnerUsingOAuth(ses.accessToken, guildId);
    const allowed = isOwner || await hasPermission(userId, guildId, 'MANAGE_ROLES') || await hasPermission(userId, guildId, 'ADMINISTRATOR');
    if (!allowed) return res.status(403).send('No autorizado para definir roles de moderador.');

    const cfg = readModeratorsFile();
    cfg[guildId] = roleIds;
    writeModeratorsFile(cfg);
    return res.send('✅ Roles de moderador actualizados');
  } catch (e) {
    console.error('set-mod-roles err:', e.response?.data || e.message);
    return res.status(500).send('Error al guardar roles de moderador');
  }
});

// Helper: check if a user is a configured moderator via role
async function isConfiguredModerator(userId, guildId) {
  const cfg = readModeratorsFile();
  const roleIds = Array.isArray(cfg[guildId]) ? cfg[guildId] : [];
  if (!roleIds.length) return false;
  try {
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const memberRes = await axios.get(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }).catch(()=>null);
    if (!memberRes || !memberRes.data) return false;
    const memberRoles = Array.isArray(memberRes.data.roles) ? memberRes.data.roles : [];
    return memberRoles.some(r => roleIds.includes(r));
  } catch(e){ return false; }
}

// Kick
app.post('/api/guilds/:guildId/kick', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId } = req.body;
  const ses = req.session;
  const userId = req.sessionUserId;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    const isOwner = await verifyOwnerUsingOAuth(ses.accessToken, guildId);
    const allowedPerm = await hasPermission(userId, guildId, 'KICK_MEMBERS');
    const isMod = await isConfiguredModerator(userId, guildId);
    const allowed = isOwner || allowedPerm || isMod;
    if (!allowed) return res.status(403).send('No autorizado (perm insuficiente).');

    await discordRequest('delete', `/guilds/${guildId}/members/${targetId}`);
    logAction('KICK', { guildId, targetId, by: ses.username });
    return res.status(200).send('✅ Usuario expulsado');
  } catch (e) {
    console.error('kick err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// Ban
app.post('/api/guilds/:guildId/ban', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId, reason = 'Banned via panel', deleteMessageDays = 0 } = req.body;
  const ses = req.session;
  const userId = req.sessionUserId;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    const isOwner = await verifyOwnerUsingOAuth(ses.accessToken, guildId);
    const allowedPerm = await hasPermission(userId, guildId, 'BAN_MEMBERS');
    const isMod = await isConfiguredModerator(userId, guildId);
    const allowed = isOwner || allowedPerm || isMod;
    if (!allowed) return res.status(403).send('No autorizado (perm insuficiente).');

    await discordRequest('put', `/guilds/${guildId}/bans/${targetId}`, { delete_message_seconds: (deleteMessageDays||0)*24*3600, reason });
    logAction('BAN', { guildId, targetId, by: ses.username, reason, deleteMessageDays });
    return res.status(200).send('✅ Usuario baneado');
  } catch (e) {
    console.error('ban err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// Timeout (communication_disabled_until)
app.post('/api/guilds/:guildId/timeout', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId, minutes = 10 } = req.body;
  const ses = req.session;
  const userId = req.sessionUserId;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    const isOwner = await verifyOwnerUsingOAuth(ses.accessToken, guildId);
    const allowedPerm = await hasPermission(userId, guildId, 'KICK_MEMBERS');
    const isMod = await isConfiguredModerator(userId, guildId);
    const allowed = isOwner || allowedPerm || isMod;
    if (!allowed) return res.status(403).send('No autorizado');

    const until = new Date(Date.now() + (minutes||10) * 60 * 1000).toISOString();
    await discordRequest('patch', `/guilds/${guildId}/members/${targetId}`, { communication_disabled_until: until });
    logAction('TIMEOUT', { guildId, targetId, by: ses.username, minutes });
    return res.status(200).send('✅ Timeout aplicado');
  } catch (e) {
    console.error('timeout err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// Send message
app.post('/api/guilds/:guildId/message', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { channelId, content } = req.body;
  const ses = req.session;
  const userId = req.sessionUserId;
  if (!channelId || !content) return res.status(400).send('Falta channelId o content');
  try {
    const isOwner = await verifyOwnerUsingOAuth(ses.accessToken, guildId);
    const allowedPerm = await hasPermission(userId, guildId, 'MANAGE_GUILD') || await hasPermission(userId, guildId, 'ADMINISTRATOR');
    const isMod = await isConfiguredModerator(userId, guildId);
    const allowed = isOwner || allowedPerm || isMod;
    if (!allowed) return res.status(403).send('No autorizado (perm insuficiente).');

    const resp = await discordRequest('post', `/channels/${channelId}/messages`, { content });
    logAction('MESSAGE', { guildId, channelId, by: ses.username, content: content.slice(0,4000) });
    return res.status(200).send(safeJson(resp.data));
  } catch (e) {
    console.error('message err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// Create role (owner or manage_roles/admin)
app.post('/api/guilds/:guildId/create-role', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { name, color } = req.body;
  const ses = req.session;
  const userId = req.sessionUserId;
  if (!name) return res.status(400).send('Falta name');
  try {
    const isOwner = await verifyOwnerUsingOAuth(ses.accessToken, guildId);
    const allowedPerm = await hasPermission(userId, guildId, 'MANAGE_ROLES') || await hasPermission(userId, guildId, 'ADMINISTRATOR');
    const allowed = isOwner || allowedPerm;
    if (!allowed) return res.status(403).send('No autorizado');

    const body = { name };
    if (color && /^#?[0-9A-Fa-f]{6}$/.test(color)) {
      // Discord wants integer color value in decimal; allow hex input
      const hex = color.replace('#','');
      body.color = parseInt(hex, 16);
    }
    const resp = await discordRequest('post', `/guilds/${guildId}/roles`, body);
    logAction('CREATE_ROLE', { guildId, name, by: ses.username });
    return res.status(200).send('✅ Rol creado');
  } catch (e) {
    console.error('create role err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// Delete role (owner or manage_roles/admin)
app.post('/api/guilds/:guildId/delete-role', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { roleId } = req.body;
  const ses = req.session;
  const userId = req.sessionUserId;
  if (!roleId) return res.status(400).send('Falta roleId');
  try {
    const isOwner = await verifyOwnerUsingOAuth(ses.accessToken, guildId);
    const allowedPerm = await hasPermission(userId, guildId, 'MANAGE_ROLES') || await hasPermission(userId, guildId, 'ADMINISTRATOR');
    const allowed = isOwner || allowedPerm;
    if (!allowed) return res.status(403).send('No autorizado');

    await discordRequest('delete', `/guilds/${guildId}/roles/${roleId}`);
    logAction('DELETE_ROLE', { guildId, roleId, by: ses.username });
    return res.status(200).send('✅ Rol eliminado');
  } catch (e) {
    console.error('delete role err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// Create channel (owner or manage_channels/admin)
app.post('/api/guilds/:guildId/create-channel', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { name } = req.body;
  const ses = req.session;
  const userId = req.sessionUserId;
  if (!name) return res.status(400).send('Falta name');
  try {
    const isOwner = await verifyOwnerUsingOAuth(ses.accessToken, guildId);
    const allowedPerm = await hasPermission(userId, guildId, 'MANAGE_CHANNELS') || await hasPermission(userId, guildId, 'ADMINISTRATOR');
    const allowed = isOwner || allowedPerm;
    if (!allowed) return res.status(403).send('No autorizado');

    const resp = await discordRequest('post', `/guilds/${guildId}/channels`, { name, type: 0 });
    logAction('CREATE_CHANNEL', { guildId, name, by: ses.username });
    return res.status(200).send('✅ Canal creado');
  } catch (e) {
    console.error('create channel err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// Delete channel (owner or manage_channels/admin)
app.post('/api/guilds/:guildId/delete-channel', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { channelId } = req.body;
  const ses = req.session;
  const userId = req.sessionUserId;
  if (!channelId) return res.status(400).send('Falta channelId');
  try {
    const isOwner = await verifyOwnerUsingOAuth(ses.accessToken, guildId);
    const allowedPerm = await hasPermission(userId, guildId, 'MANAGE_CHANNELS') || await hasPermission(userId, guildId, 'ADMINISTRATOR');
    const allowed = isOwner || allowedPerm;
    if (!allowed) return res.status(403).send('No autorizado');

    await discordRequest('delete', `/channels/${channelId}`);
    logAction('DELETE_CHANNEL', { guildId, channelId, by: ses.username });
    return res.status(200).send('✅ Canal eliminado');
  } catch (e) {
    console.error('delete channel err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// ----------------- Logs endpoints -----------------
// GET logs for guild (returns only lines that contain guildId)
app.get('/logs/:guildId', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const ses = req.session;
  try {
    const isOwner = await verifyOwnerUsingOAuth(ses.accessToken, guildId);
    // allow owner or configured moderator to view logs
    const userId = req.sessionUserId;
    const isMod = await isConfiguredModerator(userId, guildId);
    if (!isOwner && !isMod) return res.status(403).send('No autorizado');
    const file = path.join(__dirname, 'acciones.log');
    if (!fs.existsSync(file)) return res.send('No hay logs.');
    const raw = fs.readFileSync(file, 'utf8');
    const lines = raw.split('\n').filter(l => l && l.includes(guildId));
    return res.send(lines.reverse().join('\n') || 'No hay logs para este servidor.');
  } catch (e) {
    console.error('logs err:', e);
    return res.status(500).send('Error leyendo logs');
  }
});

// Clear logs for guild (delete lines containing guildId) — owner only
app.post('/logs/:guildId/clear', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const ses = req.session;
  try {
    const isOwner = await verifyOwnerUsingOAuth(ses.accessToken, guildId);
    if (!isOwner) return res.status(403).send('No autorizado');
    const file = path.join(__dirname, 'acciones.log');
    if (!fs.existsSync(file)) return res.send('No hay logs.');
    const raw = fs.readFileSync(file, 'utf8');
    const lines = raw.split('\n').filter(l => l && !l.includes(guildId));
    fs.writeFileSync(file, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
    return res.send('✅ Logs del servidor borrados');
  } catch (e) {
    console.error('clear logs err:', e);
    return res.status(500).send('Error al borrar logs');
  }
});

// ----------------- Clusters API -----------------
app.get('/api/clusters', async (req, res) => {
  try {
    const data = {
      success: true,
      clusters: [
        {
          id: 1,
          nombre: 'Cluster Norte',
          servidores: 12,
          estado: '🟢 Activo',
          usoCPU: '32%',
          usoRAM: '1.2 GB'
        },
        {
          id: 2,
          nombre: 'Cluster Sur',
          servidores: 8,
          estado: '🟢 Activo',
          usoCPU: '28%',
          usoRAM: '960 MB'
        },
        {
          id: 3,
          nombre: 'Cluster Central',
          servidores: 15,
          estado: '🟠 Mantenimiento',
          usoCPU: '46%',
          usoRAM: '1.6 GB'
        }
      ]
    };
    res.json(data);
  } catch (error) {
    console.error('Error al cargar clusters:', error);
    res.status(500).json({ success: false, message: 'Error al cargar clusters' });
  }
});

// =================== 🎭 Reaction Roles Dashboard ===================

// Crear carpeta y archivo de datos si no existen
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const dataFile = path.join(dataDir, "reactionroles.json");
if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, "{}");

// =================== GET: Mostrar Dashboard ===================
app.get("/dashboard/:guildId/reactionrole", requireSession, async (req, res) => {
  const { guildId } = req.params;
  const userId = req.sessionUserId;
  const BOT_TOKEN = process.env.BOT_TOKEN;

  let data = {};
  try { data = JSON.parse(fs.readFileSync(dataFile, "utf8")); } catch {}
  const guildPanels = Object.entries(data).filter(([_, p]) => p.guildId === guildId);

  // Canales de texto
  let channelOptions = '<option value="">Selecciona un canal...</option>';
  try {
    const resp = await axios.get(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    const textChannels = resp.data.filter((c) => c.type === 0);
    channelOptions = textChannels
      .map((c) => `<option value="${c.id}">#${c.name}</option>`)
      .join("");
  } catch (e) {
    console.error("Error cargando canales:", e.response?.data || e.message);
  }

  // HTML
  res.send(`
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <title>Reaction Roles — ${guildId}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
    <style>
      body { background-color:#0b0f14; color:#eaf2ff; font-family:'Inter',sans-serif; padding:2rem; }
      .container { max-width:700px; background:rgba(255,255,255,0.05); border-radius:12px; padding:20px; }
      h2 { color:#8ba4ff; }
      input,textarea,select { background:#111722; color:#eaf2ff; border:none; border-radius:6px; padding:10px; width:100%; margin-bottom:10px; }
      button { background:linear-gradient(90deg,#5865F2,#764ba2); border:none; border-radius:8px; padding:10px; color:white; width:100%; font-weight:600; }
      .panel { background:#111722; border-radius:8px; padding:10px 15px; margin-top:8px; }
      .del-btn { background:#a62d2d; border:none; border-radius:6px; padding:5px 10px; color:white; width:100%; }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>🎭 Reaction Roles — ${guildId}</h2>
      <form id="rrForm">
        <label>📢 Canal</label>
        <select id="channelId" required>${channelOptions}</select>

        <label>⚙️ Modo</label>
        <select id="modo">
          <option value="botones">Botones</option>
          <option value="menu">Menú desplegable</option>
        </select>

        <label>🧩 Roles (IDs separados por coma)</label>
        <input type="text" id="roles" placeholder="123,456,789" required>

        <label>😀 Emojis (opcional)</label>
        <input type="text" id="emojis" placeholder="😎,🔥,⭐">

        <label>📝 Título</label>
        <input type="text" id="titulo" placeholder="AutoRoles del servidor">

        <label>📄 Descripción</label>
        <textarea id="descripcion" rows="2" placeholder="Selecciona tus roles."></textarea>

        <button type="submit">Crear Panel</button>
      </form>

      <h4 class="mt-4">📋 Paneles Existentes</h4>
      <div id="panelList">
        ${
          guildPanels.length === 0
            ? "<p>Aún no hay paneles creados.</p>"
            : guildPanels
                .map(
                  ([id, p]) => `
              <div class="panel">
                <b>${p.titulo || "(Sin título)"}</b><br>
                📢 Canal: <#${p.channelId}><br>
                ⚙️ Modo: ${p.modo}<br>
                🎭 Roles: ${p.roles.join(", ")}<br>
                <button class="del-btn" onclick="deletePanel('${id}')">🗑️ Eliminar</button>
              </div>`
                )
                .join("")
        }
      </div>
      <div id="result" class="mt-3"></div>
    </div>

    <script>
      const guildId = "${guildId}";
      const userId = "${userId}";

      document.getElementById("rrForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const body = {
          userId,
          channelId: document.getElementById("channelId").value,
          modo: document.getElementById("modo").value,
          roles: document.getElementById("roles").value.split(",").map((r) => r.trim()),
          emojis: document.getElementById("emojis").value.split(",").map((e) => e.trim()),
          titulo: document.getElementById("titulo").value.trim(),
          descripcion: document.getElementById("descripcion").value.trim(),
        };
        const res = await fetch("/api/guilds/" + guildId + "/reactionrole", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        alert(await res.text());
        location.reload();
      });

      async function deletePanel(id) {
        if (!confirm("¿Eliminar este panel?")) return;
        const res = await fetch(
          "/api/guilds/" + guildId + "/reactionrole/" + id + "?userId=" + userId,
          { method: "DELETE" }
        );
        alert(await res.text());
        location.reload();
      }
    </script>
  </body>
  </html>
  `);
});

// =================== POST: Crear Panel ===================
app.post("/api/guilds/:guildId/reactionrole", requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { userId, channelId, modo, roles, emojis, titulo, descripcion } = req.body;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const ses = req.session;

  try {
    // --- Validar permisos ---
    const isOwner = await verifyOwnerUsingOAuth(ses.accessToken, guildId);
    const allowed = isOwner || (await hasPermission(userId, guildId, "MANAGE_ROLES"));
    if (!allowed) return res.status(403).send("🚫 No tienes permisos para crear paneles.");

    // --- Validar canal ---
    const canalResp = await axios.get(
      `https://discord.com/api/v10/channels/${channelId}`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    ).catch(() => null);
    if (!canalResp || !canalResp.data)
      return res.status(400).send("⚠️ El canal no es válido o inaccesible.");

    // --- Obtener roles válidos ---
    const rolesResp = await axios.get(
      `https://discord.com/api/v10/guilds/${guildId}/roles`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    );
    const roleData = roles
      .map((id) => rolesResp.data.find((r) => r.id === id))
      .filter(Boolean);
    if (roleData.length === 0)
      return res.status(400).send("⚠️ No se encontraron roles válidos.");

    // --- Construir componentes ---
    const content = `**${titulo || "AutoRoles"}**\n${descripcion || "Selecciona tus roles:"}`;
    let components = [];

    if (modo === "botones") {
      let fila = { type: 1, components: [] };
      for (let i = 0; i < roleData.length; i++) {
        const emoji = emojis[i] || "🎭";
        const role = roleData[i];
        fila.components.push({
          type: 2,
          style: 2,
          label: `${emoji} ${role.name}`,
          custom_id: `rr_${role.id}`,
        });
        if (fila.components.length === 5 || i === roleData.length - 1) {
          components.push(fila);
          fila = { type: 1, components: [] };
        }
      }
    } else if (modo === "menu") {
      const options = roleData.map((r, i) => ({
        label: r.name,
        value: r.id,
        emoji: emojis[i] || "🎭",
        description: `Rol: ${r.name}`,
      }));
      components.push({
        type: 1,
        components: [
          {
            type: 3,
            custom_id: "rr_menu",
            placeholder: "Selecciona tus roles",
            min_values: 0,
            max_values: options.length,
            options,
          },
        ],
      });
    }

    // --- Enviar mensaje a Discord ---
    const resp = await axios.post(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      { content, components },
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    );

    // --- Guardar en archivo local ---
    const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    data[resp.data.id] = { guildId, channelId, modo, roles, emojis, titulo, descripcion, creadoPor: userId };
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));

    res.send("✅ Panel de ReactionRole creado con éxito. Verifícalo en el canal de Discord.");
  } catch (err) {
    console.error("❌ Error al crear panel:", err.response?.data || err.message);
    res.status(500).send("❌ Error al crear el panel.");
  }
});

// =================== 🗑️ DELETE: Eliminar Panel ===================
app.delete('/api/guilds/:guildId/reactionrole/:msgId', requireSession, async (req, res) => {
  const { guildId, msgId } = req.params;
  const { userId } = req.query;
  if (!userId) return res.status(400).send('⚠️ Falta userId.');

  try {
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const panel = data[msgId];
    if (!panel) return res.status(404).send('⚠️ Panel no encontrado.');
    if (panel.guildId !== guildId) return res.status(403).send('🚫 No pertenece a este servidor.');

    // --- Intentar eliminar el mensaje en Discord ---
    try {
      await axios.delete(`https://discord.com/api/v10/channels/${panel.channelId}/messages/${msgId}`, {
        headers: { Authorization: `Bot ${BOT_TOKEN}` }
      });
      console.log(`🗑️ Mensaje del panel ${msgId} eliminado en Discord.`);
    } catch (err) {
      console.warn('⚠️ No se pudo eliminar el mensaje en Discord:', err.response?.data || err.message);
    }

    // --- Eliminar del registro local ---
    delete data[msgId];
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));

    res.send('✅ Panel eliminado correctamente (mensaje y registro).');
  } catch (e) {
    console.error('Error eliminando panel:', e.message);
    res.status(500).send('❌ Error al eliminar panel.');
  }
});

// =========================================================
// 🎥 DASHBOARD — YOUTUBE NOTIFICATIONS
// =========================================================

// ==========================================
// PÁGINA PRINCIPAL DEL DASHBOARD
// ==========================================
app.get("/dashboard/:guildId/youtube", requireSession, async (req, res) => {
  const { guildId } = req.params;
  const BOT_TOKEN = process.env.BOT_TOKEN;

  let data = {};
  try { data = JSON.parse(fs.readFileSync(ytDataFile, "utf8")); } catch {}
  const config = data[guildId] || [];

  // ==========================================
  // Cargar canales reales
  // ==========================================
  let channelOptions = '<option value="">Selecciona un canal...</option>';
  try {
    const resp = await axios.get(
      `https://discord.com/api/v10/guilds/${guildId}/channels`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    );

    const textChannels = resp.data.filter((c) => c.type === 0);

    channelOptions += textChannels
      .map((ch) => `<option value="${ch.id}">#${ch.name}</option>`)
      .join("");

  } catch (err) {
    console.log("Error cargando canales:", err.response?.data || err.message);
  }

  // ==========================================
  // Cargar roles reales
  // ==========================================
  let roleOptions = '<option value="">Ninguno</option>';
  try {
    const resp = await axios.get(
      `https://discord.com/api/v10/guilds/${guildId}/roles`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    );

    roleOptions += resp.data
      .sort((a,b)=>a.position - b.position)
      .map(r => `<option value="${r.id}">${r.name}</option>`)
      .join("");

  } catch (err) {
    console.log("Error cargando roles:", err.response?.data || err.message);
  }

  // ==========================================
  // HTML
  // ==========================================
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>YouTube Notifier — Dashboard</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
  <style>
    body { background:#0b0f14; color:#eaf2ff; padding:30px; }
    .container { max-width:800px; background:#111723; padding:25px; border-radius:10px; }
    input,select { background:#1a2233; color:white; border:none; padding:10px; width:100%; border-radius:6px; margin-bottom:10px; }
    button { background:linear-gradient(90deg,#ff0000,#cc0000); border:none; padding:10px; width:100%; color:white; border-radius:8px; font-weight:700; }
    .panel { background:#1a2233; padding:15px; border-radius:10px; margin-top:15px; }
  </style>
</head>

<body>
<div class="container">

<h2>🎬 Notificaciones de YouTube — ${guildId}</h2>

<h4>➕ Agregar canal</h4>
<form id="ytForm">
  <label>📺 URL del canal de YouTube</label>
  <input id="youtubeURL" placeholder="https://www.youtube.com/@usuario">

  <label>📢 Canal de Discord</label>
  <select id="discordChannel">${channelOptions}</select>

  <label>🏷 Rol a mencionar (opcional)</label>
  <select id="rolMencion">${roleOptions}</select>

  <button type="submit">Agregar Canal</button>
</form>

<hr>

<h4>📋 Canales configurados</h4>
<div id="listaYT">
  ${
    config.length === 0
      ? "<p>No hay canales configurados.</p>"
      : config.map((c, i) => `
    <div class="panel">
      <b>${i + 1}. Canal ID:</b> ${c.youtubeId}<br>
      <b>📢 Publicando en:</b> <#${c.discordChannelId}><br>
      <b>🏷 Rol:</b> ${c.mentionRole ? "&lt;@&" + c.mentionRole + "&gt;" : "Ninguno"}<br>

      <hr>

      ${
        c.ultimoVideo
          ? `
        <div style="display:flex; gap:10px;">
          <img src="https://img.youtube.com/vi/${c.ultimoVideo}/mqdefault.jpg"
               style="width:120px; border-radius:6px;">
          <div>
            <b>📹 Último video:</b><br>
            <a href="https://youtu.be/${c.ultimoVideo}" target="_blank" style="color:#4da3ff;">
              Ver video
            </a><br>
            <small>🕒 ${c.ultimaFecha || "No disponible"}</small>
          </div>
        </div>
        `
          : "<i>No hay videos detectados aún…</i>"
      }

      <button class="btn btn-danger mt-3" onclick="deleteYT(${i})">Eliminar</button>
    </div>
    `).join("")
  }
</div>

</div>

<script>
const guildId = "${guildId}";
const userId = "${req.sessionUserId}";

document.getElementById("ytForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const body = {
    youtubeURL: document.getElementById("youtubeURL").value.trim(),
    discordChannelId: document.getElementById("discordChannel").value.trim(),
    mentionRole: document.getElementById("rolMencion").value.trim(),
    userId
  };

  const r = await fetch("/api/guilds/" + guildId + "/youtube", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  alert(await r.text());
  location.reload();
});

async function deleteYT(index) {
  const r = await fetch("/api/guilds/" + guildId + "/youtube/" + index + "?userId=" + userId, {
    method: "DELETE"
  });
  alert(await r.text());
  location.reload();
}
</script>

</body>
</html>
  `);
});

// ==========================================
// POST AGREGAR CANAL
// ==========================================
app.post("/api/guilds/:guildId/youtube", requireSession, (req, res) => {
  const { guildId } = req.params;
  const { youtubeURL, discordChannelId, mentionRole } = req.body;

  let data = JSON.parse(fs.readFileSync(ytDataFile, "utf8"));
  if (!data[guildId]) data[guildId] = [];

  const match = youtubeURL.match(/(channel\\/|@)([A-Za-z0-9_\\-]+)/);
  if (!match) return res.status(400).send("⚠️ URL incorrecta.");

  const id = match[2];

  data[guildId].push({
    youtubeId: id,
    discordChannelId,
    mentionRole: mentionRole || null,
    ultimoVideo: null,
    ultimaFecha: null
  });

  fs.writeFileSync(ytDataFile, JSON.stringify(data, null, 2));
  res.send("✅ Canal agregado.");
});

// ==========================================
// DELETE CANAL
// ==========================================
app.delete("/api/guilds/:guildId/youtube/:index", requireSession, (req, res) => {
  const { guildId, index } = req.params;

  let data = JSON.parse(fs.readFileSync(ytDataFile, "utf8"));
  if (!data[guildId]) return res.status(404).send("No hay canales.");

  data[guildId].splice(Number(index), 1);
  fs.writeFileSync(ytDataFile, JSON.stringify(data, null, 2));

  res.send("🗑️ Canal eliminado.");
});

// ==========================================
// CHECKER: ENVÍA ALERTAS A DISCORD
// ==========================================
const BOT_TOKEN = process.env.BOT_TOKEN;

setInterval(async () => {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(ytDataFile, "utf8")); } catch {}

  for (const guildId of Object.keys(data)) {
    for (const c of data[guildId]) {

      try {
        const feed = await parser.parseURL(
          `https://www.youtube.com/feeds/videos.xml?channel_id=${c.youtubeId}`
        );

        if (!feed.items.length) continue;

        const latest = feed.items[0];
        const videoId = latest.id.replace("yt:video:", "");

        if (videoId !== c.ultimoVideo) {
          c.ultimoVideo = videoId;
          c.ultimaFecha = latest.pubDate;

          // Enviar mensaje al canal
          await axios.post(
            `https://discord.com/api/v10/channels/${c.discordChannelId}/messages`,
            {
              content: `${c.mentionRole ? `<@&${c.mentionRole}> ` : ""}🎬 ¡Nuevo video publicado!\nhttps://youtu.be/${videoId}`
            },
            { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
          );

        }

      } catch (err) {
        console.log("Error checker:", err.message);
      }
    }
  }

  fs.writeFileSync(ytDataFile, JSON.stringify(data, null, 2));

}, 180000); // 3 minutos

// ----------------- Start server -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));




































































































