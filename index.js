// index.js
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const LOG_FILE = path.join(__dirname, "logs", "panel.log");
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

// Sesiones en memoria
const usuariosAutenticados = new Map();

function safeJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}
function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function logAction(userId, action, data = {}) {
  const line = `[${new Date().toISOString()}] User:${userId} -> ${action} ${safeJson(
    data
  )}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

function requireSession(req, res, next) {
  const userId = req.query.userId || req.body.userId;
  if (!userId) return res.status(400).send("Falta userId");
  const usuario = usuariosAutenticados.get(userId);
  if (!usuario) return res.status(401).send("No autenticado");
  req.sessionUserId = userId;
  req.session = usuario;
  next();
}

// ===================== LOGIN =====================
app.get("/login", (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const redirect = process.env.REDIRECT_URI;
  if (!clientId || !redirect)
    return res.status(500).send("Falta CLIENT_ID o REDIRECT_URI en .env");

  const url =
    `https://discord.com/oauth2/authorize?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&response_type=code&scope=identify%20guilds`;

  res.send(`
  <html><head><title>Login Abyssus</title>
  <style>
  body{background:#202225;color:white;font-family:Inter,Segoe UI,Arial;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  .card{background:#2f3136;padding:2rem;border-radius:12px;text-align:center;box-shadow:0 0 20px rgba(0,0,0,0.3)}
  a{display:inline-block;background:#5865f2;color:white;padding:.8rem 1.4rem;border-radius:8px;text-decoration:none;font-weight:600}
  </style></head>
  <body><div class="card">
  <h1>Inicia sesión con Discord</h1>
  <p>Autoriza a Abyssus para acceder a tus servidores.</p>
  <a href="${url}">Login con Discord</a></div></body></html>`);
});

// ===================== CALLBACK =====================
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect("/login");

  try {
    const tokenRes = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.REDIRECT_URI,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenRes.data.access_token;
    const userRes = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const u = userRes.data;

    usuariosAutenticados.set(u.id, {
      accessToken,
      username: u.username,
      discriminator: u.discriminator,
      avatar: u.avatar,
    });

    res.send(`
    <html><body style="background:#2f3136;color:white;text-align:center;font-family:Inter">
    <h2>✅ Autenticado como ${u.username}#${u.discriminator}</h2>
    <a href="/mis-guilds/${u.id}" style="color:#5865f2;text-decoration:none;font-weight:700">Ver Servidores</a>
    </body></html>`);
  } catch (err) {
    console.error("callback error:", err.response?.data || err.message);
    res.status(500).send(`<pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// ===================== MIS SERVIDORES =====================
app.get("/mis-guilds/:userId", async (req, res) => {
  const { userId } = req.params;
  const usuario = usuariosAutenticados.get(userId);
  if (!usuario) return res.redirect("/login");
  const BOT_TOKEN = process.env.BOT_TOKEN;

  try {
    const guildsRes = await axios.get("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${usuario.accessToken}` },
    });

    const guilds = guildsRes.data.filter(
      (g) =>
        (BigInt(g.permissions) & BigInt(0x8)) !== 0 && // admin
        g.owner === true // owner only
    );

    const htmlGuilds = guilds
      .map(
        (g) => `
      <div class="guild">
        <img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64" alt="icon">
        <div><strong>${escapeHtml(g.name)}</strong><br>
        <a href="/panel/${g.id}?userId=${userId}">Abrir Panel</a></div>
      </div>`
      )
      .join("");

    res.send(`
    <html><head><style>
    body{background:#202225;color:white;font-family:Inter;margin:0;padding:2rem}
    .guild{display:flex;align-items:center;background:#2f3136;margin:.5rem 0;padding:.6rem 1rem;border-radius:8px}
    img{width:48px;height:48px;border-radius:8px;margin-right:1rem}
    a{color:#5865f2;text-decoration:none;font-weight:600}
    </style></head><body>
    <h1>Tus servidores (Owner)</h1>${htmlGuilds || "<p>No eres owner de ningún servidor.</p>"}
    </body></html>`);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send(`<pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// ===================== PANEL =====================
app.get("/panel/:guildId", requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { session, sessionUserId } = req;
  const BOT_TOKEN = process.env.BOT_TOKEN;

  try {
    const [guildRes, membersRes, channelsRes, rolesRes] = await Promise.all([
      axios.get(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
      }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/members?limit=50`, {
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
      }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
      }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
      }),
    ]);

    const g = guildRes.data;
    const members = membersRes.data;
    const textChannels = channelsRes.data.filter((c) => c.type === 0);

    res.send(`
    <html><head><meta charset="utf-8"><title>${g.name}</title>
    <style>
      body{background:#202225;color:#dcddde;font-family:Inter,Segoe UI;margin:0;padding:1rem}
      h1{color:#fff}
      .panel{background:#2f3136;padding:1rem;border-radius:8px;margin-bottom:1rem}
      button{background:#5865f2;color:#fff;border:0;border-radius:6px;padding:.4rem .8rem;cursor:pointer}
      select,textarea{width:100%;padding:.5rem;background:#40444b;color:white;border:0;border-radius:6px}
      .member{display:flex;align-items:center;gap:.5rem;margin:.3rem 0}
      .member img{width:32px;height:32px;border-radius:6px}
    </style></head><body>
    <h1>Servidor: ${escapeHtml(g.name)}</h1>

    <div class="panel">
      <h2>Enviar mensaje como Abyssus</h2>
      <select id="ch">${textChannels.map((c) => `<option value="${c.id}">#${c.name}</option>`)}</select>
      <textarea id="msg" rows="4" placeholder="Escribe tu mensaje..."></textarea>
      <button onclick="sendMsg()">Enviar</button>
    </div>

    <div class="panel">
      <h2>Miembros</h2>
      ${members
        .map(
          (m) => `
        <div class="member">
          <img src="https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png">
          <span>${escapeHtml(m.user.username)}#${m.user.discriminator}</span>
          <button onclick="moderate('${m.user.id}','kick')">Kick</button>
          <button onclick="moderate('${m.user.id}','ban')">Ban</button>
        </div>`
        )
        .join("")}
    </div>

    <script>
      async function moderate(id,action){
        const reason = prompt("Motivo del "+action+":");
        if(!reason)return;
        const r = await fetch('/api/'+action,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({guildId:'${guildId}',targetId:id,userId:'${sessionUserId}',reason})
        });
        alert(await r.text());
      }

      async function sendMsg(){
        const ch=document.getElementById('ch').value;
        const content=document.getElementById('msg').value;
        if(!content)return alert("Escribe un mensaje");
        const r=await fetch('/api/message',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({guildId:'${guildId}',channelId:ch,content,userId:'${sessionUserId}'})
        });
        alert(await r.text());
      }
    </script>
    </body></html>`);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send(`<pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// ===================== API =====================
app.post("/api/:action", requireSession, async (req, res) => {
  const { action } = req.params;
  const { guildId, targetId, channelId, content, reason } = req.body;
  const BOT_TOKEN = process.env.BOT_TOKEN;

  try {
    if (action === "kick") {
      await axios.delete(
        `https://discord.com/api/v10/guilds/${guildId}/members/${targetId}`,
        { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
      );
      logAction(req.sessionUserId, "kick", { guildId, targetId, reason });
      return res.send("Usuario expulsado");
    }
    if (action === "ban") {
      await axios.put(
        `https://discord.com/api/v10/guilds/${guildId}/bans/${targetId}`,
        { reason },
        { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
      );
      logAction(req.sessionUserId, "ban", { guildId, targetId, reason });
      return res.send("Usuario baneado");
    }
    if (action === "message") {
      await axios.post(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        { content },
        { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
      );
      logAction(req.sessionUserId, "message", { guildId, channelId, content });
      return res.send("Mensaje enviado");
    }
    res.status(400).send("Acción inválida");
  } catch (err) {
    res.status(500).send(safeJson(err.response?.data || err.message));
  }
});

// ===================== START =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🌙 Abyssus Panel iniciado en puerto ${PORT}`)
);
























































































