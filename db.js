const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: {
        rejectUnauthorized: false
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function initDB() {
    try {
        const connection = await pool.getConnection();
        
        // Crear tabla de usuarios
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL
            );
        `);

        // Crear tabla de ganadores
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS ganadores (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(50) NOT NULL UNIQUE,
                puntuacion INT NOT NULL DEFAULT 0,
                victorias INT NOT NULL DEFAULT 1
            );
        `);

        // Crear tabla de armas para el CRUD
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS armas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(50) NOT NULL,
                tipo VARCHAR(30) NOT NULL,
                dano INT NOT NULL
            );
        `);

        connection.release();
        console.log("Base de datos inicializada y tablas verificadas correctamente.");
    } catch (err) {
        console.error("Error al inicializar la base de datos:", err.message);
        throw err;
    }
}

// Funciones de Usuarios
async function crearUsuario(username, passwordHash) {
    const [result] = await pool.execute(
        'INSERT INTO usuarios (username, password) VALUES (?, ?)',
        [username, passwordHash]
    );
    return result.insertId;
}

async function buscarUsuarioPorNombre(username) {
    const [rows] = await pool.execute(
        'SELECT id, username, password as password_hash FROM usuarios WHERE username = ?',
        [username]
    );
    return rows[0];
}

// Funciones de Ganadores / Salón de la Fama
async function guardarGanador(nombre, puntuacion) {
    try {
        const [rows] = await pool.execute('SELECT id, puntuacion, victorias FROM ganadores WHERE nombre = ?', [nombre]);
        if (rows.length > 0) {
            // Si ya existe, actualizamos su puntuación máxima y sumamos una victoria
            await pool.execute(
                'UPDATE ganadores SET puntuacion = GREATEST(puntuacion, ?), victorias = victorias + 1 WHERE nombre = ?',
                [puntuacion, nombre]
            );
        } else {
            await pool.execute(
                'INSERT INTO ganadores (nombre, puntuacion, victorias) VALUES (?, ?, 1)',
                [nombre, puntuacion]
            );
        }
    } catch (err) {
        console.error('Error al guardar ganador:', err.message);
    }
}

async function obtenerGanadores() {
    const [rows] = await pool.execute('SELECT nombre, puntuacion, victorias FROM ganadores ORDER BY puntuacion DESC LIMIT 10');
    return rows;
}

// Funciones CRUD de Armas
async function obtenerArmas() {
    const [rows] = await pool.execute('SELECT id, nombre, tipo, dano FROM armas');
    return rows;
}

async function crearArma(nombre, tipo, dano) {
    const [result] = await pool.execute('INSERT INTO armas (nombre, tipo, dano) VALUES (?, ?, ?)', [nombre, tipo, dano]);
    return result.insertId;
}

async function actualizarArma(id, nombre, tipo, dano) {
    await pool.execute('UPDATE armas SET nombre = ?, tipo = ?, dano = ? WHERE id = ?', [nombre, tipo, dano, id]);
}

async function eliminarArma(id) {
    await pool.execute('DELETE FROM armas WHERE id = ?', [id]);
}

async function registrarEquipamiento(usuarioId, armaId) {
    // Opcional si manejas relación usuario-arma en tu base de datos
    return true;
}

module.exports = {
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
