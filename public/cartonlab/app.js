"use strict";

const $ = (id) => document.getElementById(id);
const editableSelector = "input, textarea, select, [contenteditable='true']";

document.addEventListener("contextmenu", (event) => {
  if (!(event.target instanceof Element) || !event.target.closest(editableSelector)) {
    event.preventDefault();
  }
}, true);
document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const modifier = event.ctrlKey || event.metaKey;
  const devToolsShortcut =
    event.key === "F12" ||
    (modifier && event.shiftKey && ["i", "j", "c", "k"].includes(key)) ||
    (modifier && key === "u") ||
    (event.metaKey && event.altKey && ["i", "j", "c"].includes(key));

  if (devToolsShortcut) event.preventDefault();
}, true);
const FIELDS = ["boxType", "L", "W", "H", "unit", "ply", "crease", "bwadd", "glue", "slot", "dims", "prec", "color"];
const NUMERIC = ["L", "W", "H", "crease", "bwadd", "glue", "slot"];
const STORE_KEY = "rscKeyline.v4"; // bumped so new defaults (e.g. brown carton colour) replace old saved values
const RSC_DEFAULTS_MM = { L: 300, W: 200, H: 150 };
const DESIGNER_TOUR_KEY = "cartonlab.designer-tour.dismissed.v1";
const DESIGNER_TOUR_STEPS = [
  {
    targets: ['[data-tour="box-type"]'],
    title: "Choose a box",
    description: "Pick a category to preview its box styles, then select a thumbnail to open it on the artboard.",
  },
  {
    targets: ['[data-tour="box-size"]'],
    title: "Set the dimensions",
    description: "Enter the outside length, width and height, then choose millimetres or inches. The job name is optional.",
  },
  {
    targets: ['[data-tour="board-settings"]', '[data-tour="keyline-settings"]'],
    title: "Adjust the build",
    description: "Set board ply and date, then review keyline options. Dimension marks and carton colour are Premium features.",
  },
  {
    targets: ['[data-tour="preview"]'],
    title: "Work on the preview",
    description: "Click a cut or crease to reveal edit handles, then drag to adjust it. Press T for text, I for an image, or Ctrl+V to paste an image.",
  },
  {
    targets: ['[data-tour="canvas-tools"]', '[data-tour="zoom-tools"]'],
    title: "Navigate and edit",
    description: "Undo, redo, grid, snap and spacing are at the lower left. Zoom, fit and 1:1 controls are at the lower right.",
  },
  {
    targets: ['[data-tour="exports"]'],
    title: "Export your keyline",
    description: "Download PDF, SVG or DXF, or print and share your finished keyline here.",
  },
];
const PLY_DEFAULTS_MM = { 3: { crease: 2, bwadd: 4 }, 5: { crease: 3, bwadd: 6 } };

let premiumFeaturesEnabled = false;
let lastUnit = "mm";
let current = null; // { model }
let creatorProfile = {
  createdBy: "",
  companyName: "",
  role: "",
  contact: "",
  address: "",
};
let resolveProfile;
const profileReady = window.parent === window
  ? Promise.resolve()
  : new Promise((resolve) => { resolveProfile = resolve; });
window.addEventListener("message", (event) => {
  if (
    window.parent === window ||
    event.origin !== window.location.origin ||
    event.source !== window.parent ||
    !event.data ||
    event.data.type !== "cartonlab:profile" ||
    !event.data.profile ||
    typeof event.data.profile.createdBy !== "string" ||
    typeof event.data.profile.companyName !== "string" ||
    typeof event.data.profile.role !== "string" ||
    typeof event.data.profile.contact !== "string" ||
    typeof event.data.profile.address !== "string"
  ) {
    return;
  }

  creatorProfile = {
    createdBy: event.data.profile.createdBy.slice(0, 100),
    companyName: event.data.profile.companyName.slice(0, 100),
    role: event.data.profile.role.slice(0, 100),
    contact: event.data.profile.contact.slice(0, 120),
    address: event.data.profile.address.slice(0, 120),
  };
  resolveProfile();
});
// Values of the keyline-specific inputs (such as "Notch size"), as typed, in the unit in use:
// { keylineId: { inputId: "text" } }
let kvals = {};

function todayISO() {
  const d = new Date();
  const p = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function saveInputs() {
  try {
    const o = {};
    FIELDS.forEach((f) => (o[f] = f === "dims" ? $(f).checked : $(f).value));
    o.kin = kvals;
    localStorage.setItem(STORE_KEY, JSON.stringify(o));
  } catch (_) { /* storage unavailable */ }
}

function loadInputs() {
  try {
    const o = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (!o) return;
    if (o.kin && typeof o.kin === "object") kvals = o.kin;
    FIELDS.forEach((f) => {
      if (o[f] === undefined) return;
      if (f === "dims") $(f).checked = !!o[f];
      else $(f).value = o[f];
    });
  } catch (_) { /* ignore */ }
}

function readParams() {
  const num = (id) => parseFloat($(id).value);
  return {
    L: num("L"), W: num("W"), H: num("H"),
    unit: $("unit").value,
    ply: parseInt($("ply").value, 10),
    crease: num("crease"), bwadd: num("bwadd"),
    glue: num("glue"), slot: num("slot"),
    date: $("date").value,
    job: $("job").value,
    dims: premiumFeaturesEnabled && $("dims").checked,
    prec: premiumFeaturesEnabled ? parseInt($("prec").value, 10) : 1,
    color: premiumFeaturesEnabled ? $("color").value : "brown",
    type: $("boxType").value,
    inputs: keylineInputValues($("boxType").value),
  };
}

function applyPremiumFeatureAccess() {
  $("dims").disabled = !premiumFeaturesEnabled;
  $("color").disabled = !premiumFeaturesEnabled;
  $("prec").disabled = !premiumFeaturesEnabled;
  $("premiumFeaturesNotice").hidden = premiumFeaturesEnabled;
  if (!premiumFeaturesEnabled) {
    $("dims").checked = false;
    $("color").value = "brown";
  }
}

/* ---- keyline-specific inputs: each JSON keyline may declare "inputs" (id, label, default in mm) ---- */
function keylineInputDefault(inp, unit) {
  return String(+(inp.default * (unit === "in" ? 1 / 25.4 : 1)).toFixed(unit === "in" ? 3 : 1));
}

function applyKeylineDefaults(type, resetRsc = false) {
  const unit = $("unit").value;
  const precision = unit === "in" ? 3 : 1;
  if (type === "rsc") {
    if (resetRsc) {
      Object.entries(RSC_DEFAULTS_MM).forEach(([field, value]) => {
        const converted = unit === "mm" ? value : value / 25.4;
        $(field).value = +converted.toFixed(precision);
      });
    }
    return;
  }

  const def = KEYLINES[type];
  if (!def) return;
  ["L", "W", "H"].forEach((field) => {
    const ref = def.params && def.params["ref" + field];
    const value = typeof ref === "number" ? ref : Number(ref);
    if (!Number.isFinite(value)) return;
    const converted = def.units === "any" || unit === "mm" ? value : value / 25.4;
    $(field).value = +converted.toFixed(precision);
  });
  if (Array.isArray(def.inputs)) {
    kvals[def.id] = {};
    def.inputs.forEach((inp) => { kvals[def.id][inp.id] = keylineInputDefault(inp, unit); });
  }
}

function keylineInputValues(type) {
  const def = KEYLINES[type];
  if (!def || !def.inputs) return {};
  const saved = kvals[type] || {};
  const out = {};
  def.inputs.forEach((inp) => { out[inp.id] = saved[inp.id] === undefined ? undefined : parseFloat(saved[inp.id]); });
  return out;
}

function buildKeylineInputs() {
  const box = $("kInputs");
  box.replaceChildren(); // leaves the container empty (and hidden) when the keyline has no inputs
  const def = KEYLINES[$("boxType").value];
  if (!def || !def.inputs) return;
  const unit = $("unit").value;
  const saved = kvals[def.id] || (kvals[def.id] = {});
  def.inputs.forEach((inp) => {
    if (saved[inp.id] === undefined) saved[inp.id] = keylineInputDefault(inp, unit);
    const label = document.createElement("label");
    label.className = "field";
    label.appendChild(document.createTextNode(inp.label || inp.id));
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.min = "0";
    input.className = "input";
    input.value = saved[inp.id];
    input.addEventListener("input", () => { saved[inp.id] = input.value; redrawSoon(); });
    label.appendChild(input);
    box.appendChild(label);
  });
}

function applyPlyDefaults() {
  const d = PLY_DEFAULTS_MM[$("ply").value];
  const inch = $("unit").value === "in";
  $("crease").value = inch ? +(d.crease / 25.4).toFixed(3) : d.crease;
  $("bwadd").value = inch ? +(d.bwadd / 25.4).toFixed(3) : d.bwadd;
}

function applyTypeVisibility(type) {
  const rsc = type === "rsc";
  // RSC-only controls: glue flap, slot width, creasing / board width allowances
  document.querySelectorAll(".rsc-only").forEach((el) => { el.hidden = !rsc; });
}

const KEYLINE_CATEGORY_ORDER = ["RSC", "Pizza", "Chicken Box", "Slotted Boxes", "Telescopic Boxes", "Flower", "Tray", "Apparel", "Other"];
const FREE_KEYLINE_CATEGORIES = new Set(["RSC", "Pizza", "Chicken Box"]);
const LOCKED_KEYLINES = {};
const keylineThumbnailCache = new Map();
let activeKeylineCategory = "RSC";

function createPremiumBadge() {
  const badge = document.createElement("span");
  badge.className = "keyline-premium-badge";
  badge.setAttribute("role", "img");
  badge.setAttribute("aria-label", "Premium");

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M2 5.5 5.3 8 8 3.5 10.7 8 14 5.5l-1.2 7H3.2L2 5.5ZM3.2 14h9.6");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-width", "1.5");
  icon.appendChild(path);
  badge.append(icon);
  return badge;
}

function keylineCategoryFor(id) {
  if (id === "rsc") return "RSC";
  const def = KEYLINES[id] || LOCKED_KEYLINES[id] || {};
  if (typeof def.category === "string" && def.category.trim().toLowerCase() === "telescopic boxes") {
    return "Telescopic Boxes";
  }
  if (/fefco/.test(`${id} ${String(def.name || "")}`.toLowerCase())) return "Slotted Boxes";
  if (typeof def.category === "string" && def.category.trim()) {
    const custom = def.category.trim();
    if (["flower box", "sea flow", "sea freight"].includes(custom.toLowerCase())) {
      return "Flower";
    }
    if (custom.toLowerCase() === "epz") return "Apparel";
    const known = KEYLINE_CATEGORY_ORDER.find((name) => name.toLowerCase() === custom.toLowerCase());
    return known || custom;
  }
  const key = String(id || "").toLowerCase();
  const text = `${key} ${String(def.name || "").toLowerCase()}`;
  if (/pizza/.test(text)) return "Pizza";
  if (/flower|pf1|f1|f2|zim|seafreight|sea freight|freight|seaflow|sea flow/.test(text)) {
    return "Flower";
  }
  if (/tray/.test(text)) return "Tray";
  if (/hanger/.test(text)) return "Apparel";
  return "Other";
}

function keylineCategoryLabel(category) {
  return category === "RSC" ? "RSC 0201" : category;
}

function keylineGroups() {
  const groups = new Map([["RSC", ["rsc"]]]);
  [...Object.keys(KEYLINES), ...Object.keys(LOCKED_KEYLINES)].forEach((id) => {
    const category = keylineCategoryFor(id);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(id);
  });
  const extra = [...groups.keys()].filter((name) => !KEYLINE_CATEGORY_ORDER.includes(name)).sort((a, b) => a.localeCompare(b));
  const order = [...KEYLINE_CATEGORY_ORDER.filter((name) => groups.has(name)), ...extra];
  return { groups, order };
}

function selectKeyline(id) {
  if (LOCKED_KEYLINES[id]) {
    window.parent.postMessage(
      { type: "cartonlab:upgrade" },
      window.location.origin,
    );
    return;
  }
  activeKeylineCategory = keylineCategoryFor(id);
  if ($("boxType").value !== id) {
    $("boxType").value = id;
    $("boxType").dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    renderKeylinePicker();
  }
}

function keylineChoiceLabel(def, id) {
  const name = typeof def.name === "string" ? def.name : id;
  return name.match(/^(FEFCO\s+\d{4}(?:-\d+)?)/i)?.[1] || name;
}

function keylineThumbnailSvg(id, def) {
  if (keylineThumbnailCache.has(id)) return keylineThumbnailCache.get(id);

  const refValue = (field, fallback) => {
    const value = Number(def?.params?.[`ref${field}`]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const params = {
    L: id === "rsc" ? RSC_DEFAULTS_MM.L : refValue("L", 300),
    W: id === "rsc" ? RSC_DEFAULTS_MM.W : refValue("W", 200),
    H: id === "rsc" ? RSC_DEFAULTS_MM.H : refValue("H", 150),
    unit: "mm",
    ply: 3,
    crease: 2,
    bwadd: 4,
    glue: 40,
    slot: 10,
    date: "",
    job: "",
    dims: false,
    prec: 1,
    color: "brown",
    type: id,
    inputs: {},
  };

  let model;
  const options = { dims: false, prec: 1, color: "brown", profile: null };
  if (id === "rsc") {
    const geometry = compute(params);
    if (geometry.error) throw new Error(geometry.error);
    model = buildModel(geometry, options);
  } else {
    model = buildKeylineModel(def, params, options);
  }

  const drawingItems = model.items.filter((item) =>
    ["FILL", "CUT", "CREASE"].includes(item.layer),
  );
  const thumbnailModel = finalizeModel(
    drawingItems,
    model.unit,
    model.size,
    model.th,
    model.artH,
  );
  thumbnailModel.size *= 6;
  const svg = toSVG(thumbnailModel, "preview");
  keylineThumbnailCache.set(id, svg);
  return svg;
}

function createLockedKeylinePreview() {
  const preview = document.createElement("span");
  preview.className = "keyline-choice-preview keyline-choice-preview-locked";
  preview.setAttribute("aria-hidden", "true");

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 120 72");
  icon.setAttribute("focusable", "false");
  const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
  shape.setAttribute("d", "M34 19 60 8l26 11v35L60 65 34 54V19Zm0 0 26 12 26-12M60 31v34");
  shape.setAttribute("fill", "none");
  shape.setAttribute("stroke", "currentColor");
  shape.setAttribute("stroke-width", "2");
  icon.appendChild(shape);
  preview.append(icon);

  const label = document.createElement("span");
  label.className = "keyline-choice-preview-label";
  label.textContent = "Premium preview";
  preview.appendChild(label);
  return preview;
}

function createKeylinePreview(id, def, locked) {
  if (locked) return createLockedKeylinePreview();

  const preview = document.createElement("span");
  preview.className = "keyline-choice-preview";
  preview.setAttribute("aria-hidden", "true");
  const image = document.createElement("img");
  image.className = "keyline-choice-thumbnail";
  image.alt = "";
  image.width = 160;
  image.height = 96;
  image.loading = "lazy";

  try {
    const svg = keylineThumbnailSvg(id, def);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    preview.appendChild(image);
  } catch (error) {
    console.error(`Could not render a preview for keyline "${id}":`, error);
    preview.classList.add("keyline-choice-preview-unavailable");
    preview.textContent = "Preview unavailable";
  }
  return preview;
}

function renderKeylinePicker() {
  const tabs = $("keylineTabs");
  const choices = $("keylineChoices");
  if (!tabs || !choices) return;

  const { groups, order } = keylineGroups();
  const selectedType = $("boxType").value || "rsc";
  if (!groups.has(activeKeylineCategory)) activeKeylineCategory = keylineCategoryFor(selectedType);
  if (!groups.has(activeKeylineCategory)) activeKeylineCategory = "RSC";
  choices.classList.toggle("keyline-choices-flower", activeKeylineCategory === "Flower");
  choices.classList.toggle("keyline-choices-slotted", activeKeylineCategory === "Slotted Boxes");

  tabs.replaceChildren();
  const tabButtons = [];
  order.forEach((category, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.id = `keyline-tab-${index}`;
    button.className = "keyline-tab";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "keylineChoices");
    button.setAttribute("aria-selected", String(category === activeKeylineCategory));
    button.tabIndex = category === activeKeylineCategory ? 0 : -1;
    if (FREE_KEYLINE_CATEGORIES.has(category)) {
      button.textContent = keylineCategoryLabel(category);
    } else {
      const label = document.createElement("span");
      label.className = "keyline-tab-label";
      label.textContent = keylineCategoryLabel(category);
      button.append(label, createPremiumBadge());
    }
    button.addEventListener("click", () => {
      activeKeylineCategory = category;
      renderKeylinePicker();
      $("keyline-tab-" + order.indexOf(category))?.focus();
    });
    button.addEventListener("keydown", (event) => {
      let next = -1;
      if (event.key === "ArrowRight") next = (index + 1) % order.length;
      else if (event.key === "ArrowLeft") next = (index - 1 + order.length) % order.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = order.length - 1;
      if (next < 0) return;
      event.preventDefault();
      tabButtons[next].focus();
      tabButtons[next].click();
    });
    tabButtons.push(button);
    tabs.appendChild(button);
  });

  choices.replaceChildren();
  choices.setAttribute("aria-labelledby", `keyline-tab-${order.indexOf(activeKeylineCategory)}`);
  const ids = groups.get(activeKeylineCategory) || [];

  const heading = document.createElement("p");
  heading.className = "keyline-choice-heading";
  heading.textContent = `${keylineCategoryLabel(activeKeylineCategory)} keylines`;
  choices.appendChild(heading);
  ids.forEach((id) => {
    const def = id === "rsc"
      ? { id, name: "RSC" }
      : KEYLINES[id] || LOCKED_KEYLINES[id];
    if (!def) return;
    const locked = Boolean(LOCKED_KEYLINES[id]);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "keyline-choice";
    button.setAttribute("aria-pressed", String(id === selectedType));
    if (locked) {
      button.classList.add("keyline-choice-locked");
      button.setAttribute("aria-label", `${def.name || id}, Premium keyline`);
    }

    button.appendChild(createKeylinePreview(id, def, locked));
    const label = document.createElement("span");
    label.className = "keyline-choice-label";
    const name = document.createElement("span");
    name.className = "keyline-choice-name";
    name.textContent = keylineChoiceLabel(def, id);
    label.appendChild(name);
    if (locked) label.appendChild(createPremiumBadge());
    button.appendChild(label);
    button.addEventListener("click", () => selectKeyline(id));
    choices.appendChild(button);
  });
}

function showError(msg) {
  const err = $("error");
  err.textContent = msg;
  err.hidden = false;
  $("preview").innerHTML = "";
  const carton3DViewer = $("carton3dViewer");
  if (carton3DViewer) carton3DViewer.hidden = true;
  cancelCarton3DFoldAnimation();
  const carton3DOpen = $("carton3dOpen");
  if (carton3DOpen) {
    carton3DOpen.hidden = false;
    carton3DOpen.disabled = true;
    carton3DOpen.setAttribute("aria-expanded", "false");
  }
  current = null;
  selectedItem = null;
  undoStack = []; redoStack = [];
  updateHistoryButtons();
}

// Size fields (L, W, H, glue flap, slot width, keyline inputs such as the notch) redraw the preview
// after a pause in typing. Waiting ~0.35 s means typing "1040" redraws once, not four times,
// and half-typed values like "1" or "10" are never drawn.
/* ---------- Preview viewport: zoom, move, fit ----------
   The preview is a window onto the drawing. We change the SVG's viewBox (so it stays sharp at any zoom)
   and tell the CSS the current scale (--s, screen pixels per drawing unit) so line widths stay constant on screen.
   "auto" means: re-fit to the window whenever the drawing is redrawn. Once you zoom or move it, your view is kept
   while you edit numbers; Fit, double-click, a new box type or a unit change go back to auto. Downloads always
   contain the whole drawing, whatever the view. */
const view = { auto: true, s: 1, cx: 0, cy: 0 };
const MAX_ZOOM_OVER_FIT = 120;
const carton3DView = { yaw: -0.7, pitch: 0.55, zoom: 1, progress: 1, drag: null, animationFrame: null, keylineType: null };
let selectedItem = null;
let editPoints = [];
let undoStack = [];
let redoStack = [];
let artworkImages = [];
let artworkTexts = [];
let selectedArtworkImageId = null;
let selectedArtworkTextId = null;
let nextArtworkImageId = 1;
let artworkDrag = null;
const GRID_NS = "http://www.w3.org/2000/svg";

// the drawing area is the inside of the preview box (without its border)
function stage() {
  const el = $("preview");
  const r = el.getBoundingClientRect();
  return { w: el.clientWidth, h: el.clientHeight, left: r.left + el.clientLeft, top: r.top + el.clientTop };
}
function fitScale() {
  const { w, h } = stage();
  const b = current.model.box;
  return 0.97 * Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY));
}
function actualScale() { return $("unit").value === "in" ? 96 : 96 / 25.4; } // CSS px per drawing unit at 100%
function fitView() {
  const b = current.model.box;
  view.s = fitScale();
  view.cx = (b.minX + b.maxX) / 2;
  view.cy = (b.minY + b.maxY) / 2;
  view.auto = true;
}
function applyView() {
  const svg = $("preview").querySelector("svg");
  if (!svg || !current) return;
  const { w, h } = stage();
  if (w < 2 || h < 2) return;
  if (view.auto) fitView();
  const vw = w / view.s, vh = h / view.s;
  svg.setAttribute("viewBox", `${view.cx - vw / 2} ${view.cy - vh / 2} ${vw} ${vh}`);
  svg.style.setProperty("--s", String(view.s));
  updateGrid(svg, vw, vh);
  updateEditHandles(svg);
  updateArtworkControls(svg);
  $("zoomPct").textContent = Math.round((view.s / actualScale()) * 100) + "%";
}
function adjustCarton3DZoom(factor) {
  carton3DView.zoom = Math.max(0.5, Math.min(3, carton3DView.zoom * factor));
  renderCarton3D();
}
function cancelCarton3DFoldAnimation() {
  if (carton3DView.animationFrame !== null) {
    cancelAnimationFrame(carton3DView.animationFrame);
    carton3DView.animationFrame = null;
  }
}
function animateCartonFold() {
  cancelCarton3DFoldAnimation();
  carton3DView.keylineType = readParams().type;
  carton3DView.progress = 0;
  renderCarton3D();
  if ($("carton3dReplay").disabled) return;
  const startedAt = performance.now();
  const duration = 2200;
  const step = (now) => {
    carton3DView.progress = Math.min(1, (now - startedAt) / duration);
    renderCarton3D();
    if (carton3DView.progress < 1) carton3DView.animationFrame = requestAnimationFrame(step);
    else carton3DView.animationFrame = null;
  };
  carton3DView.animationFrame = requestAnimationFrame(step);
}
function foldValue(expression, env, unitFactor, label) {
  const value = typeof expression === "number" ? expression : evalExpr(expression, env);
  if (!Number.isFinite(value)) throw new Error(`Invalid ${label} in fold metadata.`);
  return value * unitFactor;
}
function foldingEnvironment(params, definition, unitFactor) {
  const env = {
    L: params.L / unitFactor,
    W: params.W / unitFactor,
    H: params.H / unitFactor,
    pi: Math.PI,
  };
  (definition.inputs || []).forEach((input) => {
    const raw = params.inputs && params.inputs[input.id] !== undefined
      ? params.inputs[input.id]
      : input.default * unitFactor;
    env[input.id] = raw / unitFactor;
  });
  Object.keys(definition.params || {}).forEach((name) => {
    const expression = definition.params[name];
    env[name] = typeof expression === "number" ? expression : evalExpr(expression, env);
  });
  return env;
}
function hasCartonFoldRule(type) {
  if (type === "rsc") return true;
  const definition = KEYLINES[type];
  return !!definition && !!definition.folding &&
    ["slotted-box", "panel-network"].includes(definition.folding.type);
}
function cartonPanelNetworkPanels(folding, env, unitFactor) {
  const definitions = folding.panels;
  if (!Array.isArray(definitions) || definitions.length < 2) {
    throw new Error("Panel-network fold metadata needs at least two panels.");
  }
  const byId = new Map();
  definitions.forEach((definition) => {
    if (!definition || typeof definition.id !== "string" || !definition.id || byId.has(definition.id)) {
      throw new Error("Panel-network fold metadata has a missing or duplicate panel id.");
    }
    byId.set(definition.id, definition);
  });
  if (typeof folding.basePanel !== "string" || !byId.has(folding.basePanel)) {
    throw new Error("Panel-network fold metadata must identify an existing base panel.");
  }

  const panels = definitions.map((definition, index) => {
    if (!Array.isArray(definition.points) || definition.points.length < 3) {
      throw new Error(`Fold panel "${definition.id}" needs at least three points.`);
    }
    const points = definition.points.map((point, pointIndex) => {
      if (!Array.isArray(point) || point.length !== 2) {
        throw new Error(`Fold panel "${definition.id}" has an invalid point ${pointIndex + 1}.`);
      }
      return [
        foldValue(point[0], env, unitFactor, `panel "${definition.id}" x coordinate`),
        0,
        -foldValue(point[1], env, unitFactor, `panel "${definition.id}" y coordinate`),
      ];
    });
    const isBase = definition.id === folding.basePanel;
    const parentId = definition.parent;
    if (isBase ? parentId !== undefined && parentId !== null : typeof parentId !== "string" || !byId.has(parentId)) {
      throw new Error(`Fold panel "${definition.id}" has an invalid parent.`);
    }
    const hingeDefinition = definition.hinge;
    if (isBase ? hingeDefinition !== undefined : !Array.isArray(hingeDefinition) || hingeDefinition.length !== 2) {
      throw new Error(`Fold panel "${definition.id}" has an invalid hinge.`);
    }
    const hinge = isBase ? null : hingeDefinition.map((point, pointIndex) => {
      if (!Array.isArray(point) || point.length !== 2) {
        throw new Error(`Fold panel "${definition.id}" has an invalid hinge point ${pointIndex + 1}.`);
      }
      return [
        foldValue(point[0], env, unitFactor, `panel "${definition.id}" hinge x coordinate`),
        0,
        -foldValue(point[1], env, unitFactor, `panel "${definition.id}" hinge y coordinate`),
      ];
    });
    if (hinge && Math.hypot(
      hinge[1][0] - hinge[0][0],
      hinge[1][1] - hinge[0][1],
      hinge[1][2] - hinge[0][2],
    ) < 1e-8) {
      throw new Error(`Fold panel "${definition.id}" has a zero-length hinge.`);
    }
    const order = isBase
      ? 0
      : foldValue(definition.order === undefined ? index : definition.order, env, 1, `panel "${definition.id}" fold order`);
    if (!isBase && typeof definition.angle !== "number" && typeof definition.angle !== "string") {
      throw new Error(`Fold panel "${definition.id}" needs an angle.`);
    }
    const angle = isBase
      ? 0
      : foldValue(definition.angle, env, 1, `panel "${definition.id}" fold angle`);
    const foldDepth = !isBase && ["top-flap", "bottom-flap"].includes(definition.kind)
      ? definition.foldDepth === undefined
        ? Math.max(...points.map((point) => Math.abs(
          (hinge[1][2] - hinge[0][2]) * (point[0] - hinge[0][0]) -
          (hinge[1][0] - hinge[0][0]) * (point[2] - hinge[0][2]),
        ))) / Math.hypot(hinge[1][0] - hinge[0][0], hinge[1][2] - hinge[0][2])
        : foldValue(definition.foldDepth, env, unitFactor, `panel "${definition.id}" fold depth`)
      : 0;
    if (!Number.isFinite(order) || order < 0 || (!isBase && (!Number.isFinite(angle) || angle === 0))) {
      throw new Error(`Fold panel "${definition.id}" needs a non-negative order and non-zero angle.`);
    }
    if (!Number.isFinite(foldDepth) || foldDepth < 0) {
      throw new Error(`Fold panel "${definition.id}" has an invalid fold depth.`);
    }
    return {
      id: definition.id,
      kind: definition.kind || "panel",
      index,
      points,
      parentId: isBase ? null : parentId,
      hinge,
      angle,
      order,
      foldDepth,
      start: 0,
      end: 1,
    };
  });
  const panelById = new Map(panels.map((panel) => [panel.id, panel]));
  const base = panelById.get(folding.basePanel);
  if (base.parentId !== null) throw new Error("The base fold panel cannot have a parent.");
  const visiting = new Set();
  const visited = new Set();
  const visit = (panel) => {
    if (visiting.has(panel.id)) throw new Error(`Fold panel hierarchy contains a cycle at "${panel.id}".`);
    if (visited.has(panel.id)) return;
    visiting.add(panel.id);
    if (panel.parentId !== null) {
      const parent = panelById.get(panel.parentId);
      visit(parent);
    }
    visiting.delete(panel.id);
    visited.add(panel.id);
  };
  panels.forEach(visit);
  if (visited.size !== panels.length) throw new Error("Every fold panel must connect to the base panel.");
  panels.forEach((panel) => {
    panel.parent = panel.parentId === null ? null : panelById.get(panel.parentId);
    delete panel.parentId;
  });

  const foldable = panels.filter((panel) => panel.hinge);
  if (foldable.length === 0) throw new Error("Panel-network fold metadata has no fold hinges.");
  const flapKind = (panel) => ["top-flap", "bottom-flap"].includes(panel.kind);
  foldable.sort((a, b) =>
    Number(flapKind(a)) - Number(flapKind(b)) ||
    (flapKind(a) ? a.foldDepth - b.foldDepth : a.order - b.order) ||
    a.order - b.order ||
    a.index - b.index);
  const stageGroups = [];
  foldable.forEach((panel) => {
    const previous = stageGroups[stageGroups.length - 1];
    const sameStage = previous &&
      flapKind(previous[0]) === flapKind(panel) &&
      (flapKind(panel)
        ? Math.abs(previous[0].foldDepth - panel.foldDepth) < 1e-8
        : previous[0].order === panel.order);
    if (sameStage) previous.push(panel);
    else stageGroups.push([panel]);
  });
  const stageForPanel = new Map();
  stageGroups.forEach((group, stageIndex) => {
    group.forEach((panel) => stageForPanel.set(panel.id, stageIndex));
  });
  foldable.forEach((panel) => {
    if (panel.parent && panel.parent.hinge && stageForPanel.get(panel.parent.id) >= stageForPanel.get(panel.id)) {
      throw new Error(`Fold panel "${panel.id}" must fold after its parent.`);
    }
  });
  const step = 0.95 / stageGroups.length;
  stageGroups.forEach((group, stageIndex) => {
    group.forEach((panel) => {
      panel.start = 0.04 + step * stageIndex;
      panel.end = panel.start + step;
    });
  });
  return panels;
}
function cartonFoldConfig(params) {
  if (params.type === "rsc") {
    const geometry = compute(params);
    if (geometry.error) return null;
    return {
      wallWidths: [geometry.L, geometry.W, geometry.L, geometry.W],
      wallHeight: geometry.H,
      topFlapDepths: [geometry.F, geometry.F, geometry.F, geometry.F],
      bottomFlapDepths: [geometry.F, geometry.F, geometry.F, geometry.F],
      glueFlapWidth: geometry.G,
      glueTrim: Math.max(0, geometry.cut[0][1] - geometry.F),
      slotGap: geometry.s,
    };
  }

  const definition = KEYLINES[params.type];
  if (!definition) return null;
  const folding = definition && definition.folding;
  if (!folding) return null;

  const unitFactor = definition.units === "any" ? 1 : params.unit === "in" ? 1 / 25.4 : 1;
  const env = foldingEnvironment(params, definition, unitFactor);
  if (folding.type === "panel-network") {
    return { panels: cartonPanelNetworkPanels(folding, env, unitFactor) };
  }
  if (folding.type !== "slotted-box") return null;

  const wallWidths = (folding.wallWidths || []).map((value, index) =>
    foldValue(value, env, unitFactor, `wall ${index + 1} width`));
  const topFlapDepths = (folding.topFlapDepths || []).map((value, index) =>
    foldValue(value, env, unitFactor, `top flap ${index + 1} depth`));
  const bottomFlapDepths = (folding.bottomFlapDepths || []).map((value, index) =>
    foldValue(value, env, unitFactor, `bottom flap ${index + 1} depth`));
  const wallHeight = foldValue(folding.wallHeight, env, unitFactor, "wall height");
  const glueFlapWidth = folding.glueFlapWidth === undefined
    ? 0
    : foldValue(folding.glueFlapWidth, env, unitFactor, "glue flap width");
  const slotGap = folding.slotGap === undefined
    ? 0
    : foldValue(folding.slotGap, env, unitFactor, "slot gap");
  if (
    wallWidths.length !== 4 ||
    topFlapDepths.length !== wallWidths.length ||
    bottomFlapDepths.length !== wallWidths.length ||
    ![...wallWidths, wallHeight, ...topFlapDepths, ...bottomFlapDepths].every((value) => value > 0) ||
    glueFlapWidth < 0 ||
    slotGap < 0
  ) {
    throw new Error(`Keyline "${params.type}" has incomplete fold metadata.`);
  }
  return { wallWidths, wallHeight, topFlapDepths, bottomFlapDepths, glueFlapWidth, slotGap };
}
function cartonFoldPanels(params) {
  const config = cartonFoldConfig(params);
  if (!config) return null;
  if (Array.isArray(config.panels)) return config;
  const panels = [];
  const flapPanels = [];
  const height = config.wallHeight;
  const netPoint = (x, y) => [x, 0, height - y];
  const assignFoldWindows = (sequence, start, end) => {
    const step = (end - start) / sequence.length;
    sequence.forEach((panel, index) => {
      panel.start = start + step * index;
      panel.end = start + step * (index + 1);
    });
  };
  const addPanel = (panel) => {
    panels.push(panel);
    return panel;
  };

  const walls = [];
  let x = 0;
  config.wallWidths.forEach((width, index) => {
    const xEnd = x + width;
    const wall = addPanel({
      id: `wall-${index + 1}`,
      kind: "wall",
      index,
      creasePosition: x,
      points: [
        netPoint(x, 0),
        netPoint(xEnd, 0),
        netPoint(xEnd, height),
        netPoint(x, height),
      ],
      parent: index === 0 ? null : walls[index - 1],
      hinge: index === 0 ? null : [netPoint(x, height), netPoint(x, 0)],
      angle: index === 0 ? 0 : Math.PI / 2,
      start: 0,
      end: 1,
    });
    walls.push(wall);

    const inset = config.slotGap / 2;
    const flapStart = x + (index === 0 ? 0 : inset);
    const flapEnd = xEnd - (index === config.wallWidths.length - 1 ? 0 : inset);
    if (flapEnd <= flapStart) throw new Error("Fold metadata leaves no room for a flap.");
    const topDepth = config.topFlapDepths[index];
    const bottomDepth = config.bottomFlapDepths[index];
    flapPanels.push(addPanel({
      id: `top-flap-${index + 1}`,
      kind: "top-flap",
      index,
      creasePosition: (flapStart + flapEnd) / 2,
      foldDepth: topDepth,
      points: [
        netPoint(flapStart, 0),
        netPoint(flapEnd, 0),
        netPoint(flapEnd, -topDepth),
        netPoint(flapStart, -topDepth),
      ],
      parent: wall,
      hinge: [netPoint(flapStart, 0), netPoint(flapEnd, 0)],
      angle: -Math.PI / 2,
      start: 0,
      end: 1,
    }));
    flapPanels.push(addPanel({
      id: `bottom-flap-${index + 1}`,
      kind: "bottom-flap",
      index,
      creasePosition: (flapStart + flapEnd) / 2,
      foldDepth: bottomDepth,
      points: [
        netPoint(flapStart, height),
        netPoint(flapEnd, height),
        netPoint(flapEnd, height + bottomDepth),
        netPoint(flapStart, height + bottomDepth),
      ],
      parent: wall,
      hinge: [netPoint(flapStart, height), netPoint(flapEnd, height)],
      angle: Math.PI / 2,
      start: 0,
      end: 1,
    }));
    x = xEnd;
  });

  let glueFlap = null;
  if (config.glueFlapWidth > 0) {
    const trim = Math.min(config.glueTrim || 0, config.glueFlapWidth / 2, height / 4);
    glueFlap = addPanel({
      id: "glue-flap",
      kind: "glue-flap",
      index: 0,
      creasePosition: 0,
      points: [
        netPoint(-config.glueFlapWidth, trim),
        netPoint(-config.glueFlapWidth + trim, 0),
        netPoint(0, 0),
        netPoint(0, height),
        netPoint(-config.glueFlapWidth + trim, height),
        netPoint(-config.glueFlapWidth, height - trim),
      ],
      parent: walls[0],
      hinge: [netPoint(0, height), netPoint(0, 0)],
      angle: -Math.PI / 2,
      start: 0,
      end: 1,
    });
  }

  const netCenter = x / 2;
  const creaseOrder = (a, b) =>
    Math.abs(a.creasePosition - netCenter) - Math.abs(b.creasePosition - netCenter) ||
    a.creasePosition - b.creasePosition;
  const wallFolds = walls.filter((wall) => wall.hinge);
  if (glueFlap) wallFolds.push(glueFlap);
  wallFolds.sort((a, b) =>
    Number(a.kind === "glue-flap") - Number(b.kind === "glue-flap") ||
    a.index - b.index ||
    creaseOrder(a, b));
  assignFoldWindows(wallFolds, 0.04, 0.35);

  flapPanels.sort((a, b) =>
    a.foldDepth - b.foldDepth ||
    creaseOrder(a, b) ||
    a.index - b.index ||
    (a.kind === b.kind ? 0 : a.kind === "top-flap" ? -1 : 1));
  assignFoldWindows(flapPanels, 0.35, 0.99);
  return { config, panels };
}
function rotateAroundHinge(point, hinge, angle) {
  const [a, b] = hinge;
  const axis = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const axisLength = Math.hypot(axis[0], axis[1], axis[2]);
  if (axisLength < 1e-8 || Math.abs(angle) < 1e-8) return point;
  const u = axis.map((value) => value / axisLength);
  const v = [point[0] - a[0], point[1] - a[1], point[2] - a[2]];
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  return [
    a[0] + v[0] * cosine + cross[0] * sine + u[0] * dot * (1 - cosine),
    a[1] + v[1] * cosine + cross[1] * sine + u[1] * dot * (1 - cosine),
    a[2] + v[2] * cosine + cross[2] * sine + u[2] * dot * (1 - cosine),
  ];
}
function transformFoldPoint(panel, point, progress) {
  let result = point;
  for (let currentPanel = panel; currentPanel; currentPanel = currentPanel.parent) {
    if (!currentPanel.hinge) continue;
    const t = Math.max(0, Math.min(1, (progress - currentPanel.start) / (currentPanel.end - currentPanel.start)));
    const eased = t * t * (3 - 2 * t);
    result = rotateAroundHinge(result, currentPanel.hinge, currentPanel.angle * eased);
  }
  return result;
}
function renderCarton3DMessage(message, controlsEnabled) {
  const svg = $("carton3dScene");
  const label = document.createElementNS(GRID_NS, "text");
  label.setAttribute("x", "140");
  label.setAttribute("y", "75");
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("fill", "#64748b");
  label.setAttribute("font-size", "11");
  label.textContent = message;
  svg.replaceChildren(label);
  ["carton3dReplay", "carton3dRotateLeft", "carton3dRotateRight", "carton3dZoomOut", "carton3dZoomIn"].forEach((id) => {
    $(id).disabled = !controlsEnabled;
  });
}
function renderCarton3D() {
  const viewer = $("carton3dViewer");
  if (!viewer || viewer.hidden || !current) return;

  const p = readParams();
  const modelChanged = carton3DView.keylineType !== p.type;
  carton3DView.keylineType = p.type;
  if (modelChanged) {
    animateCartonFold();
    return;
  }

  let scene;
  try {
    scene = cartonFoldPanels(p);
  } catch (error) {
    console.error("Could not build the 3D fold view:", error);
    renderCarton3DMessage(`Fold data error: ${error.message}`, false);
    return;
  }
  if (!scene) {
    $("carton3dScene").setAttribute("aria-label", `Fold animation is not configured for ${p.type}.`);
    $("carton3dDimensions").textContent = "Exact folding rules unavailable";
    renderCarton3DMessage("Exact folding rules are not configured for this keyline", false);
    return;
  }
  $("carton3dDimensions").textContent = `${fmt(p.L, p.unit)} × ${fmt(p.W, p.unit)} × ${fmt(p.H, p.unit)} ${p.unit}`;
  renderCarton3DMessage("", true);

  const cosYaw = Math.cos(carton3DView.yaw), sinYaw = Math.sin(carton3DView.yaw);
  const cosPitch = Math.cos(carton3DView.pitch), sinPitch = Math.sin(carton3DView.pitch);
  const project = ([x, y, z]) => {
    const rotatedX = x * cosYaw - y * sinYaw;
    const rotatedY = x * sinYaw + y * cosYaw;
    return {
      x: rotatedX,
      y: -(z * cosPitch + rotatedY * sinPitch),
      depth: -rotatedY * cosPitch + z * sinPitch,
    };
  };
  const flatPoints = scene.panels.flatMap((panel) => panel.points.map(project));
  const fitScale = (points) => {
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    return Math.min(230 / Math.max(maxX - minX, 1), 112 / Math.max(maxY - minY, 1));
  };
  const flatScale = fitScale(flatPoints);
  const flapDepths = scene.panels
    .filter((panel) => Number.isFinite(panel.foldDepth))
    .map((panel) => panel.foldDepth);
  const shortestFlap = Math.min(...flapDepths);
  const flapDepthRange = Math.max(...flapDepths) - shortestFlap;
  const faces = scene.panels.map((panel) => {
    const foldT = Math.max(0, Math.min(1,
      (carton3DView.progress - panel.start) / (panel.end - panel.start)));
    const foldEase = foldT * foldT * (3 - 2 * foldT);
    const flapLayerOffset = Number.isFinite(panel.foldDepth) && flapDepthRange > 0
      ? ((panel.foldDepth - shortestFlap) / flapDepthRange) * 3 * foldEase
      : 0;
    const outwardDirection = panel.kind === "top-flap" ? 1 : panel.kind === "bottom-flap" ? -1 : 0;
    const projected = panel.points.map((point) => {
      const foldedPoint = [...transformFoldPoint(panel, point, carton3DView.progress)];
      foldedPoint[2] += flapLayerOffset * outwardDirection;
      return project(foldedPoint);
    });
    return {
      panel,
      points: projected,
      depth: projected.reduce((sum, point) => sum + point.depth, 0) / projected.length,
    };
  }).sort((a, b) => a.depth - b.depth);
  let orderedFaces = faces;
  if (carton3DView.progress >= 1) {
    const outerFlapKind = carton3DView.pitch >= 0 ? "top-flap" : "bottom-flap";
    const outerFlaps = faces
      .filter((face) => face.panel.kind === outerFlapKind)
      .sort((a, b) => a.panel.foldDepth - b.panel.foldDepth || a.depth - b.depth);
    if (outerFlaps.length) {
      orderedFaces = [
        ...faces.filter((face) => face.panel.kind !== outerFlapKind),
        ...outerFlaps,
      ];
    }
  }
  const finalPoints = scene.panels.flatMap((panel) =>
    panel.points.map((point) => project(transformFoldPoint(panel, point, 1))));
  const currentPoints = faces.flatMap((face) => face.points);
  const targetScale = flatScale + (fitScale(finalPoints) - flatScale) *
    carton3DView.progress * carton3DView.progress * (3 - 2 * carton3DView.progress);
  const scale = Math.min(fitScale(currentPoints), targetScale) * carton3DView.zoom;
  const palette = p.color === "white"
    ? { walls: ["#e2e8f0", "#cbd5e1", "#f1f5f9", "#dbe4ec"], top: "#f8fafc", bottom: "#cbd5e1", glue: "#dbe4ec", edge: "#64748b" }
    : { walls: ["#d5ad81", "#bc8e5e", "#d5ad81", "#bc8e5e"], top: "#f2d5b0", bottom: "#c29769", glue: "#c59462", edge: "#705139" };
  const minX = Math.min(...currentPoints.map((point) => point.x));
  const maxX = Math.max(...currentPoints.map((point) => point.x));
  const minY = Math.min(...currentPoints.map((point) => point.y));
  const maxY = Math.max(...currentPoints.map((point) => point.y));
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  const svg = $("carton3dScene");
  const polygons = orderedFaces.map((face) => {
    const element = document.createElementNS(GRID_NS, "polygon");
    element.setAttribute("data-fold-panel", face.panel.id);
    element.setAttribute("points", face.points.map((point) =>
      `${140 + (point.x - centerX) * scale},${75 + (point.y - centerY) * scale}`).join(" "));
    const color = face.panel.kind === "wall"
      ? palette.walls[face.panel.index % palette.walls.length]
      : face.panel.kind === "top-flap" ? palette.top
        : face.panel.kind === "bottom-flap" ? palette.bottom
          : face.panel.kind === "glue-flap" ? palette.glue
            : palette.top;
    element.setAttribute("fill", color);
    element.setAttribute("stroke", palette.edge);
    element.setAttribute("stroke-width", "1.1");
    element.setAttribute("stroke-linejoin", "round");
    return element;
  });
  svg.setAttribute("aria-label", `Animated ${p.type} carton, ${fmt(p.L, p.unit)} by ${fmt(p.W, p.unit)} by ${fmt(p.H, p.unit)} ${p.unit}. Drag to rotate; use the mouse wheel or controls to zoom.`);
  svg.replaceChildren(...polygons);
  $("carton3dZoomLevel").textContent = `${Math.round(carton3DView.zoom * 100)}%`;
}
function setPreview(markup) {
  $("preview").innerHTML = markup;
  const svg = $("preview").querySelector("svg");
  if (svg) {
    const defs = document.createElementNS(GRID_NS, "defs");
    const pattern = document.createElementNS(GRID_NS, "pattern");
    pattern.id = "keyline-grid-pattern";
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    const gridPath = document.createElementNS(GRID_NS, "path");
    gridPath.id = "keyline-grid-path";
    gridPath.setAttribute("fill", "none"); gridPath.setAttribute("stroke", "#94a3b8");
    gridPath.setAttribute("stroke-opacity", ".5"); pattern.appendChild(gridPath); defs.appendChild(pattern);
    svg.insertBefore(defs, svg.firstChild);
    const grid = document.createElementNS(GRID_NS, "rect");
    grid.id = "keyline-grid"; grid.setAttribute("pointer-events", "none");
    grid.setAttribute("fill", "url(#keyline-grid-pattern)"); svg.insertBefore(grid, defs.nextSibling);
    const controls = document.createElementNS(GRID_NS, "g");
    controls.id = "edit-handles";
    svg.appendChild(controls);
    const artworkControls = document.createElementNS(GRID_NS, "g");
    artworkControls.id = "artwork-image-controls";
    svg.appendChild(artworkControls);
    renderArtworkImages(svg);
    updateArtworkControls(svg);
  }
  applyView();
  renderCarton3D();
}
function gridStep() {
  const value = parseFloat($("gridSpacing").value);
  return Number.isFinite(value) && value >= 0.01 ? value : ($("unit").value === "in" ? 10 / 25.4 : 10);
}
function updateGrid(svg, width, height) {
  const grid = svg.querySelector("#keyline-grid"), pattern = svg.querySelector("#keyline-grid-pattern");
  const path = svg.querySelector("#keyline-grid-path");
  if (!grid || !pattern || !path) return;
  const step = gridStep(), sw = 0.65 / view.s;
  pattern.setAttribute("width", step); pattern.setAttribute("height", step);
  path.setAttribute("d", `M ${step} 0 H 0 V ${step}`); path.setAttribute("stroke-width", sw);
  grid.setAttribute("x", view.cx - width / 2); grid.setAttribute("y", view.cy - height / 2);
  grid.setAttribute("width", width); grid.setAttribute("height", height);
  grid.style.display = $("showGrid").checked ? "block" : "none";
}
function pointAt(e) {
  const svg = $("preview").querySelector("svg"), p = svg.createSVGPoint();
  p.x = e.clientX; p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
function geometrySnapshot() { return JSON.parse(JSON.stringify(current.model.items)); }
function updateHistoryButtons() {
  $("undoEdit").disabled = undoStack.length === 0;
  $("redoEdit").disabled = redoStack.length === 0;
}
function restoreGeometry(items) {
  const m = current.model;
  current.model = finalizeModel(items, m.unit, m.size, m.th, m.artH);
  view.auto = false;
  setPreview(toSVG(current.model, "preview"));
  updateHistoryButtons();
}
function undoGeometry() {
  if (!current || !undoStack.length) return;
  redoStack.push(geometrySnapshot());
  restoreGeometry(undoStack.pop());
}
function redoGeometry() {
  if (!current || !redoStack.length) return;
  undoStack.push(geometrySnapshot());
  restoreGeometry(redoStack.pop());
}
function editDescriptors(item) {
  const points = [];
  const add = (get, set) => points.push({ get, set });
  if (item.t === "line") {
    add(() => [item.x1, item.y1], (x, y) => { item.x1 = x; item.y1 = y; });
    add(() => [item.x2, item.y2], (x, y) => { item.x2 = x; item.y2 = y; });
  } else if (item.t === "poly") {
    item.pts.forEach((p, index) => add(() => item.pts[index], (x, y) => { item.pts[index] = [x, y]; }));
  } else if (item.t === "path") {
    item.segs.forEach((seg, index) => {
      for (let offset = 1; offset < seg.length; offset += 2) {
        const k = offset;
        add(() => [seg[k], seg[k + 1]], (x, y) => { item.segs[index][k] = x; item.segs[index][k + 1] = y; });
      }
    });
  }
  return points;
}
function translatedItem(source, target, dx, dy) {
  if (source.t === "line") { target.x1 = source.x1 + dx; target.y1 = source.y1 + dy; target.x2 = source.x2 + dx; target.y2 = source.y2 + dy; }
  else if (source.t === "text") { target.x = source.x + dx; target.y = source.y + dy; }
  else if (source.t === "poly") target.pts = source.pts.map(([x, y]) => [x + dx, y + dy]);
  else if (source.t === "path") target.segs = source.segs.map((seg) => seg[0] === "Z" ? seg.slice() : [seg[0], ...seg.slice(1).flatMap((v, i, a) => i % 2 === 0 ? [v + dx, a[i + 1] + dy] : [])]);
}
function updateEditHandles(svg = $("preview").querySelector("svg")) {
  const group = svg?.querySelector("#edit-handles");
  if (!group || !current) return;
  group.replaceChildren();
  const item = current.model.items[selectedItem];
  editPoints = item && (item.layer === "CUT" || item.layer === "CREASE") ? editDescriptors(item) : [];
  editPoints.forEach((descriptor, index) => {
    const [x, y] = descriptor.get();
    const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    handle.setAttribute("cx", x); handle.setAttribute("cy", y);
    handle.setAttribute("r", 5.5 / view.s); handle.setAttribute("fill", "white");
    handle.setAttribute("stroke", "#0f6cbd"); handle.setAttribute("stroke-width", 1.5 / view.s);
    handle.setAttribute("data-edit-point", index); handle.classList.add("keyline-edit-handle");
    group.appendChild(handle);
  });
}
function artworkBounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  (current?.model.items || []).filter((item) => item.layer === "CUT").forEach((item) => {
    if (item.t === "line") { add(item.x1, item.y1); add(item.x2, item.y2); }
    else if (item.t === "poly") item.pts.forEach(([x, y]) => add(x, y));
    else if (item.t === "path") item.segs.forEach((seg) => {
      for (let i = 1; i < seg.length; i += 2) add(seg[i], seg[i + 1]);
    });
  });
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : current.model.box;
}
function artworkGroupPosition(svg, group) {
  const cut = svg.querySelector("#CUT");
  if (!cut) { svg.appendChild(group); return; }
  const cutItems = current.model.items.filter((item) => item.layer === "CUT");
  const firstStroke = cutItems.findIndex((item) => !item.fill);
  if (firstStroke >= 0) cut.insertBefore(group, cut.children[firstStroke] || null);
  else cut.appendChild(group);
}
function renderArtworkImages(svg = $("preview").querySelector("svg")) {
  if (!svg || !current) return;
  svg.querySelector("#artwork-images")?.remove();
  if (!artworkImages.length && !artworkTexts.length) return;
  const layer = document.createElementNS(GRID_NS, "g");
  layer.id = "artwork-images";
  artworkImages.forEach((image) => {
    const node = document.createElementNS(GRID_NS, "image");
    node.setAttribute("href", image.href);
    node.setAttribute("x", image.x); node.setAttribute("y", image.y);
    node.setAttribute("width", image.width); node.setAttribute("height", image.height);
    node.setAttribute("preserveAspectRatio", "none");
    node.setAttribute("data-art-image-id", image.id);
    node.setAttribute("aria-label", image.name);
    layer.appendChild(node);
  });
  artworkTexts.forEach((text) => {
    const node = document.createElementNS(GRID_NS, "text");
    node.setAttribute("x", text.x); node.setAttribute("y", text.y);
    node.setAttribute("font-family", text.fontFamily); node.setAttribute("font-size", text.fontSize);
    node.setAttribute("fill", text.fill); node.setAttribute("text-anchor", "middle");
    node.setAttribute("dominant-baseline", "middle"); node.setAttribute("data-art-text-id", text.id);
    node.textContent = text.text;
    layer.appendChild(node);
  });
  artworkGroupPosition(svg, layer);
}
function updateArtworkControls(svg = $("preview").querySelector("svg")) {
  const selectedImage = artworkImages.find((image) => image.id === selectedArtworkImageId);
  const selectedText = artworkTexts.find((text) => text.id === selectedArtworkTextId);
  const selected = selectedImage || selectedText;
  const group = svg?.querySelector("#artwork-image-controls");
  if (!group) return;
  group.replaceChildren();
  if (!selected) return;
  const stroke = 1.5 / view.s, size = 7 / view.s;
  const frame = document.createElementNS(GRID_NS, "rect");
  if (selectedImage) {
    frame.setAttribute("x", selectedImage.x); frame.setAttribute("y", selectedImage.y);
    frame.setAttribute("width", selectedImage.width); frame.setAttribute("height", selectedImage.height);
  } else {
    const node = svg.querySelector(`[data-art-text-id="${selectedText.id}"]`);
    if (!node) return;
    const bounds = node.getBBox(), pad = 3 / view.s;
    frame.setAttribute("x", bounds.x - pad); frame.setAttribute("y", bounds.y - pad);
    frame.setAttribute("width", bounds.width + pad * 2); frame.setAttribute("height", bounds.height + pad * 2);
  }
  frame.setAttribute("fill", "none"); frame.setAttribute("stroke", "#0f6cbd");
  frame.setAttribute("stroke-width", stroke); frame.setAttribute("stroke-dasharray", `${4 / view.s} ${2 / view.s}`);
  frame.setAttribute("pointer-events", "none"); group.appendChild(frame);
  if (!selectedImage) return;
  const handle = document.createElementNS(GRID_NS, "rect");
  handle.setAttribute("x", selectedImage.x + selectedImage.width - size);
  handle.setAttribute("y", selectedImage.y + selectedImage.height - size);
  handle.setAttribute("width", size * 2); handle.setAttribute("height", size * 2);
  handle.setAttribute("rx", size / 3); handle.setAttribute("fill", "white");
  handle.setAttribute("stroke", "#0f6cbd"); handle.setAttribute("stroke-width", stroke);
  handle.setAttribute("data-art-scale", selectedImage.id); handle.classList.add("artwork-scale-handle");
  group.appendChild(handle);
}
function loadArtworkTextControls(text) {
  $("artworkTextValue").value = text.text;
  $("artworkFont").value = text.fontFamily;
  $("artworkTextSize").value = text.fontSize;
  $("artworkTextColor").value = text.fill;
}
function openArtworkTextDialog() {
  if (!current) return;
  const dialog = $("artworkTextDialog");
  if (dialog.open) return;
  const selected = artworkTexts.find((text) => text.id === selectedArtworkTextId);
  $("artworkTextTitle").textContent = selected ? "Edit artwork text" : "Add artwork text";
  $("saveArtworkText").textContent = selected ? "Update text" : "Add text";
  if (selected) loadArtworkTextControls(selected);
  else $("artworkTextValue").value = "";
  dialog.showModal();
  $("artworkTextValue").focus();
}
function saveArtworkText() {
  const value = $("artworkTextValue").value;
  const fontSize = parseFloat($("artworkTextSize").value);
  if (!current || !value.trim() || !Number.isFinite(fontSize) || fontSize <= 0) return;
  let selected = artworkTexts.find((text) => text.id === selectedArtworkTextId);
  if (selected) {
    selected.text = value; selected.fontFamily = $("artworkFont").value;
    selected.fontSize = fontSize; selected.fill = $("artworkTextColor").value;
  } else {
    const bounds = artworkBounds(), id = `text-${nextArtworkImageId++}`;
    selected = {
      id, text: value, fontFamily: $("artworkFont").value, fontSize,
      fill: $("artworkTextColor").value,
      x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2,
    };
    artworkTexts.push(selected);
  }
  selectedArtworkImageId = null;
  selectedArtworkTextId = selected.id;
  renderArtworkImages(); updateArtworkControls();
  $("artworkTextDialog").close();
  $("preview").focus({ preventScroll: true });
}
function insertArtworkFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const image = new Image();
    image.addEventListener("load", () => {
      if (!current || !image.naturalWidth || !image.naturalHeight) return;
      const bounds = artworkBounds();
      const maxW = (bounds.maxX - bounds.minX) * 0.3;
      const maxH = (bounds.maxY - bounds.minY) * 0.3;
      const scale = Math.min(maxW / image.naturalWidth, maxH / image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      const id = `art-${nextArtworkImageId++}`;
      artworkImages.push({
        id, name: file.name || "Pasted image", href: String(reader.result),
        x: (bounds.minX + bounds.maxX - width) / 2,
        y: (bounds.minY + bounds.maxY - height) / 2,
        width, height, ratio: image.naturalWidth / image.naturalHeight,
      });
      selectedArtworkImageId = id;
      selectedArtworkTextId = null;
      renderArtworkImages();
      updateArtworkControls();
      $("preview").focus({ preventScroll: true });
    });
    image.src = String(reader.result);
  });
  reader.readAsDataURL(file);
}
function removeSelectedArtworkItem() {
  if (selectedArtworkImageId) artworkImages = artworkImages.filter((image) => image.id !== selectedArtworkImageId);
  if (selectedArtworkTextId) artworkTexts = artworkTexts.filter((text) => text.id !== selectedArtworkTextId);
  selectedArtworkImageId = null;
  selectedArtworkTextId = null;
  renderArtworkImages();
  updateArtworkControls();
}
function exportSvgWithArtwork() {
  const markup = toSVG(current.model, "export");
  if (!artworkImages.length && !artworkTexts.length) return markup;
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const svg = doc.documentElement;
  const layer = doc.createElementNS(GRID_NS, "g");
  layer.setAttribute("id", "artwork-images");
  artworkImages.forEach((image) => {
    const node = doc.createElementNS(GRID_NS, "image");
    node.setAttribute("href", image.href);
    node.setAttribute("x", image.x); node.setAttribute("y", image.y);
    node.setAttribute("width", image.width); node.setAttribute("height", image.height);
    node.setAttribute("preserveAspectRatio", "none");
    layer.appendChild(node);
  });
  artworkTexts.forEach((text) => {
    const node = doc.createElementNS(GRID_NS, "text");
    node.setAttribute("x", text.x); node.setAttribute("y", text.y);
    node.setAttribute("font-family", text.fontFamily); node.setAttribute("font-size", text.fontSize);
    node.setAttribute("fill", text.fill); node.setAttribute("text-anchor", "middle");
    node.setAttribute("dominant-baseline", "middle"); node.textContent = text.text;
    layer.appendChild(node);
  });
  artworkGroupPosition(svg, layer);
  return new XMLSerializer().serializeToString(svg);
}
// zoom by `factor`, keeping the point under (px, py) (container pixels; default centre) where it is
function zoomAt(factor, px, py) {
  if (!current) return;
  const { w, h } = stage();
  if (px === undefined) { px = w / 2; py = h / 2; }
  const f = fitScale();
  const s2 = Math.min(Math.max(view.s * factor, f * 0.2), f * MAX_ZOOM_OVER_FIT);
  const wx = view.cx + (px - w / 2) / view.s, wy = view.cy + (py - h / 2) / view.s;
  view.s = s2;
  view.cx = wx - (px - w / 2) / s2;
  view.cy = wy - (py - h / 2) / s2;
  view.auto = false;
  applyView();
}
function panBy(dx, dy) {
  if (!current) return;
  view.cx -= dx / view.s;
  view.cy -= dy / view.s;
  view.auto = false;
  applyView();
}
function goFit() { if (current) { fitView(); applyView(); } }
function goActual() { if (current) { view.s = actualScale(); view.auto = false; applyView(); } }

const pv = $("preview");
const pointers = new Map();
let pinch = null;
let pointDrag = null;
pv.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  const scaleHandle = e.target.closest?.("[data-art-scale]");
  if (scaleHandle) {
    const id = scaleHandle.getAttribute("data-art-scale");
    const image = artworkImages.find((item) => item.id === id);
    if (!image) return;
    selectedArtworkImageId = id;
    selectedArtworkTextId = null;
    selectedItem = null;
    updateEditHandles(); updateArtworkControls();
    artworkDrag = { type: "scale", id, start: pointAt(e), x: image.x, y: image.y, width: image.width };
    try { pv.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    pv.focus({ preventScroll: true }); e.preventDefault();
    return;
  }
  const artworkTarget = e.target.closest?.("[data-art-image-id]");
  if (artworkTarget) {
    const id = artworkTarget.getAttribute("data-art-image-id");
    const image = artworkImages.find((item) => item.id === id);
    if (!image) return;
    selectedArtworkImageId = id;
    selectedArtworkTextId = null;
    selectedItem = null;
    updateEditHandles(); updateArtworkControls();
    artworkDrag = { type: "move", id, start: pointAt(e), x: image.x, y: image.y };
    try { pv.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    pv.focus({ preventScroll: true }); e.preventDefault();
    return;
  }
  const textTarget = e.target.closest?.("[data-art-text-id]");
  if (textTarget) {
    const id = textTarget.getAttribute("data-art-text-id");
    const text = artworkTexts.find((item) => item.id === id);
    if (!text) return;
    selectedArtworkImageId = null;
    selectedArtworkTextId = id;
    selectedItem = null;
    loadArtworkTextControls(text);
    updateEditHandles(); updateArtworkControls();
    artworkDrag = { type: "move-text", id, start: pointAt(e), x: text.x, y: text.y };
    try { pv.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    pv.focus({ preventScroll: true }); e.preventDefault();
    return;
  }
  const handle = e.target.closest?.("[data-edit-point]");
  if (handle && selectedItem !== null) {
    e.preventDefault();
    try { pv.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    pointDrag = { point: editPoints[Number(handle.getAttribute("data-edit-point"))], before: geometrySnapshot() };
    pv.focus({ preventScroll: true });
    return;
  }
  const target = e.target.closest?.("[data-item-index]");
  if (target && current) {
    if (selectedArtworkImageId !== null || selectedArtworkTextId !== null) {
      selectedArtworkImageId = null; selectedArtworkTextId = null; updateArtworkControls();
    }
    const item = current.model.items[Number(target.getAttribute("data-item-index"))];
    if (item && item.layer === "DIM") {
      selectedItem = null;
      updateEditHandles();
      const group = item.dimGroup;
      const grouped = group === undefined ? [item] : current.model.items.filter((candidate) => candidate.dimGroup === group);
      const p = pointAt(e);
      pointDrag = { type: "move", before: geometrySnapshot(), start: p,
        items: grouped.map((candidate) => ({ index: current.model.items.indexOf(candidate), source: JSON.parse(JSON.stringify(candidate)) })) };
      try { pv.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
      pv.focus({ preventScroll: true });
      e.preventDefault();
      return;
    }
    if (item && (item.layer === "CUT" || item.layer === "CREASE")) {
      selectedItem = Number(target.getAttribute("data-item-index"));
      updateEditHandles();
      try { pv.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
      pv.focus({ preventScroll: true });
      e.preventDefault();
      return;
    }
  }
  if (!target && selectedItem !== null) { selectedItem = null; updateEditHandles(); }
  if (!target && (selectedArtworkImageId !== null || selectedArtworkTextId !== null)) {
    selectedArtworkImageId = null; selectedArtworkTextId = null; updateArtworkControls();
  }
  try { pv.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  pinch = null;
  pv.focus({ preventScroll: true });
});
pv.addEventListener("pointermove", (e) => {
  if (artworkDrag) {
    const p = pointAt(e), step = gridStep();
    if (artworkDrag.type === "move-text") {
      const text = artworkTexts.find((item) => item.id === artworkDrag.id);
      if (!text) { artworkDrag = null; return; }
      let x = artworkDrag.x + p.x - artworkDrag.start.x;
      let y = artworkDrag.y + p.y - artworkDrag.start.y;
      if ($("snapGrid").checked) { x = Math.round(x / step) * step; y = Math.round(y / step) * step; }
      text.x = x; text.y = y;
      const node = pv.querySelector(`[data-art-text-id="${text.id}"]`);
      if (node) { node.setAttribute("x", text.x); node.setAttribute("y", text.y); }
    } else {
      const image = artworkImages.find((item) => item.id === artworkDrag.id);
      if (!image) { artworkDrag = null; return; }
      if (artworkDrag.type === "move") {
        let x = artworkDrag.x + p.x - artworkDrag.start.x;
        let y = artworkDrag.y + p.y - artworkDrag.start.y;
        if ($("snapGrid").checked) { x = Math.round(x / step) * step; y = Math.round(y / step) * step; }
        image.x = x; image.y = y;
      } else {
        const fromX = p.x - artworkDrag.x;
        const fromY = (p.y - artworkDrag.y) * image.ratio;
        let width = Math.max(step, Math.abs(fromX - artworkDrag.width) >= Math.abs(fromY - artworkDrag.width) ? fromX : fromY);
        if ($("snapGrid").checked) width = Math.max(step, Math.round(width / step) * step);
        image.width = width; image.height = width / image.ratio;
      }
      const node = pv.querySelector(`[data-art-image-id="${image.id}"]`);
      if (node) { node.setAttribute("x", image.x); node.setAttribute("y", image.y); node.setAttribute("width", image.width); node.setAttribute("height", image.height); }
    }
    updateArtworkControls();
    e.preventDefault();
    return;
  }
  if (pointDrag) {
    const p = pointAt(e);
    const step = gridStep();
    if (pointDrag.type === "move") {
      let dx = p.x - pointDrag.start.x, dy = p.y - pointDrag.start.y;
      if ($("snapGrid").checked) { dx = Math.round(dx / step) * step; dy = Math.round(dy / step) * step; }
      pointDrag.items.forEach(({ index, source }) => translatedItem(source, current.model.items[index], dx, dy));
    } else {
      pointDrag.point.set($("snapGrid").checked ? Math.round(p.x / step) * step : p.x,
        $("snapGrid").checked ? Math.round(p.y / step) * step : p.y);
    }
    const m = current.model;
    current.model = finalizeModel(m.items, m.unit, m.size, m.th, m.artH);
    view.auto = false;
    setPreview(toSVG(current.model, "preview"));
    return;
  }
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const cur = { x: e.clientX, y: e.clientY };
  pointers.set(e.pointerId, cur);
  if (pointers.size === 1) {
    panBy(cur.x - prev.x, cur.y - prev.y);
  } else if (pointers.size === 2) { // two fingers: pinch to zoom, drag to move
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (pinch) {
      const r = stage();
      zoomAt(d / pinch.d, mx - r.left, my - r.top);
      panBy(mx - pinch.x, my - pinch.y);
    }
    pinch = { d, x: mx, y: my };
  }
});
const endPointer = (e) => {
  pointers.delete(e.pointerId); pinch = null;
  if (pointDrag && JSON.stringify(pointDrag.before) !== JSON.stringify(geometrySnapshot())) {
    undoStack.push(pointDrag.before);
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
  }
  artworkDrag = null;
  pointDrag = null;
  updateHistoryButtons();
};
pv.addEventListener("pointerup", endPointer);
pv.addEventListener("pointercancel", endPointer);
pv.addEventListener("wheel", (e) => {
  e.preventDefault(); // zoom the drawing instead of scrolling the page
  const r = stage();
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });
pv.addEventListener("dblclick", goFit);
pv.addEventListener("keydown", (e) => {
  if ((e.key === "Delete" || e.key === "Backspace") && (selectedArtworkImageId || selectedArtworkTextId)) {
    e.preventDefault(); removeSelectedArtworkItem(); return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redoGeometry() : undoGeometry(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redoGeometry(); return; }
  const step = 60;
  const keys = {
    "+": () => zoomAt(1.25), "=": () => zoomAt(1.25), "-": () => zoomAt(0.8), "_": () => zoomAt(0.8),
    "0": goFit, "1": goActual,
    ArrowLeft: () => panBy(step, 0), ArrowRight: () => panBy(-step, 0), ArrowUp: () => panBy(0, step), ArrowDown: () => panBy(0, -step),
  };
  if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
});
$("zoomIn").addEventListener("click", () => zoomAt(1.25));
$("zoomOut").addEventListener("click", () => zoomAt(0.8));
$("zoomFit").addEventListener("click", goFit);
$("zoomActual").addEventListener("click", goActual);
$("artworkImageFile").addEventListener("change", (e) => {
  insertArtworkFile(e.target.files?.[0]);
  e.target.value = "";
});
$("artworkTextForm").addEventListener("submit", (e) => { e.preventDefault(); saveArtworkText(); });
$("closeArtworkText").addEventListener("click", () => $("artworkTextDialog").close());
$("cancelArtworkText").addEventListener("click", () => $("artworkTextDialog").close());
$("artworkTextDialog").addEventListener("close", () => pv.focus({ preventScroll: true }));
document.addEventListener("keydown", (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || $("artworkTextDialog").open) return;
  if (e.target.closest?.("input, textarea, select, [contenteditable='true']")) return;
  const key = e.key.toLowerCase();
  if (key === "t") { e.preventDefault(); openArtworkTextDialog(); }
  else if (key === "i") { e.preventDefault(); $("artworkImageFile").click(); }
});
document.addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((entry) => entry.kind === "file" && entry.type.startsWith("image/"));
  const file = item?.getAsFile();
  if (!file) return;
  e.preventDefault();
  insertArtworkFile(file);
});
$("undoEdit").addEventListener("click", undoGeometry);
$("redoEdit").addEventListener("click", redoGeometry);
$("showGrid").addEventListener("change", () => applyView());
$("gridSpacing").addEventListener("input", () => applyView());
new ResizeObserver(() => applyView()).observe(pv);

let redrawTimer = null;
function redrawSoon() {
  saveInputs();
  clearTimeout(redrawTimer);
  redrawTimer = setTimeout(() => render(true), 350);
}

// animate === true plays the draw-on animation. Other fields redraw instantly.
function render(animate) {
  clearTimeout(redrawTimer);
  saveInputs();
  undoStack = []; redoStack = [];
  updateHistoryButtons();
  const p = readParams();
  applyTypeVisibility(p.type);
  let model;
  try {
    if (p.type === "rsc") {
      const g = compute(p);
      if (g.error) return showError(g.error);
      model = buildModel(g, {
        dims: p.dims,
        prec: p.prec,
        color: p.color,
        profile: creatorProfile,
      });
    } else {
      const def = KEYLINES[p.type];
      if (!def) return showError("This keyline is not available.");
      model = buildKeylineModel(def, p, {
        dims: p.dims,
        prec: p.prec,
        color: p.color,
        profile: creatorProfile,
      });
    }
  } catch (e) {
    return showError(e.message);
  }
  $("error").hidden = true;
  const hasFoldRule = hasCartonFoldRule(p.type);
  $("carton3dOpen").disabled = !hasFoldRule;
  $("carton3dOpen").title = hasFoldRule
    ? "Open the 3D fold view"
    : "3D fold view is disabled until this keyline has exact folding rules";
  selectedItem = null;
  current = { model };
  setPreview(animate === true ? toAnimatedSVG(model) : toSVG(model, "preview"));
}

function download(name, data, mime) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// File name: "<job name or box type> - <L>x<W>x<H>".
// Inches get an " in" suffix so a file is never mistaken for mm.
function baseName() {
  const p = readParams();
  const n = (v) => String(+Number(v).toFixed(3));
  const size = `${n(p.L)}x${n(p.W)}x${n(p.H)}${p.unit === "in" ? " in" : ""}`;
  const clean = (t) =>
    String(t)
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-") // characters Windows file names can't contain
      .replace(/\s+/g, " ")
      .replace(/^[\s.-]+|[\s.-]+$/g, "")
      .slice(0, 100);
  const typeName = p.type === "rsc" ? "RSC" : (KEYLINES[p.type] && KEYLINES[p.type].name) || p.type;
  const job = clean(p.job) || clean(typeName) || "RSC";
  return `${job} - ${size}`;
}

function shareMessage() {
  const p = readParams();
  const typeName = p.type === "rsc" ? "RSC" : (KEYLINES[p.type] && KEYLINES[p.type].name) || p.type;
  const format = (value) => Number.isFinite(value) ? String(+value.toFixed(3)) : "n/a";
  const lines = [
    "CartonLab Lightweight 2.0 keyline",
    p.job.trim() ? `Job: ${p.job.trim()}` : null,
    `Box type: ${typeName}`,
    `Size (L x W x H): ${format(p.L)} x ${format(p.W)} x ${format(p.H)} ${p.unit}`,
  ];
  return lines.filter((line) => line !== null).join("\n");
}

function setShareStatus(message, error = false) {
  const status = $("shareStatus");
  status.textContent = message;
  status.classList.toggle("text-red-600", error);
}

async function shareKeyline() {
  if (!current) return;
  const name = baseName();
  const pdf = toPDF(current.model);
  const file = typeof File === "function"
    ? new File([pdf], `${name}.pdf`, { type: "application/pdf" })
    : null;
  const title = `CartonLab Lightweight 2.0 keyline: ${name}`;
  const text = shareMessage();
  const canShareFile = file && typeof navigator.share === "function"
    && typeof navigator.canShare === "function"
    && navigator.canShare({ files: [file] });

  if (canShareFile) {
    setShareStatus("Choose an app in the share sheet to send the PDF attachment.");
    try {
      await navigator.share({ files: [file], title, text });
    } catch (error) {
      if (error.name !== "AbortError") {
        setShareStatus(`Could not open file sharing: ${error.message || error}.`, true);
      }
    }
    return;
  }

  download(`${name}.pdf`, file || pdf, "application/pdf");
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        title,
        text: `${text}\n\nThe PDF was downloaded separately; attach it to your message.`,
      });
      setShareStatus("The PDF was downloaded. Attach it in the app you selected.");
    } catch (error) {
      if (error.name !== "AbortError") {
        setShareStatus(`Could not open sharing: ${error.message || error}. The PDF was downloaded.`, true);
      }
    }
    return;
  }
  setShareStatus("This browser cannot open the share sheet. The PDF was downloaded; attach it to your message.");
}

$("print").addEventListener("click", () => {
  if (!current) return;
  const printArea = $("printArea");
  printArea.innerHTML = exportSvgWithArtwork();
  printArea.hidden = false;
  window.addEventListener("afterprint", () => {
    printArea.hidden = true;
    printArea.replaceChildren();
  }, { once: true });
  window.print();
});

$("share").addEventListener("click", () => shareKeyline());

$("dlPdf").addEventListener("click", () => {
  if (current) download(baseName() + ".pdf", toPDF(current.model), "application/pdf");
});
$("dlSvg").addEventListener("click", () => {
  if (current) download(baseName() + ".svg", exportSvgWithArtwork(), "image/svg+xml");
});
$("dlDxf").addEventListener("click", () => {
  if (current) download(baseName() + ".dxf", toDXF(current.model), "application/dxf");
});

$("ply").addEventListener("change", () => { applyPlyDefaults(); render(); });

$("unit").addEventListener("change", () => {
  const to = $("unit").value;
  if (to === lastUnit) return;
  const k = to === "in" ? 1 / 25.4 : 25.4;
  const dp = to === "in" ? 3 : 1;
  NUMERIC.forEach((id) => {
    const v = parseFloat($(id).value);
    if (!isNaN(v)) $(id).value = +(v * k).toFixed(dp);
  });
  const gridValue = parseFloat($("gridSpacing").value);
  if (Number.isFinite(gridValue)) $("gridSpacing").value = +(gridValue * k).toFixed(dp);
  Object.keys(kvals).forEach((id) => {
    Object.keys(kvals[id]).forEach((key) => {
      const v = parseFloat(kvals[id][key]);
      if (!isNaN(v)) kvals[id][key] = String(+(v * k).toFixed(dp));
    });
  });
  const artworkSize = parseFloat($("artworkTextSize").value);
  if (Number.isFinite(artworkSize)) $("artworkTextSize").value = +(artworkSize * k).toFixed(dp);
  artworkImages.forEach((image) => {
    image.x *= k; image.y *= k; image.width *= k; image.height *= k;
  });
  artworkTexts.forEach((text) => {
    text.x *= k; text.y *= k; text.fontSize *= k;
  });
  $("artworkSizeUnit").textContent = to;
  lastUnit = to;
  view.auto = true;
  buildKeylineInputs();
  render();
});

["L", "W", "H", "glue", "slot"].forEach((id) => $(id).addEventListener("input", redrawSoon));
["crease", "bwadd", "date", "job"].forEach((id) => $(id).addEventListener("input", () => render()));
$("dims").addEventListener("change", () => render());
$("prec").addEventListener("change", () => render());
$("color").addEventListener("change", () => render());
// choosing another keyline rebuilds its inputs and plays the draw-on animation
$("boxType").addEventListener("change", () => {
  artworkImages = [];
  artworkTexts = [];
  selectedArtworkImageId = null;
  selectedArtworkTextId = null;
  updateArtworkControls();
  activeKeylineCategory = keylineCategoryFor($("boxType").value);
  renderKeylinePicker();
  view.auto = true;
  applyKeylineDefaults($("boxType").value, true);
  buildKeylineInputs();
  render(true);
});

let designerTourStep = 0;
let designerTourTargets = [];
let designerTourReturnFocus = false;

function showDesignerTourStep(index) {
  const step = DESIGNER_TOUR_STEPS[index];
  if (!step) return;

  designerTourTargets.forEach((target) => target.classList.remove("designer-tour-highlight"));
  designerTourStep = index;
  designerTourTargets = step.targets
    .map((selector) => document.querySelector(selector))
    .filter(Boolean);
  designerTourTargets.forEach((target) => target.classList.add("designer-tour-highlight"));

  $("designerTourProgress").textContent = `${index + 1} of ${DESIGNER_TOUR_STEPS.length}`;
  $("designerTourTitle").textContent = step.title;
  $("designerTourDescription").textContent = step.description;
  $("designerTourPrevious").disabled = index === 0;
  $("designerTourNext").textContent =
    index === DESIGNER_TOUR_STEPS.length - 1 ? "Finish" : "Next";

  designerTourTargets[0]?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "center",
    inline: "nearest",
  });
}

function startDesignerTour(returnFocus = false) {
  designerTourReturnFocus = returnFocus;
  $("designerTour").hidden = false;
  $("designerHelp").setAttribute("aria-expanded", "true");
  showDesignerTourStep(0);
}

function closeDesignerTour() {
  designerTourTargets.forEach((target) => target.classList.remove("designer-tour-highlight"));
  designerTourTargets = [];
  $("designerTour").hidden = true;
  $("designerHelp").setAttribute("aria-expanded", "false");
  try {
    localStorage.setItem(DESIGNER_TOUR_KEY, "dismissed");
  } catch (_) { /* storage unavailable */ }
  if (designerTourReturnFocus) $("designerHelp").focus({ preventScroll: true });
  designerTourReturnFocus = false;
}

function initializeDesignerTour() {
  $("designerHelp").addEventListener("click", () => startDesignerTour(true));
  $("designerTourClose").addEventListener("click", closeDesignerTour);
  $("designerTourPrevious").addEventListener("click", () => {
    if (designerTourStep > 0) showDesignerTourStep(designerTourStep - 1);
  });
  $("designerTourNext").addEventListener("click", () => {
    if (designerTourStep === DESIGNER_TOUR_STEPS.length - 1) closeDesignerTour();
    else showDesignerTourStep(designerTourStep + 1);
  });
  document.addEventListener("keydown", (event) => {
    if (!$("designerTour").hidden && event.key === "Escape") closeDesignerTour();
  });

  let dismissed = false;
  try {
    dismissed = localStorage.getItem(DESIGNER_TOUR_KEY) === "dismissed";
  } catch (_) { /* storage unavailable */ }
  if (!dismissed) window.setTimeout(() => startDesignerTour(), 450);
}

function initializeCarton3D() {
  const open = $("carton3dOpen");
  const close = $("carton3dClose");
  const viewer = $("carton3dViewer");
  const scene = $("carton3dScene");
  const rotate = (yaw, pitch = 0) => {
    carton3DView.yaw += yaw;
    carton3DView.pitch = Math.max(-1.15, Math.min(1.15, carton3DView.pitch + pitch));
    renderCarton3D();
  };

  open.addEventListener("click", () => {
    if (!current) return;
    viewer.hidden = false;
    open.hidden = true;
    open.setAttribute("aria-expanded", "true");
    animateCartonFold();
    scene.focus();
  });
  close.addEventListener("click", () => {
    cancelCarton3DFoldAnimation();
    viewer.hidden = true;
    open.hidden = false;
    open.setAttribute("aria-expanded", "false");
    open.focus();
  });
  $("carton3dReplay").addEventListener("click", animateCartonFold);
  viewer.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close.click();
  });
  $("carton3dRotateLeft").addEventListener("click", () => rotate(-Math.PI / 12));
  $("carton3dRotateRight").addEventListener("click", () => rotate(Math.PI / 12));
  $("carton3dZoomOut").addEventListener("click", () => adjustCarton3DZoom(1 / 1.15));
  $("carton3dZoomIn").addEventListener("click", () => adjustCarton3DZoom(1.15));

  scene.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    carton3DView.drag = { x: event.clientX, y: event.clientY };
    scene.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  scene.addEventListener("pointermove", (event) => {
    if (!carton3DView.drag) return;
    const dx = event.clientX - carton3DView.drag.x;
    const dy = event.clientY - carton3DView.drag.y;
    carton3DView.drag = { x: event.clientX, y: event.clientY };
    rotate(dx * 0.012, dy * 0.012);
  });
  scene.addEventListener("pointerup", () => { carton3DView.drag = null; });
  scene.addEventListener("pointercancel", () => { carton3DView.drag = null; });
  scene.addEventListener("wheel", (event) => {
    event.preventDefault();
    adjustCarton3DZoom(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });
  scene.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") rotate(-Math.PI / 24);
    else if (event.key === "ArrowRight") rotate(Math.PI / 24);
    else if (event.key === "ArrowUp") rotate(0, -Math.PI / 24);
    else if (event.key === "ArrowDown") rotate(0, Math.PI / 24);
    else if (event.key === "+" || event.key === "=") adjustCarton3DZoom(1.15);
    else if (event.key === "-") adjustCarton3DZoom(1 / 1.15);
    else return;
    event.preventDefault();
  });
}

async function init() {
  initializeCarton3D();
  const accountControls = $("appAccountControls");
  // Fetch only the definitions permitted by the server-verified account plan.
  let loadErrors = [];
  try {
    loadErrors = await loadKeylines("/api/keylines");
  } catch (error) {
    console.error("Could not verify account access to keylines:", error);
    showError("Could not verify your account or load keylines. Please reload.");
    return;
  }
  (window.CARTONLAB_LOCKED_KEYLINES || []).forEach((definition) => {
    LOCKED_KEYLINES[definition.id] = definition;
  });
  const plan = window.CARTONLAB_PLAN;
  const trialActive = window.CARTONLAB_TRIAL_ACTIVE === true;
  premiumFeaturesEnabled = plan === "premium";
  if (typeof window.CARTONLAB_TRIAL_ENDS_AT === "string") {
    const expiresIn = Date.parse(window.CARTONLAB_TRIAL_ENDS_AT) - Date.now();
    if (Number.isFinite(expiresIn) && expiresIn > 0) {
      window.setTimeout(() => window.location.reload(), expiresIn);
    }
  }
  if (plan === "free" || plan === "premium") {
    accountControls.hidden = false;
    $("appAccountPlanLabel").textContent =
      trialActive
        ? "Free trial"
        : plan === "premium"
          ? "Premium account"
          : "Go Premium";
    $("appAccountPlan").setAttribute(
      "aria-label",
      trialActive
        ? "View free trial details"
        : plan === "premium"
          ? "View Premium account"
          : "Go Premium",
    );
    $("appLogOut").addEventListener("click", () => {
      window.parent.postMessage(
        { type: "cartonlab:sign-out" },
        window.location.origin,
      );
    });
  }

  await profileReady;

  Object.keys(KEYLINES).forEach((id) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = KEYLINES[id].name || id;
    $("boxType").appendChild(opt);
  });

  loadInputs();
  applyPremiumFeatureAccess();
  $("artworkTextSize").value = $("unit").value === "in" ? (24 / 25.4).toFixed(3) : "24";
  $("artworkSizeUnit").textContent = $("unit").value;
  if (!$("boxType").value) $("boxType").value = "rsc"; // a saved type that no longer exists
  activeKeylineCategory = keylineCategoryFor($("boxType").value);
  renderKeylinePicker();
  $("gridSpacing").value = $("unit").value === "in" ? (10 / 25.4).toFixed(3) : "10";
  $("date").value = todayISO(); // date is never persisted: always starts as today
  lastUnit = $("unit").value;
  applyKeylineDefaults($("boxType").value);
  buildKeylineInputs();
  render(true);
  if (loadErrors.length) console.warn("Keyline definitions not loaded:", loadErrors);
  initializeDesignerTour();
}
init();
