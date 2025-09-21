const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('❌ No se recibió ningún código.');

  try {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.REDIRECT_URI
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const accessToken = tokenResponse.data.access_token;

    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const user = userResponse.data;

    res.send(`
      <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
        <h2>✅ Sesión iniciada</h2>
        <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" style="border-radius:50%; width:100px;"><br>
        <p><strong>${user.username}#${user.discriminator}</strong></p>
        <p>ID: ${user.id}</p>
        <p>Sesión verificada por Abyssus</p>
      </div>
    `);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.send('❌ Error al procesar el código OAuth2.');
  }
});

app.listen(PORT, () => {
  console.log(`🔐 Abyssus Auth activo en http://localhost:${PORT}`);
});
