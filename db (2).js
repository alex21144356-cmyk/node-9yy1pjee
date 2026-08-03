const mysql = require('mysql2/promise');

// Configura la conexion a MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'stickman',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

// Inicializa las tablas necesarias en la base de datos
async function initDB() {
  try {
    // Tabla para ganadores del juego
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ganadores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(30) NOT NULL,
        puntuacion INT NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de usuarios registrados
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(20) NOT NULL UNIQUE,
        password_hash VARCHAR(100) NOT NULL,
        creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de catalogo de armas (Cumple CRUD)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS armas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(50) NOT NULL,
        tipo VARCHAR(20) NOT NULL,
        dano INT NOT NULL
      )
    `);

    // Tabla de asignacion de equipamiento por usuario
    await pool.query(`
      CREATE TABLE IF NOT EXISTS equipamiento (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        arma_id INT NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
        FOREIGN KEY (arma_id) REFERENCES armas(id)
      )
    `);

    console.log('✅ Base de datos inicializada correctamente.');
  } catch (err) {
    console.error('❌ Error al inicializar MySQL:', err.message);
  }
}

// Registro de usuarios
async function crearUsuario(username, passwordHash) {
  await pool.query('INSERT INTO usuarios (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
}

// Búsqueda de usuario por nombre
async function buscarUsuarioPorNombre(username) {
  const [rows] = await pool.query('SELECT id, username, password_hash FROM usuarios WHERE username = ? LIMIT 1', [username]);
  return rows[0] || null;
}

// Operaciones CRUD para Armas
async function crearArma(nombre, tipo, dano) {
  const [res] = await pool.query('INSERT INTO armas (nombre, tipo, dano) VALUES (?, ?, ?)', [nombre, tipo, dano]);
  return res.insertId;
}

async function obtenerArmas() {
  const [rows] = await pool.query('SELECT * FROM armas');
  return rows;
}

async function actualizarArma(id, nombre, tipo, dano) {
  await pool.query('UPDATE armas SET nombre = ?, tipo = ?, dano = ? WHERE id = ?', [nombre, tipo, dano, id]);
}

async function eliminarArma(id) {
  await pool.query('DELETE FROM armas WHERE id = ?', [id]);
}

// Registro de asignación de equipamiento
async function registrarEquipamiento(usuarioId, armaId) {
  await pool.query('INSERT INTO equipamiento (usuario_id, arma_id) VALUES (?, ?)', [usuarioId, armaId]);
}

// Historial de puntuaciones
async function guardarGanador(nombre, puntuacion) {
  try {
    await pool.query('INSERT INTO ganadores (nombre, puntuacion) VALUES (?, ?)', [nombre, puntuacion]);
  } catch (err) {
    console.error('Error al guardar ganador:', err.message);
  }
}

async function obtenerGanadores() {
  const [rows] = await pool.query('SELECT nombre, puntuacion, fecha FROM ganadores ORDER BY fecha DESC LIMIT 50');
  return rows;
}

module.exports = {
  pool,
  initDB,
  guardarGanador,
  obtenerGanadores,
  crearUsuario,
  buscarUsuarioPorNombre,
  crearArma,
  obtenerArmas,
  actualizarArma,
  eliminarArma,
  registrarEquipamiento
};
