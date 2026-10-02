/**
 * THE ARCANE, as a place.
 *
 * The same floor plan, the same furniture placements and the same crew
 * simulation that drove the pixel floor, built as a lit three-dimensional
 * facility: twenty cut-away rooms on a machined plinth, service corridors
 * and an atrium with the core at its centre, inside a larger hall that
 * fades into haze.
 *
 * What is real here is what the operating system says: a room's front
 * edge and door frame are lit by its state (core/roomstate.js), its
 * practical light brightens while its agent works, the crew walk where
 * the sim sends them, the core warms when something needs the operator.
 * Nothing on the floor is decoration pretending to be data.
 *
 * Two modes. On the floor the camera is the operator's: drag, zoom, click
 * a room to walk into it. Under any other view the world keeps running as
 * that room's environment — the camera settles on the room the view
 * belongs to, renders small and slow, and the interface sits over it.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ROOM_BY_ID, WINGS, WING_BY_ID, AGENTS } from '@arcane/config';
import { PW, PH, PLAN, PLAN_BY_ID, CORR_X, CORR_WIDTH, HALL_Y, HALL_H, MARGIN, DOOR_W, WALL, PLAZA, WINGS_BOTTOM, roomAt } from '../../config/floorplan.js';
import { ROOM_PROPS } from '../../config/props.js';
import { createMaterials, accentOf, TONE } from './materials.js';
import { Kit, wx, wz } from './kit.js';
import { buildProp, shade } from './props3d.js';
import { ROOM_STYLE, DRESSING } from './rooms3d.js';

const WH = 46;              // wall height; a person is ~24
const LOW = 10;             // the cut-away front walls
const FOV = 30;
const PITCH = 0.94;         // ~54 degrees down: the three-quarter view of the references
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
const ease = (t) => 1 - Math.pow(1 - t, 3);

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGL2RenderingContext && c.getContext('webgl2')); } catch { return false; }
}

export class FacilityWorld {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} hud  the label layer over the canvas
   * @param {{ quality?: 'high'|'low' }} opts
   */
  constructor(canvas, hud, { quality = 'high' } = {}) {
    this.canvas = canvas; this.hud = hud; this.quality = quality;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.12;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    // Only the crew move, so the shadow map is redrawn every other frame, not every frame.
    r.shadowMap.autoUpdate = false; this.frames = 0;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#06080b');
    // Haze is relative to the camera: the facility stays clear, the hall beyond it falls away.
    this.scene.fog = new THREE.Fog('#06080b', 1200, 4000);
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.16;
    pmrem.dispose();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 10, 7000);
    this.lib = createMaterials(r);
    this.rooms = {};
    this.mode = 'floor';
    this.t = 0;
    this.rig = { tx: 0, tz: 40, dist: 1500, yaw: 0, pitch: PITCH };
    this.goal = { ...this.rig };
    this.pointer = { x: 0, y: 0 };
    this.hover = null; this.selected = null; this.attention = 'idle';
    this.build();
    this.lights();
    this.crew();
    this.dust();
    this.labels();
    if (quality === 'high') {
      this.composer = new EffectComposer(r);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.5, 0.9);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.lastRender = 0;
    this.born = null;   // when the arrival move started
  }

  /* ============================================================
     THE BUILDING
     ============================================================ */

  build() {
    const k = new Kit(this.lib.mat);
    const pools = [];
    this.static = new THREE.Group(); this.scene.add(this.static);

    // The hall the facility stands in: a ground that runs into haze, a machined plinth, its lit edge.
    k.block(6000, 2, 6000, 0, -14, 0, 'ground', { cast: false });
    const PWm = PW - 2 * MARGIN + 28, PHm = PH - 2 * MARGIN + 28;
    k.block(PWm, 10, PHm, 0, -12, 0, 'plinth');
    k.block(PWm + 10, 2, PHm + 10, 0, -14, 0, 'black', { cast: false });
    for (const [w, d, x, z] of [[PWm, 0.6, 0, PHm / 2], [PWm, 0.6, 0, -PHm / 2], [0.6, PHm, PWm / 2, 0], [0.6, PHm, -PWm / 2, 0]]) k.box(w, 0.6, d, x, -2.2, z, 'glow', { colour: TONE.cyan, a: 0.35, cast: false });

    // Corridors: steel grating either side, the stone atrium between, the hall across, a passage to every door.
    const top = -0.5;
    const grate = (x, y, w, h) => k.block(w, 1.5, h, wx(x + w / 2), top - 1.5, wz(y + h / 2), 'grate', { cast: false });
    grate(CORR_X[0], MARGIN, CORR_WIDTH[0], WINGS_BOTTOM + 8 - MARGIN);
    grate(CORR_X[2], MARGIN, CORR_WIDTH[2], WINGS_BOTTOM + 8 - MARGIN);
    grate(CORR_X[0], HALL_Y, CORR_X[2] + CORR_WIDTH[2] - CORR_X[0], HALL_H);
    k.block(CORR_WIDTH[1], 1.5, PH - 2 * MARGIN, wx(CORR_X[1] + CORR_WIDTH[1] / 2), -1.7, wz(PH / 2), 'atrium', { cast: false });
    for (const p of PLAN) { const [px, py, pw, ph] = p.passage; if (pw > 0) grate(px, py, pw, ph); }
    // Cable trunks along the corridor edges, lamp posts down their length.
    for (const c of [0, 2]) {
      const x = CORR_X[c], len = WINGS_BOTTOM - MARGIN, zc = wz(MARGIN + len / 2);
      for (const ex of [x + 3, x + CORR_WIDTH[c] - 3]) k.cyl(1, 1, len, wx(ex), 0.5, zc, 'black', { rot: [Math.PI / 2, 0, 0], seg: 6, cast: false });
      for (let y = MARGIN + 40; y < WINGS_BOTTOM; y += 96) {
        const lx = wx(x + CORR_WIDTH[c] / 2), lz = wz(y);
        if (y > HALL_Y - 6 && y < HALL_Y + HALL_H + 6) continue;
        k.cyl(0.6, 0.9, 18, lx, 9, lz, 'black', { seg: 8 });
        k.box(5, 1, 2, lx, 18.5, lz, 'black'); k.box(4, 0.4, 1.4, lx, 17.9, lz, 'glow', { colour: TONE.warm, cast: false });
        pools.push({ x: lx, z: lz, r: 22, colour: TONE.warm, a: 0.2, kind: 'floor', y: -0.4 });
      }
    }
    // Atrium guide lights: a line of small amber points down both edges, like runway lights.
    for (let y = MARGIN + 12; y < PH - MARGIN; y += 22) for (const ex of [CORR_X[1] + 5, CORR_X[1] + CORR_WIDTH[1] - 5]) k.box(1.2, 0.4, 1.2, wx(ex), -0.1, wz(y), 'glow', { colour: TONE.amber, a: 0.6, cast: false });

    this.buildPlaza(k, pools);
    for (const p of PLAN) this.buildRoom(k, p, pools);
    this.buildHall(k, pools);

    // Every pool of light is one additive quad; the whole building's light spill is one draw.
    for (const pl of pools) {
      if (pl.kind === 'wall') k.face(pl.r * 2, pl.r * 1.3, pl.x, pl.y, pl.z, 'pool', { colour: pl.colour, a: pl.a });
      else k.flat(pl.r * 2, pl.r * 2, pl.x, (pl.y || 0) + 0.18, pl.z, 'pool', { colour: pl.colour, a: pl.a });
    }
    this.meshes = k.build(this.static);
  }

  buildRoom(k, p, pools) {
    const room = ROOM_BY_ID[p.id];
    const [x, y, w, h] = p.rect;
    const X0 = wx(x), Z0 = wz(y), X1 = wx(x + w), Z1 = wz(y + h), cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2, T = WALL;
    const accent = accentOf(room.accent || WING_BY_ID[room.wing]?.accent);
    const style = ROOM_STYLE[p.id] || {};
    const light = style.light ? mix(style.light, accent, 0.1) : mix(TONE.warm, accent, 0.38);
    const doorZ = wz(p.door[1]), gap = DOOR_W + 6;
    const mid = Z0 + h * 0.52;

    // Floor slab — a different floor in each wing: sealed tile where things are made, oiled timber where
    // decisions are taken, a dark wool carpet where people read and rest — and the back wall, capped with steel.
    const FLOOR = { command: 'timber', knowledge: 'carpet' };
    k.block(w, 2.2, h, cx, -2.2, cz, style.floor || FLOOR[room.wing] || 'floor', { cast: false });
    k.block(w, WH, T, cx, 0, Z0 + T / 2, 'wall');
    k.block(w + 0.6, 1.2, T + 0.8, cx, WH, Z0 + T / 2, 'trim');
    // Side walls step down from full height to the cut-away, so the room reads as a room and its inside stays visible.
    for (const side of ['left', 'right']) {
      const xw = side === 'left' ? X0 + T / 2 : X1 - T / 2;
      const door = p.side === side;
      const tallEnd = door ? doorZ - gap / 2 : mid;
      k.block(T, WH, tallEnd - Z0 - T, xw, 0, (Z0 + T + tallEnd) / 2, 'wall');
      k.block(T + 0.8, 1.2, tallEnd - Z0 - T, xw, WH, (Z0 + T + tallEnd) / 2, 'trim');
      k.block(T + 0.6, WH, 1.2, xw, 0, tallEnd, 'steel');           // the column where the wall steps down
      const lowStart = door ? doorZ + gap / 2 : mid;
      k.block(T, LOW, Z1 - lowStart, xw, 0, (lowStart + Z1) / 2, 'wall');
      k.block(T + 0.6, 0.8, Z1 - lowStart, xw, LOW, (lowStart + Z1) / 2, 'trim');
      if (door) { k.block(T + 1.2, 26, 1.4, xw, 0, doorZ + gap / 2, 'steel'); k.block(T + 1.2, 2, gap + 1.4, xw, 24, doorZ, 'steel'); }
    }
    k.block(w, LOW, T, cx, 0, Z1 - T / 2, 'wall');
    k.block(w + 0.6, 0.8, T + 0.6, cx, LOW, Z1 - T / 2, 'trim');

    // The back wall's services: a baseboard, two pipe runs on brackets, the light bar that lights the room.
    const inner = Z0 + T;
    k.block(w - 2 * T, 2.4, 0.8, cx, 0, inner + 0.4, 'black', { cast: false });
    k.cyl(1.3, 1.3, w - 2 * T, cx, WH - 6, inner + 2.2, 'copper', { rot: [0, 0, Math.PI / 2], seg: 10 });
    k.cyl(0.8, 0.8, w - 2 * T, cx, WH - 9.5, inner + 1.6, 'steel', { rot: [0, 0, Math.PI / 2], seg: 8 });
    for (let bx = X0 + 18; bx < X1 - 10; bx += 34) k.box(1.2, 6, 3, bx, WH - 7.5, inner + 1.5, 'black');
    k.box(w * 0.46, 1.4, 4.5, cx, WH - 2.5, inner + 2.6, 'black');
    k.box(w * 0.44, 0.3, 3.2, cx, WH - 3.3, inner + 2.8, 'glow', { colour: light.getStyle(), cast: false });
    pools.push({ x: cx, z: inner + 0.6, r: w * 0.36, colour: light.getStyle(), a: 0.22, kind: 'wall', y: WH - 14 });
    pools.push({ x: cx, z: cz, r: Math.max(w, h) * 0.45, colour: light.getStyle(), a: 0.045, kind: 'floor' });

    this.finishRoom(k, p, { X0, X1, Z0, Z1, cx, cz, w, h, inner, doorZ, gap, mid, style, light, pools });

    const props = ROOM_PROPS[p.id];
    const pctx = { id: p.id, ox: X0, oz: Z0, rw: w, backZ: inner, WH, accent, pools };
    for (const prop of props.props) buildProp(k, prop, pctx);
    for (const prop of DRESSING[p.id] || []) buildProp(k, prop, pctx);
    const hang = style.pendants || [[w * 0.32, 70], [w * 0.68, 70]];
    for (const [px, py] of hang) buildProp(k, { type: 'pendant', x: px, y: py, w: 0, h: 0, opts: { colour: light.getStyle(), y: 32 } }, pctx);

    // The live parts of the room: its state strip, the door glow, the selection frame, the practical light.
    const stateMat = new THREE.MeshBasicMaterial({ color: TONE.green, toneMapped: false, transparent: true });
    const group = new THREE.Group(); this.scene.add(group);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w - 14, 0.7, 1), stateMat); strip.position.set(cx, LOW + 1, Z1 - T / 2); group.add(strip);
    const doorX = p.side === 'left' ? X0 + T / 2 : X1 - T / 2;
    for (const dz of [-1, 1]) { const g = new THREE.Mesh(new THREE.BoxGeometry(T + 1.4, 22, 0.6), stateMat); g.position.set(doorX, 11, doorZ + dz * (gap / 2 - 0.4)); group.add(g); }
    const frameGeo = new THREE.BufferGeometry().setFromPoints([[X0 + 2, Z0 + 2], [X1 - 2, Z0 + 2], [X1 - 2, Z1 - 2], [X0 + 2, Z1 - 2], [X0 + 2, Z0 + 2]].map(([a, b]) => new THREE.Vector3(a, 0.4, b)));
    const frame = new THREE.Line(frameGeo, new THREE.LineBasicMaterial({ color: TONE.cold, transparent: true, opacity: 0, toneMapped: false }));
    group.add(frame);
    const lamp = new THREE.PointLight(light, 0, 240, 2);
    lamp.position.set(cx, WH - 8, Z0 + h * 0.42);
    if (this.quality === 'high') group.add(lamp);
    this.rooms[p.id] = { p, room, cx, cz, X0, X1, Z0, Z1, strip, stateMat, frame, lamp, base: 4200, level: 0, colour: TONE.green, pulse: false };
  }

  /**
   * The inside of a room's walls and the edge of its floor: a lining where the room has one (pale cladding,
   * dark metal), otherwise panel seams and a rail on the concrete; skirting on every wall; a fine line inset
   * round the floor. Small, regular, and what makes a room read as finished rather than built.
   */
  finishRoom(k, p, { X0, X1, Z0, Z1, cx, cz, w, h, inner, doorZ, gap, mid, style }) {
    const T = WALL;
    const sides = ['left', 'right'].map((side) => {
      const tallEnd = p.side === side ? doorZ - gap / 2 : mid;
      return { side, x: side === 'left' ? X0 + T : X1 - T, dir: side === 'left' ? 1 : -1, z0: inner, z1: tallEnd, lowStart: p.side === side ? doorZ + gap / 2 : mid };
    });
    if (style.lining) {
      k.block(w - 2 * T, WH - 3.4, 0.6, cx, 2.4, inner + 0.3, style.lining, { cast: false });
      for (const sd of sides) k.block(0.6, WH - 3.4, sd.z1 - sd.z0, sd.x + sd.dir * 0.3, 2.4, (sd.z0 + sd.z1) / 2, style.lining, { cast: false });
    } else {
      for (let x = X0 + T + 32; x < X1 - T - 8; x += 32) k.box(0.3, WH - 6, 0.25, x, WH / 2, inner + 0.12, 'black', { cast: false });
      for (const sd of sides) for (let z = sd.z0 + 24; z < sd.z1 - 4; z += 24) k.box(0.25, WH - 6, 0.3, sd.x + sd.dir * 0.12, WH / 2, z, 'black', { cast: false });
    }
    k.box(w - 2 * T, 0.6, 0.7, cx, 15, inner + 0.7, 'trim', { cast: false });
    for (const sd of sides) {
      k.box(0.7, 0.6, sd.z1 - sd.z0, sd.x + sd.dir * 0.7, 15, (sd.z0 + sd.z1) / 2, 'trim', { cast: false });
      k.block(0.8, 2.4, sd.z1 - sd.z0, sd.x + sd.dir * 0.4, 0, (sd.z0 + sd.z1) / 2, 'black', { cast: false });
      k.block(0.8, 2, Z1 - T - sd.lowStart, sd.x + sd.dir * 0.4, 0, (sd.lowStart + Z1 - T) / 2, 'black', { cast: false });
    }
    k.block(w - 2 * T, 2, 0.8, cx, 0, Z1 - T - 0.4, 'black', { cast: false });
    // The floor's inset line, a hand's width in from the walls.
    const ix0 = X0 + T + 5, ix1 = X1 - T - 5, iz0 = inner + 5, iz1 = Z1 - T - 5;
    for (const [lw, ld, lx, lz] of [[ix1 - ix0, 0.35, (ix0 + ix1) / 2, iz0], [ix1 - ix0, 0.35, (ix0 + ix1) / 2, iz1], [0.35, iz1 - iz0, ix0, (iz0 + iz1) / 2], [0.35, iz1 - iz0, ix1, (iz0 + iz1) / 2]]) k.block(lw, 0.05, ld, lx, 0.01, lz, 'trim', { cast: false, receive: false });
  }

  /** The plaza where the hall crosses the atrium: the core of the system, standing on a pedestal in a shaft of light. */
  buildPlaza(k, pools) {
    const [x, y, w, h] = PLAZA;
    const cx = wx(x + w / 2), cz = wz(HALL_Y + HALL_H / 2);
    this.coreAt = new THREE.Vector3(cx, 0, cz);
    k.block(w - 4, 0.5, h - 4, cx, -0.4, wz(y + h / 2), 'black', { cast: false });
    k.cyl(34, 36, 2.5, cx, 0.6, cz, 'black', { seg: 48 });
    k.cyl(30, 30, 0.4, cx, 1.95, cz, 'trim', { seg: 48 });
    k.torus(28, 0.35, cx, 2.1, cz, 'glow', { colour: TONE.violet, a: 0.7, rot: [Math.PI / 2, 0, 0], seg: 64, cast: false });
    k.cyl(12, 16, 9, cx, 6.5, cz, 'steel', { seg: 32 });
    k.cyl(9, 9, 1.4, cx, 11.6, cz, 'black', { seg: 32 });
    // The column: a lit core inside a smoked-glass sleeve, capped.
    k.cyl(3.2, 3.2, 50, cx, 37, cz, 'glow', { colour: '#b9b0ff', seg: 16, cast: false });
    k.cyl(7.5, 7.5, 50, cx, 37, cz, 'glass', { seg: 24, cast: false });
    for (const yy of [12.5, 62]) k.cyl(9, 9, 2.4, cx, yy, cz, 'trim', { seg: 32 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.box(1.2, 50, 1.2, cx + Math.cos(a) * 8.2, 37, cz + Math.sin(a) * 8.2, 'black'); }
    // Benches and planters on the four sides, as on the pixel floor.
    for (const [dx, dz] of [[-36, -48], [36, -48], [-36, 48], [36, 48]]) {
      k.cyl(5, 4, 6, cx + dx, 3, cz + dz, 'ceramic', { seg: 12 });
      for (let i = 0; i < 4; i++) k.sphere(4.5, cx + dx + (i - 1.5) * 1.6, 9 + (i % 2) * 2, cz + dz + ((i * 7) % 3 - 1), 'leaf', { colour: ['#2f4a33', '#3c5a3a'][i % 2], detail: 0, scale: [1, 1.3, 1] });
    }
    for (const dz of [-30, 30]) k.block(26, 4, 6, cx, 0, cz + dz, 'black');
    // The light the core throws on the stone.
    pools.push({ x: cx, z: cz, r: 90, colour: TONE.violet, a: 0.32, kind: 'floor', y: -0.2 });
    pools.push({ x: cx, z: cz, r: 40, colour: '#c6bfff', a: 0.4, kind: 'floor', y: 2.2 });

    // The live part: three rings turning round the column.
    this.core = new THREE.Group(); this.core.position.copy(this.coreAt); this.scene.add(this.core);
    this.coreRings = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(13 + i * 4.5, 0.32, 6, 96), new THREE.MeshBasicMaterial({ color: i === 1 ? TONE.cyan : TONE.violet, toneMapped: false, transparent: true, opacity: 0.85 }));
      m.position.y = 26 + i * 12; m.rotation.x = Math.PI / 2 + (i - 1) * 0.28; this.core.add(m); return m;
    });
    this.coreLight = new THREE.PointLight('#8f80ee', 9000, 380, 2);
    this.coreLight.position.set(0, 40, 0); this.core.add(this.coreLight);
  }

  /** Beyond the plinth: columns, trusses, tanks and pipe runs — the larger machine the facility sits in. */
  buildHall(k, pools) {
    const hx = PW / 2 + 70, hz = PH / 2 + 60;
    const column = (x, z, h = 150) => {
      k.block(16, h, 16, x, -12, z, 'wall');
      k.block(18, 3, 18, x, h - 16, z, 'trim');
      k.block(17, 1, 17, x, 30, z, 'steel');
      k.box(6, 1, 3, x, 46, z + (z < 0 ? 9 : -9), 'glow', { colour: TONE.warm, cast: false });
      pools.push({ x, z: z + (z < 0 ? 8.2 : -8.2), r: 26, colour: TONE.warm, a: 0.3, kind: 'wall', y: 40 });
    };
    for (let x = -hx; x <= hx; x += 160) column(x, -hz);
    for (let z = -hz + 160; z < hz; z += 160) { column(-hx, z, 110); column(hx, z, 110); }
    // Trusses over the back of the hall, and a gantry of pipes along the north.
    k.block(hx * 2 + 16, 6, 6, 0, 120, -hz, 'black');
    for (let x = -hx; x < hx; x += 40) k.box(1, 30, 1, x + 20, 105, -hz, 'black', { rot: [0, 0, x % 80 ? 0.6 : -0.6] });
    for (const [yy, r, key] of [[64, 4, 'copper'], [74, 2.6, 'steel'], [82, 2, 'copper']]) k.cyl(r, r, hx * 2, 0, yy, -hz + 14, key, { rot: [0, 0, Math.PI / 2], seg: 12 });
    // Storage tanks and plant behind the north wall, half lost in the haze.
    for (const [x, rad, ht] of [[-420, 36, 110], [-340, 26, 80], [300, 40, 130], [390, 28, 90], [-120, 22, 70]]) {
      const z = -hz - 90 - rad;
      k.cyl(rad, rad, ht, x, ht / 2 - 12, z, 'steel', { seg: 28 });
      k.cyl(rad + 1, rad + 1, 3, x, ht * 0.35, z, 'black', { seg: 28 });
      k.cyl(rad + 0.6, rad + 0.6, 1.2, x, ht * 0.7, z, 'glow', { colour: TONE.cyan, a: 0.4, seg: 28, cast: false });
    }
    // Low equipment along both flanks: crates, consoles, a lit service bay.
    for (const side of [-1, 1]) for (let z = -hz + 80; z < hz - 40; z += 120) {
      const x = side * (PW / 2 - MARGIN + 34);
      k.block(18, 12, 26, x, -12, z, 'black');
      k.box(0.4, 4, 18, x - side * 9.3, -2, z, 'glow', { colour: z % 240 ? TONE.cyan : TONE.amber, a: 0.4, cast: false });
    }
  }

  /* ============================================================
     LIGHT
     ============================================================ */

  lights() {
    this.scene.add(new THREE.HemisphereLight('#aebdd4', '#1a140f', 0.6));
    // The key: a cool overhead from the back left, the one light that casts shadows, so every prop sits on the floor.
    const key = this.key = new THREE.DirectionalLight('#cfdcf0', 1.55);
    key.position.set(-360, 900, -520); key.target.position.set(40, 0, 60);
    key.castShadow = true;
    const S = this.quality === 'high' ? 4096 : 2048;
    key.shadow.mapSize.set(S, S);
    Object.assign(key.shadow.camera, { left: -700, right: 700, top: 560, bottom: -560, near: 200, far: 2200 });
    key.shadow.bias = -0.00035; key.shadow.normalBias = 0.6; key.shadow.radius = 3;
    this.scene.add(key, key.target);
    // A warm low fill from the front right, so the cut-away faces are never dead black.
    const fill = new THREE.DirectionalLight('#ffd2a8', 0.55);
    fill.position.set(500, 260, 800); this.scene.add(fill);
  }

  /* ============================================================
     THE CREW
     ============================================================ */

  crew() {
    this.figures = {};
    const dark = new THREE.MeshStandardMaterial({ color: '#1b1e23', roughness: 0.7, metalness: 0.3 });
    const helm = new THREE.MeshStandardMaterial({ color: '#2c3036', roughness: 0.35, metalness: 0.6 });
    const ringGeo = new THREE.RingGeometry(5, 6.2, 40);
    for (const a of AGENTS) {
      const big = a.kind === 'arcane' ? 1.16 : 1;
      const body = new THREE.MeshStandardMaterial({ color: shade(a.colour, 0.55), roughness: 0.62, metalness: 0.15 });
      const glow = new THREE.MeshBasicMaterial({ color: a.colour, toneMapped: false });
      const g = new THREE.Group(); g.scale.setScalar(big);
      const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
      const hipL = new THREE.Group(), hipR = new THREE.Group(); hipL.position.set(-1.6, 10, 0); hipR.position.set(1.6, 10, 0); g.add(hipL, hipR);
      for (const hip of [hipL, hipR]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(2.4, 10, 2.6), dark); leg.position.y = -5; leg.castShadow = true; hip.add(leg); }
      part(new THREE.BoxGeometry(7.2, 9, 4.4), body, 0, 14.5, 0);
      part(new THREE.BoxGeometry(7.6, 1.6, 4.8), dark, 0, 10.4, 0);
      const chest = part(new THREE.BoxGeometry(3, 0.8, 0.3), glow, 0, 16.5, 2.3); chest.castShadow = false;
      const shL = new THREE.Group(), shR = new THREE.Group(); shL.position.set(-4.6, 18.4, 0); shR.position.set(4.6, 18.4, 0); g.add(shL, shR);
      for (const sh of [shL, shR]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(1.9, 8.4, 2.2), body); arm.position.y = -4; arm.castShadow = true; sh.add(arm); }
      part(new THREE.BoxGeometry(4.8, 4.8, 4.8), helm, 0, 21.8, 0);
      const visor = part(new THREE.BoxGeometry(4, 1.3, 0.4), glow, 0, 22.2, 2.45); visor.castShadow = false;
      if (a.kind === 'arcane') { const halo = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.28, 6, 40), glow); halo.rotation.x = Math.PI / 2; halo.position.y = 27.5; g.add(halo); }
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: a.colour, toneMapped: false, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.35;
      const root = new THREE.Group(); root.add(g, ring); this.scene.add(root);
      this.figures[a.id] = { root, g, hipL, hipR, shL, shR, ring, glow, phase: Math.random() * 6, yaw: 0, x: null, z: null };
    }
  }

  /* ============================================================
     ATMOSPHERE
     ============================================================ */

  dust() {
    const n = this.quality === 'high' ? 700 : 260;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * PW * 0.9; pos[i * 3 + 1] = Math.random() * 140; pos[i * 3 + 2] = (Math.random() - 0.5) * PH * 0.9; seed[i] = Math.random(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.dustMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
      vertexShader: `uniform float uTime; uniform float uScale; attribute float aSeed; varying float vA;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + uTime * (0.6 + aSeed * 1.4), 140.0);
          p.x += sin(uTime * 0.11 + aSeed * 40.0) * 9.0; p.z += cos(uTime * 0.09 + aSeed * 23.0) * 9.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.8 + aSeed * 1.6) * uScale * (900.0 / -mv.z);
          vA = (0.25 + 0.75 * fract(aSeed * 7.13)) * smoothstep(0.0, 20.0, p.y) * (1.0 - smoothstep(100.0, 140.0, p.y));
        }`,
      fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(1.0, 0.92, 0.82), (0.5 - d) * vA * 0.28); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.scene.add(new THREE.Points(g, this.dustMat));
  }

  /* ============================================================
     LABELS — the room plates, in DOM so they stay crisp
     ============================================================ */

  labels() {
    this.hud.innerHTML = '';
    for (const p of PLAN) {
      const room = ROOM_BY_ID[p.id], wing = WING_BY_ID[room.wing];
      const el = document.createElement('div');
      el.className = 'rl'; el.dataset.room = p.id;
      const code = `${wing?.no || 'A'}·${String(p.row + 1).padStart(2, '0')}`;
      el.innerHTML = `<span class="rl-plate"><i class="rl-lamp"></i><b>${room.name}</b><span class="rl-code">${code}</span><span class="rl-meta"></span></span>`;
      this.hud.appendChild(el);
      this.rooms[p.id].label = el; this.rooms[p.id].meta = el.querySelector('.rl-meta');
    }
    // Wing plates above each wing.
    this.wingLabels = WINGS.map((w, i) => {
      const rooms = PLAN.filter((p) => p.wing === i && !p.annex);
      const el = document.createElement('div'); el.className = 'wl';
      el.innerHTML = `<span>${w.no}</span>${w.name}`;
      this.hud.appendChild(el);
      const xs = rooms.map((p) => p.rect[0] + p.rect[2] / 2);
      return { el, at: new THREE.Vector3(wx(xs.reduce((s, v) => s + v, 0) / xs.length), WH + 20, wz(MARGIN) - 34) };
    });
    // Name tags for the crew: shown for ARCANE always, for the others in the room under the pointer.
    this.tags = {};
    for (const a of AGENTS) { const el = document.createElement('div'); el.className = `ct${a.kind === 'arcane' ? ' cmd' : ''}`; el.innerHTML = `<i style="background:${a.colour}"></i>${a.name}`; this.hud.appendChild(el); this.tags[a.id] = el; }
  }

  /* ============================================================
     STATE FROM THE OS
     ============================================================ */

  /** Room lamps from core/roomstate.js, plus what the plates show. */
  setRoomStates(states, meta = () => '') {
    for (const [id, r] of Object.entries(this.rooms)) {
      const s = states[id]; if (!s) continue;
      r.key = s.key; r.colour = STATE_TONE[s.key] || s.colour; r.pulse = !!s.pulse;
      r.stateMat.color.set(r.colour);
      r.level = s.key === 'working' ? 1 : s.key === 'active' ? 0.75 : s.key === 'blocked' || s.key === 'attention' ? 0.85 : 0.55;
      if (r.label) {
        r.label.style.setProperty('--lamp', r.colour);
        r.label.classList.toggle('pulse', r.pulse);
        r.label.dataset.state = s.key;
        const m = meta(id); if (r.meta.textContent !== m) r.meta.textContent = m;
      }
    }
  }
  /** The system pulse ('idle' | 'active' | 'attention'): the core warms when something needs the operator. */
  setAttention(p) { this.attention = p; }
  setHover(id) { this.hover = id; }
  setSelected(id) { this.selected = id; }

  /* ============================================================
     CAMERA
     ============================================================ */

  resize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    const ratio = this.mode === 'backdrop' ? Math.min(0.75, dpr * 0.5) : Math.min(dpr, this.quality === 'high' ? 1.75 : 1.25);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(ratio); this.composer.setSize(w, h); }
    this.dustMat.uniforms.uScale.value = ratio;
    this.fitDist = this.computeFit();
  }
  computeFit() {
    const t = Math.tan((FOV * Math.PI) / 360) * 2;
    const byH = (PH * Math.sin(PITCH) * 0.98 + WH) / t;
    const byW = (PW * 1.04) / (t * this.camera.aspect);
    return Math.max(byH, byW) + 60;
  }
  /** 'fit' or a zoom step; steps match the old integer zooms in spirit: nearer, nearer, nearest. */
  setZoom(mode) {
    const f = { fit: 1, 1: 0.86, 2: 0.58, 3: 0.4, 4: 0.28 }[mode] ?? 1;
    this.goal.dist = this.fitDist * f;
    if (mode === 'fit') { this.goal.tx = 0; this.goal.tz = 22; }
  }
  zoomBy(f, clientX, clientY) {
    const next = Math.max(this.fitDist * 0.16, Math.min(this.fitDist * 1.25, this.goal.dist / f));
    // Zoom toward the point under the cursor, not the middle of the screen.
    if (clientX !== undefined) { const g = this.ground(clientX, clientY); if (g) { const k = 1 - next / this.goal.dist; this.goal.tx += (g.x - this.goal.tx) * k; this.goal.tz += (g.z - this.goal.tz) * k; } }
    this.goal.dist = next;
  }
  panBy(dx, dy) {
    const upp = (2 * this.rig.dist * Math.tan((FOV * Math.PI) / 360)) / Math.max(1, this.h);
    this.goal.tx -= dx * upp; this.goal.tz -= (dy * upp) / Math.sin(this.rig.pitch);
    this.rig.tx = this.goal.tx; this.rig.tz = this.goal.tz;
    this.clampGoal();
  }
  clampGoal() { this.goal.tx = Math.max(-PW * 0.6, Math.min(PW * 0.6, this.goal.tx)); this.goal.tz = Math.max(-PH * 0.6, Math.min(PH * 0.6, this.goal.tz)); }
  centreOn(id) { const r = this.rooms[id]; if (!r) return; this.goal.tx = r.cx; this.goal.tz = r.cz + 6; }
  /** Walk the camera into a room; resolves when it has arrived. */
  focus(id) {
    const r = this.rooms[id]; if (!r) return Promise.resolve();
    this.saved = this.saved || { ...this.goal };
    this.goal.tx = r.cx; this.goal.tz = r.cz + 4; this.goal.dist = this.fitDist * 0.26;
    return new Promise((res) => setTimeout(res, 520));
  }
  /** Back to where the operator left the floor. */
  release() { if (this.saved) { Object.assign(this.goal, this.saved); this.saved = null; } }

  /**
   * Under another view the world becomes that room's environment: a slow
   * orbit, close, rendered small. `id` null means the whole facility.
   */
  setMode(mode, id = null) {
    const was = this.mode; this.mode = mode; this.backdropRoom = id;
    if (mode === 'backdrop') {
      if (was !== 'backdrop') this.saved = this.saved || { ...this.goal };
      const r = id && this.rooms[id];
      if (r) { this.goal.tx = r.cx; this.goal.tz = r.cz; this.goal.dist = this.fitDist * 0.3; }
      else { this.goal.tx = 0; this.goal.tz = 0; this.goal.dist = this.fitDist * 0.7; }
    } else if (was === 'backdrop') this.release();
    if (this.w) this.resize(this.w, this.h, this.dpr);
  }

  ground(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -1), hit) ? hit : null;
  }
  /** The room under a screen point, through the same roomAt the sim uses. */
  pick(clientX, clientY) {
    const g = this.ground(clientX, clientY); if (!g) return null;
    return roomAt(g.x + PW / 2, g.z + PH / 2);
  }
  /** A room's centre on screen, in client pixels — for the console and the browser tests. */
  screenOf(id) {
    const r = this.rooms[id]; if (!r) return null;
    const v = new THREE.Vector3(r.cx, 0, r.cz).project(this.camera), rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
  }
  /** Where the parallax leans: -1..1 across the screen. */
  lean(nx, ny) { this.pointer.x = nx; this.pointer.y = ny; }

  /* ============================================================
     FRAME
     ============================================================ */

  frame(now, sim) {
    const t = now / 1000;
    const dt = Math.min(0.1, t - (this.t || t)); this.t = t;
    // Under a view, render small and slow; on the floor, every frame on a good machine, half of them on a modest one.
    const minGap = this.mode === 'backdrop' ? 1 / 20 : this.quality === 'high' ? 0 : 1 / 30;
    if (t - this.lastRender < minGap) return;
    const step = Math.min(0.1, t - (this.lastRender || t));
    this.lastRender = t;

    // The arrival: the camera comes down out of the haze on first load.
    if (this.born === null) this.born = t;
    const arrive = 1 - ease(Math.min(1, (t - this.born) / 2.8));

    // Camera: ease toward the goal; drift a little, lean toward the pointer.
    const k = 1 - Math.exp(-step * (this.mode === 'backdrop' ? 1.2 : 5.5));
    for (const key of ['tx', 'tz', 'dist']) this.rig[key] += (this.goal[key] - this.rig[key]) * k;
    const orbit = this.mode === 'backdrop' ? t * 0.045 : 0;
    const yaw = (this.mode === 'backdrop' ? Math.sin(orbit) * 0.22 : Math.sin(t * 0.05) * 0.012) + this.pointer.x * 0.035 - arrive * 0.25;
    const pitch = PITCH + Math.sin(t * 0.037) * 0.006 - this.pointer.y * 0.02 + arrive * 0.32 - (this.mode === 'backdrop' ? 0.12 : 0);
    const dist = this.rig.dist * (1 + arrive * 0.9);
    const c = this.camera;
    c.position.set(this.rig.tx + Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, this.rig.tz + Math.cos(yaw) * Math.cos(pitch) * dist);
    c.lookAt(this.rig.tx, 0, this.rig.tz);
    this.scene.fog.near = dist * 0.85; this.scene.fog.far = dist * 2.6;

    this.lib.tick(t);
    this.dustMat.uniforms.uTime.value = t;

    // The core: rings turn; its light warms toward amber when something needs the operator.
    this.coreRings.forEach((m, i) => { m.rotation.z += step * (0.25 + i * 0.12) * (i % 2 ? -1 : 1); m.position.y = 26 + i * 12 + Math.sin(t * 0.6 + i) * 0.8; });
    const warm = this.attention === 'attention' ? 1 : 0;
    this.coreWarm = (this.coreWarm || 0) + (warm - (this.coreWarm || 0)) * Math.min(1, step * 1.5);
    this.coreLight.color.copy(mix('#8f80ee', TONE.amber, this.coreWarm * 0.6));
    this.coreLight.intensity = 8000 + Math.sin(t * 1.1) * 900 + (this.attention === 'active' ? 1400 : 0);
    this.coreRings[1].material.color.set(this.coreWarm > 0.5 ? TONE.amber : TONE.cyan);

    // Rooms: the practical light follows the room's state; hover and selection lift it and draw the frame.
    for (const [id, r] of Object.entries(this.rooms)) {
      const focus = id === this.hover ? 1 : id === this.selected ? 0.7 : 0;
      const target = r.base * (0.45 + r.level * 0.55) * (1 + focus * 0.6);
      r.lamp.intensity += (target - r.lamp.intensity) * Math.min(1, step * 4);
      r.stateMat.opacity = r.pulse ? 0.55 + 0.45 * Math.sin(t * 3.2) : 0.9;
      r.frame.material.opacity += ((focus ? 0.55 * focus : 0) - r.frame.material.opacity) * Math.min(1, step * 8);
    }

    if (sim) this.moveCrew(sim, t, step);
    this.placeLabels();

    if (this.frames++ % 2 === 0) this.renderer.shadowMap.needsUpdate = true;
    if (this.composer && this.mode !== 'backdrop') this.composer.render(step);
    else this.renderer.render(this.scene, this.camera);
  }

  moveCrew(sim, t, dt) {
    const FACE = { front: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 };
    for (const a of sim.agents) {
      const f = this.figures[a.id]; if (!f) continue;
      const x = wx(a.x), z = wz(a.y) - 2;
      const moving = a.state === 'walk' || a.state === 'drift';
      f.root.position.set(x, 0, z);
      // Face the way the sim says, turning rather than snapping.
      let want = FACE[a.face] ?? 0; let d = want - f.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      f.yaw += d * Math.min(1, dt * 10); f.g.rotation.y = f.yaw;
      const s = moving ? Math.sin(t * 9 + f.phase) : 0;
      f.hipL.rotation.x = s * 0.55; f.hipR.rotation.x = -s * 0.55;
      f.shL.rotation.x = -s * 0.45; f.shR.rotation.x = s * 0.45;
      // Working: hands forward at the desk, a slight rhythm. Talking: a small turn of the shoulders.
      if (!moving && a.working) { f.shL.rotation.x = f.shR.rotation.x = -0.7 + Math.sin(t * 6 + f.phase) * 0.05; }
      f.g.position.y = moving ? Math.abs(Math.cos(t * 9 + f.phase)) * 0.6 : Math.sin(t * 1.6 + f.phase) * 0.15;
      if (a.talking) f.g.rotation.y += Math.sin(t * 2 + f.phase) * 0.15;
      // The ring under a figure says what it is doing: working glows its colour, walking is a faint trace, idle is nothing.
      const ringTarget = a.working ? 0.55 + Math.sin(t * 2.4 + f.phase) * 0.15 : moving ? 0.2 : a.talking ? 0.3 : 0;
      f.ring.material.opacity += (ringTarget - f.ring.material.opacity) * Math.min(1, dt * 4);
      f.glow.color.set(a.cfg.colour).multiplyScalar(a.working ? 1.2 : moving ? 1 : 0.6);
      f.x = x; f.z = z;
    }
    this.sim = sim;
  }

  placeLabels() {
    const v = new THREE.Vector3();
    const W = this.w, H = this.h;
    const show = this.mode === 'floor';
    this.hud.classList.toggle('off', !show);
    if (!show) return;
    const near = this.rig.dist < this.fitDist * 0.62;
    this.hud.classList.toggle('near', near);
    // On a small screen at a distance, only the rooms whose lamp says something keep their plate.
    this.hud.classList.toggle('compact', W < 760 && !near);
    for (const r of Object.values(this.rooms)) {
      v.set(r.cx, WH - 2, r.Z0 + WALL + 1).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      const vis = v.z < 1 && x > -200 && x < W + 200 && y > -60 && y < H + 60;
      r.label.style.transform = vis ? `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, 0)` : 'translate3d(-9999px,0,0)';
      r.label.classList.toggle('hot', r.p.id === this.hover || r.p.id === this.selected);
    }
    for (const wl of this.wingLabels) {
      v.copy(wl.at).project(this.camera);
      wl.el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * H).toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
    if (!this.sim) return;
    for (const a of this.sim.agents) {
      const el = this.tags[a.id], f = this.figures[a.id]; if (!el || f.x === null) continue;
      const on = a.cfg.kind === 'arcane' || (this.hover && a.room === this.hover) || near;
      if (!on) { el.style.transform = 'translate3d(-9999px,0,0)'; continue; }
      v.set(f.x, a.cfg.kind === 'arcane' ? 36 : 30, f.z).project(this.camera);
      el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * H).toFixed(1)}px, 0) translate(-50%, -100%)`;
      el.classList.toggle('work', !!a.working);
    }
  }
}

/** Room states in the floor's palette (core/roomstate.js keys). */
const STATE_TONE = { blocked: TONE.red, attention: TONE.amber, working: TONE.violet, active: TONE.cyan, ok: TONE.green };
