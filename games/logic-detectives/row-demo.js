/* A replayable row lesson. Demonstrates printed examples; never fills a blank. */
(function (root) {
  'use strict';
  const TG = root.LogicDetectivesTableGuide;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  function mount({ puzzle: p, draft: d, engine, onInput, onSelect, onCheck, isActive }) {
    const $ = id => document.getElementById(id);
    const area = $('puzzle-area');
    let demo = null, timer = null, clockVersion = 0, destroyed = false;
    const examples = TG.getRowExamples(p);
    function cell(key, value, tag) {
      const blank = p.blanks.includes(key);
      const label = key[0] === 'r' ? `Missing starting number on line ${Number(key.slice(1)) + 1}` : key[0] === 'c' ? `Missing top adding number ${Number(key.slice(1)) + 1}` : `Row ${Number(key.slice(1).split('_')[0]) + 1}, column ${Number(key.split('_')[1]) + 1}`;
      return `<${tag} ${tag === 'th' ? `scope="${key[0] === 'c' ? 'col' : 'row'}"` : ''} data-table-key="${key}" class="${blank ? 'needs-answer' : ''}">${blank ? `<label class="sr-only" for="answer-${key}">${label}</label><input id="answer-${key}" class="table-input" type="text" inputmode="numeric" autocomplete="off" maxlength="4" data-answer="${key}" value="${escape(d.answers[key] ?? '')}" placeholder="?" aria-describedby="table-guide-prompt" ${d.solved ? 'disabled' : ''}>` : `<span class="table-number">${value}</span>`}</${tag}>`;
    }
    area.innerHTML = `<div class="table-wrap"><div class="table-legend" aria-label="Addition color key"><span class="path-key start">Starting number</span><span aria-hidden="true">+</span><span class="path-key add">Top adding number</span><span aria-hidden="true">=</span><span class="path-key total">Sum</span></div><div class="table-board" id="table-board"><table class="number-table"><caption class="sr-only">Add the starting number on the left to the adding number at the top to make each inside sum. Each box starts again with its own left number.</caption><thead><tr><th scope="col" class="operation-cell">+</th>${p.cols.map((n, c) => cell('c' + c, n, 'th')).join('')}</tr></thead><tbody>${p.rows.map((n, r) => `<tr>${cell('r' + r, n, 'th')}${p.cols.map((_, c) => cell(`v${r}_${c}`, engine.tableAnswer(p, `v${r}_${c}`), 'td')).join('')}</tr>`).join('')}</tbody></table><div class="table-demo-tokens" id="table-demo-tokens" aria-hidden="true"></div></div><section class="table-guide" id="table-guide" aria-label="See the row pattern"><div class="table-guide-heading"><strong id="table-guide-label"></strong><button type="button" class="button primary small row-demo-start" id="table-example-toggle">▶ Watch a row</button></div><div class="table-equation" id="table-equation" hidden></div><p class="table-guide-prompt" id="table-guide-prompt" aria-live="polite" aria-atomic="true"></p><div class="table-example-controls" id="table-example-controls" hidden><span id="table-example-step"></span><div class="row-demo-actions"><button type="button" class="button ghost small" id="table-example-play">Pause</button><button type="button" class="button secondary small" id="table-example-next">Next step →</button></div></div></section><p class="table-caption">Click a ? and type. <kbd>Tab</kbd> changes blanks. <kbd>Enter</kbd> checks your answers.</p></div>`;
    const board = $('table-board');
    const alive = () => !destroyed && $('table-board') === board && isActive();
    function clearTimer() { clockVersion++; if (timer !== null) root.clearTimeout(timer); timer = null; }
    function guidance() { return demo ? TG.describe(p, demo.examples[demo.index].totalKey) : null; }
    function drawTokens() {
      if (!alive()) return;
      const layer = $('table-demo-tokens');
      if (!demo || !demo.playing || demo.phase !== 1) { layer.innerHTML = ''; return; }
      const guide = guidance(), base = board.getBoundingClientRect();
      const boxes = guide.terms.map(term => area.querySelector(`[data-table-key="${term.key}"]`).getBoundingClientRect());
      const target = boxes[2];
      layer.innerHTML = guide.terms.slice(0, 2).map((term, index) => {
        const source = boxes[index], x = source.left - base.left + source.width / 2 - 20, y = source.top - base.top + source.height / 2 - 17;
        const dx = target.left + target.width / 2 - (source.left + source.width / 2), dy = target.top + target.height / 2 - (source.top + source.height / 2);
        return `<span class="table-flight ${term.role}" style="left:${x}px;top:${y}px;--flight-x:${dx}px;--flight-y:${dy}px">${index ? '+' : ''}${escape(term.value)}</span>`;
      }).join('');
    }
    function render() {
      if (!alive()) return;
      const guide = guidance(), phase = demo?.phase ?? -1;
      $('table-guide').classList.toggle('demo-active', !!demo);
      $('table-guide').classList.toggle('demo-finished', !!demo?.finished);
      $('table-guide-label').textContent = demo ? demo.examples.length > 1 ? 'Same start. A new top number.' : 'See how this number is made.' : 'See the addition pattern';
      $('table-example-toggle').hidden = examples.length === 0;
      $('table-example-toggle').textContent = demo ? 'Back to my puzzle' : '▶ Watch a row';
      $('table-example-toggle').className = demo ? 'table-example-toggle' : 'button primary small row-demo-start';
      $('table-equation').hidden = !demo;
      $('table-example-controls').hidden = !demo;
      $('table-example-step').textContent = demo ? `Example ${demo.index + 1} of ${demo.examples.length}` : '';
      $('table-example-play').textContent = demo?.finished ? 'Replay' : demo?.playing ? 'Pause' : 'Play';
      $('table-example-next').textContent = phase < 2 ? 'Next step →' : demo.index + 1 < demo.examples.length ? 'Next example →' : 'Your turn →';
      if (demo) {
        $('table-equation').innerHTML = guide.terms.map((term, index) => `${index ? `<span class="table-equation-sign" aria-hidden="true">${index === 1 ? '+' : '='}</span>` : ''}<div class="table-term ${term.role} ${index > phase ? 'waiting' : ''} ${index === 1 && phase === 1 ? 'enter-add' : index === 2 && phase === 2 ? 'enter-total' : ''}"><span class="table-term-label">${['Same start', 'Top number', 'Printed sum'][index]}</span><span class="table-term-value">${index > phase ? '·' : escape(term.value)}</span></div>`).join('');
        const [start, add, sum] = guide.terms.map(term => term.value);
        $('table-guide-prompt').textContent = demo.finished ? 'Every box starts again with the same left number. Your turn!' : phase === 0 ? `${demo.index ? 'Start again' : 'Start'} with the blue ${start}.` : phase === 1 ? `Add the top number, ${add}.` : `${start} + ${add} = ${sum}. This printed ${sum} belongs here.`;
      } else {
        $('table-equation').innerHTML = '';
        $('table-guide-prompt').textContent = examples.length ? 'Watch how the printed numbers are made. Then try the blanks.' : 'Add each left starting number to its top adding number.';
      }
      for (const c of area.querySelectorAll('[data-table-key]')) {
        const term = guide?.terms.find(t => t.key === c.dataset.tableKey);
        for (const role of ['start', 'add', 'total']) c.classList.toggle('path-' + role, !!term && term.role === role && guide.terms.indexOf(term) <= phase);
        c.classList.toggle('path-selected', !demo && c.dataset.tableKey === d.selected);
        c.classList.toggle('demo-target', !!term && term.role === 'total' && phase < 2);
        c.classList.toggle('demo-result-appear', !!term && term.role === 'total' && phase === 2);
      }
      drawTokens();
    }
    function schedule() {
      clearTimer();
      if (!demo?.playing || demo.finished) return;
      const expected = demo, expectedClock = clockVersion;
      timer = root.setTimeout(() => {
        if (clockVersion !== expectedClock || !alive() || demo !== expected || !demo.playing) return;
        timer = null;
        if (document.hidden) { demo.playing = false; render(); return; }
        if (demo.phase < 2) demo.phase++;
        else if (demo.index + 1 < demo.examples.length) { demo.index++; demo.phase = 0; }
        else { demo.finished = true; demo.playing = false; }
        render(); schedule();
      }, [1000, 1300, 2200][demo.phase]);
    }
    function stop(focus = false) {
      clearTimer(); demo = null; render();
      if (focus && alive()) area.querySelector(`[data-answer="${d.selected}"]`)?.focus();
    }
    function start() {
      clearTimer();
      if (!examples.length || !alive()) return;
      demo = { examples, index: 0, phase: 0, playing: !root.matchMedia('(prefers-reduced-motion: reduce)').matches, finished: false };
      render(); schedule();
    }
    function pause() { clearTimer(); if (demo) { demo.playing = false; render(); } }
    for (const input of area.querySelectorAll('[data-answer]')) {
      input.addEventListener('focus', () => { if (!alive()) return; clearTimer(); demo = null; onSelect(input.dataset.answer); render(); });
      input.addEventListener('input', () => {
        if (!alive()) return;
        clearTimer(); demo = null;
        input.value = input.value.replace(/[^0-9]/g, '');
        onInput(input.dataset.answer, input.value);
        input.closest('th,td').classList.remove('cell-error', 'cell-correct'); render();
      });
      input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); onCheck(); } });
    }
    $('table-example-toggle').addEventListener('click', () => { if (demo) stop(true); else start(); });
    $('table-example-play').addEventListener('click', () => {
      if (!alive() || !demo) return;
      if (demo.finished) { start(); return; }
      demo.playing = !demo.playing; render(); schedule();
    });
    $('table-example-next').addEventListener('click', () => {
      if (!alive() || !demo) return;
      clearTimer(); demo.playing = false;
      if (demo.phase < 2) demo.phase++;
      else if (demo.index + 1 < demo.examples.length) { demo.index++; demo.phase = 0; }
      else { stop(true); return; }
      render();
    });
    const visibility = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', visibility);
    const observer = new ResizeObserver(drawTokens);
    observer.observe(board);
    document.fonts?.ready.then(drawTokens);
    if (!p.blanks.includes(d.selected)) d.selected = p.blanks[0];
    render();
    return Object.freeze({ refresh: render, pause, destroy() { clearTimer(); destroyed = true; demo = null; observer.disconnect(); document.removeEventListener('visibilitychange', visibility); } });
  }
  root.LogicDetectivesRowDemo = Object.freeze({ mount });
})(window);
