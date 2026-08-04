const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const http = require('http');
const path = require('path');
require('dotenv').config();

// Importamos las funciones de base de datos desde db.js
const {
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
} = require('./db');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'secreto_arena',
    resave: false,
    saveUninitialized: false
}));

// Servir archivos estáticos (HTML, CSS, JS del cliente) desde la raíz del proyecto
app.use(express.static(__dirname));

// Ruta principal para evitar el error "Cannot GET /"
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Ejemplo de ruta de registro (ajusta según la lógica que ya tengas en tu proyecto)
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: "Faltan datos" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = await crearUsuario(username, hashedPassword);
        res.status(200).json({ message: "Usuario registrado con éxito", userId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// INICIALIZACIÓN Y ARRANQUE DEL SERVIDOR
const PORT = process.env.PORT || 10000;

initDB().then(() => {
    server.listen(PORT, () => {
        console.log(`Servidor y base de datos corriendo correctamente en el puerto ${PORT}`);
    });
}).catch(err => {
    console.error("Fallo crítico al iniciar la base de datos:", err);
});
