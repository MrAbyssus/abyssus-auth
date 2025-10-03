require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.static('public'));

// Ruta inicial → muestra link de login
app.get('/', (req, res) => {
  const loginURL = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify`;
  res.send(`
    <h1>Dashboard Abyssus</h1>
    <a href="${loginURL}">🔑 Conectar con Discord</a>
  `);
});

// Callback OAuth2
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('❌ Código OAuth2 no recibido');

  try {
    // Solicitar token de acceso
    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResponse.data.access_token;

    // Obtener datos del usuario
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const user = userResponse.data;

    res.send(`
      <h1>Bienvenido, ${user.username}#${user.discriminator}</h1>
      <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" width="100"/>
      <p>ID: ${user.id}</p>
      <p>Token: <strong>${accessToken}</strong></p>
      <p><a href="/">🏠 Volver</a></p>
    `);
  } catch (err) {
    console.error(err);
    res.send('❌ Error al obtener datos del usuario');
  }
});

// Puerto
app.listen(process.env.PORT || 3000, () => console.log('🚀 Dashboard activo'));



























