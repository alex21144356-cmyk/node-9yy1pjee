require('dotenv').config();
const express = require('express');
const {
  initDB,
  guardarGanador,
  obtenerGanadores,
  crearUsuario,
  buscarUsuarioPorNombre,
} = require('./db');

const app = express();
const http = require('http').createServer(app);

const io = require('socket.io')(http, {
  cors: { origin: '*' }
});

app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// RUTAS API DE GANADORES Y REGISTRO (SIN SESSION)
app.get('/api/ganadores', async (req, res) => {
  try {
    const ganadores = await obtenerGanadores();
    res.json(ganadores);
  } catch (err) {
    res.status(500).json({ error: 'Error consultando ganadores' });
  }
});

// LÓGICA DE JUGADORES Y ARENA
let players = {};
const MAX_PLAYERS = 4;

// POSICIONES DENTRO DEL PISO DENTRO DEL CANVAS (Y = 385)
const ROLE_CONFIG = {
  1: { x: 150, y: 385, color: '#ff4757', facing: 1 },
  2: { x: 300, y: 385, color: '#2ed573', facing: 1 },
  3: { x: 500, y: 385, color: '#1e90ff', facing: -1 },
  4: { x: 650, y: 385, color: '#9b59b6', facing: -1 },
};

io.on('connection', (socket) => {
  let activePlayers = Object.values(players);
  let role = null;

  for (let r = 1; r <= MAX_PLAYERS; r++) {
    let ocupado = activePlayers.some((p) => p.role === r);
    if (!ocupado) { role = r; break; }
  }

  // SI LA SALA ESTÁ LLENA
  if (role === null) {
    role = 99; // Rol Espectador (No genera mono fuera del lienzo)
  }

  const cfg = ROLE_CONFIG[role] || { x: -100, y: -100, color: '#00f0ff', facing: 1 };

  players[socket.id] = {
    id: socket.id,
    role,
    x: cfg.x,
    y: cfg.y,
    vx: 0,
    vy: 0,
    health: 100,
    facing: cfg.facing,
    color: cfg.color,
    score: 0,
    name: 'Jugador',
    inputs: { left: false, right: false, up: false, attack: false }
  };

  socket.emit('init', { id: socket.id });

  socket.on('input', (keys) => {
    if (players[socket.id]) players[socket.id].inputs = keys;
  });

  socket.on('setName', (nombre) => {
    if (players[socket.id] && typeof nombre === 'string') {
      const limpio = nombre.trim().slice(0, 20);
      if (limpio) players[socket.id].name = limpio;
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
  });
});

// FÍSICAS (60 FPS)
setInterval(() => {
  for (let id in players) {
    let p = players[id];
    if (p.role > MAX_PLAYERS) continue; // Espectadores no se mueven ni estorban

    if (p.inputs.left) { p.vx = -5; p.facing = -1; }
    else if (p.inputs.right) { p.vx = 5; p.facing = 1; }
    else { p.vx = 0; }

    if (p.inputs.up && p.y >= 385) { p.vy = -12; }

    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.6; // Gravedad

    // Límites del mapa (piso y paredes)
    if (p.y >= 385) { p.y = 385; p.vy = 0; }
    if (p.x < 30) p.x = 30;
    if (p.x > 770) p.x = 770;
  }
}, 1000 / 60);

// TRANSMISIÓN A CLIENTES (20 FPS)
setInterval(() => {
  io.emit('estadoJuego', { players, mapIndex: 0 });
}, 50);

initDB();

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});
