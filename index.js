// dashboard.js
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Rutas a tus JSON (ajusta si están en otra carpeta)
const economiaPath = path.join(__dirname, 'Usuario.json');
const nivelesPath  = path.join(__dirname, 'nivelesData.json');
const modlogsPath  = path.join(__dirname, 'modlogs.json');

// Utilidades seguras para leer JSON
function safeReadJSON(filePath, defaultValue = {}) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (err) {
    console.error(`Error leyendo ${filePath}:`, err.message);
    return defaultValue;
  }
}

// Endpoint que devuelve datos agregados en JSON (para el frontend)
app.get('/data', (req, res) => {
  const economiaData = safeReadJSON(economiaPath, []); // array de usuarios econ
  const nivelesData  = safeReadJSON(nivelesPath, { niveles: {} }); // estructura { niveles: { userId: { xp, nivel } } }
  const modlogData   = safeReadJSON(modlogsPath, {}); // objeto { guildId: { userId: [logs] } } o similar

  // Estadísticas globales
  const totalUsuarios = Array.isArray(economiaData) ? economiaData.length : 0;
  const economiaTotal = (Array.isArray(economiaData) ? economiaData : []).reduce((s, u) => s + (Number(u.balance) || 0), 0);

  // Advertencias / modlogs totales (suma de arrays)
  let totalWarns = 0;
  try {
    totalWarns = Object.values(modlogData).flatMap(x => (typeof x === 'object' ? Object.values(x).flat() : [])).length;
  } catch { totalWarns = 0; }

  // Niveles: promedio, top XP y top nivel
  const nivelesArr = Object.entries(nivelesData.niveles || {}).map(([id, v]) => ({ id, xp: Number(v.xp) || 0, nivel: Number(v.nivel) || 0 }));
  const promedioNivel = nivelesArr.length ? (nivelesArr.reduce((s, i) => s + i.nivel, 0) / nivelesArr.length) : 0;
  const topXP = nivelesArr.slice().sort((a,b)=>b.xp - a.xp).slice(0,10);
  const topNivel = nivelesArr.slice().sort((a,b)=>b.nivel - a.nivel).slice(0,10);

  // Top por balance (usa economiaData)
  const topBalance = (Array.isArray(economiaData) ? economiaData.slice() : []).sort((a,b) => (b.balance||0) - (a.balance||0)).slice(0,10);

  // Última modificación (sync) de los archivos
  const lastUpdate = (() => {
    try {
      const s = fs.existsSync(economiaPath) ? fs.statSync(economiaPath).mtime : new Date();
      return s;
    } catch { return new Date(); }
  })();

  res.json({
    ok: true,
    timestamp: new Date(),
    totalUsuarios,
    economiaTotal,
    totalWarns,
    promedioNivel,
    topXP,
    topNivel,
    topBalance,
    lastUpdate: lastUpdate.toISOString(),
    raw: { economiaDataLength: (Array.isArray(economiaData) ? economiaData.length : 0) } // info ligera
  });
});

// Servir archivo estático principal (frontend)
app.get('/', (req, res) => {
  res.send(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Abyssus Dashboard — Live</title>
<link rel="icon" href="data:;base64,iVBORw0KGgo=" />
<style>
  :root{
    --bg:#0b0f12; --card:#0f1417; --accent:#00d1b2; --muted:#9aa4ad; --glass: rgba(255,255,255,0.03);
  }
  *{box-sizing:border-box}
  body{margin:0;font-family:Inter,ui-sans-serif,system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;background:linear-gradient(180deg,#071018 0%, #08121a 100%);color:#e6eef2}
  header{padding:28px 20px;text-align:center;background:linear-gradient(90deg,#08202a 0%,#06101b 100%);border-bottom:1px solid rgba(255,255,255,0.03)}
  header h1{margin:0;font-weight:600;letter-spacing:0.4px}
  header p{margin:6px 0 0;color:var(--muted)}
  main{max-width:1200px;margin:28px auto;padding:16px;display:grid;grid-template-columns:repeat(12,1fr);gap:16px}
  .card{background:var(--card);grid-column:span 4;padding:18px;border-radius:12px;box-shadow:0 6px 18px rgba(2,6,8,0.6);border:1px solid rgba(255,255,255,0.03);transition:transform .18s}
  .card:hover{transform:translateY(-6px)}
  h2{margin:0 0 10px;font-size:16px;color:var(--accent)}
  p.small{margin:6px 0;color:var(--muted);font-size:13px}
  .kpi{font-size:22px;font-weight:700;color:#fff}
  .progress{background:rgba(255,255,255,0.04);height:12px;border-radius:999px;overflow:hidden;margin-top:8px}
  .bar{height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#00d1b2,#00a6ff)}
  ul.list{padding-left:14px;margin:8px 0 0}
  ul.list li{margin:6px 0;color:#d8eaf0;font-size:14px}
  .wide{grid-column:span 8}
  .full{grid-column:span 12}
  footer{max-width:1200px;margin:18px auto 40px;text-align:center;color:var(--muted)}
  @media (max-width:900px){.card{grid-column:span 12}.wide{grid-column:span 12}}
  .muted{color:var(--muted);font-size:13px}
  .time{font-weight:700;color:var(--accent)}
  .mini{font-size:12px;color:var(--muted)}
  .status-online{color:#33ff99;font-weight:700}
  .status-offline{color:#ff6b6b;font-weight:700}
</style>
<!-- Chart.js CDN -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
<header>
  <h1>🔐 Abyssus Dashboard · Live</h1>
  <p class="mini">Datos locales · actualización automática · listo para pasar a WebSockets</p>
</header>

<main id="grid">
  <!-- Left: KPIs -->
  <section class="card" id="kpiUsuarios">
    <h2>👥 Usuarios registrados</h2>
    <div class="kpi" id="totalUsuarios">—</div>
    <p class="small">Cantidad de usuarios registrados en Usuario.json</p>
  </section>

  <section class="card" id="kpiEconomia">
    <h2>💰 Economía total</h2>
    <div class="kpi" id="economiaTotal">—</div>
    <p class="small">Suma de balances de todos los usuarios</p>
  </section>

  <section class="card" id="kpiWarns">
    <h2>🧾 Advertencias / modlogs</h2>
    <div class="kpi" id="totalWarns">—</div>
    <p class="small">Eventos registrados en modlogs.json</p>
  </section>

  <!-- Wide: Nivel promedio + progress -->
  <section class="card wide" id="nivelCard">
    <h2>📈 Nivel promedio & Top</h2>
    <div style="display:flex;gap:18px;align-items:center">
      <div style="flex:1">
        <div class="muted">Nivel promedio</div>
        <div class="kpi" id="promedioNivel">—</div>
        <p class="mini muted">Promedio entre todos los usuarios con datos de nivel</p>
      </div>
      <div style="flex:1">
        <div class="muted">Top XP (1°)</div>
        <div id="top1" class="kpi">—</div>
        <p class="mini muted" id="top1info"></p>
      </div>
    </div>
    <hr style="margin:12px 0;border:none;border-top:1px solid rgba(255,255,255,0.03)">
    <div class="muted">Progreso general (XP medio)</div>
    <div class="progress" style="margin-top:8px"><div class="bar" id="globalBar" style="width:0%"></div></div>
  </section>

  <!-- Ranking Top Balance -->
  <section class="card" id="rankCard">
    <h2>🏆 Top balance (Top 10)</h2>
    <ul class="list" id="topBalanceList">
      <li>—</li>
    </ul>
  </section>

  <!-- Modlogs recent -->
  <section class="card" id="modlogsCard">
    <h2>📜 Modlogs recientes</h2>
    <ul class="list" id="modlogsRecent">
      <li>—</li>
    </ul>
  </section>

  <!-- Chart area -->
  <section class="card wide" id="chartCard">
    <h2>📊 Economías rápidas</h2>
    <canvas id="economyChart" style="max-height:260px"></canvas>
    <p class="mini muted">Balance / Ingresos / Gastos (usuario autenticado o top agregados)</p>
  </section>

  <!-- Server stats -->
  <section class="card full" id="serverStats">
    <h2>🕓 Estadísticas del servidor</h2>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <div style="min-width:200px">
        <div class="muted">Última sincronización</div>
        <div id="lastSync" class="kpi">—</div>
      </div>
      <div style="min-width:180px">
        <div class="muted">Estado del bot</div>
        <div id="botState" class="kpi status-online">Desconocido</div>
      </div>
      <div style="min-width:200px">
        <div class="muted">Versión</div>
        <div class="kpi">v1.0.0</div>
      </div>
    </div>
  </section>
</main>

<footer id="footer">
  <div class="mini">Última actualización: <span id="footerTime">—</span></div>
</footer>

<script>
  // Helper para formatear
  const fmt = (n) => typeof n === 'number' ? n.toLocaleString() : n;

  // Chart.js init
  const ctx = document.getElementById('economyChart').getContext('2d');
  const economyChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'USD', data: [], backgroundColor: [] }] },
    options: { responsive:true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  // Actualizar DOM con /data
  async function fetchAndUpdate() {
    try {
      const res = await fetch('/data', { cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) return console.warn('No OK from /data');

      // KPIs simples
      document.getElementById('totalUsuarios').textContent = fmt(json.totalUsuarios);
      document.getElementById('economiaTotal').textContent = '$' + fmt(json.economiaTotal);
      document.getElementById('totalWarns').textContent = fmt(json.totalWarns);
      document.getElementById('promedioNivel').textContent = (json.promedioNivel || 0).toFixed(2);

      // Top1
      const top1 = json.topXP && json.topXP[0];
      if (top1) {
        document.getElementById('top1').textContent = (top1.id || 'N/A') + ' · lvl ' + top1.nivel;
        document.getElementById('top1info').textContent = top1.xp + ' XP';
      } else {
        document.getElementById('top1').textContent = 'N/A';
        document.getElementById('top1info').textContent = '';
      }

      // global progress bar (usamos promedio de XP / (nivel*1000) simplificado)
      let globalPct = 0;
      if (json.topXP && json.topXP.length) {
        // calcular una aproximación: promedio xp / (nivel * 1000)
        const arr = json.topXP;
        const avgPct = arr.reduce((s,i)=> s + (i.xp / Math.max(1,(i.nivel*1000))), 0) / arr.length;
        globalPct = Math.round(Math.min(100, avgPct * 100));
      }
      document.getElementById('globalBar').style.width = globalPct + '%';

      // Top balance list
      const ul = document.getElementById('topBalanceList');
      ul.innerHTML = '';
      (json.topBalance || []).slice(0,10).forEach((u, i) => {
        const name = u.username || u.tag || u.id || 'ID:' + (u.id ?? i+1);
        const bal = '$' + (u.balance ? Number(u.balance).toLocaleString() : '0');
        const li = document.createElement('li');
        li.innerHTML = \`<strong>#\${i+1}</strong> \${name} — <span style="color:var(--accent)">\${bal}</span>\`;
        ul.appendChild(li);
      });
      if (!(json.topBalance || []).length) ul.innerHTML = '<li class="muted">No hay datos</li>';

      // Modlogs recent (extraemos de lastUpdate raw; nota: modlogs mostrados desde servidor)
      const modlogsEl = document.getElementById('modlogsRecent');
      modlogsEl.innerHTML = '';
      try {
        // si el backend incluyera modlogs detallados, aquí se iteraría. Por ahora mostramos contador.
        modlogsEl.innerHTML = '<li>Eventos totales: ' + fmt(json.totalWarns) + '</li>';
      } catch {
        modlogsEl.innerHTML = '<li class="muted">No hay modlogs disponibles</li>';
      }

      // Chart update: mostraremos topBalance primeros 6
      const top = (json.topBalance || []).slice(0,6);
      economyChart.data.labels = top.map(u => u.username || u.id || 'ID');
      economyChart.data.datasets[0].data = top.map(u => Number(u.balance) || 0);
      economyChart.data.datasets[0].backgroundColor = top.map((_,i)=> ['#00d1b2','#00a6ff','#ffb86b','#ff7aa2','#9b8cff','#6ee7b7'][i%6]);
      economyChart.update();

      // Last sync and footer
      document.getElementById('lastSync').textContent = new Date(json.lastUpdate).toLocaleString();
      document.getElementById('footerTime').textContent = new Date(json.timestamp).toLocaleString();

      // Bot state heuristic: si el backend responde, lo consideramos online
      const botStateEl = document.getElementById('botState');
      botStateEl.textContent = 'En línea';
      botStateEl.className = 'kpi status-online';

    } catch (err) {
      console.error('Fetch error:', err);
      document.getElementById('botState').textContent = 'Desconectado';
      document.getElementById('botState').className = 'kpi status-offline';
    }
  }

  // Primera carga y luego cada 10 segundos
  fetchAndUpdate();
  setInterval(fetchAndUpdate, 10000);

</script>
</body>
</html>`);
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(\`✅ Abyssus Dashboard activo en http://localhost:\${PORT}\`);
  console.log(' -> Endpoint /data para frontend (fetch cada 10s)');
});
















































