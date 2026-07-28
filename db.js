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

// Crea la tabla si todavía no existe (la verás en phpMyAdmin como "ganadores")
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

module.exports = { pool, initDB, guardarGanador, obtenerGanadores };
