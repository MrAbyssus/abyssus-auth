require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

// Rutas absolutas
const economiaPath = path.join(__dirname, 'Usuario.json');
const modlogPath = path.join(__dirname, 'modlogs.json');
const nivelesPath = path.join(__dirname, 'nivelesData.json');

// Función segura para cargar JSON
function cargarJSON(ruta) {
  try {
    if (!fs.existsSync(ruta)) return [];
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (err) {
    console.error(err);
    return [];
  }
}

app.use(express.static(path.join(__dirname, 'public')));

// Ruta de datos en JSON para frontend
app.get('/api/dashboard', (req, res) => {
  const economiaData = cargarJSON(economiaPath);
  const modlogData = cargarJSON(modlogPath);
  const nivelesData = cargarJSON(nivelesPath);

  // Simulamos un usuario (o lo sacas de query/token)
  const userId = req.query.userId || '1234567890';
  const datosUsuario = economiaData.find(u => u.id === userId) || {};
  const datosNivel = nivelesData.niveles?.[userId] || {};
  const logs = [];
  for (const gId in modlogData) {
    const l = modlogData[gId]?.[userId];
    if (Array.isArray(l)) logs.push(...l);
  }

  const nivel = datosNivel.nivel || 0;
  const xp = datosNivel.xp || 0;
  const xpSiguiente = 1000 + nivel * 500;
  const progreso = Math.min(100, Math.floor((xp / xpSiguiente) * 100));

  // Última actualización
  const stats = fs.statSync(economiaPath);
  const ultimaActualizacion = new Date(stats.mtime);
  const ahora = new Date();
  const diferenciaDias = Math.floor((ahora - ultimaActualizacion)/(1000*60*60*24));
  const actualizado = diferenciaDias <= 2;

  res.json({
    perfilHTML: `<h3>${userId}</h3>`,
    economiaHTML: `<p>Balance: $${datosUsuario.balance || 0}</p>`,
    recompensasHTML: `<p>Recompensas desbloqueadas: ...</p>`,
    nivelesHTML: `<p>Nivel ${nivel} - XP: ${xp}/${xpSiguiente}</p>
                  <div class="progress-bar"><div class="progress-bar-inner" style="width:${progreso}%"></div></div>`,
    modlogHTML: `<p>Eventos recientes: ${logs.slice(-5).length}</p>`,
    actualizacionHTML: `<p>${actualizado ? '🟢 Actualizado' : '🔴 Desactualizado'}</p>`,
    progreso
  });
});

// Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔐 Dashboard activo en puerto ${PORT}`));































