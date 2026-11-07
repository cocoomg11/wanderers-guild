# Changelog

All notable changes to Wanderer's Guild. Versions follow the `version` in `module.json`.

## 0.3.0 (unreleased)

- Built on wanderers-core 0.6.0 (guest pages; nothing else changed). CI runs core's `module-checks.yml@v0.6.0`.
- **Professions page on the Wanderer's Toolkit sheet** (*Feature: Toolkit sheet page*, on; needs Professions): with the toolkit 2.3.0 or later and its character sheet on, a Professions bookmark (order 85) shows the same view as the window, with its Craft / Recipes / Gather buttons (wired by `data-wg-act`, never the sheet's `data-action`) and a link to the window. Registered on every client at our ready (when the toolkit's `api.sheet` is already there) and on the toolkit's `wayfarers-toolkit.sheetReady` hook; our data changes call the page's `refresh()`. Health: the page is registered, or why not. The window and the header button stay.

## 0.2.0 (unreleased)

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

## 0.1.0 (unreleased)

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
