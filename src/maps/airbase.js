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
const NEUTRAL_NORMAL_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNoaPj/HwAGggL/s75RMwAAAABJRU5ErkJggg==';
const FIELD = Object.freeze({ width: 960, depth: 480 });
const SPAWN = Object.freeze({ x: -320, z: -84, yaw: 0 });
const FBX_CENTIMETERS_PER_METER = 100;

/* The Fab package extraction contains the FBX files, but not their external
 * base-colour images. Keep the field readable with restrained material tints
 * instead of rendering every white texture fallback as the same gray. */
const MATERIAL_TINTS = [
  [/emissive[_\s-]*red/i, 0xd85a48],
  [/^mi[_\s-]*emissive/i, 0xd6c674],
  [/grass|helideckfelt/i, 0x71824f],
  [/glass/i, 0x76a9c3],
  [/container[_\s-]*1/i, 0x727e5c],
  [/container[_\s-]*2/i, 0x93764f],
  [/planks[_\s-]*1/i, 0x8d7451],
  [/planks[_\s-]*2/i, 0xa18a62],
  [/rubber/i, 0x454844],
  [/runway[_\s-]*threshold/i, 0xb7a979],
  [/runway[_\s-]*center|runway[_\s-]*stopway/i, 0x777b75],
  [/roads|pavement|carpark/i, 0x74756c],
  [/concrete/i, 0x999487],
  [/corrugated/i, 0x92977f],
  [/fence|metalrope/i, 0x73776e],
  [/metal[_\s-]*1/i, 0x778367],
  [/metal[_\s-]*2/i, 0x828984],
  [/metal[_\s-]*3/i, 0x6f7771],
  [/metal[_\s-]*4/i, 0x827858],
  [/metal[_\s-]*plate/i, 0x85877f],
  [/props[_\s-]*1/i, 0x9b825e],
  [/props[_\s-]*2/i, 0x75815d],
  [/props[_\s-]*3/i, 0x85847a],
];

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
      /* An all-white normal map points light diagonally instead of along the
       * surface. Use encoded (128, 128, 255) for missing _N textures; white
       * remains the neutral fallback for diffuse/base-colour maps. */
      const path = url.split(/[?#]/, 1)[0];
      if (/(?:^|[._-])(?:n|normal|normalmap)(?:[._-]|$)/i.test(path)) {
        return NEUTRAL_NORMAL_PIXEL;
      }
      return WHITE_PIXEL;
    }
    return url;
  });
  return manager;
}

function tintMissingTextureMaterials(material) {
  const materials = Array.isArray(material) ? material : [material];
  for (const item of materials) {
    if (!item?.color) {
      continue;
    }
    const name = String(item.name || item.map?.name || '');
    const tint = MATERIAL_TINTS.find(([pattern]) => pattern.test(name));
    if (tint) {
      item.color.setHex(tint[1]);
      /* The albedo maps are missing, so these imported Phong materials can
       * otherwise fall almost to black under the freestyle map's shadow and
       * ink passes. A small tinted emissive floor keeps their fallback hues
       * readable without flattening the direct lighting. */
      if (item.emissive) {
        item.emissive.copy(item.color).multiplyScalar(0.16);
      }
    }
  }
}

function meshTemplates(root) {
  /* Unity's scene.json placements use metres and Y-up coordinates. These
   * source FBX files use centimetres and Z-up coordinates; FBXLoader exposes
   * the unit scale but leaves both conversions to the caller. Convert before
   * collecting mesh matrices and bounds, so the drawn instances and their
   * collision boxes agree with the Unity scene. */
  const centimetersPerUnit = Number(root.userData?.unitScaleFactor);
  const unitsToMeters = Number.isFinite(centimetersPerUnit) && centimetersPerUnit > 0
    ? centimetersPerUnit / FBX_CENTIMETERS_PER_METER
    : 1 / FBX_CENTIMETERS_PER_METER;
  const modelToSimulator = new THREE.Matrix4()
    .makeRotationX(-Math.PI / 2)
    .multiply(new THREE.Matrix4().makeScale(unitsToMeters, unitsToMeters, unitsToMeters));
  root.updateMatrixWorld(true);
  const candidates = [];
  const lodNumbers = [];
  root.traverse((node) => {
    if (!node.isMesh || !node.geometry?.attributes?.position) {
      return;
    }
    const name = String(node.name || node.userData?.originalName || '');
    if (/convex.?hull|collision|collider|physics/i.test(name)) {
      return;
    }
    const lodMatch = name.match(/lod[_\s-]?(\d+)/i);
    const lod = lodMatch ? Number(lodMatch[1]) : null;
    if (lod !== null) {
      lodNumbers.push(lod);
    }
    candidates.push({ node, lod });
  });

  /* Unreal exports every LOD as separate FBX geometry. The previous loader
   * instanced all of them at once, so their nearly coplanar surfaces fought
   * in the depth buffer. Keep the highest-detail LOD (usually LOD0), and any
   * shared non-LOD pieces; collision hulls were excluded above. */
  const selectedLod = lodNumbers.length ? Math.min(...lodNumbers) : null;
  const visibleMeshes = candidates.filter(({ lod }) => lod === null || lod === selectedLod);
  const meshes = [];
  const bounds = new THREE.Box3();
  for (const { node } of visibleMeshes) {
    const matrix = modelToSimulator.clone().multiply(node.matrixWorld);
    if (!node.geometry.attributes.normal) {
      node.geometry.computeVertexNormals();
    }
    node.geometry.computeBoundingBox();
    if (node.geometry.boundingBox) {
      bounds.union(node.geometry.boundingBox.clone().applyMatrix4(matrix));
    }
    tintMissingTextureMaterials(node.material);
    node.castShadow = true;
    node.receiveShadow = true;
    meshes.push({ geometry: node.geometry, material: node.material, matrix });
  }
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
