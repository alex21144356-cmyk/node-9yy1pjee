const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: { origin: '*' },
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// ============== CONFIGURACIÓN GENERAL ==============
let players = {};
let weaponPickups = {}; // { id: { id, x, y, type } }
const GRAVITY = 0.6;
const FLOOR_Y = 400;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const PLAYER_RADIUS = 15;
const MAX_PLAYERS = 4;
const PUNTOS_PARA_GANAR = 10;

// Configuración de cada uno de los 4 roles: posición inicial, color y dirección
const ROLE_CONFIG = {
  1: { x: 100, color: '#ff4757', facing: 1 },
  2: { x: 300, color: '#2ed573', facing: 1 },
  3: { x: 500, color: '#1e90ff', facing: -1 },
  4: { x: 700, color: '#9b59b6', facing: -1 },
};

// ============== ARMAS ==============
const WEAPONS = {
  espada: { name: 'Espada', range: 45, damage: 12, knockback: 16, attackDuration: 10 },
  lanza: { name: 'Lanza', range: 65, damage: 8, knockback: 10, attackDuration: 14 },
  hacha: { name: 'Hacha', range: 35, damage: 20, knockback: 22, attackDuration: 18 },
  daga: { name: 'Daga', range: 25, damage: 6, knockback: 6, attackDuration: 6 },
  martillo: { name: 'Martillo', range: 40, damage: 15, knockback: 30, attackDuration: 22 },
  fusil: { name: 'Fusil', range: 120, damage: 14, knockback: 18, attackDuration: 12 }, // <--- NUEVA ARMA AÑADIDA
};
const WEAPON_KEYS = Object.keys(WEAPONS);
let pickupIdCounter = 1;

function spawnWeaponPickup() {
  const id = 'pk' + pickupIdCounter++;
  const type = WEAPON_KEYS[Math.floor(Math.random() * WEAPON_KEYS.length)];
  weaponPickups[id] = {
    id,
    type,
    x: 60 + Math.random() * (CANVAS_WIDTH - 120),
    y: FLOOR_Y - 14,
  };
}

// ============== MAPAS ==============
const MAPS = [
  {
    name: 'Arena Clásica',
    bg: '#2f3542',
    floorColor: '#4b5563',
    platforms: [],
  },
  {
    name: 'Templo de Piedra',
    bg: '#2b2320',
    floorColor: '#6b4f3a',
    platforms: [
      { x: 140, y: 300, width: 150, height: 16 },
      { x: 510, y: 300, width: 150, height: 16 },
    ],
  },
  {
    name: 'Plataformas Flotantes',
    bg: '#18222e',
    floorColor: '#34495e',
    platforms: [
      { x: 70, y: 320, width: 120, height: 16 },
      { x: 340, y: 250, width: 120, height: 16 },
      { x: 610, y: 320, width: 120, height: 16 },
    ],
  },
  {
    name: 'Volcán',
    bg: '#2e1512',
    floorColor: '#c0392b',
    platforms: [{ x: 250, y: 310, width: 300, height: 16 }],
  },
  {
    name: 'Hielo Eterno',
    bg: '#152530',
    floorColor: '#85c1e9',
    platforms: [
      { x: 90, y: 280, width: 100, height: 16 },
      { x: 610, y: 280, width: 100, height: 16 },
      { x: 350, y: 340, width: 100, height: 16 },
    ],
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
    if (!ocupado) {
      role = r;
      break;
    }
  }
  if (role === null) role = MAX_PLAYERS + 1;

  const cfg = ROLE_CONFIG[role] || { x: 400, color: '#95a5a6', facing: 1 };

  players[socket.id] = {
    id: socket.id,
    role: role,
    x: cfg.x,
    y: 200,
    vx: 0,
    vy: 0,
    health: 100,
    facing: cfg.facing,
    isAttacking: false,
    attackTimer: 0,
    color: cfg.color,
    score: 0,
    weapon: 'espada',
    inputs: { left: false, right: false, up: false, attack: false },
  };

  socket.emit('init', { id: socket.id });
  io.emit('estadoJuego', empaquetarEstado());

  socket.on('input', (keys) => {
    if (players[socket.id]) {
      players[socket.id].inputs = keys;
    }
  });

  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);
    delete players[socket.id];
    io.emit('estadoJuego', empaquetarEstado());
  });
});

function empaquetarEstado() {
  return {
    players,
    weaponPickups,
    mapIndex: currentMapIndex,
    matchActive,
  };
}

// ============== COMBATE ==============
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

    let enDireccion =
      (attacker.facing === 1 && dx > -10) ||
      (attacker.facing === -1 && dx < 10);

    if (distancia < arma.range + PLAYER_RADIUS + 10 && enDireccion) {
      target.health -= arma.damage;

      target.vx = attacker.facing * arma.knockback;
      target.vy = -9;

      if (target.health <= 0) {
        target.health = 0;
        attacker.score += 1;

        if (attacker.score >= PUNTOS_PARA_GANAR) {
          terminarPartida();
          return;
        }

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
    }
  }
}

// ============== FIN DE PARTIDA Y PODIO ==============
function terminarPartida() {
  matchActive = false;

  let ranking = Object.values(players)
    .filter((p) => p.role <= MAX_PLAYERS)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((p) => ({ role: p.role, score: p.score, color: p.color }));

  io.emit('finDePartida', { podium: ranking });

  setTimeout(() => {
    currentMapIndex = Math.floor(Math.random() * MAPS.length);
    weaponPickups = {};

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
        p.weapon = 'espada';
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

  // Generar armas aleatorias en el mapa cada cierto tiempo
  framesDesdeUltimoPickup++;
  if (framesDesdeUltimoPickup > 240 && Object.keys(weaponPickups).length < 3) {
    if (Math.random() < 0.05) {
      spawnWeaponPickup();
      framesDesdeUltimoPickup = 0;
    }
  }

  for (let id in players) {
    let p = players[id];
    if (p.role > MAX_PLAYERS) continue;

    if (p.health > 0) {
      if (p.inputs.left) {
        p.vx = -5.5;
        p.facing = -1;
      } else if (p.inputs.right) {
        p.vx = 5.5;
        p.facing = 1;
      } else {
        if (p.y >= FLOOR_Y - PLAYER_RADIUS) {
          p.vx *= 0.65;
          if (Math.abs(p.vx) < 0.2) p.vx = 0;
        }
      }

      if (p.inputs.up && (p.y >= FLOOR_Y - PLAYER_RADIUS || p.enPlataforma)) {
        p.vy = -12.5;
      }

      if (p.inputs.attack && !p.isAttacking && p.attackTimer === 0) {
        const arma = WEAPONS[p.weapon] || WEAPONS.espada;
        p.isAttacking = true;
        p.attackTimer = arma.attackDuration;
        verificarGolpe(id);
        if (!matchActive) continue; // la partida pudo terminar en este golpe
      }
    }

    p.y += p.vy;
    p.vy += GRAVITY;
    p.x += p.vx;
    if (p.y < FLOOR_Y - PLAYER_RADIUS) {
      p.vx *= 0.98;
    }

    // Colisión con plataformas flotantes del mapa actual
    p.enPlataforma = false;
    for (let plat of map.platforms) {
      const dentroX =
        p.x + PLAYER_RADIUS * 0.5 > plat.x &&
        p.x - PLAYER_RADIUS * 0.5 < plat.x + plat.width;
      const piesY = p.y + PLAYER_RADIUS;
      if (
        dentroX &&
        p.vy >= 0 &&
        piesY >= plat.y &&
        piesY <= plat.y + Math.max(p.vy, 8)
      ) {
        p.y = plat.y - PLAYER_RADIUS;
        p.vy = 0;
        p.enPlataforma = true;
      }
    }

    // Colisión con el suelo principal
    if (p.y >= FLOOR_Y - PLAYER_RADIUS) {
      p.y = FLOOR_Y - PLAYER_RADIUS;
      p.vy = 0;
    }

    // Límites de la arena
    if (p.x < PLAYER_RADIUS) {
      p.x = PLAYER_RADIUS;
      p.vx *= -0.5;
    }
    if (p.x > CANVAS_WIDTH - PLAYER_RADIUS) {
      p.x = CANVAS_WIDTH - PLAYER_RADIUS;
      p.vx *= -0.5;
    }

    if (p.attackTimer > 0) {
      p.attackTimer--;
      if (p.attackTimer === 0) p.isAttacking = false;
    }

    // Recoger armas del suelo
    if (p.health > 0) {
      for (let pkId in weaponPickups) {
        let pk = weaponPickups[pkId];
        let dx = p.x - pk.x;
        let dy = p.y + 12 - pk.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 32) {
          p.weapon = pk.type;
          delete weaponPickups[pkId];
        }
      }
    }
  }

  io.emit('estadoJuego', empaquetarEstado());
}, 1000 / 60);

http.listen(3000, () => {
  console.log('Servidor de combate activo en el puerto 3000');
});
