require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
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
  cors: { origin: '*' },
  perMessageDeflate: { threshold: 256 },
  httpCompression: true
});

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'stickman_supreme_secreto_cambiar',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 },
  })
);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// RUTAS AUTH
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });

  try {
    const existente = await buscarUsuarioPorNombre(username);
    if (existente) return res.status(409).json({ error: 'El usuario ya existe' });

    const hash = await bcrypt.hash(password, 10);
    await crearUsuario(username, hash);
    req.session.username = username;
    res.json({ username });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const usuario = await buscarUsuarioPorNombre(username);
    if (!usuario) return res.status(401).json({ error: 'Credenciales inválidas' });

    const coincide = await bcrypt.compare(password, usuario.password_hash);
    if (!coincide) return res.status(401).json({ error: 'Credenciales inválidas' });

    req.session.username = username;
    res.json({ username });
  } catch (err) {
    res.status(500).json({ error: 'Error en inicio de sesión' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.username) res.json({ username: req.session.username });
  else res.status(401).json({ error: 'No autenticado' });
});

app.get('/api/ganadores', async (req, res) => {
  try {
    const ganadores = await obtenerGanadores();
    res.json(ganadores);
  } catch (err) {
    res.status(500).json({ error: 'Error consultando ganadores' });
  }
});

// CONFIGURACIÓN DE ARENA Y SOCKETS
let players = {};
const MAX_PLAYERS = 4;
const ROLE_CONFIG = {
  1: { x: 150, y: 300, color: '#ff4757', facing: 1 },
  2: { x: 350, y: 300, color: '#2ed573', facing: 1 },
  3: { x: 500, y: 300, color: '#1e90ff', facing: -1 },
  4: { x: 650, y: 300, color: '#9b59b6', facing: -1 },
};

io.on('connection', (socket) => {
  let activePlayers = Object.values(players);
  let role = null;

  for (let r = 1; r <= MAX_PLAYERS; r++) {
    let ocupado = activePlayers.some((p) => p.role === r);
    if (!ocupado) { role = r; break; }
  }

  // Si no hay espacio, entra en rol espectador (> 4)
  if (role === null) role = MAX_PLAYERS + 1;

  const cfg = ROLE_CONFIG[role] || { x: 400, y: 300, color: '#95a5a6', facing: 1 };

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
    weapon: 'espada',
    name: 'Jugador' + role,
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

// FISICA Y LOOP (60 FPS)
setInterval(() => {
  for (let id in players) {
    let p = players[id];
    if (p.role > MAX_PLAYERS) continue; // Salta espectadores

    if (p.inputs.left) { p.vx = -5; p.facing = -1; }
    else if (p.inputs.right) { p.vx = 5; p.facing = 1; }
    else { p.vx = 0; }

    if (p.inputs.up && p.y >= 385) { p.vy = -12; }

    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.6; // Gravedad

    if (p.y >= 385) { p.y = 385; p.vy = 0; }
    if (p.x < 20) p.x = 20;
    if (p.x > 780) p.x = 780;
  }
}, 1000 / 60);

// ACTUALIZACIÓN DE ESTADO A CLIENTES (20 FPS)
setInterval(() => {
  io.emit('estadoJuego', { players, mapIndex: 0 });
}, 50);

initDB();

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});
