require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();

// Cargar JSON de economía
const economiaPath = path.join(__dirname, 'Usuario.json');
function cargarEconomia() {
  if (!fs.existsSync(economiaPath)) return [];
  return JSON.parse(fs.readFileSync(economiaPath, 'utf8'));
}

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Página principal con botón Login
app.get('/', (req, res) => {
  const token = req.query.token;
  if (!token) {
    // Mostrar botón de login si no hay token
    return res.send(`
      <h1>🔐 Abyssus Dashboard</h1>
      <a href="https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify">
        <button style="padding:10px 20px; font-size:16px;">Login con Discord</button>
      </a>
    `);
  }

  // Si hay token, obtener perfil
  axios.get('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token}` },
  }).then(resp => {
    const user = resp.data;
    const economiaData = cargarEconomia();
    const datosUsuario = economiaData.find(u => u.id === user.id) || {};
    const balance = datosUsuario.balance || 0;

    res.send(`
      <h1>👤 ${user.username}#${user.discriminator}</h1>
      <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" width="100" height="100"/>
      <p>ID: ${user.id}</p>
      <h2>💰 Economía</h2>
      <p>Balance: $${balance.toLocaleString()}</p>
      <a href="/">🔙 Cerrar sesión</a>
    `);
  }).catch(err => {
    res.send(`<p>❌ Error al obtener datos del usuario: ${err.response?.data?.message || err.message}</p>`);
  });
});

// Callback de Discord
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('❌ Código OAuth2 no recibido');

  try {
    const tokenResp = await axios.post(
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

    const accessToken = tokenResp.data.access_token;
    res.redirect(`/?token=${accessToken}`);
  } catch (err) {
    res.send(`❌ Error al procesar código OAuth2: ${err.response?.data?.error_description || err.message}`);
  }
});

// Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔐 Abyssus Run activo en Render · Puerto ${PORT}`));





























