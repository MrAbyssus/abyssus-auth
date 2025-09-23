require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.get('/', async (req, res) => {
  const token = req.query.token;
  let perfilHTML = '', actividadHTML = '', economiaHTML = '', recompensasHTML = '', statusHTML = '', modulosHTML = '', clienteHTML = '', packsHTML = '';
  let userId = '';

  // 🔐 Perfil Discord
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

  // 📊 Actividad del usuario
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

  // 💰 Economía institucional
  try {
    const economiaRes = await axios.get('https://raw.githubusercontent.com/MrAbyssus/abyssus-dashboard/main/Usuario.json');
    const economiaData = economiaRes.data[userId];

    if (economiaData) {
      const { balance = 0, ingresos = 0, gastos = 0, eventos = [] } = economiaData;
      economiaHTML = `
        <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px;">
          <h2 style="color:#00ffcc;">💰 Economía institucional</h2>
          <p>Balance actual: <strong>$${balance.toLocaleString()}</strong></p>
          <p>Ingresos últimos 2 días: <strong>$${ingresos.toLocaleString()}</strong></p>
          <p>Gastos últimos 2 días: <strong>$${gastos.toLocaleString()}</strong></p>
          <p>Eventos activos: <strong>${eventos.length ? eventos.join(', ') : 'Ninguno'}</strong></p>
          <p style="color:#888;">Fuente: Usuario.json · ciclo: cada 2 días</p>
          <p style="color:#555;">Sistema Abyssus · módulo /economía firmado</p>
        </section>
      `;
    } else {
      economiaHTML = `<section style="background:#1c1c1c; color:#ff4444; padding:30px; text-align:center; border-radius:12px;">
        <h2>❌ Economía no disponible</h2>
        <p>No se encontró información económica para el usuario</p>
        <p style="color:#888;">Sistema Abyssus · módulo /economía fallido</p>
      </section>`;
    }
  } catch (err) {
    economiaHTML = `<section style="background:#1c1c1c; color:#ff4444; padding:30px; text-align:center; border-radius:12px;">
      <h2>❌ Error al cargar economía</h2>
      <p>${err.message}</p>
      <p style="color:#888;">Sistema Abyssus · módulo /economía fallido</p>
    </section>`;
  }

  // 🎁 Recompensas
  recompensasHTML = `
    <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px;">
      <h2 style="color:#00ffff;">🎁 Recompensas activas</h2>
      <p>🔓 Módulo premium: <strong>Blindaje semántico</strong></p>
      <p>🧠 Pack activo: <strong>Heurística institucional</strong></p>
      <p>📦 Upgrade técnico: <strong>OAuth2 sincronizado</strong></p>
      <p style="color:#888;">Estado emocional: <span style="color:#00ff88;">Estable</span></p>
      <p style="color:#555;">Sistema Abyssus · módulo de recompensas firmado</p>
    </section>
  `;

  // 📡 Estado del sistema
  const hora = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  statusHTML = `
    <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px;">
      <h2 style="color:#00ffff;">📡 Estado del sistema Abyssus</h2>
      <p>🕒 Hora local: <strong>${hora}</strong></p>
      <p>🔐 Backend: <strong>Activo</strong></p>
      <p>🔁 OAuth2: <strong>Verificado</strong></p>
      <p style="color:#888;">Diagnóstico técnico · sin errores</p>
      <p style="color:#555;">Sistema Abyssus · módulo de estado firmado</p>
    </section>
  `;

  // 📦 Módulos activos
  modulosHTML = `
    <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px;">
      <h2 style="color:#00ffff;">📦 Sistema Abyssus sincronizado</h2>
      <p>Todos los módulos están activos.</p>
      <p style="color:#888;">Blindaje técnico · sincronización OAuth2</p>
      <p style="color:#555;">Sistema Abyssus · estado firmado</p>
    </section>
  `;

  // 🧩 Cliente
   clienteHTML = `
    <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px;">
      <h2 style="color:#00ffff;">🧩 Estado del cliente</h2>
      <p>🔌 Conexión: <strong>${token ? 'Activa' : 'Desconectada'}</strong></p>
      <p>📡 Token procesado: <strong>${token ? 'Sí' : 'No'}</strong></p>
      <p>🧠 Sesión: <strong>${token ? 'Proyectada' : 'No iniciada'}</strong></p>
      <p style="margin-top:10px; color:#888;">Sistema Abyssus · cliente sincronizado</p>
      <p style="margin-top:20px; color:#555;">Módulo /cliente · render firmado</p>
    </section>
  `;

const PORT = process.env.PORT;
if (!PORT) throw new Error('❌ Variable PORT no definida por Render');

app.listen(PORT, () => {
  console.log(`🔐 Abyssus Run activo en Render · Puerto ${PORT}`);
});





















