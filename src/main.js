import DiceBox from '@3d-dice/dice-box'

const DICE = [20, 12, 10, 8, 6, 4] // от большего к меньшему
const THEME = 'default'
const THEME_COLOR = '#6d3df0'
const MAX_COUNT = 99

const $ = (id) => document.getElementById(id)
const stage = $('stage'), carousel = $('carousel'), glow = $('glow')
const state = { index: 0, count: 1, busy: false, shown: false }

/* ---------- Карусель ---------- */
const track = document.createElement('div')
track.className = 'track'
carousel.append(track)
const slots = DICE.map((s, i) => {
  const el = document.createElement('div')
  el.className = 'slot'
  el.innerHTML = `<img src="/dice/d${s}.png" alt="d${s}" draggable="false" />`
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

/* ---------- Полный запрет зума (iOS Safari игнорирует user-scalable=no) ---------- */
;['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) =>
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }))
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault() }, { passive: false })
let lastTouchEnd = 0
document.addEventListener('touchend', (e) => {
  const now = Date.now()
  if (now - lastTouchEnd < 350) e.preventDefault() // двойной тап
  lastTouchEnd = now
}, { passive: false })
document.addEventListener('dblclick', (e) => e.preventDefault())
document.addEventListener('contextmenu', (e) => e.preventDefault())
