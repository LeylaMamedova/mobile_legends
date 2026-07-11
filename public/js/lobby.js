const net = new NetworkClient();
let selectedHero = 'fighter';
let isReady = false;

const joinCard = document.getElementById('join-card');
const roomCard = document.getElementById('room-card');
const lobbyError = document.getElementById('lobby-error');
const playerList = document.getElementById('player-list');
const displayRoomId = document.getElementById('display-room-id');
const readyBtn = document.getElementById('ready-btn');
const heroGrid = document.getElementById('hero-grid');

function buildHeroGrid() {
  heroGrid.innerHTML = '';
  for (const [id, hero] of Object.entries(HERO_DATA)) {
    const card = document.createElement('div');
    card.className = 'hero-pick' + (id === selectedHero ? ' selected' : '');
    card.dataset.hero = id;
    card.innerHTML = `
      <div class="hero-pick-portrait" style="background:${hero.portrait}"></div>
      <div class="hero-pick-name">${hero.name}</div>
      <div class="hero-pick-role">${hero.role}</div>
    `;
    card.addEventListener('click', () => {
      selectedHero = id;
      document.querySelectorAll('.hero-pick').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      net.selectHero(id);
    });
    heroGrid.appendChild(card);
  }
}

buildHeroGrid();

document.getElementById('join-btn').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim() || 'Player';
  const roomId = document.getElementById('room-id').value.trim().toUpperCase();
  lobbyError.classList.add('hidden');
  net.joinRoom(roomId, name);
});

readyBtn.addEventListener('click', () => {
  isReady = !isReady;
  readyBtn.textContent = isReady ? 'CANCEL' : 'BATTLE!';
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
  net.selectHero(selectedHero);
  updateLobby(payload.lobby);
});

net.on('lobby_update', updateLobby);

function updateLobby(lobby) {
  playerList.innerHTML = '';
  for (const p of lobby.players) {
    if (p.isBot) continue;
    const li = document.createElement('li');
    const teamClass = p.team === 'blue' ? 'team-blue' : 'team-red';
    const heroName = HERO_DATA[p.heroType]?.name || p.heroType;
    li.innerHTML = `
      <span><span class="${teamClass}">${p.team.toUpperCase()}</span> · ${p.name} · ${heroName}</span>
      <span class="badge ${p.ready ? 'ready' : ''}">${p.ready ? 'Ready' : '...'}</span>
    `;
    playerList.appendChild(li);
  }
  const hint = document.getElementById('lobby-hint');
  if (hint) {
    const humans = lobby.players.filter((p) => !p.isBot).length;
    const bots = lobby.botFill ?? Math.max(0, 4 - lobby.players.length);
    hint.textContent = humans === 1
      ? `Solo — ${bots} bot(s) join on start`
      : bots > 0 ? `${bots} bot(s) fill on start` : 'All ready!';
  }
}

window.lobbyNet = net;
