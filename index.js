require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();

// Rutas absolutas de los JSON
const economiaPath = path.join(__dirname, 'Usuario.json');
const modlogPath = path.join(__dirname, 'modlogs.json');
const nivelesPath = path.join(__dirname, 'nivelesData.json');

// Función segura para cargar JSON
function cargarJSON(ruta, nombre = 'archivo') {
  try {
    if (!fs.existsSync(ruta)) {
      console.warn(`⚠️ ${nombre} no existe en ${ruta}`);
      return [];
    }
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (err) {
    console.error(`❌ Error leyendo ${nombre}:`, err.message);
    return [];
  }
}

// Cargar datos locales
const economiaData = cargarJSON(economiaPath, 'Economía');
const modlogData = cargarJSON(modlogPath, 'Modlogs');
const nivelesData = cargarJSON(nivelesPath, 'Niveles');

app.use(express.static(path.join(__dirname, 'public')));

// Ruta de activación
app.get('/activar', (req, res) => res.send('🟢 Render activado · entorno despierto'));

// Callback OAuth2
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code || code.length < 10) {
    return res.status(400).send('❌ Código OAuth2 no recibido o inválido');
  }

  const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = process.env;
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return res.status(500).send('❌ Configuración OAuth2 incompleta');
  }

  try {
    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI.trim(),
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResponse.data.access_token;
    res.redirect(`/?token=${accessToken}`);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(400).send('❌ Error al obtener token OAuth2');
  }
});

// Dashboard principal
app.get('/', async (req, res) => {
  const token = req.query.token;
  let user = null;
  let userId = '';

  let perfilHTML = '', economiaHTML = '', recompensasHTML = '', nivelesHTML = '', modlogHTML = '', actualizacionHTML = '';

  // Obtener datos del usuario desde Discord
  if (token) {
    try {
      const userResp = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      user = userResp.data;
      userId = user.id;

      perfilHTML = `
        <div class="card">
          <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" class="avatar"/>
          <h2>${user.username}#${user.discriminator}</h2>
          <p>ID: ${user.id}</p>
        </div>
      `;
    } catch (err) {
      perfilHTML = `<div class="card error">❌ No se pudo obtener perfil: ${err.message}</div>`;
    }
  }

  // Economía
  if (userId) {
    const datos = economiaData.find(u => u.id === userId) || {};
    const balance = datos.balance || 0;
    const ingresos = datos.ingresos || 0;
    const gastos = datos.gastos || 0;

    economiaHTML = `
      <div class="card">
        <h2>💰 Economía</h2>
        <p>Balance: $${balance.toLocaleString()}</p>
        <p>Ingresos: $${ingresos.toLocaleString()}</p>
        <p>Gastos: $${gastos.toLocaleString()}</p>
      </div>
    `;

    // Recompensas
    const recompensas = [];
    if (balance >= 1000) recompensas.push('Blindaje semántico');
    if (balance >= 5000) recompensas.push('Heurística institucional');
    if (balance >= 10000) recompensas.push('OAuth2 sincronizado');

    recompensasHTML = `
      <div class="card">
        <h2>🎁 Recompensas</h2>
        ${recompensas.length ? `<ul>${recompensas.map(r => `<li>${r}</li>`).join('')}</ul>` : '<p>No hay recompensas</p>'}
      </div>
    `;
  }

  // Niveles
  if (userId) {
    const datosNivel = nivelesData.niveles?.[userId] || {};
    const nivel = datosNivel.nivel || 0;
    const xp = datosNivel.xp || 0;
    const xpNext = 1000 + nivel * 500;
    const progreso = Math.min(100, Math.floor((xp / xpNext) * 100));
    const barra = '▭'.repeat(Math.floor(progreso / 5)).padEnd(20, '▭');

    nivelesHTML = `
      <div class="card">
        <h2>📈 Nivel</h2>
        <p>Nivel: ${nivel}</p>
        <p>XP: ${xp} / ${xpNext}</p>
        <p>Progreso: <span class="barra">${barra}</span> (${progreso}%)</p>
      </div>
    `;
  }

  // Modlogs
  if (userId) {
    let eventos = [];
    for (const gId in modlogData) {
      const logs = modlogData[gId]?.[userId];
      if (Array.isArray(logs)) eventos.push(...logs);
    }
    const recientes = eventos.slice(-10).reverse();

    modlogHTML = `
      <div class="card">
        <h2>📜 Modlogs</h2>
        ${recientes.length ? `<ul>${recientes.map(e => `<li>${e.action} - ${e.reason} (${new Date(e.timestamp).toLocaleString()})</li>`).join('')}</ul>` : '<p>No hay registros</p>'}
      </div>
    `;
  }

  // Última actualización
  try {
    const stats = fs.statSync(economiaPath);
    const lastUpdate = new Date(stats.mtime);
    actualizacionHTML = `
      <div class="card">
        <h2>🕒 Última actualización</h2>
        <p>${lastUpdate.toLocaleString('es-MX')}</p>
      </div>
    `;
  } catch { actualizacionHTML = ''; }

  // Render HTML completo
  res.send(`
    <html>
    <head>
      <title>Abyssus Dashboard</title>
      <style>
        body { background:#0a0a0a; color:#eee; font-family:sans-serif; margin:0; padding:20px;}
        .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:20px;}
        .card { background:#23272a; padding:20px; border-radius:10px; }
        .avatar { width:80px; height:80px; border-radius:50%; }
        .barra { font-family:monospace; }
        ul { padding-left:20px; }
        .error { color:#ff5555; }
      </style>
    </head>
    <body>
      <h1>Abyssus Dashboard</h1>
      <div class="grid">
        ${perfilHTML}
        ${economiaHTML}
        ${recompensasHTML}
        ${nivelesHTML}
        ${modlogHTML}
        ${actualizacionHTML}
      </div>
    </body>
    </html>
  `);
});

// Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dashboard activo en puerto ${PORT}`));










































