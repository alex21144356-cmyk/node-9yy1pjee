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

// POO Y RECURSIVIDAD
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

  calcularDanoTotalRecursivo(lista, index = 0) {
    if (index >= lista.length) return 0;
    return lista[index].dano + this.calcularDanoTotalRecursivo(lista, index + 1);
  }
}

const armeriaManager = new GestorArmeria();

// RUTAS API
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });

  try {
    const existe = await buscarUsuarioPorNombre(username);
    if (existe) return res.status(409).json({ error: 'El usuario ya existe' });

    await crearUsuario(username, password);
    res.json({ username });
  } catch (err) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const usuario = await buscarUsuarioPorNombre(username);
    if (!usuario || usuario.password !== password) {
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }
    res.json({ username: usuario.username });
  } catch (err) {
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

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
    res.status(500).json({ error: 'Error al crear arma' });
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

app.get('/api/ganadores', async (req, res) => {
  try {
    const ganadores = await obtenerGanadores();
    res.json(ganadores);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar ganadores' });
  }
});

// PLATAFORMAS DEL ESCENARIO
const plataformas = [
  { x: 100, y: 260, w: 180, h: 15 },
  { x: 520, y: 260, w: 180, h: 15 },
  { x: 320, y: 170, w: 160, h: 15 }
];

// SOCKET.IO
let estadoJuego = {
  players: {},
  inputs: {}
};

io.on('connection', (socket) => {
  estadoJuego.players[socket.id] = {
    id: socket.id,
    name: 'Jugador',
    x: 100 + Math.random() * 600,
    y: 390,
    vy: 0,
    enSuelo: true,
    color: ['#ff0055', '#00f0ff', '#00ff66', '#ffcc00'][Math.floor(Math.random() * 4)]
  };

  estadoJuego.inputs[socket.id] = { left: false, right: false, up: false };

  socket.emit('init', { id: socket.id });

  socket.on('setName', (nombre) => {
    if (estadoJuego.players[socket.id]) {
      estadoJuego.players[socket.id].name = nombre;
    }
  });

  socket.on('input', (data) => {
    estadoJuego.inputs[socket.id] = data;
  });

  socket.on('disconnect', () => {
    delete estadoJuego.players[socket.id];
    delete estadoJuego.inputs[socket.id];
  });
});

// FISICAS A 30 FPS
setInterval(() => {
  Object.keys(estadoJuego.players).forEach(id => {
    const p = estadoJuego.players[id];
    const inp = estadoJuego.inputs[id] || {};

    if (inp.left) p.x -= 6;
    if (inp.right) p.x += 6;

    // Limites de pantalla horizontales
    if (p.x < 20) p.x = 20;
    if (p.x > 780) p.x = 780;

    // Salto
    if (inp.up && p.enSuelo) {
      p.vy = -13;
      p.enSuelo = false;
    }

    // Gravedad
    p.y += p.vy;
    p.vy += 0.8;

    let pisoActual = 390;
    p.enSuelo = false;

    // Deteccion de colision con plataformas flotantes
    plataformas.forEach(plat => {
      if (p.x >= plat.x && p.x <= plat.x + plat.w) {
        if (p.y >= plat.y && p.y - p.vy <= plat.y + 10) {
          pisoActual = plat.y;
        }
      }
    });

    // Colision con el suelo o plataforma
    if (p.y >= pisoActual) {
      p.y = pisoActual;
      p.vy = 0;
      p.enSuelo = true;
    }
  });

  io.emit('estadoJuego', estadoJuego);
}, 1000 / 30);

initDB();
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
