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
  head: THREE.Mesh;
  torso: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  body: THREE.MeshStandardMaterial;
  /** Hangs from the shoulders; games can sway it. Absent unless the look has one. */
  cape?: THREE.Mesh;
}

/**
 * The arcade's player figure: an original low-poly human, roughly 1.6 units
 * tall, standing on y=0 and facing -Z.
 *
 * Limbs hang from groups pivoted at the shoulder and hip rather than being
 * positioned outright, so a game can swing them by setting one rotation and
 * get a walk, a run or a flail without rebuilding anything.
 *
 * The `Look` decides gear and proportions. Headgear and build do most of the
 * work: a sealed helmet on a heavy frame and a bare head on a slim one read
 * as different characters at arcade distance, where a colour swap alone does
 * not. Every piece is original geometry — no existing game's character or
 * costume is reproduced.
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
  } = look;

  const group = new THREE.Group();

  const skin = new THREE.MeshStandardMaterial({ color: '#c98e63', roughness: 0.8 });
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05 });
  const trim = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.7 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46 * bulk, 0.56, 0.26 * bulk), body);
  torso.position.y = 1.02;
  group.add(torso);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.42 * bulk, 0.16, 0.25 * bulk), trim);
  hips.position.y = 0.71;
  group.add(hips);

  // A heavy build gets pauldrons, which is what makes it read as armoured
  // rather than merely wide.
  if (bulk > 1.1) {
    for (const side of [-1, 1]) {
      const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.3 * bulk), trim);
      pauldron.position.set(side * (0.23 * bulk + 0.06), 1.26, 0);
      group.add(pauldron);
    }
  }

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.29), helmet === 'full' ? body : skin);
  head.position.y = 1.47;
  group.add(head);

  if (hair === 'short') {
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.31), trim);
    top.position.y = 1.62;
    group.add(top);
  } else if (hair === 'ponytail') {
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.31), trim);
    top.position.y = 1.62;
    group.add(top);
    // Behind the head: the model faces -Z, so +Z is its back.
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.12), trim);
    tail.position.set(0, 1.46, 0.19);
    tail.rotation.x = -0.35;
    group.add(tail);
  }

  if (helmet === 'cap') {
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.12, 0.32), body);
    crown.position.y = 1.66;
    group.add(crown);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.04, 0.16), trim);
    brim.position.set(0, 1.6, -0.22);
    group.add(brim);
  } else if (helmet === 'full') {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.35), body);
    shell.position.y = 1.5;
    group.add(shell);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.12), trim);
    jaw.position.set(0, 1.38, -0.2);
    group.add(jaw);
  } else if (helmet === 'crest') {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.33), body);
    shell.position.y = 1.5;
    group.add(shell);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.34), trim);
    fin.position.y = 1.76;
    group.add(fin);
  }

  if (visor) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(helmet === 'full' ? 0.3 : 0.32, 0.09, 0.06),
      new THREE.MeshStandardMaterial({
        color: visor, emissive: visor, emissiveIntensity: 1.2, roughness: 0.2,
      }),
    );
    band.position.set(0, helmet === 'full' ? 1.52 : 1.5, helmet === 'full' ? -0.19 : -0.16);
    group.add(band);
  }

  let cape: THREE.Mesh | undefined;
  if (wantsCape) {
    cape = new THREE.Mesh(
      new THREE.BoxGeometry(0.5 * bulk, 0.86, 0.05),
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide }),
    );
    // Pivoted at the shoulders so a game can sway it from the top.
    cape.geometry.translate(0, -0.43, 0);
    cape.position.set(0, 1.3, 0.17 * bulk);
    cape.rotation.x = -0.12;
    group.add(cape);
  }

  if (pack) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.18), trim);
    bag.position.set(0, 1.06, 0.2 * bulk);
    group.add(bag);
  }

  if (scarf) {
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.3), trim);
    collar.position.y = 1.3;
    group.add(collar);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.06), trim);
    tail.position.set(0.04, 1.14, 0.24);
    tail.rotation.x = -0.5;
    group.add(tail);
  }

  const limb = (material: THREE.Material, w: number, h: number, at: [number, number, number]) => {
    const pivot = new THREE.Group();
    pivot.position.set(at[0], at[1], at[2]);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), material);
    // Hung below the pivot so rotating the group swings the limb from its joint.
    mesh.position.y = -h / 2;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  };

  const arm = 0.15 * bulk;
  const leg = 0.17 * bulk;
  const shoulder = 0.23 * bulk + 0.08;
  const armL = limb(body, arm, 0.5, [-shoulder, 1.24, 0]);
  const armR = limb(body, arm, 0.5, [shoulder, 1.24, 0]);
  const legL = limb(trim, leg, 0.64, [-0.12, 0.68, 0]);
  const legR = limb(trim, leg, 0.64, [0.12, 0.68, 0]);

  group.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) object.castShadow = true;
  });

  return { group, head, torso, armL, armR, legL, legR, body, cape };
}

/**
 * Swing a character's limbs.
 *
 * `phase` advances with distance or time; `swing` is how far the limbs travel,
 * so 0 stands still and a larger value reads as a harder run. Arms lead the
 * opposite leg, which is the detail that stops a walk looking like a shuffle.
 */
export function poseRun(character: Character, phase: number, swing = 0.9) {
  const a = Math.sin(phase) * swing;
  character.legL.rotation.x = a;
  character.legR.rotation.x = -a;
  character.armL.rotation.x = -a * 0.8;
  character.armR.rotation.x = a * 0.8;
}

export interface Car {
  group: THREE.Group;
  body: THREE.Mesh;
  paint: THREE.MeshStandardMaterial;
  wheels: THREE.Mesh[];
  brakes: THREE.MeshStandardMaterial;
}

/**
 * An original car, built to read as a car rather than as a stack of boxes.
 *
 * The difference is almost entirely in the silhouette: a lower, wider body
 * with a tapered nose, a cabin inset from the flanks and raked back, arches
 * around the wheels, and a rear light bar. Paint is glossy and slightly
 * metallic so the key light puts a highlight along the shoulder line, which
 * is what actually sells it as a vehicle in motion.
 *
 * No real manufacturer's design, badge or proportions are reproduced.
 */
export function buildCar(color: string, length = 4.0): Car {
  const group = new THREE.Group();

  const paint = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.22,
    metalness: 0.55,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: '#10141d', roughness: 0.08, metalness: 0.6,
  });
  const trim = new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.65 });

  const W = 1.8;
  const half = length / 2;

  // Lower hull, sitting on the wheels.
  const hull = new THREE.Mesh(new THREE.BoxGeometry(W, 0.42, length), paint);
  hull.position.y = 0.52;
  hull.castShadow = true;
  group.add(hull);

  // Upper body, narrower and shorter — the step between the two is the
  // shoulder line that catches the light.
  const body = new THREE.Mesh(new THREE.BoxGeometry(W * 0.94, 0.34, length * 0.86), paint);
  body.position.y = 0.86;
  body.castShadow = true;
  group.add(body);

  // Tapered nose: a wedge in front of the hull rather than a flat face.
  const nose = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.3, 0.7), paint);
  nose.position.set(0, 0.62, -half - 0.12);
  nose.rotation.x = 0.12;
  nose.castShadow = true;
  group.add(nose);

  // Cabin, raked and inset.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.78, 0.46, length * 0.4), glass);
  cabin.position.set(0, 1.2, 0.18);
  cabin.castShadow = true;
  group.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 0.72, 0.1, length * 0.3), paint);
  roof.position.set(0, 1.44, 0.22);
  roof.castShadow = true;
  group.add(roof);

  // Rear spoiler.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.07, 0.34), trim);
  wing.position.set(0, 1.16, half - 0.1);
  wing.castShadow = true;
  group.add(wing);
  for (const x of [-W * 0.34, W * 0.34]) {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.12), trim);
    stalk.position.set(x, 1.06, half - 0.1);
    group.add(stalk);
  }

  // Wheels, with a rim face so they are not plain black cylinders, sunk into
  // arches so the body sits over them rather than floating above.
  const tyre = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 18);
  const rim = new THREE.CylinderGeometry(0.24, 0.24, 0.32, 12);
  const tyreMat = new THREE.MeshStandardMaterial({ color: '#0e0f12', roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.3, metalness: 0.85 });
  const brakes = new THREE.MeshStandardMaterial({
    color: '#3a0d08', emissive: '#ff2d0a', emissiveIntensity: 0, roughness: 0.6,
  });

  const wheels: THREE.Mesh[] = [];
  for (const wx of [-W / 2 + 0.06, W / 2 - 0.06]) {
    for (const wz of [-half + 0.9, half - 0.85]) {
      const wheel = new THREE.Mesh(tyre, tyreMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.42, wz);
      wheel.castShadow = true;
      const face = new THREE.Mesh(rim, rimMat);
      face.rotation.z = Math.PI / 2;
      wheel.add(face);
      group.add(wheel);
      wheels.push(wheel);

      const arch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 1.06), trim);
      arch.position.set(wx + (wx < 0 ? -0.02 : 0.02), 0.62, wz);
      group.add(arch);
    }
  }

  // Lights. Emissive rather than real lights: a dozen point lights in frame
  // is the fastest way to lose a phone's frame rate.
  const headMat = new THREE.MeshStandardMaterial({
    color: '#fffdf2', emissive: '#fff4cf', emissiveIntensity: 1.8, roughness: 0.15,
  });
  for (const x of [-W * 0.32, W * 0.32]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.1), headMat);
    lamp.position.set(x, 0.72, -half - 0.3);
    group.add(lamp);
  }

  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.1, 0.08), brakes);
  tailBar.position.set(0, 0.86, half + 0.02);
  group.add(tailBar);
  for (const x of [-W * 0.3, W * 0.3]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.08), brakes);
    lamp.position.set(x, 0.7, half + 0.02);
    group.add(lamp);
  }

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.06), trim);
  plate.position.set(0, 0.56, half + 0.03);
  group.add(plate);

  return { group, body: hull, paint, wheels, brakes };
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
