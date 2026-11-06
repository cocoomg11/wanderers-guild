# Professions

How Wanderer's Guild decides what a character can do, and how the GM sets it up. Version 0.1 covers professions and ranks; crafting, recipes and gathering are later versions.

## Professions come from tool proficiencies

A profession is linked to one or more dnd5e tools (for example Smith's tools, or either of two tools). A character **has** the profession when it is proficient with any one of them, however it got the proficiency: background, class, species, a feat, training, an active effect. Half proficiency does not count; expertise does (it shows a brighter mark). There is no limit on how many professions a character has.

A profession with no linked tool needs none: every character has it.

Nothing is stored on the character. The Professions window reads the character's tools each time it draws, so a new proficiency shows at once.

## Rank is the proficiency bonus

A profession's rank is the character's proficiency bonus, the number the dnd5e sheet shows. By the SRD table that is +2 at levels 1 to 4, then one more every four levels, up to +6 at level 17. Every profession the character has shares that rank.

The **rank table** (setup window › Ranks) gives each bonus a name and the highest item rarity that rank can craft:

| Bonus | Default name | Crafts up to (default) |
| --- | --- | --- |
| +2 | Novice | Common |
| +3 | Apprentice | Uncommon |
| +4 | Adept | Rare |
| +5 | Expert | Very rare |
| +6 | Master | Legendary |

Change the names and rarities to suit the table, add rows (one per bonus, up to 12; a bonus from +1 to +20) or remove them. A character whose bonus is below the lowest row has no rank yet; a bonus between two rows uses the lower one. The "Next rank" line names the level the character reaches the next row at, when its bonus is the standard one for its level.

The rarity is shown for reference in 0.1; crafting (a later version) will use it.

## Kinds

- **Crafting**: shown as a card with Craft and Recipes buttons.
- **Gathering**: shown as a card with a Gather button and the check it uses (Survival by default; pick another skill in the editor). The DC will come from the GM per region in a later version.
- **Secondary**: shown in the *Other professions* list; tick which actions it offers.

The buttons say "Coming in a later version" for now.

## Setting up (GM)

Game Settings › Configure Settings › Wanderer's Guild › **Open setup**, or `game.modules.get("wanderers-guild").api.setup()`.

- **Professions**: add, edit, reorder and delete professions. **Add starter set** adds one plain profession per artisan's tool and the herbalism kit the world knows (Smithing, Alchemy, Herbalism, Cooking, …), skipping tools a profession already links. Everything is editable afterwards.
- **Ranks**: the rank table above. **Reset to defaults** puts the default names and rarities back.
- **Settings**: *Show professions not learned yet*, *Debug logging*, and **Reset window positions**.
- **Health**: the read-only check (no professions, links to tools the world doesn't have, rank rarities that go down, player characters with no profession).
- **Data**: remove what the module stored, after a dry run and the word REMOVE.

Players can read the definitions (their windows need them), so keep secrets out of a profession's note.
