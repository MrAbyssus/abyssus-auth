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
  if (!code) {
    return res.send(`
      <section style="font-family:sans-serif; background:#1c1c1c; color:#ff4444; padding:30px; border-radius:10px; text-align:center;">
        <h2>❌ Código OAuth2 no recibido</h2>
        <p>Discord no envió el parámetro <code>code</code>. Verificá el <strong>redirect_uri</strong> y la configuración del botón.</p>
        <p style="margin-top:10px; color:#888;">Sistema Abyssus · verificación fallida</p>
      </section>
    `);
  }

  try {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', null, {
      params: {
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.REDIRECT_URI,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

 const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', null, {
  params: {
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: process.env.REDIRECT_URI,
  },
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
});

    const user = userResponse.data;

    res.send(`
      <section style="font-family:sans-serif; background:#1c1c1c; color:#ccc; padding:30px; border-radius:10px; text-align:center;">
        <h2 style="color:#00ffff;">✅ Sesión iniciada</h2>
        <p>Bienvenido, <strong>${user.username}#${user.discriminator}</strong></p>
        <p>ID: ${user.id}</p>
        <p style="margin-top:10px; color:#888;">Sistema Abyssus · sesión verificada</p>
      </section>
    `);
  } catch (err) {
    res.send(`
      <section style="font-family:sans-serif; background:#1c1c1c; color:#ff4444; padding:30px; border-radius:10px; text-align:center;">
        <h2>❌ Error al procesar el código OAuth2</h2>
        <p>Verificá que el <strong>CLIENT_SECRET</strong> y el <strong>redirect_uri</strong> coincidan exactamente con los registrados en Discord.</p>
        <p style="margin-top:10px; color:#888;">Sistema Abyssus · sesión fallida</p>
      </section>
    `);
  }
});

// Puerto institucional
app.listen(3000, () => {
  console.log('🔐 Abyssus Run activo en Render');
});


