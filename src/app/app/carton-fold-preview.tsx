"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

type Point = [number, number];
type PathSegment = Array<string | number>;
type FoldItem =
  | { t: "poly"; layer: "CUT"; pts: Point[]; closed: boolean }
  | { t: "path"; layer: "CUT"; segs: PathSegment[] }
  | {
      t: "line";
      layer: "CREASE";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      creaseId?: string;
    };

export type FoldPreviewData = {
  name: string;
  dimensions: { L: number; W: number; H: number; unit: string; ply: number };
  color: string;
  outline?: Point[][];
  items: FoldItem[];
};

type PathContour = { points: Point[]; closed: boolean };
type GraphEdge = { a: number; b: number; crease: boolean };
type Face = {
  points: Point[];
  edges: GraphEdge[];
  area: number;
  center: Point;
  holes: Point[][];
  parent?: number;
  hinge?: [Point, Point];
  hingeEdge?: GraphEdge;
  angleSign?: number;
};

type Topology = {
  faces: Face[];
  outline: Point[];
  cutPaths: PathContour[];
  creaseLines: Extract<FoldItem, { t: "line" }>[];
  vertices: Point[];
  edges: Map<string, GraphEdge>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export function isFoldPreviewData(value: unknown): value is FoldPreviewData {
  if (!isRecord(value) || typeof value.name !== "string" || value.name.length > 160) return false;
  if (!isRecord(value.dimensions) || !Array.isArray(value.items) || value.items.length > 5000) return false;
  const { L, W, H, unit, ply } = value.dimensions;
  if (![L, W, H].every((size) => typeof size === "number" && Number.isFinite(size) && size > 0)) return false;
  if (typeof unit !== "string" || unit.length > 12 || (ply !== 3 && ply !== 5) || typeof value.color !== "string") return false;

  if (value.outline !== undefined && (!Array.isArray(value.outline) || value.outline.length > 200)) return false;
  if (Array.isArray(value.outline) && !value.outline.every((path) =>
    Array.isArray(path) && path.length >= 3 && path.length <= 10000 &&
    path.every((point) => Array.isArray(point) && point.length === 2 &&
      point.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))),
  )) return false;

  return value.items.every((item) => {
    if (!isRecord(item)) return false;
    if (item.layer === "CREASE" && item.t === "line") {
      return [item.x1, item.y1, item.x2, item.y2].every(
        (coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate),
      );
    }
    if (item.layer !== "CUT") return false;
    if (item.t === "poly") {
      return Array.isArray(item.pts) && item.pts.length >= 3 && item.pts.every(
        (point) => Array.isArray(point) && point.length === 2 &&
          point.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)),
      );
    }
    if (item.t === "path") {
      return Array.isArray(item.segs) && item.segs.length <= 10000 && item.segs.every(
        (segment) => Array.isArray(segment) && segment.every(
          (part) => typeof part === "string" || (typeof part === "number" && Number.isFinite(part)),
        ),
      );
    }
    return false;
  });
}

function samePoint(a: Point, b: Point, tolerance: number) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;
}

function signedArea(points: Point[]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

function polygonCenter(points: Point[]): Point {
  let areaFactor = 0, x = 0, y = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const cross = a[0] * b[1] - b[0] * a[1];
    areaFactor += cross;
    x += (a[0] + b[0]) * cross;
    y += (a[1] + b[1]) * cross;
  }
  if (Math.abs(areaFactor) < 1e-10) {
    return [
      points.reduce((sum, point) => sum + point[0], 0) / points.length,
      points.reduce((sum, point) => sum + point[1], 0) / points.length,
    ];
  }
  return [x / (3 * areaFactor), y / (3 * areaFactor)];
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    const crosses = (a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function flattenPath(segments: PathSegment[]): PathContour[] {
  const contours: PathContour[] = [];
  let points: Point[] = [];
  let current: Point = [0, 0];
  let start: Point = [0, 0];
  let closed = false;
  const finish = () => {
    if (points.length >= 2) contours.push({ points, closed });
    points = [];
    closed = false;
  };

  for (const segment of segments) {
    const command = segment[0];
    if (command === "M") {
      finish();
      current = [Number(segment[1]), Number(segment[2])];
      start = current;
      points = [current];
    } else if (command === "L" && points.length) {
      current = [Number(segment[1]), Number(segment[2])];
      points.push(current);
    } else if (command === "C" && points.length) {
      const p0 = current;
      const p1: Point = [Number(segment[1]), Number(segment[2])];
      const p2: Point = [Number(segment[3]), Number(segment[4])];
      const p3: Point = [Number(segment[5]), Number(segment[6])];
      for (let step = 1; step <= 24; step++) {
        const t = step / 24, u = 1 - t;
        points.push([
          u ** 3 * p0[0] + 3 * u ** 2 * t * p1[0] + 3 * u * t ** 2 * p2[0] + t ** 3 * p3[0],
          u ** 3 * p0[1] + 3 * u ** 2 * t * p1[1] + 3 * u * t ** 2 * p2[1] + t ** 3 * p3[1],
        ]);
      }
      current = p3;
    } else if (command === "Z" && points.length) {
      closed = true;
      if (samePoint(points[points.length - 1], start, 1e-8)) points.pop();
      current = start;
      finish();
    }
  }
  finish();
  return contours.filter((contour) => contour.points.length >= (contour.closed ? 3 : 2));
}

function cutContours(items: FoldItem[]) {
  return items.flatMap((item) => {
    if (item.layer !== "CUT") return [];
    if (item.t === "poly") {
      const points = item.pts.map(([x, y]) => [x, y] as Point);
      if (item.closed && samePoint(points[0], points[points.length - 1], 1e-8)) points.pop();
      return [{ points, closed: item.closed }];
    }
    return flattenPath(item.segs);
  });
}

function joinOpenContours(contours: PathContour[], tolerance: number): PathContour[] {
  const open = contours.filter((contour) => !contour.closed && contour.points.length >= 2);
  const used = new Set<number>();
  const loops: PathContour[] = [];

  for (let startIndex = 0; startIndex < open.length; startIndex++) {
    if (used.has(startIndex)) continue;
    used.add(startIndex);
    const points = [...open[startIndex].points];
    let closed = false;
    for (let count = 0; count <= open.length; count++) {
      const end = points[points.length - 1];
      if (samePoint(end, points[0], tolerance)) {
        points.pop();
        closed = true;
        break;
      }
      const incoming: Point = [end[0] - points[points.length - 2][0], end[1] - points[points.length - 2][1]];
      let candidate = -1, reverse = false, bestScore = -Infinity;
      for (let i = 0; i < open.length; i++) {
        if (used.has(i)) continue;
        const first = open[i].points[0], last = open[i].points[open[i].points.length - 1];
        const atStart = samePoint(end, first, tolerance), atEnd = samePoint(end, last, tolerance);
        if (!atStart && !atEnd) continue;
        const next = atStart ? open[i].points[1] : open[i].points[open[i].points.length - 2];
        const outgoing: Point = [next[0] - end[0], next[1] - end[1]];
        const score = (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) /
          Math.max(1e-10, Math.hypot(...incoming) * Math.hypot(...outgoing));
        if (score > bestScore) {
          candidate = i;
          reverse = atEnd;
          bestScore = score;
        }
      }
      if (candidate < 0) break;
      used.add(candidate);
      const nextPoints = reverse ? [...open[candidate].points].reverse() : open[candidate].points;
      points.push(...nextPoints.slice(1));
    }
    if (closed && points.length >= 3) loops.push({ points, closed: true });
  }
  return loops;
}

function cross(a: Point, b: Point) {
  return a[0] * b[1] - a[1] * b[0];
}

function addIntersectionParameters(a: Point, b: Point, c: Point, d: Point, ts: number[], us: number[], tolerance: number) {
  const r: Point = [b[0] - a[0], b[1] - a[1]];
  const s: Point = [d[0] - c[0], d[1] - c[1]];
  const offset: Point = [c[0] - a[0], c[1] - a[1]];
  const denominator = cross(r, s);
  const scale = Math.max(1, Math.hypot(...r), Math.hypot(...s));
  if (Math.abs(denominator) > tolerance * scale) {
    const t = cross(offset, s) / denominator;
    const u = cross(offset, r) / denominator;
    if (t >= -1e-8 && t <= 1 + 1e-8 && u >= -1e-8 && u <= 1 + 1e-8) {
      ts.push(Math.min(1, Math.max(0, t)));
      us.push(Math.min(1, Math.max(0, u)));
    }
    return;
  }
  if (Math.abs(cross(offset, r)) > tolerance * scale) return;
  const rLength = r[0] ** 2 + r[1] ** 2;
  const sLength = s[0] ** 2 + s[1] ** 2;
  if (rLength < 1e-12 || sLength < 1e-12) return;
  const project = (point: Point, origin: Point, vector: Point, length: number) =>
    ((point[0] - origin[0]) * vector[0] + (point[1] - origin[1]) * vector[1]) / length;
  for (const [t, u] of [
    [project(c, a, r, rLength), 0],
    [project(d, a, r, rLength), 1],
    [0, project(a, c, s, sLength)],
    [1, project(b, c, s, sLength)],
  ]) {
    if (t >= -1e-8 && t <= 1 + 1e-8 && u >= -1e-8 && u <= 1 + 1e-8) {
      ts.push(Math.min(1, Math.max(0, t)));
      us.push(Math.min(1, Math.max(0, u)));
    }
  }
}

function edgeKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function buildTopology(data: FoldPreviewData): Topology {
  const contours = cutContours(data.items);
  const tolerance = data.dimensions.unit === "in" ? 0.01 : 0.25;
  const closedContours = [...contours.filter((contour) => contour.closed), ...joinOpenContours(contours, tolerance)];
  const preferredOutlines = (data.outline || []).map((points) => ({ points, closed: true }));
  const outline = [...preferredOutlines, ...closedContours]
    .sort((a, b) => Math.abs(signedArea(b.points)) - Math.abs(signedArea(a.points)))[0]?.points;
  if (!outline || outline.length < 3 || Math.abs(signedArea(outline)) < 1e-6) {
    throw new Error("This keyline has no closed outer cut contour to fold.");
  }

  const minX = Math.min(...outline.map((point) => point[0]));
  const maxX = Math.max(...outline.map((point) => point[0]));
  const minY = Math.min(...outline.map((point) => point[1]));
  const maxY = Math.max(...outline.map((point) => point[1]));
  const span = Math.max(maxX - minX, maxY - minY);
  const threshold = span * 0.018;
  const creaseLines = data.items.filter((item): item is Extract<FoldItem, { t: "line" }> =>
    item.layer === "CREASE" && item.t === "line",
  );
  const omittedCreases = creaseLines.filter((line) =>
    /perforat|micro.?perf|score.?mark/i.test(line.creaseId || "") ||
    Math.hypot(line.x2 - line.x1, line.y2 - line.y1) < threshold,
  );
  const structural = creaseLines.filter((line) => !omittedCreases.includes(line));
  const segments: Array<{ a: Point; b: Point; crease: boolean }> = [];
  for (let i = 0; i < outline.length; i++) {
    segments.push({ a: outline[i], b: outline[(i + 1) % outline.length], crease: false });
  }
  structural.forEach((line) => {
    segments.push({ a: [line.x1, line.y1], b: [line.x2, line.y2], crease: true });
  });

  const splits = segments.map(() => [0, 1]);
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      addIntersectionParameters(
        segments[i].a, segments[i].b, segments[j].a, segments[j].b,
        splits[i], splits[j], tolerance,
      );
    }
  }

  const vertices: Point[] = [];
  const vertexIds = new Map<string, number>();
  const vertexId = (point: Point) => {
    const key = `${Math.round(point[0] / tolerance)}:${Math.round(point[1] / tolerance)}`;
    let id = vertexIds.get(key);
    if (id === undefined) {
      id = vertices.length;
      vertices.push(point);
      vertexIds.set(key, id);
    }
    return id;
  };
  const edges = new Map<string, GraphEdge>();
  segments.forEach((segment, index) => {
    const a = segment.a, b = segment.b;
    const parameters = splits[index].sort((x, y) => x - y)
      .filter((value, i, all) => i === 0 || Math.abs(value - all[i - 1]) > 1e-8);
    for (let i = 0; i < parameters.length - 1; i++) {
      const t0 = parameters[i], t1 = parameters[i + 1];
      const p0: Point = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
      const p1: Point = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
      const v0 = vertexId(p0), v1 = vertexId(p1);
      if (v0 === v1) continue;
      const key = edgeKey(v0, v1);
      const existing = edges.get(key);
      if (existing) existing.crease ||= segment.crease;
      else edges.set(key, { a: v0, b: v1, crease: segment.crease });
    }
  });

  const neighbors = new Map<number, number[]>();
  edges.forEach(({ a, b }) => {
    neighbors.set(a, [...(neighbors.get(a) || []), b]);
    neighbors.set(b, [...(neighbors.get(b) || []), a]);
  });
  neighbors.forEach((adjacent, id) => adjacent.sort((a, b) => {
    const origin = vertices[id];
    const pa = vertices[a], pb = vertices[b];
    return Math.atan2(pa[1] - origin[1], pa[0] - origin[0]) -
      Math.atan2(pb[1] - origin[1], pb[0] - origin[0]);
  }));

  const visited = new Set<string>();
  const faces: Face[] = [];
  const maxSteps = edges.size * 2 + 1;
  for (const { a: edgeA, b: edgeB } of edges.values()) {
    for (const [startA, startB] of [[edgeA, edgeB], [edgeB, edgeA]]) {
      const first = `${startA}>${startB}`;
      if (visited.has(first)) continue;
      let from = startA, to = startB;
      const boundary: number[] = [];
      for (let step = 0; step < maxSteps; step++) {
        const directed = `${from}>${to}`;
        if (visited.has(directed)) break;
        visited.add(directed);
        boundary.push(from);
        const adjacent = neighbors.get(to) || [];
        const reverseIndex = adjacent.indexOf(from);
        if (reverseIndex < 0 || adjacent.length < 2) break;
        const next = adjacent[(reverseIndex + adjacent.length - 1) % adjacent.length];
        from = to;
        to = next;
        if (from === startA && to === startB) break;
      }
      const cleaned: number[] = [];
      boundary.forEach((id) => {
        if (cleaned.length >= 2 && cleaned[cleaned.length - 2] === id) cleaned.pop();
        else cleaned.push(id);
      });
      if (cleaned.length > 1 && cleaned[0] === cleaned[cleaned.length - 1]) cleaned.pop();
      if (cleaned.length < 3) continue;
      const points = cleaned.map((id) => vertices[id]);
      const area = signedArea(points);
      if (Math.abs(area) < tolerance * tolerance) continue;
      const center = polygonCenter(points);
      const a = points[0], b = points[1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const length = Math.hypot(dx, dy) || 1;
      const offset = Math.max(span * 1e-8, Math.min(tolerance * 0.1, length * 1e-4));
      const sample: Point = [
        (a[0] + b[0]) / 2 - (dy / length) * offset,
        (a[1] + b[1]) / 2 + (dx / length) * offset,
      ];
      if (!pointInPolygon(sample, outline)) continue;
      const faceEdges = cleaned.map((id, i) => {
        const next = cleaned[(i + 1) % cleaned.length];
        return edges.get(edgeKey(id, next)) || { a: id, b: next, crease: false };
      });
      faces.push({ points, edges: faceEdges, area: Math.abs(area), center, holes: [] });
    }
  }
  if (!faces.length) throw new Error("Could not divide this keyline into panels. Check that its crease lines meet the cut outline.");

  const seenHoles = new Set<string>();
  const holeCandidates = [...contours.filter((contour) => contour.closed), ...preferredOutlines].filter((contour) =>
    contour.points !== outline &&
    Math.abs(signedArea(contour.points)) < Math.abs(signedArea(outline)) - tolerance * tolerance,
  );
  holeCandidates.forEach(({ points }) => {
    const center = polygonCenter(points);
    const signature = `${Math.round(Math.abs(signedArea(points)) / (tolerance * tolerance))}:${Math.round(center[0] / tolerance)}:${Math.round(center[1] / tolerance)}`;
    if (seenHoles.has(signature)) return;
    seenHoles.add(signature);
    const face = faces.find((candidate) =>
      pointInPolygon(center, candidate.points) &&
      points.every((point) => pointInPolygon(point, candidate.points)),
    );
    if (face) face.holes.push(points);
  });

  const faceEdges = new Map<string, number[]>();
  faces.forEach((face, faceIndex) => face.edges.forEach((edge, edgeIndex) => {
    const key = edgeKey(edge.a, edge.b);
    faceEdges.set(key, [...(faceEdges.get(key) || []), faceIndex]);
    face.edges[edgeIndex] = { ...edge, a: edge.a, b: edge.b };
  }));
  const adjacency = new Map<number, Array<{ face: number; edge: GraphEdge }>>();
  faceEdges.forEach((faceIds, key) => {
    const edge = edges.get(key);
    if (!edge?.crease || faceIds.length !== 2) return;
    const [a, b] = faceIds;
    adjacency.set(a, [...(adjacency.get(a) || []), { face: b, edge }]);
    adjacency.set(b, [...(adjacency.get(b) || []), { face: a, edge }]);
  });

  const visitedFaces = new Set<number>();
  while (visitedFaces.size < faces.length) {
    let root = -1;
    faces.forEach((face, index) => {
      if (visitedFaces.has(index)) return;
      const degree = adjacency.get(index)?.length || 0;
      const rootDegree = root < 0 ? -1 : adjacency.get(root)?.length || 0;
      if (root < 0 || degree > rootDegree || (degree === rootDegree && face.area > faces[root].area)) {
        root = index;
      }
    });
    visitedFaces.add(root);
    const queue = [root];
    while (queue.length) {
      const parent = queue.shift()!;
      for (const { face: child, edge } of adjacency.get(parent) || []) {
        if (visitedFaces.has(child)) continue;
        const a = vertices[edge.a], b = vertices[edge.b];
        const axis: Point = [b[0] - a[0], b[1] - a[1]];
        const side: Point = [
          faces[child].center[0] - (a[0] + b[0]) / 2,
          faces[child].center[1] - (a[1] + b[1]) / 2,
        ];
        const direction = cross(axis, side);
        faces[child].parent = parent;
        faces[child].hinge = [a, b];
        faces[child].hingeEdge = edge;
        faces[child].angleSign = direction >= 0 ? 1 : -1;
        visitedFaces.add(child);
        queue.push(child);
      }
    }
  }

  return {
    faces,
    outline,
    cutPaths: contours,
    creaseLines,
    vertices,
    edges,
    bounds: { minX, minY, maxX, maxY },
  };
}

function makeLineSegments(points: Point[], z: number) {
  const positions: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    positions.push(points[i][0], points[i][1], z, points[i + 1][0], points[i + 1][1], z);
  }
  return positions;
}

function makeShape(face: Face) {
  const shape = new THREE.Shape();
  shape.moveTo(face.points[0][0], face.points[0][1]);
  face.points.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
  shape.closePath();
  face.holes.forEach((points) => {
    const hole = new THREE.Path();
    hole.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(([x, y]) => hole.lineTo(x, y));
    hole.closePath();
    shape.holes.push(hole);
  });
  return shape;
}

export default function CartonFoldPreview({
  data,
  onClose,
}: {
  data: FoldPreviewData;
  onClose: () => void;
}) {
  const canvasHost = useRef<HTMLDivElement>(null);
  const foldUpdate = useRef<(progress: number) => void>(() => {});
  const [progress, setProgress] = useState(100);
  const [rendererError, setRendererError] = useState<string | null>(null);
  const unitLabel = data.dimensions.unit;
  const topologyResult = useMemo(() => {
    try {
      return { topology: buildTopology(data), error: null };
    } catch (reason) {
      return {
        topology: null,
        error: reason instanceof Error ? reason.message : String(reason),
      };
    }
  }, [data]);
  const foldRoots = topologyResult.topology?.faces.filter((face) => face.parent === undefined).length || 0;
  const hasFoldHinges = topologyResult.topology?.faces.some((face) => face.parent !== undefined) || false;
  const error = topologyResult.error || rendererError;

  useEffect(() => {
    const host = canvasHost.current;
    foldUpdate.current = () => {};
    const topology = topologyResult.topology;
    if (!host || !topology) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch (reason) {
      const message = reason instanceof Error
        ? `3D preview could not start: ${reason.message}`
        : "3D preview could not start.";
      window.setTimeout(() => setRendererError(message), 0);
      return;
    }

    window.setTimeout(() => setRendererError(null), 0);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e8edf2");
    const { minX, minY, maxX, maxY } = topology.bounds;
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    const span = Math.max(maxX - minX, maxY - minY);
    const thickness = unitLabel === "in" ? (data.dimensions.ply === 5 ? 0.2 : 0.12) : data.dimensions.ply;
    const lineZ = thickness / 2 + span * 0.00015;
    const root = new THREE.Group();
    root.position.set(-centerX, -centerY, 0);
    scene.add(root);

    const brown = data.color === "brown";
    const boardMaterial = new THREE.MeshStandardMaterial({
      color: brown ? "#c98f5b" : "#fafbfc",
      roughness: 0.88,
      side: THREE.DoubleSide,
    });
    const cutMaterial = new THREE.LineBasicMaterial({ color: "#263746" });
    const creaseMaterial = new THREE.LineDashedMaterial({
      color: "#cf5158",
      dashSize: Math.max(span * 0.012, thickness * 1.5),
      gapSize: Math.max(span * 0.008, thickness),
    });
    const faceGroups = topology.faces.map(() => new THREE.Group());
    const connections = new Map<string, number>();
    topology.faces.forEach((face) => {
      if (face.parent !== undefined && face.hingeEdge) {
        connections.set(edgeKey(face.hingeEdge.a, face.hingeEdge.b), face.parent);
      }
    });

    topology.faces.forEach((face, faceIndex) => {
      const shape = makeShape(face);
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
      geometry.translate(0, 0, -thickness / 2);
      faceGroups[faceIndex].add(new THREE.Mesh(geometry, boardMaterial));

      const cutPositions: number[] = [];
      const creasePositions: number[] = [];
      face.edges.forEach((edge) => {
        const key = edgeKey(edge.a, edge.b);
        const parentFace = connections.get(key);
        if (edge.crease && parentFace !== undefined && parentFace !== faceIndex) return;
        const target = edge.crease ? creasePositions : cutPositions;
        target.push(
          topology.vertices[edge.a][0], topology.vertices[edge.a][1], lineZ,
          topology.vertices[edge.b][0], topology.vertices[edge.b][1], lineZ,
        );
      });
      face.holes.forEach((hole) => cutPositions.push(...makeLineSegments([...hole, hole[0]], lineZ)));

      topology.cutPaths.filter((path) => !path.closed && path.points.length > 1).forEach((path) => {
        const midpoint = path.points[Math.floor(path.points.length / 2)];
        if (pointInPolygon(midpoint, face.points)) cutPositions.push(...makeLineSegments(path.points, lineZ));
      });
      topology.creaseLines.forEach((line) => {
        const length = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
        if (length < span * 0.018 || /perforat|micro.?perf|score.?mark/i.test(line.creaseId || "")) {
          const midpoint: Point = [(line.x1 + line.x2) / 2, (line.y1 + line.y2) / 2];
          if (pointInPolygon(midpoint, face.points)) {
            creasePositions.push(line.x1, line.y1, lineZ, line.x2, line.y2, lineZ);
          }
        }
      });

      if (cutPositions.length) {
        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(cutPositions, 3));
        faceGroups[faceIndex].add(new THREE.LineSegments(lineGeometry, cutMaterial));
      }
      if (creasePositions.length) {
        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(creasePositions, 3));
        const creaseLines = new THREE.LineSegments(lineGeometry, creaseMaterial);
        creaseLines.computeLineDistances();
        faceGroups[faceIndex].add(creaseLines);
      }
      if (face.parent === undefined) root.add(faceGroups[faceIndex]);
      else faceGroups[face.parent].add(faceGroups[faceIndex]);
    });

    const sceneSize = span * 1.6;
    const grid = new THREE.GridHelper(sceneSize, 24, "#a4b0ba", "#c5cdd4");
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -thickness;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.45;
    });
    scene.add(grid);

    scene.add(new THREE.HemisphereLight("#ffffff", "#7d8b98", 2));
    const keyLight = new THREE.DirectionalLight("#ffffff", 2.5);
    keyLight.position.set(span, -span, span * 1.8);
    scene.add(keyLight);

    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    const camera = new THREE.PerspectiveCamera(42, width / height, Math.max(span / 10000, 0.001), span * 30);
    camera.up.set(0, 0, 1);
    camera.position.set(span * 0.9, -span * 1.2, span * 1.15);
    camera.lookAt(0, 0, 0);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.replaceChildren(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", `Interactive 3D view of ${data.name}`);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.update();

    const updateFold = (value: number) => {
      const progressValue = Math.max(0, Math.min(1, value));
      faceGroups.forEach((group, index) => {
        const face = topology.faces[index];
        group.position.set(0, 0, 0);
        group.rotation.set(0, 0, 0);
        if (face.parent === undefined || !face.hinge) return;
        const [a, b] = face.hinge;
        const axis = new THREE.Vector3(b[0] - a[0], b[1] - a[1], 0).normalize();
        const pivot = new THREE.Vector3(a[0], a[1], 0);
        group.position.copy(pivot);
        group.position.negate();
        group.quaternion.setFromAxisAngle(axis, (face.angleSign || 1) * Math.PI / 2 * progressValue);
        group.position.applyQuaternion(group.quaternion);
        group.position.add(pivot);
      });
    };
    foldUpdate.current = updateFold;
    updateFold(1);

    let frame = 0;
    const renderFrame = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(renderFrame);
    };
    renderFrame();
    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = Math.max(host.clientWidth, 1);
      const nextHeight = Math.max(host.clientHeight, 1);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    });
    resizeObserver.observe(host);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      root.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
        }
      });
      boardMaterial.dispose();
      cutMaterial.dispose();
      creaseMaterial.dispose();
      gridMaterials.forEach((material) => material.dispose());
      grid.geometry.dispose();
      renderer.dispose();
      host.replaceChildren();
    };
  }, [data, topologyResult.topology, unitLabel]);

  useEffect(() => {
    foldUpdate.current(progress / 100);
  }, [progress]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="carton-3d-overlay" role="dialog" aria-modal="true" aria-labelledby="carton-3d-title" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="carton-3d-panel">
        <header className="carton-3d-header">
          <div>
            <p className="carton-3d-kicker">KEYLINE FOLD SIMULATOR</p>
            <h2 id="carton-3d-title">{data.name}</h2>
            <p>{data.dimensions.L} × {data.dimensions.W} × {data.dimensions.H} {unitLabel}</p>
          </div>
          <button type="button" className="carton-3d-close" onClick={onClose} aria-label="Close 3D preview">×</button>
        </header>
        <div ref={canvasHost} className="carton-3d-canvas" />
        {error ? <p className="carton-3d-error" role="alert">{error}</p> : null}
        {topologyResult.topology && (!hasFoldHinges || foldRoots > 1) ? (
          <p className="carton-3d-warning" role="status">
            {hasFoldHinges
              ? `The crease graph splits into ${foldRoots} panel groups; disconnected groups remain flat.`
              : "No fold hinges could be inferred from this keyline. The panels remain flat; verify its crease geometry."}
          </p>
        ) : null}
        <div className="carton-3d-controls">
          <label htmlFor="carton-fold-progress">Fold progress</label>
          <input
            id="carton-fold-progress"
            type="range"
            min="0"
            max="100"
            value={progress}
            disabled={!hasFoldHinges}
            onChange={(event) => setProgress(Number(event.target.value))}
          />
          <output htmlFor="carton-fold-progress">{progress}%</output>
        </div>
        <p className="carton-3d-note">
          Cut contours, holes, and crease layout follow the selected keyline. Folding assumes ideal 90° score rotations; glue, tuck sequencing, board collisions, and spring-back are not inferred from a flat dieline.
        </p>
        <p className="carton-3d-hint">Drag to orbit · Scroll to zoom · Shift-drag to pan</p>
      </section>
    </div>
  );
}
