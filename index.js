require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();

// Rutas absolutas a JSON
const economiaPath = path.join(__dirname, 'Usuario.json');
const nivelesPath = path.join(__dirname, 'nivelesData.json');
const modlogPath = path.join(__dirname, 'modlogs.json');

// Función para cargar JSON
function cargarJSON(ruta, nombre = 'archivo') {
  try {
    if (!fs.existsSync(ruta)) return {};
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (err) {
    console.error(`❌ Error leyendo ${nombre}: ${err.message}`);
    return {};
  }
}

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Página principal
app.get('/', async (req, res) => {
  const token = req.query.token;
  let user = null;
  let userId = '';

  let perfilHTML = '', economiaHTML = '', recompensasHTML = '', nivelesHTML = '', modlogHTML = '', actualizacionHTML = '';

  if (!token) {
    return res.send(`
      <h1>🔐 Abyssus Dashboard</h1>
      <a href="https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify">
        <button style="padding:10px 20px; font-size:16px;">Login con Discord</button>
      </a>
    `);
  }

  try {
    const userResp = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    user = userResp.data;
    userId = user.id;

    // Perfil
    perfilHTML = `
      <h2>👤 ${user.username}#${user.discriminator}</h2>
      <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" width="100"/>
      <p>ID: ${user.id}</p>
    `;

    // Economía
    const economiaData = cargarJSON(economiaPath, 'Economía');
    const datosUsuario = economiaData.find(u => u.id === userId) || {};
    const balance = datosUsuario.balance || 0;
    const ingresos = datosUsuario.ingresos || 0;
    const gastos = datosUsuario.gastos || 0;

    economiaHTML = `
      <h2>💰 Economía</h2>
      <p>Balance: $${balance.toLocaleString()}</p>
      <p>Ingresos: $${ingresos.toLocaleString()}</p>
      <p>Gastos: $${gastos.toLocaleString()}</p>
    `;

    // Recompensas
    const recompensas = [];
    if (balance >= 1000) recompensas.push('Blindaje semántico');
    if (balance >= 5000) recompensas.push('Heurística institucional');
    if (balance >= 10000) recompensas.push('OAuth2 sincronizado');
    recompensasHTML = `
      <h2>🎁 Recompensas</h2>
      ${recompensas.length ? '<ul>' + recompensas.map(r => `<li>${r}</li>`).join('') + '</ul>' : '<p>No hay recompensas</p>'}
    `;

    // Niveles
    const nivelesData = cargarJSON(nivelesPath, 'Niveles');
    const datosNivel = nivelesData.niveles?.[userId] || {};
    const nivel = datosNivel.nivel || 0;
    const xp = datosNivel.xp || 0;
    const xpSiguiente = 1000 + (nivel * 500);
    const progreso = Math.min(100, Math.floor((xp / xpSiguiente) * 100));
    const barra = '▭'.repeat(Math.floor(progreso / 5)).padEnd(20, '▭');
    nivelesHTML = `
      <h2>📈 Nivel</h2>
      <p>Nivel: ${nivel}</p>
      <p>XP: ${xp} / ${xpSiguiente}</p>
      <p>Progreso: ${barra} (${progreso}%)</p>
    `;

    // Modlogs
    const modlogData = cargarJSON(modlogPath, 'Modlogs');
    let eventos = [];
    for (const gId in modlogData) {
      const logs = modlogData[gId]?.[userId];
      if (Array.isArray(logs)) eventos.push(...logs);
    }
    modlogHTML = `
      <h2>📜 Modlogs</h2>
      ${eventos.length ? '<ul>' + eventos.slice(-10).reverse().map(e => `<li>${e.action} · ${e.reason} (${new Date(e.timestamp).toLocaleString()})</li>`).join('') + '</ul>' : '<p>No hay eventos</p>'}
    `;

    // Última actualización
    const stats = fs.statSync(economiaPath);
    const ultimaActualizacion = new Date(stats.mtime).toLocaleString();
    actualizacionHTML = `<p>Última actualización de datos: ${ultimaActualizacion}</p>`;

    // Render final
    res.send(`
      <h1>🔐 Abyssus Dashboard</h1>
      ${perfilHTML}
      ${economiaHTML}
      ${recompensasHTML}
      ${nivelesHTML}
      ${modlogHTML}
      ${actualizacionHTML}
      <a href="/">🔙 Cerrar sesión</a>
    `);

  } catch (err) {
    res.send(`<p>❌ Error al obtener datos del usuario: ${err.response?.data?.message || err.message}</p>`);
  }
});

// Callback
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






























