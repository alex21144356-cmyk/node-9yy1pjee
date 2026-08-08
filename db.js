const mysql = require('mysql2/promise');

// Configura la conexion a MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'stickman',
  waitForConnections: true,
  connectionLimit: 5, // pool pequeno a proposito: suficiente para el juego y liviano para Render
  queueLimit: 0,
});

// Inicializa las tablas necesarias en la base de datos (si ya existen, no hace nada)
async function initDB() {
  try {
    // Tabla de puntajes: guarda al ganador de cada partida (nombre + puntuacion)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ganadores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(30) NOT NULL,
        puntuacion INT NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de usuarios: login / registro (solo usuario y contrasena encriptada)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(20) NOT NULL UNIQUE,
        password_hash VARCHAR(100) NOT NULL,
        creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de catalogo de armas (aqui vive el CRUD)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS armas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(50) NOT NULL,
        tipo VARCHAR(20) NOT NULL,
        dano INT NOT NULL
      )
    `);

    // Tabla puente: que arma tiene equipada cada usuario
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

    console.log('Base de datos inicializada correctamente.');
  } catch (err) {
    console.error('Error al inicializar MySQL:', err.message); // se documenta el error en consola
  }

  // Migracion segura: si la tabla "ganadores" ya existia de antes (sin la
  // columna "victorias"), se la agregamos ahora. Si ya existe, MySQL avisa
  // con el error "Duplicate column name" y simplemente lo ignoramos: esto
  // hace que sea seguro correr esta migracion cada vez que arranca el
  // servidor, sin romper nada de lo que ya estaba funcionando.
  // Migracion segura: si la tabla "usuarios" ya existia de antes sin la
  // columna "password_hash" (por ejemplo, de una version anterior del
  // proyecto), se la agregamos ahora. Si ya existe, MySQL avisa con el
  // error "Duplicate column name" y lo ignoramos: es seguro correr esto
  // cada vez que arranca el servidor, sin borrar ningun dato existente.
  // Migracion segura: si la tabla "usuarios" tiene una columna vieja
  // llamada "password" (de una version anterior, antes de usar
  // password_hash), la eliminamos porque ya no se usa y exige un valor
  // que el codigo actual nunca envia. Si no existe, MySQL avisa con un
  // error de "columna desconocida" y lo ignoramos sin problema.
  try {
    await pool.query('ALTER TABLE usuarios DROP COLUMN password');
    console.log('Columna vieja "password" eliminada de la tabla usuarios.');
  } catch (err) {
    if (!/unknown column|check that column/i.test(err.message)) {
      console.error('Error al limpiar la tabla usuarios:', err.message);
    }
  }

  try {
    await pool.query('ALTER TABLE usuarios ADD COLUMN password_hash VARCHAR(100) NOT NULL DEFAULT \'\'');
    console.log('Columna "password_hash" agregada a la tabla usuarios.');
  } catch (err) {
    if (!/duplicate column/i.test(err.message)) {
      console.error('Error al migrar la tabla usuarios:', err.message);
    }
  }

  try {
    await pool.query('ALTER TABLE ganadores ADD COLUMN victorias INT NOT NULL DEFAULT 1');
    console.log('Columna "victorias" agregada a la tabla ganadores.');
  } catch (err) {
    if (!/duplicate column/i.test(err.message)) {
      console.error('Error al migrar la tabla ganadores:', err.message);
    }
  }
}

// ---------------- USUARIOS (login / registro) ----------------

async function crearUsuario(username, passwordHash) {
  await pool.query('INSERT INTO usuarios (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
}

async function buscarUsuarioPorNombre(username) {
  const [rows] = await pool.query('SELECT id, username, password_hash FROM usuarios WHERE username = ? LIMIT 1', [username]);
  return rows[0] || null;
}

// ---------------- ARMAS (CRUD: Crear, Leer, Actualizar, Eliminar) ----------------

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

// ---------------- EQUIPAMIENTO (relacion usuario <-> arma) ----------------

async function registrarEquipamiento(usuarioId, armaId) {
  await pool.query('INSERT INTO equipamiento (usuario_id, arma_id) VALUES (?, ?)', [usuarioId, armaId]);
}

// ---------------- GANADORES (tabla de puntajes) ----------------

// Guarda al ganador de una partida. Si ese jugador ya habia ganado antes,
// le suma los puntos y las victorias a su fila existente (se van
// acumulando); si es la primera vez que gana, crea su fila en el salon
// de la fama.
async function guardarGanador(nombre, puntuacion) {
  try {
    const [existentes] = await pool.query(
      'SELECT id, puntuacion, victorias FROM ganadores WHERE nombre = ? ORDER BY fecha DESC LIMIT 1',
      [nombre]
    );

    if (existentes.length > 0) {
      const actual = existentes[0];
      await pool.query(
        'UPDATE ganadores SET puntuacion = ?, victorias = ?, fecha = CURRENT_TIMESTAMP WHERE id = ?',
        [actual.puntuacion + puntuacion, actual.victorias + 1, actual.id]
      );
    } else {
      await pool.query('INSERT INTO ganadores (nombre, puntuacion, victorias) VALUES (?, ?, 1)', [
        nombre,
        puntuacion,
      ]);
    }
  } catch (err) {
    console.error('Error al guardar ganador:', err.message);
  }
}

// Salon de la fama: ordenado por victorias (y de segundo criterio, por
// puntos acumulados), para que arriba queden los que mas veces han ganado.
async function obtenerGanadores() {
  const [rows] = await pool.query(
    'SELECT nombre, puntuacion, victorias, fecha FROM ganadores ORDER BY victorias DESC, puntuacion DESC LIMIT 50'
  );
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
  registrarEquipamiento,
};
