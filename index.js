require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const http = require('http');

// IMPORTANTE: Importamos las funciones desde db.js
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

// INICIALIZACIÓN Y ARRANQUE DEL SERVIDOR
const PORT = process.env.PORT || 10000;

initDB().then(() => {
    server.listen(PORT, () => {
        console.log(`Servidor y base de datos corriendo correctamente en el puerto ${PORT}`);
    });
}).catch(err => {
    console.error("Fallo crítico al iniciar la base de datos:", err);
});
