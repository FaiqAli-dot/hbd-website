IMPORTANT CREATIVE DIRECTION CHANGES (user, Nov 11 2026) — core design requirements.

CHAPTER 1 — CAMERA-LED MEMORY EXPLORATION
No photographs flying into a fixed frame, scaling, squashing, expanding or behaving like slideshow cards.
Photographs already exist inside a 3D environment. User swipes navigate the CAMERA through it.
For each swipe:
* Identify the next photograph in the corresponding direction.
* Animate camera position and orientation towards that photograph.
* Smooth, curved camera trajectory through 3D space.
* Subtle anticipation, acceleration and deceleration.
* Gradually bring selected photo into focal composition.
* Keep surrounding photos visible at different depths.
* Parallax and subtle environmental movement for spatial depth.
Photo remains a physical object; its scale must not dramatically change to fake camera movement.
Feel: travelling through a spatial collection of memories.
Use GSAP for camera choreography and quaternion interpolation (slerp) for orientation. No abrupt snapping.
Photos get deliberately composed positions/orientations — not random.

CHAPTER 4 — HANDWRITTEN SOFT-PINK BIRTHDAY FINALE
HAPPY BIRTHDAY must be physically written through animation. No zoom/scale/fade/simple reveal.
Elegant handwritten script with connected letter strokes.
Use Anime.js to animate SVG stroke paths progressively, with a visible leading writing point.
Integrate Three.js particles that follow the writing paths and leave subtle soft-pink luminous trails.
Colour: soft rose-pink, sophisticated, restrained, not neon.
After writing completes, words stay visible; personal birthday message revealed underneath.
Must look like someone actually writing, not a font being uncovered.

PROCESS: Before implementation, show proposed camera paths + storyboard for Chapter 1 and a visual reference/mockup of the handwritten finale. Do not start coding until composition is approved.
