/**
 * Crossing's 3D world: a grid of grass and road stretching away from a
 * raised, angled camera.
 *
 * The game is played on a grid of rows and columns, which is already a world
 * layout rather than a drawing — so the conversion is a coordinate change, not
 * a redesign. A lane index becomes depth, a column becomes lateral position,
 * and the hop that was a squash-and-stretch is now an actual arc through the
 * air.
 *
 * No existing title's art, character or level is reproduced; the figure is the
 * arcade's own, in the player's chosen colours.
 */
import * as THREE from 'three';

import {
  buildCar,
  buildCharacter,
  createStage,
  disposeStage,
  hideRest,
  pool,
  type Character,
  type Stage,
} from './three-kit';
import type { Look } from './characters';

/** World units per grid square. */
const TILE = 1.4;
export const COLS = 7;
/** Rows kept built around the player. */
const ROWS_AHEAD = 11;
const ROWS_BEHIND = 3;

export interface CrossingLane {
  kind: 'road' | 'safe';
  seed: number;
}
export interface CrossingCar {
  lane: number;
  /** Position across the board, in the game's own pixel units. */
  x: number;
  speed: number;
  w: number;
  kind: 'car' | 'train';
  body: string;
}
export interface CrossingPickup {
  lane: number;
  col: number;
  kind: 'coin' | 'hazard';
  taken: boolean;
}

export interface CrossingFrameState {
  row: number;
  col: number;
  /** Smoothed scroll, in the game's pixel units. */
  scroll: number;
  hop: number;
  over: boolean;
  lanes: CrossingLane[];
  cars: CrossingCar[];
  pickups: CrossingPickup[];
}

/** The game's own lane width in pixels, needed to read its car positions. */
const LANE_PX = 46;

interface Row {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  stripe: THREE.Mesh;
}

export interface CrossingScene {
  stage: Stage;
  player: Character;
  rows: Row[];
  cars: { group: THREE.Group; body: THREE.Mesh }[];
  trains: THREE.Mesh[];
  coins: THREE.Mesh[];
  hazards: THREE.Mesh[];
  cameraX: number;
}

export function createCrossingScene(
  canvas: HTMLCanvasElement,
  look: Look,
): CrossingScene {
  const stage = createStage(canvas, {
    sky: '#bfd8e6',
    gradient: ['#7db8e0', '#d6e8f2', '#7ba055'],
    fog: [24, 54],
    fov: 46,
    shadows: true,
    shadowSpan: 14,
    // Raised and tilted down the board, so several rows of traffic read at
    // once — the game is about reading what is coming, not what is alongside.
    camera: [0, 8.2, 9.4],
    lookAt: [0, 0, -4.5],
    ambient: 0.8,
    sunIntensity: 0.95,
    sun: [-5, 12, 5],
  });

  const rows: Row[] = [];
  const stripeMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.7,
    transparent: true,
    opacity: 0.3,
  });
  // Rows run well past the playable columns so a road reads as a road that
  // continues off-screen — which is where its traffic comes from — rather than
  // as a strip floating with the sky showing past its ends.
  const ROW_W = COLS * TILE + 22;
  for (let i = 0; i < ROWS_AHEAD + ROWS_BEHIND + 2; i += 1) {
    const material = new THREE.MeshStandardMaterial({ color: '#7cb342', roughness: 1 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ROW_W, TILE), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    stage.scene.add(mesh);

    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(ROW_W, 0.06), stripeMat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.visible = false;
    stage.scene.add(stripe);

    rows.push({ mesh, material, stripe });
  }

  // Built one at a time rather than through `pool`, because each car needs its
  // own body material: a pooled car takes the colour of whichever car it is
  // standing in for this frame, and a shared material would repaint all of them.
  const cars: { group: THREE.Group; body: THREE.Mesh }[] = [];
  for (let i = 0; i < 20; i += 1) {
    const car = buildCar('#ff6a1a', 1.6);
    car.group.visible = false;
    stage.scene.add(car.group);
    cars.push(car);
  }

  const trains = pool(stage.scene, 5, () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 1.3, 1.0),
      new THREE.MeshStandardMaterial({ color: '#b8342a', roughness: 0.55 }),
    );
    mesh.position.y = 0.65;
    return mesh;
  });

  const coinGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.08, 16);
  const coinMat = new THREE.MeshStandardMaterial({
    color: '#f2c14e', emissive: '#8a5c00', emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.3,
  });
  const coins = pool(stage.scene, 10, () => new THREE.Mesh(coinGeo, coinMat));

  const hazardGeo = new THREE.OctahedronGeometry(0.28, 0);
  const hazardMat = new THREE.MeshStandardMaterial({
    color: '#e2412f', emissive: '#4a0d05', emissiveIntensity: 0.35, roughness: 0.5,
  });
  const hazards = pool(stage.scene, 10, () => new THREE.Mesh(hazardGeo, hazardMat));

  const player = buildCharacter(look);
  player.group.scale.setScalar(0.8);
  stage.scene.add(player.group);

  return { stage, player, rows, cars, trains, coins, hazards, cameraX: 0 };
}

export function updateCrossingScene(scene: CrossingScene, s: CrossingFrameState) {
  // Everything is placed relative to the smoothed scroll, so the board glides
  // forward by a row rather than snapping when the player hops.
  const scrollRow = s.scroll / LANE_PX;
  const depth = (lane: number) => -(lane - scrollRow) * TILE;
  const across = (col: number) => (col - (COLS - 1) / 2) * TILE;
  /** The game tracks car positions in pixels across the board. */
  const acrossPx = (x: number) => (x / LANE_PX - COLS / 2) * TILE;

  let rowI = 0;
  const first = Math.max(0, s.row - ROWS_BEHIND);
  for (let i = first; i < s.row + ROWS_AHEAD; i += 1) {
    const lane = s.lanes[i];
    const row = scene.rows[rowI];
    if (!lane || !row) continue;
    rowI += 1;
    const z = depth(i);
    row.mesh.visible = true;
    row.mesh.position.set(0, 0, z);
    row.material.color.set(lane.kind === 'road' ? '#3a3a40' : i % 2 ? '#7cb342' : '#74a83c');
    row.stripe.visible = lane.kind === 'road';
    row.stripe.position.set(0, 0.012, z);
  }
  for (let i = rowI; i < scene.rows.length; i += 1) {
    const row = scene.rows[i];
    if (!row) continue;
    row.mesh.visible = false;
    row.stripe.visible = false;
  }

  let carI = 0;
  let trainI = 0;
  for (const car of s.cars) {
    if (car.lane < first || car.lane > s.row + ROWS_AHEAD) continue;
    const z = depth(car.lane);
    const x = acrossPx(car.x);

    if (car.kind === 'train') {
      const mesh = scene.trains[trainI];
      trainI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(x, 0.65, z);
    } else {
      const entry = scene.cars[carI];
      carI += 1;
      if (!entry) continue;
      entry.group.visible = true;
      entry.group.position.set(x, 0, z);
      // Cars are modelled nose-along -Z, so a quarter turn points them across
      // the board, and the sign of their speed decides which way.
      entry.group.rotation.y = car.speed > 0 ? Math.PI / 2 : -Math.PI / 2;
      (entry.body.material as THREE.MeshStandardMaterial).color.set(car.body);
    }
  }
  for (let i = carI; i < scene.cars.length; i += 1) {
    const entry = scene.cars[i];
    if (entry) entry.group.visible = false;
  }
  hideRest(scene.trains, trainI);

  let coinI = 0;
  let hazardI = 0;
  for (const pickup of s.pickups) {
    if (pickup.taken) continue;
    if (pickup.lane < first || pickup.lane > s.row + ROWS_AHEAD) continue;
    const x = across(pickup.col);
    const z = depth(pickup.lane);
    if (pickup.kind === 'coin') {
      const mesh = scene.coins[coinI];
      coinI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(x, 0.45, z);
      mesh.rotation.y += 0.09;
    } else {
      const mesh = scene.hazards[hazardI];
      hazardI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(x, 0.34, z);
      mesh.rotation.y += 0.05;
    }
  }
  hideRest(scene.coins, coinI);
  hideRest(scene.hazards, hazardI);

  // The hop counts down from 1, so a half-open sine is the arc through it.
  const player = scene.player;
  const lift = Math.sin(Math.max(0, Math.min(1, s.hop)) * Math.PI) * 0.55;
  player.group.position.set(across(s.col), lift, depth(s.row));
  player.group.rotation.y = Math.PI; // facing away, up the board
  // Legs tuck on the way up rather than staying planted.
  const tuck = lift * 1.2;
  player.legL.rotation.x = tuck;
  player.legR.rotation.x = tuck;
  player.armL.rotation.x = -tuck * 1.4;
  player.armR.rotation.x = -tuck * 1.4;
  if (s.over) player.group.rotation.z = 1.4;
  else player.group.rotation.z = 0;

  scene.cameraX += (across(s.col) * 0.35 - scene.cameraX) * 0.12;
  scene.stage.camera.position.set(scene.cameraX, 8.2, 9.4);
  scene.stage.camera.lookAt(scene.cameraX * 0.6, 0, -4.5);
}

export function disposeCrossingScene(scene: CrossingScene) {
  disposeStage(scene.stage);
}
