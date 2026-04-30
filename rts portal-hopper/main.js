(function () {
  'use strict';

  var RESOURCES = ['wood', 'stone', 'food', 'gold'];
  var TIER_RESOURCE_TYPES = {
    1: ['wood', 'stone'],
    2: ['wood', 'stone', 'food'],
    3: ['wood', 'stone', 'food', 'gold'],
  };

  var PLAYER = {
    totalXp: 0,
    upgradePoints: 0,
    level: 1,
    workerUpgradeTier: 0,
    worldWoodTier: 0,
    worldStoneTier: 0,
  };

  var WORLD = null;
  var TICK_HANDLE = null;
  var TICK_MS = 100;
  var TEMPLE_XP = 1000;
  var NODE_SEPARATION = 36;
  var BASE_STONE_MIN_DISTANCE = 190;
  var drag = { active: false, moved: false, startX: 0, startY: 0, curX: 0, curY: 0 };
  var suppressClickOnce = false;
  var commandLogText = 'No commands yet.';
  var DEBUG_BUILD = false;
  var debugSeq = 0;
  var lastPreviewDebugState = '';
  var BUILDINGS = {
    house: { baseCost: { wood: 40, stone: 20 }, scaling: 1.8, radius: 24, className: 'house', label: 'House', buildMs: 15000 },
    depot: { baseCost: { wood: 40, stone: 20 }, scaling: 1.8, radius: 28, className: 'depot', label: 'Depot', buildMs: 10000 },
    temple: { baseCost: { wood: 100, stone: 100 }, scaling: 1.8, radius: 34, className: 'temple', label: 'Temple', buildMs: 30000 },
  };
  var WORLD_RESOURCE_TIER_BONUS = [150, 300, 450, 600];
  var placement = {
    type: null,
    x: 0,
    y: 0,
    valid: false,
  };
  var lastMouseMapPos = { x: 0, y: 0 };

  var els = {
    globalScreen: document.getElementById('global-screen'),
    worldScreen: document.getElementById('world-screen'),
    playerProgress: document.getElementById('player-progress'),
    upgradePoints: document.getElementById('upgrade-points'),
    buyWorkerUpgradeBtn: document.getElementById('buy-worker-upgrade-btn'),
    buyWoodWorldUpgradeBtn: document.getElementById('buy-wood-world-upgrade-btn'),
    buyStoneWorldUpgradeBtn: document.getElementById('buy-stone-world-upgrade-btn'),
    prestigeBtn: document.getElementById('prestige-btn'),
    praiseText: document.getElementById('praise-text'),
    praiseFill: document.getElementById('praise-fill'),
    commandLog: document.getElementById('command-log'),
    map: document.getElementById('map'),
    base: document.getElementById('base'),
    entityLayer: document.getElementById('entity-layer'),
    resourceAssignmentList: document.getElementById('resource-assignment-list'),
    buildDepotBtn: document.getElementById('build-depot-btn'),
    buildHouseBtn: document.getElementById('build-house-btn'),
    buildTempleBtn: document.getElementById('build-temple-btn'),
    buildHint: document.getElementById('build-hint'),
    buildPreview: document.getElementById('build-preview'),
    selectionBox: document.getElementById('selection-box'),
  };

  function xpNeededForLevel(level) {
    return 300 + level * 100; // 400 / 500 / 600 / 700 ...
  }

  function levelProgress(totalXp) {
    var lvl = 1;
    var rem = totalXp;
    while (true) {
      var need = xpNeededForLevel(lvl);
      if (rem < need) {
        return { level: lvl, current: rem, needed: need };
      }
      rem -= need;
      lvl += 1;
    }
  }

  function gainXp(amount) {
    if (amount <= 0) return;
    var before = levelProgress(PLAYER.totalXp).level;
    PLAYER.totalXp += amount;
    var after = levelProgress(PLAYER.totalXp).level;
    if (after > before) {
      PLAYER.upgradePoints += (after - before) * 2;
    }
  }

  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function dbg(label, extra) {
    if (!DEBUG_BUILD) return;
    debugSeq += 1;
    var payload = {
      seq: debugSeq,
      t: Date.now(),
      label: label,
      placementType: placement && placement.type,
      placementValid: placement && placement.valid,
      dragActive: drag && drag.active,
      dragMoved: drag && drag.moved,
      suppressClickOnce: suppressClickOnce,
      selectedWorkers: WORLD && WORLD.selectedWorkerIds ? WORLD.selectedWorkerIds.length : 0,
      stock: WORLD ? WORLD.stock : null,
    };
    if (extra) {
      Object.keys(extra).forEach(function (k) { payload[k] = extra[k]; });
    }
    console.log('[BUILD-DBG]', payload);
  }

  function dbgCanAfford(type) {
    var cost = getBuildCost(type);
    var ok = canAffordBuild(type);
    dbg('canAffordBuild', { type: type, cost: cost, ok: ok });
    return ok;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function randomAmountTotal(baseCount) {
    var total = 0;
    for (var i = 0; i < baseCount; i += 1) {
      total += rand(140, 280);
    }
    return total;
  }

  function splitTotalAmount(total, count, minEach) {
    var out = [];
    var remaining = total;
    for (var i = 0; i < count; i += 1) {
      var slotsLeft = count - i;
      if (slotsLeft === 1) {
        out.push(Math.max(minEach, remaining));
        break;
      }
      var maxForThis = remaining - minEach * (slotsLeft - 1);
      var share = rand(minEach, Math.max(minEach, Math.floor(maxForThis / 2)));
      out.push(share);
      remaining -= share;
    }
    var adjust = total - out.reduce(function (s, a) { return s + a; }, 0);
    if (out.length) out[out.length - 1] += adjust;
    return out;
  }

  function splitTotalAmountLowVariance(total, count, minEach, varianceRatio) {
    var base = total / count;
    var out = [];
    var remaining = total;
    for (var i = 0; i < count; i += 1) {
      var slotsLeft = count - i;
      if (slotsLeft === 1) {
        out.push(Math.max(minEach, Math.round(remaining)));
        break;
      }
      var jitter = base * varianceRatio;
      var minV = Math.max(minEach, Math.round(base - jitter));
      var maxV = Math.max(minV, Math.round(base + jitter));
      var v = rand(minV, maxV);
      var maxAllowed = Math.round(remaining - minEach * (slotsLeft - 1));
      v = Math.min(v, maxAllowed);
      out.push(v);
      remaining -= v;
    }
    var sum = out.reduce(function (s, a) { return s + a; }, 0);
    var delta = total - sum;
    if (out.length) out[out.length - 1] += delta;
    return out;
  }

  function nonOverlappingPosition(existingNodes, x, y) {
    for (var i = 0; i < existingNodes.length; i += 1) {
      if (distance({ x: x, y: y }, existingNodes[i]) < NODE_SEPARATION) return false;
    }
    return true;
  }

  function tryPlaceNode(existingNodes, center, spread, maxAttempts) {
    for (var attempt = 0; attempt < maxAttempts; attempt += 1) {
      var x = clamp(Math.round(center.x + rand(-spread, spread)), 70, WORLD.width - 70);
      var y = clamp(Math.round(center.y + rand(-spread, spread)), 60, WORLD.height - 120);
      if (nonOverlappingPosition(existingNodes, x, y)) return { x: x, y: y };
    }
    return null;
  }

  function tryPlaceNodeWithRule(existingNodes, center, spread, maxAttempts, ruleFn) {
    for (var attempt = 0; attempt < maxAttempts; attempt += 1) {
      var x = clamp(Math.round(center.x + rand(-spread, spread)), 70, WORLD.width - 70);
      var y = clamp(Math.round(center.y + rand(-spread, spread)), 60, WORLD.height - 120);
      if (!nonOverlappingPosition(existingNodes, x, y)) continue;
      if (ruleFn && !ruleFn(x, y)) continue;
      return { x: x, y: y };
    }
    return null;
  }

  function generateNodesForType(type, count, totalAmount) {
    var amounts = splitTotalAmountLowVariance(totalAmount, count, 24, 0.15);
    var centers = [];
    var indexOrder = [];
    var stoneLobeA = { x: WORLD.width * 0.22, y: WORLD.height * 0.28 };
    var stoneLobeB = { x: WORLD.width * 0.78, y: WORLD.height * 0.36 };
    var stoneLobeAvoidRadius = 115;
    if (type === 'stone') {
      // Force two clearly separated lobes.
      centers.push(stoneLobeA);
      centers.push(stoneLobeB);
      var half = Math.floor(count / 2);
      for (var iA = 0; iA < half; iA += 1) indexOrder.push(0);
      for (var iB = half; iB < count; iB += 1) indexOrder.push(1);
    } else if (type === 'wood') {
      // Wood should be broadly scattered, not clustered.
      centers.push({ x: WORLD.width * 0.5, y: WORLD.height * 0.45 });
      for (var iW = 0; iW < count; iW += 1) indexOrder.push(0);
    } else if (type === 'food') {
      centers.push({ x: WORLD.width * 0.62, y: WORLD.height * 0.56 });
      for (var iF = 0; iF < count; iF += 1) indexOrder.push(0);
    } else {
      centers.push({ x: WORLD.width * 0.52, y: WORLD.height * 0.24 });
      for (var iG = 0; iG < count; iG += 1) indexOrder.push(0);
    }

    var spread = type === 'stone' ? 55 : type === 'wood' ? Math.max(WORLD.width, WORLD.height) : 120;
    for (var i = 0; i < count; i += 1) {
      var c = centers[indexOrder[i] || 0];
      var pos = null;
      if (type === 'stone') {
        pos = tryPlaceNodeWithRule(WORLD.nodes, c, spread, 70, function (x, y) {
          return distance({ x: x, y: y }, WORLD.base) >= BASE_STONE_MIN_DISTANCE;
        });
      } else if (type === 'wood') {
        // For wood, pick random points across the full map while preserving no-overlap.
        pos = tryPlaceNodeWithRule(
          WORLD.nodes,
          { x: rand(70, WORLD.width - 70), y: rand(60, WORLD.height - 120) },
          0,
          120,
          function (x, y) {
            return (
              distance({ x: x, y: y }, WORLD.base) >= BASE_STONE_MIN_DISTANCE &&
              distance({ x: x, y: y }, stoneLobeA) >= stoneLobeAvoidRadius &&
              distance({ x: x, y: y }, stoneLobeB) >= stoneLobeAvoidRadius
            );
          }
        );
      } else {
        pos = tryPlaceNode(WORLD.nodes, c, spread, 60);
      }
      if (!pos) {
        pos = (type === 'stone'
          ? tryPlaceNodeWithRule(
            WORLD.nodes,
            { x: WORLD.width * 0.5, y: WORLD.height * 0.45 },
            Math.max(WORLD.width, WORLD.height),
            120,
            function (x, y) {
              return distance({ x: x, y: y }, WORLD.base) >= BASE_STONE_MIN_DISTANCE;
            }
          )
          : type === 'wood'
          ? tryPlaceNodeWithRule(
            WORLD.nodes,
            { x: WORLD.width * 0.5, y: WORLD.height * 0.45 },
            Math.max(WORLD.width, WORLD.height),
            180,
            function (x, y) {
              return (
                distance({ x: x, y: y }, WORLD.base) >= BASE_STONE_MIN_DISTANCE &&
                distance({ x: x, y: y }, stoneLobeA) >= stoneLobeAvoidRadius &&
                distance({ x: x, y: y }, stoneLobeB) >= stoneLobeAvoidRadius
              );
            }
          )
          : tryPlaceNode(
          WORLD.nodes,
          { x: WORLD.width * 0.5, y: WORLD.height * 0.45 },
          Math.max(WORLD.width, WORLD.height),
          120
          ));
      }
      if (!pos) continue;
      WORLD.nodes.push({
        id: 'n-' + type + '-' + i + '-' + rand(1000, 9999),
        type: type,
        x: pos.x,
        y: pos.y,
        amount: amounts[i] || 24,
      });
    }
  }

  function startWorld(tier) {
    var typeList = TIER_RESOURCE_TYPES[tier];
    var workerCount = 3 + PLAYER.workerUpgradeTier;
    switchScreen('world');
    var mapWidth = els.map.clientWidth;
    var mapHeight = els.map.clientHeight;
    var basePoint = {
      x: mapWidth * 0.5,
      y: mapHeight * 0.8,
    };
    WORLD = {
      tier: tier,
      width: mapWidth,
      height: mapHeight,
      stock: { wood: 0, stone: 0, food: 0, gold: 0 },
      nodes: [],
      workers: [],
      structures: [],
      constructions: [],
      base: basePoint,
      runTimeMs: 0,
      selectedWorkerIds: [],
      praise: 0,
      praiseCap: 2000,
      templesCompleted: 0,
    };
    lastMouseMapPos = { x: WORLD.base.x, y: WORLD.base.y };

    typeList.forEach(function (type) {
      var baseNodeCount = rand(6, 10);
      var tripledCount = baseNodeCount * 3;
      if (type === 'stone') {
        tripledCount = Math.max(3, Math.round(tripledCount * 0.6));
      } else if (type === 'wood') {
        tripledCount = Math.max(3, Math.round(tripledCount * 1.2));
        tripledCount = Math.max(3, Math.round(tripledCount * 0.8));
      }
      var total = randomAmountTotal(baseNodeCount);
      if (type === 'wood') {
        var woodBonus = PLAYER.worldWoodTier > 0 ? WORLD_RESOURCE_TIER_BONUS[PLAYER.worldWoodTier - 1] : 0;
        total = 600 + woodBonus;
      }
      if (type === 'stone') {
        var stoneBonus = PLAYER.worldStoneTier > 0 ? WORLD_RESOURCE_TIER_BONUS[PLAYER.worldStoneTier - 1] : 0;
        total = 500 + stoneBonus;
      }
      generateNodesForType(type, tripledCount, total);
    });

    for (var w = 0; w < workerCount; w += 1) {
      WORLD.workers.push({
        id: 'w-' + w,
        x: WORLD.base.x + rand(-16, 16),
        y: WORLD.base.y + rand(-16, 16),
        speed: 56,
        state: 'idle',
        targetType: null,
        targetNodeId: null,
        gatherMs: 0,
        carryingType: null,
        carryingAmount: 0,
      });
    }

    assignDefaultWorkerTargets();

    buildAssignmentMenu();
    renderWorld();
    startTick();
  }

  function nearestNodeFromPoint(point, type) {
    var candidates = WORLD.nodes.filter(function (n) {
      return n.type === type && n.amount > 0;
    });
    if (!candidates.length) return null;
    var best = candidates[0];
    var bestDist = distance(point, best);
    for (var i = 1; i < candidates.length; i += 1) {
      var d = distance(point, candidates[i]);
      if (d < bestDist) {
        bestDist = d;
        best = candidates[i];
      }
    }
    return best;
  }

  function assignWorkerToNode(worker, node) {
    if (!worker || !node) return;
    worker.targetType = node.type;
    worker.targetNodeId = node.id;
    worker.state = 'toNode';
    worker.gatherMs = 0;
  }

  function assignDefaultWorkerTargets() {
    if (!WORLD || !WORLD.workers.length) return;
    // Default opening orders: 2 workers to closest wood, 1 worker to closest stone.
    var assigned = 0;
    for (var i = 0; i < WORLD.workers.length && assigned < 2; i += 1) {
      var woodNode = nearestNodeFromPoint(WORLD.workers[i], 'wood');
      if (!woodNode) break;
      assignWorkerToNode(WORLD.workers[i], woodNode);
      assigned += 1;
    }
    if (WORLD.workers.length >= 3) {
      var stoneNode = nearestNodeFromPoint(WORLD.workers[2], 'stone');
      if (stoneNode) assignWorkerToNode(WORLD.workers[2], stoneNode);
    }
  }

  function switchScreen(name) {
    var world = name === 'world';
    els.globalScreen.classList.toggle('hidden', world);
    els.worldScreen.classList.toggle('hidden', !world);
  }

  function stopWorld() {
    if (!WORLD) return;
    stopTick();
    WORLD = null;
    switchScreen('global');
    renderGlobal();
    placement.type = null;
    drag.active = false;
    commandLogText = 'No commands yet.';
  }

  function templePraiseReward(countCompletedBefore) {
    if (countCompletedBefore <= 0) return 500;
    if (countCompletedBefore === 1) return 350;
    if (countCompletedBefore === 2) return 200;
    return 150;
  }

  function applyTemplePraiseReward() {
    var reward = templePraiseReward(WORLD.templesCompleted);
    var space = WORLD.praiseCap - WORLD.praise;
    var gained = Math.max(0, Math.min(space, reward));
    WORLD.praise += gained;
    WORLD.templesCompleted += 1;
    commandLogText = 'Temple complete: +' + gained + ' praise.';
  }

  function distance(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function moveTowards(unit, target, dtSec) {
    var dx = target.x - unit.x;
    var dy = target.y - unit.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.001) return;
    var step = unit.speed * dtSec;
    if (step >= dist) {
      unit.x = target.x;
      unit.y = target.y;
      return;
    }
    unit.x += (dx / dist) * step;
    unit.y += (dy / dist) * step;
  }

  function nearestNode(worker, type) {
    var candidates = WORLD.nodes.filter(function (n) {
      return n.type === type && n.amount > 0;
    });
    if (!candidates.length) return null;
    var best = candidates[0];
    var bestDist = distance(worker, best);
    for (var i = 1; i < candidates.length; i += 1) {
      var d = distance(worker, candidates[i]);
      if (d < bestDist) {
        bestDist = d;
        best = candidates[i];
      }
    }
    return best;
  }

  function nearestDropoff(worker) {
    var depots = WORLD.structures.filter(function (s) { return s.type === 'depot'; });
    var all = [WORLD.base].concat(depots);
    var best = all[0];
    var bestDist = distance(worker, best);
    for (var i = 1; i < all.length; i += 1) {
      var d = distance(worker, all[i]);
      if (d < bestDist) {
        bestDist = d;
        best = all[i];
      }
    }
    return best;
  }

  function workerStep(worker, dtMs) {
    var dtSec = dtMs / 1000;
    var gatherDurationMs = 2100;
    var carryAmount = 4;

    if (!worker.targetType && worker.state === 'idle') return;

    if (worker.state === 'idle') {
      var node = nearestNode(worker, worker.targetType);
      if (!node) return;
      worker.targetNodeId = node.id;
      worker.state = 'toNode';
    }

    if (worker.state === 'toNode') {
      var targetNode = WORLD.nodes.find(function (n) { return n.id === worker.targetNodeId; });
      if (!targetNode || targetNode.amount <= 0) {
        worker.state = 'idle';
        worker.targetNodeId = null;
        return;
      }
      moveTowards(worker, targetNode, dtSec);
      if (distance(worker, targetNode) < 7) {
        worker.state = 'gathering';
        worker.gatherMs = 0;
      }
      return;
    }

    if (worker.state === 'gathering') {
      var gNode = WORLD.nodes.find(function (n) { return n.id === worker.targetNodeId; });
      if (!gNode || gNode.amount <= 0) {
        worker.state = 'idle';
        worker.targetNodeId = null;
        return;
      }
      worker.gatherMs += dtMs;
      if (worker.gatherMs >= gatherDurationMs) {
        var gain = Math.min(carryAmount, gNode.amount);
        gNode.amount -= gain;
        worker.carryingType = gNode.type;
        worker.carryingAmount = gain;
        worker.state = 'toDropoff';
        worker.targetNodeId = null;
      }
      return;
    }

    if (worker.state === 'toDropoff') {
      var drop = nearestDropoff(worker);
      moveTowards(worker, drop, dtSec);
      if (distance(worker, drop) < 8) {
        WORLD.stock[worker.carryingType] += worker.carryingAmount;
        worker.carryingType = null;
        worker.carryingAmount = 0;
        worker.state = 'idle';
      }
    }
  }

  function tick(dtMs) {
    if (!WORLD) return;
    WORLD.runTimeMs += dtMs;
    tickConstructions(dtMs);
    WORLD.workers.forEach(function (worker) {
      workerStep(worker, dtMs);
    });
    renderWorld();
  }

  function tickConstructions(dtMs) {
    for (var i = WORLD.constructions.length - 1; i >= 0; i -= 1) {
      var c = WORLD.constructions[i];
      c.elapsedMs += dtMs;
      var cfg = BUILDINGS[c.type];
      if (c.elapsedMs >= cfg.buildMs) {
        WORLD.constructions.splice(i, 1);
        WORLD.structures.push({ type: c.type, x: c.x, y: c.y });
        if (c.type === 'house') {
          spawnWorkerNear({ x: c.x, y: c.y });
        } else if (c.type === 'temple') {
            applyTemplePraiseReward();
        }
      }
    }
  }

  function startTick() {
    stopTick();
    TICK_HANDLE = window.setInterval(function () {
      tick(TICK_MS);
    }, TICK_MS);
  }

  function stopTick() {
    if (TICK_HANDLE !== null) {
      window.clearInterval(TICK_HANDLE);
      TICK_HANDLE = null;
    }
  }

  function renderGlobal() {
    var prog = levelProgress(PLAYER.totalXp);
    PLAYER.level = prog.level;
    els.playerProgress.textContent = 'Level ' + prog.level + ' - ' + prog.current + ' / ' + prog.needed + ' XP';
    els.upgradePoints.textContent = String(PLAYER.upgradePoints);

    var workerNextCost = 1 + PLAYER.workerUpgradeTier;
    if (PLAYER.workerUpgradeTier >= 4) {
      els.buyWorkerUpgradeBtn.disabled = true;
      els.buyWorkerUpgradeBtn.textContent = 'Global +1 Starting Worker (MAX)';
    } else {
      els.buyWorkerUpgradeBtn.disabled = PLAYER.upgradePoints < workerNextCost;
      els.buyWorkerUpgradeBtn.textContent = 'Global +1 Starting Worker (Tier ' + (PLAYER.workerUpgradeTier + 1) + ', ' + workerNextCost + ' UP)';
    }

    var woodCost = 1 + PLAYER.worldWoodTier;
    if (PLAYER.worldWoodTier >= 4) {
      els.buyWoodWorldUpgradeBtn.disabled = true;
      els.buyWoodWorldUpgradeBtn.textContent = 'World Wood +' + WORLD_RESOURCE_TIER_BONUS[3] + ' (MAX)';
    } else {
      els.buyWoodWorldUpgradeBtn.disabled = PLAYER.upgradePoints < woodCost;
      var nextWoodBonus = WORLD_RESOURCE_TIER_BONUS[PLAYER.worldWoodTier];
      els.buyWoodWorldUpgradeBtn.textContent = 'World Wood +' + nextWoodBonus + ' (Tier ' + (PLAYER.worldWoodTier + 1) + ', ' + woodCost + ' UP)';
    }

    var stoneCost = 1 + PLAYER.worldStoneTier;
    if (PLAYER.worldStoneTier >= 4) {
      els.buyStoneWorldUpgradeBtn.disabled = true;
      els.buyStoneWorldUpgradeBtn.textContent = 'World Stone +' + WORLD_RESOURCE_TIER_BONUS[3] + ' (MAX)';
    } else {
      els.buyStoneWorldUpgradeBtn.disabled = PLAYER.upgradePoints < stoneCost;
      var nextStoneBonus = WORLD_RESOURCE_TIER_BONUS[PLAYER.worldStoneTier];
      els.buyStoneWorldUpgradeBtn.textContent = 'World Stone +' + nextStoneBonus + ' (Tier ' + (PLAYER.worldStoneTier + 1) + ', ' + stoneCost + ' UP)';
    }
  }

  function renderEntities() {
    els.entityLayer.textContent = '';

    WORLD.nodes.forEach(function (node) {
      if (node.amount <= 0) return;
      var n = document.createElement('div');
      n.className = 'entity node ' + node.type;
      n.style.left = node.x + 'px';
      n.style.top = node.y + 'px';
      n.textContent = String(node.amount);
      n.title = node.type + ' (' + node.amount + ' left)';
      n.setAttribute('data-node-id', node.id);
      els.entityLayer.appendChild(n);
    });

    WORLD.structures.forEach(function (structure, idx) {
      var d = document.createElement('div');
      d.className = 'entity ' + BUILDINGS[structure.type].className;
      d.style.left = structure.x + 'px';
      d.style.top = structure.y + 'px';
      d.textContent = BUILDINGS[structure.type].label;
      d.setAttribute('data-structure-idx', String(idx));
      els.entityLayer.appendChild(d);
    });

    WORLD.constructions.forEach(function (c) {
      var cfg = BUILDINGS[c.type];
      var frac = Math.min(1, c.elapsedMs / cfg.buildMs);

      var b = document.createElement('div');
      b.className = 'entity ' + cfg.className + ' constructing';
      b.style.left = c.x + 'px';
      b.style.top = c.y + 'px';
      b.style.opacity = String(0.4 + frac * 0.6);
      b.textContent = cfg.label;
      els.entityLayer.appendChild(b);

      var bar = document.createElement('div');
      bar.className = 'entity construction-progress';
      bar.style.left = c.x + 'px';
      bar.style.top = (c.y + cfg.radius + 12) + 'px';
      var fill = document.createElement('div');
      fill.className = 'construction-progress__fill';
      fill.style.width = Math.round(frac * 100) + '%';
      bar.appendChild(fill);
      els.entityLayer.appendChild(bar);
    });

    WORLD.workers.forEach(function (worker) {
      var w = document.createElement('div');
      var selected = WORLD.selectedWorkerIds.indexOf(worker.id) !== -1;
      w.className = 'entity worker' +
        (worker.carryingAmount > 0 ? ' carrying' : '') +
        (selected ? ' worker-selected' : '');
      w.style.left = worker.x + 'px';
      w.style.top = worker.y + 'px';
      w.title = worker.state + (worker.targetType ? ' (' + worker.targetType + ')' : '');
      w.setAttribute('data-worker-id', worker.id);
      els.entityLayer.appendChild(w);
    });
  }

  function remainingByType(type) {
    return WORLD.nodes
      .filter(function (n) { return n.type === type; })
      .reduce(function (sum, n) { return sum + n.amount; }, 0);
  }

  function buildAssignmentMenu() {
    els.resourceAssignmentList.textContent = '';
    RESOURCES.forEach(function (type) {
      var li = document.createElement('li');
      li.id = 'assign-row-' + type;
      li.innerHTML =
        '<div class="assign-line">' +
        '<strong>' + type.toUpperCase() + '</strong> ' +
        '<strong id="stock-' + type + '">0</strong> - ' +
        '<span class="muted" id="remain-' + type + '">0 left</span>' +
        '</div>';
      els.resourceAssignmentList.appendChild(li);
    });
  }

  function updateAssignmentMenu() {
    RESOURCES.forEach(function (type) {
      var row = document.getElementById('assign-row-' + type);
      var remain = remainingByType(type);
      var activeType = TIER_RESOURCE_TYPES[WORLD.tier].includes(type);
      row.classList.toggle('hidden', !activeType);
      document.getElementById('stock-' + type).textContent = String(WORLD.stock[type]);
      document.getElementById('remain-' + type).textContent = remain + ' left';
    });
  }

  function countIdleWorkers() {
    return WORLD.workers.filter(function (w) { return w.state === 'idle'; }).length;
  }

  function renderWorld() {
    if (!WORLD) return;
    els.base.style.left = WORLD.base.x + 'px';
    els.base.style.top = WORLD.base.y + 'px';
    updateAssignmentMenu();
    renderEntities();
    updateBuildButtons();
    renderBuildPreview();
    renderSelectionBox();
    if (els.praiseText) {
      els.praiseText.textContent = WORLD.praise + ' / ' + WORLD.praiseCap;
    }
    if (els.praiseFill) {
      var frac = WORLD.praiseCap > 0 ? WORLD.praise / WORLD.praiseCap : 0;
      els.praiseFill.style.width = Math.round(frac * 100) + '%';
    }
    if (els.commandLog) {
      els.commandLog.textContent = commandLogText;
    }
  }

  function canAffordBuild(type) {
    var c = getBuildCost(type);
    return WORLD.stock.wood >= c.wood && WORLD.stock.stone >= c.stone;
  }

  function spendBuildCost(type) {
    var c = getBuildCost(type);
    WORLD.stock.wood -= c.wood;
    WORLD.stock.stone -= c.stone;
  }

  function structureCountByType(type) {
    return WORLD.structures.filter(function (s) { return s.type === type; }).length;
  }

  function placedCountByType(type) {
    var complete = WORLD.structures.filter(function (s) { return s.type === type; }).length;
    var building = WORLD.constructions.filter(function (c) { return c.type === type; }).length;
    return complete + building;
  }

  function getBuildCost(type) {
    var cfg = BUILDINGS[type];
    if (cfg.cost) return cfg.cost;
    var placedCount = placedCountByType(type);
    var mult = Math.pow(cfg.scaling || 1, placedCount);
    return {
      wood: Math.max(1, Math.round(cfg.baseCost.wood * mult)),
      stone: Math.max(1, Math.round(cfg.baseCost.stone * mult)),
    };
  }

  function spawnWorkerNear(point) {
    WORLD.workers.push({
      id: 'w-' + Date.now() + '-' + rand(100, 999),
      x: point.x + rand(-12, 12),
      y: point.y + rand(-12, 12),
      speed: 56,
      state: 'idle',
      targetType: null,
      targetNodeId: null,
      gatherMs: 0,
      carryingType: null,
      carryingAmount: 0,
    });
  }

  function setPlacementMode(type) {
    dbg('setPlacementMode:enter', { type: type });
    if (!WORLD) return;
    if (!dbgCanAfford(type)) {
      commandLogText = 'Not enough resources to start ' + BUILDINGS[type].label + '.';
      dbg('setPlacementMode:abort:not-affordable', { type: type });
      renderWorld();
      return;
    }
    placement.type = type;
    var px = lastMouseMapPos.x || WORLD.base.x;
    var py = lastMouseMapPos.y || (WORLD.base.y - 90);
    placement.x = clamp(px, 20, WORLD.width - 20);
    placement.y = clamp(py, 20, WORLD.height - 20);
    placement.valid = canPlaceBuildingAt(type, placement.x, placement.y);
    dbg('setPlacementMode:success', { type: type, x: placement.x, y: placement.y, valid: placement.valid });
    renderWorld();
  }

  function beginBuildPlacement(type) {
    dbg('beginBuildPlacement:enter', { type: type });
    if (!WORLD) return;
    // Always clear transient interaction states so stale drag/select modes
    // never block starting a new preview.
    drag.active = false;
    drag.moved = false;
    suppressClickOnce = false;
    WORLD.selectedWorkerIds = [];
    placement.type = null;
    placement.valid = false;
    dbg('beginBuildPlacement:after-reset', { type: type });
    setPlacementMode(type);
  }

  function cancelPlacement() {
    placement.type = null;
    placement.valid = false;
    els.buildHint.textContent = 'Click a build button, then place on the map. Press X to cancel.';
    renderWorld();
  }

  function mapPointFromMouse(ev) {
    var rect = els.map.getBoundingClientRect();
    return {
      x: ev.clientX - rect.left,
      y: ev.clientY - rect.top,
    };
  }

  function renderSelectionBox() {
    var box = els.selectionBox;
    if (!box) return;
    if (!WORLD || !drag.active || !drag.moved || placement.type) {
      box.classList.add('hidden');
      return;
    }
    var minX = Math.min(drag.startX, drag.curX);
    var minY = Math.min(drag.startY, drag.curY);
    var maxX = Math.max(drag.startX, drag.curX);
    var maxY = Math.max(drag.startY, drag.curY);
    box.classList.remove('hidden');
    box.style.left = minX + 'px';
    box.style.top = minY + 'px';
    box.style.width = (maxX - minX) + 'px';
    box.style.height = (maxY - minY) + 'px';
  }

  function selectWorkersInBox() {
    var minX = Math.min(drag.startX, drag.curX);
    var minY = Math.min(drag.startY, drag.curY);
    var maxX = Math.max(drag.startX, drag.curX);
    var maxY = Math.max(drag.startY, drag.curY);
    WORLD.selectedWorkerIds = WORLD.workers
      .filter(function (w) {
        return w.x >= minX && w.x <= maxX && w.y >= minY && w.y <= maxY;
      })
      .map(function (w) { return w.id; });
  }

  function assignSelectedWorkersToNode(nodeId) {
    if (!WORLD || !WORLD.selectedWorkerIds.length) {
      commandLogText = 'No workers selected.';
      return;
    }
    var node = WORLD.nodes.find(function (n) { return n.id === nodeId; });
    if (!node || node.amount <= 0) {
      commandLogText = 'Target node is depleted.';
      return;
    }
    var assigned = 0;
    WORLD.workers.forEach(function (w) {
      if (WORLD.selectedWorkerIds.indexOf(w.id) === -1) return;
      if (w.carryingAmount > 0) return;
      w.targetType = node.type;
      w.targetNodeId = node.id;
      w.state = 'toNode';
      w.gatherMs = 0;
      assigned += 1;
    });
    if (assigned > 0) {
      commandLogText = 'Assigned ' + assigned + ' worker' + (assigned === 1 ? '' : 's') + ' to ' + node.type.toUpperCase() + ' node.';
    } else {
      commandLogText = 'Selected workers are currently carrying resources.';
    }
  }

  function canPlaceBuildingAt(type, x, y) {
    if (!WORLD || !BUILDINGS[type]) return false;
    if (!canAffordBuild(type)) return false;
    var r = BUILDINGS[type].radius;
    if (x < r || x > WORLD.width - r || y < r || y > WORLD.height - r) return false;
    if (distance({ x: x, y: y }, WORLD.base) < r + 42) return false;

    var overlapsNode = WORLD.nodes.some(function (n) {
      if (n.amount <= 0) return false;
      return distance({ x: x, y: y }, n) < r + 20;
    });
    if (overlapsNode) return false;

    var overlapsStructure = WORLD.structures.some(function (s) {
      var sr = BUILDINGS[s.type].radius;
      return distance({ x: x, y: y }, s) < r + sr + 4;
    });
    if (overlapsStructure) return false;

    var overlapsConstruction = WORLD.constructions.some(function (s) {
      var sr = BUILDINGS[s.type].radius;
      return distance({ x: x, y: y }, s) < r + sr + 4;
    });
    if (overlapsConstruction) return false;

    return true;
  }

  function placeBuilding(type, x, y) {
    if (!canPlaceBuildingAt(type, x, y)) return false;
    spendBuildCost(type);
    WORLD.constructions.push({ type: type, x: x, y: y, elapsedMs: 0 });
    commandLogText = BUILDINGS[type].label + ' construction started.';
    return true;
  }

  function updateBuildButtons() {
    function token(amount, key) {
      var ok = WORLD.stock[key] >= amount;
      return '<span class="cost-token ' + (ok ? 'ok' : '') + '">' + amount + key.toUpperCase().charAt(0) + '</span>';
    }

    var houseCost = getBuildCost('house');
    var depotCost = getBuildCost('depot');
    var templeCost = getBuildCost('temple');
    var houseOK = canAffordBuild('house');
    var depotOK = canAffordBuild('depot');
    var templeOK = canAffordBuild('temple');
    // Keep buttons clickable; preview/placement remains affordability-gated.
    els.buildHouseBtn.disabled = false;
    els.buildDepotBtn.disabled = false;
    els.buildTempleBtn.disabled = false;
    els.buildHouseBtn.classList.toggle('build-unaffordable', !houseOK);
    els.buildDepotBtn.classList.toggle('build-unaffordable', !depotOK);
    els.buildTempleBtn.classList.toggle('build-unaffordable', !templeOK);
    els.buildHouseBtn.classList.toggle('build-active', placement.type === 'house');
    els.buildDepotBtn.classList.toggle('build-active', placement.type === 'depot');
    els.buildTempleBtn.classList.toggle('build-active', placement.type === 'temple');
    els.buildHouseBtn.innerHTML = 'House (' + token(houseCost.wood, 'wood') + ' / ' + token(houseCost.stone, 'stone') + ')';
    els.buildDepotBtn.innerHTML = 'Resource Depot (' + token(depotCost.wood, 'wood') + ' / ' + token(depotCost.stone, 'stone') + ')';
    els.buildTempleBtn.innerHTML = 'Temple (' + token(templeCost.wood, 'wood') + ' / ' + token(templeCost.stone, 'stone') + ')';
    if (!placement.type) {
      els.buildHint.textContent = 'Click a build button, then place on the map. Press X to cancel.';
    } else {
      els.buildHint.textContent = 'Placing ' + BUILDINGS[placement.type].label + ' - click map to confirm, X to cancel.';
    }
  }

  function renderBuildPreview() {
    var preview = els.buildPreview;
    if (!WORLD || !placement.type) {
      var hiddenState = 'hidden|' + String(!!WORLD) + '|' + String(placement.type);
      if (hiddenState !== lastPreviewDebugState) {
        dbg('renderBuildPreview:hidden', { hasWorld: !!WORLD, placementType: placement.type });
        lastPreviewDebugState = hiddenState;
      }
      preview.classList.add('hidden');
      return;
    }
    var cfg = BUILDINGS[placement.type];
    preview.className = 'entity build-preview ' + cfg.className;
    if (!placement.valid) preview.classList.add('invalid');
    preview.classList.remove('hidden');
    preview.textContent = cfg.label;
    preview.style.left = placement.x + 'px';
    preview.style.top = placement.y + 'px';
    var shownState = 'shown|' + placement.type + '|' + String(placement.valid);
    if (shownState !== lastPreviewDebugState) {
      dbg('renderBuildPreview:shown', { type: placement.type, valid: placement.valid });
      lastPreviewDebugState = shownState;
    }
  }

  function buildDepot() {
    if (!WORLD) return;
    setPlacementMode('depot');
  }

  function bindEvents() {
    document.querySelectorAll('[data-open-tier]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tier = Number(btn.getAttribute('data-open-tier'));
        startWorld(tier);
      });
    });

    els.buyWorkerUpgradeBtn.addEventListener('click', function () {
      if (PLAYER.workerUpgradeTier >= 4) return;
      var cost = 1 + PLAYER.workerUpgradeTier;
      if (PLAYER.upgradePoints < cost) return;
      PLAYER.upgradePoints -= cost;
      PLAYER.workerUpgradeTier += 1;
      renderGlobal();
    });

    els.buyWoodWorldUpgradeBtn.addEventListener('click', function () {
      if (PLAYER.worldWoodTier >= 4) return;
      var cost = 1 + PLAYER.worldWoodTier;
      if (PLAYER.upgradePoints < cost) return;
      PLAYER.upgradePoints -= cost;
      PLAYER.worldWoodTier += 1;
      renderGlobal();
    });

    els.buyStoneWorldUpgradeBtn.addEventListener('click', function () {
      if (PLAYER.worldStoneTier >= 4) return;
      var cost = 1 + PLAYER.worldStoneTier;
      if (PLAYER.upgradePoints < cost) return;
      PLAYER.upgradePoints -= cost;
      PLAYER.worldStoneTier += 1;
      renderGlobal();
    });

    els.prestigeBtn.addEventListener('click', function () {
      if (!WORLD) return;
      var praiseXp = WORLD.praise || 0;
      var ok = window.confirm('Prestige and return to Global Screen?\\nGain ' + praiseXp + ' XP from praise.');
      if (!ok) return;
      gainXp(praiseXp);
      stopWorld();
    });
    els.buildHouseBtn.addEventListener('mousedown', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      dbg('btn:house:click');
      if (!WORLD) return;
      beginBuildPlacement('house');
    });
    els.buildDepotBtn.addEventListener('mousedown', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      dbg('btn:depot:click');
      if (!WORLD) return;
      beginBuildPlacement('depot');
    });
    els.buildTempleBtn.addEventListener('mousedown', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      dbg('btn:temple:click');
      if (!WORLD) return;
      beginBuildPlacement('temple');
    });

    els.map.addEventListener('mousemove', function (ev) {
      if (!WORLD) return;
      var p = mapPointFromMouse(ev);
      lastMouseMapPos.x = p.x;
      lastMouseMapPos.y = p.y;
      if (placement.type) {
        placement.x = p.x;
        placement.y = p.y;
        placement.valid = canPlaceBuildingAt(placement.type, p.x, p.y);
        renderBuildPreview();
        return;
      }
      if (drag.active) {
        drag.curX = p.x;
        drag.curY = p.y;
        if (Math.abs(drag.curX - drag.startX) > 4 || Math.abs(drag.curY - drag.startY) > 4) {
          drag.moved = true;
        }
        renderSelectionBox();
      }
    });

    els.map.addEventListener('mousedown', function (ev) {
      dbg('map:mousedown', { button: ev.button, target: ev.target && ev.target.className });
      if (!WORLD || placement.type || ev.button !== 0) return;
      var p = mapPointFromMouse(ev);
      drag.active = true;
      drag.moved = false;
      drag.startX = p.x;
      drag.startY = p.y;
      drag.curX = p.x;
      drag.curY = p.y;
      renderSelectionBox();
    });

    els.map.addEventListener('mouseup', function () {
      if (!WORLD || placement.type || !drag.active) return;
      if (drag.moved) {
        selectWorkersInBox();
        suppressClickOnce = true;
        renderWorld();
      }
      drag.active = false;
      drag.moved = false;
      renderSelectionBox();
    });

    els.map.addEventListener('click', function (ev) {
      dbg('map:click', { target: ev.target && ev.target.className });
      if (!WORLD) return;
      if (suppressClickOnce) {
        suppressClickOnce = false;
        return;
      }
      if (placement.type) {
        var p = mapPointFromMouse(ev);
        placement.x = p.x;
        placement.y = p.y;
        placement.valid = canPlaceBuildingAt(placement.type, p.x, p.y);
        if (!placement.valid) {
          renderBuildPreview();
          return;
        }
        var built = placeBuilding(placement.type, p.x, p.y);
        if (built) {
          placement.type = null;
        }
        renderWorld();
        return;
      }

      WORLD.selectedWorkerIds = [];
      renderWorld();
    });

    els.entityLayer.addEventListener('mousedown', function (ev) {
      if (!WORLD || placement.type) return;
      if (ev.button !== 0) return;
      var workerEl = ev.target.closest('[data-worker-id]');
      if (workerEl) {
        WORLD.selectedWorkerIds = [workerEl.getAttribute('data-worker-id')];
        commandLogText = 'Selected 1 worker.';
        renderWorld();
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      var nodeEl = ev.target.closest('[data-node-id]');
      if (!nodeEl) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (WORLD.selectedWorkerIds.length) {
        assignSelectedWorkersToNode(nodeEl.getAttribute('data-node-id'));
        renderWorld();
      }
    });

    window.addEventListener('keydown', function (ev) {
      if (ev.key === 'x' || ev.key === 'X') {
        if (placement.type) cancelPlacement();
      }
    });
  }

  bindEvents();
  renderGlobal();
})();
