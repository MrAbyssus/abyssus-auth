require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

// 🔐 Ruta institucional raíz
app.get('/', async (req, res) => {
  const token = req.query.token;
  let perfilHTML = '';
  let actividadHTML = '';
  let recompensasHTML = '';
  let statusHTML = '';
  let modulosHTML = '';
  let clienteHTML = '';
  let packsHTML = '';
  

  let userId = '';

  try {
    if (token && token.length > 10) {
      const userResponse = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const user = userResponse.data;
      userId = user.id;

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

  try {
    const modlogURL = 'https://raw.githubusercontent.com/MrAbyssus/abyssus-auth/refs/heads/main/modlogs.json';
    const modlogRes = await axios.get(modlogURL);
    const modlogData = modlogRes.data;

    let entradas = [];

    for (const guildId in modlogData) {
      const guild = modlogData[guildId];
      if (guild[userId]) {
        entradas = entradas.concat(guild[userId]);
      }
    }

    const comandosUsados = entradas.length;
    const ultimaActividad = entradas
      .map(e => new Date(e.timestamp))
      .sort((a, b) => b - a)[0];

    let reputacion = '—';
    if (comandosUsados >= 16) reputacion = 'Alta';
    else if (comandosUsados >= 6) reputacion = 'Media';
    else if (comandosUsados >= 1) reputacion = 'Baja';
    else reputacion = 'Sin actividad';

    actividadHTML = `
      <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px; box-shadow:0 0 12px #00ffcc33;">
        <h2 style="color:#00ffcc;">📊 Actividad del usuario</h2>
        <p>Comandos usados esta semana: <strong>${comandosUsados}</strong></p>
        <p>Reputación simulada: <strong>${reputacion}</strong></p>
        <p>Última actividad: <strong>${ultimaActividad ? ultimaActividad.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }) : '—'}</strong></p>
        <p style="margin-top:10px; color:#888;">Fuente: <strong>modlogs.json</strong> · ciclo de actualización: <strong>cada 2 días</strong> · trazabilidad activa</p>
        <p style="margin-top:20px; color:#555;">Sistema Abyssus · módulo /actividad proyectado</p>
      </section>
    `;
  } catch (err) {
    actividadHTML = `
      <section style="background:#1c1c1c; color:#ff4444; padding:30px; text-align:center; border-radius:12px;">
        <h2>❌ Actividad no disponible</h2>
        <p>No se pudo acceder al modlogs.json</p>
        <p style="margin-top:10px; color:#888;">Sistema Abyssus · módulo /actividad fallido</p>
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

  packsHTML = `
    <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px; box-shadow:0 0 12px #00ffcc33;">
      <h2 style="color:#00ffcc;">💠 Packs premium activos</h2>
      <p>🧠 Heurística institucional: <strong>Activa</strong></p>
      <p>🔓 Blindaje semántico: <strong>Aplicado</strong></p>
      <p>📦 OAuth2 sincronizado: <strong>Verificado</strong></p>
      <p>🎨 Render emocional: <strong>Firmado</strong></p>
      <p style="margin-top:10px; color:#888;">Estado técnico: <span style="color:#00ff88;">Estable</span> · Sincronización completa</p>
      <p style="margin-top:20px; color:#555;">Sistema Abyssus · módulo /packs firmado</p>
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






















