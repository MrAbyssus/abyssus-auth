require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();

// Callback de OAuth2
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('❌ No se recibió el código.');

  try {
    // Token request
    const params = new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.REDIRECT_URI,
    });

    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResponse.data.access_token;

    // Obtener datos de usuario
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const user = userResponse.data;

    res.send(`
      <h2>¡Bienvenido, ${user.username}!</h2>
      <p>ID: ${user.id}</p>
      <p>Token recibido correctamente.</p>
      <p>Guarda el access_token para futuras consultas al bot.</p>
    `);

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.send('❌ Error obteniendo token: ' + (err.response?.data?.error_description || err.message));
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));



























