/**
 * The building kit: primitives placed in world space and merged by
 * material, so a facility of twenty furnished rooms is a few dozen draw
 * calls instead of thousands.
 *
 * Every piece gets a vertex colour (the `paint`, `gloss`, `glow` and `led`
 * materials read it; the rest ignore it) and world-space UVs, so concrete
 * and tile run continuously across neighbouring boxes. Screens keep their
 * own 0..1 UVs, because a display is a picture, not a surface.
 *
 * Coordinates: the floor plan's buffer pixels are world units. Buffer x is
 * world x, buffer y is world z, both centred on the facility; y is up.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PW, PH } from '../../config/floorplan.js';

export const wx = (x) => x - PW / 2;
export const wz = (y) => y - PH / 2;

/** Project UVs from world position along the dominant normal axis. */
function worldUV(g, s) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * s; uv[i * 2 + 1] = v * s;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Per-material texture scale: how many world units one texture tile covers. */
const UV_SCALE = { labfloor: 1 / 140, epoxy: 1 / 140, cladding: 1 / 64, foam: 1 / 16, panel: 1 / 40, floor: 1 / 96, timber: 1 / 110, carpet: 1 / 70, atrium: 1 / 160, grate: 1 / 48, ground: 1 / 220, wall: 1 / 120, plinth: 1 / 80, wood: 1 / 40, trim: 1 / 30, steel: 1 / 30, black: 1 / 30, copper: 1 / 30 };

const tmpColor = new THREE.Color();

export class Kit {
  constructor(mat) { this.mat = mat; this.buckets = new Map(); }

  /**
   * Add a geometry already in world space.
   * opts: colour (hex or Color), a (alpha multiplier on colour, for additive pools), cast, receive, uv ('world'|'local')
   */
  add(geo, key, { colour = '#ffffff', a = 1, cast = true, receive = true, uv = 'world' } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (geo !== g) geo.dispose();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    tmpColor.set(colour).multiplyScalar(a);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = tmpColor.r; col[i * 3 + 1] = tmpColor.g; col[i * 3 + 2] = tmpColor.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const base = key.split(':')[0];
    if (uv === 'world') worldUV(g, UV_SCALE[base] ?? 1 / 40);
    else if (!g.attributes.uv) worldUV(g, 1 / 40);
    const bk = `${key}|${cast ? 1 : 0}${receive ? 1 : 0}`;
    let b = this.buckets.get(bk);
    if (!b) { b = { key, cast, receive, list: [] }; this.buckets.set(bk, b); }
    b.list.push(g);
    return g;
  }

  /** A box by size and centre. rot: [rx, ry, rz]. */
  box(w, h, d, x, y, z, key, opts = {}) {
    const g = new THREE.BoxGeometry(Math.max(0.05, w), Math.max(0.05, h), Math.max(0.05, d));
    if (opts.rot) { g.rotateX(opts.rot[0] || 0); g.rotateY(opts.rot[1] || 0); g.rotateZ(opts.rot[2] || 0); }
    g.translate(x, y, z);
    return this.add(g, key, opts);
  }
  /** A box standing on y0 (bottom face), centred on x,z. */
  block(w, h, d, x, y0, z, key, opts = {}) { return this.box(w, h, d, x, y0 + h / 2, z, key, opts); }
  cyl(rTop, rBot, h, x, y, z, key, opts = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, opts.seg || 14, 1, !!opts.open);
    if (opts.rot) { g.rotateX(opts.rot[0] || 0); g.rotateY(opts.rot[1] || 0); g.rotateZ(opts.rot[2] || 0); }
    g.translate(x, y, z);
    return this.add(g, key, opts);
  }
  sphere(r, x, y, z, key, opts = {}) {
    const g = new THREE.IcosahedronGeometry(r, opts.detail ?? 1);
    if (opts.scale) g.scale(...opts.scale);
    if (opts.rot) { g.rotateX(opts.rot[0] || 0); g.rotateY(opts.rot[1] || 0); g.rotateZ(opts.rot[2] || 0); }
    g.translate(x, y, z);
    return this.add(g, key, opts);
  }
  torus(r, tube, x, y, z, key, opts = {}) {
    const g = new THREE.TorusGeometry(r, tube, 6, opts.seg || 24, opts.arc || Math.PI * 2);
    if (opts.rot) { g.rotateX(opts.rot[0] || 0); g.rotateY(opts.rot[1] || 0); g.rotateZ(opts.rot[2] || 0); }
    g.translate(x, y, z);
    return this.add(g, key, opts);
  }
  /** A flat picture facing +z (towards the viewer), for displays. */
  face(w, h, x, y, z, key, opts = {}) {
    const g = new THREE.PlaneGeometry(w, h);
    if (opts.rot) { g.rotateX(opts.rot[0] || 0); g.rotateY(opts.rot[1] || 0); g.rotateZ(opts.rot[2] || 0); }
    g.translate(x, y, z);
    return this.add(g, key, { cast: false, uv: 'local', ...opts });
  }
  /**
   * A side profile (a THREE.Shape in x/y) extruded along z and bevelled — for bodies with a silhouette, like the car.
   * The shape's origin lands at (x, y, z); depth is centred on z.
   */
  extrude(shape, depth, x, y, z, key, opts = {}) {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: opts.bevel ?? 1.2, bevelSize: opts.bevel ?? 1.2, bevelSegments: opts.segs ?? 3, curveSegments: 16 });
    g.translate(0, 0, -depth / 2);
    // An optional warp in shape space — the car narrows toward its nose and tail and toward its roof.
    if (opts.warp) { const pos = g.attributes.position, v = []; for (let i = 0; i < pos.count; i++) { v[0] = pos.getX(i); v[1] = pos.getY(i); v[2] = pos.getZ(i); opts.warp(v); pos.setXYZ(i, v[0], v[1], v[2]); } g.computeVertexNormals(); }
    if (opts.rot) { g.rotateX(opts.rot[0] || 0); g.rotateY(opts.rot[1] || 0); g.rotateZ(opts.rot[2] || 0); }
    g.translate(x, y, z);
    return this.add(g, key, opts);
  }
  /** A flat quad lying on the floor (y up), for pools of light and rugs that need local UVs. */
  flat(w, d, x, y, z, key, opts = {}) {
    const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); g.translate(x, y, z);
    return this.add(g, key, { cast: false, receive: false, uv: 'local', ...opts });
  }

  /** Merge every bucket into one mesh and add them to `parent`. */
  build(parent) {
    const out = [];
    for (const b of this.buckets.values()) {
      const merged = mergeGeometries(b.list, false);
      for (const g of b.list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, this.mat(b.key));
      m.castShadow = b.cast; m.receiveShadow = b.receive;
      m.matrixAutoUpdate = false; m.updateMatrix();
      if (m.material.transparent) m.renderOrder = 2;
      parent.add(m); out.push(m);
    }
    this.buckets.clear();
    return out;
  }
}
