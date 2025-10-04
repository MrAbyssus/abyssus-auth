// index.js
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Rutas a tus JSON
const economiaPath = path.join(__dirname, 'Usuario.json');
const nivelesPath  = path.join(__dirname, 'nivelesData.json');
const modlogsPath  = path.join(__dirname, 'modlogs.json');

// Función segura para leer JSON
function safeReadJSON(filePath, defaultValue = {}) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

// Endpoint /data
app.get('/data', (req, res) => {
  const economiaData = safeReadJSON(economiaPath, []);
  const nivelesData  = safeReadJSON(nivelesPath, { niveles: {} });
  const modlogData   = safeReadJSON(modlogsPath, {});

  const totalUsuarios = Array.isArray(economiaData) ? economiaData.length : 0;
  const economiaTotal = economiaData.reduce((s,u)=>s+(Number(u.balance)||0),0);

  let totalWarns = 0;
  try {
    totalWarns = Object.values(modlogData).flatMap(x => Object.values(x).flat()).length;
  } catch { totalWarns = 0; }

  const nivelesArr = Object.entries(nivelesData.niveles || {}).map(([id,v]) => ({id, xp: Number(v.xp)||0, nivel: Number(v.nivel)||0}));
  const promedioNivel = nivelesArr.length ? nivelesArr.reduce((s,i)=>s+i.nivel,0)/nivelesArr.length : 0;
  const topXP = nivelesArr.slice().sort((a,b)=>b.xp-a.xp).slice(0,10);
  const topNivel = nivelesArr.slice().sort((a,b)=>b.nivel-a.nivel).slice(0,10);

  const topBalance = economiaData.slice().sort((a,b)=>(b.balance||0)-(a.balance||0)).slice(0,10);

  const lastUpdate = fs.existsSync(economiaPath) ? fs.statSync(economiaPath).mtime : new Date();

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
    lastUpdate: lastUpdate.toISOString()
  });
});

// Endpoint principal
app.get('/', (req,res)=>{
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Abyssus Dashboard</title>
<style>
body{font-family:Arial,sans-serif;margin:0;padding:0;background:#0a0a0a;color:#e0e0e0;}
header{background:#23272a;padding:20px;text-align:center;}
header h1{color:#00ff88;margin:0;}
main{max-width:1200px;margin:30px auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;}
.card{background:#1c1c1c;padding:15px;border-radius:10px;}
h2{color:#00ff88;margin-top:0;}
.progress-container{background:#333;border-radius:10px;height:20px;overflow:hidden;margin-top:5px;}
.progress-bar{height:100%;border-radius:10px;transition:width 0.5s;}
ul{padding-left:20px;}
footer{text-align:center;padding:20px;color:#777;border-top:1px solid #222;}
</style>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
<header>
<h1>🔐 Abyssus Dashboard</h1>
<p>Datos actualizados automáticamente</p>
</header>
<main>
<div class="card">
<h2>👥 Usuarios registrados</h2>
<div id="totalUsuarios">—</div>
</div>

<div class="card">
<h2>💰 Economía total</h2>
<div id="economiaTotal">—</div>
</div>

<div class="card">
<h2>🧾 Modlogs totales</h2>
<div id="totalWarns">—</div>
</div>

<div class="card">
<h2>📈 Nivel promedio & Top XP</h2>
<div id="promedioNivel">—</div>
<div id="top1">—</div>
<div class="progress-container"><div class="progress-bar" id="globalBar" style="width:0%;background:#00ff88;"></div></div>
</div>

<div class="card">
<h2>🏆 Top Balance</h2>
<ul id="topBalanceList"><li>—</li></ul>
</div>

<div class="card wide">
<h2>📊 Gráfico Top Balance</h2>
<canvas id="chart"></canvas>
</div>
</main>
<footer>
Última actualización: <span id="footerTime">—</span>
</footer>

<script>
async function fetchAndUpdate(){
  try{
    const res=await fetch('/data',{cache:'no-store'});
    const json=await res.json();
    document.getElementById('totalUsuarios').textContent=json.totalUsuarios;
    document.getElementById('economiaTotal').textContent='$'+json.economiaTotal.toLocaleString();
    document.getElementById('totalWarns').textContent=json.totalWarns;
    document.getElementById('promedioNivel').textContent=json.promedioNivel.toFixed(2);
    const top1=json.topXP[0];
    document.getElementById('top1').textContent=top1 ? top1.id+' lvl '+top1.nivel+' ('+top1.xp+' XP)' : '—';
    // Top balance
    const ul=document.getElementById('topBalanceList'); ul.innerHTML='';
    json.topBalance.forEach((u,i)=>{ const li=document.createElement('li'); li.textContent='#'+(i+1)+' '+(u.username||u.id)+' — $'+(u.balance||0); ul.appendChild(li);});
    if(!json.topBalance.length) ul.innerHTML='<li>No hay datos</li>';
    // Chart
    const ctx=document.getElementById('chart').getContext('2d');
    const labels=json.topBalance.map(u=>u.username||u.id);
    const data=json.topBalance.map(u=>u.balance||0);
    if(window.myChart) window.myChart.data.labels=labels,window.myChart.data.datasets[0].data=data,window.myChart.update();
    else window.myChart=new Chart(ctx,{type:'bar',data:{labels:labels,datasets:[{label:'Balance',data:data,backgroundColor:'#00ff88'}]},options:{responsive:true,maintainAspectRatio:false}});
    // Footer time
    document.getElementById('footerTime').textContent=new Date(json.timestamp).toLocaleString();
    // Global progress bar
    let avgPct=0; if(json.topXP.length) avgPct=json.topXP.reduce((s,i)=>s+(i.xp/Math.max(1,i.nivel*1000)),0)/json.topXP.length*100;
    document.getElementById('globalBar').style.width=Math.min(100,avgPct)+'%';
  }catch(err){console.error(err);}
}
fetchAndUpdate();
setInterval(fetchAndUpdate,10000);
</script>
</body>
</html>`);
});

// Iniciar servidor
app.listen(PORT,()=>console.log(`✅ Abyssus Dashboard activo en http://localhost:${PORT}`));




















































