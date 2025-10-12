require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.static('public'));

// --- Almacenamiento temporal y logs ---
const usuariosAutenticados = new Map();
const logPath = path.join(__dirname, 'logs/panel_actions.log');
if (!fs.existsSync(path.dirname(logPath))) fs.mkdirSync(path.dirname(logPath), { recursive: true });

function registrarAccion(usuario, guildId, tipo, detalle) {
  const log = `[${new Date().toISOString()}] ${usuario.username}#${usuario.discriminator} (${usuario.id}) @ ${guildId} → ${tipo}: ${detalle}\n`;
  fs.appendFileSync(logPath, log);
}

function safeJson(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

// -------------------- LOGIN --------------------
app.get('/login', (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const redirect = process.env.REDIRECT_URI;
  const url = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=identify%20guilds`;
  res.send(`
  <html><head><meta charset="utf-8"><title>Login</title></head>
  <body style="background:#1e1f2e;color:#fff;font-family:sans-serif;text-align:center;padding-top:10%">
    <h1>Inicia sesión con Discord</h1>
    <a href="${url}" style="background:#5865f2;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Login con Discord</a>
  </body></html>`);
});

// -------------------- CALLBACK --------------------
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login');
  try {
    const token = await axios.post('https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const accessToken = token.data.access_token;
    const user = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    usuariosAutenticados.set(user.data.id, {
      ...user.data,
      accessToken,
      createdAt: Date.now()
    });

    res.send(`
      <html><body style="background:#0a0a0f;color:#fff;text-align:center;font-family:sans-serif;padding-top:10%">
      <h2>✅ Autenticado como ${user.data.username}#${user.data.discriminator}</h2>
      <a href="/mis-guilds/${user.data.id}" style="color:#5865f2;font-weight:bold;">Ver servidores</a>
      </body></html>`);
  } catch (err) {
    res.status(500).send(`<pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// -------------------- MIS SERVIDORES --------------------
app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const usuario = usuariosAutenticados.get(userId);
  if (!usuario) return res.redirect('/login');
  const BOT_TOKEN = process.env.BOT_TOKEN;

  try {
    const guildsUser = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${usuario.accessToken}` }
    });

    const guilds = guildsUser.data.filter(g => (BigInt(g.permissions) & BigInt(0x8)) !== 0);

    const botGuilds = [];
    for (const g of guilds) {
      try {
        await axios.get(`https://discord.com/api/v10/guilds/${g.id}`, {
          headers: { Authorization: `Bot ${BOT_TOKEN}` }
        });
        botGuilds.push(g);
      } catch { continue; }
    }

    const html = botGuilds.map(g => {
      const icon = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://via.placeholder.com/64';
      return `<li style="margin:10px 0"><img src="${icon}" width="32" style="vertical-align:middle;border-radius:6px;margin-right:8px;">
      ${g.name} <a href="/panel/${g.id}?userId=${userId}" style="color:#5865f2;text-decoration:none;">Abrir panel</a></li>`;
    }).join('');

    res.send(`<body style="background:#0a0a0f;color:#fff;font-family:sans-serif;padding:20px;">
      <h2>Servidores con Abyssus</h2>
      <ul>${html || '<li>No se encontraron servidores donde el bot esté presente.</li>'}</ul>
      </body>`);
  } catch (err) {
    res.status(500).send(`<pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// -------------------- PANEL --------------------
app.get('/panel/:guildId', async (req, res) => {
  const { guildId } = req.params;
  const userId = req.query.userId;
  const usuario = usuariosAutenticados.get(userId);
  if (!usuario) return res.redirect('/login');
  const BOT_TOKEN = process.env.BOT_TOKEN;

  try {
    const guildsUser = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${usuario.accessToken}` }
    });
    const isAdmin = guildsUser.data.some(g => g.id === guildId && (BigInt(g.permissions) & BigInt(0x8)) !== 0);
    if (!isAdmin) return res.status(403).send('No tienes permisos.');

    const [guild, roles, channels, members] = await Promise.all([
      axios.get(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/channels`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } }),
      axios.get(`https://discord.com/api/v10/guilds/${guildId}/members?limit=20`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } })
    ]);

    const g = guild.data;

    res.send(`
<!doctype html><html><head><meta charset="utf-8"><title>Panel - ${g.name}</title>
<style>
body{background:#0a0a0f;color:#fff;font-family:Inter,Arial;padding:1rem}
button{background:#5865f2;color:#fff;border:none;padding:.4rem .8rem;border-radius:6px;cursor:pointer;font-weight:bold}
button:hover{opacity:.85}
input,textarea{width:100%;padding:.3rem;border-radius:5px;border:none;margin:.3rem 0}
.card{background:#1b1d2a;padding:1rem;border-radius:10px;margin-bottom:1rem}
</style></head><body>
<h1>${g.name}</h1>
<div class="card"><h2>Miembros</h2>
${members.data.map(m => `<div>${m.user.username}#${m.user.discriminator}
<button onclick="formAccion('kick','${m.user.id}')">Kick</button>
<button onclick="formAccion('ban','${m.user.id}')">Ban</button></div>`).join('')}
</div>

<div class="card"><h2>Canales</h2>
${channels.data.map(c => `<div>${c.name} <button onclick="accion('deleteChannel','${c.id}')">Borrar</button></div>`).join('')}
<form onsubmit="crear(event,'createChannel')">
<input name="name" placeholder="Nuevo canal">
<button>Crear</button></form></div>

<div class="card"><h2>Roles</h2>
${roles.data.map(r => `<div>${r.name} <button onclick="accion('deleteRole','${r.id}')">Borrar</button></div>`).join('')}
<form onsubmit="crear(event,'createRole')">
<input name="name" placeholder="Nuevo rol">
<button>Crear</button></form></div>

<a href="/mis-guilds/${userId}" style="color:#999">← Volver</a>

<div id="modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);align-items:center;justify-content:center;">
<form id="formAct" style="background:#1e1f2e;padding:1rem;border-radius:12px;max-width:400px;width:100%">
<h3 id="tituloAccion"></h3>
<input type="hidden" name="targetId"><textarea name="reason" placeholder="Motivo"></textarea>
<label id="diasLabel" style="display:none">Días de mensajes (solo ban)</label>
<input type="number" name="delete_days" min="0" max="7" style="display:none">
<button>Confirmar</button>
<button type="button" onclick="cerrarModal()" style="background:#555">Cancelar</button>
</form></div>

<script>
let tipoActual=null;
function formAccion(tipo,id){
 tipoActual=tipo;
 document.querySelector('#formAct [name=targetId]').value=id;
 document.getElementById('tituloAccion').textContent=tipo==='ban'?'Banear usuario':'Expulsar usuario';
 document.querySelector('[name=delete_days]').style.display=tipo==='ban'?'block':'none';
 document.getElementById('diasLabel').style.display=tipo==='ban'?'block':'none';
 document.getElementById('modal').style.display='flex';
}
function cerrarModal(){document.getElementById('modal').style.display='none';}

document.getElementById('formAct').onsubmit=async e=>{
 e.preventDefault();
 const data=Object.fromEntries(new FormData(e.target).entries());
 const res=await fetch('/api/${guildId}/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,tipo:tipoActual,userId:'${userId}'})});
 alert(await res.text()); cerrarModal(); location.reload();
};

async function accion(tipo,id){
 if(!confirm('¿Seguro?'))return;
 const res=await fetch('/api/${guildId}/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tipo,targetId:id,userId:'${userId}'})});
 alert(await res.text()); location.reload();
}
async function crear(e,tipo){
 e.preventDefault();
 const name=e.target.name.value;
 const res=await fetch('/api/${guildId}/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tipo,name,userId:'${userId}'})});
 alert(await res.text()); location.reload();
}
</script>
</body></html>`);
  } catch (err) {
    res.status(500).send(`<pre>${safeJson(err.response?.data || err.message)}</pre>`);
  }
});

// -------------------- API ACTIONS --------------------
app.post('/api/:guildId/action', express.json(), async (req, res) => {
  const { tipo, targetId, reason, delete_days, name, userId } = req.body;
  const { guildId } = req.params;
  const usuario = usuariosAutenticados.get(userId);
  if (!usuario) return res.status(401).send('No autenticado.');
  const BOT_TOKEN = process.env.BOT_TOKEN;

  try {
    let result = '';
    if (tipo === 'kick') {
      await axios.delete(`https://discord.com/api/v10/guilds/${guildId}/members/${targetId}`, {
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
        data: { reason }
      });
      result = `✅ Usuario expulsado (${targetId})`;
    } else if (tipo === 'ban') {
      await axios.put(`https://discord.com/api/v10/guilds/${guildId}/bans/${targetId}`,
        { delete_message_days: delete_days || 0, reason },
        { headers: { Authorization: `Bot ${BOT_TOKEN}` } });
      result = `✅ Usuario baneado (${targetId})`;
    } else if (tipo === 'deleteChannel') {
      await axios.delete(`https://discord.com/api/v10/channels/${targetId}`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } });
      result = '🗑️ Canal eliminado.';
    } else if (tipo === 'createChannel') {
      await axios.post(`https://discord.com/api/v10/guilds/${guildId}/channels`, { name }, { headers: { Authorization: `Bot ${BOT_TOKEN}` } });
      result = `📢 Canal "${name}" creado.`;
    } else if (tipo === 'deleteRole') {
      await axios.delete(`https://discord.com/api/v10/guilds/${guildId}/roles/${targetId}`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } });
      result = `🧾 Rol eliminado.`;
    } else if (tipo === 'createRole') {
      await axios.post(`https://discord.com/api/v10/guilds/${guildId}/roles`, { name }, { headers: { Authorization: `Bot ${BOT_TOKEN}` } });
      result = `🎨 Rol "${name}" creado.`;
    } else {
      return res.status(400).send('Acción inválida.');
    }

    registrarAccion(usuario, guildId, tipo, result);
    res.send(result);
  } catch (err) {
    res.status(500).send('❌ Error: ' + (err.response?.data?.message || err.message));
  }
});

// -------------------- SERVER --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Servidor Abyssus Panel corriendo en puerto ${PORT}`));





















































































