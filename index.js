require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.static('public'));

// ------------------------------
// Almacenamiento en memoria
// ------------------------------
const usuariosAutenticados = new Map();
// key = userID, value = { accessToken, refreshToken, username, discriminator }

// ------------------------------
// Ruta /login: redirige a Discord
// ------------------------------
app.get('/login', (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const redirect = process.env.REDIRECT_URI;

  if (!clientId || !redirect) return res.status(500).send('Falta CLIENT_ID o REDIRECT_URI en .env');

  const authorizeUrl =
    'https://discord.com/oauth2/authorize' +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&response_type=code` +
    `&scope=identify%20guilds`;

  res.send(`
    <h2>Iniciar sesión con Discord</h2>
    <a href="${authorizeUrl}">
      <button>Login con Discord</button>
    </a>
  `);
});

// ------------------------------
// Ruta /callback: recibe el code
// ------------------------------
app.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send(`
      <h2>❌ No se recibió code</h2>
      <p>Usa <a href="/login">/login</a> para iniciar sesión.</p>
    `);
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
    const refreshToken = tokenResponse.data.refresh_token;

    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const userData = userRes.data;

    // Guardar usuario en memoria
    usuariosAutenticados.set(userData.id, {
      accessToken,
      refreshToken,
      username: userData.username,
      discriminator: userData.discriminator
    });

    console.log('Usuarios autenticados:', Array.from(usuariosAutenticados.keys()));

    res.send(`
      <h2>✅ Autenticación OK</h2>
      <p>${userData.username}#${userData.discriminator} (ID: ${userData.id})</p>
      <p>Puedes consultar tus guilds en: <a href="/mis-guilds/${userData.id}">/mis-guilds/${userData.id}</a></p>
    `);

  } catch (err) {
    const data = err.response?.data;

    // Código inválido o expirado
    if (data?.error === 'invalid_grant') {
      console.warn('Code inválido/expirado, redirigiendo a /login');
      return res.redirect('/login');
    }

    console.error('Error OAuth2:', data || err.message);
    return res.status(500).send('<h2>❌ Error OAuth2</h2><pre>' + JSON.stringify(data || err.message, null, 2) + '</pre>');
  }
});

// ------------------------------
// Ruta para obtener guilds del usuario
// ------------------------------
app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const usuario = usuariosAutenticados.get(userId);

  if (!usuario) return res.status(404).send('Usuario no autenticado');

  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${usuario.accessToken}` }
    });

    res.json(guildsRes.data);

  } catch (err) {
    if (err.response?.status === 401) {
      // Token expirado → renovar automáticamente
      try {
        const newAccessToken = await refreshToken(userId);
        const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
          headers: { Authorization: `Bearer ${newAccessToken}` }
        });
        return res.json(guildsRes.data);
      } catch (refreshErr) {
        return res.status(500).send('Error renovando token: ' + JSON.stringify(refreshErr.response?.data || refreshErr.message));
      }
    }

    console.error(err.response?.data || err.message);
    res.status(500).send('Error al obtener guilds');
  }
});

// ------------------------------
// Función para renovar token
// ------------------------------
async function refreshToken(userId) {
  const usuario = usuariosAutenticados.get(userId);
  if (!usuario) throw new Error('Usuario no encontrado');

  const response = await axios.post(
    'https://discord.com/api/oauth2/token',
    new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: usuario.refreshToken,
      redirect_uri: process.env.REDIRECT_URI
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  usuario.accessToken = response.data.access_token;
  usuario.refreshToken = response.data.refresh_token;
  usuariosAutenticados.set(userId, usuario);

  console.log(`Token renovado para ${usuario.username}#${usuario.discriminator}`);
  return usuario.accessToken;
}

// ------------------------------
// Iniciar servidor
// ------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));

























































