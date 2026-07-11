const WebSocket = require('ws');

async function waitFor(ws, type) {
  return new Promise((resolve) => {
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type) {
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

const send = (ws, type, payload) => ws.send(JSON.stringify({ type, payload }));

async function testSoloWithBots() {
  const ws = new WebSocket('ws://localhost:3000');
  await new Promise((r) => ws.on('open', r));

  send(ws, 'join_room', { name: 'SoloPlayer' });
  const joined = await waitFor(ws, 'joined');
  console.log('Solo room:', joined.payload.roomId);

  send(ws, 'set_ready', { ready: true });
  const start = await waitFor(ws, 'match_start');

  const heroes = start.payload.heroes;
  const bots = heroes.filter((h) => h.isBot);
  const humans = heroes.filter((h) => !h.isBot);

  if (heroes.length !== 4) throw new Error(`Expected 4 heroes, got ${heroes.length}`);
  if (humans.length !== 1) throw new Error(`Expected 1 human, got ${humans.length}`);
  if (bots.length !== 3) throw new Error(`Expected 3 bots, got ${bots.length}`);

  console.log('Solo mode OK — 1 human + 3 bots');
  ws.close();
}

async function testMultiplayer() {
  const ws1 = new WebSocket('ws://localhost:3000');
  const ws2 = new WebSocket('ws://localhost:3000');

  await Promise.all([
    new Promise((r) => ws1.on('open', r)),
    new Promise((r) => ws2.on('open', r))
  ]);

  send(ws1, 'join_room', { name: 'Blue1' });
  const joined1 = await waitFor(ws1, 'joined');
  const roomId = joined1.payload.roomId;

  send(ws2, 'join_room', { roomId, name: 'Red1' });
  await waitFor(ws2, 'joined');
  await waitFor(ws1, 'lobby_update');

  send(ws1, 'set_ready', { ready: true });
  await waitFor(ws1, 'lobby_update');
  send(ws2, 'set_ready', { ready: true });

  const [start1] = await Promise.all([
    waitFor(ws1, 'match_start'),
    waitFor(ws2, 'match_start')
  ]);

  if (start1.payload.heroes.length !== 4) {
    throw new Error('2-player match should fill 2 bots');
  }

  send(ws1, 'input', { dx: 1, dy: 0, attack: true });
  await waitFor(ws1, 'state');

  console.log('Multiplayer mode OK — 2 humans + 2 bots');
  ws1.close();
  ws2.close();
}

async function run() {
  await testSoloWithBots();
  await testMultiplayer();
  console.log('All integration tests passed');
  process.exit(0);
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
