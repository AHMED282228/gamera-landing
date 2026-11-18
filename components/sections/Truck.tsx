'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useReducedMotion } from 'motion/react'

import { TOUR_MEDIA } from '@/lib/config'
import { TRUCK_HEAD, TRUCK_TOUR } from '@/lib/content'
import { TOUR_PARTS, type Pt, type TourPhoto } from '@/lib/tourParts'
import { SectionHead } from '@/components/ui/SectionHead'
import { BotButton, CallButton } from '@/components/ui/ActionButtons'

/**
 * Обзор эвакуатора — показ по нажатию (просьба владельца 15 ноября 2026:
 * «не скроллинг, а кликабельно; движение камеры; как у Apple — деталь
 * выделяется, отделяется»). Образец — блок Apple «Take a closer look» и точки
 * на машине в конфигураторах автопроизводителей.
 *
 * Слева список деталей (раскрывается текст выбранной), справа кадр 4K из
 * съёмки владельца. Нажал деталь (в списке или точку на кадре):
 *   • камера летит к ней: в пределах кадра — плавный наезд (масштаб по
 *     логарифму, на длинном переходе камера чуть отъезжает и снова наезжает);
 *     к другому кадру — проход вбок вокруг машины (сбоку ↔ сзади) или наплыв
 *     (пустая платформа ↔ с машиной);
 *   • деталь «отделяется»: остальное темнеет, копия кадра, обрезанная по
 *     контуру детали, приподнимается с тенью, по контуру прочерчивается
 *     янтарная линия; мышью деталь чуть поворачивается;
 *   • у лебёдки, аппарелей и ремней — сноска с настоящей съёмкой, к ней
 *     тянется выноска; у лебёдки ещё прочерчивается трос — по нему бегут штрихи
 *     к барабану (тянет), рядом подпись «Трос».
 * Если никто ничего не нажал, обзор один раз сам проходит детали (полоска в
 * строке списка — сколько осталось); любое нажатие отдаёт управление человеку.
 * На телефоне — свайп по кадру влево/вправо.
 *
 * Всё движение — transform / opacity / атрибуты SVG из одного rAF, который
 * работает, только пока что-то движется. Без JS кадр стоит общим планом, а все
 * тексты списка раскрыты. При «уменьшить движение» камера не летит, а
 * переключается, деталь выделяется без подъёма, сам обзор не листается.
 * Контуры деталей и камеры — lib/tourParts.ts, тексты — TRUCK_TOUR.
 */

const PHOTOS: TourPhoto[] = ['a', 'b', 'c']
/** Где кадр на обходе вокруг машины: сбоку (a) → сзади (b и c с одной точки). */
const ORBIT: Record<TourPhoto, number> = { a: 0, b: 1, c: 1 }

/**
 * Обход вокруг машины (сбоку ↔ сзади): кадры поворачиваются, как стороны машины при
 * шаге вокруг неё — уходящий отворачивается, приходящий заходит с другой стороны.
 */
const TURN_DEG = 22
/**
 * Размытие фона за выбранной деталью, px экрана — одинаковое у всех деталей
 * (владелец: на упорах и колёсах было сильнее, чем на остальных, — «теряются»).
 */
const FOCUS_BLUR = 2
/** Приближение на градус поворота: кадр во всю ширину не открывает края. */
const TURN_COVER = 0.0115
const LIFT_MS = 650
const DROP_MS = 260
/** Насколько деталь крупнее при подъёме (если в tourParts не задано своё grow). */
const LIFT_SCALE = 0.03
/** На сколько пикселей экрана деталь приподнимается. */
const LIFT_RISE = 5
/** Сам обзор: общий вид ждёт столько, каждая деталь — столько. */
const AUTO_FIRST = 2600
const AUTO_MS = 6500
/** Детали со сноской: номер в TOUR_PARTS → чем показана. */
const CARDS = [2, 3, 4, 5] as const
/** Фото в сноске: деталь → картинка и класс (наезд к нужному месту). */
const CARD_IMG: Record<number, { src: string; mod: string }> = {
  2: { src: TOUR_MEDIA.lebedka, mod: 'lebedka' },
  4: { src: TOUR_MEDIA.upory, mod: 'upory' },
  5: { src: TOUR_MEDIA.remen, mod: 'remen' },
}
/** Приподнятая деталь светлее остального кадра во столько раз (если в tourParts не задано). */
const LIGHT = 1.12

type Cam = { x: number; y: number; z: number }
/** Состояние слоя кадра: камера, доп. приближение, сдвиг вбок (px), видимость, поворот (°). */
type Layer = { cam: Cam; zk: number; dx: number; op: number; ry: number }
type Layers = Record<TourPhoto, Layer>
type Kind = 'pan' | 'orbit' | 'swap'
type Move = { t0: number; dur: number; kind: Kind; to: TourPhoto; start: Layers; end: Layers; bump: number }
type View = { left: number; top: number; s: number }
type Geo = {
  fw: number
  fh: number
  /** Кадр «во всю ширину окна» при приближении 1. */
  bw: number
  bh: number
  /** Во сколько раз кадр уже покрывает окно (окно выше 16:9 — k > 1). */
  k: number
  mz: number
  /** Слой кадра рисуется в этом масштабе и уменьшается — чтобы при наезде не мылился. */
  zmax: Record<TourPhoto, number>
  card: { x: number; y: number; w: number; h: number } | null
  labelW: number[]
}

/** Все точки-кнопки: деталь × кадр, где она видна. */
const SPOTS = TOUR_PARTS.flatMap((p, part) =>
  (Object.entries(p.spots) as [TourPhoto, Pt][]).map(([photo, at]) => ({
    part,
    photo,
    at,
    /** Деталь показывается с другой стороны машины — нажатие ведёт в обход. */
    turn: ORBIT[photo] !== ORBIT[p.photo],
    label: p.spotLabel?.[photo] ?? TRUCK_TOUR[part - 1]?.label ?? '',
  })),
)

/** Середина детали — вокруг неё деталь приподнимается. */
const CENTER = TOUR_PARTS.map((p) => {
  if (!p.shapes.length) return null
  const xs = p.shapes.flat().map((q) => q[0])
  const ys = p.shapes.flat().map((q) => q[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 }
})

/**
 * Точка, от которой растёт каждый контур при подъёме: своя у каждого (колесо — от
 * своей середины, а не от середины между колёсами), иначе приподнятая копия
 * съезжает с места и из-под неё выглядывает край оригинала.
 */
const ANCHOR = TOUR_PARTS.map((p) =>
  p.shapes.map((shape, si): Pt => {
    const own = p.anchors?.[si]
    if (own) return own
    const xs = shape.map((q) => q[0])
    const ys = shape.map((q) => q[1])
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  }),
)

/** Рамка контура: середина и полуразмеры, доли кадра. */
function boxOf(shape: readonly Pt[]) {
  const xs = shape.map((q) => q[0])
  const ys = shape.map((q) => q[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hw: (x1 - x0) / 2, hh: (y1 - y0) / 2 }
}

/**
 * Мягкий вырез (soft): эллипс по рамке контура, до 0,9 полуразмера — целиком,
 * дальше растушёвка до 1,45 — резкая копия незаметно переходит в размытый фон.
 */
function softMask(shape: readonly Pt[]) {
  const b = boxOf(shape)
  return (
    `radial-gradient(ellipse ${(b.hw * 145).toFixed(2)}% ${(b.hh * 145).toFixed(2)}% at ` +
    `${(b.cx * 100).toFixed(2)}% ${(b.cy * 100).toFixed(2)}%, #000 62%, transparent 100%)`
  )
}

/** Просвет в затемнении под мягкий вырез: шире и мягче самой копии. */
function softHole(shape: readonly Pt[]) {
  const b = boxOf(shape)
  return (
    `radial-gradient(ellipse ${(b.hw * 230).toFixed(2)}% ${(b.hh * 175).toFixed(2)}% at ` +
    `${(b.cx * 100).toFixed(2)}% ${(b.cy * 100).toFixed(2)}%, transparent 35%, #000 100%)`
  )
}

const polygon = (shape: readonly Pt[]) =>
  `polygon(${shape.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(', ')})`

/**
 * Обводка ремня: у каждой точки — угол той же маски conic-gradient, что проявляет слой
 * (0° — вверх, по часовой, от im.from). Линия видна до того же угла, что и лента.
 */
type EdgePt = { x: number; y: number; r: number }
const STRAP_EDGE: EdgePt[][][][] = TOUR_PARTS.map((p) =>
  (p.strapImgs ?? []).map((im) => {
    const [x0, y0, x1, y1] = im.box
    const cx = x0 + im.at[0] * (x1 - x0)
    const cy = y0 + im.at[1] * (y1 - y0)
    return im.edge.map((run) =>
      run.map(([x, y]) => {
        // угол — в пикселях кадра (у слоя те же пропорции, что у кадра)
        const a = (Math.atan2((x - cx) * 2752, -(y - cy) * 1548) * 180) / Math.PI
        return { x, y, r: (((a - im.from) % 360) + 360) % 360 }
      }),
    )
  }),
)

/** Путь обводки до угла th (all — целиком): на границе — точка ровно на угле. */
function strapPath(runs: EdgePt[][], th: number, all: boolean, at: (x: number, y: number) => Pt) {
  const xy = (x: number, y: number) => {
    const q = at(x, y)
    return `${q[0].toFixed(1)} ${q[1].toFixed(1)}`
  }
  let d = ''
  for (const run of runs) {
    let open = false
    run.forEach((P, j) => {
      const vis = all || P.r <= th
      const A = run[j - 1]
      if (A && !all) {
        const va = A.r <= th
        if (va !== vis && Math.abs(P.r - A.r) < 180) {
          const t = (th - A.r) / (P.r - A.r)
          d += (va ? 'L' : 'M') + xy(A.x + (P.x - A.x) * t, A.y + (P.y - A.y) * t)
          open = true
        }
      }
      if (vis) {
        d += (open ? 'L' : 'M') + xy(P.x, P.y)
        open = true
      } else open = false
    })
  }
  return d
}

/* --- Математика ------------------------------------------------------------ */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (t: number, a: number, b: number) => {
  const x = clamp01((t - a) / (b - a))
  return x * x * (3 - 2 * x)
}
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const out3 = (t: number) => 1 - Math.pow(1 - t, 3)

/** Камера между двумя точками; bump — насколько отъехать посередине пути. */
function mixCam(a: Cam, b: Cam, t: number, bump: number): Cam {
  const z = Math.exp(lerp(Math.log(a.z), Math.log(b.z), t)) / (1 + bump * Math.sin(Math.PI * t))
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z }
}

function viewOf(g: Geo, c: Cam, zk = 1, dx = 0): View {
  const s = Math.max(g.k, c.z * g.mz)
  const w = g.bw * s
  const h = g.bh * s
  let left = Math.min(0, Math.max(g.fw - w, 0.5 * g.fw - c.x * w))
  let top = Math.min(0, Math.max(g.fh - h, 0.5 * g.fh - c.y * h))
  // Доп. приближение — вокруг середины окна: кадр по-прежнему закрывает окно.
  left = 0.5 * g.fw + (left - 0.5 * g.fw) * zk + dx
  top = 0.5 * g.fh + (top - 0.5 * g.fh) * zk
  return { left, top, s: s * zk }
}

const project = (g: Geo, v: View, x: number, y: number): Pt => [v.left + x * g.bw * v.s, v.top + y * g.bh * v.s]

function layerAt(m: Move, ph: TourPhoto, t: number): Layer {
  const s = m.start[ph]
  const e = m.end[ph]
  if (s.op <= 0.002 && e.op <= 0.002) return e
  if (ph === m.to) {
    if (m.kind === 'pan') {
      const k = inOut(t)
      return {
        cam: mixCam(s.cam, e.cam, k, m.bump),
        zk: lerp(s.zk, e.zk, k),
        dx: lerp(s.dx, e.dx, k),
        op: lerp(s.op, 1, smooth(t, 0, 0.5)),
        ry: lerp(s.ry, e.ry, k),
      }
    }
    // Приходящий кадр «доезжает» на место с торможением.
    const k = out3(clamp01((t - 0.12) / 0.88))
    return {
      cam: mixCam(s.cam, e.cam, k, 0),
      zk: lerp(s.zk, e.zk, k),
      dx: lerp(s.dx, e.dx, k),
      op: lerp(s.op, 1, smooth(t, 0.22, 0.72)),
      // Поворот дольше подъезда — чтобы его было видно, пока кадр проявляется.
      ry: lerp(s.ry, e.ry, inOut(clamp01((t - 0.1) / 0.9))),
    }
  }
  // Уходящий — разгоняется и гаснет.
  const k = clamp01(t / 0.65) ** 2
  return { cam: s.cam, zk: lerp(s.zk, e.zk, k), dx: lerp(s.dx, e.dx, k), op: s.op * (1 - smooth(t, 0.08, 0.6)), ry: lerp(s.ry, e.ry, smooth(t, 0, 0.55)) }
}

const mainPhoto = (ls: Layers) => PHOTOS.reduce((a, b) => (ls[b].op > ls[a].op ? b : a))

/** Камера первой детали на кадре — с неё кадр начинает, пока его не показывали. */
const firstOn = (ph: TourPhoto) => (TOUR_PARTS.find((p) => p.photo === ph && p.shapes.length) ?? TOUR_PARTS[0]).cam

const initialLayers = (): Layers => ({
  a: { cam: TOUR_PARTS[0].cam, zk: 1, dx: 0, op: 1, ry: 0 },
  b: { cam: firstOn('b'), zk: 1, dx: 0, op: 0, ry: 0 },
  c: { cam: firstOn('c'), zk: 1, dx: 0, op: 0, ry: 0 },
})

const cloneLayers = (ls: Layers): Layers => ({ a: { ...ls.a }, b: { ...ls.b }, c: { ...ls.c } })

function hide(el: Element | null | undefined) {
  const st = (el as HTMLElement | null)?.style
  if (st && st.visibility !== 'hidden') st.visibility = 'hidden'
}

/** Линия, прочерченная на долю t. */
function dash(el: SVGElement, len: number, t: number) {
  el.style.strokeDasharray = `${len.toFixed(1)} ${(len + 4).toFixed(1)}`
  el.style.strokeDashoffset = (len * (1 - t)).toFixed(1)
}

function ringLen(a: Pt[], closed: boolean) {
  let L = 0
  for (let i = 1; i < a.length; i++) L += Math.hypot(a[i][0] - a[i - 1][0], a[i][1] - a[i - 1][1])
  if (closed && a.length > 1) L += Math.hypot(a[0][0] - a[a.length - 1][0], a[0][1] - a[a.length - 1][1])
  return L
}

const pts = (a: Pt[]) => a.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

/* --- Компонент ------------------------------------------------------------- */

export function Truck() {
  const reduced = useReducedMotion() ?? false
  const [active, setActive] = useState(0)
  const [auto, setAuto] = useState<'wait' | 'on' | 'off'>('wait')
  const [inView, setInView] = useState(false)
  const [visits, setVisits] = useState(0)

  const stageRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const worldRef = useRef<Partial<Record<TourPhoto, HTMLDivElement | null>>>({})
  const dimRef = useRef<Partial<Record<TourPhoto, HTMLDivElement | null>>>({})
  /** Основной снимок каждого кадра — его размывает фокус. */
  const baseRef = useRef<Partial<Record<TourPhoto, HTMLImageElement | null>>>({})
  const liftRef = useRef<(HTMLDivElement | null)[][]>(TOUR_PARTS.map(() => []))
  const edgeRef = useRef<(SVGPolygonElement | null)[][]>(TOUR_PARTS.map(() => []))
  const glowRef = useRef<(SVGPolygonElement | null)[][]>(TOUR_PARTS.map(() => []))
  /** Трос: [линия, бегущие штрихи] и подпись. */
  const cableRef = useRef<(SVGPolylineElement | null)[][]>(TOUR_PARTS.map(() => []))
  const cableTagRef = useRef<(HTMLElement | null)[]>([])
  /** Ремни через колёса — слои поверх снимка (StrapImg); подпись. */
  const strapImgRef = useRef<(HTMLImageElement | null)[][]>(TOUR_PARTS.map(() => []))
  /** Обводка ремней: [свечение, линия] на каждый ремень подряд. */
  const strapEdgeRef = useRef<(SVGPathElement | null)[][]>(TOUR_PARTS.map(() => []))
  const strapTagRef = useRef<(HTMLElement | null)[]>([])
  const spotRef = useRef<(HTMLButtonElement | null)[]>([])
  const cardRef = useRef<(HTMLElement | null)[]>([])
  const wireRef = useRef<SVGPolylineElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const geo = useRef<Geo | null>(null)
  const layers = useRef<Layers>(initialLayers())
  const move = useRef<Move | null>(null)
  const target = useRef(0)
  const lift = useRef({ part: 0, t0: 0 })
  const drop = useRef<{ part: number; t0: number; from: number } | null>(null)
  const raf = useRef(0)
  const fine = useRef(false)
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced
  /** Что уже выставлено в DOM — чтобы не трогать атрибуты каждый кадр. */
  const shown = useRef({ spots: [] as boolean[], left: [] as boolean[], cards: [] as boolean[], dimFor: {} as Record<string, number> })
  const swipe = useRef<{ x: number; y: number } | null>(null)

  /** Один кадр анимации. Возвращает true, если что-то ещё движется. */
  const paint = useCallback((now: number) => {
    const g = geo.current
    if (!g) return false
    const red = reducedRef.current

    // 1. Слои кадров и камера.
    const m = move.current
    let blur = 0
    let settled = true
    if (m) {
      const t = clamp01((now - m.t0) / m.dur)
      const next = {} as Layers
      for (const ph of PHOTOS) next[ph] = layerAt(m, ph, t)
      layers.current = next
      if (m.kind === 'orbit' && fine.current && !red) blur = Math.sin(Math.PI * t) * 4
      settled = t > 0.82
      if (t >= 1) move.current = null
    }
    const cur = layers.current
    const views: Partial<Record<TourPhoto, View>> = {}
    for (const ph of PHOTOS) {
      const el = worldRef.current[ph]
      const L = cur[ph]
      if (!el) continue
      if (L.op <= 0.002) {
        hide(el)
        continue
      }
      const v = viewOf(g, L.cam, L.zk * (1 + TURN_COVER * Math.abs(L.ry)), L.dx)
      views[ph] = v
      const k = v.s / g.zmax[ph]
      el.style.visibility = 'visible'
      el.style.opacity = L.op >= 0.998 ? '1' : L.op.toFixed(3)
      // Поворот при обходе — вокруг вертикали через середину окна, с перспективой.
      const turn =
        Math.abs(L.ry) > 0.02
          ? `translate3d(${(g.fw / 2).toFixed(1)}px, ${(g.fh / 2).toFixed(1)}px, 0) perspective(${(g.fw * 1.5).toFixed(0)}px) ` +
            `rotateY(${L.ry.toFixed(2)}deg) translate3d(${(-g.fw / 2).toFixed(1)}px, ${(-g.fh / 2).toFixed(1)}px, 0) `
          : ''
      el.style.transform = `${turn}translate3d(${v.left.toFixed(2)}px, ${v.top.toFixed(2)}px, 0) scale(${k.toFixed(5)})`
      // Размытие задаётся до масштаба слоя — делим, чтобы на экране было blur px.
      el.style.filter = blur > 0.3 ? `blur(${(blur / k).toFixed(1)}px)` : ''
    }

    // 2. Деталь: подъём, тень, контур.
    // Деталь стоит на месте, ровно в своей обводке: наклон за мышкой убран
    // (замечание владельца — деталь «немного двигалась» и съезжала с контура).
    const la = lift.current
    const La = la.part ? out3(clamp01((now - la.t0) / (red ? 180 : LIFT_MS))) : 0
    const d = drop.current
    let Ld = 0
    if (d) {
      Ld = d.from * (1 - clamp01((now - d.t0) / DROP_MS))
      if (Ld <= 0) drop.current = null
    }
    const levelOf = (i: number) => (i === la.part ? La : d && i === d.part ? Ld : 0)
    const dimLv: Record<TourPhoto, number> = { a: 0, b: 0, c: 0 }
    const dimBy: Record<TourPhoto, number> = { a: 0, b: 0, c: 0 }
    const focLv: Record<TourPhoto, number> = { a: 0, b: 0, c: 0 }
    let hotAt: Pt | null = null

    TOUR_PARTS.forEach((p, i) => {
      const lifts = liftRef.current[i]
      const c = CENTER[i]
      if (!lifts.length || !c) return
      const lv = levelOf(i)
      const v = views[p.photo]
      const edges = edgeRef.current[i]
      const glows = glowRef.current[i]
      if (lv <= 0.001 || !v) {
        lifts.forEach(hide)
        edges.forEach(hide)
        glows.forEach(hide)
        cableRef.current[i].forEach(hide)
        hide(cableTagRef.current[i])
        strapImgRef.current[i].forEach(hide)
        strapEdgeRef.current[i].forEach(hide)
        hide(strapTagRef.current[i])
        return
      }
      if (lv > dimLv[p.photo]) {
        dimLv[p.photo] = lv
        dimBy[p.photo] = i
      }
      if (lv > focLv[p.photo]) focLv[p.photo] = lv
      const f = g.zmax[p.photo] / v.s
      // Фокус — деталь точно на месте: ни подъёма, ни роста.
      const still = red || !!p.focus
      const sc = 1 + (still ? 0 : (p.grow ?? LIFT_SCALE) * lv)
      const rise = still ? 0 : LIFT_RISE * lv
      // Каждый контур — свой слой, растёт от своей точки (transform-origin = ANCHOR).
      const tf = `translate3d(0, ${(-rise * f).toFixed(2)}px, 0) scale(${sc.toFixed(4)})`
      // Деталь светлее кадра: так она отделяется, даже когда сама тёмная (лебёдка).
      // Контур в глубокой тени (переднее колесо) — ещё и мягче по контрасту: тени
      // приподнимаются, колесо видно, а не просто светлее чёрное.
      const shadow = p.focus
        ? ''
        : ` drop-shadow(0 ${(9 * lv * f).toFixed(1)}px ${(14 * f).toFixed(1)}px rgb(0 0 0 / ${(0.75 * lv).toFixed(3)}))`
      const fltOf = (si: number) => {
        const L = p.shapeLight?.[si] ?? p.light ?? LIGHT
        // у теней снимка синеватый оттенок — у сильно осветлённого колеса цвет глуше
        const soft = L >= 1.7 ? ` contrast(${(1 - 0.1 * lv).toFixed(3)}) saturate(${(1 - 0.55 * lv).toFixed(3)})` : ''
        return `brightness(${(1 + (L - 1) * lv).toFixed(3)})${soft}${shadow}`
      }
      const op = smooth(lv, 0, 0.3).toFixed(3)
      lifts.forEach((el, si) => {
        if (!el) return
        el.style.visibility = 'visible'
        el.style.opacity = op
        el.style.transform = tf
        el.style.filter = fltOf(si)
      })

      const lifted = (x: number, y: number, si: number): Pt => {
        const [ax, ay] = ANCHOR[i][si]
        const q = project(g, v, ax + (x - ax) * sc, ay + (y - ay) * sc)
        return [q[0], q[1] - rise]
      }
      const drawn = i === la.part ? inOut(clamp01((now - la.t0 - 80) / (red ? 1 : 750))) : 1
      const o = smooth(lv, 0, 0.5).toFixed(3)
      if (p.outline === false) {
        edges.forEach(hide)
        glows.forEach(hide)
      } else p.shapes.forEach((shape, si) => {
        const line = shape.map(([x, y]) => lifted(x, y, si))
        const s = pts(line)
        const len = ringLen(line, true)
        for (const pe of [edges[si], glows[si]]) {
          if (!pe) continue
          pe.setAttribute('points', s)
          pe.style.visibility = 'visible'
          pe.style.opacity = o
          dash(pe, len, drawn)
        }
      })
      // Трос лежит на настиле — не приподнимается. Прочерчивается после контура,
      // потом по нему бегут штрихи к барабану (CSS), у середины — подпись.
      if (p.cable) {
        const [line, flow] = cableRef.current[i]
        const tag = cableTagRef.current[i]
        const way = p.cable.map(([x, y]) => project(g, v, x, y))
        const k = i === la.part ? inOut(clamp01((now - la.t0 - 450) / (red ? 1 : 1100))) : 1
        const s = pts(way)
        for (const pl of [line, flow]) {
          if (!pl) continue
          pl.setAttribute('points', s)
          pl.style.visibility = 'visible'
        }
        if (line) {
          line.style.opacity = o
          dash(line, ringLen(way, false), k)
        }
        if (flow) flow.style.opacity = k >= 1 ? o : '0'
        if (tag) {
          const at = way[Math.round((way.length - 1) * 0.5)]
          tag.style.transform = `translate3d(${at[0].toFixed(1)}px, ${at[1].toFixed(1)}px, 0)`
          tag.style.visibility = 'visible'
          tag.style.opacity = (smooth(k, 0.4, 1) * smooth(lv, 0.5, 1)).toFixed(3)
        }
      }
      // Ремни проявляются после подъёма — по кругу от переднего крюка через верх шины
      // к заднему (маска conic-gradient вокруг колеса), второй чуть позже первого.
      if (p.strapImgs) {
        let done = true
        p.strapImgs.forEach((im, k) => {
          const el = strapImgRef.current[i][k]
          if (!el) return
          const q = i === la.part ? inOut(clamp01((now - la.t0 - 380 - k * 260) / (red ? 1 : 1300))) : 1
          if (q < 1) done = false
          const lines = [strapEdgeRef.current[i][k * 2], strapEdgeRef.current[i][k * 2 + 1]]
          if (q <= 0) {
            lines.forEach(hide)
            return hide(el)
          }
          el.style.visibility = 'visible'
          el.style.opacity = o
          // обводка — до середины мягкого края маски (+5° из 10)
          const d = strapPath(STRAP_EDGE[i][k], q * im.sweep + 5, q >= 1, (x, y) => project(g, v, x, y))
          for (const pe of lines) {
            if (!pe) continue
            pe.setAttribute('d', d || 'M0 0')
            pe.style.visibility = d ? 'visible' : 'hidden'
            pe.style.opacity = o
          }
          const m =
            q >= 1
              ? 'none'
              : `conic-gradient(from ${im.from}deg at ${(im.at[0] * 100).toFixed(1)}% ${(im.at[1] * 100).toFixed(1)}%, ` +
                `#000 ${(q * im.sweep).toFixed(1)}deg, transparent ${(q * im.sweep + 10).toFixed(1)}deg)`
          el.style.maskImage = m
          el.style.setProperty('-webkit-mask-image', m)
        })
        const tag = strapTagRef.current[i]
        if (tag && p.tagAt) {
          const qp = project(g, v, p.tagAt[0], p.tagAt[1])
          tag.style.transform = `translate3d(${qp[0].toFixed(1)}px, ${qp[1].toFixed(1)}px, 0)`
          // не влезает справа — встаёт над точкой (слева второй ремень — его не закрыть);
          // не влезает и так — слева
          const w = tag.offsetWidth
          const pos =
            qp[0] + 14 + w <= g.fw - 8 ? '' : qp[0] - w / 2 >= 8 && qp[0] + w / 2 <= g.fw - 8 ? 'top' : 'left'
          if ((tag.dataset.pos ?? '') !== pos) {
            if (pos) tag.dataset.pos = pos
            else delete tag.dataset.pos
          }
          tag.style.visibility = 'visible'
          tag.style.opacity = done ? smooth(lv, 0.5, 1).toFixed(3) : '0'
        }
      }

      if (i === la.part) {
        const h = p.wireAt ?? p.spots[p.photo]
        if (h) {
          // точка лежит на ближайшем к ней контуре — растёт вместе с ним
          const near = ANCHOR[i].reduce(
            (best, a, si) => (Math.hypot(a[0] - h[0], a[1] - h[1]) < Math.hypot(ANCHOR[i][best][0] - h[0], ANCHOR[i][best][1] - h[1]) ? si : best),
            0,
          )
          hotAt = lifted(h[0], h[1], near)
        }
      }
    })

    for (const ph of PHOTOS) {
      const el = dimRef.current[ph]
      if (!el) continue
      const lv = dimLv[ph]
      if (lv <= 0.001) {
        hide(el)
        continue
      }
      // Затемнение — пятном светлее вокруг детали, по её размеру: маленькая
      // лебёдка под «прожектором», большая платформа — в широком пятне.
      if (shown.current.dimFor[ph] !== dimBy[ph]) {
        shown.current.dimFor[ph] = dimBy[ph]
        const c = CENTER[dimBy[ph]]
        const part = TOUR_PARTS[dimBy[ph]]
        if (part.soft) {
          // Прожекторы: ровная тень по всему кадру, на каждой детали — мягкий просвет.
          const holes = part.shapes.map(softHole).join(', ')
          el.style.background = 'rgb(6 7 10 / 0.66)'
          el.style.setProperty('-webkit-mask-image', holes)
          el.style.setProperty('-webkit-mask-composite', 'source-in')
          el.style.maskImage = holes
          el.style.maskComposite = 'intersect'
        } else if (c) {
          el.style.removeProperty('-webkit-mask-image')
          el.style.removeProperty('-webkit-mask-composite')
          el.style.maskImage = ''
          el.style.maskComposite = ''
          const rx = Math.max(0.07, c.w * 0.85) * 100
          const ry = Math.max(0.09, c.h * 1.1) * 100
          el.style.background =
            `radial-gradient(ellipse ${rx.toFixed(1)}% ${ry.toFixed(1)}% at ${(c.cx * 100).toFixed(1)}% ${(c.cy * 100).toFixed(1)}%, ` +
            `rgb(6 7 10 / ${part.dim ?? 0.2}), rgb(6 7 10 / 0.66))`
        }
      }
      el.style.visibility = 'visible'
      el.style.opacity = lv.toFixed(3)
    }

    // Фокус: основной снимок кадра размыт, деталь (копия поверх) резкая. Размытие
    // задаётся до масштаба слоя — делим, чтобы на экране было FOCUS_BLUR px.
    for (const ph of PHOTOS) {
      const img = baseRef.current[ph]
      const v = views[ph]
      if (!img) continue
      const b = v ? FOCUS_BLUR * focLv[ph] : 0
      const want = v && b > 0.05 ? `blur(${((b * g.zmax[ph]) / v.s).toFixed(2)}px)` : ''
      if (img.style.filter !== want) img.style.filter = want
    }

    // 3. Точки-кнопки: на кадре, где стоит камера, кроме выбранной детали и
    // тех, что легли бы под сноску.
    const here = mainPhoto(cur)
    const cardOn = La > 0.5 && (CARDS as readonly number[]).includes(la.part)
    const cr = g.card
    const pos: ({ x: number; y: number; w: number; on: boolean } | null)[] = []
    SPOTS.forEach((s, i) => {
      const el = spotRef.current[i]
      if (!el) return
      const v = views[s.photo]
      let on = false
      if (v) {
        const [x, y] = project(g, v, s.at[0], s.at[1])
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
        const w = g.labelW[i]
        const underCard = cardOn && !!cr && x > cr.x - 16 && x < cr.x + cr.w + 16 + w && y > cr.y - 16 && y < cr.y + cr.h + 16
        on =
          settled && s.photo === here && s.part !== target.current && !underCard && x > 22 && x < g.fw - 22 && y > 22 && y < g.fh - 22
        pos[i] = { x, y, w, on }
      } else pos[i] = null
      if (on !== !!shown.current.spots[i]) {
        shown.current.spots[i] = on
        el.toggleAttribute('data-on', on)
      }
    })

    // 3б. Подписи точек. Справа от точки, у правого края — слева. Если подпись
    // легла бы на соседнюю точку или подпись, она уходит на другую сторону, а
    // если тесно с обеих — остаётся номер на точке (он совпадает со списком),
    // название видно при наведении. Раньше на кадре 1024–1140 px «Излом
    // платформы» лежала под «Лебёдкой за щитом» (проверка 16 ноября 2026).
    const taken: number[][] = []
    const hit = (r: number[]) => taken.some((t) => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1])
    pos.forEach((p) => {
      if (p && p.on) taken.push([p.x - 15, p.y - 15, p.x + 15, p.y + 15])
    })
    pos.forEach((p, i) => {
      const el = spotRef.current[i]
      if (!p || !el) return
      const fitsR = p.x + 22 + p.w <= g.fw - 10
      const fitsL = p.x - 22 - p.w >= 10
      let left = !!p.w && !fitsR && fitsL
      let quiet = false
      if (p.on && p.w) {
        const R = [p.x + 18, p.y - 15, p.x + 22 + p.w, p.y + 15]
        const L = [p.x - 22 - p.w, p.y - 15, p.x - 18, p.y + 15]
        if (hit(left ? L : R)) {
          if ((left ? fitsR : fitsL) && !hit(left ? R : L)) left = !left
          else quiet = true
        }
        if (!quiet) taken.push(left ? L : R)
      }
      if (left !== shown.current.left[i]) {
        shown.current.left[i] = left
        el.toggleAttribute('data-left', left)
      }
      if (quiet !== el.hasAttribute('data-quiet')) el.toggleAttribute('data-quiet', quiet)
    })

    // 4. Сноска с настоящей съёмкой и выноска к ней.
    for (const p of CARDS) {
      const el = cardRef.current[p]
      const on = cardOn && la.part === p
      if (el && on !== !!shown.current.cards[p]) {
        shown.current.cards[p] = on
        el.toggleAttribute('data-on', on)
      }
    }
    const wire = wireRef.current
    const hot = hotAt as Pt | null
    if (wire) {
      if (g.card && hot && cardOn && (CARDS as readonly number[]).includes(la.part)) {
        const c = g.card
        const end: Pt = [Math.min(c.x + c.w, Math.max(c.x, hot[0])), Math.min(c.y + c.h, Math.max(c.y, hot[1]))]
        // Излом выноски: от детали по горизонтали, потом к сноске — как на чертеже.
        const line: Pt[] = [hot, [hot[0] + (end[0] - hot[0]) * 0.4, hot[1]], end]
        wire.setAttribute('points', pts(line))
        wire.style.visibility = 'visible'
        wire.style.opacity = smooth(La, 0.5, 0.9).toFixed(3)
        dash(wire, ringLen(line, false), clamp01((La - 0.5) / 0.5))
      } else hide(wire)
    }

    // Съёмка аппарелей идёт, только пока видна её сноска.
    const vid = videoRef.current
    if (vid) {
      const want = cardOn && la.part === 3
      if (want && vid.paused) vid.play().catch(() => {})
      else if (!want && !vid.paused) vid.pause()
    }

    return (
      !!move.current ||
      (la.part > 0 && now < la.t0 + (TOUR_PARTS[la.part].strapImgs ? 2200 : TOUR_PARTS[la.part].cable ? 1700 : 900)) ||
      !!drop.current
    )
  }, [])

  const kick = useCallback(() => {
    if (raf.current) return
    const step = () => {
      raf.current = 0
      if (paint(performance.now())) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }, [paint])

  /** Камера к детали next (0 — общий вид). Можно звать посреди перелёта. */
  const go = useCallback(
    (next: number) => {
      if (target.current === next) return
      target.current = next
      const g = geo.current
      const now = performance.now()
      const red = reducedRef.current
      const part = TOUR_PARTS[next]

      // Перелёт ещё идёт — начинаем новый с того места, где камера сейчас.
      const m = move.current
      if (m) {
        const t = clamp01((now - m.t0) / m.dur)
        const ls = {} as Layers
        for (const ph of PHOTOS) ls[ph] = layerAt(m, ph, t)
        layers.current = ls
      }
      const cur = layers.current
      const from = mainPhoto(cur)
      const to = part.photo
      const kind: Kind = from === to && cur[to].op > 0.98 ? 'pan' : ORBIT[from] === ORBIT[to] ? 'swap' : 'orbit'
      const dir = kind === 'orbit' ? Math.sign(ORBIT[to] - ORBIT[from]) : 0
      const D = red ? 0 : 0.05 * (g?.fw ?? 1000)
      // Приближение при обходе покрывает и поворот: края кадра не открываются.
      const EZ = red ? 1 : kind === 'orbit' ? 1.16 : 1.06
      const TURN = red ? 0 : dir * TURN_DEG
      const start = cloneLayers(cur)
      const end = cloneLayers(cur)
      for (const ph of PHOTOS) {
        if (ph === to) {
          if (start[ph].op < 0.01) start[ph] = { cam: part.cam, zk: EZ, dx: dir * D, op: 0, ry: TURN }
          end[ph] = { cam: part.cam, zk: 1, dx: 0, op: 1, ry: 0 }
        } else if (start[ph].op > 0.002) {
          end[ph] = { cam: start[ph].cam, zk: start[ph].zk * EZ, dx: start[ph].dx - dir * D, op: 0, ry: start[ph].ry - TURN }
        }
      }
      const a = start[to].cam
      const b = part.cam
      const dist = Math.hypot(b.x - a.x, (b.y - a.y) * 0.5625)
      const effort = dist + 0.25 * Math.abs(Math.log(b.z / a.z))
      const bump = kind === 'pan' && Math.min(a.z, b.z) >= 1.4 ? Math.min(0.3, dist) : 0
      const dur = red
        ? kind === 'pan'
          ? 1
          : 320
        : kind === 'pan'
          ? 750 + 900 * Math.min(1, effort)
          : kind === 'orbit'
            ? 1350
            : 1000
      move.current = { t0: now, dur, kind, to, start, end, bump }

      const prev = lift.current
      if (prev.part && prev.part !== next) {
        const Lp = out3(clamp01((now - prev.t0) / LIFT_MS))
        drop.current = Lp > 0 ? { part: prev.part, t0: now, from: Lp } : null
      }
      lift.current = { part: next, t0: now + dur * (kind === 'pan' ? 0.6 : 0.72) }
      kick()
    },
    [kick],
  )

  const select = useCallback(
    (i: number) => {
      setActive(i)
      go(i)
    },
    [go],
  )

  /** Нажатие человека: обзор больше сам не листается. */
  const choose = useCallback(
    (i: number) => {
      setAuto('off')
      select(i === target.current && i !== 0 ? 0 : i)
    },
    [select],
  )

  const measure = useCallback(() => {
    const frame = frameRef.current
    if (!frame) return
    const fw = frame.clientWidth
    const fh = frame.clientHeight
    if (!fw || !fh) return
    const bw = fw
    const bh = fw / TOUR_MEDIA.ratio
    const k = Math.max(1, fh / bh)
    const mz = Math.max(1, k * 0.62)
    const zmax: Record<TourPhoto, number> = { a: k, b: k, c: k }
    for (const p of TOUR_PARTS) zmax[p.photo] = Math.max(zmax[p.photo], p.cam.z * mz)
    for (const ph of PHOTOS) {
      const el = worldRef.current[ph]
      if (!el) continue
      el.style.width = `${(bw * zmax[ph]).toFixed(1)}px`
      el.style.height = `${(bh * zmax[ph]).toFixed(1)}px`
    }
    // Сноска ездит transform-ом — место берём по offset* (без transform).
    const card = cardRef.current[CARDS[0]]
    geo.current = {
      fw,
      fh,
      bw,
      bh,
      k,
      mz,
      zmax,
      card: card ? { x: card.offsetLeft, y: card.offsetTop, w: card.offsetWidth, h: card.offsetHeight } : null,
      labelW: spotRef.current.map((el) => el?.querySelector<HTMLElement>('.tour-spot__label')?.offsetWidth ?? 0),
    }
    svgRef.current?.setAttribute('viewBox', `0 0 ${fw} ${fh}`)
    fine.current = matchMedia('(hover: hover) and (pointer: fine)').matches

    // Список не прыгает по высоте, когда раскрывается другая деталь: держим
    // высоту под самый длинный текст.
    const list = listRef.current
    if (list) {
      let heads = 0
      let body = 0
      list.querySelectorAll<HTMLElement>('.tour-item').forEach((li) => {
        heads += li.querySelector<HTMLElement>('.tour-item__head')?.offsetHeight ?? 0
        body = Math.max(body, li.querySelector<HTMLElement>('.tour-item__text')?.offsetHeight ?? 0)
      })
      list.style.minHeight = `${heads + body + 1}px`
    }
  }, [])

  useEffect(() => {
    const run = () => {
      measure()
      kick()
    }
    run()
    const ro = new ResizeObserver(run)
    if (stageRef.current) ro.observe(stageRef.current)
    if (listRef.current) ro.observe(listRef.current)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf.current)
      raf.current = 0
    }
  }, [measure, kick])

  // Виден ли кадр: сам обзор идёт только на экране; ролик качаем заранее.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    let was = false
    const io = new IntersectionObserver(
      ([e]) => {
        const on = e.intersectionRatio >= 0.5
        if (on === was) return
        was = on
        setInView(on)
        // Вернулись к обзору — отсчёт текущей детали начинается заново.
        if (on) setVisits((n) => n + 1)
      },
      { threshold: [0, 0.5, 1] },
    )
    io.observe(el)
    const v = videoRef.current
    const near = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        near.disconnect()
        if (v) {
          v.preload = 'auto'
          v.load()
        }
        // Кадры 4K раскодируем заранее: иначе первый перелёт к кадру сзади
        // спотыкается, пока браузер его раскодирует.
        el.querySelectorAll<HTMLImageElement>('.tour-world__img').forEach((img) => {
          img.loading = 'eager'
          img.decode().catch(() => {})
        })
      },
      { rootMargin: '100% 0px' },
    )
    near.observe(el)
    return () => {
      io.disconnect()
      near.disconnect()
    }
  }, [])

  useEffect(() => {
    if (inView && auto === 'wait' && !reduced) setAuto('on')
  }, [inView, auto, reduced])

  useEffect(() => {
    if (auto !== 'on' || !inView) return
    const id = window.setTimeout(
      () => {
        const next = active === TOUR_PARTS.length - 1 ? 0 : active + 1
        if (next === 0) setAuto('off')
        select(next)
      },
      active === 0 ? AUTO_FIRST : AUTO_MS,
    )
    return () => window.clearTimeout(id)
  }, [auto, inView, active, visits, select])

  const hint = (part: number, on: boolean) =>
    SPOTS.forEach((s, j) => {
      if (s.part === part) spotRef.current[j]?.toggleAttribute('data-hot', on)
    })

  const autoRun = auto === 'on' && inView && !reduced

  return (
    <section
      id="truck"
      aria-labelledby="truck-title"
      className="tour section"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && target.current !== 0) choose(0)
      }}
    >
      <div className="tour__grid">
        <SectionHead id="truck-title" className="tour__head" {...TRUCK_HEAD} />

        <div
          ref={stageRef}
          className="tour__stage"
          onPointerDown={(e) => {
            swipe.current = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY }
          }}
          onPointerUp={(e) => {
            const s = swipe.current
            swipe.current = null
            if (!s) return
            const dx = e.clientX - s.x
            const dy = e.clientY - s.y
            if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.5) return
            const next = Math.min(TOUR_PARTS.length - 1, Math.max(0, target.current + (dx < 0 ? 1 : -1)))
            if (next !== target.current) choose(next)
          }}
          onPointerCancel={() => {
            swipe.current = null
          }}
        >
          <div ref={frameRef} className="tour__frame" aria-hidden="true">
            {PHOTOS.map((ph) => (
              <div
                key={ph}
                ref={(el) => {
                  worldRef.current[ph] = el
                }}
                className="tour-world"
                data-photo={ph}
              >
                <img
                  ref={(el) => {
                    baseRef.current[ph] = el
                  }}
                  className="tour-world__img"
                  src={TOUR_MEDIA[ph].src}
                  srcSet={TOUR_MEDIA[ph].srcSet}
                  sizes="(max-width: 1023px) 130vw, 120vw"
                  width={2752}
                  height={1548}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
                <div
                  ref={(el) => {
                    dimRef.current[ph] = el
                  }}
                  className="tour-dim"
                />
                {TOUR_PARTS.map((p, i) =>
                  p.photo === ph
                    ? p.shapes.map((shape, si) => (
                        <div
                          key={`${p.id}${si}`}
                          ref={(el) => {
                            liftRef.current[i][si] = el
                          }}
                          className="tour-lift"
                          style={{
                            transformOrigin: `${(ANCHOR[i][si][0] * 100).toFixed(2)}% ${(ANCHOR[i][si][1] * 100).toFixed(2)}%`,
                          }}
                        >
                          <img
                            className="tour-world__img"
                            src={TOUR_MEDIA[ph].src}
                            srcSet={TOUR_MEDIA[ph].srcSet}
                            sizes="(max-width: 1023px) 130vw, 120vw"
                            width={2752}
                            height={1548}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            style={
                              p.soft
                                ? { WebkitMaskImage: softMask(shape), maskImage: softMask(shape) }
                                : { clipPath: polygon(shape) }
                            }
                          />
                        </div>
                      ))
                    : null,
                )}
                {TOUR_PARTS.map((p, i) =>
                  p.photo === ph
                    ? p.strapImgs?.map((im, k) => (
                        <img
                          key={`${p.id}-strapimg${k}`}
                          ref={(el) => {
                            strapImgRef.current[i][k] = el
                          }}
                          className="tour-strapimg"
                          src={TOUR_MEDIA[im.media]}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          style={{
                            left: `${(im.box[0] * 100).toFixed(3)}%`,
                            top: `${(im.box[1] * 100).toFixed(3)}%`,
                            width: `${((im.box[2] - im.box[0]) * 100).toFixed(3)}%`,
                            height: `${((im.box[3] - im.box[1]) * 100).toFixed(3)}%`,
                          }}
                        />
                      ))
                    : null,
                )}
              </div>
            ))}
          </div>

          <svg ref={svgRef} className="tour__hud" aria-hidden="true">
            {TOUR_PARTS.map((p, i) =>
              p.shapes.map((_, si) => (
                <g key={`${p.id}${si}`}>
                  <polygon
                    ref={(el) => {
                      glowRef.current[i][si] = el
                    }}
                    className={`tour-edge tour-edge--glow${p.fine ? ' tour-edge--fine' : ''}`}
                  />
                  <polygon
                    ref={(el) => {
                      edgeRef.current[i][si] = el
                    }}
                    className={`tour-edge${p.fine ? ' tour-edge--fine' : ''}`}
                  />
                </g>
              )),
            )}
            {TOUR_PARTS.map((p, i) =>
              p.strapImgs?.map((_, k) => (
                <g key={`${p.id}-strapedge${k}`}>
                  <path
                    ref={(el) => {
                      strapEdgeRef.current[i][k * 2] = el
                    }}
                    className="tour-edge tour-edge--glow tour-edge--fine"
                  />
                  <path
                    ref={(el) => {
                      strapEdgeRef.current[i][k * 2 + 1] = el
                    }}
                    className="tour-edge tour-edge--fine"
                  />
                </g>
              )),
            )}
            {TOUR_PARTS.map((p, i) =>
              p.cable ? (
                <g key={`${p.id}-cable`}>
                  <polyline
                    ref={(el) => {
                      cableRef.current[i][0] = el
                    }}
                    className="tour-cable"
                  />
                  <polyline
                    ref={(el) => {
                      cableRef.current[i][1] = el
                    }}
                    className="tour-cable tour-cable--flow"
                  />
                </g>
              ) : null,
            )}
            <polyline ref={wireRef} className="tour-wire" />
          </svg>

          {TOUR_PARTS.map((p, i) =>
            p.cable ? (
              <span
                key={`${p.id}-tag`}
                ref={(el) => {
                  cableTagRef.current[i] = el
                }}
                className="tour-cable-tag"
                aria-hidden="true"
              >
                Трос
              </span>
            ) : null,
          )}

          {TOUR_PARTS.map((p, i) =>
            p.strapImgs ? (
              <span
                key={`${p.id}-strap-tag`}
                ref={(el) => {
                  strapTagRef.current[i] = el
                }}
                className="tour-cable-tag"
                aria-hidden="true"
              >
                Ремни через колёса
              </span>
            ) : null,
          )}

          {SPOTS.map((s, i) => (
            <button
              key={`${s.part}${s.photo}`}
              ref={(el) => {
                spotRef.current[i] = el
              }}
              type="button"
              className="tour-spot"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => choose(s.part)}
            >
              <i className="tour-spot__ring" />
              <i className="tour-spot__dot">{s.part}</i>
              <b className="tour-spot__label">
                {s.label}
                {s.turn && (
                  // «Покажем с другой стороны»: нажатие разворачивает вид вокруг машины.
                  <svg className="tour-spot__turn" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                    <path d="M13 8a5 5 0 1 1-1.46-3.54" />
                    <path d="M12 1.5v3.5H8.5" />
                  </svg>
                )}
              </b>
              {s.turn && (
                // На телефоне подписей нет — значок разворота у самой точки.
                <i className="tour-spot__badge">
                  <svg className="tour-spot__turn" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                    <path d="M13 8a5 5 0 1 1-1.46-3.54" />
                    <path d="M12 1.5v3.5H8.5" />
                  </svg>
                </i>
              )}
            </button>
          ))}

          {CARDS.map((p) => {
            const t = TRUCK_TOUR[p - 1]
            return (
              <figure
                key={p}
                ref={(el) => {
                  cardRef.current[p] = el
                }}
                className="tour-card"
              >
                <div className="tour-card__frame">
                  {p === 3 ? (
                    <video
                      ref={videoRef}
                      className="tour-card__media"
                      src={TOUR_MEDIA.apparely}
                      poster={TOUR_MEDIA.apparelyPoster}
                      muted
                      loop
                      playsInline
                      preload="none"
                      disablePictureInPicture
                      aria-hidden="true"
                    />
                  ) : (
                    <img
                      className={`tour-card__media tour-card__media--${CARD_IMG[p].mod}`}
                      src={CARD_IMG[p].src}
                      alt={t.card ?? ''}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <span className="tour-card__tag">{t.tag}</span>
                </div>
                <figcaption>{t.card}</figcaption>
              </figure>
            )
          })}

          <button
            type="button"
            className="tour__back"
            data-on={active ? '' : undefined}
            tabIndex={active ? 0 : -1}
            onClick={() => choose(0)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4" />
            </svg>
            Общий вид
          </button>
        </div>

        <ol ref={listRef} className="tour-list">
          {TRUCK_TOUR.map((t, i) => {
            const part = i + 1
            const on = active === part
            return (
              <li key={t.title} className="tour-item" data-on={on ? '' : undefined}>
                <h3>
                  <button
                    type="button"
                    id={`tour-h${part}`}
                    className="tour-item__head"
                    aria-expanded={on}
                    aria-controls={`tour-b${part}`}
                    onClick={() => choose(part)}
                    onMouseEnter={() => hint(part, true)}
                    onMouseLeave={() => hint(part, false)}
                  >
                    <span className="tour-item__no">0{part}</span>
                    <span className="tour-item__title">{t.title}</span>
                    {/* Плюс (у раскрытой — минус): линии 2 px по целым пикселям — чёткие. */}
                    <svg className="tour-item__icon" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
                      <circle className="tour-item__ring" cx="14" cy="14" r="13.5" />
                      <path className="tour-item__line" d="M9 14h10" />
                      <path className="tour-item__line tour-item__line--v" d="M14 9v10" />
                    </svg>
                  </button>
                </h3>
                <div id={`tour-b${part}`} role="region" aria-labelledby={`tour-h${part}`} className="tour-item__body">
                  <div className="tour-item__inner">
                    <p className="tour-item__text">{t.text}</p>
                  </div>
                </div>
                {on && autoRun && (
                  <span
                    key={`${visits}`}
                    className="tour-item__bar"
                    style={{ '--auto': `${AUTO_MS}ms` } as CSSProperties}
                    aria-hidden="true"
                  />
                )}
              </li>
            )
          })}
        </ol>

        {/* Номер — в нижней панели звонка; здесь кнопки встают в один ряд. */}
        <div className="tour__cta">
          <BotButton />
          <CallButton />
        </div>
      </div>
    </section>
  )
}
