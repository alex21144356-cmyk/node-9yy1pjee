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
  registrarEquipamiento
} = require('./db');

const app = express();
const http = require('http').createServer(app);

// ================================================================
// IMPLEMENTACION DE POO (CLASES) Y FUNCION RECURSIVA
// ================================================================

// Clase 1: Representa la entidad de un Arma
class Arma {
  constructor(id, nombre, tipo, dano) {
    this.id = id;
    this.nombre = nombre;
    this.tipo = tipo;
    this.dano = Number(dano);
  }
}

// Clase 2: Administra el inventario y catalogo
class GestorArmeria {
  constructor() {
    this.inventario = []; // Arreglo para almacenar objetos
  }

  cargarArmas(listaRaw) {
    this.inventario = listaRaw.map(a => new Arma(a.id, a.nombre, a.tipo, a.dano));
  }

  // FUNCIÓN RECURSIVA: Suma el daño total acumulado del inventario
  calcularDanoTotalRecursivo(lista, index = 0) {
    if (index >= lista.length) {
      return 0; // Caso base de la recursion
    }
    return lista[index].dano + this.calcularDanoTotalRecursivo(lista, index + 1); // Llamada recursiva
  }
}

const armeriaManager = new GestorArmeria();

// Middleware y servidor de archivos estáticos
app.use(express.json());
app.use(express.static(__dirname));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'stickman_supreme_secreto',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 },
  })
);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// ================================================================
// ENDPOINTS API PARA EL CRUD DE ARMAS
// ================================================================

// Consultar lista de armas
app.get('/api/armas', async (req, res) => {
  try {
    const armasBD = await obtenerArmas();
    armeriaManager.cargarArmas(armasBD);
    const danoTotal = armeriaManager.calcularDanoTotalRecursivo(armeriaManager.inventario);
    res.json({ danoTotalCatalogo: danoTotal, armas: armeriaManager.inventario });
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar armas' });
  }
});

// Crear nueva arma
app.post('/api/armas', async (req, res) => {
  const { nombre, tipo, dano } = req.body || {};
  if (!nombre || !tipo || !dano) return res.status(400).json({ error: 'Datos incompletos' });

  try {
    const id = await crearArma(nombre, tipo, dano);
    res.json({ id, nombre, tipo, dano });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar arma' });
  }
});

// Modificar un arma
app.put('/api/armas/:id', async (req, res) => {
  const { nombre, tipo, dano } = req.body || {};
  try {
    await actualizarArma(req.params.id, nombre, tipo, dano);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar arma' });
  }
});

// Eliminar un arma
app.delete('/api/armas/:id', async (req, res) => {
  try {
    await eliminarArma(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar arma' });
  }
});

// Asignar equipamiento al usuario autenticado
app.post('/api/equipamiento', async (req, res) => {
  const { armaId } = req.body || {};
  if (!req.session || !req.session.username) return res.status(401).json({ error: 'Sesion no iniciada' });

  try {
    const usuario = await buscarUsuarioPorNombre(req.session.username);
    await registrarEquipamiento(usuario.id, armaId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al equipar arma' });
  }
});

// ================================================================
// ENDPOINTS DE AUTENTICACION
// ================================================================

function usuarioValido(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!usuarioValido(username) || !password || password.length < 4) {
    return res.status(400).json({ error: 'Usuario o contrasena invalida' });
  }
  try {
    const existente = await buscarUsuarioPorNombre(username);
    if (existente) return res.status(409).json({ error: 'El usuario ya existe' });

    const hash = await bcrypt.hash(password, 10);
    await crearUsuario(username, hash);
    req.session.username = username;
    res.json({ username });
  } catch (err) {
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

app.get('/api/ganadores', async (req, res) => {
  try {
    const ganadores = await obtenerGanadores();
    res.json(ganadores);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener ganadores' });
  }
});

// Inicializacion de la base de datos y arranque del servidor
initDB();

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
