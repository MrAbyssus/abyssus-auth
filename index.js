require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.static('public'));

// Ruta que redirige al usuario a Discord
app.get('/login', (req, res) => {
  // Asegúrate de que REDIRECT_URI en .env sea exactamente:
  // https://abyssus-auth.onrender.com/callback
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

  console.log('URL de autorización generada:', authorizeUrl);
  return res.redirect(authorizeUrl);
});

// DEBUG: muestra todo lo que llega a /callback
app.get('/callback', (req, res) => {
  console.log('REQUEST /callback -> query:', req.query);
  // No recargues esta URL manualmente; debe venir de Discord con ?code=...
  const code = req.query.code;
  if (!code) {
    // Muestra la query para depuración en el navegador
    return res.status(400).send(`
      <h2>❌ No se recibió "code" en la query</h2>
      <pre>${JSON.stringify(req.query, null, 2)}</pre>
      <p>Asegúrate de autorizar desde Discord usando la URL desde /login.</p>
    `);
  }

  // intercambiar code por token
  (async () => {
    try {
      console.log('Intercambiando código por token...');
      const tokenResponse = await axios.post(
        'https://discord.com/api/oauth2/token',
        new URLSearchParams({
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: process.env.REDIRECT_URI // EXACTAMENTE igual que en el developer portal
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      console.log('tokenResponse.data:', tokenResponse.data);
      const accessToken = tokenResponse.data.access_token;

      // obtener datos básicos del usuario
      const userRes = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      console.log('Usuario obtenido:', userRes.data.id, userRes.data.username);
      res.send(`<h2>✅ Autenticación OK</h2>
        <p>${userRes.data.username}#${userRes.data.discriminator} (ID: ${userRes.data.id})</p>`);
    } catch (err) {
      console.error('Error intercambiando token:', err.response?.data || err.message);
      res.status(500).send(`
        <h2>❌ Error al procesar OAuth2</h2>
        <pre>${JSON.stringify(err.response?.data || err.message, null, 2)}</pre>
      `);
    }
  })();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en ${PORT}`));
























































