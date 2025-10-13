// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.static('public'));
app.use(express.json());

// ----------------- In-memory stores -----------------
const usuariosAutenticados = new Map(); // userId -> { accessToken, refreshToken, username, ... , createdAt }
const codigosUsados = new Set();

// perms.json path (persistencia simple)
const PERMS_FILE = path.join(__dirname, 'perms.json');
function loadPerms() {
  try {
    if (!fs.existsSync(PERMS_FILE)) {
      fs.writeFileSync(PERMS_FILE, JSON.stringify({}), 'utf8');
      return {};
    }
    return JSON.parse(fs.readFileSync(PERMS_FILE, 'utf8') || '{}');
  } catch (e) {
    console.error('Error cargando perms.json', e);
    return {};
  }
}
function savePerms(obj) {
  try {
    fs.writeFileSync(PERMS_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.error('Error guardando perms.json', e);
  }
}

// ----------------- Helpers -----------------
function safeJson(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}
function escapeHtml(s = '') {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function logAction(type, details) {
  try {
    const line = `[${new Date().toISOString()}] ${type}: ${JSON.stringify(details)}\n`;
    fs.appendFileSync(path.join(__dirname, 'acciones.log'), line, { encoding: 'utf8' });
  } catch (e) {
    console.error('Error escribiendo log:', e);
  }
}
async function discordRequest(method, url, body = null) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  return axios({
    method,
    url: `https://discord.com/api/v10${url}`,
    headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    data: body
  });
}

// ----------------- Session cleanup -----------------
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of usuariosAutenticados) {
    if (now - s.createdAt > 1000 * 60 * 30) usuariosAutenticados.delete(id); // 30 min
  }
}, 1000 * 60 * 5);

// ----------------- /login -----------------
app.get('/login', (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const redirect = process.env.REDIRECT_URI;
  if (!clientId || !redirect) return res.status(500).send('Falta CLIENT_ID o REDIRECT_URI en .env');

  const authorizeUrl =
    'https://discord.com/oauth2/authorize' +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&response_type=code` +
    `&scope=identify%20guilds`;

  return res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Abyssus — Login</title>
  <style>
    body{font-family:Inter,Arial;background:#0b0f14;color:#eaf2ff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    .btn{background:#5865F2;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none}
  </style>
  </head><body>
    <div style="text-align:center">
      <h1>Abyssus — Panel</h1>
      <p>Inicia sesión con Discord</p>
      <a class="btn" href="${authorizeUrl}">Iniciar sesión con Discord</a>
    </div>
  </body></html>`);
});

// ----------------- /callback -----------------
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login');

  if (codigosUsados.has(code)) {
    return res.send('<h2>⚠️ Este código ya fue usado. Vuelve a <a href="/login">iniciar sesión</a>.</h2>');
  }
  codigosUsados.add(code);

  try {
    const tokenResp = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResp.data.access_token;
    const refreshToken = tokenResp.data.refresh_token;

    const userRes = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` }});
    const user = userRes.data;

    usuariosAutenticados.set(user.id, {
      accessToken,
      refreshToken,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      createdAt: Date.now()
    });

    return res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abyssus — Autenticado</title></head><body style="background:#071022;color:#eaf2ff;display:flex;align-items:center;justify-content:center;height:100vh">
      <div style="text-align:center">
        <h2>¡Autenticación exitosa!</h2>
        <p>${escapeHtml(user.username)}#${escapeHtml(user.discriminator)}</p>
        <a href="/mis-guilds/${user.id}" style="background:#5865F2;color:#fff;padding:8px 12px;border-radius:8px;text-decoration:none">Ver mis servidores</a>
      </div>
    </body></html>`);
  } catch (err) {
    console.error('callback error:', err.response?.data || err.message);
    return res.status(500).send(`<h2>Error OAuth2</h2><pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// ----------------- /mis-guilds/:userId (owner OR admin) -----------------
app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const ses = usuariosAutenticados.get(userId);
  if (!ses) return res.redirect('/login');

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send('Falta BOT_TOKEN en .env');

  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${ses.accessToken}` }});
    const allGuilds = Array.isArray(guildsRes.data) ? guildsRes.data : [];

    // Mostrar servidores donde eres owner o tienes el bit ADMINISTRATOR
    const visibleGuilds = allGuilds.filter(g => g.owner === true || (g.permissions && (BigInt(g.permissions) & BigInt(0x8)) !== BigInt(0)));

    const botPresent = [];
    const CONCURRENCY = 6;
    for (let i = 0; i < visibleGuilds.length; i += CONCURRENCY) {
      const chunk = visibleGuilds.slice(i, i + CONCURRENCY);
      const promises = chunk.map(async g => {
        try {
          const info = await axios.get(`https://discord.com/api/v10/guilds/${g.id}?with_counts=true`, {
            headers: { Authorization: `Bot ${BOT_TOKEN}` }, timeout: 8000
          });
          botPresent.push({
            id: g.id,
            name: g.name,
            icon: g.icon,
            member_count: info.data.approximate_member_count || 'N/A',
            roles_count: Array.isArray(info.data.roles) ? info.data.roles.length : 'N/A'
          });
        } catch (e) {
          // bot not present or no access
        }
      });
      await Promise.all(promises);
      await sleep(100);
    }

    const guildsHtml = botPresent.length ? botPresent.map(g => {
      const icon = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : 'https://via.placeholder.com/64/111318/ffffff?text=?';
      return `<li style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;background:#071022;margin-bottom:8px">
        <img src="${icon}" style="width:56px;height:56px;border-radius:8px;object-fit:cover"/>
        <div style="flex:1"><strong>${escapeHtml(g.name)}</strong><div style="opacity:.8">👥 ${g.member_count} • 🧾 ${g.roles_count}</div></div>
        <div><a href="/panel/${g.id}?userId=${userId}" style="background:#5865F2;color:#fff;padding:8px 10px;border-radius:8px;text-decoration:none">Abrir panel</a></div>
      </li>`;
    }).join('') : `<div style="padding:18px;border-radius:10px;background:#071022;text-align:center">No eres owner o admin de servidores donde Abyssus esté presente o el bot no tiene acceso.</div>`;

    return res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abyssus — Mis servidores</title></head><body style="background:#0a0d12;color:#eaf2ff;font-family:Inter,Arial;padding:28px">
      <div style="max-width:1100px;margin:0 auto">
        <header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
          <div><h2>Dashboard Abyssus</h2><div style="opacity:.8">Accede al panel para moderación, comandos y logs</div></div>
          <div><a href="/login" style="background:#5865F2;color:#fff;padding:8px 12px;border-radius:8px;text-decoration:none">Cambiar cuenta</a></div>
        </header>
        <section>${guildsHtml}</section>
        <p style="opacity:.8;margin-top:14px">Si no ves un servidor, verifica que Abyssus esté invitado con permisos y que tu cuenta sea owner o admin.</p>
      </div>
    </body></html>`);
  } catch (err) {
    console.error('mis-guilds err:', err.response?.data || err.message);
    return res.status(500).send(`<h2>Error obteniendo servidores</h2><pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// ----------------- requireSession middleware -----------------
function requireSession(req, res, next) {
  const userId = req.query.userId || req.body.userId;
  if (!userId) return res.status(400).send('Falta userId');
  const ses = usuariosAutenticados.get(userId);
  if (!ses) return res.status(401).send('No autenticado. Por favor inicia sesión.');
  req.sessionUserId = userId;
  req.session = ses;
  next();
}

// ----------------- Perms helpers -----------------
/**
 * hasPermission(userId, guildId, perm)
 * perm: 'admin' | 'moderator'
 */
async function hasPermission(userId, guildId, perm) {
  // Owner/admin via OAuth guilds
  try {
    const ses = usuariosAutenticados.get(userId);
    if (ses) {
      const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${ses.accessToken}` }});
      const guilds = Array.isArray(guildsRes.data) ? guildsRes.data : [];
      const found = guilds.find(g => g.id === guildId);
      if (found) {
        if (found.owner === true) return true;
        // permissions bit: ADMINISTRATOR = 0x8
        const permsBig = BigInt(found.permissions || '0');
        if ((permsBig & BigInt(0x8)) !== BigInt(0)) {
          if (perm === 'admin' || perm === 'moderator') return true;
        }
      }
    }
  } catch (e) {
    console.error('hasPermission - error checking guilds perms:', e.response?.data || e.message);
  }

  // Internal perms.json check
  try {
    const perms = loadPerms();
    const guildPerm = perms[guildId] || {};
    if (perm === 'moderator') {
      const mods = Array.isArray(guildPerm.moderators) ? guildPerm.moderators : [];
      if (mods.includes(userId)) return true;
    }
    if (perm === 'admin') {
      const admins = Array.isArray(guildPerm.admins) ? guildPerm.admins : [];
      if (admins.includes(userId)) return true;
    }
  } catch (e) {
    console.error('hasPermission - perms.json error', e);
  }

  return false;
}

// ----------------- helper verifyOwner (accepts accessToken or userId) -----------------
async function verifyOwner(tokenOrUserId, guildId) {
  try {
    if (usuariosAutenticados.has(tokenOrUserId)) {
      const ses = usuariosAutenticados.get(tokenOrUserId);
      const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${ses.accessToken}` }});
      const guilds = Array.isArray(guildsRes.data) ? guildsRes.data : [];
      return guilds.some(g => g.id === guildId && g.owner === true);
    } else {
      const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${tokenOrUserId}` }});
      const guilds = Array.isArray(guildsRes.data) ? guildsRes.data : [];
      return guilds.some(g => g.id === guildId && g.owner === true);
    }
  } catch (e) {
    console.error('verifyOwner error', e.response?.data || e.message);
    return false;
  }
}

// ----------------- /panel/:guildId -----------------
app.get('/panel/:guildId', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const userId = req.sessionUserId;
  const ses = req.session;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send('Falta BOT_TOKEN en .env');

  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${ses.accessToken}` }});
    const guilds = Array.isArray(guildsRes.data) ? guildsRes.data : [];
    const found = guilds.find(g => g.id === guildId);
    const isOwner = !!(found && found.owner === true);
    const isAdminBit = !!(found && (BigInt(found.permissions || '0') & BigInt(0x8)) !== BigInt(0));
    if (!isOwner && !isAdminBit && !(await hasPermission(userId, guildId, 'moderator'))) {
      return res.status(403).send('No tienes permiso para abrir este panel.');
    }

    // get guild info, roles, channels, members (limit 100)
    const [guildInfoRes, rolesRes, channelsRes, membersRes] = await Promise.all([
      axios.get(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/channels`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/members?limit=100`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } })
    ]);

    const guild = guildInfoRes.data;
    const roles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
    const channels = Array.isArray(channelsRes.data) ? channelsRes.data : [];
    const members = Array.isArray(membersRes.data) ? membersRes.data : [];

    const iconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : 'https://via.placeholder.com/128/111318/ffffff?text=?';
    const tipoCanalEmoji = {0:'📝',2:'🎤',4:'📂',13:'🎙️',15:'🗂️'};

    const rolesListHtml = roles.map(r => `<li>${escapeHtml(r.name)} <small style="opacity:.7">(${r.id})</small></li>`).join('');
    const channelsListHtml = channels.map(c => `<li>${tipoCanalEmoji[c.type]||'❔'} ${escapeHtml(c.name)} <small style="opacity:.7">(${c.id})</small></li>`).join('');
    const channelOptions = channels.filter(c=>c.type===0).map(c => `<option value="${c.id}"># ${escapeHtml(c.name)}</option>`).join('');
    const roleOptions = roles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    const membersHtml = members.map(m => {
      const tag = m.user ? `${escapeHtml(m.user.username)}#${escapeHtml(m.user.discriminator)}` : escapeHtml(m.nick || 'Unknown');
      const avatar = m.user?.avatar ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/${(parseInt(m.user?.discriminator||'0')%5)}.png`;
      const rolesForUser = Array.isArray(m.roles) ? m.roles.map(rid=>escapeHtml(rid)).join(', ') : '';
      return `<li style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;margin-bottom:8px;background:rgba(0,0,0,0.25)">
        <img src="${avatar}" style="width:44px;height:44px;border-radius:8px;object-fit:cover"/>
        <div style="flex:1"><strong>${tag}</strong> <small style="opacity:.7">(${m.user?.id||'N/A'})</small><div style="opacity:.8">Roles: ${rolesForUser||'—'}</div></div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button onclick="moderate('${guildId}','${m.user?.id}','kick')" style="padding:6px;border-radius:8px;border:0;background:#ff7b7b">🚫 Kick</button>
          <button onclick="moderate('${guildId}','${m.user?.id}','ban')" style="padding:6px;border-radius:8px;border:0;background:#ff7b7b">🔨 Ban</button>
          <button onclick="moderateTimeout('${guildId}','${m.user?.id}')" style="padding:6px;border-radius:8px;border:0;background:#ffd88c">🔇 Timeout</button>
        </div>
      </li>`;
    }).join('');

    // logs
    let logsForGuild = '';
    try {
      const raw = fs.existsSync(path.join(__dirname,'acciones.log')) ? fs.readFileSync(path.join(__dirname,'acciones.log'),'utf8') : '';
      const lines = raw.split('\n').filter(l=>l && l.includes(guildId));
      logsForGuild = lines.reverse().slice(0,150).join('\n') || 'No hay acciones registradas para este servidor.';
    } catch(e){ logsForGuild = 'Error leyendo logs'; }

    // panel HTML
    return res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abyssus — Panel ${escapeHtml(guild.name)}</title></head><body style="background:#090b0f;color:#eaf2ff;font-family:Inter,Arial;padding:18px">
    <div style="max-width:1100px;margin:0 auto">
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
        <img src="${iconUrl}" style="width:96px;height:96px;border-radius:12px;object-fit:cover"/>
        <div><h1 style="margin:0">${escapeHtml(guild.name)}</h1><div style="opacity:.85">ID: ${guild.id}</div><div style="display:flex;gap:8px;margin-top:8px"><div style="background:rgba(255,255,255,0.02);padding:8px;border-radius:8px">👥 ${guild.approximate_member_count||'N/A'}</div><div style="background:rgba(255,255,255,0.02);padding:8px;border-radius:8px">💬 ${channels.length}</div><div style="background:rgba(255,255,255,0.02);padding:8px;border-radius:8px">🧾 ${roles.length}</div></div></div>
      </div>

      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <div style="flex:1 1 420px;background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.03);max-height:520px;overflow:auto">
          <h2>Miembros (hasta 100)</h2>
          <ul style="list-style:none;padding:0;margin:0">${membersHtml}</ul>
        </div>

        <div style="flex:1 1 420px;background:linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01));padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.03);max-height:520px;overflow:auto">
          <h2>Enviar mensaje como Abyssus</h2>
          <div><label>Canal</label><select id="channelSelect">${channelOptions}</select></div>
          <div><label>Mensaje</label><textarea id="messageContent" rows="4" style="width:100%"></textarea></div>
          <div style="display:flex;gap:8px;margin-top:8px"><button onclick="sendMessage()" style="background:#5865F2;color:#fff;padding:8px;border-radius:8px;border:0">Enviar</button></div>
          <hr/>
          <h3>Roles</h3><ul>${rolesListHtml}</ul>
          <h3>Canales</h3><ul>${channelsListHtml}</ul>

          <hr/>
          <h3>Crear / Eliminar Roles y Canales</h3>
          <div>
            <label>Nuevo rol — nombre</label><input id="newRoleName" placeholder="Nombre del rol" style="width:100%;padding:8px;border-radius:6px;background:#0f1216;color:#eaf2ff;border:0"/>
            <div style="display:flex;gap:8px;margin-top:6px">
              <button onclick="createRole()" style="background:#2ecc71;color:#fff;padding:8px;border-radius:8px;border:0">Crear rol</button>
            </div>

            <label style="margin-top:10px">Eliminar rol</label>
            <select id="deleteRoleSelect" style="width:100%;padding:8px;border-radius:6px;background:#0f1216;color:#eaf2ff;border:0">${roleOptions}</select>
            <div style="display:flex;gap:8px;margin-top:6px"><button onclick="deleteRole()" style="background:#ff7b7b;color:#fff;padding:8px;border-radius:8px;border:0">Eliminar rol</button></div>

            <hr/>
            <label>Crear canal (texto)</label><input id="newChannelName" placeholder="nombre-del-canal" style="width:100%;padding:8px;border-radius:6px;background:#0f1216;color:#eaf2ff;border:0"/>
            <div style="display:flex;gap:8px;margin-top:6px"><button onclick="createChannel()" style="background:#2ecc71;color:#fff;padding:8px;border-radius:8px;border:0">Crear canal</button></div>

            <label style="margin-top:10px">Eliminar canal</label>
            <select id="deleteChannelSelect" style="width:100%;padding:8px;border-radius:6px;background:#0f1216;color:#eaf2ff;border:0">${channels.filter(c=>c.type!==4).map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select>
            <div style="display:flex;gap:8px;margin-top:6px"><button onclick="deleteChannel()" style="background:#ff7b7b;color:#fff;padding:8px;border-radius:8px;border:0">Eliminar canal</button></div>
          </div>

        </div>
      </div>

      <div style="margin-top:12px;background:#071018;padding:12px;border-radius:8px">
        <h2>Logs del servidor</h2>
        <pre style="max-height:220px;overflow:auto;color:#bfe0ff;padding:8px;border-radius:6px;background:#071018" id="logsBox">${escapeHtml(logsForGuild)}</pre>
        <div style="display:flex;gap:8px;margin-top:8px"><button onclick="refreshLogs()">Actualizar logs</button><button onclick="clearLogs()" style="background:#ff7b7b;color:#fff;padding:8px;border-radius:8px;border:0">Borrar logs</button></div>
      </div>

      <div style="margin-top:12px"><a href="/mis-guilds/${userId}" style="color:inherit;text-decoration:none;opacity:.9">← Volver</a></div>
    </div>

    <script>
      const userId = '${userId}';
      const guildId = '${guild.id}';

      async function postApi(path, body) {
        body = {...body, userId};
        const res = await fetch(path, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        const txt = await res.text();
        if (!res.ok) throw new Error(txt || res.statusText);
        return txt;
      }

      async function moderate(guildId, targetId, action) {
        if (!confirm(action + ' a ' + targetId + ' ?')) return;
        try {
          const txt = await postApi('/api/guilds/'+guildId+'/'+action, { targetId });
          alert(txt);
          location.reload();
        } catch(e){ alert('Error: '+e.message); }
      }

      async function createRole(){
        const name = document.getElementById('newRoleName').value.trim();
        if(!name) return alert('Nombre requerido');
        if(!confirm('Crear rol '+name+'?')) return;
        try{ const r = await postApi('/api/guilds/'+guildId+'/create-role',{ name }); alert(r); location.reload(); } catch(e){ alert('Error:'+e.message); }
      }
      async function deleteRole(){
        const roleId = document.getElementById('deleteRoleSelect').value;
        if(!roleId) return alert('Selecciona rol'); if(!confirm('Eliminar rol '+roleId+'?')) return;
        try{ const r = await postApi('/api/guilds/'+guildId+'/delete-role',{ roleId }); alert(r); location.reload(); } catch(e){ alert('Error:'+e.message); }
      }
      async function createChannel(){
        const name = document.getElementById('newChannelName').value.trim();
        if(!name) return alert('Nombre requerido');
        if(!confirm('Crear canal '+name+'?')) return;
        try{ const r = await postApi('/api/guilds/'+guildId+'/create-channel',{ name }); alert(r); location.reload(); } catch(e){ alert('Error:'+e.message); }
      }
      async function deleteChannel(){
        const channelId = document.getElementById('deleteChannelSelect').value;
        if(!channelId) return alert('Selecciona canal'); if(!confirm('Eliminar canal '+channelId+'?')) return;
        try{ const r = await postApi('/api/guilds/'+guildId+'/delete-channel',{ channelId }); alert(r); location.reload(); } catch(e){ alert('Error:'+e.message); }
      }

      async function sendMessage(){
        const channelId = document.getElementById('channelSelect').value;
        const content = document.getElementById('messageContent').value.trim();
        if(!channelId || !content) return alert('Selecciona canal y escribe mensaje');
        try {
          const r = await postApi('/api/guilds/'+guildId+'/message',{ channelId, content });
          alert('Mensaje enviado');
          document.getElementById('messageContent').value='';
        } catch(e){ alert('Error: '+e.message); }
      }

      async function refreshLogs(){
        try{
          const res = await fetch('/logs/'+guildId+'?userId='+userId);
          const txt = await res.text();
          document.getElementById('logsBox').textContent = txt;
        } catch(e){ alert('Error al obtener logs'); }
      }
      async function clearLogs(){
        if(!confirm('Borrar todas las entradas del log para este servidor?')) return;
        try{
          const res = await fetch('/logs/'+guildId+'/clear', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ userId })});
          const txt = await res.text();
          alert(txt);
          refreshLogs();
        } catch(e){ alert('Error al borrar logs'); }
      }
    </script>

    </body></html>`);
  } catch (err) {
    console.error('panel err:', err.response?.data || err.message);
    return res.status(500).send(`<h2>Error cargando panel</h2><pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// ----------------- API endpoints for moderation & management -----------------

// Kick
app.post('/api/guilds/:guildId/kick', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId } = req.body;
  const ses = req.session;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    const isOwner = await verifyOwner(ses.accessToken, guildId);
    const isModerator = await hasPermission(req.sessionUserId, guildId, 'moderator');
    if (!isOwner && !isModerator) return res.status(403).send('No autorizado (perm panel insuficiente).');

    await discordRequest('delete', `/guilds/${guildId}/members/${targetId}`);
    logAction('KICK', { guildId, targetId, by: ses.username });
    return res.status(200).send('✅ Usuario expulsado');
  } catch (e) {
    console.error('kick err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// Ban
app.post('/api/guilds/:guildId/ban', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId, reason = 'Banned via panel', deleteMessageDays = 0 } = req.body;
  const ses = req.session;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    const isOwner = await verifyOwner(ses.accessToken, guildId);
    const isModerator = await hasPermission(req.sessionUserId, guildId, 'moderator');
    if (!isOwner && !isModerator) return res.status(403).send('No autorizado (perm panel insuficiente).');

    await discordRequest('put', `/guilds/${guildId}/bans/${targetId}`, { delete_message_seconds: (deleteMessageDays||0)*24*3600, reason });
    logAction('BAN', { guildId, targetId, by: ses.username, reason, deleteMessageDays });
    return res.status(200).send('✅ Usuario baneado');
  } catch (e) {
    console.error('ban err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// Timeout
app.post('/api/guilds/:guildId/timeout', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetId, minutes = 10 } = req.body;
  const ses = req.session;
  if (!targetId) return res.status(400).send('Falta targetId');
  try {
    const isOwner = await verifyOwner(ses.accessToken, guildId);
    const isModerator = await hasPermission(req.sessionUserId, guildId, 'moderator');
    if (!isOwner && !isModerator) return res.status(403).send('No autorizado');

    const until = new Date(Date.now() + (minutes||10) * 60 * 1000).toISOString();
    await discordRequest('patch', `/guilds/${guildId}/members/${targetId}`, { communication_disabled_until: until });
    logAction('TIMEOUT', { guildId, targetId, by: ses.username, minutes });
    return res.status(200).send('✅ Timeout aplicado');
  } catch (e) {
    console.error('timeout err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// Send message (owner or moderator)
app.post('/api/guilds/:guildId/message', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { channelId, content } = req.body;
  const ses = req.session;
  if (!channelId || !content) return res.status(400).send('Falta channelId o content');
  try {
    const isOwner = await verifyOwner(ses.accessToken, guildId);
    const isModerator = await hasPermission(req.sessionUserId, guildId, 'moderator');
    if (!isOwner && !isModerator) return res.status(403).send('No autorizado (perm panel insuficiente).');

    const resp = await discordRequest('post', `/channels/${channelId}/messages`, { content });
    logAction('MESSAGE', { guildId, channelId, by: ses.username, content: content.slice(0,4000) });
    return res.status(200).send(safeJson(resp.data));
  } catch (e) {
    console.error('message err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// Create role (owner OR admin OR moderator)
app.post('/api/guilds/:guildId/create-role', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { name, color, permissions } = req.body;
  const ses = req.session;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!name) return res.status(400).send('Falta name');

  try {
    const isOwner = await verifyOwner(ses.accessToken, guildId);
    const isAdmin = await hasPermission(req.sessionUserId, guildId, 'admin');
    const isModerator = await hasPermission(req.sessionUserId, guildId, 'moderator');

    // <-- HERE: allow moderators too (per request)
    if (!isOwner && !isAdmin && !isModerator) return res.status(403).send('No autorizado');

    const resp = await axios.post(
      `https://discord.com/api/v10/guilds/${guildId}/roles`,
      { name, color: color || null, permissions: permissions || '0' },
      { headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    logAction('CREATE_ROLE', { guildId, name, by: ses.username });
    return res.status(200).send('✅ Rol creado');
  } catch (e) {
    console.error('create role err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// Delete role (owner OR admin OR moderator)
app.post('/api/guilds/:guildId/delete-role', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { roleId } = req.body;
  const ses = req.session;
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!roleId) return res.status(400).send('Falta roleId');

  try {
    const isOwner = await verifyOwner(ses.accessToken, guildId);
    const isAdmin = await hasPermission(req.sessionUserId, guildId, 'admin');
    const isModerator = await hasPermission(req.sessionUserId, guildId, 'moderator');

    if (!isOwner && !isAdmin && !isModerator) return res.status(403).send('No autorizado');

    await axios.delete(`https://discord.com/api/v10/guilds/${guildId}/roles/${roleId}`, { headers: { Authorization: `Bot ${BOT_TOKEN}` }});
    logAction('DELETE_ROLE', { guildId, roleId, by: ses.username });
    return res.status(200).send('✅ Rol eliminado');
  } catch (e) {
    console.error('delete role err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// Create channel (owner OR admin OR moderator)
app.post('/api/guilds/:guildId/create-channel', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { name, type = 0 } = req.body;
  const ses = req.session;
  if (!name) return res.status(400).send('Falta name');
  try {
    const isOwner = await verifyOwner(ses.accessToken, guildId);
    const isAdmin = await hasPermission(req.sessionUserId, guildId, 'admin');
    const isModerator = await hasPermission(req.sessionUserId, guildId, 'moderator');
    if (!isOwner && !isAdmin && !isModerator) return res.status(403).send('No autorizado (perm panel insuficiente).');

    const resp = await discordRequest('post', `/guilds/${guildId}/channels`, { name, type });
    logAction('CREATE_CHANNEL', { guildId, name, by: ses.username });
    return res.status(200).send('✅ Canal creado');
  } catch (e) {
    console.error('create channel err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// Delete channel (owner OR admin OR moderator)
app.post('/api/guilds/:guildId/delete-channel', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { channelId } = req.body;
  const ses = req.session;
  if (!channelId) return res.status(400).send('Falta channelId');
  try {
    const isOwner = await verifyOwner(ses.accessToken, guildId);
    const isAdmin = await hasPermission(req.sessionUserId, guildId, 'admin');
    const isModerator = await hasPermission(req.sessionUserId, guildId, 'moderator');
    if (!isOwner && !isAdmin && !isModerator) return res.status(403).send('No autorizado (perm panel insuficiente).');

    await discordRequest('delete', `/channels/${channelId}`);
    logAction('DELETE_CHANNEL', { guildId, channelId, by: ses.username });
    return res.status(200).send('✅ Canal eliminado');
  } catch (e) {
    console.error('delete channel err:', e.response?.data || e.message);
    return res.status(500).send(safeJson(e.response?.data || e.message));
  }
});

// ----------------- Perms management endpoints (owner only) -----------------
app.post('/api/guilds/:guildId/add-moderator', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetUserId } = req.body;
  const userId = req.sessionUserId;
  if (!targetUserId) return res.status(400).send('Falta targetUserId');

  const isOwner = await verifyOwner(userId, guildId);
  const isAdmin = await hasPermission(userId, guildId, 'admin');
  if (!isOwner && !isAdmin) return res.status(403).send('No autorizado');

  const perms = loadPerms();
  perms[guildId] = perms[guildId] || {};
  perms[guildId].moderators = Array.from(new Set([...(perms[guildId].moderators||[]), targetUserId]));
  savePerms(perms);
  logAction('ADD_MODERATOR', { guildId, targetUserId, by: userId });
  return res.status(200).send('✅ Moderador agregado');
});

app.post('/api/guilds/:guildId/remove-moderator', requireSession, async (req, res) => {
  const { guildId } = req.params;
  const { targetUserId } = req.body;
  const userId = req.sessionUserId;
  if (!targetUserId) return res.status(400).send('Falta targetUserId');

  const isOwner = await verifyOwner(userId, guildId);
  const isAdmin = await hasPermission(userId, guildId, 'admin');
  if (!isOwner && !isAdmin) return res.status(403).send('No autorizado');

  const perms = loadPerms();
  perms[guildId] = perms[guildId] || {};
  perms[guildId].moderators = (perms[guildId].moderators || []).filter(x => x !== targetUserId);
  savePerms(perms);
  logAction('REMOVE_MODERATOR', { guildId, targetUserId, by: userId });
  return res.status(200).send('✅ Moderador removido');
});

// ----------------- Logs endpoints -----------------
app.get('/logs/:guildId', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const ses = req.session;
  try {
    const isOwner = await verifyOwner(ses.accessToken, guildId);
    const isModerator = await hasPermission(req.sessionUserId, guildId, 'moderator');
    if (!isOwner && !isModerator) return res.status(403).send('No autorizado');
    const file = path.join(__dirname, 'acciones.log');
    if (!fs.existsSync(file)) return res.send('No hay logs.');
    const raw = fs.readFileSync(file, 'utf8');
    const lines = raw.split('\n').filter(l => l && l.includes(guildId));
    return res.send(lines.reverse().join('\n') || 'No hay logs para este servidor.');
  } catch (e) {
    console.error('logs err:', e);
    return res.status(500).send('Error leyendo logs');
  }
});

app.post('/logs/:guildId/clear', requireSession, async (req, res) => {
  const guildId = req.params.guildId;
  const ses = req.session;
  try {
    const isOwner = await verifyOwner(ses.accessToken, guildId);
    if (!isOwner) return res.status(403).send('No autorizado');
    const file = path.join(__dirname, 'acciones.log');
    if (!fs.existsSync(file)) return res.send('No hay logs.');
    const raw = fs.readFileSync(file, 'utf8');
    const lines = raw.split('\n').filter(l => l && !l.includes(guildId));
    fs.writeFileSync(file, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
    return res.send('✅ Logs del servidor borrados');
  } catch (e) {
    console.error('clear logs err:', e);
    return res.status(500).send('Error al borrar logs');
  }
});

// ----------------- Start server -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));








































































































