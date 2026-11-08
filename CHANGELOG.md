# Changelog

All notable changes to Wanderer's Guild. Versions follow the `version` in `module.json`.

## 0.5.2 (2026-11-08)

Fixes from the live test of 0.5.1.

### Fixed

- **Fix buttons on the setup window's Health page.** Health lines with a fix (*Stamp recipe items*, *Add starter set*) now have a button there too, not only in Wanderer's Satchel. A click asks first, runs once (a double-click opens one dialog), then the check runs again.
- **Approve with a lowered batch shows the right time.** When *Batches* was lowered between the roll and the GM's Approve, the card kept the time of the batch first asked for; it now shows the time of the batch made.
- **Better-result card header.** When the better item was made, the card's header shows that item (name, picture, rarity colour) instead of the recipe's normal item.
- **Teach to… lists characters only.** Item Piles piles and merchants (which can be character-type actors) are no longer offered.
- **Coin cost and a short purse.** If Wanderer's Toolkit's `pay` refuses (2.3.2+ returns false and takes nothing), the craft now reports it instead of carrying on as paid.

### Changed (docs)

- **Coin costs are paid through the toolkit whenever it is active.** This is intended: a recipe's coin cost is gold pieces of the world's coins (that is how the amount is worked out), so it goes through the toolkit's `pay` and shows in its coin log whether or not *Prices in the world's coins* is on. The switch only changes how item prices are shown. The setting hint, README and docs/crafting.md now say so.
- README *Recipe items and honesty*: copies dragged from the Items sidebar onto a sheet and Item Piles purchases leave Foundry's `_stats.compendiumSource` / `_stats.duplicateSource` empty, so only the mark's `src` carries the source; a player can set `_stats.compendiumSource` on their own item from the console (Foundry 14.370 accepts it), which helps no more than copying `src`.

### Under the hood

- setup-view.mjs `fixAt`, `fixNotice`, `healthPage({ report, busy, fixed })`; setup.mjs `#healthFix` (action `healthFix`). craft-model.mjs `assessedState(a, rules)` (batch, betterAt, timeText), used by craft-leader.mjs `finish`. learn-model.mjs `teachable(actor)` (reads Item Piles' `flags.item-piles.data.enabled`, read only). Card view `betterRarity`.
- Tests: `tests/v052.test.mjs` (version asserts moved here).

### Untested in Foundry

Check on Foundry 14.370 with dnd5e 6.0.6, Item Piles 3.3.4 and Wanderer's Toolkit, as the GM (and a player where noted):

- [ ] Setup › Health with an unstamped world recipe item: *Stamp recipe items* button, confirm, the line goes away after the re-check; a double-click opens one dialog. Without the Satchel active too.
- [ ] *GM approves each craft*, batch 3, lower *Batches* to 2, Approve: the card's Time is the batch-2 time.
- [ ] A better result with a different item: the card header shows that item's name, picture and colour; a normal success still shows the recipe's item.
- [ ] Teach to… with an Item Piles pile or merchant in the world: not listed; characters are.
- [ ] A craft with a coin cost in a three-coin world, *Prices in the world's coins* off: the right amount leaves the purse and the coin log has the entry (as before).

## 0.5.1 (2026-11-08)

Fixes before release. 0.4.0 and 0.5.0 were not published on their own: this release brings recipe learning and recipe items (0.4.0), better results and batches (0.5.0) and these fixes.

### Fixed

- **Learning is queued per character.** Learn, Teach and Forget now wait their turn with crafts and *Learn from item* for the same character, so two quick clicks can't each read the old list and drop one recipe.
- **Recipe items are checked against where they came from.** A player's recipe item teaches only when it is a copy of a recipe item the GM marked: a world item no player owns, or an item in a compendium no player can edit, whose own mark teaches the same recipe (its *keep / use up* choice applies, not the copy's). Otherwise the player gets a short notice saying why and nothing is learned. Marking an item (*Taught by item*, the keep switch) and *Make recipe item* write the world item's own UUID into the mark (`teaches.src`); copies keep it, including Item Piles purchases (they copy the item's data, flags included) and drags to a sheet. Foundry's own source fields (`_stats.compendiumSource`, `_stats.duplicateSource`, legacy `flags.core.sourceId`) count too. GMs learning from an item aren't checked.
- New setting **Trust recipe items without a source** (setup › Settings, default off): for GMs who make recipe items directly on characters. The hint, README (*Recipe items and honesty*) and health say plainly what's left: a player who edits their own items from the console can still copy a real recipe item's mark.
- *GM approves each craft*: Approve clamps the card's stored batch to the rules' *Batches* again before assessing (it was safe through `assess`, now guarded at the call too).

### Added

- Health: recipe items in the Items sidebar not stamped as a source yet (marked in a pre-release build), with a **Stamp recipe items** fix (GM click, confirm); which recipe item rule applies (info); a recipe whose better result is rarer than the recipe (warn; allowed on purpose, see docs/crafting.md).

### Under the hood

- learn-model.mjs: `teaches.src` (optional, no version bump; only world or compendium item UUIDs), `teachesFlag(recipe, consume, src)`, `SOURCE_RE`, `parseSource`, `sourceRefs`, `verifyTeaches`, `unstampedItems`; `recipeItemData(..., id)` (created with `keepId`). craft-leader.mjs: `teachingSources` reads sources from `game.items` and one `pack.getIndex({ fields: ["flags.wanderers-guild.teaches"] })` per pack (no `fromUuid`); player-editable = any non-GM user with OWNER on the item or the pack. learn-gm.mjs `stampSources()`.
- The better result card hint still shows the margin stored when the roll was made; the outcome uses the rules at resolve time (cosmetic, left as is).
- Tests: `tests/v051.test.mjs`.

### Untested in Foundry

Check on Foundry 14.370 with dnd5e 6.0.6 and Item Piles 3.3.4, as a player and as the GM:

- [ ] Two quick Learn clicks on two recipes for one character: both are known afterwards. Learn racing *Learn from item*: both kept.
- [ ] *Make recipe item*: the new world item's mark has `src` = its own UUID (`item.flags["wanderers-guild"].teaches`).
- [ ] Drag that item onto a character: *Learn from item* works for the player. Check what the copy's `_stats.duplicateSource` / `compendiumSource` hold.
- [ ] Put the item in an Item Piles merchant, buy it as a player: the bought copy keeps `teaches.src` and teaches.
- [ ] Console as the player: `item.setFlag("wanderers-guild", "teaches", { recipe: "<other>" })` on a carried item, then *Learn from item*: refused ("doesn't match the recipe item it was copied from"). Also on a plain item with no source: refused ("can't be found"). Turn on *Trust recipe items without a source*: both learn.
- [ ] Console as the player: try `item.update({ "_stats.compendiumSource": "<a real recipe item uuid>" })`: note whether Foundry accepts it (documents how strong the source check is).
- [ ] Copy set to *Kept after learning* by the player while the world item uses up: one is used up.
- [ ] A world recipe item put in a world compendium, deleted from the Items sidebar, a copy dragged from the compendium: still teaches (via `compendiumSource`).
- [ ] A world recipe item owned by a player (Ownership: Owner): its copies are refused ("can be edited by a player").
- [ ] Health: a world item marked with the 0.4/0.5 builds (no `src`) shows *not stamped as a source yet*; *Stamp recipe items* fixes it.
- [ ] Health: a recipe with a better result rarer than the recipe shows the warning.
- [ ] *GM approves each craft* with a batch: Approve makes the batch (clamped if *Batches* was lowered).
- [ ] Everything on the 0.4.0 and 0.5.0 lists below.

### Release notes (0.4.0 to 0.5.1)

Ready to paste into the GitHub release:

> **Recipes: learning, recipe items, better results and batches.**
> - Each recipe is *Learned by* rank (players learn it themselves), a recipe item, or the GM only. GMs can teach a recipe to several characters at once.
> - Recipe items work like spell scrolls: mark an item or press *Make recipe item*, sell it from a merchant or drop it as loot; a character carrying it presses *Learn from item*. A player's copy must come from a recipe item the GM marked (partly an honor system; see the README).
> - *Recipes not known yet*: show them greyed with how to get each, or hide them.
> - A learn card and the `wanderers-guild.learned` hook.
> - Better results: a roll of the DC plus your margin makes extra items or a different item.
> - Batches: craft several in one check (materials, time and cost multiplied).
> - Every number is yours to set: nothing ships with rulebook figures.

## 0.5.0 (2026-11-08)

Craft outcomes and batches: a better result for a high roll, and crafting several in one check. Both are off until the GM sets a number (no figures ship).

### Added

- **Better result** (Crafting rules › *Better result margin*, and per recipe in the editor's *Better result* box): *Extra made* (more of the normal item) and/or a different item dropped on the box, made instead of the normal one. A success that reaches the DC plus the margin makes it; the card says *Better result*. No DC, no margin or a recipe without one: never.
- **Batches** (Crafting rules › *Batches*: the most in one batch): the Craft page gets **How many**. One tool check for the batch; materials, coin cost and time × the batch; the notice next to Craft lists the multiplied use-up (*A batch of 3 uses up: 9× Bar …*). A failure uses up the batch's materials per *On a failed check*. A better roll applies to every craft in the batch ((quantity + extra) × batch, of the better item when set).
- The Craft page's Requirements box shows the better result and the roll it needs; Materials show "(N each)" for a batch.
- Health: better result items that can't be found (warn), *Better results* and *Batches* state (info), a better result that is the normal item with no extra (warn).
- API: `crafting.assess(actor, recipeId, { batch })`. Hook `wanderers-guild.crafted` adds `better` and `batch`.

### Changed

- `recipeBook` is version 3 (each recipe has `better` `{ qty, uuid, name, img, type, rarity }`; version 2 and 1 read with none); `craftRules` is version 2 (`betterMargin`, `batchMax`; version 1 reads with both off). Old Import / export files still import.
- The `craft` request takes an optional `qty` (whole number 1–50, missing = 1); the active GM's client cuts it to the rules' *Batches* (never raises it) and assesses again with it. Craft cards store `batch`, `betterAt` and `better` (missing = 1 / none).

### Under the hood

- craft-model.mjs: `clampBatch`, `assess({ batch })` (materials `need` = per-craft × batch, plus `each`; hours, cost and charge × batch; `makes`, `batch`, `batchMax`, `betterAt`), `isBetter`, `resultPlan`, `betterText`, `craftedPayload`; `usedList(materials, times)`; `usesNotice({ batch })`. recipes-model.mjs: `cleanBetter`, `noBetter`, `hasBetter`.
- The leader decides a better result only from the roll it read and its own assessment (never a payload field); roll verification is unchanged.
- No skill-ups and no trainers (not in scope).

### Untested in Foundry

Check on Foundry 14.370 with dnd5e 6.0.6, as a player and as the GM:

- [ ] A world from 0.4: recipes and rules load unchanged; the editor shows an empty *Better result*; the rules page shows empty *Better result margin* and *Batches*; no *How many* on the Craft page.
- [ ] Recipe editor: drop an item on *Better result*: its name, rarity and type show; Save; reopen: kept. *Refresh from items* refreshes it too. Clear the UUID: the normal item again.
- [ ] Margin 5, DC 12, a recipe with *Extra made* 1: a roll of 17+ makes quantity + 1 and the card says *Better result*; 12–16 makes the normal quantity; under 12 fails.
- [ ] Same with a better item: the better item is made instead (a stack of a consumable or loot grows; else a new item), card shows its name and picture.
- [ ] No DC anywhere: never a better result; the Requirements row says "needs a DC".
- [ ] *Batches* 4: *How many* 1–4; 3 multiplies the materials, the notice, the time and the coin cost; Craft disabled when the materials don't cover the batch.
- [ ] Batch of 3 success: 3 × quantity made, 3 × materials used, 3 × coin paid (with *Take it from the crafter's coin*). Batch failure with *Used up*: 3 × materials gone; with *Kept*: nothing.
- [ ] Lower *Batches* to 2 while a player's window shows 3 and they craft: the GM's client makes 2 and uses up 2 (card *2 in one check*).
- [ ] A batch of a weapon: one item with quantity N.
- [ ] *GM approves each craft* on: the pending card says "better result on N"; Approve makes the better result when the roll reached it; the batch is kept.
- [ ] A player's roll is still checked (situational bonus refused) with batches and better results on.
- [ ] Health: delete the better item: *Better result item not found* (warn); a better roll then errors with nothing used up.
- [ ] `wanderers-guild.crafted` carries `better` and `batch`.

## 0.4.0 (2026-11-08)

Recipe discovery and learning: three ways to learn a recipe, recipe items, teaching several characters at once, and a learn card.

### Added

- **Learned by** on each recipe (setup › Recipes › editor): *Rank* (players learn it themselves on the Recipes page when their rank allows, as before; the default for new recipes and for every recipe saved before 0.4), *Recipe item* (only by using a recipe item, or a GM teaching it) or *GM only*. A GM can always teach any recipe.
- **Recipe items**, like spell scrolls: in the recipe editor drop an item from the Items sidebar on *Taught by item*, or press *Make recipe item* (a new loot item "Recipe: X" with the recipe's rarity). Copies of the item (a merchant's stock, loot, an inventory) teach too, so a recipe is bought by buying its item. A character carrying one sees **Learn from item** on the Crafting window's Recipes page and in a *Recipe items* box on the Professions window and the toolkit sheet page. Rank still applies (an item above the character's rank says "needs Adept +4" and stays in the inventory). Learning uses one item up unless the GM ticked *Kept after learning*.
- **Teach to…** on setup › Recipes: teach one recipe to several characters at once (one Teach per character, as the GM).
- **Recipes not known yet** (setup › Settings): *Show* (default: every recipe, greyed, with how to get it: *Learn*, *Needs a recipe item*, *Ask your GM*) or *Hide* (players see only the recipes they know, and the ones a recipe item they carry teaches). Display only: the recipes are a world setting every client receives.
- The Recipes page's groups: *Known*, *Can learn*, *Needs a higher rank*, *Needs a recipe item*, *Ask your GM*.
- A **learn card**, whispered to the player and the GMs: "Maren learned Plain Blade" (from a recipe item / from the GM).
- Hook `wanderers-guild.learned` `{ actorId, recipeId, source }` (experimental; `source` is `rank`, `item` or `gm`), on the active GM's client.
- API (experimental): `crafting.learnFromItem(actor, item)`, `crafting.recipeItems(actor)`, GM `crafting.teachTo(recipeId, actors)` and `crafting.makeRecipeItem(recipeId)`.
- Health: recipe items whose recipe no longer exists (warn), recipe items for a GM-only recipe (warn), *Recipe item* recipes that no item teaches (warn), a count of recipe items (info), the *Recipes not known yet* choice (info).
- Remove data: category *Recipe items* (removes the mark from world items and characters' items; the items stay). Learn cards are removed with the other cards.

### Changed

- `recipeBook` is version 2 (each recipe has `learn`); version 1 reads as *Rank*, and the Import box accepts version 1 and 2.
- The `learnRecipe` request is refused for a player when the recipe is *Recipe item* or *GM only*.

### Under the hood

- `learn-model.mjs` (pure): `assessLearn(facts, recipe, via)` is the one decision for the window and the active GM's client; the `teaches` item flag (`{ v: 1, recipe, consume }`), `itemOnActor`, `useUpPlan`, `learnState`, `visibleRows`, health lines, the made item's data, the card flag and hook payload.
- New request `learnFromItem` `{ actor, item }`: the sender must own the actor, the item must be embedded on that actor (its UUID starts with the actor's), the active GM's client reads the recipe from the item's stored flag (never a recipe id from the payload), checks again, learns, then lowers or deletes the item; one at a time per character (with crafts).
- `learn-gm.mjs`: the GM's world-item flag writes (GM clicks only); a repo test pins it to world items.
- No trainers (no NPC trainer flag, request or reach); skill-ups, batch crafting and better results are not in this release.

### Untested in Foundry

Check on Foundry 14.370 with dnd5e 6.0.6, as a player and as the GM:

- [ ] A recipe saved before 0.4 shows *Learned by: Rank* in the editor; a player's Learn still works.
- [ ] *Learned by: Recipe item*: a player's row says *Needs a recipe item*, no Learn button; the GM's Teach works. *GM only*: *Ask your GM*.
- [ ] Drop a world item on *Taught by item*: it is listed; untick/tick *Kept after learning*; Remove takes the mark off (the item stays). Drop a compendium item: refused with "import a compendium item first".
- [ ] *Make recipe item*: "Recipe: X" appears in the Items sidebar (loot, book icon, recipe's rarity, description).
- [ ] Give a player the recipe item (drag to their sheet, buy it from an Item Piles merchant): *Learn from item* on the Recipes page and in the Professions window's *Recipe items* box (and the toolkit sheet page); pressing it learns the recipe, the stack goes down by one (or the item is deleted), the learn card is whispered to the player and the GMs, the hook fires on the GM client.
- [ ] A kept recipe item stays after learning; a second character can learn from it after it is handed over.
- [ ] A recipe item above the character's rank: "needs <rank>", no button, stays in the inventory.
- [ ] **Spoofing**: as a player, in the console, send `learnFromItem` with your own actor and another actor's recipe item UUID (`game.modules.get("wanderers-guild").api.crafting.learnFromItem(game.user.character, "<other actor uuid>.Item.<id>")`): refused "That item isn't in this character's inventory", nothing learned, nothing used up. Same with a world item's UUID, and with another player's actor as `actor` (refused silently: not the owner).
- [ ] Two quick presses of *Learn from item* on a one-item stack: learned once, one item used.
- [ ] *Teach to…*: the dialog lists the characters (known ones ticked and greyed); Teach sends one learn per ticked character; cards posted.
- [ ] *Recipes not known yet* = Hide: a player's Recipes and Craft pages list only known recipes (plus recipe items they carry); the GM still sees all. Show: greyed rows with how to get each.
- [ ] Health: recipe item for a deleted recipe, *Recipe item* recipe with no item, the count.
- [ ] Remove data › Recipe items: the mark is removed from world and carried items; learn cards removed with *cards*.

## 0.3.3 (2026-11-07)

### Fixed

- **A player's roll with an effect's dice bonus was refused** ("more than one die"), e.g. a 1d4 from Guidance or a similar effect. The GM's client now works out the character's check bonus the way dnd5e 6.0.6 builds the roll (`_buildSkillToolConfig`): ability modifier, flat proficiency, the `roll.bonus` fields of `abilities.<ability>.check`, `rolls.ability.check`, `rolls.ability.<skill|tool>` and `<skills|tools>.<key>` with dnd5e's check rules, and condition reductions, resolved against the character's roll data and split into a flat part and dice terms. A roll is accepted when it has one d20 (one kept result 1–20), every other die matches one of those dice bonuses (same count and faces, every result within range), every bonus die is there, and the total minus the d20 and the bonus dice equals the flat part. A die or a situational bonus typed in the roll dialog is still refused, and so are proficiency dice and a changed ability. A bonus formula that isn't plain dice and numbers (dice inside a function, a multiplied die) is refused with the reason.
- The check bonus is no longer read from the sheet's prepared `total`, which dnd5e computes without non-deterministic bonuses (a "2 + 1d4" bonus counted as 0); `total` stays the fallback when dnd5e's parts can't be read.

### Untested in Foundry

Check on Foundry 14.370 with dnd5e 6.0.6, as a player:

- [ ] Guidance (cast on the gatherer for the gathering skill) then Gather: accepted; card total = d20 + 1d4 + bonus.
- [ ] An effect adding `1d4` to `system.rolls.ability.check.bonus` (all checks, Bless-like), then a craft (tool check): accepted. Same with the bonus on `system.tools.<tool>.roll.bonus`.
- [ ] Two dice bonuses at once (e.g. 1d4 and 1d6 effects): accepted.
- [ ] An effect with a flat and a dice part (`2 + 1d4`): accepted, and the flat 2 counts.
- [ ] A die typed in the roll dialog's situational bonus (`1d6`): refused ("isn't one of the character's bonuses").
- [ ] Edit a message's bonus die result to 9 on a d4 (console) and send it: refused ("result isn't valid").
- [ ] Removing the effect after the roll but before the GM's client handles it (rare): refused, roll again.
- [ ] The old cases still pass: plain roll, advantage / disadvantage, Expertise, exhaustion, flat effect bonus; GM rolls as before.
- [ ] Proficiency dice variant on: refused with "proficiency dice".

## 0.3.2 (2026-11-07)

Security and speed fixes from a code audit. No data changes.

### Fixed

- **A player could choose the gather quantity.** The `gather` request's *Days in this stage* (1–30) was only clamped. The GM's client now takes a GM's days as sent, but caps a player's at the last journey's days (from the reset record), and uses 1 when there is no journey on record (`allowedDays` in gather-model.mjs). The Gather window shows a player the same cap ("at most 3 (the last journey)", "1 (no journey yet)").
- **A used roll could be replayed.** `rollUsed` is a mark on the roll's chat message, which its author can unset. The GM's client now also keeps the used roll message ids in memory for the roll age (10 minutes; older rolls are refused anyway), for crafting and gathering (`usedRolls` in the new roll-model.mjs). The mark stays.
- **A roll's total could be forged.** For a player's roll the GM's client now checks the message's first roll: exactly one die, a d20 with one kept result from 1 to 20, the same skill or tool (and ability) the check needs, and total − the d20's result equal to the character's own bonus read from the sheet's prepared data (dnd5e 6.0.6 `system.skills[key].total` / `system.tools[key].total`). A situational bonus typed in the roll dialog, proficiency dice or another ability can't be checked, so such a roll is refused with the reason; for crafting with *GM approves each craft* on, it goes to the GM's card with the reason instead (`verifyRoll`). A GM's rolls are taken as sent. The d20's face itself stays on the honor system: README *Rolls and honesty*.
- **Gather windows redrew too often.** Any HP change, token control or targeting redrew every open Gather window at once; those now wait 100 ms (`foundry.utils.debounce`, so a burst is one redraw) and bail at once when no Gather window is open.
- Tooltips: checked every tooltip for document text (Foundry's tooltips render `data-tooltip` as HTML after the attribute is decoded). The module sets no `data-tooltip` with document text (its tooltips are plain `title` attributes, which the browser shows as text); a repo test now keeps it that way (`data-tooltip` / `data-tooltip-html` only with fixed text; document text goes in `title` or `data-tooltip-text`).

### Untested in Foundry

Check on Foundry 14.370 with dnd5e 6.0.6, as a player (not only as GM):

- [ ] Gather as a player after a toolkit journey of e.g. 50 hours: the window starts at 3 and says "at most 3 (the last journey)"; typing 10 stays at 3; the card says "× 3 days". After a GM reset: 1 day ("1 (no journey yet)"). As GM: any 1–30 is used.
- [ ] Crafting and gathering a normal roll (no situational bonus), with advantage and with disadvantage: accepted, card as before. A tool with Expertise, a skill with a flat bonus from an effect, an exhausted character (condition reduction): accepted (the sheet's total matches the roll).
- [ ] A situational bonus typed in the roll dialog (e.g. +2): refused with "A situational bonus can't be checked"; with *GM approves each craft* on, a craft goes to the GM's card with "Roll not checked: …" and the GM can approve or refuse.
- [ ] Changing the ability in the roll dialog: refused with "rolled with a different ability".
- [ ] Rules "proficiency dice" variant on: refused with "more than one die" (known limit).
- [ ] Replay: as a player, gather, then in the console unset the roll's `rollUsed` flag (`game.messages.get(id).unsetFlag("wanderers-guild", "rollUsed")`) and send the same `gather` request again: refused "That roll was already used". Same for a craft.
- [ ] Forged total: edit a gather roll message's roll total (console) and send it: refused with the bonus reason.
- [ ] Gather window open during a fight: HP changes and target / control changes still redraw the window (within a moment), with no lag; with no Gather window open, nothing redraws.
- [ ] GM rolls (crafting and gathering from a GM client) work as before, situational bonus included.

## 0.3.1 (2026-11-07)

### Fixed

- The Gather window couldn't be drawn ("this.options is not a function"): one of its methods shadowed the window's own `options`. Renamed; a repo test now stops window classes from defining methods with Foundry's window property names.
- Gathered and crafted consumables and loot now join the character's stack of the same item. A world item copied onto a character keeps no link back to its source, so every result made a new stack; the stack is now found by source, else by the same type and name (`stackOf` in craft-model.mjs, used by both).
- The Gather window offers *Gather in the area* whenever no node of that profession is within reach. A GM sees every node on the scene, so for a GM the area option never appeared on a scene with nodes.

### Checked live (Foundry 14.370, dnd5e 6.0.6, toolkit 2.3.0)

- Starter set, Professions window, toolkit sheet page (bookmark, Craft button), setup window, health report.
- A craft: Herbalism Kit check 16 vs DC 10 made the item, used up 2 of 3 materials and posted the card; with 1 left the window shows "missing" and Craft is disabled.
- Placing a gathering node (Journal Notes controls › Gathering node, item by UUID), the scene's Table Tools tier field.
- With the Gather window patched in memory: gathering at a node (Survival 14 vs DC 12, "1 per day × 3 days" gave 3), the once-per-node limit and the GM reset, harvesting a defeated CR 1/4 plant (21 vs DC 8; marked for Herbalism, a second harvest refused), a rare result (22 vs DC 3 with margin 5: 1 rare + 1 common out of 2 days), the scene tier's DC for area gathering (`api.gathering.assess`: DC 5, Tier 2).

### Untested in Foundry

- [ ] The new stacking (gathered and crafted results join an existing stack of the same name and type).
- [ ] The *Gather in the area* button away from nodes (as GM and as a player), the days prefill after a toolkit journey, a player's client (all checks above ran as GM).

## 0.3.0 (2026-11-06)

Third slice: gathering, plus a Professions page on Wanderer's Toolkit's character sheet.

- **Gathering** (*Feature: Gathering*, on; needs Professions). A profession with the Gather action collects resources with a check: at a **node** on the map, in a scene's **area**, or from a defeated **creature** (harvesting). The check is rolled on the player's client with dnd5e's roll (the profession's skill, or with the new *Gathering rolls: the linked tool* its best proficient tool) and the active GM's client gives the items. See [docs/gathering.md](docs/gathering.md).
- **Your numbers, none shipped.** Setup › **Gathering**: tiers (renamable, at most 12; a new world has *Tier 1* to *Tier 5* with no DC), the DC fields suggesting SRD 5.2's typical DCs, *Per success* (1), *Rare margin* (empty = off: beat the DC by it and one resource is the rare one), *Reach* (2 grid spaces; 0 = any), CR bands (DC for harvesting, empty by default), harvesting rows (creature type + profession → resource, rare, needed bonus) and area rows (profession + tier → resource). No DC anywhere: the check succeeds (card: "no DC set"). Import / export JSON; **Reset gathering limits**.
- **Scenes** get a *Gathering tier* in core's shared Table Tools tab (`flags.wanderers-guild.tier`).
- **Nodes**: Journal Notes controls › **Gathering node** (GM), one click places it; the editor sets name, profession, resource and rare resource (drop items or paste UUIDs), tier, DC, per success, uses left, needed bonus, hidden, reset. Nodes are core map notes with `flags.wanderers-guild.node` and our mark (one original stroke icon per profession icon, `styles/nodes/`). Our Note class wrap: nodes show to players without a journal entry (hidden ones don't), double-click opens the Gather window (players) or the editor (GM), used-up nodes dim.
- **Gather window** (per character): the profession's nodes within reach (nearest first, or the double-clicked node), the scene's area when no node is near (*Gather without a node*, on), and **Harvest** for the targeted (or selected) defeated NPC; each with the roll, DC, what it gives and what stops it. Opened by the Gather buttons in the Professions window and on the toolkit sheet page (they were placeholders), or `api.gathering.open`.
- **Quantity per day of the journey stage** (setup › Gathering › *Count*, world rule `qtyMode`: `perDay` default, or `flat`): one check per stage; a success at a node or in an area gives *Per success* for each day of the stage (a rare result replaces one of the total). The Gather window has **Days in this stage** (1–30, default 1), prefilled after a toolkit journey with its `hours` as max(1, ceil(hours / 24)); the card shows "N per day × D days". Days travel in the `gather` request (integer 1–30, required; the leader clamps it). Harvesting a creature and *flat* mode ignore days.
- **Limits**: *One gather per node until reset* (on): once per node and per scene's area, until the GM resets (all, or one node from its editor) or, with *Travel resets gathering limits* (on), the party travels with Wanderer's Toolkit (its `wayfarersToolkit.journey` hook, read on the GM's client; a non-writing GM tab relays with the GM-only request `gatherReset`). A node's uses go down on each success. Each creature is harvested **once per profession** (skinning and herbalism can both harvest the same creature). The calendar is never advanced.
- Decisions: scene tiers only, no tier on core Regions (nodes with their own tier or DC cover mixed maps). Area gathering needs the character's token on the scene (GMs excepted), stated in the window and its reason text.
- Stored shapes: token `flags.wanderers-guild.harvested` is `{ v: 2, list: [{ actor, profession, at }] }` (one per profession, at most 10; a v1 `{ actor, profession, at }` reads as a one-entry list). `gatherReset` is `{ v: 2, at, days }` (`days` = the last journey's length or null; v1 reads with `days: null`); the GM-only relay `gatherReset` carries the optional `days`.
- **The active GM's client does the writing**: request `gather` { actor, profession, roll, node | scene | token } (schema-checked; no totals or user fields): the sender must own the character; the roll is read from its chat message (the sender's, our `gatherRoll` flag for this character, profession and target, at most 10 minutes old, used once); then everything is checked again (`assessGather`, the same decision the window shows), items added (onto a matching consumable / loot stack), the limit recorded (`flags.wanderers-guild.gathered`, at most 100), a use spent, the creature marked (`flags.wanderers-guild.harvested` on its token), and a gather card posted (`flags.wanderers-guild.gather`). One gather per character at a time. Hook `wanderers-guild.gathered` (experimental, ids only). `api.gathering` (experimental).
- Health: a Gathering section (gathering professions and what they roll, rules set, nodes and hidden nodes, scenes with a tier, broken nodes and rows, the Note class, limits and journeys). Remove data: new categories `gathering` (rules, reset record, scene tiers), `nodes` (deleted), `gathered`, `harvested`; cards include gather cards. `known` now removes only the known-recipes flag.
- Built on wanderers-core 0.6.0 (guest pages; nothing else changed). CI runs core's `module-checks.yml@v0.6.0`.
- **Professions page on the Wanderer's Toolkit sheet** (*Feature: Toolkit sheet page*, on; needs Professions): with the toolkit 2.3.0 or later and its character sheet on, a Professions bookmark (order 85) shows the same view as the window, with its Craft / Recipes / Gather buttons (wired by `data-wg-act`, never the sheet's `data-action`) and a link to the window. Registered on every client at our ready (when the toolkit's `api.sheet` is already there) and on the toolkit's `wayfarers-toolkit.sheetReady` hook; our data changes call the page's `refresh()`. Health: the page is registered, or why not. The window and the header button stay.

### Untested in Foundry

Not run in a live world yet; check on Foundry 14.370 with dnd5e 6.0.6 (and once on v13), with and without Wanderer's Toolkit 2.3.0:

- [ ] Core 0.6.0: the module loads with no console errors; windows look as before (`wc-r4`).
- [ ] Toolkit sheet page: with the toolkit's character sheet on, a Professions bookmark sits between Bastion and Special traits (both load orders: reload with each module first); the page shows the cards dark, Craft / Recipes / Gather and *Open the Professions window* work, clicks don't trigger the sheet's own buttons, Enter does nothing odd. Changing a profession definition (setup) redraws an open sheet. *Feature: Toolkit sheet page* off: no bookmark. Health line for: toolkit missing, toolkit 2.2, sheet off, registered.
- [ ] Setup › Professions: *Gathering rolls* saves; setup › Gathering: tiers add / rename / remove, DC suggestions list shows, CR bands, harvesting and area rows (add, remove, drop items on the cells, profession and type selects), Save, Import / Download, Reset gathering limits (confirm).
- [ ] Scene configuration › Table Tools shows *Gathering tier* next to the toolkit's / Red Book's sections and saves `flags.wanderers-guild.tier`.
- [ ] Journal Notes controls › Gathering node (GM only): one click opens the editor; drop a world item and a compendium item on Resource / Rare; pasting a UUID fills the name; Save makes a note with our mark and gold ring; double-click (GM) edits; Delete (confirm). With the toolkit's map pins on too, pins and nodes both keep their own look and double-click.
- [ ] Players see nodes without a journal entry (map notes toggle on), don't see hidden nodes; a used-up node is dimmed; the toolkit health check still finds its pin class.
- [ ] Player: Gather on a Herbalism card with the token near a node → window lists it with roll, DC and gives; far away → "Too far"; dnd5e's skill roll dialog shows the DC; the item arrives (stack grows for consumables / loot), the card posts, a second try says "Already gathered here"; Reset (GM) clears it. A profession set to roll its tool rolls the tool.
- [ ] Rare margin set: a roll beating DC + margin gives the rare item in place of one; empty margin never does. No DC: the card says "no DC set" and gives the items.
- [ ] Uses: a node with 2 uses dims after two successes and refuses after; failures don't spend uses.
- [ ] Area: with no node in reach and *Gather without a node* on, the area option appears with the scene tier's DC and the area row's item; no row → card "the GM hands out what was found"; a player without a token on the scene sees "Gathering in an area needs your character's token on this scene."
- [ ] Harvest: target a 0 HP NPC beast with a harvesting row: DC from the CR band; success adds the item and marks the token; a second harvest with the same profession is refused ("already harvested for …"), one with another profession (skinning after herbalism) works and both marks stay; a living creature or a type without a row is refused with the reason.
- [ ] Days in this stage: the field shows for nodes / area (not for a creature alone, not in *flat* mode); 3 days with Per success 2 gives 6 and the card says "2 per day × 3 days"; a rare result gives 1 rare + 5. After a toolkit hex trip or flight of e.g. 50 hours, a player's newly opened window starts at 3 ("from the last journey"); a GM reset starts it at 1. A second GM tab relays the journey with its days.
- [ ] Refusals: a forged / old / reused roll, a node deleted between the roll and the GM's check, or a moved token (out of reach) → a whispered notice or a "Nothing was gathered" card, nothing given.
- [ ] No GM connected: Gather disabled with the banner. Two GM tabs: one card, one set of items. A journey with the toolkit (hex travel, flight) resets the limits (health shows the time).
- [ ] Setup › Data: the dry run counts gathering rules and scene tiers, nodes, characters' limits, harvested tokens, gather cards; REMOVE deletes nodes and cards, clears the flags, leaves gathered items.
- [ ] `api.gathering.open(actor)`, `.nodes()`, `.assess(actor, "herbalism", { scene: canvas.scene })`, `.place()` (GM); hook `wanderers-guild.gathered` fires once per resolved gather on the GM client.

## 0.2.0 (not released separately; included in 0.3.0)

Second slice: recipes and crafting. Gathering is still a placeholder.

- **Crafting rules are your numbers.** A new setup page, *Crafting rules*, holds every number crafting uses: time from the item's price (hours per gp, rounding, a working day), the coin cost as a share of the price (and whether it is taken from the crafter), time / cost / DC per rarity for magic items, a consumable percentage, a base DC, what a failure does to the materials, helpers, and a time percentage per rank. Nothing ships filled in (no rulebook figures): empty fields read "not set", and a craft with no DC anywhere succeeds on the roll. Import / export JSON to paste or keep a rules set.
- **Recipes** (setup › Recipes): what it makes (drag an item; its name, picture, type, rarity and price are kept), profession, section, rarity override, materials by item or by name, optional DC / time / cost, *known by everyone with the profession*, a note. Refresh from items; Import / export JSON (merge by id). At most 300 per world.
- **Crafting window** per character and profession, opened by the card's Craft and Recipes buttons (*Feature: Crafting*, on by default). **Craft**: the recipe list by rarity colour and status (can craft / missing something / needs a higher rank / unknown), search and a *Can craft* filter; the selected recipe's materials have / need, tool, rank needed, tool check and DC, time (in game, for reference: the calendar is never advanced), value and coin cost. **Craft** rolls the linked tool check (dnd5e's roll, DC as the target). **Recipes**: Known, Can learn, Needs a higher rank; Learn (players, switch *Players learn recipes themselves*), Teach and Forget (GM).
- **The active GM's client does the writing.** Requests `learnRecipe`, `forgetRecipe` (GM), `craft` and `craftDecide` (GM), schema-checked; the handler checks the sender owns the character and re-checks everything (profession, known recipe, rank, materials, coin). The roll is read from its chat message (the sender's, for this character and recipe, at most 10 minutes old, used once). The craft resolves as soon as the roll lands, with no GM click: materials always come from the character's inventory (by source item or by name, so typed name-only materials match carried items); success adds the item (or grows a matching consumable/loot stack), uses up the materials and pays the coin cost; a failure uses them up too by default (*On a failed check*: used up, or kept). With no DC set anywhere the roll crafts it (the card says "no DC set: crafted"). If the materials are gone by then, the craft is refused and nothing is used. Crafts for one character are handled one at a time. A chat card shows the result and what was used up.
- **Told before rolling**: next to the Craft button (and as its tooltip) the window says what the craft uses up, e.g. "Crafting uses up: 2× Copper Bar, 1× Weak Flux (taken when you roll, success or failure)" ("…on success; kept on a failure" when failures keep them). No confirm dialog.
- **GM approves each craft** (switch, off): a GM card with Approve / Refuse (Success / Failure / Refuse when there's no DC) before anything is made or used. With it off nothing waits for a GM.
- **Prices**: book values (standard coins) by default; *Prices in the world's coins* uses Wanderer's Toolkit's coins when it is active (its `moneyHTML`, and its `pay` with a reason for the coin log). Never required.
- Known recipes are stored on the character (`flags.wanderers-guild.recipes`, at most 200). Health check: a Crafting section (recipes, missing professions or items, which rules are set, approval, prices). Remove data covers recipes, rules, known recipes, craft cards (deleted) and our marks on rolls. `api.crafting` and the hook `wanderers-guild.crafted` (experimental).
- The Professions window's Recent box now says crafting results go to chat; Gather stays "Coming in a later version".

### Untested in Foundry

Not run in a live world yet; check on Foundry 14.370 with dnd5e 6.0.6 (and once on v13), with and without Wanderer's Toolkit:

- [ ] The module loads with no console errors; Configure Settings shows *Feature: Crafting*; with it off (after the reload) there are no Craft / Recipes buttons, no Recipes / Crafting rules pages, and `api.crafting` is undefined.
- [ ] Setup › Recipes: drag a world item and a compendium item onto *Makes*: name, picture, rarity, type and price appear; Save keeps them. Drop items on the materials box (adds a row) and on a row's UUID field; Add / Remove material keep typed values; a typed name-only material works.
- [ ] Recipes: Edit / Delete, the profession filter, *Refresh from items* after changing an item's price, the warnings (no profession, missing profession, no item).
- [ ] Import / export: Download writes a JSON file; pasting it back reports "0 new, N replacing"; pasting junk, or the rules JSON into the recipes box, is refused with a message.
- [ ] Setup › Crafting rules: every field starts empty; Save keeps values; Clear all; rules Import / Download; the status line lists what is set.
- [ ] Setup › Settings shows the three crafting switches (only with the feature on).
- [ ] Crafting window from a character's Smithing card (Craft and Recipes buttons): the list colours by rarity, statuses are right, search and *Can craft* work, the window is dark in both themes, narrow width stacks the list above the detail.
- [ ] Materials have / need count stacks from the same compendium item and stacks with the same name; giving the character a material redraws the open window.
- [ ] Recipes page as a player: Learn on an allowed recipe adds it (the window redraws to Known); a recipe above the rank shows "needs …"; with *Players learn recipes themselves* off: "ask your GM". As GM: Teach (any rank), Forget.
- [ ] Craft as a player with a DC set: dnd5e's roll dialog opens with the DC; the chat shows the roll and then the card; success adds the item (quantity right; a consumable stacks onto a matching one), lowers/deletes the materials; failure uses them up by default (and keeps them with *On a failed check: kept*); no GM click is needed.
- [ ] Coin cost charged (rule on): standard coins without the toolkit (change given from a gold coin); with the toolkit and *world's coins* on, the coin log shows "Crafting: <recipe>" and the window/card show the toolkit's coin markup.
- [ ] The Craft detail shows "Crafting uses up: …" next to the button and as its tooltip, matching the materials (and "the coin cost" when charged); the wording changes with *On a failed check: kept*; no confirm dialog appears.
- [ ] A typed name-only material (no UUID) counts and is consumed from a carried item of the same name (different case / spacing).
- [ ] No DC anywhere: the roll is made and shown, the item is made at once, the card says "no DC set: crafted"; no GM buttons.
- [ ] Materials dropped or traded away between the roll and the GM client's check: a "Refused" card ("Nothing was made or used up: Missing materials."), nothing consumed. Two quick crafts on the same stack: the second is refused, not double-spent.
- [ ] *GM approves each craft* on: Approve / Refuse (Success / Failure / Refuse with no DC); players see "The GM approves each craft; nothing is made or used up until then"; Refuse makes and uses nothing; materials removed before the approval give a refused card.
- [ ] A roll is used once: a double click or two GM tabs make one item; a roll message older than 10 minutes, or made by another user, is refused with a whispered notice.
- [ ] No GM connected: Craft and Learn are disabled with the banner; the roll isn't made.
- [ ] Two GM tabs: only one makes the item; a GM's Approve click from the non-leader tab works.
- [ ] The time line shows the hours (and days with a working day set) and never moves the world clock.
- [ ] Health: the Crafting section's lines; a recipe whose compendium item was deleted warns.
- [ ] Setup › Data: the dry run counts recipes, rules, characters with known recipes, and cards/rolls; REMOVE deletes the cards and notices, keeps the roll messages (mark removed), clears the flags.
- [ ] `api.crafting.open(actor, "smithing")`, `.assess(actor, id)`, `.learn(actor, id)`; the `wanderers-guild.crafted` hook fires once per decided craft on the GM client.

## 0.1.0 (not released separately; included in 0.3.0)

First slice: professions and ranks. Crafting, recipes and gathering are placeholders (their buttons say "Coming in a later version").

- **Professions from tool proficiencies.** The GM defines professions (name, kind crafting / gathering / secondary, the dnd5e tools that qualify, icon, gathering check, actions, a note for players). A character has every profession whose tool it is proficient with; a profession with no tool is everyone's. Nothing is stored on actors.
- **Rank = proficiency bonus.** A rank table names each bonus (+2 Novice … +6 Master by default) and the highest rarity it crafts (Common … Legendary by default); the GM renames, adds or removes rows.
- **Professions window** per character (owners, observers, GM): cards for crafting and gathering professions (rank, ladder, linked tool, crafts up to, check, next rank), the other professions as a list, and (switch, on) the ones not learned yet. Dark in both themes. Opened from a hammer button in dnd5e character sheet headers (*Feature: Sheet button*) or `api.open(actor)`.
- **Setup window** (GM) on wanderers-core's shell: Professions (with *Add starter set*), Ranks, Settings, Health, Data (Remove Wanderer's Guild data).
- Read-only health check (`api.health()`, with an *Add starter set* fix when no professions exist), Wanderer's Satchel registration, `api.cleanup`, remembered window positions. Built on wanderers-core 0.5.2.

### Untested in Foundry

Not run in a live world yet; check on Foundry 14.370 with dnd5e 6.0.6 (and once on v13):

- [ ] The module loads with no console errors; Configure Settings lists the two feature switches and the **Open setup** menu (GM only).
- [ ] Setup › Professions: *Add starter set* adds professions only for tools the world has, and a second press adds nothing; Add / Edit / Save / Delete / move up and down work; the tool labels are the system's (not raw keys like `smith`).
- [ ] The editor keeps a linked tool the world no longer has (ticked, marked) and the health check warns about it.
- [ ] Setup › Ranks: edit names and rarities, Add rank keeps typed values, Remove, Save sorts by bonus, a repeated bonus is dropped with a warning; Reset to defaults asks first.
- [ ] Setup › Settings switches apply at once (an open Professions window redraws); Reset window positions works.
- [ ] Setup › Health shows the sections; the *Add starter set* fix works from the Wanderer's Satchel's health page.
- [ ] Setup › Data: the dry run counts the professions and changed settings; REMOVE clears them; a wrong word refuses.
- [ ] The hammer button shows on dnd5e character sheet headers (visible button and controls menu) for owners and observers, not on NPC sheets; it opens the window; with *Feature: Sheet button* off (after the reload) there is no button.
- [ ] The Professions window for a level 5 character (bonus +3): rank "Apprentice +3", ladder step +3 highlighted, next rank "Adept +4 at level 9"; proficient, expertise and half-proficiency marks look right; a profession with no tool shows for everyone.
- [ ] Giving the character a tool proficiency (sheet, effect, background advancement) or a level redraws an open window.
- [ ] A player opens their own character's window; a player with only Limited permission can't; `api.open()` without an argument opens the assigned character.
- [ ] Craft / Recipes / Gather buttons show the "Coming in a later version" notice.
- [ ] Both windows look right in the dark and light themes and at a narrow width; keyboard: sidebar arrows, Enter/Space don't pause the game.
- [ ] Two GM tabs: an edit in one redraws the other's setup window.
