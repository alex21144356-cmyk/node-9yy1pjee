require('dotenv').config();
const express = require('express');
const { initDB, guardarGanador, obtenerGanadores } = require('./db');

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: { origin: '*' },
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Lista de ganadores históricos guardados en MySQL (nombre + puntuación)
app.get('/api/ganadores', async (req, res) => {
  try {
    const ganadores = await obtenerGanadores();
    res.json(ganadores);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo consultar los ganadores' });
  }
});

// ============== CONFIGURACIÓN GENERAL ==============
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
  fusil_asalto: { name: 'Fusil de Asalto', type: 'ranged', damage: 6, knockback: 6, attackDuration: 12, bulletSpeed: 14, bulletLife: 70, bulletCount: 1 },
  escopeta: { name: 'Escopeta', type: 'ranged', damage: 7, knockback: 10, attackDuration: 32, bulletSpeed: 12, bulletLife: 24, bulletCount: 5 },
  francotirador: { name: 'Rifle Francotirador', type: 'ranged', damage: 28, knockback: 14, attackDuration: 55, bulletSpeed: 22, bulletLife: 80, bulletCount: 1 },
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
    x: 60 + Math.random() * (CANVAS_WIDTH - 120),
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
  {
    name: 'Hielo Eterno', bg: '#152530', floorColor: '#85c1e9', floorSegments: [[0, 800]],
    platforms: [{ x: 90, y: 280, width: 100, height: 16 }, { x: 610, y: 280, width: 100, height: 16 }, { x: 350, y: 340, width: 100, height: 16 }],
  },
  {
    name: 'Abismo Central', bg: '#1a1025', floorColor: '#4b3869', floorSegments: [[0, 260], [540, 800]],
    platforms: [{ x: 330, y: 300, width: 140, height: 16 }],
  },
  {
    name: 'Puentes Colgantes', bg: '#0e1a1a', floorColor: '#2e6b5e', floorSegments: [[0, 110], [690, 800]],
    platforms: [{ x: 150, y: 360, width: 90, height: 14 }, { x: 300, y: 320, width: 90, height: 14 }, { x: 450, y: 320, width: 90, height: 14 }, { x: 600, y: 360, width: 90, height: 14 }],
  },
  {
    name: 'Torre Fragmentada', bg: '#170f22', floorColor: '#5a3d7a', floorSegments: [],
    platforms: [{ x: 55, y: 380, width: 110, height: 14 }, { x: 245, y: 320, width: 110, height: 14 }, { x: 420, y: 260, width: 110, height: 14 }, { x: 590, y: 320, width: 110, height: 14 }, { x: 730, y: 380, width: 90, height: 14 }],
  },
];
let currentMapIndex = Math.floor(Math.random() * MAPS.length);
let matchActive = true;

// ============== CONEXIÓN DE JUGADORES ==============
io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

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
  io.emit('estadoJuego', empaquetarEstado());

  socket.on('input', (keys) => {
    if (players[socket.id]) players[socket.id].inputs = keys;
  });

  // El jugador escribe su nombre al entrar; se usa para guardarlo en MySQL si gana
  socket.on('setName', (nombre) => {
    if (players[socket.id] && typeof nombre === 'string') {
      const limpio = nombre.trim().slice(0, 20);
      if (limpio) players[socket.id].name = limpio;
    }
  });

  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);
    delete players[socket.id];
    io.emit('estadoJuego', empaquetarEstado());
  });
});

function empaquetarEstado() {
  return { players, weaponPickups, bullets, mapIndex: currentMapIndex, matchActive };
}

function dentroDeSegmento(x, segments) {
  return segments.some((s) => x >= s[0] && x <= s[1]);
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
    scheduleRespawn(targetId);
  }
}

// ============== COMBATE CUERPO A CUERPO ==============
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

// ============== ARMAS DE FUEGO ==============
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

// ============== GANCHO ==============
function usarGancho(attackerId, arma) {
  const p = players[attackerId];
  if (!p) return;
  p.vx = p.facing * 10;
  p.vy = -(arma.boost || 16);
}

// ============== FIN DE PARTIDA Y PODIO ==============
function terminarPartida() {
  matchActive = false;

  let ranking = Object.values(players)
    .filter((p) => p.role <= MAX_PLAYERS)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((p) => ({ role: p.role, score: p.score, color: p.color, name: p.name }));

  io.emit('finDePartida', { podium: ranking });

  // Solo se guarda el GANADOR (1er lugar) en MySQL, con su nombre real y puntuación
  if (ranking[0]) {
    guardarGanador(ranking[0].name, ranking[0].score); // no bloquea el juego (async)
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

// ============== LOOP PRINCIPAL DE FÍSICA (60 FPS) ==============
let framesDesdeUltimoPickup = 0;

setInterval(() => {
  if (!matchActive) {
    io.emit('estadoJuego', empaquetarEstado());
    return;
  }

  const map = MAPS[currentMapIndex];

  framesDesdeUltimoPickup++;
  if (framesDesdeUltimoPickup > 240 && Object.keys(weaponPickups).length < 3) {
    if (Math.random() < 0.05) {
      spawnWeaponPickup();
      framesDesdeUltimoPickup = 0;
    }
  }

  actualizarBalas();
  if (!matchActive) {
    io.emit('estadoJuego', empaquetarEstado());
    return;
  }

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

        if (!matchActive) {
          io.emit('estadoJuego', empaquetarEstado());
          return;
        }
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

  io.emit('estadoJuego', empaquetarEstado());
}, 1000 / 60);

initDB();

http.listen(3000, () => {
  console.log('Servidor de combate activo en el puerto 3000');
});
