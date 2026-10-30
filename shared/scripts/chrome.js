(function () {
  const { qs, el } = window.KLS.util;
  const progress = window.KLS.progress;

  const validSlugs = new Set();
  let unsubscribe = null;
  let totalsStarsEl = null;
  let totalsStickersEl = null;
  let activeSession = null;
  let pendingSave = null;
  let statusTimer = null;
  const SAVE_TIMEOUT_MS = 1500;
  const LOAD_TIMEOUT_MS = 10000;

  function render() {
    const root = qs('#chrome-root');
    if (!root) return;
    root.innerHTML = '';

    const snap = progress.get();
    const profile = snap.profile;
    const totals = snap.totals;

    totalsStarsEl = el('span', { class: 'chrome__stat', title: 'Total stars' }, '⭐ ', String(totals.stars));
    totalsStickersEl = el('span', { class: 'chrome__stat', title: 'Stickers earned' }, '🏆 ', String(totals.stickers));

    const backBtn = el('button', {
      class: 'chrome__back',
      type: 'button',
      'aria-label': 'Save and return to hub',
      title: 'Saves first, then returns to the game menu',
      onclick: saveAndLeave,
    }, '← Hub');

    // "🏠 Home" — return to the current game's own welcome/home screen WITHOUT
    // leaving the iframe. Sends a `goHome` postMessage; the game's bridge
    // handler navigates internally. See ARCHITECTURE.md / game-bridge.js for
    // the contract. Games that don't subscribe to `goHome` will see no
    // effect (no-op fallback); fixing them belongs to that game's code, not
    // here.
    const homeBtn = el('button', {
      class: 'chrome__home',
      type: 'button',
      'aria-label': 'Return to this game’s home screen',
      title: 'Back to this game’s home (stay in the game)',
      onclick: goGameHome,
    }, '🏠 Home');

    const saveBtn = el('button', {
      class: 'chrome__save',
      type: 'button',
      'aria-label': 'Save my progress and keep playing',
      title: 'Save a checkpoint in this browser (keep playing)',
      onclick: saveNow,
    }, '💾 Save');

    const profileBtn = profile
      ? el('button', {
          class: 'chrome__profile chrome__profile--btn',
          type: 'button',
          'aria-label': 'Switch profile (' + profile.displayName + ')',
          onclick: function () { location.hash = '#/profiles'; },
        },
          el('span', { class: 'chrome__avatar', 'aria-hidden': 'true' }, profile.avatar),
          el('span', { class: 'chrome__name' }, profile.displayName),
        )
      : el('span', { class: 'chrome__profile' }, '(no profile)');

    const bar = el('div', { class: 'chrome' },
      backBtn,
      homeBtn,
      saveBtn,
      profileBtn,
      el('div', { class: 'chrome__totals' }, totalsStarsEl, totalsStickersEl),
    );

    root.append(bar);
  }

  /** Confirmation follows the game's reply AND a successful browser write. */
  function saveNow() {
    return requestSave();
  }

  /** Tell the active game to return to its own home/welcome screen. The
   *  game is expected to subscribe via `bridge.onHubMessage('goHome', cb)`.
   *  We don't navigate ourselves — the game knows what "home" means. */
  function goGameHome() {
    requestSave().then(function (result) { if (result.ok) postToFrame('goHome'); });
  }

  /** The router flushes and detaches before showing the requested page. */
  function saveAndLeave() {
    location.hash = '';
  }

  function refreshTotals() {
    if (activeSession && progress.get().activeProfileId !== activeSession.profileId) {
      detachSession();
      location.hash = '';
      return;
    }
    if (!totalsStarsEl) return;
    const { totals } = progress.get();
    totalsStarsEl.textContent = '';
    totalsStarsEl.append('⭐ ', String(totals.stars));
    totalsStickersEl.textContent = '';
    totalsStickersEl.append('🏆 ', String(totals.stickers));
  }

  function mount() {
    render();
    if (unsubscribe) unsubscribe();
    unsubscribe = progress.subscribe(refreshTotals);
  }

  function unmount() {
    const root = qs('#chrome-root');
    if (root) root.innerHTML = '';
    totalsStarsEl = null;
    totalsStickersEl = null;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
  }

  function registerSlugs(slugs) {
    validSlugs.clear();
    slugs.forEach((s) => validSlugs.add(s));
  }

  function expectedSlugFromIframe() {
    const frame = qs('#stage-frame');
    if (!frame) return null;
    const src = frame.getAttribute('src') || '';
    const m = src.match(/^games\/([^/]+)\//);
    return m ? m[1] : null;
  }

  function newId(prefix) {
    return prefix + (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  }

  /** Metadata stays outside stored progress; existing save formats are unchanged. */
  function startSession(slug, profileId, resumeBlob) {
    if (activeSession) detachSession();
    const frame = qs('#stage-frame');
    const session = {
      slug: slug, profileId: profileId, sessionId: newId('session_'),
      ready: false, resumeBlob: resumeBlob, resumeSent: false, storageError: '', failedProgress: [],
    };
    activeSession = session;
    session.onLoad = function () { if (activeSession === session) pushProfileToIframe(slug); };
    if (frame) frame.addEventListener('load', session.onLoad);
    return session.sessionId;
  }

  function sessionMatches(data, ev) {
    const frame = qs('#stage-frame');
    return !!(activeSession && frame && ev.source === frame.contentWindow
      && expectedSlugFromIframe() === activeSession.slug
      && validSlugs.has(activeSession.slug)
      && data.slug === activeSession.slug
      && data.profileId === activeSession.profileId
      && data.sessionId === activeSession.sessionId
      && progress.get().activeProfileId === activeSession.profileId);
  }

  function setStatus(message, kind) {
    const root = qs('#chrome-root');
    if (!root) return;
    let pill = qs('.chrome__saved', root);
    if (!pill) {
      pill = el('div', { class: 'chrome__saved', 'aria-live': 'polite' });
      root.appendChild(pill);
    }
    pill.textContent = message;
    if (kind === 'error' && activeSession) {
      const actions = el('div', { class: 'chrome__recovery-actions' },
        el('button', { type: 'button', onclick: saveNow }, 'Retry Save'),
        el('button', { type: 'button', onclick: confirmReturnToHub }, 'Return to Hub using last save'));
      pill.append(actions);
    }
    pill.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    pill.classList.remove('chrome__saved--error', 'chrome__saved--saving');
    if (kind === 'error' || kind === 'saving') pill.classList.add('chrome__saved--' + kind);
    pill.classList.add('chrome__saved--show');
    if (statusTimer) clearTimeout(statusTimer);
    if (kind === 'success') statusTimer = setTimeout(function () { pill.classList.remove('chrome__saved--show'); }, 3000);
    const btn = qs('.chrome__save', root);
    if (btn) btn.disabled = kind === 'saving';
  }

  function confirmReturnToHub() {
    if (pendingSave || !activeSession) return;
    const session = activeSession;
    const pill = qs('.chrome__saved', qs('#chrome-root'));
    if (!pill) return;
    pill.textContent = 'This Save is unconfirmed. Returning to Hub keeps your last saved progress; the latest unsaved changes may be lost.';
    pill.append(el('div', { class: 'chrome__recovery-actions' },
      el('button', { type: 'button', onclick: function () { setStatus('Your game is still open. Try Save again when it is ready.', 'error'); } }, 'Keep game open'),
      el('button', { type: 'button', onclick: function () {
        if (activeSession !== session || pendingSave) return;
        if (window.KLS.hub && window.KLS.hub.returnToHubUsingLastSave) window.KLS.hub.returnToHubUsingLastSave();
        else { detachSession(); location.hash = ''; }
      } }, 'Return to Hub')));
  }

  function finishSave(result) {
    const pending = pendingSave;
    if (!pending) return;
    pendingSave = null;
    clearTimeout(pending.timer);
    if (result.ok) result.savedAt = new Date().toISOString();
    setStatus(result.ok ? 'Saved in this browser ✓' : 'Save failed: ' + result.error + ' Try Save again.', result.ok ? 'success' : 'error');
    pending.resolve(result);
  }

  function sendPendingRequest() {
    if (!pendingSave || pendingSave.sent || !activeSession || !activeSession.ready) return;
    pendingSave.sent = true;
    clearTimeout(pendingSave.timer);
    const pending = pendingSave;
    pending.timer = setTimeout(function () {
      if (pendingSave === pending) finishSave({ ok: false, error: 'The game did not confirm its checkpoint.' });
    }, SAVE_TIMEOUT_MS);
    postToFrame('requestState', { requestId: pendingSave.requestId });
  }

  function requestSave() {
    if (!activeSession) return Promise.resolve({ ok: true, empty: true });
    if (pendingSave) return pendingSave.promise;
    const requestId = newId('save_');
    const pending = { requestId: requestId, sessionId: activeSession.sessionId, sent: false };
    pending.promise = new Promise(function (resolve) { pending.resolve = resolve; });
    pendingSave = pending;
    setStatus('Saving…', 'saving');
    pending.timer = setTimeout(function () {
      if (pendingSave === pending) finishSave({ ok: false, error: 'The game has not finished loading or connecting to this account.' });
    }, LOAD_TIMEOUT_MS);
    sendPendingRequest();
    if (!activeSession.ready) pushProfileToIframe(activeSession.slug);
    return pending.promise;
  }

  function detachSession() {
    const session = activeSession;
    if (!session) return;
    postToFrame('suspendSession');
    activeSession = null; // reject queued replies before removing the document
    if (pendingSave) finishSave({ ok: false, error: 'The game session ended before Save completed.' });
    const frame = qs('#stage-frame');
    if (frame) {
      frame.removeEventListener('load', session.onLoad);
      frame.setAttribute('src', 'about:blank');
    }
  }

  function recordResult(ok) {
    if (!ok) setStatus('Save failed: ' + (progress.getLastWriteError() || 'Browser storage is unavailable.') + ' Try Save again.', 'error');
    else if (!pendingSave && activeSession && !activeSession.storageError && !activeSession.failedProgress.length) setStatus('Saved in this browser ✓', 'success');
  }

  function applyProgress(data) {
    const slug = activeSession.slug;
    switch (data.event) {
      case 'awardStars': return progress.awardStars(slug, data.level, data.stars);
      case 'awardSticker': return progress.awardSticker(slug, data.stickerId);
      case 'session': return progress.recordSession(slug, data.level, data.stats || {});
      case 'played': return progress.played(slug);
      case 'clearState': return progress.clearGameState(slug);
      case 'resetProgress': return progress.reset(slug);
    }
    return false;
  }

  function retryProgress() {
    while (activeSession.failedProgress.length) {
      if (!applyProgress(activeSession.failedProgress[0])) return false;
      activeSession.failedProgress.shift();
    }
    return true;
  }

  function recordProgress(data) {
    // A quota failure is recoverable while this game stays open. Preserve
    // event order so retries neither lose session counts nor duplicate them.
    const ok = retryProgress() && applyProgress(data);
    if (!ok) activeSession.failedProgress.push({
      event: data.event, level: data.level, stars: data.stars,
      stickerId: data.stickerId, stats: data.stats,
    });
    recordResult(ok);
  }

  window.addEventListener('message', (ev) => {
    const data = ev.data;
    if (!data || data.type !== 'kls:progress') return;
    const frame = qs('#stage-frame');
    if (data.event === 'bridgeReady') {
      if (activeSession && frame && ev.source === frame.contentWindow && data.slug === activeSession.slug) pushProfileToIframe(activeSession.slug);
      return;
    }
    if (!sessionMatches(data, ev)) return;
    const expected = activeSession.slug;

    switch (data.event) {
      case 'awardStars':
      case 'awardSticker':
      case 'session':
      case 'played':
      case 'clearState':
      case 'resetProgress':
        recordProgress(data);
        break;
      case 'saveState': {
        // A late reply cannot overwrite a later checkpoint or claim success.
        if (data.requestId && (!pendingSave || data.requestId !== pendingSave.requestId)) return;
        const error = data.error || activeSession.storageError;
        const ok = data.ok !== false && !error && retryProgress() && progress.saveGameState(expected, data.state == null ? null : data.state);
        if (data.requestId) finishSave({ ok: !!ok, error: error || progress.getLastWriteError() || 'The game could not save its checkpoint.' });
        else if (!ok) setStatus('Save failed: ' + (error || progress.getLastWriteError() || 'The checkpoint could not be saved.') + ' Try Save again.', 'error');
        else recordResult(true);
        break;
      }
      case 'celebrate':
        if (window.KLS && window.KLS.celebrate) window.KLS.celebrate.fire();
        break;
      case 'profileReady':
        activeSession.ready = true;
        pushResumeState(expected, activeSession.resumeBlob);
        sendPendingRequest();
        break;
      case 'storageError':
        activeSession.storageError = data.error || 'The game could not write browser storage.';
        setStatus('Save failed: ' + activeSession.storageError + ' Try Save again.', 'error');
        break;
      case 'storageRecovered':
        activeSession.storageError = data.error || '';
        break;
      default:
        // ignore unknown events
    }
  });

  window.addEventListener('storage', function (ev) {
    if (ev.key !== 'kls.restore.journal.v1' || !ev.newValue) return;
    try {
      if (JSON.parse(ev.newValue).phase !== 'prepared') return;
      detachSession();
      // Startup recovery renders a blocking message while another tab owns
      // the restore, rather than leaving a live game on partially replaced data.
      location.reload();
    } catch (e) { /* malformed journal is handled by startup recovery */ }
  });

  /** Send a hub→game message (validated slug). */
  function postToFrame(event, payload) {
    const frame = qs('#stage-frame');
    if (!activeSession || !frame || !frame.contentWindow || expectedSlugFromIframe() !== activeSession.slug) return false;
    try {
      frame.contentWindow.postMessage(
        Object.assign({}, payload || {}, {
          type: 'kls:hub', event: event, slug: activeSession.slug,
          profileId: activeSession.profileId, sessionId: activeSession.sessionId,
        }),
        '*'
      );
      return true;
    } catch (e) { return false; }
  }

  /** Deliver once after profile binding; the game's Continue button consumes it. */
  function pushResumeState(slug, state) {
    if (!activeSession || activeSession.slug !== slug || activeSession.resumeSent) return;
    activeSession.resumeBlob = state;
    if (!activeSession.ready || state == null) return;
    activeSession.resumeSent = true;
    postToFrame('resumeState', { state: state });
  }

  /** Bind a fresh document to its profile/session. Ready and load events both
   *  call this; duplicate handshakes never trigger duplicate resume delivery. */
  function pushProfileToIframe(slug) {
    if (!activeSession || activeSession.slug !== slug) return;
    postToFrame('setProfile');
  }

  window.KLS = window.KLS || {};
  window.KLS.chrome = {
    mount, unmount, registerSlugs, pushResumeState, pushProfileToIframe,
    startSession, detachSession, requestSave, flushSession: requestSave,
    hasSession() { return !!activeSession; },
    getSession() { return activeSession ? { slug: activeSession.slug, profileId: activeSession.profileId, sessionId: activeSession.sessionId } : null; },
  };
})();
