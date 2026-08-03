require('dotenv').config();
const express = require('express');
const {
  initDB,
  crearUsuario,
  buscarUsuarioPorNombre,
  obtenerGanadores
} = require('./db');

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: '*' } });

app.use(express.json());

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

// API RUTAS
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const ex = await buscarUsuarioPorNombre(username);
    if (ex) return res.status(409).json({ error: 'El usuario ya existe' });
    await crearUsuario(username, password);
    res.json({ username });
  } catch (e) {
    res.status(500).json({ error: 'Error al registrar' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const u = await buscarUsuarioPorNombre(username);
    if (!u || u.password_hash !== password) return res.status(401).json({ error: 'Credenciales inválidas' });
    res.json({ username });
  } catch (e) {
    res.status(500).json({ error: 'Error en inicio de sesión' });
  }
});

// CONFIGURACIÓN DE ARMAS
const ARMAS = {
  'Fusil': { dao: 18, cooldown: 250, velocidad: 14, tipo: 'distancia', color: '#ffeb3b' },
  'Subfusil': { dao: 9, cooldown: 110, velocidad: 16, tipo: 'distancia', color: '#ff9800' },
  'Espada': { dao: 35, cooldown: 400, alcance: 45, tipo: 'mele', color: '#ffffff' },
  'Escopeta': { dao: 12, cooldown: 650, velocidad: 12, tipo: 'escopeta', color: '#e91e63' },
  'Gancho': { dao: 15, cooldown: 500, velocidad: 18, tipo: 'distancia', color: '#00e676' },
  'Francotirador': { dao: 60, cooldown: 1000, velocidad: 24, tipo: 'distancia', color: '#00e5ff' }
};

const NOMBRES_ARMAS = Object.keys(ARMAS);

// MAPAS (2 con vacío)
const MAPAS = [
  { nombre: 'Arena Clásica', tieneVacio: false, plataformas: [{ x: 0, y: 385, w: 800, h: 65 }] },
  { nombre: 'Islas Flotantes (Abismo)', tieneVacio: true, plataformas: [{ x: 50, y: 350, w: 200, h: 20 }, { x: 300, y: 280, w: 200, h: 20 }, { x: 550, y: 350, w: 200, h: 20 }] },
  { nombre: 'La Grieta (Abismo)', tieneVacio: true, plataformas: [{ x: 0, y: 385, w: 320, h: 65 }, { x: 480, y: 385, w: 320, h: 65 }] },
  { nombre: 'Torres Duales', tieneVacio: false, plataformas: [{ x: 0, y: 385, w: 800, h: 65 }, { x: 100, y: 270, w: 180, h: 15 }, { x: 520, y: 270, w: 180, h: 15 }] },
  { nombre: 'Búnker Multinivel', tieneVacio: false, plataformas: [{ x: 0, y: 385, w: 800, h: 65 }, { x: 200, y: 300, w: 400, h: 15 }, { x: 100, y: 200, w: 200, h: 15 }, { x: 500, y: 200, w: 200, h: 15 }] }
];

let mapaActualIndex = 0;
let itemsArmas = [];
let proyectiles = [];
let efectosAtaque = []; // Cortes de espada, destellos
let players = {};
const MAX_PLAYERS = 4;

const ROLE_CONFIG = {
  1: { x: 150, y: 300, color: '#ff4757', facing: 1 },
  2: { x: 300, y: 300, color: '#2ed573', facing: 1 },
  3: { x: 500, y: 300, color: '#1e90ff', facing: -1 },
  4: { x: 650, y: 300, color: '#9b59b6', facing: -1 },
};

// GENERAR BOLITAS DE ARMAS CADA 5s
setInterval(() => {
  if (itemsArmas.length < 5) {
    const mapa = MAPAS[mapaActualIndex];
    const plat = mapa.plataformas[Math.floor(Math.random() * mapa.plataformas.length)];
    const nombre = NOMBRES_ARMAS[Math.floor(Math.random() * NOMBRES_ARMAS.length)];
    itemsArmas.push({
      id: Math.random(),
      x: plat.x + 20 + Math.random() * (plat.w - 40),
      y: plat.y - 18,
      arma: nombre,
      color: ARMAS[nombre].color
    });
  }
}, 5000);

io.on('connection', (socket) => {
  let active = Object.values(players);
  let role = null;
  for (let r = 1; r <= MAX_PLAYERS; r++) {
    if (!active.some(p => p.role === r)) { role = r; break; }
  }
  if (!role) role = 99;

  const cfg = ROLE_CONFIG[role] || { x: 400, y: 100, color: '#00f0ff', facing: 1 };

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
    name: `P${role}`,
    arma: 'Espada',
    lastAttack: 0,
    inputs: { left: false, right: false, up: false, attack: false }
  };

  socket.emit('init', { id: socket.id, role });

  socket.on('input', keys => {
    if (players[socket.id]) players[socket.id].inputs = keys;
  });

  socket.on('setName', name => {
    if (players[socket.id] && name) players[socket.id].name = name.slice(0, 15);
  });

  socket.on('disconnect', () => delete players[socket.id]);
});

function respawn(p) {
  const cfg = ROLE_CONFIG[p.role] || { x: 400, y: 100 };
  p.x = cfg.x;
  p.y = 100;
  p.vy = 0;
  p.health = 100;
}

// FÍSICAS Y DISPAROS (60 FPS)
setInterval(() => {
  const mapa = MAPAS[mapaActualIndex];
  const ahora = Date.now();

  for (let id in players) {
    let p = players[id];
    if (p.role > MAX_PLAYERS) continue;

    // Movimiento
    if (p.inputs.left) { p.vx = -4.5; p.facing = -1; }
    else if (p.inputs.right) { p.vx = 4.5; p.facing = 1; }
    else { p.vx = 0; }

    p.vy += 0.55; // Gravedad
    p.x += p.vx;
    p.y += p.vy;

    // Colisión plataformas
    let enSuelo = false;
    mapa.plataformas.forEach(plat => {
      if (p.x >= plat.x - 12 && p.x <= plat.x + plat.w + 12 && p.y >= plat.y - 35 && p.y <= plat.y + 10 && p.vy >= 0) {
        p.y = plat.y - 35;
        p.vy = 0;
        enSuelo = true;
      }
    });

    if (p.inputs.up && enSuelo) p.vy = -11.5;

    // Paredes
    if (p.x < 15) p.x = 15;
    if (p.x > 785) p.x = 785;

    // Caída al vacío
    if (p.y > 480) {
      respawn(p);
    }

    // Recoger armas
    for (let i = itemsArmas.length - 1; i >= 0; i--) {
      let item = itemsArmas[i];
      if (Math.hypot(p.x - item.x, p.y - item.y) < 22) {
        p.arma = item.arma;
        itemsArmas.splice(i, 1);
      }
    }

    // DISPARAR / ATACAR (ESPACIO)
    if (p.inputs.attack && ahora - p.lastAttack > (ARMAS[p.arma]?.cooldown || 300)) {
      p.lastAttack = ahora;
      const configArma = ARMAS[p.arma];

      if (configArma.tipo === 'mele') {
        // Ataque cuerpo a cuerpo (Espada)
        efectosAtaque.push({
          x: p.x + (p.facing * 20),
          y: p.y - 15,
          facing: p.facing,
          tipo: 'corte',
          duracion: 8
        });

        // Detectar golpe a otros jugadores
        for (let targetId in players) {
          if (targetId === id) continue;
          let target = players[targetId];
          let dist = Math.hypot((p.x + p.facing * 25) - target.x, (p.y - 15) - target.y);
          if (dist < 40) {
            target.health -= configArma.dao;
            if (target.health <= 0) {
              p.score += 1;
              respawn(target);
            }
          }
        }
      } else if (configArma.tipo === 'escopeta') {
        // Escopeta (3 perdigones)
        [-0.15, 0, 0.15].forEach(angulo => {
          proyectiles.push({
            x: p.x + (p.facing * 20),
            y: p.y - 15,
            vx: Math.cos(angulo) * configArma.velocidad * p.facing,
            vy: Math.sin(angulo) * configArma.velocidad,
            dao: configArma.dao,
            owner: id,
            color: configArma.color,
            tipo: 'escopeta',
            vida: 25
          });
        });
      } else {
        // Fusil, Subfusil, Francotirador, Gancho
        proyectiles.push({
          x: p.x + (p.facing * 20),
          y: p.y - 15,
          vx: configArma.velocidad * p.facing,
          vy: 0,
          dao: configArma.dao,
          owner: id,
          color: configArma.color,
          tipo: p.arma.toLowerCase(),
          vida: 60
        });
      }
    }
  }

  // MOVER Y COLISIONAR PROYECTILES
  for (let i = proyectiles.length - 1; i >= 0; i--) {
    let proj = proyectiles[i];
    proj.x += proj.vx;
    proj.y += proj.vy;
    proj.vida--;

    let impacto = false;

    // Impacto con jugadores
    for (let id in players) {
      let target = players[id];
      if (id !== proj.owner && Math.hypot(proj.x - target.x, proj.y - (target.y - 15)) < 20) {
        target.health -= proj.dao;
        if (target.health <= 0) {
          if (players[proj.owner]) players[proj.owner].score += 1;
          respawn(target);
        }
        impacto = true;
        break;
      }
    }

    // Paredes / Limite
    if (impacto || proj.vida <= 0 || proj.x < 0 || proj.x > 800) {
      proyectiles.splice(i, 1);
    }
  }

  // Limpiar efectos de ataque
  for (let i = efectosAtaque.length - 1; i >= 0; i--) {
    efectosAtaque[i].duracion--;
    if (efectosAtaque[i].duracion <= 0) efectosAtaque.splice(i, 1);
  }

}, 1000 / 60);

// EMITIR ESTADO (20 FPS)
setInterval(() => {
  io.emit('estadoJuego', {
    players,
    mapa: MAPAS[mapaActualIndex],
    itemsArmas,
    proyectiles,
    efectosAtaque
  });
}, 50);

initDB();
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Servidor listo en puerto ${PORT}`));
