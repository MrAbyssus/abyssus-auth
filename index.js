require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();

// Rutas de datos
const economiaPath = path.join(__dirname, 'Usuario.json');
const nivelesPath = path.join(__dirname, 'nivelesData.json');

function cargarJSON(ruta) {
  try {
    if (!fs.existsSync(ruta)) return [];
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch {
    return [];
  }
}

// Archivos públicos
app.use(express.static(path.join(__dirname, 'public')));

// OAuth2 Callback
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('<h2>❌ Código OAuth2 no recibido</h2>');

  try {
    const tokenRes = await axios.post(
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

    const accessToken = tokenRes.data.access_token;
    res.redirect(`/?token=${accessToken}`);
  } catch (err) {
    const msg = err.response?.data?.error_description || err.message;
    res.send(`<h2>❌ Error OAuth2</h2><p>${msg}</p>`);
  }
});

// Dashboard
app.get('/', async (req, res) => {
  const token = req.query.token;
  let user = null;
  let userId = '';

  if (token) {
    try {
      const userRes = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      user = userRes.data;
      userId = user.id;
    } catch {
      return res.send('<h2>❌ Token inválido</h2>');
    }
  }

  const economiaData = cargarJSON(economiaPath);
  const nivelesData = cargarJSON(nivelesPath);

  // HTML dinámico
  const balance = (economiaData.find(u => u.id === userId)?.balance || 0).toLocaleString();
  const ingresos = (economiaData.find(u => u.id === userId)?.ingresos || 0).toLocaleString();
  const gastos = (economiaData.find(u => u.id === userId)?.gastos || 0).toLocaleString();

  const nivelData = nivelesData.niveles?.[userId] || {};
  const nivel = nivelData.nivel || 0;
  const xp = nivelData.xp || 0;
  const xpSiguiente = 1000 + nivel * 500;
  const progreso = Math.min(100, Math.floor((xp / xpSiguiente) * 100));

  const ultimaActualizacion = new Date(fs.statSync(economiaPath).mtime).toLocaleString();

  res.send(`
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <title>Abyssus Dashboard</title>
    <style>
      body { font-family: 'Segoe UI', sans-serif; background:#111; color:#eee; margin:0; }
      header { background:#23272a; padding:20px; text-align:center; }
      h1 { margin:0; color:#00ff88; }
      main { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:20px; padding:20px; }
      section { background:#1c1c1c; padding:20px; border-radius:12px; transition: transform 0.3s; }
      section:hover { transform: translateY(-5px); }
      .bar-container { background:#333; border-radius:10px; overflow:hidden; height:20px; margin-top:5px; }
      .bar { background:#00ff88; height:100%; width:${progreso}%; transition: width 0.5s; }
      footer { text-align:center; padding:15px; color:#777; background:#222; }
      img.avatar { border-radius:50%; width:100px; height:100px; }
    </style>
  </head>
  <body>
    <header>
      <h1>🔐 Abyssus Dashboard</h1>
      <p>Usuario autenticado: ${user ? user.username+'#'+user.discriminator : 'N/A'}</p>
    </header>
    <main>
      <section>
        <h2>👤 Perfil</h2>
        ${user ? `<img class="avatar" src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" alt="Avatar">` : '<p>No autenticado</p>'}
        <p>ID: ${userId}</p>
      </section>

      <section>
        <h2>💰 Economía</h2>
        <p>Balance: $${balance}</p>
        <p>Ingresos: $${ingresos}</p>
        <p>Gastos: $${gastos}</p>
      </section>

      <section>
        <h2>📈 Nivel</h2>
        <p>Nivel: ${nivel}</p>
        <p>XP: ${xp} / ${xpSiguiente}</p>
        <div class="bar-container"><div class="bar"></div></div>
        <p>Progreso: ${progreso}%</p>
      </section>

      <section>
        <h2>🔄 Última actualización</h2>
        <p>${ultimaActualizacion}</p>
      </section>
    </main>

    <footer>
      Abyssus Bot Dashboard
    </footer>

    <script>
      // Actualiza la barra de progreso automáticamente cada 5s
      setInterval(() => {
        fetch(window.location.href)
          .then(res => res.text())
          .then(html => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const nuevaBarra = doc.querySelector('.bar').style.width;
            document.querySelector('.bar').style.width = nuevaBarra;
          });
      }, 5000);
    </script>
  </body>
  </html>
  `);
});

// Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔐 Dashboard activo en puerto ${PORT}`));


































