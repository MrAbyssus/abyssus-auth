// index.js - Abyssus Panel (single-file) - versión visual mejorada
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');
const { Client, GatewayIntentBits, Partials } = require('discord.js');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// --- Config ---
const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !BOT_TOKEN) {
  console.error('ERROR: Falta CLIENT_ID, CLIENT_SECRET, REDIRECT_URI o BOT_TOKEN en .env');
  process.exit(1);
}

// --- Bot (misma instancia) ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember]
});
client.once('ready', () => console.log(`Bot listo: ${client.user.tag}`));
client.login(BOT_TOKEN).catch(err => {
  console.error('Error logueando bot:', err);
  process.exit(1);
});

// --- Persistencia y logs ---
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'panel.log');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

let usuariosAutenticados = new Map();
try {
  if (fs.existsSync(SESSIONS_FILE)) {
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
    const obj = JSON.parse(raw || '{}');
    for (const k of Object.keys(obj)) usuariosAutenticados.set(k, obj[k]);
  }
} catch (e) {
  console.warn('No pude cargar sessions.json:', e.message);
}
function persistSessions() {
  try {
    const obj = Object.fromEntries(usuariosAutenticados);
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.error('Error guardando sessions.json:', e.message);
  }
}
function appendLog(line) {
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (e) {
    console.error('Error escribiendo log:', e.message);
  }
}
function logAction(action, ses, guildId, details = {}) {
  const userLabel = ses ? `${ses.username}#${ses.discriminator} (${ses.id})` : 'unknown';
  const line = `[${new Date().toISOString()}] ${action.toUpperCase()} by ${userLabel} @ ${guildId} -> ${JSON.stringify(details)}`;
  appendLog(line);
  console.log(line);
}

// --- Helpers ---
function safeJson(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}
function escapeHtml(s = '') {
  return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
async function discordRequest(method, url, body = null) {
  return axios({
    method,
    url: `https://discord.com/api/v10${url}`,
    headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    data: body,
    validateStatus: s => s < 500
  });
}
async function verifyOwner(userAccessToken, guildId) {
  try {
    const res = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${userAccessToken}` }});
    const arr = Array.isArray(res.data) ? res.data : [];
    return arr.some(g => g.id === guildId && g.owner === true);
  } catch (e) {
    console.error('verifyOwner err', e.response?.data || e.message);
    return false;
  }
}

// --- OAuth: login & callback ---
const usedCodes = new Set();

app.get('/login', (req, res) => {
  const authorizeUrl =
    'https://discord.com/oauth2/authorize' +
    `?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=identify%20guilds`;
  res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abyssus — Login</title>
  <style>
    :root{--accent:#5865F2;--bg:#0b0f14}
    body{font-family:Inter,Arial;background:var(--bg);color:#eaf2ff;margin:0;display:flex;align-items:center;justify-content:center;height:100vh}
    .card{background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));padding:28px;border-radius:12px;display:flex;gap:20px;align-items:center}
    .logo{width:72px;height:72px;border-radius:12px;background:linear-gradient(135deg,#243b6b,#5b3a86);display:flex;align-items:center;justify-content:center;font-weight:800;color:white;font-size:28px}
    h1{margin:0;font-size:20px}
    p{margin:6px 0 12px;color:#aab4c2}
    a.cta{background:linear-gradient(90deg,var(--accent),#764ba2);padding:10px 16px;border-radius:10px;color:#fff;text-decoration:none;font-weight:700}
  </style></head><body><div class="card"><div class="logo">A</div><div style="flex:1"><h1>Abyssus — Panel</h1><p>Inicia sesión con Discord (solo owner puede usar el panel).</p><a class="cta" href="${authorizeUrl}">Iniciar con Discord</a></div></div></body></html>`);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login');
  if (usedCodes.has(code)) return res.send('<h2>⚠️ Este código ya fue usado. Vuelve a <a href="/login">login</a></h2>');
  usedCodes.add(code);

  try {
    const tokenResp = await axios.post('https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const { access_token, refresh_token } = tokenResp.data;
    const userRes = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${access_token}` }});
    const u = userRes.data;
    usuariosAutenticados.set(u.id, {
      id: u.id, username: u.username, discriminator: u.discriminator, avatar: u.avatar,
      accessToken: access_token, refreshToken: refresh_token, createdAt: Date.now()
    });
    persistSessions();
    res.send(`<html><body style="background:#071022;color:#fff;font-family:Inter;text-align:center;padding:40px"><h2>✅ Autenticado: ${escapeHtml(u.username)}#${escapeHtml(u.discriminator)}</h2><p><a href="/mis-guilds/${u.id}" style="color:#58a5ff">Ver mis servidores (owner)</a></p></body></html>`);
  } catch (e) {
    console.error('callback error', e.response?.data || e.message);
    return res.status(500).send(`<pre>${safeJson(e.response?.data || e.message)}</pre>`);
  }
});

// --- List owner guilds where bot is present ---
app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const ses = usuariosAutenticados.get(userId);
  if (!ses) return res.redirect('/login');
  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${ses.accessToken}` }});
    const ownerGuilds = (Array.isArray(guildsRes.data) ? guildsRes.data : []).filter(g => g.owner === true);

    const botPresent = [];
    const CHUNK = 6;
    for (let i=0;i<ownerGuilds.length;i+=CHUNK) {
      const chunk = ownerGuilds.slice(i,i+CHUNK);
      await Promise.all(chunk.map(async g => {
        try {
          await discordRequest('get', `/guilds/${g.id}`);
          botPresent.push({ id: g.id, name: g.name, icon: g.icon });
        } catch (e) { /* bot no presente */ }
      }));
      await new Promise(r=>setTimeout(r, 80));
    }

    const htmlList = botPresent.map(g => {
      const icon = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : 'https://via.placeholder.com/64/111318/ffffff?text=?';
      return `<li style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;background:#111316;margin-bottom:10px"><img src="${icon}" style="width:56px;height:56px;border-radius:10px;object-fit:cover"/><div style="flex:1"><strong>${escapeHtml(g.name)}</strong><div style="opacity:.85">ID: ${g.id}</div></div><div><a style="background:linear-gradient(90deg,#5865F2,#764ba2);color:#fff;padding:8px 12px;border-radius:8px;text-decoration:none" href="/panel/${g.id}?userId=${userId}">Abrir panel</a></div></li>`;
    }).join('') || '<div style="padding:14px;background:#071022;border-radius:8px">No eres owner en servidores donde Abyssus esté presente.</div>';

    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mis servidores</title></head><body style="font-family:Inter,Arial;background:#0a0d12;color:#eaf2ff;padding:28px"><div style="max-width:1100px;margin:0 auto"><h2>Servidores (Owner)</h2><div style="margin-top:12px">${htmlList}</div><p style="opacity:.8;margin-top:16px">Si no ves un servidor, verifica que Abyssus esté invitado y tu cuenta sea owner.</p></div></body></html>`);
  } catch (e) {
    console.error('mis-guilds err', e.response?.data || e.message);
    return res.status(500).send(`<pre>${safeJson(e.response?.data || e.message)}</pre>`);
  }
});

// --- requireSession middleware ---
function requireSession(req, res, next) {
  const userId = req.query.userId || req.body.userId;
  if (!userId) return res.status(400).send('Falta userId');
  const ses = usuariosAutenticados.get(userId);
  if (!ses) return res.status(401).send('No autenticado. Inicia sesión.');
  req.sessionUserId = userId;
  req.session = ses;
  next();
}

// --- Panel (owner verified) ---
app.get('/panel/:guildId', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const userId = req.sessionUserId;
  const ses = req.session;

  try {
    const okOwner = await verifyOwner(ses.accessToken, guildId);
    if (!okOwner) return res.status(403).send('No eres owner de este servidor.');

    const [giRes, rolesRes, channelsRes, membersRes] = await Promise.all([
      discordRequest('get', `/guilds/${guildId}?with_counts=true`),
      discordRequest('get', `/guilds/${guildId}/roles`),
      discordRequest('get', `/guilds/${guildId}/channels`),
      discordRequest('get', `/guilds/${guildId}/members?limit=100`)
    ]);
    if (giRes.status >= 400) throw giRes;
    const guild = giRes.data;
    const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
    const channels = Array.isArray(channelsRes.data) ? channelsRes.data : [];
    const members = Array.isArray(membersRes.data) ? membersRes.data : [];

    const iconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : 'https://via.placeholder.com/128?text=?';
    const tipoCanalEmoji = {0:'📝',2:'🎤',4:'📂',13:'🎙️',15:'🗂️'};
    const rolesListHtml = roles.map(r => `<li style="padding:6px;border-radius:6px;background:#0f1114;margin-bottom:6px">${escapeHtml(r.name)} <small style="opacity:.8">(${r.id})</small></li>`).join('');
    const channelsListHtml = channels.map(c => `<li style="padding:6px;border-radius:6px;background:#0f1114;margin-bottom:6px">${tipoCanalEmoji[c.type]||'❔'} ${escapeHtml(c.name)} <small style="opacity:.8">(${c.id})</small></li>`).join('');
    const channelOptions = channels.filter(c=>c.type===0).map(c => `<option value="${c.id}"># ${escapeHtml(c.name)}</option>`).join('');
    const roleOptions = roles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    const membersHtml = members.map(m => {
      const tag = m.user ? `${escapeHtml(m.user.username)}#${escapeHtml(m.user.discriminator)}` : escapeHtml(m.nick||'Unknown');
      const avatar = m.user?.avatar ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/${(parseInt(m.user?.discriminator||'0')%5)}.png`;
      const rolesForUser = Array.isArray(m.roles) ? m.roles.map(rid=>escapeHtml(rid)).join(', ') : '';
      return `<li style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;margin-bottom:8px;background:rgba(0,0,0,0.18)"><img src="${avatar}" style="width:44px;height:44px;border-radius:8px;object-fit:cover"/><div style="flex:1"><div><strong>${tag}</strong> <small style="opacity:.75">(${m.user?.id||'N/A'})</small></div><div style="opacity:.8">Roles: ${rolesForUser||'—'}</div></div><div style="display:flex;flex-direction:column;gap:6px"><button onclick="kickMember('${m.user?.id}')" style="background:#ff7b7b;border-radius:8px;padding:6px">🚫 Kick</button><button onclick="banMember('${m.user?.id}')" style="background:#ff7b7b;border-radius:8px;padding:6px">🔨 Ban</button><button onclick="timeoutMember('${m.user?.id}')" style="background:#ffd88c;border-radius:8px;padding:6px">🔇 Timeout</button></div></li>`;
    }).join('');

    let logsForGuild = 'No hay acciones registradas.';
    try {
      if (fs.existsSync(LOG_FILE)) {
        const raw = fs.readFileSync(LOG_FILE, 'utf8');
        const lines = raw.split('\n').filter(l=>l && l.includes(guildId));
        logsForGuild = lines.reverse().slice(0,200).join('\n') || logsForGuild;
      }
    } catch(e) { logsForGuild = 'Error leyendo logs'; }

    // Render HTML (visual)
    res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abyssus Panel — ${escapeHtml(guild.name)}</title>
    <style>:root{--accent:#5865F2;--bg:#090b0f}body{font-family:Inter,Arial;margin:0;background:var(--bg);color:#eaf2ff;padding:18px}a{color:inherit}</style></head><body>
    <div style="max-width:1100px;margin:0 auto;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;gap:12px;align-items:center"><img src="${iconUrl}" style="width:96px;height:96px;border-radius:12px;object-fit:cover"/><div><h1 style="margin:0">${escapeHtml(guild.name)}</h1><div style="opacity:.85">ID: ${guild.id}</div><div style="display:flex;gap:8px;margin-top:8px"><div style="background:#0f1114;padding:8px;border-radius:8px">👥 ${guild.approximate_member_count||'N/A'}</div><div style="background:#0f1114;padding:8px;border-radius:8px">💬 ${channels.length}</div><div style="background:#0f1114;padding:8px;border-radius:8px">🧾 ${roles.length}</div></div></div></div>

      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <div style="flex:1 1 420px;background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));padding:12px;border-radius:10px;max-height:720px;overflow:auto">
          <h2>Miembros (hasta 100)</h2><ul style="list-style:none;padding:0;margin:0">${membersHtml}</ul>
        </div>

        <div style="flex:1 1 420px;background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));padding:12px;border-radius:10px">
          <h2>Enviar mensaje como Abyssus</h2>
          <div><label>Canal</label><select id="channelSelect" style="width:100%;padding:8px;border-radius:8px;background:#0f1216;color:#eaf2ff">${channelOptions}</select></div>
          <div><label>Mensaje</label><textarea id="messageContent" rows="4" style="width:100%;padding:8px;border-radius:8px;background:#0f1216;color:#eaf2ff"></textarea></div>
          <div style="display:flex;gap:8px"><button onclick="sendMessage()" style="background:linear-gradient(90deg,#5865F2,#764ba2);padding:8px;border-radius:8px">Enviar</button><button onclick="document.getElementById('messageContent').value='/help'">Comando /help</button></div>
          <hr style="margin:12px 0;border-top:1px solid rgba(255,255,255,0.03)"/>
          <h3>Roles</h3><ul style="padding:0;margin:0">${rolesListHtml}</ul>
          <h3>Canales</h3><ul style="padding:0;margin:0">${channelsListHtml}</ul>
        </div>
      </div>

      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <div style="flex:1 1 420px;background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));padding:12px;border-radius:10px">
          <h2>Moderación rápida</h2>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label>ID usuario</label><input id="modUserId" style="width:100%;padding:8px;border-radius:8px;background:#0f1216;color:#eaf2ff"/><label>Motivo</label><input id="modReason" style="width:100%;padding:8px;border-radius:8px;background:#0f1216;color:#eaf2ff"/></div>
            <div><label>Días a eliminar mensajes (ban)</label><input id="modDays" type="number" min="0" max="7" value="0" style="width:100%;padding:8px;border-radius:8px;background:#0f1216;color:#eaf2ff"/><label>Timeout (min)</label><input id="modTimeout" type="number" min="1" max="1440" value="10" style="width:100%;padding:8px;border-radius:8px;background:#0f1216;color:#eaf2ff"/></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px"><button onclick="kickFromInputs()" style="background:#ff7b7b;padding:8px;border-radius:8px">🚫 Kick</button><button onclick="banFromInputs()" style="background:#ff7b7b;padding:8px;border-radius:8px">🔨 Ban</button><button onclick="timeoutFromInputs()" style="background:#ffd88c;padding:8px;border-radius:8px">🔇 Timeout</button></div>
        </div>

        <div style="flex:1 1 420px;background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));padding:12px;border-radius:10px">
          <h2>Gestión Roles / Canales</h2>
          <label>Crear rol — nombre</label><input id="newRoleName" style="width:100%;padding:8px;border-radius:8px;background:#0f1216;color:#eaf2ff"/><div style="display:flex;gap:8px;margin-top:6px"><button onclick="createRole()" style="background:linear-gradient(90deg,#5865F2,#764ba2);padding:8px;border-radius:8px">Crear rol</button></div>
          <hr style="margin:10px 0;border-top:1px solid rgba(255,255,255,0.03)"/>
          <label>Eliminar rol</label><select id="deleteRoleSelect" style="width:100%;padding:8px;border-radius:8px;background:#0f1216;color:#eaf2ff">${roleOptions}</select><div style="display:flex;gap:8px;margin-top:6px"><button onclick="deleteRole()" style="background:#ff7b7b;padding:8px;border-radius:8px">Eliminar rol</button></div>
          <hr style="margin:10px 0;border-top:1px solid rgba(255,255,255,0.03)"/>
          <label>Crear canal (texto)</label><input id="newChannelName" style="width:100%;padding:8px;border-radius:8px;background:#0f1216;color:#eaf2ff" placeholder="nombre-del-canal"/><div style="display:flex;gap:8px;margin-top:6px"><button onclick="createChannel()" style="background:linear-gradient(90deg,#5865F2,#764ba2);padding:8px;border-radius:8px">Crear canal</button></div>
          <label style="margin-top:10px">Eliminar canal</label><select id="deleteChannelSelect" style="width:100%;padding:8px;border-radius:8px;background:#0f1216;color:#eaf2ff">${channels.filter(c=>c.type!==4).map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select><div style="display:flex;gap:8px;margin-top:6px"><button onclick="deleteChannel()" style="background:#ff7b7b;padding:8px;border-radius:8px">Eliminar canal</button></div>
        </div>
      </div>

      <div style="background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));padding:12px;border-radius:10px">
        <h2>Logs del servidor</h2>
        <pre id="logsBox" style="background:#071018;padding:12px;border-radius:8px;color:#bfe0ff;max-height:220px;overflow:auto;white-space:pre-wrap">${escapeHtml(logsForGuild)}</pre>
        <div style="display:flex;gap:8px;margin-top:8px"><button onclick="refreshLogs()">Actualizar</button><button onclick="clearLogs()" style="background:#ff7b7b;padding:8px;border-radius:8px">Borrar logs</button><button onclick="openStream()">Abrir stream</button></div>
        <div style="margin-top:8px"><a href="/mis-guilds/${userId}" style="color:#ccc;text-decoration:none">← Volver</a> <a href="https://discord.com/channels/${guild.id}" style="margin-left:12px;color:#58a5ff">Abrir Discord</a></div>
      </div>
    </div>

    <script>
      const userId = '${userId}';
      const guildId = '${guild.id}';

      async function postApi(path, body) {
        body = {...body, userId};
        const res = await fetch(path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        const txt = await res.text();
        if (!res.ok) throw new Error(txt || res.statusText);
        return txt;
      }

      function kickMember(id){ if(!confirm('Expulsar '+id+'?')) return; postApi('/api/guilds/'+guildId+'/kick',{ targetId:id }).then(a=>{alert(a);location.reload()}).catch(e=>alert('Error: '+e.message)); }
      function banMember(id){ const reason = prompt('Motivo (opcional):',''); const days = prompt('Días de mensajes a borrar (0-7):','0'); if(!confirm('Banear '+id+'?')) return; postApi('/api/guilds/'+guildId+'/ban',{ targetId:id, reason: reason||'Banned via panel', deleteMessageDays: Number(days||0) }).then(a=>{alert(a);location.reload()}).catch(e=>alert('Error:'+e.message)); }
      function timeoutMember(id){ const mins = prompt('Timeout minutos (ej. 10):','10'); if(!confirm('Timeout '+id+' por '+mins+' minutos?')) return; postApi('/api/guilds/'+guildId+'/timeout',{ targetId:id, minutes: Number(mins||10) }).then(a=>{alert(a);location.reload()}).catch(e=>alert('Error:'+e.message)); }

      function kickFromInputs(){ const id=document.getElementById('modUserId').value.trim(); if(!id) return alert('ID requerido'); kickMember(id); }
      function banFromInputs(){ const id=document.getElementById('modUserId').value.trim(); const reason=document.getElementById('modReason').value||'Banned via panel'; const days=parseInt(document.getElementById('modDays').value||'0',10); if(!id) return alert('ID requerido'); if(!confirm('Ban '+id+'?')) return; postApi('/api/guilds/'+guildId+'/ban',{ targetId:id, reason, deleteMessageDays:days }).then(a=>{alert(a);location.reload()}).catch(e=>alert('Error:'+e.message)); }
      function timeoutFromInputs(){ const id=document.getElementById('modUserId').value.trim(); const mins=parseInt(document.getElementById('modTimeout').value||'10',10); if(!id) return alert('ID requerido'); if(!confirm('Timeout '+id+' por '+mins+' min?')) return; postApi('/api/guilds/'+guildId+'/timeout',{ targetId:id, minutes:mins }).then(a=>{alert(a);location.reload()}).catch(e=>alert('Error:'+e.message)); }

      async function sendMessage(){ const channelId=document.getElementById('channelSelect').value; const content=document.getElementById('messageContent').value.trim(); if(!channelId||!content) return alert('Selecciona canal y escribe mensaje'); try{ await postApi('/api/guilds/'+guildId+'/message',{ channelId, content }); alert('Mensaje enviado'); document.getElementById('messageContent').value=''; }catch(e){alert('Error:'+e.message);} }

      async function createRole(){ const name=document.getElementById('newRoleName').value.trim(); if(!name) return alert('Nombre requerido'); if(!confirm('Crear rol '+name+'?')) return; try{ await postApi('/api/guilds/'+guildId+'/create-role',{ name }); alert('Rol creado'); location.reload(); }catch(e){alert('Error:'+e.message);} }
      async function deleteRole(){ const roleId=document.getElementById('deleteRoleSelect').value; if(!roleId) return alert('Selecciona rol'); if(!confirm('Eliminar rol?')) return; try{ await postApi('/api/guilds/'+guildId+'/delete-role',{ roleId }); alert('Rol eliminado'); location.reload(); }catch(e){alert('Error:'+e.message);} }
      async function createChannel(){ const name=document.getElementById('newChannelName').value.trim(); if(!name) return alert('Nombre requerido'); if(!confirm('Crear canal '+name+'?')) return; try{ await postApi('/api/guilds/'+guildId+'/create-channel',{ name }); alert('Canal creado'); location.reload(); }catch(e){alert('Error:'+e.message);} }
      async function deleteChannel(){ const channelId=document.getElementById('deleteChannelSelect').value; if(!channelId) return alert('Selecciona canal'); if(!confirm('Eliminar canal?')) return; try{ await postApi('/api/guilds/'+guildId+'/delete-channel',{ channelId }); alert('Canal eliminado'); location.reload(); }catch(e){alert('Error:'+e.message);} }

      async function refreshLogs(){ try{ const r = await fetch('/logs/'+guildId+'?userId='+userId); const t = await r.text(); document.getElementById('logsBox').textContent = t; }catch(e){alert('Error al obtener logs');} }
      async function clearLogs(){ if(!confirm('Borrar todas las entradas del log para este servidor?')) return; try{ const r = await fetch('/logs/'+guildId+'/clear',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ userId })}); const t=await r.text(); alert(t); refreshLogs(); }catch(e){alert('Error al borrar logs');} }

      // SSE log stream
      let evtSource = null;
      function openStream(){
        if(evtSource){ evtSource.close(); evtSource=null; alert('Stream detenido'); return; }
        evtSource = new EventSource('/logs/stream/'+guildId+'?userId='+userId);
        evtSource.onmessage = e => { const lb=document.getElementById('logsBox'); lb.textContent = JSON.parse(e.data) + "\\n" + lb.textContent; }
        evtSource.onerror = ()=>{ if(evtSource){ evtSource.close(); evtSource=null; } };
        alert('Stream iniciado');
      }
    </script>
    </body></html>`);
  } catch (e) {
    console.error('panel err', e.response?.data || e.message);
    return res.status(500).send(`<pre>${safeJson(e.response?.data || e.message)}</pre>`);
  }
});

// --- API endpoints (owner-checked) ---

app.post('/api/guilds/:guildId/kick', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId } = req.body;
  const ses = req.session;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    if (!(await verifyOwner(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('delete', `/guilds/${guildId}/members/${targetId}`);
    if (r.status >= 400) return res.status(r.status).send(safeJson(r.data));
    logAction('KICK', ses, guildId, { targetId });
    return res.send('✅ Usuario expulsado');
  } catch (e) { console.error('kick err', e.response?.data || e.message); return res.status(500).send(safeJson(e.response?.data || e.message)); }
});

app.post('/api/guilds/:guildId/ban', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId, reason = 'Banned via panel', deleteMessageDays = 0 } = req.body;
  const ses = req.session;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    if (!(await verifyOwner(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const payload = { reason };
    if (deleteMessageDays) payload.delete_message_seconds = deleteMessageDays * 24 * 3600;
    const r = await discordRequest('put', `/guilds/${guildId}/bans/${targetId}`, payload);
    if (r.status >= 400) return res.status(r.status).send(safeJson(r.data));
    logAction('BAN', ses, guildId, { targetId, reason, deleteMessageDays });
    return res.send('✅ Usuario baneado');
  } catch (e) { console.error('ban err', e.response?.data || e.message); return res.status(500).send(safeJson(e.response?.data || e.message)); }
});

app.post('/api/guilds/:guildId/timeout', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId, minutes = 10 } = req.body;
  const ses = req.session;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    if (!(await verifyOwner(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const until = new Date(Date.now() + (minutes||10) * 60 * 1000).toISOString();
    const r = await discordRequest('patch', `/guilds/${guildId}/members/${targetId}`, { communication_disabled_until: until });
    if (r.status >= 400) return res.status(r.status).send(safeJson(r.data));
    logAction('TIMEOUT', ses, guildId, { targetId, minutes });
    return res.send('✅ Timeout aplicado');
  } catch (e) { console.error('timeout err', e.response?.data || e.message); return res.status(500).send(safeJson(e.response?.data || e.message)); }
});

app.post('/api/guilds/:guildId/message', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { channelId, content } = req.body;
  const ses = req.session;
  if (!channelId || !content) return res.status(400).send('Falta channelId o content');
  try {
    if (!(await verifyOwner(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('post', `/channels/${channelId}/messages`, { content });
    if (r.status >= 400) return res.status(r.status).send(safeJson(r.data));
    logAction('MESSAGE', ses, guildId, { channelId, content: content.slice(0,4000) });
    return res.send(safeJson(r.data));
  } catch (e) { console.error('message err', e.response?.data || e.message); return res.status(500).send(safeJson(e.response?.data || e.message)); }
});

app.post('/api/guilds/:guildId/create-role', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { name } = req.body;
  const ses = req.session;
  if (!name) return res.status(400).send('Falta name');
  try {
    if (!(await verifyOwner(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('post', `/guilds/${guildId}/roles`, { name });
    if (r.status >= 400) return res.status(r.status).send(safeJson(r.data));
    logAction('CREATE_ROLE', ses, guildId, { name });
    return res.send('✅ Rol creado');
  } catch (e) { console.error('create role err', e.response?.data || e.message); return res.status(500).send(safeJson(e.response?.data || e.message)); }
});

app.post('/api/guilds/:guildId/delete-role', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { roleId } = req.body;
  const ses = req.session;
  if (!roleId) return res.status(400).send('Falta roleId');
  try {
    if (!(await verifyOwner(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('delete', `/guilds/${guildId}/roles/${roleId}`);
    if (r.status >= 400) return res.status(r.status).send(safeJson(r.data));
    logAction('DELETE_ROLE', ses, guildId, { roleId });
    return res.send('✅ Rol eliminado');
  } catch (e) { console.error('delete role err', e.response?.data || e.message); return res.status(500).send(safeJson(e.response?.data || e.message)); }
});

app.post('/api/guilds/:guildId/create-channel', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { name } = req.body;
  const ses = req.session;
  if (!name) return res.status(400).send('Falta name');
  try {
    if (!(await verifyOwner(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('post', `/guilds/${guildId}/channels`, { name, type: 0 });
    if (r.status >= 400) return res.status(r.status).send(safeJson(r.data));
    logAction('CREATE_CHANNEL', ses, guildId, { name });
    return res.send('✅ Canal creado');
  } catch (e) { console.error('create channel err', e.response?.data || e.message); return res.status(500).send(safeJson(e.response?.data || e.message)); }
});

app.post('/api/guilds/:guildId/delete-channel', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { channelId } = req.body;
  const ses = req.session;
  if (!channelId) return res.status(400).send('Falta channelId');
  try {
    if (!(await verifyOwner(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    const r = await discordRequest('delete', `/channels/${channelId}`);
    if (r.status >= 400) return res.status(r.status).send(safeJson(r.data));
    logAction('DELETE_CHANNEL', ses, guildId, { channelId });
    return res.send('✅ Canal eliminado');
  } catch (e) { console.error('delete channel err', e.response?.data || e.message); return res.status(500).send(safeJson(e.response?.data || e.message)); }
});

// --- Logs endpoints ---
app.get('/logs/:guildId', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const ses = req.session;
  try {
    if (!(await verifyOwner(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    if (!fs.existsSync(LOG_FILE)) return res.send('No hay logs.');
    const raw = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = raw.split('\n').filter(l=>l && l.includes(guildId));
    return res.send(lines.reverse().join('\n') || 'No hay logs para este servidor.');
  } catch (e) { console.error('logs err', e); return res.status(500).send('Error leyendo logs'); }
});

app.post('/logs/:guildId/clear', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const ses = req.session;
  try {
    if (!(await verifyOwner(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    if (!fs.existsSync(LOG_FILE)) return res.send('No hay logs.');
    const raw = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = raw.split('\n').filter(l => l && !l.includes(guildId));
    fs.writeFileSync(LOG_FILE, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
    return res.send('✅ Logs del servidor borrados');
  } catch (e) { console.error('clear logs err', e); return res.status(500).send('Error al borrar logs'); }
});

app.get('/logs/stream/:guildId', requireSession, (req, res) => {
  const guildId = req.params.guildId;
  const ses = req.session;
  (async () => {
    if (!(await verifyOwner(ses.accessToken, guildId))) return res.status(403).send('No autorizado');
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    if (fs.existsSync(LOG_FILE)) {
      const raw = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = raw.split('\n').filter(l=>l && l.includes(guildId));
      const last = lines.slice(-30).join('\n');
      if (last) res.write(`data: ${JSON.stringify(last)}\n\n`);
    }
    const watcher = fs.watch(LOG_FILE, { encoding: 'utf8' }, (ev)=> {
      if (ev !== 'change') return;
      try {
        const raw = fs.readFileSync(LOG_FILE, 'utf8');
        const lines = raw.split('\n').filter(l=>l && l.includes(guildId));
        if (lines.length) {
          const latest = lines.slice(-1)[0];
          res.write(`data: ${JSON.stringify(latest)}\n\n`);
        }
      } catch(e){}
    });
    req.on('close', ()=>{ watcher.close(); res.end(); });
  })();
});

// --- Housekeeping: sessions persistence, cleanup ---
setInterval(()=> {
  const now = Date.now();
  for (const [k,s] of usuariosAutenticados) {
    if (now - s.createdAt > 1000 * 60 * 30) usuariosAutenticados.delete(k); // 30 min
  }
  persistSessions();
}, 1000*60*5);

process.on('SIGINT', ()=>{ persistSessions(); process.exit(); });
process.on('SIGTERM', ()=>{ persistSessions(); process.exit(); });

// --- Start server ---
app.listen(PORT, () => console.log(`Servidor Abyssus escuchando en puerto ${PORT}`));























































































