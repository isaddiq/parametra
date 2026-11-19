# Parametra

![1795064799816](image/README/1795064799816.png)

![1795064817121](image/README/1795064817121.png)

House designs shaped around how you live. Describe a plot, a household and a style, and Parametra lays out dozens of complete house designs, scores each one against your priorities, and lets you explore the best four as dimensioned floor plans and as a furnished 3D model.

It is a fully static site: plain HTML, CSS and ES modules. There is no build step, no backend and no runtime CDN for code (Three.js is vendored). It works on GitHub Pages or any static host.

## Run locally

ES modules must be served over http. Opening `index.html` straight from disk won't work.

- **Windows:** double-click `start.bat`. It opens [http://localhost:8080](http://localhost:8080).
- **Any OS:** run `python -m http.server 8080` in this folder, then open [http://localhost:8080](http://localhost:8080).

## Deploy to GitHub Pages

1. Push this folder to a repository.
2. In **Settings → Pages**, set the source to **Deploy from a branch**, then pick your branch and `/ (root)`.
3. The site goes live at `https://<user>.github.io/<repo>/`. All paths are relative and routing uses the URL hash (`#/brief`, `#/studio`), so no server rewrites are needed. `.nojekyll` stops Jekyll from processing the files.

The only external request is Google Fonts (Archivo). If the fonts are blocked, the site falls back to system fonts.

## How it's organised

| View                            | What it does                                                                                                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Landing** (`#/`)      | Live 3D turntable of a sample design, how it works, the eight styles drawn as elevations, a real plan output, and six example briefs                                                         |
| **Brief** (`#/brief`)   | Six guided steps: plot, size, rooms, kitchen and outdoors, style, priorities. A live preview of the best layout updates as you choose                                                        |
| **Studio** (`#/studio`) | Four recommended designs as tabs. A single viewer switches between 3D, floor plan and side by side. A details panel has Overview, Rooms, Scores and Materials tabs. Export lives in one menu |

**3D viewer modes:**

- Outside: orbit the house.
- Cut away: a section plane at each level, with dark fill where walls are cut.
- Walk: first-person walkthrough.

It also has a sun-position slider tied to the plot's orientation and hemisphere, camera presets, and layer toggles.

**Landscaping:**

- **Lawn:** a shader adds large-scale colour variation and hides texture tiling, with instanced 3D grass tufts on top.
- **Trees:** branching trunks with bark textures and leaf-card crowns that cast dappled shadows. Species follow the style: birch, oak, maple, olive, cypress, pine, palm.
- **Planting:** shrubs, ornamental grasses and mulched beds.
- **Boundaries by style:**
  - board-formed concrete wall with timber battens
  - rendered wall with a timber slat screen
  - timber board fence
  - stucco or brick walls with coping and piers
  - picket and post-and-rail fences
  - stone walls

**Exports:**

- **IFC4 BIM model:** written from the live 3D scene, so it matches the 3D view.
  - Geometry: every object is exported as tessellated geometry (`IfcTriangulatedFaceSet`), including walls, openings, doors, windows, slabs, the roof, stairs, railings, furniture, sanitaryware, paving, boundary walls, fences, trees and planting.
  - Appearance: each material becomes an `IfcSurfaceStyle` and an `IfcMaterial` with its colour, transparency and finish. Its texture is embedded as an `IfcBlobTexture` with UV coordinates. Viewers that ignore textures still show the right colours.
  - BIM structure: proper IFC classes (`IfcWall`, `IfcRoof`, `IfcStair`, `IfcFurniture`, `IfcSanitaryTerminal`, `IfcGeographicElement`…). Doors and windows void and fill their host walls, and furniture sits in its room's `IfcSpace`. It includes property sets, base quantities and true north.
  - Left out: the instanced grass tufts. The lawn surface keeps its texture. The ground and street are clipped to the plot plus a margin.
  - It passes ifcopenshell schema and rule validation.
- **GLB** 3D scene.
- **SVG** plans for every level.
- **PNG** image of the 3D view.
- **JSON** design data.

Deep links: `?preset=villa#/studio`, `?style=japandi#/brief`, `?step=3#/brief`, `?view=plan#/studio`, `?theme=dark`.

## How designs are generated (`js/engine.js`)

1. **Program.** The brief becomes rooms with preferred areas and width limits. Suites are grouped: master with walk-in and ensuite, kitchen with pantry, laundry with store.
2. **Floors.** Public rooms go on the ground floor and bedrooms upstairs, with a bathroom on every bedroom floor. Flexible rooms then move between floors whenever that narrows the footprint.
3. **Banded layout.** Each storey has a street band, a 1.2 m circulation spine and a garden band. Room widths are solved by weighted flex distribution. Spare length becomes storage or a roof terrace. The U-stair lines up on every level.
4. **Derivation.** Walls come from classifying the edges between rooms as exterior, interior or open plan. Doors follow a parent graph. Windows follow style glazing ratios, room type and privacy settings. Furniture is placed per room with collision checks.
5. **Scoring.** Nine criteria are weighted by your priority sliders: efficiency, proportions, daylight, solar orientation, functional flow, privacy, area match, site fit and build economy. Each brief explores 36–108 variants, and the four best distinct ones are shown.

## Files

```text
index.html            app shell, icon sprite, import map → vendor/three
css/app.css           design tokens (light + dark), layout, components
js/main.js            router, landing page, brief wizard, studio, exports
js/data.js            room catalogue, styles, defaults
js/engine.js          layout generator, walls/openings, scoring, recommender
js/furniture.js       furniture layout solver
js/plan2d.js          SVG floor plans and thumbnails
js/viewer3d.js        Three.js scene: building, roofs, stairs, site, modes, GLB
js/landscape.js       lawn shader, grass, trees, shrubs, hedges, boundaries
js/models3d.js        furniture models
js/textures.js        procedural textures and leaf cards (no image assets)
js/ifc.js             IFC4 STEP exporter
vendor/three/         Three.js r169 (MIT) and the addons used
start.bat             local launcher for Windows
```

## Notes

- Designs are concept-stage studies for briefing an architect. They are not construction documents, and costs are indicative (USD).
- The 3D view needs WebGL. Floor plans and every other part of the site work without it.
