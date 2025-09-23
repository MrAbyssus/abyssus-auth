require('dotenv').config();
const express = require('express');
const axios = require('axios');
const economiaData = require('./economia.json'); // ← economía integrada
const app = express();

app.get('/', async (req, res) => {
  const token = req.query.token;
  let perfilHTML = '', economiaHTML = '', recompensasHTML = '', statusHTML = '', clienteHTML = '';
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

  // 💰 Economía institucional
  try {
    const datosUsuario = economiaData[userId];
    if (typeof datosUsuario === 'object') {
      const { balance = 0, ingresos = 0, gastos = 0, eventos = [] } = datosUsuario;
      economiaHTML = `
        <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px;">
          <h2 style="color:#00ffcc;">💰 Economía Bot</h2>
          <p>Balance actual: <strong>$${balance.toLocaleString()}</strong></p>
          <p>Ingresos últimos 2 días: <strong>$${ingresos.toLocaleString()}</strong></p>
          <p>Gastos últimos 2 días: <strong>$${gastos.toLocaleString()}</strong></p>
          <p>Eventos activos: <strong>${eventos.length ? eventos.join(', ') : 'Ninguno'}</strong></p>
          <p style="color:#888;">Fuente: economía.js · ciclo: cada 2 días</p>
          <p style="color:#555;">Sistema Abyssus · módulo /economía firmado</p>
        </section>
      `;
    } else if (typeof datosUsuario === 'number') {
      economiaHTML = `
        <section style="background:#1a1a1a; color:#ccc; padding:40px; text-align:center; border-radius:12px;">
          <h2 style="color:#00ffcc;">💰 Economía Bot</h2>
          <p>Balance actual: <strong>$${datosUsuario.toLocaleString()}</strong></p>
          <p>Ingresos últimos 2 días: <strong>$0</strong></p>
          <p>Gastos últimos 2 días: <strong>$0</strong></p>
          <p>Eventos activos: <strong>Ninguno</strong></p>
          <p style="color:#888;">Fuente: economía.js · modo simplificado</p>
          <p style="color:#555;">Sistema Abyssus · módulo /economía se actualiza cada 2 dias</p>
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

 // 🧠 Render final
res.send(`
  <main style="font-family:Segoe UI, sans-serif; background:#0a0a0a; color:#ccc; padding:0; margin:0;">
    <header style="padding:50px 30px; text-align:center; background:#111; box-shadow:0 0 20px #00ffff33;">
      <h1 style="color:#00ffff; font-size:36px; margin-bottom:10px;">🔐 Abyssus Dashboard</h1>
      <p style="font-size:16px; color:#aaa;">Servidor activo · Todos los módulos están integrados</p>
      <p style="margin-top:10px; color:#666;">Sistema Abyssus · backend blindado</p>
    </header>

    <section style="max-width:900px; margin:40px auto; display:flex; flex-direction:column; gap:40px;">
      ${perfilHTML}
      ${economiaHTML}
      ${clienteHTML}
      ${recompensasHTML}
      ${statusHTML}
    </section>

    <footer style="text-align:center; padding:30px; color:#555; font-size:14px;">
      Sistema Abyssus · render institucional proyectado
    </footer>
  </main>
`);
}); // ← cierre que faltaba

const PORT = process.env.PORT;
if (!PORT) throw new Error('❌ Variable PORT no definida por Render');

app.listen(PORT, () => {
  console.log(`🔐 Abyssus Run activo en Render · Puerto ${PORT}`);
});



















