// ===================================================
// 🌑 Abyssus Dashboard Backend + Frontend Moderno
// ===================================================

import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
app.use(express.json());

// Soporte para __dirname en módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, "public")));

const usuariosAutenticados = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MODERATOR_ROLE_NAMES = ["Moderador", "Helper", "Staff"];

// ===================================================
// 🔐 hasPermission() — permisos avanzados
// ===================================================
async function hasPermission(userId, guildId, level) {
  try {
    const ses = usuariosAutenticados.get(userId);
    if (!ses) return false;

    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) return false;

    const memberRes = await axios.get(
      `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    );
    const member = memberRes.data;

    const guildRes = await axios.get(
      `https://discord.com/api/v10/guilds/${guildId}`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    );
    const guild = guildRes.data;

    const isOwner = guild.owner_id === userId;
    let perms = BigInt(0);
    if (member.permissions) {
      perms = BigInt(member.permissions.toString());
    } else if (Array.isArray(member.roles)) {
      for (const roleId of member.roles) {
        try {
          const roleRes = await axios.get(
            `https://discord.com/api/v10/guilds/${guildId}/roles/${roleId}`,
            { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
          );
          perms |= BigInt(roleRes.data.permissions || "0");
        } catch {}
      }
    }

    const guildRolesRes = await axios.get(
      `https://discord.com/api/v10/guilds/${guildId}/roles`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    );
    const guildRoles = guildRolesRes.data;

    const memberRoleNames = member.roles
      .map((rid) => {
        const r = guildRoles.find((gr) => gr.id === rid);
        return r ? r.name : null;
      })
      .filter(Boolean);

    const hasModRole = memberRoleNames.some((name) =>
      MODERATOR_ROLE_NAMES.includes(name)
    );

    const ADMIN = BigInt(0x8);
    const MANAGE_GUILD = BigInt(0x20);
    const MANAGE_CHANNELS = BigInt(0x10);
    const MANAGE_ROLES = BigInt(0x10000000);
    const KICK_MEMBERS = BigInt(0x2);
    const BAN_MEMBERS = BigInt(0x4);

    const isAdmin =
      (perms & ADMIN) === ADMIN || (perms & MANAGE_GUILD) === MANAGE_GUILD;
    const isMod =
      hasModRole ||
      (perms & (MANAGE_CHANNELS | MANAGE_ROLES | KICK_MEMBERS | BAN_MEMBERS)) !==
        BigInt(0);

    if (level === "owner") return isOwner;
    if (level === "admin") return isOwner || isAdmin;
    if (level === "mod") return isOwner || isAdmin || isMod;
    if (level === "kickban")
      return (
        isOwner ||
        isAdmin ||
        (perms & (KICK_MEMBERS | BAN_MEMBERS)) !== BigInt(0)
      );

    return false;
  } catch (err) {
    console.error("Error en hasPermission:", err.response?.data || err.message);
    return false;
  }
}

// ===================================================
// 🔧 /mis-guilds/:userId — solo servidores con el bot
// ===================================================
app.get("/mis-guilds/:userId", async (req, res) => {
  const userId = req.params.userId;
  const ses = usuariosAutenticados.get(userId);
  if (!ses) return res.redirect("/login");

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send("Falta BOT_TOKEN en .env");

  try {
    const guildsRes = await axios.get(
      "https://discord.com/api/users/@me/guilds",
      {
        headers: { Authorization: `Bearer ${ses.accessToken}` },
      }
    );
    const allGuilds = Array.isArray(guildsRes.data) ? guildsRes.data : [];

    const botGuildsRes = await axios.get(
      "https://discord.com/api/v10/users/@me/guilds",
      {
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
      }
    );
    const botGuilds = Array.isArray(botGuildsRes.data)
      ? botGuildsRes.data.map((g) => g.id)
      : [];

    const filteredGuilds = allGuilds.filter((g) => {
      const perms = BigInt(g.permissions || "0");
      const isOwner = g.owner === true;
      const isAdmin = (perms & BigInt(0x8)) === BigInt(0x8);
      const canManage = (perms & BigInt(0x20)) === BigInt(0x20);
      const botInGuild = botGuilds.includes(g.id);
      return botInGuild && (isOwner || isAdmin || canManage);
    });

    const results = [];
    for (const g of filteredGuilds) {
      try {
        const info = await axios.get(
          `https://discord.com/api/v10/guilds/${g.id}?with_counts=true`,
          { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
        );
        results.push({
          id: g.id,
          name: g.name,
          icon: g.icon,
          member_count: info.data.approximate_member_count || "N/A",
        });
      } catch {
        results.push({
          id: g.id,
          name: g.name,
          icon: g.icon,
          member_count: "N/A",
        });
      }
    }

    return res.json(results);
  } catch (err) {
    console.error("Error en /mis-guilds:", err.response?.data || err.message);
    return res.status(500).send("Error obteniendo los servidores.");
  }
});

// ===================================================
// 👢 Kick
// ===================================================
app.post("/api/guilds/:guildId/kick", async (req, res) => {
  const { guildId } = req.params;
  const { userId, targetId } = req.body;

  if (!(await hasPermission(userId, guildId, "kickban")))
    return res.status(403).send("No tienes permiso para expulsar miembros.");

  const BOT_TOKEN = process.env.BOT_TOKEN;
  try {
    await axios.delete(
      `https://discord.com/api/v10/guilds/${guildId}/members/${targetId}`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    );
    res.json({ success: true });
  } catch {
    res.status(500).send("Error expulsando usuario.");
  }
});

// ===================================================
// 🔨 Ban
// ===================================================
app.post("/api/guilds/:guildId/ban", async (req, res) => {
  const { guildId } = req.params;
  const { userId, targetId, reason } = req.body;

  if (!(await hasPermission(userId, guildId, "kickban")))
    return res.status(403).send("No tienes permiso para banear miembros.");

  const BOT_TOKEN = process.env.BOT_TOKEN;
  try {
    await axios.put(
      `https://discord.com/api/v10/guilds/${guildId}/bans/${targetId}`,
      { delete_message_days: 0, reason },
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    );
    res.json({ success: true });
  } catch {
    res.status(500).send("Error baneando usuario.");
  }
});

// ===================================================
// 🌑 Frontend Moderno (modo oscuro)
// ===================================================
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Abyssus Dashboard</title>
<style>
body {
  background-color: #0f0f0f;
  color: #e0e0e0;
  font-family: "Inter", sans-serif;
  margin: 0;
  text-align: center;
}
header {
  background: #111;
  color: #5865f2;
  padding: 20px;
  font-size: 1.5em;
  font-weight: 600;
}
.container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  width: 90%;
  margin: 30px auto;
}
.card {
  background: #1a1a1a;
  padding: 20px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  transition: 0.2s;
}
.card:hover {
  transform: scale(1.02);
}
.icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
}
.btn {
  background: #5865f2;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  margin: 5px;
  cursor: pointer;
  font-size: 0.9em;
}
.btn:disabled {
  background: #333;
  cursor: not-allowed;
  opacity: 0.5;
}
.btn-danger {
  background: #ff4444;
}
.btn-success {
  background: #43b581;
}
</style>
</head>
<body>
<header>🌑 Abyssus Dashboard</header>
<div class="container" id="guilds"></div>
<script>
async function cargarServidores() {
  const userId = "TU_USER_ID_AQUI"; // <-- reemplaza con tu ID de usuario para test
  const res = await fetch("/mis-guilds/" + userId);
  const guilds = await res.json();

  const contenedor = document.getElementById("guilds");
  contenedor.innerHTML = "";

  guilds.forEach(g => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = \`
      <img src="https://cdn.discordapp.com/icons/\${g.id}/\${g.icon}.png" class="icon" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
      <h3>\${g.name}</h3>
      <p>\${g.member_count} miembros</p>
      <button class="btn">Crear Canal</button>
      <button class="btn">Crear Rol</button>
      <button class="btn btn-success">Kick</button>
      <button class="btn btn-danger">Ban</button>
    \`;
    contenedor.appendChild(card);
  });
}
cargarServidores();
</script>
</body>
</html>`);
});

// ===================================================
// 🚀 Servidor listo
// ===================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(\`✅ Abyssus Dashboard activo en http://localhost:\${PORT}\`)
);














































































































