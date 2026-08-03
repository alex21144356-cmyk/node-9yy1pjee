const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('.')); // Servir tu index.html

let jugadores = {};

io.on('connection', (socket) => {
  // Cuando un jugador se une mediante el enlace
  socket.on('unirse_sala', (data) => {
    const totalCount = Object.keys(jugadores).length;
    if (totalCount < 4) {
      // Posiciones de inicio distribuidas en la pantalla
      const posX = 150 + totalCount * 250;
      jugadores[socket.id] = {
        nombre: data.nombre || `P${totalCount + 1}`,
        x: posX,
        hp: 100,
        atacando: false
      };
      io.emit('actualizar_lobby', jugadores);
    }
  });

  socket.on('iniciar_partida', () => {
    io.emit('empezar_juego');
  });

  socket.on('mover_jugador', (teclas) => {
    const p = jugadores[socket.id];
    if (!p) return;

    if (teclas.left) p.x -= 6;
    if (teclas.right) p.x += 6;
    p.atacando = teclas.attack;

    io.emit('estado_arena', jugadores);
  });

  socket.on('disconnect', () => {
    delete jugadores[socket.id];
    io.emit('actualizar_lobby', jugadores);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor de 4 Jugadores activo en puerto ${PORT}`));
