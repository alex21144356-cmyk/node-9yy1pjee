const mysql = require('mysql2/promise');

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

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(20) NOT NULL UNIQUE,
        password_hash VARCHAR(100) NOT NULL,
        creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS armas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(50) NOT NULL,
        tipo VARCHAR(20) NOT NULL,
        dano INT NOT NULL
      )
    `);

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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ganadores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(30) NOT NULL,
        puntuacion INT NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Base de datos inicializada correctamente');
  } catch (err) {
    console.error('Error al inicializar MySQL:', err.message);
  }
}

async function crearUsuario(username, passwordHash) {
  try {
    await pool.query('INSERT INTO usuarios (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
  } catch (err) {
    console.error('Error al crear usuario:', err.message);
    throw err;
  }
}

async function buscarUsuarioPorNombre(username) {
  try {
    const [rows] = await pool.query('SELECT id, username, password_hash FROM usuarios WHERE username = ? LIMIT 1', [username]);
    return rows[0] || null;
  } catch (err) {
    console.error('Error al buscar usuario:', err.message);
    return null;
  }
}

async function crearArma(nombre, tipo, dano) {
  try {
    const [res] = await pool.query('INSERT INTO armas (nombre, tipo, dano) VALUES (?, ?, ?)', [nombre, tipo, dano]);
    return res.insertId;
  } catch (err) {
    console.error('Error al crear arma:', err.message);
    throw err;
  }
}

async function obtenerArmas() {
  try {
    const [rows] = await pool.query('SELECT * FROM armas');
    return rows;
  } catch (err) {
    console.error('Error al obtener armas:', err.message);
    return [];
  }
}

async function actualizarArma(id, nombre, tipo, dano) {
  try {
    await pool.query('UPDATE armas SET nombre = ?, tipo = ?, dano = ? WHERE id = ?', [nombre, tipo, dano, id]);
  } catch (err) {
    console.error('Error al actualizar arma:', err.message);
    throw err;
  }
}

async function eliminarArma(id) {
  try {
    await pool.query('DELETE FROM armas WHERE id = ?', [id]);
  } catch (err) {
    console.error('Error al eliminar arma:', err.message);
    throw err;
  }
}

async function registrarEquipamiento(usuarioId, armaId) {
  try {
    await pool.query('INSERT INTO equipamiento (usuario_id, arma_id) VALUES (?, ?)', [usuarioId, armaId]);
  } catch (err) {
    console.error('Error al registrar equipamiento:', err.message);
    throw err;
  }
}

async function guardarGanador(nombre, puntuacion) {
  try {
    await pool.query('INSERT INTO ganadores (nombre, puntuacion) VALUES (?, ?)', [nombre, puntuacion]);
  } catch (err) {
    console.error('Error al guardar ganador:', err.message);
  }
}

async function obtenerGanadores() {
  try {
    const [rows] = await pool.query('SELECT nombre, puntuacion FROM ganadores ORDER BY puntuacion DESC LIMIT 10');
    return rows;
  } catch (err) {
    console.error('Error al obtener ganadores:', err.message);
    return [];
  }
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
