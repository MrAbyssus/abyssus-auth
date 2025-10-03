require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

// Rutas absolutas
const economiaPath = path.join(__dirname, 'Usuario.json');
const modlogPath = path.join(__dirname, 'modlogs.json');
const nivelesPath = path.join(__dirname, 'nivelesData.json');

// Función para cargar JSON
function cargarJSON(ruta) {
  try {
    if (!fs.existsSync(ruta)) return {};
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch {
    return {};
  }
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  const userId = req.query.id;
  if (!userId) return res.send('❌ Debes enviar tu userId: ?id=TU_USER_ID');

  const economiaData = cargarJSON(economiaPath);
  const modlogData = cargarJSON(modlogPath);
  const nivelesData = cargarJSON(nivelesPath);

  // Economía
  const datosUsuario = economiaData.find(u => u.id === userId) || {};
  const balance = datosUsuario.balance || 0;
  const ingresos = datosUsuario.ingresos || 0;
  const gastos = datosUsuario.gastos || 0;

  // Niveles
  const datosNivel = nivelesData.niveles?.[userId] || {};
  const nivel = datosNivel.nivel || 0;
  const xp = datosNivel.xp || 0;
  const xpSiguiente = 1000 + nivel * 500;
  const progreso = Math.min(100, Math.floor((xp / xpSiguiente) * 100));
  const barra = '▭'.repeat(Math.floor(progreso / 5)).padEnd(20, '▭');

  // Recompensas
  const recompensas = [];
  if (balance >= 1000) recompensas.push('Blindaje semántico');
  if (balance >= 5000) recompensas.push('Heurística institucional');
  if (balance >= 10000) recompensas.push('OAuth2 sincronizado');

  // Modlogs
  let eventos = [];
  for (const gId in modlogData) {
    const logs = modlogData[gId]?.[userId];
    if (Array.isArray(logs)) eventos.push(...logs);
  }
  const eventosRecientes = eventos.slice(-10).reverse();

  // Última actualización
  const stats = fs.statSync(economiaPath);
  const ultimaActualizacion = new Date(stats.mtime);
  const ahora = new Date();
  const diferenciaDias = Math.floor((ahora - ultimaActualizacion) / (1000*60*60*24));

  // Render
  res.send(`
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Dashboard Abyssus</title>
        <style>
          body { font-family: sans-serif; background:#0a0a0a; color:#e0e0e0; padding:20px; }
          section { background:#23272a; padding:15px; border-radius:8px; margin-bottom:20px; }
          h2 { color:#00ff88; }
          ul { padding-left:20px; }
          li { margin-bottom:6px; }
        </style>
      </head>
      <body>
        <h1>🔐 Dashboard Abyssus</h1>

        <section>
          <h2>👤 Perfil</h2>
          <p>User ID: ${userId}</p>
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
          <p>Progreso: ${barra} (${progreso}%)</p>
        </section>

        <section>
          <h2>🎁 Recompensas</h2>
          ${recompensas.length ? `<ul>${recompensas.map(r => `<li>${r}</li>`).join('')}</ul>` : 'No hay recompensas'}
        </section>

        <section>
          <h2>📜 Modlogs</h2>
          ${eventosRecientes.length ? `<ul>${eventosRecientes.map(e => `<li>${e.action} · ${e.reason}</li>`).join('')}</ul>` : 'No hay eventos'}
        </section>

        <section>
          <h2>🟢 Última actualización</h2>
          <p>${ultimaActualizacion.toLocaleString()} (${diferenciaDias} días)</p>
        </section>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dashboard activo en puerto ${PORT}`));










































