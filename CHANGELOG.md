# Changelog

All notable changes to Wanderer's Guild. Versions follow the `version` in `module.json`.

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
