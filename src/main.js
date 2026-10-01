import DiceBox from '@3d-dice/dice-box'

const DICE = [20, 12, 10, 8, 6, 4] // от большего к меньшему
const SIZE = { 20: 1, 12: 0.8, 10: 0.74, 8: 0.7, 6: 0.62, 4: 0.62 } // d20 — самый крупный
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
  el.style.setProperty('--k', SIZE[s])
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

/* ---------- Звук (синтез через WebAudio, без файлов) ---------- */
let actx, noiseBuf
function audio() {
  try {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)()
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate)
      const d = noiseBuf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    }
    if (actx.state !== 'running') actx.resume()
  } catch {}
  return actx
}
function clack(when, vol = 1) {
  const t = actx.currentTime + when
  const out = actx.createGain(); out.gain.value = 0.55 * vol; out.connect(actx.destination)
  // «щелчок» — полосовой шум
  const n = actx.createBufferSource(); n.buffer = noiseBuf; n.playbackRate.value = 0.8 + Math.random() * 0.6
  const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 + Math.random() * 2600; bp.Q.value = 1.2
  const ng = actx.createGain(); ng.gain.setValueAtTime(1, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
  n.connect(bp).connect(ng).connect(out); n.start(t, Math.random() * 0.5, 0.08)
  // «стук» — низкий тон
  const o = actx.createOscillator(); o.type = 'triangle'
  const f = 170 + Math.random() * 260
  o.frequency.setValueAtTime(f * 1.4, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05)
  const og = actx.createGain(); og.gain.setValueAtTime(0.8, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
  o.connect(og).connect(out); o.start(t); o.stop(t + 0.1)
}
function rumble(dur, vol) {
  const t = actx.currentTime
  const n = actx.createBufferSource(); n.buffer = noiseBuf; n.loop = true
  const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(200, t + dur)
  const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * vol, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  n.connect(lp).connect(g).connect(actx.destination); n.start(t); n.stop(t + dur)
}
// Настоящие сэмплы ударов кубиков (из @3d-dice/dice-box-threejs, MIT)
const hitBufs = [], tableBufs = []
async function loadSamples() {
  if (!audio() || hitBufs.length) return
  const get = async (url) => {
    try { return await actx.decodeAudioData(await (await fetch(url)).arrayBuffer()) } catch { return null }
  }
  const h = await Promise.all(Array.from({ length: 15 }, (_, i) => get(`/sounds/hit/dicehit_plastic${i + 1}.mp3`)))
  const t = await Promise.all(Array.from({ length: 7 }, (_, i) => get(`/sounds/table/surface_wood_tray${i + 1}.mp3`)))
  hitBufs.push(...h.filter(Boolean)); tableBufs.push(...t.filter(Boolean))
}
const pick = (a) => a[Math.floor(Math.random() * a.length)]
function play(buf, when, vol, rate = 1) {
  const src = actx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate
  const g = actx.createGain(); g.gain.value = vol
  src.connect(g).connect(actx.destination); src.start(actx.currentTime + when)
}
function hit(when, vol) {
  if (!hitBufs.length) return clack(when, vol)
  play(pick(hitBufs), when, Math.min(1, vol), 0.92 + Math.random() * 0.16)
  if (tableBufs.length) play(pick(tableBufs), when, Math.min(1, vol) * 0.35, 0.95 + Math.random() * 0.1)
}
function rollSound(count) {
  if (!audio()) return
  const dice = Math.min(count, 8)
  // отскоки: интервалы сокращаются, громкость падает
  for (let d = 0; d < dice; d++) {
    let t = 0.05 + Math.random() * 0.15, gap = 0.22 + Math.random() * 0.08, vol = 1
    while (gap > 0.04 && t < 1.8) {
      hit(t, vol * (0.7 + Math.random() * 0.3))
      t += gap * (0.85 + Math.random() * 0.3); gap *= 0.7; vol *= 0.78
    }
  }
}
function settleSound() { if (audio()) hit(0, 0.4) }

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
  settleSound()
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
  box.updateConfig({ scale: baseScale() * SIZE[DICE[state.index]] * (n > 20 ? 0.6 : n > 8 ? 0.78 : 1) })
  buzz(10)
  rollSound(n)
  box.roll(`${n}d${DICE[state.index]}`)
}
window.__roll = roll

/* ---------- Жесты: свайп / тап ---------- */
let sx = 0, sy = 0, down = false
stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.counter')) return
  down = true; sx = e.clientX; sy = e.clientY
  audio(); loadSamples()
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
