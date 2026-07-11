/* global THREE */
class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = null;
    this.prevState = null;
    this.myPlayerId = null;
    this.map = null;
    this.meshes = { heroes: new Map(), minions: new Map(), towers: new Map(), bases: new Map() };
    this.effects = [];
    this.floatingDamage = [];
    this.attackBeams = [];
    this.lastFrame = performance.now();
    this.labelsEl = document.getElementById('world-labels');
    this.minimapCanvas = document.getElementById('minimap');
    this.minimapCtx = this.minimapCanvas?.getContext('2d');

    this._initThree();
    window.addEventListener('resize', () => this._onResize());
  }

  _initThree() {
    if (typeof THREE === 'undefined') {
      console.error('Three.js failed to load');
      return;
    }
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 60, 120);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.5, 200);
    this.camera.position.set(45, 38, 55);
    this.camera.lookAt(45, 0, 30);

    this.gl = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.gl.setSize(window.innerWidth, window.innerHeight);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;

    this.ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xfff5e0, 1.1);
    this.sun.position.set(30, 50, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -50;
    this.sun.shadow.camera.right = 50;
    this.sun.shadow.camera.top = 50;
    this.sun.shadow.camera.bottom = -50;
    this.scene.add(this.sun);

    this.heroLight = new THREE.PointLight(0xffd700, 0, 8);
    this.scene.add(this.heroLight);

    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);
    this.unitsGroup = new THREE.Group();
    this.scene.add(this.unitsGroup);
    this.effectsGroup = new THREE.Group();
    this.scene.add(this.effectsGroup);

    this.cameraTarget = new THREE.Vector3(45, 0, 30);
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.gl) this.gl.setSize(w, h);
  }

  resize() {
    this._onResize();
  }

  setMap(map) {
    if (this.map) return;
    this.map = map;
    this._buildMap(map);
  }

  _buildMap(map) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(map.width, map.height),
      new THREE.MeshStandardMaterial({ color: 0x2d6a3e, roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(map.width / 2, 0, map.height / 2);
    ground.receiveShadow = true;
    this.mapGroup.add(ground);

    for (const lane of map.lanes) {
      const laneMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(map.width, 5),
        new THREE.MeshStandardMaterial({ color: 0xc9a55c, roughness: 0.7 })
      );
      laneMesh.rotation.x = -Math.PI / 2;
      laneMesh.position.set(map.width / 2, 0.05, lane.y);
      laneMesh.receiveShadow = true;
      this.mapGroup.add(laneMesh);
    }

    const jungleMat = new THREE.MeshStandardMaterial({ color: 0x1a4d2e, roughness: 0.95 });
    [[22, 30, 12, 40], [58, 30, 12, 40]].forEach(([x, z, w, h]) => {
      const j = new THREE.Mesh(new THREE.PlaneGeometry(w, h), jungleMat);
      j.rotation.x = -Math.PI / 2;
      j.position.set(x, 0.04, z);
      this.mapGroup.add(j);
      for (let i = 0; i < 8; i++) {
        const tree = this._makeTree();
        tree.position.set(x + (Math.random() - 0.5) * w, 0, z + (Math.random() - 0.5) * h);
        this.mapGroup.add(tree);
      }
    });

    const baseBlue = new THREE.Mesh(
      new THREE.CylinderGeometry(0, 4, 3, 4),
      new THREE.MeshStandardMaterial({ color: 0x2563eb, emissive: 0x1d4ed8, emissiveIntensity: 0.3 })
    );
    baseBlue.position.set(5, 1.5, 30);
    baseBlue.castShadow = true;
    this.mapGroup.add(baseBlue);

    const baseRed = new THREE.Mesh(
      new THREE.CylinderGeometry(0, 4, 3, 4),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xb91c1c, emissiveIntensity: 0.3 })
    );
    baseRed.position.set(85, 1.5, 30);
    baseRed.castShadow = true;
    this.mapGroup.add(baseRed);
  }

  _makeTree() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x5c3d2e })
    );
    trunk.position.y = 0.6;
    trunk.castShadow = true;
    const leaves = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 2, 8),
      new THREE.MeshStandardMaterial({ color: 0x166534 })
    );
    leaves.position.y = 2;
    leaves.castShadow = true;
    g.add(trunk, leaves);
    return g;
  }

  _makeHeroMesh(hero) {
    const g = new THREE.Group();
    const isBlue = hero.team === 'blue';
    const isMage = hero.heroType === 'mage';
    const bodyColor = isMage ? 0x9333ea : (isBlue ? 0x3b82f6 : 0xef4444);
    const emissive = isMage ? 0x7c3aed : (isBlue ? 0x1d4ed8 : 0xb91c1c);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.6, 1.6, 12),
      new THREE.MeshStandardMaterial({ color: bodyColor, emissive, emissiveIntensity: 0.35, metalness: 0.2, roughness: 0.4 })
    );
    body.position.y = 1.1;
    body.castShadow = true;

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffdbac, roughness: 0.6 })
    );
    head.position.y = 2.2;
    head.castShadow = true;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.1, 24),
      new THREE.MeshBasicMaterial({ color: isBlue ? 0x60a5fa : 0xf87171, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;

    const weapon = new THREE.Mesh(
      new THREE.BoxGeometry(isMage ? 0.15 : 0.2, isMage ? 1.8 : 1.2, isMage ? 0.15 : 0.4),
      new THREE.MeshStandardMaterial({ color: isMage ? 0xa855f7 : 0xc0c0c0, emissive: isMage ? 0x9333ea : 0x000000, emissiveIntensity: isMage ? 0.5 : 0, metalness: 0.8 })
    );
    weapon.position.set(0.6, 1.4, 0);
    if (isMage) weapon.rotation.z = -0.3;

    const glow = new THREE.PointLight(isBlue ? 0x60a5fa : 0xf87171, 0.4, 4);
    glow.position.y = 1.5;

    g.add(body, head, ring, weapon, glow);
    g.userData = { label: hero.name, isHero: true };
    return g;
  }

  _makeMinionMesh(team) {
    const g = new THREE.Group();
    const isBlue = team === 'blue';
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.9, 0.5),
      new THREE.MeshStandardMaterial({ color: isBlue ? 0x60a5fa : 0xf87171 })
    );
    body.position.y = 0.55;
    body.castShadow = true;
    g.add(body);
    return g;
  }

  _makeTowerMesh(team) {
    const g = new THREE.Group();
    const isBlue = team === 'blue';
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.5, 1, 8),
      new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.5, metalness: 0.3 })
    );
    base.position.y = 0.5;
    base.castShadow = true;

    const turret = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.8, 1.8, 8),
      new THREE.MeshStandardMaterial({
        color: isBlue ? 0x3b82f6 : 0xef4444,
        emissive: isBlue ? 0x1d4ed8 : 0xb91c1c,
        emissiveIntensity: 0.4,
        metalness: 0.5
      })
    );
    turret.position.y = 2;
    turret.castShadow = true;

    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5),
      new THREE.MeshStandardMaterial({
        color: isBlue ? 0x93c5fd : 0xfca5a5,
        emissive: isBlue ? 0x60a5fa : 0xf87171,
        emissiveIntensity: 0.8
      })
    );
    crystal.position.y = 3.2;

    g.add(base, turret, crystal);
    g.userData = { isTower: true, team };
    return g;
  }

  setState(state, prevState = null) {
    this.prevState = prevState;
    this.state = state;
    if (state?.map && !this.map) this.setMap(state.map);

    if (state?.damageEvents?.length) {
      for (const d of state.damageEvents) {
        this.floatingDamage.push({ x: d.x, y: d.y, amount: d.amount, life: 1.2, vy: -1.5 });
        this._spawnHitParticles(d.x, d.y);
      }
    }
    if (state?.attackEvents?.length) {
      for (const a of state.attackEvents) {
        this.attackBeams.push({ ...a, life: 1.0 });
      }
    }
  }

  setPlayerId(id) {
    this.myPlayerId = id;
  }

  _spawnHitParticles(x, z) {
    const count = 8;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = x + (Math.random() - 0.5) * 1.5;
      positions[i * 3 + 1] = 1 + Math.random() * 2;
      positions[i * 3 + 2] = z + (Math.random() - 0.5) * 1.5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xff6b6b, size: 0.4, transparent: true, opacity: 1 });
    const pts = new THREE.Points(geo, mat);
    this.effectsGroup.add(pts);
    this.effects.push({ mesh: pts, life: 0.6, type: 'particles' });
  }

  _lerpPos(id, x, y, collection, alpha) {
    if (!this.prevState || alpha >= 1) return { x, y };
    const prev = (this.prevState[collection] || []).find((e) => e.id === id);
    if (!prev) return { x, y };
    return { x: prev.x + (x - prev.x) * alpha, y: prev.y + (y - prev.y) * alpha };
  }

  _syncUnits(alpha) {
    const seen = { heroes: new Set(), minions: new Set(), towers: new Set(), bases: new Set() };

    for (const h of this.state.heroes || []) {
      seen.heroes.add(h.id);
      let mesh = this.meshes.heroes.get(h.id);
      if (!mesh) {
        mesh = this._makeHeroMesh(h);
        this.unitsGroup.add(mesh);
        this.meshes.heroes.set(h.id, mesh);
      }
      const pos = this._lerpPos(h.id, h.x, h.y, 'heroes', alpha);
      mesh.position.set(pos.x, 0, pos.y);
      mesh.visible = h.alive;
      if (h.playerId === this.myPlayerId && h.alive) {
        this.cameraTarget.set(pos.x, 0, pos.y);
        this.heroLight.position.set(pos.x, 2, pos.y);
        this.heroLight.intensity = 0.6;
      }
    }

    for (const m of this.state.minions || []) {
      seen.minions.add(m.id);
      let mesh = this.meshes.minions.get(m.id);
      if (!mesh) {
        mesh = this._makeMinionMesh(m.team);
        this.unitsGroup.add(mesh);
        this.meshes.minions.set(m.id, mesh);
      }
      const pos = this._lerpPos(m.id, m.x, m.y, 'minions', alpha);
      mesh.position.set(pos.x, 0, pos.y);
      mesh.visible = m.alive;
    }

    for (const t of this.state.towers || []) {
      seen.towers.add(t.id);
      let mesh = this.meshes.towers.get(t.id);
      if (!mesh) {
        mesh = this._makeTowerMesh(t.team);
        mesh.position.set(t.x, 0, t.y);
        this.unitsGroup.add(mesh);
        this.meshes.towers.set(t.id, mesh);
      }
      mesh.visible = t.alive;
    }

    for (const [type, map] of Object.entries(this.meshes)) {
      for (const [id, mesh] of map) {
        if (!seen[type]?.has(id)) {
          this.unitsGroup.remove(mesh);
          map.delete(id);
        }
      }
    }
  }

  _updateCamera() {
    const tx = this.cameraTarget.x;
    const tz = this.cameraTarget.z;
    const camX = tx + 8;
    const camZ = tz + 22;
    this.camera.position.set(camX, 32, camZ);
    this.camera.lookAt(tx, 0, tz);
  }

  _drawAttackBeams(dt) {
    this.attackBeams = this.attackBeams.filter((b) => {
      b.life -= dt * 3;
      if (b.life <= 0) return false;

      const color = b.kind === 'tower' ? 0xff3333 : b.kind === 'hero' ? 0xffaa00 : 0xaaaaaa;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(b.fromX, 2, b.fromY),
        new THREE.Vector3(b.toX, 2, b.toY)
      ]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: b.life }));
      this.effectsGroup.add(line);
      this.effects.push({ mesh: line, life: b.life * 0.3, type: 'line' });
      return false;
    });
  }

  _updateEffects(dt) {
    this.effects = this.effects.filter((e) => {
      e.life -= dt;
      if (e.mesh.material) {
        if (e.mesh.material.opacity !== undefined) e.mesh.material.opacity = e.life;
      }
      if (e.life <= 0) {
        this.effectsGroup.remove(e.mesh);
        if (e.mesh.geometry) e.mesh.geometry.dispose();
        if (e.mesh.material) e.mesh.material.dispose();
        return false;
      }
      return true;
    });
  }

  _updateLabels() {
    if (!this.labelsEl || !this.state) return;
    this.labelsEl.innerHTML = '';
    const units = [
      ...(this.state.heroes || []).filter((h) => h.alive),
      ...(this.state.minions || []).filter((m) => m.alive)
    ];

    for (const u of units) {
      const pos = new THREE.Vector3(u.x, u.type === 'hero' ? 3.2 : 1.5, u.y);
      pos.project(this.camera);
      if (pos.z > 1) continue;
      const sx = (pos.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-pos.y * 0.5 + 0.5) * window.innerHeight;

      const hpRatio = u.hp / u.maxHp;
      const div = document.createElement('div');
      div.className = 'world-label';
      div.style.left = `${sx}px`;
      div.style.top = `${sy}px`;
      if (u.type === 'hero') {
        div.innerHTML = `<span class="label-name">${u.name}</span><div class="label-hp"><div class="label-hp-fill" style="width:${hpRatio * 100}%"></div></div>`;
        if (u.playerId === this.myPlayerId) div.classList.add('label-me');
      } else {
        div.innerHTML = `<div class="label-hp label-hp-sm"><div class="label-hp-fill" style="width:${hpRatio * 100}%"></div></div>`;
      }
      this.labelsEl.appendChild(div);
    }

    for (const d of this.floatingDamage) {
      const pos = new THREE.Vector3(d.x, 2.5 + (1.2 - d.life) * 2, d.y);
      pos.project(this.camera);
      const sx = (pos.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-pos.y * 0.5 + 0.5) * window.innerHeight;
      const span = document.createElement('div');
      span.className = 'damage-number';
      span.style.left = `${sx}px`;
      span.style.top = `${sy}px`;
      span.style.opacity = d.life;
      span.textContent = `-${d.amount}`;
      this.labelsEl.appendChild(span);
    }
  }

  _drawMinimap() {
    if (!this.minimapCtx || !this.map) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const mx = w / this.map.width;
    const mz = h / this.map.height;

    ctx.fillStyle = '#1a4d2e';
    ctx.fillRect(0, 0, w, h);

    for (const lane of this.map.lanes) {
      ctx.fillStyle = '#c9a55c';
      ctx.fillRect(0, lane.y * mz - 2, w, 4);
    }

    ctx.fillStyle = 'rgba(59,130,246,0.3)';
    ctx.fillRect(0, 0, w * 0.12, h);
    ctx.fillStyle = 'rgba(239,68,68,0.3)';
    ctx.fillRect(w * 0.88, 0, w * 0.12, h);

    for (const t of this.state.towers || []) {
      if (!t.alive) continue;
      ctx.fillStyle = t.team === 'blue' ? '#3b82f6' : '#ef4444';
      ctx.fillRect(t.x * mx - 2, t.y * mz - 2, 4, 4);
    }

    for (const m of this.state.minions || []) {
      ctx.fillStyle = m.team === 'blue' ? '#93c5fd' : '#fca5a5';
      ctx.fillRect(m.x * mx - 1, m.y * mz - 1, 2, 2);
    }

    for (const hero of this.state.heroes || []) {
      if (!hero.alive) continue;
      ctx.beginPath();
      ctx.arc(hero.x * mx, hero.y * mz, hero.playerId === this.myPlayerId ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = hero.team === 'blue' ? '#60a5fa' : '#f87171';
      ctx.fill();
      if (hero.playerId === this.myPlayerId) {
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  render(alpha = 1) {
    if (!this.state || !this.map || !this.gl) return;
    const now = performance.now();
    const dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;

    this.floatingDamage = this.floatingDamage.filter((d) => {
      d.life -= dt * 1.2;
      return d.life > 0;
    });

    this._syncUnits(alpha);
    this._updateCamera();
    this._drawAttackBeams(dt);
    this._updateEffects(dt);
    this.gl.render(this.scene, this.camera);
    this._updateLabels();
    this._drawMinimap();
  }
}

window.GameRenderer = GameRenderer;
