/* global THREE */

const MLBB = {
  grass: 0x3d8b5a,
  grassDark: 0x2a6b42,
  lane: 0xd4b896,
  laneEdge: 0xa08050,
  river: 0x3a9ec4,
  bush: 0x1f6b3a,
  blue: 0x00b4d8,
  blueDark: 0x0077b6,
  red: 0xff6b6b,
  redDark: 0xc92a2a,
  gold: 0xffd700,
  sky: 0x6ecff6
};

function makeCanvasTexture(drawFn, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  drawFn(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = null;
    this.prevState = null;
    this.myPlayerId = null;
    this.map = null;
    this.meshes = { heroes: new Map(), minions: new Map(), towers: new Map() };
    this.effects = [];
    this.projectiles = [];
    this.floatingDamage = [];
    this.attackBeams = [];
    this.time = 0;
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
    this.scene.background = new THREE.Color(MLBB.sky);
    this.scene.fog = new THREE.Fog(MLBB.sky, 70, 130);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.5, 200);
    this.camera.position.set(45, 48, 62);
    this.camera.lookAt(45, 0, 30);

    this.gl = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.gl.setSize(window.innerWidth, window.innerHeight);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.add(new THREE.AmbientLight(0xfff0d0, 0.65));
    this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x3d6b4f, 0.45));

    this.sun = new THREE.DirectionalLight(0xfff8e7, 1.2);
    this.sun.position.set(40, 60, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -55;
    this.sun.shadow.camera.right = 55;
    this.sun.shadow.camera.top = 55;
    this.sun.shadow.camera.bottom = -55;
    this.scene.add(this.sun);

    this.heroLight = new THREE.PointLight(MLBB.gold, 0, 10);
    this.scene.add(this.heroLight);

    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);
    this.unitsGroup = new THREE.Group();
    this.scene.add(this.unitsGroup);
    this.effectsGroup = new THREE.Group();
    this.scene.add(this.effectsGroup);

    this.cameraTarget = new THREE.Vector3(45, 0, 30);
    this._textures = this._createTextures();
  }

  _createTextures() {
    const grass = makeCanvasTexture((ctx, s) => {
      ctx.fillStyle = '#3d8b5a';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = `rgba(${30 + Math.random() * 40},${100 + Math.random() * 60},${50 + Math.random() * 30},0.4)`;
        ctx.fillRect(Math.random() * s, Math.random() * s, 2, 4);
      }
    });
    grass.repeat.set(8, 5);

    const stone = makeCanvasTexture((ctx, s) => {
      ctx.fillStyle = '#d4b896';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `rgba(120,90,50,${0.1 + Math.random() * 0.2})`;
        ctx.beginPath();
        ctx.arc(Math.random() * s, Math.random() * s, 4 + Math.random() * 8, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    stone.repeat.set(12, 1);

    return { grass, stone };
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.gl) this.gl.setSize(w, h);
  }

  resize() { this._onResize(); }

  setMap(map) {
    if (this.map) return;
    this.map = map;
    this._buildMap(map);
  }

  _buildMap(map) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(map.width, map.height),
      new THREE.MeshStandardMaterial({ map: this._textures.grass, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(map.width / 2, 0, map.height / 2);
    ground.receiveShadow = true;
    this.mapGroup.add(ground);

    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(6, map.height),
      new THREE.MeshStandardMaterial({ color: MLBB.river, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.85 })
    );
    river.rotation.x = -Math.PI / 2;
    river.position.set(map.width / 2, 0.02, map.height / 2);
    this.mapGroup.add(river);

    for (const lane of map.lanes) {
      const laneMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(map.width, 6),
        new THREE.MeshStandardMaterial({ map: this._textures.stone, roughness: 0.8 })
      );
      laneMesh.rotation.x = -Math.PI / 2;
      laneMesh.position.set(map.width / 2, 0.06, lane.y);
      laneMesh.receiveShadow = true;
      this.mapGroup.add(laneMesh);

      for (const side of [-3.8, 3.8]) {
        const edge = new THREE.Mesh(
          new THREE.PlaneGeometry(map.width, 0.6),
          new THREE.MeshStandardMaterial({ color: MLBB.laneEdge })
        );
        edge.rotation.x = -Math.PI / 2;
        edge.position.set(map.width / 2, 0.08, lane.y + side);
        this.mapGroup.add(edge);
      }
    }

    [[24, 22, 10, 14], [24, 38, 10, 14], [56, 22, 10, 14], [56, 38, 10, 14]].forEach(([x, z, w, h]) => {
      const bush = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshStandardMaterial({ color: MLBB.bush, roughness: 1 })
      );
      bush.rotation.x = -Math.PI / 2;
      bush.position.set(x, 0.05, z);
      this.mapGroup.add(bush);
      for (let i = 0; i < 6; i++) this._addBushCluster(x + (Math.random() - 0.5) * w, z + (Math.random() - 0.5) * h);
      for (let i = 0; i < 3; i++) this._addTree(x + (Math.random() - 0.5) * w, z + (Math.random() - 0.5) * h);
    });

    this._addBase(3, 30, 'blue');
    this._addBase(87, 30, 'red');
  }

  _addBushCluster(x, z) {
    for (let i = 0; i < 4; i++) {
      const bush = new THREE.Mesh(
        new THREE.SphereGeometry(0.5 + Math.random() * 0.3, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x2d8a50, roughness: 1 })
      );
      bush.position.set(x + (Math.random() - 0.5) * 1.5, 0.4, z + (Math.random() - 0.5) * 1.5);
      bush.scale.y = 0.7;
      this.mapGroup.add(bush);
    }
  }

  _addTree(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 1.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b4423 })
    );
    trunk.position.y = 0.7;
    trunk.castShadow = true;
    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x228b3b })
    );
    leaves.position.y = 2;
    leaves.scale.y = 1.3;
    leaves.castShadow = true;
    g.add(trunk, leaves);
    g.position.set(x, 0, z);
    this.mapGroup.add(g);
  }

  _addBase(x, z, team) {
    const isBlue = team === 'blue';
    const g = new THREE.Group();
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(3.5, 4, 0.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.4, roughness: 0.5 })
    );
    platform.position.y = 0.4;
    platform.castShadow = true;

    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(2.2, 0),
      new THREE.MeshStandardMaterial({
        color: isBlue ? 0x00d4ff : 0xff4444,
        emissive: isBlue ? 0x0099cc : 0xcc2222,
        emissiveIntensity: 0.7,
        metalness: 0.3,
        roughness: 0.2,
        transparent: true,
        opacity: 0.9
      })
    );
    crystal.position.y = 3.5;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.8, 0.15, 8, 24),
      new THREE.MeshStandardMaterial({ color: MLBB.gold, emissive: 0xaa8800, emissiveIntensity: 0.5, metalness: 0.8 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.2;

    const light = new THREE.PointLight(isBlue ? 0x00d4ff : 0xff4444, 1.2, 12);
    light.position.y = 3;

    g.add(platform, ring, crystal, light);
    g.position.set(x, 0, z);
    this.mapGroup.add(g);
  }

  _makeHeroMesh(hero) {
    const g = new THREE.Group();
    const isBlue = hero.team === 'blue';
    const isMage = hero.heroType === 'mage';
    const primary = isMage ? 0x9b59b6 : (isBlue ? MLBB.blue : MLBB.red);
    const dark = isMage ? 0x6c3483 : (isBlue ? MLBB.blueDark : MLBB.redDark);

    const aura = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.3, 32),
      new THREE.MeshBasicMaterial({ color: primary, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.08;
    g.add(aura);

    const legs = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.8, 0.5),
      new THREE.MeshStandardMaterial({ color: dark, roughness: 0.6 })
    );
    legs.position.y = 0.5;

    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 1.1, 0.6),
      new THREE.MeshStandardMaterial({ color: primary, emissive: primary, emissiveIntensity: 0.15, metalness: 0.3, roughness: 0.4 })
    );
    torso.position.y = 1.4;
    torso.castShadow = true;

    const shoulderL = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshStandardMaterial({ color: MLBB.gold, metalness: 0.7, roughness: 0.3 })
    );
    shoulderL.position.set(-0.65, 1.7, 0);
    const shoulderR = shoulderL.clone();
    shoulderR.position.x = 0.65;

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.5 })
    );
    head.position.y = 2.3;

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.44, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: isMage ? 0xeeeeff : (isBlue ? 0x334466 : 0x553333) })
    );
    hair.position.y = 2.45;

    const cape = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.6),
      new THREE.MeshStandardMaterial({ color: dark, side: THREE.DoubleSide, roughness: 0.8 })
    );
    cape.position.set(0, 1.3, -0.35);
    cape.rotation.x = 0.15;

    if (isMage) {
      const staff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 2.4, 6),
        new THREE.MeshStandardMaterial({ color: 0xdaa520, metalness: 0.6 })
      );
      staff.position.set(0.8, 1.6, 0);
      staff.rotation.z = -0.2;
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xcc66ff, emissive: 0xaa44ff, emissiveIntensity: 1 })
      );
      orb.position.set(0.95, 2.6, 0);
      g.add(staff, orb);
    } else {
      const sword = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 1.6, 0.25),
        new THREE.MeshStandardMaterial({ color: 0xeeeeff, metalness: 0.9, roughness: 0.1 })
      );
      sword.position.set(0.85, 1.5, 0);
      sword.rotation.z = -0.4;
      g.add(sword);
    }

    const glow = new THREE.PointLight(primary, 0.5, 5);
    glow.position.y = 1.8;

    g.add(aura, legs, torso, shoulderL, shoulderR, head, hair, cape, glow);
    g.userData.aura = aura;
    return g;
  }

  _makeMinionMesh(team) {
    const g = new THREE.Group();
    const isBlue = team === 'blue';
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.4, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: isBlue ? MLBB.blue : MLBB.red })
    );
    body.position.y = 0.55;
    body.castShadow = true;
    const helm = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: isBlue ? MLBB.blueDark : MLBB.redDark, metalness: 0.4 })
    );
    helm.position.y = 1.0;
    const shield = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.6, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.5 })
    );
    shield.position.set(0.45, 0.6, 0);
    g.add(body, helm, shield);
    return g;
  }

  _makeTowerMesh(team) {
    const g = new THREE.Group();
    const isBlue = team === 'blue';
    const col = isBlue ? MLBB.blue : MLBB.red;

    const foundation = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 2.2, 0.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x777788, metalness: 0.3 })
    );
    foundation.position.y = 0.3;

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.3, 2.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x9999aa, metalness: 0.4, roughness: 0.5 })
    );
    pillar.position.y = 1.8;
    pillar.castShadow = true;

    const turret = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.2, 1.6),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.2, metalness: 0.5 })
    );
    turret.position.y = 3.5;

    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.7, 0),
      new THREE.MeshStandardMaterial({
        color: isBlue ? 0x66eeff : 0xff8888,
        emissive: isBlue ? 0x00ccff : 0xff3333,
        emissiveIntensity: 1
      })
    );
    crystal.position.y = 4.8;
    crystal.userData.spin = true;

    const beam = new THREE.PointLight(col, 0.8, 8);
    beam.position.y = 4;

    g.add(foundation, pillar, turret, crystal, beam);
    g.userData.crystal = crystal;
    return g;
  }

  setState(state, prevState = null) {
    this.prevState = prevState;
    this.state = state;
    if (state?.map && !this.map) this.setMap(state.map);

    if (state?.damageEvents?.length) {
      for (const d of state.damageEvents) {
        this.floatingDamage.push({ x: d.x, y: d.y, amount: d.amount, life: 1.2 });
        this._spawnHitBurst(d.x, d.y);
      }
    }
    if (state?.attackEvents?.length) {
      for (const a of state.attackEvents) {
        this._spawnProjectile(a);
      }
    }
  }

  setPlayerId(id) { this.myPlayerId = id; }

  _spawnHitBurst(x, z) {
    const geo = new THREE.SphereGeometry(0.3, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 1.5, z);
    this.effectsGroup.add(m);
    this.effects.push({ mesh: m, life: 0.35, type: 'burst', scale: 1 });
  }

  _spawnProjectile(a) {
    const col = a.kind === 'tower' ? 0xff3333 : a.kind === 'hero' ? 0xffcc00 : 0xcccccc;
    const geo = new THREE.SphereGeometry(a.kind === 'tower' ? 0.35 : 0.2, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(a.fromX, 2.5, a.fromY);
    this.effectsGroup.add(m);
    this.projectiles.push({
      mesh: m, life: 1,
      fromX: a.fromX, fromY: a.fromY,
      toX: a.toX, toY: a.toY,
      progress: 0
    });
  }

  _lerpPos(id, x, y, collection, alpha) {
    if (!this.prevState || alpha >= 1) return { x, y };
    const prev = (this.prevState[collection] || []).find((e) => e.id === id);
    if (!prev) return { x, y };
    return { x: prev.x + (x - prev.x) * alpha, y: prev.y + (y - prev.y) * alpha };
  }

  _syncUnits(alpha) {
    const seen = { heroes: new Set(), minions: new Set(), towers: new Set() };

    for (const h of this.state.heroes || []) {
      seen.heroes.add(h.id);
      let mesh = this.meshes.heroes.get(h.id);
      if (!mesh) {
        mesh = this._makeHeroMesh(h);
        this.unitsGroup.add(mesh);
        this.meshes.heroes.set(h.id, mesh);
      }
      const pos = this._lerpPos(h.id, h.x, h.y, 'heroes', alpha);
      const bob = h.alive ? Math.sin(this.time * 4 + h.id.length) * 0.05 : 0;
      mesh.position.set(pos.x, bob, pos.y);
      mesh.visible = h.alive;
      if (mesh.userData.aura) {
        mesh.userData.aura.material.opacity = 0.25 + Math.sin(this.time * 3) * 0.1;
        mesh.userData.aura.scale.setScalar(1 + Math.sin(this.time * 2) * 0.05);
      }
      if (h.playerId === this.myPlayerId && h.alive) {
        this.cameraTarget.set(pos.x, 0, pos.y);
        this.heroLight.position.set(pos.x, 2, pos.y);
        this.heroLight.intensity = 0.8;
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
      if (mesh.userData.crystal) mesh.userData.crystal.rotation.y = this.time * 2;
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
    this.camera.position.set(tx + 2, 46, tz + 26);
    this.camera.lookAt(tx, 0, tz);
  }

  _updateProjectiles(dt) {
    this.projectiles = this.projectiles.filter((p) => {
      p.progress += dt * 5;
      if (p.progress >= 1) {
        this.effectsGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        return false;
      }
      p.mesh.position.x = p.fromX + (p.toX - p.fromX) * p.progress;
      p.mesh.position.z = p.fromY + (p.toY - p.fromY) * p.progress;
      p.mesh.position.y = 2.5 + Math.sin(p.progress * Math.PI) * 1.5;
      return true;
    });
  }

  _updateEffects(dt) {
    this.effects = this.effects.filter((e) => {
      e.life -= dt;
      if (e.type === 'burst') {
        const s = 1 + (0.35 - e.life) * 3;
        e.mesh.scale.setScalar(s);
        e.mesh.material.opacity = e.life / 0.35;
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

    for (const u of [...(this.state.heroes || []).filter((h) => h.alive), ...(this.state.minions || []).filter((m) => m.alive)]) {
      const pos = new THREE.Vector3(u.x, u.type === 'hero' ? 3.5 : 1.6, u.y);
      pos.project(this.camera);
      if (pos.z > 1) continue;
      const sx = (pos.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-pos.y * 0.5 + 0.5) * window.innerHeight;
      const ratio = u.hp / u.maxHp;
      const div = document.createElement('div');
      div.className = 'world-label' + (u.type === 'hero' ? ' hero-label' : ' minion-label');
      div.style.left = `${sx}px`;
      div.style.top = `${sy}px`;
      const teamClass = u.team === 'blue' ? 'team-blue' : 'team-red';
      if (u.type === 'hero') {
        div.innerHTML = `<span class="label-name ${teamClass}">${u.name}</span>
          <div class="label-hp"><div class="label-hp-fill" style="width:${ratio * 100}%"></div></div>`;
        if (u.playerId === this.myPlayerId) div.classList.add('label-me');
      } else {
        div.innerHTML = `<div class="label-hp label-hp-sm"><div class="label-hp-fill" style="width:${ratio * 100}%"></div></div>`;
      }
      this.labelsEl.appendChild(div);
    }

    for (const d of this.floatingDamage) {
      const pos = new THREE.Vector3(d.x, 2 + (1.2 - d.life) * 2.5, d.y);
      pos.project(this.camera);
      const span = document.createElement('div');
      span.className = 'damage-number';
      span.style.left = `${(pos.x * 0.5 + 0.5) * window.innerWidth}px`;
      span.style.top = `${(-pos.y * 0.5 + 0.5) * window.innerHeight}px`;
      span.style.opacity = d.life;
      span.textContent = `-${d.amount}`;
      this.labelsEl.appendChild(span);
    }
  }

  _drawMinimap() {
    if (!this.minimapCtx || !this.map || !this.state) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const mx = w / this.map.width;
    const mz = h / this.map.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#2d6b42';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3a9ec4';
    ctx.fillRect(w * 0.47, 0, w * 0.06, h);

    for (const lane of this.map.lanes) {
      ctx.fillStyle = '#d4b896';
      ctx.fillRect(0, lane.y * mz - 2, w, 4);
    }
    ctx.fillStyle = 'rgba(0,180,216,0.25)';
    ctx.fillRect(0, 0, w * 0.12, h);
    ctx.fillStyle = 'rgba(255,107,107,0.25)';
    ctx.fillRect(w * 0.88, 0, w * 0.12, h);

    for (const t of this.state.towers || []) {
      if (!t.alive) continue;
      ctx.fillStyle = t.team === 'blue' ? '#00b4d8' : '#ff6b6b';
      ctx.beginPath();
      ctx.arc(t.x * mx, t.y * mz, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const m of this.state.minions || []) {
      ctx.fillStyle = m.team === 'blue' ? '#90e0ef' : '#ffaaa5';
      ctx.fillRect(m.x * mx - 1, m.y * mz - 1, 2, 2);
    }
    for (const hero of this.state.heroes || []) {
      if (!hero.alive) continue;
      ctx.beginPath();
      ctx.arc(hero.x * mx, hero.y * mz, hero.playerId === this.myPlayerId ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = hero.team === 'blue' ? '#00b4d8' : '#ff6b6b';
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
    this.time += dt;

    this.floatingDamage = this.floatingDamage.filter((d) => { d.life -= dt * 1.2; return d.life > 0; });

    this._syncUnits(alpha);
    this._updateCamera();
    this._updateProjectiles(dt);
    this._updateEffects(dt);
    this.gl.render(this.scene, this.camera);
    this._updateLabels();
    this._drawMinimap();
  }
}

window.GameRenderer = GameRenderer;
