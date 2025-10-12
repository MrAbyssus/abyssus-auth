// index.js - Abyssus Panel (single-file) - Owner + Admins (option B)
// Requirements: .env with CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, BOT_TOKEN
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// -------- CONFIG & FILE PATHS --------
const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;

const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'panel.log');

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !BOT_TOKEN) {
  console.error('ERROR: falta CLIENT_ID, CLIENT_SECRET, REDIRECT_URI o BOT_TOKEN en .env');
  process.exit(1);
}

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// -------- In-memory + persistence --------
let sesiones = new Map();
try {
  if (fs.existsSync(SESSIONS_FILE)) {
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf8') || '{}';
    const obj = JSON.parse(raw);
    for (const k of Object.keys(obj)) sesiones.set(k, obj[k]);
    console.log('Sesiones cargadas:', sesiones.size);
  }
} catch (e) {
  console.warn('No pude cargar sesiones:', e.message);
}

function persistSessions() {
  try {
    const obj = Object.fromEntries(sesiones);
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.error('Error guardando sesiones:', e.message);
  }
}

setInterval(() => {
  // limpiar sesiones mayores a 30 min
  const now = Date.now();
  for (const [k, s] of sesiones) {
    if (now - (s.createdAt || 0) > 1000 * 60 * 30) sesiones.delete(k);
  }
  persistSessions();
}, 1000 * 60 * 5);

// -------- Helpers --------
function safeJson(o) {
  try { return JSON.stringify(o, null, 2); } catch { return String(o); }
}
function escapeHtml(s = '') {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}
function appendLog(line) {
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (e) {
    console.error('Error escribiendo log:', e.message);
  }
}
function logAction(type, details = {}) {
  const line = `[${new Date().toISOString()}] ${type}: ${JSON.stringify(details)}`;
  appendLog(line);
  console.log(line);
}
async function discordRequest(method, url, body = null) {
  // url must start with /...
  try {
    const res = await axios({
      method,
      url: `https://discord.com/api/v10${url}`,
      headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
      data: body,
      validateStatus: s => true // we'll handle statuses
    });
    return res;
  } catch (e) {
    throw e;
  }
}

// check if user is owner OR has Administrator permission
async function verifyOwnerOrAdmin(userAccessToken, guildId) {
  try {
    const res = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${userAccessToken}` }
    });
    if (!Array.isArray(res.data)) return false;
    const g = res.data.find(x => x.id === guildId);
    if (!g) return false;
    if (g.owner === true) return true;
    // permissions is a string number
    try {
      const perms = BigInt(g.permissions || '0');
      const ADMIN = BigInt(0x8);
      return (perms & ADMIN) !== BigInt(0);
    } catch {
      return false;
    }
  } catch (e) {
    console.error('verifyOwnerOrAdmin error', e.response?.data || e.message);
    return false;
  }
}

// small sleep
const sleep = ms => new Promise(r => setTimeout(r, ms));

// -------- OAuth: login & callback --------
const usedCodes = new Set();

app.get('/login', (req, res) => {
  const authorizeUrl = 'https://discord.com/oauth2/authorize' +
    `?client_id=${encodeURIComponent(CLIENT_ID)}` +
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
  <div class="card"><div class="logo">A</div><div style="flex:1"><h1 style="margin:0 0 .3rem">Abyssus — Panel</h1><p style="margin:0 0 12px">Inicia sesión con Discord para ver tus servidores (owner o admin) donde Abyssus está instalado.</p><a class="btn" href="${authorizeUrl}">Iniciar con Discord</a></div></div>
  </body></html>`);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login');
  if (usedCodes.has(code)) return res.send('<h2>⚠️ Este código ya fue usado. Vuelve a <a href="/login">iniciar sesión</a>.</h2>');
  usedCodes.add(code);

  try {
    const tokenResp = await axios.post('https://discord.com/api/oauth2/token',
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

    const userRes = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` }});
    const u = userRes.data;

    sesiones.set(u.id, {
      id: u.id,
      username: u.username,
      discriminator: u.discriminator,
      avatar: u.avatar,
      accessToken,
      refreshToken,
      createdAt: Date.now()
    });
    persistSessions();

    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autenticado</title>
      <style>body{font-family:Inter,Arial;background:#071022;color:#eaf2ff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#071022;padding:28px;border-radius:12px;border:1px solid rgba(255,255,255,0.03);text-align:center}</style>
      </head><body><div class="card"><img src="https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png" style="width:84px;height:84px;border-radius:12px;margin-bottom:12px" onerror="this.style.display='none'"/><h2>¡Autenticación exitosa!</h2><p style="opacity:.9">${escapeHtml(u.username)}#${escapeHtml(u.discriminator)}</p><a style="display:inline-block;margin-top:12px;padding:10px 14px;border-radius:10px;background:linear-gradient(90deg,#5865F2,#764ba2);color:#fff;text-decoration:none" href="/mis-guilds/${u.id}">Ver mis servidores</a></div></body></html>`);
  } catch (e) {
    console.error('callback error:', e.response?.data || e.message);
    return res.status(500).send(`<h2>Error OAuth2</h2><pre>${safeJson(e.response?.data || e.message)}</pre>`);
  }
});

// -------- List guilds where user is owner OR admin and bot is present --------
app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const ses = sesiones.get(userId);
  if (!ses) return res.redirect('/login');

  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${ses.accessToken}` }
    });
    const allGuilds = Array.isArray(guildsRes.data) ? guildsRes.data : [];
    // filter owner or admin
    const allowed = allGuilds.filter(g => g.owner === true || ((BigInt(g.permissions || '0') & BigInt(0x8)) !== BigInt(0)));

    // check bot presence in concurrent chunks
    const botPresent = [];
    const CONCURRENCY = 6;
    for (let i = 0; i < allowed.length; i += CONCURRENCY) {
      const chunk = allowed.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(async g => {
        try {
          // try to get guild info with bot token
          const info = await discordRequest('get', `/guilds/${g.id}?with_counts=true`);
          if (info.status === 200) {
            botPresent.push({
              id: g.id,
              name: g.name,
              icon: g.icon,
              member_count: info.data.approximate_member_count || 'N/A',
              roles_count: Array.isArray(info.data.roles) ? info.data.roles.length : 'N/A'
            });
          }
        } catch (err) {
          // ignore
        }
      }));
      await sleep(80);
    }

    const guildsHtml = botPresent.length ? botPresent.map(g => {
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
    <div class="wrap"><header><div><h2>Dashboard Abyssus</h2><div style="opacity:.8">Usa el panel para moderación, gestión y logs</div></div><div><a class="btn" href="/login">Cambiar cuenta</a></div></header><section class="grid">${guildsHtml}</section><p style="opacity:.8;margin-top:14px">Si no ves un servidor, verifica que Abyssus esté invitado y que tu cuenta tenga permisos.</p></div></body></html>`);
  } catch (e) {
    console.error('mis-guilds err:', e.response?.data || e.message);
    res.status(500).send(`<h2>Error obteniendo servidores</h2><pre>${safeJson(e.response?.data || e.message)}</pre>`);
  }
});

// -------- middleware: require session --------
function requireSession(req, res, next) {
  const userId = req.query.userId || req.body.userId;
  if (!userId) return res.status(400).send('Falta userId');
  const ses = sesiones.get(userId);
  if (!ses) return res.status(401).send('No autenticado. Inicia sesión.');
  req.sessionUserId = userId;
  req.session = ses;
  next();
}

// -------- Panel per guild (owner or admin verified) --------
app.get('/panel/:guildId', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const userId = req.sessionUserId;
  const ses = req.session;

  try {
    const allowed = await verifyOwnerOrAdmin(ses.accessToken, guildId);
    if (!allowed) return res.status(403).send('No autorizado (owner o administrador requerido)');

    // fetch guild info using bot token
    const [giRes, rolesRes, channelsRes, membersRes] = await Promise.all([
      discordRequest('get', `/guilds/${guildId}?with_counts=true`),
      discordRequest('get', `/guilds/${guildId}/roles`),
      discordRequest('get', `/guilds/${guildId}/channels`),
      discordRequest('get', `/guilds/${guildId}/members?limit=100`)
    ]);

    if (giRes.status >= 400) throw giRes;
    const guild = giRes.data;
    const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
    const channels = Array.isArray(channelsRes.data) ? channelsRes.data : [];
    const members = Array.isArray(membersRes.data) ? membersRes.data : [];

    const iconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : 'https://via.placeholder.com/128?text=?';
    const tipoCanalEmoji = {0:'📝',2:'🎤',4:'📂',13:'🎙️',15:'🗂️'};

    const rolesListHtml = roles.map(r => `<li>${escapeHtml(r.name)} <small style="opacity:.7">(${r.id})</small></li>`).join('');
    const channelsListHtml = channels.map(c => `<li>${tipoCanalEmoji[c.type]||'❔'} ${escapeHtml(c.name)} <small style="opacity:.7">(${c.id})</small></li>`).join('');
    const channelOptions = channels.filter(c=>c.type===0).map(c => `<option value="${c.id}"># ${escapeHtml(c.name)}</option>`).join('');
    const roleOptions = roles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    const membersHtml = members.map(m => {
      const tag = m.user ? `${escapeHtml(m.user.username)}#${escapeHtml(m.user.discriminator)}` : escapeHtml(m.nick || 'Unknown');
      const avatar = m.user?.avatar ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/${(parseInt(m.user?.discriminator||'0')%5)}.png`;
      const rolesForUser = Array.isArray(m.roles) ? m.roles.map(rid=>escapeHtml(rid)).join(', ') : '';
      return `<li class="member"><img src="${avatar}" class="mav"/><div class="md"><div class="mn"><strong>${tag}</strong> <small style="opacity:.75">(${m.user?.id||'N/A'})</small></div><div class="mr" style="opacity:.8">Roles: ${rolesForUser||'—'}</div></div><div class="ma"><button onclick="moderate('${m.user?.id}','kick')" class="danger">🚫 Kick</button><button onclick="moderate('${m.user?.id}','ban')" class="danger">🔨 Ban</button><button onclick="moderateTimeout('${m.user?.id}')" class="warn">🔇 Timeout</button></div></li>`;
    }).join('');

    // logs for this guild
    let logsForGuild = '';
    try {
      const raw = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE,'utf8') : '';
      const lines = raw.split('\n').filter(l=>l && l.includes(guildId));
      logsForGuild = (lines.reverse().slice(0,200).join('\n')) || 'No hay acciones registradas para este servidor.';
    } catch(e) { logsForGuild = 'Error leyendo logs'; }

    // Render page
    res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abyssus — Panel ${escapeHtml(guild.name)}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
      :root{--accent:#5865F2;--accent2:#764ba2}
      body{font-family:Inter,Arial;margin:0;background:#090b0f;color:#eaf2ff;padding:18px}
      .wrap{max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
      .top{display:flex;gap:12px;align-items:center}
      .icon{width:96px;height:96px;border-radius:12px;object-fit:cover}
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
          <div style="display:flex;gap:8px"><button class="primary" onclick="sendMessage()">Enviar</button><button onclick="document.getElementById('messageContent').value='/help'">Comando: /help</button></div>
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
            <button class="danger" onclick="kickFromInputs()">🚫 Kick</button>
            <button class="danger" onclick="banFromInputs()">🔨 Ban</button>
            <button class="warn" onclick="timeoutFromInputs()">🔇 Timeout</button>
          </div>
        </div>

        <div class="panel">
          <h2>Gestionar Roles / Canales</h2>
          <label>Crear rol — nombre</label><input id="newRoleName" placeholder="Nombre del rol"/>
          <div style="display:flex;gap:8px;margin-top:6px"><button onclick="createRole()" class="primary">Crear rol</button></div>
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
        <div style="display:flex;gap:8px;margin-top:8px"><button onclick="refreshLogs()">Actualizar logs</button><button class="danger" onclick="clearLogs()">Borrar logs de este servidor</button></div>
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

      async function moderate(targetId, action) {
        if (!confirm(action + ' a ' + targetId + ' ?')) return;
        try { const txt = await postApi('/api/guilds/'+guildId+'/'+action, { targetId }); alert(txt); location.reload(); } catch(e){ alert('Error: '+e.message); }
      }

      function kickFromInputs(){ const id=document.getElementById('modUserId').value.trim(); if(!id) return alert('ID requerido'); if(!confirm('Kick '+id+'?')) return; postApi('/api/guilds/'+guildId+'/kick',{ targetId:id }).then(a=>{alert(a);location.reload()}).catch(e=>alert('Error:'+e.message)); }
      function banFromInputs(){ const id=document.getElementById('modUserId').value.trim(); const reason=document.getElementById('modReason').value||'Banned via panel'; const days=parseInt(document.getElementById('modDays').value||'0',10); if(!id) return alert('ID requerido'); if(!confirm('Ban '+id+'?')) return; postApi('/api/guilds/'+guildId+'/ban',{ targetId:id, reason, deleteMessageDays:days }).then(a=>{alert(a);location.reload()}).catch(e=>alert('Error:'+e.message)); }
      function timeoutFromInputs(){ const id=document.getElementById('modUserId').value.trim(); const mins=parseInt(document.getElementById('modTimeout').value||'10',10); if(!id) return alert('ID requerido'); if(!confirm('Timeout '+id+' por '+mins+' min?')) return; postApi('/api/guilds/'+guildId+'/timeout',{ targetId:id, minutes:mins }).then(a=>{alert(a);location.reload()}).catch(e=>alert('Error:'+e.message)); }

      async function sendMessage(){
        const channelId = document.getElementById('channelSelect').value;
        const content = document.getElementById('messageContent').value.trim();
        if(!channelId || !content) return alert('Selecciona canal y escribe mensaje');
        try { await postApi('/api/guilds/'+guildId+'/message',{ channelId, content }); alert('Mensaje enviado'); document.getElementById('messageContent').value=''; } catch(e){ alert('Error: '+e.message); }
      }

      async function createRole(){ const name=document.getElementById('newRoleName').value.trim(); if(!name) return alert('Nombre requerido'); if(!confirm('Crear rol '+name+'?')) return; try{ const r = await postApi('/api/guilds/'+guildId+'/create-role',{ name }); alert(r); location.reload(); } catch(e){ alert('Error:'+e.message); } }
      async function deleteRole(){ const roleId=document.getElementById('deleteRoleSelect').value; if(!roleId) return alert('Selecciona rol'); if(!confirm('Eliminar rol '+roleId+'?')) return; try{ const r = await postApi('/api/guilds/'+guildId+'/delete-role',{ roleId }); alert(r); location.reload(); } catch(e){ alert('Error:'+e.message); } }
      async function createChannel(){ const name=document.getElementById('newChannelName').value.trim(); if(!name) return alert('Nombre requerido'); if(!confirm('Crear canal '+name+'?')) return; try{ const r = await postApi('/api/guilds/'+guildId+'/create-channel',{ name }); alert(r); location.reload(); } catch(e){ alert('Error:'+e.message); } }
      async function deleteChannel(){ const channelId=document.getElementById('deleteChannelSelect').value; if(!channelId) return alert('Selecciona canal'); if(!confirm('Eliminar canal '+channelId+'?')) return; try{ const r = await postApi('/api/guilds/'+guildId+'/delete-channel',{ channelId }); alert(r); location.reload(); } catch(e){ alert('Error:'+e.message); } }

      async function refreshLogs(){ try{ const res = await fetch('/logs/'+guildId+'?userId='+userId); const txt = await res.text(); document.getElementById('logsBox').textContent = txt; } catch(e){ alert('Error al obtener logs'); } }
      async function clearLogs(){ if(!confirm('Borrar todas las entradas del log para este servidor?')) return; try{ const res = await fetch('/logs/'+guildId+'/clear', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ userId })}); const txt = await res.text(); alert(txt); refreshLogs(); } catch(e){ alert('Error al borrar logs'); } }
    </script>

    </body></html>`);
  } catch (err) {
    console.error('panel err:', err.response?.data || err.message);
    return res.status(500).send(`<h2>Error cargando panel</h2><pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// -------- API endpoints (owner or admin verified) --------
// Helper uses verifyOwnerOrAdmin already to check
app.post('/api/guilds/:guildId/kick', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const { targetId } = req.body;
  const ses = req.session;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('delete', `/guilds/${guildId}/members/${targetId}`);
    if (r.status >= 400) return res.status(r.status).send(safeJson(r.data));
    logAction('KICK', { guildId, targetId, by: ses.id });
    appendLog(`[${new Date().toISOString()}] GUILD:${guildId} KICK target:${targetId} by:${ses.id}`);
    return res.send('✅ Usuario expulsado');
  } catch (e) {
    console.error('kick err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

app.post('/api/guilds/:guildId/ban', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const { targetId, reason = 'Banned via panel', deleteMessageDays = 0 } = req.body;
  const ses = req.session;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const payload = { reason };
    if (deleteMessageDays) payload.delete_message_seconds = (deleteMessageDays||0) * 24 * 3600;
    const r = await discordRequest('put', `/guilds/${guildId}/bans/${targetId}`, payload);
    if (r.status >= 400) return res.status(r.status).send(safeJson(r.data));
    logAction('BAN', { guildId, targetId, by: ses.id, reason, deleteMessageDays });
    appendLog(`[${new Date().toISOString()}] GUILD:${guildId} BAN target:${targetId} by:${ses.id} reason:${reason}`);
    return res.send('✅ Usuario baneado');
  } catch (e) {
    console.error('ban err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

app.post('/api/guilds/:guildId/timeout', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const { targetId, minutes = 10 } = req.body;
  const ses = req.session;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const until = new Date(Date.now() + (minutes||10) * 60 * 1000).toISOString();
    const r = await discordRequest('patch', `/guilds/${guildId}/members/${targetId}`, { communication_disabled_until: until });
    if (r.status >= 400) return res.status(r.status).send(safeJson(r.data));
    logAction('TIMEOUT', { guildId, targetId, by: ses.id, minutes });
    appendLog(`[${new Date().toISOString()}] GUILD:${guildId} TIMEOUT target:${targetId} by:${ses.id} minutes:${minutes}`);
    return res.send('✅ Timeout aplicado');
  } catch (e) {
    console.error('timeout err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

app.post('/api/guilds/:guildId/message', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const { channelId, content } = req.body;
  const ses = req.session;
  if (!channelId || !content) return res.status(400).send('Falta channelId o content');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('post', `/channels/${channelId}/messages`, { content });
    if (r.status >= 400) return res.status(r.status).send(safeJson(r.data));
    logAction('MESSAGE', { guildId, channelId, by: ses.id, content: content.slice(0,2000) });
    appendLog(`[${new Date().toISOString()}] GUILD:${guildId} MESSAGE channel:${channelId} by:${ses.id} content:${content.slice(0,2000)}`);
    return res.status(200).send(safeJson(r.data));
  } catch (e) {
    console.error('message err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

app.post('/api/guilds/:guildId/create-role', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const { name } = req.body;
  const ses = req.session;
  if (!name) return res.status(400).send('Falta name');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('post', `/guilds/${guildId}/roles`, { name });
    if (r.status >= 400) return res.status(r.status).send(safeJson(r.data));
    logAction('CREATE_ROLE', { guildId, name, by: ses.id });
    appendLog(`[${new Date().toISOString()}] GUILD:${guildId} CREATE_ROLE name:${name} by:${ses.id}`);
    return res.status(200).send('✅ Rol creado');
  } catch (e) {
    console.error('create role err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

app.post('/api/guilds/:guildId/delete-role', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const { roleId } = req.body;
  const ses = req.session;
  if (!roleId) return res.status(400).send('Falta roleId');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('delete', `/guilds/${guildId}/roles/${roleId}`);
    if (r.status >= 400) return res.status(r.status).send(safeJson(r.data));
    logAction('DELETE_ROLE', { guildId, roleId, by: ses.id });
    appendLog(`[${new Date().toISOString()}] GUILD:${guildId} DELETE_ROLE role:${roleId} by:${ses.id}`);
    return res.status(200).send('✅ Rol eliminado');
  } catch (e) {
    console.error('delete role err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

app.post('/api/guilds/:guildId/create-channel', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const { name } = req.body;
  const ses = req.session;
  if (!name) return res.status(400).send('Falta name');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('post', `/guilds/${guildId}/channels`, { name, type: 0 });
    if (r.status >= 400) return res.status(r.status).send(safeJson(r.data));
    logAction('CREATE_CHANNEL', { guildId, name, by: ses.id });
    appendLog(`[${new Date().toISOString()}] GUILD:${guildId} CREATE_CHANNEL name:${name} by:${ses.id}`);
    return res.status(200).send('✅ Canal creado');
  } catch (e) {
    console.error('create channel err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

app.post('/api/guilds/:guildId/delete-channel', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const { channelId } = req.body;
  const ses = req.session;
  if (!channelId) return res.status(400).send('Falta channelId');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('delete', `/channels/${channelId}`);
    if (r.status >= 400) return res.status(r.status).send(safeJson(r.data));
    logAction('DELETE_CHANNEL', { guildId, channelId, by: ses.id });
    appendLog(`[${new Date().toISOString()}] GUILD:${guildId} DELETE_CHANNEL channel:${channelId} by:${ses.id}`);
    return res.status(200).send('✅ Canal eliminado');
  } catch (e) {
    console.error('delete channel err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// -------- Logs endpoints --------
app.get('/logs/:guildId', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const ses = req.session;
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    if (!fs.existsSync(LOG_FILE)) return res.send('No hay logs.');
    const raw = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = raw.split('\n').filter(l => l && l.includes(guildId));
    return res.send(lines.reverse().join('\n') || 'No hay logs para este servidor.');
  } catch (e) {
    console.error('logs err:', e);
    return res.status(500).send('Error leyendo logs');
  }
});

app.post('/logs/:guildId/clear', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const ses = req.session;
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    if (!fs.existsSync(LOG_FILE)) return res.send('No hay logs.');
    const raw = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = raw.split('\n').filter(l => l && !l.includes(guildId));
    fs.writeFileSync(LOG_FILE, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
    return res.send('✅ Logs del servidor borrados');
  } catch (e) {
    console.error('clear logs err:', e);
    return res.status(500).send('Error al borrar logs');
  }
});

// -------- Start server --------
app.listen(PORT, () => {
  console.log(`Abyssus Panel escuchando en puerto ${PORT}`);
});

























































































