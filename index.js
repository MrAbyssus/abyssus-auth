require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();

// Rutas absolutas
const economiaPath = path.join(__dirname, 'Usuario.json');
const modlogPath = path.join(__dirname, 'modlogs.json');
const nivelesPath = path.join(__dirname, 'nivelesData.json');

// Función para cargar JSON de manera segura
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

const economiaData = cargarJSON(economiaPath, 'Economía');
const modlogData = cargarJSON(modlogPath, 'Modlogs');
const nivelesData = cargarJSON(nivelesPath, 'Niveles');

app.use(express.static(path.join(__dirname, 'public')));

// ================== CALLBACK OAuth2 ==================
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code || typeof code !== 'string' || code.length < 10) {
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
    res.redirect(`/?token=${accessToken}`);
  } catch (err) {
    const msg = err.response?.data?.error_description || err.message;
    res.send(`<h2>❌ Error OAuth2:</h2><p>${msg}</p>`);
  }
});

// ================== API INTERNA ==================

// Economía
app.get('/api/economia/:userId', (req, res) => {
  const userId = req.params.userId;
  const datos = economiaData.find(u => u.id === userId) || {};
  res.json(datos);
});

// Niveles
app.get('/api/niveles/:userId', (req, res) => {
  const userId = req.params.userId;
  const datos = nivelesData.niveles?.[userId] || {};
  res.json(datos);
});

// Modlogs
app.get('/api/modlogs/:userId', (req, res) => {
  const userId = req.params.userId;
  const eventos = [];
  for (const gId in modlogData) {
    const logs = modlogData[gId]?.[userId];
    if (Array.isArray(logs)) eventos.push(...logs);
  }
  res.json(eventos);
});

// ================== DASHBOARD ==================
app.get('/', async (req, res) => {
  const token = req.query.token;
  let userId = '';
  let user = null;

  if (token && token.length > 10) {
    try {
      const userResp = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      user = userResp.data;
      userId = user.id;
    } catch {
      user = null;
    }
  }

  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Abyssus Dashboard</title>
<style>
body { font-family:'Segoe UI', sans-serif; background:#0a0a0a; color:#e0e0e0; margin:0; padding:0; }
header { padding:25px 20px; text-align:center; background:#23272a; border-bottom:1px solid #2c2f33; }
section { max-width:1100px; margin:50px auto; display:grid; grid-template-columns:1fr 1fr; gap:40px; }
footer { text-align:center; padding:30px; color:#777; font-size:13px; border-top:1px solid #222; }
.bar { background:#555; width:100%; height:20px; border-radius:5px; }
.bar-fill { background:#0f0; height:100%; width:0%; border-radius:5px; }
ul { list-style:none; padding:0; }
</style>
</head>
<body>
<header>
<h1>🔐 Abyssus · Dashboard</h1>
<p>🟢 Servidor activo · módulos conectados</p>
</header>

<section>
<!-- Perfil -->
<section>
<h2>👤 Perfil Discord</h2>
${user ? `
<img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" style="border-radius:50%; width:100px; height:100px;" />
<p><strong>${user.username}#${user.discriminator}</strong></p>
<p>ID: ${user.id}</p>
<p>Estado: <span style="color:#00ff88;">Verificado</span></p>` : `<p>Usuario no conectado</p>`}
</section>

<!-- Economía -->
<section>
<h2>💰 Economía</h2>
<p>Balance: <strong id="balance">0</strong></p>
<p>Ingresos: <strong id="ingresos">0</strong></p>
<p>Gastos: <strong id="gastos">0</strong></p>
</section>

<!-- Niveles -->
<section>
<h2>📈 Nivel actual</h2>
<p>Nivel: <strong id="nivel">0</strong></p>
<p>XP: <strong id="xp">0 / 0</strong></p>
<div class="bar"><div id="barra" class="bar-fill"></div></div>
</section>

<!-- Modlogs -->
<section>
<h2>📜 Modlogs recientes</h2>
<ul id="modlogs"><li>No hay eventos registrados</li></ul>
</section>
</section>

<footer>Sistema Abyssus · render institucional proyectado</footer>

<script>
const userId = "${userId}";

async function actualizarDatos() {
  if(!userId) return;

  try {
    // Economía
    const econ = await (await fetch('/api/economia/' + userId)).json();
    document.getElementById('balance').innerText = "$" + (econ.balance || 0).toLocaleString();
    document.getElementById('ingresos').innerText = "$" + (econ.ingresos || 0).toLocaleString();
    document.getElementById('gastos').innerText = "$" + (econ.gastos || 0).toLocaleString();

    // Niveles
    const nivel = await (await fetch('/api/niveles/' + userId)).json();
    const xpSiguiente = 1000 + (nivel.nivel || 0) * 500;
    const progreso = Math.min(100, Math.floor((nivel.xp || 0) / xpSiguiente * 100));
    document.getElementById('nivel').innerText = nivel.nivel || 0;
    document.getElementById('xp').innerText = (nivel.xp || 0) + " / " + xpSiguiente;
    document.getElementById('barra').style.width = progreso + "%";

    // Modlogs
    const logs = await (await fetch('/api/modlogs/' + userId)).json();
    document.getElementById('modlogs').innerHTML = logs.slice(-10).reverse().map(e => 
      "<li><strong>" + e.action + "</strong> · " + e.reason + "<br><span style='color:#888;'>" + new Date(e.timestamp).toLocaleString() + "</span></li>"
    ).join('') || "<li>No hay eventos registrados</li>";

  } catch(err) {
    console.error("Error actualizando datos:", err);
  }
}

setInterval(actualizarDatos, 5000);
actualizarDatos();
</script>

</body>
</html>
  `);
});

// ================== PUERTO ==================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔐 Abyssus Run activo en Render · Puerto ${PORT}`));



































