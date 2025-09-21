const express = require('express');
const axios = require('axios');
const app = express();
require('dotenv').config();

// Ruta institucional raíz
app.get('/', (req, res) => {
  res.send(`
    <section style="font-family:sans-serif; background:#111; color:#ccc; padding:40px; text-align:center;">
      <h1 style="color:#00ffff;">🔐 Abyssus Auth</h1>
      <p>Servidor activo. Esperando redirección OAuth2...</p>
      <p style="margin-top:10px; color:#888;">Sistema institucional · backend blindado</p>
    </section>
  `);
});

// Ruta de redirección OAuth2
app.get('/callback', async (req, res) => {
  const code = req.query.code;

  // 🔐 Blindaje contra recarga o código inválido
  if (!code || code.length < 10) {
    return res.redirect('/');
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
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const accessToken = tokenResponse.data.access_token;

    // 🔁 Redirigir al perfil institucional con el token
    res.redirect(`/perfil?token=${accessToken}`);
  } catch (err) {
    console.error('Error OAuth2:', err.response?.data || err.message);
    res.send(`
      <section style="font-family:sans-serif; background:#1c1c1c; color:#ff4444; padding:30px; border-radius:10px; text-align:center;">
        <h2>❌ Error al procesar el código OAuth2</h2>
        <p>${err.response?.data?.error || 'Error desconocido'}</p>
        <p style="margin-top:10px; color:#888;">Sistema Abyssus · sesión fallida</p>
      </section>
    `);
  }
});

// Ruta institucional de perfil
app.get('/perfil', async (req, res) => {
  const token = req.query.token;
  if (!token || token.length < 10) {
    return res.redirect('/');
  }

  try {
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const user = userResponse.data;

    res.send(`
      <section style="font-family:sans-serif; background:#0e0e0e; color:#ccc; padding:40px; text-align:center;">
        <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" style="border-radius:50%; width:120px; height:120px; margin-bottom:20px;" />
        <h2 style="color:#00ffff;">👤 Perfil Discord</h2>
        <p><strong>${user.username}#${user.discriminator}</strong></p>
        <p>ID: ${user.id}</p>
        <p style="margin-top:10px; color:#888;">Estado: <span style="color:#00ff88;">Verificado</span> · Premium activo</p>
        <p style="margin-top:20px; color:#555;">Sistema Abyssus · sesión proyectada</p>
      </section>
    `);
  } catch (err) {
    res.send(`
      <section style="font-family:sans-serif; background:#1c1c1c; color:#ff4444; padding:30px; border-radius:10px; text-align:center;">
        <h2>❌ Error al cargar el perfil</h2>
        <p>${err.response?.data?.error || 'Token inválido o expirado'}</p>
        <p style="margin-top:10px; color:#888;">Sistema Abyssus · sesión fallida</p>
      </section>
    `);
  }
});

app.get('/status', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const region = req.headers['x-vercel-ip-country'] || 'Desconocida';
  const hora = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

  res.send(`
    <section style="font-family:sans-serif; background:#0e0e0e; color:#ccc; padding:40px; text-align:center;">
      <h2 style="color:#00ffff;">📡 Estado del sistema Abyssus</h2>
      <p>🕒 Hora local: <strong>${hora}</strong></p>
      <p>🌐 IP detectada: <strong>${ip}</strong></p>
      <p>📍 Región estimada: <strong>${region}</strong></p>
      <p style="margin-top:10px; color:#888;">Backend activo · sincronización OAuth2 verificada</p>
      <p style="margin-top:20px; color:#555;">Sistema Abyssus · módulo de diagnóstico firmado</p>
    </section>
  `);
});


// Puerto institucional
app.listen(3000, () => {
  console.log('🔐 Abyssus Run activo en Render');
});






