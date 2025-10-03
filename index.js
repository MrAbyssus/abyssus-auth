require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.static('public'));

app.get('/', async (req, res) => {
  const userId = req.query.userId || '';
  let nivelesHTML = '';

  if (userId) {
    try {
      const endpoint = `${process.env.BOT_API_URL}/api/niveles/${userId}`;
      const tokenBot = process.env.API_TOKEN;

      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${tokenBot}` }
      });

      const data = response.data;
      const progreso = Math.min(100, Math.floor((data.xp / data.xpSiguiente) * 100));

      // Barra visual con colores tipo Discord
      const barraTotal = 20;
      const filled = Math.floor((progreso / 100) * barraTotal);
      const barra = '🟦'.repeat(filled) + '⬛'.repeat(barraTotal - filled);

      // Colores dinámicos según nivel
      const colores = ['#2ECC71','#3498DB','#9B59B6','#E67E22','#E74C3C'];
      const color = colores[data.nivel % colores.length];

      nivelesHTML = `
        <div style="border:1px solid #444; border-radius:10px; padding:20px; background:#1e1e2f; max-width:400px; margin:auto;">
          <div style="display:flex; align-items:center; margin-bottom:15px;">
            <img src="https://cdn.discordapp.com/avatars/${userId}/${data.avatar || 'default.png'}.png" style="border-radius:50%; width:70px; height:70px; margin-right:15px;" />
            <h2 style="margin:0; color:#fff;">Nivel ${data.nivel}</h2>
          </div>
          <p style="margin:5px 0;">⭐ XP: <strong>${data.xp} / ${data.xpSiguiente}</strong></p>
          <p style="margin:5px 0;">📈 Progreso: <span style="font-family:monospace;">${barra}</span> (${progreso}%)</p>
          <div style="height:10px; background:#555; border-radius:5px; margin-top:10px;">
            <div style="width:${progreso}%; background:${color}; height:100%; border-radius:5px;"></div>
          </div>
        </div>
      `;
    } catch (err) {
      nivelesHTML = `<p style="color:red;">❌ Error al consultar API: ${err.message}</p>`;
    }
  }

  res.send(`
    <html>
    <head>
      <title>Abyssus Dashboard</title>
      <style>
        body { background:#0a0a0a; color:#eee; font-family:'Segoe UI', sans-serif; padding:40px; }
        input, button { padding:8px; margin-top:10px; }
        button { cursor:pointer; background:#5865F2; color:#fff; border:none; border-radius:5px; }
        h1 { text-align:center; margin-bottom:30px; }
      </style>
    </head>
    <body>
      <h1>📊 Abyssus Dashboard</h1>
      <form method="get" style="text-align:center;">
        <input type="text" name="userId" placeholder="ID Usuario" style="width:250px;" />
        <button type="submit">Consultar</button>
      </form>
      <div style="margin-top:40px;">
        ${nivelesHTML}
      </div>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🌐 Dashboard activo en puerto ${PORT}`));



























