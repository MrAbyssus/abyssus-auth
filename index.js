import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import fetch from "node-fetch";
import session from "express-session";
import { QuickDB } from "quick.db";

const app = express();
const db = new QuickDB();

app.use(bodyParser.json());
app.use(
  session({
    secret: "supersecret",
    resave: false,
    saveUninitialized: false,
  })
);

// ===============================
// 🔐 Funciones auxiliares
// ===============================

// ✅ Verificar si el usuario autenticado es el OWNER real del servidor
async function verifyOwner(userId, guildId) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.error("❌ Falta el BOT_TOKEN en las variables de entorno.");
    return false;
  }

  try {
    const guild = await axios.get(
      `https://discord.com/api/v10/guilds/${guildId}`,
      {
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
      }
    );

    const ownerId = guild.data.owner_id;
    return String(ownerId) === String(userId);
  } catch (error) {
    console.error(
      "Error al verificar owner:",
      error.response?.data || error.message
    );
    return false;
  }
}

// ✅ Permisos internos del panel
async function hasPermission(userId, guildId, perm) {
  const perms = (await db.get(`PANEL_PERMS_${guildId}`)) || {};
  const userPerms = perms[userId] || [];
  return userPerms.includes(perm);
}

// ✅ Ayuda para ejecutar acciones con el bot
async function botAction(endpoint, method = "post", body = {}) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  return axios({
    url: `https://discord.com/api/v10/${endpoint}`,
    method,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    data: body,
  });
}

// ===============================
// ⚙️ Middleware de sesión
// ===============================
function requireSession(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: "No has iniciado sesión." });
  }
  next();
}

// ===============================
// 🚀 Rutas principales del panel
// ===============================

// Expulsar usuario
app.post("/api/guilds/:guildId/kick", requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { userId } = req.body;
  const sessionUserId = req.session.user.id;

  const isOwner = await verifyOwner(sessionUserId, guildId);
  const hasPerm = await hasPermission(sessionUserId, guildId, "KICK");

  if (!isOwner && !hasPerm)
    return res.status(403).json({ error: "No autorizado" });

  try {
    await botAction(`guilds/${guildId}/members/${userId}`, "delete");
    res.json({ success: true, message: "✅ Usuario expulsado" });
  } catch (e) {
    console.error("Kick error:", e.response?.data || e.message);
    res.status(500).json({ error: "Error al expulsar usuario." });
  }
});

// Banear usuario
app.post("/api/guilds/:guildId/ban", requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { userId, reason } = req.body;
  const sessionUserId = req.session.user.id;

  const isOwner = await verifyOwner(sessionUserId, guildId);
  const hasPerm = await hasPermission(sessionUserId, guildId, "BAN");

  if (!isOwner && !hasPerm)
    return res.status(403).json({ error: "No autorizado" });

  try {
    await botAction(`guilds/${guildId}/bans/${userId}`, "put", {
      delete_message_days: 0,
      reason,
    });
    res.json({ success: true, message: "✅ Usuario baneado" });
  } catch (e) {
    console.error("Ban error:", e.response?.data || e.message);
    res.status(500).json({ error: "Error al banear usuario." });
  }
});

// Timeout
app.post("/api/guilds/:guildId/timeout", requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { userId, communication_disabled_until } = req.body;
  const sessionUserId = req.session.user.id;

  const isOwner = await verifyOwner(sessionUserId, guildId);
  const hasPerm = await hasPermission(sessionUserId, guildId, "TIMEOUT");

  if (!isOwner && !hasPerm)
    return res.status(403).json({ error: "No autorizado" });

  try {
    await botAction(`guilds/${guildId}/members/${userId}`, "patch", {
      communication_disabled_until,
    });
    res.json({ success: true, message: "✅ Timeout aplicado" });
  } catch (e) {
    console.error("Timeout error:", e.response?.data || e.message);
    res.status(500).json({ error: "Error al aplicar timeout." });
  }
});

// Crear rol
app.post("/api/guilds/:guildId/create-role", requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { name, color } = req.body;
  const sessionUserId = req.session.user.id;

  const isOwner = await verifyOwner(sessionUserId, guildId);
  const hasPerm = await hasPermission(sessionUserId, guildId, "ROLE_MANAGE");

  if (!isOwner && !hasPerm)
    return res.status(403).json({ error: "No autorizado" });

  try {
    const resp = await botAction(`guilds/${guildId}/roles`, "post", {
      name,
      color,
    });
    res.json({ success: true, data: resp.data });
  } catch (e) {
    console.error("Create role error:", e.response?.data || e.message);
    res.status(500).json({ error: "Error al crear rol." });
  }
});

// Eliminar rol
app.post("/api/guilds/:guildId/delete-role", requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { roleId } = req.body;
  const sessionUserId = req.session.user.id;

  const isOwner = await verifyOwner(sessionUserId, guildId);
  const hasPerm = await hasPermission(sessionUserId, guildId, "ROLE_MANAGE");

  if (!isOwner && !hasPerm)
    return res.status(403).json({ error: "No autorizado" });

  try {
    await botAction(`guilds/${guildId}/roles/${roleId}`, "delete");
    res.json({ success: true, message: "✅ Rol eliminado" });
  } catch (e) {
    console.error("Delete role error:", e.response?.data || e.message);
    res.status(500).json({ error: "Error al eliminar rol." });
  }
});

// Crear canal
app.post("/api/guilds/:guildId/create-channel", requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { name, type } = req.body;
  const sessionUserId = req.session.user.id;

  const isOwner = await verifyOwner(sessionUserId, guildId);
  const hasPerm = await hasPermission(sessionUserId, guildId, "CHANNEL_MANAGE");

  if (!isOwner && !hasPerm)
    return res.status(403).json({ error: "No autorizado" });

  try {
    const resp = await botAction(`guilds/${guildId}/channels`, "post", {
      name,
      type,
    });
    res.json({ success: true, data: resp.data });
  } catch (e) {
    console.error("Create channel error:", e.response?.data || e.message);
    res.status(500).json({ error: "Error al crear canal." });
  }
});

// Eliminar canal
app.post("/api/guilds/:guildId/delete-channel", requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { channelId } = req.body;
  const sessionUserId = req.session.user.id;

  const isOwner = await verifyOwner(sessionUserId, guildId);
  const hasPerm = await hasPermission(sessionUserId, guildId, "CHANNEL_MANAGE");

  if (!isOwner && !hasPerm)
    return res.status(403).json({ error: "No autorizado" });

  try {
    await botAction(`channels/${channelId}`, "delete");
    res.json({ success: true, message: "✅ Canal eliminado" });
  } catch (e) {
    console.error("Delete channel error:", e.response?.data || e.message);
    res.status(500).json({ error: "Error al eliminar canal." });
  }
});

// ===============================
// ⚙️ Permisos internos del panel
// ===============================
app.post("/api/guilds/:guildId/perms/set", requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId, perms } = req.body;
  const sessionUserId = req.session.user.id;

  const isOwner = await verifyOwner(sessionUserId, guildId);
  if (!isOwner)
    return res.status(403).json({ error: "Solo el owner puede asignar permisos." });

  const current = (await db.get(`PANEL_PERMS_${guildId}`)) || {};
  current[targetId] = perms;
  await db.set(`PANEL_PERMS_${guildId}`, current);

  res.json({ success: true, message: "✅ Permisos asignados correctamente." });
});

// ===============================
// 🪵 Logs
// ===============================
app.get("/logs/:guildId", requireSession, async (req, res) => {
  const { guildId } = req.params;
  const sessionUserId = req.session.user.id;

  const isOwner = await verifyOwner(sessionUserId, guildId);
  const hasPerm = await hasPermission(sessionUserId, guildId, "LOGS_VIEW");

  if (!isOwner && !hasPerm)
    return res.status(403).json({ error: "No autorizado" });

  const logs = (await db.get(`LOGS_${guildId}`)) || [];
  res.json(logs);
});

app.post("/logs/:guildId/clear", requireSession, async (req, res) => {
  const { guildId } = req.params;
  const sessionUserId = req.session.user.id;

  const isOwner = await verifyOwner(sessionUserId, guildId);
  const hasPerm = await hasPermission(sessionUserId, guildId, "LOGS_CLEAR");

  if (!isOwner && !hasPerm)
    return res.status(403).json({ error: "No autorizado" });

  await db.delete(`LOGS_${guildId}`);
  res.json({ success: true, message: "✅ Logs eliminados" });
});

// ===============================
// 🚀 Servidor
// ===============================
app.listen(3000, () =>
  console.log("✅ Panel backend corriendo en puerto 3000")
);


































































































