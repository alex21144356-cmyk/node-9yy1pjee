const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: { origin: '*' },
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// ============== CONFIGURACIÓN GENERAL ==============
let players = {};
let weaponPickups = {}; 
let projectiles = []; // Proyectiles activos en el servidor (balas y ganchos)

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

// ============== ARMAS DISPONIBLES ==============
const WEAPONS = {
  espada: { name: 'Espada', range: 45, damage: 12, knockback: 16, attackDuration: 10, type: 'melee_slash' },
  espadon: { name: 'Espadón', range: 65, damage: 22, knockback: 24, attackDuration: 18, type: 'melee_slash' },
  hoja_rapida: { name: 'Hoja Rápida', range: 35, damage: 8, knockback: 10, attackDuration: 6, type: 'melee_slash' },
  gancho: { name: 'Gancho de Agarre', type: 'grapple' },
  fusil_rapido: { name: 'Fusil Rápido', damage: 6, knockback: 4, cooldown: 12, type: 'ranged', speed: 16, size: 4, color: '#f1c40f' },
  fusil_pesado: { name: 'Fusil Pesado', damage: 25, knockback: 25, cooldown: 45, type: 'ranged', speed: 22, size: 8, color: '#e74c3c' },
  fusil_plasma: { name: 'Fusil Plasma', damage: 14, knockback: 12, cooldown: 24, type: 'ranged', speed: 12, size: 6, color: '#9b59b6' },
  lanza: { name: 'Lanza', range: 65, damage: 8, knockback: 10, attackDuration: 14, type: 'melee_thrust' },
  hacha: { name: 'Hacha', range: 35, damage: 20, knockback: 22, attackDuration: 18, type: 'melee_heavy' },
  daga: { name: 'Daga', range: 25, damage: 6, knockback: 6, attackDuration: 6, type: 'melee_thrust' },
  martillo: { name: 'Martillo', range: 40, damage: 15, knockback: 30, attackDuration: 22, type: 'melee_heavy' },
};
const WEAPON_KEYS = Object.keys(WEAPONS);
let pickupIdCounter = 1;

function getRandomWeapon() {
  return WEAPON_KEYS[Math.floor(Math.random() * WEAPON_KEYS.length)];
}

function asignarArmasAleatorias() {
  for (let id in players) {
    if (players[id].role <= MAX_PLAYERS) {
      players[id].weapon = getRandomWeapon();
      players[id].hook = null; 
    }
  }
}

function spawnWeaponPickup() {
  const id = 'pk' + pickupIdCounter++;
  const type = getRandomWeapon();
  let spawnY = FLOOR_Y - 14;
  const map = MAPS[currentMapIndex];
  if (map.hasVoid && map.platforms.length > 0) {
    const plat = map.platforms[Math.floor(Math.random() * map.platforms.length)];
    spawnY = plat.y - 14;
    weaponPickups[id] = { id, type, x: plat.x + plat.width / 2, y: spawnY };
  } else {
    weaponPickups[id] = { id, type, x: 60 + Math.random() * (CANVAS_WIDTH - 120), y: spawnY };
  }
}

// ============== 13 MAPAS (3 con caída al vacío / hasVoid) ==============
const MAPS = [
  { name: 'Arena Clásica', bg: '#2f3542', floorColor: '#4b5563', hasVoid: false, platforms: [] },
  {
    name: 'Templo de Piedra',
    bg: '#2b2320',
    floorColor: '#6b4f3a',
    hasVoid: false,
    platforms: [
      { x: 140, y: 300, width: 150, height: 16 },
      { x: 510, y: 300, width: 150, height: 16 },
    ],
  },
  {
    name: 'Plataformas Flotantes',
    bg: '#18222e',
    floorColor: '#34495e',
    hasVoid: false,
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
    hasVoid: false,
    platforms: [{ x: 250, y: 310, width: 300, height: 16 }],
  },
  {
    name: 'Hielo Eterno',
    bg: '#152530',
    floorColor: '#85c1e9',
    hasVoid: false,
    platforms: [
      { x: 90, y: 280, width: 100, height: 16 },
      { x: 610, y: 280, width: 100, height: 16 },
      { x: 350, y: 340, width: 100, height: 16 },
    ],
  },
  {
    name: 'Abismo del Vacío (Peligro de Caída)',
    bg: '#0f0f14',
    floorColor: '#1e272e',
    hasVoid: true,
    platforms: [
      { x: 50, y: 350, width: 220, height: 20 },
      { x: 530, y: 350, width: 220, height: 20 },
      { x: 300, y: 230, width: 200, height: 20 },
    ],
  },
  {
    name: 'Estructuras Elevadas (Peligro de Caída)',
    bg: '#2c3e50',
    floorColor: '#7f8c8d',
    hasVoid: true,
    platforms: [
      { x: 150, y: 380, width: 120, height: 20 },
      { x: 530, y: 380, width: 120, height: 20 },
      { x: 300, y: 290, width: 200, height: 20 },
      { x: 100, y: 190, width: 150, height: 20 },
      { x: 550, y: 190, width: 150, height: 20 },
    ],
  },
  {
    name: 'Puentes Suspendidos (Peligro de Caída)',
    bg: '#1e1e24',
    floorColor: '#d35400',
    hasVoid: true,
    platforms: [
      { x: 30, y: 390, width: 160, height: 15 },
      { x: 610, y: 390, width: 160, height: 15 },
      { x: 220, y: 300, width: 360, height: 15 },
      { x: 340, y: 190, width: 120, height: 15 },
    ],
  },
  {
    name: 'Ruinas Metálicas',
    bg: '#1a1d20',
    floorColor: '#57606f',
    hasVoid: false,
    platforms: [
      { x: 200, y: 320, width: 400, height: 16 },
      { x: 300, y: 220, width: 200, height: 16 },
    ],
  },
  {
    name: 'Fábrica Tóxica',
    bg: '#1b2a1a',
    floorColor: '#2ed573',
    hasVoid: false,
    platforms: [
      { x: 50, y: 280, width: 180, height: 16 },
      { x: 570, y: 280, width: 180, height: 16 },
      { x: 270, y: 200, width: 260, height: 16 },
    ],
  },
  {
    name: 'Laboratorio Espacial',
    bg: '#0c1020',
    floorColor: '#45aaf2',
    hasVoid: false,
    platforms: [
      { x: 100, y: 330, width: 600, height: 14 },
      { x: 250, y: 240, width: 300, height: 14 },
    ],
  },
  {
    name: 'Búnker Subterráneo',
    bg: '#2d3436',
    floorColor: '#2d3436',
    hasVoid: false,
    platforms: [
      { x: 80, y: 310, width: 200, height: 20 },
      { x: 520, y: 310, width: 200, height: 20 },
      { x: 180, y: 200, width: 440, height: 20 },
    ],
  },
  {
    name: 'Zona Desértica',
    bg: '#4a3c31',
    floorColor: '#e1b12c',
    hasVoid: false,
    platforms: [
      { x: 50, y: 300, width: 150, height: 16 },
      { x: 600, y: 300, width: 150, height: 16 },
      { x: 240, y: 220, width: 320, height: 16 },
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
    y: 150,
    vx: 0,
    vy: 0,
    health: 100,
    facing: cfg.facing,
    isAttacking: false,
    attackTimer: 0,
    shootCooldown: 0,
    color: cfg.color,
    score: 0,
    weapon: getRandomWeapon(), 
    hook: null, 
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
    verificarFinDeRonda();
    io.emit('estadoJuego', empaquetarEstado());
  });
});

function empaquetarEstado() {
  return {
    players,
    weaponPickups,
    projectiles,
    mapIndex: currentMapIndex,
    matchActive,
  };
}

// ============== COMBATE MELEE ==============
function verificarGolpeMelee(attackerId) {
  let attacker = players[attackerId];
  if (!attacker) return;
  const arma = WEAPONS[attacker.weapon];
  if (!arma || !arma.type.startsWith('melee')) return;

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
      aplicarDanioYRetroceso(attackerId, targetId, arma.damage, attacker.facing * arma.knockback);
    }
  }
}

function aplicarDanioYRetroceso(attackerId, targetId, damage, kbX) {
  let target = players[targetId];
  let attacker = players[attackerId];
  if (!target || target.health <= 0) return;

  target.health -= damage;
  target.vx = kbX;
  target.vy = -7;
  target.hook = null; 

  if (target.health <= 0) {
    ejecutarMuerte(attacker, target);
  }
}

function ejecutarMuerte(attacker, target) {
  target.health = 0;
  target.hook = null;
  if (attacker) {
    attacker.score += 1;
    if (attacker.score >= PUNTOS_PARA_GANAR) {
      terminarPartida();
      return;
    }
  }

  // Comprobar si al morir este jugador la ronda debe terminar por quedar un solo sobreviviente
  verificarFinDeRonda();
}

// ============== CAMBIO DE RONDA (UN SOLO SOBREVIVIENTE) ==============
function verificarFinDeRonda() {
  if (!matchActive) return;

  let jugadoresActivos = Object.values(players).filter(p => p.role <= MAX_PLAYERS);
  let jugadoresVivos = jugadoresActivos.filter(p => p.health > 0);

  // Si hay más de un jugador en total en la sala, y solo queda uno vivo, pasamos de ronda/mapa
  if (jugadoresActivos.length > 1 && jugadoresVivos.length === 1) {
    let ganadorRonda = jugadoresVivos[0];
    ganadorRonda.score += 1;

    if (ganadorRonda.score >= PUNTOS_PARA_GANAR) {
      terminarPartida();
      return;
    }

    matchActive = false;
    io.emit('estadoJuego', empaquetarEstado());

    // Reiniciar automáticamente la siguiente ronda en 2 segundos con nuevo mapa y armas al azar
    setTimeout(() => {
      currentMapIndex = Math.floor(Math.random() * MAPS.length);
      weaponPickups = {};
      projectiles = [];

      asignarArmasAleatorias();

      for (let id in players) {
        let p = players[id];
        if (p.role <= MAX_PLAYERS) {
          const c = ROLE_CONFIG[p.role];
          p.health = 100;
          p.x = c ? c.x : 400;
          p.y = 100;
          p.vx = 0;
          p.vy = 0;
          p.isAttacking = false;
          p.attackTimer = 0;
          p.shootCooldown = 0;
          p.hook = null;
        }
      }
      matchActive = true;
      io.emit('nuevaPartida', { mapIndex: currentMapIndex });
    }, 2000);
  } 
  // Caso de empate (todos mueren al mismo tiempo)
  else if (jugadoresActivos.length > 1 && jugadoresVivos.length === 0) {
    matchActive = false;
    setTimeout(() => {
      currentMapIndex = Math.floor(Math.random() * MAPS.length);
      weaponPickups = {};
      projectiles = [];
      asignarArmasAleatorias();
      for (let id in players) {
        let p = players[id];
        if (p.role <= MAX_PLAYERS) {
          const c = ROLE_CONFIG[p.role];
          p.health = 100;
          p.x = c ? c.x : 400;
          p.y = 100;
          p.vx = 0;
          p.vy = 0;
          p.isAttacking = false;
          p.attackTimer = 0;
          p.shootCooldown = 0;
          p.hook = null;
        }
      }
      matchActive = true;
      io.emit('nuevaPartida', { mapIndex: currentMapIndex });
    }, 2000);
  }
}

// ============== FIN DE PARTIDA Y PODIO (AL ALCANZAR EL LÍMITE DE PUNTOS) ==============
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
    projectiles = [];

    asignarArmasAleatorias();

    for (let id in players) {
      let p = players[id];
      if (p.role <= MAX_PLAYERS) {
        const c = ROLE_CONFIG[p.role];
        p.health = 100;
        p.score = 0;
        p.x = c.x;
        p.y = 100;
        p.vx = 0;
        p.vy = 0;
        p.isAttacking = false;
        p.attackTimer = 0;
        p.shootCooldown = 0;
        p.hook = null;
      }
    }

    matchActive = true;
    io.emit('nuevaPartida', { mapIndex: currentMapIndex });
  }, 8000);
}

// ============== LOOP PRINCIPAL (60 FPS) ==============
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

  for (let i = projectiles.length - 1; i >= 0; i--) {
    let proj = projectiles[i];
    
    if (proj.type === 'bullet') {
      proj.x += proj.vx;
      
      let hit = false;
      for (let targetId in players) {
        if (targetId === proj.ownerId) continue;
        let target = players[targetId];
        if (!target || target.role > MAX_PLAYERS || target.health <= 0) continue;

        let dist = Math.sqrt((target.x - proj.x)**2 + (target.y - proj.y)**2);
        if (dist < PLAYER_RADIUS + proj.size) {
          aplicarDanioYRetroceso(proj.ownerId, targetId, proj.damage, Math.sign(proj.vx) * proj.knockback);
          hit = true;
          break;
        }
      }

      if (proj.x < 0 || proj.x > CANVAS_WIDTH || hit) {
        projectiles.splice(i, 1);
      }
    } 
    else if (proj.type === 'hook') {
      if (proj.state === 'flying') {
        proj.x += proj.vx;
        proj.y += proj.vy;

        let hitPlatform = false;
        
        if (proj.y <= 0) {
          proj.y = 0;
          hitPlatform = true;
        }

        for (let plat of map.platforms) {
          if (proj.x >= plat.x && proj.x <= plat.x + plat.width) {
            if (Math.abs(proj.y - plat.y) < 10) {
              proj.y = plat.y;
              hitPlatform = true;
              break;
            }
          }
        }

        if (hitPlatform) {
          proj.state = 'latched';
          let owner = players[proj.ownerId];
          if (owner) {
            owner.hook = { x: proj.x, y: proj.y };
          }
          projectiles.splice(i, 1); 
        } else {
          let owner = players[proj.ownerId];
          if (!owner) {
            projectiles.splice(i, 1);
          } else {
            let dist = Math.sqrt((owner.x - proj.x)**2 + (owner.y - proj.y)**2);
            if (dist > 380) {
              projectiles.splice(i, 1);
            }
          }
        }
      }
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
        if (!p.hook && (p.y >= FLOOR_Y - PLAYER_RADIUS || p.enPlataforma)) {
          p.vx *= 0.65;
          if (Math.abs(p.vx) < 0.2) p.vx = 0;
        }
      }

      if (p.inputs.up) {
        if (p.hook) {
          p.hook = null;
          p.vy = -8;
        } else if (p.y >= FLOOR_Y - PLAYER_RADIUS || p.enPlataforma) {
          p.vy = -12.5;
        }
      }

      if (p.hook) {
        let dx = p.hook.x - p.x;
        let dy = p.hook.y - p.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 20) {
          p.vx += (dx / dist) * 0.95;
          p.vy += (dy / dist) * 0.95 - 0.2; 
          
          p.vx = Math.max(-10, Math.min(10, p.vx));
          p.vy = Math.max(-10, Math.min(10, p.vy));
        } else {
          p.hook = null;
        }
      }

      if (p.shootCooldown > 0) p.shootCooldown--;

      if (p.inputs.attack) {
        const arma = WEAPONS[p.weapon];
        if (arma) {
          if (arma.type.startsWith('melee') && !p.isAttacking && p.attackTimer === 0) {
            p.isAttacking = true;
            p.attackTimer = arma.attackDuration;
            verificarGolpeMelee(id);
            if (!matchActive) continue;
          } 
          else if (arma.type === 'ranged' && p.shootCooldown === 0) {
            p.shootCooldown = arma.cooldown;
            projectiles.push({
              type: 'bullet',
              ownerId: p.id,
              x: p.x + 18 * p.facing,
              y: p.y + 4,
              vx: p.facing * arma.speed,
              damage: arma.damage,
              knockback: arma.knockback,
              size: arma.size,
              color: arma.color
            });
            p.vx = -p.facing * (arma.knockback * 0.35);
          }
          else if (arma.type === 'grapple' && !p.hook) {
            projectiles = projectiles.filter(pr => !(pr.type === 'hook' && pr.ownerId === p.id));
            
            projectiles.push({
              type: 'hook',
              ownerId: p.id,
              x: p.x,
              y: p.y,
              vx: p.facing * 14,
              vy: -14, 
              state: 'flying'
            });
          }
        }
      }
    }

    p.y += p.vy;
    p.vy += GRAVITY;
    p.x += p.vx;

    if (!p.hook && p.y < FLOOR_Y - PLAYER_RADIUS) {
      p.vx *= 0.98;
    }

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
        p.hook = null; 
      }
    }

    if (map.hasVoid) {
      if (p.y > CANVAS_HEIGHT + 50) {
        if (p.health > 0) {
          ejecutarMuerte(null, p);
        }
      }
    } else {
      if (p.y >= FLOOR_Y - PLAYER_RADIUS) {
        p.y = FLOOR_Y - PLAYER_RADIUS;
        p.vy = 0;
        p.hook = null;
      }
    }

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

    if (p.health > 0) {
      for (let pkId in weaponPickups) {
        let pk = weaponPickups[pkId];
        let dx = p.x - pk.x;
        let dy = p.y + 12 - pk.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 32) {
          p.weapon = pk.type;
          p.hook = null; 
          delete weaponPickups[pkId];
        }
      }
    }
  }

  io.emit('estadoJuego', empaquetarEstado());
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor de combate activo en el puerto ${PORT}`);
});
