/*
 * KLS — profile picker, profile manager, parent/data page, resume modal.
 *
 * Routes the hub recognizes:
 *   #/profiles       → manager (also doubles as picker on first visit)
 *   #/profiles/new   → create-new-profile screen
 *   #/parent         → parent/data page (transparency + clear all + export all)
 *
 * Public API: window.KLS.profileUI = { renderPicker, renderManager, renderParent,
 *   confirmResume(slug, savedBlob, onResume, onStartOver), ensureProfileOrPick(onReady) }
 */
(function () {
  const { qs, el } = window.KLS.util;
  const progress = window.KLS.progress;
  let backupStatusUnsubscribe = null;

  // ──────────────────────────────────────────────────────────────────────
  // Avatar pool — curated, child-friendly. Mix of animals, faces, food.
  // ──────────────────────────────────────────────────────────────────────
  const AVATARS = [
    '🦊','🐼','🐯','🦁','🐰','🐻','🐨','🐶',
    '🐱','🦄','🐸','🐵','🐧','🦉','🐢','🐙',
    '🚀','🌈','⭐','🎨','⚽','🍕','🍩','🌟',
  ];

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ──────────────────────────────────────────────────────────────────────
  // Profile picker / first-visit gate
  // ──────────────────────────────────────────────────────────────────────

  /** Called from hub before rendering the main hub. Routes to picker if needed. */
  function ensureProfileOrPick(onReady) {
    if (progress.hasActiveProfile()) { onReady(); return; }
    // No active profile — show the create-new screen.
    renderCreateNew({ firstTime: true, onCreated: onReady });
  }

  function avatarGrid(currentAvatar, onPick) {
    const grid = el('div', { class: 'avatar-grid' });
    AVATARS.forEach(function (a) {
      const btn = el('button', {
        type: 'button',
        class: 'avatar-grid__cell' + (a === currentAvatar ? ' avatar-grid__cell--selected' : ''),
        'aria-pressed': a === currentAvatar ? 'true' : 'false',
        'aria-label': 'Choose ' + a,
        onclick: function () {
          Array.from(grid.children).forEach(function (c) {
            c.classList.remove('avatar-grid__cell--selected');
            c.setAttribute('aria-pressed', 'false');
          });
          btn.classList.add('avatar-grid__cell--selected');
          btn.setAttribute('aria-pressed', 'true');
          onPick(a);
        },
      }, a);
      grid.append(btn);
    });
    return grid;
  }

  function renderCreateNew(opts) {
    opts = opts || {};
    const root = qs('#hub-root') || qs('main') || document.body;
    const stage = qs('#stage-root');
    if (stage) stage.hidden = true;
    if (window.KLS.chrome && window.KLS.chrome.unmount) window.KLS.chrome.unmount();

    root.hidden = false;
    root.innerHTML = '';
    root.className = 'profile-picker';

    let chosenAvatar = pickRandom(AVATARS);
    let chosenName = '';

    const profilesCount = progress.listProfiles().length;
    const atLimit = profilesCount >= progress.MAX_PROFILES;

    const header = el('header', { class: 'profile-picker__header' },
      el('h1', {}, opts.firstTime ? 'Welcome!' : 'New Profile'),
      el('p', { class: 'profile-picker__subtitle' },
        opts.firstTime
          ? 'Pick an emoji and a nickname to get started. Everything stays on this device.'
          : 'Pick an emoji and a nickname for the new profile.'),
    );

    const grid = avatarGrid(chosenAvatar, function (a) { chosenAvatar = a; });

    const nameInput = el('input', {
      type: 'text',
      class: 'profile-picker__name-input',
      placeholder: 'Your nickname',
      maxlength: 16,
      'aria-label': 'Nickname',
      autocomplete: 'off',
    });
    nameInput.addEventListener('input', function () {
      chosenName = nameInput.value;
      goBtn.disabled = chosenName.trim().length === 0 || atLimit;
    });

    const goBtn = el('button', {
      type: 'button',
      class: 'btn btn-primary',
      disabled: true,
      onclick: function () {
        const name = chosenName.trim();
        if (!name) return;
        try {
          progress.createProfile({ displayName: name, avatar: chosenAvatar }, true);
        } catch (e) {
          alert(e.message || 'Could not create profile.');
          return;
        }
        if (opts.onCreated) opts.onCreated();
        else location.hash = '';
      },
    }, "Let's Go!");

    const cancelBtn = el('button', {
      type: 'button',
      class: 'btn btn-muted',
      onclick: function () {
        if (opts.firstTime) return; // can't cancel; no profile yet
        location.hash = '#/profiles';
      },
    }, opts.firstTime ? 'Skip for now' : 'Cancel');

    // "Skip for now" — make a placeholder profile so the kid can still play.
    if (opts.firstTime) {
      cancelBtn.addEventListener('click', function () {
        try { progress.createProfile({ displayName: 'Friend', avatar: '🦊' }, true); }
        catch (e) { alert(e.message || 'Could not save this profile.'); return; }
        if (opts.onCreated) opts.onCreated();
      });
    }

    const limitNote = atLimit
      ? el('p', { class: 'profile-picker__limit' },
          'You already have ' + progress.MAX_PROFILES + ' profiles. Delete one to add a new one.')
      : null;

    root.append(header);
    root.append(el('div', { class: 'card profile-picker__card' },
      el('h3', { class: 'profile-picker__section' }, 'Pick your emoji'),
      grid,
      el('h3', { class: 'profile-picker__section' }, 'Type your nickname'),
      nameInput,
      limitNote,
      el('div', { class: 'btn-row' }, goBtn, cancelBtn),
    ));

    if (opts.firstTime) root.append(el('button', { type: 'button', class: 'btn btn-muted', onclick: function () {
      renderParent({ recovery: true, fromFile: true, restorePoints: { points: [], warnings: [] },
        onStartFresh: function () { renderCreateNew(opts); } });
    } }, 'Already played? Restore a backup…'));

    setTimeout(function () { nameInput.focus(); }, 60);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Profile manager (list + switch + edit + delete)
  // ──────────────────────────────────────────────────────────────────────
  function renderManager() {
    const root = qs('#hub-root');
    const stage = qs('#stage-root');
    if (stage) stage.hidden = true;
    if (window.KLS.chrome && window.KLS.chrome.unmount) window.KLS.chrome.unmount();
    if (!root) return;

    const profiles = progress.listProfiles();
    const snap = progress.get();
    const activeId = snap.activeProfileId;

    root.hidden = false;
    root.className = 'profile-manager';
    root.innerHTML = '';

    root.append(
      el('header', { class: 'profile-manager__header' },
        el('h1', {}, 'Who’s playing?'),
        el('p', { class: 'profile-picker__subtitle' },
          'Pick a profile, or make a new one. ' + profiles.length + ' of ' + progress.MAX_PROFILES + '.'),
      )
    );

    const grid = el('div', { class: 'profile-manager__grid' });
    profiles.forEach(function (p) {
      const tile = el('div', {
        class: 'profile-tile' + (p.id === activeId ? ' profile-tile--active' : ''),
      });
      const t = progress.exportProfile(p.id);
      // Quick totals from the snapshot.
      let stars = 0;
      let stickers = 0;
      for (const g of Object.values(p.games || {})) {
        stickers += (g.stickers || []).length;
        for (const lv of Object.values(g.levels || {})) stars += lv.stars || 0;
      }
      const pickBtn = el('button', {
        type: 'button',
        class: 'profile-tile__pick',
        'aria-label': 'Play as ' + p.displayName,
        onclick: function () {
          if (!progress.setActiveProfile(p.id)) { alert('Could not save the profile switch. Please try again.'); return; }
          location.hash = '';
        },
      },
        el('span', { class: 'profile-tile__avatar', 'aria-hidden': 'true' }, p.avatar),
        el('span', { class: 'profile-tile__name' }, p.displayName),
        el('span', { class: 'profile-tile__stats' }, '⭐ ' + stars + ' · 🏆 ' + stickers),
        (p.id === activeId ? el('span', { class: 'profile-tile__badge' }, 'Playing now') : null),
      );

      const editBtn = el('button', {
        type: 'button',
        class: 'profile-tile__edit',
        'aria-label': 'Edit ' + p.displayName,
        onclick: function () { renderEdit(p); },
      }, '✏️');

      tile.append(pickBtn, editBtn);
      grid.append(tile);
    });

    const atLimit = profiles.length >= progress.MAX_PROFILES;
    const addBtn = el('button', {
      type: 'button',
      class: 'profile-add' + (atLimit ? ' profile-add--disabled' : ''),
      disabled: atLimit,
      'aria-label': 'Create new profile',
      onclick: function () { location.hash = '#/profiles/new'; },
    },
      el('span', { class: 'profile-add__plus', 'aria-hidden': 'true' }, '+'),
      el('span', { class: 'profile-add__label' }, atLimit ? 'Profile limit (6)' : 'New profile'),
    );
    grid.append(addBtn);

    root.append(grid);

    root.append(el('div', { class: 'btn-row' },
      el('button', { type: 'button', class: 'btn btn-muted', onclick: function () { location.hash = ''; } }, 'Back to hub'),
      el('button', { type: 'button', class: 'btn btn-secondary', onclick: function () { location.hash = '#/parent'; } }, 'Parent / Data Page'),
    ));
  }

  function renderEdit(profile) {
    const root = qs('#hub-root');
    if (!root) return;
    root.innerHTML = '';
    root.className = 'profile-picker';

    let chosenAvatar = profile.avatar;
    let chosenName = profile.displayName;

    root.append(
      el('header', { class: 'profile-picker__header' },
        el('h1', {}, 'Edit ' + profile.displayName),
      )
    );

    const grid = avatarGrid(chosenAvatar, function (a) { chosenAvatar = a; });
    const nameInput = el('input', {
      type: 'text',
      class: 'profile-picker__name-input',
      value: profile.displayName,
      maxlength: 16,
      'aria-label': 'Nickname',
      autocomplete: 'off',
    });
    nameInput.addEventListener('input', function () { chosenName = nameInput.value; });

    const saveBtn = el('button', {
      type: 'button',
      class: 'btn btn-primary',
      onclick: function () {
        const name = (chosenName || '').trim() || profile.displayName;
        if (!progress.updateProfile(profile.id, { displayName: name, avatar: chosenAvatar })) { alert('Could not save these changes. Please try again.'); return; }
        location.hash = '#/profiles';
      },
    }, 'Save changes');

    const deleteBtn = el('button', {
      type: 'button',
      class: 'btn btn-muted',
      onclick: function () {
        const ok = window.confirm('Delete ' + profile.displayName + ' and all of their progress? This cannot be undone.');
        if (!ok) return;
        if (!progress.deleteProfile(profile.id)) { alert('The profile could not be deleted. Please try again.'); return; }
        location.hash = '#/profiles';
      },
    }, '🗑️ Delete this profile');

    const cancelBtn = el('button', {
      type: 'button',
      class: 'btn btn-muted',
      onclick: function () { location.hash = '#/profiles'; },
    }, 'Cancel');

    root.append(el('div', { class: 'card profile-picker__card' },
      el('h3', { class: 'profile-picker__section' }, 'Emoji'),
      grid,
      el('h3', { class: 'profile-picker__section' }, 'Nickname'),
      nameInput,
      el('div', { class: 'btn-row' }, saveBtn, cancelBtn),
      el('hr', { class: 'profile-picker__hr' }),
      el('p', { class: 'profile-picker__limit' }, 'Danger zone'),
      el('div', { class: 'btn-row' }, deleteBtn),
    ));
  }

  // ──────────────────────────────────────────────────────────────────────
  // Resume modal
  // ──────────────────────────────────────────────────────────────────────
  function confirmResume(slug, savedBlob, onResume, onStartOver) {
    const overlay = el('div', { class: 'kls-modal-overlay', role: 'dialog', 'aria-modal': 'true' });
    const card = el('div', { class: 'kls-modal' },
      el('h2', { class: 'kls-modal__title' }, 'Welcome back!'),
      el('p', { class: 'kls-modal__body' }, 'You have a saved game here. Want to pick up where you left off?'),
      el('div', { class: 'btn-row kls-modal__buttons' },
        el('button', {
          type: 'button',
          class: 'btn btn-primary',
          onclick: function () { overlay.remove(); onResume(); },
        }, 'Continue ▶'),
        el('button', {
          type: 'button',
          class: 'btn btn-secondary',
          onclick: function () {
            if (!window.confirm('Start over? Your saved spot will be replaced.')) return;
            overlay.remove();
            onStartOver();
          },
        }, 'Start Over'),
      ),
    );
    overlay.append(card);
    document.body.append(overlay);
    // Auto-focus the primary action.
    setTimeout(function () { card.querySelector('.btn-primary').focus(); }, 30);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Parent / data page
  // ──────────────────────────────────────────────────────────────────────
  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  function renderParent(options) {
    options = options || {};
    if (backupStatusUnsubscribe) { backupStatusUnsubscribe(); backupStatusUnsubscribe = null; }
    const root = qs('#hub-root');
    const stage = qs('#stage-root');
    if (stage) stage.hidden = true;
    if (window.KLS.chrome && window.KLS.chrome.unmount) window.KLS.chrome.unmount();
    if (!root) return;

    const profiles = progress.listProfiles();
    const snap = progress.get();

    let approxBytes = 0;
    try {
      const v2 = localStorage.getItem('kls.progress.v2') || '';
      const v1 = localStorage.getItem('kls.progress.v1') || '';
      approxBytes = (v2.length + v1.length);
    } catch (e) { /* ignore */ }

    root.hidden = false;
    root.className = 'parent-page';
    root.innerHTML = '';

    root.append(
      el('header', { class: 'parent-page__header' },
        el('h1', {}, options.recovery ? 'Restore your saved progress' : 'Parent page'),
        el('p', { class: 'profile-picker__subtitle' },
          options.fromFile ? 'Choose a backup file to bring back your profiles and game progress.' : options.recovery ? 'We found saved backups. Restore one to continue, or start with new profiles. Automatic backups are paused until you decide.' : 'Progress saves as you play. Backups let you return to an earlier moment.'),
      )
    );

    // Summary card
    const profileRows = profiles.map(function (p) {
      let stars = 0;
      let stickers = 0;
      for (const g of Object.values(p.games || {})) {
        stickers += (g.stickers || []).length;
        for (const lv of Object.values(g.levels || {})) stars += lv.stars || 0;
      }
      return el('tr', {},
        el('td', {}, p.avatar + ' ' + p.displayName + (p.id === snap.activeProfileId ? ' (active)' : '')),
        el('td', {}, String(Object.keys(p.games || {}).length)),
        el('td', {}, '⭐ ' + stars + ' · 🏆 ' + stickers),
        el('td', {}, p.lastActiveAt ? new Date(p.lastActiveAt).toLocaleDateString() : '—'),
      );
    });

    const summary = el('div', { class: 'card parent-page__card' },
      el('h2', { class: 'parent-page__section' }, 'Profiles on this device (' + profiles.length + ')'),
      profiles.length === 0
        ? el('p', {}, 'No profiles yet.')
        : el('table', { class: 'parent-page__table' },
            el('thead', {},
              el('tr', {},
                el('th', {}, 'Profile'),
                el('th', {}, 'Games tried'),
                el('th', {}, 'Earned'),
                el('th', {}, 'Last active'),
              )
            ),
            el('tbody', {}, profileRows),
          ),
      el('p', { class: 'parent-page__note' }, 'Approx. local-storage used: ' + fmtBytes(approxBytes)),
    );
    if (!options.recovery) root.append(summary);

    const backup = window.KLS && window.KLS.backup;
    const fmtRel = window.KLS.util.formatRelative;
    const backupCard = el('div', { class: 'card parent-page__card parent-backup' });
    root.append(backupCard);
    if (!backup) { backupCard.append(el('p', { role: 'alert' }, 'Backups could not be loaded. Reload to try again.')); return; }

    const status = el('p', { class: 'parent-backup__status', 'aria-live': 'polite' }, 'Checking backup status…');
    const note = el('p', { class: 'parent-page__note' });
    const restorePanel = el('div', { class: 'parent-backup__timeline', hidden: !options.recovery });
    const preview = el('div', { class: 'parent-backup__preview', hidden: true });
    const fileInput = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    const restoreError = el('p', { role: 'alert', class: 'parent-backup__error' });
    let previewVersion = 0;
    let restoring = false;
    let catalogVersion = 0;
    let latestCatalog = options.restorePoints || null;

    function showPreview(preparing, label) {
      if (restoring) return;
      const version = ++previewVersion;
      preview.hidden = false;
      preview.innerHTML = '';
      preview.append(el('p', { role: 'status' }, 'Checking the backup before making changes…'));
      preparing.then(function (prepared) {
        if (version !== previewVersion || !preview.isConnected) return;
        preview.innerHTML = '';
        const confirm = el('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
          if (restoring) return;
          restoring = true; confirm.disabled = true; cancel.disabled = true;
          backup.restoreFromEnvelope(prepared.envelope).catch(function (e) {
            restoring = false; confirm.disabled = false; cancel.disabled = false;
            preview.append(el('p', { role: 'alert', class: 'parent-backup__error' }, e.message));
            if (e.recoveryRequired || e.undoAvailable) preview.append(el('button', {
              type: 'button', class: 'btn btn-secondary', onclick: function () { location.reload(); }
            }, e.recoveryRequired ? 'Recover previous progress' : 'Reload to use Undo'));
          });
        } }, 'Replace all profiles and progress');
        const cancel = el('button', { type: 'button', class: 'btn btn-muted', onclick: function () {
          previewVersion++; preview.hidden = true; preview.innerHTML = '';
        } }, 'Cancel restore');
        const names = prepared.summary.profiles.map(function (p) { return p.avatar + ' ' + p.name; }).join(', ') || 'No profiles';
        preview.append(el('h3', {}, 'Restore preview'), el('p', {}, label),
          el('p', {}, 'Profiles in this backup: ' + names),
          el('p', {}, 'Progress: ⭐ ' + prepared.summary.totalStars + ' · 🏆 ' + prepared.summary.totalStickers),
          el('p', {}, 'This replaces all current profiles and game progress. A safety copy is kept for Undo restore. Device preferences and standalone saves are preserved.'),
          ...prepared.warnings.map(function (w) { return el('p', { class: 'parent-page__note' }, w); }),
          el('div', { class: 'btn-row' }, confirm, cancel));
        cancel.focus();
      }).catch(function (e) {
        if (version !== previewVersion) return;
        preview.innerHTML = '';
        preview.append(el('p', { role: 'alert', class: 'parent-backup__error' }, 'Could not open this backup. Progress is unchanged. ' + e.message));
      });
    }
    function pointRow(point, newest) {
      const when = new Date(point.ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      const where = point.source === 'browser' ? 'Browser backup' : 'Folder backup';
      const who = ((point.summary && point.summary.profiles) || []).map(function (p) {
        return p.avatar + ' ' + p.name + ' · ⭐ ' + p.stars + ' · 🏆 ' + p.stickers;
      }).join('  /  ') || 'No profiles';
      return el('div', { class: 'timeline__moment' },
        el('div', { class: 'timeline__moment-main' },
          el('span', { class: 'timeline__time' }, (newest ? 'Latest available · ' : '') + when),
          el('span', { class: 'timeline__who' }, who),
          el('span', { class: 'timeline__who' }, where + (point.label ? ' · ' + point.label : ''))),
        el('button', { type: 'button', class: 'btn btn-secondary btn-tiny', onclick: function () {
          if (!restoring) showPreview(backup.prepareRestorePoint(point), where + ' · ' + when);
        } }, newest ? 'Review latest backup' : 'Review backup'));
    }
    function renderCatalog(catalog) {
      latestCatalog = catalog;
      restorePanel.innerHTML = '';
      catalog.warnings.forEach(function (w) { restorePanel.append(el('p', { role: 'alert', class: 'parent-page__note' }, w)); });
      if (catalog.points.length) {
        restorePanel.append(pointRow(catalog.points[0], true));
        if (catalog.points.length > 1) {
          const earlier = el('details', { class: 'parent-backup__tip' }, el('summary', {}, 'Earlier backups'));
          catalog.points.slice(1).forEach(function (p) { earlier.append(pointRow(p, false)); });
          restorePanel.append(earlier);
        }
      } else restorePanel.append(el('p', {}, 'No backups are available here yet. You can choose a backup file below.'));
      restorePanel.append(el('div', { class: 'btn-row' },
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: function () { fileInput.click(); } }, 'Choose a backup file…'),
        el('button', { type: 'button', class: 'btn btn-muted', onclick: loadCatalog }, 'Refresh backups')));
    }
    function loadCatalog() {
      const version = ++catalogVersion;
      restorePanel.innerHTML = '';
      restorePanel.append(el('p', { role: 'status' }, 'Looking for saved backups…'));
      backup.getRestorePoints().then(function (catalog) {
        if (version === catalogVersion && restorePanel.isConnected) renderCatalog(catalog);
      }).catch(function (e) {
        if (version === catalogVersion) renderCatalog({ points: [], warnings: [e.message] });
      });
    }
    fileInput.addEventListener('change', function () {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (file && !restoring) showPreview(backup.prepareImport(file), file.name || 'Backup file');
    });
    const restoreButton = el('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
      restorePanel.hidden = !restorePanel.hidden;
      restoreButton.textContent = restorePanel.hidden ? 'Restore progress' : 'Hide backups';
      if (!restorePanel.hidden) loadCatalog();
    } }, options.recovery ? 'Hide backups' : 'Restore progress');
    backupCard.append(el('h2', { class: 'parent-page__section' }, options.recovery ? 'Available backups' : 'Progress & backups'),
      status, note, el('div', { class: 'btn-row' }, restoreButton), restorePanel, fileInput, preview, restoreError);

    const undoInfo = backup.getLastRestoreInfo();
    if (undoInfo.undoAvailable) {
      const undo = el('button', { type: 'button', class: 'btn btn-secondary', onclick: function () {
        if (restoring) return;
        previewVersion++;
        preview.hidden = false;
        preview.innerHTML = '';
        const cancel = el('button', { type: 'button', class: 'btn btn-muted', onclick: function () {
          if (restoring) return;
          previewVersion++; preview.hidden = true; preview.innerHTML = '';
        } }, 'Cancel restore');
        const apply = el('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
          restoring = true; apply.disabled = true; cancel.disabled = true;
          backup.undoLastRestore().catch(function (e) {
            restoring = false; apply.disabled = false; cancel.disabled = false; restoreError.textContent = e.message;
          });
        } }, undoInfo.kind === 'undo' ? 'Confirm redo' : 'Confirm undo');
        preview.append(el('h3', {}, undoInfo.kind === 'undo' ? 'Redo restore?' : 'Undo restore?'),
          el('p', {}, 'This replaces all current profiles and game progress with the retained copy.'),
          el('div', { class: 'btn-row' }, apply, cancel));
        cancel.focus();
      } }, undoInfo.kind === 'undo' ? 'Redo restore' : 'Undo restore');
      backupCard.append(el('div', { class: 'btn-row' }, undo),
        el('p', { class: 'parent-page__note' }, 'Previous progress retained - ' + fmtRel(undoInfo.at)));
    }

    const settings = el('details', { class: 'parent-backup__tip' }, el('summary', {}, 'Backup settings'));
    const settingsNote = el('p', { class: 'parent-page__note' });
    const folderButton = el('button', { type: 'button', class: 'btn btn-secondary', hidden: true, onclick: function () {
      backup.connectBackupFolder().then(function (dh) {
        if (dh) { updateStatus(); if (!restorePanel.hidden) loadCatalog(); }
      }).catch(function (e) { restoreError.textContent = e.message; });
    } }, 'Change backup folder…');
    const downloadNote = el('p', { role: 'status', class: 'parent-page__note' });
    settings.append(settingsNote, el('div', { class: 'btn-row' }, el('button', {
      type: 'button', class: 'btn btn-secondary', onclick: function () {
        try {
          if (backup.saveToDownload()) downloadNote.textContent = 'Download requested. Check Downloads for your backup file.';
        } catch (e) { downloadNote.textContent = 'Download could not be started. ' + e.message; }
      }
    }, 'Download backup'), folderButton), downloadNote,
      el('p', { class: 'parent-page__note' }, 'Backups include every profile and all registered game progress. Keep a downloaded copy to move to another computer.'));
    if (!options.recovery) backupCard.append(settings);
    const retry = el('button', { type: 'button', class: 'btn btn-secondary', hidden: true, onclick: function () {
      retry.disabled = true;
      backup.saveHistoryNow().catch(function (e) { restoreError.textContent = e.message; })
        .finally(function () { retry.disabled = false; updateStatus(); });
    } }, 'Retry folder backup');
    const retryBrowser = el('button', { type: 'button', class: 'btn btn-secondary', hidden: true, onclick: function () {
      backup.takeSnapshotNow({ mirror: false }).then(updateStatus);
    } }, 'Retry browser backups');
    backupCard.append(el('div', { class: 'btn-row' }, retry, retryBrowser));

    async function refreshHealth() {
      const results = await Promise.all([backup.getBackupHealth(), backup.getSaveTargetStatus()]);
      if (!backupCard.isConnected) return;
      const h = results[0], target = results[1];
      const writeError = progress.getLastWriteError && progress.getLastWriteError();
      status.textContent = options.recovery ? 'Automatic backups paused while you choose.'
        : writeError ? 'Browser progress needs attention: ' + writeError : 'Progress saves automatically in this browser.';
      const lastFolder = target.mode === 'server' ? target.lastSavedAt : h.lastDiskAt;
      note.textContent = h.diskState === 'error' ? 'Folder backup needs attention: ' + h.diskError
        : target.mode === 'server' || (target.mode === 'folder' && target.connected && !target.needsReconnect)
          ? (lastFolder ? 'Folder backup updated ' + fmtRel(lastFolder) + '.' : 'Automatic folder backups are ready.')
            + (h.diskState === 'pending' ? ' Recent changes are waiting for the next backup.' : '')
          : 'For automatic folder backups, open “Play Kids Learning Space”. You can also download a backup in Backup settings.';
      if (options.recovery) note.textContent = 'Choose a backup to review its profiles before restoring.';
      settingsNote.textContent = target.mode === 'server'
        ? 'Automatic backups are kept in this app’s saved_status folder. The newest 30 files are kept; writes are up to three minutes apart.'
        : target.connected ? 'Backup folder: ' + target.name + (target.needsReconnect ? ' · reconnect to continue.' : '.')
        : 'The launcher saves backups into this app’s folder. Chrome and Edge can also connect a different folder.';
      folderButton.hidden = target.mode === 'server' || !target.supported;
      folderButton.textContent = target.needsReconnect ? 'Reconnect backup folder…' : target.connected ? 'Change backup folder…' : 'Choose backup folder…';
      retry.hidden = options.recovery || h.diskState !== 'error';
      retryBrowser.hidden = options.recovery || h.snapshotState !== 'error';
      if (h.snapshotState === 'error') settingsNote.textContent += ' Browser backup history needs attention: ' + h.snapshotError;
      if (h.snapshotState === 'unavailable') settingsNote.textContent += ' Browser backup history is unavailable here; folder backups and downloaded files still work.';
    }
    function updateStatus() { refreshHealth().catch(function (e) { note.textContent = 'Backup status could not be checked. ' + e.message; }); }
    backupStatusUnsubscribe = backup.subscribeStatus(function () {
      if (!backupCard.isConnected) { backupStatusUnsubscribe(); backupStatusUnsubscribe = null; return; }
      updateStatus();
    });
    updateStatus();
    if (options.recovery) {
      if (latestCatalog) renderCatalog(latestCatalog); else loadCatalog();
      if (options.fromFile) {
        root.append(el('button', { type: 'button', class: 'btn btn-muted', onclick: function () {
          if (!restoring) options.onStartFresh();
        } }, 'Back to new profile'));
        return;
      }
      const fresh = el('div', { class: 'btn-row' });
      fresh.append(el('button', { type: 'button', class: 'btn btn-muted', onclick: function () {
        if (restoring) return;
        fresh.innerHTML = '';
        fresh.append(el('p', {}, 'Create new profiles instead? Your existing backup files remain available in Restore progress.'),
          el('button', { type: 'button', class: 'btn btn-secondary', onclick: function () { if (!restoring) options.onStartFresh(); } }, 'Create new profiles'));
      } }, 'Start fresh'));
      root.append(fresh);
      return;
    }

    // Danger zone
    const dangerCard = el('div', { class: 'card parent-page__card' },
      el('h2', { class: 'parent-page__section' }, 'Danger zone'),
      el('p', {}, 'Clear all profiles and progress on this device. Cannot be undone.'),
      el('div', { class: 'btn-row' },
        el('button', {
          type: 'button',
          class: 'btn btn-muted',
          onclick: function () {
            if (!window.confirm('Clear everything? All profiles and progress on this device will be erased.')) return;
            if (!progress.reset()) { alert('Could not clear progress. Please try again.'); return; }
            location.hash = '';
          },
        }, '🗑️ Clear all data'),
      ),
    );
    root.append(dangerCard);

    root.append(el('div', { class: 'btn-row' },
      el('button', { type: 'button', class: 'btn btn-muted', onclick: function () { location.hash = ''; } }, 'Back to hub'),
    ));
  }

  window.KLS = window.KLS || {};
  window.KLS.profileUI = {
    ensureProfileOrPick,
    renderManager,
    renderCreateNew,
    renderParent,
    confirmResume,
    AVATARS,
  };
})();
