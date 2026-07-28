// ============== CONEXIÓN A MYSQL (phpMyAdmin) ==============
// Este módulo se conecta a la base de datos MySQL que administras desde
// phpMyAdmin. Las credenciales se leen de variables de entorno (.env) —
// nunca las escribas directo en el código ni las subas a GitHub.
const mysql = require('mysql2/promise');
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

// Crea las tablas si todavía no existen (las verás en phpMyAdmin)
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ganadores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(30) NOT NULL,
        puntuacion INT NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Conectado a MySQL. Tabla "ganadores" lista.');

    // Cuentas de usuario para el login (usuario + contraseña encriptada)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(20) NOT NULL UNIQUE,
        password_hash VARCHAR(100) NOT NULL,
        creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla "usuarios" lista.');
  } catch (err) {
    console.error('❌ No se pudo conectar a MySQL:', err.message);
  }
}

// Guarda al ganador de la partida (nombre + puntuación) cuando alguien llega a 10 puntos
async function guardarGanador(nombre, puntuacion) {
  try {
    await pool.query('INSERT INTO ganadores (nombre, puntuacion) VALUES (?, ?)', [
      nombre,
      puntuacion,
    ]);
    console.log('🏆 Ganador guardado en MySQL:', nombre, puntuacion, 'pts');
  } catch (err) {
    console.error('Error guardando ganador en MySQL:', err.message);
  }
}

// Lista de ganadores históricos, más recientes primero
async function obtenerGanadores() {
  const [rows] = await pool.query(
    'SELECT nombre, puntuacion, fecha FROM ganadores ORDER BY fecha DESC LIMIT 50'
  );
  return rows;
}

// ============== CUENTAS DE USUARIO (LOGIN) ==============

// Crea una cuenta nueva. password_hash ya debe venir encriptado con bcrypt
// (nunca se guarda la contraseña en texto plano).
async function crearUsuario(username, passwordHash) {
  await pool.query('INSERT INTO usuarios (username, password_hash) VALUES (?, ?)', [
    username,
    passwordHash,
  ]);
}

// Busca un usuario por nombre (usado tanto en login como para revisar duplicados en registro)
async function buscarUsuarioPorNombre(username) {
  const [rows] = await pool.query(
    'SELECT id, username, password_hash FROM usuarios WHERE username = ? LIMIT 1',
    [username]
  );
  return rows[0] || null;
}

module.exports = {
  pool,
  initDB,
  guardarGanador,
  obtenerGanadores,
  crearUsuario,
  buscarUsuarioPorNombre,
};
