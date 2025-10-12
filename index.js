// index.js
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static("public"));

// 📁 Logs
const LOG_FILE = path.join(__dirname, "logs", "panel.log");
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

const usuariosAutenticados = new Map();

// === Utilidades ===
function safeJson(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}
function escapeHtml(s = "") {
  return String(s).replace(/[&<>\"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function logAction(userId, action, data = {}) {
  const line = `[${new Date().toISOString()}] ${userId}: ${action} ${safeJson(data)}\n`;
  fs.appendFileSync(LOG_FILE, line);
}
function requireSession(req, res, next) {
  const userId = req.query.userId || req.body.userId;
  if (!userId) return res.status(400).send("Falta userId");
  const user = usuariosAutenticados.get(userId);
  if (!user) return res.status(401).send("No autenticado");
  req.sessionUserId = userId;
  req.session = user;
  next();
}

// === LOGIN ===
app.get("/login", (req, res) => {
  const { CLIENT_ID, REDIRECT_URI } = process.env;
  if (!CLIENT_ID || !REDIRECT_URI) return res.send("Falta configuración .env");

  const url = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&response_type=code&scope=identify%20guilds`;
  res.send(`
  <html><head><title>Login Abyssus</title><style>
  body{background:#202225;color:white;font-family:Inter,Segoe UI,Arial;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  .card{background:#2f3136;padding:2rem;border-radius:12px;text-align:center;box-shadow:0 0 20px rgba(0,0,0,0.3)}
  a{background:#5865f2;color:white;padding:.8rem 1.4rem;border-radius:8px;text-decoration:none;font-weight:600}
  </style></head><body><div class="card"><h1>Inicia sesión con Discord</h1><a href="${url}">Login con Discord</a></div></body></html>`);
});

// === CALLBACK ===
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect("/login");
  try {
    const token = await axios.post("https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.REDIRECT_URI,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } });

    const tokenData = token.data;
    const userRes = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    usuariosAutenticados.set(userRes.data.id, {
      accessToken: tokenData.access_token,
      username: userRes.data.username,
      avatar: userRes.data.avatar,
    });

    res.send(`
    <html><body style="background:#2f3136;color:white;text-align:center;font-family:Inter">
    <h2>✅ Autenticado como ${userRes.data.username}</h2>
    <a href="/mis-guilds/${userRes.data.id}" style="color:#5865f2;text-decoration:none;font-weight:700">Ver Servidores</a>
    </body></html>`);
  } catch (err) {
    res.status(500).send(`<pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// === SERVIDORES ===
app.get("/mis-guilds/:userId", async (req, res) => {
  const { userId } = req.params;
  const u = usuariosAutenticados.get(userId);
  if (!u) return res.redirect("/login");
  try {
    const guilds = await axios.get("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${u.accessToken}` },
    });
    const guildList = guilds.data.filter(g => g.owner);

    res.send(`<html><head><style>
    body{background:#202225;color:white;font-family:Inter;margin:0;padding:2rem}
    .guild{display:flex;align-items:center;background:#2f3136;margin:.5rem 0;padding:.6rem 1rem;border-radius:8px}
    img{width:48px;height:48px;border-radius:8px;margin-right:1rem}
    a{color:#5865f2;text-decoration:none;font-weight:600}
    </style></head><body>
    <h1>Servidores (Owner)</h1>
    ${guildList.map(g=>`<div class="guild"><img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64"><div><b>${g.name}</b><br><a href="/panel/${g.id}?userId=${userId}">Abrir Panel</a></div></div>`).join("")}
    </body></html>`);
  } catch (err) {
    res.status(500).send(`<pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// === PANEL DE ADMIN ===
app.get("/panel/:guildId", requireSession, async (req, res) => {
  const { guildId } = req.params;
  const BOT_TOKEN = process.env.BOT_TOKEN;

  try {
    const [guild, members, channels, roles] = await Promise.all([
      axios.get(`https://discord.com/api/v10/guilds/${guildId}`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/members?limit=30`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/channels`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } })
    ]);

    const textChannels = channels.data.filter(c => c.type === 0);

    res.send(`
    <html><head><title>${guild.data.name}</title>
    <style>
      body{background:#202225;color:white;font-family:Inter;margin:0;padding:2rem}
      h1{color:#fff} .panel{background:#2f3136;padding:1rem;border-radius:8px;margin-bottom:1rem}
      button{background:#5865f2;color:white;border:0;border-radius:6px;padding:.4rem .8rem;cursor:pointer;margin:.2rem}
      select,input,textarea{width:100%;padding:.5rem;background:#40444b;color:white;border:0;border-radius:6px;margin-top:.3rem}
      .member{display:flex;align-items:center;gap:.5rem;margin:.3rem 0}
      .member img{width:32px;height:32px;border-radius:6px}
    </style></head><body>
    <h1>${escapeHtml(guild.data.name)}</h1>

    <div class="panel">
      <h2>📝 Enviar mensaje</h2>
      <select id="ch">${textChannels.map(c=>`<option value="${c.id}">#${c.name}</option>`)}</select>
      <textarea id="msg" rows="3" placeholder="Escribe tu mensaje..."></textarea>
      <button onclick="sendMsg()">Enviar</button>
    </div>

    <div class="panel">
      <h2>👥 Miembros</h2>
      ${members.data.map(m=>`
      <div class="member">
        <img src="https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png">
        <span>${escapeHtml(m.user.username)}#${m.user.discriminator}</span>
        <button onclick="mod('${m.user.id}','kick')">Kick</button>
        <button onclick="mod('${m.user.id}','ban')">Ban</button>
      </div>`).join("")}
    </div>

    <div class="panel">
      <h2>📂 Canales</h2>
      ${textChannels.map(c=>`<div>#${c.name} <button onclick="delChannel('${c.id}')">Eliminar</button></div>`).join("")}
      <input id="newChannel" placeholder="Nombre del nuevo canal">
      <button onclick="createChannel()">Crear Canal</button>
    </div>

    <div class="panel">
      <h2>🎭 Roles</h2>
      ${roles.data.map(r=>`<div>${escapeHtml(r.name)} <button onclick="delRole('${r.id}')">Eliminar</button></div>`).join("")}
      <input id="newRole" placeholder="Nombre del nuevo rol">
      <button onclick="createRole()">Crear Rol</button>
    </div>

    <script>
      async function sendMsg(){
        const content=document.getElementById('msg').value;
        const ch=document.getElementById('ch').value;
        const r=await fetch('/api/message',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({guildId:'${guildId}',channelId:ch,content,userId:'${req.sessionUserId}'})});
        alert(await r.text());
      }

      async function mod(id,action){
        const reason=prompt("Motivo del "+action+":"); if(!reason)return;
        const r=await fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({guildId:'${guildId}',targetId:id,userId:'${req.sessionUserId}',reason})});
        alert(await r.text());
      }

      async function createChannel(){
        const name=document.getElementById('newChannel').value;
        if(!name)return alert("Escribe un nombre");
        const r=await fetch('/api/createChannel',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({guildId:'${guildId}',name,userId:'${req.sessionUserId}'})});
        alert(await r.text());
      }

      async function delChannel(id){
        if(!confirm("¿Eliminar canal?"))return;
        const r=await fetch('/api/deleteChannel',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({guildId:'${guildId}',channelId:id,userId:'${req.sessionUserId}'})});
        alert(await r.text());
      }

      async function createRole(){
        const name=document.getElementById('newRole').value;
        if(!name)return alert("Nombre del rol vacío");
        const r=await fetch('/api/createRole',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({guildId:'${guildId}',name,userId:'${req.sessionUserId}'})});
        alert(await r.text());
      }

      async function delRole(id){
        if(!confirm("¿Eliminar rol?"))return;
        const r=await fetch('/api/deleteRole',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({guildId:'${guildId}',roleId:id,userId:'${req.sessionUserId}'})});
        alert(await r.text());
      }
    </script></body></html>`);
  } catch (err) {
    res.status(500).send(`<pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// === API ===
app.post("/api/:action", requireSession, async (req, res) => {
  const { action } = req.params;
  const BOT = process.env.BOT_TOKEN;
  const { guildId, targetId, channelId, roleId, name, content, reason } = req.body;

  try {
    switch (action) {
      case "kick":
        await axios.delete(`https://discord.com/api/v10/guilds/${guildId}/members/${targetId}`, { headers: { Authorization: `Bot ${BOT}` } });
        logAction(req.sessionUserId, "kick", { targetId, guildId, reason });
        return res.send("✅ Usuario expulsado");

      case "ban":
        await axios.put(`https://discord.com/api/v10/guilds/${guildId}/bans/${targetId}`, { reason }, { headers: { Authorization: `Bot ${BOT}` } });
        logAction(req.sessionUserId, "ban", { targetId, guildId, reason });
        return res.send("✅ Usuario baneado");

      case "message":
        await axios.post(`https://discord.com/api/v10/channels/${channelId}/messages`, { content }, { headers: { Authorization: `Bot ${BOT}` } });
        logAction(req.sessionUserId, "message", { guildId, channelId, content });
        return res.send("✅ Mensaje enviado");

      case "createChannel":
        await axios.post(`https://discord.com/api/v10/guilds/${guildId}/channels`, { name, type: 0 }, { headers: { Authorization: `Bot ${BOT}` } });
        logAction(req.sessionUserId, "createChannel", { name });
        return res.send("✅ Canal creado");

      case "deleteChannel":
        await axios.delete(`https://discord.com/api/v10/channels/${channelId}`, { headers: { Authorization: `Bot ${BOT}` } });
        logAction(req.sessionUserId, "deleteChannel", { channelId });
        return res.send("🗑️ Canal eliminado");

      case "createRole":
        await axios.post(`https://discord.com/api/v10/guilds/${guildId}/roles`, { name }, { headers: { Authorization: `Bot ${BOT}` } });
        logAction(req.sessionUserId, "createRole", { name });
        return res.send("✅ Rol creado");

      case "deleteRole":
        await axios.delete(`https://discord.com/api/v10/guilds/${guildId}/roles/${roleId}`, { headers: { Authorization: `Bot ${BOT}` } });
        logAction(req.sessionUserId, "deleteRole", { roleId });
        return res.send("🗑️ Rol eliminado");

      default:
        return res.status(400).send("Acción inválida");
    }
  } catch (err) {
    res.status(500).send(safeJson(err.response?.data || err.message));
  }
});

// === START ===
app.listen(process.env.PORT || 3000, () =>
  console.log("🌑 Abyssus Panel ejecutándose en puerto 3000")
);

























































































