require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Rutas JSON ---
const economiaPath = path.join(__dirname, 'Usuario.json');
const nivelesPath  = path.join(__dirname, 'nivelesData.json');
const modlogPath  = path.join(__dirname, 'modlogs.json');

// --- Funciones ---
function cargarJSON(ruta, defaultValue = {}) {
  try {
    if (!fs.existsSync(ruta)) return defaultValue;
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch { return defaultValue; }
}

// Formatear números
function fmt(n) { return typeof n === 'number' ? n.toLocaleString() : n; }

// --- Endpoint /data para frontend ---
app.get('/data', (req,res)=>{
  const economiaData = cargarJSON(economiaPath, []);
  const nivelesData  = cargarJSON(nivelesPath, { niveles:{} });
  const modlogData   = cargarJSON(modlogPath, {});

  // Estadísticas
  const totalUsuarios = Array.isArray(economiaData)? economiaData.length : 0;
  const economiaTotal = (Array.isArray(economiaData)? economiaData:[]).reduce((s,u)=>s+(Number(u.balance)||0),0);

  // Modlogs
  let totalWarns = 0;
  try {
    totalWarns = Object.values(modlogData).flatMap(x=>Object.values(x).flat()).length;
  } catch {}

  // Niveles
  const nivelesArr = Object.entries(nivelesData.niveles).map(([id,v])=>({ id, xp:Number(v.xp)||0, nivel:Number(v.nivel)||0 }));
  const promedioNivel = nivelesArr.length ? nivelesArr.reduce((s,i)=>s+i.nivel,0)/nivelesArr.length : 0;
  const topXP = nivelesArr.slice().sort((a,b)=>b.xp-a.xp).slice(0,5);

  // Top balance
  const topBalance = (Array.isArray(economiaData)? economiaData.slice() : []).sort((a,b)=>(b.balance||0)-(a.balance||0)).slice(0,5);

  const lastUpdate = fs.existsSync(economiaPath)? fs.statSync(economiaPath).mtime : new Date();

  res.json({
    ok:true,
    timestamp: new Date(),
    totalUsuarios,
    economiaTotal,
    totalWarns,
    promedioNivel,
    topXP,
    topBalance,
    lastUpdate: lastUpdate.toISOString()
  });
});

// --- Ruta principal ---
app.get('/', async (req,res)=>{
  const token = req.query.token||'';
  let user = null;
  let userId = '';

  if(token.length>10){
    try{
      const userResp = await axios.get('https://discord.com/api/users/@me', { headers:{Authorization:`Bearer ${token}`}});
      user = userResp.data;
      userId = user.id;
    }catch{}
  }

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Abyssus Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
body{font-family:Arial,sans-serif;background:#0a0a0a;color:#eee;margin:0;padding:0;}
header{background:#23272a;padding:25px;text-align:center;}
header h1{margin:0;color:#00ff88;}
main{max-width:1200px;margin:30px auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;}
.card{background:#1c1c1c;padding:20px;border-radius:10px;}
h2{color:#00ff88;margin-top:0;}
.progress{background:#333;height:20px;border-radius:10px;overflow:hidden;margin-top:5px;}
.progress-bar{height:100%;border-radius:10px;width:0%;background:#33ff88;}
ul{padding-left:20px;}
footer{text-align:center;padding:20px;color:#777;}
</style>
</head>
<body>
<header><h1>🔐 Abyssus Dashboard</h1></header>
<main>
<div class="card">
<h2>👤 Perfil Discord</h2>
${user? `<p>${user.username}#${user.discriminator}</p><p>ID: ${user.id}</p><img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" width="100" style="border-radius:50%;">`:'<p>No autenticado</p>'}
</div>
<div class="card">
<h2>👥 KPIs</h2>
<p>Total usuarios: <span id="totalUsuarios">—</span></p>
<p>Economía total: $<span id="economiaTotal">—</span></p>
<p>Total modlogs: <span id="totalWarns">—</span></p>
<p>Nivel promedio: <span id="promedioNivel">—</span></p>
</div>
<div class="card">
<h2>🏆 Top 5 balance</h2>
<ul id="topBalanceList"><li>—</li></ul>
</div>
<div class="card">
<h2>💎 Top 5 XP</h2>
<ul id="topXPList"><li>—</li></ul>
<div class="progress"><div class="progress-bar" id="xpBar"></div></div>
</div>
<div class="card" style="grid-column:span 2;">
<h2>📊 Gráfico balances</h2>
<canvas id="balanceChart" style="max-height:250px;"></canvas>
</div>
</main>
<footer>Última actualización: <span id="footerTime">—</span></footer>
<script>
async function fetchData(){
  try{
    const res = await fetch('/data');
    const data = await res.json();
    if(!data.ok) return;

    document.getElementById('totalUsuarios').textContent = data.totalUsuarios;
    document.getElementById('economiaTotal').textContent = data.economiaTotal;
    document.getElementById('totalWarns').textContent = data.totalWarns;
    document.getElementById('promedioNivel').textContent = data.promedioNivel.toFixed(2);

    const topB = document.getElementById('topBalanceList');
    topB.innerHTML = '';
    data.topBalance.forEach((u,i)=>{
      const li = document.createElement('li');
      li.textContent = '#' + (i+1) + ' ' + (u.username||u.id) + ' — $' + (u.balance||0);
      topB.appendChild(li);
    });

    const topX = document.getElementById('topXPList');
    topX.innerHTML = '';
    data.topXP.forEach((u,i)=>{
      const li = document.createElement('li');
      li.textContent = '#' + (i+1) + ' ' + (u.id) + ' lvl ' + u.nivel + ' — ' + u.xp + ' XP';
      topX.appendChild(li);
    });

    // Progreso medio
    const avgPct = data.topXP.reduce((s,u)=>s+(u.xp/(u.nivel*1000)),0)/data.topXP.length*100;
    document.getElementById('xpBar').style.width = Math.min(avgPct,100) + '%';

    // Chart
    const ctx = document.getElementById('balanceChart').getContext('2d');
    const chartData = {
      labels: data.topBalance.map(u=>u.username||u.id),
      datasets:[{
        label:'Balance',
        data:data.topBalance.map(u=>u.balance),
        backgroundColor:'#00ff88'
      }]
    };
    if(window.balanceChart) window.balanceChart.destroy();
    window.balanceChart = new Chart(ctx,{type:'bar',data:chartData,options:{responsive:true,maintainAspectRatio:false}});
    
    document.getElementById('footerTime').textContent = new Date(data.timestamp).toLocaleString();
  }catch(err){
    console.error(err);
  }
}

// Primera carga y cada 10s
fetchData();
setInterval(fetchData,10000);
</script>
</body>
</html>`);
});

app.listen(PORT,()=>console.log(`✅ Dashboard activo en http://localhost:${PORT}`));






















































