/**
 * Alley's 3D world: a brick side street with a walkable floor.
 *
 * A beat-'em-up floor is already a plane you walk around on — x across, and a
 * shallow band of depth — which is why this genre reads so naturally once the
 * depth is real. The game's own floorTop/floorBottom band becomes that depth,
 * so where a punch lands is still decided by the same numbers.
 *
 * Buildings, shutters and the lamp are original geometry; nothing here
 * reproduces an existing title's stage art.
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

/** World units across the street, and of walkable depth. */
const ALLEY_W = 24;
const ALLEY_D = 9;

export interface AlleyEnemy {
  x: number; y: number; hp: number; strike: number; cool: number;
  hurt: number; down: number; shirt: string; speed: number;
}
export interface AlleyItem { x: number; y: number; kind: 'pipe' | 'crate'; taken: boolean }
export interface AlleyDrop { x: number; y: number; kind: 'coin' | 'hazard'; life: number }

export interface AlleyFrameState {
  px: number; py: number; facing: 1 | -1;
  strike: number; hurt: number; weapon: 'none' | 'pipe' | 'crate';
  enemies: AlleyEnemy[]; items: AlleyItem[]; drops: AlleyDrop[];
  over: boolean;
  layout: { floorTop: number; floorBottom: number };
}

function brickTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2c2620';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let row = 0; row < 4; row += 1) {
    const y = row * 16;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(64, y);
    ctx.stroke();
    for (let col = 0; col < 2; col += 1) {
      const x = col * 34 + (row % 2 ? 17 : 0);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 16);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 3);
  return texture;
}

function buildPipe(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 1.5, 8),
    new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.4, metalness: 0.6 }),
  );
  mesh.rotation.z = Math.PI / 2;
  mesh.position.y = 0.12;
  return mesh;
}

function buildCrate(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.95, 0.95),
    new THREE.MeshStandardMaterial({ color: '#8a6238', roughness: 0.9 }),
  );
}

export interface AlleyScene {
  stage: Stage;
  player: Character;
  /** The weapon in the player's hand, parented to the striking arm. */
  heldPipe: THREE.Mesh;
  heldCrate: THREE.Mesh;
  enemies: Character[];
  pipes: THREE.Mesh[];
  crates: THREE.Mesh[];
  coins: THREE.Mesh[];
  hazards: THREE.Mesh[];
}

export function createAlleyScene(
  canvas: HTMLCanvasElement,
  look: Look,
): AlleyScene {
  const stage = createStage(canvas, {
    sky: '#15110d',
    fog: [26, 60],
    fov: 48,
    // Low and close, the way this genre is always framed: you read the fight
    // across the street, not down onto it.
    camera: [0, 4.6, 10.2],
    lookAt: [0, 1.4, -0.5],
    ambient: 0.78,
    sunIntensity: 1.0,
    sun: [-3, 12, 8],
  });

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ALLEY_W + 10, ALLEY_D + 8),
    new THREE.MeshStandardMaterial({ color: '#37322c', roughness: 1 }),
  );
  road.rotation.x = -Math.PI / 2;
  stage.scene.add(road);

  // The back wall of the alley, and a return wall on each side to close it in.
  const bricks = brickTexture();
  const wallMat = new THREE.MeshStandardMaterial({ map: bricks, roughness: 1 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(ALLEY_W + 10, 12), wallMat);
  back.position.set(0, 6, -ALLEY_D / 2 - 1.2);
  stage.scene.add(back);

  // Shutters, so the wall has something on it at a glance.
  const shutterMat = new THREE.MeshStandardMaterial({ color: '#1d1915', roughness: 0.85 });
  for (const [x, w, h] of [[-7, 3.2, 3.6], [5.5, 2.6, 3.0]] as const) {
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), shutterMat);
    shutter.position.set(x, h / 2, -ALLEY_D / 2 - 1.05);
    stage.scene.add(shutter);
  }

  // A street lamp, and the pool of light it implies.
  const lampMat = new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.7 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 7, 8), lampMat);
  post.position.set(9.5, 3.5, -ALLEY_D / 2 - 0.6);
  stage.scene.add(post);
  const bulb = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.24, 0.5),
    new THREE.MeshStandardMaterial({
      color: '#f5c542', emissive: '#f5c542', emissiveIntensity: 1.5,
    }),
  );
  bulb.position.set(9.0, 6.9, -ALLEY_D / 2 - 0.3);
  stage.scene.add(bulb);
  const lamp = new THREE.PointLight('#ffd98a', 55, 26, 2);
  lamp.position.set(9, 6.6, -1);
  stage.scene.add(lamp);

  const player = buildCharacter(look);
  stage.scene.add(player.group);

  const heldPipe = buildPipe();
  heldPipe.visible = false;
  player.armR.add(heldPipe);
  heldPipe.position.set(0, -0.62, -0.5);
  heldPipe.rotation.set(Math.PI / 2, 0, Math.PI / 2);

  const heldCrate = buildCrate();
  heldCrate.visible = false;
  heldCrate.scale.setScalar(0.7);
  player.armR.add(heldCrate);
  heldCrate.position.set(0, -0.7, -0.35);

  const enemies: Character[] = [];
  for (let i = 0; i < 8; i += 1) {
    const enemy = buildCharacter({ body: '#6d4aff', accent: '#2a2a2e', helmet: 'none', hair: 'short' });
    enemy.group.visible = false;
    stage.scene.add(enemy.group);
    enemies.push(enemy);
  }

  const pipes = pool(stage.scene, 3, () => buildPipe());
  const crates = pool(stage.scene, 3, () => buildCrate());

  const coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 16);
  const coinMat = new THREE.MeshStandardMaterial({
    color: '#f2c14e', emissive: '#8a5c00', emissiveIntensity: 0.45, metalness: 0.6, roughness: 0.3,
  });
  const coins = pool(stage.scene, 6, () => new THREE.Mesh(coinGeo, coinMat));

  const hazardGeo = new THREE.OctahedronGeometry(0.3, 0);
  const hazardMat = new THREE.MeshStandardMaterial({
    color: '#e2412f', emissive: '#4a0d05', emissiveIntensity: 0.45, roughness: 0.5,
  });
  const hazards = pool(stage.scene, 6, () => new THREE.Mesh(hazardGeo, hazardMat));

  return { stage, player, heldPipe, heldCrate, enemies, pipes, crates, coins, hazards };
}

export function updateAlleyScene(
  scene: AlleyScene,
  s: AlleyFrameState,
  width: number,
  _height: number,
) {
  const { floorTop, floorBottom } = s.layout;
  const px = (x: number) => (x / width - 0.5) * ALLEY_W;
  // The game's floor band becomes the walkable depth, so the same y that
  // decides whether a punch is in range decides where a fighter stands.
  const pz = (y: number) =>
    ((y - floorTop) / Math.max(1, floorBottom - floorTop) - 0.5) * ALLEY_D;

  const player = scene.player;
  player.group.position.set(px(s.px), 0, pz(s.py));
  // Facing right means facing +X, which is a quarter turn off the model's -Z.
  player.group.rotation.y = s.facing === 1 ? Math.PI / 2 : -Math.PI / 2;

  // The swing: the arm comes over as `strike` runs from 1 back to 0.
  const swing = Math.sin(Math.max(0, Math.min(1, s.strike)) * Math.PI);
  player.armR.rotation.x = -swing * 2.2;
  player.armL.rotation.x = swing * 0.5;
  // Hurt reads as a stagger rather than only a colour change.
  player.group.rotation.z = s.hurt > 0 ? Math.sin(s.hurt * 22) * 0.16 : 0;
  if (s.over) player.group.rotation.x = 1.4;
  else player.group.rotation.x = 0;

  scene.heldPipe.visible = s.weapon === 'pipe';
  scene.heldCrate.visible = s.weapon === 'crate';

  let enemyI = 0;
  for (const enemy of s.enemies) {
    const model = scene.enemies[enemyI];
    enemyI += 1;
    if (!model) continue;
    model.group.visible = true;
    model.group.position.set(px(enemy.x), 0, pz(enemy.y));
    model.body.color.set(enemy.hurt > 0 ? '#ffffff' : enemy.shirt);

    if (enemy.down > 0) {
      // Floored: flat on the ground, not standing and idle.
      model.group.rotation.x = -Math.PI / 2;
      model.group.position.y = 0.25;
      model.armR.rotation.x = 0;
    } else {
      model.group.rotation.x = 0;
      model.group.position.y = 0;
      model.group.rotation.y = enemy.x < s.px ? Math.PI / 2 : -Math.PI / 2;
      const theirSwing = Math.sin(Math.max(0, Math.min(1, enemy.strike)) * Math.PI);
      model.armR.rotation.x = -theirSwing * 2.0;
    }
  }
  for (let i = enemyI; i < scene.enemies.length; i += 1) {
    const model = scene.enemies[i];
    if (model) model.group.visible = false;
  }

  let pipeI = 0;
  let crateI = 0;
  for (const item of s.items) {
    if (item.taken) continue;
    if (item.kind === 'pipe') {
      const mesh = scene.pipes[pipeI];
      pipeI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(px(item.x), 0.12, pz(item.y));
    } else {
      const mesh = scene.crates[crateI];
      crateI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(px(item.x), 0.48, pz(item.y));
    }
  }
  hideRest(scene.pipes, pipeI);
  hideRest(scene.crates, crateI);

  let coinI = 0;
  let hazardI = 0;
  for (const drop of s.drops) {
    if (drop.kind === 'coin') {
      const mesh = scene.coins[coinI];
      coinI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(px(drop.x), 0.4, pz(drop.y));
      mesh.rotation.y += 0.1;
    } else {
      const mesh = scene.hazards[hazardI];
      hazardI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(px(drop.x), 0.36, pz(drop.y));
      mesh.rotation.y += 0.06;
    }
  }
  hideRest(scene.coins, coinI);
  hideRest(scene.hazards, hazardI);

  // The camera drifts with the player so the fight stays centred without
  // snapping, and never looks past the ends of the street.
  const targetX = Math.max(-5, Math.min(5, px(s.px) * 0.5));
  const cam = scene.stage.camera;
  cam.position.x += (targetX - cam.position.x) * 0.08;
  cam.lookAt(cam.position.x, 1.4, -0.5);
}

export function disposeAlleyScene(scene: AlleyScene) {
  disposeStage(scene.stage);
}
