/**
 * Pitch's 3D world: a floodlit pitch seen from behind the ball, looking at
 * the goal.
 *
 * The game is top-down — the ball's position is an (x, y) on the grass and
 * everything it can hit is a distance in that plane — so the conversion maps
 * the screen's vertical axis to depth and leaves every check alone. The camera
 * then sits behind the ball rather than above it, which is the view that makes
 * a bending shot legible: you can see the curl bite across the wall.
 *
 * The goal, wall and keeper are original geometry; no club, kit or competition
 * branding is reproduced.
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

/** World units across the pitch, and from the goal line to the near edge. */
const PITCH_W = 26;
const PITCH_D = 34;

export interface PitchWall { x: number; y: number; drift: number }
export interface PitchPickup { x: number; y: number; kind: 'coin' | 'hazard'; taken: boolean }

export interface PitchFrameState {
  bx: number; by: number; spin: number;
  live: boolean; aiming: boolean; aimX: number; aimY: number;
  wall: PitchWall[]; keeperX: number;
  pickups: PitchPickup[];
  over: boolean;
  layout: { goalW: number; goalX: number; goalY: number; keeperY: number };
}

function stripeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2f7d3c';
  ctx.fillRect(0, 0, 8, 32);
  ctx.fillStyle = '#2a7136';
  ctx.fillRect(0, 32, 8, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 6);
  return texture;
}

function buildGoal(width: number): THREE.Group {
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 0.4 });
  const H = 3.4;

  for (const x of [-width / 2, width / 2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, H, 10), postMat);
    post.position.set(x, H / 2, 0);
    group.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, width, 10), postMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = H;
  group.add(bar);

  // The net as one translucent panel per face — enough to read as a net at
  // this distance, and far cheaper than a woven mesh.
  const netMat = new THREE.MeshStandardMaterial({
    color: '#ffffff', transparent: true, opacity: 0.16, side: THREE.DoubleSide, roughness: 1,
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(width, H), netMat);
  back.position.set(0, H / 2, -1.8);
  group.add(back);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(width, 1.8), netMat);
  roof.rotation.x = -Math.PI / 2;
  roof.position.set(0, H, -0.9);
  group.add(roof);
  for (const x of [-width / 2, width / 2]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(1.8, H), netMat);
    side.rotation.y = Math.PI / 2;
    side.position.set(x, H / 2, -0.9);
    group.add(side);
  }

  return group;
}

export interface PitchScene {
  stage: Stage;
  ball: THREE.Mesh;
  goal: THREE.Group;
  keeper: Character;
  defenders: Character[];
  coins: THREE.Mesh[];
  hazards: THREE.Mesh[];
  aim: THREE.Mesh[];
  grass: THREE.CanvasTexture;
}

export function createPitchScene(canvas: HTMLCanvasElement): PitchScene {
  const stage = createStage(canvas, {
    sky: '#101a24',
    fog: [40, 90],
    fov: 52,
    camera: [0, 13, 20],
    lookAt: [0, 0, -6],
    ambient: 0.75,
    sunIntensity: 1.1,
    sun: [6, 18, 10],
  });

  const grass = stripeTexture();
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH_W + 8, PITCH_D + 10),
    new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }),
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.z = -2;
  stage.scene.add(pitch);

  // Markings: the box, and the touchline boundary.
  const lineMat = new THREE.MeshStandardMaterial({
    color: '#ffffff', transparent: true, opacity: 0.5, roughness: 0.8,
  });
  const markings = new THREE.Group();
  const line = (w: number, d: number, x: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    markings.add(mesh);
  };
  const goalZ = -PITCH_D / 2;
  // Six-yard box in front of the goal.
  line(14, 0.12, 0, goalZ + 5.5);
  line(0.12, 5.5, -7, goalZ + 2.75);
  line(0.12, 5.5, 7, goalZ + 2.75);
  stage.scene.add(markings);

  const goal = buildGoal(9);
  goal.position.set(0, 0, goalZ);
  stage.scene.add(goal);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 18, 14),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45 }),
  );
  stage.scene.add(ball);

  const keeper = buildCharacter({ body: '#f5c542', accent: '#1c1c1c', helmet: 'cap', hair: 'short' });
  keeper.group.scale.setScalar(1.05);
  stage.scene.add(keeper.group);

  const defenders: Character[] = [];
  for (let i = 0; i < 5; i += 1) {
    const defender = buildCharacter({ body: '#c23b3b', accent: '#ffffff', helmet: 'none', hair: 'short' });
    defender.group.visible = false;
    stage.scene.add(defender.group);
    defenders.push(defender);
  }

  const coinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 16);
  const coinMat = new THREE.MeshStandardMaterial({
    color: '#f2c14e', emissive: '#8a5c00', emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.3,
  });
  const coins = pool(stage.scene, 4, () => new THREE.Mesh(coinGeo, coinMat));

  const hazardGeo = new THREE.OctahedronGeometry(0.32, 0);
  const hazardMat = new THREE.MeshStandardMaterial({
    color: '#e2412f', emissive: '#4a0d05', emissiveIntensity: 0.4, roughness: 0.5,
  });
  const hazards = pool(stage.scene, 4, () => new THREE.Mesh(hazardGeo, hazardMat));

  const aimGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const aimMat = new THREE.MeshStandardMaterial({
    color: '#c8ff4d', emissive: '#c8ff4d', emissiveIntensity: 0.9,
  });
  const aim = pool(stage.scene, 12, () => new THREE.Mesh(aimGeo, aimMat));

  return { stage, ball, goal, keeper, defenders, coins, hazards, aim, grass };
}

export function updatePitchScene(
  scene: PitchScene,
  s: PitchFrameState,
  width: number,
  height: number,
) {
  const px = (x: number) => (x / width - 0.5) * PITCH_W;
  // Screen top is the goal line, screen bottom is the near edge of the pitch.
  const pz = (y: number) => (y / height - 0.5) * PITCH_D;

  scene.ball.position.set(px(s.bx), 0.38, pz(s.by));
  scene.ball.rotation.x = s.spin;
  scene.ball.rotation.z = s.spin * 0.6;

  const { goalW, goalX, keeperY } = s.layout;
  scene.keeper.group.position.set(px(goalX + s.keeperX * goalW), 0, pz(keeperY));
  scene.keeper.group.rotation.y = Math.PI;
  // Arms out: a keeper reading a shot, and it makes his width obvious.
  scene.keeper.armL.rotation.z = 1.1;
  scene.keeper.armR.rotation.z = -1.1;

  let wallI = 0;
  for (const defender of s.wall) {
    const model = scene.defenders[wallI];
    wallI += 1;
    if (!model) continue;
    model.group.visible = true;
    model.group.position.set(px(defender.x), 0, pz(defender.y));
    model.group.rotation.y = Math.PI;
    model.armL.rotation.z = 0.25;
    model.armR.rotation.z = -0.25;
  }
  for (let i = wallI; i < scene.defenders.length; i += 1) {
    const model = scene.defenders[i];
    if (model) model.group.visible = false;
  }

  let coinI = 0;
  let hazardI = 0;
  for (const pickup of s.pickups) {
    if (pickup.taken) continue;
    if (pickup.kind === 'coin') {
      const mesh = scene.coins[coinI];
      coinI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(px(pickup.x), 0.4, pz(pickup.y));
      mesh.rotation.y += 0.08;
    } else {
      const mesh = scene.hazards[hazardI];
      hazardI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(px(pickup.x), 0.36, pz(pickup.y));
      mesh.rotation.y += 0.05;
    }
  }
  hideRest(scene.coins, coinI);
  hideRest(scene.hazards, hazardI);

  // The aim, with the bend drawn in. This runs the same integration the live
  // ball does — curl, then drag — because a straight preview of a shot that
  // bends makes the curl guesswork rather than a skill.
  let aimI = 0;
  if (s.aiming && !s.live && !s.over) {
    const dx = s.bx - s.aimX;
    const dy = s.by - s.aimY;
    const power = Math.min(1, Math.hypot(dx, dy) / 150);
    if (power > 0.12) {
      const angle = Math.atan2(dy, dx);
      const speed = 250 + power * 520;
      let vx = Math.cos(angle) * speed;
      let vy = Math.sin(angle) * speed;
      const curl = (dx / Math.max(40, Math.abs(dy))) * -520;
      let x = s.bx;
      let y = s.by;
      const step = 0.055;
      for (let i = 0; i < scene.aim.length; i += 1) {
        vx += curl * step;
        const drag = Math.pow(0.35, step);
        vx *= drag;
        vy *= drag;
        x += vx * step;
        y += vy * step;
        const mesh = scene.aim[aimI];
        aimI += 1;
        if (!mesh) continue;
        mesh.visible = true;
        mesh.position.set(px(x), 0.4, pz(y));
      }
    }
  }
  hideRest(scene.aim, aimI);
}

export function disposePitchScene(scene: PitchScene) {
  disposeStage(scene.stage);
}
