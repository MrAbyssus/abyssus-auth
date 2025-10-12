require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

const sesiones = new Map();
setInterval(() => {
  const ahora = Date.now();
  for (const [id, s] of sesiones) {
    if (ahora - s.timestamp > 1000 * 60 * 10) sesiones.delete(id);
  }
}, 1000 * 60 * 2);

function escapeHtml(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

app.get('/login', (req, res) => {
  const redirect = process.env.REDIRECT_URI;
  const clientId = process.env.CLIENT_ID;
  if (!redirect || !clientId) return res.status(500).send('Falta CLIENT_ID o REDIRECT_URI');

  const url =
    `https://discord.com/oauth2/authorize` +
    `?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&response_type=code&scope=identify%20guilds`;
  res.redirect(url);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login');

  try {
    const tokenRes = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenRes.data.access_token;
    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const user = userRes.data;
    sesiones.set(user.id, { accessToken, timestamp: Date.now() });

    res.send(`
      <h2>✅ Bienvenido ${escapeHtml(user.username)}#${user.discriminator}</h2>
      <a href="/mis-guilds/${user.id}">Ver mis servidores (Owner)</a>
    `);
  } catch (err) {
    res.status(500).send(`<pre>${escapeHtml(JSON.stringify(err.response?.data || err.message, null, 2))}</pre>`);
  }
});

app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const sesion = sesiones.get(userId);
  if (!sesion) return res.redirect('/login');

  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${sesion.accessToken}` },
    });

    const guilds = Array.isArray(guildsRes.data)
      ? guildsRes.data.filter(g => g.owner === true) // 🔥 solo los que el usuario es owner
      : [];

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const botGuilds = [];

    for (const g of guilds) {
      try {
        const info = await axios.get(
          `https://discord.com/api/v10/guilds/${g.id}?with_counts=true`,
          { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
        );
        botGuilds.push({ ...g, member_count: info.data.approximate_member_count });
      } catch {
        // ignorar guilds donde el bot no está
      }
    }

    const htmlGuilds = botGuilds.length
      ? botGuilds.map(g => {
          const icon = g.icon
            ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png`
            : 'https://via.placeholder.com/64?text=?';
          return `
            <li style="margin:10px 0;padding:10px;border-radius:8px;background:#161b22;">
              <img src="${icon}" width="50" height="50" style="vertical-align:middle;border-radius:8px;margin-right:8px;">
              <strong>${escapeHtml(g.name)}</strong><br>
              👑 Owner | 👥 ${g.member_count || 'N/A'} miembros<br>
              <a href="/panel/${g.id}?userId=${userId}" style="color:#5865F2;">Abrir panel</a>
            </li>`;
        }).join('')
      : '<p>No eres owner de ningún servidor donde Abyssus esté presente.</p>';

    res.send(`
      <html>
      <head>
        <title>Servidores (Owner)</title>
        <style>
          body { background:#0d1117;color:white;font-family:Arial;padding:20px;text-align:center; }
          ul { list-style:none;padding:0; }
        </style>
      </head>
      <body>
        <h2>Servidores donde eres Owner y está Abyssus</h2>
        <ul>${htmlGuilds}</ul>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`<pre>${escapeHtml(JSON.stringify(err.response?.data || err.message, null, 2))}</pre>`);
  }
});

app.get('/panel/:guildId', async (req, res) => {
  const { guildId } = req.params;
  const { userId } = req.query;
  const sesion = sesiones.get(userId);
  if (!sesion) return res.redirect('/login');

  try {
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const guildRes = await axios.get(
      `https://discord.com/api/v10/guilds/${guildId}?with_counts=true`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    );
    const g = guildRes.data;

    res.send(`
      <html>
      <head>
        <title>Panel - ${escapeHtml(g.name)}</title>
        <style>
          body { background:#0d1117;color:white;font-family:Arial;text-align:center;padding:20px; }
          .btn { background:#5865F2;color:white;border:none;padding:10px 16px;border-radius:8px;cursor:pointer;margin:5px; }
          .btn:hover { background:#4752C4; }
        </style>
      </head>
      <body>
        <h2>${escapeHtml(g.name)}</h2>
        <p>👥 Miembros: ${g.approximate_member_count}</p>
        <h3>🛠️ Panel de Moderación</h3>
        <button class="btn" onclick="alert('Comando /say enviado')">📢 /say</button>
        <button class="btn" onclick="alert('Comando /warn enviado')">⚠️ /warn</button>
        <button class="btn" onclick="alert('Comando /kick enviado')">🚪 /kick</button>
        <br><br>
        <a href="/mis-guilds/${userId}" style="color:#5865F2;">⬅️ Volver</a>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`<pre>${escapeHtml(JSON.stringify(err.response?.data || err.message, null, 2))}</pre>`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor escuchando en puerto ${PORT}`));


















































































