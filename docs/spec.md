# DraftHouse v1 spec

DraftHouse is a website for planning a home remodel in 3D. You draw your rooms and add doors, windows and furniture. You paste a link to a product you're considering, and DraftHouse turns it into a 3D item at the product's real size, which you can move around your home. You keep several versions of the home ("as it is", "plan A") and compare them.

It is a personal, non-commercial project. There are no accounts and no AI. Everything is saved in your own browser.

## Glossary

| Term | Meaning |
|---|---|
| **Home** | Everything you've drawn. A home holds rooms and one or more versions. |
| **Plan** | The 2D layout: room outlines (polygons), the walls derived from them, and openings. Units are centimetres. |
| **Room** | A closed polygon with a name, a wall height, a floor material and colour, and a colour per wall. |
| **Wall** | One edge of a room polygon. A wall shared by two rooms is one wall. |
| **Opening** | A door or window on a wall: its position along the wall, width, height and sill height. A door also has a swing side and direction. |
| **Item** | Anything placed in the home: existing furniture or a product. It has a template, a size (width × depth × height), a colour, a position, a rotation (any angle), a mount (floor, wall, ceiling or on top of another item) and an optional product link. |
| **Template** | A shape recipe for one item type, such as sofa or toilet. It turns a size into a list of simple 3D parts (boxes and cylinders). |
| **Product** | What the link reader extracts from a page: name, size, price, currency, main colour and photo URL. Each field is optional. |
| **Version** | A named copy of the items and finishes in a home, for example "As it is" or "Plan A". The rooms and openings are shared by all versions in v1. |

## What v1 does

### Rooms

- **Quick start:** type a width, length and height, and get a rectangular room.
- **Draw:** in the top view, click corners to draw a room outline and close it on the first corner. Corners snap to 1 cm, to 15° angles and to existing corners. A shared edge between two rooms becomes one wall.
- You can drag a corner to edit the outline, rename a room or delete it.
- **Doors and windows:** place them on a wall with their width, height and sill height. You can drag them along the wall. They can't overlap each other or go past a wall's end.
- **Finishes:** set a colour per wall, and per room a floor material (wood, tile, carpet or concrete) plus a colour.

### Looking around

- **Orbit view:** rotate, pan and zoom around the home.
- **Top view:** the 2D plan, used to draw and edit rooms.
- Click a room to focus the camera on it. You can show or hide each room.
- Walls between the camera and the room fade out, so you can always see inside.

### Items

Templates in v1:

| Area | Templates |
|---|---|
| Living and bedroom | sofa, armchair, chair, table, desk, bed, wardrobe/cabinet, shelf/bookcase, TV/media unit, rug |
| Lighting | lamp, mounted on the floor, a table or the ceiling |
| Bathroom | toilet, bidet, sink, shower tray, bathtub |
| Kitchen and laundry | hob (stovetop), oven, cooker hood, fridge, washing machine or dryer |
| Generic | box (anything else), wall panel (pictures, mirrors, wall shelves) |

Placing and moving items:

- **Free move** is the default: drag an item to any position.
- **Snap** is a toggle. When on, an item snaps to walls, to the edges of other items and to a 5 cm grid.
- **Mount** keeps an item in the right place:
  - floor items stand on the floor
  - wall items stick to a wall, and you set their height on it
  - ceiling items hang from the ceiling
  - small items dropped onto another item stand on its top surface (stacking)
- **Rotation:** any angle. While snap is on, rotation steps by 15°.
- **Overlaps are allowed but flagged:** clashing items turn red. So does a door whose swing arc is blocked.
- **Measuring:** while you drag an item, the distances to the nearest wall in each direction and to the nearest item are shown. A tape-measure tool measures between any two points.
- You can duplicate, delete, rename and recolour items, and change their size.

### Adding a product from a link

1. Paste a link. The server reads the page and returns a product (see "Link reader").
2. A form opens, filled with whatever was found: name, template, width, depth, height, colour and price. You correct anything that's missing or wrong. You must confirm the template and all three dimensions before the item is placed.
3. The item is placed in the room you're looking at. The panel shows the product photo as a thumbnail (loaded directly from the shop) and a link back to the page.

**Add item** without a link always works too: the same form, empty.

### Versions and prices

- A home starts with one version, "As it is". **Duplicate** copies the current version so you can edit the copy. You can rename and delete versions. The last version can't be deleted.
- Switching versions swaps the items and finishes in the view.
- Each version shows the total price of its items that have a price, and the difference from the first version. Prices in different currencies are summed separately, with no conversion.

### Saving

- The home is saved in the browser automatically after each change.
- **Undo and redo** cover every change in the current session.
- **Export** downloads the home as a `.drafthouse.json` file, and **Import** opens one. The file has a `formatVersion` number, so older files can be migrated later.

### Languages and units

- The interface is in English, Spanish and Portuguese. The browser's language picks one, and you can change it in the app.
- All sizes are in centimetres, with room sizes also shown in metres. The link reader converts mm, m and inches to centimetres.

### Devices

- Desktop first, with a mouse and keyboard.
- On a phone you can only view and rotate a home. Editing shows a "use a computer to edit" note.

## Link reader

A small server endpoint: `POST /api/read-link` with `{ "url": "..." }`, which returns a product or an error code.

### How it extracts

In this order, where an earlier source wins for each field:

1. **Structured data** in the page: JSON-LD `Product`, including `width`, `depth`, `height`, `offers.price`, `offers.priceCurrency` and `image`.
2. **Open Graph and meta tags:** `og:title`, `og:image`, `product:price:amount` and `product:price:currency`.
3. **Dimension patterns** in the page text, in English, Spanish and Portuguese. For example:
   - `W 210 x D 95 x H 83 cm`
   - `Width: 210 cm`
   - `L 80 x P 40 x A 75 cm` (Portuguese: *largura, profundidade, altura*)
   - `Ancho: 80 cm, Fondo: 40 cm, Alto: 75 cm`
   - `210x95x83 cm`
   - values in mm, m and inches

   When the order of a bare `AxBxC` is unclear, the reader returns the numbers but doesn't assign them to width, depth and height. The user confirms the assignment in the form.
4. **Template guess:** keywords in the name (for example "sofá", "sofa", "couch" → sofa), in the three languages. It is only a suggestion in the form.
5. **Main colour:** the server downloads the photo, computes its main colour, returns only that hex value and discards the image. No shop images are ever stored.

### Safety rules

- Only `http` and `https` URLs on standard ports are allowed.
- The host must resolve to a public address. Loopback, private, link-local and other reserved ranges are refused, and every redirect is checked again.
- At most 3 redirects, a 10-second timeout and 5 MB per response (page or image).
- A rate limit of 20 reads per visitor per 10 minutes.
- The endpoint returns only the extracted fields, never the raw page.
- Error codes: `invalid-url`, `blocked-address`, `fetch-failed`, `too-large`, `timeout`, `rate-limited` and `nothing-found`. The form opens anyway, with no fields filled.

### Shops to test against first

IKEA, Leroy Merlin and Amazon (.es). Tests use small fixture files in `server/reader/fixtures/`, trimmed to just the parts the reader uses: the JSON-LD block, meta tags and the dimension text. Never full copies of a shop's page.

## Architecture

- **Front end:** TypeScript, Vite and Three.js, with plain DOM for the panels and no UI framework.
- **Server:** Node 24 running TypeScript directly, with no build step. It serves the built site and `/api/read-link`.
- **Code layout:**
  - `src/model/` is pure logic with no DOM and no Three.js: plan geometry, rooms and walls, openings, items, templates (size → parts), mounts and stacking, snapping, clash detection, distances, versions, prices and the save file format with its migrations. Almost all unit tests live here.
  - `src/scene/` draws what the model says with Three.js. It holds no rules of its own.
  - `src/ui/` holds the panels, forms and input handling.
  - `src/i18n/` holds the en, es and pt strings, with a test that every key exists in all three.
  - `server/` holds the HTTP server.
  - `server/reader/` holds the extraction, which is pure and tested against fixtures, and the safety checks.
- **Tests:**
  - Vitest for `src/model`, `src/i18n` and `server/reader`.
  - Playwright for end-to-end flows. Its screenshots of the 3D view go into each PR as evidence; a human judges how they look.
- **Hosting (later):** Render Free, Frankfurt region, one web service. There's no database and no email.

## Out of scope for v1

AI extraction, photo-to-3D, real 3D models from shops, textures, walk-through camera, accounts, sync and sharing, floor-plan import, multiple floors, phone editing, currency conversion, sloped ceilings.

## Assumptions to check

- **"Free move" means any position on the item's mount:** the floor, a wall, the ceiling or a surface below it. Items never float in mid-air.
- **"Kitchen fans" means a cooker hood** over the hob. Ceiling fans would be a lamp-like template; add one if you want it.
- **The washing machine and the dryer share one template,** because they are the same shape. The name tells them apart.
