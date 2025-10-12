// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.static('public'));
app.use(express.json());

// ---------- In-memory stores ----------
const sesiones = new Map();       // userId -> { accessToken, refreshToken, username, ... , createdAt }
const codigosUsados = new Set(); // evitar reuso de "code"

// ---------- Helpers ----------
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

// Middleware que exige sesión (userId en query o body)
function requireSession(req, res, next) {
  const userId = req.query.userId || req.body.userId;
  if (!userId) return res.status(400).send('Falta userId');
  const ses = sesiones.get(userId);
  if (!ses) return res.status(401).send('No autenticado. Por favor inicia sesión.');
  req.sessionUserId = userId;
  req.session = ses;
  next();
}

// Limpieza de sesiones viejas (30 min)
setInterval(() => {
  const ahora = Date.now();
  for (const [id, s] of sesiones) {
    if (ahora - s.createdAt > 1000 * 60 * 30) sesiones.delete(id);
  }
}, 1000 * 60 * 5);

// ---------- /login ----------
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

  res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Abyssus — Login</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
    :root{--accent:#5865F2;--accent-2:#764ba2}
    *{box-sizing:border-box}
    body{font-family:Inter,system-ui,Segoe UI,Arial;background:#0b0f14;color:#e6eef8;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{width:100%;max-width:720px;background:linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));border:1px solid rgba(255,255,255,0.04);padding:32px;border-radius:12px;box-shadow:0 8px 30px rgba(2,6,23,0.6);display:flex;gap:24px;align-items:center}
    .hero{flex:1}
    h1{margin:0 0 8px;font-size:1.6rem}
    p{margin:0 0 16px;color:rgba(230,238,248,0.8)}
    .btn{background:linear-gradient(90deg,var(--accent),var(--accent-2));color:white;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block}
    .note{font-size:0.85rem;color:rgba(230,238,248,0.7);margin-top:10px}
    .logo{width:72px;height:72px;border-radius:12px;background:linear-gradient(135deg,#243b6b,#5b3a86);display:flex;align-items:center;justify-content:center;font-weight:800;color:white;font-size:20px}
    @media(max-width:700px){ .card{flex-direction:column;align-items:stretch} }
  </style>
  </head><body>
  <div class="card">
    <div class="logo">A</div>
    <div class="hero">
      <h1>Abyssus — Panel</h1>
      <p>Inicia sesión con Discord para ver los servidores donde eres owner y Abyssus está instalado.</p>
      <a class="btn" href="${authorizeUrl}">Iniciar sesión con Discord</a>
      <div class="note">Usamos OAuth2 sólo para obtener tus permisos. El bot token queda seguro en el servidor.</div>
    </div>
  </div>
  </body></html>`);
});

// ---------- /callback ----------
// Protege reuso de code
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login');

  if (codigosUsados.has(code)) {
    return res.send(`<h2>⚠️ Este código ya fue usado. Vuelve a <a href="/login">iniciar sesión</a>.</h2>`);
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

    const userRes = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } });
    const user = userRes.data;

    sesiones.set(user.id, {
      accessToken,
      refreshToken,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      createdAt: Date.now()
    });

    res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Abyssus — Autenticado</title>
    <style>
      body{font-family:Inter,Arial;background:#0b0f14;color:#e6eef8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
      .card{background:#071022;padding:28px;border-radius:12px;border:1px solid rgba(255,255,255,0.03);text-align:center;box-shadow:0 12px 40px rgba(0,0,0,0.6)}
      img{width:88px;height:88px;border-radius:12px;display:block;margin:0 auto 12px;object-fit:cover}
      a.btn{display:inline-block;margin-top:12px;padding:10px 14px;border-radius:10px;background:linear-gradient(90deg,#5865F2,#764ba2);color:#fff;text-decoration:none;font-weight:700}
    </style></head><body>
    <div class="card">
      <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" alt="avatar" onerror="this.style.display='none'">
      <h2>¡Autenticación exitosa!</h2>
      <p style="opacity:.85">${escapeHtml(user.username)}#${escapeHtml(user.discriminator)}</p>
      <a class="btn" href="/mis-guilds/${user.id}">Ver mis servidores (owner)</a>
    </div></body></html>`);
  } catch (err) {
    console.error('callback error:', err.response?.data || err.message);
    return res.status(500).send(`<h2>Error OAuth2</h2><pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// ---------- /mis-guilds/:userId  (solo OWNER + bot presente) ----------
app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const ses = sesiones.get(userId);
  if (!ses) return res.redirect('/login');

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send('Falta BOT_TOKEN en .env');

  try {
    // 1) obtener guilds del usuario
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${ses.accessToken}` } });
    const allGuilds = Array.isArray(guildsRes.data) ? guildsRes.data : [];

    // 2) filtrar solo owner === true
    const ownerGuilds = allGuilds.filter(g => g.owner === true);

    // 3) comprobar presencia del bot pidiendo /guilds/{id}?with_counts=true con Bot token
    const botPresent = [];
    const CONCURRENCY = 6;
    for (let i = 0; i < ownerGuilds.length; i += CONCURRENCY) {
      const chunk = ownerGuilds.slice(i, i + CONCURRENCY);
      const promises = chunk.map(async g => {
        try {
          const info = await axios.get(`https://discord.com/api/v10/guilds/${g.id}?with_counts=true`, {
            headers: { Authorization: `Bot ${BOT_TOKEN}` },
            timeout: 8000
          });
          botPresent.push({
            id: g.id,
            name: g.name,
            icon: g.icon,
            member_count: info.data.approximate_member_count || 'N/A',
            roles_count: (info.data.roles && info.data.roles.length) || 'N/A' // sometimes absent
          });
        } catch (e) {
          // bot not present or no access -> ignore
        }
      });
      await Promise.all(promises);
      // small pause to be kinder with rate limits
      await sleep(120);
    }

    // Render UI (oscuro gamer)
    const guildsHtml = botPresent.length ? botPresent.map(g => {
      const icon = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : 'https://via.placeholder.com/64/111318/ffffff?text=?';
      return `
        <li class="card-item">
          <img src="${icon}" alt="icon" class="gicon" onerror="this.src='https://via.placeholder.com/64/111318/ffffff?text=?'">
          <div class="meta">
            <div class="name">${escapeHtml(g.name)}</div>
            <div class="sub">👥 ${g.member_count} • 🧾 ${g.roles_count}</div>
          </div>
          <div class="actions">
            <a class="btn" href="/panel/${g.id}?userId=${userId}">Abrir panel</a>
          </div>
        </li>`;
    }).join('') : `<div class="empty">No eres owner de servidores donde Abyssus esté presente.</div>`;

    res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Abyssus — Mis servidores (owner)</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
      :root{--accent:#5865F2;--accent-2:#764ba2}
      *{box-sizing:border-box}
      body{font-family:Inter,system-ui,Segoe UI,Arial;margin:0;min-height:100vh;background:#0a0d12;color:#e6eef8;padding:28px}
      .wrap{max-width:1100px;margin:0 auto}
      header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
      h1{margin:0;font-size:1.3rem}
      .subtitle{opacity:.85}
      .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
      .card-item{display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));border:1px solid rgba(255,255,255,0.03)}
      .gicon{width:56px;height:56px;border-radius:10px;object-fit:cover}
      .meta{flex:1}
      .name{font-weight:600}
      .sub{opacity:.8;font-size:.9rem;margin-top:4px}
      .actions{display:flex;gap:8px}
      .btn{background:linear-gradient(90deg,var(--accent),var(--accent-2));color:white;padding:8px 12px;border-radius:8px;text-decoration:none;font-weight:700}
      .empty{padding:28px;border-radius:10px;background:#071022;text-align:center;opacity:.9}
      .note{margin-top:8px;opacity:.8;font-size:.9rem}
    </style>
    </head><body>
    <div class="wrap">
      <header>
        <div>
          <h1>Servidores donde eres Owner y Abyssus está instalado</h1>
          <div class="subtitle">Accede al panel para moderación y comandos.</div>
        </div>
        <div><a class="btn" href="/login">Cerrar / Cambiar cuenta</a></div>
      </header>
      <section class="grid">
        ${guildsHtml}
      </section>
      <p class="note">Si no ves un servidor, verifica que Abyssus esté invitado y que tu cuenta sea la dueña del servidor.</p>
    </div>
    </body></html>`);
  } catch (err) {
    console.error('mis-guilds err:', err.response?.data || err.message);
    res.status(500).send(`<h2>Error obteniendo servidores</h2><pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// ---------- /panel/:guildId  (OWNER check + bot present) ----------
app.get('/panel/:guildId', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const userId = req.sessionUserId;
  const ses = req.session;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send('Falta BOT_TOKEN en .env');

  try {
    // verificar que el usuario sea owner en esa guild
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${ses.accessToken}` } });
    const guilds = Array.isArray(guildsRes.data) ? guildsRes.data : [];
    const meIsOwner = guilds.some(g => g.id === guildId && g.owner === true);
    if (!meIsOwner) return res.status(403).send('No eres el owner de este servidor.');

    // obtener guild info, roles, channels, members (limit 100)
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
    const textChannels = channels.filter(c => c.type === 0);
    const channelOptions = textChannels.map(c => `<option value="${c.id}"># ${escapeHtml(c.name)}</option>`).join('');

    const membersHtml = members.map(m => {
      const tag = m.user ? `${escapeHtml(m.user.username)}#${escapeHtml(m.user.discriminator)}` : escapeHtml(m.nick || 'Unknown');
      const avatar = m.user?.avatar ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/${(parseInt(m.user?.discriminator||'0')%5)}.png`;
      const rolesForUser = Array.isArray(m.roles) ? m.roles.map(rid => escapeHtml(rid)).join(', ') : '';
      return `<li class="member">
        <img src="${avatar}" alt="" class="mav">
        <div class="md">
          <div class="mn"><strong>${tag}</strong> <small style="opacity:.75">(${m.user?.id||'N/A'})</small></div>
          <div class="mr" style="opacity:.8;font-size:.92rem">Roles: ${rolesForUser||'—'}</div>
        </div>
        <div class="ma">
          <button onclick="moderate('${guildId}','${m.user?.id}','kick')" class="danger">🚫 Kick</button>
          <button onclick="moderate('${guildId}','${m.user?.id}','ban')" class="danger">🔨 Ban</button>
          <button onclick="moderateTimeout('${guildId}','${m.user?.id}')" class="warn">🔇 Timeout</button>
        </div>
      </li>`;
    }).join('');

    // Render panel (oscuro)
    res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Abyssus — Panel ${escapeHtml(guild.name)}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
      :root{--accent:#5865F2;--accent2:#764ba2}
      *{box-sizing:border-box}
      body{font-family:Inter,system-ui,Arial;margin:0;background:#090b0f;color:#eaf2ff;padding:18px}
      .wrap{max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
      .top{display:flex;gap:12px;align-items:center}
      .icon{width:96px;height:96px;border-radius:12px;object-fit:cover}
      h1{margin:0;font-size:1.4rem}
      .subtitle{opacity:.8}
      .stats{display:flex;gap:8px;margin-top:8px}
      .stat{background:rgba(255,255,255,0.02);padding:8px 10px;border-radius:8px;font-weight:600}
      .main{display:flex;gap:12px;flex-wrap:wrap}
      .panel{flex:1 1 420px;background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.03);max-height:720px;overflow:auto}
      .panel h2{margin-top:0}
      ul{list-style:none;padding:0;margin:0}
      .member{display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;margin-bottom:8px;background:rgba(0,0,0,0.25)}
      .mav{width:44px;height:44px;border-radius:8px;object-fit:cover}
      .md{flex:1}
      .ma{display:flex;flex-direction:column;gap:6px}
      button{border:0;padding:6px 8px;border-radius:8px;cursor:pointer}
      .danger{background:#ff7b7b;color:#2b0505}
      .warn{background:#ffd88c;color:#2b1500}
      .primary{background:linear-gradient(90deg,var(--accent),var(--accent2));color:white}
      .form-row{margin-bottom:10px}
      select,textarea{width:100%;padding:8px;border-radius:8px;border:0;outline:none}
      .actions{display:flex;gap:8px;align-items:center;margin-top:8px}
      .back{color:rgba(234,242,255,0.9);text-decoration:none;opacity:.9}
      .footer{display:flex;justify-content:space-between;align-items:center;padding:10px}
      @media(max-width:900px){ .main{flex-direction:column} }
    </style>
    </head><body>
    <div class="wrap">
      <div class="top">
        <img class="icon" src="${iconUrl}" alt="icon">
        <div>
          <h1>${escapeHtml(guild.name)}</h1>
          <div class="subtitle">ID: ${guild.id}</div>
          <div class="stats">
            <div class="stat">👥 ${guild.approximate_member_count || 'N/A'}</div>
            <div class="stat">💬 ${channels.length}</div>
            <div class="stat">🧾 ${roles.length}</div>
          </div>
        </div>
      </div>

      <div class="main">
        <div class="panel">
          <h2>Miembros (hasta 100)</h2>
          <ul id="members">${membersHtml}</ul>
        </div>

        <div class="panel">
          <h2>Enviar mensaje como Abyssus</h2>
          <div class="form-row">
            <label>Canal</label>
            <select id="channelSelect">${channelOptions}</select>
          </div>
          <div class="form-row">
            <label>Mensaje</label>
            <textarea id="messageContent" rows="5" placeholder="Escribe aquí..."></textarea>
          </div>
          <div class="actions">
            <button class="primary" onclick="sendMessage()">Enviar como Abyssus</button>
            <button onclick="document.getElementById('messageContent').value='!ayuda'">Comando: !ayuda</button>
          </div>

          <hr style="margin:12px 0;border:none;border-top:1px solid rgba(255,255,255,0.03)">

          <h3>Roles</h3>
          <ul>${rolesListHtml}</ul>

          <h3>Canales</h3>
          <ul>${channelsListHtml}</ul>
        </div>
      </div>

      <div class="footer">
        <div><a class="back" href="/mis-guilds/${userId}">← Volver</a></div>
        <div>
          <a class="primary" href="https://discord.com/channels/${guild.id}" target="_blank">Abrir en Discord</a>
        </div>
      </div>
    </div>

    <script>
      async function moderate(guildId, targetId, action) {
        if (!confirm(action + ' a ' + targetId + ' ?')) return;
        const res = await fetch('/api/guilds/' + guildId + '/' + action, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ userId: '${userId}', targetId })
        });
        const txt = await res.text();
        if (res.ok) { alert('Acción realizada'); location.reload(); } else { alert('Error: ' + txt); }
      }

      async function moderateTimeout(guildId, targetId) {
        const mins = prompt('Duración en minutos para timeout (ej. 10):', '10');
        if (!mins) return;
        const res = await fetch('/api/guilds/' + guildId + '/timeout', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ userId: '${userId}', targetId, minutes: parseInt(mins,10) })
        });
        const txt = await res.text();
        if (res.ok) { alert('Timeout aplicado'); location.reload(); } else { alert('Error: ' + txt); }
      }

      async function sendMessage() {
        const channelId = document.getElementById('channelSelect').value;
        const content = document.getElementById('messageContent').value.trim();
        if (!channelId || !content) { alert('Selecciona canal y escribe mensaje'); return; }
        const res = await fetch('/api/guilds/${guild.id}/message', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ userId: '${userId}', channelId, content })
        });
        const txt = await res.text();
        if (res.ok) { alert('Mensaje enviado'); document.getElementById('messageContent').value = ''; } else { alert('Error: ' + txt); }
      }
    </script>

    </body></html>`);
  } catch (err) {
    console.error('panel err:', err.response?.data || err.message);
    res.status(500).send(`<h2>Error cargando panel</h2><pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// ---------- Moderation & message API endpoints ----------
// Kick
app.post('/api/guilds/:guildId/kick', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId } = req.body;
  const ses = req.session;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!targetId) return res.status(400).send('Falta targetId');

  try {
    // verify owner
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${ses.accessToken}` }});
    const meOwner = Array.isArray(guildsRes.data) && guildsRes.data.some(g => g.id === guildId && g.owner === true);
    if (!meOwner) return res.status(403).send('No autorizado');

    await axios.delete(`https://discord.com/api/v10/guilds/${guildId}/members/${targetId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });

    return res.status(200).send('kicked');
  } catch (err) {
    console.error('kick err:', err.response?.data || err.message);
    return res.status(500).send(safeJson(err.response?.data || err.message));
  }
});

// Ban
app.post('/api/guilds/:guildId/ban', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId, deleteMessageDays = 0, reason = 'Banned via panel' } = req.body;
  const ses = req.session;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!targetId) return res.status(400).send('Falta targetId');

  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${ses.accessToken}` }});
    const meOwner = Array.isArray(guildsRes.data) && guildsRes.data.some(g => g.id === guildId && g.owner === true);
    if (!meOwner) return res.status(403).send('No autorizado');

    await axios.put(`https://discord.com/api/v10/guilds/${guildId}/bans/${targetId}`, {
      delete_message_seconds: deleteMessageDays * 24 * 3600,
      reason
    }, { headers: { Authorization: `Bot ${BOT_TOKEN}` } });

    return res.status(200).send('banned');
  } catch (err) {
    console.error('ban err:', err.response?.data || err.message);
    return res.status(500).send(safeJson(err.response?.data || err.message));
  }
});

// Timeout
app.post('/api/guilds/:guildId/timeout', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId, minutes = 10 } = req.body;
  const ses = req.session;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!targetId) return res.status(400).send('Falta targetId');

  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${ses.accessToken}` }});
    const meOwner = Array.isArray(guildsRes.data) && guildsRes.data.some(g => g.id === guildId && g.owner === true);
    if (!meOwner) return res.status(403).send('No autorizado');

    const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    await axios.patch(`https://discord.com/api/v10/guilds/${guildId}/members/${targetId}`, {
      communication_disabled_until: until
    }, { headers: { Authorization: `Bot ${BOT_TOKEN}` } });

    return res.status(200).send('timed out');
  } catch (err) {
    console.error('timeout err:', err.response?.data || err.message);
    return res.status(500).send(safeJson(err.response?.data || err.message));
  }
});

// Send message as bot
app.post('/api/guilds/:guildId/message', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { channelId, content } = req.body;
  const ses = req.session;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!channelId || !content) return res.status(400).send('Falta channelId o content');

  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${ses.accessToken}` }});
    const meOwner = Array.isArray(guildsRes.data) && guildsRes.data.some(g => g.id === guildId && g.owner === true);
    if (!meOwner) return res.status(403).send('No autorizado');

    const resp = await axios.post(`https://discord.com/api/v10/channels/${channelId}/messages`, { content }, { headers: { Authorization: `Bot ${BOT_TOKEN}` } });

    return res.status(200).send(safeJson(resp.data));
  } catch (err) {
    console.error('message err:', err.response?.data || err.message);
    return res.status(500).send(safeJson(err.response?.data || err.message));
  }
});

// ---------- start server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));



















































































