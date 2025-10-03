// server.js
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

// Rutas de tus archivos JSON
const economiaPath = path.join(__dirname, 'Usuario.json');
const modlogPath = path.join(__dirname, 'modlogs.json');
const nivelesPath = path.join(__dirname, 'nivelesData.json');

// Función para leer JSON de forma segura
function cargarJSON(ruta) {
  try {
    if (!fs.existsSync(ruta)) return [];
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (err) {
    console.error(`Error leyendo ${ruta}:`, err.message);
    return [];
  }
}

// Servir archivos estáticos (si tienes favicon, css, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Dashboard principal
app.get('/', (req, res) => {
  // Se envía todo el HTML desde aquí, sin archivo externo
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Abyssus Dashboard</title>
<style>
body { font-family:'Segoe UI', sans-serif; background:#0a0a0a; color:#e0e0e0; margin:0; padding:0; }
header { padding:20px; text-align:center; background:#23272a; border-bottom:1px solid #2c2f33; }
h1 { color:#fff; margin:0 0 5px 0; }
section { background:#111; padding:15px; border-radius:8px; margin:20px; }
.grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; max-width:1200px; margin:auto; }
.barra { font-family:monospace; color:#00ff88; }
</style>
</head>
<body>
<header>
<h1>🔐 Abyssus Dashboard</h1>
<p style="color:#b9bbbe;">🟢 Servidor activo · módulos conectados</p>
</header>

<div class="grid">
  <section>
    <h2>💰 Economía</h2>
    <p>Balance: <strong id="balance">$0</strong></p>
    <p>Ingresos: <strong id="ingresos">$0</strong></p>
    <p>Gastos: <strong id="gastos">$0</strong></p>
  </section>

  <section>
    <h2>📈 Nivel</h2>
    <p>Nivel: <strong id="nivel">0</strong></p>
    <p>XP: <strong id="xp">0 / 0</strong></p>
    <p>Progreso: <span id="barra" class="barra">▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭</span></p>
  </section>

  <section>
    <h2>📜 Modlogs</h2>
    <ul id="modlogs-list" style="list-style:none; padding:0;"></ul>
  </section>
</div>

<script>
const USER_ID = 'TU_USER_ID_AQUI'; // Cambiar por el ID de usuario a mostrar

async function actualizarDashboard() {
  try {
    // Leer JSONs desde el servidor
    const [usuariosRes, nivelesRes, modlogsRes] = await Promise.all([
      fetch('/json/Usuario.json').then(r=>r.json()),
      fetch('/json/nivelesData.json').then(r=>r.json()),
      fetch('/json/modlogs.json').then(r=>r.json())
    ]);

    // Economía
    const datosUsuario = usuariosRes.find(u=>u.id===USER_ID)||{};
    document.getElementById('balance').innerText = '$'+(datosUsuario.balance||0).toLocaleString();
    document.getElementById('ingresos').innerText = '$'+(datosUsuario.ingresos||0).toLocaleString();
    document.getElementById('gastos').innerText = '$'+(datosUsuario.gastos||0).toLocaleString();

    // Niveles
    const datosNivel = nivelesRes.niveles?.[USER_ID]||{};
    const nivel = datosNivel.nivel||0;
    const xp = datosNivel.xp||0;
    const xpSiguiente = 1000 + nivel*500;
    document.getElementById('nivel').innerText = nivel;
    document.getElementById('xp').innerText = xp + ' / ' + xpSiguiente;
    const progreso = Math.min(100, Math.floor((xp/xpSiguiente)*100));
    document.getElementById('barra').innerText = '▭'.repeat(Math.floor(progreso/5)).padEnd(20,'▭');

    // Modlogs
    const lista = [];
    for(const gId in modlogsRes){
      const logs = modlogsRes[gId]?.[USER_ID]||[];
      lista.push(...logs.slice(-5).reverse());
    }
    const ul = document.getElementById('modlogs-list');
    ul.innerHTML = lista.length ? lista.map(e=>\`<li><strong>\${e.action}</strong>: \${e.reason}</li>\`).join('') : '<li>No hay eventos</li>';

  } catch(err){
    console.error('Error actualizando dashboard:', err);
  }
}

// Actualizar cada 5 segundos
actualizarDashboard();
setInterval(actualizarDashboard,5000);
</script>
</body>
</html>`);
});

// Servir los JSON como si fueran "API" interna
app.use('/json', express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`Dashboard activo en puerto \${PORT}\`));





































