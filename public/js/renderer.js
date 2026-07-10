class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = null;
    this.myPlayerId = null;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    if (this.state?.map) this._calcTransform();
  }

  _calcTransform() {
    const map = this.state.map;
    const pad = 20;
    const sx = (this.canvas.width - pad * 2) / map.width;
    const sy = (this.canvas.height - pad * 2) / map.height;
    this.scale = Math.min(sx, sy);
    this.offsetX = (this.canvas.width - map.width * this.scale) / 2;
    this.offsetY = (this.canvas.height - map.height * this.scale) / 2;
  }

  setState(state) {
    this.state = state;
    if (state?.map) this._calcTransform();
  }

  setPlayerId(id) {
    this.myPlayerId = id;
  }

  worldToScreen(x, y) {
    return {
      x: this.offsetX + x * this.scale,
      y: this.offsetY + y * this.scale
    };
  }

  render() {
    if (!this.state) return;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this._drawMap();
    this._drawStructures();
    for (const m of this.state.minions || []) this._drawUnit(m, 0.35);
    for (const h of this.state.heroes || []) this._drawHero(h);
  }

  _drawMap() {
    const { ctx } = this;
    const map = this.state.map;
    const tl = this.worldToScreen(0, 0);
    const br = this.worldToScreen(map.width, map.height);

    ctx.fillStyle = '#1a2332';
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    for (const lane of map.lanes) {
      const start = this.worldToScreen(0, lane.y);
      const end = this.worldToScreen(map.width, lane.y);
      ctx.strokeStyle = '#2d3a4f';
      ctx.lineWidth = 8 * this.scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(88, 166, 255, 0.08)';
    ctx.fillRect(tl.x, tl.y, (br.x - tl.x) * 0.15, br.y - tl.y);
    ctx.fillStyle = 'rgba(248, 81, 73, 0.08)';
    ctx.fillRect(tl.x + (br.x - tl.x) * 0.85, tl.y, (br.x - tl.x) * 0.15, br.y - tl.y);
  }

  _drawStructures() {
    for (const t of this.state.towers || []) {
      if (!t.alive) continue;
      this._drawStructure(t, t.team === 'blue' ? '#58a6ff' : '#f85149', 1.2);
    }
    for (const b of this.state.bases || []) {
      if (!b.alive) continue;
      this._drawStructure(b, b.team === 'blue' ? '#1f6feb' : '#da3633', 2.5);
    }
  }

  _drawStructure(s, color, size) {
    const p = this.worldToScreen(s.x, s.y);
    const r = size * this.scale;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    this.ctx.fill();
    this._drawHpBar(p.x, p.y - r - 6, s.hp, s.maxHp, r * 2);
  }

  _drawHero(h) {
    if (!h.alive) return;
    const isMe = h.playerId === this.myPlayerId;
    const p = this.worldToScreen(h.x, h.y);
    const r = 0.9 * this.scale;

    if (isMe) {
      this.ctx.strokeStyle = '#ffd700';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    this.ctx.fillStyle = h.color || (h.team === 'blue' ? '#58a6ff' : '#f85149');
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#fff';
    this.ctx.font = `${Math.max(10, 10 * this.scale)}px sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(h.name, p.x, p.y - r - 8);

    this._drawHpBar(p.x, p.y - r - 4, h.hp, h.maxHp, r * 2.5);
  }

  _drawUnit(u, size) {
    if (!u.alive) return;
    const p = this.worldToScreen(u.x, u.y);
    const r = size * this.scale;
    this.ctx.fillStyle = u.team === 'blue' ? '#79c0ff' : '#ffa198';
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    this.ctx.fill();
    this._drawHpBar(p.x, p.y - r - 3, u.hp, u.maxHp, r * 2);
  }

  _drawHpBar(x, y, hp, maxHp, width) {
    const h = 4;
    const ratio = Math.max(0, hp / maxHp);
    this.ctx.fillStyle = '#21262d';
    this.ctx.fillRect(x - width / 2, y, width, h);
    this.ctx.fillStyle = ratio > 0.5 ? '#3fb950' : ratio > 0.25 ? '#d29922' : '#f85149';
    this.ctx.fillRect(x - width / 2, y, width * ratio, h);
  }
}

window.GameRenderer = GameRenderer;
