const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const http = require('http');
const path = require('path');
require('dotenv').config();

const {
    initDB,
    guardarGanador,
    obtenerGanadores,
    crearUsuario,
    buscarUsuarioPorNombre
} = require('./db');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'secreto_stickman_arena',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==========================================
// RUTAS DE AUTENTICACIÓN Y SCOREBOARD (API)
// ==========================================

app.get('/api/me', (req, res) => {
    if (req.session && req.session.user) {
        return res.json({ username: req.session.user.username });
    }
    res.status(401).json({ error: 'No autenticado' });
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Faltan datos' });
        }
        const existe = await buscarUsuarioPorNombre(username);
        if (existe) {
            return res.status(400).json({ error: 'El nombre de usuario ya está registrado' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await crearUsuario(username, hashedPassword);
        req.session.user = { username };
        res.json({ username });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Faltan datos' });
        }
        const user = await buscarUsuarioPorNombre(username);
        if (!user) {
            return res.status(400).json({ error: 'Usuario no encontrado' });
        }
        const esValida = await bcrypt.compare(password, user.password);
        if (!esValida) {
            return res.status(400).json({ error: 'Contraseña incorrecta' });
        }
        req.session.user = { username: user.username };
        res.json({ username: user.username });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/ganadores', async (req, res) => {
    try {
        const ganadores = await obtenerGanadores();
        res.json(ganadores);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// MOTOR DE JUEGO MULTIJUGADOR (SOCKET.IO)
// ==========================================

const PLAYER_COLORS = {
    1: '#ff0055',
    2: '#00f0ff',
    3: '#00ff66',
    4: '#ffcc00'
};

const MAPS = [
    { floorY: 400, platforms: [] },
    { floorY: 400, platforms: [{ x: 140, y: 300, width: 150, height: 16 }, { x: 510, y: 300, width: 150, height: 16 }] },
    { floorY: 400, platforms: [{ x: 70, y: 320, width: 120, height: 16 }, { x: 340, y: 250, width: 120, height: 16 }, { x: 610, y: 320, width: 120, height: 16 }] },
    { floorY: 400, platforms: [{ x: 250, y: 310, width: 300, height: 16 }] }
];

const WEAPONS = ['espada', 'espada_larga', 'pistola', 'fusil_asalto', 'escopeta', 'francotirador', 'gancho'];

let players = {};
let weaponPickups = {};
let bullets = [];
let mapIndex = 0;
let roundInProgress = true;
let pickupIdCounter = 0;
let bulletIdCounter = 0;

function assignRole() {
    const rolesTomados = Object.values(players).map(p => p.role);
    for (let r = 1; r <= 4; r++) {
        if (!rolesTomados.includes(r)) return r;
    }
    return 0; // Espectador si la sala está llena
}

function spawnWeaponPickup() {
    if (Object.keys(weaponPickups).length >= 4) return;
    const id = ++pickupIdCounter;
    const type = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
    const x = Math.floor(Math.random() * 700) + 50;
    const y = 250;
    weaponPickups[id] = { id, x, y, type };
}

setInterval(spawnWeaponPickup, 7000);

function resetPlayerPosition(p) {
    const spawnX = { 1: 100, 2: 700, 3: 250, 4: 550 };
    p.x = spawnX[p.role] || 400;
    p.y = 350;
    p.vx = 0;
    p.vy = 0;
    p.health = 100;
    p.isAlive = true;
    p.weapon = 'espada';
    p.facing = p.role % 2 === 1 ? 'right' : 'left';
    p.isAttacking = false;
}

function startNextRound(winnerPlayer = null) {
    roundInProgress = false;

    if (winnerPlayer) {
        winnerPlayer.score += 1;
        io.emit('rondaGanada', {
            name: winnerPlayer.name,
            role: winnerPlayer.role,
            color: winnerPlayer.color
        });
    }

    setTimeout(() => {
        // Verificar si alguien alcanzó la puntuación de victoria final (5 puntos)
        const maxScorePlayer = Object.values(players).find(p => p.score >= 5);

        if (maxScorePlayer) {
            const podium = Object.values(players)
                .sort((a, b) => b.score - a.score)
                .slice(0, 3);

            guardarGanador(maxScorePlayer.name, maxScorePlayer.score);

            io.emit('finDePartida', { podium });

            setTimeout(() => {
                Object.values(players).forEach(p => { p.score = 0; });
                mapIndex = (mapIndex + 1) % MAPS.length;
                Object.values(players).forEach(p => resetPlayerPosition(p));
                roundInProgress = true;
                io.emit('nuevaPartida');
            }, 5000);
        } else {
            mapIndex = (mapIndex + 1) % MAPS.length;
            Object.values(players).forEach(p => resetPlayerPosition(p));
            roundInProgress = true;
            io.emit('nuevaRonda');
        }
    }, 2000);
}

io.on('connection', (socket) => {
    const role = assignRole();

    players[socket.id] = {
        id: socket.id,
        role: role,
        name: `P${role}`,
        color: PLAYER_COLORS[role] || '#888888',
        x: 100 * role,
        y: 350,
        vx: 0,
        vy: 0,
        facing: 'right',
        health: 100,
        score: 0,
        weapon: 'espada',
        isAttacking: false,
        isAlive: true,
        attackCooldown: 0,
        keys: { left: false, right: false, up: false, attack: false }
    };

    resetPlayerPosition(players[socket.id]);
    socket.emit('init', { id: socket.id });

    socket.on('setName', (name) => {
        if (players[socket.id] && name) {
            players[socket.id].name = name;
        }
    });

    socket.on('input', (inputs) => {
        if (players[socket.id]) {
            players[socket.id].keys = inputs;
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

// Loop principal del servidor (60 FPS)
setInterval(() => {
    const currentMap = MAPS[mapIndex] || MAPS[0];

    // Actualizar Jugadores
    Object.values(players).forEach(p => {
        if (!p.isAlive) return;

        if (p.keys.left) {
            p.vx = -4;
            p.facing = 'left';
        } else if (p.keys.right) {
            p.vx = 4;
            p.facing = 'right';
        } else {
            p.vx = 0;
        }

        // Gravedad y Salto
        p.vy += 0.6;

        let onGround = false;
        if (p.y >= currentMap.floorY - 30) {
            p.y = currentMap.floorY - 30;
            p.vy = 0;
            onGround = true;
        }

        currentMap.platforms.forEach(plat => {
            if (
                p.x >= plat.x - 10 &&
                p.x <= plat.x + plat.width + 10 &&
                p.y + 30 >= plat.y &&
                p.y + 30 <= plat.y + 12 &&
                p.vy >= 0
            ) {
                p.y = plat.y - 30;
                p.vy = 0;
                onGround = true;
            }
        });

        if (p.keys.up && onGround) {
            p.vy = -12;
        }

        p.x += p.vx;
        p.y += p.vy;

        p.x = Math.max(20, Math.min(780, p.x));

        // Manejo de Ataques
        if (p.attackCooldown > 0) p.attackCooldown--;

        if (p.keys.attack && p.attackCooldown === 0) {
            p.isAttacking = true;
            p.attackCooldown = p.weapon.includes('fusil') ? 8 : 25;

            setTimeout(() => { p.isAttacking = false; }, 150);

            if (['pistola', 'fusil_asalto', 'escopeta', 'francotirador'].includes(p.weapon)) {
                const bVx = p.facing === 'right' ? 12 : -12;
                bullets.push({
                    id: ++bulletIdCounter,
                    x: p.x + (p.facing === 'right' ? 15 : -15),
                    y: p.y - 5,
                    vx: bVx,
                    ownerId: p.id,
                    damage: p.weapon === 'francotirador' ? 45 : (p.weapon === 'escopeta' ? 30 : 15)
                });
            } else {
                // Ataque Cuerpo a Cuerpo
                Object.values(players).forEach(target => {
                    if (target.id !== p.id && target.isAlive) {
                        const dist = Math.hypot(target.x - p.x, target.y - p.y);
                        if (dist < 45) {
                            target.health -= (p.weapon === 'espada_larga' ? 35 : 20);
                            target.vx = p.facing === 'right' ? 8 : -8;
                            if (target.health <= 0) target.isAlive = false;
                        }
                    }
                });
            }
        }

        // Recoger Armas
        Object.keys(weaponPickups).forEach(id => {
            const pickup = weaponPickups[id];
            if (Math.hypot(pickup.x - p.x, pickup.y - p.y) < 25) {
                p.weapon = pickup.type;
                delete weaponPickups[id];
            }
        });
    });

    // Actualizar Balas
    bullets.forEach((b, index) => {
        b.x += b.vx;
        Object.values(players).forEach(target => {
            if (target.id !== b.ownerId && target.isAlive) {
                if (Math.hypot(target.x - b.x, target.y - b.y) < 20) {
                    target.health -= b.damage;
                    bullets.splice(index, 1);
                    if (target.health <= 0) target.isAlive = false;
                }
            }
        });
        if (b.x < 0 || b.x > 800) bullets.splice(index, 1);
    });

    // Control de Rondas
    if (roundInProgress) {
        const jugadoresActivos = Object.values(players).filter(p => p.role >= 1 && p.role <= 4);
        const vivos = jugadoresActivos.filter(p => p.isAlive);

        if (jugadoresActivos.length > 1 && vivos.length <= 1) {
            const ganadorRonda = vivos[0] || null;
            startNextRound(ganadorRonda);
        }
    }

    // Transmitir estado a todos los clientes conectados
    io.emit('estadoJuego', {
        players,
        weaponPickups,
        bullets,
        mapIndex
    });
}, 1000 / 60);

// ==========================================
// ARRANQUE DEL SERVIDOR
// ==========================================

const PORT = process.env.PORT || 10000;

initDB().then(() => {
    server.listen(PORT, () => {
        console.log(`Servidor y juego corriendo correctamente en el puerto ${PORT}`);
    });
}).catch(err => {
    console.error("Error al iniciar base de datos:", err);
});
