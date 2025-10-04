// dashboard.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = 3000;

// ====== Archivos JSON simulados (reemplaza por los reales) ======
const economiaPath = path.join(__dirname, 'Usuario.json');
const nivelesPath = path.join(__dirname, 'nivelesData.json');
const modlogsPath = path.join(__dirname, 'modlogs.json');

app.get('/', (req, res) => {
  const economia = JSON.parse(fs.readFileSync(economiaPath, 'utf8'));
  const niveles = JSON.parse(fs.readFileSync(nivelesPath, 'utf8'));
  const modlogs = JSON.parse(fs.readFileSync(modlogsPath, 'utf8'));

  // ======= Estadísticas globales =======
  const totalUsuarios = economia.length;
  const economiaTotal = economia.reduce((acc, u) => acc + (u.balance || 0), 0);
  const totalWarns = Object.values(modlogs).flat().length;

  const nivelesArr = Object.values(niveles.niveles || {});
  const promedioNivel =
    nivelesArr.reduce((a, n) => a + (n.nivel || 0), 0) /
    (nivelesArr.length || 1);

  const topXP = Object.entries(niveles.niveles || {})
    .sort((a, b) => b[1].xp - a[1].xp)
    .slice(0, 5)
    .map(([id, data], i) => ({
      id,
      nivel: data.nivel,
      xp: data.xp,
      rank: i + 1,
    }));

  const stats = fs.statSync(economiaPath);
  const ultimaSync = new Date(stats.mtime).toLocaleString();

  // ====== HTML del Dashboard ======
  res.send(`
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Abyssus Dashboard</title>
    <style>
      body {
        font-family: 'Poppins', sans-serif;
        background: radial-gradient(circle at top, #0a0a0a, #1b1b1b);
        color: #f5f5f5;
        margin: 0;
        padding: 0;
      }
      header {
        background: linear-gradient(90deg, #2b1055, #7597de);
        text-align: center;
        padding: 2rem;
        box-shadow: 0 0 15px #000;
      }
      header h1 {
        font-size: 2rem;
        margin: 0;
        color: #fff;
      }
      main {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
        gap: 1.5rem;
        padding: 2rem;
      }
      .card {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 20px;
        padding: 1.5rem;
        box-shadow: 0 0 15px rgba(0,0,0,0.5);
        transition: all 0.3s ease;
      }
      .card:hover {
        transform: translateY(-5px);
        box-shadow: 0 0 20px rgba(255,255,255,0.2);
      }
      h2 {
        color: #00b4d8;
      }
      .rank-list li {
        list-style: none;
        margin: 0.5rem 0;
      }
      .rank-list li span {
        color: #00ffcc;
      }
      footer {
        text-align: center;
        padding: 1rem;
        background: #111;
        font-size: 0.9rem;
        color: #aaa;
      }
      .highlight {
        color: #ffcc00;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>📊 Abyssus Dashboard</h1>
      <p>Monitoreo en tiempo real del sistema</p>
    </header>
    <main>
      <div class="card">
        <h2>🏆 Ranking TOP 5 Usuarios</h2>
        <ul class="rank-list">
          ${topXP
            .map(
              (u) =>
                `<li>⭐ <span>#${u.rank}</span> | ID: <b>${u.id}</b> — Nivel <b>${u.nivel}</b> (${u.xp} XP)</li>`
            )
            .join('')}
        </ul>
      </div>

      <div class="card">
        <h2>🕓 Estadísticas del Servidor</h2>
        <p>👥 Usuarios registrados: <span class="highlight">${totalUsuarios}</span></p>
        <p>💰 Economía total: <span class="highlight">$${economiaTotal.toLocaleString()}</span></p>
        <p>🧱 Advertencias totales: <span class="highlight">${totalWarns}</span></p>
        <p>📈 Nivel promedio: <span class="highlight">${promedioNivel.toFixed(2)}</span></p>
        <p>🕒 Última sincronización: <span class="highlight">${ultimaSync}</span></p>
        <p>🟢 Estado del bot: <span class="highlight">En línea</span></p>
      </div>

      <div class="card">
        <h2>💡 Información general</h2>
        <p>Versión del sistema: <b>v10.4.2</b></p>
        <p>Desarrollado por <b>Abyssus</b></p>
        <p>Actualizado automáticamente según los datos del bot</p>
      </div>
    </main>
    <footer>
      &copy; 2025 Abyssus Bot Dashboard — Actualizado en tiempo real
    </footer>
  </body>
  </html>
  `);
});

app.listen(PORT, () =>
  console.log(`✅ Dashboard Abyssus activo en http://localhost:${PORT}`)
);
















































