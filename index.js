require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const economiaPath = path.join(__dirname, 'Usuario.json');
const modlogPath = path.join(__dirname, 'modlogs.json');
const mascotasPath = path.join(__dirname, 'mascotas.json');

const app = express();
app.use(express.static('public')); // sirve favicon y archivos estáticos

// Funciones auxiliares
function cargarJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`❌ Error cargando ${filePath}:`, err.message);
    return {};
  }
}

function formatearDinero(valor) {
  return `$${(valor || 0).toLocaleString()}`;
}

function fechaRelativa(fechaISO) {
  const timestamp = Math.floor(new Date(fechaISO).getTime() / 1000);
  return `<t:${timestamp}:R>`;
}

// Endpoints
app.get('/activar', (req, res) => res.send('🟢 Render activado · entorno despierto'));

// Callback OAuth2
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code || typeof code !== 'string' || code.length < 10) {
    return res.status(400).send(`
      <section style="font-family:sans-serif; background:#1c1c1c; color:#ff4444; padding:30px; text-align:center;">
        <h2>❌ Código OAuth2 inválido</h2>
        <p>Discord no envió un código válido.</p>
      </section>
    `);
  }

  try {
    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI?.trim(),
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResponse.data.access_token;
    return res.redirect(`/?token=${accessToken}`);
  } catch (error) {
    const detail = error.response?.data?.error_description || error.response?.data?.error || error.message;
    return res.status(500).send(`
      <section style="font-family:sans-serif; background:#1c1c1c; color:#ff4444; padding:30px; text-align:center;">
        <h2>❌ Error al procesar el código OAuth2</h2>
        <p>${detail}</p>
      </section>
    `);
  }
});

// Dashboard principal
app.get('/', async (req, res) => {
  const token = req.query.token;
  let perfilHTML = '', economiaHTML = '', recompensasHTML = '', statusHTML = '', modlogHTML = '', estadoHTML = '', actualizacionHTML = '';
  let user = null;
  let userId = '';

  const economiaData = cargarJSON(economiaPath);
  const modlogData = cargarJSON(modlogPath);
  const mascotasData = cargarJSON(mascotasPath);

  // Perfil de usuario
  if (token && token.length > 10) {
    try {
      const userResponse = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } });
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
    } catch (err) {
      perfilHTML = `<section><h2>❌ Error al cargar el perfil</h2><p>${err.message}</p></section>`;
    }
  }

  // Economía
  let balance = 0;
  if (userId) {
    try {
      const datosUsuario = economiaData.find(u => u.id === userId);
      if (datosUsuario) {
        balance = datosUsuario.balance || 0;
        economiaHTML = `
          <section>
            <h2>💰 Economía Bot</h2>
            <p>Balance: <strong>${formatearDinero(balance)}</strong></p>
            <p>Ingresos: <strong>${formatearDinero(datosUsuario.ingresos)}</strong></p>
            <p>Gastos: <strong>${formatearDinero(datosUsuario.gastos)}</strong></p>
            <p>Eventos: <strong>${(datosUsuario.eventos || []).join(', ') || 'Ninguno'}</strong></p>
          </section>
        `;
      } else {
        economiaHTML = `<section><h2>❌ Economía no disponible</h2><p>No se encontró información económica</p></section>`;
      }
    } catch (err) {
      economiaHTML = `<section><h2>❌ Error al cargar economía</h2><p>${err.message}</p></section>`;
    }
  }

  // Recompensas según balance
  const recompensas = [];
  if (balance >= 1000) recompensas.push('Blindaje semántico');
  if (balance >= 5000) recompensas.push('Heurística institucional');
  if (balance >= 10000) recompensas.push('OAuth2 sincronizado');
  recompensasHTML = `
    <section>
      <h2>🎁 Recompensas</h2>
      ${recompensas.length ? `<ul style="padding-left:20px;">${recompensas.map(r => `<li><strong>${r}</strong></li>`).join('')}</ul>` : '<p>No hay recompensas desbloqueadas</p>'}
    </section>
  `;

  // Estado del sistema
  const hora = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  statusHTML = `
    <section>
      <h2>📡 Estado del sistema</h2>
      <p>Hora local: <strong>${hora}</strong></p>
      <p>Backend: <strong>Activo</strong></p>
      <p>OAuth2: <strong>${token ? 'Verificado' : 'No disponible'}</strong></p>
    </section>
  `;

  // Estado de cuenta
  if (user) {
    estadoHTML = `
      <section>
        <h2>🛡️ Estado de cuenta</h2>
        <p>2FA: <strong>${user.mfa_enabled ? 'Activado' : 'No activado'}</strong></p>
        <p>Verificación: <strong>${user.verified ? '✅ Verificada' : '❌ No verificada'}</strong></p>
        <p>Idioma: <strong>${user.locale}</strong></p>
        <p>Nitro: <strong>${user.premium_type === 2 ? 'Nitro' : user.premium_type === 1 ? 'Classic' : 'Sin Nitro'}</strong></p>
      </section>
    `;
  }

  // Modlogs
  let eventos = [];
  for (const gId in modlogData) {
    const logs = modlogData[gId]?.[userId];
    if (Array.isArray(logs)) eventos.push(...logs);
  }
  const eventosRecientes = eventos.slice(-10).reverse();
  modlogHTML = `
    <section>
      <h2>📜 Registro de eventos</h2>
      ${eventosRecientes.length ? `<ul style="list-style:none; padding:0;">${eventosRecientes.map(e => `<li><strong>${e.action}</strong> · ${e.reason}<br><span style="color:#888;">${new Date(e.timestamp).toLocaleString()}</span></li>`).join('')}</ul>` : '<p>No hay eventos registrados</p>'}
    </section>
  `;

  // Última actualización de datos
  const stats = fs.statSync(economiaPath);
  const ultimaActualizacion = new Date(stats.mtime);
  const diferenciaDias = Math.floor((new Date() - ultimaActualizacion) / (1000 * 60 * 60 * 24));
  const actualizado = diferenciaDias <= 2;
  actualizacionHTML = `
    <section style="background:${actualizado ? '#112611' : '#260f0f'}; padding:20px; border-radius:8px;">
      <h2>${actualizado ? '🟢' : '🔴'} Última actualización de datos</h2>
      <p>Fecha: <strong>${ultimaActualizacion.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</strong></p>
      <p>Estado: <strong style="color:${actualizado ? '#00ff88' : '#ff4444'};">
        ${actualizado ? `Actualizado hace ${diferenciaDias} día${diferenciaDias !== 1 ? 's' : ''}` : `Desactualizado (${diferenciaDias} días)`}
      </strong></p>
    </section>
  `;

  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Abyssus Dashboard</title>
<link rel="icon" href="/favicon.png" type="image/png">
<style>
  body { font-family:'Segoe UI', sans-serif; background:#0a0a0a; color:#e0e0e0; margin:0; padding:0; }
</style>
</head>
<body>
<main>
<header style="padding:25px 20px; text-align:center; background:#23272a; border-bottom:1px solid #2c2f33;">
  <h1 style="color:#ffffff; font-size:28px; margin-bottom:6px;">🔐 Abyssus · Dashboard</h1>
  <p style="font-size:14px; color:#b9bbbe;">🟢 Servidor activo · módulos conectados</p>
  <p style="font-size:12px; color:#72767d;">💾 Backend blindado · acceso verificado</p>
</header>

<section style="max-width:1100px; margin:50px auto; display:grid; grid-template-columns:1fr 1fr; gap:40px;">
${perfilHTML}
${economiaHTML}
${estadoHTML}
${recompensasHTML}
${statusHTML}
${modlogHTML}
${actualizacionHTML}
</section>

<footer style="text-align:center; padding:30px; color:#777; font-size:13px; border-top:1px solid #222;">
  Sistema Abyssus · render institucional proyectado
</footer>
</main>
</body>
</html>
  `);
});

// Puerto
const PORT = process.env.PORT;
if (!PORT) throw new Error('❌ Variable PORT no definida por Render');
app.listen(PORT, () => console.log(`🔐 Abyssus Run activo en Render · Puerto ${PORT}`));

























