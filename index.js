require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const {
  initDB,
  crearUsuario,
  buscarUsuarioPorNombre,
  crearArma,
  obtenerArmas,
  actualizarArma,
  eliminarArma,
  obtenerGanadores
} = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(__dirname));

// ================================================================
// PROGRAMACION ORIENTADA A OBJETOS Y RECURSIVIDAD
// ================================================================

class Arma {
  constructor(id, nombre, tipo, dano) {
    this.id = id;
    this.nombre = nombre;
    this.tipo = tipo;
    this.dano = Number(dano);
  }
}

class GestorArmeria {
  constructor() {
    this.inventario = [];
  }

  cargarDatos(lista) {
    this.inventario = lista.map(a => new Arma(a.id, a.nombre, a.tipo, a.dano));
  }

  // Algoritmo Recursivo: Calculo del dano acumulado en catalogo
  calcularDanoTotalRecursivo(lista, index = 0) {
    if (index >= lista.length) {
      return 0; // Caso base
    }
    return lista[index].dano + this.calcularDanoTotalRecursivo(lista, index + 1);
  }
}

const armeriaManager = new GestorArmeria();

// ================================================================
// RUTAS REST / API
// ================================================================

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Registro de usuario
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });

  try {
    const existe = await buscarUsuarioPorNombre(username);
    if (existe) return res.status(409).json({ error: 'El usuario ya existe' });

    await crearUsuario(username, password);
    res.json({ username });
  } catch (err) {
    res.status(500).json({ error: 'Error en el servidor al registrar' });
  }
});

// Inicio de sesion
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const usuario = await buscarUsuarioPorNombre(username);
    if (!usuario || usuario.password !== password) {
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }
    res.json({ username: usuario.username });
  } catch (err) {
    res.status(500).json({ error: 'Error en el servidor al iniciar sesion' });
  }
});

// CRUD Catalogo de Armas
app.get('/api/armas', async (req, res) => {
  try {
    const armasBD = await obtenerArmas();
    armeriaManager.cargarDatos(armasBD);
    const danoTotal = armeriaManager.calcularDanoTotalRecursivo(armeriaManager.inventario);
    res.json({ danoTotalCatalogo: danoTotal, armas: armeriaManager.inventario });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener armas' });
  }
});

app.post('/api/armas', async (req, res) => {
  const { nombre, tipo, dano } = req.body || {};
  try {
    const id = await crearArma(nombre, tipo, dano);
    res.json({ id, nombre, tipo, dano });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar arma' });
  }
});

app.put('/api/armas/:id', async (req, res) => {
  const { nombre, tipo, dano } = req.body || {};
  try {
    await actualizarArma(req.params.id, nombre, tipo, dano);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar arma' });
  }
});

app.delete('/api/armas/:id', async (req, res) => {
  try {
    await eliminarArma(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar arma' });
  }
});

// Obtener Puntajes
app.get('/api/ganadores', async (req, res) => {
  try {
    const ganadores = await obtenerGanadores();
    res.json(ganadores);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener puntajes' });
  }
});

// ================================================================
// MULTIJUGADOR SOCKET.IO
// ================================================================
let estadoJuego = {
  players: {}
};

io.on('connection', (socket) => {
  estadoJuego.players[socket.id] = {
    id: socket.id,
    name: 'Jugador',
    x: 100 + Math.random() * 600,
    y: 390,
    vy: 0,
    color: ['#ff0055', '#00f0ff', '#00ff66', '#ffcc00'][Math.floor(Math.random() * 4)]
  };

  socket.emit('init', { id: socket.id });

  socket.on('setName', (nombre) => {
    if (estadoJuego.players[socket.id]) {
      estadoJuego.players[socket.id].name = nombre;
    }
  });

  socket.on('input', (inputs) => {
    const p = estadoJuego.players[socket.id];
    if (p) {
      if (inputs.left) p.x -= 8;
      if (inputs.right) p.x += 8;
      if (inputs.up && p.y >= 390) p.vy = -12;
    }
  });

  socket.on('disconnect', () => {
    delete estadoJuego.players[socket.id];
  });
});

// Bucle del servidor a 30 FPS para ahorrar CPU
setInterval(() => {
  Object.values(estadoJuego.players).forEach(p => {
    p.y += p.vy;
    if (p.y < 390) {
      p.vy += 0.8; // Gravedad
    } else {
      p.y = 390;
      p.vy = 0;
    }
  });
  io.emit('estadoJuego', estadoJuego);
}, 1000 / 30);

// Arranque
initDB();
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
