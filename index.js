// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// --------------------
// 1️⃣ Bot de Discord
// --------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.User]
});

// Datos en memoria
const db = {
  usuarios: {},      // { userId: { balance, ingresos, gastos } }
  niveles: {},       // { userId: { xp, nivel } }
  modlogs: {}        // { userId: [{ action, reason, date }] }
};

// Ejemplo de evento: cuando alguien manda mensaje, gana XP
client.on('messageCreate', msg => {
  if (msg.author.bot) return;

  const uid = msg.author.id;

  // Economía
  if (!db.usuarios[uid]) db.usuarios[uid] = { balance: 0, ingresos: 0, gastos: 0 };
  db.usuarios[uid].balance += 10;
  db.usuarios[uid].ingresos += 10;

  // Niveles
  if (!db.niveles[uid]) db.niveles[uid] = { xp: 0, nivel: 0 };
  db.niveles[uid].xp += 15;
  const lvl = Math.floor(db.niveles[uid].xp / 1000);
  if (lvl > db.niveles[uid].nivel) db.niveles[uid].nivel = lvl;
});

// Modlogs de ejemplo
client.on('guildBanAdd', (guild, user) => {
  if (!db.modlogs[user.id]) db.modlogs[user.id] = [];
  db.modlogs[user.id].push({ action: 'BAN', reason: 'Automático', date: new Date() });
});

client.login(process.env.TOKEN);

// --------------------
// 2️⃣ Dashboard
// --------------------

// Endpoint de datos
app.get('/data', (req, res) => {
  const usuariosArr = Object.entries(db.usuarios).map(([id, u]) => ({ id, ...u }));
  const nivelesArr = Object.entries(db.niveles).map(([id, n]) => ({ id, ...n }));

  // KPIs
  const totalUsuarios = usuariosArr.length;
  const economiaTotal = usuariosArr.reduce((a,b)=>a+(b.balance||0),0);
  const totalWarns = Object.values(db.modlogs).flat().length;
  const promedioNivel = nivelesArr.length ? (nivelesArr.reduce((a,b)=>a+b.nivel,0)/nivelesArr.length).toFixed(2) : 0;

  // Top
  const topXP = nivelesArr.slice().sort((a,b)=>b.xp-a.xp).slice(0,10);
  const topBalance = usuariosArr.slice().sort((a,b)=>b.balance-a.balance).slice(0,10);

  res.json({
    ok: true,
    timestamp: new Date(),
    totalUsuarios,
    economiaTotal,
    totalWarns,
    promedioNivel,
    topXP,
    topBalance,
    lastUpdate: new Date().toISOString()
  });
});

// Frontend simple
app.get('/', (req,res) => {
  res.sendFile(__dirname + '/public/index.html'); // Aquí va tu HTML estilo dashboard
});

// Servir static assets
app.use(express.static('public'));

app.listen(PORT, () => console.log(`✅ Dashboard activo en http://localhost:${PORT}`));

















































