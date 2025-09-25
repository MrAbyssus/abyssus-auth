require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const economiaData = require('./Usuario.json');
const modlogData = require('./modlogs.json');
const mascotasData = JSON.parse(fs.readFileSync('./mascotas.json', 'utf8'));
const rolesData = JSON.parse(fs.readFileSync('./Roles.json', 'utf8')); // ← integración de roles
const app = express();

app.get('/activar', (req, res) => {
  res.send('🟢 Render activado · entorno despierto');
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code || typeof code !== 'string' || code.length < 10) {
    return res.send(`<section style="font-family:sans-serif; background:#1c1c1c; color:#ff4444; padding:30px; text-align:center;">
      <h2>❌ Código OAuth2 no recibido</h2>
      <p>Discord no envió el parámetro <code>code</code> o está incompleto.</p>
    </section>`);
  }

  try {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.REDIRECT_URI?.trim(),
    }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const accessToken = tokenResponse.data.access_token;
    res.redirect(`/?token=${accessToken}`);
  } catch (error) {
    const errorMsg = error.response?.data?.error || error.message || 'Error desconocido';
    res.send(`<section style="font-family:sans-serif; background:#1c1c1c; color:#ff4444; padding:30px; text-align:center;">
      <h2>❌ Error al procesar el código OAuth2</h2>
      <p>${errorMsg}</p>
    </section>`);
  }
});

app.get('/', async (req, res) => {
  const token = req.query.token;
  let perfilHTML = '', economiaHTML = '', recompensasHTML = '', statusHTML = '', clienteHTML = '', modlogHTML = '', petHTML = '', estadoHTML = '', actualizacionHTML = '', panelStaffHTML = '', logVisualHTML = '';
  let userId = '', guildId = 'abyssus';
  let user = null;

  try {
    if (token && token.length > 10) {
      const userResponse = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      user = userResponse.data;
      userId = user.id;

      perfilHTML = `
        <section>
          <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" style="border-radius:50%; width:100px; height:100px;" />
          <h2>👤 Perfil Discord</h2>
          <p><strong>${user.username}#${user.discriminator}</strong></p>
          <p>ID: ${user.id}</p>
          <p>Estado: <span style="color:#00ff88;">Verificado</span></p>
        </section>
      `;
    }
  } catch (error) {
    perfilHTML = `<section><h2>❌ Error al cargar el perfil</h2><p>${error.message}</p></section>`;
  }

  const rolUsuario = rolesData[userId] || 'usuario';
  if (['admin', 'dev', 'staff', 'moderador'].includes(rolUsuario)) {
    panelStaffHTML = `
      <section style="background:#1c1c1c; padding:20px; border-radius:10px; box-shadow:0 0 12px #FFD70033;">
        <h2 style="color:#FFD700;">🔧 Panel técnico</h2>
        <p style="color:#ccc;">Rol detectado: <strong>${rolUsuario}</strong></p>
        <ul style="padding-left:20px;">
          <li>📌 Acceso a expulsiones</li>
          <li>📌 Override de comandos</li>
          <li>📌 Logging activo</li>
        </ul>
      </section>
    `;

    logVisualHTML = `
      <section style="background:#111; padding:20px; border-radius:10px; box-shadow:0 0 12px #00ffff33;">
        <h2 style="color:#00ffff;">📥 Registro de acceso técnico</h2>
        <p>Usuario: <strong>${userId}</strong></p>
        <p>Rol detectado: <strong style="color:#FFD700;">${rolUsuario}</strong></p>
        <p>Archivo de roles: <code>Roles.json</code></p>
        <p>Estado de lectura: <strong style="color:#00ff88;">Correcta</strong></p>
      </section>
    `;
  }

  // ... (todo tu código de economía, mascota, recompensas, estado, modlog, actualizacionHTML se mantiene igual)

  res.send(`
    <main style="font-family:'Segoe UI', sans-serif; background:#0a0a0a; color:#e0e0e0; margin:0; padding:0;">
      <header style="padding:40px 30px; text-align:center; background:#111; box-shadow:0 0 25px #00ffff55;">
        <h1 style="color:#00ffff; font-size:38px; margin-bottom:10px;">🔐 Abyssus Dashboard</h1>
        <p style="font-size:17px; color:#bbb;">Servidor activo · módulos integrados</p>
        <p style="margin-top:10px; color:#666;">Sistema Abyssus · backend blindado</p>
      </header>

      <section style="max-width:1100px; margin:50px auto; display:grid; grid-template-columns:1fr 1fr; gap:40px;">
        ${perfilHTML}
        ${economiaHTML}
        ${clienteHTML}
        ${estadoHTML}
        ${recompensasHTML}
        ${statusHTML}
        ${petHTML}
        ${modlogHTML}
        ${actualizacionHTML}
        ${panelStaffHTML}
        ${logVisualHTML}
      </section>

      <footer style="text-align:center; padding:30px; color:#777; font-size:13px; border-top:1px solid #222;">
        Sistema Abyssus · render institucional proyectado
      </footer>
    </main>
  `);
});

const PORT = process.env.PORT;
if (!PORT) throw new Error('❌ Variable PORT no definida por Render');

app.listen(PORT, () => {
  console.log(`🔐 Abyssus Run activo en Render · Puerto ${PORT}`);
});




















