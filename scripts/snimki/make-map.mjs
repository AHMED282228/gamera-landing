// Контуры Ленобласти, СПб и соседей из Natural Earth (общественное достояние)
// → lib/mapShapes.ts для SVG-карты. node make-map.mjs adm1.geojson out.ts
import { readFileSync, writeFileSync } from 'node:fs'

const [src, out] = process.argv.slice(2)
const g = JSON.parse(readFileSync(src, 'utf8'))

const LON0 = 27.55, LON1 = 35.75, LAT0 = 58.35, LAT1 = 61.35
const K = Math.cos((59.9 * Math.PI) / 180)
const W = 1000
const S = W / ((LON1 - LON0) * K)
const H = Math.round((LAT1 - LAT0) * S)
const proj = ([lon, lat]) => [(lon - LON0) * K * S, (LAT1 - lat) * S]

// Отсечение кольца по прямоугольнику (Сазерленд — Ходжман) с запасом.
const M = 30
function clip(ring) {
  const edges = [
    (p) => p[0] >= -M, (p) => p[0] <= W + M, (p) => p[1] >= -M, (p) => p[1] <= H + M,
  ]
  const inter = (a, b, k) => {
    const lim = [-M, W + M, -M, H + M][k]
    const ax = k < 2 ? a[0] : a[1], bx = k < 2 ? b[0] : b[1]
    const t = (lim - ax) / (bx - ax)
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  }
  let pts = ring
  edges.forEach((inside, k) => {
    const res = []
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i], prev = pts[(i + pts.length - 1) % pts.length]
      if (inside(cur)) {
        if (!inside(prev)) res.push(inter(prev, cur, k))
        res.push(cur)
      } else if (inside(prev)) res.push(inter(prev, cur, k))
    }
    pts = res
  })
  return pts
}

// Дуглас — Пекер.
function simplify(pts, tol) {
  if (pts.length < 4) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let max = 0, idx = -1
    const [ax, ay] = pts[a], [bx, by] = pts[b]
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len
      if (d > max) { max = d; idx = i }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

function toPath(geom, tol) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  let d = ''
  for (const poly of polys) {
    for (const ring of poly) {
      let pts = clip(ring.map(proj))
      if (pts.length < 3) continue
      // Замкнутое кольцо делим пополам по самой дальней от начала точке,
      // иначе у Дугласа — Пекера база нулевой длины и от кольца остаётся 2 точки.
      let far = 0, fd = 0
      pts.forEach((p, i) => { const d = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]); if (d > fd) { fd = d; far = i } })
      pts = [...simplify(pts.slice(0, far + 1), tol), ...simplify([...pts.slice(far), pts[0]], tol).slice(1, -1)]
      // мелкие острова и озёра меньше ~3 px — не нужны
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
      if (Math.max(...xs) - Math.min(...xs) < 3 && Math.max(...ys) - Math.min(...ys) < 3) continue
      d += 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z'
    }
  }
  return d
}

const pick = (re, a3) => g.features.find((f) => f.properties.adm0_a3 === a3 && re.test(f.properties.name))
const lo = pick(/^Leningrad$/, 'RUS')
const spb = pick(/Petersburg/, 'RUS')
const neighbors = [
  pick(/^Pskov$/, 'RUS'), pick(/^Karelia$/, 'RUS'), pick(/^Novgorod$/, 'RUS'), pick(/^Vologda$/, 'RUS'),
  pick(/^South Karelia$/, 'FIN'), pick(/^Kymenlaakso$/, 'FIN'), pick(/^Uusimaa$/, 'FIN'),
  pick(/^Ida-Viru$/, 'EST'), pick(/^Lääne-Viru$/, 'EST'),
]

const shapes = {
  w: W,
  h: H,
  lo: toPath(lo.geometry, 0.7),
  spb: toPath(spb.geometry, 0.5),
  near: neighbors.map((f) => toPath(f.geometry, 1.2)).join(''),
}

const ts = `/**
 * Контуры для карты зоны выезда. Собрано скриптом из Natural Earth
 * (ne_10m_admin_1_states_provinces_lakes, общественное достояние — подпись не
 * обязательна). Проекция: долгота × cos(59.9°), окно ${LON0}–${LON1}° в. д.,
 * ${LAT0}–${LAT1}° с. ш. Не править вручную.
 */
export const MAP = ${JSON.stringify(shapes)} as const

export const MAP_PROJ = { lon0: ${LON0}, lat1: ${LAT1}, k: ${K.toFixed(6)}, s: ${S.toFixed(4)} } as const

/** Долгота/широта → точка на карте. */
export function project(lon: number, lat: number): [number, number] {
  return [(lon - MAP_PROJ.lon0) * MAP_PROJ.k * MAP_PROJ.s, (MAP_PROJ.lat1 - lat) * MAP_PROJ.s]
}
`
writeFileSync(out, ts)
console.log('W', W, 'H', H, 'bytes', ts.length, 'lo', shapes.lo.length, 'spb', shapes.spb.length, 'near', shapes.near.length)
