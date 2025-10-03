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
      const barra = '▭'.repeat(Math.floor(progreso / 5)).padEnd(20, '▭');

      nivelesHTML = `
        <h2>📈 Nivel usuario</h2>
        <p>Nivel: <strong>${data.nivel}</strong></p>
        <p>XP: <strong>${data.xp} / ${data.xpSiguiente}</strong></p>
        <p>Progreso: <span style="font-family:monospace;">${barra}</span> (${progreso}%)</p>
      `;
    } catch (err) {
      nivelesHTML = `<p style="color:red;">❌ Error al consultar API: ${err.message}</p>`;
    }
  }

  res.send(`
    <html>
    <body style="background:#111; color:#eee; font-family:sans-serif; padding:30px;">
      <h1>📊 Dashboard Abyssus</h1>
      <form method="get">
        <input type="text" name="userId" placeholder="ID Usuario" style="padding:5px; width:250px;" />
        <button type="submit">Consultar</button>
      </form>
      ${nivelesHTML}
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🌐 Dashboard activo en puerto ${PORT}`));


























