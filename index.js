require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();

// Rutas JSON
const economiaPath = path.join(__dirname, 'Usuario.json');
const modlogPath = path.join(__dirname, 'modlogs.json');
const mascotasPath = path.join(__dirname, 'mascotas.json');
const nivelesPath = path.join(__dirname, 'nivelesData.json');

// Función segura para leer JSON
function cargarJSON(ruta) {
  try {
    if (!fs.existsSync(ruta)) return {};
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch {
    return {};
  }
}

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Ruta de activación
app.get('/activar', (req, res) => res.send('🟢 Dashboard activo'));

// Callback OAuth2
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
        redirect_uri: process.env.REDIRECT_URI
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResp.data.access_token;
    res.redirect(`/?token=${accessToken}`);
  } catch (err) {
    res.send(`❌ Error OAuth2: ${err.response?.data?.error || err.message}`);
  }
});

// Ruta principal
app.get('/', async (req, res) => {
  const token = req.query.token || '';
  let user = null;
  let userId = '';

  if (token.length > 10) {
    try {
      const userResp = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      user = userResp.data;
      userId = user.id;
    } catch {
      user = null;
    }
  }

  // Cargar datos locales
  const economiaData = cargarJSON(economiaPath);
  const nivelesData = cargarJSON(nivelesPath);
  const modlogData = cargarJSON(modlogPath);

  const datosUsuario = economiaData.find(u => u.id === userId) || {};
  const datosNivel = nivelesData.niveles?.[userId] || {};
  const balance = datosUsuario.balance || 0;
  const ingresos = datosUsuario.ingresos || 0;
  const gastos = datosUsuario.gastos || 0;
  const eventos = datosUsuario.eventos || [];
  const nivel = datosNivel.nivel || 0;
  const xp = datosNivel.xp || 0;
  const xpSiguiente = 1000 + nivel * 500;
  const progreso = Math.min(100, Math.floor((xp / xpSiguiente) * 100));
  const barra = '▭'.repeat(Math.floor(progreso / 5)).padEnd(20, '▭');

  const recompensas = [];
  if (balance >= 1000) recompensas.push('Blindaje semántico');
  if (balance >= 5000) recompensas.push('Heurística institucional');
  if (balance >= 10000) recompensas.push('OAuth2 sincronizado');

  // Última actualización
  const stats = fs.existsSync(economiaPath) ? fs.statSync(economiaPath) : new Date();
  const ultimaActualizacion = new Date(stats.mtime || Date.now());
  const ahora = new Date();
  const diferenciaDias = Math.floor((ahora - ultimaActualizacion) / (1000 * 60 * 60 * 24));
  const actualizado = diferenciaDias <= 2;

  // HTML
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Abyssus Dashboard</title>
<style>
body { font-family: 'Segoe UI', sans-serif; background:#0a0a0a; color:#e0e0e0; margin:0; }
header { background:#23272a; padding:20px; text-align:center; border-bottom:1px solid #2c2f33; }
main { max-width:1100px; margin:40px auto; display:grid; grid-template-columns:1fr 1fr; gap:30px; }
section { background:#1c1c1c; padding:20px; border-radius:10px; }
h2 { color:#00ff88; }
footer { text-align:center; padding:20px; color:#777; border-top:1px solid #222; }
.progress { font-family: monospace; color:#00ff88; }
</style>
</head>
<body>
<header>
<h1>🔐 Abyssus · Dashboard</h1>
<p>🟢 Servidor activo · módulos conectados</p>
</header>
<main>
<section>
<h2>👤 Perfil Discord</h2>
${user ? `
<p><strong>${user.username}#${user.discriminator}</strong></p>
<p>ID: ${user.id}</p>
` : '<p>No autenticado</p>'}
</section>

<section>
<h2>💰 Economía</h2>
<p>Balance: <strong>$${balance.toLocaleString()}</strong></p>
<p>Ingresos: <strong>$${ingresos.toLocaleString()}</strong></p>
<p>Gastos: <strong>$${gastos.toLocaleString()}</strong></p>
<p>Eventos: <strong>${eventos.length}</strong></p>
</section>

<section>
<h2>📈 Nivel</h2>
<p>Nivel: <strong>${nivel}</strong></p>
<p>XP: <strong>${xp} / ${xpSiguiente}</strong></p>
<p class="progress">${barra} (${progreso}%)</p>
</section>

<section>
<h2>🎁 Recompensas</h2>
${recompensas.length ? `<ul>${recompensas.map(r => `<li>${r}</li>`).join('')}</ul>` : '<p>No hay recompensas</p>'}
</section>

<section>
<h2>📜 Modlogs recientes</h2>
<ul>${(modlogData[userId] || []).slice(-5).reverse().map(e => `<li>${e.action} - ${e.reason}</li>`).join('')}</ul>
</section>

<section>
<h2>🟢 Última actualización</h2>
<p>${actualizado ? 'Actualizado recientemente' : `Desactualizado (${diferenciaDias} días)`}</p>
</section>
</main>
<footer>Sistema Abyssus · Renderizado local</footer>
</body>
</html>
  `);
});

// Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dashboard activo en puerto ${PORT}`));












































