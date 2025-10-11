require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.static('public'));

// Guardar usuarios autenticados temporalmente
const usuariosAutenticados = new Map();

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

    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const userData = userRes.data;

    usuariosAutenticados.set(userData.id, { accessToken, username: userData.username, discriminator: userData.discriminator, avatar: userData.avatar });

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
    console.error(err.response?.data || err.message);
    res.status(500).send('Error OAuth2');
  }
});

// -------------------- /mis-guilds/:userId --------------------
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

    const adminGuilds = guildsRes.data.filter(g => (BigInt(g.permissions) & BigInt(0x8)) !== 0);

    const botGuilds = [];
    for (const g of adminGuilds) {
      try {
        const guildInfo = await axios.get(`https://discord.com/api/v10/guilds/${g.id}?with_counts=true`, {
          headers: { Authorization: `Bot ${BOT_TOKEN}` }
        });

        const rolesCount = guildInfo.data.roles ? guildInfo.data.roles.length : 0;
        botGuilds.push({
          ...g,
          member_count: guildInfo.data.approximate_member_count || 'N/A',
          roles_count: rolesCount
        });
      } catch { /* bot no presente */ }
    }

    let guildList = '';
    botGuilds.forEach(g => {
      const iconUrl = g.icon
        ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`
        : 'https://via.placeholder.com/32?text=?';

      const discordLink = `https://discord.com/channels/${g.id}`;
      const botPanelLink = `/panel/${g.id}?userId=${userId}`; // Pasamos userId para autorización

      guildList += `
<li>
  <img src="${iconUrl}" class="avatar">
  <strong>${g.name}</strong> (ID: ${g.id})<br>
  Miembros: ${g.member_count}, Roles: ${g.roles_count}<br>
  <a class="small-button" href="${discordLink}" target="_blank">Abrir Discord</a>
  <a class="small-button" href="${botPanelLink}" target="_blank">Panel Abyssus</a>
</li>`;
    });

    if (!guildList) guildList = '<li>No se encontraron servidores con Abyssus donde eres admin.</li>';

    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Servidores con Abyssus</title>
<style>
body { font-family:'Segoe UI',Tahoma,Verdana,sans-serif; background: linear-gradient(135deg,#667eea,#764ba2); color:#fff; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:2rem; }
.card { background-color: rgba(0,0,0,0.35); padding:2rem; border-radius:15px; text-align:center; box-shadow:0 8px 25px rgba(0,0,0,0.5); width:100%; max-width:600px; }
h1 { font-size:2rem; margin-bottom:1rem; }
ul { list-style:none; padding:0; }
li { margin:0.5rem 0; background: rgba(255,255,255,0.1); padding:0.5rem 1rem; border-radius:8px; text-align:left; }
a.button, a.small-button { display:inline-block; margin-top:0.3rem; margin-right:0.3rem; padding:0.4rem 0.8rem; background-color:#fff; color:#764ba2; text-decoration:none; font-weight:bold; border-radius:6px; font-size:0.9rem; transition:0.3s; }
a.button:hover, a.small-button:hover { background-color:#f0f0f0; }
img.avatar { width:32px; height:32px; border-radius:50%; vertical-align:middle; margin-right:0.5rem; }
</style>
</head>
<body>
<div class="card">
<h1>Servidores con Abyssus</h1>
<ul>
${guildList}
</ul>
<a class="button" href="/login">Cerrar sesión / Volver a login</a>
</div>
</body>
</html>
    `);

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Error obteniendo servidores con Abyssus');
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
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${usuario.accessToken}` }
    });
    const isAdmin = guildsRes.data.some(g => g.id === guildId && (BigInt(g.permissions) & BigInt(0x8)) !== 0);
    if (!isAdmin) return res.status(403).send('No tienes permisos para ver este panel');

    const guildInfo = await axios.get(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });

    const rolesRes = await axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });

    const channelsRes = await axios.get(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });

    const guild = guildInfo.data;
    const roles = rolesRes.data;
    const channels = channelsRes.data;

    const iconUrl = guild.icon
      ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
      : 'https://via.placeholder.com/64?text=?';

    const rolesList = roles.map(r => `<li>${r.name} (ID: ${r.id})</li>`).join('');
    const channelsList = channels.map(c => `<li>[${c.type}] ${c.name} (ID: ${c.id})</li>`).join('');

    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Panel Abyssus - ${guild.name}</title>
<style>
body { font-family:'Segoe UI',Tahoma,Verdana,sans-serif; background: linear-gradient(135deg,#667eea,#764ba2); color:#fff; padding:2rem; margin:0; }
.container { max-width:1000px; margin:auto; display:flex; flex-direction:column; gap:2rem; }
.card { background: rgba(0,0,0,0.35); padding:1.5rem; border-radius:15px; box-shadow:0 8px 25px rgba(0,0,0,0.5); }
h1 { display:flex; align-items:center; gap:1rem; font-size:2rem; margin-bottom:1rem; }
h2 { margin-bottom:0.8rem; }
ul { list-style:none; padding:0; max-height:300px; overflow-y:auto; }
li { margin:0.3rem 0; padding:0.4rem 0.6rem; border-radius:6px; background: rgba(255,255,255,0.1); }
img.avatar { width:64px; height:64px; border-radius:50%; }
a.button { display:inline-block; margin-top:1rem; padding:0.5rem 1rem; background-color:#fff; color:#764ba2; text-decoration:none; font-weight:bold; border-radius:8px; transition:0.3s; }
a.button:hover { background-color:#f0f0f0; }
.panel-grid { display:flex; gap:1rem; flex-wrap:wrap; }
.panel-item { flex:1 1 300px; background: rgba(255,255,255,0.1); padding:1rem; border-radius:12px; max-height:400px; overflow-y:auto; }
</style>
</head>
<body>
<div class="container">
  <div class="card">
    <h1><img class="avatar" src="${iconUrl}" alt="Icono"/> ${guild.name}</h1>
    <p>ID: ${guild.id}</p>
    <p>Miembros: ${guild.approximate_member_count || 'N/A'}, Roles: ${roles.length}, Canales: ${channels.length}</p>
  </div>
  <div class="panel-grid">
    <div class="panel-item">
      <h2>Roles</h2>
      <ul>${rolesList}</ul>
    </div>
    <div class="panel-item">
      <h2>Canales</h2>
      <ul>${channelsList}</ul>
    </div>
  </div>
  <a class="button" href="/mis-guilds/${userId}">Volver a mis servidores</a>
</div>
</body>
</html>
    `);

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Error cargando el panel del servidor');
  }
});

// -------------------- Servidor --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));









































































