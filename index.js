require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();

// Rutas absolutas de datos
const economiaPath = path.join(__dirname, 'Usuario.json');
const modlogPath = path.join(__dirname, 'modlogs.json');
const mascotasPath = path.join(__dirname, 'mascotas.json');
const nivelesPath = path.join(__dirname, 'nivelesData.json');

// Función segura para cargar JSON
function cargarJSON(ruta, nombre = 'archivo') {
  try {
    if (!fs.existsSync(ruta)) return [];
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (err) {
    console.error(`❌ Error leyendo ${nombre}:`, err.message);
    return [];
  }
}

const economiaData = cargarJSON(economiaPath, 'Economía');
const modlogData = cargarJSON(modlogPath, 'Modlogs');
const mascotasData = cargarJSON(mascotasPath, 'Mascotas');
const nivelesData = cargarJSON(nivelesPath, 'Niveles');

// Archivos públicos
app.use(express.static(path.join(__dirname, 'public')));

// RUTA DE CALLBACK DE OAUTH2
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code || code.length < 10) {
    return res.send('<h2>❌ Código OAuth2 no recibido o inválido</h2>');
  }

  try {
    if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET || !process.env.REDIRECT_URI)
      throw new Error('❌ Variables de entorno OAuth2 no definidas');

    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI.trim(),
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResponse.data.access_token;
    // Redirige al dashboard con el token en query string
    res.redirect(`/?token=${accessToken}`);
  } catch (err) {
    const msg = err.response?.data?.error_description || err.message;
    res.send(`<h2>❌ Error OAuth2</h2><p>${msg}</p>`);
  }
});

// DASHBOARD PRINCIPAL
app.get('/', async (req, res) => {
  const token = req.query.token;
  let user = null;
  let userId = '';

  try {
    if (token) {
      const userRes = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      user = userRes.data;
      userId = user.id;
    }
  } catch {
    return res.send('<h2>❌ Error al obtener datos del usuario. Token inválido.</h2>');
  }

  // Generar HTML dinámico
  const perfilHTML = user ? `
    <section>
      <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" style="border-radius:50%; width:100px;" />
      <h2>${user.username}#${user.discriminator}</h2>
      <p>ID: ${user.id}</p>
    </section>` : `<p>No hay usuario autenticado</p>`;

  const datosUsuario = economiaData.find(u => u.id === userId) || {};
  const balance = datosUsuario.balance || 0;
  const ingresos = datosUsuario.ingresos || 0;
  const gastos = datosUsuario.gastos || 0;

  const economiaHTML = `
    <section>
      <h2>💰 Economía</h2>
      <p>Balance: $${balance.toLocaleString()}</p>
      <p>Ingresos: $${ingresos.toLocaleString()}</p>
      <p>Gastos: $${gastos.toLocaleString()}</p>
    </section>
  `;

  // Niveles locales
  const datosNivel = nivelesData.niveles?.[userId] || {};
  const nivel = datosNivel.nivel || 0;
  const xp = datosNivel.xp || 0;
  const xpSiguiente = 1000 + nivel * 500;
  const progreso = Math.min(100, Math.floor((xp / xpSiguiente) * 100));
  const barra = '▭'.repeat(Math.floor(progreso / 5)).padEnd(20, '▭');

  const nivelesHTML = `
    <section>
      <h2>📈 Nivel</h2>
      <p>Nivel: ${nivel}</p>
      <p>XP: ${xp} / ${xpSiguiente}</p>
      <p>${barra} (${progreso}%)</p>
    </section>
  `;

  // Última actualización
  const stats = fs.statSync(economiaPath);
  const ultimaActualizacion = new Date(stats.mtime);
  const actualizacionHTML = `
    <section>
      <h2>🔄 Última actualización</h2>
      <p>${ultimaActualizacion.toLocaleString()}</p>
    </section>
  `;

  // Render final
  res.send(`
    <html>
      <head>
        <title>Abyssus Dashboard</title>
        <style>
          body { font-family:sans-serif; background:#0a0a0a; color:#eee; }
          section { padding:15px; border:1px solid #444; margin:10px; border-radius:8px; }
        </style>
      </head>
      <body>
        <h1>🔐 Abyssus Dashboard</h1>
        ${perfilHTML}
        ${economiaHTML}
        ${nivelesHTML}
        ${actualizacionHTML}
      </body>
    </html>
  `);
});

// Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔐 Dashboard activo en puerto ${PORT}`));

































