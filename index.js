require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();

// Rutas de archivos JSON
const economiaPath = path.join(__dirname, 'Usuario.json');
const modlogPath = path.join(__dirname, 'modlogs.json');
const nivelesPath = path.join(__dirname, 'nivelesData.json');

// Función para cargar JSON
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

// ================== CALLBACK ==================
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code || typeof code !== 'string' || code.length < 10) return res.send('<h2>❌ Código OAuth2 no recibido</h2>');

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
app.get('/api/economia/:userId', (req, res) => {
  const datos = economiaData.find(u => u.id === req.params.userId) || {};
  res.json(datos);
});

app.get('/api/niveles/:userId', (req, res) => {
  const datos = nivelesData.niveles?.[req.params.userId] || {};
  res.json(datos);
});

app.get('/api/modlogs/:userId', (req, res) => {
  const eventos = [];
  for (const gId in modlogData) {
    const logs = modlogData[gId]?.[req.params.userId];
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
    } catch {}
  }

  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Abyssus Dashboard</title>
<style>
body { font-family:'Segoe UI', sans-serif; background:#0f0f0f; color:#e0e0e0; margin:0; }
header { background:#1b1b1b; padding:20px; text-align:center; border-bottom:2px solid #333; }
header h1 { margin:0; font-size:28px; color:#00ff88; text-shadow: 0 0 5px #00ff88; }
main { max-width:1200px; margin:40px auto; display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:20px; }
.card { background:#1e1e1e; padding:20px; border-radius:12px; box-shadow:0 0 20px rgba(0,255,136,0.2); transition:transform 0.3s; }
.card:hover { transform: translateY(-5px); }
.card h2 { margin-top:0; color:#00ff88; text-shadow: 0 0 3px #00ff88; }
.bar { background:#333; width:100%; height:20px; border-radius:10px; overflow:hidden; margin-top:5px; }
.bar-fill { height:100%; width:0%; background:linear-gradient(90deg,#00ff88,#00ffff); transition:width 0.5s ease; }
ul { list-style:none; padding-left:0; max-height:250px; overflow-y:auto; }
ul li { padding:5px 0; border-bottom:1px solid #333; }
.badge { display:inline-block; padding:5px 10px; margin:3px; border-radius:8px; background:#222; color:#00ff88; font-weight:bold; text-shadow:0 0 2px #00ff88; }
.badge.locked { color:#888; text-shadow:none; background:#111; }
</style>
</head>
<body>

<header>
<h1>🔐 Abyssus · Dashboard</h1>
<p>🟢 Servidor activo · módulos conectados</p>
</header>

<main>
<!-- Perfil -->
<div class="card">
<h2>👤 Perfil Discord</h2>
${user ? `<img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" style="border-radius:50%; width:80px; height:80px;" />
<p><strong>${user.username}#${user.discriminator}</strong></p>
<p>ID: ${user.id}</p>
<p>Estado: <span style="color:#00ff88;">Verificado</span></p>` : `<p>No conectado</p>`}
</div>

<!-- Economía -->
<div class="card">
<h2>💰 Economía</h2>
<p>Balance: <strong id="balance">0</strong></p>
<p>Ingresos: <strong id="ingresos">0</strong></p>
<p>Gastos: <strong id="gastos">0</strong></p>
<div id="recompensas">
<h3>🏅 Recompensas</h3>
<span class="badge locked">Blindaje semántico</span>
<span class="badge locked">Heurística institucional</span>
<span class="badge locked">OAuth2 sincronizado</span>
</div>
</div>

<!-- Niveles -->
<div class="card">
<h2>📈 Nivel</h2>
<p>Nivel: <strong id="nivel">0</strong></p>
<p>XP: <strong id="xp">0 / 0</strong></p>
<div class="bar"><div id="barra" class="bar-fill"></div></div>
</div>

<!-- Modlogs -->
<div class="card">
<h2>📜 Modlogs recientes</h2>
<ul id="modlogs"><li>No hay eventos</li></ul>
</div>
</main>

<script>
const userId = "${userId}";

async function actualizar() {
  if(!userId) return;
  try {
    const econ = await (await fetch('/api/economia/' + userId)).json();
    document.getElementById('balance').innerText = "$" + (econ.balance || 0).toLocaleString();
    document.getElementById('ingresos').innerText = "$" + (econ.ingresos || 0).toLocaleString();
    document.getElementById('gastos').innerText = "$" + (econ.gastos || 0).toLocaleString();

    // Recompensas
    const badges = document.querySelectorAll('#recompensas .badge');
    badges.forEach(b => b.classList.add('locked'));
    if(econ.balance >= 1000) badges[0].classList.remove('locked');
    if(econ.balance >= 5000) badges[1].classList.remove('locked');
    if(econ.balance >= 10000) badges[2].classList.remove('locked');

    const nivel = await (await fetch('/api/niveles/' + userId)).json();
    const xpSiguiente = 1000 + (nivel.nivel || 0)*500;
    const progreso = Math.min(100, Math.floor((nivel.xp || 0)/xpSiguiente*100));
    document.getElementById('nivel').innerText = nivel.nivel || 0;
    document.getElementById('xp').innerText = (nivel.xp || 0) + " / " + xpSiguiente;
    document.getElementById('barra').style.width = progreso + "%";

    const logs = await (await fetch('/api/modlogs/' + userId)).json();
    document.getElementById('modlogs').innerHTML = logs.slice(-10).reverse().map(e => 
      "<li><strong>"+e.action+"</strong> · "+e.reason+"<br><span style='color:#888;'>"+new Date(e.timestamp).toLocaleString()+"</span></li>"
    ).join('') || "<li>No hay eventos</li>";

  } catch(err){ console.error(err); }
}

setInterval(actualizar,5000);
actualizar();
</script>

</body>
</html>
  `);
});

// ================== PUERTO ==================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔐 Abyssus Run activo en Render · Puerto ${PORT}`));





































