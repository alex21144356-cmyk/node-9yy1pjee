const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: { origin: '*' },
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Configuración del juego
let players = {};
const GRAVITY = 0.6;
const FLOOR_Y = 400;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const PLAYER_RADIUS = 15;
const WEAPON_RANGE = 45;
const MAX_PLAYERS = 4;

// Configuración de cada uno de los 4 roles: posición inicial, color y dirección
const ROLE_CONFIG = {
  1: { x: 100, color: '#ff4757', facing: 1 }, // Rojo
  2: { x: 300, color: '#2ed573', facing: 1 }, // Verde
  3: { x: 500, color: '#1e90ff', facing: -1 }, // Azul
  4: { x: 700, color: '#9b59b6', facing: -1 }, // Morado
};

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  // Asignación dinámica de Roles (evita duplicados si alguien se sale y otro entra)
  let activePlayers = Object.values(players);
  let role = null;
  for (let r = 1; r <= MAX_PLAYERS; r++) {
    let ocupado = activePlayers.some((p) => p.role === r);
    if (!ocupado) {
      role = r;
      break;
    }
  }
  if (role === null) role = MAX_PLAYERS + 1; // Espectador si ya hay 4 jugando

  const cfg = ROLE_CONFIG[role] || { x: 400, color: '#95a5a6', facing: 1 };

  // Propiedades del Stickman estilo Supreme Duelist
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
    inputs: { left: false, right: false, up: false, attack: false },
  };

  // Enviar ID personal al cliente e indicar estado actual
  socket.emit('init', { id: socket.id });
  io.emit('actualizarJugadores', players);

  // Escuchar constantemente los controles del cliente
  socket.on('input', (keys) => {
    if (players[socket.id]) {
      players[socket.id].inputs = keys;
    }
  });

  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);
    delete players[socket.id];
    io.emit('actualizarJugadores', players);
  });
});

// Sistema de combate: cada jugador puede golpear a cualquiera de los otros jugadores activos
function verificarGolpe(attackerId) {
  let attacker = players[attackerId];
  if (!attacker) return;

  for (let targetId in players) {
    if (targetId === attackerId) continue;
    let target = players[targetId];

    if (!target || target.role > MAX_PLAYERS || target.health <= 0) continue;

    // Calcular distancia entre los dos stickmans
    let dx = target.x - attacker.x;
    let dy = target.y - attacker.y;
    let distancia = Math.sqrt(dx * dx + dy * dy);

    // Validar si el ataque va en la dirección correcta del enemigo
    let enDireccion =
      (attacker.facing === 1 && dx > -10) ||
      (attacker.facing === -1 && dx < 10);

    if (distancia < WEAPON_RANGE + PLAYER_RADIUS + 10 && enDireccion) {
      // Registrar daño
      target.health -= 12;

      // Knockback que lo empuja por los aires
      let fuerzaKnockback = 16;
      target.vx = attacker.facing * fuerzaKnockback;
      target.vy = -9;

      // Si muere, sumamos punto y activamos reaparición
      if (target.health <= 0) {
        target.health = 0;
        attacker.score += 1;

        setTimeout(() => {
          if (players[targetId]) {
            const cfg = ROLE_CONFIG[players[targetId].role];
            players[targetId].health = 100;
            players[targetId].x = cfg ? cfg.x : 400;
            players[targetId].y = 150;
            players[targetId].vx = 0;
            players[targetId].vy = 0;
          }
        }, 1500);
      }
    }
  }
}

// LOOP PRINCIPAL DE FÍSICA (Corre a 60 fotogramas por segundo, autoritativo en el servidor)
setInterval(() => {
  for (let id in players) {
    let p = players[id];
    if (p.role > MAX_PLAYERS) continue; // Los espectadores no procesan física

    if (p.health > 0) {
      // Movimiento controlado por el usuario
      if (p.inputs.left) {
        p.vx = -5.5;
        p.facing = -1;
      } else if (p.inputs.right) {
        p.vx = 5.5;
        p.facing = 1;
      } else {
        // Fricción inmediata al ras del piso para frenar en seco si no se oprimen teclas
        if (p.y >= FLOOR_Y - PLAYER_RADIUS) {
          p.vx *= 0.65;
          if (Math.abs(p.vx) < 0.2) p.vx = 0;
        }
      }

      // Impulso de Salto
      if (p.inputs.up && p.y >= FLOOR_Y - PLAYER_RADIUS) {
        p.vy = -12.5;
      }

      // Manejo del estado del ataque (Espada)
      if (p.inputs.attack && !p.isAttacking && p.attackTimer === 0) {
        p.isAttacking = true;
        p.attackTimer = 10;
        verificarGolpe(id);
      }
    }

    // Aplicar gravedad constante
    p.y += p.vy;
    p.vy += GRAVITY;

    // Aplicar velocidad en el aire con fricción aerodinámica
    p.x += p.vx;
    if (p.y < FLOOR_Y - PLAYER_RADIUS) {
      p.vx *= 0.98;
    }

    // Colisión fija con la plataforma del suelo
    if (p.y >= FLOOR_Y - PLAYER_RADIUS) {
      p.y = FLOOR_Y - PLAYER_RADIUS;
      p.vy = 0;
    }

    // Límites de la arena (Paredes izquierda y derecha)
    if (p.x < PLAYER_RADIUS) {
      p.x = PLAYER_RADIUS;
      p.vx *= -0.5;
    }
    if (p.x > CANVAS_WIDTH - PLAYER_RADIUS) {
      p.x = CANVAS_WIDTH - PLAYER_RADIUS;
      p.vx *= -0.5;
    }

    // Enfriamiento del ataque
    if (p.attackTimer > 0) {
      p.attackTimer--;
      if (p.attackTimer === 0) p.isAttacking = false;
    }
  }

  // Despachar el estado exacto del mapa a todos los navegadores conectados, en vivo
  io.emit('actualizarJugadores', players);
}, 1000 / 60);

http.listen(3000, () => {
  console.log('Servidor de combate activo en el puerto 3000');
});
