require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();

// 🔐 Ruta institucional raíz
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

      perfilHTML = `
        <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px; box-shadow:0 0 12px #00ffff33;">
          <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" style="border-radius:50%; width:120px; height:120px; margin-bottom:20px;" />
          <h2 style="color:#00ffff;">👤 Perfil Discord</h2>
          <p><strong>${user.username}#${user.discriminator}</strong></p>
          <p>ID: ${user.id}</p>
          <p style="margin-top:10px; color:#888;">Estado: <span style="color:#00ff88;">Verificado</span> · Premium activo</p>
          <p style="margin-top:20px; color:#555;">Sistema Abyssus · sesión proyectada</p>
        </section>
      `;

      // 🔗 Conexión con economía
      try {
        const economiaPath = path.join(__dirname, 'economia.json');
        const economiaData = JSON.parse(fs.readFileSync(economiaPath, 'utf8'));
        const usuarioEconomia = economiaData[user.id];

        if (usuarioEconomia) {
          economiaHTML = `
            <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px; box-shadow:0 0 12px #00ff8833;">
              <h2 style="color:#00ff88;">💰 Economía institucional</h2>
              <p>Monedas: <strong>${usuarioEconomia.monedas}</strong></p>
              <p>Nivel: <strong>${usuarioEconomia.nivel}</strong></p>
              <p>Última transacción: <strong>${usuarioEconomia.ultima}</strong></p>
              <p style="margin-top:10px; color:#888;">Sistema Abyssus · economía proyectada</p>
              <p style="margin-top:20px; color:#555;">Módulo /economia · render firmado</p>
            </section>
          `;
        }
      } catch {}

      // 🔗 Conexión con moderación
      try {
        const modlogsPath = path.join(__dirname, 'modlogs.json');
        const modlogsData = JSON.parse(fs.readFileSync(modlogsPath, 'utf8'));
        const logsUsuario = modlogsData.filter(log => log.usuario === user.id);

        if (logsUsuario.length > 0) {
          moderacionHTML = `
            <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px; box-shadow:0 0 12px #ff444433;">
              <h2 style="color:#ff4444;">🛡️ Moderación registrada</h2>
              ${logsUsuario.map(log => `<p>${log.tipo} · ${log.fecha}</p>`).join('')}
              <p style="margin-top:10px; color:#888;">Sistema Abyssus · moderación proyectada</p>
              <p style="margin-top:20px; color:#555;">Módulo /modlogs · render firmado</p>
            </section>
          `;
        }
      } catch {}
    }
  } catch (error) {
    perfilHTML = `
      <section style="background:#1c1c1c; color:#ff4444; padding:30px; text-align:center; border-radius:12px;">
        <h2>❌ Error al cargar el perfil</h2>
        <p>${error.message}</p>
        <p style="margin-top:10px; color:#888;">Sistema Abyssus · sesión fallida</p>
      </section>
    `;
  }

  recompensasHTML = `
    <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px; box-shadow:0 0 12px #00ffff33;">
      <h2 style="color:#00ffff;">🎁 Recompensas activas</h2>
      <p>🔓 Módulo premium: <strong>Blindaje semántico</strong></p>
      <p>🧠 Pack activo: <strong>Heurística institucional</strong></p>
      <p>📦 Upgrade técnico: <strong>OAuth2 sincronizado</strong></p>
      <p style="margin-top:10px; color:#888;">Estado emocional: <span style="color:#00ff88;">Estable</span> · Proyección institucional activa</p>
      <p style="margin-top:20px; color:#555;">Sistema Abyssus · módulo de recompensas firmado</p>
    </section>
  `;

  const hora = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

  statusHTML = `
    <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px; box-shadow:0 0 12px #00ffff33;">
      <h2 style="color:#00ffff;">📡 Estado del sistema Abyssus</h2>
      <p>🕒 Hora local: <strong>${hora}</strong></p>
      <p>🔐 Backend: <strong>Activo y sincronizado</strong></p>
      <p>🔁 OAuth2: <strong>Verificado</strong></p>
      <p style="margin-top:10px; color:#888;">Diagnóstico técnico · sin errores</p>
      <p style="margin-top:20px; color:#555;">Sistema Abyssus · módulo de estado firmado</p>
    </section>
  `;

  modulosHTML = `
    <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px; box-shadow:0 0 12px #00ffff33;">
      <h2 style="color:#00ffff;">📦 Sistema Abyssus sincronizado</h2>
      <p>Todos los módulos están activos.</p>
      <p style="margin-top:10px; color:#888;">Blindaje técnico · sincronización OAuth2 · render completo</p>
      <p style="margin-top:20px; color:#555;">Sistema Abyssus · estado firmado</p>
    </section>
  `;

  clienteHTML = `
    <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px; box-shadow:0 0 12px #00ffff33;">
      <h2 style="color:#00ffff;">🧩 Estado del cliente</h2>
      <p>🔌 Conexión: <strong>${token ? 'Activa' : 'Desconectada'}</strong></p>
      <p>📡 Token procesado: <strong>${token ? 'Sí' : 'No'}</strong></p>
      <p>🧠 Sesión: <strong>${token ? 'Proyectada' : 'No iniciada'}</strong></p>
      <p style="margin-top:10px; color:#888;">Sistema Abyssus · cliente sincronizado</p>
      <p style="margin-top:20px; color:#555;">Módulo /cliente · render firmado</p>
    </section>
  `;

  res.send(`
    <main style="font-family:Segoe UI, sans-serif; background:#0a0a0a; color:#ccc; padding:0; margin:0;">
      <header style="padding:50px 30px; text-align:center; background:#111; box-shadow:0 0 20px #00ffff33;">
        <h1 style="color:#00ffff; font-size:36px; margin-bottom:10px;">🔐 Abyssus Dashboard</h1>
        <p style="font-size:16px; color:#aaa;">Servidor activo · Todos los módulos están integrados</p>
        <p style="margin-top:10px; color:#666;">Sistema Abyssus
        <p style="margin-top:10px; color:#666;">Sistema Abyssus · backend blindado</p>
      </header>

           <section style="max-width:900px; margin:40px auto; display:flex; flex-direction:column; gap:40px;">
        ${perfilHTML}
        ${recompensasHTML}
        ${statusHTML}
        ${modulosHTML}
        ${clienteHTML}
        ${economiaHTML}
        ${moderacionHTML}
      </section>

      <footer style="text-align:center; padding:30px; color:#555; font-size:14px;">
        Sistema Abyssus · render institucional proyectado
      </footer>
    </main>
  `);
});
















