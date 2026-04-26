(function () {
  'use strict';

  const SIZE = 10;
  const HERO_ATTACK_MS = 1500;
  const MONSTER_FILL_RATIO = 0.6;
  const GROUND_ITEMS_PER_LEVEL = 2;
  const DIRS = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];

  /** @typedef {'empty' | 'wall' | 'monster'} CellKind */
  /** @typedef {'hidden' | 'seen' | 'done'} Viz */
  /** @typedef {'fireball' | 'poison_blade' | 'lantern'} ItemId */

  /**
   * @typedef {Object} InventoryItem
   * @property {ItemId} id
   * @property {string} name
   * @property {boolean} combatOnly
   * @property {boolean} outOfCombatOnly
   * @property {number} cooldownMax
   * @property {number} cooldown
   * @property {string} description
   */

  /**
   * @typedef {Object} Cell
   * @property {Viz} viz
   * @property {CellKind} kind
   * @property {number | null} monsterLevel
   * @property {number | null} monsterHp
   * @property {number | null} monsterMaxHp
   * @property {number | null} monsterAtk
   * @property {number | null} monsterXpReward
   * @property {'fast' | 'normal' | 'slow' | null} monsterType
   * @property {number | null} monsterAttackMs
   * @property {number} poisonTicks
   * @property {number} poisonDamage
   * @property {ItemId | null} groundItem
   */

  /**
   * @typedef {Object} CombatState
   * @property {boolean} active
   * @property {number} monsterR
   * @property {number} monsterC
   * @property {number | null} rafId
   * @property {number} heroAcc
   * @property {number} enemyAcc
   * @property {number | null} lastNow
   */

  /** @type {Cell[][]} */
  let grid = [];
  let playerR = 0;
  let playerC = 0;
  let playerLevel = 1;
  let playerMaxHp = 100;
  let playerHp = 100;
  let playerAtk = 15;
  let playerXp = 0;
  let inventory = [];
  let itemGlowUntil = [0, 0, 0];

  const INVENTORY_MAX = 3;
  const ITEM_DESTROY_XP = 12;

  /** @type {CombatState} */
  const combat = {
    active: false,
    monsterR: 0,
    monsterC: 0,
    rafId: null,
    heroAcc: 0,
    enemyAcc: 0,
    lastNow: null,
  };

  const els = {
    board: /** @type {HTMLDivElement} */ (document.getElementById('board')),
    combatStrip: /** @type {HTMLDivElement} */ (document.getElementById('combat-strip')),
    combatStripLabel: document.getElementById('combat-strip-label'),
    gameOver: /** @type {HTMLDivElement} */ (document.getElementById('game-over')),
    hudLevel: document.getElementById('hud-level'),
    hudHpFill: document.getElementById('player-hp-fill'),
    hudHpText: document.getElementById('hud-hp-text'),
    hudAtk: document.getElementById('hud-atk'),
    hudXp: document.getElementById('hud-xp'),
    hudXpNext: document.getElementById('hud-xp-next'),
    hudXpFill: document.getElementById('hud-xp-fill'),
    heroAttackBarFill: document.getElementById('hero-attack-bar-fill'),
    heroAttackBarText: document.getElementById('hero-attack-bar-text'),
    enemyAttackBarFill: document.getElementById('enemy-attack-bar-fill'),
    enemyAttackBarText: document.getElementById('enemy-attack-bar-text'),
    enemySpeedLabel: document.getElementById('enemy-speed-label'),
    duelPlayerStats: document.getElementById('duel-player-stats'),
    duelEnemyName: document.getElementById('duel-enemy-name'),
    duelEnemyStats: document.getElementById('duel-enemy-stats'),
    itemsList: document.getElementById('items-list'),
    btnRestart: document.getElementById('btn-restart'),
  };

  /** @type {HTMLDivElement[][]} */
  let cellEls = [];

  function xpToNext() {
    return 4 + (playerLevel - 1) * 2;
  }

  function bonusXpForLevelGap(gap) {
    if (gap >= 3) return 6;
    if (gap === 2) return 3;
    if (gap === 1) return 1;
    return 0;
  }

  function xpFromMonster(monsterLevel) {
    const base = monsterLevel;
    const gap = monsterLevel - playerLevel;
    return base + bonusXpForLevelGap(gap);
  }

  function speedProfile(type) {
    if (type === 'fast') return { label: 'Fast', attackMs: 1000, icon: '⚡' };
    if (type === 'slow') return { label: 'Slow', attackMs: 2200, icon: '🐢' };
    return { label: 'Normal', attackMs: 1500, icon: '•' };
  }

  function randomMonsterType() {
    const roll = Math.random();
    if (roll < 0.12) return 'fast';
    if (roll < 0.88) return 'normal';
    return 'slow';
  }

  function monsterStats(level, type) {
    const speed = speedProfile(type);
    if (level >= 2) {
      if (type === 'fast') return { maxHp: 64, atk: 10, xp: 36, ...speed };
      if (type === 'slow') return { maxHp: 84, atk: 18, xp: 40, ...speed };
      return { maxHp: 72, atk: 14, xp: 35, ...speed };
    }
    if (type === 'fast') return { maxHp: 34, atk: 6, xp: 21, ...speed };
    if (type === 'slow') return { maxHp: 48, atk: 11, xp: 24, ...speed };
    return { maxHp: 40, atk: 8, xp: 20, ...speed };
  }

  function itemTemplate(id) {
    if (id === 'fireball') {
      return {
        id,
        name: 'Fireball',
        combatOnly: true,
        outOfCombatOnly: false,
        cooldownMax: 3,
        cooldown: 0,
        description: 'Deal 18 direct damage to current enemy.',
      };
    }
    if (id === 'poison_blade') {
      return {
        id,
        name: 'Poison Blade',
        combatOnly: true,
        outOfCombatOnly: false,
        cooldownMax: 4,
        cooldown: 0,
        description: 'Apply 4 turns of poison (4 damage per your attack).',
      };
    }
    return {
      id: 'lantern',
      name: 'Lantern',
      combatOnly: false,
      outOfCombatOnly: true,
      cooldownMax: 2,
      cooldown: 0,
      description: 'Reveal surrounding 8 tiles as scouted.',
    };
  }

  function itemIcon(id) {
    if (id === 'fireball') return '🔥';
    if (id === 'poison_blade') return '🗡';
    return '🏮';
  }

  function randomItemId() {
    const pool = ['fireball', 'poison_blade', 'lantern'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function grantRandomItems(count) {
    for (let i = 0; i < count; i++) {
      if (inventory.length >= INVENTORY_MAX) return;
      inventory.push(itemTemplate(randomItemId()));
    }
  }

  function randomCellOrder() {
    const out = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) out.push([r, c]);
    }
    return shuffle(out);
  }

  function placeGroundItems(count) {
    const coords = randomCellOrder();
    let placed = 0;
    for (const [r, c] of coords) {
      if (placed >= count) break;
      if (r === playerR && c === playerC) continue;
      const cell = getCell(r, c);
      if (cell.kind !== 'empty') continue;
      if (cell.groundItem != null) continue;
      cell.groundItem = randomItemId();
      placed += 1;
    }
  }

  function tickItemCooldownsByPlayerAttacks(attacks) {
    if (attacks <= 0) return;
    for (const item of inventory) {
      item.cooldown = Math.max(0, item.cooldown - attacks);
    }
  }

  function destroyItemAt(slot) {
    const idx = slot - 1;
    if (idx < 0 || idx >= inventory.length) return;
    inventory.splice(idx, 1);
    playerXp += ITEM_DESTROY_XP;
    applyXpAndLevel();
    render();
  }

  function tryPickupGroundItem(r, c) {
    const cell = getCell(r, c);
    if (!cell.groundItem) return;
    if (inventory.length >= INVENTORY_MAX) return;
    inventory.push(itemTemplate(cell.groundItem));
    cell.groundItem = null;
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function getCell(r, c) {
    return grid[r][c];
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildEmptyGrid() {
    /** @type {Cell[][]} */
    const g = [];
    for (let r = 0; r < SIZE; r++) {
      g[r] = [];
      for (let c = 0; c < SIZE; c++) {
        g[r][c] = {
          viz: 'hidden',
          kind: 'empty',
          monsterLevel: null,
          monsterHp: null,
          monsterMaxHp: null,
          monsterAtk: null,
          monsterXpReward: null,
          monsterType: null,
          monsterAttackMs: null,
          poisonTicks: 0,
          poisonDamage: 0,
          groundItem: null,
        };
      }
    }
    return g;
  }

  /** Scout orthogonally adjacent hidden tiles when a tile is cleared (done). */
  function revealAdjacentFromCompleted(r, c) {
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const n = getCell(nr, nc);
      if (n.viz === 'hidden') n.viz = 'seen';
    }
  }

  function initStartingFog() {
    const start = getCell(playerR, playerC);
    start.viz = 'done';
    revealAdjacentFromCompleted(playerR, playerC);
  }

  function monsterIsVisibleAndAlive(cell) {
    return (
      cell.kind === 'monster' &&
      cell.viz !== 'hidden' &&
      (cell.monsterHp ?? 0) > 0
    );
  }

  function orthogonalMonsterBlocksZoc() {
    for (const [dr, dc] of DIRS) {
      const nr = playerR + dr;
      const nc = playerC + dc;
      if (!inBounds(nr, nc)) continue;
      if (monsterIsVisibleAndAlive(getCell(nr, nc))) return true;
    }
    return false;
  }

  function placeMonstersAndPlayer() {
    grid = buildEmptyGrid();
    const positions = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        positions.push([r, c]);
      }
    }
    shuffle(positions);
    const start = positions.pop();
    playerR = start[0];
    playerC = start[1];

    const totalNonPlayerTiles = SIZE * SIZE - 1;
    const monsterCount = Math.floor(totalNonPlayerTiles * MONSTER_FILL_RATIO);
    for (let i = 0; i < monsterCount; i++) {
      const pos = positions.pop();
      if (!pos) break;
      const [r, c] = pos;
      const lv = Math.random() < 0.32 ? 2 : 1;
      const type = randomMonsterType();
      const st = monsterStats(lv, type);
      const cell = grid[r][c];
      cell.kind = 'monster';
      cell.monsterLevel = lv;
      cell.monsterMaxHp = st.maxHp;
      cell.monsterHp = st.maxHp;
      cell.monsterAtk = st.atk;
      cell.monsterXpReward = st.xp;
      cell.monsterType = type;
      cell.monsterAttackMs = st.attackMs;
    }

    inventory = [];
    itemGlowUntil = [0, 0, 0];
    placeGroundItems(GROUND_ITEMS_PER_LEVEL);
    initStartingFog();
  }

  function ensureDomCells() {
    els.board.innerHTML = '';
    cellEls = [];
    for (let r = 0; r < SIZE; r++) {
      cellEls[r] = [];
      for (let c = 0; c < SIZE; c++) {
        const div = document.createElement('div');
        div.className = 'cell cell--no-tile-hp';
        div.dataset.r = String(r);
        div.dataset.c = String(c);
        div.innerHTML =
          '<span class="cell__glyph"></span>' +
          '<div class="cell__hp-wrap" aria-hidden="true">' +
          '<div class="cell__hp-fill"></div></div>';
        els.board.appendChild(div);
        cellEls[r][c] = div;
      }
    }
  }

  function cellTypeClasses(cell) {
    if (cell.kind === 'wall') return ['cell--wall'];
    if (cell.kind === 'monster') {
      const speedClass =
        cell.monsterType === 'fast'
          ? 'cell--speed-fast'
          : cell.monsterType === 'slow'
            ? 'cell--speed-slow'
            : 'cell--speed-normal';
      return [cell.monsterLevel === 2 ? 'cell--monster-l2' : 'cell--monster-l1', speedClass];
    }
    return ['cell--empty'];
  }

  function healForFullyRevealedTile() {
    playerHp = Math.min(playerMaxHp, playerHp + 3);
  }

  function allMonstersDefeated() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = getCell(r, c);
        if (cell.kind === 'monster' && (cell.monsterHp ?? 0) > 0) return false;
      }
    }
    return true;
  }

  function revealAllTilesAsCompleted() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = getCell(r, c);
        cell.viz = 'done';
      }
    }
  }

  function cellClassFor(cell) {
    if (cell.viz === 'hidden') return 'cell cell--hidden cell--no-tile-hp';
    const parts = ['cell'];
    if (cell.viz === 'seen') parts.push('cell--seen');
    parts.push(...cellTypeClasses(cell));
    const showMonsterHp =
      cell.kind === 'monster' && (cell.monsterHp ?? 0) > 0 && cell.viz !== 'hidden';
    if (!showMonsterHp) parts.push('cell--no-tile-hp');
    return parts.join(' ');
  }

  function setTileHpFill(div, cell) {
    const fill = /** @type {HTMLDivElement | null} */ (div.querySelector('.cell__hp-fill'));
    if (!fill) return;
    const max = cell.monsterMaxHp ?? 1;
    const cur = Math.max(0, cell.monsterHp ?? 0);
    const ratio = max > 0 ? cur / max : 0;
    fill.style.setProperty('--hp-fill', String(Math.max(0, Math.min(1, ratio))));
  }

  function renderItems() {
    const now = Date.now();
    const rows = [];
    for (let slot = 1; slot <= INVENTORY_MAX; slot++) {
      const item = inventory[slot - 1];
      if (!item) {
        rows.push(
          `<div class="item-slot item-slot--empty"><span class="item-key">${slot}</span><span class="item-name">Empty slot</span><span class="item-meta">—</span></div>`
        );
        continue;
      }
      const mode = item.combatOnly ? 'Combat' : item.outOfCombatOnly ? 'Exploration' : 'Any';
      const cdPct = item.cooldownMax > 0 ? item.cooldown / item.cooldownMax : 0;
      const glowClass = itemGlowUntil[slot - 1] > now ? ' item-slot--used' : '';
      rows.push(
        `<div class="item-slot${glowClass}"><span class="item-key">${slot}</span><span class="item-name">${item.name}</span><span class="item-meta">${mode}</span><span class="item-cd" style="--cd:${cdPct}"><span class="item-cd__text">${item.cooldown}</span></span></div>`
      );
    }
    els.itemsList.innerHTML = rows.join('');
  }

  function render() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const div = cellEls[r][c];
        const cell = getCell(r, c);
        div.className = cellClassFor(cell);
        const glyph = div.querySelector('.cell__glyph');
        if (!glyph) continue;

        if (cell.viz === 'hidden') {
          glyph.textContent = '';
        } else if (cell.kind === 'monster' && (cell.monsterHp ?? 0) > 0) {
          const speed = speedProfile(cell.monsterType ?? 'normal');
          glyph.textContent = `L${cell.monsterLevel}${speed.icon}`;
        } else if (cell.groundItem) {
          glyph.textContent = itemIcon(cell.groundItem);
        } else {
          glyph.textContent = '';
        }

        if (r === playerR && c === playerC) {
          div.classList.add('cell--player');
          if (cell.kind === 'monster' && (cell.monsterHp ?? 0) > 0) {
            div.classList.add('cell--stacked-monster');
            const speed = speedProfile(cell.monsterType ?? 'normal');
            glyph.textContent = `@/L${cell.monsterLevel}${speed.icon}`;
          } else {
            glyph.textContent = '@';
          }
        }

        if (
          combat.active &&
          r === combat.monsterR &&
          c === combat.monsterC &&
          cell.kind === 'monster' &&
          (cell.monsterHp ?? 0) > 0
        ) {
          div.classList.add('cell--engaged');
        }

        setTileHpFill(div, cell);
      }
    }

    const hpRatio = playerMaxHp > 0 ? playerHp / playerMaxHp : 0;
    els.hudHpFill.style.setProperty('--fill', String(Math.max(0, Math.min(1, hpRatio))));
    els.hudHpText.textContent = `${Math.max(0, Math.ceil(playerHp))} / ${playerMaxHp}`;
    els.hudLevel.textContent = String(playerLevel);
    els.hudAtk.textContent = String(playerAtk);
    els.hudXp.textContent = String(playerXp);
    const next = xpToNext();
    els.hudXpNext.textContent = String(next);
    const xpRatio = next > 0 ? playerXp / next : 0;
    els.hudXpFill.style.setProperty('--fill', String(Math.max(0, Math.min(1, xpRatio))));
    renderItems();
  }

  function syncMainHudHp() {
    const hpRatio = playerMaxHp > 0 ? playerHp / playerMaxHp : 0;
    els.hudHpFill.style.setProperty('--fill', String(Math.max(0, Math.min(1, hpRatio))));
    els.hudHpText.textContent = `${Math.max(0, Math.ceil(playerHp))} / ${playerMaxHp}`;
  }

  function updateCombatStrip(heroProgress, enemyProgress) {
    const hp = Math.max(0, Math.min(1, heroProgress));
    const ep = Math.max(0, Math.min(1, enemyProgress));
    els.heroAttackBarFill.style.setProperty('--fill', String(hp));
    els.heroAttackBarText.textContent = `You ${Math.round(hp * 100)}%`;
    els.enemyAttackBarFill.style.setProperty('--fill', String(ep));
    els.enemyAttackBarText.textContent = `Foe ${Math.round(ep * 100)}%`;
    els.duelPlayerStats.textContent = `L${playerLevel} · ${Math.max(0, Math.ceil(playerHp))} HP`;
    const enemyCell = getCell(combat.monsterR, combat.monsterC);
    const enemyLevel = enemyCell.monsterLevel ?? 0;
    const enemyHp = Math.max(0, Math.ceil(enemyCell.monsterHp ?? 0));
    const speed = speedProfile(enemyCell.monsterType ?? 'normal');
    els.duelEnemyName.textContent = `Enemy ${speed.icon}`;
    els.duelEnemyStats.textContent = `L${enemyLevel} · ${enemyHp} HP`;
    syncMainHudHp();
  }

  function stopCombatRaf() {
    if (combat.rafId != null) {
      cancelAnimationFrame(combat.rafId);
      combat.rafId = null;
    }
    combat.lastNow = null;
    combat.heroAcc = 0;
    combat.enemyAcc = 0;
  }

  function disengageCombat() {
    if (!combat.active) return;
    combat.active = false;
    stopCombatRaf();
    els.combatStrip.classList.add('hidden');
    render();
  }

  function applyXpAndLevel() {
    let next = xpToNext();
    while (playerXp >= next) {
      playerXp -= next;
      playerLevel += 1;
      playerMaxHp += 25;
      playerAtk += 6;
      playerHp = playerMaxHp;
      next = xpToNext();
    }
  }

  function applyLanternReveal() {
    let revealed = 0;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (Math.abs(dr) + Math.abs(dc) > 2) continue;
        const nr = playerR + dr;
        const nc = playerC + dc;
        if (!inBounds(nr, nc)) continue;
        const cell = getCell(nr, nc);
        if (cell.viz !== 'done') {
          cell.viz = 'done';
          revealed += 1;
        }
      }
    }
    if (revealed > 0) {
      playerHp = Math.min(playerMaxHp, playerHp + revealed);
    }
  }

  function useItemAt(slot) {
    const idx = slot - 1;
    const item = inventory[idx];
    if (!item) return;
    if (item.cooldown > 0) return;
    if (item.combatOnly && !combat.active) return;
    if (item.outOfCombatOnly && combat.active) return;

    if (item.id === 'fireball') {
      const cell = getCell(combat.monsterR, combat.monsterC);
      if (cell.kind !== 'monster' || (cell.monsterHp ?? 0) <= 0) return;
      cell.monsterHp = Math.max(0, (cell.monsterHp ?? 0) - 18);
      item.cooldown = item.cooldownMax;
      itemGlowUntil[idx] = Date.now() + 450;
      if ((cell.monsterHp ?? 0) <= 0) {
        onMonsterDefeated();
      }
      render();
      return;
    }

    if (item.id === 'poison_blade') {
      const cell = getCell(combat.monsterR, combat.monsterC);
      if (cell.kind !== 'monster' || (cell.monsterHp ?? 0) <= 0) return;
      cell.poisonTicks = Math.max(cell.poisonTicks, 4);
      cell.poisonDamage = 4;
      item.cooldown = item.cooldownMax;
      itemGlowUntil[idx] = Date.now() + 450;
      render();
      return;
    }

    if (item.id === 'lantern') {
      applyLanternReveal();
      item.cooldown = item.cooldownMax;
      itemGlowUntil[idx] = Date.now() + 450;
      render();
    }
  }

  function onMonsterDefeated() {
    const cell = getCell(combat.monsterR, combat.monsterC);
    const monsterLevel = cell.monsterLevel ?? 1;
    const xp = xpFromMonster(monsterLevel);
    cell.kind = 'empty';
    cell.monsterLevel = null;
    cell.monsterHp = null;
    cell.monsterMaxHp = null;
    cell.monsterAtk = null;
    cell.monsterXpReward = null;
    cell.monsterType = null;
    cell.monsterAttackMs = null;
    cell.poisonTicks = 0;
    cell.poisonDamage = 0;
    cell.viz = 'done';
    healForFullyRevealedTile();
    playerXp += xp;
    applyXpAndLevel();
    playerR = combat.monsterR;
    playerC = combat.monsterC;
    disengageCombat();
    revealAdjacentFromCompleted(playerR, playerC);
    if (allMonstersDefeated()) {
      revealAllTilesAsCompleted();
      els.combatStrip.classList.remove('hidden');
      els.combatStripLabel.textContent = 'Level complete';
      els.enemySpeedLabel.textContent = 'All enemies defeated';
      els.heroAttackBarFill.style.setProperty('--fill', '1');
      els.enemyAttackBarFill.style.setProperty('--fill', '1');
      els.heroAttackBarText.textContent = 'You 100%';
      els.enemyAttackBarText.textContent = 'Done';
      els.duelEnemyName.textContent = 'Enemy';
      els.duelEnemyStats.textContent = 'Defeated';
    }
    render();
  }

  function onPlayerDefeated() {
    disengageCombat();
    els.gameOver.classList.remove('hidden');
    render();
  }

  function combatTick() {
    const cell = getCell(combat.monsterR, combat.monsterC);
    if (cell.kind !== 'monster' || (cell.monsterHp ?? 0) <= 0) {
      disengageCombat();
      return;
    }

    let heroHits = 0;
    let enemyHits = 0;
    while (combat.heroAcc >= HERO_ATTACK_MS) {
      combat.heroAcc -= HERO_ATTACK_MS;
      heroHits += 1;
    }
    const enemyCd = cell.monsterAttackMs ?? HERO_ATTACK_MS;
    while (combat.enemyAcc >= enemyCd) {
      combat.enemyAcc -= enemyCd;
      enemyHits += 1;
    }

    if (heroHits === 0 && enemyHits === 0) return;
    tickItemCooldownsByPlayerAttacks(heroHits);

    const mAtk = cell.monsterAtk ?? 0;
    const incoming = enemyHits * mAtk;
    const poisonHits = Math.min(heroHits, cell.poisonTicks);
    const poisonDamage = poisonHits * cell.poisonDamage;
    cell.poisonTicks = Math.max(0, cell.poisonTicks - heroHits);
    const outgoing = heroHits * playerAtk + poisonDamage;
    playerHp -= incoming;
    cell.monsterHp = Math.max(0, (cell.monsterHp ?? 0) - outgoing);

    if (playerHp <= 0) {
      playerHp = 0;
      onPlayerDefeated();
      return;
    }
    if ((cell.monsterHp ?? 0) <= 0) {
      cell.monsterHp = 0;
      onMonsterDefeated();
    }
  }

  function combatLoop(now) {
    if (!combat.active) return;

    if (combat.lastNow == null) combat.lastNow = now;
    const dt = now - combat.lastNow;
    combat.lastNow = now;
    combat.heroAcc += dt;
    combat.enemyAcc += dt;

    combatTick();

    if (!combat.active) return;

    const cell = getCell(combat.monsterR, combat.monsterC);
    const enemyCd = Math.max(1, cell.monsterAttackMs ?? HERO_ATTACK_MS);
    const heroProgress = combat.heroAcc / HERO_ATTACK_MS;
    const enemyProgress = combat.enemyAcc / enemyCd;
    updateCombatStrip(heroProgress, enemyProgress);
    render();
    combat.rafId = requestAnimationFrame(combatLoop);
  }

  function startCombat(mr, mc) {
    const cell = getCell(mr, mc);
    if (cell.kind !== 'monster' || (cell.monsterHp ?? 0) <= 0) return;

    if (cell.viz === 'hidden') cell.viz = 'seen';

    combat.active = true;
    combat.monsterR = mr;
    combat.monsterC = mc;
    combat.heroAcc = 0;
    combat.enemyAcc = 0;
    combat.lastNow = null;
    stopCombatRaf();

    const lv = cell.monsterLevel ?? 1;
    const atk = cell.monsterAtk ?? 0;
    const speed = speedProfile(cell.monsterType ?? 'normal');
    els.combatStripLabel.textContent = `vs L${lv} · ${atk} ATK`;
    els.enemySpeedLabel.textContent = `Enemy ${speed.label}`;
    els.combatStrip.classList.remove('hidden');
    updateCombatStrip(0, 0);
    render();
    combat.rafId = requestAnimationFrame(combatLoop);
  }

  function tryMove(dr, dc) {
    if (!els.gameOver.classList.contains('hidden')) return;

    const nr = playerR + dr;
    const nc = playerC + dc;
    if (!inBounds(nr, nc)) return;

    const target = getCell(nr, nc);

    if (combat.active && target.viz !== 'done') return;
    if (target.viz === 'hidden' && orthogonalMonsterBlocksZoc()) return;

    if (target.kind === 'monster' && (target.monsterHp ?? 0) > 0) {
      playerR = nr;
      playerC = nc;
      if (target.viz === 'hidden') target.viz = 'seen';
      if (combat.active && combat.monsterR === nr && combat.monsterC === nc) {
        render();
        return;
      }
      if (combat.active) disengageCombat();
      startCombat(nr, nc);
      return;
    }

    if (combat.active) disengageCombat();

    if (target.viz === 'hidden') {
      target.viz = 'done';
      healForFullyRevealedTile();
      revealAdjacentFromCompleted(nr, nc);
      if (target.kind === 'wall') {
        render();
        return;
      }
    } else if (target.viz === 'seen' && target.kind === 'empty') {
      target.viz = 'done';
      healForFullyRevealedTile();
      revealAdjacentFromCompleted(nr, nc);
    } else if (target.viz === 'seen' && target.kind === 'wall') {
      return;
    }

    if (target.kind === 'wall') return;

    playerR = nr;
    playerC = nc;
    tryPickupGroundItem(playerR, playerC);
    render();
  }

  function onKeyDown(e) {
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
      e.preventDefault();
      const slot = e.code === 'Digit1' ? 1 : e.code === 'Digit2' ? 2 : 3;
      if (e.shiftKey) {
        destroyItemAt(slot);
      } else {
        useItemAt(slot);
      }
      return;
    }

    if (e.key === 'Escape') {
      if (combat.active) {
        e.preventDefault();
        disengageCombat();
      }
      return;
    }

    let dr = 0;
    let dc = 0;
    if (e.key === 'ArrowUp') dr = -1;
    else if (e.key === 'ArrowDown') dr = 1;
    else if (e.key === 'ArrowLeft') dc = -1;
    else if (e.key === 'ArrowRight') dc = 1;
    else return;

    e.preventDefault();
    tryMove(dr, dc);
  }

  function resetGame() {
    disengageCombat();
    playerLevel = 1;
    playerMaxHp = 100;
    playerHp = 100;
    playerAtk = 15;
    playerXp = 0;
    els.gameOver.classList.add('hidden');
    placeMonstersAndPlayer();
    render();
  }

  function init() {
    ensureDomCells();
    placeMonstersAndPlayer();
    render();
    window.addEventListener('keydown', onKeyDown);
    els.btnRestart.addEventListener('click', resetGame);
  }

  init();
})();
