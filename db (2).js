const mysql = require('mysql2/promise');

// Conexion ligbera a MySQL mediante variables de entorno
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'stickman',
  waitForConnections: true,
  connectionLimit: 3, // Limite reducido para ahorrar memoria en Render
  queueLimit: 0,
});

// Inicializa el esquema de la base de datos con diseno relacional
async function initDB() {
  try {
    // 1. Tabla de Usuarios (Inicio de sesion / Crear cuenta)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(20) NOT NULL UNIQUE,
        password VARCHAR(50) NOT NULL,
        creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Tabla de Catalogo de Armas (Soporta el CRUD)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS armas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(50) NOT NULL,
        tipo VARCHAR(20) NOT NULL,
        dano INT NOT NULL
      )
    `);

    // 3. Tabla de Equipamiento asignado por usuario (Relacion N:M)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS equipamiento (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        arma_id INT NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        FOREIGN KEY (arma_id) REFERENCES armas(id) ON DELETE CASCADE
      )
    `);

    // 4. Tabla de Puntajes y Ganadores del Juego
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ganadores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(30) NOT NULL,
        puntuacion INT NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Base de datos cargada correctamente');
  } catch (err) {
    console.error('Error al inicializar la base de datos:', err.message);
  }
}

// Operaciones para Usuarios
async function crearUsuario(username, password) {
  await pool.query('INSERT INTO usuarios (username, password) VALUES (?, ?)', [username, password]);
}

async function buscarUsuarioPorNombre(username) {
  const [rows] = await pool.query('SELECT id, username, password FROM usuarios WHERE username = ? LIMIT 1', [username]);
  return rows[0] || null;
}

// Operaciones CRUD para Catalogo de Armas
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

// Operaciones de Equipamiento
async function registrarEquipamiento(usuarioId, armaId) {
  await pool.query('INSERT INTO equipamiento (usuario_id, arma_id) VALUES (?, ?)', [usuarioId, armaId]);
}

// Operaciones para Puntajes de Juego
async function guardarGanador(nombre, puntuacion) {
  try {
    await pool.query('INSERT INTO ganadores (nombre, puntuacion) VALUES (?, ?)', [nombre, puntuacion]);
  } catch (err) {
    console.error('Error al guardar puntaje:', err.message);
  }
}

async function obtenerGanadores() {
  const [rows] = await pool.query('SELECT nombre, puntuacion, fecha FROM ganadores ORDER BY puntuacion DESC LIMIT 20');
  return rows;
}

module.exports = {
  pool,
  initDB,
  crearUsuario,
  buscarUsuarioPorNombre,
  crearArma,
  obtenerArmas,
  actualizarArma,
  eliminarArma,
  registrarEquipamiento,
  guardarGanador,
  obtenerGanadores
};
