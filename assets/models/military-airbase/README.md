# Military airbase assets

The FBX models here were extracted from the user's local Fab package
`militaryairport_unity_v1.unitypackage`. `scene.json` carries the transforms
from its `AirbaseDemoMap.unity` scene, recentered for the simulator. The map
loads the FBX files with Three.js `FBXLoader` and batches repeated placements
with `InstancedMesh`.

The Unity terrain heightmap and source texture set are not part of this
extraction. The simulator supplies a flat flight surface, neutral fallbacks
for missing normal maps, subdued colours derived from FBX material names,
and small tiled surface maps for asphalt, concrete, grass, metal and wood.
These maps restore surface variation where the package's base-colour images
are absent, without changing the original geometry or instance layout.
