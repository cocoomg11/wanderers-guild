# Wanderer's Guild

Professions for dnd5e, built on tool proficiencies. A character has every profession whose tool they are proficient with (no limit), and a profession's rank follows the character's proficiency bonus, from +2 at level 1 to +6. The GM names the professions and the ranks; players see theirs in a Professions window.

A [Foundry VTT](https://foundryvtt.com) module (v13 and v14) for the dnd5e system (6.x). What changed in each version: [CHANGELOG](CHANGELOG.md). Version 0.1 is the first slice: professions and ranks. Crafting, recipes and gathering come in later versions (their buttons are placeholders for now).

## Contents

- [Requirements](#requirements)
- [Install](#install)
- [Quick start](#quick-start)
- [Tools](#tools)
- [Settings](#settings)
- [Public API and hooks](#public-api-and-hooks)
- [Data Wanderer's Guild writes](#data-wanderers-guild-writes)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

## Requirements

- Foundry VTT 13 or 14 (checked on 14.370).
- The dnd5e system, 6.0 or later (checked on 6.0.6).
- Optional: [Wanderer's Toolkit](https://github.com/cocoomg11/wayfarers-toolkit) (a later version uses its three-coin economy for prices) and Item Piles. Neither is needed.

## Install

In Foundry's **Add-on Modules › Install Module**, paste the manifest URL:

`https://github.com/cocoomg11/wanderers-guild/releases/latest/download/module.json`

## Quick start

1. Enable the module in your world (GM).
2. Open **Game Settings › Configure Settings › Wanderer's Guild › Open setup**.
3. On the **Professions** page press **Add starter set** (one plain profession per artisan's tool and the herbalism kit), or **Add profession** to make your own. Link each profession to one or more tools.
4. Open a character's sheet and press the hammer button in its header: the **Professions** window lists what the character has, with the rank and the rank ladder.

<!-- screenshot: the Professions window, two cards and the Other professions list -->

## Tools

| Tool | Who | What it does |
| --- | --- | --- |
| Professions window | owners, observers, GM | One character's professions: a card per crafting or gathering profession (rank, ladder, linked tool, highest rarity, next rank), the other professions as a list, and (switch) the ones not learned yet. Read only. |
| Setup window | GM | Professions (definitions), Ranks (rank names and rarities per proficiency bonus), Settings, Health check, Data (remove the module's data). |
| Sheet button | owners, observers | The hammer button in the header of dnd5e character sheets. |

How it works, in detail: [docs/professions.md](docs/professions.md).

## Settings

Feature switches (Game Settings › Wanderer's Guild; each reloads Foundry):

| Setting | Default | Off means |
| --- | --- | --- |
| Feature: Professions | on | no windows, no setup menu, `api.open` / `api.setup` / `api.definitions` / `api.professionsOf` are undefined |
| Feature: Sheet button | on | no header button on character sheets (also off when Professions is off) |

On the setup window's **Settings** page (instant):

| Setting | Default | What it does |
| --- | --- | --- |
| Show professions not learned yet | on | The Professions window also lists the world's other professions and the tool each one needs. |
| Debug logging | off | Writes the module's decisions to the browser console. |

## Public API and hooks

`const guild = game.modules.get("wanderers-guild").api;` (set in our `init` hook).

| Member | | What it does |
| --- | --- | --- |
| `version` | stable | The installed version. |
| `open(actor?)` | experimental | Opens the Professions window for an Actor (or its id or UUID); without one, your assigned character or the selected token's actor. Returns the window, or undefined. |
| `professionsOf(actor)` | experimental | The model the window draws (`{ name, subtitle, cards, others, unlearned, … }`), read only; undefined when you can't observe the actor. |
| `setup(page?)` | experimental | Opens the GM setup window, on `"professions"`, `"ranks"`, `"settings"`, `"health"` or `"data"`. GM only. |
| `definitions` | experimental | `{ professions(), ranks() }`: the world's definitions and rank table, normalized. |
| `health({ timeoutMs }?)` | stable | Read-only report: `[{ title, lines: [{ level, text, fix? }] }]`, `level` is `ok`, `warn`, `bad`, `off` or `info`. GM only (players get `[]`). |
| `cleanup` | stable | `{ plan(), dryRun(), remove(pick, "REMOVE") }`: counts what the module stored; removes the picked categories (`professions`, `ranks`, `settings`) after the word REMOVE (GM). |
| `isReady` | stable | Whether our ready hook ran. |
| `features` | experimental | The feature registry (`FEATURES`, `on(id)`, `list()`). |

`open`, `professionsOf`, `setup` and `definitions` are undefined when *Feature: Professions* is off.

**Hook** `wanderers-guild.ready` (stable): fired once, with the api, in our `ready` hook.

Stable members keep their name and shape within a major version; experimental ones may change in any release.

With the Wanderer's Satchel installed, the module registers itself there (Open = the setup window, its health check, its Debug logging switch).

## Data Wanderer's Guild writes

- World settings under `wanderers-guild.*`: the feature switches, the switches above, `professionList` (the definitions, at most 100) and `rankTable` (at most 12 rows). Every client reads these, so they hold nothing secret: notes on a profession are shown to players.
- A client setting, `windowPlacement` (where this browser last left the windows).
- Nothing on actors, items, scenes, journals or chat messages: a character's professions are worked out from its tool proficiencies each time.

Removing it: the setup window's **Data** page, or `api.cleanup` (a dry-run `plan()`, then `remove({ professions: true, ranks: true, settings: true }, "REMOVE")`).

## Troubleshooting

- **A character shows no professions.** It needs proficiency (not half proficiency) with one of a profession's linked tools; check the character's Tools on the dnd5e sheet and the links on the setup window's Professions page.
- **The rank looks wrong.** The rank is the proficiency bonus the dnd5e sheet shows (effects that change it change the rank too). The rank names and rarities are on the setup window's Ranks page.
- **Something else.** Run the setup window's **Health** page and look for warnings.

## Development

```
npm ci             # once: ESLint and TypeScript for the checks
npm test           # unit tests (Node's built-in runner)
npm run check      # syntax check
npm run lint       # core's shared ESLint config
npm run types      # JSDoc type check
npm run core:verify  # vendored wanderers-core matches its pin
npm run ci         # all of the above
```

Shared code and the shared window look come from [wanderers-core](https://github.com/cocoomg11/wanderers-core), vendored in `vendor/wanderers-core/` (never edited by hand; update with `node vendor/wanderers-core/vendor.mjs update X.Y.Z`). Conventions for contributors and agents are in [CLAUDE.md](CLAUDE.md).

## License

MIT. See [LICENSE](LICENSE).
