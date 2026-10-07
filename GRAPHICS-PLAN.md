# Graphics: toward Borderlands

The owner's ask of 2026-10-07: make the whole game look better, moving toward
Borderlands quality graphics, with backward compatibility a must. Worked as a
loop: plan, a pass, screenshots, re-plan.

## What Borderlands is, in render terms

1. **Ink.** Heavy, near black outlines on every silhouette and on the major
   creases, heavier on what is near and finer on what is far.
2. **Drawn shadow.** Shadowed faces carry pen hatching; deep shadow carries a
   second, crossing set. Light and shadow are two flat values with a crisp
   edge, which the toon ramps already give.
3. **Painted surfaces.** Flat fills broken by a hand painted mottle and grime,
   so a wall reads as a painted texture, not a plastic panel.
4. **Palette.** Saturated, warmer, higher contrast than the current pastel
   grade, darks that are actually dark under the ink.
5. **Edge highlights and props with character.** Worn, chipped edges picked
   out in a light colour; chunky props.

## Constraints that shape every pass

- **Backward compatible.** No file format, setting, track, map, replay or
  physics changes. Every change is in the render path and keyed to the
  existing graphics presets.
- **Phones and integrated laptops.** Low keeps none of the new per pixel
  work. No new full screen pass, no new render target, no new texture fetch
  per pixel (budget.js P3, P4, P5 stay where they are).
- **The vendored town pipeline stays byte identical.** Edits go on the
  pipeline's own copies of its materials, as manga.js already does.
- **Two pipelines.** The race field (src/render/post.js, celmat.js) and the
  freestyle maps (src/maps/city/vendored/core/post.js through CityPipeline
  and BuiltPipeline). Every pass has to land on both.

## Pass 1 (this branch)

- `src/render/comic.js`: one accessor on MeshToonMaterial's prototype adds
  world space hatching in shadow and a two octave paint grit to every toon
  surface in every map, with shared uniforms keyed to the preset (off on
  Low). Strokes are held at a constant pixel width and spacing at any range.
- Field ink: near black, 1.55 times the reach near the camera, tapering to
  one texel with range, same five fetches. Strength 0.85 to 1.0.
- Field grade: vibrance 0.22 to 0.34 and a perceptual S curve.
- Town and yard ink: near black, 1.55 times the width, a little more
  sensitive, inside creases heavier. Grade saturation 1.12 to 1.26 and a
  shallower lift so the darks hold.

## Candidates for later passes, re-ranked after each set of shots

- Edge highlights: a light rim on convex creases from the same geometry
  fetches the field ink already makes.
- Sky: a painted, banded sky with hard edged clouds instead of soft ones.
- Ground: stronger grime and painted detail on concrete and grass.
- The craft: heavier hull outline and a hatched underside.
- HUD in the same hand (ink outlined OSD text: POLISH-PLAN.md item 4).
