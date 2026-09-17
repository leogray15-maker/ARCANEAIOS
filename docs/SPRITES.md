# Sprites and pixel direction

The facility should feel like a place, not a diagram. That comes from
three things: figures with enough pixels to have posture, rooms with
enough objects to have a job, and light that makes the objects look like
they are in the same building. This is the spec.

## Scale

Everything is authored at **1:1 pixel space** into an offscreen buffer and
blitted at an **integer** zoom (2x / 3x / 4x) with smoothing off. Never a
fractional scale — it makes uneven pixels and shimmer.

| Thing | v2 | v3 | Why |
| --- | --- | --- | --- |
| Buffer | 640×460 | **960×640** | Room for 16px figures and dense props without crowding |
| Crew sprite | 9×15 | **16×20** (16 wide; hats and hair use the top 4 rows, face rows 4–8, jacket with zip and belt, boots) | Enough for a face, a posture, a hat, a jacket and a held object |
| ARCANE | 9×15 | **20×26**, hooded cloak with a near-black cowl and lit eyes, rim-lit hood, clasp, sigil, cloak folds, a pulsing violet pool on the floor | The commander reads at a glance from across the floor |
| Room (typical) | 138×88 | **210×120** | Props at real density; a desk is 24×14, not 9×5 |
| Corridor width | 28 | **36** | Two figures pass without overlapping |
| Door | 1 tile | **12px wide**, with frame and a 1px light spill | Doors are where the eye goes |
| Prop, small (mug, vial) | 2–4px | **4–6px** | Readable |
| Prop, medium (chair, crate, terminal) | ~10px | **14–20px** | Has a top, a side, and a shadow |
| Prop, large (rack, table, cold store, bed) | ~24px | **32–56px** | Anchors the room |

Zoom: FIT / 2x / 3x, drag-to-pan. At 2x on a 1440-wide screen the whole
960px floor is visible with 200px for the rail; at 3x you are inside a wing.

## Palette

One base palette for the building; each agent adds one identity colour.
Keep the building desaturated so the agents and the accent lights carry.

```
space      #05050a    the void behind the station
hull       #171722    outer shell
hullLit    #242433    lit edge of shell
wall       #2a2a3c    wall body
wallTop    #3e3e58    wall top lip (catches light)
wallLip    #4e4e6c    lip highlight, 1px
floor      #13131d    base floor
floorAlt   #16162a    tile alternation (very subtle, every other tile)
grate      #191926    service floor / corridors
ink        #ecebf5    text, brightest highlights
ash        #7e7c94    mid grey, secondary text
faint      #4a4860    dim grey, shadows on props
steel      #5a6070    metal props
rust       #8a5a3a    worn metal, warm decay
wood       #6b4a32    desks, shelves in the Library / Scriptorium
woodLt     #8a6644    wood highlight

accents (one per wing, plus the network's alerts):
arcane     #8b5cf6    violet — command, ARCANE, "this is the OS"
arcaneLt   #a98bff
cyan       #56c9f0    knowledge, screens, cold light
vital      #3ecf8e    life, health, ok
flare      #e8b64c    signal, warning, warm light
gold       #d9a441    treasury
rose       #e0609a    commerce
breach     #f44d52    danger, deny, breach
```

Agent colours are in `packages/config/src/agents.js` and are unique by
validator rule — on the floor, colour is identity. Each sprite palette
uses the agent colour as `c` (main), a 25% darker `d`, a 20% lighter `l`,
plus shared `o` outline (#0b0b12), `s` skin (#e7c9a8 / #b98a68 shade),
`e` visor/eye (cyan for crew, arcaneLt for ARCANE), `k`/`a` for an
accessory (dark/accent) that says what they do.

## Anatomy of a crew sprite (16×20) — as shipped in `render/sprites.js`

```
row  0-3   head kit: hair / cap / beanie / hard hat / bandana / bun / goggles / slick / bald
row  4-8   face — 2px eyes with blink cel, skin tone per agent; visor, glasses, monocle, headset, long hair paint here
row  9     neck
row 10-14  torso and arms — undershirt `u` at the collar, main `c`, shade `d`, lit `l`, jacket zip `k`; hands `g` at row 14
row 12-15  the held item (vial, clipboard, ledger, wrench, quill, tray, sextant, lens, bulb, scroll) overlays at the leading hand
row 15     belt `k` with buckle `a`
row 16-19  trousers `t`, boots `b`, feet outline; a 2px contact shadow is drawn on the floor
```

One body is authored per facing (front, back, side) with cels stand, stepA
(contact), stepB (pass), stepC (other contact) — side authors all three,
front/back derive stepC by mirroring stepA so the arm swing alternates —
plus derived blink, work and talk cels. `work` is stand with the head bowed a
pixel and the hands up at bench height; `talk` raises the left hand (items
are held in the right) and opens the mouth. Both are lists of pixel edits
per facing in `EDITS`, so kits and items still land. Identity is composed on top: the agent's colour drives
`c/d/l`, `IDENTITY[agent]` picks the head kit, hair colour, skin tone, held
item and accent. Left facing is the right facing mirrored at bake. 19 agents
× 21 frames = 399 matrices, validated by `test/sprites.test.mjs`. Review them
all at `/sheet.html` (4x, every facing and cel).

Walk: `A → B → C → B` at ~8 cels/s, the pass cel lifted 1px so the body
bobs. Idle: stand, a 1px bob now and then, a blink every 2.5–6 s. At their
own station an idle agent shows `work`; two idle agents within arm's reach
in the same room turn to face each other and alternate `talk` and stand
(`Sim.converse`). Neither changes where anyone goes.

## ARCANE (14×24)

Hooded, taller, a violet 1px rim light on the hood and shoulders that
pulses 0→1→0 over 3 seconds. Eyes are two `arcaneLt` pixels, no visible
mouth. When ARCANE is walking, a 2-frame "trail" of the hood outline at
30% alpha lags one step behind. Nothing else on the floor glows this way,
so the commander is findable in a full room.

## Props and rooms

A room is not sparse. Target **14–24 props per room**, in three sizes:
one or two large anchors, four to eight medium pieces, the rest small
detail. Every room also carries the services layer (pipes along the top
wall, two ceiling lights, a junction box, the room sign) so the building
reads as one building.

Every prop is drawn with three tones (top / side / shadow) so it has
volume, and casts a 1px shadow down-right onto the floor. Props that emit
light (screens, cold store, lamps, the Beacon's signal lamp) draw a soft
2–3 step radial on the floor under them — that is what makes a room feel
lit rather than coloured.

Wear: every room seeds a PRNG from its id and scatters 6–12 scuffs,
stains and a drain. Corridors get scuff lines in the walking direction.
Wear is stable across loads.

Room-specific anchors (so no two rooms share furniture):

| Room | Anchors | Emits light |
| --- | --- | --- |
| THE LAB | cold store, vial rack wall, HPLC bench, packing table | cold store (cyan), bench screen |
| VITALS | wall of member cards, scales, a couch | card wall (vital) |
| FORGE | workbench with a half-built device, server rack, pipe run | rack LEDs (cyan/breach) |
| THE MARKET | counter, product shelves, a till, a queue rope | shelf strip |
| BEACON | the signal lamp on a mast, a broadcast desk, a post board | the lamp (flare) — rotates |
| BRIDGE | the command table with the map, three big screens, the captain's chair | screens (arcane) |
| THE WAR ROOM | the board with pins and string, a round table | board lamp |
| THE COUNCIL | the long table, nine seats, a raised ninth | overhead (gold) |
| THE VAULT | the safe door, ledger desk, coin stacks | safe dial (gold) |
| SCRIPTORIUM | lectern, ink, stacked manuscripts, a candle | candle (flare) |
| INTELLIGENCE | corkboard wall, radio bank, headphones | radio dials |
| THE OBSERVATORY | the telescope, a dome window with stars, dials | the window (cyan) |
| THE DEAL ROOM | two chairs facing, a contract on the table, a coffee | lamp |
| THE LIBRARY | floor-to-ceiling shelves, ladder, reading table | reading lamp |
| THE LOUNGE | sofa, low table, a plant, a window | window (warm) |
| THE AGENT GARAGE | a lift with a half-built sprite on it, tool wall | welding light (cyan flicker) |
| THE CONTROL ROOM | the permission matrix as a wall of switches, a big red lever | lever (breach) |
| THE INVENTOR'S ROOM | cluttered bench, blueprints, a whiteboard | bench lamp |
| THE RECORDS | filing cabinets, a card index, a rolled-map rack | desk lamp |
| SANCTUM | a bed, a kettlebell, a window with dawn, a journal | the window (dawn gradient) |

## Motion

- Walk: 4-beat cycle, one pixel per frame at 60fps ≈ 1.5 tiles/sec. Feels
  purposeful, not frantic.
- Arrival: on reaching a station, face the anchor prop and play `work`.
- Attention: when a room's score rises, a small `flare` ping at its door.
- The Beacon lamp rotates continuously; the Observatory stars twinkle;
  the Lab cold store hums with a 1px frost line that shifts. Three ambient
  motions are enough to make the building feel alive; ten makes it noisy.

## Atmosphere (display resolution, after blit)

Vignette at 18% at the corners. Scanlines at 6% every other line. A
1px chromatic offset on the accent lights only. No bloom on text.

## Authoring

Sprites are string matrices in `apps/facility/src/render/sprites.js`
(see v2 for the format), baked once at startup to ImageBitmaps per agent
per frame. Props are painter functions in `render/props.js`. Author in a
pixel editor at 1:1 on a 12×20 grid with the palette above, then transcribe.
A `tools/sprite-sheet.mjs` (day 6) will render every agent's 18 frames to
one PNG for review.
