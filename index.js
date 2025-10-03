require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

// Rutas absolutas de JSON
const economiaPath = path.join(__dirname, 'Usuario.json');
const modlogPath = path.join(__dirname, 'modlogs.json');
const nivelesPath = path.join(__dirname, 'nivelesData.json');

// Función para cargar JSON seguro
function cargarJSON(ruta) {
  try {
    if (!fs.existsSync(ruta)) return [];
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch {
    return [];
  }
}

// Servir dashboard principal
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Abyssus Dashboard</title>
<style>
body { font-family:'Segoe UI', sans-serif; background:#0a0a0a; color:#e0e0e0; margin:0; padding:0; }
main { max-width:1200px; margin:50px auto; display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:30px; }
.card { background:#1c1c1c; border-radius:12px; padding:20px; box-shadow:0 0 15px rgba(0,0,0,0.5); }
.card h2 { margin-top:0; color:#00ff88; }
.progress-bar { background:#2c2c2c; border-radius:8px; overflow:hidden; height:20px; margin-top:5px; }
.progress-bar-inner { background:#00ff88; height:100%; width:0; transition:width 0.5s ease-in-out; }
</style>
</head>
<body>
<main>
<section id="perfil" class="card"><h2>Perfil</h2></section>
<section id="economia" class="card"><h2>Economía</h2></section>
<section id="recompensas" class="card"><h2>Recompensas</h2></section>
<section id="niveles" class="card"><h2>Niveles</h2></section>
<section id="modlogs" class="card"><h2>Modlogs</h2></section>
<section id="actualizacion" class="card"><h2>Actualización</h2></section>
</main>

<script>
async function actualizarDashboard() {
  try {
    const res = await fetch('/api/dashboard');
    const data = await res.json();

    document.getElementById('perfil').innerHTML = "<h2>Perfil</h2>" + data.perfilHTML;
    document.getElementById('economia').innerHTML = "<h2>Economía</h2>" + data.economiaHTML;
    document.getElementById('recompensas').innerHTML = "<h2>Recompensas</h2>" + data.recompensasHTML;
    document.getElementById('niveles').innerHTML = "<h2>Niveles</h2>" + data.nivelesHTML;
    document.getElementById('modlogs').innerHTML = "<h2>Modlogs</h2>" + data.modlogHTML;
    document.getElementById('actualizacion').innerHTML = "<h2>Actualización</h2>" + data.actualizacionHTML;

    const barra = document.querySelector('.progress-bar-inner');
    if(barra) barra.style.width = data.progreso + '%';
  } catch(err) { console.error(err); }
}

setInterval(actualizarDashboard, 15000); // cada 15 segundos
actualizarDashboard();
</script>
</body>
</html>
`);
});

// Ruta de datos para dashboard
app.get('/api/dashboard', (req, res) => {
  const economiaData = cargarJSON(economiaPath);
  const modlogData = cargarJSON(modlogPath);
  const nivelesData = cargarJSON(nivelesPath);

  const userId = req.query.userId || '1234567890';
  const datosUsuario = economiaData.find(u => u.id === userId) || {};
  const datosNivel = nivelesData.niveles?.[userId] || {};
  const logs = [];
  for (const gId in modlogData) {
    const l = modlogData[gId]?.[userId];
    if (Array.isArray(l)) logs.push(...l);
  }

  const nivel = datosNivel.nivel || 0;
  const xp = datosNivel.xp || 0;
  const xpSiguiente = 1000 + nivel * 500;
  const progreso = Math.min(100, Math.floor((xp / xpSiguiente) * 100));

  const stats = fs.statSync(economiaPath);
  const ultimaActualizacion = new Date(stats.mtime);
  const ahora = new Date();
  const diferenciaDias = Math.floor((ahora - ultimaActualizacion)/(1000*60*60*24));
  const actualizado = diferenciaDias <= 2;

  // Generamos HTML simple para cada sección
  res.json({
    perfilHTML: `<p>ID: ${userId}</p>`,
    economiaHTML: `<p>Balance: $${datosUsuario.balance || 0}</p>
                   <p>Ingresos: $${datosUsuario.ingresos || 0}</p>
                   <p>Gastos: $${datosUsuario.gastos || 0}</p>`,
    recompensasHTML: `<p>${(datosUsuario.balance||0)>=1000?'Blindaje semántico, ':''}${(datosUsuario.balance||0)>=5000?'Heurística institucional, ':''}${(datosUsuario.balance||0)>=10000?'OAuth2 sincronizado':''}</p>`,
    nivelesHTML: `<p>Nivel ${nivel} - XP: ${xp}/${xpSiguiente}</p>
                  <div class="progress-bar"><div class="progress-bar-inner" style="width:${progreso}%"></div></div>`,
    modlogHTML: `<p>Eventos recientes: ${logs.slice(-5).map(e => e.action).join(', ') || 'Ninguno'}</p>`,
    actualizacionHTML: `<p>${actualizado ? '🟢 Actualizado' : '🔴 Desactualizado'} (${diferenciaDias} días)</p>`,
    progreso
  });
});

// Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔐 Abyssus Run activo en puerto ${PORT}`));
































