// -------------------- /panel/:guildId --------------------
app.get('/panel/:guildId', async (req, res) => {
  const guildId = req.params.guildId;
  const userId = req.query.userId; // Enlace desde /mis-guilds?userId=XXX
  const usuario = usuariosAutenticados.get(userId);
  if (!usuario) return res.redirect('/login');

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send('Falta BOT_TOKEN en .env');

  try {
    // Verificar que el usuario es admin en ese servidor
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${usuario.accessToken}` }
    });
    const isAdmin = guildsRes.data.some(g => g.id === guildId && (BigInt(g.permissions) & BigInt(0x8)) !== 0);
    if (!isAdmin) return res.status(403).send('No tienes permisos para ver este panel');

    // Obtener info del servidor
    const guildInfo = await axios.get(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });

    const rolesRes = await axios.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });

    const channelsRes = await axios.get(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });

    const guild = guildInfo.data;
    const roles = rolesRes.data;
    const channels = channelsRes.data;

    const iconUrl = guild.icon
      ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`
      : 'https://via.placeholder.com/64?text=?';

    const rolesList = roles.map(r => `<li>${r.name} (ID: ${r.id})</li>`).join('');
    const channelsList = channels.map(c => `<li>[${c.type}] ${c.name} (ID: ${c.id})</li>`).join('');

    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Panel Abyssus - ${guild.name}</title>
<style>
body { font-family:'Segoe UI',Tahoma,Verdana,sans-serif; background: linear-gradient(135deg,#667eea,#764ba2); color:#fff; padding:2rem; margin:0; }
.card { background-color: rgba(0,0,0,0.35); padding:2rem; border-radius:15px; box-shadow:0 8px 25px rgba(0,0,0,0.5); max-width:800px; margin:auto; }
h1, h2 { margin-bottom:1rem; }
ul { list-style:none; padding:0; }
li { margin:0.3rem 0; background: rgba(255,255,255,0.1); padding:0.3rem 0.6rem; border-radius:6px; }
img.avatar { width:64px; height:64px; border-radius:50%; vertical-align:middle; margin-right:0.5rem; }
a.button { display:inline-block; margin-top:1rem; padding:0.5rem 1rem; background-color:#fff; color:#764ba2; text-decoration:none; font-weight:bold; border-radius:8px; transition:0.3s; }
a.button:hover { background-color:#f0f0f0; }
</style>
</head>
<body>
<div class="card">
<h1><img class="avatar" src="${iconUrl}" alt="Icono"/> ${guild.name}</h1>
<p>ID: ${guild.id}</p>
<p>Miembros: ${guild.approximate_member_count || 'N/A'}, Roles: ${roles.length}</p>
<h2>Roles</h2>
<ul>${rolesList}</ul>
<h2>Canales</h2>
<ul>${channelsList}</ul>
<a class="button" href="/mis-guilds/${userId}">Volver a mis servidores</a>
</div>
</body>
</html>
    `);

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Error cargando el panel del servidor');
  }
});







































































