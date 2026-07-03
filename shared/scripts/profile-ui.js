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

    // ── Quiet Backup: status card + restore timeline + folder + quiet links ──
    const backup = window.KLS && window.KLS.backup;
    const fmtRel = (window.KLS.util && window.KLS.util.formatRelative) || function (x) { return new Date(x).toLocaleString(); };

    const backupCard = el('div', { class: 'card parent-page__card parent-backup' });
    root.append(backupCard);

    function renderTimeline(wrap, list) {
      wrap.innerHTML = '';
      if (!list.length) { wrap.append(el('p', { class: 'parent-page__note' }, 'No moments yet.')); return; }
      const groups = backup._internals.groupSnapshotsByPeriod(list, Date.now());
      const order = [['today', 'Today'], ['yesterday', 'Yesterday'], ['thisWeek', 'This week'], ['older', 'Older']];
      order.forEach(function (pair) {
        const items = groups[pair[0]];
        if (!items.length) return;
        wrap.append(el('h3', { class: 'timeline__heading' }, pair[1]));
        items.forEach(function (m) {
          const time = new Date(m.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          const who = ((m.summary && m.summary.profiles) || []).map(function (p) {
            return p.avatar + ' ' + p.name + ' ⭐ ' + p.stars + ' 🏆 ' + p.stickers;
          }).join('  ·  ') || 'no progress yet';
          const row = el('div', { class: 'timeline__moment' },
            el('div', { class: 'timeline__moment-main' },
              el('span', { class: 'timeline__time' }, time + (m.label ? ' — ' + m.label : '')),
              el('span', { class: 'timeline__who' }, who),
            ),
            el('button', {
              type: 'button', class: 'btn btn-secondary btn-tiny',
              onclick: function () {
                const when = new Date(m.ts).toLocaleString();
                if (!window.confirm('Go back to ' + when + '?\n\nEverything on this device will look exactly as it did then. A "Before restore" moment is saved first, so you can undo this.')) return;
                backup.restoreSnapshot(m.ts).catch(function (e) {
                  alert('Restore failed: ' + (e && e.message ? e.message : e));
                });
              },
            }, 'Replace everything'),
          );
          wrap.append(row);
        });
      });
    }

    // Dispatch on where saves go: automatic local server, or picked folder.
    function renderSaveTarget(row, st) {
      row.innerHTML = '';
      if (st && st.mode === 'server') { renderServerRow(row, st); return; }
      renderFolderRow(row, st || { mode: 'none' });
    }

    function renderServerRow(row, st) {
      const n = typeof st.count === 'number' ? st.count : 0;
      const saveBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-tiny', onclick: function () {
        saveBtn.disabled = true;
        backup.saveHistoryNow()
          .then(function () { renderBackupCard(); })
          .catch(function (e) { saveBtn.disabled = false; alert('Save to folder failed: ' + (e && e.message ? e.message : e)); });
      } }, '💾 Save now');
      row.append(
        el('p', { class: 'parent-backup__status' },
          '📁 Saving to this app’s folder' + (st.folder ? ' (' + st.folder + ')' : '')
          + ' · saved_status/ has ' + n + ' file' + (n === 1 ? '' : 's')),
        el('p', { class: 'parent-page__note' },
          'Every autosave and the button below write into the folder automatically — no folder-picker needed.'),
        el('div', { class: 'btn-row' }, saveBtn),
      );
    }

    function renderFolderRow(row, st) {
      row.innerHTML = '';
      if (!st || !st.supported) {
        // No save server and no File System Access API (e.g. opened as a plain
        // file). Be honest about how to enable folder-saving rather than hiding it.
        row.append(el('p', { class: 'parent-page__note' },
          'To save into a folder automatically, open the app with “Play Kids Learning Space” (.command / .bat) — it runs a local server that writes the files (any browser). You’re currently opening it as a plain file; progress and “Export a file…” still work here.'));
        return;
      }
      if (!st.connected) {
        row.append(
          el('p', { class: 'parent-page__note' }, 'Keep your save history as files in a folder — pick this app’s folder so saves sit next to index.html. Survives a browser wipe or a move to a new computer.'),
          el('button', { type: 'button', class: 'btn btn-secondary btn-tiny', onclick: function () {
            backup.connectBackupFolder().then(function (dh) { if (dh) renderBackupCard(); })
              .catch(function (e) { alert('Could not connect folder: ' + (e && e.message ? e.message : e)); });
          } }, '📁 Choose folder…'),
        );
        return;
      }
      if (st.needsReconnect) {
        row.append(
          el('p', { class: 'parent-page__note' }, 'Backup folder “' + st.name + '” lost permission.'),
          el('button', { type: 'button', class: 'btn btn-secondary btn-tiny', onclick: function () {
            backup.connectBackupFolder().then(function (dh) { if (dh) renderBackupCard(); })
              .catch(function (e) { alert('Could not reconnect: ' + (e && e.message ? e.message : e)); });
          } }, 'Reconnect folder…'),
        );
        return;
      }
      const hist = typeof st.historyCount === 'number' ? st.historyCount : 0;
      const saveBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-tiny', onclick: function () {
        saveBtn.disabled = true;
        backup.saveHistoryNow()
          .then(function () { renderBackupCard(); })
          .catch(function (e) { saveBtn.disabled = false; alert('Save to folder failed: ' + (e && e.message ? e.message : e)); });
      } }, '💾 Save to folder now');
      row.append(
        el('p', { class: 'parent-page__note' },
          'Folder connected · ' + st.name + ' · saved_status/ has ' + hist + ' file' + (hist === 1 ? '' : 's')
          + (st.lastMirrorAt ? ' · updated ' + fmtRel(st.lastMirrorAt) : '')),
        el('div', { class: 'btn-row' }, saveBtn),
      );
    }

    function renderBackupCard() {
      backupCard.innerHTML = '';
      const available = backup && backup.snapshotsAvailable && backup.snapshotsAvailable();

      backupCard.append(el('h2', { class: 'parent-page__section' }, 'Backups'));

      if (!backup) { backupCard.append(el('p', {}, 'Backup module not loaded.')); return; }

      // "Save my game" — works even when the app was opened by double-clicking
      // index.html: downloads a saved_status/kls-save-<time>.json file.
      if (backup.saveMyGame) {
        const saveNote = el('p', { class: 'parent-page__note' },
          'Saves your profiles + progress into a “saved_status” folder. The first time, your browser may ask you to pick the folder (pick this game’s folder, or anywhere) — after that it saves there. If your browser can’t pick a folder, it downloads the file instead. Restore later with “Import a file…”.');
        const saveGameBtn = el('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
          saveGameBtn.disabled = true;
          backup.saveMyGame().then(function (r) {
            saveGameBtn.disabled = false;
            if (!r || r.mode === 'cancelled') { saveGameBtn.textContent = '💾 Save my game'; return; }
            saveGameBtn.textContent = r.mode === 'download' ? '✅ Downloaded!' : '✅ Saved to folder!';
            saveNote.textContent = r.mode === 'folder'
              ? 'Saved into “' + (r.name || 'your folder') + '/saved_status/”. It saves there again next time.'
              : r.mode === 'server'
                ? 'Saved into this app’s saved_status/ folder.'
                : 'Downloaded a saved_status file to your browser’s downloads.';
            setTimeout(function () { saveGameBtn.textContent = '💾 Save my game'; }, 2000);
          }).catch(function (e) { saveGameBtn.disabled = false; alert('Save failed: ' + (e && e.message ? e.message : e)); });
        } }, '💾 Save my game');
        backupCard.append(
          el('div', { class: 'btn-row' }, saveGameBtn),
          saveNote,
          el('details', { class: 'parent-backup__tip' },
            el('summary', {}, 'Where exactly does it save?'),
            el('p', { class: 'parent-page__note' },
              'Chrome/Edge let the page write into a saved_status folder you pick once (pick this Kids-learning-space folder to keep saves next to the game). ' +
              'Firefox/Safari don’t allow that from a double-clicked file, so the save is downloaded instead (into a “saved_status” subfolder of your downloads on Chrome/Edge, or straight to downloads elsewhere). ' +
              'For fully automatic saves into this folder in any browser, use the launcher (local server).'),
          ),
        );
      }

      if (!available) {
        backupCard.append(el('p', {}, 'Automatic backups aren’t available in this browser. You can still export and import a file below.'));
      } else {
        const statusLine = el('p', { class: 'parent-backup__status' }, 'On · loading…');
        backupCard.append(statusLine);
        const timelineWrap = el('div', { class: 'parent-backup__timeline', hidden: true });
        const restoreBtn = el('button', {
          type: 'button', class: 'btn btn-secondary',
          onclick: function () {
            timelineWrap.hidden = !timelineWrap.hidden;
            restoreBtn.textContent = timelineWrap.hidden ? 'Restore from a moment…' : 'Hide moments';
          },
        }, 'Restore from a moment…');
        backupCard.append(el('div', { class: 'btn-row' }, restoreBtn), timelineWrap);

        backup.getSnapshotsMeta().then(function (list) {
          statusLine.textContent = list.length
            ? 'On · last snapshot ' + fmtRel(list[0].ts) + ' · ' + list.length + ' moment' + (list.length === 1 ? '' : 's') + ' kept'
            : 'On · no snapshots yet — play a game and one appears within ~10 seconds';
          renderTimeline(timelineWrap, list);
        });
      }

      // Where saves go: local save server (automatic) → picked folder → none.
      const folderRow = el('div', { class: 'parent-backup__folder' });
      backupCard.append(folderRow);
      if (backup.getSaveTargetStatus) backup.getSaveTargetStatus().then(function (st) { renderSaveTarget(folderRow, st); });
      else if (backup.getFolderStatus) backup.getFolderStatus().then(function (st) { renderFolderRow(folderRow, st); });

      // Quiet Export / Import links — the off-device escape hatch. Import keeps
      // the stronger type-REPLACE confirmation because a file can come from
      // anywhere.
      const importInput = el('input', { type: 'file', accept: 'application/json', style: 'display:none' });
      importInput.addEventListener('change', function (ev) {
        const file = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!file) return;
        const typed = window.prompt(
          "Importing will REPLACE all profiles and progress on this device with the file's contents.\n\nType REPLACE to continue:");
        if (typed !== 'REPLACE') { alert('Import cancelled. Nothing was changed.'); return; }
        backup.importFromFile(file).catch(function (e) {
          alert('Import failed: ' + (e && e.message ? e.message : e) + '\n\nNothing on this device was changed.');
        });
      });
      backupCard.append(
        el('p', { class: 'parent-backup__links' },
          el('a', { href: '#', class: 'parent-backup__link', onclick: function (e) {
            e.preventDefault();
            backup.exportToFile().catch(function (err) { alert('Export failed: ' + (err && err.message ? err.message : err)); });
          } }, 'Export a file…'),
          el('span', { 'aria-hidden': 'true' }, '  ·  '),
          el('a', { href: '#', class: 'parent-backup__link', onclick: function (e) { e.preventDefault(); importInput.click(); } }, 'Import a file…'),
          importInput,
        ),
        el('p', { class: 'parent-page__note' }, 'Snapshots and file backups use the same format — either can restore the other.')
      );
    }

    renderBackupCard();

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
