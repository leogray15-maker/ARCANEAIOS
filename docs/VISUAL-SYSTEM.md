# The visual system

THE ARCANE is drawn as a place first and an interface second. The floor is
a lit, three-dimensional building; every room's application is an
instrument installed in that building, and the building stays visible
behind it. This document is the language: what the layers are, what the
surfaces are made of, where light comes from, what colour means, and the
parts every screen is built from.

## The layers

From the back of the screen to the front:

| Layer | What it is | Where |
| --- | --- | --- |
| The hall | The space the facility stands in: a ground that falls into haze, columns, trusses, tanks and pipe runs | `render/world/world.js` `buildHall` |
| The facility | Twenty cut-away rooms on a machined plinth, corridors, the atrium, the core | `buildRoom`, `buildPlaza` |
| Light | A cool key with baked shadows, a warm fill, a light that follows the room under the pointer and the open room, pools of light on floors and walls | `lights`, the pools in `build` |
| Atmosphere | Distance haze, drifting dust, the core's light | `dust`, the fog in `frame` |
| The lens | A vignette over the floor | `#stage::after` in `ui.css` |
| Plates and instruments | Room plates on the back walls, crew tags, the floor's corner displays | `labels` in the world, `render/hud.js` |
| The view | A room's application, over a haze that takes the room's colour | `.view` in `ui.css` |
| Panels and displays | Machined surfaces holding recessed displays | the primitives below |

Under any view other than the floor, the world keeps running as that
room's environment: the camera settles on the room the view belongs to,
renders small and slow, and is dimmed behind the view's haze. Opening
THE LAB puts you in front of the lab.

## The floor is the real one

The 3D floor is built from the same data the pixel floor was:
`config/floorplan.js` for the rooms, doors and corridors,
`config/props.js` for every piece of furniture, `core/sim.js` for the
crew. Nothing about the operating system changed to draw it. Picking a
room uses the same `roomAt`; the crew walk where the sim sends them.

What is lit is what is true:

- A room's front edge and door frame carry its lamp (`core/roomstate.js`): red blocked, amber needs you, violet working, cyan active, green quiet. A blocked or waiting room pulses.
- The room under the pointer, and the room that is open, get a real light, as bright as their state.
- A figure's ring glows in its colour while it works at its station, traces faintly while it walks, and is dark when it is idle. Its visor dims when it stands.
- The core turns at the centre of the atrium and warms toward amber when something needs an answer.
- The corner displays count working, walking and standing crew, open orders, proposals, signals, lamps by colour; the movement log writes what the crew do as they do it; the heartbeat is the number of agents working, sampled every few seconds.

When the browser cannot draw WebGL2 (or `?flat` is in the URL) the floor
falls back to the pixel plan (`render/factory.js`, `render/sprites.js`),
with the same instruments over it. `?lite` forces the modest renderer.

## How the rooms are furnished

Three layers, so the shared data stays shared:

- **`config/props.js`** — what furniture a room has and where. Shared with the pixel plan and its tests; the 3D floor reads the same placements.
- **`render/world/detail3d.js`** — how a piece is built in 3D when it deserves detail: lab fridges with stocked shelves behind glass, the LN2 dewar, the analytical balance under its draught shield, the HPLC stack with solvent bottles, the fraction collector, desks with drawers, office chairs, plants with leaves, the vault door, the car (a bevelled body extruded from a side profile and pinched toward nose and tail), the two-post lift. Everything else falls back to `props3d.js`.
- **`render/world/rooms3d.js`** — what only the 3D floor adds: each room's finish (`ROOM_STYLE`: floor, wall lining, the colour of its light, its pendant lamps) and set dressing placed in the floor space the furniture leaves free (`DRESSING`: the fume hood, lab sink and safety shower; tool chests, tyre racks, an EV charger and a trolley jack in the garage; operator consoles under the screen walls; a bar in the lounge; wall shelving; floor tape). Dressing never changes what a room is or where the crew walk.

Every room also gets the same finish in `world.js` `finishRoom`: a lining or panel seams, a rail, skirting on every wall, a fine line inset round the floor.

## Materials

Richness comes from contrast between materials, never from glow. Every
3D texture is drawn once on a canvas at startup (`render/world/materials.js`)
and mapped in world units, so it runs continuously across a wall.

- **Concrete** for walls: form-lines, tie holes, staining from the top. Rooms that call for it are lined: **pale cladding** in the lab and Vitals, **dark metal panel** in the workshops and the control rooms, **acoustic foam** in BEACON's studio.
- **Resin** floors: pale in the lab, dark in the garage and the forge.
- **Sealed tile** for production floors, **oiled timber** for command, **wool carpet** for knowledge. The atrium is **polished stone** and reflects the core.
- **Brushed steel**, **black steel** and **oxidised copper** for structure, trim and pipe runs.
- **Ceramic** for cold stores and instruments, **smoked glass** for doors and display fronts, **wood** for desks and shelving.
- **Paint** and **gloss** carry per-object colour (upholstery, crates, lockers, barrels) through vertex colours, so a hundred coloured things are one draw.
- **Displays** are unlit: one canvas per kind of content (data, chart, map, wave, panel, city), tinted per screen, scrolled by a texture offset rather than redrawn.

In the interface the same idea is CSS (`ui.css`, the tokens at the top):

- `--mat-panel` — a machined surface: a lit top edge, a hairline, a shadow under it.
- `--mat-recess` — a display or input set into the surface: inset shadow, darker than its panel.
- `--mat-key` — a key: lit along the top, pressed down when clicked.
- `--mat-glass` — used only for things that float over the floor (the tip, the instruments, the navigator), never for the work.

## Light

One key light casts shadows (cool, overhead, back left), one warm fill
keeps the cut-away faces from going dead, a hemisphere carries the
ambient. Each room's light colour is warm, tinted toward the room's accent;
the room under the pointer and the open room get a real point light in that
colour, falling off with the square of distance. Most of the
"lit by real things" quality is the pools: an additive quad under every
lamp, on the wall around every screen, under every fixture. They are all
one draw.

Bloom is applied with a high threshold so only lamps and displays catch
it. Nothing is lit for decoration.

## Colour

`render/tone.js` is the one palette, shared by the interface and the 3D
floor. Neutrals carry everything; the accents are functional:

| Tone | Means |
| --- | --- |
| violet `#8f80ee` | the system itself — the core, the commander, working |
| cyan `#5ec4e2` | activity, data, focus |
| green `#4fc58a` | healthy, done, quiet |
| amber `#e0a64e` | needs the operator |
| red `#e2554f` | blocked, failed, refused |
| gold `#d4a554` | money |

A view takes its environment colour (`--env`) from the room it belongs to;
it tints the haze at the top of the view, the active tab and the bar's
underline. That is the only decorative use of colour, and it is still
information: it says where you are.

## Type

Geist for what is read; Geist Mono for what the system reports — labels,
values, IDs, time, codes. Section labels are mono, small, spaced, with an
index tick and a hairline running out. Values are mono, large, tabular,
glowing faintly in their own colour. Every view's plate carries its module
code (`C2·01 / COMMAND`), set by `route()` from the room's wing and row.

## The parts

Shared, so every screen is built from the same few things:

| Part | Class / module | Used for |
| --- | --- | --- |
| Panel | `.card`, `.venture-card`, `.state`, `.reader`, `.bridge-side` | anything that holds work |
| Display | `.stat`, `.wait`, `.metric` | a value with its label and a tint |
| Indicator | `.chip.<tone>`, `.lamp`, `.pulse`, `.dot` | a state, with a lit dot |
| Key | `button`, `button.primary`, `button.ghost` | actions; `primary` is the one backlit key that commits |
| Ledger | `table.grid`, `.order-row` | rows of records |
| Section label | `section.block > h2`, `.wrap.app h2` | annotation, not headings |
| Agent unit | `render/units.js` `agentUnit` | an agent as an entity: state, now, next, station, systems, grades |
| Command core | `render/core.js` | the Bridge's centre: rooms by lamp, agents where they are, working agents tethered |
| Evidence board | `render/intel.js` `evidenceBoard` | the watch as watched → observed → bears on |
| Chassis | `render/hud.js` `paintChassis` | the rail under a room's view: module, lamp, resident, who is here, open work |
| Floor instruments | `render/hud.js` `FloorHud` | the corner displays on the floor |

## Motion

Slow, continuous, and only where something is happening: the core's
rings, the crew, the scroll on displays, LEDs, dust, a pulse on what needs
the operator. Transitions move through the building — clicking a room
walks the camera into it before the room opens; the first load arrives
from above. `prefers-reduced-motion` turns the interface's animation off.

## Performance

What costs is pixels times lights, and anything that makes the browser re-composite the canvas.

- **Lights.** No light per room: twenty point lights made every pixel pay for all twenty. Rooms are lit by their pools, fixtures and the shared ambient; two point lights follow the hovered and the open room, plus the core's. Six lights in all.
- **Shadows.** The building never moves, so its shadow map is drawn once. The crew carry a contact shadow instead of casting into the map.
- **Resolution.** The floor renders at most at 1.25× device pixels, whatever the screen. An adaptive tier (`TIERS` in `world.js`) steps down — lower resolution, then no bloom — when frames arrive late for two seconds. A tier that proved slow is never retried, so it settles instead of hitching back and forth.
- **Frame rate.** Full rate only while the camera is moving or being moved; otherwise thirty frames a second. Under a view the world renders at a fraction of the resolution, twelve times a second, under the graph not at all.
- **Nothing blurs or blends over the canvas.** No `backdrop-filter` on anything over the floor (plates, instruments, bar, chassis), no blend-mode grain, and the backdrop under a view is dimmed, not blurred. A blur over a live canvas re-filters it every frame.
- The building is merged by material: a few dozen draw calls for twenty furnished rooms. The 3D code and Three.js are a separate chunk; the fallback never loads them.
- The graph projects each note once a frame and re-sorts by depth every eighth frame; glows are pre-rendered sprites.

## Changing it

- A room's furniture → `config/props.js` (the 3D builder reads the same placements). A new prop type needs a case in `render/world/props3d.js` (or `detail3d.js` for a detailed one) and a painter in `render/props.js` for the fallback. Dressing that only the 3D floor draws goes in `render/world/rooms3d.js`.
- A room's geometry → `config/floorplan.js`; both renderers follow.
- A material or texture → `render/world/materials.js`.
- A colour → `render/tone.js` and the tokens at the top of `ui.css`.
- What a room *means* stays in `packages/config`.
