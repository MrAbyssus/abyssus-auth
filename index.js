// -------------------- /panel/:guildId --------------------
const fs = require("fs");
const path = require("path");

app.use(express.json()); // necesario para POST JSON

app.get("/panel/:guildId", async (req, res) => {
  const guildId = req.params.guildId;
  const userId = req.query.userId;
  const usuario = usuariosAutenticados.get(userId);
  if (!usuario) return res.redirect("/login");

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send("Falta BOT_TOKEN en .env");

  try {
    const guildsRes = await axios.get("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${usuario.accessToken}` },
    });
    const isAdmin =
      Array.isArray(guildsRes.data) &&
      guildsRes.data.some((g) => g.id === guildId && (BigInt(g.permissions) & BigInt(0x8)) !== 0);
    if (!isAdmin) return res.status(403).send("No tienes permisos para ver este panel");

    const [guildInfoRes, rolesRes, channelsRes] = await Promise.all([
      axios.get(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
      }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
      }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
      }),
    ]);

    const guild = guildInfoRes.data;
    const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
    const channels = Array.isArray(channelsRes.data) ? channelsRes.data : [];

    const iconUrl = guild.icon
      ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
      : "https://via.placeholder.com/128?text=?";

    const tipoCanalEmoji = { 0: "📝", 2: "🎤", 4: "📂", 13: "🎙️", 15: "🗂️" };
    const rolesList = roles
      .map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`)
      .join("");
    const channelsList = channels
      .map((c) => `<option value="${c.id}">${tipoCanalEmoji[c.type] || "💬"} ${escapeHtml(c.name)}</option>`)
      .join("");

    res.send(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Panel Abyssus - ${escapeHtml(guild.name)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body {
  font-family: "Segoe UI", Arial;
  margin: 0;
  background: #2b2d31;
  color: #fff;
}
.card {
  background: #313338;
  margin: 1rem auto;
  padding: 1rem;
  border-radius: 12px;
  max-width: 900px;
}
button {
  background: #5865f2;
  color: white;
  border: none;
  padding: 0.6rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  margin-top: 0.6rem;
}
input, select, textarea {
  background: #1e1f22;
  color: #fff;
  border: 1px solid #3a3c43;
  border-radius: 6px;
  padding: 0.4rem;
  width: 100%;
  margin-bottom: 0.5rem;
}
h2 { color: #b5b6b8; }
</style>
</head>
<body>
<div class="card">
  <h1>${escapeHtml(guild.name)}</h1>
  <p>👥 ${guild.approximate_member_count || "N/A"} miembros</p>
</div>

<div class="card">
  <h2>Moderación</h2>
  <form id="kickForm">
    <h3>Expulsar usuario</h3>
    <input placeholder="ID del usuario" name="userId" required>
    <input placeholder="Motivo" name="reason">
    <button type="submit">Expulsar</button>
  </form>

  <form id="banForm">
    <h3>Banear usuario</h3>
    <input placeholder="ID del usuario" name="userId" required>
    <input placeholder="Motivo" name="reason">
    <input type="number" name="days" min="0" max="7" placeholder="Días de mensajes a eliminar (0-7)">
    <button type="submit">Banear</button>
  </form>
</div>

<div class="card">
  <h2>Mensajería</h2>
  <form id="msgForm">
    <select name="channelId">${channelsList}</select>
    <textarea name="message" placeholder="Escribe el mensaje a enviar..." required></textarea>
    <button type="submit">Enviar mensaje</button>
  </form>
</div>

<div class="card">
  <h2>Gestión de roles y canales</h2>
  <form id="createRoleForm">
    <input placeholder="Nombre del rol" name="name" required>
    <button type="submit">Crear rol</button>
  </form>
  <form id="deleteRoleForm">
    <select name="roleId">${rolesList}</select>
    <button type="submit">Eliminar rol</button>
  </form>
  <hr style="opacity:.2">
  <form id="createChannelForm">
    <input placeholder="Nombre del canal" name="name" required>
    <button type="submit">Crear canal</button>
  </form>
  <form id="deleteChannelForm">
    <select name="channelId">${channelsList}</select>
    <button type="submit">Eliminar canal</button>
  </form>
</div>

<script>
async function sendAction(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const t = await res.text();
  alert(t);
}
document.getElementById("kickForm").onsubmit = e => {
  e.preventDefault();
  sendAction("/api/kick", { guildId: "${guild.id}", ...Object.fromEntries(new FormData(e.target)) });
};
document.getElementById("banForm").onsubmit = e => {
  e.preventDefault();
  sendAction("/api/ban", { guildId: "${guild.id}", ...Object.fromEntries(new FormData(e.target)) });
};
document.getElementById("msgForm").onsubmit = e => {
  e.preventDefault();
  sendAction("/api/message", { guildId: "${guild.id}", ...Object.fromEntries(new FormData(e.target)) });
};
document.getElementById("createRoleForm").onsubmit = e => {
  e.preventDefault();
  sendAction("/api/createRole", { guildId: "${guild.id}", ...Object.fromEntries(new FormData(e.target)) });
};
document.getElementById("deleteRoleForm").onsubmit = e => {
  e.preventDefault();
  sendAction("/api/deleteRole", { guildId: "${guild.id}", ...Object.fromEntries(new FormData(e.target)) });
};
document.getElementById("createChannelForm").onsubmit = e => {
  e.preventDefault();
  sendAction("/api/createChannel", { guildId: "${guild.id}", ...Object.fromEntries(new FormData(e.target)) });
};
document.getElementById("deleteChannelForm").onsubmit = e => {
  e.preventDefault();
  sendAction("/api/deleteChannel", { guildId: "${guild.id}", ...Object.fromEntries(new FormData(e.target)) });
};
</script>
</body></html>`);
  } catch (err) {
    console.error("panel err:", err.response?.data || err.message);
    res.status(500).send("<h2>Error cargando panel</h2><pre>" + safeJson(err.response?.data || err.message) + "</pre>");
  }
});

// -------------------- API ACTIONS --------------------
function logAction(action, details) {
  const logLine = `[${new Date().toISOString()}] ${action}: ${JSON.stringify(details)}\n`;
  fs.appendFileSync(path.join(__dirname, "acciones.log"), logLine);
}

const discordAPI = (method, url, body = null, BOT_TOKEN) =>
  axios({
    method,
    url: `https://discord.com/api/v10${url}`,
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    data: body,
  });

// Kick
app.post("/api/kick", async (req, res) => {
  const { guildId, userId, reason } = req.body;
  try {
    await discordAPI("DELETE", `/guilds/${guildId}/members/${userId}`, null, process.env.BOT_TOKEN);
    logAction("KICK", { guildId, userId, reason });
    res.send("✅ Usuario expulsado correctamente");
  } catch (e) {
    res.status(500).send("❌ Error al expulsar: " + e.response?.data?.message);
  }
});

// Ban
app.post("/api/ban", async (req, res) => {
  const { guildId, userId, reason, days = 0 } = req.body;
  try {
    await discordAPI("PUT", `/guilds/${guildId}/bans/${userId}`, { delete_message_days: days, reason }, process.env.BOT_TOKEN);
    logAction("BAN", { guildId, userId, reason, days });
    res.send("✅ Usuario baneado correctamente");
  } catch (e) {
    res.status(500).send("❌ Error al banear: " + e.response?.data?.message);
  }
});

// Mensaje
app.post("/api/message", async (req, res) => {
  const { channelId, message } = req.body;
  try {
    await discordAPI("POST", `/channels/${channelId}/messages`, { content: message }, process.env.BOT_TOKEN);
    logAction("MESSAGE", { channelId, message });
    res.send("✅ Mensaje enviado correctamente");
  } catch (e) {
    res.status(500).send("❌ Error al enviar mensaje: " + e.response?.data?.message);
  }
});

// Crear / eliminar roles y canales
app.post("/api/createRole", async (req, res) => {
  const { guildId, name } = req.body;
  try {
    await discordAPI("POST", `/guilds/${guildId}/roles`, { name }, process.env.BOT_TOKEN);
    logAction("CREATE_ROLE", { guildId, name });
    res.send("✅ Rol creado");
  } catch (e) {
    res.status(500).send("❌ Error al crear rol");
  }
});
app.post("/api/deleteRole", async (req, res) => {
  const { guildId, roleId } = req.body;
  try {
    await discordAPI("DELETE", `/guilds/${guildId}/roles/${roleId}`, null, process.env.BOT_TOKEN);
    logAction("DELETE_ROLE", { guildId, roleId });
    res.send("✅ Rol eliminado");
  } catch (e) {
    res.status(500).send("❌ Error al eliminar rol");
  }
});
app.post("/api/createChannel", async (req, res) => {
  const { guildId, name } = req.body;
  try {
    await discordAPI("POST", `/guilds/${guildId}/channels`, { name }, process.env.BOT_TOKEN);
    logAction("CREATE_CHANNEL", { guildId, name });
    res.send("✅ Canal creado");
  } catch (e) {
    res.status(500).send("❌ Error al crear canal");
  }
});
app.post("/api/deleteChannel", async (req, res) => {
  const { guildId, channelId } = req.body;
  try {
    await discordAPI("DELETE", `/channels/${channelId}`, null, process.env.BOT_TOKEN);
    logAction("DELETE_CHANNEL", { guildId, channelId });
    res.send("✅ Canal eliminado");
  } catch (e) {
    res.status(500).send("❌ Error al eliminar canal");
  }
});

// ---------- start server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));



















































































