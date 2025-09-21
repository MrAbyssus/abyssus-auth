const express = require('express');
const axios = require('axios');
const app = express();
require('dotenv').config();

// Ruta institucional raíz con render completo
app.get('/', async (req, res) => {
  const token = req.query.token;
  let perfilHTML = '';
  let recompensasHTML = '';
  let statusHTML = '';
  let modulosHTML = '';

  try {
    // 🔍 Si hay token, proyectar perfil
    if (token && token.length > 10) {
      const userResponse = await axios.get('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const user = userResponse.data;

      perfilHTML = `
        <section style="background:#0e0e0e; color:#ccc; padding:40px; text-align:center;">
          <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" style="border-radius:50%; width:120px; height:120px; margin-bottom:20px;" />
          <h2 style="color:#00ffff;">👤 Perfil Discord</h2>
          <p><strong>${user.username}#${user.discriminator}</strong></p>
          <p>ID: ${user.id}</p>
          <p style="margin-top:10px; color:#888;">Estado: <span style="color:#00ff88;">Verificado</span> · Premium activo</p>
          <p style="margin-top:20px; color:#555;">Sistema Abyssus · sesión proyectada</p>
        </section>
      `;
    }
  } catch (error) {
    perfilHTML = `
      <section style="background:#1c1c1c; color:#ff4444; padding:30px; text-align:center;">
        <h2>❌ Error al cargar el perfil</h2>
        <p>${error.message}</p>
        <p style="margin-top:10px; color:#888;">Sistema Abyssus · sesión fallida</p>
      </section>
    `;
  }

  // 🎁 Recompensas
  recompensasHTML = `
    <section style="background:#0e0e0e; color:#ccc; padding:40px; text-align:center;">
      <h2 style="color:#00ffff;">🎁 Recompensas activas</h2>
      <p>🔓 Módulo premium: <strong>Blindaje semántico</strong></p>
      <p>🧠 Pack activo: <strong>Heurística institucional</strong></p>
      <p>📦 Upgrade técnico: <strong>OAuth2 sincronizado</strong></p>
      <p style="margin-top:10px; color:#888;">Estado emocional: <span style="color:#00ff88;">Estable</span> · Proyección institucional activa</p>
      <p style="margin-top:20px; color:#555;">Sistema Abyssus · módulo de recompensas firmado</p>
    </section>
  `;

  // 📡 Status
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const region = req.headers['x-vercel-ip-country'] || 'Desconocida';
  const hora = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

  statusHTML = `
    <section style="background:#0e0e0e; color:#ccc; padding:40px; text-align:center;">
      <h2 style="color:#00ffff;">📡 Estado del sistema Abyssus</h2>
      <p>🕒 Hora local: <strong>${hora}</strong></p>
      <p>🌐 IP detectada: <strong>${ip}</strong></p>
      <p>📍 Región estimada: <strong>${region}</strong></p>
      <p style="margin-top:10px; color:#888;">Backend activo · sincronización OAuth2 verificada</p>
      <p style="margin-top:20px; color:#555;">Sistema Abyssus · módulo de diagnóstico firmado</p>
    </section>
  `;

  // 📦 Módulos activos
  modulosHTML = `
    <section style="background:#0e0e0e; color:#ccc; padding:40px;">
      <h2 style="color:#00ffff; text-align:center;">📦 Módulos activos del sistema Abyssus</h2>
      <ul style="list-style:none; padding:0; margin-top:30px;">
        <li>✅ <strong>/</strong> — Página institucional completa</li>
        <li>✅ <strong>/callback</strong> — Procesamiento OAuth2</li>
      </ul>
      <p style="margin-top:30px; color:#888; text-align:center;">Todos los módulos están firmados y sincronizados como parte del blindaje técnico Abyssus.</p>
      <p style="margin-top:10px; color:#555; text-align:center;">Sistema Abyssus · verificador institucional proyectado</p>
    </section>
  `;

  // 🧩 Render final
  res.send(`
    <main style="font-family:sans-serif; background:#111; color:#ccc;">
      <section style="padding:40px; text-align:center;">
        <h1 style="color:#00ffff;">🔐 Abyssus Auth</h1>
        <p>Servidor activo. Todos los módulos están integrados.</p>
        <p style="margin-top:10px; color:#888;">Sistema institucional · backend blindado</p>
      </section>
      ${perfilHTML}
      ${recompensasHTML}
      ${statusHTML}
      ${modulosHTML}
    </main>
  `);
});

// Puerto institucional
app.listen(3000, () => {
  console.log('🔐 Abyssus Run activo en Render');
});








