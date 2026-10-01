import DiceBox from '@3d-dice/dice-box'

const DICE = [20, 12, 10, 8, 6, 4] // от большего к меньшему
const THEME = 'default'
const THEME_COLOR = '#6d3df0'
const MAX_COUNT = 99

const $ = (id) => document.getElementById(id)
const stage = $('stage'), carousel = $('carousel'), glow = $('glow')
const state = { index: 0, count: 1, busy: false, shown: false }

/* ---------- SVG-иконки кубиков (превью / заглушки) ---------- */
const poly = (n, r, rot = -90, cx = 100, cy = 100) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((rot + (360 / n) * i) * Math.PI) / 180
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  })
const pts = (p) => p.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ')
const line = (a, b) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`

function shape(sides) {
  let outer, inner = ''
  if (sides === 4) {
    outer = [[100, 14], [188, 168], [12, 168]]
    inner = outer.map((v) => line([100, 128], v)).join('')
  } else if (sides === 6) {
    outer = poly(6, 90)
    inner = [outer[1], outer[3], outer[5]].map((v) => line([100, 100], v)).join('')
  } else if (sides === 8) {
    outer = [[100, 10], [184, 100], [100, 190], [16, 100]]
    inner = line(outer[1], outer[3]) + line(outer[0], [100, 100]) + line([100, 100], outer[2])
  } else if (sides === 10) {
    outer = [[100, 8], [182, 92], [100, 192], [18, 92]]
    inner = line([18, 92], [100, 124]) + line([100, 124], [182, 92]) + line([100, 124], [100, 192]) + line([100, 8], [100, 124])
  } else if (sides === 12) {
    outer = poly(10, 90)
    const inn = poly(5, 46)
    inner = `<polygon points="${pts(inn)}"/>` + inn.map((v, i) => line(v, outer[i * 2])).join('')
  } else {
    outer = poly(6, 90)
    const inn = poly(3, 46)
    inner = `<polygon points="${pts(inn)}"/>` +
      inn.map((v, i) => line(v, outer[i * 2])).join('') +
      inn.map((v, i) => line(v, outer[(i * 2 + 5) % 6])).join('')
  }
  return { outer, inner }
}

let uid = 0
function iconSvg(sides) {
  const id = `g${uid++}`
  const { outer, inner } = shape(sides)
  return `<svg viewBox="0 0 200 200" fill="none" stroke-linejoin="round">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8a5cff"/><stop offset="1" stop-color="#2b1670"/></linearGradient></defs>
    <g stroke="#e8c36a" stroke-width="3">
      <polygon fill="url(#${id})" points="${pts(outer)}"/>
      <g stroke-opacity=".75" stroke-width="2">${inner}</g>
    </g>
    <text class="num" x="100" y="${sides === 4 ? 140 : 118}" text-anchor="middle">${sides}</text></svg>`
}

/* ---------- Карусель ---------- */
const track = document.createElement('div')
track.className = 'track'
carousel.append(track)
const slots = DICE.map((s, i) => {
  const el = document.createElement('div')
  el.className = 'slot'
  el.innerHTML = iconSvg(s)
  el.dataset.i = i
  track.append(el)
  return el
})

function layout() {
  const w = slots[0].offsetWidth
  const x = carousel.clientWidth / 2 - (state.index + 0.5) * w
  track.style.transform = `translateX(${x}px)`
  slots.forEach((el, i) => {
    el.classList.toggle('active', i === state.index)
    el.classList.toggle('near', Math.abs(i - state.index) === 1)
  })
  $('dieName').textContent = `d${DICE[state.index]}`
}
addEventListener("resize", () => { layout(); sizeBox() })

function select(i) {
  if (state.busy || i < 0 || i >= DICE.length || i === state.index) return
  state.index = i
  resetResult()
  layout()
  buzz(12)
}

/* ---------- Счётчик ---------- */
function updateCount() {
  $('count').textContent = state.count
  const n = state.count % 100, d = n % 10
  $('countLabel').textContent = n > 10 && n < 20 ? 'кубиков' : d === 1 ? 'кубик' : d >= 2 && d <= 4 ? 'кубика' : 'кубиков'
  $('minus').disabled = state.count <= 1 || state.busy
  $('plus').disabled = state.count >= MAX_COUNT || state.busy
}
function bump(d) {
  if (state.busy) return
  state.count = Math.min(MAX_COUNT, Math.max(1, state.count + d))
  updateCount()
  resetResult()
  buzz(8)
}
function holdRepeat(btn, d) {
  let t, iv
  const stop = () => { clearTimeout(t); clearInterval(iv) }
  btn.addEventListener('pointerdown', () => {
    bump(d)
    t = setTimeout(() => { iv = setInterval(() => bump(d), 90) }, 450)
  })
  ;['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop))
}
holdRepeat($('minus'), -1)
holdRepeat($('plus'), 1)

/* ---------- Вибрация ---------- */
const buzz = (p) => { try { navigator.vibrate?.(p) } catch {} }

/* ---------- 3D-кубики (dice-box: Babylon.js + Ammo.js физика) ---------- */
function sizeBox() {
  const r = carousel.getBoundingClientRect()
  const h = Math.min(innerWidth * 1.05, r.height, 560)
  const el = $('dice-box')
  el.style.top = `${r.top + r.height / 2 - h / 2}px`
  el.style.height = `${h}px`
  el.style.bottom = 'auto'
}
sizeBox()
const baseScale = () => (innerWidth < 520 ? 13 : 14)
const box = new DiceBox({
  container: '#dice-box',
  assetPath: '/assets/dice-box/',
  theme: THEME,
  themeColor: THEME_COLOR,
  scale: baseScale(),
  gravity: 2.4,
  mass: 1,
  friction: 0.8,
  restitution: 0.45,
  linearDamping: 0.45,
  angularDamping: 0.4,
  throwForce: 5,
  spinForce: 5,
  startingHeight: 9,
  settleTimeout: 5000,
  offscreen: true,
  lightIntensity: 1.1,
  enableShadows: true,
  shadowTransparency: 0.75,
})
$('dieSub').textContent = 'Загрузка кубиков…'
const ready = box.init().then(() => { $('dieSub').textContent = 'Нажми на кубик, чтобы бросить' })

function resetResult() {
  state.shown = false
  stage.classList.remove('shown')
  $('result').className = 'result'
  if (!state.busy) $('dieSub').textContent = 'Нажми на кубик, чтобы бросить'
  try { box.clear() } catch {}
}

function flash(kind) {
  glow.style.setProperty('--glow',
    kind === 'crit' ? 'rgba(255,215,106,.8)' : kind === 'fail' ? 'rgba(255,70,70,.65)' : 'rgba(150,110,255,.55)')
  glow.classList.remove('flash')
  void glow.offsetWidth
  glow.classList.add('flash')
}

box.onRollComplete = (groups) => {
  const values = groups.flatMap((g) => g.rolls.map((r) => r.value))
  const sides = DICE[state.index]
  const total = values.reduce((a, b) => a + b, 0)
  const kind = state.count === 1 && sides === 20 ? (total === 20 ? 'crit' : total === 1 ? 'fail' : '') : ''

  $('resultTotal').textContent = total
  $('resultParts').textContent = values.length > 1 ? values.join(' + ') : ''
  $('result').className = 'result on ' + kind
  $('dieSub').textContent = kind === 'crit' ? 'Критический успех!' : kind === 'fail' ? 'Критический провал…' : 'Нажми, чтобы бросить снова'
  flash(kind)
  buzz(kind ? [30, 50, 30, 50, 60] : [35, 40, 18])
  state.busy = false
  state.shown = true
  updateCount()
}

async function roll() {
  if (state.busy) return
  await ready
  state.busy = true
  updateCount()
  stage.classList.add('shown')
  $('result').className = 'result'
  $('dieSub').textContent = '…'
  try { box.clear() } catch {}
  const n = state.count
  box.updateConfig({ scale: baseScale() * (n > 20 ? 0.6 : n > 8 ? 0.78 : 1) })
  buzz(10)
  box.roll(`${n}d${DICE[state.index]}`)
}
window.__roll = roll

/* ---------- Жесты: свайп / тап ---------- */
let sx = 0, sy = 0, down = false
stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.counter')) return
  down = true; sx = e.clientX; sy = e.clientY
})
stage.addEventListener('pointerup', (e) => {
  if (!down) return
  down = false
  const dx = e.clientX - sx, dy = e.clientY - sy
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) return select(state.index + (dx < 0 ? 1 : -1))
  if (Math.hypot(dx, dy) < 12) {
    const slot = e.target.closest('.slot')
    if (slot && !slot.classList.contains('active')) return select(+slot.dataset.i)
    roll()
  }
})
stage.addEventListener('pointercancel', () => { down = false })
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') select(state.index + 1)
  else if (e.key === 'ArrowLeft') select(state.index - 1)
  else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); roll() }
  else if (e.key === '+' || e.key === '=') bump(1)
  else if (e.key === '-') bump(-1)
})

layout()
updateCount()
document.fonts?.ready.then(layout)
