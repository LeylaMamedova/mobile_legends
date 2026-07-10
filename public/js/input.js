class VirtualJoystick {
  constructor(zoneEl, knobEl) {
    this.zone = zoneEl;
    this.knob = knobEl;
    this.active = false;
    this.dx = 0;
    this.dy = 0;
    this.maxRadius = 42;
    this._bind();
  }

  _bind() {
    this.zone.addEventListener('touchstart', (e) => this._start(e), { passive: false });
    this.zone.addEventListener('touchmove', (e) => this._move(e), { passive: false });
    this.zone.addEventListener('touchend', () => this._end());
    this.zone.addEventListener('touchcancel', () => this._end());

    this.zone.addEventListener('mousedown', (e) => {
      this.active = true;
      this._updateFromPoint(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      this._updateFromPoint(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => this._end());
  }

  _start(e) {
    e.preventDefault();
    this.active = true;
    const t = e.touches[0];
    this._updateFromPoint(t.clientX, t.clientY);
  }

  _move(e) {
    e.preventDefault();
    if (!this.active) return;
    const t = e.touches[0];
    this._updateFromPoint(t.clientX, t.clientY);
  }

  _end() {
    this.active = false;
    this.dx = 0;
    this.dy = 0;
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  _updateFromPoint(clientX, clientY) {
    const rect = this.zone.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let ox = clientX - cx;
    let oy = clientY - cy;
    const dist = Math.hypot(ox, oy);
    if (dist > this.maxRadius) {
      ox = (ox / dist) * this.maxRadius;
      oy = (oy / dist) * this.maxRadius;
    }
    this.knob.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
    this.dx = ox / this.maxRadius;
    this.dy = oy / this.maxRadius;
  }

  getInput() {
    return { dx: this.dx, dy: this.dy };
  }
}

class SkillButtons {
  constructor(buttonIds) {
    this.pending = { attack: false, skill1: false, skill2: false };
    for (const [key, id] of Object.entries(buttonIds)) {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.pending[key] = true;
      });
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.pending[key] = true;
      });
    }
  }

  consume() {
    const out = { ...this.pending };
    this.pending = { attack: false, skill1: false, skill2: false };
    return out;
  }
}

window.VirtualJoystick = VirtualJoystick;
window.SkillButtons = SkillButtons;
