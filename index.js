require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();

// Archivos JSON
const economiaPath = path.join(__dirname, 'Usuario.json');
const modlogPath = path.join(__dirname, 'modlogs.json');
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

// Ruta principal
app.get('/', async (req, res) => {
  const token = req.query.token || '';
  let user = null, userId = '';

  if (token.length > 10) {
    try {
      const userResp = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      user = userResp.data;
      userId = user.id;
    } catch {}
  }

  // Datos locales
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

  const recompensas = [];
  if (balance >= 1000) recompensas.push('Blindaje semántico');
  if (balance >= 5000) recompensas.push('Heurística institucional');
  if (balance >= 10000) recompensas.push('OAuth2 sincronizado');

  const stats = fs.existsSync(economiaPath) ? fs.statSync(economiaPath) : new Date();
  const ultimaActualizacion = new Date(stats.mtime || Date.now());
  const ahora = new Date();
  const diferenciaDias = Math.floor((ahora - ultimaActualizacion) / (1000 * 60 * 60 * 24));
  const actualizado = diferenciaDias <= 2;

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Abyssus Dashboard</title>
<style>
body { font-family:'Segoe UI',sans-serif; background:#0a0a0a; color:#e0e0e0; margin:0; padding:0;}
header { background:#23272a; padding:25px; text-align:center; border-bottom:1px solid #2c2f33; }
header h1 { font-size:30px; margin:0; color:#00ff88; }
main { max-width:1200px; margin:40px auto; display:grid; grid-template-columns: repeat(auto-fit,minmax(300px,1fr)); gap:30px; }
.card { background:#1c1c1c; padding:20px; border-radius:12px; box-shadow:0 0 10px rgba(0,0,0,0.5); }
h2 { margin-top:0; color:#00ff88; }
.progress-container { background:#333; border-radius:10px; height:20px; overflow:hidden; margin-top:5px; }
.progress-bar { height:100%; border-radius:10px; transition: width 0.5s; }
footer { text-align:center; padding:25px; color:#777; border-top:1px solid #222; }
ul { padding-left:20px; }
canvas { background:#1c1c1c; border-radius:12px; padding:10px; }
</style>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
<header>
<h1>🔐 Abyssus · Dashboard</h1>
<p>🟢 Servidor activo · módulos conectados</p>
</header>

<main>
<div class="card">
<h2>👤 Perfil Discord</h2>
${user ? `
<p><strong>${user.username}#${user.discriminator}</strong></p>
<p>ID: ${user.id}</p>
<img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" width="100" style="border-radius:50%;">
` : '<p>No autenticado</p>'}
</div>

<div class="card">
<h2>💰 Economía</h2>
<p>Balance: <strong style="color:${balance>=5000?'#33ff88':balance>=1000?'#ffbb33':'#ff5555'}">$${balance.toLocaleString()}</strong></p>
<p>Ingresos: <strong>$${ingresos.toLocaleString()}</strong></p>
<p>Gastos: <strong>$${gastos.toLocaleString()}</strong></p>
<p>Eventos: <strong>${eventos.length}</strong></p>
</div>

<div class="card">
<h2>📈 Nivel</h2>
<p>Nivel: <strong>${nivel}</strong></p>
<p>XP: <strong>${xp} / ${xpSiguiente}</strong></p>
<div class="progress-container">
<div class="progress-bar" style="width:${progreso}%; background:${progreso<50?'#ff5555':progreso<80?'#ffbb33':'#33ff88'};"></div>
</div>
<p>${progreso}%</p>
</div>

<div class="card">
<h2>🎁 Recompensas</h2>
${recompensas.length ? `<ul>${recompensas.map(r=>`<li>${r}</li>`).join('')}</ul>` : '<p>No hay recompensas</p>'}
</div>

<div class="card">
<h2>📜 Modlogs recientes</h2>
<ul>${(modlogData[userId]||[]).slice(-5).reverse().map(e=>`<li>${e.action} - ${e.reason}</li>`).join('')}</ul>
</div>

<div class="card">
<h2>🟢 Última actualización</h2>
<p>${actualizado?'Actualizado recientemente':`Desactualizado (${diferenciaDias} días)`}</p>
</div>

<div class="card">
<h2>📊 Estadísticas de Balance</h2>
<canvas id="balanceChart" width="400" height="200"></canvas>
</div>
</main>

<footer>Sistema Abyssus · Renderizado local</footer>

<script>
const ctx = document.getElementById('balanceChart').getContext('2d');
new Chart(ctx, {
    type: 'bar',
    data: {
        labels: ['Balance','Ingresos','Gastos'],
        datasets:[{
            label:'USD',
            data:[${balance},${ingresos},${gastos}],
            backgroundColor:['#33ff88','#00aaff','#ff5555']
        }]
    },
    options:{ responsive:true, plugins:{legend:{display:false}} }
});
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dashboard activo en puerto ${PORT}`));














































