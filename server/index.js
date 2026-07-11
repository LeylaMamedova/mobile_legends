const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const { GameRoom, TICK_RATE, BROADCAST_RATE } = require('./GameRoom');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, players: totalPlayers() });
});

const wss = new WebSocketServer({ server });
const rooms = new Map();
const playerRoom = new Map();

function totalPlayers() {
  let count = 0;
  for (const room of rooms.values()) count += room.players.size;
  return count;
}

function send(ws, type, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcastRoom(room, type, payload) {
  for (const ws of room.connections.values()) {
    send(ws, type, payload);
  }
}

function getOrCreateRoom(roomId) {
  const id = roomId || uuidv4().slice(0, 6).toUpperCase();
  if (!rooms.has(id)) rooms.set(id, new GameRoom(id));
  return rooms.get(id);
}

wss.on('connection', (ws) => {
  const playerId = uuidv4();

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, 'error', { message: 'Invalid JSON' });
    }

    const { type, payload = {} } = msg;

    switch (type) {
      case 'join_room': {
        const room = getOrCreateRoom(payload.roomId);
        const result = room.addPlayer(playerId, ws, payload.name);
        if (!result.ok) return send(ws, 'error', { message: result.error });

        playerRoom.set(playerId, room.id);
        send(ws, 'joined', {
          playerId,
          roomId: room.id,
          team: result.team,
          lobby: room.getLobbyState()
        });
        broadcastRoom(room, 'lobby_update', room.getLobbyState());
        break;
      }
      case 'select_hero': {
        const room = rooms.get(playerRoom.get(playerId));
        if (!room) return;
        if (room.setHeroType(playerId, payload.heroType)) {
          broadcastRoom(room, 'lobby_update', room.getLobbyState());
        }
        break;
      }
      case 'set_ready': {
        const room = rooms.get(playerRoom.get(playerId));
        if (!room) return;
        room.setReady(playerId, !!payload.ready);
        broadcastRoom(room, 'lobby_update', room.getLobbyState());
        if (room.canStart()) {
          room.startMatch();
          broadcastRoom(room, 'match_start', room.getGameState(true));
        }
        break;
      }
      case 'input': {
        const room = rooms.get(playerRoom.get(playerId));
        if (!room || !room.started) return;
        room.handleInput(playerId, payload);
        break;
      }
      default:
        send(ws, 'error', { message: `Unknown message type: ${type}` });
    }
  });

  ws.on('close', () => {
    const roomId = playerRoom.get(playerId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.removePlayer(playerId);
    playerRoom.delete(playerId);
    broadcastRoom(room, 'lobby_update', room.getLobbyState());
    if (room._humanCount() === 0) rooms.delete(roomId);
  });
});

let broadcastAccumulator = 0;
const SIM_STEP = 1 / TICK_RATE;
const BROADCAST_STEP = 1 / BROADCAST_RATE;

setInterval(() => {
  broadcastAccumulator += SIM_STEP;

  const dt = SIM_STEP;
  let shouldBroadcast = false;

  if (broadcastAccumulator >= BROADCAST_STEP) {
    broadcastAccumulator = 0;
    shouldBroadcast = true;
  }

  for (const room of rooms.values()) {
    if (!room.started) continue;
    room.tick(dt);
    if (shouldBroadcast) {
      broadcastRoom(room, 'state', room.getGameState(false));
    }
    if (room.finished && !room._matchEndSent) {
      room._matchEndSent = true;
      room.started = false;
      broadcastRoom(room, 'match_end', {
        winner: room.winner,
        state: room.getGameState(false)
      });
    }
  }
}, SIM_STEP * 1000);

server.listen(PORT, () => {
  console.log(`Mobile MOBA server running on port ${PORT}`);
});
