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

// --- RUTAS DE AUTENTICACIÓN Y API ---
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const existente = await buscarUsuarioPorNombre(username);
    if (existente) return res.status(409).json({ error: 'El usuario ya existe' });
    
    await crearUsuario(username, password);
    res.json({ username });
  } catch (err) {
    console.error("Error al registrar:", err);
    res.status(500).json({ error: 'Error al registrar' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const usuario = await buscarUsuarioPorNombre(username);
    if (!usuario) return res.status(401).json({ error: 'Credenciales inválidas' });
    
    if (usuario.password_hash !== password) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    res.json({ username });
  } catch (err) {
    res.status(500).json({ error: 'Error en inicio de sesión' });
  }
});

app.get('/api/ganadores', async (req, res) => {
  try {
    const ganadores = await obtenerGanadores();
    res.json(ganadores);
  } catch (err) {
    res.status(500).json({ error: 'Error consultando ganadores' });
  }
});

// --- CONFIGURACIÓN DE ARMAS Y MAPAS ---
const ARMAS_DISPONIBLES = [
  { nombre: 'Fusil', color: '#ffeb3b', dao: 15 },
  { nombre: 'Subfusil', color: '#ff9800', dao: 8 },
  { nombre: 'Espada', color: '#ffffff', dao: 25 },
  { nombre: 'Escopeta', color: '#e91e63', dao: 30 },
  { nombre: 'Gancho', color: '#00e676', dao: 5 },
  { nombre: 'Francotirador', color: '#00e5ff', dao: 50 }
];

// 5 MAPAS (2 de ellos con abismo/caída al vacío)
const MAPAS = [
  {
    nombre: 'Arena Clásica',
    tieneVacio: false,
    plataformas: [{ x: 0, y: 385, w: 800, h: 65 }]
  },
  {
    nombre: 'Islas Flotantes (¡Peligro de Caída!)',
    tieneVacio: true,
    plataformas: [
      { x: 50, y: 350, w: 200, h: 20 },
      { x: 300, y: 280, w: 200, h: 20 },
      { x: 550, y: 350, w: 200, h: 20 }
    ]
  },
  {
    nombre: 'La Grieta (¡Abismo Central!)',
    tieneVacio: true,
    plataformas: [
      { x: 0, y: 385, w: 320, h: 65 },
      { x: 480, y: 385, w: 320, h: 65 }
    ]
  },
  {
    nombre: 'Torres Duales',
    tieneVacio: false,
    plataformas: [
      { x: 0, y: 385, w: 800, h: 65 },
      { x: 100, y: 270, w: 180, h: 15 },
      { x: 520, y: 270, w: 180, h: 15 }
    ]
  },
  {
    nombre: 'Búnker Multinivel',
    tieneVacio: false,
    plataformas: [
      { x: 0, y: 385, w: 800, h: 65 },
      { x: 200, y: 300, w: 400, h: 15 },
      { x: 100, y: 200, w: 200, h: 15 },
      { x: 500, y: 200, w: 200, h: 15 }
    ]
  }
];

let mapaActualIndex = 0;
let itemsArmas = []; // Bolitas de armas en el mapa
let players = {};
const MAX_PLAYERS = 4;

const ROLE_CONFIG = {
  1: { x: 150, y: 300, color: '#ff4757', facing: 1 },
  2: { x: 300, y: 300, color: '#2ed573', facing: 1 },
  3: { x: 500, y: 300, color: '#1e90ff', facing: -1 },
  4: { x: 650, y: 300, color: '#9b59b6', facing: -1 },
};

// GENERAR BOLITAS DE ARMAS CADA 5 SEGUNDOS
setInterval(() => {
  if (itemsArmas.length < 5) {
    const mapa = MAPAS[mapaActualIndex];
    const plat = mapa.plataformas[Math.floor(Math.random() * mapa.plataformas.length)];
    const armaRandom = ARMAS_DISPONIBLES[Math.floor(Math.random() * ARMAS_DISPONIBLES.length)];

    itemsArmas.push({
      id: Date.now() + Math.random(),
      x: plat.x + 20 + Math.random() * (plat.w - 40),
      y: plat.y - 15,
      arma: armaRandom.nombre,
      color: armaRandom.color
    });
  }
}, 5000);

io.on('connection', (socket) => {
  let activePlayers = Object.values(players);
  let role = null;

  for (let r = 1; r <= MAX_PLAYERS; r++) {
    let ocupado = activePlayers.some((p) => p.role === r);
    if (!ocupado) { role = r; break; }
  }

  if (role === null) role = 99; // Espectador

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
    arma: 'Espada',
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

  socket.on('cambiarMapa', (index) => {
    if (index >= 0 && index < MAPAS.length) {
      mapaActualIndex = index;
      itemsArmas = [];
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
  });
});

// FÍSICAS (60 FPS)
setInterval(() => {
  const mapa = MAPAS[mapaActualIndex];

  for (let id in players) {
    let p = players[id];
    if (p.role > MAX_PLAYERS) continue;

    if (p.inputs.left) { p.vx = -5; p.facing = -1; }
    else if (p.inputs.right) { p.vx = 5; p.facing = 1; }
    else { p.vx = 0; }

    p.vy += 0.6; // Gravedad
    p.x += p.vx;
    p.y += p.vy;

    // Detección de Colisión con Plataformas
    let enSuelo = false;
    mapa.plataformas.forEach(plat => {
      if (
        p.x >= plat.x - 15 &&
        p.x <= plat.x + plat.w + 15 &&
        p.y >= plat.y - 35 && p.y <= plat.y + 10 &&
        p.vy >= 0
      ) {
        p.y = plat.y - 35;
        p.vy = 0;
        enSuelo = true;
      }
    });

    if (p.inputs.up && enSuelo) {
      p.vy = -12; // Salto
    }

    // Límite de Paredes Laterales
    if (p.x < 15) p.x = 15;
    if (p.x > 785) p.x = 785;

    // CAÍDA AL VACÍO (Muerte y Respawn)
    if (p.y > 480) {
      const cfg = ROLE_CONFIG[p.role] || { x: 400, y: 100 };
      p.x = cfg.x;
      p.y = 100;
      p.vy = 0;
      p.health = Math.max(0, p.health - 25); // Pierde 25 de vida al caer
    }

    // RECOGIDA DE ARMAS (Colisión con Bolitas)
    for (let i = itemsArmas.length - 1; i >= 0; i--) {
      let item = itemsArmas[i];
      let dist = Math.hypot(p.x - item.x, p.y - item.y);
      if (dist < 25) {
        p.arma = item.arma; // Equipa el arma
        itemsArmas.splice(i, 1); // Desaparece la bolita
      }
    }
  }
}, 1000 / 60);

// TRANSMISIÓN A CLIENTES (20 FPS)
setInterval(() => {
  io.emit('estadoJuego', {
    players,
    mapa: MAPAS[mapaActualIndex],
    mapaIndex: mapaActualIndex,
    itemsArmas
  });
}, 50);

initDB();

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});
