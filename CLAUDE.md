# CLAUDE.md: Wanderer's Guild

Foundry VTT module (v13 minimum, verified v14 build 370; dnd5e 6.x, verified 6.0.6): professions built on dnd5e tool proficiencies. A character has every profession whose linked tool it is proficient with (no limit); the rank is its proficiency bonus, named by a GM-editable rank table that also gives the highest craftable rarity. 0.1.0 = slice 1 (definitions, ranks, Professions window, setup window); crafting (slice 2), recipes and gathering (slice 3) are placeholders. Logic only; campaign content stays in each world. Public repo, MIT. Built on **wanderers-core 0.5.2** (vendored; never edit `vendor/` by hand: `node vendor/wanderers-core/vendor.mjs update X.Y.Z`, behind the proxy with `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`; core's CONVENTIONS.md applies).

## File map (`scripts/`)
- `main.mjs` entry: settings (`init`), hooks and buttons gated by `F.on(...)`, the API (`game.modules.get("wanderers-guild").api`, set in `init`), `leader.start()` in `ready`, the Satchel registration, hook `wanderers-guild.ready`.
- `const.mjs` module id, title, hook names, `TOOLKIT_ID`, `SYSTEM_ID`; re-exports `esc`/`plural` from core. The id lives only here (and module.json).
- `core.mjs` the one place core is bound: `F` (features `professions`, `sheetButton` needs professions), `S` (settings rows), `RECORDS`, `changed` (listeners run on every client when the definitions, ranks or switches change), `log`/`warn`, `REQUESTS` (none yet) and `leader`.
- `professions-model.mjs` (pure) definitions: `normalizeProfessions` (v1, `PROFESSIONS_MAX` 100, `TOOLS_MAX` 8), `cleanProfession`, `upsert`/`remove`/`move`, `KINDS`, `ACTIONS`, `KIND_ACTIONS`, `ICONS` (original stroke paths), `STARTER` + `addStarter`, `professionWarnings`.
- `ranks-model.mjs` (pure) rank table: `normalizeRanks` (v1, `RANKS_MAX` 12, sorted, one row per bonus, never empty), `DEFAULT_ROWS`, `RARITIES` (dnd5e keys), `rankFor`, `ladder`, `nextRankText`, `bonusAtLevel` / `levelForBonus` (SRD 5.2 proficiency bonus table), `rankWarnings`, `signed`.
- `character-model.mjs` (pure) a character's professions from plain facts: `characterProfessions`, `professionsView` (cards / others / unlearned), `profMark`, `checkText`.
- `professions-view.mjs` (pure) the Professions window HTML; `setup-view.mjs` (pure) the setup window's shell, pages and form readers (`readProfessionForm`, `readRanksForm`, `nextNavIndex`).
- `dnd5e.mjs` every dnd5e read (tool/skill/rarity labels, `facts(actor)` from prepared data). `data.mjs` the GM's setting writes (`saveProfessions`, `saveRanks`, `addStarterSet`).
- `professions.mjs` `ProfessionsApp` (one per actor, `OPEN` map), `open`, `defaultActor`, `canView`, `viewOf`, redraw hooks, the sheet header button. `setup.mjs` `SetupApp` (pages professions / ranks / settings / health / data), `open(page)`, the Configure Settings menu.
- `health.mjs` read-only report (core `healthCollector`), `satchel-model.mjs` (pure) the Satchel registration, `cleanup.mjs` Remove Wanderer's Guild data.
- `styles/wanderers-guild.css` (every selector starts at a `.wg-*` class; no theme selectors; test), `lang/en.json` (empty: strings are plain English in code), `docs/professions.md` (user docs).

## Data
- World settings (every client reads them, so nothing GM-only): `professionList` `{ v: 1, list: [{ id, name, kind, tools[], icon, check, actions[], notes }] }`, `rankTable` `{ v: 1, rows: [{ bonus, name, rarity }] }`, `showUnlearned`, `debugLog`, the feature switches. Client: core's `windowPlacement` (keys `professions`, `setup`; never rename).
- Nothing on actors, items, scenes, journals, chat. A character's professions and rank are derived on every draw from prepared data: `system.tools[key].prof.multiplier` (fallback `.value`; 0 / 0.5 / 1 / 2), `system.attributes.prof`, `system.details.level`. Learned = multiplier ≥ 1 with any linked tool; no linked tool = everyone. Rank = the table row with the highest bonus ≤ PB. Store nothing per actor unless a GM override is added later (then: an actor flag under `flags.wanderers-guild.*`, versioned, covered by cleanup).
- GM-only data (later: hidden recipes, GM notes) never goes in a world setting or a flag players can see: use core `createStore` (Module data journal) as the toolkit's `vault.mjs` does, with a cap per bucket and cleanup.

## Key patterns
- **Feature registry:** a turned-off tool registers nothing (no hooks, buttons, menus, key bindings, socket handlers); its API getter returns undefined. Gate registration with `F.on("<id>")`.
- **Settings keys are stable** across versions (never rename). A new setting is a row in `S`; visible switches use `tab: "settings"` (the setup window's Settings page lists bool rows of that tab). A new record goes in `S` with `hidden: true` (it lands in `RECORDS`, skipped by the Satchel's export).
- **GM edits are direct** (a GM click writes the world setting through `data.mjs`, after the model's normalizer). **Automatic writes** (none in 0.1; crafting results, gathering) run only on `leader.isLeader()`; players send `leader.request(kind, data)` with a schema in `REQUESTS`, and the handler checks Foundry's sender user's rights (owns the actor), never a payload user id. No module code calls `game.socket` (test).
- **Read-only on actors in 0.1** (test: no `actor.update(` / `createEmbeddedDocuments(`). Slice 2 changes this through the leader.
- **Hot hooks** (`updateActor`, item and effect hooks) bail first unless a Professions window is open for that actor and the change touches `ACTOR_PATHS` (or a class/background/species/feat item, or an effect).
- **Windows**: ApplicationV2 via core `RememberedWindow`, classes `wg-window` + `...UI_CLASSES` (test; never a literal `wc-r<N>`). The setup window uses core's shell and components (`wc-pagehead`, `wc-panel`, `wc-table`, `wc-btn`, `wc-alert`); the Professions window has its own dark palette on `.wg-prof` (tokens `--wg-*`), the same in both themes. Pages are pure strings; `setup.mjs` routes `data-action` in `_onClickAction`; Enter/Space on the sidebar never reach Foundry (Space pauses).
- **Health check** never throws, never changes anything, GM only (players `[]`); a line's fix runs only on a GM click after its confirm. Contract as the toolkit's `healthReport`: `run({ timeoutMs })` → `[{ title, lines: [{ level, text, fix? }] }]`.
- **Cleanup covers everything we write:** `cleanup.mjs` `plan()` / `remove()` / `CATEGORIES` (`professions`, `ranks`, `settings` incl. client `windowPlacement`). A new flag, setting, document or folder must be added there.
- **Toolkit integration** (later slices): read only through `game.modules.get("wayfarers-toolkit")?.api` (`coinRatio()`, `moneyHTML()`), defensively, never required. Toolkit sheet page: not possible yet; proposed API in the handoff notes (`api.sheet.registerPage`).
- **Docs:** README *Public API and hooks* lists every `api.*` entry and hook, stable or experimental; docs/professions.md is the user guide. Update both with any change.

## Tests
- `npm test` = `node --test tests/*.test.mjs`; `npm run check` syntax-checks scripts and tests; `npm run lint` (core's ESLint config); `npm run types` (JSDoc via tsc, zero errors); `npm run core:verify`; `npm run ci` all. CI: core's `module-checks.yml@v0.5.2` (keep equal to the lock's version; test).
- Pure and tested: `tests/ranks.test.mjs`, `professions.test.mjs`, `character.test.mjs`, `views.test.mjs` (both windows' HTML, escaping, form readers), `satchel.test.mjs`, `core.test.mjs` (features, settings, module.json, CI pin), `repo.test.mjs` (CSS scoping, UI_CLASSES, no sockets, no actor writes, pure files stay pure).
- Not testable in Node: hooks, windows, settings writes, header buttons, dnd5e labels. List them in the changelog's *Untested in Foundry*.
- Dev tools: eslint 10.13.0 and typescript 7.0.2 (`package-lock.json` committed, same versions as Red Book).

## Release process
1. Bump `version` in `module.json` and `package.json`, and the `download` URL (`.../releases/download/vX.Y.Z/module.zip`); the manifest URL stays `https://github.com/cocoomg11/wanderers-guild/releases/latest/download/module.json`.
2. Add a `CHANGELOG.md` section (`## X.Y.Z`; the release workflow checks it) with an "Untested in Foundry" checklist.
3. Commit and push to main. **Agents never tag or publish.** The user publishes the GitHub release with a tag `vMAJOR.MINOR.PATCH` only; the Release workflow (read-only build job, then an upload job) checks the tag, the changelog, the core pin (`verify --remote`), runs the checks and uploads `module.json` + `module.zip` (`module.json scripts styles lang vendor README.md CHANGELOG.md LICENSE`, minus `vendor/wanderers-core/config/`, `testing/` and `vendor.mjs`). A new top-level folder must be added to the zip step.
4. Keep `compatibility` honest (minimum 13, verified = newest build checked live, no maximum) and the dnd5e `relationships.systems` entry (minimum 6.0.0, verified = last checked live). Optional modules (wayfarers-toolkit, item-piles) in `relationships.recommends`, never `requires`.

## Rules
- Public repo: no campaign names, no game-publisher wording or setting names in user-facing text, code, tests or defaults; no private details (IPs, domains, local paths). Generic wording ("classic MMO" at most). Default rank names stay neutral (Novice, Apprentice, Adept, Expert, Master).
- No official non-SRD rules text or figures. The 2024 crafting time and cost tables are not SRD: never ship them; every number is world data with neutral or SRD 5.2 defaults (SRD 5.2: proficiency bonus by level, item rarities). Never use 5etools or other unofficial rules sites. Verify Foundry APIs at foundryvtt.com/api and dnd5e at github.com/foundryvtt/dnd5e; do not guess an API.
- Every feature toggleable; strings plain English in code (`lang/en.json` stays empty). No macros on hotbars.
- Commit author `cocoomg11 <cocoomg11@users.noreply.github.com>`; end commit messages with the attribution trailers given by the session.
- Another agent may be committing to main: `git fetch origin main` and rebase before pushing.
