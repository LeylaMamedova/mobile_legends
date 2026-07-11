const HERO_DATA = {
  fighter: {
    name: 'Warrior', role: 'Fighter',
    desc: 'Tank · High HP · Melee',
    portrait: 'linear-gradient(135deg, #2e86de, #1a5276)',
    skill1: 'Smash', skill2: 'Shield'
  },
  mage: {
    name: 'Sorceress', role: 'Mage',
    desc: 'Burst · Ranged · AOE',
    portrait: 'linear-gradient(135deg, #9b59b6, #5b2c6f)',
    skill1: 'Lightning', skill2: 'Nova'
  },
  assassin: {
    name: 'Shadow', role: 'Assassin',
    desc: 'Burst · Fast · Dive',
    portrait: 'linear-gradient(135deg, #6c5ce7, #2d3436)',
    skill1: 'Dash', skill2: 'Execute'
  },
  marksman: {
    name: 'Ranger', role: 'Marksman',
    desc: 'Ranged · DPS · Kite',
    portrait: 'linear-gradient(135deg, #e17055, #d63031)',
    skill1: 'Arrow', skill2: 'Rain'
  }
};

const SHOP_ITEMS = [
  { id: 'blade', name: 'Blade of Despair', cost: 300, stat: '+40 ATK', icon: '⚔' },
  { id: 'wings', name: 'Blood Wings', cost: 250, stat: '+350 HP', icon: '🪽' },
  { id: 'wand', name: 'Magic Wand', cost: 220, stat: '+50 Skill DMG', icon: '✦' },
  { id: 'boots', name: 'Swift Boots', cost: 180, stat: '+Speed', icon: '👟' }
];

window.HERO_DATA = HERO_DATA;
window.SHOP_ITEMS = SHOP_ITEMS;
