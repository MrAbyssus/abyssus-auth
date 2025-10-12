// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.static('public'));
app.use(express.json()); // para endpoints POST JSON

// In-memory session map (temporal)
const usuariosAutenticados = new Map();

// Helpers
function safeJson(obj) { try { return JSON.stringify(obj, null, 2); } catch { return String(obj); } }
function escapeHtml(s = '') {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

// Middleware: comprueba sesión
function requireSession(req, res, next) {
  const userId = req.query.userId || req.body.userId;
  if (!userId) return res.status(400).send('Falta userId');
  const usuario = usuariosAutenticados.get(userId);
  if (!usuario) return res.status(401).send('No autenticado. Por favor inicia sesión.');
  req.sessionUserId = userId;
  req.session = usuario;
  next();
}

// ---------------- /login ----------------
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

  res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Login Abyssus</title>
  <style>
    :root{--accent:#764ba2}
    body{font-family:Inter,Segoe UI,Arial;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:1rem}
    .card{background:rgba(0,0,0,0.36);padding:2rem;border-radius:12px;text-align:center;width:100%;max-width:520px}
    a.cta{display:inline-block;padding:.8rem 1.2rem;background:#fff;color:var(--accent);border-radius:10px;text-decoration:none;font-weight:700}
  </style>
  </head><body>
  <div class="card">
    <h1>Inicia sesión con Discord</h1>
    <p>Autoriza para ver y gestionar tus servidores donde Abyssus está presente.</p>
    <a class="cta" href="${authorizeUrl}">Login con Discord</a>
  </div>
  </body></html>`);
});

// ---------------- /callback ----------------
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login');

  try {
    const tokenResponse = await axios.post(
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

    const accessToken = tokenResponse.data.access_token;
    const refreshToken = tokenResponse.data.refresh_token;

    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const userData = userRes.data;

    usuariosAutenticados.set(userData.id, {
      accessToken,
      refreshToken,
      username: userData.username,
      discriminator: userData.discriminator,
      avatar: userData.avatar,
      createdAt: Date.now()
    });

    res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Autenticado</title>
    <style>
      body{font-family:Inter,Segoe UI,Arial;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff}
      .card{background:rgba(0,0,0,0.36);padding:2rem;border-radius:12px;text-align:center}
      img{width:80px;height:80px;border-radius:50%;border:2px solid #fff}
      a.btn{display:inline-block;margin-top:1rem;padding:.6rem 1rem;background:#fff;color:#764ba2;border-radius:8px;text-decoration:none;font-weight:700}
    </style></head><body>
    <div class="card">
      <img src="https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png" alt="avatar">
      <h1>¡Autenticación OK!</h1>
      <p><strong>${userData.username}#${userData.discriminator}</strong></p>
      <p>ID: ${userData.id}</p>
      <a class="btn" href="/mis-guilds/${userData.id}">Ver servidores</a>
    </div></body></html>`);
  } catch (err) {
    console.error('callback error:', err.response?.data || err.message);
    return res.status(500).send(`<h2>Error OAuth2</h2><pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// ---------------- /mis-guilds/:userId ----------------
app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const usuario = usuariosAutenticados.get(userId);
  if (!usuario) return res.redirect('/login');

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send('Falta BOT_TOKEN en .env');

  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${usuario.accessToken}` }
    });

    const adminGuilds = Array.isArray(guildsRes.data) ? guildsRes.data.filter(g => (BigInt(g.permissions) & BigInt(0x8)) !== 0) : [];

    const botGuilds = [];
    for (const g of adminGuilds) {
      try {
        const guildInfoRes = await axios.get(`https://discord.com/api/v10/guilds/${g.id}?with_counts=true`, {
          headers: { Authorization: `Bot ${BOT_TOKEN}` },
          timeout: 8000
        });
        const guildInfo = guildInfoRes.data;

        const [rolesRes, channelsRes] = await Promise.all([
          axios.get(`https://discord.com/api/v10/guilds/${g.id}/roles`, { headers: { Authorization: `Bot ${BOT_TOKEN}` }, timeout: 8000 }),
          axios.get(`https://discord.com/api/v10/guilds/${g.id}/channels`, { headers: { Authorization: `Bot ${BOT_TOKEN}` }, timeout: 8000 })
        ]);

        botGuilds.push({
          id: g.id,
          name: g.name,
          icon: g.icon,
          member_count: guildInfo.approximate_member_count || 'N/A',
          roles_count: Array.isArray(rolesRes.data) ? rolesRes.data.length : 'N/A',
          channels_count: Array.isArray(channelsRes.data) ? channelsRes.data.length : 'N/A'
        });
      } catch (e) {
        // Si el bot no está o error al acceder, ignorar
        continue;
      }
    }

    const guildListHtml = botGuilds.length
      ? botGuilds.map(g => {
        const iconUrl = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : 'https://via.placeholder.com/64?text=?';
        return `<li>
          <img src="${iconUrl}" style="width:48px;height:48px;border-radius:8px;vertical-align:middle;margin-right:.6rem">
          <strong>${escapeHtml(g.name)}</strong> (ID: ${g.id})<br>
          👥 ${g.member_count} &nbsp; | &nbsp; 🧾 Roles: ${g.roles_count} &nbsp; | &nbsp; 💬 Canales: ${g.channels_count}<br>
          <a style="display:inline-block;margin-top:.4rem;margin-right:.6rem;padding:.35rem .6rem;background:#fff;color:#764ba2;border-radius:8px;text-decoration:none;font-weight:700" href="/panel/${g.id}?userId=${userId}">Abrir Panel</a>
        </li>`;
      }).join('')
      : '<li>No se encontraron servidores con Abyssus donde eres administrador.</li>';

    res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Mis servidores</title>
    <style>
      body{font-family:Inter,Segoe UI,Arial;margin:0;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;display:flex;align-items:center;justify-content:center;padding:1rem}
      .container{max-width:900px;width:100%}
      .card{background:rgba(0,0,0,0.36);padding:1.4rem;border-radius:12px}
      h1{margin:0 0 .6rem}
      ul{list-style:none;padding:0;margin:0}
      li{padding:.85rem;border-radius:10px;background:rgba(255,255,255,0.04);margin-bottom:.6rem}
    </style></head><body>
    <div class="container"><div class="card"><h1>Servidores con Abyssus</h1><ul>${guildListHtml}</ul>
    <p style="opacity:.9;margin-top:.5rem">Mostrando solo servidores donde eres admin y Abyssus está presente. Esta es una versión beta puede tener errores</p></div></div></body></html>`);
  } catch (err) {
    console.error('mis-guilds err:', err.response?.data || err.message);
    res.status(500).send(`<h2>Error obteniendo servidores</h2><pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// ---------------- /panel/:guildId ----------------
// Panel extendido: muestra stats, roles, canales, miembros y controles de moderación y envío de mensajes
app.get('/panel/:guildId', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const userId = req.sessionUserId;
  const usuario = req.session;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send('Falta BOT_TOKEN en .env');

  try {
    // verificar adminidad
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${usuario.accessToken}` }
    });
    const isAdmin = Array.isArray(guildsRes.data) && guildsRes.data.some(g => g.id === guildId && (BigInt(g.permissions) & BigInt(0x8)) !== 0);
    if (!isAdmin) return res.status(403).send('No tienes permisos para ver este panel');

    // obtener datos: guildInfo, roles, channels, miembros (limit 100)
    const [guildInfoRes, rolesRes, channelsRes, membersRes] = await Promise.all([
      axios.get(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/channels`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      // obtener hasta 100 miembros (la API REST permite paginar; aquí usamos 100 como ejemplo)
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/members?limit=100`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } })
    ]);

    const guild = guildInfoRes.data;
    const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
    const channels = Array.isArray(channelsRes.data) ? channelsRes.data : [];
    const members = Array.isArray(membersRes.data) ? membersRes.data : [];

    const iconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : 'https://via.placeholder.com/128?text=?';

    // channels dropdown for sending message (filter text channels type 0)
    const textChannels = channels.filter(c => c.type === 0);

    // members HTML (show username#discr or nick if present)
    const membersListHtml = members.map(m => {
      const tag = m.user ? `${escapeHtml(m.user.username)}#${escapeHtml(m.user.discriminator)}` : escapeHtml(m.nick || 'Unknown');
      const avatar = m.user?.avatar ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/${(parseInt(m.user?.discriminator || '0') % 5)}.png`;
      const rolesForUser = Array.isArray(m.roles) ? m.roles.map(rid => escapeHtml(rid)).join(', ') : '';
      return `<li style="display:flex;align-items:center;gap:.6rem;padding:.5rem;border-radius:8px;background:rgba(255,255,255,0.02);margin-bottom:.45rem">
        <img src="${avatar}" style="width:44px;height:44px;border-radius:8px;object-fit:cover">
        <div style="flex:1">
          <div><strong>${tag}</strong> <small style="opacity:.8">(${m.user?.id || 'N/A'})</small></div>
          <div style="font-size:.9rem;opacity:.8">Roles: ${rolesForUser || '—'}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:.4rem">
          <button onclick="moderate('${guildId}','${m.user?.id}','kick')" style="padding:.35rem .6rem;border-radius:6px;border:0;background:#ffb3b3;cursor:pointer">🚫 Kick</button>
          <button onclick="moderate('${guildId}','${m.user?.id}','ban')" style="padding:.35rem .6rem;border-radius:6px;border:0;background:#ff8c8c;cursor:pointer">🔨 Ban</button>
          <button onclick="moderateTimeout('${guildId}','${m.user?.id}')" style="padding:.35rem .6rem;border-radius:6px;border:0;background:#ffd88c;cursor:pointer">🔇 Timeout</button>
        </div>
      </li>`;
    }).join('');

    // roles list
    const rolesListHtml = roles.map(r => `<li>${escapeHtml(r.name)} <small style="opacity:.8">(${r.id})</small></li>`).join('');
    // channels list with emoji
    const tipoCanalEmoji = {0:'📝',2:'🎤',4:'📂',13:'🎙️',15:'🗂️'};
    const channelsListHtml = channels.map(c => `<li>${tipoCanalEmoji[c.type]||'❔'} ${escapeHtml(c.name)} <small style="opacity:.8">(${c.id})</small></li>`).join('');

    // channels dropdown options
    const channelOptions = textChannels.map(c => `<option value="${c.id}"># ${escapeHtml(c.name)}</option>`).join('');

    // render panel with moderation and send message UI
    res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Panel Abyssus - ${escapeHtml(guild.name)}</title>
    <style>
      :root{--accent:#764ba2}
      body{font-family:Inter,Segoe UI,Arial;margin:0;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:1rem}
      .container{max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:1rem}
      .card{background:rgba(0,0,0,0.36);padding:1rem;border-radius:12px}
      .header{display:flex;gap:1rem;align-items:center}
      .icon{width:96px;height:96px;border-radius:12px;object-fit:cover}
      .stats{display:flex;gap:.6rem;margin-top:.5rem}
      .stat{background:rgba(255,255,255,0.03);padding:.45rem .8rem;border-radius:8px}
      .grid{display:flex;gap:1rem;flex-wrap:wrap}
      .panel{flex:1 1 380px;background:rgba(255,255,255,0.02);padding:1rem;border-radius:10px;max-height:520px;overflow:auto}
      ul{list-style:none;padding:0;margin:0}
      .muted{opacity:.8}
      .row{display:flex;gap:1rem;align-items:center}
      label{display:block;margin-bottom:.4rem}
      input,select,textarea{width:100%;padding:.5rem;border-radius:8px;border:0;outline:none}
      button.primary{background:#fff;color:var(--accent);padding:.6rem 1rem;border-radius:8px;border:0;font-weight:700;cursor:pointer}
      .note{opacity:.9;font-size:.9rem}
    </style>
    </head><body>
    <div class="container">
      <div class="card header">
        <img src="${iconUrl}" class="icon" alt="icon">
        <div>
          <h1 style="margin:0">${escapeHtml(guild.name)}</h1>
          <p class="note">ID: ${guild.id}</p>
          <div class="stats">
            <div class="stat">👥 ${guild.approximate_member_count || 'N/A'}</div>
            <div class="stat">💬 ${channels.length}</div>
            <div class="stat">🧾 ${roles.length}</div>
          </div>
        </div>
      </div>

      <div class="grid">
        <div class="panel">
          <h2 style="margin-top:0">Miembros (hasta 100)</h2>
          <ul id="members">${membersListHtml}</ul>
        </div>

        <div class="panel">
          <h2 style="margin-top:0">Enviar mensaje como Abyssus</h2>
          <div style="margin-bottom:.6rem">
            <label>Selecciona canal de texto</label>
            <select id="channelSelect">
              ${channelOptions}
            </select>
          </div>
          <div style="margin-bottom:.6rem">
            <label>Mensaje</label>
            <textarea id="messageContent" rows="5" placeholder="Escribe el mensaje..."></textarea>
          </div>
          <div style="display:flex;gap:.6rem">
            <button class="primary" onclick="sendMessage()">Enviar como Abyssus</button>
            <button style="background:#fff;color:#444;border-radius:8px;padding:.6rem 1rem;border:0;cursor:pointer" onclick="document.getElementById('messageContent').value='!ayuda'">Comando: !ayuda</button>
          </div>

          <hr style="margin:1rem 0;border:none;border-top:1px solid rgba(255,255,255,0.06)">
          <h3>Roles</h3>
          <ul>${rolesListHtml}</ul>

          <h3>Canales</h3>
          <ul>${channelsListHtml}</ul>
        </div>
      </div>

      <div class="card" style="text-align:right">
        <a style="color:#fff;text-decoration:none;margin-right:1rem" href="/mis-guilds/${userId}">← Volver</a>
        <a class="primary" href="https://discord.com/channels/${guild.id}" target="_blank">Abrir en Discord</a>
      </div>
    </div>

    <script>
      async function moderate(guildId, targetId, action) {
        if (!confirm('Confirmar ' + action + ' a ' + targetId + ' ?')) return;
        const res = await fetch('/api/guilds/' + guildId + '/' + action, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ userId: '${userId}', targetId })
        });
        const txt = await res.text();
        if (res.ok) {
          alert('Acción realizada: ' + action);
          location.reload();
        } else {
          alert('Error: ' + txt);
        }
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
        if (res.ok) {
          alert('Timeout aplicado');
          location.reload();
        } else {
          alert('Error: ' + txt);
        }
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
        if (res.ok) {
          alert('Mensaje enviado');
          document.getElementById('messageContent').value = '';
        } else {
          alert('Error: ' + txt);
        }
      }
    </script>

    </body></html>`);
  } catch (err) {
    console.error('panel err:', err.response?.data || err.message);
    res.status(500).send(`<h2>Error cargando panel</h2><pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// ---------------- API endpoints: Moderation & Message (POST) ----------------
// Kick member (DELETE member)
app.post('/api/guilds/:guildId/kick', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId } = req.body;
  const usuario = req.session;
  const userId = req.sessionUserId;
  const BOT_TOKEN = process.env.BOT_TOKEN;

  if (!targetId) return res.status(400).send('Falta targetId');

  // verify user is admin
  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${usuario.accessToken}` }});
    const isAdmin = Array.isArray(guildsRes.data) && guildsRes.data.some(g => g.id === guildId && (BigInt(g.permissions) & BigInt(0x8)) !== 0);
    if (!isAdmin) return res.status(403).send('No autorizado');

    // kick = DELETE /guilds/{guild.id}/members/{user.id}
    await axios.delete(`https://discord.com/api/v10/guilds/${guildId}/members/${targetId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });

    return res.status(200).send('kicked');
  } catch (err) {
    console.error('kick err:', err.response?.data || err.message);
    return res.status(500).send(safeJson(err.response?.data || err.message));
  }
});

// Ban member
app.post('/api/guilds/:guildId/ban', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId, deleteMessageDays = 0, reason = 'Banned via panel' } = req.body;
  const usuario = req.session;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!targetId) return res.status(400).send('Falta targetId');

  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${usuario.accessToken}` }});
    const isAdmin = Array.isArray(guildsRes.data) && guildsRes.data.some(g => g.id === guildId && (BigInt(g.permissions) & BigInt(0x8)) !== 0);
    if (!isAdmin) return res.status(403).send('No autorizado');

    // PUT /guilds/{guild.id}/bans/{user.id}
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

// Timeout (communication_disabled_until)
app.post('/api/guilds/:guildId/timeout', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId, minutes = 10 } = req.body;
  const usuario = req.session;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!targetId) return res.status(400).send('Falta targetId');

  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${usuario.accessToken}` }});
    const isAdmin = Array.isArray(guildsRes.data) && guildsRes.data.some(g => g.id === guildId && (BigInt(g.permissions) & BigInt(0x8)) !== 0);
    if (!isAdmin) return res.status(403).send('No autorizado');

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
  const usuario = req.session;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!channelId || !content) return res.status(400).send('Falta channelId o content');

  try {
    // verify user admin
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${usuario.accessToken}` }});
    const isAdmin = Array.isArray(guildsRes.data) && guildsRes.data.some(g => g.id === guildId && (BigInt(g.permissions) & BigInt(0x8)) !== 0);
    if (!isAdmin) return res.status(403).send('No autorizado');

    // send message
    const resp = await axios.post(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      content
    }, { headers: { Authorization: `Bot ${BOT_TOKEN}` } });

    return res.status(200).send(safeJson(resp.data));
  } catch (err) {
    console.error('message err:', err.response?.data || err.message);
    return res.status(500).send(safeJson(err.response?.data || err.message));
  }
});

// ---------------- start server ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));
















































































