const WebSocket = require('ws');

async function testGame() {
  const ws1 = new WebSocket('ws://localhost:3000');
  const ws2 = new WebSocket('ws://localhost:3000');

  const waitFor = (ws, type) =>
    new Promise((resolve) => {
      const handler = (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === type) {
          ws.off('message', handler);
          resolve(msg);
        }
      };
      ws.on('message', handler);
    });

  const send = (ws, type, payload) => ws.send(JSON.stringify({ type, payload }));

  await Promise.all([
    new Promise((r) => ws1.on('open', r)),
    new Promise((r) => ws2.on('open', r))
  ]);

  send(ws1, 'join_room', { name: 'Blue1' });
  const joined1 = await waitFor(ws1, 'joined');
  const roomId = joined1.payload.roomId;
  console.log('Room created:', roomId);

  send(ws2, 'join_room', { roomId, name: 'Red1' });
  await waitFor(ws2, 'joined');
  await waitFor(ws1, 'lobby_update');

  send(ws1, 'set_ready', { ready: true });
  await waitFor(ws1, 'lobby_update');
  send(ws2, 'set_ready', { ready: true });

  const [start1, start2] = await Promise.all([
    waitFor(ws1, 'match_start'),
    waitFor(ws2, 'match_start')
  ]);

  if (start1.type !== 'match_start' || start2.type !== 'match_start') {
    throw new Error('Match did not start');
  }

  console.log('Match started with', start1.payload.heroes.length, 'heroes');
  console.log('Towers:', start1.payload.towers.length);
  console.log('Lanes:', start1.payload.map.lanes.length);

  send(ws1, 'input', { dx: 1, dy: 0, attack: true });
  const state = await waitFor(ws1, 'state');

  console.log('Game tick OK, match time:', state.payload.matchTime);
  console.log('All integration tests passed');

  ws1.close();
  ws2.close();
  process.exit(0);
}

testGame().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
