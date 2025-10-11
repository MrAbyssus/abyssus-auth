require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.static('public'));

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

    const allGuilds = guildsRes.data;

    // Filtrar solo servidores donde el bot está presente
    const botGuilds = [];
    for (const g of allGuilds) {
      try {
        await axios.get(`https://discord.com/api/v10/guilds/${g.id}`, {
          headers: { Authorization: `Bot ${BOT_TOKEN}` }
        });
        botGuilds.push(g);
      } catch { /* el bot no está */ }
    }

    // Generar lista de servidores para mostrar
    let guildList = '';
    botGuilds.forEach(g => {
      const iconUrl = g.icon
        ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`
        : 'https://via.placeholder.com/32?text=?';
      guildList += `
<li>
  <img src="${iconUrl}" class="avatar">
  <strong>${g.name}</strong> (ID: ${g.id})
</li>`;
    });

    if (!guildList) guildList = '<li>No se encontraron servidores con Abyssus.</li>';

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

// -------------------- Servidor --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));



































































