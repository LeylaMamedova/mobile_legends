class GameApp {
  constructor() {
    this.playerId = null;
    this.roomId = null;
    this.team = null;
    this.state = null;
    this.running = false;

    this.canvas = document.getElementById('game-canvas');
    this.renderer = new GameRenderer(this.canvas);
    this.joystick = new VirtualJoystick(
      document.getElementById('joystick-zone'),
      document.getElementById('joystick-knob')
    );
    this.skills = new SkillButtons({
      attack: 'attack-btn',
      skill1: 'skill1-btn',
      skill2: 'skill2-btn'
    });

    this._bindNetwork();
    this._bindUI();
    this._loop();
  }

  setPlayerInfo(playerId, roomId, team) {
    this.playerId = playerId;
    this.roomId = roomId;
    this.team = team;
    this.renderer.setPlayerId(playerId);
  }

  _bindNetwork() {
    const net = window.lobbyNet;

    net.on('match_start', (state) => {
      this._startGame(state);
    });

    net.on('state', (state) => {
      this.state = state;
      this.renderer.setState(state);
      this._updateHud();
      this._updateCooldowns();
    });

    net.on('match_end', (payload) => {
      this._showMatchEnd(payload.winner);
    });
  }

  _bindUI() {
    document.getElementById('back-lobby-btn').addEventListener('click', () => {
      location.reload();
    });
  }

  _startGame(state) {
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    this.state = state;
    this.renderer.setState(state);
    this.running = true;
  }

  _updateHud() {
    const hero = this.state?.heroes?.find((h) => h.playerId === this.playerId);
    if (!hero) return;

    const hpRatio = hero.hp / hero.maxHp;
    document.getElementById('hp-bar').style.width = `${hpRatio * 100}%`;
    document.getElementById('hp-text').textContent = `${Math.ceil(hero.hp)} / ${hero.maxHp}`;
    document.getElementById('gold-text').textContent = `Gold: ${hero.gold}`;
    document.getElementById('kda-text').textContent = `${hero.kills} / ${hero.deaths}`;

    const mins = Math.floor(this.state.matchTime / 60);
    const secs = this.state.matchTime % 60;
    document.getElementById('timer-text').textContent = `${mins}:${String(secs).padStart(2, '0')}`;

    const feed = document.getElementById('kill-feed');
    feed.innerHTML = '';
    for (const k of this.state.killFeed || []) {
      const div = document.createElement('div');
      div.className = 'kill-entry';
      div.textContent = `${k.killer} → ${k.victim}`;
      feed.appendChild(div);
    }
  }

  _updateCooldowns() {
    const hero = this.state?.heroes?.find((h) => h.playerId === this.playerId);
    if (!hero) return;

    this._setCooldownUI('attack-btn', hero.attackCooldownLeft);
    this._setCooldownUI('skill1-btn', hero.skill1CooldownLeft);
    this._setCooldownUI('skill2-btn', hero.skill2CooldownLeft);
  }

  _setCooldownUI(id, cd) {
    const btn = document.getElementById(id);
    let overlay = btn.querySelector('.cd-overlay');
    if (cd > 0) {
      btn.classList.add('on-cooldown');
      if (!overlay) {
        overlay = document.createElement('span');
        overlay.className = 'cd-overlay';
        btn.appendChild(overlay);
      }
      overlay.textContent = cd.toFixed(1);
    } else {
      btn.classList.remove('on-cooldown');
      if (overlay) overlay.remove();
    }
  }

  _showMatchEnd(winner) {
    this.running = false;
    const overlay = document.getElementById('match-end-overlay');
    const result = document.getElementById('match-result');
    const won = winner === this.team;
    result.textContent = won ? 'VICTORY!' : 'DEFEAT';
    result.className = won ? `winner-${this.team}` : '';
    overlay.classList.remove('hidden');
  }

  _loop() {
    if (this.running) {
      const move = this.joystick.getInput();
      const skills = this.skills.consume();
      window.lobbyNet.sendInput({
        dx: move.dx,
        dy: move.dy,
        attack: skills.attack,
        skill1: skills.skill1,
        skill2: skills.skill2
      });
      this.renderer.render();
    }
    requestAnimationFrame(() => this._loop());
  }
}

window.gameApp = new GameApp();
