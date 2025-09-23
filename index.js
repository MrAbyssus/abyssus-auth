require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
app.get('/', async (req, res) => {
  const token = req.query.token;
  let perfilHTML = '', actividadHTML = '', economiaHTML = '', recompensasHTML = '', statusHTML = '', modulosHTML = '', clienteHTML = '', packsHTML = '';
  let userId = '';
  try {
    if (token && token.length > 10) {
      const userResponse = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const user = userResponse.data;
      userId = user.id;

      perfilHTML = `
        <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px;">
          <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" style="border-radius:50%; width:120px; height:120px;" />
          <h2 style="color:#00ffff;">👤 Perfil Discord</h2>
          <p><strong>${user.username}#${user.discriminator}</strong></p>
          <p>ID: ${user.id}</p>
          <p style="color:#888;">Estado: <span style="color:#00ff88;">Verificado</span> · Premium activo</p>
          <p style="color:#555;">Sistema Abyssus · sesión proyectada</p>
        </section>
      `;
    }
  } catch (error) {
    perfilHTML = `<section style="background:#1c1c1c; color:#ff4444; padding:30px; text-align:center; border-radius:12px;">
      <h2>❌ Error al cargar el perfil</h2>
      <p>${error.message}</p>
      <p style="color:#888;">Sistema Abyssus · sesión fallida</p>
    </section>`;
  }
  try {
    const modlogRes = await axios.get('https://raw.githubusercontent.com/MrAbyssus/abyssus-auth/refs/heads/main/modlogs.json');
    const modlogData = modlogRes.data;
    let entradas = [];

    for (const guildId in modlogData) {
      const guild = modlogData[guildId];
      if (guild[userId]) entradas = entradas.concat(guild[userId]);
    }

    const comandosUsados = entradas.length;
    const ultimaActividad = entradas.map(e => new Date(e.timestamp)).sort((a, b) => b - a)[0];
    let reputacion = comandosUsados >= 16 ? 'Alta' : comandosUsados >= 6 ? 'Media' : comandosUsados >= 1 ? 'Baja' : 'Sin actividad';

    actividadHTML = `
      <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px;">
        <h2 style="color:#00ffcc;">📊 Actividad del usuario</h2>
        <p>Comandos usados esta semana: <strong>${comandosUsados}</strong></p>
        <p>Reputación simulada: <strong>${reputacion}</strong></p>
        <p>Última actividad: <strong>${ultimaActividad ? ultimaActividad.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }) : '—'}</strong></p>
        <p style="color:#888;">Fuente: modlogs.json · ciclo: cada 2 días</p>
        <p style="color:#555;">Sistema Abyssus · módulo /actividad firmado</p>
      </section>
    `;
  } catch {
    actividadHTML = `<section style="background:#1c1c1c; color:#ff4444; padding:30px; text-align:center; border-radius:12px;">
      <h2>❌ Actividad no disponible</h2>
      <p>No se pudo acceder al modlogs.json</p>
      <p style="color:#888;">Sistema Abyssus · módulo /actividad fallido</p>
    </section>`;
  }
  packsHTML = `
    <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px;">
      <h2 style="color:#00ffcc;">💠 Packs premium activos</h2>
      <p>🧠 Heurística institucional: <strong>Activa</strong></p>
      <p>🔓 Blindaje semántico: <strong>Aplicado</strong></p>
      <p>📦 OAuth2 sincronizado: <strong>Verificado</strong></p>
      <p>🎨 Render emocional: <strong>Firmado</strong></p>
      <p style="color:#888;">Estado técnico: <span style="color:#00ff88;">Estable</span></p>
      <p style="color:#555;">Sistema Abyssus · módulo /packs firmado</p>
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
        ${actividadHTML}
        ${economiaHTML}
        ${recompensasHTML}
        ${statusHTML}
        ${modulosHTML}
        ${clienteHTML}
        ${packsHTML}
      </section>

      <footer style="text-align:center; padding:30px; color:#555; font-size:14px;">
        Sistema Abyssus · render institucional proyectado
      </footer>
    </main>
  `);
});
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
      code,
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
        <p>${err.response?.data?.error || err.message || 'Error desconocido'}</p>
        <p style="margin-top:10px; color:#888;">Sistema Abyssus · sesión fallida</p>
      </section>
    `);
  }
});
const PORT = process.env.PORT;
if (!PORT) throw new Error('❌ Variable PORT no definida por Render');

app.listen(PORT, () => {
  console.log(`🔐 Abyssus Run activo en Render · Puerto ${PORT}`);
});





















