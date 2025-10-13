import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import fetch from 'node-fetch';
import session from 'express-session';
import { QuickDB } from 'quick.db';

const app = express();
const db = new QuickDB();

app.use(bodyParser.json());
app.use(session({ secret: 'supersecret', resave: false, saveUninitialized: false }));

// ===============================
// 🔐 Funciones de ayuda
// ===============================

// ✅ Comprueba si el usuario es el dueño real del servidor
async function verifyOwner(ses, userId, guildId) {
  const BOT_TOKEN = process.env.BOT_TOKEN;

  try {
    if (!BOT_TOKEN) return false;
    const guildRes = await axios.get(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
      timeout: 8000,
    });
    const ownerId = guildRes?.data?.owner_id;
    return String(ownerId) === String(userId);
  } catch (err) {
    console.error(`Error verificando owner para ${guildId}:`, err.response?.data || err.message);
    return false;
  }
}

// Verifica si el usuario tiene permisos en la base de datos del panel
async function hasPermission(userId, guildId, perm) {
  const perms = (await db.get(`PANEL_PERMS_${guildId}`)) || {};
  const userPerms = perms[userId] || [];
  return userPerms.includes(perm);
}

// Devuelve la sesión actual
function getSession(req) {
  return req.session?.user ? req.session : null;
}

// Realiza una acción como el bot
async function botAction(endpoint, method = 'post', body = {}) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  return axios({
    url: `https://discord.com/api/v10/${endpoint}`,
    method,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    data: body,
  });
}

// Middleware de sesión obligatoria
function requireSession(req, res, next) {
  if (!req.session || !req.sessionUserId) {
    return res.status(401).send('No has iniciado sesión.');
  }
  next();
}

// ===============================
// ⚙️ Rutas del panel
// ===============================

// Kick
app.post('/api/guilds/:guildId/kick', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { userId } = req.body;
  const ses = req.session;

  try {
    const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
    if (!(isOwner || await hasPermission(req.sessionUserId, guildId, 'KICK'))) {
      return res.status(403).send('No autorizado.');
    }

    await botAction(`guilds/${guildId}/members/${userId}`, 'delete');
    res.send('✅ Usuario expulsado');
  } catch (err) {
    console.error('Kick error:', err.response?.data || err.message);
    res.status(500).send('Error al expulsar usuario.');
  }
});

// Ban
app.post('/api/guilds/:guildId/ban', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { userId, reason } = req.body;
  const ses = req.session;

  try {
    const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
    if (!(isOwner || await hasPermission(req.sessionUserId, guildId, 'BAN'))) {
      return res.status(403).send('No autorizado.');
    }

    await botAction(`guilds/${guildId}/bans/${userId}`, 'put', { delete_message_days: 0, reason });
    res.send('✅ Usuario baneado');
  } catch (err) {
    console.error('Ban error:', err.response?.data || err.message);
    res.status(500).send('Error al banear usuario.');
  }
});

// Timeout
app.post('/api/guilds/:guildId/timeout', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { userId, communication_disabled_until } = req.body;
  const ses = req.session;

  try {
    const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
    if (!(isOwner || await hasPermission(req.sessionUserId, guildId, 'TIMEOUT'))) {
      return res.status(403).send('No autorizado.');
    }

    await botAction(`guilds/${guildId}/members/${userId}`, 'patch', { communication_disabled_until });
    res.send('✅ Usuario silenciado');
  } catch (err) {
    console.error('Timeout error:', err.response?.data || err.message);
    res.status(500).send('Error al aplicar timeout.');
  }
});

// Enviar mensaje
app.post('/api/guilds/:guildId/message', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { channelId, content } = req.body;
  const ses = req.session;

  try {
    const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
    if (!(isOwner || await hasPermission(req.sessionUserId, guildId, 'MESSAGE'))) {
      return res.status(403).send('No autorizado.');
    }

    await botAction(`channels/${channelId}/messages`, 'post', { content });
    res.send('✅ Mensaje enviado');
  } catch (err) {
    console.error('Message error:', err.response?.data || err.message);
    res.status(500).send('Error al enviar mensaje.');
  }
});

// Crear rol
app.post('/api/guilds/:guildId/create-role', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { name, color } = req.body;
  const ses = req.session;

  if (!name) return res.status(400).send('Falta el nombre del rol.');

  try {
    const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
    if (!(isOwner || await hasPermission(req.sessionUserId, guildId, 'ROLE_MANAGE'))) {
      return res.status(403).send('No autorizado.');
    }

    const resp = await botAction(`guilds/${guildId}/roles`, 'post', { name, color });
    res.json(resp.data);
  } catch (err) {
    console.error('Create role error:', err.response?.data || err.message);
    res.status(500).send('Error al crear rol.');
  }
});

// Eliminar rol
app.post('/api/guilds/:guildId/delete-role', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { roleId } = req.body;
  const ses = req.session;

  if (!roleId) return res.status(400).send('Falta el ID del rol.');

  try {
    const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
    if (!(isOwner || await hasPermission(req.sessionUserId, guildId, 'ROLE_MANAGE'))) {
      return res.status(403).send('No autorizado.');
    }

    await botAction(`guilds/${guildId}/roles/${roleId}`, 'delete');
    res.send('✅ Rol eliminado');
  } catch (err) {
    console.error('Delete role error:', err.response?.data || err.message);
    res.status(500).send('Error al eliminar rol.');
  }
});

// Crear canal
app.post('/api/guilds/:guildId/create-channel', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { name, type } = req.body;
  const ses = req.session;

  if (!name) return res.status(400).send('Falta el nombre del canal.');

  try {
    const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
    if (!(isOwner || await hasPermission(req.sessionUserId, guildId, 'CHANNEL_MANAGE'))) {
      return res.status(403).send('No autorizado.');
    }

    const resp = await botAction(`guilds/${guildId}/channels`, 'post', { name, type });
    res.json(resp.data);
  } catch (err) {
    console.error('Create channel error:', err.response?.data || err.message);
    res.status(500).send('Error al crear canal.');
  }
});

// Eliminar canal
app.post('/api/guilds/:guildId/delete-channel', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { channelId } = req.body;
  const ses = req.session;

  if (!channelId) return res.status(400).send('Falta el ID del canal.');

  try {
    const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
    if (!(isOwner || await hasPermission(req.sessionUserId, guildId, 'CHANNEL_MANAGE'))) {
      return res.status(403).send('No autorizado.');
    }

    await botAction(`channels/${channelId}`, 'delete');
    res.send('✅ Canal eliminado');
  } catch (err) {
    console.error('Delete channel error:', err.response?.data || err.message);
    res.status(500).send('Error al eliminar canal.');
  }
});

// Asignar permisos del panel
app.post('/api/guilds/:guildId/perms/set', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId, perms } = req.body;
  const ses = req.session;

  try {
    const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
    if (!isOwner) return res.status(403).send('Solo el owner puede asignar permisos.');

    const current = await db.get(`PANEL_PERMS_${guildId}`) || {};
    current[targetId] = perms;
    await db.set(`PANEL_PERMS_${guildId}`, current);
    res.send('✅ Permisos asignados');
  } catch (err) {
    console.error('Set perms error:', err.response?.data || err.message);
    res.status(500).send('Error al asignar permisos.');
  }
});

// Logs
app.get('/logs/:guildId', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const ses = req.session;

  try {
    const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
    if (!(isOwner || await hasPermission(req.sessionUserId, guildId, 'LOGS_VIEW'))) {
      return res.status(403).send('No autorizado.');
    }

    const logs = await db.get(`LOGS_${guildId}`) || [];
    res.json(logs);
  } catch (err) {
    console.error('Logs error:', err.message);
    res.status(500).send('Error al obtener logs.');
  }
});

// Borrar logs
app.post('/logs/:guildId/clear', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const ses = req.session;

  try {
    const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
    if (!(isOwner || await hasPermission(req.sessionUserId, guildId, 'LOGS_CLEAR'))) {
      return res.status(403).send('No autorizado.');
    }

    await db.delete(`LOGS_${guildId}`);
    res.send('✅ Logs eliminados');
  } catch (err) {
    console.error('Clear logs error:', err.message);
    res.status(500).send('Error al limpiar logs.');
  }
});

// ===============================
// 🚀 Servidor
// ===============================
app.listen(3000, () => console.log('✅ Panel backend corriendo en puerto 3000'));


































































































