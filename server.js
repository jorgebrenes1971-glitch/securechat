/**
 * ╔════════════════════════════════════════════╗
 * ║     SecureChat — Servidor Relay v2         ║
 * ║     Node.js + WebSocket + Web Push         ║
 * ╚════════════════════════════════════════════╝
 */

const { WebSocketServer } = require('ws');
const http = require('http');
const webpush = require('web-push');

const PORT = process.env.PORT || 8080;

// ─── VAPID Keys (generadas automáticamente si no existen)
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC  || 'BCLZAzZThOQCk2ybYQiPohgB_uX7nlM1q1XMO3trKAG7i3ukVI0axdWbL8-hvpkgbhvdsaQFMqJvne1jYjE9Jq0';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || 'i3ukVI0axdWbL8-hvpkgbhvdsaQFMqJvne1jYjE9Jq0';

webpush.setVapidDetails(
  'mailto:jorgebrenes.1971@gmail.com',
  VAPID_PUBLIC,
  VAPID_PRIVATE
);

// Mapa de salas: roomId → Set de WebSockets
const rooms = new Map();
// Mapa de suscripciones push: phoneNumber → pushSubscription
const pushSubs = new Map();

// ─── Servidor HTTP
const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  if (req.url === '/health') {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({
      status: 'ok', rooms: rooms.size,
      uptime: Math.floor(process.uptime()) + 's',
      pushSubs: pushSubs.size
    }));
    return;
  }

  // Guardar suscripción push
  if (req.url === '/subscribe' && req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { phone, name, subscription } = JSON.parse(body);
        if (phone && subscription) {
          pushSubs.set(phone, { subscription, name: name || '+'+phone });
          console.log(`[push] Suscripción guardada para ${name||phone}`);
        }
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(400); res.end('Error');
      }
    });
    return;
  }

  // Obtener clave pública VAPID
  if (req.url === '/vapid-public') {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ publicKey: VAPID_PUBLIC }));
    return;
  }

  res.writeHead(200); res.end('SecureChat Relay v2 ✅');
});

// ─── Servidor WebSocket
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const url      = new URL(req.url, 'http://localhost');
  const room     = url.searchParams.get('room');
  const userId   = url.searchParams.get('id')     || 'anon';
  const userName = url.searchParams.get('name')   || '+'+userId;
  const target   = url.searchParams.get('target'); // número del destinatario

  if (!room) { ws.close(4000, 'room requerido'); return; }

  if (!rooms.has(room)) rooms.set(room, new Set());
  const sala = rooms.get(room);
  sala.add(ws);

  console.log(`[+] ${userId} entró a sala ${room.slice(0,8)}... (${sala.size} en sala)`);

  // Si el destinatario tiene suscripción push, enviarle notificación
  if (target && pushSubs.has(target) && sala.size === 1) {
    const { subscription: sub } = pushSubs.get(target);
    const payload = JSON.stringify({
      title: 'SecureChat 🔐',
      body:  `${userName} quiere chatear contigo`,
      phone: userId,
      name:  userName
    });
    webpush.sendNotification(sub, payload)
      .then(() => console.log(`[push] Notificación enviada a ${target}`))
      .catch(e => {
        console.log(`[push] Error enviando a ${target}: ${e.message}`);
        if (e.statusCode === 410) pushSubs.delete(target);
      });
  }

  broadcast(sala, ws, JSON.stringify({ type: 'peer_joined' }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'msg') broadcast(sala, ws, data.toString());
    } catch(e) {}
  });

  ws.on('close', () => {
    sala.delete(ws);
    console.log(`[-] ${userId} salió (${sala.size} en sala)`);
    if (sala.size === 0) rooms.delete(room);
    else broadcast(sala, ws, JSON.stringify({ type: 'peer_left' }));
  });

  ws.on('error', () => sala.delete(ws));
});

function broadcast(sala, sender, msg) {
  sala.forEach(client => {
    if (client !== sender && client.readyState === 1) client.send(msg);
  });
}

httpServer.listen(PORT, () => {
  console.log(`\n🔐 SecureChat Relay v2 en puerto ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});
