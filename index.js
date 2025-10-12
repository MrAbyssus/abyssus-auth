// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.static('public'));

// Simple in-memory store (no persistencia entre restarts)
const usuariosAutenticados = new Map();

// Helpers
function safeJson(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

// -------------------- /login --------------------
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

  res.send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Login Discord</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--accent:#764ba2;--bg1:#667eea;--bg2:#764ba2}
*{box-sizing:border-box}body{font-family:Inter,Segoe UI,system-ui,Arial;min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--bg1),var(--bg2));color:#fff;padding:1rem}
.card{background:rgba(0,0,0,0.35);padding:2rem;border-radius:12px;max-width:520px;width:100%;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.4)}
h1{margin:0 0 .6rem;font-size:1.6rem}
p{margin:.2rem 0 .8rem;color:rgba(255,255,255,0.9)}
a.cta{display:inline-block;padding:.7rem 1.2rem;background:#fff;color:var(--accent);font-weight:700;border-radius:10px;text-decoration:none}
.small{font-size:.88rem;color:rgba(255,255,255,0.8);margin-top:.6rem;display:block}
</style>
</head><body>
<div class="card">
  <h1>Inicia sesión con Discord</h1>
  <p>Autoriza con Discord para ver los servidores donde Abyssus está instalado y administrarlos.</p>
  <a class="cta" href="${authorizeUrl}">Login con Discord</a>
  <span class="small">No compartimos datos con terceros. Solo accesos temporales.</span>
</div>
</body></html>`);
});

// -------------------- /callback --------------------
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login');

  try {
    // intercambiar code por token
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

    // Guardamos acceso temporal
    usuariosAutenticados.set(userData.id, {
      accessToken,
      refreshToken,
      username: userData.username,
      discriminator: userData.discriminator,
      avatar: userData.avatar,
      createdAt: Date.now()
    });

    // Mostrar tarjeta simple
    res.send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Autenticado</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:Inter,Segoe UI,system-ui,Arial;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:1rem}
.card{background:rgba(0,0,0,0.36);padding:2rem;border-radius:12px;text-align:center;max-width:520px}
img.avatar{width:80px;height:80px;border-radius:50%;border:2px solid #fff;display:block;margin:0 auto 1rem}
h1{margin:0 0 .2rem;font-size:1.6rem}
p{margin:.2rem 0}
a.btn{display:inline-block;margin-top:1rem;padding:.6rem 1rem;background:#fff;color:#764ba2;border-radius:8px;text-decoration:none;font-weight:700}
</style>
</head><body>
<div class="card">
  <img class="avatar" src="https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png" alt="avatar">
  <h1>¡Autenticación OK!</h1>
  <p><strong>${userData.username}#${userData.discriminator}</strong></p>
  <p>ID: ${userData.id}</p>
  <a class="btn" href="/mis-guilds/${userData.id}">Ver servidores con Abyssus</a>
</div>
</body></html>`);
  } catch (err) {
    const data = err.response?.data;
    // rate-limit token exchange
    if (data?.error === 'invalid_request' && data?.error_description?.includes('rate limited')) {
      return res.status(429).send(`<h2>⚠️ Rate limit - intenta de nuevo en unos minutos</h2><p>${safeJson(data)}</p><p><a href="/login">Volver a login</a></p>`);
    }
    console.error('OAuth2 error:', data || err.message);
    res.status(500).send(`<h2>Error OAuth2</h2><pre>${safeJson(data || err.message)}</pre>`);
  }
});

// -------------------- /mis-guilds/:userId --------------------
app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const sesion = sesiones.get(userId); // o usuariosAutenticados si usas ese mapa
  if (!sesion) return res.redirect('/login');

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send('Falta BOT_TOKEN en .env');

  try {
    // 1) obtener los guilds del usuario (OAuth2)
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${sesion.accessToken}` }
    });

    const adminGuilds = Array.isArray(guildsRes.data)
      ? guildsRes.data.filter(g => (BigInt(g.permissions) & BigInt(0x8)) !== 0)
      : [];

    // 2) chequeamos presencia del bot consultando /guilds/{id}?with_counts=true con Bot token
    const botGuilds = [];

    // hacemos procesamiento por "chunks" para no bombardear la API (concurrency control simple)
    const CONCURRENCY = 5;
    for (let i = 0; i < adminGuilds.length; i += CONCURRENCY) {
      const chunk = adminGuilds.slice(i, i + CONCURRENCY);
      const promises = chunk.map(async (g) => {
        try {
          const guildInfoRes = await axios.get(
            `https://discord.com/api/v10/guilds/${g.id}?with_counts=true`,
            { headers: { Authorization: `Bot ${BOT_TOKEN}` }, timeout: 8000 }
          );
          const guildInfo = guildInfoRes.data;

          // opcional: pedir roles/channels counts si los quieres aquí (pero evita muchas llamadas)
          botGuilds.push({
            id: g.id,
            name: g.name,
            icon: g.icon,
            member_count: guildInfo.approximate_member_count || 'N/A'
            // puedes añadir roles_count / channels_count pidiendo endpoints separados si lo deseas
          });
        } catch (err) {
          // el bot no está en ese guild o no tiene permisos; lo ignoramos
          return;
        }
      });

      // esperar este bloque
      await Promise.all(promises);
      // opcional: pequeña pausa para reducir riesgos de rate-limit (descomenta si tienes problemas)
      // await new Promise(r => setTimeout(r, 200));
    }

    // 3) renderizar
    const guildListHtml = botGuilds.length
      ? botGuilds.map(g => {
        const iconUrl = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : 'https://via.placeholder.com/64?text=?';
        return `<li>
          <img src="${iconUrl}" class="gicon" alt="icon">
          <strong>${escapeHtml(g.name)}</strong><br>
          👥 ${g.member_count} <br>
          <a class="small" href="/panel/${g.id}?userId=${userId}">Abrir panel</a>
        </li>`;
      }).join('')
      : '<li>No hay servidores con Abyssus disponibles.</li>';

    res.send(`<!doctype html><html lang="es"><head>... estilos ...</head><body>
      <div class="container"><div class="card"><h1>Servidores donde Abyssus está presente</h1><ul style="list-style:none;padding:0">${guildListHtml}</ul></div></div>
      </body></html>`);
  } catch (err) {
    console.error('mis-guilds err:', err.response?.data || err.message);
    res.status(500).send('<h2>Error obteniendo servidores</h2><pre>' + safeJson(err.response?.data || err.message) + '</pre>');
  }
});

// -------------------- /panel/:guildId --------------------
app.get('/panel/:guildId', async (req, res) => {
  const guildId = req.params.guildId;
  const userId = req.query.userId;
  const usuario = usuariosAutenticados.get(userId);
  if (!usuario) return res.redirect('/login');

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send('Falta BOT_TOKEN en .env');

  try {
    // verificar adminidad del usuario en guild
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${usuario.accessToken}` }
    });
    const isAdmin = Array.isArray(guildsRes.data) && guildsRes.data.some(g => g.id === guildId && (BigInt(g.permissions) & BigInt(0x8)) !== 0);
    if (!isAdmin) return res.status(403).send('No tienes permisos para ver este panel');

    // obtener info, roles y canales en paralelo
    const [guildInfoRes, rolesRes, channelsRes] = await Promise.all([
      axios.get(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/channels`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } })
    ]);

    const guild = guildInfoRes.data;
    const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
    const channels = Array.isArray(channelsRes.data) ? channelsRes.data : [];

    const iconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : 'https://via.placeholder.com/128?text=?';

    // emojis por tipo de canal
    const tipoCanalEmoji = { 0:'📝', 2:'🎤', 4:'📂', 13:'🎙️', 15:'🗂️' };
    const rolesList = roles.map(r => `<li>${escapeHtml(r.name)} <small style="opacity:.8">(${r.id})</small></li>`).join('');
    const channelsList = channels.map(c => {
      const emoji = tipoCanalEmoji[c.type] || '❔';
      return `<li>${emoji} ${escapeHtml(c.name)} <small style="opacity:.8">(${c.id})</small></li>`;
    }).join('');

    // render panel
    res.send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Panel Abyssus - ${escapeHtml(guild.name)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--accent:#764ba2}
body{font-family:Inter,Segoe UI,Arial;margin:0;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:1rem}
.container{max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:1.25rem}
.card{background:rgba(0,0,0,0.36);padding:1.1rem;border-radius:12px}
.header{display:flex;align-items:center;gap:1rem}
.icon{width:96px;height:96px;border-radius:12px;object-fit:cover}
.stats{display:flex;gap:1rem;flex-wrap:wrap;margin-top:.6rem}
.stat{background:rgba(255,255,255,0.04);padding:.6rem .9rem;border-radius:10px}
.panel-grid{display:flex;gap:1rem;flex-wrap:wrap}
.panel-item{flex:1 1 320px;background:rgba(255,255,255,0.04);padding:1rem;border-radius:10px;max-height:480px;overflow:auto}
ul{list-style:none;padding:0;margin:0}
li{padding:.45rem;border-radius:8px;margin-bottom:.45rem;background:rgba(255,255,255,0.02)}
a.button{display:inline-block;margin-top:1rem;padding:.6rem 1rem;border-radius:8px;background:#fff;color:var(--accent);font-weight:700;text-decoration:none}
.back{opacity:.9;color:#fff;text-decoration:none;font-size:.95rem}
.small{font-size:.9rem;opacity:.85}
</style>
</head><body>
<div class="container">
  <div class="card header">
    <img class="icon" src="${iconUrl}" alt="icon">
    <div>
      <h1 style="margin:0">${escapeHtml(guild.name)}</h1>
      <p class="small">ID: ${guild.id}</p>
      <div class="stats">
        <div class="stat">👥 Miembros: ${guild.approximate_member_count || 'N/A'}</div>
        <div class="stat">💬 Canales: ${channels.length}</div>
        <div class="stat">🧾 Roles: ${roles.length}</div>
      </div>
    </div>
  </div>

  <div class="panel-grid">
    <div class="panel-item">
      <h2 style="margin-top:0">Roles</h2>
      <ul>${rolesList}</ul>
    </div>
    <div class="panel-item">
      <h2 style="margin-top:0">Canales</h2>
      <ul>${channelsList}</ul>
    </div>
  </div>

  <div class="card" style="text-align:right">
    <a class="back" href="/mis-guilds/${userId}">← Volver a mis servidores</a>
    <a class="button" style="margin-left:1rem" href="https://discord.com/channels/${guild.id}" target="_blank">Abrir en Discord</a>
  </div>
</div>
</body></html>`);
  } catch (err) {
    console.error('panel err:', err.response?.data || err.message);
    res.status(500).send('<h2>Error cargando panel</h2><pre>' + safeJson(err.response?.data || err.message) + '</pre>');
  }
});

// small helpers
function escapeHtml(s = '') {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

// -------------------- start server --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));













































































