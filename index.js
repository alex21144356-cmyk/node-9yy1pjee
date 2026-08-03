// ================================================================
// STICKMAN SUPREME DUELIST - SERVIDOR PRINCIPAL
// ================================================================
// Este archivo cubre, en un solo lugar, todo lo pedido en la lista
// de cotejo (adaptado de "biblioteca" al contexto del juego):
//
//   [10%] Se conecta correctamente a MySQL .......... ver archivo db.js (pool de conexion)
//   [15%] CRUD (crear/modificar/eliminar armas) ...... seccion "CRUD DE ARMAS" mas abajo
//   [5%]  Permite registrar usuarios .................. seccion "AUTENTICACION"
//   [10%] Utiliza listas para almacenar datos ......... arrays: inventario, players, MAPS, WEAPON_KEYS
//   [10%] Funcion recursiva ........................... calcularDanoTotalRecursivo (clase GestorArmeria)
//   [5%]  Ciclos for y/o while ......................... asignarRol() usa while, el loop del juego usa for
//   [5%]  Condicionales if / else ...................... en todo el archivo (JS no tiene "elif", se usa else if)
//   [10%] Al menos dos clases con POO .................. clases Arma y GestorArmeria
//   [5%]  Menu interactivo ............................. lo resuelve el cliente (index.html), este servidor
//                                                          expone los datos que ese menu necesita (login,
//                                                          puntajes, armas)
//   [5%]  Proyecto documentado ......................... comentarios en cada seccion
//   [5%]  Documenta los errores ........................ try/catch + console.error en cada endpoint y
//                                                          manejador de errores global al final del archivo
//
// Nota de diseno: las estadisticas de combate (dano, alcance, velocidad de bala, etc.)
// viven en el objeto WEAPONS de este archivo, NO en la base de datos. La tabla "armas"
// de MySQL es el catalogo administrable (CRUD) que pide la lista de cotejo; mezclar ambas
// cosas complicaria el codigo sin necesidad, asi que se mantienen separadas a proposito.
// ================================================================

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
  crearArma,
  obtenerArmas,
  actualizarArma,
  eliminarArma,
  registrarEquipamiento,
} = require('./db');

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: '*' } });

// ================================================================
// [POO - CLASE 1] Arma: representa una fila de la tabla "armas"
// ================================================================
class Arma {
  constructor(id, nombre, tipo, dano) {
    this.id = id;
    this.nombre = nombre;
    this.tipo = tipo;
    this.dano = Number(dano);
  }
}

// ================================================================
// [POO - CLASE 2] GestorArmeria: administra el catalogo de armas
// en memoria (una lista/array) y expone la funcion recursiva.
// ================================================================
class GestorArmeria {
  constructor() {
    this.inventario = []; // [LISTA] arreglo que guarda objetos Arma
  }

  cargarArmas(listaRaw) {
    this.inventario = listaRaw.map((a) => new Arma(a.id, a.nombre, a.tipo, a.dano));
  }

  // [FUNCION RECURSIVA] suma el dano de todo el inventario llamandose
  // a si misma con el siguiente indice, en vez de usar un ciclo.
  calcularDanoTotalRecursivo(lista, index = 0) {
    if (index >= lista.length) {
      return 0; // caso base: ya no quedan armas por sumar
    }
    return lista[index].dano + this.calcularDanoTotalRecursivo(lista, index + 1);
  }
}

const armeriaManager = new GestorArmeria();

// ================================================================
// MIDDLEWARE BASICO
// ================================================================
app.use(express.json());
app.use(express.static(__dirname)); // sirve index.html, css y js sin copias extra

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'stickman_supreme_secreto',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 }, // sesion valida 30 dias
  })
);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// ================================================================
// AUTENTICACION: registro / login / logout / sesion actual
// Solo pide usuario y contrasena, como se pidio.
// ================================================================
function usuarioValido(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!usuarioValido(username) || !password || password.length < 4) {
    return res.status(400).json({ error: 'Usuario o contrasena invalida (usuario 3-20 caracteres, contrasena 4+)' });
  }
  try {
    const existente = await buscarUsuarioPorNombre(username);
    if (existente) return res.status(409).json({ error: 'El usuario ya existe' });

    const hash = await bcrypt.hash(password, 10);
    await crearUsuario(username, hash);
    req.session.username = username;
    res.json({ username });
  } catch (err) {
    console.error('Error en /api/register:', err.message); // [DOCUMENTA ERRORES]
    res.status(500).json({ error: 'Error interno de registro' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const usuario = await buscarUsuarioPorNombre(username);
    if (!usuario) return res.status(401).json({ error: 'Usuario no encontrado' });

    const coincide = await bcrypt.compare(password, usuario.password_hash);
    if (!coincide) return res.status(401).json({ error: 'Contrasena incorrecta' });

    req.session.username = username;
    res.json({ username });
  } catch (err) {
    console.error('Error en /api/login:', err.message);
    res.status(500).json({ error: 'Error en inicio de sesion' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.username) res.json({ username: req.session.username });
  else res.status(401).json({ error: 'No autenticado' });
});

// ================================================================
// TABLA DE PUNTAJES: historial de ganadores guardado en MySQL
// ================================================================
app.get('/api/ganadores', async (req, res) => {
  try {
    const ganadores = await obtenerGanadores();
    res.json(ganadores);
  } catch (err) {
    console.error('Error en /api/ganadores:', err.message);
    res.status(500).json({ error: 'Error al obtener ganadores' });
  }
});

// ================================================================
// CRUD DE ARMAS (catalogo administrable en MySQL)
// Crear / Leer / Actualizar / Eliminar -> cumple el requisito de CRUD.
// ================================================================

// Leer: devuelve el catalogo completo + el dano total (via funcion recursiva)
app.get('/api/armas', async (req, res) => {
  try {
    const armasBD = await obtenerArmas();
    armeriaManager.cargarArmas(armasBD);
    const danoTotal = armeriaManager.calcularDanoTotalRecursivo(armeriaManager.inventario);
    res.json({ danoTotalCatalogo: danoTotal, armas: armeriaManager.inventario });
  } catch (err) {
    console.error('Error en GET /api/armas:', err.message);
    res.status(500).json({ error: 'Error al consultar armas' });
  }
});

// Crear
app.post('/api/armas', async (req, res) => {
  const { nombre, tipo, dano } = req.body || {};
  if (!nombre || !tipo || !dano) return res.status(400).json({ error: 'Datos incompletos' });
  try {
    const id = await crearArma(nombre, tipo, dano);
    res.json({ id, nombre, tipo, dano });
  } catch (err) {
    console.error('Error en POST /api/armas:', err.message);
    res.status(500).json({ error: 'Error al registrar arma' });
  }
});

// Actualizar
app.put('/api/armas/:id', async (req, res) => {
  const { nombre, tipo, dano } = req.body || {};
  try {
    await actualizarArma(req.params.id, nombre, tipo, dano);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en PUT /api/armas/:id:', err.message);
    res.status(500).json({ error: 'Error al actualizar arma' });
  }
});

// Eliminar
app.delete('/api/armas/:id', async (req, res) => {
  try {
    await eliminarArma(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /api/armas/:id:', err.message);
    res.status(500).json({ error: 'Error al eliminar arma' });
  }
});

// Asigna un arma del catalogo al usuario que tiene la sesion iniciada
app.post('/api/equipamiento', async (req, res) => {
  const { armaId } = req.body || {};
  if (!req.session || !req.session.username) return res.status(401).json({ error: 'Sesion no iniciada' });
  try {
    const usuario = await buscarUsuarioPorNombre(req.session.username);
    await registrarEquipamiento(usuario.id, armaId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en /api/equipamiento:', err.message);
    res.status(500).json({ error: 'Error al equipar arma' });
  }
});

// Si la tabla "armas" esta vacia (primera vez que corre el proyecto),
// la llenamos con un catalogo base para que el CRUD tenga datos de ejemplo.
async function sembrarArmasSiHacenFalta() {
  try {
    const actuales = await obtenerArmas();
    if (actuales.length > 0) return;

    const catalogoBase = [
      ['Espada', 'melee', 12],
      ['Espadon', 'melee', 16],
      ['Pistola', 'rango', 5],
      ['Fusil de Asalto', 'rango', 6],
      ['Escopeta', 'rango', 7],
      ['Rifle Francotirador', 'rango', 28],
      ['Gancho', 'especial', 0],
    ];
    for (const [nombre, tipo, dano] of catalogoBase) {
      await crearArma(nombre, tipo, dano);
    }
    console.log('Catalogo de armas sembrado con datos de ejemplo.');
  } catch (err) {
    console.error('Error al sembrar armas:', err.message);
  }
}

// ================================================================
// JUEGO MULTIJUGADOR (motor de combate en tiempo real con socket.io)
// A partir de aqui vive todo lo que el canvas del cliente necesita:
// jugadores, mapas, armas en pelea y proyectiles.
// ================================================================

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

// [LISTA] posiciones y colores fijos por rol (jugador 1 a 4)
const ROLE_CONFIG = {
  1: { x: 100, color: '#ff0055', facing: 'right' },
  2: { x: 300, color: '#00f0ff', facing: 'right' },
  3: { x: 500, color: '#00ff66', facing: 'left' },
  4: { x: 700, color: '#ffcc00', facing: 'left' },
};

// [LISTA] estadisticas de combate de cada arma (independiente del CRUD de MySQL,
// ver la nota de diseno al inicio del archivo)
const WEAPONS = {
  espada: { type: 'melee', range: 45, damage: 12, knockback: 16, attackDuration: 10 },
  espada_larga: { type: 'melee', range: 60, damage: 16, knockback: 20, attackDuration: 16 },
  pistola: { type: 'ranged', damage: 5, knockback: 5, attackDuration: 10, bulletSpeed: 16, bulletLife: 50, bulletCount: 1 },
  fusil_asalto: { type: 'ranged', damage: 6, knockback: 6, attackDuration: 12, bulletSpeed: 14, bulletLife: 70, bulletCount: 1 },
  escopeta: { type: 'ranged', damage: 7, knockback: 10, attackDuration: 32, bulletSpeed: 12, bulletLife: 24, bulletCount: 5 },
  francotirador: { type: 'ranged', damage: 28, knockback: 14, attackDuration: 55, bulletSpeed: 22, bulletLife: 80, bulletCount: 1 },
  gancho: { type: 'grapple', damage: 0, knockback: 0, attackDuration: 26, boost: 16 },
};
const WEAPON_KEYS = Object.keys(WEAPONS); // [LISTA]
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

// [LISTA] mapas jugables; deben coincidir con el array MAPS del cliente (index.html)
// para que la fisica (piso/plataformas) calce con lo que se dibuja en pantalla.
const MAPS = [
  { name: 'Arena Clasica', bg: '#0d111a', floorColor: '#1e293b', floorSegments: [[0, 800]], platforms: [] },
  {
    name: 'Templo de Piedra', bg: '#1c1917', floorColor: '#44403c', floorSegments: [[0, 800]],
    platforms: [{ x: 140, y: 300, width: 150, height: 16 }, { x: 510, y: 300, width: 150, height: 16 }],
  },
  {
    name: 'Plataformas Flotantes', bg: '#0f172a', floorColor: '#334155', floorSegments: [[0, 800]],
    platforms: [{ x: 70, y: 320, width: 120, height: 16 }, { x: 340, y: 250, width: 120, height: 16 }, { x: 610, y: 320, width: 120, height: 16 }],
  },
  { name: 'Volcan', bg: '#270f0f', floorColor: '#991b1b', floorSegments: [[0, 800]], platforms: [{ x: 250, y: 310, width: 300, height: 16 }] },
];

let currentMapIndex = Math.floor(Math.random() * MAPS.length);
let matchActive = true;
let cambiandoRonda = false; // evita disparar dos cambios de mapa a la vez

// [CICLO WHILE] busca el primer rol libre (1 a 4); si no hay, el jugador
// entra como espectador (rol 5).
function asignarRol() {
  const activos = Object.values(players);
  let r = 1;
  while (r <= MAX_PLAYERS) {
    const ocupado = activos.some((p) => p.role === r);
    if (!ocupado) return r;
    r++;
  }
  return MAX_PLAYERS + 1;
}

function jugadoresActivos() {
  return Object.values(players).filter((p) => p.role <= MAX_PLAYERS);
}

// ================================================================
// CONEXION DE JUGADORES (socket.io)
// ================================================================
io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  const role = asignarRol();
  const cfg = ROLE_CONFIG[role] || { x: 400, color: '#95a5a6', facing: 'right' };

  players[socket.id] = {
    id: socket.id,
    role,
    x: cfg.x,
    y: 200,
    vx: 0,
    vy: 0,
    health: 100,
    isAlive: true,
    facing: cfg.facing,
    isAttacking: false,
    attackTimer: 0,
    color: cfg.color,
    score: 0,
    weapon: role <= MAX_PLAYERS ? armaAleatoria() : 'espada',
    name: 'Jugador' + role,
    inputs: { left: false, right: false, up: false, attack: false },
  };

  socket.emit('init', { id: socket.id });
  io.emit('estadoJuego', empaquetarEstado());

  socket.on('input', (keys) => {
    if (players[socket.id]) players[socket.id].inputs = keys;
  });

  // El cliente ya sabe el nombre gracias al login y lo manda apenas conecta
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
    const p = players[targetId];
    if (!p) return;
    const c = ROLE_CONFIG[p.role];
    p.health = 100;
    p.isAlive = true;
    p.x = c ? c.x : 400;
    p.y = 150;
    p.vx = 0;
    p.vy = 0;
    p.weapon = 'espada';
  }, 1500);
}

// ================================================================
// CAMBIO DE MAPA CUANDO SOLO QUEDA UN JUGADOR EN PIE
// ================================================================
function iniciarNuevaRonda(survivorId) {
  if (cambiandoRonda) return;
  cambiandoRonda = true;

  const survivor = players[survivorId];
  io.emit('rondaGanada', {
    role: survivor ? survivor.role : null,
    color: survivor ? survivor.color : '#ffffff',
    name: survivor ? survivor.name : '',
  });

  setTimeout(() => {
    if (!matchActive) { cambiandoRonda = false; return; }

    currentMapIndex = Math.floor(Math.random() * MAPS.length);
    weaponPickups = {};
    bullets = {};

    for (const id in players) {
      const p = players[id];
      if (p.role <= MAX_PLAYERS) {
        const c = ROLE_CONFIG[p.role];
        p.health = 100;
        p.isAlive = true;
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
  if (!attacker || !target || !target.isAlive) return;

  target.health -= damage;
  target.vx = knockbackDir * knockbackForce;
  target.vy = -9;

  if (target.health <= 0) {
    target.health = 0;
    target.isAlive = false;
    attacker.score += 1;

    if (attacker.score >= PUNTOS_PARA_GANAR) {
      terminarPartida();
      return;
    }

    // Si tras esta muerte solo queda un jugador vivo, cambiamos de mapa (nueva ronda)
    const activos = jugadoresActivos();
    const vivos = activos.filter((p) => p.isAlive);
    if (activos.length >= 2 && vivos.length === 1) {
      iniciarNuevaRonda(vivos[0].id);
    } else {
      scheduleRespawn(targetId);
    }
  }
}

// ================================================================
// COMBATE CUERPO A CUERPO
// ================================================================
function verificarGolpe(attackerId) {
  const attacker = players[attackerId];
  if (!attacker) return;
  const arma = WEAPONS[attacker.weapon] || WEAPONS.espada;
  const facingDir = attacker.facing === 'right' ? 1 : -1;

  for (const targetId in players) {
    if (targetId === attackerId) continue;
    const target = players[targetId];
    if (!target || target.role > MAX_PLAYERS || !target.isAlive) continue;

    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const distancia = Math.sqrt(dx * dx + dy * dy);
    const enDireccion = (facingDir === 1 && dx > -10) || (facingDir === -1 && dx < 10);

    if (distancia < arma.range + PLAYER_RADIUS + 10 && enDireccion) {
      aplicarDanio(attackerId, targetId, arma.damage, facingDir, arma.knockback);
      if (!matchActive) return;
    }
  }
}

// ================================================================
// ARMAS DE FUEGO (proyectiles)
// ================================================================
function dispararArma(attackerId, arma) {
  const attacker = players[attackerId];
  if (!attacker) return;
  const facingDir = attacker.facing === 'right' ? 1 : -1;

  const n = arma.bulletCount || 1;
  for (let i = 0; i < n; i++) {
    const id = 'b' + bulletIdCounter++;
    const offsetVertical = n > 1 ? (i - (n - 1) / 2) * 7 : 0;
    bullets[id] = {
      id,
      x: attacker.x + 10 * facingDir,
      y: attacker.y + 4 + offsetVertical,
      vx: facingDir * arma.bulletSpeed,
      vy: (Math.random() - 0.5) * 1.5,
      life: arma.bulletLife,
      damage: arma.damage,
      knockback: arma.knockback,
      ownerId: attackerId,
      weapon: attacker.weapon,
    };
  }
}

function actualizarBalas() {
  for (const id in bullets) {
    const b = bullets[id];
    b.x += b.vx;
    b.y += b.vy;
    b.life--;

    if (b.life <= 0 || b.x < 0 || b.x > CANVAS_WIDTH || b.y < 0 || b.y > CANVAS_HEIGHT) {
      delete bullets[id];
      continue;
    }

    for (const targetId in players) {
      if (targetId === b.ownerId) continue;
      const target = players[targetId];
      if (!target || target.role > MAX_PLAYERS || !target.isAlive) continue;

      const dx = target.x - b.x;
      const dy = target.y - b.y;
      if (Math.sqrt(dx * dx + dy * dy) < 18) {
        const dir = b.vx >= 0 ? 1 : -1;
        aplicarDanio(b.ownerId, targetId, b.damage, dir, b.knockback);
        delete bullets[id];
        break;
      }
    }
  }
}

// ================================================================
// GANCHO (impulso especial)
// ================================================================
function usarGancho(attackerId, arma) {
  const p = players[attackerId];
  if (!p) return;
  const facingDir = p.facing === 'right' ? 1 : -1;
  p.vx = facingDir * 10;
  p.vy = -(arma.boost || 16);
}

// ================================================================
// FIN DE PARTIDA Y PODIO (se guarda el ganador en MySQL)
// ================================================================
function terminarPartida() {
  matchActive = false;

  const ranking = Object.values(players)
    .filter((p) => p.role <= MAX_PLAYERS)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((p) => ({ role: p.role, score: p.score, color: p.color, name: p.name }));

  io.emit('finDePartida', { podium: ranking });

  if (ranking[0]) {
    guardarGanador(ranking[0].name, ranking[0].score); // no bloquea el juego (es async)
  }

  setTimeout(() => {
    currentMapIndex = Math.floor(Math.random() * MAPS.length);
    weaponPickups = {};
    bullets = {};

    for (const id in players) {
      const p = players[id];
      if (p.role <= MAX_PLAYERS) {
        const c = ROLE_CONFIG[p.role];
        p.health = 100;
        p.isAlive = true;
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

// ================================================================
// LOOP PRINCIPAL DE FISICA (60 fotogramas por segundo)
// ================================================================
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

  // [CICLO FOR] recorre a todos los jugadores en cada fotograma
  for (const id in players) {
    const p = players[id];
    if (p.role > MAX_PLAYERS) continue;

    if (p.isAlive) {
      if (p.inputs.left) { p.vx = -5.5; p.facing = 'left'; }
      else if (p.inputs.right) { p.vx = 5.5; p.facing = 'right'; }
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
    for (const plat of map.platforms) {
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

    if (p.isAlive && p.y > CANVAS_HEIGHT + 80) {
      p.health = 0;
      p.isAlive = false;
      scheduleRespawn(id);
    }

    if (p.x < PLAYER_RADIUS) { p.x = PLAYER_RADIUS; p.vx *= -0.5; }
    if (p.x > CANVAS_WIDTH - PLAYER_RADIUS) { p.x = CANVAS_WIDTH - PLAYER_RADIUS; p.vx *= -0.5; }

    if (p.attackTimer > 0) {
      p.attackTimer--;
      if (p.attackTimer === 0) p.isAttacking = false;
    }

    if (p.isAlive) {
      for (const pkId in weaponPickups) {
        const pk = weaponPickups[pkId];
        const dx = p.x - pk.x;
        const dy = p.y + 12 - pk.y;
        if (Math.sqrt(dx * dx + dy * dy) < 32) {
          p.weapon = pk.type;
          delete weaponPickups[pkId];
        }
      }
    }
  }

  io.emit('estadoJuego', empaquetarEstado());
}, 1000 / 60);

// ================================================================
// [DOCUMENTA ERRORES] captura cualquier error que no haya sido
// atrapado por un try/catch, para que el servidor no se caiga solo
// y quede registro en los logs de Render.
// ================================================================
process.on('unhandledRejection', (err) => {
  console.error('Error no manejado (promesa):', err);
});
process.on('uncaughtException', (err) => {
  console.error('Error no manejado (excepcion):', err);
});

// ================================================================
// ARRANQUE: primero la base de datos, luego el servidor HTTP
// ================================================================
initDB().then(sembrarArmasSiHacenFalta);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log('Servidor escuchando en el puerto ' + PORT);
});
