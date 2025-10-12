// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.static('public'));

// === Sesiones simples en memoria ===
const sesiones = new Map(); // userId → { accessToken, refreshToken, ... }
const codigosUsados = new Set(); // Para evitar reutilizar "code"

// === Helpers ===
function safeJson(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}
function escapeHtml(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// === Página principal /login ===
app.get('/login', (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const redirect = process.env.REDIRECT_URI;
  if (!clientId || !redirect)
    return res.status(500).send('Falta CLIENT_ID o REDIRECT_URI en .env');

  const authorizeUrl =
    'https://discord.com/oauth2/authorize' +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&response_type=code` +
    `&scope=identify%20guilds`;

  res.send(`<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Login Discord</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--accent:#764ba2;--bg1:#667eea;--bg2:#764ba2}
*{box-sizing:border-box}body{font-family:Inter,Segoe UI,system-ui,Arial;min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--bg1),var(--bg2));color:#fff;padding:1rem}
.card{background:rgba(0,0,0,0.35);padding:2rem;border-radius:12px;max-width:520px;width:100%;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.4)}
h1{margin:0 0 .6rem;font-size:1.6rem}
p{margin:.2rem 0 .8rem;color:rgba(255,255,255,0.9)}
a.cta{display:inline-block;padding:.7rem 1.2rem;background:#fff;color:var(--accent);font-weight:700;border-radius:10px;text-decoration:none}
.small{font-size:.88rem;color:rgba(255,255,255,0.8);margin-top:.6rem;display:block}
</style></head>
<body>
<div class="card">
  <h1>Inicia sesión con Discord</h1>
  <p>Autoriza con Discord para ver los servidores donde Abyssus está instalado y administrarlos.</p>
  <a class="cta" href="${authorizeUrl}">Login con Discord</a>
  <span class="small">No compartimos datos con terceros. Solo accesos temporales.</span>
</div>
</body></html>`);
});

// === Callback OAuth2 ===
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login');

  // Evitar reusar el mismo code (causa "invalid_grant")
  if (codigosUsados.has(code)) {
    return res.send(`<h2>⚠️ Este código ya fue usado.</h2><a href="/login">Volver al inicio</a>`);
  }
  codigosUsados.add(code);

  try {
    // Intercambio de código → token
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

    const { access_token, refresh_token } = tokenResponse.data;

    // Obtener usuario
    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const user = userRes.data;
    sesiones.set(user.id, {
      accessToken: access_token,
      refreshToken: refresh_token,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      createdAt: Date.now()
    });

    res.send(`<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Autenticado</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:Inter,Segoe UI,system-ui,Arial;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:1rem}
.card{background:rgba(0,0,0,0.36);padding:2rem;border-radius:12px;text-align:center;max-width:520px}
img.avatar{width:80px;height:80px;border-radius:50%;border:2px solid #fff;display:block;margin:0 auto 1rem}
a.btn{display:inline-block;margin-top:1rem;padding:.6rem 1rem;background:#fff;color:#764ba2;border-radius:8px;text-decoration:none;font-weight:700}
</style></head>
<body>
<div class="card">
  <img class="avatar" src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" alt="avatar">
  <h1>✅ ¡Autenticación exitosa!</h1>
  <p><strong>${user.username}#${user.discriminator}</strong></p>
  <p>ID: ${user.id}</p>
  <a class="btn" href="/mis-guilds/${user.id}">Ver servidores con Abyssus</a>
</div>
</body></html>`);
  } catch (err) {
    console.error('Error OAuth2:', err.response?.data || err.message);
    res.status(500).send(`<h2>❌ Error OAuth2</h2><pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// === Mis guilds ===
app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const sesion = sesiones.get(userId);
  if (!sesion) return res.redirect('/login');

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send('Falta BOT_TOKEN en .env');

  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${sesion.accessToken}` }
    });

    // Filtrar solo donde Abyssus está presente
    const allGuilds = guildsRes.data;
    const botGuildsRes = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });
    const botGuilds = botGuildsRes.data.map(g => g.id);
    const userGuilds = allGuilds.filter(g => botGuilds.includes(g.id));

    const guildListHtml = userGuilds.length
      ? userGuilds.map(g => {
        const iconUrl = g.icon
          ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`
          : 'https://via.placeholder.com/64?text=?';
        return `<li>
          <img src="${iconUrl}" class="gicon" alt="icon">
          <strong>${escapeHtml(g.name)}</strong><br>
          <a class="small" href="/panel/${g.id}?userId=${userId}">Abrir panel</a>
        </li>`;
      }).join('')
      : '<li>No hay servidores con Abyssus disponibles.</li>';

    res.send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Servidores con Abyssus</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:Inter,Segoe UI,Arial;margin:0;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:1rem}
.container{max-width:700px;margin:0 auto}
.card{background:rgba(0,0,0,0.35);padding:1.5rem;border-radius:12px}
.gicon{width:48px;height:48px;border-radius:8px;vertical-align:middle;margin-right:.6rem}
.small{display:inline-block;margin-top:.5rem;padding:.35rem .6rem;background:#fff;color:#764ba2;border-radius:8px;text-decoration:none;font-weight:700}
</style></head>
<body>
<div class="container">
  <div class="card">
    <h1>Servidores donde Abyssus está presente</h1>
    <ul style="list-style:none;padding:0">${guildListHtml}</ul>
  </div>
</div>
</body></html>`);
  } catch (err) {
    console.error('mis-guilds err:', err.response?.data || err.message);
    res.status(500).send(`<h2>Error obteniendo servidores</h2><pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// === Limpieza automática cada 10 minutos ===
setInterval(() => {
  const ahora = Date.now();
  for (const [id, s] of sesiones) {
    if (ahora - s.createdAt > 1000 * 60 * 30) { // 30 minutos
      sesiones.delete(id);
    }
  }
}, 1000 * 60 * 10);

// === Iniciar servidor ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor Abyssus Auth corriendo en puerto ${PORT}`));














































































