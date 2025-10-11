// -------------------- /mis-guilds/:userId --------------------
app.get('/mis-guilds/:userId', async (req, res) => {
  const userId = req.params.userId;
  const usuario = usuariosAutenticados.get(userId);
  if (!usuario) return res.redirect('/login');

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).send('Falta BOT_TOKEN en .env');

  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${usuario.accessToken}` }
    });

    const adminGuilds = guildsRes.data.filter(g => (BigInt(g.permissions) & BigInt(0x8)) !== 0);

    const botGuilds = [];
    for (const g of adminGuilds) {
      try {
        const guildInfo = await axios.get(`https://discord.com/api/v10/guilds/${g.id}?with_counts=true`, {
          headers: { Authorization: `Bot ${BOT_TOKEN}` }
        });

        const rolesCount = guildInfo.data.roles ? guildInfo.data.roles.length : 0;
        botGuilds.push({
          ...g,
          member_count: guildInfo.data.approximate_member_count || 'N/A',
          roles_count: rolesCount
        });
      } catch { /* bot no presente */ }
    }

    let guildList = '';
    botGuilds.forEach(g => {
      const iconUrl = g.icon
        ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`
        : 'https://via.placeholder.com/32?text=?';

      // Links: Discord server link y Panel del bot (si existe)
      const discordLink = `https://discord.com/channels/${g.id}`;
      const botPanelLink = `/panel/${g.id}`; // Suponiendo que tu panel lo sirves aquí

      guildList += `
<li>
  <img src="${iconUrl}" class="avatar">
  <strong>${g.name}</strong> (ID: ${g.id})<br>
  Miembros: ${g.member_count}, Roles: ${g.roles_count}<br>
  <a class="small-button" href="${discordLink}" target="_blank">Abrir Discord</a>
  <a class="small-button" href="${botPanelLink}" target="_blank">Panel Abyssus</a>
</li>`;
    });

    if (!guildList) guildList = '<li>No se encontraron servidores con Abyssus donde eres admin.</li>';

    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Servidores con Abyssus</title>
<style>
body { font-family:'Segoe UI',Tahoma,Verdana,sans-serif; background: linear-gradient(135deg,#667eea,#764ba2); color:#fff; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:2rem; }
.card { background-color: rgba(0,0,0,0.35); padding:2rem; border-radius:15px; text-align:center; box-shadow:0 8px 25px rgba(0,0,0,0.5); width:100%; max-width:600px; }
h1 { font-size:2rem; margin-bottom:1rem; }
ul { list-style:none; padding:0; }
li { margin:0.5rem 0; background: rgba(255,255,255,0.1); padding:0.5rem 1rem; border-radius:8px; text-align:left; }
a.button, a.small-button { display:inline-block; margin-top:0.3rem; margin-right:0.3rem; padding:0.4rem 0.8rem; background-color:#fff; color:#764ba2; text-decoration:none; font-weight:bold; border-radius:6px; font-size:0.9rem; transition:0.3s; }
a.button:hover, a.small-button:hover { background-color:#f0f0f0; }
img.avatar { width:32px; height:32px; border-radius:50%; vertical-align:middle; margin-right:0.5rem; }
</style>
</head>
<body>
<div class="card">
<h1>Servidores con Abyssus</h1>
<ul>
${guildList}
</ul>
<a class="button" href="/login">Cerrar sesión / Volver a login</a>
</div>
</body>
</html>
    `);

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Error obteniendo servidores con Abyssus');
  }
});






































































