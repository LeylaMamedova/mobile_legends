const Team = {
  BLUE: 'blue',
  RED: 'red'
};

const HeroType = {
  FIGHTER: 'fighter',
  MAGE: 'mage'
};

const HERO_STATS = {
  [HeroType.FIGHTER]: {
    maxHp: 1200,
    moveSpeed: 4.2,
    attackDamage: 65,
    attackRange: 2.2,
    attackCooldown: 0.8,
    skill1Damage: 120,
    skill1Cooldown: 6,
    skill2Damage: 80,
    skill2Cooldown: 10,
    color: '#4a90d9'
  },
  [HeroType.MAGE]: {
    maxHp: 900,
    moveSpeed: 3.8,
    attackDamage: 45,
    attackRange: 5.5,
    attackCooldown: 1.0,
    skill1Damage: 150,
    skill1Cooldown: 5,
    skill2Damage: 200,
    skill2Cooldown: 12,
    color: '#9b59b6'
  }
};

const MAP = {
  width: 90,
  height: 60,
  lanes: [
    { id: 'top', y: 15, waypoints: [{ x: 8, y: 15 }, { x: 45, y: 15 }, { x: 82, y: 15 }] },
    { id: 'mid', y: 30, waypoints: [{ x: 8, y: 30 }, { x: 45, y: 30 }, { x: 82, y: 30 }] },
    { id: 'bot', y: 45, waypoints: [{ x: 8, y: 45 }, { x: 45, y: 45 }, { x: 82, y: 45 }] }
  ]
};

const SPAWN_POINTS = {
  [Team.BLUE]: [
    { x: 6, y: 15, lane: 'top' },
    { x: 6, y: 30, lane: 'mid' },
    { x: 6, y: 45, lane: 'bot' },
    { x: 10, y: 30, lane: 'mid' }
  ],
  [Team.RED]: [
    { x: 84, y: 15, lane: 'top' },
    { x: 84, y: 30, lane: 'mid' },
    { x: 84, y: 45, lane: 'bot' },
    { x: 80, y: 30, lane: 'mid' }
  ]
};

const TICK_RATE = 20;
const MINION_WAVE_INTERVAL = 25;
const RESPAWN_TIME = 8;

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nextId(prefix, counter) {
  return `${prefix}_${counter}`;
}

class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = new Map();
    this.connections = new Map();
    this.heroTypeSelections = new Map();
    this.started = false;
    this.finished = false;
    this.winner = null;
    this._matchEndSent = false;
    this.matchTime = 0;
    this.minionWaveTimer = 10;
    this.entities = { heroes: [], minions: [], towers: [], bases: [] };
    this.idCounter = 0;
    this.killFeed = [];
    this._initStructures();
  }

  _initStructures() {
    for (const lane of MAP.lanes) {
      this.entities.towers.push(this._makeTower(Team.BLUE, lane, 0.35));
      this.entities.towers.push(this._makeTower(Team.BLUE, lane, 0.65));
      this.entities.towers.push(this._makeTower(Team.RED, lane, 0.35));
      this.entities.towers.push(this._makeTower(Team.RED, lane, 0.65));
    }
    this.entities.bases.push(this._makeBase(Team.BLUE));
    this.entities.bases.push(this._makeBase(Team.RED));
  }

  _makeTower(team, lane, progress) {
    const wp = lane.waypoints;
    const x = wp[0].x + (wp[2].x - wp[0].x) * progress;
    const y = lane.y;
    return {
      id: nextId('tower', ++this.idCounter),
      type: 'tower',
      team,
      lane: lane.id,
      x,
      y,
      maxHp: 2500,
      hp: 2500,
      attackDamage: 120,
      attackRange: 7,
      attackCooldown: 1.2,
      cooldownLeft: 0,
      alive: true
    };
  }

  _makeBase(team) {
    return {
      id: nextId('base', ++this.idCounter),
      type: 'base',
      team,
      x: team === Team.BLUE ? 3 : 87,
      y: 30,
      maxHp: 5000,
      hp: 5000,
      alive: true
    };
  }

  addPlayer(playerId, ws, name) {
    if (this.started) return { ok: false, error: 'Match already started' };
    if (this.players.size >= 4) return { ok: false, error: 'Room is full (max 4 players)' };

    const team = this._assignTeam();
    this.players.set(playerId, {
      id: playerId,
      name: name || `Player${this.players.size + 1}`,
      team,
      heroType: HeroType.FIGHTER,
      ready: false,
      slot: this.players.size
    });
    this.connections.set(playerId, ws);
    this.heroTypeSelections.set(playerId, HeroType.FIGHTER);
    return { ok: true, team };
  }

  _assignTeam() {
    const blue = [...this.players.values()].filter((p) => p.team === Team.BLUE).length;
    const red = [...this.players.values()].filter((p) => p.team === Team.RED).length;
    return blue <= red ? Team.BLUE : Team.RED;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.connections.delete(playerId);
    this.heroTypeSelections.delete(playerId);
    const hero = this.entities.heroes.find((h) => h.playerId === playerId);
    if (hero) hero.alive = false;
  }

  setHeroType(playerId, heroType) {
    if (!HERO_STATS[heroType]) return false;
    const player = this.players.get(playerId);
    if (!player || this.started) return false;
    player.heroType = heroType;
    this.heroTypeSelections.set(playerId, heroType);
    return true;
  }

  setReady(playerId, ready) {
    const player = this.players.get(playerId);
    if (!player || this.started) return false;
    player.ready = ready;
    return true;
  }

  canStart() {
    if (this.players.size < 2) return false;
    return [...this.players.values()].every((p) => p.ready);
  }

  startMatch() {
    if (!this.canStart()) return false;
    this.started = true;
    this.matchTime = 0;
    this.minionWaveTimer = 8;
    this.entities.heroes = [];
    this.entities.minions = [];
    this.killFeed = [];
    this.finished = false;
    this.winner = null;
    this._matchEndSent = false;

    let slotIndex = { [Team.BLUE]: 0, [Team.RED]: 0 };
    for (const player of this.players.values()) {
      const spawns = SPAWN_POINTS[player.team];
      const spawn = spawns[slotIndex[player.team]++ % spawns.length];
      this.entities.heroes.push(this._spawnHero(player, spawn));
    }
    return true;
  }

  _spawnHero(player, spawn) {
    const stats = HERO_STATS[player.heroType];
    return {
      id: nextId('hero', ++this.idCounter),
      type: 'hero',
      playerId: player.id,
      name: player.name,
      heroType: player.heroType,
      team: player.team,
      x: spawn.x,
      y: spawn.y,
      lane: spawn.lane,
      maxHp: stats.maxHp,
      hp: stats.maxHp,
      moveSpeed: stats.moveSpeed,
      attackDamage: stats.attackDamage,
      attackRange: stats.attackRange,
      attackCooldown: stats.attackCooldown,
      attackCooldownLeft: 0,
      skill1CooldownLeft: 0,
      skill2CooldownLeft: 0,
      slot: player.slot,
      gold: 300,
      kills: 0,
      deaths: 0,
      alive: true,
      respawnTimer: 0,
      input: { dx: 0, dy: 0 },
      color: stats.color
    };
  }

  handleInput(playerId, input) {
    const hero = this.entities.heroes.find((h) => h.playerId === playerId && h.alive);
    if (!hero) return;
    hero.input.dx = clamp(input.dx ?? 0, -1, 1);
    hero.input.dy = clamp(input.dy ?? 0, -1, 1);
    if (input.attack) this._heroAttack(hero);
    if (input.skill1) this._heroSkill(hero, 1);
    if (input.skill2) this._heroSkill(hero, 2);
  }

  _heroAttack(hero) {
    if (hero.attackCooldownLeft > 0) return;
    const target = this._findTarget(hero, hero.attackRange, hero.team);
    if (!target) return;
    this._dealDamage(hero, target, hero.attackDamage);
    hero.attackCooldownLeft = hero.attackCooldown;
  }

  _heroSkill(hero, skillNum) {
    const stats = HERO_STATS[hero.heroType];
    if (skillNum === 1) {
      if (hero.skill1CooldownLeft > 0) return;
      const target = this._findTarget(hero, hero.attackRange + 2, hero.team);
      if (target) this._dealDamage(hero, target, stats.skill1Damage);
      hero.skill1CooldownLeft = stats.skill1Cooldown;
    } else if (skillNum === 2) {
      if (hero.skill2CooldownLeft > 0) return;
      const enemies = this._enemiesInRadius(hero, 4, hero.team);
      for (const e of enemies) this._dealDamage(hero, e, stats.skill2Damage);
      hero.skill2CooldownLeft = stats.skill2Cooldown;
    }
  }

  _findTarget(hero, range, team) {
    const enemies = [
      ...this.entities.heroes.filter((h) => h.alive && h.team !== team),
      ...this.entities.minions.filter((m) => m.alive && m.team !== team),
      ...this.entities.towers.filter((t) => t.alive && t.team !== team),
      ...this.entities.bases.filter((b) => b.alive && b.team !== team)
    ];
    let best = null;
    let bestDist = range;
    for (const e of enemies) {
      const d = dist(hero, e);
      if (d <= bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  _enemiesInRadius(hero, radius, team) {
    return [
      ...this.entities.heroes.filter((h) => h.alive && h.team !== team && dist(hero, h) <= radius),
      ...this.entities.minions.filter((m) => m.alive && m.team !== team && dist(hero, m) <= radius)
    ];
  }

  _dealDamage(attacker, target, amount) {
    if (!target || !target.alive) return;
    target.hp -= amount;
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      if (target.type === 'hero') {
        target.deaths += 1;
        target.respawnTimer = RESPAWN_TIME;
        if (attacker.type === 'hero') {
          attacker.kills += 1;
          attacker.gold += 200;
        }
        this._pushKillFeed(attacker, target);
      } else if (target.type === 'minion' && attacker.type === 'hero') {
        attacker.gold += 40;
      } else if (target.type === 'tower' && attacker.type === 'hero') {
        attacker.gold += 150;
      } else if (target.type === 'base') {
        this.finished = true;
        this.winner = attacker.team;
        this._pushKillFeed(attacker, target, true);
      }
    }
  }

  _pushKillFeed(killer, victim, isBase = false) {
    this.killFeed.unshift({
      killer: killer.name || killer.team,
      victim: isBase ? `${victim.team} base` : victim.name || victim.type,
      time: this.matchTime
    });
    this.killFeed = this.killFeed.slice(0, 5);
  }

  tick(dt) {
    if (!this.started || this.finished) return;
    this.matchTime += dt;
    this.minionWaveTimer -= dt;

    if (this.minionWaveTimer <= 0) {
      this._spawnMinionWave();
      this.minionWaveTimer = MINION_WAVE_INTERVAL;
    }

    for (const hero of this.entities.heroes) {
      if (hero.alive) {
        this._moveHero(hero, dt);
        hero.attackCooldownLeft = Math.max(0, hero.attackCooldownLeft - dt);
        hero.skill1CooldownLeft = Math.max(0, hero.skill1CooldownLeft - dt);
        hero.skill2CooldownLeft = Math.max(0, hero.skill2CooldownLeft - dt);
      } else {
        hero.respawnTimer -= dt;
        if (hero.respawnTimer <= 0) this._respawnHero(hero);
      }
    }

    for (const minion of this.entities.minions) {
      if (!minion.alive) continue;
      this._updateMinion(minion, dt);
    }

    for (const tower of this.entities.towers) {
      if (!tower.alive) continue;
      tower.cooldownLeft = Math.max(0, tower.cooldownLeft - dt);
      if (tower.cooldownLeft <= 0) this._towerAttack(tower);
    }
  }

  _moveHero(hero, dt) {
    const len = Math.hypot(hero.input.dx, hero.input.dy);
    if (len < 0.01) return;
    const nx = hero.input.dx / len;
    const ny = hero.input.dy / len;
    hero.x = clamp(hero.x + nx * hero.moveSpeed * dt, 1, MAP.width - 1);
    hero.y = clamp(hero.y + ny * hero.moveSpeed * dt, 1, MAP.height - 1);
  }

  _respawnHero(hero) {
    const player = this.players.get(hero.playerId);
    const spawns = SPAWN_POINTS[player.team];
    const spawn = spawns[hero.slot % spawns.length] || spawns[0];
    hero.x = spawn.x;
    hero.y = spawn.y;
    hero.hp = hero.maxHp;
    hero.alive = true;
    hero.respawnTimer = 0;
  }

  _spawnMinionWave() {
    for (const lane of MAP.lanes) {
      this.entities.minions.push(this._makeMinion(Team.BLUE, lane));
      this.entities.minions.push(this._makeMinion(Team.RED, lane));
    }
    this.entities.minions = this.entities.minions.filter((m) => m.alive);
  }

  _makeMinion(team, lane) {
    const start = team === Team.BLUE ? lane.waypoints[0] : lane.waypoints[2];
    return {
      id: nextId('minion', ++this.idCounter),
      type: 'minion',
      team,
      lane: lane.id,
      waypointIndex: 0,
      waypoints: team === Team.BLUE ? lane.waypoints : [...lane.waypoints].reverse(),
      x: start.x,
      y: start.y,
      maxHp: 400,
      hp: 400,
      attackDamage: 25,
      attackRange: 1.5,
      attackCooldown: 1.0,
      attackCooldownLeft: 0,
      moveSpeed: 2.5,
      alive: true
    };
  }

  _updateMinion(minion, dt) {
    minion.attackCooldownLeft = Math.max(0, minion.attackCooldownLeft - dt);
    const enemy = this._findTarget(minion, minion.attackRange, minion.team);
    if (enemy) {
      if (minion.attackCooldownLeft <= 0) {
        this._dealDamage(minion, enemy, minion.attackDamage);
        minion.attackCooldownLeft = minion.attackCooldown;
      }
      return;
    }

    const wp = minion.waypoints[minion.waypointIndex];
    if (!wp) return;
    const d = dist(minion, wp);
    if (d < 0.5) {
      minion.waypointIndex += 1;
      return;
    }
    const nx = (wp.x - minion.x) / d;
    const ny = (wp.y - minion.y) / d;
    minion.x += nx * minion.moveSpeed * dt;
    minion.y += ny * minion.moveSpeed * dt;
  }

  _towerAttack(tower) {
    const minions = this.entities.minions.filter((m) => m.alive && m.team !== tower.team && dist(tower, m) <= tower.attackRange);
    const heroes = this.entities.heroes.filter((h) => h.alive && h.team !== tower.team && dist(tower, h) <= tower.attackRange);
    const target = minions[0] || heroes[0];
    if (!target) return;
    this._dealDamage(tower, target, tower.attackDamage);
    tower.cooldownLeft = tower.attackCooldown;
  }

  getLobbyState() {
    return {
      roomId: this.id,
      started: this.started,
      finished: this.finished,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        heroType: p.heroType,
        ready: p.ready
      }))
    };
  }

  getGameState() {
    return {
      roomId: this.id,
      matchTime: Math.floor(this.matchTime),
      started: this.started,
      finished: this.finished,
      winner: this.winner,
      map: MAP,
      heroes: this.entities.heroes,
      minions: this.entities.minions.filter((m) => m.alive),
      towers: this.entities.towers,
      bases: this.entities.bases,
      killFeed: this.killFeed
    };
  }
}

module.exports = {
  GameRoom,
  Team,
  HeroType,
  HERO_STATS,
  MAP,
  TICK_RATE
};
