/**
 * ╔════════════════════════════════════════════╗
 * ║     SecureChat — Servidor Relay            ║
 * ║     Node.js + WebSocket                    ║
 * ║                                            ║
 * ║  Solo retransmite mensajes YA CIFRADOS.    ║
 * ║  El servidor NUNCA ve el contenido.        ║
 * ╚════════════════════════════════════════════╝
 *
 * INSTALAR:  npm install ws
 * EJECUTAR:  node server.js
 * PUERTO:    8080 (configurable)
 */

const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

// Mapa de salas: roomId → Set de WebSockets
const rooms = new Map();

// ─── Servidor HTTP simple (para health check en la nube)
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      rooms:  rooms.size,
      uptime: Math.floor(process.uptime()) + 's'
    }));
  } else {
    res.writeHead(200);
    res.end('SecureChat Relay — Activo ✅');
  }
});

// ─── Servidor WebSocket
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  // Extraer parámetros de la URL: ?room=XXXX&id=YYYYYYY
  const url    = new URL(req.url, 'http://localhost');
  const room   = url.searchParams.get('room');
  const userId = url.searchParams.get('id') || 'anon';

  if (!room) {
    ws.close(4000, 'room requerido');
    return;
  }

  // Unirse a la sala
  if (!rooms.has(room)) rooms.set(room, new Set());
  const sala = rooms.get(room);
  sala.add(ws);

  console.log(`[+] ${userId} entró a sala ${room.slice(0,8)}... (${sala.size} en sala)`);

  // Notificar a los otros en la sala
  broadcast(sala, ws, JSON.stringify({ type: 'peer_joined' }));

  // ─── Recibir mensaje → retransmitir (sin leer contenido)
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'msg') {
        broadcast(sala, ws, data.toString());
      }
    } catch(e) {
      // ignorar mensajes malformados
    }
  });

  // ─── Desconexión
  ws.on('close', () => {
    sala.delete(ws);
    console.log(`[-] ${userId} salió de sala ${room.slice(0,8)}... (${sala.size} en sala)`);
    if (sala.size === 0) {
      rooms.delete(room);
    } else {
      broadcast(sala, ws, JSON.stringify({ type: 'peer_left' }));
    }
  });

  ws.on('error', () => sala.delete(ws));
});

// Enviar a todos en la sala excepto el emisor
function broadcast(sala, sender, msg) {
  sala.forEach(client => {
    if (client !== sender && client.readyState === 1) {
      client.send(msg);
    }
  });
}

httpServer.listen(PORT, () => {
  console.log(`\n🔐 SecureChat Relay corriendo en puerto ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});

