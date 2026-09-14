/**
 * Invasion's 3D world: a formation hanging in space above a gun emplacement.
 *
 * The game is played in a plane — invaders drift across and step down, the
 * cannon slides along the bottom — so that plane is kept exactly, and the
 * depth is spent on making the things in it solid: lit models, a starfield
 * with real distance behind them, a horizon under the gun.
 *
 * The mapping from the game's screen-pixel space to the world happens in one
 * place (`place`), so every collision the game already performs still refers
 * to the same positions the player sees.
 *
 * The invaders are an original design — no existing title's sprites, ranks or
 * formation art is reproduced.
 */
import * as THREE from 'three';

import {
  createStage,
  disposeStage,
  hideRest,
  pool,
  type Stage,
} from './three-kit';

/** World units across the playfield. */
const FIELD_W = 15;
/** World units from the gun line to the top of the screen. */
const FIELD_H = 17;

export interface InvasionInvader {
  col: number;
  row: number;
  rank: 0 | 1 | 2;
  alive: boolean;
}
export interface InvasionShot {
  x: number;
  y: number;
  vy: number;
  mine: boolean;
}
export interface InvasionDrop {
  x: number;
  y: number;
  kind: 'coin' | 'hazard';
}

export interface InvasionFrameState {
  invaders: InvasionInvader[];
  shots: InvasionShot[];
  drops: InvasionDrop[];
  driftX: number;
  stepDown: number;
  wobble: boolean;
  cannonX: number;
  over: boolean;
  /** Layout the game computed this frame, in its own pixel units. */
  layout: { ox: number; cellW: number; cellH: number; topY: number; groundY: number };
}

const RANK_COLOR = ['#7ee787', '#8ab4ff', '#ff8ac4'];

/** An original low-poly invader: a hooded body with two lenses and legs. */
function buildInvader(rank: number): THREE.Group {
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({
    color: RANK_COLOR[rank] ?? '#7ee787',
    roughness: 0.45,
    metalness: 0.25,
  });
  const dark = new THREE.MeshStandardMaterial({ color: '#12151c', roughness: 0.6 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.5, 0.5), shell);
  body.position.y = 0.1;
  group.add(body);

  // A taller crest on the back ranks, so rank reads at a glance.
  if (rank > 0) {
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2 + rank * 0.12, 0.3), shell);
    crest.position.y = 0.42;
    group.add(crest);
  }

  const lens = new THREE.MeshStandardMaterial({
    color: '#ffffff', emissive: '#cfe9ff', emissiveIntensity: 0.9, roughness: 0.2,
  });
  for (const x of [-0.18, 0.18]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.1), lens);
    eye.position.set(x, 0.14, 0.27);
    group.add(eye);
  }

  for (const x of [-0.28, 0.28]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), dark);
    leg.position.set(x, -0.28, 0);
    group.add(leg);
  }

  return group;
}

function buildCannon(color: string, accent: string): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.35 });
  const trimMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 1.0), bodyMat);
  group.add(base);

  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.52, 0.4, 12), trimMat);
  turret.position.y = 0.36;
  group.add(turret);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.1, 10), bodyMat);
  barrel.position.y = 1.0;
  group.add(barrel);

  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.18, 10), trimMat);
  muzzle.position.y = 1.5;
  group.add(muzzle);

  return group;
}

export interface InvasionScene {
  stage: Stage;
  cannon: THREE.Group;
  invaders: THREE.Group[][];
  myShots: THREE.Mesh[];
  theirShots: THREE.Mesh[];
  coins: THREE.Mesh[];
  hazards: THREE.Mesh[];
}

export function createInvasionScene(
  canvas: HTMLCanvasElement,
  color: string,
  accent: string,
): InvasionScene {
  const stage = createStage(canvas, {
    sky: '#0b1020',
    fog: null,
    fov: 50,
    camera: [0, 8, 21],
    lookAt: [0, 8, 0],
    ambient: 0.65,
    sunIntensity: 0.9,
    sun: [3, 10, 12],
  });

  // A starfield with genuine distance behind the formation, so drifting ranks
  // read against something rather than against flat colour.
  const starGeo = new THREE.BufferGeometry();
  const stars = new Float32Array(420 * 3);
  for (let i = 0; i < 420; i += 1) {
    stars[i * 3] = (Math.random() - 0.5) * 90;
    stars[i * 3 + 1] = Math.random() * 46 - 6;
    stars[i * 3 + 2] = -20 - Math.random() * 70;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
  stage.scene.add(
    new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.22, sizeAttenuation: true })),
  );

  // The line the invaders must not cross.
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD_W + 6, 0.06, 0.06),
    new THREE.MeshStandardMaterial({
      color: '#c8ff4d', emissive: '#c8ff4d', emissiveIntensity: 0.7,
    }),
  );
  line.position.set(0, -0.5, 0);
  stage.scene.add(line);

  // One pool per rank, because rank decides the model as well as the colour.
  const invaders = [0, 1, 2].map((rank) => pool(stage.scene, 28, () => buildInvader(rank)));

  const myShotMat = new THREE.MeshStandardMaterial({
    color: '#c8ff4d', emissive: '#c8ff4d', emissiveIntensity: 1.4,
  });
  const theirShotMat = new THREE.MeshStandardMaterial({
    color: '#ff6b6b', emissive: '#ff6b6b', emissiveIntensity: 1.4,
  });
  const shotGeo = new THREE.BoxGeometry(0.1, 0.62, 0.1);
  const myShots = pool(stage.scene, 14, () => new THREE.Mesh(shotGeo, myShotMat));
  const theirShots = pool(stage.scene, 14, () => new THREE.Mesh(shotGeo, theirShotMat));

  const coinGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.08, 16);
  const coinMat = new THREE.MeshStandardMaterial({
    color: '#f2c14e', emissive: '#8a5c00', emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.3,
  });
  const coins = pool(stage.scene, 10, () => {
    const coin = new THREE.Mesh(coinGeo, coinMat);
    coin.rotation.x = Math.PI / 2;
    return coin;
  });

  const hazardGeo = new THREE.OctahedronGeometry(0.28, 0);
  const hazardMat = new THREE.MeshStandardMaterial({
    color: '#e2412f', emissive: '#4a0d05', emissiveIntensity: 0.4, roughness: 0.5,
  });
  const hazards = pool(stage.scene, 10, () => new THREE.Mesh(hazardGeo, hazardMat));

  const cannon = buildCannon(color, accent);
  stage.scene.add(cannon);

  return { stage, cannon, invaders, myShots, theirShots, coins, hazards };
}

export function updateInvasionScene(
  scene: InvasionScene,
  s: InvasionFrameState,
  width: number,
  height: number,
) {
  // The one place the game's pixel space becomes the world. Everything drawn
  // below goes through it, so what is hit is always what is seen.
  const px = (x: number) => (x / width - 0.5) * FIELD_W;
  const py = (y: number) => (1 - y / height) * FIELD_H;

  const { ox, cellW, cellH, topY } = s.layout;

  const used = [0, 0, 0];
  for (const inv of s.invaders) {
    if (!inv.alive) continue;
    const list = scene.invaders[inv.rank];
    if (!list) continue;
    const mesh = list[used[inv.rank]!];
    used[inv.rank]! += 1;
    if (!mesh) continue;
    mesh.visible = true;
    mesh.position.set(
      px(ox + inv.col * cellW + cellW / 2 + s.driftX),
      py(topY + inv.row * cellH + s.stepDown),
      0,
    );
    // The march's two-frame wobble, as a real tilt rather than a sprite swap.
    mesh.rotation.z = s.wobble ? 0.12 : -0.12;
    mesh.rotation.y = s.wobble ? 0.16 : -0.16;
  }
  for (let rank = 0; rank < 3; rank += 1) {
    const list = scene.invaders[rank];
    if (list) hideRest(list, used[rank]!);
  }

  let mine = 0;
  let theirs = 0;
  for (const shot of s.shots) {
    const list = shot.mine ? scene.myShots : scene.theirShots;
    const index = shot.mine ? mine : theirs;
    if (shot.mine) mine += 1;
    else theirs += 1;
    const mesh = list[index];
    if (!mesh) continue;
    mesh.visible = true;
    mesh.position.set(px(shot.x), py(shot.y), 0);
  }
  hideRest(scene.myShots, mine);
  hideRest(scene.theirShots, theirs);

  let coinI = 0;
  let hazardI = 0;
  for (const drop of s.drops) {
    if (drop.kind === 'coin') {
      const mesh = scene.coins[coinI];
      coinI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(px(drop.x), py(drop.y), 0);
      mesh.rotation.z += 0.12;
    } else {
      const mesh = scene.hazards[hazardI];
      hazardI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(px(drop.x), py(drop.y), 0);
      mesh.rotation.y += 0.08;
    }
  }
  hideRest(scene.coins, coinI);
  hideRest(scene.hazards, hazardI);

  scene.cannon.position.set(px(s.cannonX * width), py(s.layout.groundY), 0);
  scene.cannon.rotation.z = s.over ? 0.9 : 0;
}

export function disposeInvasionScene(scene: InvasionScene) {
  disposeStage(scene.stage);
}
