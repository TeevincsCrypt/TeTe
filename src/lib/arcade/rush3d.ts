/**
 * Rush's 3D world: a night rail corridor through a city.
 *
 * Rush's physics was always three-dimensional — a distance in metres, a lane,
 * a height above the track — and the old renderer's job was to flatten that to
 * a vanishing point. So none of the game changed here: the same numbers now
 * place real geometry instead of being projected by hand, which is why the
 * track, the obstacles and the runner all sit exactly where the collision
 * checks already believed they were.
 *
 * No existing title's art, character or level is reproduced. The runner is the
 * arcade's own figure in the player's chosen colours.
 */
import * as THREE from 'three';

import {
  buildBush,
  buildCharacter,
  buildPalm,
  buildTree,
  createStage,
  disposeStage,
  ground,
  hideRest,
  noiseTexture,
  poseRun,
  pool,
  recycleAlong,
  type Character,
  type Stage,
} from './three-kit';
import type { Look } from './characters';

/** World units per metre of track. */
const DEPTH = 1;
/** Lateral distance between lane centres. */
export const LANE_W = 1.7;
/** How far ahead the track is built, in metres — matches the game's HORIZON. */
const FAR = 60;

export interface RushThing {
  z: number;
  lane: -1 | 0 | 1;
  kind: 'train' | 'barrier' | 'rail' | 'coin' | 'hazard';
  gone: boolean;
}

export interface RushFrameState {
  distance: number;
  laneShift: number;
  air: number;
  roll: number;
  stride: number;
  things: RushThing[];
  over: boolean;
}

/**
 * Ballast with a concrete sleeper laid across it, one per metre.
 *
 * Grain and blotching on top of the stone, because a railway bed seen at a
 * glancing angle is exactly where a flat colour gives itself away — and this
 * surface fills the lower half of the screen the whole time.
 */
function sleeperTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#4f4a44';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i += 1) {
    const shade = Math.round((Math.random() - 0.5) * 60);
    const tone = shade > 0 ? 255 : 0;
    ctx.fillStyle = `rgba(${tone},${tone},${tone},${Math.abs(shade) / 200})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2.2, 2.2);
  }

  ctx.fillStyle = '#6b625a';
  ctx.fillRect(0, 88, size, 26);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 112, size, 6);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, FAR);
  texture.anisotropy = 8;
  return texture;
}

function buildTrain(): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 2.2, 3.4),
    new THREE.MeshStandardMaterial({ color: '#b8342a', roughness: 0.55 }),
  );
  body.position.y = 1.2;
  group.add(body);
  const window_ = new THREE.Mesh(
    new THREE.BoxGeometry(1.42, 0.5, 1.6),
    new THREE.MeshStandardMaterial({ color: '#dfe9f2', roughness: 0.2, metalness: 0.2 }),
  );
  window_.position.y = 1.85;
  group.add(window_);
  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(1.44, 0.28, 3.42),
    new THREE.MeshStandardMaterial({ color: '#8c2620', roughness: 0.7 }),
  );
  skirt.position.y = 0.2;
  group.add(skirt);
  return group;
}

function buildBarrier(): THREE.Group {
  const group = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.62, 0.16),
    new THREE.MeshStandardMaterial({ color: '#f5c542', roughness: 0.6 }),
  );
  board.position.y = 0.45;
  group.add(board);
  const stripeMat = new THREE.MeshStandardMaterial({ color: '#17120e', roughness: 0.7 });
  for (const x of [-0.42, 0, 0.42]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.64, 0.18), stripeMat);
    stripe.position.set(x, 0.45, 0);
    group.add(stripe);
  }
  return group;
}

function buildRail(): THREE.Group {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#8d939b', roughness: 0.45, metalness: 0.45 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.18), metal);
  // Head height: low enough that only a roll clears it.
  bar.position.y = 1.32;
  group.add(bar);
  for (const x of [-0.66, 0.66]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.4, 0.14), metal);
    leg.position.set(x, 0.7, 0);
    group.add(leg);
  }
  return group;
}

/** A catenary mast with its gantry arm — what says "railway" at a glance. */
function buildLamp(): THREE.Group {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({
    color: '#7d8896', roughness: 0.45, metalness: 0.65,
  });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 6.4, 8), steel);
  post.position.y = 3.2;
  post.castShadow = true;
  group.add(post);

  // The arm reaches back over the track; the sign of its offset is set by the
  // side the mast stands on, so it always points inward.
  const arm = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.12), steel);
  arm.position.set(0, 6.2, 0);
  arm.castShadow = true;
  group.add(arm);

  const brace = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.09), steel);
  brace.position.set(0, 5.5, 0);
  brace.rotation.z = 0.42;
  group.add(brace);

  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.12, 0.22),
    new THREE.MeshStandardMaterial({
      color: '#ffe9b0', emissive: '#ffd678', emissiveIntensity: 0.9,
    }),
  );
  lamp.position.set(0, 6.05, 0);
  group.add(lamp);
  return group;
}

export interface RushScene {
  stage: Stage;
  runner: Character;
  track: THREE.Mesh;
  sleepers: THREE.CanvasTexture;
  trains: THREE.Group[];
  barriers: THREE.Group[];
  rails: THREE.Group[];
  coins: THREE.Mesh[];
  hazards: THREE.Mesh[];
  lamps: THREE.Group[];
  palms: THREE.Group[];
  trees: THREE.Group[];
  bushes: THREE.Mesh[];
  cameraX: number;
}

export function createRushScene(canvas: HTMLCanvasElement, look: Look): RushScene {
  const stage = createStage(canvas, {
    // Daylight rather than the near-black it ran in before. The corridor was
    // unreadable past the first obstacle, and every metal surface in it — the
    // rails, the masts, the barriers — needs a lit sky to be worth having.
    sky: '#c4d9e6',
    gradient: ['#7fb6dd', '#d6e6ef', '#6f7d62'],
    fog: [44, 128],
    shadows: true,
    shadowSpan: 14,
    // Set back and high enough to read two or three obstacles ahead, which is
    // the distance the game actually asks a player to plan over.
    camera: [0, 4.1, 8.2],
    lookAt: [0, 1.0, -16],
    ambient: 0.95,
    sunIntensity: 1.45,
    sun: [12, 22, 8],
    exposure: 1.08,
  });

  // Track bed, laid far enough forward that its far edge is inside the fog.
  const sleepers = sleeperTexture();
  const track = new THREE.Mesh(
    new THREE.PlaneGeometry(LANE_W * 3 + 1.2, FAR * DEPTH),
    new THREE.MeshStandardMaterial({ map: sleepers, roughness: 0.95 }),
  );
  track.rotation.x = -Math.PI / 2;
  track.position.set(0, 0, -FAR * DEPTH * 0.5 + 4);
  stage.scene.add(track);

  // Two steel rails per side of every lane boundary would be a model railway;
  // one pair down the outside of the corridor is what reads as track at speed.
  const railMat = new THREE.MeshStandardMaterial({
    color: '#b8c0ca', roughness: 0.28, metalness: 0.9,
  });
  for (const x of [-LANE_W * 1.5 + 0.28, LANE_W * 1.5 - 0.28]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.16, FAR * DEPTH),
      railMat,
    );
    rail.position.set(x, 0.1, -FAR * DEPTH * 0.5 + 4);
    rail.castShadow = true;
    stage.scene.add(rail);
  }

  // Grass embankments either side, wide enough to plant on.
  const verge = noiseTexture('#5d8b46', { repeat: [12, 80], grain: 2600, contrast: 30, patches: 12 });
  for (const side of [-1, 1]) {
    ground(
      stage.scene,
      '#5d8b46',
      [40, FAR * DEPTH * 1.4],
      [side * (LANE_W * 1.5 + 21), -0.05, -FAR * 0.5],
      { map: verge },
    );
  }

  const lineMat = new THREE.MeshStandardMaterial({
    color: '#c8ff4d',
    roughness: 0.6,
    transparent: true,
    opacity: 0.25,
  });
  // Dividers sit halfway between lane centres, which are at -LANE_W, 0, +LANE_W.
  for (const side of [-0.5, 0.5]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, FAR * DEPTH), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(side * LANE_W, 0.01, -FAR * DEPTH * 0.5 + 4);
    stage.scene.add(line);
  }

  // Distant city, set inside the fog so it reads as structures in haze.
  const cityMat = new THREE.MeshStandardMaterial({ color: '#a7b6c2', roughness: 1 });
  const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cityMat, 26);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 26; i += 1) {
    const h = 10 + Math.random() * 38;
    const w = 6 + Math.random() * 9;
    const side = i % 2 === 0 ? -1 : 1;
    m.makeScale(w, h, w);
    m.setPosition(side * (24 + Math.random() * 70), h / 2, -96 - Math.random() * 40);
    city.setMatrixAt(i, m);
  }
  city.instanceMatrix.needsUpdate = true;
  stage.scene.add(city);

  const trains = pool(stage.scene, 6, () => buildTrain());
  const barriers = pool(stage.scene, 8, () => buildBarrier());
  const rails = pool(stage.scene, 8, () => buildRail());

  const coinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 16);
  const coinMat = new THREE.MeshStandardMaterial({
    color: '#f2c14e', emissive: '#8a5c00', emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.3,
  });
  const coins = pool(stage.scene, 18, () => {
    const coin = new THREE.Mesh(coinGeo, coinMat);
    coin.rotation.x = Math.PI / 2;
    return coin;
  });

  const hazardGeo = new THREE.OctahedronGeometry(0.32, 0);
  const hazardMat = new THREE.MeshStandardMaterial({
    color: '#e2412f', emissive: '#4a0d05', emissiveIntensity: 0.35, roughness: 0.5,
  });
  const hazards = pool(stage.scene, 8, () => new THREE.Mesh(hazardGeo, hazardMat));

  const lamps = pool(stage.scene, 10, () => buildLamp());
  const palms = pool(stage.scene, 12, () => buildPalm(1));
  const trees = pool(stage.scene, 14, () => buildTree(1));
  const bushes = pool(stage.scene, 18, () => buildBush(1));

  const runner = buildCharacter(look);
  stage.scene.add(runner.group);

  return { stage, runner, track, sleepers, trains, barriers, rails, coins, hazards, lamps, palms, trees, bushes, cameraX: 0 };
}

export function updateRushScene(scene: RushScene, s: RushFrameState) {
  // The bed scrolls by real distance, so the ground moves at the speed the
  // runner is actually travelling rather than a decorative constant.
  scene.sleepers.offset.y = -(s.distance / DEPTH) % 1;

  let trainI = 0;
  let barrierI = 0;
  let railI = 0;
  let coinI = 0;
  let hazardI = 0;

  for (const thing of s.things) {
    if (thing.gone) continue;
    const gap = thing.z - s.distance;
    if (gap < -3 || gap > FAR) continue;
    const x = thing.lane * LANE_W;
    const z = -gap * DEPTH;

    if (thing.kind === 'train') {
      const mesh = scene.trains[trainI];
      trainI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(x, 0, z);
    } else if (thing.kind === 'barrier') {
      const mesh = scene.barriers[barrierI];
      barrierI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(x, 0, z);
    } else if (thing.kind === 'rail') {
      const mesh = scene.rails[railI];
      railI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(x, 0, z);
    } else if (thing.kind === 'coin') {
      const mesh = scene.coins[coinI];
      coinI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(x, 0.85, z);
      mesh.rotation.z += 0.14;
    } else {
      const mesh = scene.hazards[hazardI];
      hazardI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(x, 0.5, z);
      mesh.rotation.y += 0.07;
      mesh.rotation.x += 0.04;
    }
  }

  hideRest(scene.trains, trainI);
  hideRest(scene.barriers, barrierI);
  hideRest(scene.rails, railI);
  hideRest(scene.coins, coinI);
  hideRest(scene.hazards, hazardI);

  // The runner holds a fixed depth; the world comes to him.
  const runner = scene.runner;
  const x = s.laneShift * LANE_W;
  runner.group.position.set(x, s.air * 0.5, 0);

  if (s.roll > 0) {
    // Tucked and rotated forward, which is also what drops his head under a rail.
    runner.group.rotation.x = -1.15;
    runner.group.position.y = 0.35;
    poseRun(runner, s.stride * 2, 0.35);
  } else {
    runner.group.rotation.x = 0;
    // Legs tuck in the air rather than continuing to sprint.
    poseRun(runner, s.stride, s.air > 0.05 ? 0.25 : 0.95);
  }
  // Lean into a lane change, and level out once settled.
  runner.group.rotation.z = (s.laneShift - (runner.group.position.x / LANE_W)) * 0.2;
  runner.group.rotation.y = s.over ? 0.6 : 0;

  // Lineside scenery, recycled by distance travelled so a handful of objects
  // reads as a continuous corridor running to the horizon.
  const EDGE = LANE_W * 1.5;

  recycleAlong(scene.lamps, 11, s.distance, (lamp, i, z) => {
    const side = i % 2 === 0 ? -1 : 1;
    lamp.position.set(side * (EDGE + 1.6), 0, z);
    // The arm reaches inward over the track; offsetting it is enough, and
    // rotating the mast as well would transform it twice.
    lamp.children[1]?.position.set(-side * 1.5, 6.2, 0);
    lamp.children[2]?.position.set(-side * 0.7, 5.5, 0);
    lamp.children[3]?.position.set(-side * 2.6, 6.05, 0);
  });

  recycleAlong(scene.trees, 9, s.distance + 3, (tree, i, z) => {
    const side = i % 2 === 0 ? -1 : 1;
    tree.position.set(side * (EDGE + 6 + (i % 3) * 2.4), 0, z);
  });

  recycleAlong(scene.palms, 13, s.distance + 7, (palm, i, z) => {
    const side = i % 2 === 0 ? -1 : 1;
    palm.position.set(side * (EDGE + 9 + (i % 2) * 3.5), 0, z);
  });

  recycleAlong(scene.bushes, 6, s.distance, (bush, i, z) => {
    const side = i % 2 === 0 ? -1 : 1;
    bush.position.set(side * (EDGE + 2.4 + (i % 4) * 0.7), 0.2, z);
  });

  scene.cameraX += (x * 0.45 - scene.cameraX) * 0.15;
  scene.stage.sun.position.set(x + 12, 22, 8);
  scene.stage.sun.target.position.set(x, 0, -6);
  scene.stage.sun.target.updateMatrixWorld();

  scene.stage.camera.position.set(scene.cameraX, 4.1 + s.air * 0.22, 8.2);
  scene.stage.camera.lookAt(scene.cameraX * 0.7, 1.0 + s.air * 0.3, -14);
}

export function disposeRushScene(scene: RushScene) {
  disposeStage(scene.stage);
}
