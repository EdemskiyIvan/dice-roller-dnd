import DiceBox from './vendor/dice-box/dice-box.es.js' // локальная копия с доводкой кубиков (см. TIDY PATCH)
import confetti from 'canvas-confetti'

const DICE = [20, 12, 10, 8, 6, 4] // от большего к меньшему
// d20 — самый крупный; размеры в превью и при броске настраиваются отдельно
const PREVIEW_SIZE = { 20: 1, 12: 0.8, 10: 0.74, 8: 0.7, 6: 0.72, 4: 0.72 }
const ROLL_SIZE = { 20: 1, 12: 0.8, 10: 0.84, 8: 0.8, 6: 0.72, 4: 0.72 }
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
  el.style.setProperty('--k', PREVIEW_SIZE[s])
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

/* ---------- Прелоадер: реальный прогресс загрузки 0–100 ---------- */
const loaderEl = $('loader'), ldRing = $('ldRing'), ldPct = $('ldPct')
const W = { img: 1, sample: 0.5, init: 40 }
const TOTAL = DICE.length * W.img + 22 * W.sample + W.init
setTimeout(() => addProgress(TOTAL), 20000) // страховка: не висим на прелоадере вечно
let loaded = 0, initPart = 0, shownPct = 0, loaderDone = false
const addProgress = (w) => { loaded = Math.min(TOTAL, loaded + w) }
DICE.forEach((d) => { const im = new Image(); im.onload = im.onerror = () => addProgress(W.img); im.src = `/dice/d${d}.png` })
// у инициализации физики нет событий прогресса — плавно ползём до 90%, остальное добавим по факту
const initTick = setInterval(() => {
  const step = (W.init * 0.9 - initPart) * 0.06
  if (step > 0.01) { initPart += step; addProgress(step) }
}, 100)
;(function frame() {
  const target = Math.min(100, ((loaded) / TOTAL) * 100)
  shownPct += Math.max(0.25, (target - shownPct) * 0.1) * (target > shownPct ? 1 : 0)
  if (shownPct > target) shownPct = target
  const v = Math.floor(shownPct)
  ldPct.textContent = v
  ldRing.style.setProperty('--p', shownPct.toFixed(1))
  loaderEl.setAttribute('aria-valuenow', v)
  if (target >= 100 && shownPct >= 99.9 && !loaderDone) {
    loaderDone = true
    ldPct.textContent = 100; ldRing.style.setProperty('--p', 100)
    setTimeout(() => loaderEl.classList.add('done'), 350)
    return
  }
  requestAnimationFrame(frame)
})()

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
let samplesP
function loadSamples() {
  if (samplesP) return samplesP
  samplesP = (async () => {
    if (!audio()) { addProgress(22 * W.sample); return }
    const get = async (url) => {
      try { return await actx.decodeAudioData(await (await fetch(url)).arrayBuffer()) } catch { return null } finally { addProgress(W.sample) }
    }
    const h = await Promise.all(Array.from({ length: 15 }, (_, i) => get(`/sounds/hit/dicehit_plastic${i + 1}.mp3`)))
    const t = await Promise.all(Array.from({ length: 7 }, (_, i) => get(`/sounds/table/surface_wood_tray${i + 1}.mp3`)))
    hitBufs.push(...h.filter(Boolean)); tableBufs.push(...t.filter(Boolean))
  })()
  return samplesP
}
loadSamples() // грузим заранее, чтобы первый бросок уже звучал настоящими сэмплами
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
// Слайдер и «стол» с кубиками ставим в ту же точку, что и фиолетовое свечение фона (46% высоты экрана).
// Сдвиг вниз ограничен 90px, чтобы при любых размерах окна кубики не уехали за экран.
const GLOW_Y = 0.46
function sizeBox() {
  const stageH = stage.clientHeight
  const rowCenter = carousel.offsetTop + carousel.offsetHeight / 2
  const dy = Math.max(0, Math.min(90, Math.round(stageH * GLOW_Y - rowCenter)))
  const cy = rowCenter + dy
  carousel.style.transform = `translateY(${dy}px)`
  document.documentElement.style.setProperty('--cy', `${cy}px`) // свечение фона — в ту же точку
  const h = Math.min(innerWidth * 1.05, carousel.offsetHeight, 560)
  const el = $('dice-box')
  el.style.top = `${cy - h / 2}px`
  el.style.height = `${h}px`
  el.style.bottom = 'auto'
}
sizeBox()
// чем больше кубиков, тем мельче — чтобы все помещались на столе без наездов
const countScale = (n) => (n <= 2 ? 1 : n <= 4 ? 0.8 : n <= 6 ? 0.64 : n <= 9 ? 0.52 : n <= 16 ? 0.4 : n <= 30 ? 0.3 : 0.22)
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
  offscreen: false, // нужен доступ к сцене для доводки кубиков
  lightIntensity: 1.1,
  enableShadows: true,
  shadowTransparency: 0.75,
})
$('dieSub').textContent = 'Загрузка кубиков…'
const ready = box.init().then(() => {
  clearInterval(initTick); addProgress(W.init - initPart); initPart = W.init
  $('dieSub').textContent = 'Нажми на кубик, чтобы бросить'
})

const EDGE_GAP = 10
let backTimer
function cancelBack() { clearTimeout(backTimer) }
// слайдер пропадает только на время броска; через 0.5 с после результата возвращается (3D-кубики остаются как есть)
function scheduleBack() {
  cancelBack()
  backTimer = setTimeout(() => {
    // два видимых соседа разъезжаются к краям экрана с отступом 10px
    slots.forEach((el, i) => {
      if (Math.abs(i - state.index) !== 1) return
      const r = el.querySelector('img').getBoundingClientRect()
      el.style.setProperty('--shift', `${i < state.index ? EDGE_GAP - r.left : innerWidth - EDGE_GAP - r.right}px`)
    })
    stage.classList.remove('shown')
    stage.classList.add('landed')
  }, 500)
}

function resetResult() {
  cancelBack()
  $('resultTotal').textContent = ''
  $('resultParts').textContent = ''
  state.shown = false
  stage.classList.remove('shown', 'landed')
  slots.forEach((el) => el.style.removeProperty('--shift'))
  $('result').className = 'result'
  if (!state.busy) $('dieSub').textContent = 'Нажми на кубик, чтобы бросить'
  try { box.clear() } catch {}
}

function celebrate() { // небольшой салют (в 5 раз меньше прежнего)
  const colors = ['#ffd76a', '#e8c36a', '#fff3c4', '#ff9d2e', '#8a5cff']
  const shot = (o) => confetti({ colors, zIndex: 10, disableForReducedMotion: true, ticks: 160, scalar: 0.6, ...o })
  shot({ particleCount: 18, spread: 50, startVelocity: 22, origin: { x: 0.5, y: 0.5 } })
  setTimeout(() => shot({ particleCount: 12, angle: 60, spread: 40, startVelocity: 24, origin: { x: 0.1, y: 0.7 } }), 150)
  setTimeout(() => shot({ particleCount: 12, angle: 120, spread: 40, startVelocity: 24, origin: { x: 0.9, y: 0.7 } }), 150)
  setTimeout(() => shot({ particleCount: 10, spread: 70, startVelocity: 14, gravity: 0.7, origin: { x: 0.5, y: 0.35 } }), 450)
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
  const n = values.length
  // максимум на всех кубиках — золото, минимум — красный (для d4…d20 и любого количества)
  const kind = total === n * sides ? 'crit' : total === n ? 'fail' : ''

  $('resultTotal').textContent = total
  $('resultParts').textContent = values.length > 1 ? values.join(' + ') : ''
  $('result').className = 'result on ' + kind
  $('dieSub').textContent = kind === 'crit' ? 'Максимум!' : kind === 'fail' ? 'Минимум…' : 'Нажми, чтобы бросить снова'
  flash(kind)
  if (kind === 'crit') celebrate()
  settleSound()
  buzz(kind ? [30, 50, 30, 50, 60] : [35, 40, 18])
  state.busy = false
  state.shown = true
  updateCount()
  scheduleBack()
}

async function roll() {
  if (state.busy) return
  await ready
  cancelBack()
  state.busy = true
  updateCount()
  stage.classList.remove('landed')
  stage.classList.add('shown')
  $('result').className = 'result'
  $('dieSub').textContent = '…'
  try { box.clear() } catch {}
  const n = state.count
  await box.updateConfig({ scale: baseScale() * ROLL_SIZE[DICE[state.index]] * countScale(n) }) // ждём, иначе конфиг применится посреди броска
  buzz(10)
  await Promise.race([loadSamples(), new Promise((r) => setTimeout(r, 1500))])
  window.__camTilt = DICE[state.index] === 4 || DICE[state.index] === 6 // d4 и d6 показываем под 45°, как в превью
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
