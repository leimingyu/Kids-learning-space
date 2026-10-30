(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const NAMES = ['Hundreds', 'Tens', 'Ones'];
  const COLORS = ['--dp-blue', '--dp-orange', '--dp-green'];
  const VALUES = [100, 10, 1];
  const SIZES = [[40, 40], [4, 40], [4, 4]];
  const STAGES = [
    { title: 'Start with 432', left: [4, 3, 2], each: [0, 0, 0], quotient: '—', detail: '4 hundreds · 3 tens · 2 ones' },
    { title: 'Share the hundreds', left: [1, 3, 2], each: [1, 0, 0], quotient: '1 _ _', detail: 'Each group gets 1 hundred; 1 hundred remains.', share: 0 },
    { title: 'Exchange the remaining hundred', left: [0, 13, 2], each: [1, 0, 0], quotient: '1 _ _', detail: '1 hundred becomes 10 tens. Now share 13 tens.', exchange: 0 },
    { title: 'Share the tens', left: [0, 1, 2], each: [1, 4, 0], quotient: '1 4 _', detail: '4 tens in every group; 1 ten remains.', share: 1 },
    { title: 'Exchange the remaining ten', left: [0, 0, 12], each: [1, 4, 0], quotient: '1 4 _', detail: '1 ten becomes 10 ones. Now share 12 ones.', exchange: 1 },
    { title: 'Share the ones', left: [0, 0, 0], each: [1, 4, 4], quotient: '1 4 4', detail: 'Each group has 144. All 432 have been shared equally.', share: 2 }
  ];
  let instanceCount = 0;

  function mount(container, options) {
    options = options || {};
    const document = container.ownerDocument || global.document;
    const markerId = 'ds-direction-' + (++instanceCount);
    let step = Number.isInteger(options.initialStep) ? Math.max(0, Math.min(5, options.initialStep)) : 0;
    let completedStep = step;
    let busy = false, destroyed = false, runId = 0, frameId = 0, finishTween = null;
    let layout = null, model = stateAt(step), flights = [], focus = null, motionLayer = null;
    let currentDetail = STAGES[step].detail;
    const reduced = global.matchMedia('(prefers-reduced-motion: reduce)');
    const scene = element('svg', { class: 'ds-scene', role: 'img', 'aria-label': '432 shared into three groups', style: 'display:block;width:100%;overflow:visible;pointer-events:none' });
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
      return { left: STAGES[index].left.slice(), groups: Array.from({ length: 3 }, function () { return STAGES[index].each.slice(); }) };
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
      const maxPoolHeight = Math.max.apply(null, [4, 13, 12].map(function (count, unit) {
        return Math.ceil(count / Math.max(1, Math.floor(pool.w / 3 / (SIZES[unit][0] + 4)))) * (SIZES[unit][1] + 4) - 4;
      }));
      const groupWidth = stacked ? width - 24 : (width - gap * 2) / 3;
      const groupY = Math.max(224, pool.y + 56 + maxPoolHeight + 64);
      const groups = Array.from({ length: 3 }, function (_, index) {
        return { x: stacked ? 16 : index * (groupWidth + gap), y: stacked ? groupY + index * 132 : groupY, w: groupWidth };
      });
      return { width: width, stacked: stacked, pool: pool, groups: groups, height: stacked ? groupY + 396 : groupY + 120 };
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
      return 'M' + from.x + ' ' + from.y + ' C' + from.x + ' 176 ' + to.x + ' 176 ' + to.x + ' ' + to.y;
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
      if (conservedTotal() !== 432) throw new Error('Sharing must preserve 432.');
      layout = geometry();
      scene.setAttribute('viewBox', '0 0 ' + layout.width + ' ' + layout.height);
      scene.setAttribute('height', layout.height);
      scene.replaceChildren();
      scene.append(element('title', {}, '432 shared into three groups'));
      const summary = model.groups.map(function (counts, index) { return 'Group ' + (index + 1) + ': ' + counts.reduce(function (sum, n, unit) { return sum + n * VALUES[unit]; }, 0); }).join('. ');
      scene.append(element('desc', {}, STAGES[step].title + '. ' + summary + '. ' + (busy ? 'Sharing in progress.' : STAGES[step].detail)));
      const defs = element('defs'), marker = element('marker', { id: markerId, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto' });
      marker.append(element('path', { d: 'M1 1L7 4L1 7', fill: 'none', stroke: 'var(--dp-muted)', 'stroke-width': 1.5 }));
      defs.append(marker); scene.append(defs);
      routesAtRest();
      inventory(layout.pool, model.left, 'Still to share');
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
      if (typeof options.onStep === 'function') options.onStep({ step: step, completedStep: completedStep, totalSteps: 6, title: STAGES[step].title, busy: busy, complete: !busy && step === 5, detail: currentDetail, quotient: STAGES[busy ? Math.max(0, step - 1) : step].quotient, canPrevious: step > 0, canNext: !busy && step < 5 });
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
      if (completeInteraction && !destroyed && step === 5 && typeof options.onComplete === 'function') options.onComplete({ quotient: 144, dividend: 432, divisor: 3 });
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
        for (let group = 0; group < 3; group++) {
          if (destroyed || id !== runId) return;
          const from = position(layout.pool, unit, model.left[unit] - 1), to = position(layout.groups[group], unit, model.groups[group][unit]);
          model.left[unit]--; flights = [{ unit: unit, from: from, to: to }]; draw();
          const flight = flights[0]; arrow(flight.path.getAttribute('d'), true); scene.append(motionLayer);
          if (!await tween(unit === 0 ? 650 : 400, id, function (progress) { move(flight, progress); })) return;
          if (destroyed || id !== runId) return;
          flights = []; model.groups[group][unit]++; draw();
        }
      }
    }
    async function exchange(id, unit) {
      currentDetail = unit === 0 ? '1 hundred becomes 10 tens.' : '1 ten becomes 10 ones.';
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
    async function animateTo(target) {
      if (destroyed) return;
      cancel(); step = Math.max(0, Math.min(5, target));
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
      next: function () { if (!destroyed && !busy && step < 5) return animateTo(step + 1); },
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
  global.DivisionSharingPlayer = { mount: mount };
})(window);
