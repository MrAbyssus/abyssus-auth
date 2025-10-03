require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

// Callback OAuth2
app.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code || typeof code !== 'string') {
    return res.status(400).send(`
      <h2>❌ Código OAuth2 no recibido</h2>
      <p>No se recibió un "code" válido en la URL.</p>
    `);
  }

  try {
    // Verificar variables de entorno
    const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = process.env;
    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      throw new Error('❌ Variables de entorno OAuth2 no definidas');
    }

    // POST a Discord para intercambiar el code por un token
    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI.trim()
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResponse.data.access_token;
    const tokenType = tokenResponse.data.token_type; // normalmente "Bearer"

    // Usar el token para obtener info del usuario
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `${tokenType} ${accessToken}` }
    });

    const user = userResponse.data;

    // Devuelve el usuario en HTML o redirige a tu dashboard
    res.send(`
      <h2>✅ Usuario autenticado</h2>
      <p>ID: ${user.id}</p>
      <p>Username: ${user.username}#${user.discriminator}</p>
      <p>Avatar: <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" width="100" /></p>
      <p>Token válido generado y listo para el dashboard</p>
    `);

  } catch (error) {
    const errMsg = error.response?.data?.error_description || error.message || 'Error desconocido';
    console.error('❌ Error OAuth2 callback:', errMsg);

    res.status(500).send(`
      <h2>❌ Error al obtener datos del usuario</h2>
      <p>${errMsg}</p>
    `);
  }
});

// Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));




























