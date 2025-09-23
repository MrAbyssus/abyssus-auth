const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '../data/economia.json');

let data = {};

// Inicializar archivo si no existe
if (!fs.existsSync(filePath)) {
  fs.writeFileSync(filePath, JSON.stringify({}, null, 2));
}

// Cargar datos
try {
  data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (err) {
  console.error('❌ Error al leer economia.json:', err);
  data = {};
}

// Guardar datos
function save() {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Asegura que el usuario exista
function asegurarUsuario(userId) {
  if (!data[userId]) {
    data[userId] = 0;
    save();
  }
}

// Suma monedas al usuario
function sumarMonedas(userId, cantidad) {
  asegurarUsuario(userId);
  data[userId] += cantidad;
  save();
}

// Resta monedas (para /pay)
function restarMonedas(userId, cantidad) {
  asegurarUsuario(userId);
  data[userId] = Math.max(0, data[userId] - cantidad);
  save();
}

// Obtener balance
function obtenerMonedas(userId) {
  asegurarUsuario(userId);
  return data[userId];
}

// Establecer balance directo
function establecerMonedas(userId, cantidad) {
  data[userId] = cantidad;
  save();
}

module.exports = {
  sumarMonedas,
  restarMonedas,
  obtenerMonedas,
  establecerMonedas
};


