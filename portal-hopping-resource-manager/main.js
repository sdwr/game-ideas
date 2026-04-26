(function () {
  'use strict';

  const portalTemplatesByTier = {
    1: [
      { type: 'Sparse Forest', bonus: { wood: 0, stone: 0, food: 0, gold: 0 } },
      { type: 'Rocky Clearing', bonus: { wood: 0, stone: 0, food: 0, gold: 0 } },
    ],
    2: [
      { type: 'Hunter Grove', bonus: { wood: 0, stone: 0, food: 0, gold: 0 } },
      { type: 'Fertile Highlands', bonus: { wood: 0, stone: 0, food: 0, gold: 0 } },
    ],
    3: [
      { type: 'Gilded Caverns', bonus: { wood: 0, stone: 0, food: 0, gold: 0 } },
      { type: 'Ancient Vault', bonus: { wood: 0, stone: 0, food: 0, gold: 0 } },
    ],
  };

  const portalOpenCosts = {
    1: { wood: 0, stone: 0, food: 0, gold: 0 },
    2: { wood: 0, stone: 0, food: 0, gold: 0 },
    3: { wood: 0, stone: 0, food: 0, gold: 0 },
  };

  const REINFORCED_COSTS = [12, 40, 90, 160, 260];
  const REINFORCED_LABELS = ['I', 'II', 'III', 'IV', 'V'];
  const STONE_TEMPLE_BUILD_SECONDS = 20;
  const TEMPLE_XP = 1000;
  const RETURN_PORTAL_COOLDOWN = 30;
  const RETURN_MAX_BATCH = 50;

  const LEVEL_XP_STEPS = [1000, 1200, 1400, 1600, 2000];
  const SKILL_POINTS_PER_LEVEL = 2;
  const WORKER_UPGRADE_SP_COSTS = [2, 4, 6, 8, 10];
  const RETURN_PORTAL_UNLOCK_SP = 2;

  const BUILDING_CONFIG = {
    stoneTemple: {
      label: 'Stone Temple',
      tier: 1,
      buildSeconds: STONE_TEMPLE_BUILD_SECONDS,
      kind: 'temple',
      cost: { wood: 180, stone: 180, food: 0, gold: 0 },
    },
    feastTemple: {
      label: 'Feast Shrine',
      tier: 2,
      buildSeconds: Math.round((STONE_TEMPLE_BUILD_SECONDS * 11) / 8),
      kind: 'temple',
      cost: { wood: 120, stone: 120, food: 220, gold: 0 },
    },
    goldenTemple: {
      label: 'Golden Obelisk',
      tier: 3,
      buildSeconds: Math.round((STONE_TEMPLE_BUILD_SECONDS * 14) / 8),
      kind: 'temple',
      cost: { wood: 140, stone: 140, food: 0, gold: 260 },
    },
    returnPortal: {
      label: 'Return Portal',
      tier: 1,
      buildSeconds: 24,
      kind: 'utility',
      cost: { wood: 100, stone: 100, food: 0, gold: 0 },
    },
  };

  const playerState = {
    totalXp: 0,
    skillPoints: 0,
    extraWorkerTiers: 0,
    returnPortalUnlocked: false,
    baseResources: {
      wood: 0,
      stone: 0,
      food: 0,
      gold: 0,
    },
    baseResourceSeen: {
      wood: false,
      stone: false,
      food: false,
      gold: false,
    },
  };

  let portalState = null;
  let autoTickTimer = null;

  const els = {
    xpBar: document.getElementById('xp-bar'),
    xpBarFill: document.getElementById('xp-bar-fill'),
    xpBarLabel: document.getElementById('xp-bar-label'),
    levelText: document.getElementById('level-text'),
    skillPointsText: document.getElementById('skill-points'),
    globalWorkerBtn: document.getElementById('global-worker-btn'),
    globalReturnUnlockBtn: document.getElementById('global-return-unlock-btn'),
    baseRowWood: document.getElementById('base-row-wood'),
    baseRowStone: document.getElementById('base-row-stone'),
    baseRowFood: document.getElementById('base-row-food'),
    baseRowGold: document.getElementById('base-row-gold'),
    baseWood: document.getElementById('base-wood'),
    baseStone: document.getElementById('base-stone'),
    baseFood: document.getElementById('base-food'),
    baseGold: document.getElementById('base-gold'),
    localWood: document.getElementById('local-wood'),
    localStone: document.getElementById('local-stone'),
    localFood: document.getElementById('local-food'),
    localGold: document.getElementById('local-gold'),
    statusText: document.getElementById('portal-status-text'),
    typeText: document.getElementById('portal-type-text'),
    portalWorld: document.getElementById('portal-world'),
    openPortalT1Btn: document.getElementById('open-portal-t1-btn'),
    openPortalT2Btn: document.getElementById('open-portal-t2-btn'),
    openPortalT3Btn: document.getElementById('open-portal-t3-btn'),
    closePortalBtn: document.getElementById('close-portal-btn'),
    workerPoolText: document.getElementById('worker-pool'),
    workerFreeText: document.getElementById('worker-free'),
    rowWood: document.getElementById('row-wood'),
    rowStone: document.getElementById('row-stone'),
    rowFood: document.getElementById('row-food'),
    rowGold: document.getElementById('row-gold'),
    workersWood: document.getElementById('workers-wood'),
    workersStone: document.getElementById('workers-stone'),
    workersFood: document.getElementById('workers-food'),
    workersGold: document.getElementById('workers-gold'),
    portalUpgradeWoodBtn: document.getElementById('upgrade-wood-btn'),
    portalUpgradeStoneBtn: document.getElementById('upgrade-stone-btn'),
    portalUpgradeFoodBtn: document.getElementById('upgrade-food-btn'),
    portalUpgradeGoldBtn: document.getElementById('upgrade-gold-btn'),
    buyStoneBtn: document.getElementById('buy-stone-btn'),
    buyFeastBtn: document.getElementById('buy-feast-btn'),
    buyGoldenBtn: document.getElementById('buy-golden-btn'),
    buyReturnBtn: document.getElementById('buy-return-btn'),
    buildingBlockFeast: document.getElementById('building-block-feast'),
    buildingBlockGolden: document.getElementById('building-block-golden'),
    buildingRowReturnWrap: document.getElementById('building-row-return-wrap'),
    buildingStoneStatus: document.getElementById('building-stone-status'),
    buildingFeastStatus: document.getElementById('building-feast-status'),
    buildingGoldenStatus: document.getElementById('building-golden-status'),
    buildingReturnStatus: document.getElementById('building-return-status'),
    buildingStoneBars: document.getElementById('building-stone-bars'),
    buildingFeastBars: document.getElementById('building-feast-bars'),
    buildingGoldenBars: document.getElementById('building-golden-bars'),
    buildingReturnBars: document.getElementById('building-return-bars'),
    returnPortalCard: document.getElementById('return-portal-card'),
    returnResourceSelect: document.getElementById('return-resource-select'),
    returnSendBtn: document.getElementById('return-send-btn'),
    returnCooldownText: document.getElementById('return-cooldown-text'),
    returnCooldownSeconds: document.getElementById('return-cooldown-seconds'),
    returnCooldownBar: document.getElementById('return-cooldown-bar'),
    returnCooldownFill: document.getElementById('return-cooldown-fill'),
  };

  const resourceKeys = ['wood', 'stone', 'food', 'gold'];

  function xpNeededFromLevel(level) {
    const idx = level - 1;
    if (idx < LEVEL_XP_STEPS.length) return LEVEL_XP_STEPS[idx];
    return 2000 + (idx - LEVEL_XP_STEPS.length + 1) * 200;
  }

  function computeLevelProgress(totalXp) {
    let level = 1;
    let rem = totalXp;
    while (true) {
      const need = xpNeededFromLevel(level);
      if (rem < need) {
        return { level, xpIntoLevel: rem, xpForNext: need };
      }
      rem -= need;
      level += 1;
    }
  }

  function grantXp(amount) {
    if (amount <= 0) return;
    const beforeLevel = computeLevelProgress(playerState.totalXp).level;
    playerState.totalXp += amount;
    const afterLevel = computeLevelProgress(playerState.totalXp).level;
    if (afterLevel > beforeLevel) {
      playerState.skillPoints += (afterLevel - beforeLevel) * SKILL_POINTS_PER_LEVEL;
    }
  }

  function randomPortalTemplate(tier) {
    const list = portalTemplatesByTier[tier];
    const idx = Math.floor(Math.random() * list.length);
    return list[idx];
  }

  function randomLimit(resourceKey, tier) {
    const base = 850 + Math.floor(Math.random() * 351);
    if (resourceKey === 'gold') return tier >= 3 ? 700 + Math.floor(Math.random() * 301) : 0;
    if (resourceKey === 'food') return tier >= 2 ? base : 0;
    return base;
  }

  function sumWorkers(state) {
    return resourceKeys.reduce(function (acc, k) {
      return acc + state.workers[k];
    }, 0);
  }

  function createPortalState(tier) {
    const template = randomPortalTemplate(tier);
    return {
      active: true,
      tier,
      type: template.type,
      gatherBonus: { ...template.bonus },
      workerPool: 1 + playerState.extraWorkerTiers,
      workers: {
        wood: 0,
        stone: 0,
        food: 0,
        gold: 0,
      },
      local: {
        wood: 0,
        stone: 0,
        food: 0,
        gold: 0,
      },
      harvested: {
        wood: 0,
        stone: 0,
        food: 0,
        gold: 0,
      },
      limits: {
        wood: randomLimit('wood', tier),
        stone: randomLimit('stone', tier),
        food: randomLimit('food', tier),
        gold: randomLimit('gold', tier),
      },
      upgrades: {
        reinforced: {
          wood: 0,
          stone: 0,
          food: 0,
          gold: 0,
        },
      },
      buildings: {
        stoneTemple: { built: 0, progress: [] },
        feastTemple: { built: 0, progress: [] },
        goldenTemple: { built: 0, progress: [] },
        returnPortal: { built: 0, progress: [] },
      },
      returnCooldownRemaining: 0,
    };
  }

  function canAffordPortalTier(tier) {
    const c = portalOpenCosts[tier];
    return (
      0 >= c.wood &&
      0 >= c.stone &&
      0 >= c.food &&
      0 >= c.gold
    );
  }

  function openPortal(tier) {
    if (portalState && portalState.active) return;
    if (!canAffordPortalTier(tier)) return;
    portalState = createPortalState(tier);
    startPortalTick();
    render();
  }

  function closePortal() {
    portalState = null;
    stopPortalTick();
    render();
  }

  function gatherPulse(resourceKey) {
    if (!portalState || !portalState.active) return;
    if (portalState.limits[resourceKey] <= 0) return;
    if (portalState.harvested[resourceKey] >= portalState.limits[resourceKey]) return;

    let amount = 1 + (portalState.gatherBonus[resourceKey] || 0);
    amount += portalState.upgrades.reinforced[resourceKey];
    const room = portalState.limits[resourceKey] - portalState.harvested[resourceKey];
    const gained = Math.min(amount, room);
    portalState.local[resourceKey] += gained;
    portalState.harvested[resourceKey] += gained;
  }

  function adjustWorker(resourceKey, delta) {
    if (!portalState || !portalState.active) return;
    if (portalState.limits[resourceKey] <= 0) return;

    if (delta > 0) {
      if (sumWorkers(portalState) >= portalState.workerPool) return;
      portalState.workers[resourceKey] += 1;
    } else if (delta < 0) {
      if (portalState.workers[resourceKey] <= 0) return;
      portalState.workers[resourceKey] -= 1;
    }
    render();
  }

  function reinforcedCost(level) {
    return REINFORCED_COSTS[level];
  }

  function reinforcedButtonText(resourceKey) {
    const level = portalState.upgrades.reinforced[resourceKey];
    if (level >= 5) return `Reinforced ${resourceKey[0].toUpperCase()}${resourceKey.slice(1)} MAX`;
    const cost = reinforcedCost(level);
    const next = REINFORCED_LABELS[level];
    const symbol = resourceKey === 'wood' ? 'W' : resourceKey === 'stone' ? 'S' : resourceKey === 'food' ? 'F' : 'G';
    return `Reinforced ${resourceKey[0].toUpperCase()}${resourceKey.slice(1)} ${next} (+1/pulse) (${cost}${symbol})`;
  }

  function buyReinforced(resourceKey) {
    if (!portalState || !portalState.active) return;
    const level = portalState.upgrades.reinforced[resourceKey];
    if (level >= 5) return;
    if ((resourceKey === 'food' && portalState.tier < 2) || (resourceKey === 'gold' && portalState.tier < 3)) return;
    const cost = reinforcedCost(level);
    if (portalState.local[resourceKey] < cost) return;
    portalState.local[resourceKey] -= cost;
    portalState.upgrades.reinforced[resourceKey] += 1;
    render();
  }

  function canAffordCost(cost) {
    return (
      portalState.local.wood >= cost.wood &&
      portalState.local.stone >= cost.stone &&
      portalState.local.food >= cost.food &&
      portalState.local.gold >= cost.gold
    );
  }

  function spendCost(cost) {
    portalState.local.wood -= cost.wood;
    portalState.local.stone -= cost.stone;
    portalState.local.food -= cost.food;
    portalState.local.gold -= cost.gold;
  }

  function buyBuilding(buildingKey) {
    if (!portalState || !portalState.active) return;
    const cfg = BUILDING_CONFIG[buildingKey];
    if (!cfg || portalState.tier < cfg.tier) return;
    if (buildingKey === 'returnPortal' && !playerState.returnPortalUnlocked) return;
    if (!canAffordCost(cfg.cost)) return;
    spendCost(cfg.cost);
    portalState.buildings[buildingKey].progress.push(0);
    render();
  }

  function tickBuildings() {
    const keys = Object.keys(BUILDING_CONFIG);
    keys.forEach(function (buildingKey) {
      const cfg = BUILDING_CONFIG[buildingKey];
      const b = portalState.buildings[buildingKey];
      for (let i = b.progress.length - 1; i >= 0; i -= 1) {
        b.progress[i] += 1;
        if (b.progress[i] >= cfg.buildSeconds) {
          b.progress.splice(i, 1);
          b.built += 1;
          if (cfg.kind === 'temple') {
            grantXp(TEMPLE_XP);
          }
        }
      }
    });
  }

  function tickReturnCooldown() {
    if (portalState.returnCooldownRemaining > 0) {
      portalState.returnCooldownRemaining -= 1;
    }
  }

  function sendReturnShipment() {
    if (!portalState || !portalState.active) return;
    const built = portalState.buildings.returnPortal.built;
    if (built <= 0) return;
    if (portalState.returnCooldownRemaining > 0) return;
    const key = els.returnResourceSelect.value;
    if (!resourceKeys.includes(key)) return;
    if (portalState.limits[key] <= 0) return;
    const have = portalState.local[key];
    const amount = Math.min(RETURN_MAX_BATCH, have);
    if (amount <= 0) return;
    portalState.local[key] -= amount;
    playerState.baseResources[key] += amount;
    playerState.baseResourceSeen[key] = true;
    portalState.returnCooldownRemaining = RETURN_PORTAL_COOLDOWN;
    render();
  }

  function buyGlobalWorkerTier() {
    if (playerState.extraWorkerTiers >= 5) return;
    const cost = WORKER_UPGRADE_SP_COSTS[playerState.extraWorkerTiers];
    if (playerState.skillPoints < cost) return;
    playerState.skillPoints -= cost;
    playerState.extraWorkerTiers += 1;
    if (portalState && portalState.active) {
      portalState.workerPool = 1 + playerState.extraWorkerTiers;
    }
    render();
  }

  function buyReturnPortalUnlock() {
    if (playerState.returnPortalUnlocked) return;
    if (playerState.skillPoints < RETURN_PORTAL_UNLOCK_SP) return;
    playerState.skillPoints -= RETURN_PORTAL_UNLOCK_SP;
    playerState.returnPortalUnlocked = true;
    render();
  }

  function runPortalGatherTick() {
    if (!portalState || !portalState.active) return;
    resourceKeys.forEach(function (key) {
      const n = portalState.workers[key];
      for (let i = 0; i < n; i += 1) {
        gatherPulse(key);
      }
    });
    tickBuildings();
    tickReturnCooldown();
    render();
  }

  function startPortalTick() {
    stopPortalTick();
    autoTickTimer = window.setInterval(runPortalGatherTick, 1000);
  }

  function stopPortalTick() {
    if (autoTickTimer != null) {
      window.clearInterval(autoTickTimer);
      autoTickTimer = null;
    }
  }

  function setPortalWorldVisibility(visible) {
    els.portalWorld.classList.toggle('hidden', !visible);
  }

  function gatherable(resourceKey) {
    return portalState.limits[resourceKey] > 0;
  }

  function renderPlayerProgress() {
    const prog = computeLevelProgress(playerState.totalXp);
    const fill = prog.xpForNext > 0 ? prog.xpIntoLevel / prog.xpForNext : 0;
    els.xpBarFill.style.setProperty('--fill', String(fill));
    els.xpBarLabel.textContent = `${prog.xpIntoLevel} / ${prog.xpForNext} XP`;
    els.levelText.textContent = `Level ${prog.level}`;
    els.xpBar.setAttribute('aria-valuemax', String(prog.xpForNext));
    els.xpBar.setAttribute('aria-valuenow', String(prog.xpIntoLevel));
    els.skillPointsText.textContent = String(playerState.skillPoints);

    const workerTier = playerState.extraWorkerTiers;
    if (workerTier >= 5) {
      els.globalWorkerBtn.classList.add('hidden');
    } else {
      els.globalWorkerBtn.classList.remove('hidden');
      const cost = WORKER_UPGRADE_SP_COSTS[workerTier];
      const nextLabel = REINFORCED_LABELS[workerTier];
      els.globalWorkerBtn.textContent = `Extra Worker ${nextLabel} (+1 in portals) (${cost} SP)`;
      els.globalWorkerBtn.disabled = playerState.skillPoints < cost;
    }

    if (playerState.returnPortalUnlocked) {
      els.globalReturnUnlockBtn.classList.add('hidden');
    } else {
      els.globalReturnUnlockBtn.classList.remove('hidden');
      els.globalReturnUnlockBtn.textContent = `Unlock Return Portal building (${RETURN_PORTAL_UNLOCK_SP} SP)`;
      els.globalReturnUnlockBtn.disabled = playerState.skillPoints < RETURN_PORTAL_UNLOCK_SP;
    }
  }

  function renderBaseResources() {
    els.baseWood.textContent = String(playerState.baseResources.wood);
    els.baseStone.textContent = String(playerState.baseResources.stone);
    els.baseFood.textContent = String(playerState.baseResources.food);
    els.baseGold.textContent = String(playerState.baseResources.gold);
    resourceKeys.forEach(function (key) {
      const row = document.getElementById(`base-row-${key}`);
      if (!row) return;
      const visible = playerState.baseResourceSeen[key] || playerState.baseResources[key] > 0;
      row.classList.toggle('hidden', !visible);
    });
  }

  function renderBuildingProgressBars(buildingKey, container) {
    if (!container) return;
    container.textContent = '';
    if (!portalState || !portalState.active) return;
    const cfg = BUILDING_CONFIG[buildingKey];
    const b = portalState.buildings[buildingKey];
    if (!cfg || !b) return;
    b.progress.forEach(function (elapsed) {
      const wrap = document.createElement('div');
      wrap.className = 'bar bar--build';
      const fill = document.createElement('div');
      fill.className = 'bar__fill';
      const frac = cfg.buildSeconds > 0 ? Math.min(1, elapsed / cfg.buildSeconds) : 1;
      fill.style.setProperty('--fill', String(frac));
      wrap.appendChild(fill);
      container.appendChild(wrap);
    });
  }

  function populateReturnSelect() {
    const sel = els.returnResourceSelect;
    const prev = sel.value;
    sel.textContent = '';
    resourceKeys.forEach(function (key) {
      if (!gatherable(key)) return;
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key[0].toUpperCase() + key.slice(1);
      sel.appendChild(opt);
    });
    const keysOk = resourceKeys.filter(gatherable);
    if (keysOk.includes(prev)) sel.value = prev;
    else if (keysOk.length) sel.value = keysOk[0];
  }

  function renderReturnPanel() {
    const built = portalState.buildings.returnPortal.built;
    const show = built > 0;
    els.returnPortalCard.classList.toggle('hidden', !show);
    if (!show) return;

    populateReturnSelect();
    const sel = els.returnResourceSelect;
    const hasOption = sel.options.length > 0;
    const key = hasOption ? sel.value : '';
    const localAmt = key && resourceKeys.includes(key) ? portalState.local[key] : 0;
    const canSend = hasOption && portalState.returnCooldownRemaining <= 0 && localAmt > 0 && gatherable(key);
    els.returnSendBtn.disabled = !canSend;

    const cd = portalState.returnCooldownRemaining;
    const cdActive = cd > 0;
    els.returnCooldownText.classList.toggle('hidden', !cdActive);
    els.returnCooldownBar.classList.toggle('hidden', !cdActive);
    els.returnCooldownSeconds.textContent = String(cd);
    const cdFrac = cdActive ? (RETURN_PORTAL_COOLDOWN - cd) / RETURN_PORTAL_COOLDOWN : 0;
    els.returnCooldownFill.style.setProperty('--fill', String(cdFrac));
  }

  function render() {
    renderPlayerProgress();
    renderBaseResources();

    const hasPortal = Boolean(portalState && portalState.active);
    setPortalWorldVisibility(hasPortal);

    els.openPortalT1Btn.disabled = hasPortal;
    els.openPortalT2Btn.disabled = hasPortal || !canAffordPortalTier(2);
    els.openPortalT3Btn.disabled = hasPortal || !canAffordPortalTier(3);
    els.closePortalBtn.disabled = !hasPortal;

    if (!hasPortal) {
      els.statusText.textContent = 'Portal closed';
      els.typeText.textContent = 'No active world';
      return;
    }

    els.statusText.textContent = `Portal open (Tier ${portalState.tier})`;
    els.typeText.textContent = `Active World: ${portalState.type}`;

    const woodLeft = portalState.limits.wood - portalState.harvested.wood;
    const stoneLeft = portalState.limits.stone - portalState.harvested.stone;
    const foodLeft = portalState.limits.food - portalState.harvested.food;
    const goldLeft = portalState.limits.gold - portalState.harvested.gold;
    els.localWood.textContent = `${portalState.local.wood} local (${woodLeft} world left)`;
    els.localStone.textContent = `${portalState.local.stone} local (${stoneLeft} world left)`;
    els.localFood.textContent = `${portalState.local.food} local (${foodLeft} world left)`;
    els.localGold.textContent = `${portalState.local.gold} local (${goldLeft} world left)`;

    const assigned = sumWorkers(portalState);
    const free = portalState.workerPool - assigned;
    els.workerPoolText.textContent = String(portalState.workerPool);
    els.workerFreeText.textContent = String(free);

    els.rowWood.classList.toggle('hidden', !gatherable('wood'));
    els.rowStone.classList.toggle('hidden', !gatherable('stone'));
    els.rowFood.classList.toggle('hidden', !gatherable('food'));
    els.rowGold.classList.toggle('hidden', !gatherable('gold'));

    els.workersWood.textContent = String(portalState.workers.wood);
    els.workersStone.textContent = String(portalState.workers.stone);
    els.workersFood.textContent = String(portalState.workers.food);
    els.workersGold.textContent = String(portalState.workers.gold);

    const tier = portalState.tier;
    const r = portalState.upgrades.reinforced;
    els.portalUpgradeWoodBtn.classList.toggle('hidden', r.wood >= 5);
    els.portalUpgradeStoneBtn.classList.toggle('hidden', r.stone >= 5);
    els.portalUpgradeFoodBtn.classList.toggle('hidden', tier < 2 || r.food >= 5);
    els.portalUpgradeGoldBtn.classList.toggle('hidden', tier < 3 || r.gold >= 5);
    els.buildingBlockFeast.classList.toggle('hidden', tier < 2);
    els.buildingBlockGolden.classList.toggle('hidden', tier < 3);
    els.buildingRowReturnWrap.classList.toggle('hidden', !playerState.returnPortalUnlocked);

    const woodDepleted = portalState.harvested.wood >= portalState.limits.wood;
    const stoneDepleted = portalState.harvested.stone >= portalState.limits.stone;
    const foodDepleted = portalState.limits.food <= 0 || portalState.harvested.food >= portalState.limits.food;
    const goldDepleted = portalState.limits.gold <= 0 || portalState.harvested.gold >= portalState.limits.gold;

    document.querySelectorAll('[data-worker-plus="wood"]').forEach(function (btn) {
      btn.disabled = woodDepleted || free <= 0;
    });
    document.querySelectorAll('[data-worker-minus="wood"]').forEach(function (btn) {
      btn.disabled = portalState.workers.wood <= 0;
    });
    document.querySelectorAll('[data-worker-plus="stone"]').forEach(function (btn) {
      btn.disabled = stoneDepleted || free <= 0;
    });
    document.querySelectorAll('[data-worker-minus="stone"]').forEach(function (btn) {
      btn.disabled = portalState.workers.stone <= 0;
    });
    document.querySelectorAll('[data-worker-plus="food"]').forEach(function (btn) {
      btn.disabled = foodDepleted || free <= 0;
    });
    document.querySelectorAll('[data-worker-minus="food"]').forEach(function (btn) {
      btn.disabled = portalState.workers.food <= 0;
    });
    document.querySelectorAll('[data-worker-plus="gold"]').forEach(function (btn) {
      btn.disabled = goldDepleted || free <= 0;
    });
    document.querySelectorAll('[data-worker-minus="gold"]').forEach(function (btn) {
      btn.disabled = portalState.workers.gold <= 0;
    });

    const woodCost = r.wood < 5 ? reinforcedCost(r.wood) : 0;
    const stoneCost = r.stone < 5 ? reinforcedCost(r.stone) : 0;
    const foodCost = r.food < 5 ? reinforcedCost(r.food) : 0;
    const goldCost = r.gold < 5 ? reinforcedCost(r.gold) : 0;
    els.portalUpgradeWoodBtn.disabled = r.wood >= 5 || portalState.local.wood < woodCost;
    els.portalUpgradeStoneBtn.disabled = r.stone >= 5 || portalState.local.stone < stoneCost;
    els.portalUpgradeFoodBtn.disabled = r.food >= 5 || portalState.local.food < foodCost;
    els.portalUpgradeGoldBtn.disabled = r.gold >= 5 || portalState.local.gold < goldCost;
    els.portalUpgradeWoodBtn.textContent = reinforcedButtonText('wood');
    els.portalUpgradeStoneBtn.textContent = reinforcedButtonText('stone');
    els.portalUpgradeFoodBtn.textContent = reinforcedButtonText('food');
    els.portalUpgradeGoldBtn.textContent = reinforcedButtonText('gold');

    const stoneB = portalState.buildings.stoneTemple;
    const feastB = portalState.buildings.feastTemple;
    const goldenB = portalState.buildings.goldenTemple;
    const returnB = portalState.buildings.returnPortal;
    const stoneCfg = BUILDING_CONFIG.stoneTemple;
    const feastCfg = BUILDING_CONFIG.feastTemple;
    const goldenCfg = BUILDING_CONFIG.goldenTemple;
    const returnCfg = BUILDING_CONFIG.returnPortal;

    els.buyStoneBtn.disabled = !canAffordCost(stoneCfg.cost);
    els.buyFeastBtn.disabled = tier < 2 || !canAffordCost(feastCfg.cost);
    els.buyGoldenBtn.disabled = tier < 3 || !canAffordCost(goldenCfg.cost);
    els.buyReturnBtn.disabled = !playerState.returnPortalUnlocked || !canAffordCost(returnCfg.cost);
    els.buyStoneBtn.textContent = `Buy (${stoneCfg.cost.wood}W/${stoneCfg.cost.stone}S)`;
    els.buyFeastBtn.textContent = `Buy (${feastCfg.cost.wood}W/${feastCfg.cost.stone}S/${feastCfg.cost.food}F)`;
    els.buyGoldenBtn.textContent = `Buy (${goldenCfg.cost.wood}W/${goldenCfg.cost.stone}S/${goldenCfg.cost.gold}G)`;
    els.buyReturnBtn.textContent = `Buy (${returnCfg.cost.wood}W/${returnCfg.cost.stone}S)`;

    els.buildingStoneStatus.textContent = `Built: ${stoneB.built} · Under construction: ${stoneB.progress.length} (${stoneCfg.buildSeconds}s each)`;
    els.buildingFeastStatus.textContent = `Built: ${feastB.built} · Under construction: ${feastB.progress.length} (${feastCfg.buildSeconds}s each)`;
    els.buildingGoldenStatus.textContent = `Built: ${goldenB.built} · Under construction: ${goldenB.progress.length} (${goldenCfg.buildSeconds}s each)`;
    els.buildingReturnStatus.textContent = `Built: ${returnB.built} · Under construction: ${returnB.progress.length} (${returnCfg.buildSeconds}s each)`;

    renderBuildingProgressBars('stoneTemple', els.buildingStoneBars);
    renderBuildingProgressBars('feastTemple', els.buildingFeastBars);
    renderBuildingProgressBars('goldenTemple', els.buildingGoldenBars);
    renderBuildingProgressBars('returnPortal', els.buildingReturnBars);

    renderReturnPanel();
  }

  function bindEvents() {
    els.openPortalT1Btn.addEventListener('click', function () {
      openPortal(1);
    });
    els.openPortalT2Btn.addEventListener('click', function () {
      openPortal(2);
    });
    els.openPortalT3Btn.addEventListener('click', function () {
      openPortal(3);
    });
    els.closePortalBtn.addEventListener('click', closePortal);

    els.globalWorkerBtn.addEventListener('click', buyGlobalWorkerTier);
    els.globalReturnUnlockBtn.addEventListener('click', buyReturnPortalUnlock);

    els.portalUpgradeWoodBtn.addEventListener('click', function () {
      buyReinforced('wood');
    });
    els.portalUpgradeStoneBtn.addEventListener('click', function () {
      buyReinforced('stone');
    });
    els.portalUpgradeFoodBtn.addEventListener('click', function () {
      buyReinforced('food');
    });
    els.portalUpgradeGoldBtn.addEventListener('click', function () {
      buyReinforced('gold');
    });
    els.buyStoneBtn.addEventListener('click', function () {
      buyBuilding('stoneTemple');
    });
    els.buyFeastBtn.addEventListener('click', function () {
      buyBuilding('feastTemple');
    });
    els.buyGoldenBtn.addEventListener('click', function () {
      buyBuilding('goldenTemple');
    });
    els.buyReturnBtn.addEventListener('click', function () {
      buyBuilding('returnPortal');
    });
    els.returnSendBtn.addEventListener('click', sendReturnShipment);

    els.portalWorld.addEventListener('click', function (ev) {
      const plus = ev.target.closest('[data-worker-plus]');
      const minus = ev.target.closest('[data-worker-minus]');
      if (plus) {
        adjustWorker(plus.getAttribute('data-worker-plus'), 1);
      } else if (minus) {
        adjustWorker(minus.getAttribute('data-worker-minus'), -1);
      }
    });
  }

  bindEvents();
  render();
})();
