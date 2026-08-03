const mysql = require('mysql2/promise');
require('dotenv').config();

// Configuración del pool de conexiones
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'stickman_db',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Función para inicializar las tablas
async function initDB() {
  try {
    const connection = await pool.getConnection();

    // Tabla de usuarios
    await connection.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // Tabla de ganadores
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ganadores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(50) NOT NULL,
        puntuacion INT DEFAULT 0,
        fecha_victoria TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    connection.release();
    console.log('✅ Base de datos inicializada correctamente');
  } catch (err) {
    console.error('❌ No se pudo conectar a MySQL:', err.message);
  }
}

// Funciones para consultas
async function crearUsuario(username, passwordHash) {
  const [result] = await pool.query(
    'INSERT INTO usuarios (username, password_hash) VALUES (?, ?)',
    [username, passwordHash]
  );
  return result;
}

async function buscarUsuarioPorNombre(username) {
  const [rows] = await pool.query(
    'SELECT * FROM usuarios WHERE username = ?',
    [username]
  );
  return rows[0];
}

async function guardarGanador(nombre, puntuacion) {
  const [result] = await pool.query(
    'INSERT INTO ganadores (nombre, puntuacion) VALUES (?, ?)',
    [nombre, puntuacion]
  );
  return result;
}

async function obtenerGanadores() {
  const [rows] = await pool.query(
    'SELECT nombre, puntuacion, fecha_victoria FROM ganadores ORDER BY puntuacion DESC LIMIT 10'
  );
  return rows;
}

module.exports = {
  pool,
  initDB,
  crearUsuario,
  buscarUsuarioPorNombre,
  guardarGanador,
  obtenerGanadores,
};
