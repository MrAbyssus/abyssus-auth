require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Rutas a tus JSON
const economiaPath = path.join(__dirname, 'Usuario.json');
const nivelesPath = path.join(__dirname, 'nivelesData.json');
const modlogsPath = path.join(__dirname, 'modlogs.json');

// Función para leer JSON de forma segura
function cargarJSON(ruta, defaultValue = {}) {
  try {
    if (!fs.existsSync(ruta)) return defaultValue;
    const raw = fs.readFileSync(ruta, 'utf8');
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

// Endpoint que devuelve datos agregados en JSON (para el frontend)
app.get('/data', (req, res) => {
  const economiaData = cargarJSON(economiaPath, []);
  const nivelesData = cargarJSON(nivelesPath, { niveles: {} });
  const modlogData = cargarJSON(modlogsPath, {});

  const totalUsuarios = Array.isArray(economiaData) ? economiaData.length : 0;
  const economiaTotal = economiaData.reduce((s,u)=> s + (Number(u.balance)||0),0);

  let totalWarns = 0;
  try {
    totalWarns = Object.values(modlogData).flatMap(x => Object.values(x).flat()).length;
  } catch {}

  const nivelesArr = Object.entries(nivelesData.niveles || {}).map(([id,v])=>({id, xp:Number(v.xp)||0, nivel:Number(v.nivel)||0}));
  const promedioNivel = nivelesArr.length ? (nivelesArr.reduce((s,i)=>s+i.nivel,0)/nivelesArr.length) : 0;
  const topXP = nivelesArr.slice().sort((a,b)=>b.xp - a.xp).slice(0,10);
  const topNivel = nivelesArr.slice().sort((a,b)=>b.nivel - a.nivel).slice(0,10);
  const topBalance = economiaData.slice().sort((a,b)=> (b.balance||0)-(a.balance||0)).slice(0,10);

  const lastUpdate = fs.existsSync(economiaPath) ? fs.statSync(economiaPath).mtime : new Date();

  res.json({
    ok:true,
    timestamp: new Date(),
    totalUsuarios,
    economiaTotal,
    totalWarns,
    promedioNivel,
    topXP,
    topNivel,
    topBalance,
    lastUpdate: lastUpdate.toISOString()
  });
});

// Ruta principal (dashboard)
app.get('/', (req,res)=>{
  res.send(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Abyssus Dashboard</title>
<style>
body{margin:0;font-family:Segoe UI;background:#0a0a0a;color:#e0e0e0;}
header{background:#23272a;padding:20px;text-align:center;border-bottom:1px solid #2c2f33;}
header h1{margin:0;color:#00ff88;}
main{max-width:1200px;margin:20px auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;padding:10px;}
.card{background:#1c1c1c;padding:15px;border-radius:12px;box-shadow:0 0 10px rgba(0,0,0,0.5);}
h2{margin-top:0;color:#00ff88;}
.progress{background:#333;border-radius:10px;height:20px;overflow:hidden;margin-top:5px;}
.bar{height:100%;border-radius:10px;transition:width 0.5s;}
ul{padding-left:18px;}
footer{text-align:center;padding:15px;color:#777;border-top:1px solid #222;}
.kpi{font-size:22px;font-weight:700;color:#fff;}
</style>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
<header>
<h1>🔐 Abyssus Dashboard</h1>
<p>Actualización automática cada 10 segundos</p>
</header>
<main>
<div class="card">
<h2>👥 Usuarios registrados</h2>
<div id="totalUsuarios" class="kpi">—</div>
</div>
<div class="card">
<h2>💰 Economía total</h2>
<div id="economiaTotal" class="kpi">—</div>
</div>
<div class="card">
<h2>🧾 Advertencias / Modlogs</h2>
<div id="totalWarns" class="kpi">—</div>
</div>
<div class="card">
<h2>📈 Nivel promedio</h2>
<div id="promedioNivel" class="kpi">—</div>
<div class="progress"><div id="nivelBar" class="bar" style="width:0%;background:#00ff88;"></div></div>
</div>
<div class="card">
<h2>🏆 Top Balance (Top 5)</h2>
<ul id="topBalanceList"><li>—</li></ul>
</div>
<div class="card wide">
<h2>📊 Gráfico de balances Top 5</h2>
<canvas id="balanceChart" height="150"></canvas>
</div>
<div class="card">
<h2>🕓 Última actualización</h2>
<div id="lastUpdate">—</div>
</div>
</main>
<footer>Dashboard Abyssus · Renderizado local</footer>
<script>
const fmt=n=>n.toLocaleString();

async function updateDashboard(){
  try{
    const res = await fetch('/data');
    const data = await res.json();
    if(!data.ok) return;
    document.getElementById('totalUsuarios').textContent = fmt(data.totalUsuarios);
    document.getElementById('economiaTotal').textContent = '$'+fmt(data.economiaTotal);
    document.getElementById('totalWarns').textContent = fmt(data.totalWarns);
    document.getElementById('promedioNivel').textContent = data.promedioNivel.toFixed(2);
    document.getElementById('nivelBar').style.width = Math.min(100,data.promedioNivel*10)+'%';
    document.getElementById('lastUpdate').textContent = new Date(data.lastUpdate).toLocaleString();

    // Top Balance
    const ul=document.getElementById('topBalanceList');
    ul.innerHTML='';
    (data.topBalance.slice(0,5)||[]).forEach((u,i)=>{
      const li=document.createElement('li');
      li.textContent=\`#\${i+1} \${u.username||u.id} — $\${fmt(u.balance||0)}\`;
      ul.appendChild(li);
    });

    // Chart
    const ctx=document.getElementById('balanceChart').getContext('2d');
    const top=data.topBalance.slice(0,5);
    const chartData = { labels: top.map(u=>u.username||u.id), datasets:[{label:'Balance',data:top.map(u=>u.balance||0),backgroundColor:['#00ff88','#00a6ff','#ffbb33','#ff55aa','#ff7755']}]};
    if(window.balanceChart) window.balanceChart.data=chartData,window.balanceChart.update();
    else window.balanceChart=new Chart(ctx,{type:'bar',data:chartData,options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});
  }catch(e){console.error(e);}
}

updateDashboard();
setInterval(updateDashboard,10000);
</script>
</body>
</html>`);
});

app.listen(PORT,()=>console.log(`✅ Dashboard activo en http://localhost:${PORT}`));





















































