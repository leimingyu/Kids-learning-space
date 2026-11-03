(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const NAMES = ['Hundreds', 'Tens', 'Ones'];
  const COLORS = ['--dp-blue', '--dp-orange', '--dp-green'];
  const VALUES = [100, 10, 1];
  const SIZES = [[40, 40], [4, 40], [4, 4]];
  const SINGULAR = ['hundred', 'ten', 'one'];
  function amount(count, unit) { return count + ' ' + SINGULAR[unit] + (count === 1 ? '' : 's'); }

  // Build the place-value story from quantities, rather than maintaining a
  // separate handwritten animation for each equation. Every published stage
  // represents all of the original blocks, even when some remain unshared.
  function createPlan(dividend, divisor) {
    if (!Number.isInteger(dividend) || dividend < 0 || dividend > 999) throw new RangeError('Sharing lessons need a whole number from 0 to 999.');
    if (!Number.isInteger(divisor) || divisor < 2 || divisor > 9) throw new RangeError('Sharing lessons need 2 to 9 groups.');
    const left = [Math.floor(dividend / 100), Math.floor(dividend / 10) % 10, dividend % 10];
    const each = [0, 0, 0], digits = [null, null, null];
    const firstUnit = dividend >= 100 ? 0 : dividend >= 10 ? 1 : 2;
    const stages = [];
    function quotientText() {
      const visible = digits.slice(firstUnit);
      while (visible.length > 1 && visible[0] === 0) visible.shift();
      if (!visible.some(value => value !== null && value !== 0)) {
        return digits[2] === null ? '—' : '0';
      }
      return visible.map(value => value === null ? '_' : String(value)).join(' ');
    }
    function stage(title, detail, action) {
      const total = left.reduce((sum, count, unit) => sum + count * VALUES[unit], 0)
        + divisor * each.reduce((sum, count, unit) => sum + count * VALUES[unit], 0);
      if (total !== dividend) throw new Error('Sharing plan must conserve the dividend.');
      stages.push(Object.assign({ title: title, detail: detail, left: left.slice(), each: each.slice(), quotient: quotientText() }, action));
    }
    stage('Start with ' + dividend, left.map((count, unit) => amount(count, unit)).join(' · '));
    for (let unit = firstUnit; unit < 3; unit++) {
      const share = Math.floor(left[unit] / divisor);
      each[unit] = share; left[unit] -= share * divisor; digits[unit] = share;
      let detail;
      if (share === 0) detail = digits.slice(firstUnit, unit).some(value => value > 0)
        ? 'Each group gets 0 ' + NAMES[unit].toLowerCase() + '. Keep this place in the answer.'
        : 'There are not enough ' + NAMES[unit].toLowerCase() + ' to give one to every group. Regroup before writing the first answer digit.';
      else detail = 'Each group gets ' + amount(share, unit) + '; ' + amount(left[unit], unit) + (left[unit] === 1 ? ' remains.' : ' remain.');
      if (unit === 2) {
        const answer = Math.floor(dividend / divisor), remainder = dividend % divisor;
        detail = 'Each group has ' + answer + '. ' + (remainder ? amount(remainder, 2) + (remainder === 1 ? ' is' : ' are') + ' left over. There are not enough to give one more to each of the ' + divisor + ' groups.' : 'All ' + dividend + ' have been shared equally.');
      }
      stage('Share the ' + NAMES[unit].toLowerCase(), detail, { share: unit });
      if (unit < 2 && left[unit]) {
        const count = left[unit]; left[unit] = 0; left[unit + 1] += count * 10;
        stage('Exchange the remaining ' + SINGULAR[unit] + (count === 1 ? '' : 's'), amount(count, unit) + (count === 1 ? ' becomes ' : ' become ') + amount(count * 10, unit + 1) + '. Now share ' + amount(left[unit + 1], unit + 1) + '.', { exchange: unit, exchangeCount: count });
      }
    }
    return { dividend: dividend, divisor: divisor, quotient: Math.floor(dividend / divisor), remainder: dividend % divisor, stages: stages };
  }
  let instanceCount = 0;

  function mount(container, options) {
    options = options || {};
    const plan = createPlan(options.dividend === undefined ? 432 : options.dividend, options.divisor === undefined ? 3 : options.divisor);
    const STAGES = plan.stages, lastStep = STAGES.length - 1;
    const description = plan.dividend + ' shared into ' + plan.divisor + ' equal groups';
    const document = container.ownerDocument || global.document;
    const markerId = 'ds-direction-' + (++instanceCount);
    let step = Number.isInteger(options.initialStep) ? Math.max(0, Math.min(lastStep, options.initialStep)) : 0;
    let completedStep = step;
    let busy = false, destroyed = false, runId = 0, frameId = 0, finishTween = null;
    let layout = null, model = stateAt(step), flights = [], focus = null, motionLayer = null;
    let currentDetail = STAGES[step].detail;
    const reduced = global.matchMedia('(prefers-reduced-motion: reduce)');
    const scene = element('svg', { class: 'ds-scene', role: 'img', 'aria-label': description, style: 'display:block;width:100%;overflow:visible;pointer-events:none' });
    const detail = document.createElement('div');
    detail.className = 'ds-detail';
    detail.setAttribute('role', 'status');
    detail.setAttribute('aria-live', 'polite');
    container.append(scene, detail);

    function element(tag, attrs, content) {
      const node = document.createElementNS(NS, tag);
      Object.entries(attrs || {}).forEach(function (entry) { node.setAttribute(entry[0], String(entry[1])); });
      if (content !== undefined) node.textContent = content;
      return node;
    }
    function stateAt(index) {
      return { left: STAGES[index].left.slice(), groups: Array.from({ length: plan.divisor }, function () { return STAGES[index].each.slice(); }) };
    }
    function conservedTotal() {
      return model.left.reduce(function (sum, n, u) { return sum + n * VALUES[u]; }, 0)
        + model.groups.reduce(function (sum, group) { return sum + group.reduce(function (value, n, u) { return value + n * VALUES[u]; }, 0); }, 0)
        + flights.reduce(function (sum, flight) { return sum + VALUES[flight.unit]; }, 0);
    }
    function geometry() {
      const measured = container.getBoundingClientRect().width;
      const width = measured > 0 ? measured : (layout ? layout.width : 704);
      const stacked = width < 620, gap = 20;
      const pool = { x: stacked ? 0 : 24, y: 20, w: stacked ? width : width - 48 };
      function inventoryHeight(areaWidth, counts) {
        return Math.max.apply(null, counts.map(function (count, unit) {
          return count ? Math.ceil(count / Math.max(1, Math.floor(areaWidth / 3 / (SIZES[unit][0] + 4)))) * (SIZES[unit][1] + 4) - 4 : 20;
        }));
      }
      const maxPoolHeight = Math.max.apply(null, STAGES.map(stage => inventoryHeight(pool.w, stage.left)));
      const columns = stacked ? 1 : plan.divisor === 4 ? 2 : Math.min(3, plan.divisor);
      const groupWidth = stacked ? width - 24 : (width - gap * (columns - 1)) / columns;
      const groupY = Math.max(224, pool.y + 56 + maxPoolHeight + 64);
      const groupHeight = 56 + Math.max.apply(null, STAGES.map(stage => inventoryHeight(groupWidth, stage.each))) + 28;
      const groups = Array.from({ length: plan.divisor }, function (_, index) {
        return { x: stacked ? 16 : (index % columns) * (groupWidth + gap), y: groupY + Math.floor(index / columns) * groupHeight, w: groupWidth };
      });
      return { width: width, stacked: stacked, pool: pool, groups: groups, height: groupY + Math.ceil(plan.divisor / columns) * groupHeight };
    }
    function position(area, unit, index) {
      const col = area.w / 3, slotWidth = SIZES[unit][0] + 4;
      const perRow = Math.max(1, Math.floor(col / slotWidth));
      return { x: area.x + unit * col + 4 + (index % perRow) * slotWidth, y: area.y + 56 + Math.floor(index / perRow) * (SIZES[unit][1] + 4) };
    }
    function block(parent, unit, x, y) {
      const size = SIZES[unit], color = 'var(' + COLORS[unit] + ')';
      const group = element('g', { transform: 'translate(' + x + ' ' + y + ')', 'aria-hidden': 'true' });
      group.append(element('rect', { width: size[0], height: size[1], fill: color, 'fill-opacity': unit === 2 ? 1 : 0.3 }));
      if (unit < 2) {
        let path = '';
        for (let n = 1; n < 10; n++) {
          path += 'M0 ' + (n * 4) + 'H' + size[0] + ' ';
          if (unit === 0) path += 'M' + (n * 4) + ' 0V' + size[1] + ' ';
        }
        group.append(element('path', { d: path, fill: 'none', stroke: color, 'stroke-opacity': 0.6, 'stroke-width': 0.5 }));
      }
      parent.append(group);
      return group;
    }
    function label(parent, x, y, text, major) {
      parent.append(element('text', { x: x, y: y, fill: 'var(--dp-ink)', 'font-size': major ? 14 : 12, 'font-weight': major ? 500 : 400 }, text));
    }
    function inventory(area, counts, title) {
      const group = element('g');
      label(group, area.x, area.y, title, true);
      counts.forEach(function (count, unit) {
        const x = area.x + unit * area.w / 3 + 4;
        label(group, x, area.y + 24, NAMES[unit]);
        label(group, x, area.y + 43, String(count));
        for (let i = 0; i < count; i++) {
          const point = position(area, unit, i);
          block(group, unit, point.x, point.y);
        }
        if (!count) label(group, x, area.y + 71, '—');
      });
      scene.append(group);
    }
    function route(from, to, exchange) {
      if (exchange) {
        const y = Math.max(from.y, to.y) + 54;
        return 'M' + from.x + ' ' + from.y + ' C' + from.x + ' ' + y + ' ' + to.x + ' ' + y + ' ' + to.x + ' ' + to.y;
      }
      if (layout.stacked) return 'M' + from.x + ' ' + from.y + ' C10 ' + from.y + ' 10 ' + (to.y - 24) + ' ' + to.x + ' ' + to.y;
      const bend = (from.y + to.y) / 2;
      return 'M' + from.x + ' ' + from.y + ' C' + from.x + ' ' + bend + ' ' + to.x + ' ' + bend + ' ' + to.x + ' ' + to.y;
    }
    function arrow(path, active) {
      const node = element('path', { d: path, fill: 'none', stroke: active ? 'var(--dp-blue)' : 'var(--dp-muted)', 'stroke-width': active ? 2 : 1.5, opacity: active ? 0.9 : 0.5, 'marker-end': 'url(#' + markerId + ')' });
      scene.append(node);
      return node;
    }
    function routesAtRest() {
      if (busy) return;
      const current = STAGES[step];
      if (current.share !== undefined) {
        const unit = current.share, point = position(layout.pool, unit, Math.max(0, model.left[unit] - 1));
        const from = { x: point.x + SIZES[unit][0] / 2, y: point.y + SIZES[unit][1] + 8 };
        layout.groups.forEach(function (area) { arrow(route(from, { x: area.x + area.w / 2, y: area.y - 15 }), false); });
      } else if (current.exchange !== undefined) {
        const unit = current.exchange, col = layout.pool.w / 3;
        arrow(route({ x: layout.pool.x + (unit + 0.5) * col, y: layout.pool.y + 142 }, { x: layout.pool.x + (unit + 1.5) * col, y: layout.pool.y + 142 }, true), false);
      }
    }
    function draw() {
      if (destroyed) return;
      if (conservedTotal() !== plan.dividend) throw new Error('Sharing must preserve ' + plan.dividend + '.');
      layout = geometry();
      scene.setAttribute('viewBox', '0 0 ' + layout.width + ' ' + layout.height);
      scene.setAttribute('height', layout.height);
      scene.replaceChildren();
      scene.append(element('title', {}, description));
      const summary = model.groups.map(function (counts, index) { return 'Group ' + (index + 1) + ': ' + counts.reduce(function (sum, n, unit) { return sum + n * VALUES[unit]; }, 0); }).join('. ');
      scene.append(element('desc', {}, STAGES[step].title + '. ' + summary + '. ' + (busy ? 'Sharing in progress.' : STAGES[step].detail)));
      const defs = element('defs'), marker = element('marker', { id: markerId, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto' });
      marker.append(element('path', { d: 'M1 1L7 4L1 7', fill: 'none', stroke: 'var(--dp-muted)', 'stroke-width': 1.5 }));
      defs.append(marker); scene.append(defs);
      routesAtRest();
      inventory(layout.pool, model.left, !busy && step === lastStep && plan.remainder ? 'Left over · remainder ' + plan.remainder : 'Still to share');
      model.groups.forEach(function (counts, index) { inventory(layout.groups[index], counts, 'Group ' + (index + 1)); });
      if (focus) {
        const point = position(layout.pool, focus.unit, focus.index), size = SIZES[focus.unit];
        scene.append(element('rect', { x: point.x - 3, y: point.y - 3, width: size[0] + 6, height: size[1] + 6, fill: 'none', stroke: 'var(--dp-focus)', 'stroke-width': 2 }));
      }
      motionLayer = element('g', { 'aria-hidden': 'true' });
      scene.append(motionLayer);
      flights.forEach(function (flight) {
        const size = SIZES[flight.unit];
        flight.path = element('path', { d: route({ x: flight.from.x + size[0] / 2, y: flight.from.y + size[1] / 2 }, { x: flight.to.x + size[0] / 2, y: flight.to.y + size[1] / 2 }, flight.exchange), fill: 'none', stroke: 'none' });
        motionLayer.append(flight.path);
        flight.length = flight.path.getTotalLength();
        flight.node = block(motionLayer, flight.unit, flight.from.x, flight.from.y);
      });
    }
    function notify() {
      if (destroyed) return;
      detail.textContent = currentDetail;
      container.setAttribute('aria-busy', busy ? 'true' : 'false');
      if (typeof options.onStep === 'function') options.onStep({ step: step, completedStep: completedStep, totalSteps: STAGES.length, stageCount: STAGES.length, dividend: plan.dividend, divisor: plan.divisor, remainder: plan.remainder, title: STAGES[step].title, busy: busy, complete: !busy && step === lastStep, detail: currentDetail, quotient: STAGES[busy ? Math.max(0, step - 1) : step].quotient, canPrevious: step > 0, canNext: !busy && step < lastStep });
    }
    function cancel() {
      runId++;
      global.cancelAnimationFrame(frameId);
      if (finishTween) { const finish = finishTween; finishTween = null; finish(false); }
      flights = []; focus = null; busy = false;
    }
    function settle(completeInteraction) {
      if (destroyed) return;
      cancel(); model = stateAt(step); completedStep = step; currentDetail = STAGES[step].detail;
      draw(); notify();
      if (completeInteraction && !destroyed && step === lastStep && typeof options.onComplete === 'function') options.onComplete({ quotient: plan.quotient, remainder: plan.remainder, dividend: plan.dividend, divisor: plan.divisor });
    }
    function tween(duration, id, update) {
      return new Promise(function (resolve) {
        let start = null;
        finishTween = resolve;
        function tick(now) {
          if (destroyed || id !== runId) { finishTween = null; resolve(false); return; }
          if (start === null) start = now;
          const progress = Math.min(1, (now - start) / duration);
          update(progress);
          if (progress < 1) frameId = global.requestAnimationFrame(tick);
          else { finishTween = null; resolve(true); }
        }
        frameId = global.requestAnimationFrame(tick);
      });
    }
    function move(flight, progress) {
      const eased = progress * progress * (3 - 2 * progress);
      const point = flight.path.getPointAtLength(flight.length * eased), size = SIZES[flight.unit];
      flight.node.setAttribute('transform', 'translate(' + (point.x - size[0] / 2) + ' ' + (point.y - size[1] / 2) + ')');
    }
    async function share(id, unit) {
      const rounds = STAGES[step].each[unit] - STAGES[step - 1].each[unit];
      for (let round = 0; round < rounds; round++) {
        currentDetail = 'Sharing ' + NAMES[unit].toLowerCase() + ' · round ' + (round + 1) + ' of ' + rounds; notify();
        for (let group = 0; group < plan.divisor; group++) {
          if (destroyed || id !== runId) return;
          const from = position(layout.pool, unit, model.left[unit] - 1), to = position(layout.groups[group], unit, model.groups[group][unit]);
          model.left[unit]--; flights = [{ unit: unit, from: from, to: to }]; draw();
          const flight = flights[0]; arrow(flight.path.getAttribute('d'), true); scene.append(motionLayer);
          const duration = Math.max(120, Math.min(unit === 0 ? 650 : 400, 7000 / (rounds * plan.divisor)));
          if (!await tween(duration, id, function (progress) { move(flight, progress); })) return;
          if (destroyed || id !== runId) return;
          flights = []; model.groups[group][unit]++; draw();
        }
      }
    }
    async function exchange(id, unit) {
      const exchanges = STAGES[step].exchangeCount;
      for (let exchange = 0; exchange < exchanges; exchange++) {
        if (destroyed || id !== runId) return;
        currentDetail = amount(1, unit) + ' becomes ' + amount(10, unit + 1) + (exchanges > 1 ? ' · exchange ' + (exchange + 1) + ' of ' + exchanges : '') + '.';
        focus = { unit: unit, index: model.left[unit] - 1 }; draw(); notify();
        if (!await tween(350, id, function () {})) return;
        if (destroyed || id !== runId) return;
        const source = position(layout.pool, unit, model.left[unit] - 1), next = unit + 1, existing = model.left[next];
        focus = null; model.left[unit]--;
        flights = Array.from({ length: 10 }, function (_, index) {
          return { unit: next, exchange: true, from: { x: source.x + (unit === 0 ? index * 4 : 0), y: source.y + (unit === 1 ? index * 4 : 0) }, to: position(layout.pool, next, existing + index) };
        });
        draw();
        if (!await tween(1550, id, function (progress) {
          flights.forEach(function (flight, index) { move(flight, Math.min(1, Math.max(0, (progress - index * 0.015) / 0.865))); });
        })) return;
        if (destroyed || id !== runId) return;
        flights = []; model.left[next] += 10; draw();
      }
    }
    async function animateTo(target) {
      if (destroyed) return;
      cancel(); step = Math.max(0, Math.min(lastStep, target));
      if (step === 0 || reduced.matches) { settle(true); return; }
      busy = true; model = stateAt(step - 1); currentDetail = STAGES[step].detail;
      draw(); notify();
      const id = runId, current = STAGES[step];
      if (current.share !== undefined) await share(id, current.share);
      else await exchange(id, current.exchange);
      if (!destroyed && id === runId) settle(true);
    }
    function visibilityChanged() { if (document.hidden && busy) settle(true); }
    function motionChanged() { if (busy) settle(true); }
    document.addEventListener('visibilitychange', visibilityChanged);
    reduced.addEventListener('change', motionChanged);
    let lastWidth = Math.round(container.getBoundingClientRect().width);
    const resize = new global.ResizeObserver(function () {
      if (destroyed) return;
      const width = Math.round(container.getBoundingClientRect().width);
      if (width !== lastWidth) { lastWidth = width; if (busy) settle(true); else draw(); }
    });
    settle(false); resize.observe(container);
    return {
      next: function () { if (!destroyed && !busy && step < lastStep) return animateTo(step + 1); },
      previous: function () { if (!destroyed) { cancel(); step = Math.max(0, step - 1); settle(false); } },
      replay: function () { if (!destroyed && !busy && step > 0) return animateTo(step); },
      finish: function () { if (!destroyed) settle(busy); },
      getStep: function () { return step; },
      destroy: function () {
        if (destroyed) return;
        destroyed = true; cancel(); resize.disconnect();
        document.removeEventListener('visibilitychange', visibilityChanged);
        reduced.removeEventListener('change', motionChanged);
        scene.remove(); detail.remove(); container.removeAttribute('aria-busy');
      }
    };
  }
  global.DivisionSharingPlayer = { mount: mount, createPlan: createPlan };
})(window);
