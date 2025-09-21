const express = require('express');
const axios = require('axios');
const app = express();
require('dotenv').config();

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('❌ Código OAuth2 no recibido');

  try {
    const response = await axios.post('https://discord.com/api/oauth2/token', null, {
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

    const accessToken = response.data.access_token;

    const userInfo = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    res.send(`
      <h2 style="color:#00ffff; font-family:sans-serif;">✅ Sesión iniciada</h2>
      <p style="color:#ccc;">Usuario: ${userInfo.data.username}#${userInfo.data.discriminator}</p>
      <p style="color:#888;">ID: ${userInfo.data.id}</p>
    `);
  } catch (err) {
    res.send('❌ Error al procesar el código OAuth2');
  }
});

app.listen(3000, () => {
  console.log('Abyssus Run active on port 3000');
});

