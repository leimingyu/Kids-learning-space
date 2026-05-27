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
        progress.createProfile({ displayName: 'Friend', avatar: '🦊' }, true);
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
          progress.setActiveProfile(p.id);
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
        progress.updateProfile(profile.id, { displayName: name, avatar: chosenAvatar });
        location.hash = '#/profiles';
      },
    }, 'Save changes');

    const deleteBtn = el('button', {
      type: 'button',
      class: 'btn btn-muted',
      onclick: function () {
        const ok = window.confirm('Delete ' + profile.displayName + ' and all of their progress? This cannot be undone.');
        if (!ok) return;
        progress.deleteProfile(profile.id);
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

  function renderParent() {
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
        el('h1', {}, 'Parent / Data Page'),
        el('p', { class: 'profile-picker__subtitle' },
          'Everything is stored only in this browser. No accounts, no servers.'),
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
    root.append(summary);

    // Backup / Restore card — uses window.KLS.backup (see BACKUP_RESTORE.md).
    const backup = window.KLS && window.KLS.backup;

    const restoreInput = el('input', { type: 'file', accept: 'application/json', style: 'display:none' });
    restoreInput.addEventListener('change', function (ev) {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!file || !backup) return;
      const typed = window.prompt(
        "Restoring will REPLACE all profiles and progress on this device with the backup file's contents. " +
        "Profiles on this device that aren't in the backup will be deleted.\n\n" +
        'Type REPLACE to continue:'
      );
      if (typed !== 'REPLACE') {
        alert('Restore cancelled. Nothing was changed.');
        return;
      }
      backup.importFromFile(file).catch(function (e) {
        alert('Restore failed: ' + (e && e.message ? e.message : e) + '\n\nNothing on this device was changed.');
      });
    });

    const lastExport = backup ? backup.getLastExportedAt() : null;
    const lastExportLabel = lastExport
      ? 'Last backed up: ' + new Date(lastExport).toLocaleString()
      : 'No backup made yet on this device.';

    const eximCard = el('div', { class: 'card parent-page__card' },
      el('h2', { class: 'parent-page__section' }, 'Backup & Restore'),
      el('p', {}, 'Back up every profile and all game progress to a single JSON file. ' +
        'Save it somewhere safe (Files, email to yourself, cloud drive) — it is the ' +
        'only way to recover this data if the browser clears its storage.'),
      el('p', { class: 'parent-page__note' }, lastExportLabel),
      el('div', { class: 'btn-row' },
        el('button', {
          type: 'button',
          class: 'btn btn-primary',
          onclick: function () {
            if (!backup) { alert('Backup module not loaded.'); return; }
            backup.exportToFile().then(function (ok) {
              if (ok) setTimeout(renderParent, 400); // refresh "Last backed up" line
            }).catch(function (e) {
              alert('Save failed: ' + (e && e.message ? e.message : e));
            });
          },
        }, '💾 Back up everything'),
        el('button', {
          type: 'button',
          class: 'btn btn-secondary',
          onclick: function () { restoreInput.click(); },
        }, '📥 Restore from backup…'),
      ),
      restoreInput,
    );
    root.append(eximCard);

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
            progress.reset();
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
