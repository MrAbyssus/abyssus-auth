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
  } catch (err) {
    console.error(`Error leyendo ${filePath}:`, err.message);
    return defaultValue;
  }
}

// Endpoint de datos para el frontend
app.get('/data', (req, res) => {
  const economiaData = safeReadJSON(economiaPath, []);
  const nivelesData  = safeReadJSON(nivelesPath, { niveles: {} });
  const modlogData   = safeReadJSON(modlogsPath, {});

  const totalUsuarios = Array.isArray(economiaData) ? economiaData.length : 0;
  const economiaTotal = economiaData.reduce((s, u) => s + (Number(u.balance) || 0), 0);

  let totalWarns = 0;
  try {
    totalWarns = Object.values(modlogData).flatMap(x => Object.values(x).flat()).length;
  } catch {}

  const nivelesArr = Object.entries(nivelesData.niveles || {}).map(([id, v]) => ({
    id, xp: Number(v.xp) || 0, nivel: Number(v.nivel) || 0
  }));

  const promedioNivel = nivelesArr.length ? (nivelesArr.reduce((s,i)=>s+i.nivel,0)/nivelesArr.length) : 0;
  const topXP = nivelesArr.slice().sort((a,b)=>b.xp - a.xp).slice(0,10);
  const topNivel = nivelesArr.slice().sort((a,b)=>b.nivel - a.nivel).slice(0,10);
  const topBalance = economiaData.slice().sort((a,b) => (b.balance||0)-(a.balance||0)).slice(0,10);

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

// Servir frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ Abyssus Dashboard activo en http://localhost:${PORT}`);
});


















































