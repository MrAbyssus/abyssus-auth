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

// ✅ Nueva verificación de owner: usa el bot para comprobar el owner real del servidor
async function verifyOwner(ses, userId, guildId) {
  const BOT_TOKEN = process.env.BOT_TOKEN;

  try {
    if (!BOT_TOKEN) return false;
    const guildRes = await axios.get(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
      timeout: 8000,
    });
    const ownerId = guildRes?.data?.owner_id;
    if (String(ownerId) === String(userId)) return true;
  } catch (err) {
    console.error(`Error verifying owner for guild ${guildId}:`, err.response?.data || err.message);
  }

  return false;
}

// === Helpers ===
async function getPerms(guildId, userId) {
  const guildPerms = await db.get(`PANEL_PERMS_${guildId}`) || {};
  return guildPerms[userId] || [];
}

async function hasPermission(guildId, userId, perm) {
  const perms = await getPerms(guildId, userId);
  return perms.includes(perm);
}

function getSession(req) {
  return req.session?.user ? req.session : null;
}

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

// === Rutas del panel ===

app.post('/api/guilds/:guildId/kick', async (req, res) => {
  const { guildId } = req.params;
  const { userId } = req.body;
  const ses = getSession(req);
  if (!ses) return res.status(401).json({ error: 'Not logged in' });

  const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
  if (!(isOwner || await hasPermission(guildId, req.sessionUserId, 'KICK'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await botAction(`guilds/${guildId}/members/${userId}`, 'delete');
  res.json({ success: true });
});

app.post('/api/guilds/:guildId/ban', async (req, res) => {
  const { guildId } = req.params;
  const { userId, reason } = req.body;
  const ses = getSession(req);
  if (!ses) return res.status(401).json({ error: 'Not logged in' });

  const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
  if (!(isOwner || await hasPermission(guildId, req.sessionUserId, 'BAN'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await botAction(`guilds/${guildId}/bans/${userId}`, 'put', { delete_message_days: 0, reason });
  res.json({ success: true });
});

app.post('/api/guilds/:guildId/timeout', async (req, res) => {
  const { guildId } = req.params;
  const { userId, communication_disabled_until } = req.body;
  const ses = getSession(req);
  if (!ses) return res.status(401).json({ error: 'Not logged in' });

  const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
  if (!(isOwner || await hasPermission(guildId, req.sessionUserId, 'TIMEOUT'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await botAction(`guilds/${guildId}/members/${userId}`, 'patch', { communication_disabled_until });
  res.json({ success: true });
});

app.post('/api/guilds/:guildId/message', async (req, res) => {
  const { guildId } = req.params;
  const { channelId, content } = req.body;
  const ses = getSession(req);
  if (!ses) return res.status(401).json({ error: 'Not logged in' });

  const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
  if (!(isOwner || await hasPermission(guildId, req.sessionUserId, 'MESSAGE'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await botAction(`channels/${channelId}/messages`, 'post', { content });
  res.json({ success: true });
});

app.post('/api/guilds/:guildId/create-role', async (req, res) => {
  const { guildId } = req.params;
  const { name, color } = req.body;
  const ses = getSession(req);
  if (!ses) return res.status(401).json({ error: 'Not logged in' });

  const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
  if (!(isOwner || await hasPermission(guildId, req.sessionUserId, 'ROLE_MANAGE'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const resp = await botAction(`guilds/${guildId}/roles`, 'post', { name, color });
  res.json(resp.data);
});

app.post('/api/guilds/:guildId/delete-role', async (req, res) => {
  const { guildId } = req.params;
  const { roleId } = req.body;
  const ses = getSession(req);
  if (!ses) return res.status(401).json({ error: 'Not logged in' });

  const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
  if (!(isOwner || await hasPermission(guildId, req.sessionUserId, 'ROLE_MANAGE'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await botAction(`guilds/${guildId}/roles/${roleId}`, 'delete');
  res.json({ success: true });
});

app.post('/api/guilds/:guildId/create-channel', async (req, res) => {
  const { guildId } = req.params;
  const { name, type } = req.body;
  const ses = getSession(req);
  if (!ses) return res.status(401).json({ error: 'Not logged in' });

  const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
  if (!(isOwner || await hasPermission(guildId, req.sessionUserId, 'CHANNEL_MANAGE'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const resp = await botAction(`guilds/${guildId}/channels`, 'post', { name, type });
  res.json(resp.data);
});

app.post('/api/guilds/:guildId/delete-channel', async (req, res) => {
  const { guildId } = req.params;
  const { channelId } = req.body;
  const ses = getSession(req);
  if (!ses) return res.status(401).json({ error: 'Not logged in' });

  const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
  if (!(isOwner || await hasPermission(guildId, req.sessionUserId, 'CHANNEL_MANAGE'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await botAction(`channels/${channelId}`, 'delete');
  res.json({ success: true });
});

app.post('/api/guilds/:guildId/perms/set', async (req, res) => {
  const { guildId } = req.params;
  const { targetId, perms } = req.body;
  const ses = getSession(req);
  if (!ses) return res.status(401).json({ error: 'Not logged in' });

  const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
  if (!isOwner) return res.status(403).json({ error: 'Only owner can set perms' });

  const current = await db.get(`PANEL_PERMS_${guildId}`) || {};
  current[targetId] = perms;
  await db.set(`PANEL_PERMS_${guildId}`, current);
  res.json({ success: true });
});

app.get('/logs/:guildId', async (req, res) => {
  const { guildId } = req.params;
  const ses = getSession(req);
  if (!ses) return res.status(401).json({ error: 'Not logged in' });

  const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
  if (!(isOwner || await hasPermission(guildId, req.sessionUserId, 'LOGS_VIEW'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const logs = await db.get(`LOGS_${guildId}`) || [];
  res.json(logs);
});

app.post('/logs/:guildId/clear', async (req, res) => {
  const { guildId } = req.params;
  const ses = getSession(req);
  if (!ses) return res.status(401).json({ error: 'Not logged in' });

  const isOwner = await verifyOwner(ses, req.sessionUserId, guildId);
  if (!(isOwner || await hasPermission(guildId, req.sessionUserId, 'LOGS_CLEAR'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await db.delete(`LOGS_${guildId}`);
  res.json({ success: true });
});

// === Servidor ===
app.listen(3000, () => console.log('✅ Panel backend corriendo en el puerto 3000'));

































































































