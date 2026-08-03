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

// Optimización con compresión activa para Socket.IO
const io = require('socket.io')(http, {
  cors: { origin: '*' },
  perMessageDeflate: {
    threshold: 256
  },
  httpCompression: true
});

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'stickman_supreme_secreto_cambiar',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 }, // 30 días
  })
);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// ============== AUTENTICACIÓN (LOGIN / REGISTRO) ==============
function usuarioValido(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};

  if (!usuarioValido(username)) {
    return res
      .status(400)
      .json({ error: 'El usuario debe tener de 3 a 20 caracteres (letras, números o _)' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
  }

  try {
    const existente = await buscarUsuarioPorNombre(username);
    if (existente) {
      return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
    }

    const hash = await bcrypt.hash(password, 10);
    await crearUsuario(username, hash);

    req.session.username = username;
    res.json({ username });
  } catch (err) {
    console.error('Error en /api/register:', err.message);
    res.status(500).json({ error: 'No se pudo crear la cuenta' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!usuarioValido(username) || !password) {
    return res.status(400).json({ error: 'Usuario o contraseña inválidos' });
  }

  try {
    const usuario = await buscarUsuarioPorNombre(username);
    if (!usuario) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const coincide = await bcrypt.compare(password, usuario.password_hash);
    if (!coincide) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    req.session.username = username;
    res.json({ username });
  } catch (err) {
    console.error('Error en /api/login:', err.message);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.username) {
    res.json({ username: req.session.username });
  } else {
    res.status(401).json({ error: 'Sesión no iniciada' });
  }
});

// Endpoint de tabla de líderes desde MySQL
app.get('/api/ganadores', async (req, res) => {
  try {
    const ganadores = await obtenerGanadores();
    res.json(ganadores);
  } catch (err) {
    res.status(500).json({ error: 'Error consultando ganadores' });
  }
});

// ============== CONFIGURACIÓN DEL JUEGO ==============
let players = {};
let weaponPickups = {};
let bullets = {};
const GRAVITY = 0.6;
const FLOOR_Y = 400;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const PLAYER_RADIUS = 15;
const MAX_PLAYERS = 4;
const PUNTOS_PARA_GANAR = 10;

const ROLE_CONFIG = {
  1: { x: 100, color: '#ff4757', facing: 1 },
  2: { x: 300, color: '#2ed573', facing: 1 },
  3: { x: 500, color: '#1e90ff', facing: -1 },
  4: { x: 700, color: '#9b59b6', facing: -1 },
};

// ============== ARMAS ==============
const WEAPONS = {
  espada: { name: 'Espada', type: 'melee', range: 45, damage: 12, knockback: 16, attackDuration: 10 },
  espada_larga: { name: 'Espadón', type: 'melee', range: 60, damage: 16, knockback: 20, attackDuration: 16 },
  pistola: { name: 'Pistola', type: 'ranged', damage: 5, knockback: 5, attackDuration: 10, bulletSpeed: 16, bulletLife: 50, bulletCount: 1 },
  fusil_asalto: { name: 'Fusil Asalto', type: 'ranged', damage: 6, knockback: 6, attackDuration: 12, bulletSpeed: 14, bulletLife: 70, bulletCount: 1 },
  escopeta: { name: 'Escopeta', type: 'ranged', damage: 7, knockback: 10, attackDuration: 32, bulletSpeed: 12, bulletLife: 24, bulletCount: 5 },
  francotirador: { name: 'Francotirador', type: 'ranged', damage: 28, knockback: 14, attackDuration: 55, bulletSpeed: 22, bulletLife: 80, bulletCount: 1 },
  gancho: { name: 'Gancho', type: 'grapple', damage: 0, knockback: 0, attackDuration: 26, boost: 16 },
};
const WEAPON_KEYS = Object.keys(WEAPONS);
let pickupIdCounter = 1;
let bulletIdCounter = 1;

function armaAleatoria() {
  return WEAPON_KEYS[Math.floor(Math.random() * WEAPON_KEYS.length)];
}

function spawnWeaponPickup() {
  const id = 'pk' + pickupIdCounter++;
  weaponPickups[id] = {
    id,
    type: armaAleatoria(),
    x: Math.round(60 + Math.random() * (CANVAS_WIDTH - 120)),
    y: FLOOR_Y - 14,
  };
}

// ============== MAPAS ==============
const MAPS = [
  { name: 'Arena Clásica', bg: '#2f3542', floorColor: '#4b5563', floorSegments: [[0, 800]], platforms: [] },
  {
    name: 'Templo de Piedra', bg: '#2b2320', floorColor: '#6b4f3a', floorSegments: [[0, 800]],
    platforms: [{ x: 140, y: 300, width: 150, height: 16 }, { x: 510, y: 300, width: 150, height: 16 }],
  },
  {
    name: 'Plataformas Flotantes', bg: '#18222e', floorColor: '#34495e', floorSegments: [[0, 800]],
    platforms: [{ x: 70, y: 320, width: 120, height: 16 }, { x: 340, y: 250, width: 120, height: 16 }, { x: 610, y: 320, width: 120, height: 16 }],
  },
  { name: 'Volcán', bg: '#2e1512', floorColor: '#c0392b', floorSegments: [[0, 800]], platforms: [{ x: 250, y: 310, width: 300, height: 16 }] },
];
let currentMapIndex = Math.floor(Math.random() * MAPS.length);
let matchActive = true;
let cambiandoRonda = false;

// ============== GESTIÓN SOCKET.IO ==============
io.on('connection', (socket) => {
  let activePlayers = Object.values(players);
  let role = null;
  for (let r = 1; r <= MAX_PLAYERS; r++) {
    let ocupado = activePlayers.some((p) => p.role === r);
    if (!ocupado) { role = r; break; }
  }
  if (role === null) role = MAX_PLAYERS + 1;

  const cfg = ROLE_CONFIG[role] || { x: 400, color: '#95a5a6', facing: 1 };

  players[socket.id] = {
    id: socket.id, role, x: cfg.x, y: 200, vx: 0, vy: 0, health: 100,
    facing: cfg.facing, isAttacking: false, attackTimer: 0, color: cfg.color,
    score: 0, weapon: role <= MAX_PLAYERS ? armaAleatoria() : 'espada',
    name: 'Jugador' + role,
    inputs: { left: false, right: false, up: false, attack: false },
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

// Serialización optimizada del estado
function empaquetarEstado() {
  const optPlayers = {};
  for (let id in players) {
    const p = players[id];
    optPlayers[id] = {
      id: p.id, role: p.role, name: p.name, color: p.color,
      x: Math.round(p.x), y: Math.round(p.y), health: p.health,
      facing: p.facing, isAttacking: p.isAttacking,
      score: p.score, weapon: p.weapon
    };
  }

  const optBullets = {};
  for (let id in bullets) {
    const b = bullets[id];
    optBullets[id] = {
      id: b.id, x: Math.round(b.x), y: Math.round(b.y),
      vx: b.vx, weapon: b.weapon
    };
  }

  return { players: optPlayers, weaponPickups, bullets: optBullets, mapIndex: currentMapIndex, matchActive };
}

function dentroDeSegmento(x, segments) {
  return segments.some((s) => x >= s[0] && x <= s[1]);
}

function jugadoresActivos() {
  return Object.values(players).filter((p) => p.role <= MAX_PLAYERS);
}

function scheduleRespawn(targetId) {
  setTimeout(() => {
    if (players[targetId]) {
      const c = ROLE_CONFIG[players[targetId].role];
      players[targetId].health = 100;
      players[targetId].x = c ? c.x : 400;
      players[targetId].y = 150;
      players[targetId].vx = 0;
      players[targetId].vy = 0;
      players[targetId].weapon = 'espada';
    }
  }, 1500);
}

function iniciarNuevaRonda(survivorId) {
  if (cambiandoRonda) return;
  cambiandoRonda = true;

  const survivor = players[survivorId];
  io.emit('rondaGanada', {
    role: survivor ? survivor.role : null,
    color: survivor ? survivor.color : '#fff',
    name: survivor ? survivor.name : '',
  });

  setTimeout(() => {
    if (!matchActive) { cambiandoRonda = false; return; }

    currentMapIndex = Math.floor(Math.random() * MAPS.length);
    weaponPickups = {};
    bullets = {};

    for (let id in players) {
      let p = players[id];
      if (p.role <= MAX_PLAYERS) {
        const c = ROLE_CONFIG[p.role];
        p.health = 100;
        p.x = c.x;
        p.y = 150;
        p.vx = 0;
        p.vy = 0;
        p.weapon = armaAleatoria();
        p.isAttacking = false;
        p.attackTimer = 0;
      }
    }

    io.emit('nuevaRonda', { mapIndex: currentMapIndex });
    cambiandoRonda = false;
  }, 2500);
}

function aplicarDanio(attackerId, targetId, damage, knockbackDir, knockbackForce) {
  const attacker = players[attackerId];
  const target = players[targetId];
  if (!attacker || !target || target.health <= 0) return;

  target.health -= damage;
  target.vx = knockbackDir * knockbackForce;
  target.vy = -9;

  if (target.health <= 0) {
    target.health = 0;
    attacker.score += 1;

    if (attacker.score >= PUNTOS_PARA_GANAR) {
      terminarPartida();
      return;
    }

    const activos = jugadoresActivos();
    const vivos = activos.filter((p) => p.health > 0);
    if (activos.length >= 2 && vivos.length === 1) {
      iniciarNuevaRonda(vivos[0].id);
    } else {
      scheduleRespawn(targetId);
    }
  }
}

function verificarGolpe(attackerId) {
  let attacker = players[attackerId];
  if (!attacker) return;
  const arma = WEAPONS[attacker.weapon] || WEAPONS.espada;

  for (let targetId in players) {
    if (targetId === attackerId) continue;
    let target = players[targetId];
    if (!target || target.role > MAX_PLAYERS || target.health <= 0) continue;

    let dx = target.x - attacker.x;
    let dy = target.y - attacker.y;
    let distancia = Math.sqrt(dx * dx + dy * dy);

    let enDireccion = (attacker.facing === 1 && dx > -10) || (attacker.facing === -1 && dx < 10);

    if (distancia < arma.range + PLAYER_RADIUS + 10 && enDireccion) {
      aplicarDanio(attackerId, targetId, arma.damage, attacker.facing, arma.knockback);
      if (!matchActive) return;
    }
  }
}

function dispararArma(attackerId, arma) {
  const attacker = players[attackerId];
  if (!attacker) return;

  const n = arma.bulletCount || 1;
  for (let i = 0; i < n; i++) {
    const id = 'b' + bulletIdCounter++;
    const offsetVertical = n > 1 ? (i - (n - 1) / 2) * 7 : 0;
    bullets[id] = {
      id, x: attacker.x + 10 * attacker.facing, y: attacker.y + 4 + offsetVertical,
      vx: attacker.facing * arma.bulletSpeed, vy: (Math.random() - 0.5) * 1.5,
      life: arma.bulletLife, damage: arma.damage, knockback: arma.knockback,
      ownerId: attackerId, weapon: attacker.weapon,
    };
  }
}

function actualizarBalas() {
  for (let id in bullets) {
    let b = bullets[id];
    b.x += b.vx;
    b.y += b.vy;
    b.life--;

    if (b.life <= 0 || b.x < 0 || b.x > CANVAS_WIDTH || b.y < 0 || b.y > CANVAS_HEIGHT) {
      delete bullets[id];
      continue;
    }

    for (let targetId in players) {
      if (targetId === b.ownerId) continue;
      let target = players[targetId];
      if (!target || target.role > MAX_PLAYERS || target.health <= 0) continue;

      let dx = target.x - b.x;
      let dy = target.y - b.y;
      if (Math.sqrt(dx * dx + dy * dy) < 18) {
        const dir = b.vx >= 0 ? 1 : -1;
        aplicarDanio(b.ownerId, targetId, b.damage, dir, b.knockback);
        delete bullets[id];
        break;
      }
    }
  }
}

function usarGancho(attackerId, arma) {
  const p = players[attackerId];
  if (!p) return;
  p.vx = p.facing * 10;
  p.vy = -(arma.boost || 16);
}

function terminarPartida() {
  matchActive = false;

  let ranking = Object.values(players)
    .filter((p) => p.role <= MAX_PLAYERS)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((p) => ({ role: p.role, score: p.score, color: p.color, name: p.name }));

  io.emit('finDePartida', { podium: ranking });

  if (ranking[0]) {
    guardarGanador(ranking[0].name, ranking[0].score);
  }

  setTimeout(() => {
    currentMapIndex = Math.floor(Math.random() * MAPS.length);
    weaponPickups = {};
    bullets = {};

    for (let id in players) {
      let p = players[id];
      if (p.role <= MAX_PLAYERS) {
        const c = ROLE_CONFIG[p.role];
        p.health = 100;
        p.score = 0;
        p.x = c.x;
        p.y = 150;
        p.vx = 0;
        p.vy = 0;
        p.weapon = armaAleatoria();
        p.isAttacking = false;
        p.attackTimer = 0;
      }
    }

    matchActive = true;
    io.emit('nuevaPartida', { mapIndex: currentMapIndex });
  }, 8000);
}

// Bucle físico (60 FPS)
let framesDesdeUltimoPickup = 0;

setInterval(() => {
  if (!matchActive) return;

  const map = MAPS[currentMapIndex];

  framesDesdeUltimoPickup++;
  if (framesDesdeUltimoPickup > 240 && Object.keys(weaponPickups).length < 3) {
    if (Math.random() < 0.05) {
      spawnWeaponPickup();
      framesDesdeUltimoPickup = 0;
    }
  }

  actualizarBalas();
  if (!matchActive) return;

  for (let id in players) {
    let p = players[id];
    if (p.role > MAX_PLAYERS) continue;

    if (p.health > 0) {
      if (p.inputs.left) { p.vx = -5.5; p.facing = -1; }
      else if (p.inputs.right) { p.vx = 5.5; p.facing = 1; }
      else if (p.y >= FLOOR_Y - PLAYER_RADIUS) {
        p.vx *= 0.65;
        if (Math.abs(p.vx) < 0.2) p.vx = 0;
      }

      if (p.inputs.up && (p.y >= FLOOR_Y - PLAYER_RADIUS || p.enPlataforma)) {
        p.vy = -12.5;
      }

      if (p.inputs.attack && !p.isAttacking && p.attackTimer === 0) {
        const arma = WEAPONS[p.weapon] || WEAPONS.espada;
        p.isAttacking = true;
        p.attackTimer = arma.attackDuration;

        if (arma.type === 'melee') verificarGolpe(id);
        else if (arma.type === 'ranged') dispararArma(id, arma);
        else if (arma.type === 'grapple') usarGancho(id, arma);

        if (!matchActive) return;
      }
    }

    p.y += p.vy;
    p.vy += GRAVITY;
    p.x += p.vx;
    if (p.y < FLOOR_Y - PLAYER_RADIUS) p.vx *= 0.98;

    p.enPlataforma = false;
    for (let plat of map.platforms) {
      const dentroX = p.x + PLAYER_RADIUS * 0.5 > plat.x && p.x - PLAYER_RADIUS * 0.5 < plat.x + plat.width;
      const piesY = p.y + PLAYER_RADIUS;
      if (dentroX && p.vy >= 0 && piesY >= plat.y && piesY <= plat.y + Math.max(p.vy, 8)) {
        p.y = plat.y - PLAYER_RADIUS;
        p.vy = 0;
        p.enPlataforma = true;
      }
    }

    const enSueloValido = dentroDeSegmento(p.x, map.floorSegments);
    if (enSueloValido && p.y >= FLOOR_Y - PLAYER_RADIUS) {
      p.y = FLOOR_Y - PLAYER_RADIUS;
      p.vy = 0;
    }

    if (p.health > 0 && p.y > CANVAS_HEIGHT + 80) {
      p.health = 0;
      scheduleRespawn(id);
    }

    if (p.x < PLAYER_RADIUS) { p.x = PLAYER_RADIUS; p.vx *= -0.5; }
    if (p.x > CANVAS_WIDTH - PLAYER_RADIUS) { p.x = CANVAS_WIDTH - PLAYER_RADIUS; p.vx *= -0.5; }

    if (p.attackTimer > 0) {
      p.attackTimer--;
      if (p.attackTimer === 0) p.isAttacking = false;
    }

    if (p.health > 0) {
      for (let pkId in weaponPickups) {
        let pk = weaponPickups[pkId];
        let dx = p.x - pk.x;
        let dy = p.y + 12 - pk.y;
        if (Math.sqrt(dx * dx + dy * dy) < 32) {
          p.weapon = pk.type;
          delete weaponPickups[pkId];
        }
      }
    }
  }
}, 1000 / 60);

// Emisión periódica de estado de red (20 FPS)
setInterval(() => {
  if (Object.keys(players).length > 0) {
    io.emit('estadoJuego', empaquetarEstado());
  }
}, 50);

initDB();

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});
