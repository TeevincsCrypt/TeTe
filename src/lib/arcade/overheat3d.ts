/**
 * Overheat's 3D world: a dirt track rolling over hills, watched from the side.
 *
 * The game was always driven by a height function over distance, which is a
 * landscape rather than a picture of one — so the terrain here is that exact
 * function, extruded into a track with real width and lit from above. The
 * camera keeps the side-on framing the riding depends on (you judge a landing
 * against the slope you can see), just with depth behind it.
 *
 * `terrainAt` and `slopeAt` live here rather than in the component so the
 * physics and the ground the player sees can never drift apart — they are the
 * same function.
 */
import * as THREE from 'three';

import {
  buildCharacter,
  createStage,
  disposeStage,
  hideRest,
  pool,
  type Character,
  type Stage,
} from './three-kit';
import type { Look } from './characters';

/** Pixels of terrain height per metre ridden — the game's own scale. */
export const PPM = 6;

/** Terrain height at a distance, in pixels above the baseline. */
export function terrainAt(x: number): number {
  return (
    Math.sin(x * 0.055) * 26 +
    Math.sin(x * 0.021 + 1.3) * 44 +
    Math.sin(x * 0.11 + 0.7) * 9
  );
}

/**
 * Terrain slope, as the angle it is actually drawn at.
 *
 * The horizontal step has to be converted to pixels before the angle is taken:
 * height is in pixels and distance is in metres, and comparing the two
 * directly reports every hill as roughly six times steeper than it appears —
 * which put the bike permanently past its own landing tolerance and ended
 * every run inside thirty metres.
 */
export function slopeAt(x: number): number {
  const d = 0.6;
  return Math.atan2(terrainAt(x + d) - terrainAt(x - d), d * 2 * PPM);
}

/** Pixels of game height to world units. */
const H = 1 / PPM;
/** Metres of track built around the rider. */
const BEHIND = 12;
const AHEAD = 34;
const STEP = 0.5;
const SEGMENTS = Math.round((BEHIND + AHEAD) / STEP);
const TRACK_W = 9;

export interface OverheatPickup {
  x: number;
  y: number;
  kind: 'coin' | 'hazard';
  taken: boolean;
}

export interface OverheatFrameState {
  x: number;
  y: number;
  angle: number;
  heat: number;
  stalled: number;
  wheel: number;
  airborne: boolean;
  over: boolean;
  pickups: OverheatPickup[];
}

function buildBike(color: string): { group: THREE.Group; wheelF: THREE.Mesh; wheelR: THREE.Mesh } {
  const group = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.8 });

  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.26, 0.3), frameMat);
  frame.position.y = 0.62;
  group.add(frame);

  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.34), frameMat);
  tank.position.set(-0.1, 0.86, 0);
  group.add(tank);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.3), darkMat);
  seat.position.set(-0.5, 0.92, 0);
  group.add(seat);

  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.16, 16);
  const wheelF = new THREE.Mesh(wheelGeo, darkMat);
  wheelF.rotation.x = Math.PI / 2;
  wheelF.position.set(0.78, 0.42, 0);
  group.add(wheelF);

  const wheelR = new THREE.Mesh(wheelGeo, darkMat);
  wheelR.rotation.x = Math.PI / 2;
  wheelR.position.set(-0.78, 0.42, 0);
  group.add(wheelR);

  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), darkMat);
  fork.position.set(0.72, 0.78, 0);
  fork.rotation.z = -0.3;
  group.add(fork);

  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.62), darkMat);
  bars.position.set(0.62, 1.04, 0);
  group.add(bars);

  return { group, wheelF, wheelR };
}

/** A strip of ground following the height function, with real width. */
function terrainRibbon(material: THREE.Material): { mesh: THREE.Mesh; geometry: THREE.BufferGeometry } {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array((SEGMENTS + 1) * 2 * 3);
  const uvs = new Float32Array((SEGMENTS + 1) * 2 * 2);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage));

  const indices: number[] = [];
  for (let i = 0; i < SEGMENTS; i += 1) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  geometry.setIndex(indices);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, geometry };
}

export interface OverheatScene {
  stage: Stage;
  rider: Character;
  bike: { group: THREE.Group; wheelF: THREE.Mesh; wheelR: THREE.Mesh };
  track: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry };
  /** The earth below the track, cut away towards the camera. */
  face: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry };
  hills: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry };
  sky: THREE.Color;
  coins: THREE.Mesh[];
  hazards: THREE.Mesh[];
}

export function createOverheatScene(
  canvas: HTMLCanvasElement,
  look: Look,
): OverheatScene {
  const stage = createStage(canvas, {
    sky: '#1b2a3a',
    fog: [30, 90],
    fov: 50,
    camera: [0, 4, 16],
    lookAt: [0, 1, 0],
    ambient: 0.7,
    sunIntensity: 1,
    sun: [4, 14, 8],
  });

  const track = terrainRibbon(new THREE.MeshStandardMaterial({ color: '#6b4a2a', roughness: 1 }));
  stage.scene.add(track.mesh);

  // Without this the track is a sheet seen edge-on and reads as a floating
  // plank. The cut-away face turns it into ground with earth under it, which
  // is also how this genre has always been drawn.
  const face = terrainRibbon(
    new THREE.MeshStandardMaterial({ color: '#4a3018', roughness: 1, side: THREE.DoubleSide }),
  );
  stage.scene.add(face.mesh);

  const hills = terrainRibbon(
    new THREE.MeshStandardMaterial({ color: '#243447', roughness: 1 }),
  );
  stage.scene.add(hills.mesh);

  const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.1, 16);
  const coinMat = new THREE.MeshStandardMaterial({
    color: '#f2c14e', emissive: '#8a5c00', emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.3,
  });
  const coins = pool(stage.scene, 12, () => {
    const coin = new THREE.Mesh(coinGeo, coinMat);
    coin.rotation.x = Math.PI / 2;
    return coin;
  });

  const hazardGeo = new THREE.OctahedronGeometry(0.36, 0);
  const hazardMat = new THREE.MeshStandardMaterial({
    color: '#e2412f', emissive: '#4a0d05', emissiveIntensity: 0.4, roughness: 0.5,
  });
  const hazards = pool(stage.scene, 12, () => new THREE.Mesh(hazardGeo, hazardMat));

  const bike = buildBike(look.body);
  stage.scene.add(bike.group);

  const rider = buildCharacter(look);
  rider.group.scale.setScalar(0.62);
  // Seated: thighs forward, torso tipped over the bars.
  rider.legL.rotation.x = -1.5;
  rider.legR.rotation.x = -1.5;
  rider.armL.rotation.x = -1.1;
  rider.armR.rotation.x = -1.1;
  bike.group.add(rider.group);
  rider.group.position.set(-0.35, 0.5, 0);
  rider.group.rotation.y = -Math.PI / 2;

  return { stage, rider, bike, track, face, hills, sky: new THREE.Color('#1b2a3a'), coins, hazards };
}

function writeRibbon(
  geometry: THREE.BufferGeometry,
  fromX: number,
  height: (x: number) => number,
  halfWidth: number,
) {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i <= SEGMENTS; i += 1) {
    const x = fromX + i * STEP;
    const y = height(x);
    position.setXYZ(i * 2, x, y, halfWidth);
    position.setXYZ(i * 2 + 1, x, y, -halfWidth);
    uv.setXY(i * 2, x * 0.2, 0);
    uv.setXY(i * 2 + 1, x * 0.2, 1);
  }
  position.needsUpdate = true;
  uv.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

/**
 * A vertical wall following the height function: the cut-away earth under the
 * track up close, and the ridge silhouette far behind it.
 */
function writeFace(
  geometry: THREE.BufferGeometry,
  fromX: number,
  z: number,
  height: (x: number) => number,
) {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i <= SEGMENTS; i += 1) {
    const x = fromX + i * STEP;
    position.setXYZ(i * 2, x, height(x), z);
    position.setXYZ(i * 2 + 1, x, -20, z);
    uv.setXY(i * 2, x * 0.2, 0);
    uv.setXY(i * 2 + 1, x * 0.2, 1);
  }
  position.needsUpdate = true;
  uv.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

export function updateOverheatScene(scene: OverheatScene, s: OverheatFrameState) {
  const fromX = s.x - BEHIND;

  writeRibbon(scene.track.geometry, fromX, (x) => terrainAt(x) * H, TRACK_W / 2);
  writeFace(scene.face.geometry, fromX, TRACK_W / 2, (x) => terrainAt(x) * H);
  // Far hills: a ridge standing well behind the track, built from the same
  // shape at a lower frequency. It parallaxes for free because it genuinely
  // is further away rather than being scrolled at a fraction of the speed.
  writeFace(scene.hills.geometry, fromX, -34, (x) => terrainAt(x * 0.55) * H * 0.7 + 5);

  // A hot engine pushes the sky towards ember, which is the warning the player
  // reads without looking away from the terrain.
  const heat = Math.min(1, s.heat);
  scene.sky.setRGB(
    0.105 + heat * 0.13,
    0.165 - heat * 0.02,
    0.227 - heat * 0.13,
  );
  scene.stage.scene.background = scene.sky;
  if (scene.stage.scene.fog) (scene.stage.scene.fog as THREE.Fog).color.copy(scene.sky);

  const bikeY = s.y * H;
  scene.bike.group.position.set(s.x, bikeY, 0);
  scene.bike.group.rotation.z = s.angle;
  scene.bike.wheelF.rotation.y = s.wheel;
  scene.bike.wheelR.rotation.y = s.wheel;
  if (s.over) scene.bike.group.rotation.x = 1.1;
  else scene.bike.group.rotation.x = 0;

  let coinI = 0;
  let hazardI = 0;
  for (const pickup of s.pickups) {
    if (pickup.taken) continue;
    if (pickup.x < fromX || pickup.x > fromX + BEHIND + AHEAD) continue;
    if (pickup.kind === 'coin') {
      const mesh = scene.coins[coinI];
      coinI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(pickup.x, pickup.y * H, 0);
      mesh.rotation.z += 0.1;
    } else {
      const mesh = scene.hazards[hazardI];
      hazardI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(pickup.x, pickup.y * H, 0);
      mesh.rotation.y += 0.06;
    }
  }
  hideRest(scene.coins, coinI);
  hideRest(scene.hazards, hazardI);

  // Side-on, tracking the rider: the framing the landing judgement needs.
  scene.stage.camera.position.set(s.x + 3.2, bikeY + 4.2, 19);
  scene.stage.camera.lookAt(s.x + 3.2, bikeY + 0.8, 0);
}

export function disposeOverheatScene(scene: OverheatScene) {
  disposeStage(scene.stage);
}
