// ===============================
// Abyssus Panel v2 — Panel web visual y funcional
// ===============================
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
require("dotenv").config();
const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");

// ---------- CONFIG ----------
const app = express();
const PORT = process.env.PORT || 3000;
const logsFile = path.join(__dirname, "logs.json");
const permsFile = path.join(__dirname, "panel_perms.json");

// Asegurar existencia de archivos
if (!fs.existsSync(logsFile)) fs.writeFileSync(logsFile, "[]");
if (!fs.existsSync(permsFile)) fs.writeFileSync(permsFile, "{}");

// ---------- DISCORD CLIENT ----------
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

bot.login(process.env.BOT_TOKEN);

// ---------- APP ----------
app.use(bodyParser.json());
app.use(express.static("public"));

// ========== FUNCIONES AUXILIARES ==========
function logAction(action) {
  const logs = JSON.parse(fs.readFileSync(logsFile));
  logs.push({ time: new Date().toISOString(), ...action });
  fs.writeFileSync(logsFile, JSON.stringify(logs, null, 2));
}

function getUserPermLevel(userId, guild) {
  const perms = JSON.parse(fs.readFileSync(permsFile));
  if (perms[userId]?.[guild.id]) return perms[userId][guild.id];

  const member = guild.members.cache.get(userId);
  if (!member) return "viewer";
  if (guild.ownerId === userId) return "owner";
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return "admin";
  return "viewer";
}

// ========== AUTH ==========
const OAUTH_URL = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.DISCORD_REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;

app.get("/", (req, res) => {
  res.send(`
    <html>
    <head><title>Abyssus Panel</title></head>
    <body style="background:#111;color:white;font-family:sans-serif;text-align:center;">
      <h1>⚙️ Abyssus Control Panel</h1>
      <a href="${OAUTH_URL}" style="color:#7289da;font-size:20px;">Iniciar sesión con Discord</a>
    </body></html>
  `);
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("Error: Falta el código de autorización.");

  try {
    const params = new URLSearchParams();
    params.append("client_id", process.env.DISCORD_CLIENT_ID);
    params.append("client_secret", process.env.DISCORD_CLIENT_SECRET);
    params.append("grant_type", "authorization_code");
    params.append("redirect_uri", process.env.DISCORD_REDIRECT_URI);
    params.append("code", code);

    const tokenResponse = await axios.post("https://discord.com/api/oauth2/token", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const access_token = tokenResponse.data.access_token;

    const user = (await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` },
    })).data;

    const guilds = (await axios.get("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${access_token}` },
    })).data;

    const botGuilds = bot.guilds.cache.map(g => ({
      id: g.id,
      name: g.name,
      icon: g.iconURL(),
      owner: g.ownerId === user.id,
    }));

    const commonGuilds = guilds
      .filter(g => botGuilds.some(bg => bg.id === g.id))
      .filter(g => g.owner); // solo donde es owner

    res.send(`
      <html>
      <head><title>Panel Abyssus</title></head>
      <body style="background:#0d1117;color:white;font-family:sans-serif;">
        <h2 style="text-align:center;">👑 Bienvenido, ${user.username}</h2>
        ${commonGuilds.length === 0
          ? "<p style='text-align:center;'>No eres owner en ningún servidor con Abyssus.</p>"
          : commonGuilds.map(g => `
            <div style="background:#1e1e2f;margin:10px;padding:10px;border-radius:10px;">
              <img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png" width="50" style="border-radius:50%;">
              <strong>${g.name}</strong><br>
              <a href="/panel/${g.id}" style="color:#7289da;">⚙️ Entrar al panel</a>
            </div>
          `).join("")}
      </body></html>
    `);
  } catch (err) {
    console.error(err);
    res.send("Error al iniciar sesión con Discord.");
  }
});

// ========== PANEL ==========
app.get("/panel/:guildId", async (req, res) => {
  const guild = bot.guilds.cache.get(req.params.guildId);
  if (!guild) return res.send("El bot no está en ese servidor.");

  const members = await guild.members.fetch();
  const roles = guild.roles.cache.map(r => r.name).join(", ");
  const logs = JSON.parse(fs.readFileSync(logsFile));

  res.send(`
    <html>
    <head><title>Panel ${guild.name}</title></head>
    <body style="background:#0d1117;color:white;font-family:sans-serif;">
      <h2>⚙️ Panel — ${guild.name}</h2>
      <p><strong>Miembros:</strong> ${members.size}</p>
      <p><strong>Roles:</strong> ${roles}</p>
      <h3>🧾 Logs recientes</h3>
      <div style="background:#1e1e2f;border-radius:10px;padding:10px;max-height:300px;overflow-y:auto;">
        ${logs.slice(-10).map(l => `
          <div style="border-bottom:1px solid #333;padding:4px;">
            [${new Date(l.time).toLocaleTimeString()}] <b>${l.action || "Evento"}</b>: ${l.detail || ""}
          </div>
        `).join("")}
      </div>
      <br>
      <button onclick="location.href='/'" style="background:#7289da;color:white;padding:10px;border:none;border-radius:6px;">⬅️ Volver</button>
    </body></html>
  `);
});

// ========== EJEMPLO DE LOG DESDE EL BOT ==========
bot.on("messageCreate", msg => {
  if (msg.author.bot) return;
  logAction({ action: "Mensaje", detail: `${msg.author.tag}: ${msg.content}` });
});

bot.on("guildMemberAdd", member => {
  logAction({ action: "Nuevo miembro", detail: `${member.user.tag} se unió a ${member.guild.name}` });
});

// ========== SERVER ==========
app.listen(PORT, () => console.log(`✅ Abyssus panel activo en puerto ${PORT}`));
































































































