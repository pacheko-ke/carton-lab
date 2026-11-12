# Adding a keyline

The extension reads keyline JSON files from the repository's `keylines` folder.
The website keeps definitions in `src/lib/keyline-definitions` and serves them
through its authenticated keyline API. Do not put website keyline definitions in
`public`: Premium geometry must remain server-side. The app draws each keyline with the same preview,
PDF / SVG / DXF export, carton colour, dimension marking and details table as the RSC.

## Add a new keyline (3 steps)

1. Copy `flower.json` to a new file, for example `tray.json`. Change `id` and `name`.
2. Replace `params`, `cuts`, `creases` and `details` with your design.
3. Add the file name to the extension's `keylines/index.json`.
4. To add it to the website, also place the definition in
   `src/lib/keyline-definitions` and register it in `src/lib/keyline-catalog.ts`.
   Keep the server-side category and free-plan rules in sync.

Reload the extension. The new keyline appears in the **Box type** list.

Reload the extension. The new keyline appears in the **Box type** list. No code changes.

## File format

| Field | Meaning |
|---|---|
| `id` | Unique short name (letters, digits, dash). `rsc` is reserved. |
| `name` | Shown in the Box type list. |
| `title` | Details table title when the job name is blank (optional). |
| `inputs` | Optional fields the user fills in for this keyline, such as a notch size (see below). |
| `params` | Named variables, calculated in order. May use `L`, `W`, `H`, your inputs and earlier params. |
| `require` | Optional checks: `{ "expr": "L > slot", "message": "..." }`. A false check shows the message instead of a drawing. |
| `cuts` | The solid cut lines: paths, rectangles, circles, ellipses. Shapes inside the outline become holes. |
| `creases` | The dashed fold lines. |
| `dimensionGroup` | Optional property on cut and crease entries. Entries with the same group get a separate dimension set. |
| `dimensions` | Optional extra dimension lines: `{ "value": "H", "x1": 0, "y1": 0, "x2": 0, "y2": "H" }`. |
| `renderDimensions` | Set to `true` to draw the definition's `dimensions` in addition to automatic crease dimensions. |
| `autoDimensionValues` | Optional label overrides for automatic dimensions: `x` and `y` segment arrays plus `overallX` and `overallY`; grouped definitions may override these under `groups`. |
| `map` | Optional. Stretches a drawing made in other coordinates (see "Method B"). |
| `details` | Fills the details table. |

Any number can be a plain number or an expression string such as `"H + W/2"`.

## Expressions

Names: `L`, `W`, `H`, `pi`, your `inputs` and your own `params`.
Operators: `+ - * / % ^` and brackets. Comparisons (`> < >= <= == !=`) give 1 or 0.
Functions: `min max abs round floor ceil sqrt sin cos tan atan2 hypot pow`.

## cuts

    { "d": "M0 0 L{L} 0 L{L} {W} L0 {W} Z" }                         a path; {expression} is filled in
    { "type": "rect",    "x": "10", "y": "H", "width": "100", "height": "50", "rx": "20" }
    { "type": "circle",  "cx": "L/2", "cy": "H/2", "r": "25" }
    { "type": "ellipse", "cx": "50", "cy": "50", "rx": "30", "ry": "15" }

Paths accept `M L H V C S Q T A Z` (upper or lower case). Arcs are converted to curves,
and compact numbers such as `M10-5.5.5` are fine. You can paste attributes straight from an SVG file.

## inputs (extra fields for one keyline)

    "inputs": [
      { "id": "notch", "label": "Notch size", "default": 50, "min": 0, "max": 200 }
    ]

Each entry becomes a number field in the **Keyline** card whenever this keyline is selected.
`id` is the variable name to use in expressions (`notch / 2`), `label` is the text shown,
`default` is the starting value, and `min` / `max` are optional limits (`min` defaults to 0).
The JSON default is applied whenever the extension opens or that keyline is selected; while it is open,
the value converts when the unit changes. If the definition includes numeric `refL`, `refW` and `refH`
params, those also set the starting Length, Width and Height for that keyline.
Use `require` to refuse values that would give a broken drawing.

## Units

Write every number in **millimetres**. The app calculates in mm and draws the finished keyline in
whichever unit is selected, so a definition works in mm and inches without changes. (Inputs show the
default converted to inches, e.g. 50 mm appears as 1.969.) Set `"units": "any"` on a definition to
turn the conversion off and use numbers exactly as typed.

## creases

    { "x1": "0", "y1": "H", "x2": "bl", "y2": "H" }
    { "d": "M0 {H} L{bl} {H}" }                                       same thing, as path data

## details

    "details": {
      "creasing": ["H", "W", "H"],     // printed as H-W-H, e.g. 200-310-200
      "boardLength": "bl",             // optional, defaults to the drawing width
      "boardWidth": "bw"               // optional, defaults to the drawing height
    }

## Dimension marking

Made automatically from your `creases`: the spacing between fold lines plus the overall
width and height. Set `renderDimensions` to `true` to add explicit dimensions from the
definition. Each entry supplies `x1`, `y1`, `x2`, `y2` and a numeric `value` expression; the
dimension line is drawn between the mapped endpoints and labeled with `value`.
`autoDimensionValues` changes only automatic dimension labels, not their measured line
positions.

For multi-piece artwork, give every cut and crease a `dimensionGroup`, reusing the same
group name for entries belonging to one piece. Each group is dimensioned using only its
own cut bounds and crease positions, so separate pieces on one artboard do not share
overall or fold dimensions.
Grouped label overrides can be keyed by group name under `autoDimensionValues.groups`.

## Two ways to keep a drawing flexible

**A. Write everything with variables (what `flower.json` does).**
Work out the key sizes in `params`, then write each cut and crease with them.
Features that should keep a fixed size (like a 50 mm slot) use a constant. Features that
should grow with the box are multiplied by a ratio. `flower.json` uses `refL`, `refW`, `refH`
(the size the drawing was made at) so `50*kW` reads as "50 at the reference width, growing with W".

**B. Draw it once, then map it (see `examples/flower-sketch.json`).**
Keep ordinary SVG coordinates and add `map` anchors `[design position, real position]` for each axis:

    "map": { "y": [[65, "0"], [115, "H"], [170, "H + W"], [220, "W + 2*H"]] }

Everything between two anchors is stretched. Rectangles and circles keep their own size and
only their position follows the map (add `"stretch": true` to stretch them too).
In expressions, `mx(v)` and `my(v)` give the mapped position of a design coordinate.
Add `"space": "real"` to any cut or crease to skip the map.

## flower.json (flower dieline 001)

Drawn at L 1040, W 310, H 200 (mm) and reproduces that drawing exactly at that size.
Notch size is an input (default 10). End panels are H + notch/2, flaps are H, and the side holes and strap
holes scale with the panel they sit in. Board length is the drawn width: L + 2H + notch size. Board width is W + 2H.

## Animation

The preview draws itself when the page opens and when the box type changes: outline first, then each hole,
the carton colour, the fold lines, the dimension marking and finally the details table. The size fields
(length, width, height, glue flap, slot width and any keyline input such as the notch) redraw it after a
brief pause while typing; other fields update instantly. It is automatic for every keyline, and it is off for
people who have "reduce motion" switched on. Downloads are never animated.

## Preview controls (zoom and move)

The preview is a window onto the drawing and stays sharp at any zoom. Line widths stay constant on screen.

| Action | How |
|---|---|
| Zoom | Scroll wheel (zooms at the pointer), trackpad pinch, two-finger pinch on touch, `+` / `-` keys, or the toolbar buttons |
| Move | Drag, two-finger drag on touch, or the arrow keys |
| Fit to window | Double-click, the Fit button, or the `0` key |
| Real size (1:1) | The `1:1` button or the `1` key. 100% is the real size on screen (96 pixels per inch) |

Your zoom and position are kept while you edit numbers. Fit, choosing another box type or changing the unit
fits the drawing again. Downloads always contain the whole drawing, whatever you are looking at.

Use **Print** to print the complete dieline and artwork. **Share** opens the device's share sheet to send a PDF
attachment with the job and box dimensions. If the browser does not support file sharing, the PDF downloads
separately so you can attach it in the app you choose.

## Direct geometry editing

The preview grid and grid snapping are on by default, with a 10 mm step (0.394 in). Change the grid step beside
the preview, or switch Grid and Snap off independently. Click a cut outline or crease to show its editable nodes,
then drag a node to reshape the geometry. Drag a dimension line or label to reposition that whole marking.
Undo and Redo buttons, Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z) track completed drags. SVG, PDF and DXF exports
include the edited geometry and moved dimension marks.

## If something is wrong

The page shows the error in red, naming the bad expression, unknown name or bad path data.
A file that fails to load is skipped and listed in the browser console (F12); the others keep working.
