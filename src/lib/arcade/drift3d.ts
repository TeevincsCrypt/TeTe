/**
 * Drift's 3D world.
 *
 * The game's own physics — the sine-walk road generation, one-touch
 * steering, pickups, collision, scoring — are entirely unchanged; they still
 * live in DriftGame.tsx exactly as before. This module only turns that same
 * per-frame state (a list of road cross-sections and pickups, the car's x
 * position) into a lit, textured, fogged 3D scene instead of flat 2D shapes.
 *
 * One deliberate simplification: the road does not curve in true 3D depth.
 * Each cross-section shifts sideways by exactly the amount the existing 2D
 * game already computes (`centre`), rendered as real geometry from a fixed
 * chase camera — rather than a camera that banks and turns to follow the
 * curve's heading. That keeps the driving feel identical to before (nothing
 * about steering or collision changed) while still delivering real 3D cars,
 * lighting, fog and environment instead of flat canvas shapes. A camera that
 * actually follows the curve's heading would be a real, bigger project on
 * top of this one.
 *
 * No car brand or real vehicle design is reproduced — the car is an
 * original low-poly shape, coloured with the player's own chosen arcade
 * character paint.
 */
import * as THREE from 'three';

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

/** How far up from the bottom of the screen the car sits — shared with the
 *  game's own physics so collision/pickup checks and the 3D scene agree on
 *  where the car actually is. */
export const CAR_Y_OFFSET = 96;

const WORLD_X = 0.026; // screen pixels -> world units, lateral
const SLICE_DEPTH = 1.3; // world units of depth per road slice
const CAR_LENGTH = 2.1;
const EDGE_OFFSET = 0.18;
const GUARDRAIL_OFFSET = 0.55;
const TREE_OFFSET = 2.6;
const POOL_TREES = 22;
const POOL_GUARDRAILS = 36;
const POOL_PICKUPS = 10;

function dashTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#00000000';
  ctx.clearRect(0, 0, 8, 64);
  ctx.fillStyle = '#f5c344';
  ctx.fillRect(0, 4, 8, 26);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 10);
  return texture;
}

function asphaltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2b2b2f';
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 260; i += 1) {
    const shade = 30 + Math.random() * 30;
    ctx.fillStyle = `rgba(${shade + 10},${shade + 10},${shade + 14},${0.15 + Math.random() * 0.2})`;
    ctx.fillRect(Math.random() * 64, Math.random() * 64, 1.4, 1.4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 20);
  return texture;
}

/** An original low-poly sports car, painted with the player's chosen colour. */
function buildCar(color: string): { group: THREE.Group; body: THREE.Mesh; cabin: THREE.Mesh } {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.36, CAR_LENGTH), bodyMat);
  body.position.y = 0.32;
  group.add(body);

  const cabinMat = new THREE.MeshStandardMaterial({ color: '#12151c', roughness: 0.2, metalness: 0.1 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.3, 1.05), cabinMat);
  cabin.position.set(0, 0.62, -0.05);
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.22, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.8 });
  const wheelXs = [-0.55, 0.55];
  const wheelZs = [CAR_LENGTH / 2 - 0.42, -CAR_LENGTH / 2 + 0.42];
  for (const wx of wheelXs) {
    for (const wz of wheelZs) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.24, wz);
      group.add(wheel);
    }
  }

  const lightMat = new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#fff7d6', emissiveIntensity: 1.4 });
  const tailMat = new THREE.MeshStandardMaterial({ color: '#ff3b3b', emissive: '#ff3b3b', emissiveIntensity: 1.1 });
  for (const side of [-0.36, 0.36]) {
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.05), lightMat);
    headlight.position.set(side, 0.32, CAR_LENGTH / 2 + 0.02);
    group.add(headlight);
    const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.05), tailMat);
    taillight.position.set(side, 0.32, -CAR_LENGTH / 2 - 0.02);
    group.add(taillight);
  }

  return { group, body, cabin };
}

function buildTree(): THREE.Group {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 2.1, 6), trunkMat);
  trunk.position.y = 1.05;
  trunk.rotation.z = (Math.random() - 0.5) * 0.15;
  group.add(trunk);

  const frondMat = new THREE.MeshStandardMaterial({ color: '#2f7d4a', roughness: 0.7, side: THREE.DoubleSide });
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

function ribbon(maxSlices: number, material: THREE.Material): { mesh: THREE.Mesh; geometry: THREE.BufferGeometry } {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(maxSlices * 2 * 3);
  const uvs = new Float32Array(maxSlices * 2 * 2);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage));

  const indices: number[] = [];
  for (let i = 0; i < maxSlices - 1; i += 1) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    indices.push(a, c, b, b, c, d);
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, geometry };
}

/** Rewrite a ribbon's vertices from a left/right edge function over the slices. */
function updateRibbon(
  geometry: THREE.BufferGeometry,
  slices: Slice[],
  edgeX: (slice: Slice) => [number, number],
  y: number,
) {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const count = slices.length;
  for (let i = 0; i < count; i += 1) {
    const slice = slices[i];
    if (!slice) continue;
    const z = -(count - 1 - i) * SLICE_DEPTH;
    const [left, right] = edgeX(slice);
    position.setXYZ(i * 2, left, y, z);
    position.setXYZ(i * 2 + 1, right, y, z);
    const v = i / Math.max(1, count - 1);
    uv.setXY(i * 2, 0, v);
    uv.setXY(i * 2 + 1, 1, v);
  }
  position.needsUpdate = true;
  uv.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

export interface DriftScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  car: { group: THREE.Group; body: THREE.Mesh; cabin: THREE.Mesh };
  road: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry };
  centerLine: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry; texture: THREE.CanvasTexture };
  leftEdge: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry };
  rightEdge: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry };
  trees: THREE.Group[];
  guardrails: THREE.Mesh[];
  pickups: { coin: THREE.Mesh[]; hazard: THREE.Mesh[] };
  cameraX: number;
  slicesInited: number;
  baseCarColor: string;
}

export function createDriftScene(canvas: HTMLCanvasElement, carColor: string): DriftScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  const skyColor = new THREE.Color('#bcd3dd');
  scene.background = skyColor;
  scene.fog = new THREE.Fog(skyColor.getHex(), 18, 62);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);
  camera.position.set(0, 3.1, 6.2);
  camera.lookAt(0, 0.6, -8);

  scene.add(new THREE.AmbientLight('#e8f0ff', 0.75));
  const sun = new THREE.DirectionalLight('#fff4de', 1.0);
  sun.position.set(-6, 10, 4);
  scene.add(sun);

  // Ground either side of the road: grass on the left, ocean on the right —
  // matching a coastal highway rather than tying to a specific real place.
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 220),
    new THREE.MeshStandardMaterial({ color: '#4f8a4a', roughness: 1 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(-22, -0.02, -60);
  scene.add(grass);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 220),
    new THREE.MeshStandardMaterial({ color: '#3f7fa6', roughness: 0.25, metalness: 0.15 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(22, -0.02, -60);
  scene.add(ocean);

  // A hazy skyline, far enough back that fog does the rest of the work.
  const skylineMat = new THREE.MeshStandardMaterial({ color: '#8f9bab', roughness: 1 });
  for (let i = 0; i < 10; i += 1) {
    const h = 4 + Math.random() * 10;
    const building = new THREE.Mesh(new THREE.BoxGeometry(3 + Math.random() * 3, h, 3), skylineMat);
    building.position.set(-14 + i * 3.4 + (Math.random() - 0.5) * 2, h / 2, -70 - Math.random() * 8);
    scene.add(building);
  }

  const road = ribbon(
    64,
    new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95 }),
  );
  scene.add(road.mesh);

  const centerTexture = dashTexture();
  const centerLine = {
    ...ribbon(64, new THREE.MeshStandardMaterial({ map: centerTexture, transparent: true, roughness: 0.6 })),
    texture: centerTexture,
  };
  scene.add(centerLine.mesh);

  const edgeMat = new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.6 });
  const leftEdge = ribbon(64, edgeMat);
  const rightEdge = ribbon(64, edgeMat);
  scene.add(leftEdge.mesh);
  scene.add(rightEdge.mesh);

  const trees: THREE.Group[] = [];
  for (let i = 0; i < POOL_TREES; i += 1) {
    const tree = buildTree();
    tree.visible = false;
    scene.add(tree);
    trees.push(tree);
  }

  const guardrailGeo = new THREE.BoxGeometry(0.06, 0.4, 1.0);
  const guardrailMat = new THREE.MeshStandardMaterial({ color: '#e7e9ec', roughness: 0.5, metalness: 0.3 });
  const guardrails: THREE.Mesh[] = [];
  for (let i = 0; i < POOL_GUARDRAILS; i += 1) {
    const rail = new THREE.Mesh(guardrailGeo, guardrailMat);
    rail.visible = false;
    scene.add(rail);
    guardrails.push(rail);
  }

  const coinMat = new THREE.MeshStandardMaterial({ color: '#f2c14e', emissive: '#8a5c00', emissiveIntensity: 0.3, metalness: 0.6, roughness: 0.3 });
  const hazardMat = new THREE.MeshStandardMaterial({ color: '#e2412f', emissive: '#4a0d05', emissiveIntensity: 0.3, roughness: 0.5 });
  const coinGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.08, 16);
  const hazardGeo = new THREE.OctahedronGeometry(0.28, 0);
  const coinPool: THREE.Mesh[] = [];
  const hazardPool: THREE.Mesh[] = [];
  for (let i = 0; i < POOL_PICKUPS; i += 1) {
    const coin = new THREE.Mesh(coinGeo, coinMat);
    coin.visible = false;
    scene.add(coin);
    coinPool.push(coin);
    const hazard = new THREE.Mesh(hazardGeo, hazardMat);
    hazard.visible = false;
    scene.add(hazard);
    hazardPool.push(hazard);
  }

  const car = buildCar(carColor);
  scene.add(car.group);

  return {
    renderer,
    scene,
    camera,
    car,
    road,
    centerLine,
    leftEdge,
    rightEdge,
    trees,
    guardrails,
    pickups: { coin: coinPool, hazard: hazardPool },
    cameraX: 0,
    slicesInited: 0,
    baseCarColor: carColor,
  };
}

export function resizeDriftScene(handle: DriftScene, width: number, height: number) {
  handle.camera.aspect = width / Math.max(1, height);
  handle.camera.updateProjectionMatrix();
  handle.renderer.setSize(width, height, false);
}

export function setCarColor(handle: DriftScene, color: string, crashed: boolean) {
  handle.baseCarColor = crashed ? handle.baseCarColor : color;
  const mat = handle.car.body.material as THREE.MeshStandardMaterial;
  mat.color.set(crashed ? '#dc2626' : color);
}

export interface DriftFrameState {
  x: number;
  vx: number;
  dist: number;
  road: Slice[];
  pickups: Pickup[];
  over: boolean;
}

/**
 * Sync the whole 3D scene to the current frame of game state, then render.
 * `width`/`height` are the game's own screen-pixel coordinate space — the
 * same numbers the original 2D canvas drew against — so the existing
 * physics needs no change at all to feed this.
 */
export function updateDriftScene(handle: DriftScene, state: DriftFrameState, width: number, height: number) {
  const toWorldX = (px: number) => (px - width / 2) * WORLD_X;
  const carY = height - CAR_Y_OFFSET;

  const edge = (slice: Slice): [number, number] => [
    toWorldX(slice.centre - slice.half),
    toWorldX(slice.centre + slice.half),
  ];
  const centerEdge = (slice: Slice): [number, number] => [
    toWorldX(slice.centre) - 0.12,
    toWorldX(slice.centre) + 0.12,
  ];
  const leftEdgeFn = (slice: Slice): [number, number] => {
    const x = toWorldX(slice.centre - slice.half);
    return [x - EDGE_OFFSET, x];
  };
  const rightEdgeFn = (slice: Slice): [number, number] => {
    const x = toWorldX(slice.centre + slice.half);
    return [x, x + EDGE_OFFSET];
  };

  updateRibbon(handle.road.geometry, state.road, edge, 0);
  updateRibbon(handle.centerLine.geometry, state.road, centerEdge, 0.01);
  updateRibbon(handle.leftEdge.geometry, state.road, leftEdgeFn, 0.005);
  updateRibbon(handle.rightEdge.geometry, state.road, rightEdgeFn, 0.005);
  handle.centerLine.texture.offset.y = -(state.dist * 0.09) % 1;

  // Car: position from the same x the physics already computes, a small
  // roll toward the direction it is drifting, flattened out at rest.
  const carWorldX = toWorldX(state.x);
  handle.car.group.position.set(carWorldX, 0, 0);
  handle.car.group.rotation.z = Math.max(-0.22, Math.min(0.22, -state.vx / 900));
  setCarColor(handle, handle.baseCarColor, state.over);

  // Pickups: map each live one onto a pooled mesh; hide the rest.
  const pools = handle.pickups;
  let coinI = 0;
  let hazardI = 0;
  for (const pickup of state.pickups) {
    const worldX = toWorldX(pickup.x);
    const worldZ = -((carY - pickup.y) / height) * (state.road.length * SLICE_DEPTH);
    if (pickup.kind === 'coin') {
      const mesh = pools.coin[coinI];
      coinI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(worldX, 0.35, worldZ);
      mesh.rotation.y += 0.12;
    } else {
      const mesh = pools.hazard[hazardI];
      hazardI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(worldX, 0.3, worldZ);
      mesh.rotation.y += 0.08;
      mesh.rotation.x += 0.05;
    }
  }
  for (let i = coinI; i < pools.coin.length; i += 1) {
    const mesh = pools.coin[i];
    if (mesh) mesh.visible = false;
  }
  for (let i = hazardI; i < pools.hazard.length; i += 1) {
    const mesh = pools.hazard[i];
    if (mesh) mesh.visible = false;
  }

  // Trees and guardrails: recycled decoration, placed by total distance
  // travelled so they read as an endless tree-lined, rail-lined road.
  const roadHalfNear = state.road[state.road.length - 1]?.half ?? 60;
  for (let i = 0; i < handle.trees.length; i += 1) {
    const tree = handle.trees[i];
    if (!tree) continue;
    const along = (i * 5.5 - state.dist * SLICE_DEPTH * 0.06) % (handle.trees.length * 5.5);
    const z = -((along + handle.trees.length * 5.5) % (handle.trees.length * 5.5));
    const side = i % 2 === 0 ? -1 : 1;
    tree.visible = true;
    tree.position.set(side * (roadHalfNear * WORLD_X + TREE_OFFSET), 0, z + 4);
  }
  for (let i = 0; i < handle.guardrails.length; i += 1) {
    const rail = handle.guardrails[i];
    if (!rail) continue;
    const spacing = 1.2;
    const along = (i * spacing - state.dist * SLICE_DEPTH * 0.06) % (handle.guardrails.length * spacing);
    const z = -((along + handle.guardrails.length * spacing) % (handle.guardrails.length * spacing)) + 2;
    const side = i % 2 === 0 ? -1 : 1;
    rail.visible = true;
    rail.position.set(side * (roadHalfNear * WORLD_X + GUARDRAIL_OFFSET), 0.2, z - handle.guardrails.length * spacing * 0.35);
  }

  // Chase camera: gently lags the car's x so a sharp swerve reads as a
  // swerve, not a teleport.
  handle.cameraX += (carWorldX - handle.cameraX) * 0.12;
  handle.camera.position.set(handle.cameraX * 0.6, 3.1, 6.2);
  handle.camera.lookAt(handle.cameraX * 0.6, 0.6, -8);

  handle.renderer.render(handle.scene, handle.camera);
}

export function disposeDriftScene(handle: DriftScene) {
  handle.scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) {
        if ('map' in material && material.map) (material.map as THREE.Texture).dispose();
        material.dispose();
      }
    }
  });
  handle.renderer.dispose();
}
