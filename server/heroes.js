const HeroType = {
  FIGHTER: 'fighter',
  MAGE: 'mage',
  ASSASSIN: 'assassin',
  MARKSMAN: 'marksman'
};

const HERO_STATS = {
  [HeroType.FIGHTER]: {
    displayName: 'Warrior',
    role: 'Fighter',
    maxHp: 2800,
    maxMana: 500,
    moveSpeed: 4.0,
    attackDamage: 120,
    attackRange: 2.5,
    attackCooldown: 0.85,
    skill1Damage: 220,
    skill1Cooldown: 6,
    skill2Damage: 150,
    skill2Cooldown: 10,
    color: '#2e86de',
    modelColor: 0x2e86de
  },
  [HeroType.MAGE]: {
    displayName: 'Sorceress',
    role: 'Mage',
    maxHp: 2200,
    maxMana: 800,
    moveSpeed: 3.6,
    attackDamage: 90,
    attackRange: 6.0,
    attackCooldown: 1.0,
    skill1Damage: 280,
    skill1Cooldown: 5,
    skill2Damage: 350,
    skill2Cooldown: 12,
    color: '#9b59b6',
    modelColor: 0x9b59b6
  },
  [HeroType.ASSASSIN]: {
    displayName: 'Shadow',
    role: 'Assassin',
    maxHp: 2000,
    maxMana: 600,
    moveSpeed: 4.8,
    attackDamage: 140,
    attackRange: 2.2,
    attackCooldown: 0.7,
    skill1Damage: 260,
    skill1Cooldown: 7,
    skill2Damage: 200,
    skill2Cooldown: 14,
    color: '#6c5ce7',
    modelColor: 0x6c5ce7
  },
  [HeroType.MARKSMAN]: {
    displayName: 'Ranger',
    role: 'Marksman',
    maxHp: 1900,
    maxMana: 450,
    moveSpeed: 3.9,
    attackDamage: 110,
    attackRange: 7.0,
    attackCooldown: 0.75,
    skill1Damage: 180,
    skill1Cooldown: 5,
    skill2Damage: 240,
    skill2Cooldown: 11,
    color: '#e17055',
    modelColor: 0xe17055
  }
};

const SHOP_ITEMS = {
  blade: { id: 'blade', name: 'Blade of Despair', cost: 300, attack: 40, icon: '⚔' },
  wings: { id: 'wings', name: 'Blood Wings', cost: 250, hp: 350, icon: '🪽' },
  wand: { id: 'wand', name: 'Magic Wand', cost: 220, skill: 50, icon: '✦' },
  boots: { id: 'boots', name: 'Swift Boots', cost: 180, speed: 0.6, icon: '👟' }
};

module.exports = { HeroType, HERO_STATS, SHOP_ITEMS };
