const net = new NetworkClient();
let selectedHero = 'fighter';
let isReady = false;

const joinCard = document.getElementById('join-card');
const roomCard = document.getElementById('room-card');
const lobbyError = document.getElementById('lobby-error');
const playerList = document.getElementById('player-list');
const displayRoomId = document.getElementById('display-room-id');
const readyBtn = document.getElementById('ready-btn');

document.getElementById('join-btn').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim() || 'Player';
  const roomId = document.getElementById('room-id').value.trim().toUpperCase();
  lobbyError.classList.add('hidden');
  net.joinRoom(roomId, name);
});

document.querySelectorAll('.hero-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.hero-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedHero = card.dataset.hero;
    net.selectHero(selectedHero);
  });
});

readyBtn.addEventListener('click', () => {
  isReady = !isReady;
  readyBtn.textContent = isReady ? 'Not Ready' : 'Ready';
  readyBtn.classList.toggle('btn-secondary', isReady);
  net.setReady(isReady);
});

net.on('error', (payload) => {
  lobbyError.textContent = payload.message;
  lobbyError.classList.remove('hidden');
});

net.on('joined', (payload) => {
  window.gameApp.setPlayerInfo(payload.playerId, payload.roomId, payload.team);
  joinCard.classList.add('hidden');
  roomCard.classList.remove('hidden');
  displayRoomId.textContent = payload.roomId;
  updateLobby(payload.lobby);
});

net.on('lobby_update', (lobby) => {
  updateLobby(lobby);
});

function updateLobby(lobby) {
  playerList.innerHTML = '';
  for (const p of lobby.players) {
    const li = document.createElement('li');
    const teamClass = p.team === 'blue' ? 'team-blue' : 'team-red';
    const botTag = p.isBot ? ' 🤖' : '';
    li.innerHTML = `
      <span><span class="${teamClass}">${p.team.toUpperCase()}</span> · ${p.name}${botTag} (${p.heroType})</span>
      <span class="badge ${p.ready ? 'ready' : ''}">${p.isBot ? 'Bot' : p.ready ? 'Ready' : 'Waiting'}</span>
    `;
    playerList.appendChild(li);
  }
  const hint = document.getElementById('lobby-hint');
  if (hint) {
    const humans = lobby.players.filter((p) => !p.isBot).length;
    const bots = lobby.botFill || Math.max(0, 4 - lobby.players.length);
    if (humans === 1) {
      hint.textContent = `Solo mode — ${bots} bot(s) will join when you Ready`;
    } else if (bots > 0) {
      hint.textContent = `${humans} player(s) — ${bots} bot(s) fill on start`;
    } else {
      hint.textContent = 'All players ready to start!';
    }
  }
}

window.lobbyNet = net;
