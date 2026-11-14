"use strict";

/* =====================================================================
   Keyline engine: turns a JSON keyline definition + (L, W, H) into the
   same drawing model the RSC uses, so preview, PDF, SVG, DXF, carton
   colour, dimension marking and the details frame all work for any keyline.

   Nothing here uses eval / new Function (not allowed in extension pages):
   expressions are parsed by a small built-in parser.

   Definition format: see keylines/README.md
   ===================================================================== */

const KC = typeof module !== "undefined"
  ? require("./core.js")
  : { addDetailsFrame, finalizeModel, flattenSegs, fmt, fmtDate, profileRows, tw };

/* ---------- Expressions: numbers, + - * / % ^, ( ), names, functions ---------- */
const EXPR_FUNCS = {
  min: Math.min, max: Math.max, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, atan2: Math.atan2, hypot: Math.hypot, pow: Math.pow,
};

function evalExpr(src, env) {
  const s = String(src);
  let i = 0;
  const fail = (msg) => { throw new Error(`Bad expression "${s}": ${msg}`); };
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };

  function parseCmp() {
    const v = parseExpr();
    ws();
    const two = s.slice(i, i + 2);
    if (two === ">=" || two === "<=" || two === "==" || two === "!=") {
      i += 2;
      const r = parseExpr();
      return (two === ">=" ? v >= r : two === "<=" ? v <= r : two === "==" ? v === r : v !== r) ? 1 : 0;
    }
    if (s[i] === ">" || s[i] === "<") {
      const op = s[i++];
      const r = parseExpr();
      return (op === ">" ? v > r : v < r) ? 1 : 0;
    }
    return v;
  }
  function parseExpr() {
    let v = parseTerm();
    for (;;) {
      ws();
      if (s[i] === "+") { i++; v += parseTerm(); }
      else if (s[i] === "-") { i++; v -= parseTerm(); }
      else return v;
    }
  }
  function parseTerm() {
    let v = parseUnary();
    for (;;) {
      ws();
      if (s[i] === "*") { i++; v *= parseUnary(); }
      else if (s[i] === "/") { i++; const d = parseUnary(); if (d === 0) fail("division by zero"); v /= d; }
      else if (s[i] === "%") { i++; const d = parseUnary(); if (d === 0) fail("division by zero"); v %= d; }
      else return v;
    }
  }
  function parseUnary() {
    ws();
    if (s[i] === "-") { i++; return -parseUnary(); }
    if (s[i] === "+") { i++; return parseUnary(); }
    return parsePow();
  }
  function parsePow() {
    const b = parsePrimary();
    ws();
    if (s[i] === "^") { i++; return Math.pow(b, parseUnary()); }
    return b;
  }
  function parsePrimary() {
    ws();
    if (s[i] === "(") {
      i++;
      const v = parseExpr();
      ws();
      if (s[i] !== ")") fail("missing )");
      i++;
      return v;
    }
    const num = /(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
    num.lastIndex = i;
    let m = num.exec(s);
    if (m) { i = num.lastIndex; return parseFloat(m[0]); }
    const id = /[A-Za-z_][A-Za-z0-9_]*/y;
    id.lastIndex = i;
    m = id.exec(s);
    if (!m) fail(i >= s.length ? "unexpected end" : `unexpected "${s[i]}"`);
    i = id.lastIndex;
    const name = m[0];
    ws();
    if (s[i] === "(") {
      i++;
      const args = [];
      ws();
      if (s[i] === ")") i++;
      else {
        for (;;) {
          args.push(parseExpr());
          ws();
          if (s[i] === ",") { i++; continue; }
          if (s[i] === ")") { i++; break; }
          fail("missing )");
        }
      }
      const fn = env && typeof env[name] === "function" ? env[name]
        : Object.prototype.hasOwnProperty.call(EXPR_FUNCS, name) ? EXPR_FUNCS[name] : null;
      if (!fn) fail(`unknown function "${name}"`);
      return fn(...args);
    }
    if (!env || !Object.prototype.hasOwnProperty.call(env, name)) fail(`unknown name "${name}"`);
    if (typeof env[name] !== "number") fail(`"${name}" is a function, use ${name}(...)`);
    return env[name];
  }

  const v = parseCmp();
  ws();
  if (i < s.length) fail(`unexpected "${s[i]}"`);
  if (!Number.isFinite(v)) fail("result is not a finite number");
  return v;
}

const ev = (v, env) => (typeof v === "number" ? v : evalExpr(v, env));

/* Replace every {expression} inside a path string with its value. */
function fillTemplate(str, env) {
  return String(str).replace(/\{([^{}]+)\}/g, (_, e) => String(+evalExpr(e, env).toFixed(5)));
}

/* ---------- SVG path data -> absolute segments (M, L, C, Z only) ---------- */
function parsePathD(d) {
  const s = String(d);
  const NA = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  const numRe = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
  const cmds = [];
  let i = 0, cmd = null;
  const near = () => `"${s.slice(i, i + 12)}"`;
  const skip = () => { while (i < s.length && /[\s,]/.test(s[i])) i++; };
  const num = () => {
    skip();
    numRe.lastIndex = i;
    const m = numRe.exec(s);
    if (!m) throw new Error(`Bad path data near ${near()}`);
    i = numRe.lastIndex;
    return parseFloat(m[0]);
  };
  const flag = () => {
    skip();
    const c = s[i];
    if (c !== "0" && c !== "1") throw new Error(`Bad arc flag near ${near()}`);
    i++;
    return +c;
  };
  for (;;) {
    skip();
    if (i >= s.length) break;
    const ch = s[i];
    if (/[A-Za-z]/.test(ch)) {
      if (!Object.prototype.hasOwnProperty.call(NA, ch.toUpperCase())) throw new Error(`Unsupported path command "${ch}"`);
      cmd = ch; i++;
      if (cmd.toUpperCase() === "Z") { cmds.push({ c: cmd, a: [] }); continue; }
    } else if (cmd === null || cmd.toUpperCase() === "Z") {
      throw new Error(`Bad path data near ${near()}`);
    }
    const C = cmd.toUpperCase();
    const a = [];
    if (C === "A") a.push(num(), num(), num(), flag(), flag(), num(), num());
    else for (let k = 0; k < NA[C]; k++) a.push(num());
    cmds.push({ c: cmd, a });
    if (cmd === "M") cmd = "L"; else if (cmd === "m") cmd = "l"; // implicit line-to after a move
  }
  return cmds;
}

/* SVG elliptical arc (endpoint form) -> cubic Beziers, per the SVG spec (F.6.5). */
function arcToCubics(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return [["L", x2, y2]];
  const phi = (phiDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const k = Math.sqrt(lam); rx *= k; ry *= k; }
  const sign = fa === fs ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry, cyp = (-coef * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dth > 0) dth -= 2 * Math.PI;
  if (fs && dth < 0) dth += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9));
  const del = dth / n, t = (4 / 3) * Math.tan(del / 4);
  const P = (ex, ey) => [cx + rx * ex * cp - ry * ey * sp, cy + rx * ex * sp + ry * ey * cp];
  const out = [];
  for (let k = 0; k < n; k++) {
    const a1 = th1 + k * del, a2 = a1 + del;
    const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
    const p1 = P(c1 - t * s1, s1 + t * c1), p2 = P(c2 + t * s2, s2 - t * c2);
    const p3 = k === n - 1 ? [x2, y2] : P(c2, s2);
    out.push(["C", p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]]);
  }
  return out;
}

function normalizePath(cmds) {
  const segs = [];
  let x = 0, y = 0, sx = 0, sy = 0, pc = null, pq = null;
  cmds.forEach(({ c, a }) => {
    const rel = c !== c.toUpperCase();
    const C = c.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    let npc = null, npq = null;
    if (C === "M") { x = ox + a[0]; y = oy + a[1]; sx = x; sy = y; segs.push(["M", x, y]); }
    else if (C === "L") { x = ox + a[0]; y = oy + a[1]; segs.push(["L", x, y]); }
    else if (C === "H") { x = ox + a[0]; segs.push(["L", x, y]); }
    else if (C === "V") { y = oy + a[0]; segs.push(["L", x, y]); }
    else if (C === "C") {
      const q = [ox + a[0], oy + a[1], ox + a[2], oy + a[3], ox + a[4], oy + a[5]];
      segs.push(["C", ...q]); npc = [q[2], q[3]]; x = q[4]; y = q[5];
    } else if (C === "S") {
      const c1 = pc ? [2 * x - pc[0], 2 * y - pc[1]] : [x, y];
      const q = [ox + a[0], oy + a[1], ox + a[2], oy + a[3]];
      segs.push(["C", c1[0], c1[1], q[0], q[1], q[2], q[3]]); npc = [q[0], q[1]]; x = q[2]; y = q[3];
    } else if (C === "Q" || C === "T") {
      let qx, qy, ex, ey;
      if (C === "Q") { qx = ox + a[0]; qy = oy + a[1]; ex = ox + a[2]; ey = oy + a[3]; }
      else { const r = pq ? [2 * x - pq[0], 2 * y - pq[1]] : [x, y]; qx = r[0]; qy = r[1]; ex = ox + a[0]; ey = oy + a[1]; }
      segs.push(["C", x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey]);
      npq = [qx, qy]; x = ex; y = ey;
    } else if (C === "A") {
      const ex = ox + a[5], ey = oy + a[6];
      arcToCubics(x, y, a[0], a[1], a[2], a[3], a[4], ex, ey).forEach((sg) => segs.push(sg));
      x = ex; y = ey;
    } else if (C === "Z") { segs.push(["Z"]); x = sx; y = sy; }
    pc = npc; pq = npq;
  });
  return segs;
}

/* ---------- Warping: piecewise-linear map of design coordinates to real ones ---------- */
function makeAxis(pairs) {
  if (!pairs || pairs.length < 2) return (v) => v;
  const a = pairs.slice().sort((p, q) => p[0] - q[0]);
  for (let k = 1; k < a.length; k++) if (a[k][0] === a[k - 1][0]) throw new Error(`Duplicate map anchor at ${a[k][0]}`);
  return (v) => {
    let k = 0;
    while (k < a.length - 2 && v > a[k + 1][0]) k++;
    const [d0, r0] = a[k], [d1, r1] = a[k + 1];
    return r0 + ((v - d0) * (r1 - r0)) / (d1 - d0);
  };
}

function mapSegs(segs, fx, fy) {
  return segs.map((sg) => {
    if (sg[0] === "Z") return sg;
    const out = [sg[0]];
    for (let k = 1; k < sg.length; k += 2) out.push(fx(sg[k]), fy(sg[k + 1]));
    return out;
  });
}

/* One entry of "cuts" -> absolute segments.
   type "path" (default): { d }.  type "rect": { x, y, width, height, rx, ry }.
   type "circle": { cx, cy, r }.  type "ellipse": { cx, cy, rx, ry }.
   Positions go through the map; a shape keeps its own size unless "stretch": true.
   "space": "real" skips the map entirely. */
function cutToSegs(c, idx, env, fx, fy, holes) {
  if (!c || typeof c !== "object") throw new Error(`Cut #${idx + 1} is not an object`);
  const real = c.space === "real";
  const type = c.type || (typeof c.d === "string" ? "path" : "");
  const label = c.id || `#${idx + 1}`;
  const num = (k, dflt) => {
    if (c[k] === undefined) {
      if (dflt === undefined) throw new Error(`Cut ${label} (${type}) needs "${k}"`);
      return dflt;
    }
    return ev(c[k], env);
  };
  const q = (v) => +v.toFixed(6);

  if (type === "path") {
    const sg = normalizePath(parsePathD(fillTemplate(c.d, env)));
    return real ? sg : mapSegs(sg, fx, fy);
  }

  let d, cx, cy, round = null; // round = [rx, ry] for circle / ellipse cuts
  if (type === "rect") {
    const x = num("x", 0), y = num("y", 0), w = num("width"), h = num("height");
    if (!(w > 0 && h > 0)) throw new Error(`Cut ${label}: width and height must be greater than zero`);
    let rx = c.rx !== undefined ? num("rx") : c.ry !== undefined ? num("ry") : 0;
    let ry = c.ry !== undefined ? num("ry") : rx;
    rx = Math.min(Math.max(rx, 0), w / 2); ry = Math.min(Math.max(ry, 0), h / 2);
    cx = x + w / 2; cy = y + h / 2;
    d = rx > 0 && ry > 0
      ? `M${q(x + rx)} ${q(y)} H${q(x + w - rx)} A${q(rx)} ${q(ry)} 0 0 1 ${q(x + w)} ${q(y + ry)} V${q(y + h - ry)} A${q(rx)} ${q(ry)} 0 0 1 ${q(x + w - rx)} ${q(y + h)} H${q(x + rx)} A${q(rx)} ${q(ry)} 0 0 1 ${q(x)} ${q(y + h - ry)} V${q(y + ry)} A${q(rx)} ${q(ry)} 0 0 1 ${q(x + rx)} ${q(y)} Z`
      : `M${q(x)} ${q(y)} H${q(x + w)} V${q(y + h)} H${q(x)} Z`;
  } else if (type === "circle" || type === "ellipse") {
    cx = num("cx", 0); cy = num("cy", 0);
    const rx = type === "circle" ? num("r") : num("rx");
    const ry = type === "circle" ? rx : num("ry");
    if (!(rx > 0 && ry > 0)) throw new Error(`Cut ${label}: radius must be greater than zero`);
    round = [rx, ry];
    d = `M${q(cx - rx)} ${q(cy)} A${q(rx)} ${q(ry)} 0 1 0 ${q(cx + rx)} ${q(cy)} A${q(rx)} ${q(ry)} 0 1 0 ${q(cx - rx)} ${q(cy)} Z`;
  } else {
    throw new Error(`Cut ${label}: unknown type "${type}" (use path, rect, circle or ellipse)`);
  }
  const sg = normalizePath(parsePathD(d));
  // holes: centre and radii in mm, in the same (design -> real) space as the segments returned
  const note = (hx, hy, hrx, hry) => { if (round && holes) holes.push({ cx: hx, cy: hy, rx: hrx, ry: hry }); };
  if (real) { note(cx, cy, ...(round || [])); return sg; }
  if (c.stretch === true) {
    if (round) note((fx(cx - round[0]) + fx(cx + round[0])) / 2, (fy(cy - round[1]) + fy(cy + round[1])) / 2,
      Math.abs(fx(cx + round[0]) - fx(cx - round[0])) / 2, Math.abs(fy(cy + round[1]) - fy(cy - round[1])) / 2);
    return mapSegs(sg, fx, fy);
  }
  const dx = fx(cx) - cx, dy = fy(cy) - cy; // move the shape to where its centre maps to
  note(cx + dx, cy + dy, ...(round || []));
  return mapSegs(sg, (v) => v + dx, (v) => v + dy);
}

/* ---------- Definition -> drawing model ----------
   p = { L, W, H, unit, ply, date, job }, opts = { dims, prec, color } */
function buildKeylineModel(def, p, opts) {
  opts = opts || {};
  const { L, W, H, unit: u } = p;
  if (!(L > 0 && W > 0 && H > 0)) throw new Error("Enter length, width and height greater than zero.");
  if (!def || !Array.isArray(def.cuts) || !def.cuts.length) throw new Error("Keyline has no cuts defined.");
  const dimensionGroupFor = (shape) => {
    if (shape.dimensionGroup === undefined) return null;
    if (typeof shape.dimensionGroup !== "string" || !shape.dimensionGroup.trim()) {
      throw new Error(`Keyline "${def.id}" has an invalid dimension group.`);
    }
    return shape.dimensionGroup.trim();
  };
  const hasDimensionGroups = [...def.cuts, ...(def.creases || [])].some((shape) => shape.dimensionGroup !== undefined);
  if (hasDimensionGroups && [...def.cuts, ...(def.creases || [])].some((shape) => !dimensionGroupFor(shape))) {
    throw new Error(`Keyline "${def.id}" must assign every cut and crease to a dimension group.`);
  }
  const f = (v) => KC.fmt(v, u);
  const t = (v) => String(+v.toFixed(u === "mm" ? 1 : 3));

  // Definitions are written in millimetres. k = output units per mm (1 for mm, 1/25.4 for inches);
  // everything is calculated in mm and the finished drawing is scaled to the unit in use.
  // "units": "any" in a definition turns this off (numbers are used as typed, in either unit).
  const k = def.units === "any" ? 1 : u === "in" ? 1 / 25.4 : 1;
  const RESERVED = ["L", "W", "H", "pi", "mx", "my"];

  // variables: L, W, H, the keyline's own inputs, then params in order (each may use the earlier ones)
  const env = { L: L / k, W: W / k, H: H / k, pi: Math.PI };
  (def.inputs || []).forEach((inp) => {
    if (!inp || typeof inp.id !== "string" || RESERVED.includes(inp.id)) throw new Error(`Bad input id "${inp && inp.id}"`);
    const label = inp.label || inp.id;
    const raw = p.inputs && p.inputs[inp.id] !== undefined ? p.inputs[inp.id] : inp.default * k;
    if (!Number.isFinite(raw)) throw new Error(`Enter a value for "${label}".`);
    const mm = raw / k;
    const lo = inp.min !== undefined ? inp.min : 0;
    if (mm < lo - 1e-9) throw new Error(`${label} must be at least ${+(lo * k).toFixed(3)} ${u}.`);
    if (inp.max !== undefined && mm > inp.max + 1e-9) throw new Error(`${label} must be at most ${+(inp.max * k).toFixed(3)} ${u}.`);
    env[inp.id] = mm;
  });
  Object.keys(def.params || {}).forEach((name) => {
    if (RESERVED.includes(name) || (def.inputs || []).some((i) => i.id === name)) throw new Error(`"${name}" is reserved or already an input, and cannot be a param name`);
    env[name] = ev(def.params[name], env);
  });

  const mapPairs = (arr) => (arr || []).map((pr) => [ev(pr[0], env), ev(pr[1], env)]);
  const fx = makeAxis(mapPairs(def.map && def.map.x));
  const fy = makeAxis(mapPairs(def.map && def.map.y));

  // mx(v) / my(v) give the mapped position of a design coordinate (for use in expressions)
  env.mx = fx;
  env.my = fy;
  (def.require || []).forEach((r) => {
    if (evalExpr(r.expr, env) === 0) throw new Error(r.message || `Condition not met: ${r.expr}`);
  });

  // cuts -> a continuous outline when provided, plus the remaining cut geometry
  let segs = [];
  const holes = [];
  const cutSegsById = new Map();
  const dimensionCutSegs = new Map();
  const groupedCutParts = [];
  def.cuts.forEach((c, idx) => {
    const partHoles = [];
    const part = cutToSegs(c, idx, env, fx, fy, partHoles);
    segs = segs.concat(part);
    if (c.id) cutSegsById.set(c.id, part);
    const dimensionGroup = dimensionGroupFor(c);
    groupedCutParts.push({ group: dimensionGroup, segs: part });
    partHoles.forEach((hole) => holes.push({ ...hole, dimensionGroup }));
    if (dimensionGroup) {
      if (!dimensionCutSegs.has(dimensionGroup)) dimensionCutSegs.set(dimensionGroup, []);
      dimensionCutSegs.get(dimensionGroup).push(...part);
    }
  });

  let silhouetteSegs = null, outlineSegs = null;
  if (typeof def.fillOutline === "string") {
    silhouetteSegs = normalizePath(parsePathD(fillTemplate(def.fillOutline, env)));
    if (def.fillOutlineSpace !== "real") silhouetteSegs = mapSegs(silhouetteSegs, fx, fy);
    outlineSegs = silhouetteSegs;
    (def.fillHoles || []).forEach((id) => {
      const part = cutSegsById.get(id);
      if (!part) throw new Error(`Fill hole "${id}" is not a defined cut`);
      outlineSegs = outlineSegs.concat(part);
    });
    const outlineIds = new Set([...(def.outlineCutIds || []), ...(def.fillOutlineSeparate ? [] : (def.fillHoles || []))]);
    segs = def.cuts.filter((c) => !outlineIds.has(c.id)).flatMap((c) => cutSegsById.get(c.id) || []);
  }

  // creases: { x1,y1,x2,y2 } or { d: "<path of straight lines>" }
  let creases = [];
  const dimensionCreaseLines = new Map();
  (def.creases || []).forEach((c) => {
    const real = c.space === "real";
    const dimensionGroup = dimensionGroupFor(c);
    const addCrease = (crease) => {
      creases.push(crease);
      if (dimensionGroup) {
        if (!dimensionCreaseLines.has(dimensionGroup)) dimensionCreaseLines.set(dimensionGroup, []);
        dimensionCreaseLines.get(dimensionGroup).push(crease);
      }
    };
    if (typeof c.d === "string") {
      let sg = normalizePath(parsePathD(fillTemplate(c.d, env)));
      if (!real) sg = mapSegs(sg, fx, fy);
      KC.flattenSegs(sg).forEach((sp) => {
        const n = sp.pts.length;
        for (let k = 0; k < (sp.closed ? n : n - 1); k++) {
          addCrease([...sp.pts[k], ...sp.pts[(k + 1) % n]]);
        }
      });
    } else {
      let q = [ev(c.x1, env), ev(c.y1, env), ev(c.x2, env), ev(c.y2, env)];
      if (!real) q = [fx(q[0]), fy(q[1]), fx(q[2]), fy(q[3])];
      addCrease(q);
    }
  });
  dimensionCreaseLines.forEach((_, group) => {
    if (!dimensionCutSegs.has(group)) {
      throw new Error(`Keyline "${def.id}" has creases without a cut in dimension group "${group}".`);
    }
  });

  // calculated in mm, drawn in the unit in use
  if (k !== 1) {
    segs = mapSegs(segs, (v) => v * k, (v) => v * k);
    if (outlineSegs) outlineSegs = mapSegs(outlineSegs, (v) => v * k, (v) => v * k);
    if (silhouetteSegs && def.strokeFillOutline) silhouetteSegs = mapSegs(silhouetteSegs, (v) => v * k, (v) => v * k);
    creases = creases.map((c) => c.map((v) => v * k));
    groupedCutParts.forEach((part) => {
      part.segs = mapSegs(part.segs, (v) => v * k, (v) => v * k);
    });
    dimensionCutSegs.forEach((groupSegs, group) => {
      dimensionCutSegs.set(group, mapSegs(groupSegs, (v) => v * k, (v) => v * k));
    });
    dimensionCreaseLines.forEach((groupCreases, group) => {
      dimensionCreaseLines.set(group, groupCreases.map((c) => c.map((v) => v * k)));
    });
  }

  // move the artwork so its top-left corner is (0,0)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const boundSegs = outlineSegs ? segs.concat(outlineSegs) : segs;
  KC.flattenSegs(boundSegs).forEach((sp) => sp.pts.forEach((pt) => {
    x0 = Math.min(x0, pt[0]); y0 = Math.min(y0, pt[1]); x1 = Math.max(x1, pt[0]); y1 = Math.max(y1, pt[1]);
  }));
  segs = mapSegs(segs, (v) => v - x0, (v) => v - y0);
  if (outlineSegs) outlineSegs = mapSegs(outlineSegs, (v) => v - x0, (v) => v - y0);
  if (silhouetteSegs && def.strokeFillOutline) silhouetteSegs = mapSegs(silhouetteSegs, (v) => v - x0, (v) => v - y0);
  creases = creases.map((c) => [c[0] - x0, c[1] - y0, c[2] - x0, c[3] - y0]);
  groupedCutParts.forEach((part) => {
    part.segs = mapSegs(part.segs, (v) => v - x0, (v) => v - y0);
  });
  dimensionCutSegs.forEach((groupSegs, group) => {
    dimensionCutSegs.set(group, mapSegs(groupSegs, (v) => v - x0, (v) => v - y0));
  });
  dimensionCreaseLines.forEach((groupCreases, group) => {
    dimensionCreaseLines.set(group, groupCreases.map((c) => [c[0] - x0, c[1] - y0, c[2] - x0, c[3] - y0]));
  });
  const artW = x1 - x0;
  let artH = y1 - y0;
  const orderedDimensionGroups = [...dimensionCutSegs.entries()].map(([id, groupSegs]) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    KC.flattenSegs(groupSegs).forEach((sp) => sp.pts.forEach(([x, y]) => {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }));
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
      throw new Error(`Keyline "${def.id}" has an empty dimension group "${id}".`);
    }
    return {
      id,
      bounds: { minX, minY, maxX, maxY },
      creases: dimensionCreaseLines.get(id) || [],
    };
  }).sort((a, b) => a.bounds.minY - b.bounds.minY);

  const size = Math.max(artW, artH);
  const th = size / 70;
  const g1 = th * 2.4, tk = th * 0.4, wo = th * 0.3;
  const dt = def.details || {};
  const baseTitle = String(p.job || "").trim() || def.title || `${String(def.name || def.id).toUpperCase()} KEYLINE`;
  const detailGroups = orderedDimensionGroups.length > 1 ? orderedDimensionGroups : [null];
  const detailPlans = detailGroups.map((group) => {
    const groupDetailsValue = group && dt.groups && dt.groups[group.id];
    const groupDetails = groupDetailsValue && typeof groupDetailsValue === "object" && !Array.isArray(groupDetailsValue)
      ? groupDetailsValue
      : {};
    const groupBounds = group && group.bounds;
    const groupWidth = groupBounds ? groupBounds.maxX - groupBounds.minX : artW;
    const groupHeight = groupBounds ? groupBounds.maxY - groupBounds.minY : artH;
    const creasingValues = groupDetails.creasing !== undefined ? groupDetails.creasing : dt.creasing;
    const creasing = (creasingValues || []).map((e) => t(ev(e, env) * k)).join("-");
    const boardLenExpr = groupDetails.boardLength !== undefined ? groupDetails.boardLength : dt.boardLength;
    const boardWidExpr = groupDetails.boardWidth !== undefined ? groupDetails.boardWidth : dt.boardWidth;
    const boardLen = boardLenExpr !== undefined ? ev(boardLenExpr, env) * k : groupWidth;
    const boardWid = boardWidExpr !== undefined ? ev(boardWidExpr, env) * k : groupHeight;
    const rows = [
      [["Size (OD):", `${f(L)} x ${f(W)} x ${f(H)} ${u}`], ["Plies:", `${p.ply} ply`]],
      [["Creasing dimension:", creasing ? `${creasing} ${u}` : "-"], ["Date:", KC.fmtDate(p.date || "")]],
      [["Board length:", `${f(boardLen)} ${u}`], ["Board width:", `${f(boardWid)} ${u}`]],
      ...KC.profileRows(opts && opts.profile),
    ];
    const groupLabel = group
      ? String(groupDetails.title || group.id).replace(/[-_]+/g, " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
      : "";
    return {
      group,
      rows,
      title: group ? `${baseTitle} - ${groupLabel}` : baseTitle,
      artW: groupWidth,
      frameHeight: (rows.length + 1) * th * 2.2,
    };
  });
  const detailGap = th * 0.8;
  const rowSpacing = th * 1.8;
  const packGroupDetails = orderedDimensionGroups.length > 1 && !outlineSegs;
  const groupYOffset = new Map();
  if (packGroupDetails) {
    let nextGroupTop = orderedDimensionGroups[0].bounds.minY;
    orderedDimensionGroups.forEach((group, index) => {
      const offsetY = nextGroupTop - group.bounds.minY;
      groupYOffset.set(group.id, offsetY);
      group.bounds = {
        ...group.bounds,
        minY: group.bounds.minY + offsetY,
        maxY: group.bounds.maxY + offsetY,
      };
      group.creases = group.creases.map((crease) => [crease[0], crease[1] + offsetY, crease[2], crease[3] + offsetY]);
      dimensionCutSegs.set(group.id, mapSegs(dimensionCutSegs.get(group.id), (v) => v, (v) => v + offsetY));
      dimensionCreaseLines.set(group.id, group.creases);

      const plan = detailPlans[index];
      plan.detailY = group.bounds.maxY + detailGap;
      const nextGap = opts.dims ? g1 + rowSpacing + th * 1.5 : detailGap;
      nextGroupTop = plan.detailY + plan.frameHeight + nextGap;
    });
    segs = groupedCutParts.flatMap((part) => {
      const offsetY = groupYOffset.get(part.group) || 0;
      return mapSegs(part.segs, (v) => v, (v) => v + offsetY);
    });
    creases = orderedDimensionGroups.flatMap((group) => group.creases);
    artH = orderedDimensionGroups[orderedDimensionGroups.length - 1].bounds.maxY;
  }
  const holesOut = holes.map((hole) => ({
    cx: hole.cx * k - x0,
    cy: hole.cy * k - y0 + (groupYOffset.get(hole.dimensionGroup) || 0),
    rx: hole.rx * k,
    ry: hole.ry * k,
  }));
  const items = [];
  let activeDimGroup = null, nextDimGroup = 0;
  const line = (layer, ax, ay, bx, by) => items.push({ t: "line", layer, x1: ax, y1: ay, x2: bx, y2: by,
    ...(layer === "DIM" && activeDimGroup !== null ? { dimGroup: activeDimGroup } : {}) });
  const text = (layer, x, y, s, o = {}) =>
    items.push({ t: "text", layer, x, y, s, size: o.size || th, anchor: o.anchor || "start", rot: o.rot || 0, bold: !!o.bold,
      ...(layer === "DIM" && activeDimGroup !== null ? { dimGroup: activeDimGroup } : {}) });
  const withDimGroup = (fn) => { const prev = activeDimGroup; activeDimGroup = ++nextDimGroup; try { return fn(); } finally { activeDimGroup = prev; } };

  const fill = opts.color === "brown"
    ? { cmyk: [0, 0.2, 0.4, 0], rgb: "#ffcc99" }
    : opts.color === "white" ? { cmyk: [0, 0, 0, 0], rgb: "#ffffff" } : null;
  if (outlineSegs && def.fillOutlineSeparate) {
    if (fill) items.push({ t: "path", layer: "FILL", segs: outlineSegs, fill });
    if (def.strokeFillOutline && silhouetteSegs) items.push({ t: "path", layer: "CUT", segs: silhouetteSegs });
  } else if (outlineSegs) items.push({ t: "path", layer: "CUT", segs: outlineSegs, ...(fill ? { fill } : {}) });
  if (segs.length || !outlineSegs || def.fillOutlineSeparate) items.push({ t: "path", layer: "CUT", segs, ...(!outlineSegs && fill ? { fill } : {}) });
  creases.forEach((c) => items.push({
    t: "line",
    layer: "CREASE",
    x1: c[0],
    y1: c[1],
    x2: c[2],
    y2: c[3],
  }));

  if (opts.dims) {
    const prec = Number.isInteger(opts.prec) ? Math.min(Math.max(opts.prec, 0), 3) : 1;
    const fd = (v) => v.toFixed(prec);
    const fits = (label, span) => KC.tw(label, th) <= span * 0.95;
    const hDim = (y, xa, xb, above, value) => {
      withDimGroup(() => {
        line("DIM", xa, y, xb, y); line("DIM", xa, y - tk, xa, y + tk); line("DIM", xb, y - tk, xb, y + tk);
        const label = fd(value === undefined ? xb - xa : value);
        if (fits(label, xb - xa)) text("DIM", (xa + xb) / 2, above ? y - th * 0.35 : y + th * 1.05, label, { anchor: "middle" });
      });
    };
    const vDim = (x, ya, yb, left, value) => {
      withDimGroup(() => {
        line("DIM", x, ya, x, yb); line("DIM", x - tk, ya, x + tk, ya); line("DIM", x - tk, yb, x + tk, yb);
        const label = fd(value === undefined ? yb - ya : value);
        if (fits(label, yb - ya)) text("DIM", x + (left ? -th * 0.35 : th * 0.35), (ya + yb) / 2, label, { anchor: "middle", rot: left ? 90 : -90 });
      });
    };
    // positions come from the crease lines, plus the artwork edges
    const uniq = (arr) => {
      const out = [];
      arr.sort((a, b) => a - b).forEach((v) => { if (!out.length || Math.abs(v - out[out.length - 1]) > 1e-4) out.push(v); });
      return out;
    };
    const autoDimensionValues = def.autoDimensionValues || {};
    const segmentDimensionValue = (values, axis, index) => {
      const axisValues = values[axis];
      return Array.isArray(axisValues) && axisValues[index] !== undefined ? ev(axisValues[index], env) * k : undefined;
    };
    const overallDimensionValue = (values, axis) => {
      const value = values[`overall${axis.toUpperCase()}`];
      return value === undefined ? undefined : ev(value, env) * k;
    };
    const renderDimensionSet = (bounds, groupCreases, values, placement) => {
      const xs = uniq([bounds.minX, bounds.maxX, ...groupCreases
        .filter((c) => Math.abs(c[0] - c[2]) < 1e-6 && c[0] > bounds.minX + 1e-4 && c[0] < bounds.maxX - 1e-4)
        .map((c) => c[0])]);
      const ys = uniq([bounds.minY, bounds.maxY, ...groupCreases
        .filter((c) => Math.abs(c[1] - c[3]) < 1e-6 && c[1] > bounds.minY + 1e-4 && c[1] < bounds.maxY - 1e-4)
        .map((c) => c[1])]);

      const horizontalRows = [
        { y: placement.segmentY, side: placement.segmentSide, above: placement.segmentAbove, segments: true },
        { y: placement.overallY, side: placement.overallSide, above: placement.overallAbove, segments: false },
      ];
      const topRows = horizontalRows.filter((row) => row.side === "top");
      const bottomRows = horizontalRows.filter((row) => row.side === "bottom");
      const horizontalEndpoints = [bounds.minX, bounds.maxX];
      const verticalEndpoints = [bounds.minY, bounds.maxY];
      const topWitnessXs = topRows.some((row) => row.segments) ? xs : horizontalEndpoints;
      const bottomWitnessXs = bottomRows.some((row) => row.segments) ? xs : horizontalEndpoints;

      if (topRows.length) {
        const endY = Math.min(...topRows.map((row) => row.y)) - tk * 1.2;
        topWitnessXs.forEach((x) => line("DIM", x, bounds.minY - wo, x, endY));
      }
      if (bottomRows.length) {
        const endY = Math.max(...bottomRows.map((row) => row.y)) + tk * 1.2;
        bottomWitnessXs.forEach((x) => line("DIM", x, bounds.maxY + wo, x, endY));
      }
      ys.forEach((y) => {
        line("DIM", bounds.minX - wo, y, bounds.minX - placement.leftOffset - tk * 1.2, y);
      });
      verticalEndpoints.forEach((y) => {
        line("DIM", bounds.maxX + wo, y, bounds.maxX + placement.rightOffset + tk * 1.2, y);
      });

      horizontalRows.forEach((row) => {
        if (row.segments) {
          for (let index = 0; index < xs.length - 1; index++) {
            hDim(row.y, xs[index], xs[index + 1], row.above, segmentDimensionValue(values, "x", index));
          }
        } else {
          hDim(row.y, bounds.minX, bounds.maxX, row.above, overallDimensionValue(values, "x"));
        }
      });
      for (let index = 0; index < ys.length - 1; index++) {
        vDim(bounds.minX - placement.leftOffset, ys[index], ys[index + 1], true, segmentDimensionValue(values, "y", index));
      }
      vDim(bounds.maxX + placement.rightOffset, bounds.minY, bounds.maxY, false, overallDimensionValue(values, "y"));
    };

    if (!orderedDimensionGroups.length) {
      renderDimensionSet(
        { minX: 0, minY: 0, maxX: artW, maxY: artH },
        creases,
        autoDimensionValues,
        {
          segmentY: -g1, segmentSide: "top", segmentAbove: true,
          overallY: artH + g1, overallSide: "bottom", overallAbove: false,
          leftOffset: g1, rightOffset: g1,
        },
      );
    } else {
      orderedDimensionGroups.forEach((group) => {
        const groupValues = autoDimensionValues.groups && autoDimensionValues.groups[group.id]
          ? autoDimensionValues.groups[group.id]
          : autoDimensionValues;
        let placement;

        if (orderedDimensionGroups.length === 1) {
          placement = {
            segmentY: group.bounds.minY - g1, segmentSide: "top", segmentAbove: true,
            overallY: group.bounds.maxY + g1, overallSide: "bottom", overallAbove: false,
            leftOffset: g1, rightOffset: g1,
          };
        } else {
          placement = {
            segmentY: group.bounds.minY - g1, segmentSide: "top", segmentAbove: true,
            overallY: group.bounds.minY - g1 - rowSpacing, overallSide: "top", overallAbove: true,
            leftOffset: g1, rightOffset: g1,
          };
        }
        renderDimensionSet(group.bounds, group.creases, groupValues, placement);
      });
    }

    if (def.renderDimensions === true) {
      if (!Array.isArray(def.dimensions)) throw new Error("Custom dimensions must be an array.");
      def.dimensions.forEach((d, idx) => {
        if (!d || d.x1 === undefined || d.y1 === undefined || d.x2 === undefined || d.y2 === undefined || d.value === undefined) {
          throw new Error(`Custom dimension #${idx + 1} needs endpoints and a value.`);
        }
        const x1 = fx(ev(d.x1, env)) * k - x0;
        const y1 = fy(ev(d.y1, env)) * k - y0;
        const x2 = fx(ev(d.x2, env)) * k - x0;
        const y2 = fy(ev(d.y2, env)) * k - y0;
        const value = ev(d.value, env) * k;
        if (![x1, y1, x2, y2, value].every(Number.isFinite) || (x1 === x2 && y1 === y2)) {
          throw new Error(`Custom dimension #${idx + 1} has invalid geometry or value.`);
        }
        if (Math.abs(x2 - x1) < Math.abs(y2 - y1)) {
          vDim((x1 + x2) / 2, Math.min(y1, y2), Math.max(y1, y2), d.left === true, value);
        } else {
          hDim((y1 + y2) / 2, Math.min(x1, x2), Math.max(x1, x2), d.above === true, value);
        }
      });
    }

    // hole sizes: a size line across every circle / ellipse cut, labelled with its diameter.
    // The label sits inside the hole when it fits, otherwise just outside it.
    const hth = th * 0.8; // hole labels are a little smaller than the main dimensions
    holesOut.forEach((h) => {
      withDimGroup(() => {
      const ticks = (ax, ay, bx, by, vertical) => {
        line("DIM", ax, ay, bx, by);
        if (vertical) { line("DIM", ax - tk, ay, ax + tk, ay); line("DIM", bx - tk, by, bx + tk, by); }
        else { line("DIM", ax, ay - tk, ax, ay + tk); line("DIM", bx, by - tk, bx, by + tk); }
      };
      const wLabel = fd(2 * h.rx);
      ticks(h.cx - h.rx, h.cy, h.cx + h.rx, h.cy, false);
      if (Math.abs(h.rx - h.ry) < 1e-6) {
        const off = hth * 1.05; // how far the label's top edge is above the line
        const chord = h.rx * Math.sqrt(Math.max(0, 1 - (off / h.ry) * (off / h.ry)));
        if (KC.tw(wLabel, hth) <= chord * 1.9) text("DIM", h.cx, h.cy - hth * 0.3, wLabel, { anchor: "middle", size: hth });
        else text("DIM", h.cx + h.rx + hth * 0.4, h.cy + hth * 0.35, wLabel, { anchor: "start", size: hth });
      } else { // ellipse: width to the right, height above
        text("DIM", h.cx + h.rx + hth * 0.4, h.cy + hth * 0.35, wLabel, { anchor: "start", size: hth });
        ticks(h.cx, h.cy - h.ry, h.cx, h.cy + h.ry, true);
        text("DIM", h.cx, h.cy - h.ry - hth * 0.4, fd(2 * h.ry), { anchor: "middle", size: hth });
      }
      });
    });
  }

  // Place grouped tables directly below their pieces; ungrouped layouts keep one table.
  const fy2 = opts.dims ? artH + g1 + th * 3 : artH + th * 2.5;
  let detailY = fy2;
  detailPlans.forEach((plan) => {
    const tableY = plan.detailY === undefined ? detailY : plan.detailY;
    KC.addDetailsFrame(items, { th, u, title: plan.title, rows: plan.rows, artW: plan.artW, fy: tableY });
    if (plan.detailY === undefined) detailY += plan.frameHeight + (plan.group ? th : 0);
  });
  return KC.finalizeModel(items, u, size, th, artH);
}

/* ---------- Registry: keylines/index.json lists the definition files ---------- */
const KEYLINES = {};

function registerKeyline(def) {
  if (!def || typeof def.id !== "string" || !def.id) throw new Error('Keyline needs an "id"');
  if (def.id === "rsc") throw new Error('"rsc" is built in and cannot be redefined');
  if (!Array.isArray(def.cuts) || !def.cuts.length) throw new Error(`Keyline "${def.id}" needs a "cuts" list`);
  (def.inputs || []).forEach((inp) => {
    if (!inp || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(inp.id || "") || ["L", "W", "H", "pi", "mx", "my"].includes(inp.id))
      throw new Error(`Keyline "${def.id}" has an input with a bad "id"`);
    if (!Number.isFinite(inp.default)) throw new Error(`Input "${inp.id}" in "${def.id}" needs a numeric "default"`);
  });
  KEYLINES[def.id] = def;
}

async function loadKeylines(base) {
  base = base || "keylines/";
  const errors = [];
  if (base === "/api/keylines") {
    const response = await fetch(base, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Account verification failed (HTTP ${response.status})`);
    }

    const catalog = await response.json();
    if (
      !Array.isArray(catalog.definitions) ||
      !Array.isArray(catalog.locked) ||
      (catalog.plan !== "free" && catalog.plan !== "premium") ||
      typeof catalog.trialActive !== "boolean" ||
      (catalog.trialEndsAt !== null &&
        (typeof catalog.trialEndsAt !== "string" ||
          !Number.isFinite(Date.parse(catalog.trialEndsAt))))
    ) {
      throw new Error("The verified keyline catalog is invalid.");
    }

    window.CARTONLAB_PLAN = catalog.plan;
    window.CARTONLAB_TRIAL_ACTIVE = catalog.trialActive;
    window.CARTONLAB_TRIAL_ENDS_AT = catalog.trialEndsAt;
    window.CARTONLAB_LOCKED_KEYLINES = catalog.locked;
    for (const definition of catalog.definitions) {
      try {
        registerKeyline(definition);
      } catch (error) {
        errors.push(`${definition?.id || "unknown keyline"}: ${error.message}`);
      }
    }
    return errors;
  }

  const index = await (await fetch(base + "index.json")).json();
  for (const file of index) {
    try {
      const res = await fetch(base + file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      registerKeyline(await res.json());
    } catch (e) {
      errors.push(`${file}: ${e.message}`);
    }
  }
  return errors;
}

if (typeof module !== "undefined") {
  module.exports = { evalExpr, fillTemplate, parsePathD, normalizePath, arcToCubics, makeAxis, mapSegs, cutToSegs, buildKeylineModel, registerKeyline, KEYLINES };
}
