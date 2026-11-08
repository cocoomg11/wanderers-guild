# Wanderer's Guild

Professions for dnd5e, built on tool proficiencies. A character has every profession whose tool they are proficient with (no limit), and a profession's rank follows the character's proficiency bonus, from +2 at level 1 to +6. The GM names the professions and the ranks; players see theirs in a Professions window. Characters learn recipes and craft them with the profession's tool check, on crafting rules the GM fills in, and gather resources at nodes on the map, in a scene's area or from defeated creatures.

A [Foundry VTT](https://foundryvtt.com) module (v13 and v14) for the dnd5e system (6.x). What changed in each version: [CHANGELOG](CHANGELOG.md). Version 0.2 adds recipes and crafting, 0.3 gathering and a page on Wanderer's Toolkit's character sheet, 0.4 recipe items and ways to learn recipes.

## Contents

- [Requirements](#requirements)
- [Install](#install)
- [Quick start](#quick-start)
- [Tools](#tools)
- [Settings](#settings)
- [Public API and hooks](#public-api-and-hooks)
- [Data Wanderer's Guild writes](#data-wanderers-guild-writes)
- [Rolls and honesty](#rolls-and-honesty)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

## Requirements

- Foundry VTT 13 or 14 (checked on 14.370).
- The dnd5e system, 6.0 or later (checked on 6.0.6).
- Optional: [Wanderer's Toolkit](https://github.com/cocoomg11/wayfarers-toolkit) (crafting prices can use its three-coin economy) and Item Piles. Neither is needed.

## Install

In Foundry's **Add-on Modules › Install Module**, paste the manifest URL:

`https://github.com/cocoomg11/wanderers-guild/releases/latest/download/module.json`

## Quick start

1. Enable the module in your world (GM).
2. Open **Game Settings › Configure Settings › Wanderer's Guild › Open setup**.
3. On the **Professions** page press **Add starter set** (one plain profession per artisan's tool and the herbalism kit), or **Add profession** to make your own. Link each profession to one or more tools.
4. Open a character's sheet and press the hammer button in its header: the **Professions** window lists what the character has, with the rank and the rank ladder.
5. For crafting: fill in **Crafting rules** from your table's rules (nothing is filled in for you), add **Recipes** (drag the item each one makes onto the editor), then press **Craft** on a crafting profession's card. See [docs/crafting.md](docs/crafting.md).
6. For gathering: give the tiers DCs on the **Gathering** page, a scene a tier (Scene configuration › Table Tools), place nodes (Journal Notes controls › Gathering node), then press **Gather** on a gathering profession's card. See [docs/gathering.md](docs/gathering.md).

<!-- screenshot: the Professions window, two cards and the Other professions list -->

## Tools

| Tool | Who | What it does |
| --- | --- | --- |
| Professions window | owners, observers, GM | One character's professions: a card per crafting or gathering profession (rank, ladder, linked tool, highest rarity, next rank), the other professions as a list, and (switch) the ones not learned yet. Read only. |
| Setup window | GM | Professions (definitions), Ranks (rank names and rarities per proficiency bonus), Recipes, Crafting rules, Settings, Health check, Data (remove the module's data). |
| Sheet button | owners, observers | The hammer button in the header of dnd5e character sheets. |
| Toolkit sheet page | owners, observers | With [Wanderer's Toolkit](https://github.com/cocoomg11/wayfarers-toolkit) 2.3.0 or later and its character sheet on: a **Professions** bookmark on the toolkit's sheet, showing the same cards and buttons as the window. |
| Crafting window | owners (observers look), GM | Per character and profession. **Craft**: recipes with materials have / need from the character's inventory, rank check, tool check and DC, time (for reference only: the calendar is never advanced), cost, and what the craft will use up; Craft rolls the tool check and the active GM's client uses up the materials (on a failure too, by default) and makes the item. **Recipes**: learn (players, when allowed), learn from a carried recipe item, teach and forget (GM). |
| Gather window | owners, GM | Per character and gathering profession: the node within reach, the scene's area, the targeted defeated creature; the check (skill or tool, the DC by node, tier or CR) and what it gives. Gather rolls the check; the active GM's client gives the items. |
| Gathering nodes | GM places, everyone sees | Map notes with a resource, rare resource, tier or DC, uses; players double-click one (their token selected) to gather. Can be hidden from players. |
| Gathering | GM | Setup window page: tiers and DCs, per success, rare margin, reach, area resources, harvesting rows and CR bands; Reset gathering limits; Import / export. |
| Recipes, Crafting rules | GM | Setup window pages: the world's recipes (with *Learned by*, *Taught by item*, *Make recipe item* and *Teach to…*), and every crafting number (empty until you fill them in, including the 0.5 *Better result margin* and *Batches*), each with Import / export JSON. Each recipe can have a *Better result* (extra made and/or a different item) for a roll of the DC plus the margin. |
| Recipe items | GM makes, anyone carries | Items that teach a recipe, like spell scrolls: sold by a merchant or found as loot like any item. A character carrying one presses *Learn from item* (Recipes page, Professions window or the toolkit page); one is used up unless the GM set it to keep. |

How it works, in detail: [docs/professions.md](docs/professions.md), [docs/crafting.md](docs/crafting.md) and [docs/gathering.md](docs/gathering.md).

## Settings

Feature switches (Game Settings › Wanderer's Guild; each reloads Foundry):

| Setting | Default | Off means |
| --- | --- | --- |
| Feature: Professions | on | no windows, no setup menu, `api.open` / `api.setup` / `api.definitions` / `api.professionsOf` are undefined |
| Feature: Sheet button | on | no header button on character sheets (also off when Professions is off) |
| Feature: Gathering | on | no Gather buttons, window, nodes (control, look, double-click), scene tier field, Gathering page, gathering requests or journey listener; `api.gathering` is undefined (also off when Professions is off) |
| Feature: Toolkit sheet page | on | no Professions page on Wanderer's Toolkit's character sheet (the window and header button stay) |
| Feature: Crafting | on | no Craft or Recipes buttons, no Crafting window, no Recipes or Crafting rules pages, no crafting requests or chat card buttons; `api.crafting` is undefined (also off when Professions is off) |

On the setup window's **Settings** page (instant):

| Setting | Default | What it does |
| --- | --- | --- |
| Show professions not learned yet | on | The Professions window also lists the world's other professions and the tool each one needs. |
| Players learn recipes themselves | on | A player can learn a recipe of their profession that their rank allows. Off: only a GM teaches. |
| Recipes not known yet | Show | **Show**: a player's Recipes page lists every recipe of the profession, greyed, with how to get it (*Learn*, *Needs a recipe item*, *Ask your GM*). **Hide**: players see only the recipes they know (and the ones a recipe item they carry teaches). Display only: the recipes are a world setting every client receives, so Hide keeps them off the page, not secret. |
| GM approves each craft | off | After the tool check a GM card with Approve / Refuse decides; nothing is made or used up until then. Off: the craft resolves when the roll lands and nothing waits for a GM (a craft with no DC succeeds on the roll). |
| Prices in the world's coins | off | Prices in Wanderer's Toolkit's coins (when it is active), paid through the toolkit. Off: book values. |
| One gather per node until reset | on | A character gathers once per node (and per scene's area) until the GM resets the limits or the party travels with Wanderer's Toolkit. |
| Gather without a node | on | Gathering in a scene's area (its tier's DC) when no node is in reach. |
| Travel resets gathering limits | on | A Wanderer's Toolkit journey (hex travel or a flight) resets the limits. |
| Debug logging | off | Writes the module's decisions to the browser console. |

## Public API and hooks

`const guild = game.modules.get("wanderers-guild").api;` (set in our `init` hook).

| Member | | What it does |
| --- | --- | --- |
| `version` | stable | The installed version. |
| `open(actor?)` | experimental | Opens the Professions window for an Actor (or its id or UUID); without one, your assigned character or the selected token's actor. Returns the window, or undefined. |
| `professionsOf(actor)` | experimental | The model the window draws (`{ name, subtitle, cards, others, unlearned, … }`), read only; undefined when you can't observe the actor. |
| `setup(page?)` | experimental | Opens the GM setup window, on `"professions"`, `"ranks"`, `"recipes"`, `"crafting"`, `"settings"`, `"health"` or `"data"`. GM only. |
| `definitions` | experimental | `{ professions(), ranks() }`: the world's definitions and rank table, normalized. |
| `health({ timeoutMs }?)` | stable | Read-only report: `[{ title, lines: [{ level, text, fix? }] }]`, `level` is `ok`, `warn`, `bad`, `off` or `info`. GM only (players get `[]`). |
| `cleanup` | stable | `{ plan(), dryRun(), remove(pick, "REMOVE") }`: counts what the module stored; removes the picked categories (`professions`, `ranks`, `recipes`, `rules`, `known`, `recipeItems`, `gathering`, `nodes`, `gathered`, `harvested`, `cards`, `settings`) after the word REMOVE (GM). |
| `crafting` | experimental | `{ open(actor, professionId, mode?), recipes(), rules(), known(actor), assess(actor, recipeId, { batch }?), learn(actor, recipeId), forget(actor, recipeId), learnFromItem(actor, item), recipeItems(actor), teachTo(recipeId, actors), makeRecipeItem(recipeId) }`: opens the Crafting window (`mode` `"craft"` or `"recipes"`); the world's recipes and crafting rules (normalized, read only); a character's known recipes and one recipe's assessment (what the window shows; `batch` = how many in one go, clamped to the rules' *Batches*, default 1) when you can observe it; asks the active GM's client to learn (the same checks as the Learn button) or forget (GM) a recipe, returning whether the request was sent; `learnFromItem` asks to learn from a recipe item the actor carries (an Item or its UUID; the GM's client reads the recipe from the item); `recipeItems` lists the actor's recipe items with what each teaches and whether it can be used; GM: `teachTo` teaches one recipe to several characters, `makeRecipeItem` creates a "Recipe: X" world item. Undefined when *Feature: Crafting* is off. |
| `gathering` | experimental | `{ open(actor, professionId?), rules(), nodes(scene?), assess(actor, professionId, { note } \| { scene } \| { token }, { days }?), place(), resetLimits() }`: opens the Gather window; the gathering rules (normalized); a scene's nodes (`[{ id, uuid, node }]`, hidden ones for GMs only); one gather's assessment (DC, problems, what it gives; `days` = days in the journey stage, 1–30, default 1); GM: arm a click to place a node, reset every limit. Undefined when *Feature: Gathering* is off. |
| `isReady` | stable | Whether our ready hook ran. |
| `features` | experimental | The feature registry (`FEATURES`, `on(id)`, `list()`). |

`open`, `professionsOf`, `setup` and `definitions` are undefined when *Feature: Professions* is off.

**Hooks**

- `wanderers-guild.ready` (stable): fired once, with the api, in our `ready` hook.
- `wanderers-guild.gathered` (experimental): fired on the active GM's client after a gather check is resolved, ids only: `{ actorId, professionId, kind, success, rare, messageId }` (`kind` is `node`, `area` or `creature`). Not fired when the gather was refused.
- `wanderers-guild.learned` (experimental): fired on the active GM's client after a character learns a recipe, ids only: `{ actorId, recipeId, source }` (`source` is `rank` (the player's Learn), `item` (a recipe item) or `gm` (Teach, Teach to…)).
- `wanderers-guild.crafted` (experimental): fired on the active GM's client after a craft is decided, with ids only: `{ actorId, recipeId, success, better, batch, messageId }` (the chat card; `better` (0.5) = the roll made the recipe's better result, `batch` (0.5) = how many were crafted in one check). Not fired for refused crafts or errors.

Stable members keep their name and shape within a major version; experimental ones may change in any release.

With Wanderer's Toolkit 2.3.0 or later (its character sheet on) and *Feature: Toolkit sheet page* on, each client adds the page `wanderers-guild.professions` (order 85, between the toolkit's Bastion and Special traits) through the toolkit's `api.sheet.registerPage`, at our ready or on its `wayfarers-toolkit.sheetReady` hook. Nothing is stored for it.

With the Wanderer's Satchel installed, the module registers itself there (Open = the setup window, its health check, its Debug logging switch).

## Data Wanderer's Guild writes

- World settings under `wanderers-guild.*`: the feature switches, the switches above, `professionList` (the definitions, at most 100), `rankTable` (at most 12 rows), `recipeBook` (the recipes, at most 300), `craftRules`, `gatherRules` (at most 12 tiers, 12 CR bands, 60 harvesting rows, 100 area rows) and `gatherReset`. Every client reads these, so they hold nothing secret: notes on a profession or recipe are shown to players.
- A client setting, `windowPlacement` (where this browser last left the windows).
- On characters: `flags.wanderers-guild.recipes` (known recipe ids, at most 200), written only by the active GM's client. A character's professions are still worked out from its tool proficiencies each time.
- Recipe items: `flags.wanderers-guild.teaches` (`{ v, recipe, consume }`) on items, set by the GM on world items (copies carry it); a used-up recipe item is lowered or deleted by the active GM's client. Learn cards are chat messages with `flags.wanderers-guild.learn`.
- Gathering: scenes' `flags.wanderers-guild.tier`; nodes are map notes with `flags.wanderers-guild.node`; characters' `flags.wanderers-guild.gathered` (at most 100 limit marks); creature tokens' `flags.wanderers-guild.harvested`; gather cards (`flags.wanderers-guild.gather`) and `gatherRoll` marks on rolls. Gathered items are added by the active GM's client.
- Crafting changes the character's items (the crafted item, the materials used up) and coin, through the active GM's client.
- Chat: craft cards and short notices (`flags.wanderers-guild.craft` / `.notice`) and a mark on tool check rolls used for a craft (`flags.wanderers-guild.craftRoll` / `.rollUsed`).

Removing it: the setup window's **Data** page, or `api.cleanup` (a dry-run `plan()`, then `remove({ professions: true, ranks: true, recipes: true, rules: true, known: true, recipeItems: true, gathering: true, nodes: true, gathered: true, harvested: true, cards: true, settings: true }, "REMOVE")`). Crafted and gathered items stay: they are ordinary items. Recipe items stay too (only the mark that makes them teach goes).

## Rolls and honesty

Crafting and gathering checks are rolled on the player's client with dnd5e's own roll; only the roll's chat message id is sent to the active GM's client, which does every write. That client checks the message before using it: the sender wrote it, it was made for this character and this craft or gather, it is at most 10 minutes old, it wasn't used before (a mark on the message and a list kept in the GM client's memory, so unsetting the mark doesn't replay a roll), and, for a player's roll, it has one d20 with one kept result from 1 to 20, every other die in it is a dice bonus the character has for that check (an effect's 1d4 such as Guidance, on the skill, the tool, the ability's checks or all checks) with a result in range, and the total minus those dice is the character's own flat skill or tool bonus, as the GM's client works both out from the character's data the way dnd5e builds the roll. A situational bonus or a die typed in the roll dialog, proficiency dice or another ability can't be checked that way, so such a roll is refused with the reason (for crafting with *GM approves each craft* on, it goes to the GM's card with the reason instead). A player's *Days in this stage* is capped at the last journey's days (1 without one).

What stays on the honor system: the dice faces (the d20 and any bonus die). A player's browser makes the roll, so a determined player can still write any result from 1 to 20 (or any in-range result on a bonus die) into their own message. Advantage and disadvantage aren't checked either (the kept die counts). If that matters at your table, turn on *GM approves each craft*, and roll gathering checks in view of the table. A GM's own rolls and days are taken as sent.

## Troubleshooting

- **A character shows no professions.** It needs proficiency (not half proficiency) with one of a profession's linked tools; check the character's Tools on the dnd5e sheet and the links on the setup window's Professions page.
- **The rank looks wrong.** The rank is the proficiency bonus the dnd5e sheet shows (effects that change it change the rank too). The rank names and rarities are on the setup window's Ranks page.
- **Craft is greyed out.** The line next to it says why: the recipe is unknown, the rank is too low, materials or coin are missing, or no GM is connected.
- **No Learn button.** The recipe's *Learned by* is *Recipe item* (the row says *Needs a recipe item*) or *GM only* (*Ask your GM*), or *Players learn recipes themselves* is off. A recipe item above the character's rank says what rank it needs and stays in the inventory.
- **A recipe item does nothing.** It must be in the character's own inventory, its recipe must still exist and not be *GM only*; the health check lists recipe items whose recipe is gone.
- **No better result / no How many box.** Both are off until you set *Better result margin* and *Batches* on the Crafting rules page; a better result also needs a DC and a *Better result* on the recipe.
- **Every craft succeeds.** No DC is set, so the roll crafts it: give the recipe a DC, or fill in a base DC or the rarity table on the Crafting rules page.
- **Every craft waits for the GM.** *GM approves each craft* is on (setup › Settings); turn it off to resolve crafts on the roll.
- **The time says "not set".** Fill in the time rules on the Crafting rules page (or the recipe's own time). The time is only shown; the calendar never moves.
- **Gather is greyed out.** The line under the option says why: too far from the node (Reach), already gathered here, the node is used up, the creature isn't defeated or was harvested, or no GM is connected.
- **"The roll's bonus isn't the character's".** The roll had a situational bonus (or the sheet changed since): roll again without one. Proficiency dice, a die typed in the roll dialog and a changed ability are refused the same way; a dice bonus from an effect on the character (e.g. 1d4) is fine.
- **Players don't see nodes.** Map notes must be shown in their browser (Journal Notes controls › Toggle notes), and the node must not be hidden.
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
