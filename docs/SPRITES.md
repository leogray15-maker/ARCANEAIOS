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
| Crew sprite | 9×15 | **12×20** (12 wide, 16 to the crown, 20 with hat/hair/gear) | Enough for a face, a posture, and a held object |
| ARCANE | 9×15 | **14×24**, plus a 2px hooded outline and a slow violet glow | The commander reads at a glance from across the floor |
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

## Anatomy of a crew sprite (12×20)

```
row  0-3   hair / hat / hood        (identity: KEEPER has a beanie, WARDEN a peaked cap,
                                     MERIDIAN a lab visor, HERALD a headset)
row  4-7   head, 2px eyes, 1px mouth line on 'talk'
row  8-13  torso, arms; held object at rows 9-12 on the working frames
row 14-17  legs
row 18-19  feet + 1px contact shadow (drawn in the room, not the sprite)
```

Frames per facing (front, back, side; left is side mirrored at bake):
- **stand**, **step A**, **step B** — 4-beat walk cycle at 6 fps
- **work** ×2 — at a station: typing / stirring / reading, 2-frame loop at 3 fps
- **talk** ×1 — mouth line + hand raised, used during Counsel/Council
- **idle bob** is procedural: ±1px every 45 frames when standing

That is 3 facings × 6 frames = 18 matrices per agent, most of which are
edits of the stand frame. Author the front stand first, then derive.

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
