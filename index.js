require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
app.use(express.static('public'));
app.use(cookieParser());

// Rutas de JSON
const PATH_USUARIO = './Usuario.json';
const PATH_MODLOGS = './modlogs.json';
const PATH_MASCOTAS = './mascotas.json';

// Cache de datos
let economiaData = [];
let modlogData = {};
let mascotasData = [];

async function cargarDatos() {
  try {
    economiaData = JSON.parse(await fs.readFile(PATH_USUARIO, 'utf8'));
  } catch { economiaData = []; }

  try {
    modlogData = JSON.parse(await fs.readFile(PATH_MODLOGS, 'utf8'));
  } catch { modlogData = {}; }

  try {
    mascotasData = JSON.parse(await fs.readFile(PATH_MASCOTAS, 'utf8'));
  } catch { mascotasData = []; }
}

// Helper: renderiza sección HTML
function renderSection(title, content, color='#e0e0e0') {
  return `<section style="padding:15px; border-radius:8px; background:#1f1f1f; margin-bottom:20px;">
    <h2 style="color:${color}">${title}</h2>${content}</section>`;
}

// Helper: hora local
function getHoraLocal() {
  return new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
}

// Helper: recompensas
function calcularRecompensas(balance) {
  const thresholds = [
    { amount: 1000, name: 'Blindaje semántico' },
    { amount: 5000, name: 'Heurística institucional' },
    { amount: 10000, name: 'OAuth2 sincronizado' }
  ];
  return thresholds.filter(r => balance >= r.amount).map(r => r.name);
}

// Middleware OAuth2 seguro
async function validarToken(req, res, next) {
  const token = req.cookies?.access_token;
  if (!token) return next();
  try {
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    req.user = userResponse.data;
  } catch {
    res.clearCookie('access_token');
  }
  next();
}

app.use(validarToken);

// Ruta de callback OAuth2
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code || code.length < 10) return res.send('❌ Código OAuth2 inválido');

  try {
    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI?.trim()
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const accessToken = tokenResponse.data.access_token;

    // Guardar en cookie segura
    res.cookie('access_token', accessToken, { httpOnly: true, maxAge: 3600000 });
    res.redirect('/');
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    res.send(`❌ Error al procesar OAuth2: ${msg}`);
  }
});

// Render dashboard
app.get('/', async (req, res) => {
  await cargarDatos();
  const user = req.user;
  const userId = user?.id;
  let html = '';

  // Perfil
  const perfilHTML = user ? `
    <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" style="border-radius:50%; width:100px; height:100px;" />
    <p><strong>${user.username}#${user.discriminator}</strong></p>
    <p>ID: ${user.id}</p>
  ` : '<p>No conectado</p>';

  html += renderSection('👤 Perfil Discord', perfilHTML, '#00ff88');

  // Economía
  const datosUsuario = economiaData.find(u => u.id === userId) || {};
  const balance = datosUsuario.balance || 0;
  const ingresos = datosUsuario.ingresos || 0;
  const gastos = datosUsuario.gastos || 0;
  const eventos = datosUsuario.eventos || [];

  const recompensas = calcularRecompensas(balance);
  const economiaHTML = `
    <p>Balance: $${balance.toLocaleString()}</p>
    <p>Ingresos: $${ingresos.toLocaleString()}</p>
    <p>Gastos: $${gastos.toLocaleString()}</p>
    <p>Eventos: ${eventos.length ? eventos.join(', ') : 'Ninguno'}</p>
    <p>Recompensas: ${recompensas.length ? recompensas.join(', ') : 'Ninguna'}</p>
  `;
  html += renderSection('💰 Economía Bot', economiaHTML, '#00ffff');

  // Estado del sistema
  html += renderSection('📡 Estado del sistema', `
    <p>Hora local: ${getHoraLocal()}</p>
    <p>Backend: Activo</p>
    <p>OAuth2: ${user ? 'Verificado' : 'No conectado'}</p>
  `, '#ffcc00');

  // Eventos recientes
  let logs = [];
  for (const gId in modlogData) {
    const userLogs = modlogData[gId]?.[userId];
    if (Array.isArray(userLogs)) logs.push(...userLogs);
  }
  const eventosRecientes = logs.slice(-10).reverse();
  const modlogHTML = eventosRecientes.length
    ? `<ul>${eventosRecientes.map(e => `<li><strong>${e.action}</strong> · ${e.reason} · ${new Date(e.timestamp).toLocaleString()}</li>`).join('')}</ul>`
    : '<p>No hay eventos</p>';
  html += renderSection('📜 Registro de eventos', modlogHTML, '#ff8800');

  // Última actualización de datos
  let actualizado = false;
  try {
    const stats = await fs.stat(PATH_USUARIO);
    const ultima = new Date(stats.mtime);
    const diferenciaDias = Math.floor((new Date() - ultima) / (1000 * 60 * 60 * 24));
    actualizado = diferenciaDias <= 2;
    html += renderSection('🟢 Última actualización', `Fecha: ${ultima.toLocaleString()} · Estado: ${actualizado ? 'Actualizado' : 'Desactualizado'}`, actualizado ? '#00ff88' : '#ff4444');
  } catch {}

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><title>Abyssus Dashboard</title></head>
    <body style="background:#0a0a0a; color:#e0e0e0; font-family:Segoe UI, sans-serif; padding:20px;">
      <header style="text-align:center; padding:20px; background:#23272a;">
        <h1>Abyssus · Dashboard</h1>
      </header>
      <main style="max-width:1100px; margin:50px auto;">${html}</main>
      <footer style="text-align:center; margin-top:50px;">Sistema Abyssus · render institucional</footer>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔐 Abyssus Run activo en Render · Puerto ${PORT}`));






















