require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Client, GatewayIntentBits } = require('discord.js');
const app = express();

app.use(express.static('public'));

// -------------------- Discord.js bot para info de servidores --------------------
const bot = new Client({ intents: [GatewayIntentBits.Guilds] });
const BOT_ID = process.env.BOT_ID;
bot.login(process.env.BOT_TOKEN);

// -------------------- Almacenamiento en memoria --------------------
const usuariosAutenticados = new Map();

// -------------------- Función para renovar token --------------------
async function refreshToken(userId) {
  const usuario = usuariosAutenticados.get(userId);
  if (!usuario) throw new Error('Usuario no encontrado');

  const response = await axios.post(
    'https://discord.com/api/oauth2/token',
    new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: usuario.refreshToken,
      redirect_uri: process.env.REDIRECT_URI
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  usuario.accessToken = response.data.access_token;
  usuario.refreshToken = response.data.refresh_token;
  usuariosAutenticados.set(userId, usuario);

  return usuario.accessToken;
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

  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Login con Discord</title>
<style>
body { font-family:'Segoe UI',Tahoma,Verdana,sans-serif; background: linear-gradient(135deg,#667eea,#764ba2); color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0; }
h1 { font-size:2.5rem; margin-bottom:1rem; }
a.button { display:inline-block; padding:0.8rem 1.5rem; background-color:#fff; color:#764ba2; font-weight:bold; text-decoration:none; border-radius:10px; font-size:1.2rem; transition:0.3s; }
a.button:hover { background-color:#f0f0f0; }
</style>
</head>
<body>
<h1>Inicia sesión con Discord</h1>
<a class="button" href="${authorizeUrl}">Login con Discord</a>
</body>
</html>
  `);
});

// -------------------- /callback --------------------
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
      avatar: userData.avatar
    });

    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Autenticación Exitosa</title>
<style>
body { font-family:'Segoe UI',Tahoma,Verdana,sans-serif; background: linear-gradient(135deg,#667eea,#764ba2); color:#fff; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
.card { background-color: rgba(0,0,0,0.35); padding:2rem; border-radius:15px; text-align:center; box-shadow:0 8px 25px rgba(0,0,0,0.5); }
h1 { font-size:2.5rem; margin-bottom:0.5rem; }
p { font-size:1.2rem; margin:0.3rem 0; }
a.button { display:inline-block; margin-top:1rem; padding:0.6rem 1.2rem; background-color:#fff; color:#764ba2; text-decoration:none; font-weight:bold; border-radius:8px; transition:0.3s; }
a.button:hover { background-color:#f0f0f0; }
img.avatar { width:80px; height:80px; border-radius:50%; margin-bottom:1rem; border:2px solid #fff; }
</style>
</head>
<body>
<div class="card">
<img class="avatar" src="https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png" alt="Avatar"/>
<h1>✅ Autenticación OK</h1>
<p><strong>${userData.username}#${userData.discriminator}</strong></p>
<p>ID: ${userData.id}</p>
<a class="button" href="/mis-guilds/${userData.id}">Ver servidores con Abyssus</a>
</div>
</body>
</html>
    `);

  } catch (err) {
    const data = err.response?.data;
    if (data?.error === 'invalid_grant') return res.redirect('/login');
    if (data?.error === 'invalid_request' && data?.error_description?.includes('rate limited')) {
      return res.status(429).send(`<h2>⚠️ Rate limit alcanzado. Espera unos minutos e intenta de nuevo.</h2><a href="/login">Volver a login</a>`);
    }
    console.error('Error OAuth2:', data || err.message);
    res.status(500).send('<h2>Error OAuth2</h2><pre>' + JSON.stringify(data || err.message, null, 2) + '</pre>');
  }
});

// -------------------- /mis-guilds --------------------
app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const usuario = usuariosAutenticados.get(userId);
  if (!usuario) return res.redirect('/login');

  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${usuario.accessToken}` }
    });

    const allGuilds = guildsRes.data;

    // Filtrar solo guilds donde el bot Abyssus está presente
    const botGuilds = allGuilds.filter(g => bot.guilds.cache.has(g.id));

    let guildList = '';
    botGuilds.forEach(g => {
      const iconUrl = g.icon
        ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`
        : 'https://via.placeholder.com/32?text=?';
      const isAdmin = (BigInt(g.permissions) & BigInt(0x8)) !== 0; // permiso admin
      const guildInfo = bot.guilds.cache.get(g.id);
      const memberCount = guildInfo ? guildInfo.memberCount : 'Desconocido';

      guildList += `
<li>
  <img src="${iconUrl}" class="avatar">
  <strong>${g.name}</strong> (ID: ${g.id})<br>
  <small>${isAdmin ? '💪 Administrador' : '🔹 Sin permisos de admin'} | 👥 Miembros: ${memberCount}</small>
</li>`;
    });

    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Servidores con Abyssus</title>
<style>
body { font-family:'Segoe UI',Tahoma,Verdana,sans-serif; background: linear-gradient(135deg,#667eea,#764ba2); color:#fff; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:2rem; }
.card { background-color: rgba(0,0,0,0.35); padding:2rem; border-radius:15px; text-align:center; box-shadow:0 8px 25px rgba(0,0,0,0.5); width:100%; max-width:500px; }
h1 { font-size:2rem; margin-bottom:1rem; }
ul { list-style:none; padding:0; }
li { margin:0.5rem 0; background: rgba(255,255,255,0.1); padding:0.5rem 1rem; border-radius:8px; text-align:left; }
a.button { display:inline-block; margin-top:1rem; padding:0.6rem 1.2rem; background-color:#fff; color:#764ba2; text-decoration:none; font-weight:bold; border-radius:8px; transition:0.3s; }
a.button:hover { background-color:#f0f0f0; }
img.avatar { width:32px; height:32px; border-radius:50%; vertical-align:middle; margin-right:0.5rem; }
</style>
</head>
<body>
<div class="card">
<h1>Servidores con Abyssus</h1>
<ul>
${guildList || '<li>No se encontraron servidores con Abyssus</li>'}
</ul>
<a class="button" href="/login">Cerrar sesión / Volver a login</a>
</div>
</body>
</html>
    `);

  } catch (err) {
    if (err.response?.status === 401) {
      try { await refreshToken(userId); return res.redirect(`/mis-guilds/${userId}`); } catch { return res.redirect('/login'); }
    }
    console.error(err.response?.data || err.message);
    res.status(500).send('Error obteniendo guilds');
  }
});

// -------------------- Servidor --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));



























































