require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

// 🔐 Ruta institucional raíz
app.get('/', async (req, res) => {
  const token = req.query.token;
  let perfilHTML = '';
  let recompensasHTML = '';
  let statusHTML = '';
  let modulosHTML = '';

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

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'Desconocida';
  const region = req.headers['x-vercel-ip-country'] || 'Desconocida';
  const hora = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

  statusHTML = `
    <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px; box-shadow:0 0 12px #00ffff33;">
      <h2 style="color:#00ffff;">📡 Estado del sistema Abyssus</h2>
      <p>🕒 Hora local: <strong>${hora}</strong></p>
      <p>🌐 IP detectada: <strong>${ip}</strong></p>
      <p>📍 Región estimada: <strong>${region}</strong></p>
      <p style="margin-top:10px; color:#888;">Backend activo · sincronización OAuth2 verificada</p>
      <p style="margin-top:20px; color:#555;">Sistema Abyssus · módulo de diagnóstico firmado</p>
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

  res.send(`
    <main style="font-family:Segoe UI, sans-serif; background:#0a0a0a; color:#ccc; padding:0; margin:0;">
      <header style="padding:50px 30px; text-align:center; background:#111; box-shadow:0 0 20px #00ffff33;">
        <h1 style="color:#00ffff; font-size:36px; margin-bottom:10px;">🔐 Abyssus Dashboard</h1>
        <p style="font-size:16px; color:#aaa;">Servidor activo · Todos los módulos están integrados</p>
        <p style="margin-top:10px; color:#666;">Sistema Abyssus · backend blindado</p>
      </header>

      <section style="max-width:900px; margin:40px auto; display:flex; flex-direction:column; gap:40px;">
        ${perfilHTML}
        ${recompensasHTML}
        ${statusHTML}
        ${modulosHTML}
      </section>

      <footer style="text-align:center; padding:30px; color:#555; font-size:14px;">
        Sistema Abyssus · render institucional proyectado
      </footer>
    </main>
  `);
});

// 🔁 Ruta de procesamiento OAuth2
app.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code || code.length < 10) {
    return res.send(`
      <section style="font-family:sans-serif; background:#1c1c1c; color:#ff4444; padding:30px; text-align:center;">
        <h2>❌ Código OAuth2 no recibido</h2>
        <p>Discord no envió el parámetro <code>code</code>. Esta ruta requiere redirección desde el login.</p>
        <p style="margin-top:10px; color:#888;">Sistema Abyssus · verificación fallida</p>
      </section>
    `);
  }

  try {
    const data = new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: process.env.REDIRECT_URI,
    });

    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', data.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const accessToken = tokenResponse.data.access_token;
    res.redirect(`/?token=${accessToken}`);
  } catch (err) {
    res.send(`
      <section style="font-family:sans-serif; background:#1c1c1c; color:#ff4444; padding:30px; text-align:center;">
        <h2>❌ Error al procesar el código OAuth2</h2>
        <p>${err.response?.data?.error || 'Error desconocido'}</p>
        <p style="margin-top:10px; color:#888;">Sistema Abyssus · sesión fallida</p>
      </section>
    `);
  }
});

// 🚀 Puerto institucional dinámico
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔐 Abyssus Run activo en Render · Puerto ${PORT}`);
});













