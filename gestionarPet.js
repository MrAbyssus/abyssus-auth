const mascotas = {};

function invocarMascota(guildId, userId) {
  const id = `${guildId}-${userId}`;
  const mascota = {
    nombre: 'Umbra',
    tipo: 'Sombras',
    rareza: 'Rara',
    estado: 'Curiosa'
  };
  mascotas[id] = mascota;
  return mascota;
}

function verMascota(guildId, userId) {
  return mascotas[`${guildId}-${userId}`];
}

function alimentarMascota(guildId, userId, comida) {
  const id = `${guildId}-${userId}`;
  if (!mascotas[id]) return null;
  mascotas[id].estado = `Saciedad emocional (${comida})`;
  return `Tu mascota ha sido alimentada con \`${comida}\`. Su vínculo se fortalece.`;
}

function fusionarMascota(guildId, userId) {
  const id = `${guildId}-${userId}`;
  if (!mascotas[id]) return null;
  mascotas[id].rareza = 'Abismal';
  mascotas[id].estado = 'Fusionada con entidad desconocida';
  return '🧪 La fusión fue exitosa. Tu criatura ha cambiado...';
}

function liberarMascota(guildId, userId) {
  const id = `${guildId}-${userId}`;
  if (!mascotas[id]) return false;
  delete mascotas[id];
  return true;
}

module.exports = {
  invocarMascota,
  verMascota,
  alimentarMascota,
  fusionarMascota,
  liberarMascota
};
