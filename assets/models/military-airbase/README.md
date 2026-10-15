# Military airbase assets

The FBX models here were extracted from the user's local Fab package
`militaryairport_unity_v1.unitypackage`. `scene.json` carries the transforms
from its `AirbaseDemoMap.unity` scene, recentered for the simulator. The map
loads the FBX files with Three.js `FBXLoader` and batches repeated placements
with `InstancedMesh`.

The Unity terrain heightmap and source texture set are not part of this
extraction. The simulator supplies a flat flight surface and a neutral texture
fallback while retaining the FBX material colours.
