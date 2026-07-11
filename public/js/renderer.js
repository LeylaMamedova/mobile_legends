class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = null;
    this.prevState = null;
    this.myPlayerId = null;
    this.map = null;
    this.scale = 1;
    this.camera = { x: 45, y: 30 };
    this.effects = [];
    this.floatingDamage = [];
    this.attackBeams = [];
    this.lastFrame = performance.now();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewW = window.innerWidth;
    this.viewH = window.innerHeight;
    this._calcScale();
  }

  _calcScale() {
    if (!this.map) return;
    const pad = 40;
    this.scale = Math.min(
      (this.viewW - pad) / 50,
      (this.viewH - pad) / 36
    );
  }

  setMap(map) {
    this.map = map;
    this._calcScale();
  }

  setState(state, prevState = null) {
    this.prevState = prevState;
    this.state = state;
    if (state?.map && !this.map) this.setMap(state.map);

    if (state?.damageEvents?.length) {
      for (const d of state.damageEvents) {
        this.floatingDamage.push({
          x: d.x, y: d.y, amount: d.amount,
          life: 1.0, vy: -2
        });
      }
    }
    if (state?.attackEvents?.length) {
      for (const a of state.attackEvents) {
        this.attackBeams.push({
          fromX: a.fromX, fromY: a.fromY,
          toX: a.toX, toY: a.toY,
          team: a.team, kind: a.kind, life: 1.0
        });
      }
    }
  }

  setPlayerId(id) {
    this.myPlayerId = id;
  }

  worldToScreen(x, y) {
    const cx = this.viewW / 2;
    const cy = this.viewH / 2;
    return {
      x: cx + (x - this.camera.x) * this.scale,
      y: cy + (y - this.camera.y) * this.scale
    };
  }

  _lerpEntity(id, x, y, collection, alpha) {
    if (!this.prevState || alpha >= 1) return { x, y };
    const prev = (this.prevState[collection] || []).find((e) => e.id === id);
    if (!prev) return { x, y };
    return {
      x: prev.x + (x - prev.x) * alpha,
      y: prev.y + (y - prev.y) * alpha
    };
  }

  _updateCamera(alpha) {
    const me = this.state?.heroes?.find((h) => h.playerId === this.myPlayerId);
    if (!me) return;
    const pos = this._lerpEntity(me.id, me.x, me.y, 'heroes', alpha);
    this.camera.x += (pos.x - this.camera.x) * 0.12;
    this.camera.y += (pos.y - this.camera.y) * 0.12;
  }

  render(alpha = 1) {
    if (!this.state || !this.map) return;
    const { ctx } = this;
    const now = performance.now();
    const dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;

    this._updateCamera(alpha);
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    this._drawBackground();
    this._drawMap(alpha);
    this._drawTowerRanges();
    this._drawStructures(alpha);
    this._drawAttackBeams(dt);
    for (const m of this.state.minions || []) this._drawMinion(m, alpha);
    for (const h of this.state.heroes || []) this._drawHero(h, alpha);
    this._drawFloatingDamage(dt);
    this._drawPlayerRange();
  }

  _drawBackground() {
    const g = this.ctx.createLinearGradient(0, 0, 0, this.viewH);
    g.addColorStop(0, '#0a1628');
    g.addColorStop(1, '#0f1f12');
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, this.viewW, this.viewH);
  }

  _drawMap(alpha) {
    const map = this.map;
    const tl = this.worldToScreen(0, 0);
    const br = this.worldToScreen(map.width, map.height);
    const w = br.x - tl.x;
    const h = br.y - tl.y;

    const grass = this.ctx.createLinearGradient(tl.x, tl.y, br.x, br.y);
    grass.addColorStop(0, '#1e4d2b');
    grass.addColorStop(0.5, '#2d6a3e');
    grass.addColorStop(1, '#1e4d2b');
    this.ctx.fillStyle = grass;
    this.ctx.fillRect(tl.x, tl.y, w, h);

    this.ctx.fillStyle = 'rgba(15, 40, 20, 0.5)';
    this.ctx.fillRect(tl.x + w * 0.28, tl.y, w * 0.12, h);
    this.ctx.fillRect(tl.x + w * 0.6, tl.y, w * 0.12, h);

    this.ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
    this.ctx.fillRect(tl.x, tl.y, w * 0.12, h);
    this.ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
    this.ctx.fillRect(tl.x + w * 0.88, tl.y, w * 0.12, h);

    for (const lane of map.lanes) {
      const start = this.worldToScreen(0, lane.y);
      const end = this.worldToScreen(map.width, lane.y);
      this.ctx.strokeStyle = '#c9a55c';
      this.ctx.lineWidth = 14 * this.scale;
      this.ctx.lineCap = 'round';
      this.ctx.globalAlpha = 0.35;
      this.ctx.beginPath();
      this.ctx.moveTo(start.x, start.y);
      this.ctx.lineTo(end.x, end.y);
      this.ctx.stroke();
      this.ctx.globalAlpha = 1;

      this.ctx.strokeStyle = '#e8d5a3';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([8, 8]);
      this.ctx.beginPath();
      this.ctx.moveTo(start.x, start.y);
      this.ctx.lineTo(end.x, end.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    this.ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(tl.x, tl.y, w, h);
  }

  _drawTowerRanges() {
    const me = this.state.heroes?.find((h) => h.playerId === this.myPlayerId && h.alive);
    if (!me) return;

    for (const tower of this.state.towers || []) {
      if (!tower.alive || tower.team === me.team) continue;
      const p = this.worldToScreen(tower.x, tower.y);
      const r = tower.attackRange * this.scale;
      const inRange = Math.hypot(me.x - tower.x, me.y - tower.y) <= tower.attackRange;

      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      this.ctx.fillStyle = inRange ? 'rgba(239, 68, 68, 0.18)' : 'rgba(239, 68, 68, 0.06)';
      this.ctx.fill();
      this.ctx.strokeStyle = inRange ? 'rgba(239, 68, 68, 0.5)' : 'rgba(239, 68, 68, 0.2)';
      this.ctx.lineWidth = inRange ? 2 : 1;
      this.ctx.stroke();
    }
  }

  _drawStructures(alpha) {
    for (const b of this.state.bases || []) {
      if (!b.alive) continue;
      this._drawBase(b);
    }
    for (const t of this.state.towers || []) {
      if (!t.alive) continue;
      this._drawTower(t);
    }
  }

  _drawBase(b) {
    const p = this.worldToScreen(b.x, b.y);
    const s = 3.2 * this.scale;
    const isBlue = b.team === 'blue';

    this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
    this.ctx.beginPath();
    this.ctx.ellipse(p.x, p.y + s * 0.4, s * 0.9, s * 0.3, 0, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = isBlue ? '#1d4ed8' : '#b91c1c';
    this.ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2);
    this.ctx.fillStyle = isBlue ? '#3b82f6' : '#ef4444';
    this.ctx.fillRect(p.x - s * 0.7, p.y - s * 1.3, s * 1.4, s * 0.8);

    this.ctx.fillStyle = '#fff';
    this.ctx.font = `bold ${Math.max(10, 11 * this.scale)}px sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.fillText('BASE', p.x, p.y - s * 1.5);
    this._drawHpBar(p.x, p.y - s * 1.8, b.hp, b.maxHp, s * 2.2, 6);
  }

  _drawTower(t) {
    const p = this.worldToScreen(t.x, t.y);
    const s = 1.4 * this.scale;
    const isBlue = t.team === 'blue';

    this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
    this.ctx.beginPath();
    this.ctx.ellipse(p.x, p.y + s * 0.3, s * 0.8, s * 0.25, 0, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = isBlue ? '#1e3a5f' : '#5f1e1e';
    this.ctx.beginPath();
    this.ctx.moveTo(p.x, p.y - s * 1.2);
    this.ctx.lineTo(p.x + s, p.y + s * 0.5);
    this.ctx.lineTo(p.x - s, p.y + s * 0.5);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.fillStyle = isBlue ? '#60a5fa' : '#f87171';
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y - s * 0.2, s * 0.45, 0, Math.PI * 2);
    this.ctx.fill();

    this._drawHpBar(p.x, p.y - s * 1.5, t.hp, t.maxHp, s * 2, 4);
  }

  _drawMinion(m, alpha) {
    const pos = this._lerpEntity(m.id, m.x, m.y, 'minions', alpha);
    const p = this.worldToScreen(pos.x, pos.y);
    const w = 0.7 * this.scale;
    const h = 0.9 * this.scale;
    const isBlue = m.team === 'blue';

    this.ctx.fillStyle = 'rgba(0,0,0,0.25)';
    this.ctx.beginPath();
    this.ctx.ellipse(p.x, p.y + h * 0.4, w * 0.8, h * 0.2, 0, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = isBlue ? '#3b82f6' : '#ef4444';
    this.ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
    this.ctx.fillStyle = isBlue ? '#93c5fd' : '#fca5a5';
    this.ctx.fillRect(p.x - w * 0.3, p.y - h * 0.7, w * 0.6, h * 0.35);

    this._drawHpBar(p.x, p.y - h * 0.9, m.hp, m.maxHp, w * 1.4, 3);
  }

  _drawHero(h, alpha) {
    const pos = this._lerpEntity(h.id, h.x, h.y, 'heroes', alpha);
    const p = this.worldToScreen(pos.x, pos.y);
    const isMe = h.playerId === this.myPlayerId;
    const r = 1.1 * this.scale;
    const isBlue = h.team === 'blue';

    if (!h.alive) {
      if (isMe) {
        this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
        this.ctx.font = `bold ${14}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`Respawning ${Math.ceil(h.respawnTimer)}s`, p.x, p.y);
      }
      return;
    }

    this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
    this.ctx.beginPath();
    this.ctx.ellipse(p.x, p.y + r * 0.5, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
    this.ctx.fill();

    if (isMe) {
      this.ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    const bodyGrad = this.ctx.createRadialGradient(p.x, p.y - r * 0.2, 0, p.x, p.y, r);
    bodyGrad.addColorStop(0, h.color || (isBlue ? '#60a5fa' : '#f87171'));
    bodyGrad.addColorStop(1, isBlue ? '#1d4ed8' : '#b91c1c');
    this.ctx.fillStyle = bodyGrad;
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#fff';
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y - r * 0.35, r * 0.35, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#fff';
    this.ctx.font = `bold ${Math.max(10, 11 * this.scale)}px sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(h.name, p.x, p.y - r - 10);

    this._drawHpBar(p.x, p.y - r - 4, h.hp, h.maxHp, r * 2.8, 5);
  }

  _drawPlayerRange() {
    const me = this.state.heroes?.find((h) => h.playerId === this.myPlayerId && h.alive);
    if (!me) return;
    const p = this.worldToScreen(me.x, me.y);
    const r = me.attackRange * this.scale;
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  _drawAttackBeams(dt) {
    this.attackBeams = this.attackBeams.filter((b) => {
      b.life -= dt * 4;
      if (b.life <= 0) return false;
      const from = this.worldToScreen(b.fromX, b.fromY);
      const to = this.worldToScreen(b.toX, b.toY);
      this.ctx.globalAlpha = b.life;
      this.ctx.strokeStyle = b.kind === 'tower' ? '#ff4444' : b.kind === 'hero' ? '#ffaa00' : '#cccccc';
      this.ctx.lineWidth = b.kind === 'tower' ? 3 : 2;
      this.ctx.beginPath();
      this.ctx.moveTo(from.x, from.y);
      this.ctx.lineTo(to.x, to.y);
      this.ctx.stroke();
      this.ctx.globalAlpha = 1;
      return true;
    });
  }

  _drawFloatingDamage(dt) {
    this.floatingDamage = this.floatingDamage.filter((d) => {
      d.life -= dt * 1.5;
      d.y += d.vy * dt * 0.5;
      if (d.life <= 0) return false;
      const p = this.worldToScreen(d.x, d.y);
      this.ctx.globalAlpha = d.life;
      this.ctx.fillStyle = '#ff6b6b';
      this.ctx.font = `bold ${Math.max(12, 14 * this.scale)}px sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`-${d.amount}`, p.x, p.y - 10);
      this.ctx.globalAlpha = 1;
      return true;
    });
  }

  _drawHpBar(x, y, hp, maxHp, width, height) {
    const ratio = Math.max(0, hp / maxHp);
    this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this.ctx.fillRect(x - width / 2, y, width, height);
    const color = ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#eab308' : '#ef4444';
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x - width / 2, y, width * ratio, height);
    this.ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x - width / 2, y, width, height);
  }
}

window.GameRenderer = GameRenderer;
