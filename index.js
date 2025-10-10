require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.get('/', (req, res) => {
  res.send(`
    <body style="font-family:sans-serif; text-align:center; background:#111; color:#fff;">
      <h1>🔐 Inicia sesión con Discord</h1>
      <a href="https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}
      &redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}
      &response_type=code
      &scope=identify">
        <button style="padding:10px 20px; border:none; background:#5865F2; color:white; border-radius:8px; cursor:pointer;">
          Iniciar sesión con Discord
        </button>
      </a>
    </body>
  `);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('❌ No se recibió ningún código de Discord.');

  try {
    // Intercambiar el código por un token
    const tokenRes = await axios.post('https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const token = tokenRes.data.access_token;

    // Obtener los datos del usuario
    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const user = userRes.data;

    res.send(`
      <body style="font-family:sans-serif; background:#111; color:#fff; text-align:center; padding-top:50px;">
        <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" width="100" style="border-radius:50%">
        <h2>${user.username}#${user.discriminator}</h2>
        <p>ID: ${user.id}</p>
        <p>✅ Sesión iniciada correctamente</p>
        <a href="/" style="color:#5865F2;">Cerrar sesión</a>
      </body>
    `);
  } catch (err) {
    console.error(err.response?.data || err);
    res.send('❌ Error al procesar el inicio de sesión con Discord.');
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('✅ Servidor iniciado en el puerto', process.env.PORT || 3000);
});






















































