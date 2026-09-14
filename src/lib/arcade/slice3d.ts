/**
 * Slice's 3D world: fruit thrown up through a lit volume, cut by a swipe.
 *
 * The throws were always real gravity arcs in a plane, and the swipe test is a
 * segment against a circle — both stay exactly as they were. What 3D adds is
 * that a cut fruit can actually come apart: each target is two hemispheres
 * that sit together until it is hit and then separate, which is the one thing
 * a flat sprite could only imply.
 *
 * The fruit are generic solids in fruit colours, not any existing game's art.
 */
import * as THREE from 'three';

import { createStage, disposeStage, hideRest, pool, type Stage } from './three-kit';

const FIELD_W = 15;
const FIELD_H = 19;

export type FruitKind = 'melon' | 'orange' | 'apple' | 'lime' | 'plum' | 'banana';

const FRUIT_COLOR: Record<FruitKind, string> = {
  melon: '#4f9d4a',
  orange: '#ef8b28',
  apple: '#d33b3b',
  lime: '#9ccb3b',
  plum: '#7b4397',
  banana: '#e8c33c',
};
/** The wet inside a cut shows, which is most of why a slice reads as a slice. */
const FLESH_COLOR: Record<FruitKind, string> = {
  melon: '#f2607a',
  orange: '#ffbe5c',
  apple: '#fdf3e0',
  lime: '#e4f5a8',
  plum: '#d9a7e8',
  banana: '#fff5cf',
};

export interface SliceTarget {
  x: number; y: number; r: number;
  angle: number; hit: boolean; bomb: boolean; fruit: FruitKind;
}
export interface SliceTrailPoint {
  x: number; y: number; life: number;
}

export interface SliceFrameState {
  targets: SliceTarget[];
  trail: SliceTrailPoint[];
}

interface Fruit {
  group: THREE.Group;
  halfA: THREE.Mesh;
  halfB: THREE.Mesh;
  skin: THREE.MeshStandardMaterial;
  flesh: THREE.MeshStandardMaterial;
}

/** A fruit as two hemispheres, so a cut one can come apart. */
function buildFruit(): Fruit {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: '#ef8b28', roughness: 0.55 });
  const flesh = new THREE.MeshStandardMaterial({ color: '#ffbe5c', roughness: 0.7 });

  // A hemisphere plus a flat cap, so the cut face is opaque rather than hollow.
  const domeGeo = new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const capGeo = new THREE.CircleGeometry(1, 18);

  const halfA = new THREE.Mesh(domeGeo, skin);
  const capA = new THREE.Mesh(capGeo, flesh);
  capA.rotation.x = Math.PI / 2;
  halfA.add(capA);
  group.add(halfA);

  const halfB = new THREE.Mesh(domeGeo, skin);
  halfB.rotation.z = Math.PI;
  const capB = new THREE.Mesh(capGeo, flesh);
  capB.rotation.x = Math.PI / 2;
  halfB.add(capB);
  group.add(halfB);

  return { group, halfA, halfB, skin, flesh };
}

function buildBomb(): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 14),
    new THREE.MeshStandardMaterial({ color: '#17120e', roughness: 0.35, metalness: 0.5 }),
  );
  group.add(body);
  const fuse = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 0.7, 8),
    new THREE.MeshStandardMaterial({ color: '#8a6238', roughness: 0.9 }),
  );
  fuse.position.y = 1.2;
  group.add(fuse);
  const spark = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshStandardMaterial({
      color: '#ffb648', emissive: '#ff8c1a', emissiveIntensity: 1.7,
    }),
  );
  spark.position.y = 1.6;
  group.add(spark);
  return group;
}

export interface SliceScene {
  stage: Stage;
  fruits: Fruit[];
  bombs: THREE.Group[];
  trail: THREE.Mesh[];
}

export function createSliceScene(canvas: HTMLCanvasElement): SliceScene {
  const stage = createStage(canvas, {
    sky: '#efe7de',
    gradient: ['#f6f1e8', '#efe7de', '#d8cec0'],
    fog: null,
    fov: 50,
    camera: [0, 0, 21],
    lookAt: [0, 0, 0],
    ambient: 0.85,
    sunIntensity: 1.1,
    sun: [4, 9, 12],
  });

  const fruits: Fruit[] = [];
  for (let i = 0; i < 14; i += 1) {
    const fruit = buildFruit();
    fruit.group.visible = false;
    stage.scene.add(fruit.group);
    fruits.push(fruit);
  }

  const bombs = pool(stage.scene, 8, () => buildBomb());

  const trailGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const trailMat = new THREE.MeshStandardMaterial({
    color: '#17120e', emissive: '#17120e', emissiveIntensity: 0.3, transparent: true,
  });
  const trail = pool(stage.scene, 26, () => new THREE.Mesh(trailGeo, trailMat.clone()));

  return { stage, fruits, bombs, trail };
}

export function updateSliceScene(
  scene: SliceScene,
  s: SliceFrameState,
  width: number,
  height: number,
) {
  const px = (x: number) => (x / width - 0.5) * FIELD_W;
  const py = (y: number) => (0.5 - y / height) * FIELD_H;
  // The game sizes targets as a pixel radius; the same ratio gives world size.
  const pr = (r: number) => (r / width) * FIELD_W;

  let fruitI = 0;
  let bombI = 0;
  for (const target of s.targets) {
    const x = px(target.x);
    const y = py(target.y);

    if (target.bomb) {
      const mesh = scene.bombs[bombI];
      bombI += 1;
      if (!mesh) continue;
      mesh.visible = true;
      mesh.position.set(x, y, 0);
      mesh.rotation.z = target.angle;
      mesh.scale.setScalar(pr(target.r));
      continue;
    }

    const fruit = scene.fruits[fruitI];
    fruitI += 1;
    if (!fruit) continue;
    fruit.group.visible = true;
    fruit.group.position.set(x, y, 0);
    fruit.group.rotation.z = target.angle;
    fruit.group.scale.setScalar(pr(target.r));
    fruit.skin.color.set(FRUIT_COLOR[target.fruit]);
    fruit.flesh.color.set(FLESH_COLOR[target.fruit]);

    // Cut: the halves part along the fruit's own axis and tip away from each
    // other, so a sliced target is unmistakably in two pieces.
    const apart = target.hit ? 0.55 : 0;
    fruit.halfA.position.y = apart;
    fruit.halfB.position.y = -apart;
    fruit.halfA.rotation.x = target.hit ? 0.5 : 0;
    fruit.halfB.rotation.x = target.hit ? -0.5 : 0;
  }
  for (let i = fruitI; i < scene.fruits.length; i += 1) {
    const fruit = scene.fruits[i];
    if (fruit) fruit.group.visible = false;
  }
  hideRest(scene.bombs, bombI);

  // The swipe, as beads that fade with the trail's own life.
  let trailI = 0;
  for (let i = Math.max(0, s.trail.length - scene.trail.length); i < s.trail.length; i += 1) {
    const point = s.trail[i];
    const mesh = scene.trail[trailI];
    trailI += 1;
    if (!point || !mesh) continue;
    mesh.visible = true;
    mesh.position.set(px(point.x), py(point.y), 1.2);
    const life = Math.max(0, point.life);
    mesh.scale.setScalar(0.4 + life * 1.4);
    (mesh.material as THREE.MeshStandardMaterial).opacity = life * 0.85;
  }
  hideRest(scene.trail, trailI);
}

export function disposeSliceScene(scene: SliceScene) {
  disposeStage(scene.stage);
}
