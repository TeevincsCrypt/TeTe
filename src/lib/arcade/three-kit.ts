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
  } = options;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  const skyColor = new THREE.Color(sky);
  scene.background = skyColor;
  if (fog) scene.fog = new THREE.Fog(skyColor.getHex(), fog[0], fog[1]);

  const cam = new THREE.PerspectiveCamera(fov, 1, 0.1, 400);
  cam.position.set(cameraAt[0], cameraAt[1], cameraAt[2]);
  cam.lookAt(lookAt[0], lookAt[1], lookAt[2]);

  scene.add(new THREE.AmbientLight('#e8f0ff', ambient));
  const key = new THREE.DirectionalLight('#fff4de', sunIntensity);
  key.position.set(sun[0], sun[1], sun[2]);
  scene.add(key);

  return { renderer, scene, camera: cam };
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

/** An original low-poly car, painted with the player's chosen colour. */
export function buildCar(color: string, length = 2.1): { group: THREE.Group; body: THREE.Mesh } {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.36, length), bodyMat);
  body.position.y = 0.32;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 0.3, length * 0.5),
    new THREE.MeshStandardMaterial({ color: '#12151c', roughness: 0.2 }),
  );
  cabin.position.set(0, 0.62, -0.05);
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.22, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.8 });
  for (const wx of [-0.55, 0.55]) {
    for (const wz of [length / 2 - 0.42, -length / 2 + 0.42]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.24, wz);
      group.add(wheel);
    }
  }

  return { group, body };
}

/** Procedural palm, for any game that wants a horizon with something on it. */
export function buildPalm(): THREE.Group {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.13, 2.1, 6),
    new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 0.9 }),
  );
  trunk.position.y = 1.05;
  trunk.rotation.z = (Math.random() - 0.5) * 0.15;
  group.add(trunk);

  const frondMat = new THREE.MeshStandardMaterial({
    color: '#2f7d4a',
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 6; i += 1) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.16, 4), frondMat);
    const angle = (i / 6) * Math.PI * 2;
    frond.position.set(Math.cos(angle) * 0.32, 2.15, Math.sin(angle) * 0.32);
    frond.rotation.x = Math.PI / 2 + Math.sin(angle) * 0.5;
    frond.rotation.z = angle;
    group.add(frond);
  }
  return group;
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
