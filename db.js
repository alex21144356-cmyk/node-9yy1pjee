// ============== CONEXIÓN Y CONSULTAS A MYSQL ==============
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

// Inicialización de la base de datos (Tablas "usuarios" y "ganadores")
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(20) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ganadores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(30) NOT NULL,
        puntuacion INT NOT NULL,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Conectado a MySQL. Tablas "usuarios" y "ganadores" listas.');
  } catch (err) {
    console.error('❌ No se pudo conectar a MySQL:', err.message);
  }
}

// ============== FUNCIONES DE USUARIOS ==============
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
  return rows[0] || null;
}

// ============== FUNCIONES DE GANADORES ==============
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

async function obtenerGanadores() {
  const [rows] = await pool.query(
    'SELECT nombre, puntuacion, fecha FROM ganadores ORDER BY puntuacion DESC, fecha DESC LIMIT 50'
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
