class GameApp {
  constructor() {
    this.playerId = null;
    this.roomId = null;
    this.team = null;
    this.state = null;
    this.prevState = null;
    this.running = false;
    this.lastInputSend = 0;
    this.lastHudUpdate = 0;
    this.stateReceivedAt = 0;
    this.wasAlive = true;
    this.prevHp = null;
    this.prevKillFeedLen = 0;

    this.INPUT_INTERVAL = 50;
    this.HUD_INTERVAL = 80;
    this.INTERP_DURATION = 1000 / 12;

    this.canvas = document.getElementById('game-canvas');
    this.renderer = new GameRenderer(this.canvas);
    this.joystick = new VirtualJoystick(
      document.getElementById('joystick-zone'),
      document.getElementById('joystick-knob')
    );
    this.skills = new SkillButtons({
      attack: 'attack-btn',
      skill1: 'skill1-btn',
      skill2: 'skill2-btn',
      recall: 'recall-btn'
    });

    this._buildShop();
    this._bindNetwork();
    this._bindUI();
    this._loop();
  }

  _buildShop() {
    const container = document.getElementById('shop-items');
    container.innerHTML = '';
    for (const item of SHOP_ITEMS) {
      const btn = document.createElement('button');
      btn.className = 'shop-item';
      btn.innerHTML = `<span class="shop-icon">${item.icon}</span><span class="shop-name">${item.name}</span><span class="shop-cost">🪙${item.cost}</span><span class="shop-stat">${item.stat}</span>`;
      btn.addEventListener('click', () => window.lobbyNet.buyItem(item.id));
      container.appendChild(btn);
    }
  }

  setPlayerInfo(playerId, roomId, team) {
    this.playerId = playerId;
    this.roomId = roomId;
    this.team = team;
    this.renderer.setPlayerId(playerId);
  }

  _bindNetwork() {
    const net = window.lobbyNet;
    net.on('match_start', (state) => this._startGame(state));
    net.on('state', (state) => {
      this.prevState = this.state;
      this.state = state;
      this.stateReceivedAt = performance.now();
      this.renderer.setState(state, this.prevState);
      this._onStateUpdate();
    });
    net.on('match_end', (payload) => this._showMatchEnd(payload.winner));
  }

  _bindUI() {
    document.getElementById('back-lobby-btn').addEventListener('click', () => location.reload());
    document.getElementById('death-dismiss')?.addEventListener('click', () => {
      document.getElementById('death-overlay').classList.add('hidden');
    });
    document.getElementById('shop-btn').addEventListener('click', () => {
      document.getElementById('shop-overlay').classList.remove('hidden');
    });
    document.getElementById('shop-close').addEventListener('click', () => {
      document.getElementById('shop-overlay').classList.add('hidden');
    });
  }

  _startGame(state) {
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    this.state = state;
    this.prevState = state;
    this.stateReceivedAt = performance.now();
    if (state.map) this.renderer.setMap(state.map);
    this.renderer.setState(state);
    this.running = true;
    this.wasAlive = true;
    requestAnimationFrame(() => this.renderer.resize());
  }

  _onStateUpdate() {
    const now = performance.now();
    const hero = this.state?.heroes?.find((h) => h.playerId === this.playerId);
    if (!hero) return;

    if (this.wasAlive && !hero.alive) {
      this._showDeath(hero);
      this._flashDamage(0.6);
    } else if (this.prevHp !== null && hero.alive && hero.hp < this.prevHp) {
      this._flashDamage(0.25);
    }
    this.wasAlive = hero.alive;
    this.prevHp = hero.hp;

    const feed = this.state.killFeed || [];
    if (feed.length > this.prevKillFeedLen && feed[0]) {
      this._showKillBanner(feed[0]);
    }
    this.prevKillFeedLen = feed.length;

    if (now - this.lastHudUpdate >= this.HUD_INTERVAL) {
      this.lastHudUpdate = now;
      this._updateHud(hero);
      this._updateCooldowns(hero);
      this._updateDangerWarning(hero);
      this._updateRecall(hero);
    }
  }

  _showKillBanner(kill) {
    const banner = document.getElementById('kill-banner');
    banner.textContent = `${kill.killer} ⚔ ${kill.victim}`;
    banner.classList.remove('hidden');
    setTimeout(() => banner.classList.add('hidden'), 2000);
  }

  _showDeath(hero) {
    const death = (this.state.deathEvents || []).find((d) => d.playerId === this.playerId);
    const killer = death?.killedBy || hero.lastHitBy || 'Unknown';
    document.getElementById('death-killer').textContent = `Killed by ${killer}`;
    document.getElementById('death-tip').textContent = 'Wait for respawn or protect your base!';
    document.getElementById('death-overlay').classList.remove('hidden');
  }

  _flashDamage(opacity = 0.6) {
    const flash = document.getElementById('damage-flash');
    flash.classList.remove('hidden');
    flash.style.opacity = String(opacity);
    setTimeout(() => { flash.style.opacity = '0'; }, 100);
    setTimeout(() => flash.classList.add('hidden'), 300);
  }

  _updateRecall(hero) {
    const bar = document.getElementById('recall-bar');
    const fill = document.getElementById('recall-fill');
    if (hero.recallChannel > 0) {
      bar.classList.remove('hidden');
      fill.style.width = `${((4 - hero.recallChannel) / 4) * 100}%`;
    } else {
      bar.classList.add('hidden');
    }
  }

  _updateDangerWarning(hero) {
    const warn = document.getElementById('danger-warning');
    if (!hero.alive) {
      warn.classList.add('hidden');
      document.getElementById('respawn-timer').classList.remove('hidden');
      document.getElementById('respawn-text').textContent = `Respawn ${Math.ceil(hero.respawnTimer)}s`;
      return;
    }
    document.getElementById('respawn-timer').classList.add('hidden');
    document.getElementById('death-overlay').classList.add('hidden');

    let inTower = false;
    for (const t of this.state.towers || []) {
      if (t.alive && t.team !== hero.team && Math.hypot(hero.x - t.x, hero.y - t.y) <= t.attackRange) {
        inTower = true; break;
      }
    }
    if (inTower) {
      warn.textContent = '⚠ UNDER TOWER FIRE';
      warn.classList.remove('hidden');
    } else if (hero.hp / hero.maxHp < 0.25) {
      warn.textContent = '⚠ LOW HP';
      warn.classList.remove('hidden');
    } else {
      warn.classList.add('hidden');
    }
  }

  _updateHud(hero) {
    const hpR = hero.hp / hero.maxHp;
    const manaR = hero.mana / hero.maxMana;
    document.getElementById('hp-bar').style.width = `${hpR * 100}%`;
    document.getElementById('mana-bar').style.width = `${manaR * 100}%`;
    document.getElementById('hp-text').textContent = `${Math.ceil(hero.hp)}`;
    document.getElementById('gold-text').textContent = hero.gold;
    document.getElementById('hero-level').textContent = hero.level || 1;

    const portrait = document.getElementById('hero-portrait');
    const data = HERO_DATA[hero.heroType];
    if (data) portrait.style.background = data.portrait;

    const tk = this.state.teamKills || { blue: 0, red: 0 };
    document.getElementById('blue-kills').textContent = tk.blue;
    document.getElementById('red-kills').textContent = tk.red;

    const mins = Math.floor(this.state.matchTime / 60);
    const secs = this.state.matchTime % 60;
    document.getElementById('timer-text').textContent =
      `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const feed = document.getElementById('kill-feed');
    const entries = this.state.killFeed || [];
    if (feed.childElementCount !== entries.length) {
      feed.innerHTML = '';
      for (const k of entries) {
        const div = document.createElement('div');
        div.className = 'kill-entry';
        div.textContent = `${k.killer} → ${k.victim}`;
        feed.appendChild(div);
      }
    }
  }

  _updateCooldowns(hero) {
    this._setCD('attack-btn', hero.attackCooldownLeft);
    this._setCD('skill1-btn', hero.skill1CooldownLeft);
    this._setCD('skill2-btn', hero.skill2CooldownLeft);
    const recallBtn = document.getElementById('recall-btn');
    recallBtn.classList.toggle('on-cooldown', hero.recallCooldownLeft > 0);
  }

  _setCD(id, cd) {
    const btn = document.getElementById(id);
    let ov = btn.querySelector('.cd-overlay');
    if (cd > 0) {
      btn.classList.add('on-cooldown');
      if (!ov) { ov = document.createElement('span'); ov.className = 'cd-overlay'; btn.appendChild(ov); }
      ov.textContent = cd.toFixed(1);
    } else {
      btn.classList.remove('on-cooldown');
      if (ov) ov.remove();
    }
  }

  _showMatchEnd(winner) {
    this.running = false;
    const won = winner === this.team;
    document.getElementById('match-result').textContent = won ? 'VICTORY' : 'DEFEAT';
    document.getElementById('match-result').className = won ? 'victory' : 'defeat';
    document.getElementById('match-result-sub').textContent = won ? 'Your team destroyed the enemy base!' : 'Your base was destroyed.';
    document.getElementById('match-end-overlay').classList.remove('hidden');
  }

  _loop() {
    const now = performance.now();
    if (this.running) {
      const move = this.joystick.getInput();
      const skills = this.skills.consume();
      if (now - this.lastInputSend >= this.INPUT_INTERVAL) {
        this.lastInputSend = now;
        window.lobbyNet.sendInput({
          dx: move.dx, dy: move.dy,
          attack: skills.attack, skill1: skills.skill1, skill2: skills.skill2,
          recall: skills.recall
        });
      }
      const alpha = Math.min(1, (now - this.stateReceivedAt) / this.INTERP_DURATION);
      this.renderer.render(alpha);
    }
    requestAnimationFrame(() => this._loop());
  }
}

window.gameApp = new GameApp();
