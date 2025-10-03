require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();

// Archivos JSON
const economiaPath = path.join(__dirname, 'Usuario.json');
const nivelesPath = path.join(__dirname, 'nivelesData.json');
const modlogPath = path.join(__dirname, 'modlogs.json');

// Función segura para leer JSON
function cargarJSON(ruta) {
  try {
    if (!fs.existsSync(ruta)) return {};
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch {
    return {};
  }
}

// Archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint para obtener datos dinámicos
app.get('/api/datos/:userId', async (req, res) => {
  const userId = req.params.userId;
  const economiaData = cargarJSON(economiaPath);
  const nivelesData = cargarJSON(nivelesPath);
  const modlogData = cargarJSON(modlogPath);

  // Datos de economía
  const datosUsuario = economiaData.find(u => u.id === userId) || {};
  const balance = datosUsuario.balance || 0;
  const ingresos = datosUsuario.ingresos || 0;
  const gastos = datosUsuario.gastos || 0;
  const eventos = (modlogData[userId] || []).slice(-5).reverse();

  // Datos de niveles
  const datosNivel = nivelesData.niveles?.[userId] || {};
  const nivel = datosNivel.nivel || 0;
  const xp = datosNivel.xp || 0;
  const xpSiguiente = 1000 + nivel * 500;

  // Recompensas según balance
  const recompensas = [];
  if (balance >= 1000) recompensas.push('Blindaje semántico');
  if (balance >= 5000) recompensas.push('Heurística institucional');
  if (balance >= 10000) recompensas.push('OAuth2 sincronizado');

  // Datos de Discord si hay token
  let discordUser = null;
  if (req.query.token) {
    try {
      const resp = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${req.query.token}` }
      });
      discordUser = resp.data;
    } catch {}
  }

  res.json({ balance, ingresos, gastos, eventos, nivel, xp, xpSiguiente, recompensas, discordUser });
});

// Ruta principal
app.get('/', (req, res) => {
  const userId = req.query.userId || '';
  const token = req.query.token || '';
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Dashboard Abyssus</title>
<style>
body { font-family:'Segoe UI', sans-serif; background:#0a0a0a; color:#e0e0e0; margin:0; padding:0; }
header { background:#23272a; padding:25px; text-align:center; border-bottom:1px solid #2c2f33; }
header h1 { font-size:30px; margin:0; color:#00ff88; }
main { max-width:1200px; margin:40px auto; display:grid; grid-template-columns: repeat(auto-fit,minmax(300px,1fr)); gap:30px; }
.card { background:#1c1c1c; padding:20px; border-radius:12px; box-shadow:0 0 10px rgba(0,0,0,0.5); }
h2 { margin-top:0; color:#00ff88; }
.progress-container { background:#333; border-radius:10px; height:20px; overflow:hidden; margin-top:5px; }
.progress-bar { height:100%; border-radius:10px; transition: width 0.5s; }
footer { text-align:center; padding:25px; color:#777; border-top:1px solid #222; }
ul { padding-left:20px; }
img.avatar { border-radius:50%; width:100px; height:100px; }
</style>
</head>
<body>
<header>
<h1>🔐 Abyssus · Dashboard</h1>
<p>🟢 Servidor activo · módulos conectados</p>
</header>
<main>
<div class="card">
<h2>👤 Perfil Discord</h2>
<img id="avatar" class="avatar" src="" />
<p id="username">Usuario: -</p>
<p id="userId">ID: -</p>
<p id="estado">Estado: -</p>
</div>
<div class="card">
<h2>💰 Economía</h2>
<p>Balance: <strong id="balance">0</strong></p>
<p>Ingresos: <strong id="ingresos">0</strong></p>
<p>Gastos: <strong id="gastos">0</strong></p>
<h3>🎁 Recompensas</h3>
<ul id="recompensas"></ul>
</div>
<div class="card">
<h2>📈 Nivel</h2>
<p>Nivel: <strong id="nivel">0</strong></p>
<p>XP: <strong id="xp">0 / 0</strong></p>
<div class="progress-container">
<div class="progress-bar" id="xpBar" style="width:0%; background:#33ff88;"></div>
</div>
<p id="progreso">0%</p>
</div>
<div class="card">
<h2>📜 Eventos recientes</h2>
<ul id="eventos"></ul>
</div>
</main>
<footer>Sistema Abyssus · Renderizado local</footer>

<script>
async function actualizarDatos() {
  try {
    const userId = "${userId}";
    if (!userId) return;
    const resp = await fetch('/api/datos/' + userId + '?token=${token}');
    const data = await resp.json();

    // Perfil Discord
    if(data.discordUser){
      document.getElementById('avatar').src = 'https://cdn.discordapp.com/avatars/' + data.discordUser.id + '/' + data.discordUser.avatar + '.png';
      document.getElementById('username').textContent = data.discordUser.username + '#' + data.discordUser.discriminator;
      document.getElementById('userId').textContent = 'ID: ' + data.discordUser.id;
      document.getElementById('estado').textContent = data.discordUser.verified ? '✅ Verificado' : '❌ No verificado';
    }

    // Economía
    document.getElementById('balance').textContent = "$" + data.balance.toLocaleString();
    document.getElementById('ingresos').textContent = "$" + data.ingresos.toLocaleString();
    document.getElementById('gastos').textContent = "$" + data.gastos.toLocaleString();
    document.getElementById('recompensas').innerHTML = data.recompensas.length ? data.recompensas.map(r=>'<li>'+r+'</li>').join('') : '<li>No hay recompensas</li>';

    // Niveles
    document.getElementById('nivel').textContent = data.nivel;
    document.getElementById('xp').textContent = data.xp + ' / ' + data.xpSiguiente;
    const progreso = Math.min(100, Math.floor((data.xp / data.xpSiguiente)*100));
    document.getElementById('progreso').textContent = progreso + '%';
    const barra = document.getElementById('xpBar');
    barra.style.width = progreso + '%';
    barra.style.background = progreso < 50 ? '#ff5555' : progreso < 80 ? '#ffbb33' : '#33ff88';

    // Eventos recientes
    document.getElementById('eventos').innerHTML = data.eventos.length ? data.eventos.map(e=>'<li>'+e.action+' - '+e.reason+'</li>').join('') : '<li>No hay eventos</li>';

  } catch(err){ console.error(err); }
}

// Actualizar cada 5 segundos
actualizarDatos();
setInterval(actualizarDatos, 5000);
</script>
</body>
</html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dashboard activo en puerto ${PORT}`));









































