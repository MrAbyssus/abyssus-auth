const express = require('express');
const axios = require('axios');
const app = express();
require('dotenv').config();

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('❌ Código OAuth2 no recibido');

  try {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', null, {
      params: {
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.REDIRECT_URI,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const accessToken = tokenResponse.data.access_token;

    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const user = userResponse.data;

    res.send(`
      <section style="font-family:sans-serif; background:#1c1c1c; color:#ccc; padding:30px; border-radius:10px; text-align:center;">
        <h2 style="color:#00ffff;">✅ Sesión iniciada</h2>
        <p>Bienvenido, <strong>${user.username}#${user.discriminator}</strong></p>
        <p>ID: ${user.id}</p>
        <p style="margin-top:10px; color:#888;">Sistema Abyssus · sesión verificada</p>
      </section>
    `);
  } catch (err) {
    res.send('❌ Error al procesar el código OAuth2');
  }
});

app.listen(3000, () => {
  console.log('Abyssus Run activo en Render');
});


