/**
 * The shared 3D stage every arcade game is built on.
 *
 * Drift was rebuilt in Three.js first, on its own, and doing the next seven
 * that way would have meant seven copies of the same renderer setup, the same
 * fog and light rig, and seven slightly different characters. So the parts
 * that were never really about driving live here instead: a lit, fogged stage
 * sized to a canvas, a low-poly character that can be posed, object pools, and
 * disposal that actually releases the GPU memory.
 *
 * What stays in each game's own module is only what makes that game that game
 * — its world, and how a frame of its state maps onto the world.
 *
 * Nothing here reproduces any existing title's art. The character is an
 * original blocky figure, coloured with the player's chosen arcade skin.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { Look } from './characters';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The key light. Scenes that move far from the origin must move its target. */
  sun: THREE.DirectionalLight;
}

export interface StageOptions {
  /** Sky and fog colour. Fog matching the sky is what hides the world's edge. */
  sky?: string;
  fog?: [near: number, far: number] | null;
  fov?: number;
  /** Camera position and the point it looks at. */
  camera?: [x: number, y: number, z: number];
  lookAt?: [x: number, y: number, z: number];
  /** Key light direction. Ambient fill is always added alongside it. */
  sun?: [x: number, y: number, z: number];
  ambient?: number;
  sunIntensity?: number;
  /** Bounce colour from below. Outdoor scenes want their own ground here. */
  bounce?: string;
  /**
   * Cast real shadows from the key light. One extra depth pass over the
   * casters, so it is opt-in: worth it for a scene with a hero object on open
   * ground, wasted on one that is mostly flat or enclosed.
   */
  shadows?: boolean;
  /** Half-size of the shadow camera box. Tight is sharp; loose is blocky. */
  shadowSpan?: number;
  exposure?: number;
  /**
   * A vertical gradient backdrop, also used as the environment map so metals
   * and glossy paint have something to reflect. [top, horizon, ground].
   */
  gradient?: [top: string, horizon: string, ground: string];
}

export function createStage(canvas: HTMLCanvasElement, options: StageOptions = {}): Stage {
  const {
    sky = '#bcd3dd',
    fog = [18, 62],
    fov = 58,
    camera: cameraAt = [0, 3.1, 6.2],
    lookAt = [0, 0.6, -8],
    sun = [-6, 10, 4],
    ambient = 0.75,
    sunIntensity = 1,
    bounce = '#6b7a63',
    shadows = false,
    shadowSpan = 18,
    exposure = 1.05,
    gradient,
  } = options;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // Colour management and a filmic curve. This is the single biggest step
  // away from "flat 3D demo": without it, lit surfaces clip to chalk and the
  // sky reads as paint rather than light.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;

  renderer.shadowMap.enabled = shadows;
  if (shadows) renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const skyColor = new THREE.Color(sky);
  if (gradient) {
    const env = skyGradient(gradient[0], gradient[1], gradient[2]);
    scene.background = env;
    scene.environment = env;
  } else {
    scene.background = skyColor;
  }
  if (fog) scene.fog = new THREE.Fog(skyColor.getHex(), fog[0], fog[1]);

  const cam = new THREE.PerspectiveCamera(fov, 1, 0.1, 400);
  cam.position.set(cameraAt[0], cameraAt[1], cameraAt[2]);
  cam.lookAt(lookAt[0], lookAt[1], lookAt[2]);

  // Sky above, ground bounce below. A single flat ambient lights every face
  // identically, which is what makes untextured geometry look like cardboard;
  // a hemisphere separates up from down for almost the same cost.
  scene.add(new THREE.HemisphereLight(sky, bounce, ambient));
  scene.add(new THREE.AmbientLight('#ffffff', ambient * 0.25));

  const key = new THREE.DirectionalLight('#fff4de', sunIntensity);
  key.position.set(sun[0], sun[1], sun[2]);
  if (shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const box = key.shadow.camera;
    box.left = -shadowSpan;
    box.right = shadowSpan;
    box.top = shadowSpan;
    box.bottom = -shadowSpan;
    box.near = 1;
    box.far = 80;
    // Without a bias, a large receiving plane self-shadows into stripes.
    key.shadow.bias = -0.0015;
    key.shadow.normalBias = 0.02;
  }
  scene.add(key);
  // The light needs a target in the scene for its shadow box to follow.
  scene.add(key.target);

  return { renderer, scene, camera: cam, sun: key };
}

export function resizeStage(stage: Stage, width: number, height: number) {
  stage.camera.aspect = width / Math.max(1, height);
  stage.camera.updateProjectionMatrix();
  stage.renderer.setSize(width, height, false);
}

/**
 * Release everything the stage holds on the GPU.
 *
 * Geometries, materials and textures are not garbage collected with the
 * objects that reference them — without this, opening eight games in a session
 * leaks eight worlds' worth of buffers, which a phone notices long before a
 * desktop does. Each resource is disposed once even when shared between
 * meshes, which pooled objects always are.
 */
export function disposeStage(stage: Stage) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  stage.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    }
  });

  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
  stage.renderer.dispose();
}

/**
 * A vertical sky gradient, used as both backdrop and environment.
 *
 * The environment half matters more than it looks. `MeshStandardMaterial`
 * reflects its surroundings when `metalness` is above zero, and with nothing
 * to reflect it resolves to black — which is why a glossy car body reads as
 * dark mud rather than paint. One tiny equirectangular gradient gives every
 * metal and glossy surface in the scene something to pick up, at the cost of
 * a 256x128 canvas.
 */
export function skyGradient(top: string, horizon: string, ground: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, top);
  gradient.addColorStop(0.48, horizon);
  gradient.addColorStop(0.52, ground);
  gradient.addColorStop(1, ground);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * A tiling noise texture, drawn once on a canvas.
 *
 * Real surfaces are never one flat colour, and a flat colour is most of what
 * makes untextured geometry read as a prototype. These are procedural rather
 * than fetched: no asset to download on a phone, no loading state to handle,
 * and the tile can be small because it repeats.
 */
export function noiseTexture(
  base: string,
  options: {
    size?: number;
    /** Speckles per tile, and how far they stray from the base colour. */
    grain?: number;
    contrast?: number;
    repeat?: [number, number];
    /** Larger, softer blotches under the grain, for patchy wear. */
    patches?: number;
  } = {},
): THREE.CanvasTexture {
  const { size = 128, grain = 2600, contrast = 26, repeat = [1, 1], patches = 0 } = options;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < patches; i += 1) {
    const r = size * (0.08 + Math.random() * 0.22);
    const x = Math.random() * size;
    const y = Math.random() * size;
    const shade = Math.round((Math.random() - 0.5) * contrast * 1.4);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tone = shade > 0 ? 255 : 0;
    gradient.addColorStop(0, `rgba(${tone},${tone},${tone},${Math.abs(shade) / 255})`);
    gradient.addColorStop(1, `rgba(${tone},${tone},${tone},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  for (let i = 0; i < grain; i += 1) {
    const shade = Math.round((Math.random() - 0.5) * contrast);
    const tone = shade > 0 ? 255 : 0;
    ctx.fillStyle = `rgba(${tone},${tone},${tone},${Math.abs(shade) / 190})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.3, 1.3);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  // Road surfaces are viewed at a glancing angle; without anisotropy the far
  // half of the road smears into grey mush, which is exactly where the sense
  // of speed and distance comes from.
  texture.anisotropy = 8;
  return texture;
}

/** A spotted pelt: blots of one colour over another, tiled. */
export function peltTexture(base: string, spot: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = spot;
  for (let i = 0; i < 34; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * 6;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * A soft contact shadow to sit under a hero object.
 *
 * Real shadow maps are sharp and cheap only near the light's focus; a blob
 * under the car grounds it at any distance for the price of one transparent
 * quad, which is what mobile driving games have always done.
 */
export function blobShadow(radius = 1): THREE.Mesh {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  return mesh;
}

/** A fixed set of hidden objects to show and place as a frame needs them. */
export function pool<T extends THREE.Object3D>(scene: THREE.Scene, count: number, make: (i: number) => T): T[] {
  const items: T[] = [];
  for (let i = 0; i < count; i += 1) {
    const item = make(i);
    item.visible = false;
    scene.add(item);
    items.push(item);
  }
  return items;
}

/**
 * Lay a pool out along the track and scroll it past the player forever.
 *
 * Each item owns one slot of an endlessly repeating span, so a fixed handful
 * of objects reads as a continuous line of scenery running to the horizon.
 * `place` receives the item and its depth ahead of the player, negative into
 * the screen, and decides the rest.
 */
export function recycleAlong<T extends THREE.Object3D>(
  items: T[],
  spacing: number,
  distance: number,
  place: (item: T, index: number, z: number) => void,
) {
  const span = items.length * spacing;
  if (span <= 0) return;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item) continue;
    // Wrapped into [0, span) so an item leaving behind the camera reappears
    // at the far end rather than drifting away for good.
    const along = (((i * spacing - distance) % span) + span) % span;
    item.visible = true;
    place(item, i, -along);
  }
}

/** Hide whatever a frame did not use, from `used` onwards. */
export function hideRest(items: THREE.Object3D[], used: number) {
  for (let i = used; i < items.length; i += 1) {
    const item = items[i];
    if (item) item.visible = false;
  }
}

export function ground(
  scene: THREE.Scene,
  color: string,
  size: [w: number, d: number],
  at: [x: number, y: number, z: number],
  extra: Partial<THREE.MeshStandardMaterialParameters> = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size[0], size[1]),
    new THREE.MeshStandardMaterial({ color, roughness: 1, ...extra }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(at[0], at[1], at[2]);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export interface Character {
  group: THREE.Group;
  /**
   * Everything above the hips. Bob and counter-rotation go here, not on the
   * group, so the feet stay planted where the game put them.
   *
   * Its static parts — torso, head, gear — are baked into one mesh per
   * material when the figure is built, so there is deliberately no handle for
   * the head or the chest on their own. Anything that needs to move has its
   * own pivot below.
   */
  spine: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** Forearm pivots, hanging from the arms. */
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  /** Wrist anchors — the place to attach anything the character carries. */
  handL: THREE.Group;
  handR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  /** Shin pivots, hanging from the legs. */
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  body: THREE.MeshStandardMaterial;
  /** Hangs from the shoulders; games can sway it. Absent unless the look has one. */
  cape?: THREE.Mesh;
}

/** One cross-section of a lofted body part: an ellipse at a height. */
interface Ring {
  y: number;
  /** Half-width across the body. */
  rx: number;
  /** Half-depth front to back. Defaults to `rx`, giving a circular section. */
  rz?: number;
  /** Shifts the section sideways/forward, which is how a curve is built. */
  x?: number;
  z?: number;
}

/**
 * Build a smooth closed surface through a stack of elliptical cross-sections.
 *
 * This is what replaced the boxes. A body is a series of sections that change
 * shape as they climb — narrow at the waist, broad at the chest, tapering into
 * the neck — and stacking those sections and skinning between them produces
 * that in one mesh with no seams, which is the thing a pile of cuboids can
 * never do however many are added. Normals are averaged across the whole
 * surface afterwards, so it shades as one continuous form rather than as
 * flat panels meeting at hard edges.
 *
 * Cheap enough to do per character: fourteen points a ring and a handful of
 * rings is a couple of hundred triangles, which is less than the box figure
 * it replaces once its separate meshes are counted.
 */
function loft(rings: Ring[], radial = 14): THREE.BufferGeometry {
  const position: number[] = [];
  const index: number[] = [];
  const rows = rings.length;

  for (const ring of rings) {
    const rz = ring.rz ?? ring.rx;
    const ox = ring.x ?? 0;
    const oz = ring.z ?? 0;
    for (let i = 0; i < radial; i += 1) {
      const t = (i / radial) * Math.PI * 2;
      position.push(ox + Math.cos(t) * ring.rx, ring.y, oz + Math.sin(t) * rz);
    }
  }

  // Skin between consecutive rings. This winding puts the normals outward;
  // the caps below are wound the other way round for the same reason.
  for (let r = 0; r < rows - 1; r += 1) {
    for (let i = 0; i < radial; i += 1) {
      const a = r * radial + i;
      const b = r * radial + ((i + 1) % radial);
      const c = (r + 1) * radial + i;
      const d = (r + 1) * radial + ((i + 1) % radial);
      index.push(a, c, b, b, c, d);
    }
  }

  const first = rings[0]!;
  const last = rings[rows - 1]!;

  const bottom = position.length / 3;
  position.push(first.x ?? 0, first.y, first.z ?? 0);
  for (let i = 0; i < radial; i += 1) index.push(bottom, i, (i + 1) % radial);

  const top = position.length / 3;
  position.push(last.x ?? 0, last.y, last.z ?? 0);
  const base = (rows - 1) * radial;
  for (let i = 0; i < radial; i += 1) {
    index.push(top, base + ((i + 1) % radial), base + i);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A limb segment, hanging from y=0 down to y=-length.
 *
 * Hung rather than centred so a pivot group at the joint swings it from the
 * joint. Slightly fuller just below the top and tapering to the far end, which
 * is the difference between a limb and a dowel.
 */
function limbGeometry(rTop: number, rBottom: number, length: number): THREE.BufferGeometry {
  const mid = rTop * 0.62 + rBottom * 0.38;
  return loft(
    [
      { y: 0, rx: rTop * 0.94 },
      { y: -length * 0.16, rx: rTop },
      { y: -length * 0.55, rx: mid },
      { y: -length * 0.9, rx: rBottom },
      { y: -length, rx: rBottom * 0.82 },
    ],
    10,
  );
}

/**
 * A head: cranium above, jaw narrowing to a chin below.
 *
 * A sphere alone reads as a ball on a stick. Squeezing the lower half inward
 * and pulling the chin forward is what turns it into a face, and it costs one
 * pass over the vertices of a sphere nobody has to author.
 */
function headGeometry(radius: number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(radius, 15, 11);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    // 0 at the temples, 1 at the point of the chin.
    const down = Math.max(0, -y / radius);
    const narrow = 1 - 0.34 * down * down;
    position.setX(i, x * narrow * 0.94);
    position.setY(i, y * 1.14);
    // The model faces -Z, so the chin reaches further that way as it narrows.
    position.setZ(i, z * narrow - (z < 0 ? radius * 0.14 * down : 0));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A rounded mass, for the parts that are closer to a blob than a tube.
 *
 * `segments` is worth setting deliberately. A body uses a lot of these, and a
 * sphere at the default resolution is 280 triangles whether it is a shoulder
 * or a pupil — which had the face costing more than the torso while covering
 * a few pixels. Detail belongs where it is visible.
 */
function blob(
  material: THREE.Material,
  scale: [number, number, number],
  at: [number, number, number],
  segments: [number, number] = [12, 9],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments[0], segments[1]), material);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.position.set(at[0], at[1], at[2]);
  return mesh;
}

/** Small enough on screen that anything more is triangles nobody can see. */
const TINY: [number, number] = [6, 4];
/** Joints and extremities: rounded, but read at a glance rather than studied. */
const PLAIN: [number, number] = [10, 7];

/**
 * Collapse a group's meshes into one mesh per material.
 *
 * A body made of surfaces needs a lot of them — torso, neck, skull, ears,
 * eyes, brows, hair, shoulder caps — and every one is its own draw call even
 * though none of them ever moves relative to the others. Baking each
 * material's meshes into a single buffer turns roughly fifteen calls into
 * four, which matters on a phone and costs nothing visually: the vertices are
 * transformed into the parent's space first, so the result is the same
 * picture.
 *
 * Only ever applied to parts that are static relative to the group. Anything
 * a game animates — limb pivots and what hangs from them — is left alone,
 * which is why this takes an explicit list rather than walking children.
 */
function collapse(parent: THREE.Object3D, meshes: THREE.Mesh[]): Map<THREE.Material, THREE.Mesh> {
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();

  for (const mesh of meshes) {
    const material = mesh.material as THREE.Material;
    mesh.updateMatrix();
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrix);
    // Merging needs every input to carry the same attributes; the primitives
    // here differ in whether they have UVs, and nothing reads them.
    geometry.deleteAttribute('uv');
    geometry.deleteAttribute('uv1');
    const list = byMaterial.get(material);
    if (list) list.push(geometry);
    else byMaterial.set(material, [geometry]);
    parent.remove(mesh);
    mesh.geometry.dispose();
  }

  const made = new Map<THREE.Material, THREE.Mesh>();
  for (const [material, geometries] of byMaterial) {
    const merged = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries);
    // A merge can fail if the inputs disagree about attributes. Falling back
    // to separate meshes costs draw calls; dropping the parts costs the body.
    if (!merged) {
      for (const geometry of geometries) {
        const fallback = new THREE.Mesh(geometry, material);
        fallback.castShadow = true;
        parent.add(fallback);
        made.set(material, fallback);
      }
      continue;
    }
    if (geometries.length > 1) for (const geometry of geometries) geometry.dispose();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    parent.add(mesh);
    made.set(material, mesh);
  }
  // Keyed by material so a caller that needs a handle on one of its own
  // surfaces — a car recolouring its paint, say — can find it again.
  return made;
}

/**
 * The arcade's player figure: an original stylised human, 1.67 units tall,
 * standing on y=0 and facing -Z.
 *
 * Built as lofted surfaces rather than stacked boxes. That is the whole point
 * of it: shoulders that slope into the arms, a waist narrower than the chest,
 * limbs that taper, a head with a jaw. Every part reads as one continuous body
 * at arcade distance, which a figure assembled from cuboids never does however
 * carefully the cuboids are placed.
 *
 * The rig is a real one. Arms hang from shoulder pivots and carry elbow pivots
 * below them; legs hang from hip pivots and carry knees; hands and feet are
 * their own anchors. Everything above the hips hangs from `spine`, so a run
 * can bob and counter-rotate the upper body while the feet stay where the game
 * put them. Games that only know about `armL`/`legR` and set one rotation
 * still work exactly as before — the extra joints default to a natural stance.
 *
 * Proportions come from `Look.bulk`, gear from the rest of it. Every piece is
 * original geometry; no existing game's character or costume is reproduced.
 */
export function buildCharacter(look: Look): Character {
  const {
    body: color,
    accent = '#f3f4f6',
    helmet = 'none',
    visor,
    cape: wantsCape,
    pack,
    scarf,
    hair = 'short',
    bulk = 1,
    glow,
    mask,
    prosthetic,
    feline,
    tail: wantsTail,
    spots,
  } = look;

  const group = new THREE.Group();
  const spine = new THREE.Group();
  group.add(spine);

  const skin = new THREE.MeshStandardMaterial({
    color: feline ? color : '#c98e63',
    roughness: 0.62,
    map: spots ? peltTexture(color, spots) : null,
  });
  // Cloth, not plastic: rough enough that the environment map reads as a soft
  // sheen along the shoulders rather than a reflection.
  const body = new THREE.MeshStandardMaterial({
    color,
    roughness: spots ? 0.88 : 0.68,
    metalness: spots ? 0 : 0.04,
    map: spots ? peltTexture(color, spots) : null,
  });
  const trim = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6, metalness: 0.06 });
  /**
   * Limb covering. Normally the same cloth as the torso — but a furred
   * character wears no sleeves, so arms in the exact body colour merged into
   * the chest and the figure lost its arms entirely. A shade darker is enough
   * to separate them while still reading as one coat.
   */
  const sleeve = feline
    ? new THREE.MeshStandardMaterial({
        color: new THREE.Color(color).multiplyScalar(0.78),
        roughness: 0.88,
        map: spots ? peltTexture(color, spots) : null,
      })
    : body;
  const boot = new THREE.MeshStandardMaterial({ color: '#22252c', roughness: 0.42, metalness: 0.12 });
  const lit = glow
    ? new THREE.MeshStandardMaterial({
        color: glow, emissive: glow, emissiveIntensity: 0.75, roughness: 0.3,
      })
    : null;
  const steel = new THREE.MeshStandardMaterial({
    color: '#aeb6c0', roughness: 0.3, metalness: 0.85,
  });

  // --- Heights every part is hung from. Keeping them named means a change to
  // --- the build reads as a change to a body, not a hunt through magic numbers.
  const HIP = 0.86;
  const SHOULDER = 1.30;
  const HEAD_Y = 1.545;
  const b = bulk;
  /**
   * Bulk, softened, for anything that pushes a part sideways.
   *
   * A heavier build is thicker, but applying the full multiplier to shoulder
   * offsets as well as to thicknesses compounds: the torso widens, the
   * deltoid on top of it moves out, and the arm hung off that moves out
   * again, so a 14% heavier character came out nearly half as wide again as
   * a standard one. Real shoulders are about a quarter of a body's height
   * whatever the build, so lateral placement only follows bulk part of the
   * way.
   */
  const bw = 1 + (b - 1) * 0.55;

  /**
   * Torso as one surface from pelvis to trapezius: hips, a waist drawn in, the
   * ribcage flaring above it, shoulders at their widest, then a quick taper
   * into the neck. Deeper than it is wide nowhere — a human chest is an
   * ellipse lying the other way, and getting that ratio wrong is most of why
   * a box torso looks like furniture.
   */
  const torso = new THREE.Mesh(
    loft([
      { y: 0.72, rx: 0.134 * b, rz: 0.106 * b },
      { y: 0.83, rx: 0.150 * b, rz: 0.114 * b },
      { y: 0.97, rx: 0.132 * b, rz: 0.100 * b },
      { y: 1.10, rx: 0.158 * bw, rz: 0.120 * b },
      { y: 1.22, rx: 0.176 * bw, rz: 0.130 * b },
      { y: SHOULDER, rx: 0.182 * bw, rz: 0.120 * b },
      { y: 1.34, rx: 0.104 * bw, rz: 0.090 * b },
    ]),
    body,
  );
  spine.add(torso);

  // Deltoids. They round the shoulder line off and hide the seam where the
  // arm leaves the body, which is the join that gives a jointed figure away.
  for (const side of [-1, 1]) {
    spine.add(blob(body, [0.068 * b, 0.078 * b, 0.076 * b], [side * 0.158 * bw, SHOULDER - 0.012, 0], PLAIN));
  }

  // A heavy build gets pauldrons over the deltoids — shaped caps, following
  // the shoulder rather than sitting on it as a slab.
  if (b > 1.1 && !feline) {
    for (const side of [-1, 1]) {
      const pauldron = blob(trim, [0.088 * b, 0.044 * b, 0.085 * b], [side * 0.158 * bw, SHOULDER + 0.03, 0], PLAIN);
      pauldron.rotation.z = -side * 0.3;
      spine.add(pauldron);
    }
  }

  // Long enough to see. It leans very slightly forward, the way a real neck
  // meets the skull, rather than standing as a post.
  const neck = new THREE.Mesh(
    loft([
      { y: 1.30, rx: 0.068 * b, rz: 0.064 * b },
      { y: 1.40, rx: 0.054 * b, rz: 0.052 * b, z: -0.004 },
      { y: 1.46, rx: 0.062 * b, rz: 0.060 * b, z: -0.008 },
    ], 10),
    skin,
  );
  spine.add(neck);

  const headR = 0.118;
  const head = new THREE.Mesh(headGeometry(headR), helmet === 'full' ? body : skin);
  head.position.y = HEAD_Y;
  spine.add(head);

  // Ears, which cost two spheres and are surprisingly load-bearing: without
  // them the side of the head reads as a shell rather than a head.
  if (!feline && helmet !== 'full') {
    for (const side of [-1, 1]) {
      spine.add(blob(skin, [0.016, 0.034, 0.026], [side * headR * 0.94, HEAD_Y - 0.012, 0.012], TINY));
    }
  }

  // A face. Several games turn the figure to face the camera, and at that
  // point a blank oval is the one thing that still reads as a mannequin
  // however good the body is — eyes are what make it a person. Skipped
  // behind a sealed helmet or a visor, which are covering the face by
  // definition, and on the feline, who gets a muzzle instead.
  if (!feline && helmet !== 'full' && !visor) {
    const iris = new THREE.MeshStandardMaterial({ color: '#2a2118', roughness: 0.35 });
    const white = new THREE.MeshStandardMaterial({ color: '#efe6dc', roughness: 0.4 });
    for (const side of [-1, 1]) {
      // The model faces -Z, so the face is the -Z side of the skull.
      const eye = blob(white, [0.019, 0.014, 0.01], [side * 0.042, HEAD_Y + 0.012, -headR * 0.9], TINY);
      spine.add(eye);
      const pupil = blob(iris, [0.011, 0.011, 0.008], [side * 0.043, HEAD_Y + 0.011, -headR * 0.95], TINY);
      spine.add(pupil);
      // A brow above each eye: it catches the key light and gives the face
      // some structure instead of leaving the eyes floating on a curve.
      const brow = blob(skin, [0.026, 0.008, 0.012], [side * 0.045, HEAD_Y + 0.038, -headR * 0.88], TINY);
      spine.add(brow);
    }
  }

  if (hair === 'short') {
    // A cap of hair that follows the skull rather than a slab across the top.
    const cap = blob(trim, [headR * 1.04, headR * 1.1, headR * 1.06], [0, HEAD_Y + 0.022, 0.008]);
    spine.add(cap);
  } else if (hair === 'ponytail') {
    spine.add(blob(trim, [headR * 1.05, headR * 1.08, headR * 1.07], [0, HEAD_Y + 0.026, 0.01]));
    // Behind the head: the model faces -Z, so +Z is its back.
    const tail = new THREE.Mesh(
      loft([
        { y: 0, rx: 0.032 },
        { y: -0.07, rx: 0.038 },
        { y: -0.19, rx: 0.026 },
        { y: -0.24, rx: 0.009 },
      ], 10),
      trim,
    );
    tail.position.set(0, HEAD_Y + 0.035, 0.098);
    tail.rotation.x = -0.2;
    spine.add(tail);
  }

  if (helmet === 'cap') {
    spine.add(blob(body, [headR * 1.1, headR * 0.92, headR * 1.1], [0, HEAD_Y + 0.045, 0.012]));
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.018, 16, 1, false, 0, Math.PI), trim);
    brim.position.set(0, HEAD_Y + 0.035, -0.03);
    brim.rotation.y = Math.PI;
    spine.add(brim);
  } else if (helmet === 'full') {
    const shell = blob(body, [headR * 1.16, headR * 1.2, headR * 1.2], [0, HEAD_Y + 0.012, 0.008]);
    spine.add(shell);
    const jaw = blob(trim, [headR * 0.86, headR * 0.5, headR * 0.5], [0, HEAD_Y - 0.075, -0.045]);
    spine.add(jaw);
  } else if (helmet === 'crest') {
    spine.add(blob(body, [headR * 1.14, headR * 1.14, headR * 1.16], [0, HEAD_Y + 0.014, 0.006]));
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.075, 0.2), trim);
    fin.position.set(0, HEAD_Y + 0.15, 0.01);
    spine.add(fin);
  }

  if (visor) {
    // A band wrapped round the front of the skull, not a plate stuck to it:
    // an open cylinder arc curves with the head the way a visor would.
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(headR * 1.02, headR * 1.02, 0.052, 16, 1, true, Math.PI * 0.62, Math.PI * 0.76),
      new THREE.MeshStandardMaterial({
        color: visor, emissive: visor, emissiveIntensity: 1.2,
        roughness: 0.15, metalness: 0.4, side: THREE.DoubleSide,
      }),
    );
    band.position.set(0, HEAD_Y + 0.015, 0);
    spine.add(band);
  }

  let cape: THREE.Mesh | undefined;
  if (wantsCape) {
    // Segmented and bowed, so it hangs round the back instead of standing off
    // it like a board.
    const cloth = new THREE.PlaneGeometry(0.52 * b, 0.88, 6, 6);
    const position = cloth.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const drop = (0.44 - y) / 0.88; // 0 at the shoulders, 1 at the hem
      position.setX(i, x * (1 + drop * 0.35));
      position.setZ(i, drop * 0.05 - (x / (0.26 * b)) ** 2 * 0.06);
    }
    position.needsUpdate = true;
    cloth.computeVertexNormals();
    cloth.translate(0, -0.44, 0);
    cape = new THREE.Mesh(
      cloth,
      new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }),
    );
    cape.position.set(0, SHOULDER + 0.05, 0.125 * b);
    cape.rotation.x = -0.1;
    spine.add(cape);
  }

  if (pack) {
    const bag = blob(trim, [0.16, 0.19, 0.09], [0, 1.08, 0.16 * b], PLAIN);
    spine.add(bag);
    for (const side of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.3, 0.02), trim);
      strap.position.set(side * 0.1 * b, 1.18, -0.11 * b);
      strap.rotation.x = 0.1;
      spine.add(strap);
    }
  }

  if (scarf) {
    const collar = new THREE.Mesh(
      loft([
        { y: 1.3, rx: 0.135 * b, rz: 0.11 * b },
        { y: 1.36, rx: 0.115 * b, rz: 0.098 * b },
      ], 12),
      trim,
    );
    spine.add(collar);
    const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.46, 1, 4), trim);
    tail.material = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.85, side: THREE.DoubleSide });
    tail.position.set(0.05, 1.12, 0.15);
    tail.rotation.x = -0.35;
    spine.add(tail);
  }

  if (mask) {
    const cover = blob(trim, [0.082, 0.058, 0.07], [0, HEAD_Y - 0.048, -0.072], PLAIN);
    spine.add(cover);
    // The hose loops down to the chest rig, which is most of what reads as a
    // breather rather than a scarf.
    const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.3, 8), trim);
    hose.position.set(0.085, 1.36, -0.075);
    hose.rotation.z = 0.32;
    spine.add(hose);
  }

  if (feline) {
    const muzzle = blob(skin, [0.062, 0.05, 0.07], [0, HEAD_Y - 0.038, -0.088], PLAIN);
    spine.add(muzzle);
    const nose = blob(
      new THREE.MeshStandardMaterial({ color: '#2b1d14', roughness: 0.5 }),
      [0.022, 0.016, 0.016],
      [0, HEAD_Y - 0.022, -0.15],
      TINY,
    );
    spine.add(nose);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.085, 8), skin);
      ear.position.set(side * 0.062, HEAD_Y + 0.128, 0.012);
      ear.rotation.z = side * 0.18;
      spine.add(ear);
    }
  }

  if (wantsTail) {
    // One curving surface rather than three rods: rings that shift back and
    // down as they taper draw the curve into the geometry itself.
    const rings: Ring[] = [];
    for (let i = 0; i <= 6; i += 1) {
      const t = i / 6;
      rings.push({
        y: -t * 0.34 - Math.sin(t * 1.5) * 0.06,
        rx: 0.042 * (1 - t * 0.72),
        z: t * 0.44,
      });
    }
    const tail = new THREE.Mesh(loft(rings, 8), skin);
    tail.position.set(0, HIP + 0.02, 0.1 * b);
    spine.add(tail);
  }

  if (lit) {
    // Circuitry traced down the suit. Thin strips rather than glowing panels:
    // the point is a line of light following the body, not a lamp.
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.26, 0.014), lit);
    chest.position.set(0, 1.14, -0.128 * b);
    spine.add(chest);
    // A lit collar ring, following the torso section at the shoulders.
    const collar = new THREE.Mesh(
      loft([
        { y: 1.315, rx: 0.113 * bw, rz: 0.098 * b },
        { y: 1.335, rx: 0.11 * bw, rz: 0.096 * b },
      ], 12),
      lit,
    );
    spine.add(collar);
    const belt = new THREE.Mesh(
      loft([
        { y: 0.9, rx: 0.139 * b, rz: 0.105 * b },
        { y: 0.925, rx: 0.139 * b, rz: 0.105 * b },
      ], 12),
      lit,
    );
    spine.add(belt);
  }

  // --- Arms: shoulder pivot → upper arm → elbow pivot → forearm → hand. ------
  const UPPER_ARM = 0.27;
  const FOREARM = 0.25;
  const armR0 = 0.055 * b;

  const buildArm = (side: number): [THREE.Group, THREE.Group, THREE.Group] => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * (0.152 * bw + 0.028), SHOULDER - 0.02, 0);
    spine.add(shoulder);
    shoulder.add(new THREE.Mesh(limbGeometry(armR0, armR0 * 0.82, UPPER_ARM), sleeve));

    const elbow = new THREE.Group();
    elbow.position.y = -UPPER_ARM;
    shoulder.add(elbow);
    elbow.add(blob(sleeve, [armR0 * 0.86, armR0 * 0.86, armR0 * 0.86], [0, 0, 0], PLAIN));
    elbow.add(new THREE.Mesh(limbGeometry(armR0 * 0.82, armR0 * 0.66, FOREARM), sleeve));
    // Joint and forearm are one piece of cloth; they may as well be one mesh.
    collapse(elbow, elbow.children.filter((child) => (child as THREE.Mesh).isMesh) as THREE.Mesh[]);

    const hand = new THREE.Group();
    hand.position.y = -FOREARM;
    elbow.add(hand);
    // Flattened front to back and a little long, which is the shape of a hand
    // at this distance; a cube is not.
    hand.add(blob(skin, [armR0 * 0.82, armR0 * 1.25, armR0 * 0.52], [0, -armR0 * 0.9, 0], PLAIN));

    // Arms rest slightly out from the body and a touch bent, never pinned
    // straight against the ribs.
    shoulder.rotation.z = -side * 0.09;
    elbow.rotation.x = 0.16;
    return [shoulder, elbow, hand];
  };

  const [armL, elbowL, handL] = buildArm(-1);
  const [armR, elbowR, handR] = buildArm(1);

  // --- Legs: hip pivot → thigh → knee pivot → shin → foot. ------------------
  // A prosthetic is a short thigh over a steel shin and blade, so the thigh is
  // cut back to leave the blade room to read.
  const THIGH = prosthetic ? 0.3 : 0.4;
  const SHIN = prosthetic ? 0.34 : 0.4;
  const legR0 = 0.094 * b;

  const buildLeg = (side: number): [THREE.Group, THREE.Group] => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.082 * b, HIP - 0.02, 0);
    spine.add(hip);
    hip.add(new THREE.Mesh(limbGeometry(legR0, legR0 * 0.74, THIGH), trim));

    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    hip.add(knee);

    if (prosthetic) {
      knee.add(blob(steel, [legR0 * 0.7, legR0 * 0.7, legR0 * 0.7], [0, 0, 0], PLAIN));
      knee.add(new THREE.Mesh(limbGeometry(legR0 * 0.5, legR0 * 0.3, SHIN), steel));
      // A running blade: a curved leaf sweeping back from the shin.
      const bladeRings: Ring[] = [];
      for (let i = 0; i <= 5; i += 1) {
        const t = i / 5;
        bladeRings.push({
          y: -SHIN - t * 0.2,
          rx: 0.03 * (1 - t * 0.3),
          rz: 0.012,
          z: t * t * 0.2,
        });
      }
      knee.add(new THREE.Mesh(loft(bladeRings, 8), steel));
    } else {
      knee.add(blob(trim, [legR0 * 0.78, legR0 * 0.78, legR0 * 0.78], [0, 0, 0], PLAIN));
      knee.add(new THREE.Mesh(limbGeometry(legR0 * 0.76, legR0 * 0.5, SHIN), trim));
      // A shoe: longer than it is wide, reaching forward past the ankle.
      const foot = blob(boot, [legR0 * 0.62, legR0 * 0.46, 0.105], [0, -SHIN - 0.025, -0.038], PLAIN);
      knee.add(foot);
    }

    collapse(knee, knee.children.filter((child) => (child as THREE.Mesh).isMesh) as THREE.Mesh[]);
    return [hip, knee];
  };

  const [legL, kneeL] = buildLeg(-1);
  const [legR, kneeR] = buildLeg(1);

  // A standing figure is never perfectly straight-legged.
  kneeL.rotation.x = -0.06;
  kneeR.rotation.x = -0.06;

  /*
   * Bake the body. Every direct mesh child of `spine` is static by
   * construction — the limbs are Groups, so they are skipped automatically —
   * and the cape is the one exception, because games sway it.
   */
  const statics = spine.children.filter(
    (child) => (child as THREE.Mesh).isMesh && child !== cape,
  ) as THREE.Mesh[];
  collapse(spine, statics);

  group.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) object.castShadow = true;
  });

  return {
    group, spine,
    armL, armR, elbowL, elbowR, handL, handR,
    legL, legR, kneeL, kneeR,
    body, cape,
  };
}

/**
 * Swing a character's limbs into a run.
 *
 * `phase` advances with distance or time; `swing` is how far the limbs travel,
 * so 0 stands still and a larger value reads as a harder run.
 *
 * The gait is what stops this reading as a puppet. Arms lead the opposite leg.
 * Knees only bend one way, and bend hardest as the leg travels back and folds
 * up to recover — a leg that stays straight through the whole cycle is the
 * single biggest tell of a rigid figure. Elbows hold a bend and pump. The
 * upper body rises on each drive and counter-rotates against the legs, which
 * is why a real runner's shoulders and hips never face the same way at once.
 */
export function poseRun(character: Character, phase: number, swing = 0.9) {
  const a = Math.sin(phase);
  const swingL = a * swing;
  const swingR = -a * swing;

  character.legL.rotation.x = swingL;
  character.legR.rotation.x = swingR;
  // Negative bends the knee backwards, which is the only way it goes.
  character.kneeL.rotation.x = -0.1 - Math.max(0, -swingL) * 1.7;
  character.kneeR.rotation.x = -0.1 - Math.max(0, -swingR) * 1.7;

  character.armL.rotation.x = -swingL * 0.7;
  character.armR.rotation.x = -swingR * 0.7;
  character.elbowL.rotation.x = 0.5 + Math.max(0, -swingL) * 0.5;
  character.elbowR.rotation.x = 0.5 + Math.max(0, -swingR) * 0.5;

  // Twice the stride frequency: the body rises on each foot strike, not once
  // per full cycle.
  character.spine.position.y = Math.abs(Math.cos(phase)) * 0.035 * swing;
  character.spine.rotation.y = -a * 0.1 * swing;
  character.spine.rotation.x = 0.06 * swing;
}

/**
 * Settle a character into a natural standing pose.
 *
 * The counterpart to `poseRun`: games that stop the figure need somewhere to
 * put it back to, and "every joint at zero" is a mannequin.
 */
export function poseStand(character: Character) {
  character.legL.rotation.x = 0;
  character.legR.rotation.x = 0;
  character.kneeL.rotation.x = -0.06;
  character.kneeR.rotation.x = -0.06;
  character.armL.rotation.x = 0;
  character.armR.rotation.x = 0;
  character.elbowL.rotation.x = 0.16;
  character.elbowR.rotation.x = 0.16;
  character.spine.position.y = 0;
  character.spine.rotation.set(0, 0, 0);
}

export interface Car {
  group: THREE.Group;
  body: THREE.Mesh;
  paint: THREE.MeshStandardMaterial;
  wheels: THREE.Mesh[];
  brakes: THREE.MeshStandardMaterial;
}

/** One cross-section of a swept body, taken across the car at a point along it. */
interface Section {
  z: number;
  /** Half-width across the car. */
  w: number;
  /** Half-height. */
  h: number;
  /** Height of the section's centre above the ground. */
  y: number;
  /**
   * How square the section is. 2 is a plain ellipse; higher flattens the roof
   * and the flanks while keeping the shoulders round, which is the shape of
   * actual car bodywork and the reason a car cannot be drawn with ellipses
   * any more than it can with boxes.
   */
  n?: number;
}

/**
 * Sweep a surface along the length of the car through a series of sections.
 *
 * The counterpart to `loft`, turned on its side: sections advance along Z and
 * each is a superellipse in XY. That single change of primitive is what lets
 * a body taper into a nose, swell over the wheel arches and draw back into a
 * tail as one continuous panel — the things a stack of cuboids approximates
 * with steps and edges.
 */
function sweep(sections: Section[], radial = 18): THREE.BufferGeometry {
  const position: number[] = [];
  const index: number[] = [];
  const rows = sections.length;

  for (const section of sections) {
    const e = 2 / (section.n ?? 2);
    for (let i = 0; i < radial; i += 1) {
      const t = (i / radial) * Math.PI * 2;
      const c = Math.cos(t);
      const s = Math.sin(t);
      position.push(
        section.w * Math.sign(c) * Math.abs(c) ** e,
        section.y + section.h * Math.sign(s) * Math.abs(s) ** e,
        section.z,
      );
    }
  }

  for (let r = 0; r < rows - 1; r += 1) {
    for (let i = 0; i < radial; i += 1) {
      const a = r * radial + i;
      const b = r * radial + ((i + 1) % radial);
      const c = (r + 1) * radial + i;
      const d = (r + 1) * radial + ((i + 1) % radial);
      index.push(a, b, d, a, d, c);
    }
  }

  const first = sections[0]!;
  const last = sections[rows - 1]!;

  const front = position.length / 3;
  position.push(0, first.y, first.z);
  for (let i = 0; i < radial; i += 1) index.push(front, (i + 1) % radial, i);

  const back = position.length / 3;
  position.push(0, last.y, last.z);
  const base = (rows - 1) * radial;
  for (let i = 0; i < radial; i += 1) index.push(back, base + i, base + ((i + 1) % radial));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * How much geometry a car is worth: the one the player drives, or one of the
 * many crossing the road behind them.
 */
export type CarDetail = 'hero' | 'traffic';

/**
 * An original car, 4 units long, nose pointing -Z and sitting on y=0.
 *
 * Built as swept panels, not stacked boxes. The body is one surface running
 * the length of the car: a low tapered nose, flanks that swell over each
 * wheel arch and pull back in between them, and a tail that narrows again.
 * A separate canopy carries the windscreen rake, the roof and the rear
 * screen. Because both are continuous, the light runs along the shoulder
 * line in an unbroken highlight, which is what actually reads as car
 * bodywork — a box stack breaks it into facets at every seam.
 *
 * Built at a canonical size and scaled to the length asked for, so the
 * proportions cannot drift apart. Sizing the geometry from `length` while
 * leaving the width fixed is exactly how Crossing once ended up with cars
 * wider than they were long, and taller than one of its grid tiles.
 *
 * No real manufacturer's design, badge or proportions are reproduced.
 */
export function buildCar(color: string, length = 4.0, detail: CarDetail = 'hero'): Car {
  const group = new THREE.Group();
  /**
   * How finely to tessellate. Drift has one car filling the screen and can
   * afford the sections; Crossing has twenty of them at barely half scale,
   * where the same mesh is detail nobody can see and frame time everybody
   * can feel. Traffic drops the ring counts and the mirrors, which together
   * are most of the cost.
   */
  const hero = detail === 'hero';
  const ring = (fine: number, coarse: number) => (hero ? fine : coarse);

  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.24, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({
    color: '#141922', roughness: 0.06, metalness: 0.5,
  });
  const trim = new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.6 });
  /**
   * Alloy, not a mirror. At high metalness and low roughness a rim reflects
   * whatever surrounds it, and surrounded by Crossing's grass that meant
   * every car rolling on green discs. Enough sheen to catch the key light,
   * not enough to paint itself with the scenery.
   */
  const chrome = new THREE.MeshStandardMaterial({
    color: '#b9bfc8', roughness: 0.52, metalness: 0.35,
  });

  const L = 4.0;
  const HALF = L / 2;
  /** Where the wheels sit, and so where the arches have to swell. */
  const FRONT_AXLE = -1.15;
  const REAR_AXLE = 1.2;

  // The body, nose to tail. The widest points are the two axles; the waist
  // between them is drawn in, which is what gives a car its hips.
  const shell = new THREE.Mesh(
    sweep([
      { z: -HALF, w: 0.44, h: 0.09, y: 0.58, n: 3.4 },
      { z: -1.82, w: 0.68, h: 0.16, y: 0.57, n: 4.0 },
      { z: -1.5, w: 0.82, h: 0.22, y: 0.57, n: 4.8 },
      { z: FRONT_AXLE, w: 0.88, h: 0.27, y: 0.59, n: 5.4 },
      { z: -0.5, w: 0.83, h: 0.30, y: 0.63, n: 5.6 },
      { z: 0.25, w: 0.83, h: 0.31, y: 0.64, n: 5.6 },
      { z: REAR_AXLE, w: 0.89, h: 0.30, y: 0.63, n: 5.4 },
      // The tail stays broad and full-height rather than tapering away. A
      // body that narrows to a point at both ends is a boat; a car has a
      // rear deck and a flat panel under it, and this is the view the
      // driving game spends all its time looking at.
      { z: 1.78, w: 0.86, h: 0.28, y: 0.63, n: 5.0 },
      { z: HALF, w: 0.78, h: 0.25, y: 0.63, n: 4.6 },
    ], ring(16, 10)),
    paint,
  );
  group.add(shell);

  // The canopy: windscreen rake, roof, rear screen. Inset from the flanks so
  // the body's shoulder line stays visible under it.
  const canopy = new THREE.Mesh(
    sweep([
      { z: -0.95, w: 0.54, h: 0.05, y: 0.90, n: 3.0 },
      { z: -0.55, w: 0.64, h: 0.16, y: 0.99, n: 3.8 },
      { z: 0.0, w: 0.68, h: 0.23, y: 1.05, n: 4.4 },
      { z: 0.6, w: 0.66, h: 0.21, y: 1.03, n: 4.4 },
      { z: 1.05, w: 0.56, h: 0.12, y: 0.96, n: 3.6 },
      { z: 1.3, w: 0.42, h: 0.05, y: 0.92, n: 2.8 },
    ], ring(14, 9)),
    glass,
  );
  group.add(canopy);

  // A painted roof panel capping the canopy, so the greenhouse reads as
  // glazing with a roof over it rather than as one tinted bubble.
  const roof = new THREE.Mesh(
    sweep([
      { z: -0.38, w: 0.55, h: 0.05, y: 1.23, n: 3.6 },
      { z: 0.0, w: 0.60, h: 0.06, y: 1.26, n: 4.0 },
      { z: 0.6, w: 0.58, h: 0.055, y: 1.23, n: 4.0 },
      { z: 0.92, w: 0.48, h: 0.04, y: 1.17, n: 3.2 },
    ], ring(12, 8)),
    paint,
  );
  group.add(roof);

  // Splitter and diffuser: dark shapes closing off the body front and rear.
  const splitter = new THREE.Mesh(
    sweep([
      { z: -HALF - 0.06, w: 0.62, h: 0.045, y: 0.44, n: 4 },
      { z: -1.72, w: 0.76, h: 0.06, y: 0.44, n: 4 },
    ], 8),
    trim,
  );
  group.add(splitter);
  const diffuser = new THREE.Mesh(
    sweep([
      { z: 1.76, w: 0.78, h: 0.07, y: 0.45, n: 4 },
      { z: HALF + 0.04, w: 0.64, h: 0.05, y: 0.45, n: 4 },
    ], 8),
    trim,
  );
  group.add(diffuser);

  // Mirrors. Small, and worth more than their triangle count: nothing else
  // this cheap says "car" so immediately from behind or alongside.
  for (const side of hero ? [-1, 1] : []) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.14, 6), trim);
    stalk.position.set(side * 0.8, 0.96, -0.78);
    stalk.rotation.z = -side * 0.7;
    group.add(stalk);
    const shellMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), paint);
    shellMesh.scale.set(0.085, 0.055, 0.1);
    shellMesh.position.set(side * 0.87, 1.0, -0.78);
    group.add(shellMesh);
  }

  const brakes = new THREE.MeshStandardMaterial({
    color: '#3a0d08', emissive: '#ff2d0a', emissiveIntensity: 0, roughness: 0.6,
  });

  // Lights. Emissive rather than real lights: a dozen point lights in frame
  // is the fastest way to lose a phone's frame rate.
  const headMat = new THREE.MeshStandardMaterial({
    color: '#fffdf2', emissive: '#fff4cf', emissiveIntensity: 1.1, roughness: 0.12,
  });
  for (const side of [-1, 1]) {
    // Wide, shallow slots set into the corners of the nose. Round lamps
    // sitting side by side in the middle of a face read as a pair of eyes,
    // which is the one thing a car front must not look like.
    const lamp = new THREE.Mesh(
      sweep([
        { z: -1.93, w: 0.2, h: 0.03, y: 0.685, n: 5 },
        { z: -1.74, w: 0.23, h: 0.038, y: 0.69, n: 5 },
      ], 6),
      headMat,
    );
    lamp.position.x = side * 0.3;
    group.add(lamp);
  }

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(
      sweep([
        { z: 1.92, w: 0.22, h: 0.035, y: 0.72, n: 5 },
        { z: HALF + 0.02, w: 0.2, h: 0.032, y: 0.72, n: 5 },
      ], 6),
      brakes,
    );
    lamp.position.x = side * 0.34;
    group.add(lamp);
  }
  // A light bar joining them across the tail.
  const tailBar = new THREE.Mesh(
    sweep([
      { z: 1.98, w: 0.46, h: 0.022, y: 0.78, n: 4 },
      { z: HALF + 0.01, w: 0.44, h: 0.02, y: 0.78, n: 4 },
    ], 6),
    brakes,
  );
  group.add(tailBar);

  /*
   * Bake the bodywork. None of it moves, and every panel would otherwise be
   * its own draw call — on a road with a dozen cars in frame that is the
   * difference that shows. The wheels are added afterwards because they turn.
   *
   * The merged paint mesh is what gets returned as `body`: Crossing recolours
   * a car through `body.material`, and Drift through `paint` directly, and
   * both have to land on the same material.
   */
  const baked = collapse(group, group.children.filter((child) => (child as THREE.Mesh).isMesh) as THREE.Mesh[]);
  const shellMesh = baked.get(paint) ?? shell;

  // Wheels: a tyre with a visibly separate sidewall, a rim face and a hub, so
  // they read as wheels rather than as black discs.
  const tyreGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.26, ring(16, 10));
  const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.28, ring(12, 8));
  const tyreMat = new THREE.MeshStandardMaterial({ color: '#0e0f12', roughness: 0.92 });

  const wheels: THREE.Mesh[] = [];
  for (const wx of [-0.79, 0.79]) {
    for (const wz of [FRONT_AXLE, REAR_AXLE]) {
      const wheel = new THREE.Mesh(tyreGeo, tyreMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.42, wz);
      wheel.castShadow = true;
      // Parented to the tyre, so it turns with it for free.
      wheel.add(new THREE.Mesh(rimGeo, chrome));
      group.add(wheel);
      wheels.push(wheel);
    }
  }

  group.scale.setScalar(length / L);

  return { group, body: shellMesh, paint, wheels, brakes };
}

const TRUNK_MAT = new THREE.MeshStandardMaterial({ color: '#6f5237', roughness: 0.95 });
const FROND_MAT = new THREE.MeshStandardMaterial({
  color: '#2e7d46', roughness: 0.8, side: THREE.DoubleSide,
});
const LEAF_MAT = new THREE.MeshStandardMaterial({ color: '#3c8a44', roughness: 0.9 });
const LEAF_DARK = new THREE.MeshStandardMaterial({ color: '#2c6b36', roughness: 0.9 });

/**
 * A palm, tall and slightly leaning, with fronds that droop.
 *
 * Materials are module-level and shared across every palm in every scene:
 * dozens of trees each owning a copy of the same material is a draw-call and
 * memory cost for no visible difference.
 */
export function buildPalm(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const height = (4.2 + Math.random() * 1.8) * scale;

  // A few stacked segments with a slight bend read as a palm; one straight
  // cylinder reads as a pole.
  const segments = 4;
  for (let i = 0; i < segments; i += 1) {
    const t = i / segments;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1 * (1 - t * 0.4) * scale, 0.14 * (1 - t * 0.3) * scale, height / segments, 6),
      TRUNK_MAT,
    );
    seg.position.set(Math.sin(t * 1.6) * 0.16 * scale, (height / segments) * (i + 0.5), 0);
    seg.rotation.z = -Math.cos(t * 1.6) * 0.06;
    seg.castShadow = true;
    group.add(seg);
  }

  const topX = Math.sin(1.6) * 0.16 * scale;
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2 + Math.random() * 0.3;
    const frond = new THREE.Mesh(
      new THREE.ConeGeometry(0.3 * scale, 1.9 * scale, 4, 1, true),
      FROND_MAT,
    );
    frond.position.set(topX + Math.cos(angle) * 0.55 * scale, height + 0.1, Math.sin(angle) * 0.55 * scale);
    // Laid outward and drooping, rather than standing up like a shuttlecock.
    frond.rotation.z = Math.cos(angle) * 1.25;
    frond.rotation.x = -Math.sin(angle) * 1.25;
    frond.castShadow = true;
    group.add(frond);
  }

  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 8, 6), TRUNK_MAT);
  crown.position.set(topX, height + 0.05, 0);
  group.add(crown);

  return group;
}

/** A broadleaf tree, to break up a roadside that is otherwise all palms. */
export function buildTree(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const height = (2.4 + Math.random() * 1.4) * scale;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13 * scale, 0.2 * scale, height, 6),
    TRUNK_MAT,
  );
  trunk.position.y = height / 2;
  trunk.castShadow = true;
  group.add(trunk);

  // Three overlapping blobs at different heights, which reads as a canopy
  // where a single sphere reads as a lollipop.
  const blobs: [number, number, number, number][] = [
    [0, height + 0.5 * scale, 0, 1.15],
    [0.5 * scale, height + 0.1 * scale, 0.3 * scale, 0.82],
    [-0.45 * scale, height + 0.25 * scale, -0.25 * scale, 0.74],
  ];
  for (const [x, y, z, r] of blobs) {
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r * scale, 1),
      Math.random() < 0.5 ? LEAF_MAT : LEAF_DARK,
    );
    blob.position.set(x, y, z);
    blob.castShadow = true;
    group.add(blob);
  }

  return group;
}

/** A low roadside bush, the cheapest way to stop a verge looking like felt. */
export function buildBush(scale = 1): THREE.Mesh {
  const bush = new THREE.Mesh(
    new THREE.IcosahedronGeometry((0.45 + Math.random() * 0.3) * scale, 0),
    Math.random() < 0.5 ? LEAF_MAT : LEAF_DARK,
  );
  bush.scale.y = 0.7;
  bush.castShadow = true;
  return bush;
}

/** A hazy skyline far enough back that fog does the rest of the work. */
export function buildSkyline(scene: THREE.Scene, count = 10, z = -70, color = '#8f9bab') {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  for (let i = 0; i < count; i += 1) {
    const h = 4 + Math.random() * 10;
    const building = new THREE.Mesh(new THREE.BoxGeometry(3 + Math.random() * 3, h, 3), material);
    building.position.set(-14 + i * 3.4 + (Math.random() - 0.5) * 2, h / 2, z - Math.random() * 8);
    scene.add(building);
  }
}
