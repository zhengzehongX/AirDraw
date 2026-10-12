# AirDraw User Guide

AirDraw provides three creative workspaces in one project: a 2D canvas, 3D air drawing and 3D model control. Legacy PlayLab toys are not part of the current application.

## Getting started
1. Open AirDraw on localhost or HTTPS in a recent Chromium browser.
2. Select Start Experience to see the particle Hello, then explicitly select Enter Creation.
3. Choose a workspace and grant camera permission. Wait for hand tracking to become ready.
4. The camera preview can show the hand skeleton for diagnostics and can be collapsed.
5. Keep your hand in view. Point with your index finger; pinch thumb and index finger to confirm.

## Canvas Draw
Pinch and move to draw; release to finish a stroke. The contextual tools provide pen, marker, highlighter, eraser, color, size, undo/redo, clear and background choices. White, dark and transparent backgrounds affect the canvas itself. Export 2D artwork as PNG or SVG.

## Spatial Draw
Pinch and move to create a thick 3D stroke. The floor grid and origin axes indicate position and orientation. Use the tool panel to change stroke appearance and material.

## Model Control
- **One-hand object editing**: choose Move, Rotate or Scale, point to an object and pinch-hold; release to finish. Briefly hold the V pose to cycle the active transform.
- **Two-hand world navigation**: pinch with both hands. Change hand separation to zoom; move the midpoint to pan; rotate or raise/lower the line between hands to change the view.
- **Import**: GLB is supported as one file. For glTF, select the model with its referenced BIN and textures.
- **Water touch**: pinch and move over the water to create ripples. This is a visual approximation, not a physical contact sensor.

## Projects and backup
Use the project menu to create, save, duplicate, rename, open or delete projects. Autosave runs after editing pauses. Projects are stored in browser storage; clearing site data removes them. Export important work as an AirDraw JSON package.

## Export
Canvas artwork supports PNG/SVG; the creative view supports PNG/WebM; 3D objects support GLB; the full project supports JSON. Default camera preview is excluded from creative exports.

## Current limitations
- Camera permission and operating-system file pickers require normal system input.
- Voice recognition depends on the browser implementation and is not guaranteed offline.
- Automated and simulated tests do not replace real camera and hand testing.
- Known real-device feedback: pointer/stroke drift may remain after the hand becomes still. Verify precision work and export an input diagnostic if it occurs.
- Screenshots are isolated browser captures using simulated input, not live-camera demonstrations.

Guides: [Bilingual quick start](QUICK_START.md) · [Screenshot index](release/SCREENSHOTS.md) · [Model attribution](../public/models/library/ATTRIBUTION.md)
