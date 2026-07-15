const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: { origin: '*' },
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// ============== CONFIGURACIÓN GENERAL =============
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

// ============== ARMAS =============
const WEAPONS = {
  espada: { name: 'Espada', range: 45, damage: 12, knockback: 16, attackDuration: 10 },
  lanza: { name: 'Lanza', range: 65, damage: 10, knockback: 14, attackDuration: 8 },
  espadon: { name: 'Espadón', range: 50, damage: 18, knockback: 22, attackDuration: 15 },
  hoja_rapida: { name: 'Hoja Rápida', range: 30, damage: 7, knockback: 6, attackDuration: 5 },
  daga: { name: 'Daga', range: 20, damage: 8, knockback: 5, attackDuration: 4 },
  hacha: { name: 'Hacha', range: 32, damage: 20, knockback: 25, attackDuration: 18 },
  martillo: { name: 'Martillo', range: 35, damage: 24, knockback: 30, attackDuration: 22 },
  gancho: { name: 'Gancho de Agarre', range: 28, damage: 5, knockback: 8, attackDuration: 12 },
  fusil_rapido: { name: 'Fusil Rápido', range: 30, damage: 5, knockback: 3, attackDuration: 8 },
  fusil_pesado: { name: 'Fusil Pesado', range: 42, damage: 25, knockback: 28, attackDuration: 20 },
  fusil_plasma: { name: 'Fusil Plasma', range: 34, damage: 12, knockback: 10, attackDuration: 10 },
};

const MAPS = [
  { name: 'Arena Clásica', hasVoid: false, platforms: [] },
  { name: 'Templo de Piedra', hasVoid: false, platforms: [ { x: 140, y: 300, width: 150, height: 16 }, { x: 510, y: 300, width: 150, height: 16 } ] },
  { name: 'Plataformas Flotantes', hasVoid: false, platforms: [ { x: 70, y: 320, width: 120, height: 16 }, { x: 340, y: 250, width: 120, height: 16 }, { x: 610, y: 320, width: 120, height: 16 } ] },
  { name: 'Volcán', hasVoid: false, platforms: [ { x: 250, y: 310, width: 300, height: 16 } ] },
  { name: 'Hielo Eterno', hasVoid: false, platforms: [ { x: 90, y: 280, width: 100, height: 16 }, { x: 610, y: 280, width: 100, height: 16 }, { x: 350, y: 340, width: 100, height: 16 } ] },
  { name: 'Abismo del Vacío (Peligro de Caída)', hasVoid: true, platforms: [ { x: 50, y: 350, width: 220, height: 20 }, { x: 530, y: 350, width: 220, height: 20 }, { x: 300, y: 230, width: 200, height: 20 } ] },
  { name: 'Estructuras Elevadas (Peligro de Caída)', hasVoid: true, platforms: [ { x: 150, y: 380, width: 120, height: 20 }, { x: 530, y: 380, width: 120, height: 20 }, { x: 300, y: 290, width: 200, height: 20 }, { x: 100, y: 190, width: 150, height: 20 }, { x: 550, y: 190, width: 150, height: 20 } ] },
  { name: 'Puentes Suspendidos (Peligro de Caída)', hasVoid: true, platforms: [ { x: 30, y: 390, width: 160, height: 15 }, { x: 610, y: 390, width: 160, height: 15 }, { x: 220, y: 300, width: 360, height: 15 }, { x: 340, y: 190, width: 120, height: 15 } ] },
  { name: 'Ruinas Metálicas', hasVoid: false, platforms: [ { x: 200, y: 320, width: 400, height: 16 }, { x: 300, y: 220, width: 200, height: 16 } ] },
  { name: 'Fábrica Tóxica', hasVoid: false, platforms: [ { x: 50, y: 280, width: 180, height: 16 }, { x: 570, y: 280, width: 180, height: 16 }, { x: 270, y: 200, width: 260, height: 16 } ] },
  { name: 'Laboratorio Espacial', hasVoid: false, platforms: [ { x: 100, y: 330, width: 600, height: 14 }, { x: 250, y: 240, width: 300, height: 14 } ] },
  { name: 'Búnker Subterráneo', hasVoid: false, platforms: [ { x: 80, y: 310, width: 200, height: 20 }, { x: 520, y: 310, width: 200, height: 20 }, { x: 180, y: 200, width: 440, height: 20 } ] },
  { name: 'Zona Desértica', hasVoid: false, platforms: [ { x: 50, y: 300, width: 150, height: 16 }, { x: 600, y: 300, width: 150, height: 16 }, { x: 240, y: 220, width: 320, height: 16 } ] },
];

let mapIndex = 0;
let projectiles = [];

function initGame() {
  players = {};
  weaponPickups = {};
  projectiles = [];
  spawnWeaponPickup();
  spawnWeaponPickup();
}

function spawnWeaponPickup() {
  const types = Object.keys(WEAPONS);
  const randomType = types[Math.floor(Math.random() * types.length)];
  const id = 'wp_' + Math.random().toString(36).substr(2, 9);
  const map = MAPS[mapIndex];

  let rx = 50 + Math.random() * (CANVAS_WIDTH - 100);
  let ry = FLOOR_Y - 20;

  if (map.platforms.length > 0) {
    const plat = map.platforms[Math.floor(Math.random() * map.platforms.length)];
    rx = plat.x + Math.random() * plat.width;
    ry = plat.y - 16;
  } else if (map.hasVoid) {
    rx = 100 + Math.random() * 600;
    ry = 200;
  }

  weaponPickups[id] = { id, x: rx, y: ry, type: randomType };
}

io.on('connection', (socket) => {
  let assignedRole = null;
  const activeRoles = Object.values(players).map((p) => p.role);
  for (let r = 1; r <= MAX_PLAYERS; r++) {
    if (!activeRoles.includes(r)) {
      assignedRole = r;
      break;
    }
  }

  if (assignedRole === null) {
    assignedRole = 99; // Espectador
  }

  const conf = ROLE_CONFIG[assignedRole] || { x: 400, color: '#95a5a6', facing: 1 };

  players[socket.id] = {
    id: socket.id,
    role: assignedRole,
    x: conf.x,
    y: assignedRole === 99 ? -500 : 100,
    vx: 0,
    vy: 0,
    color: conf.color,
    facing: conf.facing,
    health: assignedRole === 99 ? 0 : 100,
    score: 0,
    weapon: 'espada',
    isAttacking: false,
    attackTimer: 0,
    shootCooldown: 0,
    hook: null, // Anclaje del gancho { x, y }
    inputs: { left: false, right: false, up: false, attack: false },
  };

  socket.emit('init', { id: socket.id });

  socket.on('input', (keys) => {
    if (players[socket.id]) {
      players[socket.id].inputs = keys;
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
  });
});

function resetRound() {
  projectiles = [];
  for (let id in players) {
    let p = players[id];
    if (p.role <= MAX_PLAYERS) {
      const conf = ROLE_CONFIG[p.role] || { x: 400, color: '#ff4757', facing: 1 };
      p.x = conf.x;
      p.y = 100;
      p.vx = 0;
      p.vy = 0;
      p.health = 100;
      p.weapon = 'espada';
      p.isAttacking = false;
      p.attackTimer = 0;
      p.shootCooldown = 0;
      p.hook = null;
    }
  }
}

function checkGameOver() {
  let alive = Object.values(players).filter((p) => p.role <= MAX_PLAYERS && p.health > 0);
  if (alive.length <= 1 && Object.values(players).filter(p => p.role <= MAX_PLAYERS).length > 1) {
    if (alive.length === 1) {
      alive[0].score++;
    }

    let winner = Object.values(players).find((p) => p.score >= PUNTOS_PARA_GANAR);
    if (winner) {
      const sorted = Object.values(players)
        .filter((p) => p.role <= MAX_PLAYERS)
        .sort((a, b) => b.score - a.score);
      io.emit('finDePartida', { podium: sorted });
      
      for (let id in players) {
        players[id].score = 0;
      }
      setTimeout(() => {
        mapIndex = (mapIndex + 1) % MAPS.length;
        resetRound();
        io.emit('nuevaPartida');
      }, 7000);
    } else {
      setTimeout(() => {
        resetRound();
      }, 1500);
    }
  }
}

// ============== FÍSICA Y ACTUALIZACIÓN DEL JUEGO ==============
setInterval(() => {
  const map = MAPS[mapIndex] || MAPS[0];

  // Spawn dinámico de armas
  if (Object.keys(weaponPickups).length < 3 && Math.random() < 0.005) {
    spawnWeaponPickup();
  }

  // Actualizar jugadores
  for (let id in players) {
    let p = players[id];
    if (p.role > MAX_PLAYERS || p.health <= 0) continue;

    // Lógica del Gancho (Tirón de cuerda)
    if (p.hook) {
      const dx = p.hook.x - p.x;
      const dy = p.hook.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 10) {
        // Fuerza de atracción constante hacia el punto de anclaje
        p.vx += (dx / dist) * 1.4;
        p.vy += (dy / dist) * 1.4;
        p.vx *= 0.94; // Mayor control de aire en balanceo
        p.vy *= 0.94;
      }
      // Soltar gancho saltando
      if (p.inputs.up) {
        p.hook = null;
        p.vy = -10; // Impulso vertical hacia arriba para un salto fluido
      }
    } else {
      // Movimiento estándar
      if (p.inputs.left) {
        p.vx = -4.5;
        p.facing = -1;
      } else if (p.inputs.right) {
        p.vx = 4.5;
        p.facing = 1;
      } else {
        p.vx *= 0.8; // Fricción
      }

      // Gravedad normal
      p.vy += GRAVITY;

      // Salto estándar
      if (p.inputs.up && (p.y >= FLOOR_Y - PLAYER_RADIUS || p.enPlataforma)) {
        p.vy = -12;
        p.enPlataforma = false;
      }
    }

    p.x += p.vx;
    p.y += p.vy;

    // Reducir cooldows de disparo
    if (p.shootCooldown > 0) p.shootCooldown--;

    // Ataque estándar o lanzamiento de Proyectiles/Gancho
    if (p.inputs.attack && p.attackTimer === 0 && p.shootCooldown === 0) {
      const wInfo = WEAPONS[p.weapon];
      p.isAttacking = true;
      p.attackTimer = wInfo.attackDuration;

      if (p.weapon === 'gancho') {
        p.shootCooldown = 25;
        // Lanzamos el arpón en la dirección del stickman
        projectiles.push({
          id: 'proj_' + Math.random().toString(36).substr(2, 9),
          type: 'hook',
          ownerId: p.id,
          x: p.x + 15 * p.facing,
          y: p.y + 4,
          vx: p.facing * 18,
          vy: -2, // Ligera inclinación hacia arriba para facilitar el tiro parabólico
          size: 6,
          active: true,
        });
      } 
      else if (['fusil_rapido', 'fusil_pesado', 'fusil_plasma'].includes(p.weapon)) {
        let size = 3;
        let speed = 16;
        let pColor = '#fff';

        if (p.weapon === 'fusil_rapido') {
          p.shootCooldown = 6;
          speed = 18;
          pColor = '#fffa65';
        } else if (p.weapon === 'fusil_pesado') {
          p.shootCooldown = 35;
          speed = 25;
          size = 5;
          pColor = '#ff3f34';
        } else if (p.weapon === 'fusil_plasma') {
          p.shootCooldown = 15;
          speed = 14;
          size = 6;
          pColor = '#00ffff';
        }

        projectiles.push({
          id: 'proj_' + Math.random().toString(36).substr(2, 9),
          type: 'bullet',
          ownerId: p.id,
          x: p.x + 22 * p.facing,
          y: p.y + 4,
          vx: p.facing * speed,
          vy: 0,
          size: size,
          color: pColor,
          weaponType: p.weapon,
          active: true,
        });
      } else {
        // Ataque cuerpo a cuerpo regular
        for (let otherId in players) {
          if (otherId === p.id) continue;
          let other = players[otherId];
          if (other.role > MAX_PLAYERS || other.health <= 0) continue;

          const dx = other.x - p.x;
          const dy = other.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < wInfo.range && Math.sign(dx) === p.facing) {
            other.health -= wInfo.damage;
            other.vx += p.facing * wInfo.knockback;
            other.vy -= 4; // Rebote
            if (other.health <= 0) {
              other.health = 0;
              checkGameOver();
            }
          }
        }
      }
    }

    // Colisiones con plataformas flotantes
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

    // Colisión con el suelo principal (si no es mapa de vacío)
    if (!map.hasVoid) {
      if (p.y >= FLOOR_Y - PLAYER_RADIUS) {
        p.y = FLOOR_Y - PLAYER_RADIUS;
        p.vy = 0;
      }
    } else {
      // Si cae al vacío (fuera del canvas inferior)
      if (p.y > CANVAS_HEIGHT + 100) {
        p.health = 0;
        p.hook = null;
        checkGameOver();
      }
    }

    // Paredes laterales
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
    for (let wId in weaponPickups) {
      let wp = weaponPickups[wId];
      const dx = p.x - wp.x;
      const dy = p.y - wp.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PLAYER_RADIUS + 14) {
        p.weapon = wp.type;
        p.hook = null; // Soltar gancho si recoge otra arma
        delete weaponPickups[wId];
        break;
      }
    }
  }

  // ====================================================
  //   LÓGICA DE PROYECTILES (INCLUYE ANCLAJE DEL GANCHO)
  // ====================================================
  for (let i = projectiles.length - 1; i >= 0; i--) {
    let proj = projectiles[i];
    if (!proj.active) {
      projectiles.splice(i, 1);
      continue;
    }

    proj.x += proj.vx;
    proj.y += proj.vy;

    let colisionSuelo = false;
    let colisionParedOPlataforma = false;

    // 1. Colisión con el Suelo Principal
    if (!map.hasVoid && proj.y >= FLOOR_Y) {
      colisionSuelo = true;
    }

    // 2. Colisión con Plataformas
    for (let plat of map.platforms) {
      if (
        proj.x >= plat.x &&
        proj.x <= plat.x + plat.width &&
        proj.y >= plat.y &&
        proj.y <= plat.y + plat.height
      ) {
        colisionParedOPlataforma = true;
        break;
      }
    }

    // 3. Colisión con Límites Físicos (Bordes de la Pantalla / Techo)
    if (proj.x <= 0 || proj.x >= CANVAS_WIDTH || proj.y <= 0) {
      colisionParedOPlataforma = true;
    }

    // LÓGICA DE GANCHO MODIFICADA: Si choca contra CUALQUIER elemento (suelo, plataforma, límites), se ancla ahí mismo
    if (proj.type === 'hook') {
      let owner = players[proj.ownerId];

      // Si colisionó con cualquier cosa del mapa o límites
      if (colisionSuelo || colisionParedOPlataforma) {
        if (owner) {
          owner.hook = { x: proj.x, y: proj.y }; // Clavar gancho exactamente en la colisión
        }
        proj.active = false;
        projectiles.splice(i, 1);
        continue;
      }

      // También puede engancharse a un jugador enemigo si colisiona con él
      for (let otherId in players) {
        if (otherId === proj.ownerId) continue;
        let other = players[otherId];
        if (other.role > MAX_PLAYERS || other.health <= 0) continue;

        const dx = other.x - proj.x;
        const dy = other.y - proj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < PLAYER_RADIUS) {
          if (owner) {
            owner.hook = { x: other.x, y: other.y }; // Se ancla directamente al enemigo
          }
          other.health -= 5;
          other.vx += Math.sign(proj.vx) * 6; // Empuje al rival enganchado
          proj.active = false;
          if (other.health <= 0) {
            other.health = 0;
            checkGameOver();
          }
          break;
        }
      }
    } 
    else if (proj.type === 'bullet') {
      // Balas comunes desaparecen al chocar con terreno
      if (colisionSuelo || colisionParedOPlataforma) {
        proj.active = false;
        projectiles.splice(i, 1);
        continue;
      }

      // Impactar jugadores con balas
      for (let otherId in players) {
        if (otherId === proj.ownerId) continue;
        let other = players[otherId];
        if (other.role > MAX_PLAYERS || other.health <= 0) continue;

        const dx = other.x - proj.x;
        const dy = other.y - proj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < PLAYER_RADIUS + proj.size) {
          const wInfo = WEAPONS[proj.weaponType] || { damage: 5, knockback: 5 };
          other.health -= wInfo.damage;
          other.vx += Math.sign(proj.vx) * wInfo.knockback;
          other.vy -= 2;
          proj.active = false;

          if (other.health <= 0) {
            other.health = 0;
            checkGameOver();
          }
          break;
        }
      }
    }

    // Descartar si vuela ridículamente lejos fuera de los límites holgados del mapa
    if (proj.x < -150 || proj.x > CANVAS_WIDTH + 150 || proj.y < -150 || proj.y > CANVAS_HEIGHT + 150) {
      proj.active = false;
    }
  }

  // Sincronización del estado con los clientes
  io.emit('estadoJuego', {
    players,
    weaponPickups,
    projectiles,
    mapIndex,
  });
}, 1000 / 60);

initGame();

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log('Servidor corriendo en el puerto: ' + PORT);
});
