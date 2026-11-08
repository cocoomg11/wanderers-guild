# Crafting and recipes

How crafting works in Wanderer's Guild 0.4, and what the GM sets up. Crafting is its own feature (*Feature: Crafting*, on by default; it needs *Feature: Professions*). Professions and ranks are explained in [professions.md](professions.md).

## The short version

1. The GM fills in the **Crafting rules** (setup window › Crafting rules) from the rules their table uses. Nothing is filled in for you.
2. The GM writes **recipes** (setup window › Recipes): what each one makes, which profession makes it, what it uses.
3. Characters **learn** recipes: by their rank, from a **recipe item**, or from the GM (or a recipe is known by everyone with its profession).
4. On the Professions window a crafting profession's **Craft** button opens the Crafting window. Pick a recipe, press **Craft**: the character rolls the profession's tool check, and the active GM's client takes the materials from the character's inventory and, on a success, makes the item. Nothing waits for a GM.

## Crafting rules: your numbers

The module ships **no rulebook figures**. Every number crafting uses is world data on the Crafting rules page, empty until the GM fills it in:

| Field | What it does |
| --- | --- |
| Time from the item's price | *N* hours of work per *M* gp of the item's price, rounded not at all, up to a whole hour, or up to a working day. |
| A working day | Hours in a working day: the time text adds "(2 days of 6 hours)", and day rounding uses it. |
| Coin cost from the item's price | A percentage of the item's price, and whether it is **taken from the crafter's coin**. |
| Magic items by rarity | Hours, cost (gp) and DC for each rarity. Used for items with a rarity, field by field, instead of the price rules. |
| Consumables | A percentage of the rarity table's time and cost for consumable items (100 % = no change). |
| Base DC | The DC when neither the recipe nor its rarity row sets one. |
| On a failed check | Materials (and any coin cost) are **used up** (the default: consumed on use), or **kept**. |
| Helpers | How many helpers a crafter may name, and whether each helper divides the time. |
| Time by rank | A percentage of the time for crafters at each rank (for a rank perk that speeds crafting). |

A recipe's own DC, time and cost win over this page. Leave a field empty and the Crafting window says "not set". If no DC is set anywhere, the craft succeeds on the roll (the roll is still made and shown; the card says "no DC set: crafted").

**Import / export JSON**: the box under the page holds the rules as JSON. Download them to keep, paste a set (yours, or one from another world) and press *Import from the box* to replace the page.

### Time is for reference

The Crafting window and the chat card show how long a craft takes, in game, for the player and the GM to see. The module never advances the calendar or the world's time: play it out as your table does.

## Prices: book values or the world's coins

By default prices show **book values**: the item's price in standard gold, silver and copper (1 gp = 10 sp = 100 cp). With Wanderer's Toolkit active, the switch *Prices in the world's coins* (setup › Settings) shows them in the toolkit's coins instead (its three-coin economy), and a coin cost is paid through the toolkit, which records it in its coin log. Gold-piece figures on the rules page and in recipes are gold pieces of the economy in use. The toolkit is never needed.

## Recipes

A recipe (setup window › Recipes › Add recipe) has:

- **Makes**: drag an item (from the sidebar or a compendium) onto the editor, and set how many. On Save its name, picture, type, rarity and price are read and kept with the recipe; **Refresh from items** reads them all again after you change the items.
- **Name** (the item's when empty), **Profession**, **Section** (how the Crafting window groups it; empty = by item type).
- **Rarity**: the item's own, a different one, or "mundane". The rarity decides which rank can craft it (the rank table's *Crafts up to*) and which rarity row of the rules it uses.
- **DC, Time (hours), Coin cost (gp)**: empty = the rules page.
- **Known by everyone with the profession**: no need to learn it.
- **Learned by**: *Rank* (players learn it themselves when their rank allows; the default, and what recipes from before 0.4 use), *Recipe item* (only by using a recipe item, or a GM teaching it) or *GM only*.
- **Taught by item** (saved recipes): the world items that teach it, each *Kept after learning* or used up (the default). Drop an item from the Items sidebar here, or press **Make recipe item**.
- **Materials**: drop items onto the list, or type a name, with a quantity each. They always come from the crafting character's inventory: a carried item counts when it came from that item (the same source), or has the same name (case and extra spaces don't matter), so a typed name-only material matches any carried item of that name. They are used up by a craft.
- **Note for players**.

Players can read every recipe (their windows need them), so keep secrets out of the notes. At most 300 recipes per world, 12 materials per recipe. The Import / export box works as for the rules: a pasted recipe with the same id replaces the old one, new ids are added.

## Learning recipes

The Crafting window's **Recipes** page lists the profession's recipes in groups: *Known*, *Can learn*, *Needs a higher rank*, *Needs a recipe item* and *Ask your GM*.

- **Rank** recipes: a player presses **Learn** when their rank allows it (switch *Players learn recipes themselves*, on by default; off, these say *Ask your GM*).
- **Recipe item** recipes: learned only from a recipe item the character carries (or from the GM). Without the item the row says *Needs a recipe item*.
- **GM only** recipes: only a GM teaches them (*Ask your GM*).
- The GM presses **Teach** (any recipe, any rank) or **Forget** on a character's Recipes page, or **Teach to…** on the setup window's Recipes list to teach one recipe to several characters at once.

Known recipes are kept on the character (at most 200; recipes known by everyone don't count). They are written by the active GM's client after it checks the request again: the player owns the character, has the profession and the rank, the recipe's *Learned by* allows it and the switch is on. Each learn posts a short card, whispered to the player and the GMs ("Maren learned Plain Blade, from a recipe item"), and fires the hook `wanderers-guild.learned`.

**Recipes not known yet** (setup › Settings): *Show* (default) lists every recipe, greyed, with how to get it; *Hide* lists only the recipes a player knows (and the ones a recipe item they carry teaches) on the Recipes and Craft pages. GMs always see every recipe. Hide is display only: the recipes are a world setting that every client receives, so a player who looks in the console can still read them.

### Recipe items

A recipe item is any item that teaches a recipe, like a spell scroll: sell it from a merchant, put it in loot, or hand it out like any item. There are no trainers: a recipe you want sold for coin is a recipe item in a merchant's stock.

- In the recipe editor (a saved recipe), drop an item from the Items sidebar on **Taught by item**, or press **Make recipe item** (a new loot item "Recipe: Plain Blade" in the Items sidebar, with the recipe's rarity). Compendium items: import them first, then drop the world copy.
- Copies of the item (in a merchant's stock, a loot pile or an inventory) carry the mark and teach too.
- A character carrying one sees **Learn from item** on the Recipes page, and in a *Recipe items* box on the Professions window (and the toolkit sheet page).
- Rank still applies: a recipe item for a recipe above the character's rank says "needs Adept +4" and stays in the inventory.
- Learning uses one item up (lowers the stack, or deletes the last one) unless the GM ticked *Kept after learning*.
- A recipe item for a *GM only* recipe can't be used (the health check warns).

The GM's client checks a recipe item request too: the item must be in that character's own inventory, and the recipe comes from the item's mark as stored, never from what the player's client sends.

## Crafting

The **Craft** page lists the profession's recipes, coloured by rarity: *can craft*, *missing something*, *needs a higher rank*, *recipe unknown*. Search and *Can craft* narrow the list. The selected recipe shows:

- **Materials**: have / need, counted in the character's inventory.
- **Requirements**: the tool (the profession's linked tool the character is proficient with; expertise wins), the rank needed, the check (the tool and its bonus, and the DC), and the time.
- **Cost**: the item's value, the coin cost (and whether it is paid from the character's coin), what a failure does.
- Next to the **Craft** button (and as its tooltip), what the craft will use up, for example *Crafting uses up: 2× Copper Bar, 1× Weak Flux (taken when you roll, success or failure)*, or *…on success; kept on a failure* when the rules keep materials on a failure. There is no confirm step: pressing Craft is the go-ahead.

**Craft** rolls the tool check (dnd5e's own roll dialog, with the DC as the target). When the roll lands, its chat message goes to the active GM's client, which checks everything again (the roll is this character's, for this recipe, recent and not used before; the character is owned by the player; the recipe is known; the rank allows it; the materials and coin are in the inventory now) and resolves the craft at once:

- **Success**: the item is added (or a matching stack of a consumable or loot item grows), the materials are used up, the coin cost is paid when the rules say so.
- **Failure**: the materials (and the coin cost) are used up too, unless the rules say failures keep them.
- **No DC set** anywhere: the craft succeeds on the roll.
- **Materials gone** by then (traded, used, dropped): the craft is refused, nothing is made or used up.
- A **chat card** shows the result, the roll against the DC, the time, and what was used up.

Crafts for one character are handled one at a time, so two quick rolls can't spend the same stack twice.

**GM approves each craft** (switch, off by default): after the roll a card asks the GM to *Approve* or *Refuse* (*Success*, *Failure* or *Refuse* when no DC is set); nothing is made or used up until then, and everything is checked again at that moment. With it off, nothing ever waits for a GM's click.

A GM must be connected to craft and learn (their client does the writing). A player's tool check must be one d20 plus the character's own tool bonus as dnd5e works it out, including dice bonuses from effects on the character (e.g. 1d4); a roll with a situational bonus, dice typed in the roll dialog or another ability is refused with the reason (with *GM approves each craft* on, it goes to the GM's card with the reason instead). The d20's face itself can't be checked: see *Rolls and honesty* in the README, and turn on GM approval if that matters at your table.

## What it writes

- World settings: `recipeBook` (the recipes) and `craftRules`.
- On characters: `flags.wanderers-guild.recipes` (known recipe ids).
- On items: `flags.wanderers-guild.teaches` (`{ v, recipe, consume }`: the recipe item mark, set by the GM on world items); used-up recipe items are lowered or deleted.
- Learn cards (`flags.wanderers-guild.learn`).
- On the character's items: the crafted item, lowered or deleted material stacks, and the coin (`system.currency`, or the toolkit's payment).
- Chat: the craft cards and short notices (`flags.wanderers-guild.craft` / `.notice`), and a mark on each tool check roll used for a craft (`flags.wanderers-guild.craftRoll` / `.rollUsed`).

The setup window's **Data** page removes all of it (cards and notices are deleted; rolls keep their dice, only our mark goes). Crafted items stay: they are ordinary items.
