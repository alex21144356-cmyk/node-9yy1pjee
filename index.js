const express = require('express');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
app.use(express.json());

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function initDB() {
    const connection = await pool.getConnection();
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL
        );
    `);
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS ganadores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(50) NOT NULL UNIQUE,
            puntuacion INT NOT NULL DEFAULT 0,
            victorias INT NOT NULL DEFAULT 1
        );
    `);
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS armas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(50) NOT NULL,
            tipo VARCHAR(30) NOT NULL,
            dano INT NOT NULL
        );
    `);
    connection.release();
    console.log("Tablas verificadas y listas en Aiven.");
}

// Ejemplo de ruta que usas
app.post('/api/register', async (req, res) => {
    try {
        // Tu lógica de registro aquí...
        res.status(200).json({ message: "Usuario registrado" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Inicializar BD y levantar servidor para que Render no lo cierre
const PORT = process.env.PORT || 10000;
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en puerto ${PORT}`);
    });
}).catch(err => {
    console.error("Error al iniciar la base de datos:", err);
});
