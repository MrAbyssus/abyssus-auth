require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
app.get('/', async (req, res) => {
  const token = req.query.token;
  let perfilHTML = '';
  let recompensasHTML = '';
  let statusHTML = '';
  let modulosHTML = '';
  let clienteHTML = '';
  let economiaHTML = '';
  let moderacionHTML = '';

  try {
    if (token && token.length > 10) {
      const userResponse = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const user = userResponse.data;

      // 🔗 Perfil
      perfilHTML = `...`;

      // 🔗 Economía
      try {
        const economiaPath = path.join(__dirname, 'economia.json');
        const economiaData = JSON.parse(fs.readFileSync(economiaPath, 'utf8'));
        const usuarioEconomia = economiaData[user.id];
        if (usuarioEconomia) {
          economiaHTML = `...`;
        }
      } catch {}

      // 🔗 Moderación
      try {
        const modlogsPath = path.join(__dirname, 'modlogs.json');
        const modlogsData = JSON.parse(fs.readFileSync(modlogsPath, 'utf8'));
        const logsUsuario = modlogsData.filter(log => log.usuario === user.id);
        if (logsUsuario.length > 0) {
          moderacionHTML = `...`;
        }
      } catch {}
    }
  } catch (error) {
    perfilHTML = `...`;
  }

  // 🔗 Recompensas, estado, cliente, módulos
  recompensasHTML = `...`;
  statusHTML = `...`;
  modulosHTML = `...`;
  clienteHTML = `...`;

  // 🔗 Render final
  res.send(`
    <main>...${perfilHTML}${recompensasHTML}${statusHTML}${modulosHTML}${clienteHTML}${economiaHTML}${moderacionHTML}...</main>
  `);
}); // ← CIERRE CORRECTO DEL BLOQUE
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔐 Abyssus Run activo en Render · Puerto ${PORT}`);
});

















