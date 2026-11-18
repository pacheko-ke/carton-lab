"use strict";

/* =====================================================================
   RSC keyline core: pure functions, no DOM.
   Coordinates: origin = top-left of the artwork, x right, y DOWN.
   Panel order left to right: glue flap | L | W | L | W
   ===================================================================== */

/* ---------- Helvetica metrics (ASCII 32..126, per 1000 em) ---------- */
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];

function tw(s, size, bold) {
  let w = 0;
  for (const ch of String(s)) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? HELV[c - 32] : 556;
  }
  return (w / 1000) * size * (bold ? 1.08 : 1);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmt(v, unit) {
  return unit === "mm" ? v.toFixed(1) : v.toFixed(3);
}

function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}-${MONTHS[+m[2] - 1]}-${m[1]}` : "";
}

const r4 = (v) => +v.toFixed(4);

/* ---------- Geometry ----------
   p = { L, W, H, unit, ply, crease, bwadd, glue, slot, date }
   L/W/H are the box size entered (shown as OD in the details frame).
   crease  = creasing allowance. It appears only in the details frame as the creasing dimension
             (W/2 + crease) - H - (W/2 + crease). The artwork itself is not enlarged: flaps are
             W/2 and L, W, H are exactly as entered (glue flap covers the length allowance).
   bwadd   = board width allowance, added to (H + W) to get the board width.
   Board length = full blank length (glue flap + 2 x (L + W) creasing).
*/
function compute(p) {
  const unit = p.unit;
  const n = (v) => (Number.isFinite(v) ? v : 0);
  const L0 = p.L, W0 = p.W, H0 = p.H;
  const c = n(p.crease), bw = n(p.bwadd), G = n(p.glue), s = n(p.slot);

  if (!(L0 > 0 && W0 > 0 && H0 > 0)) return { error: "Enter length, width and height greater than zero." };
  if (G < 0 || s < 0) return { error: "Glue flap and slot width cannot be negative." };

  const L = L0, W = W0, H = H0;
  const F = W0 / 2;
  const creaseFlap = W0 / 2 + c;
  if (!(creaseFlap > 0)) return { error: "Creasing allowance makes the creasing flap zero or negative." };
  if (s >= Math.min(L, W)) return { error: "Slot width must be smaller than the smallest panel." };

  const total = G + 2 * L + 2 * W;
  const Ht = 2 * F + H;
  const x1 = G + L, x2 = x1 + W, x3 = x2 + L;
  const h = s / 2;
  const d = G > 0 ? Math.min(unit === "mm" ? 8 : 8 / 25.4, H / 4) : 0;

  const cut = [
    [G, F],
    [G, 0],
    [x1 - h, 0], [x1 - h, F], [x1 + h, F], [x1 + h, 0],
    [x2 - h, 0], [x2 - h, F], [x2 + h, F], [x2 + h, 0],
    [x3 - h, 0], [x3 - h, F], [x3 + h, F], [x3 + h, 0],
    [total, 0],
    [total, Ht],
    [x3 + h, Ht], [x3 + h, Ht - F], [x3 - h, Ht - F], [x3 - h, Ht],
    [x2 + h, Ht], [x2 + h, Ht - F], [x2 - h, Ht - F], [x2 - h, Ht],
    [x1 + h, Ht], [x1 + h, Ht - F], [x1 - h, Ht - F], [x1 - h, Ht],
    [G, Ht],
    [G, F + H], [0, F + H - d], [0, F + d],
  ];

  const crease = [];
  [G, x1, x2, x3].forEach((x) => crease.push([x, F, x, F + H]));
  [[G, x1 - h], [x1 + h, x2 - h], [x2 + h, x3 - h], [x3 + h, total]].forEach(([xa, xb]) => {
    crease.push([xa, F, xb, F]);
    crease.push([xa, F + H, xb, F + H]);
  });

  return {
    unit, ply: p.ply, date: p.date || "", job: String(p.job || "").trim(),
    L0, W0, H0, c, bw, creaseFlap, L, W, H, G, s, F, total, Ht, x1, x2, x3, cut, crease,
    boardLen: total,
    boardWid: H0 + W0 + bw,
  };
}

/* ---------- Drawing model ----------
   items: {t:'line',layer,x1,y1,x2,y2} | {t:'poly',layer,pts,closed}
          {t:'text',layer,x,y,s,size,anchor,rot,bold}
   layers: CUT, CREASE, DIM, INFO.  rot: 0, 90 (reads upward), -90 (reads downward)
*/
function buildModel(g, opts) {
  const items = [];
  const u = g.unit;
  const f = (v) => fmt(v, u);
  const size = Math.max(g.total, g.Ht);
  const th = size / 70;

  let activeDimGroup = null, nextDimGroup = 0;
  const line = (layer, x1, y1, x2, y2) => items.push({ t: "line", layer, x1, y1, x2, y2,
    ...(layer === "DIM" && activeDimGroup !== null ? { dimGroup: activeDimGroup } : {}) });
  const text = (layer, x, y, s, o = {}) =>
    items.push({ t: "text", layer, x, y, s, size: o.size || th, anchor: o.anchor || "start", rot: o.rot || 0, bold: !!o.bold,
      ...(layer === "DIM" && activeDimGroup !== null ? { dimGroup: activeDimGroup } : {}) });
  const withDimGroup = (fn) => { const prev = activeDimGroup; activeDimGroup = ++nextDimGroup; try { return fn(); } finally { activeDimGroup = prev; } };

  // Brown uses CMYK M20 Y40; white and brown RGB values are for SVG/screen rendering.
  const fill = opts && opts.color === "brown"
    ? { cmyk: [0, 0.2, 0.4, 0], rgb: "#ffcc99" }
    : opts && opts.color === "white" ? { cmyk: [0, 0, 0, 0], rgb: "#ffffff" } : null;
  items.push({ t: "poly", layer: "CUT", pts: g.cut, closed: true, fill });
  g.crease.forEach((c) => line("CREASE", c[0], c[1], c[2], c[3]));

  const g1 = th * 2.4;
  const tk = th * 0.4;
  const wo = th * 0.3;
  const far = g1 + tk * 1.2;

  const prec = opts && Number.isInteger(opts.prec) ? Math.min(Math.max(opts.prec, 0), 3) : 1;
  const fd = (v) => v.toFixed(prec); // precision applies to dimension marking only

  if (opts && opts.dims) {
    const hDim = (y, xa, xb, label, above) => {
      withDimGroup(() => {
        line("DIM", xa, y, xb, y);
        line("DIM", xa, y - tk, xa, y + tk);
        line("DIM", xb, y - tk, xb, y + tk);
        text("DIM", (xa + xb) / 2, above ? y - th * 0.35 : y + th * 1.05, label, { anchor: "middle" });
      });
    };
    const vDim = (x, ya, yb, label, left) => {
      withDimGroup(() => {
        line("DIM", x, ya, x, yb);
        line("DIM", x - tk, ya, x + tk, ya);
        line("DIM", x - tk, yb, x + tk, yb);
        text("DIM", x + (left ? -th * 0.35 : th * 0.35), (ya + yb) / 2, label, { anchor: "middle", rot: left ? 90 : -90 });
      });
    };

    // witness lines
    const xsTop = [0, g.G, g.x1, g.x2, g.x3, g.total];
    xsTop.forEach((x) => line("DIM", x, -wo, x, -far));
    [0, g.total].forEach((x) => line("DIM", x, g.Ht + wo, x, g.Ht + far));
    [0, g.F, g.F + g.H, g.Ht].forEach((y) => line("DIM", -wo, y, -far, y));
    [0, g.Ht].forEach((y) => line("DIM", g.total + wo, y, g.total + far, y));

    // top: panel widths
    if (g.G > 0) hDim(-g1, 0, g.G, fd(g.G), true);
    hDim(-g1, g.G, g.x1, "L " + fd(g.L), true);
    hDim(-g1, g.x1, g.x2, "W " + fd(g.W), true);
    hDim(-g1, g.x2, g.x3, "L " + fd(g.L), true);
    hDim(-g1, g.x3, g.total, "W " + fd(g.W), true);
    // bottom: overall length
    hDim(g.Ht + g1, 0, g.total, fd(g.total), false);
    // left: flap / body / flap
    vDim(-g1, 0, g.F, fd(g.F), true);
    vDim(-g1, g.F, g.F + g.H, "H " + fd(g.H), true);
    vDim(-g1, g.F + g.H, g.Ht, fd(g.F), true);
    // right: overall height
    vDim(g.total + g1, 0, g.Ht, fd(g.Ht), false);

    // panel names inside the artwork
    const cy = g.F + g.H / 2 + th * 0.3;
    text("DIM", (g.G + g.x1) / 2, cy, "L", { anchor: "middle" });
    text("DIM", (g.x1 + g.x2) / 2, cy, "W", { anchor: "middle" });
    text("DIM", (g.x2 + g.x3) / 2, cy, "L", { anchor: "middle" });
    text("DIM", (g.x3 + g.total) / 2, cy, "W", { anchor: "middle" });
    if (g.G > th * 1.2) text("DIM", g.G / 2 + th * 0.36, g.F + g.H / 2, "GLUE", { anchor: "middle", rot: 90 });
  }

  /* ----- details frame ----- */
  const t = (v) => String(+v.toFixed(u === "mm" ? 1 : 3));
  const rows = [
    [["Size (OD):", `${f(g.L0)} x ${f(g.W0)} x ${f(g.H0)} ${u}`], ["Plies:", `${g.ply} ply`]],
    [["Creasing dimension:", `${t(g.creaseFlap)}-${t(g.H)}-${t(g.creaseFlap)} ${u}`], ["Date:", fmtDate(g.date)]],
    [["Board length:", `${f(g.boardLen)} ${u}`], ["Board width:", `${f(g.boardWid)} ${u}`]],
  ];
  const fy = (opts && opts.dims) ? g.Ht + g1 + th * 3 : g.Ht + th * 2.5;
  if (!opts || opts.showDetails !== false) {
    addDetailsFrame(items, {
      th,
      u,
      title: g.job || "RSC BOX KEYLINE",
      rows,
      artW: g.total,
      fy,
      qrCode: opts && opts.profile && opts.profile.qrCode,
    });
  }
  return finalizeModel(items, u, size, th, g.Ht);
}

/* Details frame (title block) shared by every keyline type.
   c = { th, u, title, rows: [[[label,value],[label,value]], ...], artW, fy } */
function addDetailsFrame(items, c) {
  const { th, u, title, rows, artW, artX = 0, fy, qrCode } = c;
  const line = (layer, x1, y1, x2, y2) => items.push({ t: "line", layer, x1, y1, x2, y2 });
  const text = (layer, x, y, s, o = {}) =>
    items.push({ t: "text", layer, x, y, s, size: o.size || th, anchor: o.anchor || "start", rot: o.rot || 0, bold: !!o.bold });
  const rh = th * 2.2, pad = th * 0.8, gap = th * 0.6;
  const labW = [0, 1].map((k) => Math.max(...rows.map((row) => tw(row[k][0], th, true))));
  const valW = [0, 1].map((k) => Math.max(...rows.map((row) => tw(row[k][1], th, true))));
  const need = [0, 1].map((k) => pad + labW[k] + gap + valW[k] + pad);
  const titleNeed = pad + tw(title, th * 1.15, true) + gap * 2 + tw("Units: " + u, th) + pad;
  const rowCount = rows.length;
  const bottom = fy + (rowCount + 1) * rh;
  const tableHeight = bottom - fy;
  const hasQrCode = Array.isArray(qrCode) && qrCode.length > 0;
  const qrSize = hasQrCode ? tableHeight * (qrCode.length + 8) / qrCode.length : 0;
  const qrGap = hasQrCode ? gap : 0;
  const minColW = Math.max(need[0], need[1], titleNeed / 2);
  const colW = Math.max(minColW, hasQrCode ? (artW - qrSize - qrGap) / 2 : artW / 2);
  const frameW = colW * 2;
  const groupW = frameW + qrGap + qrSize;
  const frameX = hasQrCode ? artX + (artW - groupW) / 2 : 0;
  const frameRight = frameX + frameW;
  items.push({ t: "poly", layer: "INFO", closed: true, pts: [[frameX, fy], [frameRight, fy], [frameRight, bottom], [frameX, bottom]] });
  Array.from({ length: rowCount }, (_, i) => i + 1).forEach((i) =>
    line("INFO", frameX, fy + i * rh, frameRight, fy + i * rh),
  );
  line("INFO", frameX + colW, fy + rh, frameX + colW, bottom);

  text("INFO", frameX + pad, fy + rh * 0.68, title, { bold: true, size: th * 1.15 });
  text("INFO", frameRight - pad, fy + rh * 0.68, "Units: " + u, { anchor: "end" });
  rows.forEach((row, i) => {
    const by = fy + (i + 1) * rh + rh * 0.68;
    row.forEach((cell, k) => {
      const x0 = frameX + k * colW + pad;
      text("INFO", x0, by, cell[0], { bold: true });
      text("INFO", x0 + labW[k] + gap, by, cell[1], { bold: true });
    });
  });
  if (hasQrCode) {
    items.push({
      t: "qr",
      layer: "INFO",
      x: frameRight + gap,
      y: fy - (qrSize - tableHeight) / 2,
      size: qrSize,
      matrix: qrCode,
    });
  }
}

/* Cubic Bezier flattening. Path segments: ["M",x,y] ["L",x,y] ["C",x1,y1,x2,y2,x,y] ["Z"].
   Returns sub-paths: [{ pts: [[x,y],...], closed }] */
const BEZ_STEPS = 12;
function flattenSegs(segs) {
  const subs = [];
  let cur = null, cx = 0, cy = 0, sx = 0, sy = 0;
  segs.forEach((s) => {
    if (s[0] === "M") { cur = { pts: [[s[1], s[2]]], closed: false }; subs.push(cur); cx = sx = s[1]; cy = sy = s[2]; }
    else if (s[0] === "L") { cur.pts.push([s[1], s[2]]); cx = s[1]; cy = s[2]; }
    else if (s[0] === "C") {
      for (let i = 1; i <= BEZ_STEPS; i++) {
        const t = i / BEZ_STEPS, u = 1 - t;
        cur.pts.push([
          u * u * u * cx + 3 * u * u * t * s[1] + 3 * u * t * t * s[3] + t * t * t * s[5],
          u * u * u * cy + 3 * u * u * t * s[2] + 3 * u * t * t * s[4] + t * t * t * s[6],
        ]);
      }
      cx = s[5]; cy = s[6];
    } else if (s[0] === "Z") { cur.closed = true; cx = sx; cy = sy; }
  });
  return subs;
}

/* Bounding box of everything, with a margin, plus the model fields the renderers need. */
function finalizeModel(items, unit, size, th, artH) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  items.forEach((it) => {
    if (it.t === "line") { add(it.x1, it.y1); add(it.x2, it.y2); }
    else if (it.t === "poly") it.pts.forEach((p) => add(p[0], p[1]));
    else if (it.t === "path") flattenSegs(it.segs).forEach((sp) => sp.pts.forEach((p) => add(p[0], p[1])));
    else if (it.t === "qr") { add(it.x, it.y); add(it.x + it.size, it.y + it.size); }
    else {
      const w = tw(it.s, it.size, it.bold);
      const sh = it.anchor === "middle" ? w / 2 : it.anchor === "end" ? w : 0;
      if (it.rot === 0) {
        add(it.x - sh, it.y - it.size * 0.8);
        add(it.x - sh + w, it.y + it.size * 0.25);
      } else if (it.rot === 90) {
        add(it.x - it.size * 0.8, it.y + sh - w);
        add(it.x + it.size * 0.25, it.y + sh);
      } else {
        add(it.x - it.size * 0.25, it.y - sh);
        add(it.x + it.size * 0.8, it.y - sh + w);
      }
    }
  });
  const m = th * 1.5;
  return { items, unit, size, th, artH, box: { minX: x0 - m, minY: y0 - m, maxX: x1 + m, maxY: y1 + m } };
}

/* ---------- SVG ---------- */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function qrPath(item) {
  const count = item.matrix.length;
  const moduleSize = item.size / (count + 8);
  const d = [];
  item.matrix.forEach((row, rowIndex) => {
    row.forEach((dark, columnIndex) => {
      if (!dark) return;
      const x = item.x + (columnIndex + 4) * moduleSize;
      const y = item.y + (rowIndex + 4) * moduleSize;
      d.push(`M${r4(x)} ${r4(y)}h${r4(moduleSize)}v${r4(moduleSize)}h${r4(-moduleSize)}Z`);
    });
  });
  return d.join("");
}

function toSVG(m, mode) {
  const exp = mode === "export";
  const u = m.unit;
  const b = m.box, w = b.maxX - b.minX, h = b.maxY - b.minY;
  const sw = exp ? (u === "mm" ? 0.4 : 0.016) : m.size / 500;
  const swCrease = exp ? (u === "mm" ? 0.5 : 0.02) : sw;
  const swT = exp ? (u === "mm" ? 0.25 : 0.01) : m.size / 1000;
  const dash = exp ? (u === "mm" ? "3 1.5" : "0.12 0.06") : `${r4(sw * 6)} ${r4(sw * 4)}`;
  const style = {
    FILL: `fill="none" stroke="none"`,
    CUT: `fill="none" stroke="#000" stroke-width="${r4(sw)}" stroke-linejoin="round" stroke-linecap="round"`,
    CREASE: `fill="none" stroke="#d13438" stroke-width="${r4(swCrease)}" stroke-dasharray="${dash}"`,
    DIM: `fill="none" stroke="#555" stroke-width="${r4(swT)}"`,
    INFO: `fill="none" stroke="#000" stroke-width="${r4(swT)}"`,
  };
  const textFill = { CUT: "#000", CREASE: "#000", DIM: "#333", INFO: "#000" };

  const groups = ["FILL", "CUT", "CREASE", "DIM", "INFO"].map((layer) => {
    const body = m.items.map((i, index) => ({ i, index })).filter(({ i }) => i.layer === layer).map(({ i, index }) => {
      const edit = !exp && i.layer === "DIM" ? ` data-item-index="${index}"` : "";
      if (i.t === "qr") return `<path${edit} d="${qrPath(i)}" fill="#000" stroke="none"/>`;
      if (i.t === "line") return `<line${edit} x1="${r4(i.x1)}" y1="${r4(i.y1)}" x2="${r4(i.x2)}" y2="${r4(i.y2)}"/>`;
      if (i.t === "path") {
        const d = i.segs.map((sg) => sg[0] + sg.slice(1).map(r4).join(" ")).join(" ");
        return `<path${edit} d="${d}"${i.fill ? ` fill="${i.fill.rgb}" fill-rule="evenodd"` : ""}/>`;
      }
      if (i.t === "poly") return `<path${edit} d="M${i.pts.map((p) => r4(p[0]) + "," + r4(p[1])).join(" L")}${i.closed ? " Z" : ""}"${i.fill ? ` fill="${i.fill.rgb}"` : ""}/>`;
      const tr = i.rot ? ` transform="rotate(${-i.rot} ${r4(i.x)} ${r4(i.y)})"` : "";
      const bold = i.bold || (exp && layer === "INFO");
      return `<text${edit} x="${r4(i.x)}" y="${r4(i.y)}" font-size="${r4(i.size)}" text-anchor="${i.anchor}"${bold ? ' font-weight="bold"' : ""} fill="${textFill[layer]}" stroke="none"${tr}>${esc(i.s)}</text>`;
    }).join("");
    return `<g id="${layer}" ${style[layer]}>${body}</g>`;
  }).join("\n");

  const sizeAttrs = exp ? ` width="${r4(w)}${u}" height="${r4(h)}${u}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg"${sizeAttrs} viewBox="${r4(b.minX)} ${r4(b.minY)} ${r4(w)} ${r4(h)}" font-family="Helvetica, Arial, sans-serif">\n${groups}\n</svg>`;
}

/* ---------- Animated preview (screen only; PDF / SVG / DXF exports are not affected) ----------
   The same drawing, but every line is a <path> so it can be "drawn on" with a stroke animation:
   1. cut outline draws on, then the carton colour fades in
   2. crease lines draw on one after another (dashes revealed through a mask)
   3. dimension lines draw on, their numbers fade in
   4. the details frame rises into place
   The CSS for the classes below (kl-draw, kl-fade, kl-rise) lives in app.css. Every element's normal
   style is its finished look, so with reduced motion switched on the drawing simply appears. */
function toAnimatedSVG(m) {
  const b = m.box, w = b.maxX - b.minX, h = b.maxY - b.minY;
  const sw = m.size / 500, swT = m.size / 1000;
  const dash = `${r4(sw * 6)} ${r4(sw * 4)}`;
  const sec = (v) => `${v.toFixed(2)}s`;
  const seg2 = (x1, y1, x2, y2) => `M${r4(x1)} ${r4(y1)}L${r4(x2)} ${r4(y2)}`;
  const T = { cut: 0, holes: 0.6, fill: 0.95, crease: 1.2, dim: 1.7, text: 2.15, frame: 2.45 };
  const textFill = { DIM: "#333", INFO: "#000" };
  const textEl = (i, extra) => {
    const tr = i.rot ? ` transform="rotate(${-i.rot} ${r4(i.x)} ${r4(i.y)})"` : "";
    return `<text x="${r4(i.x)}" y="${r4(i.y)}" font-size="${r4(i.size)}" text-anchor="${i.anchor}"${i.bold ? ' font-weight="bold"' : ""} fill="${textFill[i.layer]}" stroke="none"${tr}${extra || ""}>${esc(i.s)}</text>`;
  };
  const dOf = (i) => i.t === "path"
    ? i.segs.map((sg) => sg[0] + sg.slice(1).map(r4).join(" ")).join(" ")
    : `M${i.pts.map((p) => r4(p[0]) + "," + r4(p[1])).join(" L")}${i.closed ? " Z" : ""}`;

  const masks = [], fills = [], cuts = [], creases = [], dimLines = [], dimTexts = [], frame = [];
  let nCut = 0, nCr = 0, nDim = 0, nTxt = 0;

  m.items.forEach((i, itemIndex) => {
    if (i.layer === "FILL" && i.t === "path") {
      if (i.fill) fills.push(`<path d="${dOf(i)}" fill="${i.fill.rgb}" fill-rule="evenodd" stroke="none" class="kl-fade" style="--delay:${sec(T.fill)}"/>`);
    } else if (i.layer === "CUT" && (i.t === "path" || i.t === "poly")) {
      const d = dOf(i);
      // one <path> per shape: the first (the outline) draws first, then each hole/cut-out in turn
      const parts = [];
      if (i.t === "path") i.segs.forEach((sg) => { if (sg[0] === "M") parts.push([]); parts[parts.length - 1].push(sg); });
      const ds = i.t === "path" ? parts.map((g) => g.map((sg) => sg[0] + sg.slice(1).map(r4).join(" ")).join(" ")) : [d];
      if (i.fill) fills.push(`<path d="${d}" fill="${i.fill.rgb}" fill-rule="evenodd" stroke="none" class="kl-fade" style="--delay:${sec(T.fill)}"/>`);
      ds.forEach((dd, k) => {
        const delay = k === 0 ? T.cut + nCut * 0.15 : T.holes + Math.min((k - 1) * 0.06, 0.4);
        cuts.push(`<path d="${dd}" pathLength="1" fill="none" stroke="#000" stroke-width="${r4(sw)}" stroke-linejoin="round" class="kl-draw kl-cut" style="--delay:${sec(delay)};--dur:${k === 0 ? "1.1s" : ".45s"}"/>`);
      });
      nCut++;
    } else if (i.layer === "CREASE" && i.t === "line") {
      const id = `klm${nCr}`;
      const d = seg2(i.x1, i.y1, i.x2, i.y2);
      const delay = sec(T.crease + Math.min(nCr * 0.12, 0.6));
      masks.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="${r4(b.minX)}" y="${r4(b.minY)}" width="${r4(w)}" height="${r4(h)}"><path d="${d}" pathLength="1" fill="none" stroke="#fff" stroke-width="${r4(sw * 4)}" class="kl-draw" style="--delay:${delay};--dur:.7s"/></mask>`);
      creases.push(`<path d="${d}" fill="none" stroke="#d13438" stroke-width="${r4(sw)}" stroke-dasharray="${dash}" mask="url(#${id})"/>`);
      nCr++;
    } else if (i.layer === "DIM" && i.t === "line") {
      dimLines.push(`<path data-item-index="${itemIndex}" d="${seg2(i.x1, i.y1, i.x2, i.y2)}" pathLength="1" fill="none" stroke="#555" stroke-width="${r4(swT)}" class="kl-draw" style="--delay:${sec(T.dim + Math.min(nDim * 0.025, 0.4))};--dur:.6s"/>`);
      nDim++;
    } else if (i.layer === "DIM" && i.t === "text") {
      dimTexts.push(textEl(i, ` data-item-index="${itemIndex}" class="kl-fade" style="--delay:${sec(T.text + Math.min(nTxt * 0.03, 0.4))}"`));
      nTxt++;
    } else if (i.layer === "INFO") {
      if (i.t === "text") frame.push(textEl(i));
      else if (i.t === "line") frame.push(`<path d="${seg2(i.x1, i.y1, i.x2, i.y2)}"/>`);
      else if (i.t === "qr") frame.push(`<path d="${qrPath(i)}" fill="#000" stroke="none"/>`);
      else frame.push(`<path d="${dOf(i)}"/>`);
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r4(b.minX)} ${r4(b.minY)} ${r4(w)} ${r4(h)}" font-family="Helvetica, Arial, sans-serif" class="kl-anim">
<defs>${masks.join("")}</defs>
${fills.join("")}${cuts.join("")}
<g id="CREASE">${creases.join("")}</g>
<g id="DIM">${dimLines.join("")}${dimTexts.join("")}</g>
<g id="INFO" class="kl-rise" style="--delay:${sec(T.frame)};--rise:${r4(m.th * 0.8)}px" fill="none" stroke="#000" stroke-width="${r4(swT)}">${frame.join("")}</g>
</svg>`;
}

/* ---------- DXF (R12 style; y-up with the artwork's bottom-left at 0,0) ---------- */
function toDXF(m) {
  const out = [];
  const add = (...a) => a.forEach((v) => out.push(String(v)));
  const r5 = (v) => +v.toFixed(5);
  const Y = (y) => r5(m.artH - y);
  const color = { CUT: 7, CREASE: 1, DIM: 3, INFO: 5 };

  add(0, "SECTION", 2, "HEADER", 9, "$INSUNITS", 70, m.unit === "mm" ? 4 : 1, 0, "ENDSEC");
  add(0, "SECTION", 2, "TABLES");
  add(0, "TABLE", 2, "LTYPE", 70, 1, 0, "LTYPE", 2, "CONTINUOUS", 70, 0, 3, "Solid line", 72, 65, 73, 0, 40, 0.0, 0, "ENDTAB");
  add(0, "TABLE", 2, "LAYER", 70, 4);
  Object.keys(color).forEach((l) => add(0, "LAYER", 2, l, 70, 0, 62, color[l], 6, "CONTINUOUS"));
  add(0, "ENDTAB", 0, "ENDSEC");

  add(0, "SECTION", 2, "ENTITIES");
  const seg = (layer, x1, y1, x2, y2) => {
    if (x1 === x2 && y1 === y2) return;
    add(0, "LINE", 8, layer, 10, r5(x1), 20, Y(y1), 30, 0, 11, r5(x2), 21, Y(y2), 31, 0);
  };
  m.items.forEach((i) => {
    if (i.layer === "FILL") return; // DXF carries cut/crease geometry, not carton fill.
    if (i.t === "line") seg(i.layer, i.x1, i.y1, i.x2, i.y2);
    else if (i.t === "qr") {
      const moduleSize = i.size / (i.matrix.length + 8);
      i.matrix.forEach((row, rowIndex) => {
        row.forEach((dark, columnIndex) => {
          if (!dark) return;
          const x1 = r5(i.x + (columnIndex + 4) * moduleSize);
          const x2 = r5(x1 + moduleSize);
          const top = i.y + (rowIndex + 4) * moduleSize;
          const y1 = Y(top + moduleSize);
          const y2 = Y(top);
          add(0, "SOLID", 8, i.layer, 62, 7, 10, x1, 20, y1, 30, 0, 11, x2, 21, y1, 31, 0, 12, x1, 22, y2, 32, 0, 13, x2, 23, y2, 33, 0);
        });
      });
    }
    else if (i.t === "path") {
      flattenSegs(i.segs).forEach((sp) => {
        const n = sp.pts.length;
        for (let k = 0; k < (sp.closed ? n : n - 1); k++) {
          const a = sp.pts[k], b = sp.pts[(k + 1) % n];
          seg(i.layer, a[0], a[1], b[0], b[1]);
        }
      });
    } else if (i.t === "poly") {
      const n = i.pts.length;
      for (let k = 0; k < (i.closed ? n : n - 1); k++) {
        const a = i.pts[k], b = i.pts[(k + 1) % n];
        seg(i.layer, a[0], a[1], b[0], b[1]);
      }
    } else {
      const just = i.anchor === "middle" ? 1 : i.anchor === "end" ? 2 : 0;
      add(0, "TEXT", 8, i.layer, 10, r5(i.x), 20, Y(i.y), 30, 0, 40, r5(i.size), 1, String(i.s).replace(/[^\x20-\x7e]/g, "?"), 50, i.rot);
      if (just) add(72, just, 11, r5(i.x), 21, Y(i.y), 31, 0);
    }
  });
  add(0, "ENDSEC", 0, "EOF");
  return out.join("\n");
}

/* ---------- PDF (hand-written, 1:1 scale, vector) ---------- */
function renderPDFPage(m) {
  const mm = m.unit === "mm";
  const k = mm ? 72 / 25.4 : 72;
  const b = m.box;
  const pw = (b.maxX - b.minX) * k, ph = (b.maxY - b.minY) * k;
  const header = "CartonLab Lightweight 2.0";
  const dimensionText = m.items.find((item) => item.layer === "DIM" && item.t === "text");
  const headerFontSize = (dimensionText ? dimensionText.size : m.th) * k;
  const headerMargin = 3 * 72 / 25.4;
  const headerHeight = Math.max(12 * 72 / 25.4, headerFontSize + headerMargin * 2);
  const n = (v) => (+v.toFixed(3)).toString();
  const X = (x) => (x - b.minX) * k;
  const Y = (y) => (b.maxY - y) * k;
  const sw = (mm ? 0.4 : 0.016) * k, swCrease = (mm ? 0.5 : 0.02) * k;
  const swT = (mm ? 0.25 : 0.01) * k;
  const dash = (mm ? [3, 1.5] : [0.12, 0.06]).map((v) => n(v * k)).join(" ");
  const style = {
    FILL: { rgb: "0 0 0", w: 0, d: "[] 0 d", txt: "0 0 0" },
    CUT: { rgb: "0 0 0", w: sw, d: "[] 0 d", txt: "0 0 0" },
    CREASE: { rgb: "0.82 0.2 0.22", w: swCrease, d: `[${dash}] 0 d`, txt: "0 0 0" },
    DIM: { rgb: "0.33 0.33 0.33", w: swT, d: "[] 0 d", txt: "0.2 0.2 0.2" },
    INFO: { rgb: "0 0 0", w: swT, d: "[] 0 d", txt: "0 0 0" },
  };
  const pdfStr = (s) => String(s).replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1");

  const ops = [];
  ["FILL", "CUT", "CREASE", "DIM", "INFO"].forEach((layer) => {
    const st = style[layer];
    const its = m.items.filter((i) => i.layer === layer);
    ops.push(`${st.rgb} RG ${n(st.w)} w ${st.d}`);
    its.forEach((i) => {
      if (i.t === "line") ops.push(`${n(X(i.x1))} ${n(Y(i.y1))} m ${n(X(i.x2))} ${n(Y(i.y2))} l S`);
      else if (i.t === "qr") {
        const moduleSize = i.size / (i.matrix.length + 8);
        const rects = [];
        i.matrix.forEach((row, rowIndex) => {
          row.forEach((dark, columnIndex) => {
            if (!dark) return;
            const x1 = X(i.x + (columnIndex + 4) * moduleSize);
            const x2 = X(i.x + (columnIndex + 5) * moduleSize);
            const y1 = Y(i.y + (rowIndex + 4) * moduleSize);
            const y2 = Y(i.y + (rowIndex + 5) * moduleSize);
            rects.push(`${n(x1)} ${n(y1)} m ${n(x2)} ${n(y1)} l ${n(x2)} ${n(y2)} l ${n(x1)} ${n(y2)} l h`);
          });
        });
        ops.push(`0 0 0 rg ${rects.join(" ")} f`);
      }
      else if (i.t === "path") {
        const P = (x, y) => `${n(X(x))} ${n(Y(y))}`;
        const body = i.segs.map((sg) => {
          if (sg[0] === "M") return `${P(sg[1], sg[2])} m`;
          if (sg[0] === "L") return `${P(sg[1], sg[2])} l`;
          if (sg[0] === "C") return `${P(sg[1], sg[2])} ${P(sg[3], sg[4])} ${P(sg[5], sg[6])} c`;
          return "h";
        }).join(" ");
        if (i.fill) ops.push(`${i.fill.cmyk.join(" ")} k`);
        ops.push(`${body} ${i.layer === "FILL" ? "f*" : i.fill ? "B*" : "S"}`);
      } else if (i.t === "poly") {
        const path = i.pts.map((p, idx) => `${n(X(p[0]))} ${n(Y(p[1]))} ${idx ? "l" : "m"}`).join(" ");
        if (i.fill) ops.push(`${i.fill.cmyk.join(" ")} k`);
        ops.push(`${path} ${i.closed ? "h " : ""}${i.fill ? "B" : "S"}`);
      }
    });
    its.filter((i) => i.t === "text").forEach((i) => {
      const w = tw(i.s, i.size, i.bold);
      const sh = i.anchor === "middle" ? -w / 2 : i.anchor === "end" ? -w : 0;
      const th = (i.rot * Math.PI) / 180;
      const c = Math.round(Math.cos(th)), s = Math.round(Math.sin(th));
      const tx = X(i.x) + c * sh * k, ty = Y(i.y) + s * sh * k;
      const bold = i.bold || i.layer === "INFO";
      ops.push(`BT ${st.txt} rg ${bold ? "/F2" : "/F1"} ${n(i.size * k)} Tf ${c} ${s} ${-s} ${c} ${n(tx)} ${n(ty)} Tm (${pdfStr(i.s)}) Tj ET`);
    });
  });
  const headerWidth = tw(header, 1) * headerFontSize;
  const infoFrame = m.items.find((item) => item.layer === "INFO" && item.t === "poly" && item.closed);
  const tableRight = infoFrame ? Math.max(...infoFrame.pts.map(([x]) => x)) : b.maxX;
  const detailsRight = m.items
    .filter((item) => item.layer === "INFO" && item.t === "qr")
    .reduce((right, item) => Math.max(right, item.x + item.size), tableRight);
  const headerRight = X(detailsRight);
  ops.push(`BT 0 0 0 rg /F1 ${n(headerFontSize)} Tf 1 0 0 1 ${n(headerRight - headerWidth)} ${n(ph + headerMargin)} Tm (${pdfStr(header)}) Tj ET`);
  const content = ops.join("\n");

  return { content, pageWidth: pw, pageHeight: ph + headerHeight };
}

function toPDF(input) {
  const models = Array.isArray(input) ? input : [input];
  if (!models.length || models.some((model) => !model || !model.box || !Array.isArray(model.items))) {
    throw new Error("Cannot create a PDF without drawing models.");
  }
  const pdfPages = models.map(renderPDFPage);
  const firstFontObject = 3 + pdfPages.length * 2;
  const pageRefs = pdfPages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
  const objs = [
    null,
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageRefs}] /Count ${pdfPages.length} >>`,
  ];
  pdfPages.forEach((page, index) => {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${(+page.pageWidth.toFixed(3)).toString()} ${(+page.pageHeight.toFixed(3)).toString()}] /Contents ${contentObject} 0 R /Resources << /Font << /F1 ${firstFontObject} 0 R /F2 ${firstFontObject + 1} 0 R >> >> >>`,
      `<< /Length ${page.content.length} >>\nstream\n${page.content}\nendstream`,
    );
  });
  objs.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  let pdf = "%PDF-1.4\n";
  const offs = [];
  for (let i = 1; i < objs.length; i++) {
    offs[i] = pdf.length;
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) pdf += `${String(offs[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

if (typeof module !== "undefined") {
  module.exports = { compute, buildModel, addDetailsFrame, finalizeModel, flattenSegs, toSVG, toAnimatedSVG, toDXF, toPDF, fmt, fmtDate, tw };
}
