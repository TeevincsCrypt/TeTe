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
  buildCharacter,
  buildSkyline,
  createStage,
  disposeStage,
  ground,
  hideRest,
  poseRun,
  pool,
  type Character,
  type Stage,
} from './three-kit';

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

function sleeperTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2b3242';
  ctx.fillRect(0, 0, 64, 64);
  // One sleeper per tile; the tile repeats once per metre of track.
  ctx.fillStyle = '#212736';
  ctx.fillRect(0, 44, 64, 14);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 58, 64, 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, FAR);
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

function buildLamp(): THREE.Group {
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: '#39414f', roughness: 0.7 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 6), postMat);
  post.position.y = 2.2;
  group.add(post);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.09, 0.09), postMat);
  arm.position.set(0, 4.3, 0);
  group.add(arm);
  // Emissive only — a real light per lamp would be dozens of lights in frame.
  const bulb = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.12, 0.24),
    new THREE.MeshStandardMaterial({
      color: '#ffd678', emissive: '#ffd678', emissiveIntensity: 1.6,
    }),
  );
  bulb.position.set(0, 4.2, 0);
  group.add(bulb);
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
  cameraX: number;
}

export function createRushScene(canvas: HTMLCanvasElement, color: string, accent: string): RushScene {
  const stage = createStage(canvas, {
    sky: '#1d2433',
    fog: [26, 72],
    // Set back and high enough to read two or three obstacles ahead, which is
    // the distance the game actually asks a player to plan over.
    camera: [0, 4.1, 8.2],
    lookAt: [0, 1.0, -14],
    ambient: 0.55,
    sunIntensity: 0.85,
    sun: [-4, 12, 6],
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

  // Gravel either side, so the corridor has edges without needing walls.
  ground(stage.scene, '#202736', [14, FAR * DEPTH], [-(LANE_W * 3) / 2 - 6.5, -0.02, -FAR * 0.5]);
  ground(stage.scene, '#202736', [14, FAR * DEPTH], [(LANE_W * 3) / 2 + 6.5, -0.02, -FAR * 0.5]);

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

  buildSkyline(stage.scene, 16, -78, '#141a26');

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

  const runner = buildCharacter(color, accent);
  stage.scene.add(runner.group);

  return { stage, runner, track, sleepers, trains, barriers, rails, coins, hazards, lamps, cameraX: 0 };
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

  // Lamp posts, recycled by distance so the corridor keeps passing something.
  const spacing = 9;
  for (let i = 0; i < scene.lamps.length; i += 1) {
    const lamp = scene.lamps[i];
    if (!lamp) continue;
    const span = scene.lamps.length * spacing * 0.5;
    const side = i % 2 === 0 ? -1 : 1;
    const along = (i * spacing * 0.5 - s.distance) % span;
    lamp.visible = true;
    lamp.position.set(side * (LANE_W * 1.5 + 1.4), 0, -(((along % span) + span) % span));
  }

  scene.cameraX += (x * 0.45 - scene.cameraX) * 0.15;
  scene.stage.camera.position.set(scene.cameraX, 4.1 + s.air * 0.22, 8.2);
  scene.stage.camera.lookAt(scene.cameraX * 0.7, 1.0 + s.air * 0.3, -14);
}

export function disposeRushScene(scene: RushScene) {
  disposeStage(scene.stage);
}
