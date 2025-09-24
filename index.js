require('dotenv').config();
const express = require('express');
const axios = require('axios');
const economiaData = require('./economia.json');
const modlogData = require('./modlogs.json');
const app = express();

// 🔁 Activación previa para Render
app.get('/activar', async (req, res) => {
  res.send('🟢 Render activado · entorno despierto');
});

// 🔐 Callback OAuth2
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code || typeof code !== 'string' || code.length < 10) {
    return res.send(`
      <section style="font-family:sans-serif; background:#1c1c1c; color:#ff4444; padding:30px; text-align:center;">
        <h2>❌ Código OAuth2 no recibido</h2>
        <p>Discord no envió el parámetro <code>code</code> o está incompleto.</p>
        <p style="margin-top:10px; color:#888;">Sistema Abyssus · verificación fallida</p>
      </section>
    `);
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
    res.send(`
      <section style="font-family:sans-serif; background:#1c1c1c; color:#ff4444; padding:30px; text-align:center;">
        <h2>❌ Error al procesar el código OAuth2</h2>
        <p>${errorMsg}</p>
        <p style="margin-top:10px; color:#888;">Sistema Abyssus · sesión fallida</p>
      </section>
    `);
  }
});

// 🧠 Dashboard principal
app.get('/', async (req, res) => {
  const token = req.query.token;
  let perfilHTML = '', economiaHTML = '', recompensasHTML = '', statusHTML = '', clienteHTML = '', modlogHTML = '';
  let userId = '';

  // 👤 Perfil Discord
  try {
    if (token && token.length > 10) {
      const userResponse = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const user = userResponse.data;
      userId = user.id;

      perfilHTML = `
        <section>
          <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" style="border-radius:50%; width:100px; height:100px;" />
          <h2>👤 Perfil Discord</h2>
          <p><strong>${user.username}#${user.discriminator}</strong></p>
          <p>ID: ${user.id}</p>
          <p>Estado: <span style="color:#00ff88;">Verificado</span> · Premium activo</p>
        </section>
      `;
    }
  } catch (error) {
    perfilHTML = `
      <section>
        <h2>❌ Error al cargar el perfil</h2>
        <p>${error.message}</p>
      </section>
    `;
  }

  // 💰 Economía
  try {
    const datosUsuario = economiaData[userId];
    if (typeof datosUsuario === 'object') {
      const { balance = 0, ingresos = 0, gastos = 0, eventos = [] } = datosUsuario;
      economiaHTML = `
        <section>
          <h2>💰 Economía Bot</h2>
          <p>Balance: <strong>$${balance.toLocaleString()}</strong></p>
          <p>Ingresos: <strong>$${ingresos.toLocaleString()}</strong></p>
          <p>Gastos: <strong>$${gastos.toLocaleString()}</strong></p>
          <p>Eventos: <strong>${eventos.length ? eventos.join(', ') : 'Ninguno'}</strong></p>
        </section>
      `;
    } else if (typeof datosUsuario === 'number') {
      economiaHTML = `
        <section>
          <h2>💰 Economía Bot</h2>
          <p>Balance: <strong>$${datosUsuario.toLocaleString()}</strong></p>
          <p>Ingresos: <strong>$0</strong></p>
          <p>Gastos: <strong>$0</strong></p>
          <p>Eventos: <strong>Ninguno</strong></p>
        </section>
      `;
    } else {
      economiaHTML = `
        <section>
          <h2>❌ Economía no disponible</h2>
          <p>No se encontró información económica</p>
        </section>
      `;
    }
  } catch (err) {
    economiaHTML = `
      <section>
        <h2>❌ Error al cargar economía</h2>
        <p>${err.message}</p>
      </section>
    `;
  }

  // 🎁 Recompensas
  recompensasHTML = `
    <section>
      <h2>🎁 Recompensas</h2>
      <p>Premium: <strong>Blindaje semántico</strong></p>
      <p>Pack: <strong>Heurística institucional</strong></p>
      <p>Upgrade: <strong>OAuth2 sincronizado</strong></p>
    </section>
  `;

  // 📡 Estado del sistema
  const hora = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  statusHTML = `
    <section>
      <h2>📡 Estado del sistema</h2>
      <p>Hora local: <strong>${hora}</strong></p>
      <p>Backend: <strong>Activo</strong></p>
      <p>OAuth2: <strong>Verificado</strong></p>
    </section>
  `;

  // 🧩 Cliente
  clienteHTML = `
    <section>
      <h2>🧩 Cliente</h2>
      <p>Conexión: <strong>${token ? 'Activa' : 'Desconectada'}</strong></p>
      <p>Token: <strong>${token ? 'Sí' : 'No'}</strong></p>
      <p>Sesión: <strong>${token ? 'Proyectada' : 'No iniciada'}</strong></p>
    </section>
  `;

  // 📜 Modlog global
  let eventos = [];
  for (const gId in modlogData) {
    const logs = modlogData[gId]?.[userId];
    if (Array.isArray(logs)) eventos.push(...logs);
  }

  modlogHTML = `
    <section>
      <h2>📜 Registro de eventos</h2>
      ${eventos.length
        ? `<ul style="list-style:none; padding:0;">${eventos.map(e => `
            <li>
              <strong>${e.action}</strong> · ${e.reason}<br>
              <span style="color:#888;">${new Date(e.timestamp).toLocaleString()}</span>
            </li>
          `).join('')}</ul>`
        : `<p>No hay eventos registrados</p>`}
    </section>
  `;

  // 🧠 Render final
  res.send(`
    <main style="font-family:Segoe UI, sans-serif; background:#0a0a0a; color:#ccc; padding:0; margin:0;">
      <header style="padding:50px 30px; text-align:center; background:#111; box-shadow:0 0 20px #00ffff33;">
        <h1 style="color:#00ffff; font-size:36px; margin-bottom:10px;">🔐 Abyssus Dashboard</h1>
        <p style="font-size:16px; color:#aaa;">Servidor activo · módulos integrados</p>
        <p style="margin-top:10px; color:#666;">Sistema Abyssus · backend blindado</p>
      </header>

      <section style="max-width:1000px; margin:40px auto; display:grid; grid-template-columns:1fr 1fr; gap:30px;">
        ${perfilHTML}
        ${economiaHTML}
        ${clienteHTML}
        ${recompensasHTML}
        ${statusHTML}
        ${modlogHTML}
      </section>

      <footer style="text-align:center; padding:30px; color:#555; font-size:14px;">
        Sistema Abyssus · render institucional proyectado
      </footer>
   </main>
`);
}); // ← cierre correcto de app.get('/')
const PORT = process.env.PORT;
if (!PORT) throw new Error('❌ Variable PORT no definida por Render');

app.listen(PORT, () => {
  console.log(`🔐 Abyssus Run activo en Render · Puerto ${PORT}`);
});






















