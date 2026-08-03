const mysql = require('mysql2/promise');

// Pool de conexiones
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'stickman',
  waitForConnections: true,
  connectionLimit: 3,
  queueLimit: 0,
});

// Almacenamiento local de respaldo si la BD externa no esta configurada
const usuariosMemoria = [];
const ganadoresMemoria = [];

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(20) NOT NULL UNIQUE,
        password VARCHAR(50) NOT NULL,
        creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Base de datos MySQL conectada correctamente');
  } catch (err) {
    console.log('MySQL no disponible. Usando almacenamiento temporal en memoria.');
  }
}

async function crearUsuario(username, password) {
  try {
    await pool.query('INSERT INTO usuarios (username, password) VALUES (?, ?)', [username, password]);
  } catch (err) {
    // Si falla MySQL, guarda en memoria
    usuariosMemoria.push({ id: Date.now(), username, password });
  }
}

async function buscarUsuarioPorNombre(username) {
  try {
    const [rows] = await pool.query('SELECT id, username, password FROM usuarios WHERE username = ? LIMIT 1', [username]);
    if (rows[0]) return rows[0];
  } catch (err) {
    // Buscar en respaldo
  }
  return usuariosMemoria.find(u => u.username === username) || null;
}

async function obtenerGanadores() {
  try {
    const [rows] = await pool.query('SELECT nombre, puntuacion, fecha FROM ganadores ORDER BY puntuacion DESC LIMIT 20');
    if (rows.length) return rows;
  } catch (err) {
    // Devuelve lista en memoria
  }
  return ganadoresMemoria;
}

module.exports = {
  pool,
  initDB,
  crearUsuario,
  buscarUsuarioPorNombre,
  obtenerGanadores
};
