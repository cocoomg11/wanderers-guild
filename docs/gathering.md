# Gathering

*Feature: Gathering* (on by default; needs Professions). A gathering profession collects resources with a check: at a **node** on the map, in a scene's **area**, or from a defeated **creature** (harvesting). The check is rolled on the player's client; the active GM's client checks it and gives the items. Every number is yours: nothing from any rulebook is filled in.

## The short version

1. **Professions** (setup › Professions): a profession gathers when its actions include **Gather** (gathering professions get it by default). Pick what it rolls: its *Gathering check* (a skill, Survival by default) or *the linked tool* (the character's best proficient tool).
2. **Gathering** (setup › Gathering): name your tiers and give each a DC; set *Per success* and its *Count* (per day of the journey stage, or flat), the *Rare margin* (empty = off) and the *Reach*. Add area resources and harvesting rows if you want them.
3. **Scenes**: Scene configuration › *Table Tools* › *Gathering tier*. The tier belongs to the whole scene: core Regions get no tier of their own (scene tiers are enough; a map with two kinds of ground can use nodes with their own tier or DC).
4. **Nodes**: Journal Notes controls › **Gathering node**, then click the map. Fill in the node: name, profession, resource and rare resource (drop items), and optionally its own tier, DC, quantity, uses and needed bonus.
5. Players press **Gather** on the profession's card (Professions window or the Wanderer's Toolkit sheet page), or double-click a node with their token selected.

## Tiers and DCs

Tiers are world data: rename them, add or remove rows (at most 12). A new world has five rows named *Tier 1* to *Tier 5* with no DC. The DC fields suggest SRD 5.2's typical DCs (Very easy 5 to Nearly impossible 30); pick one or type your own.

Where a gather's DC comes from:

| Gathering at | DC |
| --- | --- |
| a node | the node's own DC, else its tier's DC (the node's tier, else the scene's) |
| the area (no node) | the scene's tier's DC |
| a creature | the CR band's DC (the first band whose *Up to CR* is at least the creature's; above every band, the last one) |

No DC anywhere: the check is still rolled and shown, and it succeeds (the card says "no DC set"), as with crafting.

## Results

- **Success**: *Per success* of the resource (a node can set its own number), for each day of the journey stage (see below).
- **Rare**: beat the DC by the *Rare margin* or more and one of them (of the whole stage's amount) is the rare resource instead. Empty margin (the default), no DC, or no rare item: never rare.
- **No item set**: the check is made and the card says the GM hands out what was found; nothing is created.
- **Failure**: nothing.

Items go to the character's inventory: onto a consumable or loot stack from the same item, else as a new item.

## Quantity: per day of the journey stage

One check covers a whole journey stage. With *Count: per day of the journey stage* (the default), a success at a node or in an area gives *Per success* for **each day** of the stage: the Gather window has a **Days in this stage** field (1 to 30, default 1), and the card shows "2 per day × 3 days". After a Wanderer's Toolkit journey that reported its length in hours, the field starts at that journey's days (hours ÷ 24, rounded up, at least 1; the GM's client stores it in the reset record, which every client reads). A GM's **Reset gathering limits** starts a new stage with no length (the field starts at 1). A GM can type any number from 1 to 30. A player can lower it but not raise it above the last journey's days; with no journey on record (a new world, or after a GM reset) a player gathers for 1 day. The GM's client enforces this, whatever the request says. To give a player a longer stage without a journey, gather for them from a GM client.

With *Count: flat*, a success gives just *Per success*, whatever the days. Harvesting a creature always counts once (no days).

## Limits: one gather per stage

With *One gather per node until reset* (Settings, on), a character gathers once at each node and once per scene's area. The limit clears when:

- the GM presses **Reset gathering limits** (setup › Gathering), or ticks *Reset this node's limits* in a node's editor;
- the party travels with Wanderer's Toolkit (hex travel or a flight), when *Travel resets gathering limits* is on (on). The toolkit's journey hook is read on the GM's client; only its `hours` is used (for *Days in this stage*), nothing else about the trip.

A node's **Uses left** (empty = unlimited) goes down by one with each success; at 0 the node is used up (it shows dimmed). The calendar is never advanced.

## Gathering without a node

With *Gather without a node* on (on), a character **with a token on the scene** can gather in its area when no node of their profession is within reach. The DC is the scene's tier's. What they find comes from **Gathering without a node** rows on the Gathering page (profession + tier, or any tier); with no row the GM hands it out. The token rule is on purpose: without the character's token on the scene the option says "Gathering in an area needs your character's token on this scene." (GMs gather from anywhere.)

## Harvesting creatures

Target (or select) a defeated NPC token (HP 0, or the dead status) and press Gather: the window offers **Harvest**. It needs a harvesting row for the creature's type and the profession (setup › Gathering: *Harvesting creatures*, with resource, rare resource and an optional needed proficiency bonus). The DC comes from the CR bands. Each creature can be harvested **once per profession** (a mark per profession on its token, at most 10): a skinner and an herbalist can both harvest the same creature, but a second skinner can't.

## Reach and tokens

The character's token must be within *Reach* grid spaces of the node or creature (0 = any distance), and on the scene for area gathering. GMs gather from anywhere.

## Hidden nodes

A node can be hidden from players: they don't see it on the map and can't gather there. Its details still reach every player's browser with the scene (Foundry sends all map notes), so keep secrets off nodes.

## Who writes what

Players never write documents. The Gather window rolls the check (dnd5e's skill or tool roll, with the DC as the target) and sends the roll's chat message id to the active GM's client, which checks: the sender owns the character, the roll is theirs, made for this character, profession and target, at most 10 minutes old and not used before; then everything the window showed (profession, node, reach, limits, uses, the creature) again. Then it gives the items, records the limit, spends a use or marks the creature, and posts a card. Gathers for one character are handled one at a time. A player's roll must be one d20 plus the character's own skill or tool bonus as the sheet works it out (see *Rolls and honesty* in the README); a roll with a situational bonus, extra dice or another ability is refused with the reason, so roll again without them.

## What it writes

- World settings `gatherRules` (tiers, DCs, margin, quantity and its count, reach, CR bands, harvesting and area rows) and `gatherReset` (when the limits were last reset, and the last journey's days).
- Scenes: `flags.wanderers-guild.tier`.
- Nodes: map notes with `flags.wanderers-guild.node`.
- Characters: `flags.wanderers-guild.gathered` (at most 100 limit marks); the gathered items.
- Creature tokens: `flags.wanderers-guild.harvested` (one mark per profession).
- Chat: gather cards (`flags.wanderers-guild.gather`), notices, and `gatherRoll` / `rollUsed` marks on the check rolls.

Setup › Data removes each of them (nodes are deleted; gathered items stay).
