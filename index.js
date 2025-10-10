require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.static('public'));

// ✅ Ruta principal: muestra el botón de conexión
app.get('/', (req, res) => {
  const authorizeUrl = `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify`;

  res.send(`
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Abyssus · Login</title>
        <style>
          body { background:#0a0a0a; color:#eee; font-family:sans-serif; text-align:center; padding:50px; }
          a { background:#5865F2; color:white; padding:12px 25px; border-radius:8px; text-decoration:none; font-weight:bold; }
          a:hover { background:#4752C4; }
        </style>
      </head>
      <body>
        <h1>🔐 Abyssus · Conexión segura</h1>
        <p>Haz clic para autenticarte con Discord</p>
        <a href="${authorizeUrl}">Conectarse con Discord</a>
      </body>
    </html>
  `);
});

// ✅ Callback de OAuth2
app.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.send(`
      <h2 style="color:red; text-align:center;">❌ No se recibió el código OAuth2.</h2>
      <p style="text-align:center;">Vuelve a intentarlo desde el inicio.</p>
    `);
  }

  try {
    // Intercambiar el código por un token de acceso
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

    // Obtener datos del usuario
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const user = userResponse.data;

    res.send(`
      <html lang="es">
        <head><meta charset="UTF-8"><title>Perfil Discord</title></head>
        <body style="background:#0a0a0a; color:#eee; font-family:sans-serif; text-align:center; padding:50px;">
          <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" width="100" height="100" style="border-radius:50%;"><br>
          <h2>✅ Bienvenido, ${user.username}#${user.discriminator}</h2>
          <p>ID: ${user.id}</p>
          <p>Verificado: ${user.verified ? 'Sí' : 'No'}</p>
          <p>Idioma: ${user.locale}</p>
          <a href="/" style="color:#00ff88;">← Volver</a>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error en callback:', error.response?.data || error.message);
    res.send(`
      <h2 style="color:red; text-align:center;">❌ Error al procesar el OAuth2</h2>
      <p style="text-align:center;">${error.response?.data?.error_description || error.message}</p>
    `);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Abyssus web activa en puerto ${PORT}`));























































