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

  const baseState = {
    globalXp: 0,
  };

  let portalState = null;
  let autoTickTimer = null;

  const els = {
    globalXpFill: document.getElementById('global-xp-fill'),
    globalXpText: document.getElementById('global-xp-text'),
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
    upgradeAxesBtn: document.getElementById('upgrade-axes-btn'),
    upgradePicksBtn: document.getElementById('upgrade-picks-btn'),
    chopBtn: document.getElementById('action-chop-btn'),
    mineBtn: document.getElementById('action-mine-btn'),
    forageBtn: document.getElementById('action-forage-btn'),
    panningBtn: document.getElementById('action-panning-btn'),
    portalUpgradeAxesBtn: document.getElementById('upgrade-axes-btn'),
    portalUpgradePicksBtn: document.getElementById('upgrade-picks-btn'),
    portalUpgradeTempleBtn: document.getElementById('upgrade-temple-btn'),
    portalUpgradeAutoWoodBtn: document.getElementById('upgrade-auto-wood-btn'),
    portalUpgradeAutoStoneBtn: document.getElementById('upgrade-auto-stone-btn'),
    portalUpgradeAutoFoodBtn: document.getElementById('upgrade-auto-food-btn'),
    portalUpgradeAutoGoldBtn: document.getElementById('upgrade-auto-gold-btn'),
    portalUpgradeFeastTempleBtn: document.getElementById('upgrade-feast-temple-btn'),
    portalUpgradeGoldenTempleBtn: document.getElementById('upgrade-golden-temple-btn'),
  };

  function randomPortalTemplate(tier) {
    const list = portalTemplatesByTier[tier];
    const idx = Math.floor(Math.random() * list.length);
    return list[idx];
  }

  function randomLimit(resourceKey, tier) {
    const base = 850 + Math.floor(Math.random() * 351); // 850-1200
    if (resourceKey === 'gold') return tier >= 3 ? 700 + Math.floor(Math.random() * 301) : 0;
    if (resourceKey === 'food') return tier >= 2 ? base : 0;
    return base;
  }

  function createPortalState(tier) {
    const template = randomPortalTemplate(tier);
    return {
      active: true,
      tier,
      type: template.type,
      gatherBonus: { ...template.bonus },
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
        betterAxes: false,
        reinforcedPicks: false,
        autoWood: false,
        autoStone: false,
        autoFood: false,
        autoGold: false,
      },
      templesBuilt: {
        stone: 0,
        feast: 0,
        golden: 0,
      },
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
    startAutoTick();
    render();
  }

  function closePortal() {
    portalState = null;
    stopAutoTick();
    render();
  }

  function gather(resourceKey) {
    if (!portalState || !portalState.active) return;
    if (portalState.limits[resourceKey] <= 0) return;
    if (portalState.harvested[resourceKey] >= portalState.limits[resourceKey]) return;

    // Every action always has a base +1 gain.
    let amount = 1 + (portalState.gatherBonus[resourceKey] || 0);
    if (resourceKey === 'wood' && portalState.upgrades.betterAxes) amount += 1;
    if (resourceKey === 'stone' && portalState.upgrades.reinforcedPicks) amount += 1;
    const room = portalState.limits[resourceKey] - portalState.harvested[resourceKey];
    const gained = Math.min(amount, room);
    portalState.local[resourceKey] += gained;
    portalState.harvested[resourceKey] += gained;
    render();
  }

  function buyPortalUpgrade(type) {
    if (!portalState || !portalState.active) return;

    if (type === 'betterAxes') {
      if (portalState.upgrades.betterAxes) return;
      if (portalState.local.wood < 12) return;
      portalState.local.wood -= 12;
      portalState.upgrades.betterAxes = true;
      render();
      return;
    }

    if (type === 'reinforcedPicks') {
      if (portalState.upgrades.reinforcedPicks) return;
      if (portalState.local.stone < 12) return;
      portalState.local.stone -= 12;
      portalState.upgrades.reinforcedPicks = true;
      render();
      return;
    }

    if (type === 'temple') {
      if (portalState.local.wood < 180 || portalState.local.stone < 180) return;
      portalState.local.wood -= 180;
      portalState.local.stone -= 180;
      portalState.templesBuilt.stone += 1;
      baseState.globalXp += 120;
      render();
      return;
    }

    if (type === 'feastTemple') {
      if (portalState.tier < 2) return;
      if (portalState.local.food < 220) return;
      portalState.local.food -= 220;
      portalState.templesBuilt.feast += 1;
      baseState.globalXp += 180;
      render();
      return;
    }

    if (type === 'goldenTemple') {
      if (portalState.tier < 3) return;
      if (portalState.local.gold < 260) return;
      portalState.local.gold -= 260;
      portalState.templesBuilt.golden += 1;
      baseState.globalXp += 260;
      render();
      return;
    }

    if (type === 'autoWood') {
      if (portalState.upgrades.autoWood || portalState.local.wood < 140) return;
      portalState.local.wood -= 140;
      portalState.upgrades.autoWood = true;
      render();
      return;
    }

    if (type === 'autoStone') {
      if (portalState.upgrades.autoStone || portalState.local.stone < 140) return;
      portalState.local.stone -= 140;
      portalState.upgrades.autoStone = true;
      render();
      return;
    }

    if (type === 'autoFood') {
      if (portalState.tier < 2) return;
      if (portalState.upgrades.autoFood || portalState.local.food < 180) return;
      portalState.local.food -= 180;
      portalState.upgrades.autoFood = true;
      render();
      return;
    }

    if (type === 'autoGold') {
      if (portalState.tier < 3) return;
      if (portalState.upgrades.autoGold || portalState.local.gold < 180) return;
      portalState.local.gold -= 180;
      portalState.upgrades.autoGold = true;
      render();
    }
  }

  function startAutoTick() {
    stopAutoTick();
    autoTickTimer = window.setInterval(function () {
      if (!portalState || !portalState.active) return;
      if (portalState.upgrades.autoWood) gather('wood');
      if (portalState.upgrades.autoStone) gather('stone');
      if (portalState.upgrades.autoFood) gather('food');
      if (portalState.upgrades.autoGold) gather('gold');
    }, 1000);
  }

  function stopAutoTick() {
    if (autoTickTimer != null) {
      window.clearInterval(autoTickTimer);
      autoTickTimer = null;
    }
  }

  function setPortalWorldVisibility(visible) {
    els.portalWorld.classList.toggle('hidden', !visible);
  }

  function render() {
    const xpToNext = 1000;
    const xpProgress = baseState.globalXp % xpToNext;
    els.globalXpFill.style.setProperty('--fill', String(xpProgress / xpToNext));
    els.globalXpText.textContent = `${baseState.globalXp} / ${xpToNext} XP`;

    const hasPortal = Boolean(portalState && portalState.active);
    setPortalWorldVisibility(hasPortal);

    els.openPortalT1Btn.disabled = hasPortal;
    els.openPortalT2Btn.disabled = hasPortal || !canAffordPortalTier(2);
    els.openPortalT3Btn.disabled = hasPortal || !canAffordPortalTier(3);
    els.closePortalBtn.disabled = !hasPortal;

    if (!hasPortal) {
      els.statusText.textContent = 'Portal closed';
      els.typeText.textContent = 'No active world';
      els.localWood.textContent = '0 / 0';
      els.localStone.textContent = '0 / 0';
      els.localFood.textContent = '0 / 0';
      els.localGold.textContent = '0 / 0';
      els.chopBtn.disabled = true;
      els.mineBtn.disabled = true;
      els.forageBtn.disabled = true;
      els.panningBtn.disabled = true;
      els.portalUpgradeAxesBtn.disabled = true;
      els.portalUpgradePicksBtn.disabled = true;
      els.portalUpgradeTempleBtn.disabled = true;
      els.portalUpgradeAutoWoodBtn.disabled = true;
      els.portalUpgradeAutoStoneBtn.disabled = true;
      els.portalUpgradeAutoFoodBtn.disabled = true;
      els.portalUpgradeAutoGoldBtn.disabled = true;
      els.portalUpgradeFeastTempleBtn.disabled = true;
      els.portalUpgradeGoldenTempleBtn.disabled = true;
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

    els.chopBtn.disabled = portalState.harvested.wood >= portalState.limits.wood;
    els.mineBtn.disabled = portalState.harvested.stone >= portalState.limits.stone;
    els.forageBtn.disabled = portalState.limits.food <= 0 || portalState.harvested.food >= portalState.limits.food;
    els.panningBtn.disabled = portalState.limits.gold <= 0 || portalState.harvested.gold >= portalState.limits.gold;

    els.portalUpgradeAxesBtn.disabled = portalState.upgrades.betterAxes || portalState.local.wood < 12;
    els.portalUpgradePicksBtn.disabled = portalState.upgrades.reinforcedPicks || portalState.local.stone < 12;
    els.portalUpgradeAutoWoodBtn.disabled = portalState.upgrades.autoWood || portalState.local.wood < 140;
    els.portalUpgradeAutoStoneBtn.disabled = portalState.upgrades.autoStone || portalState.local.stone < 140;
    els.portalUpgradeAutoFoodBtn.disabled = portalState.tier < 2 || portalState.upgrades.autoFood || portalState.local.food < 180;
    els.portalUpgradeAutoGoldBtn.disabled = portalState.tier < 3 || portalState.upgrades.autoGold || portalState.local.gold < 180;
    els.portalUpgradeTempleBtn.disabled = portalState.local.wood < 180 || portalState.local.stone < 180;
    els.portalUpgradeFeastTempleBtn.disabled = portalState.tier < 2 || portalState.local.food < 220;
    els.portalUpgradeGoldenTempleBtn.disabled = portalState.tier < 3 || portalState.local.gold < 260;
    els.portalUpgradeAxesBtn.textContent = portalState.upgrades.betterAxes ? 'Portal Better Axes (Owned)' : 'Portal Better Axes (12W)';
    els.portalUpgradePicksBtn.textContent = portalState.upgrades.reinforcedPicks ? 'Portal Reinforced Picks (Owned)' : 'Portal Reinforced Picks (12S)';
    els.portalUpgradeAutoWoodBtn.textContent = portalState.upgrades.autoWood ? 'Auto Lumber Crew (Owned)' : 'Auto Lumber Crew (+1/s) (140W)';
    els.portalUpgradeAutoStoneBtn.textContent = portalState.upgrades.autoStone ? 'Auto Quarry Team (Owned)' : 'Auto Quarry Team (+1/s) (140S)';
    els.portalUpgradeAutoFoodBtn.textContent = portalState.upgrades.autoFood ? 'Auto Foragers (Owned)' : 'Auto Foragers (+1/s) (180F)';
    els.portalUpgradeAutoGoldBtn.textContent = portalState.upgrades.autoGold ? 'Auto Prospectors (Owned)' : 'Auto Prospectors (+1/s) (180G)';
    els.portalUpgradeTempleBtn.textContent = `Build Stone Temple (+120 XP) (180W/180S) · Built: ${portalState.templesBuilt.stone}`;
    els.portalUpgradeFeastTempleBtn.textContent = `Build Feast Shrine (+180 XP) (220F) · Built: ${portalState.templesBuilt.feast}`;
    els.portalUpgradeGoldenTempleBtn.textContent = `Build Golden Obelisk (+260 XP) (260G) · Built: ${portalState.templesBuilt.golden}`;
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

    els.portalUpgradeAxesBtn.addEventListener('click', function () {
      buyPortalUpgrade('betterAxes');
    });

    els.portalUpgradePicksBtn.addEventListener('click', function () {
      buyPortalUpgrade('reinforcedPicks');
    });

    els.portalUpgradeTempleBtn.addEventListener('click', function () {
      buyPortalUpgrade('temple');
    });
    els.portalUpgradeAutoWoodBtn.addEventListener('click', function () {
      buyPortalUpgrade('autoWood');
    });
    els.portalUpgradeAutoStoneBtn.addEventListener('click', function () {
      buyPortalUpgrade('autoStone');
    });
    els.portalUpgradeAutoFoodBtn.addEventListener('click', function () {
      buyPortalUpgrade('autoFood');
    });
    els.portalUpgradeAutoGoldBtn.addEventListener('click', function () {
      buyPortalUpgrade('autoGold');
    });
    els.portalUpgradeFeastTempleBtn.addEventListener('click', function () {
      buyPortalUpgrade('feastTemple');
    });
    els.portalUpgradeGoldenTempleBtn.addEventListener('click', function () {
      buyPortalUpgrade('goldenTemple');
    });

    els.chopBtn.addEventListener('click', function () {
      gather('wood');
    });

    els.mineBtn.addEventListener('click', function () {
      gather('stone');
    });

    els.forageBtn.addEventListener('click', function () {
      gather('food');
    });

    els.panningBtn.addEventListener('click', function () {
      gather('gold');
    });

  }

  bindEvents();
  render();
})();
