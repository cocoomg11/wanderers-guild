# Changelog

All notable changes to Wanderer's Guild. Versions follow the `version` in `module.json`.

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
