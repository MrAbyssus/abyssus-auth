require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const economiaData = require('./Usuario.json');
const modlogData = require('./modlogs.json');
const mascotasData = JSON.parse(fs.readFileSync('./mascotas.json', 'utf8'));
const app = express();

app.use(express.static('public')); // ← sirve favicon y archivos estáticos

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
  let perfilHTML = '', economiaHTML = '', recompensasHTML = '', statusHTML = '', clienteHTML = '', modlogHTML = '', petHTML = '', estadoHTML = '', actualizacionHTML = '';
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

  let balance = 0;
  try {
    if (!userId || typeof userId !== 'string') throw new Error('userId no definido');

    const datosUsuario = economiaData.find(u => u.id === userId);
    if (datosUsuario) {
      balance = datosUsuario.balance || 0;
      const ingresos = datosUsuario.ingresos || 0;
      const gastos = datosUsuario.gastos || 0;
      const eventos = datosUsuario.eventos || [];

      economiaHTML = `
        <section>
          <h2>💰 Economía Bot</h2>
          <p>Balance: <strong>$${balance.toLocaleString()}</strong></p>
          <p>Ingresos: <strong>$${ingresos.toLocaleString()}</strong></p>
          <p>Gastos: <strong>$${gastos.toLocaleString()}</strong></p>
          <p>Eventos: <strong>${eventos.length ? eventos.join(', ') : 'Ninguno'}</strong></p>
        </section>
      `;
    } else {
      economiaHTML = `<section><h2>❌ Economía no disponible</h2><p>No se encontró información económica</p></section>`;
    }
  } catch (err) {
    economiaHTML = `<section><h2>❌ Error al cargar economía</h2><p>${err.message}</p></section>`;
  }



let servidorHTML = '';
try {
const servidoresPropios = Object.values(servidoresData).filter(s => s.owner_id === user?.id);


  servidorHTML = servidoresPropios.length ? `
    <section>
      <h2>🛡️ Servidores vinculados</h2>
      <ul style="list-style:none; padding-left:0;">
        ${servidoresPropios.map(s => `
          <li style="margin-bottom:20px;">
            <p><strong>${s.nombre}</strong> · ID: ${s.id}</p>
            <img src="https://cdn.discordapp.com/icons/${s.id}/${s.icon}.png" style="width:80px; border-radius:12px;" />
          </li>
        `).join('')}
      </ul>
    </section>
  ` : `<section><h2>🛡️ Sin servidores vinculados</h2><p>No se detectó propiedad sobre ningún servidor</p></section>`;
} catch (error) {
  servidorHTML = `<section><h2>🛡️ Error al cargar servidores</h2><p>${error.message}</p></section>`;
}






  
  

  const recompensas = [];
  if (balance >= 1000) recompensas.push('Blindaje semántico');
  if (balance >= 5000) recompensas.push('Heurística institucional');
  if (balance >= 10000) recompensas.push('OAuth2 sincronizado');

  recompensasHTML = `
    <section>
      <h2>🎁 Recompensas</h2>
      ${recompensas.length
        ? `<ul style="padding-left:20px;">${recompensas.map(r => `<li><strong>${r}</strong></li>`).join('')}</ul>`
        : `<p>No hay recompensas desbloqueadas</p>`}
    </section>
  `;

  const hora = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  statusHTML = `
    <section>
      <h2>📡 Estado del sistema</h2>
      <p>Hora local: <strong>${hora}</strong></p>
      <p>Backend: <strong>Activo</strong></p>
      <p>OAuth2: <strong>Verificado</strong></p>
    </section>
  `;

  estadoHTML = user ? `
    <section>
      <h2>🛡️ Estado de cuenta</h2>
      <p>2FA: <strong>${user.mfa_enabled ? 'Activado' : 'No activado'}</strong></p>
      <p>Verificación: <strong>${user.verified ? '✅ Verificada' : '❌ No verificada'}</strong></p>
      <p>Idioma: <strong>${user.locale}</strong></p>
      <p>Nitro: <strong>${user.premium_type === 2 ? 'Nitro' : user.premium_type === 1 ? 'Classic' : 'Sin Nitro'}</strong></p>
    </section>
  ` : '';

  let eventos = [];
  for (const gId in modlogData) {
    const logs = modlogData[gId]?.[userId];
    if (Array.isArray(logs)) eventos.push(...logs);
  }
  const eventosRecientes = eventos.slice(-10).reverse();

  modlogHTML = `
    <section>
      <h2>📜 Registro de eventos</h2>
      ${eventosRecientes.length
        ? `<ul style="list-style:none; padding:0;">${eventosRecientes.map(e => `
            <li>
              <strong>${e.action}</strong> · ${e.reason}<br>
              <span style="color:#888;">${new Date(e.timestamp).toLocaleString()}</span>
            </li>
          `).join('')}</ul>`
        : `<p>No hay eventos registrados</p>`}
    </section>
  `;

  const stats = fs.statSync('./Usuario.json');
  const ultimaActualizacion = new Date(stats.mtime);
  const ahora = new Date();
  const diferenciaMs = ahora - ultimaActualizacion;
  const diferenciaDias = Math.floor(diferenciaMs / (1000 * 60 * 60 * 24));

  const actualizado = diferenciaDias <= 2;
  const icono = actualizado ? '🟢' : '🔴';
  const fondo = actualizado ? '#112611' : '#260f0f';
  const colorTexto = actualizado ? '#00ff88' : '#ff4444';
  actualizacionHTML = `
  <section style="background:${fondo}; padding:20px; border-radius:8px;">
    <h2>${icono} Última actualización de datos</h2>
    <p>Fecha: <strong>${ultimaActualizacion.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</strong></p>
    <p>Estado: <strong style="color:${colorTexto};">
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
${clienteHTML}
${estadoHTML}
${recompensasHTML}
${servidorHTML}
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
}); // ← cierre correcto del app.get('/')

const PORT = process.env.PORT;
if (!PORT) throw new Error('❌ Variable PORT no definida por Render');

app.listen(PORT, () => {
  console.log(`🔐 Abyssus Run activo en Render · Puerto ${PORT}`);
});






















