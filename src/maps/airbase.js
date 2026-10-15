/*
 * airbase.js: the Fab military airport scene, loaded from its Unity-exported
 * FBX meshes without requiring the Unity editor at runtime or at import time.
 * The compact scene manifest is derived from AirbaseDemoMap.unity. Repeated
 * meshes are rendered as InstancedMeshes so the 2,300 scene placements stay
 * within the simulator's draw-call budget.
 */

import * as THREE from 'three';
import { FBXLoader } from './fbxloader.js';
import { buildMap as buildYard } from './built/index.js';
import { starterMap } from './built/starter.js';
import { yieldToPaint } from '../ui/loading.js';

const MODEL_ROOT = 'Assets/FreshCan3D/MilitaryAirport/Art/Meshes/';
const SCENE_URL = new URL('../../assets/models/military-airbase/scene.json', import.meta.url);
const WHITE_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/iVQAAAAASUVORK5CYII=';
const FIELD = Object.freeze({ width: 960, depth: 480 });
const SPAWN = Object.freeze({ x: -320, z: -84, yaw: 0 });

function airportDocument() {
  const doc = starterMap();
  doc.id = 'fab-military-airbase';
  doc.name = 'Askerî Hava Üssü';
  doc.field = { ...FIELD, gridSize: 1 };
  doc.elements = [{
    id: 'el-1',
    type: 'startPads',
    name: 'Pist başlangıcı',
    position: { x: FIELD.width / 2 + SPAWN.x, y: FIELD.depth / 2 - SPAWN.z, z: 0 },
    yaw: SPAWN.yaw,
    pitch: 0,
    yawOverridden: false,
    dims: { pads: 4, spacing: 1.5, padSize: 0.6 },
  }];
  return doc;
}

function modelUrl(model) {
  if (!model.startsWith(MODEL_ROOT)) {
    throw new Error(`airbase: unexpected model path ${model}`);
  }
  const relative = model.slice(MODEL_ROOT.length)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return new URL(`../../assets/models/military-airbase/${relative}`, import.meta.url).href;
}

function managerWithoutSourceTextures() {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (/\.(?:png|jpe?g|tga|tif|tiff|bmp|dds)(?:[?#].*)?$/i.test(url)) {
      return WHITE_PIXEL;
    }
    return url;
  });
  return manager;
}

function meshTemplates(root) {
  root.updateMatrixWorld(true);
  const meshes = [];
  const bounds = new THREE.Box3();
  root.traverse((node) => {
    if (!node.isMesh || !node.geometry?.attributes?.position) {
      return;
    }
    if (!node.geometry.attributes.normal) {
      node.geometry.computeVertexNormals();
    }
    node.geometry.computeBoundingBox();
    if (node.geometry.boundingBox) {
      bounds.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
    }
    node.castShadow = true;
    node.receiveShadow = true;
    meshes.push({ geometry: node.geometry, material: node.material, matrix: node.matrixWorld.clone() });
  });
  return { meshes, bounds };
}

function placeModels(scene, colliders, manifest, templates) {
  const byModel = new Map();
  for (const item of manifest.instances) {
    let list = byModel.get(item.model);
    if (!list) {
      list = [];
      byModel.set(item.model, list);
    }
    list.push(item);
  }

  const instances = new THREE.Group();
  instances.name = 'Military airport';
  const dummy = new THREE.Object3D();
  const instanceMatrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const worldBounds = new THREE.Box3();
  const boundsSize = new THREE.Vector3();
  let meshCount = 0;

  for (const [model, placements] of byModel) {
    const template = templates.get(model);
    if (!template || template.meshes.length === 0) {
      continue;
    }

    for (const mesh of template.meshes) {
      const instanced = new THREE.InstancedMesh(mesh.geometry, mesh.material, placements.length);
      instanced.name = model;
      instanced.castShadow = true;
      instanced.receiveShadow = true;
      instanced.frustumCulled = false;
      for (let i = 0; i < placements.length; i += 1) {
        const item = placements[i];
        position.set(item.x, item.y, item.z);
        rotation.set(item.q[0], item.q[1], item.q[2], item.q[3]).normalize();
        scale.set(item.s[0], item.s[1], item.s[2]);
        dummy.position.copy(position);
        dummy.quaternion.copy(rotation);
        dummy.scale.copy(scale);
        dummy.updateMatrix();
        instanceMatrix.multiplyMatrices(dummy.matrix, mesh.matrix);
        instanced.setMatrixAt(i, instanceMatrix);
      }
      instanced.instanceMatrix.needsUpdate = true;
      instances.add(instanced);
      meshCount += 1;
    }

    const stem = model.slice(model.lastIndexOf('/') + 1).toLowerCase();
    const isWalkableSurface = /(?:road|runway|ground|sidecap|cone|bollard|fence|barrier|roadblock|carpark_block)/.test(stem);
    if (!isWalkableSurface && template.bounds && !template.bounds.isEmpty()) {
      for (const item of placements) {
        position.set(item.x, item.y, item.z);
        rotation.set(item.q[0], item.q[1], item.q[2], item.q[3]).normalize();
        scale.set(item.s[0], item.s[1], item.s[2]);
        dummy.position.copy(position);
        dummy.quaternion.copy(rotation);
        dummy.scale.copy(scale);
        dummy.updateMatrix();
        worldBounds.copy(template.bounds).applyMatrix4(dummy.matrix);
        worldBounds.getSize(boundsSize);
        if (boundsSize.y < 0.8 || boundsSize.x < 0.25 || boundsSize.z < 0.25) {
          continue;
        }
        colliders.addBox(
          'obstacle',
          worldBounds.min.x, worldBounds.min.y, worldBounds.min.z,
          worldBounds.max.x, worldBounds.max.y, worldBounds.max.z,
        );
      }
    }
  }

  scene.add(instances);
  return { group: instances, meshes: meshCount, types: byModel.size };
}

export async function buildMap(shell, onProgress, options) {
  const progress = onProgress ?? (() => {});
  const doc = airportDocument();
  const opts = options || {};
  const base = await buildYard(shell, async (fraction) => {
    progress(fraction * 0.48);
    await yieldToPaint();
  }, { ...opts, document: doc, deferColliderBuild: true });

  try {
    const response = await fetch(SCENE_URL);
    if (!response.ok) {
      throw new Error(`airbase manifest: ${response.status}`);
    }
    const manifest = await response.json();
    const uniqueModels = [...new Set(manifest.instances.map((item) => item.model))];
    const templates = new Map();
    const manager = managerWithoutSourceTextures();
    let loaded = 0;
    const batchSize = 4;
    for (let start = 0; start < uniqueModels.length; start += batchSize) {
      const batch = uniqueModels.slice(start, start + batchSize);
      await Promise.all(batch.map(async (model) => {
        try {
          const root = await new FBXLoader(manager).loadAsync(modelUrl(model));
          templates.set(model, meshTemplates(root));
        } catch (error) {
          console.warn(`airbase: could not load ${model}`, error);
        }
        loaded += 1;
      }));
      progress(0.48 + 0.48 * (loaded / uniqueModels.length));
      await yieldToPaint();
    }

    const placed = placeModels(base.scene, base.colliders, manifest, templates);
    base.colliders.build();
    base.id = 'airbase';
    base.name = doc.name;
    base.spawn = { ...SPAWN };
    base.setCullRadius(540);
    const stats = base.stats;
    base.stats = () => ({
      ...stats(),
      airbaseInstances: manifest.instances.length,
      airbaseModelTypes: placed.types,
      airbaseBatches: placed.meshes,
      missingAirbaseModels: uniqueModels.length - templates.size,
    });
    progress(1);
    return base;
  } catch (error) {
    base.dispose();
    throw error;
  }
}
