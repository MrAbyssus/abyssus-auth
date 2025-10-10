require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();

// 📁 Ruta donde se guardarán los usuarios logueados
const usersPath = path.join(__dirname, 'usuarios.json');

// Cargar usuarios si el archivo existe
let usuarios = [];
if (fs.existsSync(usersPath)) {
  try {
    usuarios = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  } catch {
    usuarios = [];
  }
}

// Guardar usuarios actualizados
function guardarUsuarios() {
  fs.writeFileSync(usersPath, JSON.stringify(usuarios, null, 2));
}

app.use(express.static('public'));

// ✅ Página principal con botón de login
app.get('/', (req, res) => {
  const authorizeUrl = `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify`;

  res.send(`
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Abyssus · Login</title>
        <style>
          body { background:#0a0a0a; color:#eee; font-family:'Segoe UI',sans-serif; text-align:center; padding:50px; }
          a { background:#5865F2; color:white; padding:12px 25px; border-radius:8px; text-decoration:none; font-weight:bold; transition:0.2s; }
          a:hover { background:#4752C4; }
        </style>
      </head>
      <body>
        <h1>🔐 Abyssus · Conexión segura</h1>
        <p>Inicia sesión para verificar tu identidad en el sistema.</p>
        <a href="${authorizeUrl}">Conectarse con Discord</a>
      </body>
    </html>
  `);
});

// ✅ Callback OAuth2
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.send(`
      <h2 style="color:red; text-align:center;">❌ No se recibió el código OAuth2.</h2>
      <p style="text-align:center;">Vuelve a intentarlo desde el inicio.</p>
    `);
  }

  try {
    // Intercambiar código por token
    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResponse.data.access_token;

    // Obtener datos del usuario
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const user = userResponse.data;

    // 📦 Guardar en archivo si no existe
    const existente = usuarios.find(u => u.id === user.id);
    if (!existente) {
      usuarios.push({
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        locale: user.locale,
        verified: user.verified,
        fecha_registro: new Date().toISOString(),
      });
      guardarUsuarios();
    }

    // ✅ Mostrar perfil
    res.send(`
      <html lang="es">
        <head><meta charset="UTF-8"><title>Perfil Discord</title></head>
        <body style="background:#0a0a0a; color:#eee; font-family:sans-serif; text-align:center; padding:50px;">
          <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" width="100" height="100" style="border-radius:50%;"><br>
          <h2>✅ Bienvenido, ${user.username}#${user.discriminator}</h2>
          <p>ID: ${user.id}</p>
          <p>Idioma: ${user.locale}</p>
          <p>Verificado: ${user.verified ? 'Sí' : 'No'}</p>
          <p><strong>Fecha de registro guardada correctamente ✅</strong></p>
          <a href="/" style="color:#00ff88;">← Volver al inicio</a>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error en callback:', error.response?.data || error.message);
    res.send(`
      <h2 style="color:red; text-align:center;">❌ Error al procesar el OAuth2</h2>
      <p style="text-align:center;">${error.response?.data?.error_description || error.message}</p>
    `);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Abyssus web activa en puerto ${PORT}`));
























































