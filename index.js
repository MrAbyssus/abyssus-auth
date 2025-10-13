// index.js — Abyssus panel (single-file) + visual logs + debug block
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- Config (asegúrate .env) ----------
const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;
const DISCORD_API = 'https://discord.com/api/v10';

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !BOT_TOKEN) {
  console.error('Error: faltan CLIENT_ID, CLIENT_SECRET, REDIRECT_URI o BOT_TOKEN en .env');
  process.exit(1);
}

// ---------- In-memory stores ----------
const sessions = new Map();      // userId -> session { accessToken, ... }
const usedCodes = new Set();     // evitar reuso de code
const logsMem = [];              // logs visuales [{ts, guildId, type, details}]
const LOG_FILE = path.join(__dirname, 'panel.log'); // opcional persistencia (best-effort)

// ---------- Helpers ----------
function escapeHtml(s = '') {
  return String(s)
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
function pushLog(item) {
  const entry = { ts: new Date().toISOString(), ...item };
  logsMem.unshift(entry);
  if (logsMem.length > 1000) logsMem.length = 1000;
  try { fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8'); } catch(e) {}
}
async function discordRequest(method, url, body=null, opts={}) {
  // url may be /guilds/.. or full
  const cfg = {
    method,
    url: url.startsWith('http') ? url : (DISCORD_API + url),
    headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    data: body,
    validateStatus: () => true,
    timeout: opts.timeout || 10000
  };
  return axios(cfg);
}
async function userRequest(accessToken, method, url, body=null) {
  return axios({
    method,
    url: DISCORD_API + url,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    data: body,
    validateStatus: () => true
  });
}

// Obtener BOT_ID al arrancar (mejorar info)
let BOT_ID = null;
(async () => {
  try {
    const r = await axios.get(DISCORD_API + '/users/@me', { headers: { Authorization: `Bot ${BOT_TOKEN}` }});
    BOT_ID = r.data.id;
    console.log('BOT_ID:', BOT_ID);
  } catch (e) {
    console.warn('No se pudo obtener BOT_ID en startup:', e.message);
  }
})();

// ---------- OAuth2 Login ----------
app.get('/login', (req, res) => {
  const authorizeUrl =
    'https://discord.com/oauth2/authorize' +
    `?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=identify%20guilds`; // IMPORTANT: guilds scope

  res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Abyssus — Login</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
    body{font-family:Inter,Arial;background:#0b0f14;color:#eaf2ff;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{width:100%;max-width:720px;background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));padding:28px;border-radius:12px;border:1px solid rgba(255,255,255,0.03);display:flex;gap:20px;align-items:center}
    .logo{width:72px;height:72px;border-radius:12px;background:linear-gradient(135deg,#243b6b,#5b3a86);display:flex;align-items:center;justify-content:center;font-weight:800;color:white;font-size:28px}
    h1{margin:0;font-size:1.4rem}
    p{margin:6px 0 14px;color:rgba(234,242,255,0.85)}
    a.btn{background:linear-gradient(90deg,#5865F2,#764ba2);color:white;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700}
  </style></head><body>
  <div class="card">
    <div class="logo">A</div>
    <div style="flex:1">
      <h1>Abyssus — Panel</h1>
      <p>Inicia sesión con Discord para ver los servidores donde eres owner/admin y Abyssus está presente.</p>
      <a class="btn" href="${authorizeUrl}">Iniciar sesión con Discord</a>
      <p style="margin-top:12px;font-size:0.9rem;opacity:0.9">Asegúrate que <code>REDIRECT_URI</code> en .env coincide exactamente con el portal de Discord.</p>
    </div>
  </div>
  </body></html>`);
});

// ---------- Callback ----------
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login');
  if (usedCodes.has(code)) return res.send('<h3>Este código ya fue usado. Vuelve a iniciar sesión.</h3>');
  usedCodes.add(code);

  try {
    const tokenResp = await axios.post(DISCORD_API + '/oauth2/token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const access_token = tokenResp.data.access_token;
    const refresh_token = tokenResp.data.refresh_token;

    const userRes = await axios.get(DISCORD_API + '/users/@me', { headers: { Authorization: `Bearer ${access_token}` }});
    const u = userRes.data;
    sessions.set(u.id, { id: u.id, username: u.username, discriminator: u.discriminator, avatar: u.avatar, accessToken: access_token, refreshToken: refresh_token, createdAt: Date.now() });
    pushLog({ guildId: 'AUTH', type: 'LOGIN', details: { user: u.id, username: `${u.username}#${u.discriminator}` } });

    res.redirect(`/mis-guilds/${u.id}`);
  } catch (e) {
    console.error('callback err', e.response?.data || e.message);
    res.status(500).send(`<pre>${escapeHtml(JSON.stringify(e.response?.data || e.message, null, 2))}</pre>`);
  }
});

// ---------- Middleware session ----------
function requireSession(req, res, next) {
  const userId = req.query.userId || req.body.userId;
  if (!userId) return res.status(400).send('Falta userId (query/body)');
  const s = sessions.get(userId);
  if (!s) return res.status(401).send('No autenticado. Inicia sesión en /login');
  req.session = s; req.sessionUserId = userId;
  next();
}

// ---------- List servers: intersection userGuilds (owner/admin) x botPresent ----------
app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const ses = sessions.get(userId);
  if (!ses) return res.redirect('/login');

  try {
    // 1) obtener guilds del usuario (puede fallar -> mostrar debug)
    let userGuilds;
    try {
      const ug = await userRequest(ses.accessToken, 'get', '/users/@me/guilds');
      if (ug.status !== 200) throw new Error(`HTTP ${ug.status}`);
      userGuilds = Array.isArray(ug.data) ? ug.data : [];
    } catch (errGuilds) {
      console.error('Error obteniendo guilds del usuario:', errGuilds.response?.data || errGuilds.message);
      // mostrar bloque de depuración visual con el error de Discord
      const debugInfo = errGuilds.response?.data || errGuilds.message;
      return res.status(500).send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error guilds</title>
        <style>body{background:#0b0f14;color:#fff;font-family:Inter,Arial;padding:28px} .box{background:#121318;padding:18px;border-radius:10px;border:1px solid rgba(255,255,255,0.03)}</style></head><body>
        <div class="box"><h2>⚠️ No se pudieron obtener tus servidores</h2>
        <p>Discord devolvió:</p><pre style="background:#0a0d12;padding:10px;border-radius:8px;color:#bfe0ff">${escapeHtml(JSON.stringify(debugInfo, null, 2))}</pre>
        <p><strong>Comprueba:</strong></p><ul><li>Que el scope <code>guilds</code> se pidió en la autorización (scope=identify%20guilds).</li><li>Que el <code>REDIRECT_URI</code> en .env coincide exactamente con el del Developer Portal.</li><li>Si el error es <code>invalid_grant</code> o <code>rate_limited</code>, espera unos minutos y vuelve a intentar.</li></ul>
        <p><a href="/login">Volver a login</a></p></div></body></html>`);
    }

    // 2) filtrar sólo owner/admin (reduce checks)
    const filtered = userGuilds.filter(g => g.owner === true || ((BigInt(g.permissions || '0') & BigInt(0x8)) !== 0n));

    // 3) comprobar presencia del bot: para cada candidate pedir /guilds/{id} con Bot token (paralelizar)
    const botPresent = [];
    const CONC = 6;
    for (let i = 0; i < filtered.length; i += CONC) {
      const chunk = filtered.slice(i, i + CONC);
      await Promise.all(chunk.map(async g => {
        try {
          const r = await discordRequest('get', `/guilds/${g.id}?with_counts=true`);
          if (r.status === 200) {
            botPresent.push({
              id: g.id, name: g.name, icon: g.icon,
              member_count: r.data.approximate_member_count || 'N/A',
              roles_count: Array.isArray(r.data.roles) ? r.data.roles.length : 'N/A'
            });
          }
        } catch (e) {}
      }));
    }

    // 4) render
    const itemsHtml = botPresent.length ? botPresent.map(g => {
      const icon = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : 'https://via.placeholder.com/128?text=?';
      return `<li class="card"><img src="${icon}" onerror="this.src='https://via.placeholder.com/128?text=?'"/><div class="meta"><div class="name">${escapeHtml(g.name)}</div><div class="sub">👥 ${g.member_count} • 🧾 ${g.roles_count}</div><div style="margin-top:8px"><a class="btn" href="/panel/${g.id}?userId=${userId}">Abrir panel</a></div></div></li>`;
    }).join('') : `<div class="empty">No hay servidores (owner/admin) donde Abyssus esté presente.</div>`;

    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Abyssus — Mis servidores</title>
      <style>
        body{background:#0a0d12;color:#eaf2ff;font-family:Inter,Arial;margin:0;padding:28px}
        .wrap{max-width:1100px;margin:0 auto}
        header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
        .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
        .card{display:flex;gap:12px;align-items:center;padding:12px;border-radius:10px;background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));border:1px solid rgba(255,255,255,0.03)}
        .card img{width:72px;height:72px;border-radius:8px;object-fit:cover}
        .meta{flex:1}
        .btn{background:linear-gradient(90deg,#5865F2,#764ba2);color:#fff;padding:8px 12px;border-radius:8px;text-decoration:none}
        .empty{padding:18px;border-radius:10px;background:#071022;text-align:center}
      </style></head><body><div class="wrap"><header><div><h2>Dashboard Abyssus</h2><div style="opacity:.8">Panel de moderación y gestión</div></div><div><a class="btn" href="/login">Cambiar cuenta</a></div></header><section class="grid">${itemsHtml}</section><p style="opacity:.8;margin-top:14px">Si no ves un servidor, verifica que Abyssus esté invitado y que seas owner o tengas permisos de administrador.</p></div></body></html>`);
  } catch (e) {
    console.error('mis-guilds general err', e.response?.data || e.message);
    res.status(500).send(`<pre>${escapeHtml(JSON.stringify(e.response?.data || e.message, null, 2))}</pre>`);
  }
});

// ---------- Panel por guild (owner/admin) + verificación bot + logs visuales ----------
app.get('/panel/:guildId', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const ses = req.session;

  try {
    // Check user owner/admin on guild
    const userGuildsRes = await userRequest(ses.accessToken, 'get', '/users/@me/guilds');
    const userGuilds = Array.isArray(userGuildsRes.data) ? userGuildsRes.data : [];
    const accessOk = userGuilds.some(g => g.id === guildId && (g.owner === true || ((BigInt(g.permissions || '0') & BigInt(0x8)) !== 0n)));
    if (!accessOk) return res.status(403).send('No autorizado (owner/admin requerido)');

    // fetch guild info with bot token
    const [giRes, rolesRes, channelsRes, membersRes] = await Promise.all([
      discordRequest('get', `/guilds/${guildId}?with_counts=true`),
      discordRequest('get', `/guilds/${guildId}/roles`),
      discordRequest('get', `/guilds/${guildId}/channels`),
      discordRequest('get', `/guilds/${guildId}/members?limit=100`)
    ]);
    if (giRes.status !== 200) throw new Error('No pude cargar info del servidor con token del bot');

    const guild = giRes.data;
    const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
    const channels = Array.isArray(channelsRes.data) ? channelsRes.data : [];
    const members = Array.isArray(membersRes.data) ? membersRes.data : [];

    const rolesRows = roles.map(r => `<tr data-roleid="${r.id}"><td>${escapeHtml(r.name)}</td><td><code>${r.id}</code></td><td>${r.position}</td><td><button class="btn" onclick="openEdit('${r.id}','${escapeHtml(r.name)}',${r.position})">Editar</button></td></tr>`).join('');
    const logsForGuild = logsMem.filter(l => l.guildId === guildId).slice(0,200);

    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abyssus — Panel ${escapeHtml(guild.name)}</title>
      <style>
        body{background:#090b0f;color:#eaf2ff;font-family:Inter,Arial;margin:0;padding:18px}
        .wrap{max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
        .top{display:flex;gap:12px;align-items:center}
        .icon{width:96px;height:96px;border-radius:12px;object-fit:cover}
        .stats{display:flex;gap:8px;margin-top:8px}
        .stat{background:rgba(255,255,255,0.02);padding:8px 10px;border-radius:8px;font-weight:600}
        .main{display:flex;gap:12px;flex-wrap:wrap}
        .panel{flex:1 1 420px;background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.03);max-height:720px;overflow:auto}
        table{width:100%;border-collapse:collapse}
        th,td{padding:8px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.03)}
        .btn{background:linear-gradient(90deg,#5865F2,#764ba2);color:white;padding:8px 10px;border-radius:8px;text-decoration:none;border:0;cursor:pointer}
        input,select,textarea{width:100%;padding:8px;border-radius:8px;border:0;background:#0f1216;color:#eaf2ff;margin-bottom:8px}
        .logbox{background:#071018;padding:12px;border-radius:8px;color:#bfe0ff;max-height:320px;overflow:auto;white-space:pre-wrap}
        .small{font-size:.9rem;opacity:.85}
        .member{display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;margin-bottom:8px;background:rgba(0,0,0,0.25)}
        .mav{width:44px;height:44px;border-radius:8px;object-fit:cover}
      </style>
    </head><body>
      <div class="wrap">
        <div class="top"><img class="icon" src="${guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : ''}" onerror="this.style.display='none'"/><div><h1>${escapeHtml(guild.name)}</h1><div class="small">ID: ${guild.id}</div><div class="stats"><div class="stat">👥 ${guild.approximate_member_count||'N/A'}</div><div class="stat">💬 ${channels.length}</div><div class="stat">🧾 ${roles.length}</div></div></div></div>

        <div class="main">
          <div class="panel">
            <h2>Roles</h2>
            <table><thead><tr><th>Nombre</th><th>ID</th><th>Pos</th><th>Acciones</th></tr></thead><tbody id="rolesTable">${rolesRows}</tbody></table>
            <div style="margin-top:12px"><input id="newRoleName" placeholder="Nombre del rol"/><button class="btn" onclick="createRole()">Crear rol</button></div>
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
            <div id="botPerms">Cargando...</div>
            <div style="margin-top:8px"><button class="btn" onclick="checkBot()">Actualizar verificación</button></div>
          </div>

          <div class="panel">
            <h2>Logs (visual)</h2>
            <div id="logs" class="logbox">${escapeHtml(logsForGuild.map(l=>`[${l.ts}] ${l.type}: ${JSON.stringify(l.details)}`).join('\\n'))}</div>
            <div style="margin-top:8px"><button class="btn" onclick="refreshLogs()">Actualizar logs</button> <button class="btn" onclick="clearLogs()">Borrar logs visuales</button></div>
          </div>
        </div>

        <div style="display:flex;gap:8px;justify-content:space-between"><a class="btn" href="/mis-guilds/${req.sessionUserId}">← Volver</a><a class="btn" href="https://discord.com/channels/${guild.id}" target="_blank">Abrir en Discord</a></div>
      </div>

      <script>
        const userId = '${req.sessionUserId}';
        const guildId = '${guild.id}';

        async function api(path, opts = {}) {
          opts.method = opts.method || 'GET';
          opts.headers = Object.assign({'Content-Type':'application/json'}, opts.headers || {});
          const url = path + (path.includes('?') ? '&' : '?') + 'userId=' + userId;
          const r = await fetch(url, opts);
          const text = await r.text();
          if (!r.ok) throw new Error(text || r.statusText);
          try { return JSON.parse(text); } catch { return text; }
        }

        async function checkBot() {
          try {
            const j = await api('/api/check-bot-permissions/' + guildId);
            const box = document.getElementById('botPerms');
            if (!j.botInGuild) { box.innerHTML = '<div style="color:#ffb3b3">Bot no presente o sin acceso.</div>'; return; }
            let html = '<ul>';
            for (const k of Object.keys(j.permissions)) html += '<li>' + k + ': ' + (j.permissions[k] ? '✅' : '❌') + '</li>';
            html += '</ul>';
            html += '<div class="small" style="margin-top:8px">Bot role pos: ' + (j.botRolePosition ?? 'N/A') + ' • Highest editable pos: ' + (j.highestEditableRolePosition ?? 'N/A') + '</div>';
            box.innerHTML = html;
          } catch (e) { alert('Error al verificar bot: ' + e.message); }
        }

        async function refreshLogs() {
          try {
            const j = await api('/api/logs/' + guildId);
            document.getElementById('logs').textContent = j;
          } catch (e) { alert('Error logs: ' + e.message); }
        }

        async function clearLogs() {
          if (!confirm('Borrar logs visuales de este servidor?')) return;
          try {
            const txt = await api('/api/logs/' + guildId + '/clear', { method:'POST', body: JSON.stringify({}) });
            alert(txt);
            refreshLogs();
          } catch (e) { alert('Error: ' + e.message); }
        }

        async function createRole() {
          const name = document.getElementById('newRoleName').value.trim();
          if (!name) return alert('Nombre requerido');
          if (!confirm('Crear rol ' + name + '?')) return;
          try { const r = await api('/api/guilds/' + guildId + '/create-role', { method:'POST', body: JSON.stringify({ name }) }); alert(r); location.reload(); } catch (e) { alert('Error: ' + e.message); }
        }
        async function createChannel() {
          const name = document.getElementById('newChannelName').value.trim();
          if (!name) return alert('Nombre requerido');
          if (!confirm('Crear canal ' + name + '?')) return;
          try { const r = await api('/api/guilds/' + guildId + '/create-channel', { method:'POST', body: JSON.stringify({ name }) }); alert(r); location.reload(); } catch (e) { alert('Error: ' + e.message); }
        }

        // initial check
        checkBot();
      </script>

    </body></html>`);
  } catch (e) {
    console.error('panel err', e.response?.data || e.message);
    res.status(500).send(`<pre>${escapeHtml(JSON.stringify(e.response?.data || e.message, null, 2))}</pre>`);
  }
});

// ---------- API: check bot permissions ----------
app.get('/api/check-bot-permissions/:guildId', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  try {
    const g = await discordRequest('get', `/guilds/${guildId}`);
    if (g.status !== 200) return res.json({ botInGuild: false, reason: 'Bot no accesible' });

    const [rolesR, botMemberR] = await Promise.all([
      discordRequest('get', `/guilds/${guildId}/roles`),
      BOT_ID ? discordRequest('get', `/guilds/${guildId}/members/${BOT_ID}`) : { status: 404 }
    ]);

    const roles = Array.isArray(rolesR.data) ? rolesR.data : [];
    const botMember = botMemberR.status === 200 ? botMemberR.data : null;

    let bit = 0n, botPos = null;
    if (botMember) {
      for (const rid of botMember.roles || []) {
        const r = roles.find(x => x.id === rid);
        if (r) {
          bit |= BigInt(r.permissions || '0');
          if (botPos === null || r.position > botPos) botPos = r.position;
        }
      }
    }
    const has = (flag) => (BigInt(bit || 0n) & BigInt(flag)) !== 0n;
    const PERM = { MANAGE_ROLES: 1n<<28n, MANAGE_CHANNELS: 1n<<4n, KICK_MEMBERS: 1n<<1n, BAN_MEMBERS: 1n<<2n, MANAGE_MESSAGES: 1n<<13n, ADMINISTRATOR: 1n<<3n };

    let highestEditable = null;
    if (botPos !== null) {
      const editable = roles.filter(r => r.position < botPos);
      if (editable.length) highestEditable = Math.max(...editable.map(r => r.position));
    }

    return res.json({
      botInGuild: !!botMember,
      botRolePosition: botPos,
      highestEditableRolePosition: highestEditable,
      permissions: {
        MANAGE_ROLES: has(PERM.MANAGE_ROLES),
        MANAGE_CHANNELS: has(PERM.MANAGE_CHANNELS),
        KICK_MEMBERS: has(PERM.KICK_MEMBERS),
        BAN_MEMBERS: has(PERM.BAN_MEMBERS),
        MANAGE_MESSAGES: has(PERM.MANAGE_MESSAGES),
        ADMINISTRATOR: has(PERM.ADMINISTRATOR)
      }
    });
  } catch (e) {
    console.error('check-bot err', e.response?.data || e.message);
    res.status(500).json({ error: 'Error verificando permisos', details: e.response?.data || e.message });
  }
});

// ---------- API: Logs visual ----------
app.get('/api/logs/:guildId', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const ses = req.session;
  try {
    const ug = await userRequest(ses.accessToken, 'get', '/users/@me/guilds');
    const userGuilds = Array.isArray(ug.data) ? ug.data : [];
    const ok = userGuilds.some(g => g.id === guildId && (g.owner === true || ((BigInt(g.permissions || '0') & BigInt(0x8)) !== 0n)));
    if (!ok) return res.status(403).send('No autorizado');
    const lines = logsMem.filter(l => l.guildId === guildId).slice(0,500).map(l => `[${l.ts}] ${l.type}: ${JSON.stringify(l.details)}`).join('\n') || 'No hay logs para este servidor.';
    res.send(lines);
  } catch (e) { res.status(500).send('Error leyendo logs'); }
});
app.post('/api/logs/:guildId/clear', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const ses = req.session;
  try {
    const ug = await userRequest(ses.accessToken, 'get', '/users/@me/guilds');
    const userGuilds = Array.isArray(ug.data) ? ug.data : [];
    const ok = userGuilds.some(g => g.id === guildId && (g.owner === true || ((BigInt(g.permissions || '0') & BigInt(0x8)) !== 0n)));
    if (!ok) return res.status(403).send('No autorizado');
    for (let i = logsMem.length - 1; i >= 0; i--) if (logsMem[i].guildId === guildId) logsMem.splice(i,1);
    try { if (fs.existsSync(LOG_FILE)) {
      const raw = fs.readFileSync(LOG_FILE,'utf8');
      const lines = raw.split('\n').filter(l => l && !l.includes(`"guildId":"${guildId}"`));
      fs.writeFileSync(LOG_FILE, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
    }} catch(e){}
    res.send('✅ logs visuales borrados');
  } catch (e) { res.status(500).send('Error borrando logs'); }
});

// ---------- Management endpoints (create role/channel, message, kick/ban/timeout, edit role perms) ----------
async function verifyOwnerOrAdmin(accessToken, guildId) {
  try {
    const r = await userRequest(accessToken, 'get', '/users/@me/guilds');
    if (r.status !== 200) return false;
    const g = (r.data || []).find(x => x.id === guildId);
    if (!g) return false;
    if (g.owner === true) return true;
    return (BigInt(g.permissions || '0') & BigInt(0x8)) !== 0n;
  } catch { return false; }
}

app.post('/api/guilds/:guildId/create-role', requireSession, async (req,res) => {
  const { name } = req.body; const guildId = req.params.guildId; const ses = req.session;
  if (!name) return res.status(400).send('Falta name');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('post', `/guilds/${guildId}/roles`, { name });
    if (r.status >= 400) return res.status(r.status).send(JSON.stringify(r.data));
    pushLog({ guildId, type: 'CREATE_ROLE', details: { name, by: ses.id } });
    res.send('✅ Rol creado');
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

app.post('/api/guilds/:guildId/create-channel', requireSession, async (req,res) => {
  const { name } = req.body; const guildId = req.params.guildId; const ses = req.session;
  if (!name) return res.status(400).send('Falta name');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('post', `/guilds/${guildId}/channels`, { name, type:0 });
    if (r.status >= 400) return res.status(r.status).send(JSON.stringify(r.data));
    pushLog({ guildId, type: 'CREATE_CHANNEL', details: { name, by: ses.id } });
    res.send('✅ Canal creado');
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

app.post('/api/guilds/:guildId/message', requireSession, async (req,res) => {
  const { channelId, content } = req.body; const guildId = req.params.guildId; const ses = req.session;
  if (!channelId || !content) return res.status(400).send('Falta channelId o content');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('post', `/channels/${channelId}/messages`, { content });
    if (r.status >= 400) return res.status(r.status).send(JSON.stringify(r.data));
    pushLog({ guildId, type: 'MESSAGE', details: { channelId, by: ses.id, content: content.slice(0,4000) } });
    res.send('✅ Mensaje enviado');
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

app.post('/api/guilds/:guildId/kick', requireSession, async (req,res) => {
  const { targetId } = req.body; const guildId = req.params.guildId; const ses = req.session;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('delete', `/guilds/${guildId}/members/${targetId}`);
    if (r.status >= 400) return res.status(r.status).send(JSON.stringify(r.data));
    pushLog({ guildId, type: 'KICK', details: { targetId, by: ses.id } });
    res.send('✅ Usuario expulsado');
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

app.post('/api/guilds/:guildId/ban', requireSession, async (req,res) => {
  const { targetId, deleteMessageDays = 0, reason = 'Banned via panel' } = req.body; const guildId = req.params.guildId; const ses = req.session;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const payload = { reason };
    if (deleteMessageDays) payload.delete_message_seconds = deleteMessageDays * 24 * 3600;
    const r = await discordRequest('put', `/guilds/${guildId}/bans/${targetId}`, payload);
    if (r.status >= 400) return res.status(r.status).send(JSON.stringify(r.data));
    pushLog({ guildId, type: 'BAN', details: { targetId, by: ses.id, reason } });
    res.send('✅ Usuario baneado');
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

app.post('/api/guilds/:guildId/timeout', requireSession, async (req,res) => {
  const { targetId, minutes = 10 } = req.body; const guildId = req.params.guildId; const ses = req.session;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const until = new Date(Date.now() + (minutes||10)*60*1000).toISOString();
    const r = await discordRequest('patch', `/guilds/${guildId}/members/${targetId}`, { communication_disabled_until: until });
    if (r.status >= 400) return res.status(r.status).send(JSON.stringify(r.data));
    pushLog({ guildId, type: 'TIMEOUT', details: { targetId, by: ses.id, minutes } });
    res.send('✅ Timeout aplicado');
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

// Edit role perms (safe check: bot role position)
app.post('/api/guilds/:guildId/edit-role-perms', requireSession, async (req,res) => {
  const { roleId, permissions } = req.body; const guildId = req.params.guildId; const ses = req.session;
  if (!roleId || typeof permissions === 'undefined') return res.status(400).send('Falta roleId o permissions');
  try {
    if (!(await verifyOwnerOrAdmin(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const [rolesR, botMemberR] = await Promise.all([discordRequest('get', `/guilds/${guildId}/roles`), BOT_ID ? discordRequest('get', `/guilds/${guildId}/members/${BOT_ID}`) : { status: 404 }]);
    if (rolesR.status >= 400) return res.status(500).send('Error roles');
    const roles = rolesR.data;
    const botMember = botMemberR.status === 200 ? botMemberR.data : null;
    if (!botMember) return res.status(403).send('Bot no presente');
    const botHighest = Math.max(...(roles.filter(r => (botMember.roles||[]).includes(r.id)).map(r => r.position).concat([-999])));
    const target = roles.find(r => r.id === roleId);
    if (!target) return res.status(404).send('Rol no encontrado');
    if (target.position >= botHighest) return res.status(403).send('No puedes editar un rol igual o superior al rol del bot');
    const r = await discordRequest('patch', `/guilds/${guildId}/roles/${roleId}`, { permissions: String(permissions) });
    if (r.status >= 400) return res.status(r.status).send(JSON.stringify(r.data));
    pushLog({ guildId, type: 'EDIT_ROLE_PERMS', details: { roleId, permissions, by: ses.id } });
    res.send('✅ Permisos actualizados');
  } catch (e) { console.error(e); res.status(500).send('Error'); }
});

// ---------- Invite helper ----------
app.get('/api/invite', (req, res) => {
  const perms = req.query.perms || '0';
  const url = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=bot%20applications.commands&permissions=${perms}`;
  res.redirect(url);
});

// ---------- Start ----------
app.listen(PORT, () => console.log(`Abyssus panel escuchando en puerto ${PORT}`));




























































































