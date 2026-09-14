/**
 * Drift's world: a coastal highway under bright haze.
 *
 * The game's own physics — the sine-walk road generation, one-touch steering,
 * pickups, collision, scoring — are entirely unchanged and still live in
 * DriftGame.tsx. This module only turns that same per-frame state (a list of
 * road cross-sections and pickups, the car's x position) into a world.
 *
 * Everything is placed off the road ribbon itself rather than off a fixed
 * grid: the shoulders, the guardrails and the tree line all read their
 * position from the same `centre` and `half` the collision check uses, so the
 * scenery bends with the road instead of sliding past it. That is what makes
 * a curve feel like a curve.
 *
 * One deliberate simplification: the road does not curve in true 3D heading.
 * Each cross-section shifts sideways by exactly the amount the 2D game
 * computes, viewed from a chase camera that leans rather than turns. Keeping
 * that means the driving feel is untouched; a camera that followed the
 * curve's tangent would be a different game to steer.
 *
 * No real manufacturer's car, and no existing title's art, is reproduced.
 */
import * as THREE from 'three';

import {
  blobShadow,
  buildBush,
  buildCar,
  buildPalm,
  buildTree,
  createStage,
  disposeStage,
  hideRest,
  noiseTexture,
  pool,
  type Car,
  type Stage,
} from './three-kit';

export interface Slice {
  y: number;
  centre: number;
  half: number;
}

export interface Pickup {
  x: number;
  y: number;
  kind: 'coin' | 'hazard';
}

/**
 * How far up the screen the car sits — shared with the game's own physics so
 * collision and pickup checks agree with where the car is drawn.
 */
export const CAR_Y_OFFSET = 96;

/** Screen pixels to world units, lateral. Sets how wide the road reads. */
const WORLD_X = 0.042;
/** Screen pixels of "further up the screen" to world units of depth. */
const DEPTH_PER_PX = 0.16;
/** Slices between guardrail posts, and between roadside plantings. */
const RAIL_STRIDE = 3;
const TREE_STRIDE = 2;
/**
 * Distance the game travels per road slice generated.
 *
 * The game advances `dist` by `speed * dt * 0.06` and `scroll` by
 * `speed * dt`, emitting one slice per STEP(12) of scroll — so a slice is
 * worth 12 * 0.06 of distance. Scenery is keyed off this rather than off the
 * slice's array index: the array shifts by one every time a slice is born, so
 * an index-keyed pattern is pinned to the screen and the trees slide and pop
 * instead of standing still in the world.
 */
const DIST_PER_SLICE = 12 * 0.06;

const POOL_RAILS = 44;
const POOL_PALMS = 26;
const POOL_TREES = 22;
const POOL_BUSHES = 34;
const POOL_COINS = 8;
const POOL_CONES = 8;

/** The dashed centre line, drawn once and scrolled by distance travelled. */
function dashTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 16, 128);
  ctx.fillStyle = '#f2d574';
  ctx.fillRect(4, 10, 8, 56);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 26);
  texture.anisotropy = 8;
  return texture;
}

/**
 * A strip that follows the road, rebuilt every frame from the slice list.
 *
 * Pre-allocated and written in place: a road that reallocates its geometry
 * sixty times a second is a garbage-collection stutter waiting to happen.
 */
function ribbon(maxSlices: number, material: THREE.Material) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(maxSlices * 2 * 3);
  const uvs = new Float32Array(maxSlices * 2 * 2);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage));

  const indices: number[] = [];
  for (let i = 0; i < maxSlices - 1; i += 1) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  geometry.setIndex(indices);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return { mesh, geometry };
}

function writeRibbon(
  geometry: THREE.BufferGeometry,
  slices: Slice[],
  edges: (slice: Slice) => [left: number, right: number],
  y: number,
  depth: (slice: Slice) => number,
  vScale = 0.06,
) {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const count = slices.length;
  for (let i = 0; i < count; i += 1) {
    const slice = slices[i];
    if (!slice) continue;
    const z = depth(slice);
    const [left, right] = edges(slice);
    position.setXYZ(i * 2, left, y, z);
    position.setXYZ(i * 2 + 1, right, y, z);
    // V runs with world depth so the texture keeps a constant scale down the
    // road instead of stretching as the slice spacing changes.
    const v = -z * vScale;
    uv.setXY(i * 2, 0, v);
    uv.setXY(i * 2 + 1, 1, v);
  }
  position.needsUpdate = true;
  uv.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

function buildGuardrail(): THREE.Group {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({
    color: '#d6dae0', roughness: 0.42, metalness: 0.7,
  });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, RAIL_STRIDE * 0.9), metal);
  beam.position.y = 0.72;
  beam.castShadow = true;
  group.add(beam);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), metal);
  post.position.y = 0.4;
  post.castShadow = true;
  group.add(post);
  return group;
}

/** A traffic cone — what the game's "hazard" actually looks like out here. */
function buildCone(): THREE.Group {
  const group = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 0.9, 10),
    new THREE.MeshStandardMaterial({ color: '#f04e23', roughness: 0.6 }),
  );
  cone.position.y = 0.45;
  cone.castShadow = true;
  group.add(cone);
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.28, 0.16, 10),
    new THREE.MeshStandardMaterial({ color: '#f6f6f4', roughness: 0.5 }),
  );
  band.position.y = 0.5;
  group.add(band);
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.08, 0.62),
    new THREE.MeshStandardMaterial({ color: '#2a2a2c', roughness: 0.85 }),
  );
  base.position.y = 0.04;
  group.add(base);
  return group;
}

export interface DriftScene {
  stage: Stage;
  car: Car;
  carShadow: THREE.Mesh;
  road: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry };
  centre: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry; texture: THREE.CanvasTexture };
  edgeL: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry };
  edgeR: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry };
  shoulderL: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry };
  shoulderR: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry };
  rails: THREE.Group[];
  palms: THREE.Group[];
  trees: THREE.Group[];
  bushes: THREE.Mesh[];
  coins: THREE.Mesh[];
  cones: THREE.Group[];
  cameraX: number;
  lean: number;
  baseColor: string;
}

export function createDriftScene(canvas: HTMLCanvasElement, carColor: string): DriftScene {
  const sky = '#cfe0ea';
  const stage = createStage(canvas, {
    sky,
    // Haze that swallows the far end of the road, which is what gives the
    // horizon depth rather than a hard edge.
    gradient: ['#8fc4e8', '#dbe9f0', '#93a882'],
    fog: [50, 150],
    fov: 56,
    // Low and close: the car sits in the bottom third and the road runs away
    // to the horizon, which is the framing this genre is always shot in.
    camera: [0, 3.5, 9.2],
    lookAt: [0, 1.0, -18],
    sun: [16, 26, 10],
    sunIntensity: 1.55,
    ambient: 0.9,
    bounce: '#7d8a6a',
    shadows: true,
    shadowSpan: 16,
    exposure: 1.1,
  });

  // ---- ground either side --------------------------------------------------
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420),
    new THREE.MeshStandardMaterial({
      map: noiseTexture('#5f8f46', { repeat: [60, 60], grain: 3000, contrast: 30, patches: 16 }),
      roughness: 1,
    }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, -0.06, -60);
  grass.receiveShadow = true;
  stage.scene.add(grass);

  // Sea off to one side, low enough to sit under the verge.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 420),
    new THREE.MeshStandardMaterial({ color: '#4d93b8', roughness: 0.18, metalness: 0.35 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(168, -0.9, -60);
  stage.scene.add(sea);

  // ---- distant city --------------------------------------------------------
  const cityMat = new THREE.MeshStandardMaterial({ color: '#9fb0bd', roughness: 1 });
  const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cityMat, 34);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 34; i += 1) {
    const h = 12 + Math.random() * 46;
    const w = 7 + Math.random() * 10;
    const side = i % 2 === 0 ? -1 : 1;
    m.makeScale(w, h, w);
    m.setPosition(
      side * (30 + Math.random() * 80),
      h / 2,
      -108 - Math.random() * 44,
    );
    city.setMatrixAt(i, m);
  }
  city.instanceMatrix.needsUpdate = true;
  stage.scene.add(city);

  // ---- the road ------------------------------------------------------------
  const asphalt = noiseTexture('#41444a', {
    repeat: [1, 1], grain: 4200, contrast: 22, patches: 14, size: 256,
  });
  const road = ribbon(96, new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92 }));
  stage.scene.add(road.mesh);

  const centreTex = dashTexture();
  const centre = {
    ...ribbon(96, new THREE.MeshStandardMaterial({
      map: centreTex, transparent: true, roughness: 0.7,
    })),
    texture: centreTex,
  };
  stage.scene.add(centre.mesh);

  const paint = new THREE.MeshStandardMaterial({ color: '#eef1f2', roughness: 0.6 });
  const edgeL = ribbon(96, paint);
  const edgeR = ribbon(96, paint);
  stage.scene.add(edgeL.mesh);
  stage.scene.add(edgeR.mesh);

  const gravel = new THREE.MeshStandardMaterial({
    map: noiseTexture('#6d6a63', { repeat: [1, 40], grain: 3400, contrast: 34 }),
    roughness: 1,
  });
  const shoulderL = ribbon(96, gravel);
  const shoulderR = ribbon(96, gravel);
  stage.scene.add(shoulderL.mesh);
  stage.scene.add(shoulderR.mesh);

  // ---- roadside ------------------------------------------------------------
  const rails = pool(stage.scene, POOL_RAILS, () => buildGuardrail());
  const palms = pool(stage.scene, POOL_PALMS, () => buildPalm(1));
  const trees = pool(stage.scene, POOL_TREES, () => buildTree(1));
  const bushes = pool(stage.scene, POOL_BUSHES, () => buildBush(1));

  // ---- pickups -------------------------------------------------------------
  const coinGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.12, 18);
  const coinMat = new THREE.MeshStandardMaterial({
    color: '#f7c948', emissive: '#7a5200', emissiveIntensity: 0.45,
    metalness: 0.85, roughness: 0.25,
  });
  const coins = pool(stage.scene, POOL_COINS, () => {
    const coin = new THREE.Mesh(coinGeo, coinMat);
    coin.rotation.x = Math.PI / 2;
    coin.castShadow = true;
    return coin;
  });
  const cones = pool(stage.scene, POOL_CONES, () => buildCone());

  // ---- the car -------------------------------------------------------------
  const car = buildCar(carColor, 4.0);
  stage.scene.add(car.group);
  const carShadow = blobShadow(2.3);
  stage.scene.add(carShadow);

  return {
    stage, car, carShadow, road, centre, edgeL, edgeR, shoulderL, shoulderR,
    rails, palms, trees, bushes, coins, cones,
    cameraX: 0, lean: 0, baseColor: carColor,
  };
}

export function setCarColor(scene: DriftScene, color: string, crashed: boolean) {
  if (!crashed) scene.baseColor = color;
  scene.car.paint.color.set(crashed ? '#c02a1c' : scene.baseColor);
}

export interface DriftFrameState {
  x: number;
  vx: number;
  dist: number;
  road: Slice[];
  pickups: Pickup[];
  over: boolean;
}

export function updateDriftScene(
  scene: DriftScene,
  s: DriftFrameState,
  width: number,
  height: number,
) {
  const carY = height - CAR_Y_OFFSET;
  const toX = (px: number) => (px - width / 2) * WORLD_X;
  // Depth straight off the slice's own screen position, so the world uses the
  // exact mapping the 2D game did and the car sits on its own slice.
  const depth = (slice: Slice) => (slice.y - carY) * DEPTH_PER_PX;

  const slices = s.road;

  writeRibbon(scene.road.geometry, slices,
    (sl) => [toX(sl.centre - sl.half), toX(sl.centre + sl.half)], 0, depth, 0.055);
  writeRibbon(scene.centre.geometry, slices,
    (sl) => [toX(sl.centre) - 0.16, toX(sl.centre) + 0.16], 0.012, depth, 0.05);
  writeRibbon(scene.edgeL.geometry, slices,
    (sl) => { const x = toX(sl.centre - sl.half); return [x - 0.02, x + 0.24]; }, 0.014, depth);
  writeRibbon(scene.edgeR.geometry, slices,
    (sl) => { const x = toX(sl.centre + sl.half); return [x - 0.24, x + 0.02]; }, 0.014, depth);
  writeRibbon(scene.shoulderL.geometry, slices,
    (sl) => { const x = toX(sl.centre - sl.half); return [x - 2.6, x]; }, -0.03, depth, 0.06);
  writeRibbon(scene.shoulderR.geometry, slices,
    (sl) => { const x = toX(sl.centre + sl.half); return [x, x + 2.6]; }, -0.03, depth, 0.06);

  // The dashes scroll with real distance, so the ground moves at the speed the
  // car is actually travelling rather than a decorative constant.
  scene.centre.texture.offset.y = -(s.dist * 0.42) % 1;

  // ---- roadside, placed off the ribbon so it bends with the road -----------
  let railI = 0;
  let palmI = 0;
  let treeI = 0;
  let bushI = 0;

  // How many slices have ever been generated; slice i was born this many
  // slices ago, which gives every stretch of road a stable world identity.
  const born = Math.round(s.dist / DIST_PER_SLICE);

  for (let i = 0; i < slices.length; i += 1) {
    const slice = slices[i];
    if (!slice) continue;
    const z = depth(slice);
    const left = toX(slice.centre - slice.half);
    const right = toX(slice.centre + slice.half);
    const ordinal = born - i;

    if (((ordinal % RAIL_STRIDE) + RAIL_STRIDE) % RAIL_STRIDE === 0) {
      for (const side of [-1, 1] as const) {
        const rail = scene.rails[railI];
        railI += 1;
        if (!rail) continue;
        rail.visible = true;
        rail.position.set(side < 0 ? left - 2.9 : right + 2.9, 0, z);
      }
    }

    if (((ordinal % TREE_STRIDE) + TREE_STRIDE) % TREE_STRIDE === 0) {
      // Keyed off the stretch of road itself, so a given planting keeps its
      // species, side and distance the whole way in.
      const seed = Math.sin(ordinal * 12.9898) * 43758.5453;
      const r = seed - Math.floor(seed);
      const side = r < 0.5 ? -1 : 1;
      const edge = side < 0 ? left : right;
      const out = 5.5 + r * 9;

      if (r < 0.34) {
        const palm = scene.palms[palmI];
        palmI += 1;
        if (palm) {
          palm.visible = true;
          palm.position.set(edge + side * out, 0, z);
        }
      } else if (r < 0.62) {
        const tree = scene.trees[treeI];
        treeI += 1;
        if (tree) {
          tree.visible = true;
          tree.position.set(edge + side * out, 0, z);
        }
      }

      const bush = scene.bushes[bushI];
      bushI += 1;
      if (bush) {
        bush.visible = true;
        bush.position.set(edge + side * (3.4 + r * 2.2), 0.2, z + 1.2);
      }
    }
  }

  hideRest(scene.rails, railI);
  hideRest(scene.palms, palmI);
  hideRest(scene.trees, treeI);
  hideRest(scene.bushes, bushI);

  // ---- pickups -------------------------------------------------------------
  let coinI = 0;
  let coneI = 0;
  for (const pickup of s.pickups) {
    const x = toX(pickup.x);
    const z = (pickup.y - carY) * DEPTH_PER_PX;
    if (pickup.kind === 'coin') {
      const mesh = scene.coins[coinI];
      coinI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(x, 0.75, z);
      mesh.rotation.z += 0.11;
    } else {
      const mesh = scene.cones[coneI];
      coneI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(x, 0, z);
    }
  }
  hideRest(scene.coins, coinI);
  hideRest(scene.cones, coneI);

  // ---- the car -------------------------------------------------------------
  const carX = toX(s.x);
  const car = scene.car;
  car.group.position.set(carX, 0, 0);
  // Steering: the nose turns a little into the drift and the body rolls
  // against it, which is what reads as weight rather than sliding.
  const steer = Math.max(-1, Math.min(1, s.vx / 190));
  car.group.rotation.y = -steer * 0.16;
  car.group.rotation.z = -steer * 0.05;
  for (const wheel of car.wheels) wheel.rotation.x -= 0.6;
  // Brake lights come up when the throttle direction reverses hard.
  car.brakes.emissiveIntensity = s.over ? 1.6 : steer < -0.75 ? 0.9 : 0.15;

  scene.carShadow.position.set(carX, 0.02, 0.1);
  scene.carShadow.visible = !s.over;

  if (s.over) {
    car.group.rotation.z = 0.5;
    car.group.position.y = 0.15;
  } else {
    car.group.position.y = 0;
  }

  // ---- camera --------------------------------------------------------------
  // Lags the car, and banks slightly with the steering. Both are small on
  // purpose: a chase camera that snaps or shakes is worse than a fixed one.
  scene.cameraX += (carX - scene.cameraX) * 0.1;
  scene.lean += (steer - scene.lean) * 0.08;
  const cam = scene.stage.camera;
  cam.position.set(scene.cameraX * 0.72 + scene.lean * 0.5, 3.5, 9.2);
  cam.lookAt(scene.cameraX * 0.5, 1.0, -18);
  // After lookAt, which rewrites the whole rotation.
  cam.rotation.z -= scene.lean * 0.03;

  // The shadow box follows the car, so a tight high-resolution shadow covers
  // the one place it is actually visible.
  scene.stage.sun.position.set(carX + 16, 26, 10);
  scene.stage.sun.target.position.set(carX, 0, -6);
  scene.stage.sun.target.updateMatrixWorld();
}

export function disposeDriftScene(scene: DriftScene) {
  disposeStage(scene.stage);
}
