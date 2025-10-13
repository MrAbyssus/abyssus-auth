require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.static('public'));
const usuariosAutenticados = new Map();

// -------------------- Helper --------------------
function escapeHtml(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function safeJson(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

// -------------------- /login --------------------
app.get('/login', (req, res) => {
  const { CLIENT_ID, REDIRECT_URI } = process.env;
  if (!CLIENT_ID || !REDIRECT_URI) return res.status(500).send('Falta CLIENT_ID o REDIRECT_URI');

  const authorizeUrl =
    `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code&scope=identify%20guilds`;

  res.send(`
  <html>
  <head>
    <meta charset="utf-8"/>
    <title>Iniciar sesión con Discord</title>
    <style>
      body { background-color: #1e1f22; color: #fff; font-family: 'Segoe UI', sans-serif; text-align:center; display:flex; align-items:center; justify-content:center; height:100vh; }
      .card { background:#2b2d31; padding:2rem; border-radius:10px; box-shadow:0 0 20px rgba(0,0,0,0.5); }
      a { background:#5865F2; color:#fff; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:600; }
      a:hover { background:#4752C4; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>Inicia sesión con Discord</h2>
      <p>Autoriza para ver y gestionar los servidores donde Abyssus está instalado.</p>
      <a href="${authorizeUrl}">Conectar con Discord</a>
    </div>
  </body>
  </html>`);
});

// -------------------- /callback --------------------
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login');

  try {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token',
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
    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const user = userRes.data;

    usuariosAutenticados.set(user.id, {
      accessToken: access_token,
      refreshToken: refresh_token,
      username: user.username,
      avatar: user.avatar,
      discriminator: user.discriminator,
    });

    res.redirect(`/mis-guilds/${user.id}`);
  } catch (err) {
    res.status(500).send(`<pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// -------------------- /mis-guilds/:userId --------------------
app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const user = usuariosAutenticados.get(userId);
  if (!user) return res.redirect('/login');

  try {
    const userGuilds = (await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${user.accessToken}` }
    })).data;

    const botGuilds = (await axios.get('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` }
    })).data;

    const matches = userGuilds
      .filter(g => (g.owner || (BigInt(g.permissions) & BigInt(0x8)) !== 0))
      .filter(g => botGuilds.some(bg => bg.id === g.id));

    const htmlGuilds = matches.length ? matches.map(g => `
      <div class="guild">
        <img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128" onerror="this.src='https://via.placeholder.com/128?text=?'">
        <h3>${escapeHtml(g.name)}</h3>
        <p>ID: ${g.id}</p>
        <a href="/panel/${g.id}?userId=${userId}">Abrir panel</a>
      </div>`).join('') : '<p>No hay servidores (owner/admin) donde Abyssus esté presente.</p>';

    res.send(`
    <html>
    <head>
      <meta charset="utf-8"/>
      <title>Servidores de ${escapeHtml(user.username)}</title>
      <style>
        body { background-color:#1e1f22; color:#fff; font-family:'Segoe UI',sans-serif; text-align:center; padding:2rem; }
        h1 { color:#fff; }
        .guilds { display:flex; flex-wrap:wrap; justify-content:center; gap:1.5rem; }
        .guild { background:#2b2d31; padding:1rem; border-radius:10px; width:220px; box-shadow:0 0 10px rgba(0,0,0,0.4); }
        img { border-radius:8px; width:96px; height:96px; }
        a { background:#5865F2; color:#fff; padding:6px 12px; border-radius:8px; text-decoration:none; display:inline-block; margin-top:.5rem; }
        a:hover { background:#4752C4; }
      </style>
    </head>
    <body>
      <h1>Servidores con Abyssus</h1>
      <div class="guilds">${htmlGuilds}</div>
    </body>
    </html>`);
  } catch (err) {
    res.status(500).send(`<pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// -------------------- /panel/:guildId --------------------
app.get('/panel/:guildId', async (req, res) => {
  const guildId = req.params.guildId;
  const userId = req.query.userId;
  const user = usuariosAutenticados.get(userId);
  if (!user) return res.redirect('/login');

  try {
    const guildInfo = (await axios.get(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
      headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` }
    })).data;

    res.send(`
    <html>
    <head>
      <meta charset="utf-8"/>
      <title>Panel de ${escapeHtml(guildInfo.name)}</title>
      <style>
        body { background-color:#1e1f22; color:#fff; font-family:'Segoe UI',sans-serif; padding:2rem; }
        .card { background:#2b2d31; padding:1.5rem; border-radius:12px; }
        img { border-radius:12px; width:96px; height:96px; }
      </style>
    </head>
    <body>
      <div class="card">
        <img src="https://cdn.discordapp.com/icons/${guildInfo.id}/${guildInfo.icon}.png?size=128" onerror="this.src='https://via.placeholder.com/128?text=?'">
        <h2>${escapeHtml(guildInfo.name)}</h2>
        <p>Miembros: ${guildInfo.approximate_member_count || 'N/A'}</p>
        <p>ID: ${guildInfo.id}</p>
        <a href="https://discord.com/channels/${guildInfo.id}" target="_blank" style="color:#5865F2">Abrir en Discord</a>
      </div>
    </body>
    </html>`);
  } catch (err) {
    res.status(500).send(`<pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// -------------------- start server --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor web Abyssus escuchando en puerto ${PORT}`));



























































































