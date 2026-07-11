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
    this.deathInfo = null;

    this.INPUT_INTERVAL = 50;
    this.HUD_INTERVAL = 100;
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
      this.prevState = this.state;
      this.state = state;
      this.stateReceivedAt = performance.now();
      this.renderer.setState(state, this.prevState);
      this._onStateUpdate();
    });

    net.on('match_end', (payload) => {
      this._showMatchEnd(payload.winner);
    });
  }

  _bindUI() {
    document.getElementById('back-lobby-btn').addEventListener('click', () => {
      location.reload();
    });
    document.getElementById('death-dismiss')?.addEventListener('click', () => {
      document.getElementById('death-overlay').classList.add('hidden');
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

    if (now - this.lastHudUpdate >= this.HUD_INTERVAL) {
      this.lastHudUpdate = now;
      this._updateHud(hero);
      this._updateCooldowns(hero);
      this._updateDangerWarning(hero);
    }
  }

  _showDeath(hero) {
    const death = (this.state.deathEvents || []).find((d) => d.playerId === this.playerId);
    const killer = death?.killedBy || hero.lastHitBy || 'Unknown';
    const killerType = death?.killedByType || hero.lastHitType || 'unknown';

    let tip = 'Stay behind minions when pushing towers.';
    if (killerType === 'tower') tip = 'You walked into tower range! Towers deal heavy damage. Stay behind your minions.';
    else if (killerType === 'minion') tip = 'Minions attack when you get too close. Clear them first.';
    else if (killerType === 'hero') tip = `${killer} killed you. Watch your HP and use skills to escape.`;

    document.getElementById('death-killer').textContent = `Killed by: ${killer}`;
    document.getElementById('death-tip').textContent = tip;
    document.getElementById('death-overlay').classList.remove('hidden');
    this.deathInfo = { killer, killerType };
  }

  _flashDamage(opacity = 0.6) {
    const flash = document.getElementById('damage-flash');
    flash.classList.remove('hidden');
    flash.style.opacity = String(opacity);
    setTimeout(() => { flash.style.opacity = '0'; }, 100);
    setTimeout(() => flash.classList.add('hidden'), 300);
  }

  _updateDangerWarning(hero) {
    const warn = document.getElementById('danger-warning');
    if (!hero.alive) {
      warn.classList.add('hidden');
      document.getElementById('respawn-timer').classList.remove('hidden');
      document.getElementById('respawn-text').textContent = `Respawning in ${Math.ceil(hero.respawnTimer)}s`;
      return;
    }

    document.getElementById('respawn-timer').classList.add('hidden');
    document.getElementById('death-overlay').classList.add('hidden');

    let inTowerRange = false;
    for (const tower of this.state.towers || []) {
      if (!tower.alive || tower.team === hero.team) continue;
      const d = Math.hypot(hero.x - tower.x, hero.y - tower.y);
      if (d <= tower.attackRange) { inTowerRange = true; break; }
    }

    if (inTowerRange) {
      warn.textContent = '⚠ TOWER ATTACKING — Back away!';
      warn.classList.remove('hidden');
    } else if (hero.hp / hero.maxHp < 0.3) {
      warn.textContent = '⚠ LOW HP — Retreat!';
      warn.style.background = 'rgba(234, 179, 8, 0.9)';
      warn.classList.remove('hidden');
    } else {
      warn.style.background = '';
      warn.classList.add('hidden');
    }
  }

  _updateHud(hero) {
    const hpRatio = hero.hp / hero.maxHp;
    document.getElementById('hp-bar').style.width = `${hpRatio * 100}%`;
    document.getElementById('hp-text').textContent = `${Math.ceil(hero.hp)} / ${hero.maxHp}`;
    document.getElementById('gold-text').textContent = hero.gold;
    document.getElementById('kda-text').textContent = `${hero.kills} / ${hero.deaths}`;

    const portrait = document.getElementById('hero-portrait');
    portrait.className = hero.heroType === 'mage' ? 'mage-portrait' : 'fighter-portrait';

    const mins = Math.floor(this.state.matchTime / 60);
    const secs = this.state.matchTime % 60;
    document.getElementById('timer-text').textContent = `${mins}:${String(secs).padStart(2, '0')}`;

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
    const now = performance.now();

    if (this.running) {
      const move = this.joystick.getInput();
      const skills = this.skills.consume();

      if (now - this.lastInputSend >= this.INPUT_INTERVAL) {
        this.lastInputSend = now;
        window.lobbyNet.sendInput({
          dx: move.dx,
          dy: move.dy,
          attack: skills.attack,
          skill1: skills.skill1,
          skill2: skills.skill2
        });
      }

      const elapsed = now - this.stateReceivedAt;
      const alpha = Math.min(1, elapsed / this.INTERP_DURATION);
      this.renderer.render(alpha);
    }

    requestAnimationFrame(() => this._loop());
  }
}

window.gameApp = new GameApp();
