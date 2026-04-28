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
  };

  var WORLD = null;
  var TICK_HANDLE = null;
  var TICK_MS = 100;
  var TEMPLE_XP = 1000;
  var NODE_SEPARATION = 36;
  var BASE_STONE_MIN_DISTANCE = 190;
  var drag = { active: false, moved: false, startX: 0, startY: 0, curX: 0, curY: 0 };
  var suppressClickOnce = false;
  var BUILDINGS = {
    house: { baseCost: { wood: 40, stone: 20 }, scaling: 1.8, radius: 24, className: 'house', label: 'House' },
    depot: { baseCost: { wood: 60, stone: 40 }, scaling: 1.8, radius: 28, className: 'depot', label: 'Depot' },
    temple: { cost: { wood: 120, stone: 120 }, radius: 34, className: 'temple', label: 'Temple' },
  };
  var placement = {
    type: null,
    x: 0,
    y: 0,
    valid: false,
  };

  var els = {
    globalScreen: document.getElementById('global-screen'),
    worldScreen: document.getElementById('world-screen'),
    playerProgress: document.getElementById('player-progress'),
    upgradePoints: document.getElementById('upgrade-points'),
    buyWorkerUpgradeBtn: document.getElementById('buy-worker-upgrade-btn'),
    backToGlobalBtn: document.getElementById('back-to-global-btn'),
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
    if (level === 1) return 1000;
    if (level === 2) return 1200;
    if (level === 3) return 1400;
    if (level === 4) return 1600;
    if (level === 5) return 2000;
    return 2000 + (level - 5) * 200;
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
    var amounts = splitTotalAmount(totalAmount, count, 24);
    var centers = [];
    if (type === 'stone') {
      centers.push({ x: WORLD.width * 0.24, y: WORLD.height * 0.34 });
      centers.push({ x: WORLD.width * 0.34, y: WORLD.height * 0.44 });
    } else if (type === 'wood') {
      centers.push({ x: WORLD.width * 0.74, y: WORLD.height * 0.33 });
    } else if (type === 'food') {
      centers.push({ x: WORLD.width * 0.62, y: WORLD.height * 0.56 });
    } else {
      centers.push({ x: WORLD.width * 0.52, y: WORLD.height * 0.24 });
    }

    var spread = type === 'stone' ? 95 : type === 'wood' ? 150 : 120;
    for (var i = 0; i < count; i += 1) {
      var c = centers[i % centers.length];
      var pos = null;
      if (type === 'stone') {
        pos = tryPlaceNodeWithRule(WORLD.nodes, c, spread, 70, function (x, y) {
          return distance({ x: x, y: y }, WORLD.base) >= BASE_STONE_MIN_DISTANCE;
        });
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
      base: basePoint,
      runTimeMs: 0,
      selectedWorkerIds: [],
    };

    typeList.forEach(function (type) {
      var baseNodeCount = rand(6, 10);
      var tripledCount = baseNodeCount * 3;
      if (type === 'stone') {
        tripledCount = Math.max(3, Math.round(tripledCount * 0.6));
      } else if (type === 'wood') {
        tripledCount = Math.max(3, Math.round(tripledCount * 1.2));
      }
      var total = randomAmountTotal(baseNodeCount);
      generateNodesForType(type, tripledCount, total);
    });

    for (var w = 0; w < workerCount; w += 1) {
      WORLD.workers.push({
        id: 'w-' + w,
        x: WORLD.base.x + rand(-16, 16),
        y: WORLD.base.y + rand(-16, 16),
        speed: 70,
        state: 'idle',
        targetType: null,
        targetNodeId: null,
        gatherMs: 0,
        carryingType: null,
        carryingAmount: 0,
      });
    }

    buildAssignmentMenu();
    renderWorld();
    startTick();
  }

  function switchScreen(name) {
    var world = name === 'world';
    els.globalScreen.classList.toggle('hidden', world);
    els.worldScreen.classList.toggle('hidden', !world);
  }

  function stopWorld() {
    if (!WORLD) return;
    stopTick();
    var xpGain = Math.floor(
      WORLD.stock.wood * 0.25 +
      WORLD.stock.stone * 0.25 +
      WORLD.stock.food * 0.35 +
      WORLD.stock.gold * 0.6
    );
    gainXp(xpGain);
    WORLD = null;
    switchScreen('global');
    renderGlobal();
    placement.type = null;
    drag.active = false;
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
    var gatherDurationMs = 1200;
    var carryAmount = 12;

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
    WORLD.workers.forEach(function (worker) {
      workerStep(worker, dtMs);
    });
    renderWorld();
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

    var nextCost = 1 + PLAYER.workerUpgradeTier;
    if (PLAYER.workerUpgradeTier >= 5) {
      els.buyWorkerUpgradeBtn.disabled = true;
      els.buyWorkerUpgradeBtn.textContent = 'Global +1 Starting Worker (MAX)';
    } else {
      els.buyWorkerUpgradeBtn.disabled = PLAYER.upgradePoints < nextCost;
      els.buyWorkerUpgradeBtn.textContent = 'Global +1 Starting Worker (Tier ' + (PLAYER.workerUpgradeTier + 1) + ', ' + nextCost + ' UP)';
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

    WORLD.workers.forEach(function (worker) {
      var w = document.createElement('div');
      var selected = WORLD.selectedWorkerIds.indexOf(worker.id) !== -1;
      w.className = 'entity worker' +
        (worker.carryingAmount > 0 ? ' carrying' : '') +
        (selected ? ' worker-selected' : '');
      w.style.left = worker.x + 'px';
      w.style.top = worker.y + 'px';
      w.title = worker.state + (worker.targetType ? ' (' + worker.targetType + ')' : '');
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

  function getBuildCost(type) {
    var cfg = BUILDINGS[type];
    if (cfg.cost) return cfg.cost;
    var builtCount = structureCountByType(type);
    var mult = Math.pow(cfg.scaling || 1, builtCount);
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
      speed: 70,
      state: 'idle',
      targetType: null,
      targetNodeId: null,
      gatherMs: 0,
      carryingType: null,
      carryingAmount: 0,
    });
  }

  function setPlacementMode(type) {
    if (!WORLD) return;
    if (!canAffordBuild(type)) return;
    placement.type = type;
    placement.x = WORLD.base.x;
    placement.y = WORLD.base.y - 90;
    placement.valid = canPlaceBuildingAt(type, placement.x, placement.y);
    renderWorld();
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
    if (!WORLD || !WORLD.selectedWorkerIds.length) return;
    var node = WORLD.nodes.find(function (n) { return n.id === nodeId; });
    if (!node || node.amount <= 0) return;
    WORLD.workers.forEach(function (w) {
      if (WORLD.selectedWorkerIds.indexOf(w.id) === -1) return;
      if (w.carryingAmount > 0) return;
      w.targetType = node.type;
      w.targetNodeId = node.id;
      w.state = 'toNode';
      w.gatherMs = 0;
    });
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

    return true;
  }

  function placeBuilding(type, x, y) {
    if (!canPlaceBuildingAt(type, x, y)) return false;
    spendBuildCost(type);
    WORLD.structures.push({ type: type, x: x, y: y });
    if (type === 'house') {
      spawnWorkerNear({ x: x, y: y });
    } else if (type === 'temple') {
      gainXp(TEMPLE_XP);
    }
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
    els.buildHouseBtn.disabled = !houseOK;
    els.buildDepotBtn.disabled = !depotOK;
    els.buildTempleBtn.disabled = !templeOK;
    els.buildHouseBtn.classList.toggle('build-unaffordable', !houseOK);
    els.buildDepotBtn.classList.toggle('build-unaffordable', !depotOK);
    els.buildTempleBtn.classList.toggle('build-unaffordable', !templeOK);
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
      if (PLAYER.workerUpgradeTier >= 5) return;
      var cost = 1 + PLAYER.workerUpgradeTier;
      if (PLAYER.upgradePoints < cost) return;
      PLAYER.upgradePoints -= cost;
      PLAYER.workerUpgradeTier += 1;
      renderGlobal();
    });

    els.backToGlobalBtn.addEventListener('click', stopWorld);
    els.buildHouseBtn.addEventListener('click', function () {
      if (!WORLD) return;
      setPlacementMode('house');
    });
    els.buildDepotBtn.addEventListener('click', buildDepot);
    els.buildTempleBtn.addEventListener('click', function () {
      if (!WORLD) return;
      setPlacementMode('temple');
    });

    els.map.addEventListener('mousemove', function (ev) {
      if (!WORLD) return;
      var p = mapPointFromMouse(ev);
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

      var nodeEl = ev.target.closest('[data-node-id]');
      if (nodeEl && WORLD.selectedWorkerIds.length) {
        assignSelectedWorkersToNode(nodeEl.getAttribute('data-node-id'));
        renderWorld();
        return;
      }

      WORLD.selectedWorkerIds = [];
      renderWorld();
    });

    els.entityLayer.addEventListener('click', function (ev) {
      if (!WORLD || placement.type) return;
      var nodeEl = ev.target.closest('[data-node-id]');
      if (!nodeEl) return;
      if (WORLD.selectedWorkerIds.length) {
        assignSelectedWorkersToNode(nodeEl.getAttribute('data-node-id'));
        renderWorld();
      }
      ev.stopPropagation();
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
