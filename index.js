require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

// Mapa temporal de sesiones de usuario (se limpia cada cierto tiempo)
const sesiones = new Map();

function limpiarSesiones() {
  const ahora = Date.now();
  for (const [id, sesion] of sesiones) {
    if (ahora - sesion.timestamp > 1000 * 60 * 10) { // 10 minutos
      sesiones.delete(id);
    }
  }
}
setInterval(limpiarSesiones, 1000 * 60 * 2);

// Ruta de login → redirige al OAuth2 de Discord
app.get('/login', (req, res) => {
  const redirect = process.env.REDIRECT_URI;
  const clientId = process.env.CLIENT_ID;
  if (!redirect || !clientId) {
    return res.status(500).send('Falta CLIENT_ID o REDIRECT_URI en .env');
  }

  const authorizeUrl =
    'https://discord.com/oauth2/authorize' +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&response_type=code` +
    `&scope=identify%20guilds`;

  return res.redirect(authorizeUrl);
});

// Callback del OAuth2
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('<h2>❌ No se recibió "code" en la query</h2>');
  }

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

    const user = userRes.data;

    // Guardar sesión temporal
    sesiones.set(user.id, { accessToken, timestamp: Date.now() });

    res.send(`
      <h2>✅ Autenticación OK</h2>
      <p>${user.username}#${user.discriminator} (ID: ${user.id})</p>
      <p><a href="/mis-guilds/${user.id}">Ver servidores donde está Abyssus</a></p>
    `);
  } catch (err) {
    console.error('Error OAuth2:', err.response?.data || err.message);
    res.status(500).send(`<h2>❌ Error OAuth2</h2><pre>${JSON.stringify(err.response?.data || err.message, null, 2)}</pre>`);
  }
});

// Mostrar solo los servidores donde está el bot
app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const sesion = sesiones.get(userId);
  if (!sesion) return res.redirect('/login');

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send('Falta BOT_TOKEN en .env');

  try {
    // 1️⃣ Obtener los servidores del usuario
    const userGuildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${sesion.accessToken}` }
    });

    const userGuilds = Array.isArray(userGuildsRes.data) ? userGuildsRes.data : [];
    const botGuilds = [];

    // 2️⃣ Verificar dónde está el bot
    const CONCURRENCY = 5;
    for (let i = 0; i < userGuilds.length; i += CONCURRENCY) {
      const chunk = userGuilds.slice(i, i + CONCURRENCY);
      const promises = chunk.map(async (g) => {
        try {
          const guildInfoRes = await axios.get(
            `https://discord.com/api/v10/guilds/${g.id}?with_counts=true`,
            { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
          );

          const guildInfo = guildInfoRes.data;
          botGuilds.push({
            id: g.id,
            name: g.name,
            icon: g.icon,
            member_count: guildInfo.approximate_member_count || 'N/A'
          });
        } catch {
          // Ignorar si el bot no está
        }
      });

      await Promise.all(promises);
    }

    // 3️⃣ Renderizar
    const guildListHtml = botGuilds.length
      ? botGuilds.map(g => {
          const icon = g.icon
            ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`
            : 'https://via.placeholder.com/64?text=?';
          return `
            <li>
              <img src="${icon}" alt="icon" style="width:50px;border-radius:50%;margin-right:10px;vertical-align:middle;">
              <strong>${g.name}</strong><br>
              👥 Miembros: ${g.member_count}<br>
              <a href="/panel/${g.id}?userId=${userId}" style="color:#5865F2;">Abrir panel</a>
            </li>`;
        }).join('')
      : '<li>No hay servidores donde Abyssus esté presente.</li>';

    res.send(`
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Servidores de Abyssus</title>
        <style>
          body { font-family: Arial, sans-serif; background-color: #0d1117; color: white; text-align: center; }
          .card { background: #161b22; border-radius: 10px; padding: 20px; max-width: 500px; margin: 50px auto; box-shadow: 0 0 15px rgba(0,0,0,0.5); }
          a { text-decoration: none; }
          ul { list-style: none; padding: 0; }
          li { margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Servidores donde Abyssus está presente</h2>
          <ul>${guildListHtml}</ul>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error mis-guilds:', err.response?.data || err.message);
    res.status(500).send('<h2>Error obteniendo servidores</h2><pre>' + JSON.stringify(err.response?.data || err.message, null, 2) + '</pre>');
  }
});

// Panel del servidor (vista básica)
app.get('/panel/:guildId', async (req, res) => {
  const { guildId } = req.params;
  const BOT_TOKEN = process.env.BOT_TOKEN;

  try {
    const guildRes = await axios.get(
      `https://discord.com/api/v10/guilds/${guildId}?with_counts=true`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    );
    const g = guildRes.data;

    res.send(`
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Panel - ${g.name}</title>
        <style>
          body { font-family: Arial, sans-serif; background-color: #0d1117; color: white; text-align: center; }
          .card { background: #161b22; border-radius: 10px; padding: 20px; max-width: 500px; margin: 50px auto; }
          a { color: #5865F2; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>${g.name}</h2>
          <p>👥 Miembros: ${g.approximate_member_count}</p>
          <p>💬 Canales: ${g.approximate_presence_count || 'N/A'}</p>
          <a href="/mis-guilds/${req.query.userId || ''}">⬅️ Volver</a>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error al obtener panel:', err.response?.data || err.message);
    res.status(500).send(`<h2>Error al obtener panel</h2><pre>${JSON.stringify(err.response?.data || err.message, null, 2)}</pre>`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor escuchando en puerto ${PORT}`));

















































































