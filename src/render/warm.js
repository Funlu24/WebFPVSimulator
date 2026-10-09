/*
 * warm.js: build a map's shader programs before its first frame, in the
 * context its frames draw in.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * WHY THE TARGET IS AN ARGUMENT.
 *
 * three keeps one program per material per draw context, and the context it
 * reads is whatever the renderer has bound at the moment it is asked. With
 * nothing bound the output is the canvas and the fragment shader converts to
 * sRGB; with a render target bound it writes linear and converts nothing.
 * Every map here draws its scene into a target (the field's composer, the
 * town's and the yard's pipeline) and converts on a pass of its own at the
 * end, so the programs its frames use are the linear ones.
 *
 * renderer.compile(scene, camera) with nothing bound, which is how the field
 * did this, builds the other set. It was measured on the field at Medium:
 * 21 of its 46 programs were sRGB variants compiled for nothing and never
 * drawn, while the 25 that were drawn compiled one at a time in the first
 * frame, each blocking until its own link finished. The town and the yard
 * compiled nothing ahead at all, so a prop's program was built the first
 * time a frame drew that prop: between the first frame and the end of a
 * twelve second flight the yard linked 36 more programs and the town 21,
 * each a stall the pilot earned by turning their head. The reason the
 * compile existed, which scene.js states at length, was exactly that.
 *
 * WHY IT IS AWAITED.
 *
 * compileAsync links every program in one burst and then asks each whether
 * it has finished without waiting for it. Where the browser has
 * KHR_parallel_shader_compile the links run side by side on the GPU
 * process's own threads and the loading screen keeps painting while they
 * do; the first frame then finds them done. Where it has not (a software
 * rasteriser, an old driver) three waits one timer tick and the first frame
 * pays as it always did, so nothing here can make a world load slower than
 * it did. It could not be measured on the machine this was written on,
 * which is a software rasteriser: see PROGRESS.md.
 *
 * WHAT IT DOES NOT REACH. compile walks the scene's own materials. The
 * prepass override materials, the shadow depth variants and the fullscreen
 * passes are not on any object, so they still link on the first frame that
 * draws them, which is under the loading screen: the last stage of loading
 * is that frame.
 */
export async function warmPrograms(renderer, scene, camera, target) {
  /* three logs a warning on every compileAsync where the extension is missing, and the page's console must stay
   * clean (verify's world-scale reads it), so there the links are made synchronously with the target bound, as
   * main always did. */
  const parallel = renderer.extensions.has('KHR_parallel_shader_compile');
  /* A warm up is an optimisation, so a failure here may cost the first
   * frame its compile and must never cost the pilot the map. */
  try {
    const prior = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    let pending;
    try {
      /* compileAsync reads the bound target in its synchronous part, when it
       * makes the programs, and only polls afterwards, so the target can go
       * back before the wait. */
      if (parallel) {
        pending = renderer.compileAsync(scene, camera);
      } else {
        renderer.compile(scene, camera);
      }
    } finally {
      renderer.setRenderTarget(prior);
    }
    await pending;
  } catch (e) {
    console.warn('warmPrograms: the programs will compile on the first frame instead', e);
  }
}
