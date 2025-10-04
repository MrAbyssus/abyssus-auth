// dashboard.js
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Rutas a JSON
const economiaPath = path.join(__dirname, 'Usuario.json');
const nivelesPath = path.join(__dirname, 'nivelesData.json');
const modlogsPath = path.join(__dirname, 'modlogs.json');

// Función segura para leer JSON
function cargarJSON(ruta, defaultValue = {}) {
  try {
    if (!fs.existsSync(ruta)) return defaultValue;
    const raw = fs.readFileSync(ruta, 'utf8');
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

// Endpoint de datos para frontend
app.get('/data', (req, res) => {
  const economiaData = cargarJSON(economiaPath, []);
  const nivelesData = cargarJSON(nivelesPath, { niveles: {} });
  const modlogData = cargarJSON(modlogsPath, {});

  // Estadísticas globales
  const totalUsuarios = economiaData.length;
  const economiaTotal = economiaData.reduce((s, u) => s + (u.balance || 0), 0);

  // Top usuarios
  const topBalance = [...economiaData].sort((a,b)=>b.balance-a.balance).slice(0,5);
  const nivelesArr = Object.entries(nivelesData.niveles).map(([id,v])=>({id, xp:v.xp||0, nivel:v.nivel||0}));
  const topNivel = [...nivelesArr].sort((a,b)=>b.nivel - a.nivel).slice(0,5);
  const topXP = [...nivelesArr].sort((a,b)=>b.xp - a.xp).slice(0,5);

  // Modlogs totales
  const totalWarns = Object.values(modlogData).flatMap(x => Object.values(x).flat()).length || 0;

  // Última actualización
  const ultimaActualizacion = fs.existsSync(economiaPath) ? fs.statSync(economiaPath).mtime : new Date();

  res.json({
    ok:true,
    timestamp:new Date(),
    totalUsuarios,
    economiaTotal,
    totalWarns,
    topBalance,
    topNivel,
    topXP,
    ultimaActualizacion
  });
});

// Servir dashboard completo en un solo archivo
app.get('/', (req,res)=>{
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Abyssus Dashboard</title>
<style>
body{margin:0;font-family:Segoe UI,sans-serif;background:#0b0f12;color:#e6eef2}
header{padding:28px;text-align:center;background:linear-gradient(90deg,#08202a,#06101b);border-bottom:1px solid rgba(255,255,255,0.03)}
header h1{margin:0;font-weight:600;color:#00d1b2}
main{max-width:1200px;margin:28px auto;padding:16px;display:grid;grid-template-columns:repeat(12,1fr);gap:16px}
.card{background:#0f1417;grid-column:span 4;padding:18px;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.03);transition:transform .18s}
.card:hover{transform:translateY(-6px)}
h2{margin:0 0 10px;font-size:16px;color:#00d1b2}
.kpi{font-size:22px;font-weight:700;color:#fff}
.progress{background:rgba(255,255,255,0.04);height:12px;border-radius:999px;overflow:hidden;margin-top:8px}
.bar{height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#00d1b2,#00a6ff);transition:width 1s}
ul.list{padding-left:14px;margin:8px 0 0}
ul.list li{margin:6px 0;font-size:14px}
.wide{grid-column:span 8}
.full{grid-column:span 12}
footer{max-width:1200px;margin:18px auto 40px;text-align:center;color:#9aa4ad;font-size:13px}
@media(max-width:900px){.card{grid-column:span 12}.wide{grid-column:span 12}}
</style>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
<header><h1>🔐 Abyssus Dashboard · Live</h1><p style="font-size:12px;color:#9aa4ad">Actualización automática cada 10s</p></header>
<main>
<section class="card"><h2>👥 Usuarios registrados</h2><div class="kpi" id="totalUsuarios">—</div></section>
<section class="card"><h2>💰 Economía total</h2><div class="kpi" id="economiaTotal">—</div></section>
<section class="card"><h2>🧾 Modlogs totales</h2><div class="kpi" id="totalWarns">—</div></section>
<section class="card wide"><h2>🏆 Top 5 Balance</h2><ul class="list" id="topBalance"></ul></section>
<section class="card wide"><h2>📈 Top 5 Nivel</h2><ul class="list" id="topNivel"></ul></section>
<section class="card wide"><h2>⚡ Top 5 XP</h2><ul class="list" id="topXP"></ul></section>
<section class="card full"><h2>📊 Gráfico de balances</h2><canvas id="balanceChart" style="max-height:260px"></canvas></section>
</main>
<footer>Última actualización: <span id="footerTime">—</span></footer>
<script>
const fmt=n=>typeof n==='number'?n.toLocaleString():n;
const ctx=document.getElementById('balanceChart').getContext('2d');
const balanceChart=new Chart(ctx,{type:'bar',data:{labels:[],datasets:[{label:'Balance',data:[],backgroundColor:[]} ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});
async function updateDashboard(){
  try{
    const res=await fetch('/data',{cache:'no-store'});
    const json=await res.json();
    document.getElementById('totalUsuarios').textContent=fmt(json.totalUsuarios);
    document.getElementById('economiaTotal').textContent='$'+fmt(json.economiaTotal);
    document.getElementById('totalWarns').textContent=fmt(json.totalWarns);
    document.getElementById('footerTime').textContent=new Date(json.timestamp).toLocaleString();

    // Top Balance
    const ulBalance=document.getElementById('topBalance'); ulBalance.innerHTML='';
    (json.topBalance||[]).forEach((u,i)=>{ const li=document.createElement('li'); li.innerHTML=\`<strong>#\${i+1}</strong> \${u.username||u.id} — <span style="color:#00d1b2">$${fmt(u.balance)}</span>\`; ulBalance.appendChild(li); });

    // Top Nivel
    const ulNivel=document.getElementById('topNivel'); ulNivel.innerHTML='';
    (json.topNivel||[]).forEach((u,i)=>{ const li=document.createElement('li'); li.innerHTML=\`<strong>#\${i+1}</strong> ${u.id} — lvl ${u.nivel}\`; ulNivel.appendChild(li); });

    // Top XP
    const ulXP=document.getElementById('topXP'); ulXP.innerHTML='';
    (json.topXP||[]).forEach((u,i)=>{ const li=document.createElement('li'); li.innerHTML=\`<strong>#\${i+1}</strong> ${u.id} — ${fmt(u.xp)} XP\`; ulXP.appendChild(li); });

    // Actualizar gráfico
    const top=json.topBalance||[];
    balanceChart.data.labels=top.map(u=>u.username||u.id);
    balanceChart.data.datasets[0].data=top.map(u=>u.balance||0);
    balanceChart.data.datasets[0].backgroundColor=top.map((_,i)=>['#00d1b2','#00a6ff','#ffb86b','#ff7aa2','#9b8cff'][i%5]);
    balanceChart.update();
  }catch(e){console.error('Error dashboard:',e);}
}
updateDashboard(); setInterval(updateDashboard,10000);
</script>
</body>
</html>`);
});

// Iniciar servidor
app.listen(PORT,()=>console.log(`✅ Abyssus Dashboard activo en http://localhost:${PORT}`));





















































