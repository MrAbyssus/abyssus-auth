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

// Endpoint de datos
app.get('/data', (req,res)=>{
  const economiaData = safeReadJSON(economiaPath, []);
  const nivelesData = safeReadJSON(nivelesPath, {niveles:{}});
  const modlogsData = safeReadJSON(modlogsPath, {});

  const totalUsuarios = economiaData.length;
  const economiaTotal = economiaData.reduce((a,b)=>a+(Number(b.balance)||0),0);
  const totalWarns = Object.values(modlogsData).flatMap(g=>Object.values(g).flat()).length;

  const nivelesArr = Object.entries(nivelesData.niveles).map(([id,v])=>({id,xp:v.xp||0,nivel:v.nivel||0}));
  const promedioNivel = nivelesArr.length? nivelesArr.reduce((a,b)=>a+b.nivel,0)/nivelesArr.length : 0;
  const topXP = nivelesArr.slice().sort((a,b)=>b.xp-a.xp).slice(0,5);
  const topBalance = economiaData.slice().sort((a,b)=>(b.balance||0)-(a.balance||0)).slice(0,5);

  let lastUpdate = new Date();
  if(fs.existsSync(economiaPath)) lastUpdate = fs.statSync(economiaPath).mtime;

  res.json({
    ok:true,
    timestamp:new Date(),
    totalUsuarios,
    economiaTotal,
    totalWarns,
    promedioNivel,
    topXP,
    topBalance,
    lastUpdate: lastUpdate.toISOString()
  });
});

// Servir dashboard
app.get('/', (req,res)=>{
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Abyssus Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
body{font-family:sans-serif;background:#0a0a0a;color:#e0e0e0;margin:0;padding:0;}
header{padding:20px;text-align:center;background:#23272a;}
header h1{color:#00ff88;}
main{max-width:1200px;margin:20px auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;}
.card{background:#1c1c1c;padding:15px;border-radius:12px;}
h2{color:#00ff88;}
.progress{background:#333;height:15px;border-radius:999px;overflow:hidden;margin-top:5px;}
.bar{height:100%;width:0;background:#00ff88;transition:width 0.5s;}
ul{padding-left:20px;}
</style>
</head>
<body>
<header>
<h1>🔐 Abyssus Dashboard</h1>
<p id="lastSync">Última actualización: —</p>
</header>
<main>
<div class="card">
<h2>👥 Usuarios registrados</h2>
<p id="totalUsuarios">—</p>
</div>

<div class="card">
<h2>💰 Economía total</h2>
<p id="economiaTotal">—</p>
</div>

<div class="card">
<h2>🧾 Modlogs / Advertencias</h2>
<p id="totalWarns">—</p>
</div>

<div class="card">
<h2>📈 Nivel promedio</h2>
<p id="promedioNivel">—</p>
<div class="progress"><div class="bar" id="nivelBar"></div></div>
</div>

<div class="card">
<h2>🏆 Top 5 balances</h2>
<ul id="topBalanceList"></ul>
</div>

<div class="card">
<h2>📊 Top XP</h2>
<ul id="topXPList"></ul>
</div>

<div class="card">
<h2>📊 Gráfico de balances</h2>
<canvas id="balanceChart" height="200"></canvas>
</div>
</main>

<script>
const fmt=n=>typeof n==='number'?n.toLocaleString():n;
const ctx=document.getElementById('balanceChart').getContext('2d');
const balanceChart=new Chart(ctx,{type:'bar',data:{labels:[],datasets:[{label:'Balance',data:[],backgroundColor:'#00d1b2'}]},options:{responsive:true,maintainAspectRatio:false}});

async function updateDashboard(){
  try{
    const res=await fetch('/data',{cache:'no-store'});
    const data=await res.json();
    if(!data.ok)return;

    document.getElementById('totalUsuarios').textContent=fmt(data.totalUsuarios);
    document.getElementById('economiaTotal').textContent='$'+fmt(data.economiaTotal);
    document.getElementById('totalWarns').textContent=fmt(data.totalWarns);
    document.getElementById('promedioNivel').textContent=data.promedioNivel.toFixed(2);
    document.getElementById('nivelBar').style.width=Math.min(100,data.promedioNivel*10)+'%';

    const topBalanceList=document.getElementById('topBalanceList');
    topBalanceList.innerHTML='';
    data.topBalance.forEach((u,i)=>{
      const li=document.createElement('li');
      li.textContent=\`#\${i+1} \${u.username||u.id||'ID'} — $\${fmt(u.balance||0)}\`;
      topBalanceList.appendChild(li);
    });

    const topXPList=document.getElementById('topXPList');
    topXPList.innerHTML='';
    data.topXP.forEach((u,i)=>{
      const li=document.createElement('li');
      li.textContent=\`#\${i+1} \${u.id} — XP \${u.xp} | lvl \${u.nivel}\`;
      topXPList.appendChild(li);
    });

    // Chart
    const topChart=data.topBalance.slice(0,6);
    balanceChart.data.labels=topChart.map(u=>u.username||u.id||'ID');
    balanceChart.data.datasets[0].data=topChart.map(u=>u.balance||0);
    balanceChart.update();

    document.getElementById('lastSync').textContent='Última actualización: '+new Date(data.timestamp).toLocaleString();

  }catch(err){console.error('Error dashboard:',err);}
}

updateDashboard();
setInterval(updateDashboard,10000);
</script>
</body>
</html>`);
});

app.listen(PORT,()=>console.log(`✅ Dashboard activo en http://localhost:${PORT}`));



















































