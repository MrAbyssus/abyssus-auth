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
const usuariosAutenticados = new Map(); // userId -> { accessToken, refreshToken, username, ... , createdAt }
const codigosUsados = new Set();

// ----------------- Constants / Perm bits -----------------
const PERM_ADMIN = 0x00000008; // ADMINISTRATOR
const PERM_KICK = 0x00000002; // KICK_MEMBERS
const PERM_BAN = 0x00000004; // BAN_MEMBERS
const PERM_MANAGE_MESSAGES = 0x00002000; // MANAGE_MESSAGES

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
async function discordRequest(method, url, body = null) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  return axios({
    method,
    url: `https://discord.com/api/v10${url}`,
    headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    data: body
  });
}

// get user's guilds using their access token
async function getUserGuilds(accessToken) {
  try {
    const r = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${accessToken}` }});
    return Array.isArray(r.data) ? r.data : [];
  } catch (e) {
    console.error('getUserGuilds err:', e.response?.data || e.message);
    return [];
  }
}

// check basic permission levels for a user on a guild
async function hasPermission(userId, guildId, level) {
  const ses = usuariosAutenticados.get(userId);
  if (!ses) return false;
  // get user's guilds (cached briefly by session object)
  const guilds = await getUserGuilds(ses.accessToken);
  const g = guilds.find(x => x.id === guildId);
  if (!g) return false;
  const perms = parseInt(g.permissions || '0', 10);

  if (level === 'owner') return !!g.owner;
  if (level === 'admin') return (perms & PERM_ADMIN) !== 0;
  if (level === 'moderator') {
    return (perms & (PERM_KICK | PERM_BAN | PERM_MANAGE_MESSAGES)) !== 0 || (perms & PERM_ADMIN) !== 0 || !!g.owner;
  }
  return false;
}

// wrapper that verifies owner specifically using user's guilds (safer than other calls)
async function verifyOwnerByAccessToken(userAccessToken, guildId) {
  const guilds = await getUserGuilds(userAccessToken);
  return guilds.some(g => g.id === guildId && g.owner === true);
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
      <p>Inicia sesión con Discord para ver los servidores donde eres owner/administrator/moderator y Abyssus está instalado.</p>
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

// ----------------- /mis-guilds/:userId (owner OR admin, bot present) -----------------
app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const ses = usuariosAutenticados.get(userId);
  if (!ses) return res.redirect('/login');

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send('Falta BOT_TOKEN en .env');

  try {
    const allGuilds = await getUserGuilds(ses.accessToken);
    // include guilds where user is owner OR admin (permissions bit) - also require bot present on guild
    const manageable = allGuilds.filter(g => (g.owner === true) || ((parseInt(g.permissions || '0', 10) & PERM_ADMIN) !== 0));

    const botPresent = [];
    const CONCURRENCY = 6;
    for (let i = 0; i < manageable.length; i += CONCURRENCY) {
      const chunk = manageable.slice(i, i + CONCURRENCY);
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
            roles_count: Array.isArray(info.data.roles) ? info.data.roles.length : 'N/A'
          });
        } catch (e) {
          // bot not present or no access -> ignore
        }
      });
      await Promise.all(promises);
      await sleep(100);
    }

    const guildsHtml = botPresent.length ? botPresent.map(g => {
      const icon = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : 'https://via.placeholder.com/64/111318/ffffff?text=?';
      return `<li class="card-item">
        <img src="${icon}" class="gicon" onerror="this.src='https://via.placeholder.com/64/111318/ffffff?text=?'"/>
        <div class="meta"><div class="name">${escapeHtml(g.name)}</div><div class="sub">👥 ${g.member_count} • 🧾 ${g.roles_count}</div></div>
        <div class="actions"><a class="btn" href="/panel/${g.id}?userId=${userId}">Abrir panel</a></div>
      </li>`;
    }).join('') : `<div class="empty">No eres owner/administrator de servidores donde Abyssus esté presente o el bot no tiene acceso.</div>`;

    return res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Abyssus — Mis servidores</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
      :root{--accent:#5865F2;--accent2:#764ba2}
      body{font-family:Inter,system-ui,Arial;background:#0a0d12;color:#eaf2ff;margin:0;padding:28px}
      .wrap{max-width:1100px;margin:0 auto}
      header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
      h1{margin:0}
      .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
      .card-item{display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));border:1px solid rgba(255,255,255,0.03)}
      .gicon{width:56px;height:56px;border-radius:10px;object-fit:cover}
      .meta{flex:1}
      .name{font-weight:600}
      .sub{opacity:.85;font-size:.92rem;margin-top:6px}
      .btn{background:linear-gradient(90deg,var(--accent),var(--accent2));color:white;padding:8px 12px;border-radius:8px;text-decoration:none;font-weight:700}
      .empty{padding:18px;border-radius:10px;background:#071022;text-align:center}
    </style></head><body>
    <div class="wrap">
      <header><div><h2>Dashboard Abyssus</h2><div style="opacity:.8">Accede al panel para moderación, comandos y logs</div></div><div><a class="btn" href="/login">Cambiar cuenta</a></div></header>
      <section class="grid">${guildsHtml}</section>
      <p style="opacity:.8;margin-top:14px">Si no ves un servidor, verifica que Abyssus esté invitado y que tu cuenta sea owner o administrator del servidor.</p>
    </div></body></html>`);
  } catch (err) {
    console.error('mis-guilds err:', err.response?.data || err.message);
    return res.status(500).send(`<h2>Error obteniendo servidores</h2><pre>${safeJson(err.response?.data || err.message)}</pre>`);
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

// ----------------- /panel/:guildId (OWNER / ADMIN / MODERATOR) -----------------
app.get('/panel/:guildId', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const userId = req.sessionUserId;
  const ses = req.session;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send('Falta BOT_TOKEN en .env');

  try {
    // determine permission level for the user on this guild
    const guilds = await getUserGuilds(ses.accessToken);
    const guildEntry = guilds.find(g => g.id === guildId);
    const isOwner = guildEntry?.owner === true;
    const isAdmin = (parseInt(guildEntry?.permissions || '0', 10) & PERM_ADMIN) !== 0;
    const isModerator = (parseInt(guildEntry?.permissions || '0', 10) & (PERM_KICK | PERM_BAN | PERM_MANAGE_MESSAGES)) !== 0 || isAdmin || isOwner;

    if (!isOwner && !isAdmin && !isModerator) return res.status(403).send('No tienes permisos en este servidor.');

    // fetch guild info using bot token
    const [guildInfoRes, rolesRes, channelsRes, membersRes] = await Promise.all([
      axios.get(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/channels`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/members?limit=100`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } })
    ]);

    const guild = guildInfoRes.data;
    const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
    const channels = Array.isArray(channelsRes.data) ? channelsRes.data : [];
    const members = Array.isArray(membersRes.data) ? membersRes.data : [];

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
      return `<li class="member"><img src="${avatar}" class="mav"/><div class="md"><div class="mn"><strong>${tag}</strong> <small style="opacity:.75">(${m.user?.id||'N/A'})</small></div><div class="mr" style="opacity:.8">Roles: ${rolesForUser||'—'}</div></div><div class="ma"><button onclick="moderate('${guildId}','${m.user?.id}','kick')" class="danger">🚫 Kick</button><button onclick="moderate('${guildId}','${m.user?.id}','ban')" class="danger">🔨 Ban</button><button onclick="moderateTimeout('${guildId}','${m.user?.id}')" class="warn">🔇 Timeout</button></div></li>`;
    }).join('');

    // read recent logs for this guild
    let logsForGuild = '';
    try {
      const raw = fs.existsSync(path.join(__dirname,'acciones.log')) ? fs.readFileSync(path.join(__dirname,'acciones.log'),'utf8') : '';
      const lines = raw.split('\n').filter(l=>l && l.includes(guildId));
      logsForGuild = lines.reverse().slice(0,150).join('\n') || 'No hay acciones registradas para este servidor.';
    } catch(e){ logsForGuild = 'Error leyendo logs'; }

    // control what actions UI shows depending on role:
    const canManageRolesChannels = isOwner || isAdmin;
    const canModerate = isOwner || isAdmin || isModerator;
    const canSendMessagesAsBot = isOwner || isAdmin || isModerator;

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
      button{border:0;padding:6px 8px;border-radius:8px;cursor:pointer}
      .danger{background:#ff7b7b;color:#2b0505}
      .warn{background:#ffd88c;color:#2b1500}
      .primary{background:linear-gradient(90deg,var(--accent),var(--accent2));color:white}
      input,select,textarea{width:100%;padding:8px;border-radius:8px;border:0;outline:none;background:#0f1216;color:#eaf2ff;margin-bottom:8px}
      .form-row{margin-bottom:10px}
      .footer{display:flex;justify-content:space-between;align-items:center;padding:10px}
      pre.logbox{background:#071018;padding:12px;border-radius:8px;color:#bfe0ff;max-height:220px;overflow:auto}
      a.back{color:inherit;text-decoration:none;opacity:.9}
      @media(max-width:900px){ .main{flex-direction:column} }
      .muted { opacity: .5; pointer-events: none; }
    </style></head><body>
    <div class="wrap">
      <div class="top"><img class="icon" src="${iconUrl}" alt="icon"/><div><h1>${escapeHtml(guild.name)}</h1><div style="opacity:.85">ID: ${guild.id}</div><div class="stats"><div class="stat">👥 ${guild.approximate_member_count||'N/A'}</div><div class="stat">💬 ${channels.length}</div><div class="stat">🧾 ${roles.length}</div></div></div></div>

      <div class="main">
        <div class="panel">
          <h2>Miembros (hasta 100)</h2>
          <ul id="members">${membersHtml}</ul>
        </div>

        <div class="panel ${canSendMessagesAsBot ? '' : 'muted'}">
          <h2>Enviar mensaje como Abyssus</h2>
          <div class="form-row"><label>Canal</label><select id="channelSelect">${channelOptions}</select></div>
          <div class="form-row"><label>Mensaje</label><textarea id="messageContent" rows="4"></textarea></div>
          <div style="display:flex;gap:8px"><button class="primary" onclick="sendMessage()">Enviar</button><button onclick="document.getElementById('messageContent').value='/help'">Comando: /help</button></div>
          <hr style="margin:12px 0;border-top:1px solid rgba(255,255,255,0.03)"/>
          <h3>Roles</h3><ul>${rolesListHtml}</ul>
          <h3>Canales</h3><ul>${channelsListHtml}</ul>
        </div>
      </div>

      <div class="main">
        <div class="panel ${canModerate ? '' : 'muted'}">
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
            <button class="danger" onclick="kickFromInputs()">🚫 Kick</button>
            <button class="danger" onclick="banFromInputs()">🔨 Ban</button>
            <button class="warn" onclick="timeoutFromInputs()">🔇 Timeout</button>
          </div>
        </div>

        <div class="panel ${canManageRolesChannels ? '' : 'muted'}">
          <h2>Gestionar Roles / Canales</h2>
          <label>Crear rol — nombre</label><input id="newRoleName" placeholder="Nombre del rol"/>
          <div style="display:flex;gap:8px;margin-top:6px">
            <button onclick="createRole()" class="primary">Crear rol</button>
          </div>
          <hr style="margin:10px 0;border-top:1px solid rgba(255,255,255,0.03)"/>
          <label>Eliminar rol</label><select id="deleteRoleSelect">${roleOptions}</select>
          <div style="display:flex;gap:8px;margin-top:6px"><button class="danger" onclick="deleteRole()">Eliminar rol</button></div>
          <hr style="margin:10px 0;border-top:1px solid rgba(255,255,255,0.03)"/>
          <label>Crear canal (texto)</label><input id="newChannelName" placeholder="nombre-del-canal"/>
          <div style="display:flex;gap:8px;margin-top:6px"><button class="primary" onclick="createChannel()">Crear canal</button></div>
          <label style="margin-top:10px">Eliminar canal</label><select id="deleteChannelSelect">${channels.filter(c=>c.type!==4).map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select>
          <div style="display:flex;gap:8px;margin-top:6px"><button class="danger" onclick="deleteChannel()">Eliminar canal</button></div>
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

      <div class="footer"><a class="back" href="/mis-guilds/${userId}">← Volver</a><div><a class="primary" href="https://discord.com/channels/${guild.id}" target="_blank">Abrir en Discord</a></div></div>
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
        if(!name) return alert('Nombre requerido');
        if(!confirm('Crear rol '+name+'?')) return;
        try{ const r = await postApi('/api/guilds/'+guildId+'/create-role',{ name }); alert(r); location.reload(); } catch(e){ alert('Error:'+e.message); }
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
    </script>
    </body></html>`);
  } catch (err) {
    console.error('panel err:', err.response?.data || err.message);
    return res.status(500).send(`<h2>Error cargando panel</h2><pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// ----------------- API endpoints -----------------
// NOTE: All endpoints use requireSession and then check permissions via hasPermission or verifyOwnerByAccessToken as appropriate

// Kick
app.post('/api/guilds/:guildId/kick', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId } = req.body;
  const ses = req.session;
  const userId = req.sessionUserId;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    const isOwner = await verifyOwnerByAccessToken(ses.accessToken, guildId);
    const allowed = isOwner || await hasPermission(userId, guildId, 'moderator');
    if (!allowed) return res.status(403).send('No autorizado (perm panel insuficiente).');

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
    const isOwner = await verifyOwnerByAccessToken(ses.accessToken, guildId);
    // allow moderator ban? here we require moderator bit OR owner OR admin
    const allowed = isOwner || await hasPermission(userId, guildId, 'moderator');
    if (!allowed) return res.status(403).send('No autorizado (perm panel insuficiente).');

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
    const isOwner = await verifyOwnerByAccessToken(ses.accessToken, guildId);
    const allowed = isOwner || await hasPermission(userId, guildId, 'moderator');
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

// Send message as bot to a channel
app.post('/api/guilds/:guildId/message', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { channelId, content } = req.body;
  const ses = req.session;
  const userId = req.sessionUserId;
  if (!channelId || !content) return res.status(400).send('Falta channelId o content');
  try {
    const isOwner = await verifyOwnerByAccessToken(ses.accessToken, guildId);
    const allowed = isOwner || await hasPermission(userId, guildId, 'moderator');
    if (!allowed) return res.status(403).send('No autorizado (perm panel insuficiente).');

    const resp = await discordRequest('post', `/channels/${channelId}/messages`, { content });
    logAction('MESSAGE', { guildId, channelId, by: ses.username, content: content.slice(0,4000) });
    return res.status(200).send(safeJson(resp.data));
  } catch (e) {
    console.error('message err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// Create role (owner OR admin)
app.post('/api/guilds/:guildId/create-role', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { name, color, permissions } = req.body;
  const ses = req.session;
  const userId = req.sessionUserId;
  const BOT_TOKEN = process.env.BOT_TOKEN;

  if (!name) return res.status(400).json({ error: "Falta name" });

  try {
    const isOwner = await verifyOwnerByAccessToken(ses.accessToken, guildId);
    const isAdmin = await hasPermission(userId, guildId, 'admin');

    if (!isOwner && !isAdmin) return res.status(403).json({ error: "No autorizado (solo owner/admin)." });

    const newRole = await axios.post(
      `https://discord.com/api/v10/guilds/${guildId}/roles`,
      {
        name: name || "Nuevo Rol",
        color: color || null,
        permissions: permissions || "0",
      },
      {
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    logAction('CREATE_ROLE', { guildId, name, by: ses.username });
    return res.status(200).json({ success: true, role: newRole.data });
  } catch (error) {
    console.error("Error al crear rol:", error.response?.data || error.message);
    return res.status(500).json({ error: "Error al crear el rol." });
  }
});

// Delete role (owner OR admin)
app.post('/api/guilds/:guildId/delete-role', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { roleId } = req.body;
  const ses = req.session;
  const userId = req.sessionUserId;
  const BOT_TOKEN = process.env.BOT_TOKEN;

  if (!roleId) return res.status(400).json({ error: "Falta roleId" });

  try {
    const isOwner = await verifyOwnerByAccessToken(ses.accessToken, guildId);
    const isAdmin = await hasPermission(userId, guildId, 'admin');

    if (!isOwner && !isAdmin) return res.status(403).json({ error: "No autorizado (solo owner/admin)." });

    await axios.delete(`https://discord.com/api/v10/guilds/${guildId}/roles/${roleId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });

    logAction('DELETE_ROLE', { guildId, roleId, by: ses.username });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error al eliminar rol:", error.response?.data || error.message);
    return res.status(500).json({ error: "Error al eliminar el rol." });
  }
});

// Create channel (owner OR admin)
app.post('/api/guilds/:guildId/create-channel', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { name } = req.body;
  const ses = req.session;
  const userId = req.sessionUserId;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!name) return res.status(400).send('Falta name');
  try {
    const isOwner = await verifyOwnerByAccessToken(ses.accessToken, guildId);
    const isAdmin = await hasPermission(userId, guildId, 'admin');
    if (!isOwner && !isAdmin) return res.status(403).send('No autorizado (solo owner/admin).');

    const resp = await discordRequest('post', `/guilds/${guildId}/channels`, { name, type: 0 });
    logAction('CREATE_CHANNEL', { guildId, name, by: ses.username });
    return res.status(200).send('✅ Canal creado');
  } catch (e) {
    console.error('create channel err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// Delete channel (owner OR admin)
app.post('/api/guilds/:guildId/delete-channel', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { channelId } = req.body;
  const ses = req.session;
  const userId = req.sessionUserId;
  if (!channelId) return res.status(400).send('Falta channelId');
  try {
    const isOwner = await verifyOwnerByAccessToken(ses.accessToken, guildId);
    const isAdmin = await hasPermission(userId, guildId, 'admin');
    if (!isOwner && !isAdmin) return res.status(403).send('No autorizado (solo owner/admin).');

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
    const isOwner = await verifyOwnerByAccessToken(ses.accessToken, guildId);
    const allowed = isOwner || await hasPermission(req.sessionUserId, guildId, 'moderator');
    if (!allowed) return res.status(403).send('No autorizado');
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

// Clear logs for guild (delete lines containing guildId)
app.post('/logs/:guildId/clear', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const ses = req.session;
  try {
    const isOwner = await verifyOwnerByAccessToken(ses.accessToken, guildId);
    if (!isOwner) return res.status(403).send('No autorizado (solo owner).');
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

// ----------------- Start server -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));



































































































