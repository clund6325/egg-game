/* ==========================================================================
   EGG  —  crude vintage recreation, landscape edition
   Vanilla JS, no dependencies.
   --------------------------------------------------------------------------
   >>> EDIT YOUR BIRTHDAY MESSAGE HERE <<<
   ========================================================================== */
const birthdayConfig = {
  sisterName: "KORRI",
  fromName:   "CAMERON",
  birthdayMessage: "Happy Birthday!"
};

/* To retest the FIRST (birthday) playthrough:
       localStorage.removeItem('eggGameBirthdayProgress')   // then refresh
   (or run EGG.reset() in the console). */
const SAVE_KEY = 'eggGameBirthdayProgress';
const MUTE_KEY = 'eggGameMuted';
const SAVE_VERSION = 2;   // bump to force everyone through the birthday run once more

function freshHistory(){ return { recentFinales:[], finaleBag:[], recentMinors:[], lastTarget:0, chaosRuns:0 }; }
function freshSave(){ return { version:SAVE_VERSION, canonicalCompleted:false, birthdayShown:false, playCount:0, chaosHistory:freshHistory() }; }
function normHistory(h){ h=h||{}; return { recentFinales:Array.isArray(h.recentFinales)?h.recentFinales.slice(-5):[],
  finaleBag:Array.isArray(h.finaleBag)?h.finaleBag.slice():[], recentMinors:Array.isArray(h.recentMinors)?h.recentMinors.slice(-15):[],
  lastTarget:h.lastTarget|0, chaosRuns:h.chaosRuns|0 }; }

/* ==========================================================================
   SAVE STATE
   Chaos mode is gated on birthdayShown — NOT canonicalCompleted — so the
   birthday reveal can never be skipped on a first real playthrough.
   ========================================================================== */
let saveState = loadSave();
function loadSave(){
  try{
    const o = JSON.parse(localStorage.getItem(SAVE_KEY) || '');
    if(!o || o.version !== SAVE_VERSION){          // missing/old schema -> migrate to a clean canonical run
      const f = freshSave();
      try{ localStorage.setItem(SAVE_KEY, JSON.stringify(f)); }catch(e){}
      return f;
    }
    return { version:SAVE_VERSION,
             canonicalCompleted:!!o.canonicalCompleted,
             birthdayShown:!!o.birthdayShown,
             playCount:o.playCount|0,
             chaosHistory: normHistory(o.chaosHistory) };   // additive: absent on old v2 saves
  }catch(e){ return freshSave(); }
}
function persist(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(saveState)); }catch(e){} }

/* ==========================================================================
   DOM
   ========================================================================== */
const $ = (id) => document.getElementById(id);
const setShown = (el, shown) => el && el.toggleAttribute('hidden', !shown);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
/* origin-correct SVG transforms: set the transform ATTRIBUTE (not CSS), so
   rotate/scale pivots resolve in the group's own local coordinates. */
const setT = (el, t) => { if(t) el.setAttribute('transform', t); else el.removeAttribute('transform'); };
function tween(setter, from, to, dur, steps=8){
  return new Promise(res => { let i=0; const iv=setInterval(() => {
    i++; setter(from + (to-from)*i/steps);
    if(i>=steps){ clearInterval(iv); res(); }
  }, Math.max(16, dur/steps)); });
}

const dom = {
  desk:$('desk'), stage:$('stage'),
  feedTitle:$('feed-title'), counter:$('counter'),
  menubar:$('menubar'),
  svg:$('eggSvg'),
  eggman:$('eggman'), egBob:$('eg-bob'), egTurn:$('eg-turn'), egTorso:$('eg-torso'),
  egLegs:$('eg-legs'), egPants:$('eg-pants'),
  egFace:$('eg-face'), egButt:$('eg-butt'), egMouth:$('eggman-mouth'), egChew:$('eggman-chew'),
  egBush:$('eg-bush'), egHat:$('eg-hat'), egButtHat:$('eg-butt-hat'),
  egTie:$('eg-tie'), egArm3:$('eg-arm3'),
  mini:$('mini-eggman'), props:$('props'),
  play:$('play'), dialogs:$('dialogs'),
  confetti:$('confetti'), balloons:$('balloons'), bdayText:$('bday-text'),
  mute:$('mute')
};

/* logical stage size */
const LW = 960, LH = 540;

/* ==========================================================================
   STAGE SCALING  (build once, scale to fit)
   ========================================================================== */
function fitStage(){
  const availW = window.innerWidth, availH = window.innerHeight;
  const s = Math.min(availW / LW, availH / LH);
  document.documentElement.style.setProperty('--s', s.toFixed(4));
}
window.addEventListener('resize', fitStage);
window.addEventListener('orientationchange', () => setTimeout(fitStage, 60));
fitStage();

/* stage rect + scale, for pointer -> logical conversion */
function stageMetrics(){
  const r = dom.stage.getBoundingClientRect();
  return { left:r.left, top:r.top, scale:r.width / LW };
}
function toLogical(clientX, clientY){
  const m = stageMetrics();
  return { x:(clientX - m.left)/m.scale, y:(clientY - m.top)/m.scale };
}

/* ==========================================================================
   ORIENTATION  (best-effort landscape lock; portrait blocker is CSS)
   ========================================================================== */
function tryLockLandscape(){
  try{
    if(screen.orientation && typeof screen.orientation.lock === 'function'){
      const p = screen.orientation.lock('landscape');
      if(p && p.catch) p.catch(()=>{});   // Safari/desktop reject — that's fine
    }
  }catch(e){}
}

/* ==========================================================================
   SOUND  (Web Audio, all original, muted-safe, unlocked on first gesture)
   ========================================================================== */
const sound = (() => {
  let ctx=null, muted=false;
  try{ muted = localStorage.getItem(MUTE_KEY) === '1'; }catch(e){}
  function ensure(){ if(muted) return null;
    if(!ctx){ try{ ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; } }
    if(ctx.state==='suspended') ctx.resume(); return ctx; }
  function beep(f,d,type='square',g=0.05,when=0){ const c=ensure(); if(!c) return;
    const t=c.currentTime+when, o=c.createOscillator(), gn=c.createGain();
    o.type=type; o.frequency.setValueAtTime(f,t);
    gn.gain.setValueAtTime(0.0001,t); gn.gain.exponentialRampToValueAtTime(g,t+0.008);
    gn.gain.exponentialRampToValueAtTime(0.0001,t+d); o.connect(gn).connect(c.destination);
    o.start(t); o.stop(t+d+0.02); }
  function noise(d,g=0.05){ const c=ensure(); if(!c) return; const t=c.currentTime;
    const n=Math.floor(c.sampleRate*d), buf=c.createBuffer(1,n,c.sampleRate), dd=buf.getChannelData(0);
    for(let i=0;i<n;i++) dd[i]=(Math.random()*2-1)*(1-i/n);
    const src=c.createBufferSource(); src.buffer=buf; const gn=c.createGain(); gn.gain.value=g;
    src.connect(gn).connect(c.destination); src.start(t); }
  return {
    isMuted:()=>muted,
    toggle(){ muted=!muted; try{ localStorage.setItem(MUTE_KEY, muted?'1':'0'); }catch(e){} if(!muted) ensure(); return muted; },
    unlock(){ ensure(); },
    pickup(){ beep(520,0.06,'square',0.04); },
    eat(){ beep(300,0.05,'square',0.05); beep(180,0.09,'square',0.05,0.04); },
    chew(){ noise(0.05,0.03); },
    error(){ beep(160,0.12,'square',0.06); beep(120,0.16,'square',0.06,0.1); },
    pack(){ beep(440,0.05,'square',0.05); beep(660,0.08,'square',0.05,0.05); },
    win(){ [523,659,784,1047].forEach((f,i)=>beep(f,0.14,'square',0.05,i*0.11)); },
    reveal(){ beep(200,0.5,'sawtooth',0.05); beep(150,0.6,'sawtooth',0.04,0.05); },
    step(){ beep(240,0.03,'square',0.03); },
    jingle(){ [392,392,440,392,523,494,392,392,440,392,587,523].forEach((f,i)=>beep(f,0.18,'square',0.05,i*0.19)); }
  };
})();
function refreshMuteLabel(){ dom.mute.textContent = 'SND: ' + (sound.isMuted()?'OFF':'ON'); }
refreshMuteLabel();
dom.mute.addEventListener('click', () => { sound.toggle(); refreshMuteLabel(); });
window.addEventListener('pointerdown', () => { sound.unlock(); tryLockLandscape(); }, { once:true });

/* ==========================================================================
   UI HELPERS
   ========================================================================== */
function setWalk(ms){ document.documentElement.style.setProperty('--walk', ms + 'ms'); }
const ui = {
  setTitle(t){ dom.feedTitle.textContent = t; },
  setCounter(t){ dom.counter.textContent = t; },
  eggsPlural(n){ return (n===1||n===-1) ? (n+' EGG') : (n+' EGGS'); }
};

/* ==========================================================================
   EGGMAN CONTROLLER — one model, many states
   ========================================================================== */
const EM = {
  HOMEX:330, HOMEY:360, x:330, y:360,
  apply(){ dom.eggman.style.transform = `translate(${this.x}px,${this.y}px)`; },
  place(x,y){ setWalk(0); this.x=x; if(y!=null) this.y=y; this.apply(); },
  async walkTo(x, dur){ setWalk(dur); dom.eggman.classList.add('walking'); this.x=x; this.apply();
                        await sleep(dur); dom.eggman.classList.remove('walking'); setWalk(0); },
  eating(on){ dom.eggman.classList.toggle('eating', !!on); setShown(dom.egChew, !!on);
              if(!on) dom.egChew.classList.remove('squish','twitch'); },
  _chewTok:0,
  /* the real per-egg chew: OPEN oval -> squish -> PINCHED clamp -> twitch -> reopen.
     Purely visual; the collision element (#eggman-mouth) never changes geometry. */
  async chew(){
    const tok = ++this._chewTok;
    this.eating(true); dom.egChew.classList.add('squish');   // start ~open height
    await sleep(20);  if(tok!==this._chewTok) return; dom.egChew.classList.remove('squish'); // collapse to pinch
    await sleep(120); if(tok!==this._chewTok) return; dom.egChew.classList.add('twitch');    // tiny chew twitch
    await sleep(150); if(tok!==this._chewTok) return; dom.egChew.classList.remove('twitch');
    dom.egChew.classList.add('squish');                       // expand = reopen
    await sleep(110); if(tok!==this._chewTok) return;
    this.eating(false);
  },
  _bend:0,
  face(side){ setShown(dom.egFace, side!=='back'); setShown(dom.egButt, side==='back'); },
  async turn(toBack){                       // squash to a thin frame, swap, unsquash
    await tween(v => setT(dom.egTurn, `scale(${v} 1)`), 1, 0.08, 200, 5);
    this.face(toBack ? 'back' : 'front');
    await tween(v => setT(dom.egTurn, `scale(${v} 1)`), 0.08, 1, 200, 5);
    setT(dom.egTurn, null);
  },
  async bend(deg){                          // rotate the torso around the hips (local 0,30)
    const to = (deg===false||deg===0) ? 0 : (deg===true ? 18 : deg);
    await tween(v => setT(dom.egTorso, `rotate(${v} 0 30)`), this._bend, to, 640, 8);
    this._bend = to;
  },
  async dropPants(){ setShown(dom.egPants,true); dom.egPants.style.transform='translateY(0)';
                     await sleep(40); dom.egPants.style.transform='translateY(96px)'; await sleep(620); },
  async raisePants(){ dom.egPants.style.transform='translateY(0)'; await sleep(620); },
  async dropPantsUp(){ setShown(dom.egPants,true); await sleep(40); dom.egPants.style.transform='translateY(-160px)'; await sleep(620); },
  hidePants(){ setShown(dom.egPants,false); dom.egPants.style.transform='translateY(0)'; },
  bush(on){ setShown(dom.egBush,on); },
  bigBush(on){ setT(dom.egBush, on ? 'rotate(0) scale(3.2)' : null); },
  hat(on){ setShown(dom.egHat,on); },
  buttHat(on){ setShown(dom.egButtHat,on); },
  tie(on){ setShown(dom.egTie,on); },
  arm3(on){ setShown(dom.egArm3,on); },
  grow(k){ setT(dom.egBob, k===1 ? null : `scale(${k})`); },
  async shake(){ for(let i=0;i<4;i++){ setT(dom.egTurn,'translate(12 0)'); await sleep(70);
                 setT(dom.egTurn,'translate(-12 0)'); await sleep(70); } setT(dom.egTurn,null); },
  reset(){
    dom.eggman.classList.remove('walking','eating'); setWalk(0);
    this._chewTok++; setShown(dom.egChew,false); dom.egChew.classList.remove('squish','twitch');  // mouth back to open
    this.x=this.HOMEX; this.y=this.HOMEY; this.apply();
    setT(dom.egTurn,null); setT(dom.egTorso,null); setT(dom.egBob,null); setT(dom.egBush,null);
    this._bend=0; dom.egPants.style.transform='translateY(0)';
    this.face('front'); this.hidePants(); this.bush(false); this.hat(false);
    this.buttHat(false); this.tie(false); this.arm3(false);
  }
};

/* ==========================================================================
   EGGS  (absolutely positioned in logical coords; deterministic home)
   ========================================================================== */
const SLOTS = [
  {x:722,y:352},{x:788,y:352},{x:854,y:352},
  {x:748,y:314},{x:814,y:314},{x:781,y:280}
];
let occupied = new Set();

function eggSVG(){
  return `<svg viewBox="0 0 52 66" xmlns="http://www.w3.org/2000/svg">
    <path class="eshape" d="M26,4 C14,4 8,26 8,39 C8,54 16,62 26,62 C36,62 44,54 44,39 C44,26 38,4 26,4 Z"/>
    <rect class="esquare" x="9" y="12" width="34" height="46" fill="#fff" stroke="#000" stroke-width="6"/>
    <g class="elegs"><line x1="19" y1="60" x2="16" y2="66" stroke="#000" stroke-width="3"/><line x1="33" y1="60" x2="36" y2="66" stroke="#000" stroke-width="3"/></g>
  </svg>`;
}

function makeEgg(cx, cy, opts={}){
  const el = document.createElement('div');
  el.className = 'egg';
  if(opts.big) el.classList.add('big');
  if(opts.tiny) el.classList.add('tiny');
  if(opts.square) el.classList.add('square');
  if(opts.legs) el.classList.add('legs');
  el.innerHTML = eggSVG();
  el._homeX = cx; el._homeY = cy;
  dom.play.appendChild(el);
  positionEgg(el, cx, cy);
  if(!opts.gag) attachEggDrag(el);
  return el;
}
function positionEgg(el, cx, cy){
  el.style.left = (cx - el.offsetWidth/2) + 'px';
  el.style.top  = (cy - el.offsetHeight/2) + 'px';
}
function eggCenter(el){
  return { x: parseFloat(el.style.left) + el.offsetWidth/2,
           y: parseFloat(el.style.top)  + el.offsetHeight/2 };
}
function freeSlot(){ for(let i=0;i<SLOTS.length;i++) if(!occupied.has(i)) return i; return -1; }
function addBasketEgg(opts={}){
  const i = freeSlot(); if(i<0) return null;
  occupied.add(i);
  const el = makeEgg(SLOTS[i].x, SLOTS[i].y, opts);
  el._slot = i;
  return el;
}
function refillBasket(target){
  while([...dom.play.querySelectorAll('.egg:not(.gag)')].filter(e=>e._slot!=null).length < target && freeSlot()>=0){
    addBasketEgg();
  }
}
function clearEggs(){ dom.play.innerHTML=''; occupied = new Set(); }

/* ---- VERY FORGIVING mouth target, from the ACTUAL RENDERED mouth ----
   getMouthEatRect() is the SINGLE source of truth used by both gameplay AND the
   debug overlay: the rendered mouth box padded 30% on every side. It follows
   every transform (walk/scale/grow/bend) and the responsive stage scale. */
function getMouthEatRect(){
  const m = dom.egMouth.getBoundingClientRect();          // viewport px, source of truth
  const padX = m.width * 0.30, padY = m.height * 0.30;
  return { left:m.left-padX, right:m.right+padX, top:m.top-padY, bottom:m.bottom+padY,
           width:m.width+2*padX, height:m.height+2*padY, mouthRect:m };
}
function pointInEatRect(x, y){
  const R = getMouthEatRect();
  return x>=R.left && x<=R.right && y>=R.top && y<=R.bottom;
}
function pointNearEatRect(x, y, pad){
  const R = getMouthEatRect();
  return x>=R.left-pad && x<=R.right+pad && y>=R.top-pad && y<=R.bottom+pad;
}
const MOUTH_GRACE_MS = 400;   // released within this long of last being inside -> EATEN
const MAGNET_STICKY  = 120;   // once armed, egg stays glued while pointer is within this of eatRect

/* live debug snapshot — EGG.getMouthDebug() reads this */
let _mouthDebug = { mouthRect:null, eatRect:null, pointer:null, pointerInsideEatRect:false,
                    mouthArmed:false, lastInsideMouthAt:0, lastRelease:null, lastEggRect:null, lastResult:null };

/* extra OR test on release: release point / egg center / any box overlap */
function eggOverlapsMouth(el, relX, relY){
  const R = getMouthEatRect();
  const e = el.getBoundingClientRect();
  const ecx=e.left+e.width/2, ecy=e.top+e.height/2;
  const ptIn  = (relX!=null) && relX>=R.left && relX<=R.right && relY>=R.top && relY<=R.bottom;
  const ctrIn = ecx>=R.left && ecx<=R.right && ecy>=R.top && ecy<=R.bottom;
  const overlap = !(e.right<R.left || e.left>R.right || e.bottom<R.top || e.top>R.bottom);
  _mouthDebug.eatRect=R; _mouthDebug.mouthRect=R.mouthRect; _mouthDebug.lastEggRect=e;
  return ptIn || ctrIn || overlap;
}
function mouthCenterLogical(){                            // eat-animation target
  const m = dom.egMouth.getBoundingClientRect(), st = stageMetrics();
  return { x:(m.left+m.width/2 - st.left)/st.scale, y:(m.top+m.height/2 - st.top)/st.scale };
}
function armMouth(on){ dom.eggman.classList.toggle('armed', !!on); }

/* ---- robust drag: ONE module-level session, finalized at window level ----
   Mouth entry is detected CONTINUOUSLY during pointermove (not only at
   pointerup); once armed the egg magnetizes to the mouth. Every gesture ends
   EATEN or HOME exactly once. */
let DRAG = null;
function onEggPointerDown(el, e){
  if(feedingLocked || el._eaten || DRAG) return;
  e.preventDefault();
  const c = eggCenter(el);
  const p = toLogical(e.clientX, e.clientY);
  DRAG = { el, id:e.pointerId, offX:p.x-c.x, offY:p.y-c.y, moved:0, downT:Date.now(),
           lastClientX:e.clientX, lastClientY:e.clientY,
           mouthArmed:false, glued:false, lastInsideAt:0, done:false };
  el.classList.add('grab'); el.classList.remove('snap','fly');
  try{ el.setPointerCapture(e.pointerId); }catch(_){}
  sound.pickup();
  updateDrag(e.clientX, e.clientY);
}
function updateDrag(clientX, clientY){
  if(!DRAG) return;
  DRAG.lastClientX=clientX; DRAG.lastClientY=clientY;
  const inside = pointInEatRect(clientX, clientY);      // continuous arming
  if(inside){ DRAG.lastInsideAt = performance.now();
    if(!DRAG.mouthArmed){ DRAG.mouthArmed=true; armMouth(true); } }
  if(DRAG.mouthArmed && pointNearEatRect(clientX, clientY, MAGNET_STICKY)){
    DRAG.glued = true; DRAG.el.classList.add('magnet');   // magnet snap to mouth centre
    const m = mouthCenterLogical(); positionEgg(DRAG.el, m.x, m.y);
  } else {
    if(DRAG.glued){ DRAG.glued=false; DRAG.el.classList.remove('magnet'); }
    const p = toLogical(clientX, clientY); positionEgg(DRAG.el, p.x-DRAG.offX, p.y-DRAG.offY);
  }
  _mouthDebug.pointer={x:clientX,y:clientY}; _mouthDebug.pointerInsideEatRect=inside;
  _mouthDebug.mouthArmed=DRAG.mouthArmed; _mouthDebug.lastInsideMouthAt=DRAG.lastInsideAt;
  const R=getMouthEatRect(); _mouthDebug.eatRect=R; _mouthDebug.mouthRect=R.mouthRect;
}
function finishDrag(relX, relY){
  if(!DRAG || DRAG.done) return;
  DRAG.done = true;
  const el = DRAG.el;
  el.classList.remove('grab','magnet');
  try{ el.releasePointerCapture(DRAG.id); }catch(_){}
  const tap   = DRAG.moved < 12 && (Date.now()-DRAG.downT) < 260;
  const grace = DRAG.mouthArmed && (performance.now()-DRAG.lastInsideAt) <= MOUTH_GRACE_MS;
  const geo   = eggOverlapsMouth(el, relX, relY);
  const eaten = tap || DRAG.glued || grace || geo;
  _mouthDebug.lastRelease = (relX!=null)?{x:relX,y:relY}:_mouthDebug.pointer;
  _mouthDebug.lastResult  = eaten ? 'EATEN' : 'HOME';
  armMouth(false);
  DRAG = null;
  if(eaten) flyAndEat(el); else snapHome(el);
}
/* window-level, capture-phase listeners: finalize is guaranteed no matter which
   element the pointerup lands on (root cause of the fast-drop misses). */
function _winMove(e){ if(!DRAG || DRAG.done || (e.pointerId!=null && e.pointerId!==DRAG.id)) return;
  e.preventDefault(); DRAG.moved += Math.abs(e.clientX-DRAG.lastClientX)+Math.abs(e.clientY-DRAG.lastClientY);
  updateDrag(e.clientX, e.clientY); }
function _winUp(e){ if(!DRAG || DRAG.done || (e.pointerId!=null && e.pointerId!==DRAG.id)) return;
  finishDrag(e.clientX, e.clientY); }
function _winCancel(e){ if(!DRAG || DRAG.done || (e.pointerId!=null && e.pointerId!==DRAG.id)) return;
  finishDrag(DRAG.lastClientX, DRAG.lastClientY); }
window.addEventListener('pointermove', _winMove, {capture:true, passive:false});
window.addEventListener('pointerup', _winUp, {capture:true});
window.addEventListener('pointercancel', _winCancel, {capture:true});
window.addEventListener('lostpointercapture', _winCancel, {capture:true});

function attachEggDrag(el){
  el.addEventListener('pointerdown', (e) => onEggPointerDown(el, e));
}

function snapHome(el){
  el.classList.add('snap');
  positionEgg(el, el._homeX, el._homeY);
  setTimeout(() => el.classList.remove('snap'), 200);
}

function flyAndEat(el){
  if(el._eaten) return; el._eaten = true;
  if(el._slot!=null) occupied.delete(el._slot);
  const m = mouthCenterLogical();
  el.classList.add('fly');
  positionEgg(el, m.x, m.y);
  el.style.transform = 'scale(0.12)';
  sound.eat();
  setTimeout(() => {
    el.remove(); sound.chew();
    EM.chew();                                   // OPEN -> pinch -> twitch -> reopen (self-timed, self-resetting)
    if(activeController && typeof activeController.feedEgg==='function') activeController.feedEgg();
  }, 190);
}

/* ==========================================================================
   DIALOGS
   ========================================================================== */
let dialogStack = [];
function showDialog(opts){
  const box = document.createElement('div');
  box.className = 'dialog';
  if(opts.at){ box.style.left = opts.at.x+'px'; box.style.top = opts.at.y+'px'; box.style.transform='translate(-50%,-50%)'; }
  if(opts.behind){ box.style.left='42%'; box.style.top='40%'; box.style.zIndex='0'; }
  const icon = opts.icon===false ? '' : `<div class="dlg-icon">${opts.icon||'!'}</div>`;
  const bar  = opts.bar ? `<div class="dlg-bar"><i></i></div>` : '';
  const buttons = opts.buttons || [{label:'OK'}];
  const btns = buttons.map((b,i)=>`<button data-i="${i}" class="${b.cls||(i===0?'default':'')}">${b.label}</button>`).join('');
  box.innerHTML = `${icon}<div class="dlg-text">${opts.text||''}</div>${bar}${btns?`<div class="dlg-buttons">${btns}</div>`:''}`;
  dom.dialogs.appendChild(box);
  dialogStack.push(box);
  box.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
    const b = buttons[+btn.dataset.i]; sound.pickup(); closeDialog(box);
    if(b && typeof b.onClick==='function') b.onClick();
  }));
  if(opts.bar){ const i=box.querySelector('.dlg-bar > i'); requestAnimationFrame(()=>{ i.style.transition='width '+(opts.barDur||1400)+'ms steps(12)'; i.style.width=(opts.barTo||100)+'%'; }); }
  if(!opts.silent) sound.error();
  return box;
}
function closeDialog(box){ const i=dialogStack.indexOf(box); if(i>=0) dialogStack.splice(i,1); box.remove(); }
function hideAllDialogs(){ dialogStack=[]; dom.dialogs.innerHTML=''; }
/* await a button press */
function dialogAsync(opts){
  return new Promise(res => {
    const buttons = (opts.buttons||[{label:'OK'}]).map(b => ({...b, onClick:()=>{ if(b.onClick)b.onClick(); res(b.label); }}));
    showDialog({...opts, buttons});
  });
}

/* ==========================================================================
   PARTY EFFECTS (scale with the stage; canvas is 960x540 logical)
   ========================================================================== */
let confettiRAF=null;
function startConfetti(){
  const cv=dom.confetti, ctx=cv.getContext('2d'); cv.width=LW; cv.height=LH;
  const bits=[];
  for(let i=0;i<170;i++) bits.push({ x:Math.random()*LW, y:Math.random()*-LH, s:3+Math.random()*6,
    vy:1.5+Math.random()*3.5, vx:-1+Math.random()*2, rot:Math.random()*6, vr:-0.2+Math.random()*0.4,
    shade:Math.random()<0.5?'#000':'#fff', sq:Math.random()<0.5 });
  (function frame(){ ctx.clearRect(0,0,LW,LH);
    for(const b of bits){ b.y+=b.vy; b.x+=b.vx; b.rot+=b.vr; if(b.y>LH+10){ b.y=-10; b.x=Math.random()*LW; }
      ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(b.rot); ctx.fillStyle=b.shade; ctx.strokeStyle='#000'; ctx.lineWidth=1;
      if(b.sq){ ctx.fillRect(-b.s/2,-b.s/2,b.s,b.s); ctx.strokeRect(-b.s/2,-b.s/2,b.s,b.s); }
      else { ctx.beginPath(); ctx.arc(0,0,b.s/2,0,7); ctx.fill(); ctx.stroke(); } ctx.restore(); }
    confettiRAF=requestAnimationFrame(frame); })();
}
function startBalloons(){ dom.balloons.innerHTML='';
  for(let i=0;i<8;i++){ const b=document.createElement('div'); b.className='balloon';
    b.style.left=(4+Math.random()*88)+'%'; b.style.top=(105+Math.random()*40)+'%';
    b.style.transition='top '+(5+Math.random()*5)+'s linear'; dom.balloons.appendChild(b);
    requestAnimationFrame(()=> b.style.top='-25%'); } }
function flashText(t){ dom.bdayText.textContent=t; dom.bdayText.classList.add('on'); }
function startParty(){ startConfetti(); startBalloons(); EM.hat(true); flashText('HAPPY BIRTHDAY '+birthdayConfig.sisterName); sound.jingle(); }
function stopParty(){ if(confettiRAF){ cancelAnimationFrame(confettiRAF); confettiRAF=null; }
  const c=dom.confetti.getContext('2d'); c&&c.clearRect(0,0,LW,LH); dom.balloons.innerHTML='';
  dom.bdayText.classList.remove('on'); dom.bdayText.textContent=''; }

/* ==========================================================================
   PRESENTATION RESET  (every run starts clean)
   ========================================================================== */
let activeController = null;
let feedingLocked = false;
function resetPresentation(){
  feedingLocked = false;
  hideAllDialogs(); stopParty();
  clearEggs();
  EM.reset();
  setShown(dom.mini, false); dom.mini.style.transform='';
  dom.props.innerHTML='';                    // clear any finale props
  dom.menubar.innerHTML = '<span>File</span><span>Egg</span><span>Special</span>';
  dom.stage.style.setProperty('--basket-x','0');
  ui.setTitle('FEED EGGS'); ui.setCounter('0 EGGS');
}

/* ==========================================================================
   RANDOM HELPERS
   ========================================================================== */
function rand(n){ return Math.floor(Math.random()*n); }
function chance(p){ return Math.random()<p; }
function pick(a){ return a[rand(a.length)]; }
function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=rand(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function weighted(pairs){ let t=0; for(const p of pairs) t+=p[1]; let r=Math.random()*t;
  for(const p of pairs){ if((r-=p[1])<0) return p[0]; } return pairs[pairs.length-1][0]; }

/* ==========================================================================
   MODE 1 — CANONICAL FIRST PLAYTHROUGH (scripted)
   ========================================================================== */
function startCanonical(){
  resetPresentation();
  const displaySeq = [1,2,3,3,4,4,5,5,6];   // 9 feeds -> "6 EGGS"
  let phase='feeding', fed=0;
  refillBasket(6);

  activeController = { feedEgg(){
    if(phase==='feeding'){
      fed++;
      ui.setCounter(displaySeq[Math.min(fed-1, displaySeq.length-1)] + ' EGGS');
      if(fed >= displaySeq.length){ phase='await80'; feedingLocked=true;
        // let the basket empty out, then abruptly out of eggs
        clearEggs();
        setTimeout(outOfEggs80, 500);
      } else { refillBasket(6); }
    }
    else if(phase==='forty'){ ui.setCounter('40 EGGS'); sound.win(); phase='fortyone'; }
    else if(phase==='fortyone'){ ui.setCounter('41 EGGS'); phase='done'; feedingLocked=true;
      setTimeout(canonicalWinSequence, 650); }
  }};

  function outOfEggs80(){
    showDialog({ icon:'!', text:'OUT OF EGGS.\n\nBUY 80 PACK OF EGGS?',
      buttons:[{ label:'YES', cls:'default', onClick(){
        sound.pack(); refillBasket(6); ui.setCounter('6 EGGS'); phase='forty'; feedingLocked=false;
      }}]});
  }
}

async function canonicalWinSequence(){
  feedingLocked = true;
  ui.setTitle('EGG');
  // A. WIN
  sound.win();
  await dialogAsync({ icon:false, text:'CONGRATS, BIG BOY.', buttons:[{label:'OK',cls:'default'}] });
  // B. WALK TO CENTER
  EM.eating(false);
  await EM.walkTo(480, 1500);
  // C. STOP
  await sleep(600);
  // D. DROP PANTS
  await EM.dropPants();
  // E. FRONT NUDE PAUSE (the bush)
  EM.bush(true);
  await sleep(1050);
  // F. TURN AROUND
  EM.bush(false);
  await EM.turn(true);
  sound.reveal();
  // G. BEND OVER
  await EM.bend(true);
  // H. HOLD THE REVEAL (unobstructed)
  await sleep(2600);
  // I. BIRTHDAY  — the ONLY place birthdayShown is ever set true
  await dialogAsync({ icon:'*', text:'HAPPY BIRTHDAY, '+birthdayConfig.sisterName+'.', buttons:[{label:'OK',cls:'default'}] });
  startParty();
  // the actual birthday content is now on screen: persist it so Chaos is unlocked
  saveState.birthdayShown = true;
  saveState.canonicalCompleted = true;
  persist();
  await dialogAsync({ icon:false,
    text:'YOU WON A NUDE EGG.\n\nYOU SHOULD BE ABLE TO LOOK AT\nA LITTLE PORN AT WORK.\n\n'+
         birthdayConfig.birthdayMessage.toUpperCase()+'\n\n— '+birthdayConfig.fromName,
    buttons:[{label:'PLAY AGAIN',cls:'default'}] });
  // COMPLETE — first playthrough counts as play 1
  saveState.playCount += 1;
  persist();
  startChaos();
}

/* ==========================================================================
   MODE 2 — CHAOS REPLAY (curated event engine, always completable)
   ========================================================================== */
/* Normal fed-egg values: 1-19 EXCLUDING multiples of 5, so totals feel arbitrary.
   These drive actualChaosScore (reliable progression). displayedEggCount lies. */
/* 1-19 excluding multiples of 5, weighted so small values dominate and a 17/19 feels notable */
const NORMAL_EGG_VALUES = [[1,9],[2,10],[3,10],[4,9],[6,7],[7,6],[8,6],[9,5],[11,4],[12,4],[13,3],[14,3],[16,2],[17,2],[18,2],[19,2]];
const DISPLAY_LIES = ['EGG','???','SIX','ONE MILLION','-3 EGGS','0 EGGS','41 EGGS','80 EGGS','6 EGGS','TOO MANY EGGS','EGGS: YES'];
/* modifier-aware: SLOW COUNT skews low (min of two draws), HOT EGGS skews high (max) */
function normalEggValue(mod){ const v=weighted(NORMAL_EGG_VALUES);
  if(mod==='slowCount') return Math.min(v, weighted(NORMAL_EGG_VALUES));
  if(mod==='hotEggs')  return Math.max(v, weighted(NORMAL_EGG_VALUES));
  return v; }
/* generic weighted pick over objects carrying a .weight */
function pickWeighted(arr){ let t=0; for(const a of arr) t+=(a.weight||1); let r=Math.random()*t;
  for(const a of arr){ if((r-=(a.weight||1))<0) return a; } return arr[arr.length-1]; }
/* repetition memory — persists across Play Again within a session */
let _chaos=null;

/* ---- crude monochrome finale props (injected into #props, cleared each run) ---- */
function prop(svg, tx, ty){ const g=document.createElementNS('http://www.w3.org/2000/svg','g');
  g.innerHTML=svg; if(tx!=null) g.setAttribute('transform',`translate(${tx} ${ty||0})`); dom.props.appendChild(g); return g; }
const EGGLET = '<path class="eggbody" d="M0,-52 C-26,-52 -36,-26 -36,-8 C-36,14 -20,14 0,14 C20,14 36,14 36,-8 C36,-26 26,-52 0,-52 Z"/><circle class="eye" cx="-10" cy="-30" r="5"/><circle class="eye" cx="10" cy="-30" r="5"/><ellipse class="mouth" cx="0" cy="-10" rx="11" ry="9"/><line class="ln" x1="-12" y1="14" x2="-12" y2="30"/><line class="ln" x1="12" y1="14" x2="12" y2="30"/>';
/* an SVG <text> label prop (createElementNS so it renders reliably) */
function labelProp(x,y,str,size,rot){ const t=document.createElementNS('http://www.w3.org/2000/svg','text');
  t.setAttribute('x',x); t.setAttribute('y',y); t.setAttribute('text-anchor','middle'); t.setAttribute('font-size',size||18); t.setAttribute('font-weight','700');
  if(rot) t.setAttribute('transform',`rotate(${rot} ${x} ${y})`); t.textContent=str; dom.props.appendChild(t); return t; }
/* a little Eggman that carries its own label (for time-travel doubles etc.) */
function futureEggman(x,y,labelStr,extra){ const g=prop(EGGLET+(extra||''), x, y);
  const t=document.createElementNS('http://www.w3.org/2000/svg','text'); t.setAttribute('x','0'); t.setAttribute('y','-70');
  t.setAttribute('text-anchor','middle'); t.setAttribute('font-size','15'); t.setAttribute('font-weight','700'); t.textContent=labelStr; g.appendChild(t); return g; }
/* Mrs. Eggman — literally Eggman with a bow, lipstick and eyelashes. ONE helper
   is reused for the portrait AND the live wife so they always match. */
function mrsEggmanMarkup(){
  return '<path class="eggbody" d="M0,-52 C-26,-52 -36,-26 -36,-8 C-36,14 -20,14 0,14 C20,14 36,14 36,-8 C36,-26 26,-52 0,-52 Z"/>'
    + '<path class="ln" d="M-34,-14 q-10,3 -14,11"/><path class="ln" d="M34,-14 q10,3 14,11"/>'   // tiny arms
    + '<circle class="eye" cx="-11" cy="-28" r="5.5"/><circle class="eye" cx="11" cy="-28" r="5.5"/>'
    + '<circle class="pupil" cx="-11" cy="-27" r="2"/><circle class="pupil" cx="11" cy="-27" r="2"/>'
    + '<path class="ln2" d="M-19,-33 l-4,-3 M-15,-35 l-3,-4 M-11,-37 l-1,-4"/>'                     // eyelashes L
    + '<path class="ln2" d="M19,-33 l4,-3 M15,-35 l3,-4 M11,-37 l1,-4"/>'                            // eyelashes R
    + '<path class="lips" d="M-12,-9 Q0,-15 12,-9 Q0,-2 -12,-9 Z"/><line class="ln2" x1="-12" y1="-9" x2="12" y2="-9"/>' // lipstick
    + '<path class="bow" d="M0,-54 L-17,-64 L-17,-44 Z"/><path class="bow" d="M0,-54 L17,-64 L17,-44 Z"/><circle class="bowknot" cx="0" cy="-54" r="5"/>'
    + '<path class="ln2" d="M-13,6 Q0,15 13,6"/><circle class="pupil" cx="0" cy="12" r="2.5"/>'     // necklace
    + '<line class="ln" x1="-12" y1="14" x2="-12" y2="30"/><line class="ln" x1="12" y1="14" x2="12" y2="30"/>'
    + '<ellipse class="foot" cx="-13" cy="31" rx="7" ry="3"/><ellipse class="foot" cx="13" cy="31" rx="7" ry="3"/>';
}
/* a big crude framed department-store portrait of Mrs. Eggman */
function mrsPhotoMarkup(){
  return '<rect class="ln" x="-80" y="-98" width="160" height="172" fill="#fff" stroke-width="6"/>'
    + '<rect class="ln" x="-67" y="-85" width="134" height="134" fill="#fff"/>'
    + '<g transform="translate(0,10) scale(1.15)">' + mrsEggmanMarkup() + '</g>'
    + '<path class="ln" d="M-32,74 L-13,100 M32,74 L13,100"/>';   // crude easel legs
}
const SYS_MESSAGES = ['EGG ACCEPTED.','THAT WAS AN EGG.','THAT EGG DIDN’T COUNT.','THAT EGG COUNTED TWICE.',
  'THIS EGG IS 17 EGGS.','EGG NOT FOUND.','YOU HAVE TOO MANY EGGS.','YOU LOST 4 EGGS.','EGGMAN HAS NOTICED.',
  'HE NEEDS THIS.','PLEASE KEEP FEEDING HIM.','WRONG EGG.','EGG TOTAL UNAVAILABLE.','THE NUMBER IS CORRECT.',
  'DO NOT COUNT THEM YOURSELF.','THAT WAS PROBABLY FINE.','YOU NOW HAVE EGG.','NO.','EGG REMEMBERS.'];
const REPEAT_MESSAGES = ['YOU HAVE PLAYED EGG BEFORE.','EGG REMEMBERS.','YOU CAME BACK.','MORE?'];
const END_MESSAGES = ['YOU WON A NUDE EGG.','ANOTHER NUDE EGG.','YOU WON HIM AGAIN.','THIS ONE IS DIFFERENT.',
  'YOU HAVE SEEN TOO MUCH EGG.','EGGMAN REMEMBERS YOUR BIRTHDAY.','THIS IS YOUR EGG NOW.',
  'PLEASE DO NOT CLOSE THE EGG.','CONGRATS, MEDIUM BOY.','NUDE EGG ACHIEVED.'];
const PACKS = [[80,20],[37,3],[1,3],[400,2],[6,3],[-12,2]];

/* ---- curated MINOR EVENTS. Each cleans up after itself. ---- */
const MINOR_EVENTS = [
  // ---- EGGMAN BEHAVIOR ----
  { id:'spitTwo', min:1, weight:3, async run(){ EM.eating(true); await sleep(300); EM.eating(false);
      addBasketEgg({tiny:true}); addBasketEgg({tiny:true}); flash('EGGMAN RETURNED 2 EGGS.'); } },
  { id:'refuseShake', min:1, weight:3, async run(){ await EM.shake(); flash('WRONG EGG.'); } },
  { id:'walkOff', min:2, weight:2, async run(){ await EM.walkTo(-260,1400); await sleep(500); await EM.walkTo(EM.HOMEX,1400); } },
  { id:'bigOnce', min:1, weight:3, async run(){ EM.grow(1.6); await sleep(2200); EM.grow(1); } },
  { id:'tinyOnce', min:1, weight:3, async run(){ EM.grow(0.45); await sleep(2200); EM.grow(1); } },
  { id:'prematureTurn', min:2, weight:2, async run(){ await EM.turn(true); await dialogAsync({text:'FACE FORWARD.',buttons:[{label:'OK',cls:'default'}]}); await EM.turn(false); } },
  { id:'thirdArm', min:2, weight:2, async run(){ EM.arm3(true); await sleep(3000); EM.arm3(false); } },
  { id:'pantsOnHead', min:3, weight:2, async run(){ setShown(dom.egPants,true); dom.egPants.style.transform='translateY(-250px)'; await sleep(2600); dom.egPants.style.transform='translateY(0)'; EM.hidePants(); } },
  { id:'sitDown', min:2, weight:2, async run(){ EM.place(EM.x, EM.HOMEY+70); await sleep(2400); EM.place(EM.x, EM.HOMEY); } },
  { id:'secondMini', min:2, weight:2, allowOverlap:true, async run(){ await miniWander(); } },
  { id:'necktie', min:2, weight:2, async run(){ EM.tie(true); await sleep(2600); EM.tie(false); } },
  { id:'leftInsist', min:3, weight:2, async run(){ await EM.walkTo(-260,1200); showDialog({text:'EGGMAN IS STILL HERE.',buttons:[{label:'OK',cls:'default'}]}); await sleep(900); await EM.walkTo(EM.HOMEX,1200); } },
  // ---- EGG BEHAVIOR ----
  { id:'runaway', min:1, weight:3, allowOverlap:true, async run(){ const e=makeEgg(EM.x+140, EM.HOMEY+60, {legs:true, gag:true});
      e.classList.add('snap'); await sleep(30); positionEgg(e, LW+80, EM.HOMEY+60); await sleep(1200); e.remove(); } },
  { id:'giantEgg', min:1, weight:3, async run(){ const e=addBasketEgg({big:true}); if(e) flash('THIS EGG IS BIG.'); } },
  { id:'microEgg', min:1, weight:3, allowOverlap:true, async run(){ addBasketEgg({tiny:true}); } },
  { id:'squareEgg', min:1, weight:3, allowOverlap:true, async run(){ addBasketEgg({square:true}); /* nobody acknowledges it */ } },
  { id:'comeBackOut', min:2, weight:2, async run(){ await sleep(1800); addBasketEgg({}); flash('AN EGG CAME BACK OUT.'); } },
  // ---- SYSTEM / OFFICE NONSENSE ----
  { id:'promoted', min:1, weight:3, async run(){ await dialogAsync({text:'EGGMAN HAS BEEN PROMOTED.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'knowHim', min:2, weight:2, async run(){ await dialogAsync({text:'DO YOU KNOW EGGMAN\nPERSONALLY?',buttons:[{label:'YES',cls:'default'},{label:'NO'}]}); } },
  { id:'progress116', min:1, weight:3, async run(){ const b=showDialog({icon:false,text:'EGG',bar:true,barTo:116,barDur:1600,buttons:[]}); await sleep(2000); closeDialog(b); } },
  { id:'printer', min:2, weight:2, async run(){ await dialogAsync({text:'PRINT EGG?',buttons:[{label:'PRINT',cls:'default'},{label:'CANCEL'}]}); } },
  { id:'eggMenu', min:2, weight:2, async run(){ dom.menubar.innerHTML='<span>File</span><span class="egg-menu">Egg</span><span>Special</span><span>More Egg</span><span>Egg?</span>'; await sleep(3200); dom.menubar.innerHTML='<span>File</span><span>Egg</span><span>Special</span>'; } },
  { id:'restart', min:2, weight:2, async run(){ const b=showDialog({text:'RESTARTING EGGMAN…',bar:true,barDur:1400,buttons:[]}); await sleep(1700); closeDialog(b); /* does not restart */ } },
  { id:'yesYes', min:2, weight:2, async run(){ await dialogAsync({text:'ARE YOU SURE?',buttons:[{label:'YES',cls:'default'},{label:'YES'}]}); } },
  { id:'confidential', min:1, weight:3, async run(){ const p=ui, prev=dom.counter.textContent; ui.setCounter('CONFIDENTIAL'); await dialogAsync({icon:false,text:'THE EGG TOTAL IS\nCONFIDENTIAL.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'network', min:2, weight:2, async run(){ await dialogAsync({text:'TOO MANY EGGS\nON THE NETWORK.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'dialogBehind', min:2, weight:2, async run(){ const back=showDialog({icon:false,text:pick(SYS_MESSAGES),behind:true,buttons:[{label:'OK'}]}); await dialogAsync({text:'EGG.',buttons:[{label:'OK',cls:'default'}]}); closeDialog(back); } },
  { id:'notHR', min:3, weight:2, async run(){ await dialogAsync({text:'PLEASE DO NOT MENTION\nTHIS TO HR.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'update', min:2, weight:2, async run(){ await dialogAsync({text:'EGG UPDATE AVAILABLE.',buttons:[{label:'UPDATE',cls:'default'}]}); await dialogAsync({text:'EGG IS UP TO DATE.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'loadingEgg', min:1, weight:3, async run(){ const b=showDialog({icon:false,text:'LOADING',bar:true,barDur:1500,buttons:[]}); await sleep(1800); b.querySelector('.dlg-text').textContent='EGG'; await sleep(900); closeDialog(b); } },
  { id:'inMeeting', min:2, weight:2, async run(){ await dialogAsync({text:'EGGMAN IS CURRENTLY\nIN A MEETING.',buttons:[{label:'OK',cls:'default'}]}); } },
  // ---- short references + ORIGINAL follow-ups ----
  { id:'adventure365', min:2, weight:2, async run(){
      await dialogAsync({icon:false,text:'MIKE FROM ADVENTURE 365\nSAYS YOU’RE WRENCHING\nON THE ZIPLINE.',buttons:[{label:'SHUT UP, MIKE',cls:'default'},{label:'CARLOS IS A HO'}]});
      await dialogAsync({icon:false,text:'CARMELLO SAYS YOUR FACE\nLOOKS LIKE A CLOCK.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'danFlashes', min:2, weight:2, async run(){ const e=addBasketEgg({}); const n=6+rand(12);
      if(e){ const svg=e.querySelector('svg'); for(let i=0;i<n;i++){ const c=document.createElementNS('http://www.w3.org/2000/svg','circle'); c.setAttribute('cx',8+rand(36)); c.setAttribute('cy',10+rand(44)); c.setAttribute('r',1.4+rand(2)); c.setAttribute('fill','#000'); svg.appendChild(c); } }
      await dialogAsync({icon:false,text:'THIS EGG COSTS $'+(n*617).toLocaleString()+'.\nTHE PATTERN IS VERY\nCOMPLICATED.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'sloppyMudpie', min:2, weight:2, async run(){ await dialogAsync({icon:'!',text:'YOU SHOULDN’T’VE HAD\nSUCH A SLOPPY MUDPIE.',buttons:[{label:'OK',cls:'default'}]});
      const e=addBasketEgg({}); const box=prop('<rect class="ln" x="-30" y="-42" width="60" height="72" fill="#fff"/>', e?e._homeX:780, (e?e._homeY:352)-6);
      await dialogAsync({icon:'!',text:'EGG QUARANTINED:\nHAZARDOUS MATERIAL.',buttons:[{label:'OK',cls:'default'}]}); box.remove(); } },
  { id:'tables', min:2, weight:2, async run(){ await dialogAsync({icon:false,text:'TODAY WE WILL LEARN\nABOUT TABLES.',buttons:[{label:'OK',cls:'default'}]});
      await dialogAsync({icon:false,text:'THIS HAS NOTHING\nTO DO WITH EGGS.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'turboTeam', min:2, weight:2, async run(){ const x=EM.x; for(let i=0;i<2;i++){ await EM.walkTo(x-120,300); await EM.walkTo(x+120,300); } await EM.walkTo(x,250);
      await dialogAsync({icon:false,text:'YOU ARE NOT PART\nOF THE TURBO TEAM.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'babyOfYear', min:3, weight:2, async run(){ addBasketEgg({tiny:true}); addBasketEgg({tiny:true}); addBasketEgg({tiny:true});
      await dialogAsync({icon:false,text:'ONE CONTESTANT IS\nBART HARLEY JARVIS.',buttons:[{label:'OK',cls:'default'}]});
      await dialogAsync({icon:false,text:'THE COMPUTER DISLIKES\nBART HARLEY JARVIS.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'coffinEgg', min:2, weight:2, async run(){ const g=prop(EGGLET, 200, 470); g.querySelector('.eggbody').setAttribute('transform','scale(.5)');
      const box=prop('<rect class="ln" x="-30" y="-18" width="60" height="34" fill="#fff"/>',200,470);
      g.setAttribute('transform','translate(200 470)'); await sleep(400);
      g.style.transition='transform 1s steps(8)'; g.setAttribute('transform','translate(200 620)'); await sleep(1100);
      showDialog({icon:false,text:'THIS HAPPENS ALL THE TIME.',buttons:[{label:'OK',cls:'default'}]}); await sleep(400); g.remove(); box.remove(); } },
  { id:'hotDog', min:2, weight:2, async run(){ const car=prop('<rect class="ln" x="-40" y="-14" width="80" height="26" rx="12" fill="#fff"/><circle class="eye" cx="-22" cy="14" r="9"/><circle class="eye" cx="22" cy="14" r="9"/>', -80, 250);
      car.style.transition='transform 1.2s linear'; await sleep(30); car.setAttribute('transform','translate(1040 250)'); await sleep(1250); car.remove();
      await dialogAsync({icon:false,text:'WE’RE ALL TRYING TO FIND\nWHO DID THIS.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'fullyLoaded', min:2, weight:2, async run(){ const eggs=[...dom.play.querySelectorAll('.egg:not(.gag)')].slice(0,3);
      eggs.forEach(e=>{ const svg=e.querySelector('svg'); for(let i=0;i<4;i++){ const c=document.createElementNS('http://www.w3.org/2000/svg','circle'); c.setAttribute('cx',12+rand(28)); c.setAttribute('cy',14+rand(30)); c.setAttribute('r',2+rand(2)); c.setAttribute('fill','#000'); svg.appendChild(c); } });
      await dialogAsync({icon:false,text:'YOU GAVE HIM ALL THE\nFULLY-LOADED EGGS.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'order55', min:2, weight:2, async run(){ const b=showDialog({icon:false,text:'ORDERING…',buttons:[]});
      for(let i=0;i<14;i++){ b.querySelector('.dlg-text').textContent=rand(900)+' EGGS'; await sleep(110); }
      b.querySelector('.dlg-text').textContent='ORDER: 55 EGGS'; await sleep(650);
      b.querySelector('.dlg-text').textContent='YOU HAVE 3 EGGS.'; await sleep(1000); closeDialog(b); } },
  // ---- ORIGINAL office/computer nonsense ----
  { id:'eggUpdateFoot', min:2, weight:2, async run(){ const b=showDialog({icon:false,text:'INSTALLING EGG UPDATE',bar:true,barDur:1400,buttons:[]}); await sleep(1700); closeDialog(b);
      const f=document.querySelector('#eg-leg-r .foot'); if(f){ f.setAttribute('rx','34'); }  /* one foot 2px longer, forever */ } },
  { id:'eggPTO', min:2, weight:2, async run(){ await dialogAsync({icon:false,text:'ONE EGG IS ON PTO\nUNTIL MONDAY.',buttons:[{label:'OK',cls:'default'}]}); addBasketEgg({}); } },
  { id:'twoFactor', min:2, weight:2, async run(){ await dialogAsync({icon:false,text:'ARE YOU TRYING TO\nFEED EGGMAN?',buttons:[{label:'YES',cls:'default'},{label:'THIS WASN’T ME'}]}); } },
  { id:'eggCaptcha', min:2, weight:2, async run(){ await dialogAsync({icon:false,text:'SELECT ALL SQUARES\nCONTAINING EGGS.',buttons:[{label:'VERIFY',cls:'default'}]});
      await dialogAsync({icon:false,text:'ALL SQUARES CONTAIN\nONE ENORMOUS EGG.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'taxDependent', min:2, weight:2, async run(){ await dialogAsync({icon:false,text:'EGGMAN HAS CLAIMED THIS\nEGG AS A DEPENDENT.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'tier2', min:2, weight:2, async run(){ await dialogAsync({icon:false,text:'YOUR EGG HAS BEEN\nESCALATED.',buttons:[{label:'OK',cls:'default'}]});
      await dialogAsync({icon:false,text:'YOUR EGG HAS BEEN\nESCALATED.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'printerCyan', min:1, weight:3, async run(){ await dialogAsync({icon:'!',text:'CANNOT FEED EGG:\nPRINTER LOW ON CYAN.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'previouslyEaten', min:2, weight:2, async run(){ await dialogAsync({icon:false,text:'THIS EGG WAS ALREADY EATEN\nIN ANOTHER TIMELINE.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'wrongDept', min:2, weight:2, async run(){ EM.eating(true); await sleep(260); EM.eating(false); addBasketEgg({});
      await dialogAsync({icon:false,text:'THIS EGG BELONGS\nTO PAYROLL.',buttons:[{label:'OK',cls:'default'}]}); } },
  { id:'compliance', min:2, weight:2, async run(){ await dialogAsync({icon:false,text:'IS IT APPROPRIATE TO FEED\nYOUR COWORKER 17 EGGS?',buttons:[{label:'YES',cls:'default'},{label:'YES, W/ APPROVAL'}]}); } },
  // ---- newly-added VISUAL minor events ----
  { id:'tcTuggers', min:2, weight:2, async run(){ const k=prop('<circle class="ln" cx="0" cy="0" r="9" fill="#fff"/>', EM.x, EM.y-18);
      await dialogAsync({icon:false,text:'THIS IS NOT A JOKE.',buttons:[{label:'TUG',cls:'default'}]}); k.setAttribute('transform',`translate(${EM.x} ${EM.y-8})`); await sleep(300); k.remove(); } },
  { id:'briansEgg', min:2, weight:2, async run(){ const e=addBasketEgg({}); const sx=e?e._homeX:780, sy=e?e._homeY:352;
      const hat=prop('<ellipse class="ln" cx="0" cy="0" rx="46" ry="10" fill="#fff"/><path class="ln" d="M-26,0 q26,-40 52,0" fill="#fff"/>', sx, sy-24);
      await dialogAsync({icon:false,text:'WHY IS THAT EGG\nWEARING THAT HAT?',buttons:[{label:'I DON’T KNOW',cls:'default'},{label:'WHAT HAT?'}]});
      await dialogAsync({icon:false,text:'INTERESTING.',buttons:[{label:'OK',cls:'default'}]}); hat.remove(); } },
  { id:'bozoEgg', min:3, weight:2, async run(){ const g=prop(EGGLET, 660, EM.y); const mouth=g.querySelector('.mouth');
      const say=async(t)=>{ let n=0; const iv=setInterval(()=>mouth.setAttribute('ry',(n++%2)?15:6),150);
        await dialogAsync({icon:false,text:t,buttons:[{label:'OK',cls:'default'}]}); clearInterval(iv); mouth.setAttribute('ry','9'); };
      await say('HELLO. I AM ALSO EGG.'); await say('THE EGG IS FOR THE EGG.'); g.remove(); } },
  { id:'juryDuty', min:2, weight:2, async run(){ const e=addBasketEgg({}); if(!e) return;
      e.classList.add('snap'); positionEgg(e,-60,e._homeY); await sleep(700); positionEgg(e,e._homeX,e._homeY);
      const tie=prop('<path class="ln" d="M0,0 l-5,6 l5,20 l5,-20 z"/>', e._homeX, e._homeY-6);
      await dialogAsync({icon:false,text:'THE EGG CANNOT\nDISCUSS THE CASE.',buttons:[{label:'OK',cls:'default'}]}); tie.remove(); } },
  { id:'managementEgg', min:2, weight:2, async run(){ const e=addBasketEgg({}); const sx=e?e._homeX:780, sy=e?e._homeY:352;
      const tie=prop('<path class="ln" d="M0,0 l-5,6 l5,20 l5,-20 z"/>', sx, sy-6); await sleep(1700);
      await dialogAsync({icon:false,text:'MANAGEMENT IS PLEASED.',buttons:[{label:'OK',cls:'default'}]}); tie.remove(); } },
  { id:'eggUnion', min:2, weight:2, async run(){ clearEggs();
      const s1=prop('<rect class="ln" x="-20" y="-42" width="40" height="24" fill="#fff"/><line class="ln" x1="0" y1="-18" x2="0" y2="22"/>', 740, 300);
      const s2=prop('<rect class="ln" x="-20" y="-42" width="40" height="24" fill="#fff"/><line class="ln" x1="0" y1="-18" x2="0" y2="22"/>', 830, 300);
      await dialogAsync({icon:false,text:'THE EGGS HAVE UNIONIZED.\nDEMANDS: 1 EXTRA PIXEL,\nLUNCH, NO MORE 40-EGG\nINCIDENTS.',buttons:[{label:'NEGOTIATE',cls:'default'}]});
      await sleep(1100); await dialogAsync({icon:false,text:'AGREEMENT REACHED.',buttons:[{label:'OK',cls:'default'}]});
      s1.remove(); s2.remove(); refillBasket(5); } },
  { id:'prevTimeline', min:2, weight:2, async run(){ const e=addBasketEgg({}); if(e) e.style.opacity='0.5';
      await dialogAsync({icon:false,text:'THIS EGG WAS ALREADY EATEN\nIN ANOTHER TIMELINE.',buttons:[{label:'OK',cls:'default'}]});
      const ghost=prop(EGGLET, EM.x, EM.y-40); ghost.style.opacity='0.4'; await sleep(900); ghost.remove(); } },
  { id:'didntDo', min:2, weight:2, async run(){ await dialogAsync({icon:'!',text:'SYSTEM ERROR.',buttons:[{label:'OK',cls:'default'}]});
      EM.arm3(true); setT(dom.egTorso,'rotate(-6 0 30)');
      await dialogAsync({icon:false,text:'I DIDN’T DO SHIT.\nI DIDN’T DO FUCKING SHIT.',buttons:[{label:'OK',cls:'default'}]});
      await dialogAsync({icon:false,text:'NO ONE ACCUSED YOU.',buttons:[{label:'OK',cls:'default'}]});
      EM.arm3(false); setT(dom.egTorso,null); } },
  // ---- AUTHORED PILEUPS: overlap IS the joke; they manage & clean up their own children ----
  { id:'dialogPileup', min:3, weight:2, async run(){
      const boxes=[];
      boxes.push(showDialog({icon:false,text:'EGG.',at:{x:430,y:230},buttons:[{label:'OK'}]})); await sleep(500);
      boxes.push(showDialog({icon:false,text:'EGG?',at:{x:480,y:275},buttons:[{label:'OK'}]})); await sleep(500);
      boxes.push(showDialog({icon:'!',text:'EGG.',at:{x:530,y:320},buttons:[{label:'OK'}]})); await sleep(1700);
      boxes.forEach(closeDialog); } },
  { id:'systemMeltdown', min:3, weight:2, async run(){
      const boxes=[];
      for(let i=0;i<5;i++){ boxes.push(showDialog({icon:false,text:'EGG',at:{x:360+i*44,y:210+i*34},buttons:[{label:'OK'}]})); await sleep(320); }
      await sleep(1400); boxes.forEach(closeDialog); } }
];

function flash(text){ showDialog({ icon:false, text, buttons:[{label:'OK',cls:'default'}] }); }

/* ---- CHAOS EVENT SCHEDULER (mutex + queue) ----
   Normal (major) events run ONE AT A TIME so they never accidentally stack.
   allowOverlap:true marks safe minor-background events (they add eggs / a
   wandering mini-Eggman) that may run concurrently. Authored pileup events are
   still major (one at a time) but deliberately stack their own child dialogs. */
let _eventActive=false; const _eventQueue=[];
function chaosBusy(){ return _eventActive || _eventQueue.length>0 || dialogStack.length>0; }
function runChaosEvent(ev){
  if(ev.allowOverlap){ Promise.resolve().then(()=>ev.run()).catch(()=>{}); return; }
  _eventQueue.push(ev); drainChaosEvents();
}
async function drainChaosEvents(){
  if(_eventActive) return;
  if(!_eventQueue.length) return;
  // never start a queued event while a dialog is still on screen (a lingering
  // fire-and-forget flash from a prior event) — wait for it to be dismissed
  if(dialogStack.length>0){ setTimeout(drainChaosEvents, 200); return; }
  const ev=_eventQueue.shift();
  _eventActive=true;
  try{ await ev.run(); }catch(e){}      // event resolves only after its own cleanup
  _eventActive=false;
  if(_eventQueue.length) drainChaosEvents();
}
function clearChaosEvents(){ _eventQueue.length=0; }

async function miniWander(){
  setShown(dom.mini, true);
  dom.stage.style.setProperty('--mini','0s');
  dom.mini.style.transform='translate(-60px,150px)';
  await sleep(30);
  dom.stage.style.setProperty('--mini','5s');
  dom.mini.style.transform='translate(1020px,150px)';
  await sleep(5000);
  setShown(dom.mini,false); dom.mini.style.transform='';
}

/* ==========================================================================
   FINALE ARCS — each Chaos run is secretly one of these little sketches.
   phases fire at 25/50/75% of score/target; finale() at 100% then payoff.
   ========================================================================== */
const FINALE_ARCS = [
  { id:'wife', title:'WHERE IS MY WIFE?', weight:3, minPlayCount:1,
    async p25(c){ await sleep(300); await dialogAsync({icon:false,text:'WHERE IS MY WIFE?',buttons:[{label:'OK',cls:'default'}]}); },
    async p50(c){ c._photo=prop(mrsPhotoMarkup(), 700, 250);
      await dialogAsync({icon:false,text:'SHE WAS HERE WHEN\nI STARTED EATING.',buttons:[{label:'OK',cls:'default'}]}); },
    async p75(c){ await EM.shake(); await dialogAsync({icon:false,text:'I’LL EAT AS MANY EGGS AS IT\nTAKES TO GET MY WIFE BACK.',buttons:[{label:'OK',cls:'default'}]}); },
    async finale(c){ if(c._photo)c._photo.remove();
      for(let i=0;i<2;i++){ await EM.walkTo(EM.HOMEX-90,480); await EM.walkTo(EM.HOMEX+90,480); } await EM.walkTo(EM.HOMEX,260);
      const phone=prop('<rect class="ln" x="-15" y="-26" width="30" height="52" rx="8" fill="#fff"/>', EM.x+150, EM.y-20);
      sound.error(); await sleep(500); sound.error();
      await dialogAsync({icon:false,text:'RING. RING.',buttons:[{label:'ANSWER',cls:'default'}]}); phone.remove();
      const wife=prop(mrsEggmanMarkup(), 1000, EM.y);   // SAME design as the portrait
      wife.style.transition='transform 1.3s steps(10)'; await sleep(30); wife.setAttribute('transform',`translate(${EM.x+170} ${EM.y})`); await sleep(1400);
      dom.eggman.classList.add('walking'); await sleep(500); dom.eggman.classList.remove('walking');
      await dialogAsync({icon:false,text:'I WASN’T MISSING.',buttons:[{label:'…',cls:'default'}]});
      await dialogAsync({icon:false,text:'I LEFT YOU.',buttons:[{label:'…',cls:'default'}]});
      await sleep(1500); EM.eating(true); await sleep(300); EM.eating(false);
      await chaosPayoff(c, { endText:'YOU WON A NUDE EGG.', duringReveal:async()=>{
        wife.style.transition='transform 1.4s steps(10)'; wife.setAttribute('transform',`translate(-140 ${EM.y})`); await sleep(1400); wife.remove(); } });
    } },

  { id:'divorce', title:'DIVORCE COURT', weight:2, minPlayCount:2,
    async p25(c){ await dialogAsync({icon:false,text:'MRS. EGGMAN HAS\nRETAINED COUNSEL.',buttons:[{label:'OK',cls:'default'}]}); },
    async p50(c){ c._judge=prop('<rect class="ln" x="-46" y="-24" width="92" height="54" fill="#fff"/><path class="ln" d="M-34,-24 q34,-26 68,0"/>', 720, 250);
      c._split=prop('<line class="ln" x1="0" y1="360" x2="0" y2="470"/>', 785, 0);
      await dialogAsync({icon:false,text:'THE BASKET IS DIVIDED.',buttons:[{label:'OK',cls:'default'}]}); },
    async p75(c){ await dialogAsync({icon:false,text:'YOU ARE AWARDED\nVISITATION WITH\nEGGS #4 AND #17.',buttons:[{label:'OK',cls:'default'}]}); },
    async finale(c){ await dialogAsync({icon:'*',text:'MRS. EGGMAN IS AWARDED:\nHOUSE. BASKET. PANTS.',buttons:[{label:'OK',cls:'default'}]});
      setShown(dom.egPants,true); dom.egPants.style.transition='transform 1s steps(8)'; dom.egPants.style.transform='translateX(320px)'; await sleep(1100);
      setShown(dom.egPants,false); dom.egPants.style.transition=''; dom.egPants.style.transform='translateY(0)';
      if(c._judge)c._judge.remove(); if(c._split)c._split.remove();
      await chaosPayoff(c, { skipPants:true, endText:'HE HAS NOTHING LEFT\nBUT NUDE EGG.' }); } },

  { id:'poisoned', title:'POISONED BY MY CONSTITUENTS', weight:2, minPlayCount:2,
    async p25(c){ await dialogAsync({icon:false,text:'I’VE BEEN POISONED\nBY MY CONSTITUENTS.',buttons:[{label:'OK',cls:'default'}]}); },
    async p50(c){ await EM.shake(); c._doc=prop(EGGLET+'<circle class="eye" cx="0" cy="-46" r="9" fill="#fff"/>', 700, EM.y);
      await dialogAsync({icon:false,text:'DOCTOR: STOP\nEATING EGGS.',buttons:[{label:'OK',cls:'default'}]}); },
    async p75(c){ c._mon=prop('<rect class="ln" x="-70" y="-30" width="140" height="60" fill="#fff"/><polyline class="ln" points="-60,0 -30,0 -20,-20 -10,20 0,0 60,0"/>', 720, 150);
      await dialogAsync({icon:false,text:'EACH EGG MAKES HIM\nBETTER, THEN WORSE.',buttons:[{label:'OK',cls:'default'}]}); },
    async finale(c){ if(c._doc)c._doc.remove(); if(c._mon)c._mon.remove();
      await EM.bend(80); sound.reveal(); await sleep(400); EM.place(EM.x, EM.HOMEY+55); await sleep(700);
      await dialogAsync({icon:'*',text:'CAUSE OF DEATH:\nCONSTITUENTS.',buttons:[{label:'…',cls:'default'}]}); await sleep(700);
      const e=prop(EGGLET, EM.x+140, EM.HOMEY+40); e.setAttribute('transform',`translate(${EM.x+140} ${EM.HOMEY+40}) scale(.6)`); await sleep(600);
      EM.place(EM.x, EM.HOMEY); await EM.bend(0); EM.eating(true); await sleep(300); EM.eating(false); e.remove();
      await chaosPayoff(c, { endText:'HE IS FINE NOW.\nNUDE EGG.' }); } },

  { id:'hearing', title:'CONGRESSIONAL EGG HEARING', weight:2, minPlayCount:2,
    async p25(c){ EM.tie(true); c._desk=prop('<rect class="ln" x="-95" y="0" width="190" height="60" fill="#fff"/>', EM.x, EM.HOMEY+72);
      await dialogAsync({icon:false,text:'DID YOU KNOWINGLY CONSUME\n25 EGGS WHILE REPORTING SIX?',buttons:[{label:'OK',cls:'default'}]}); },
    async p50(c){ await dialogAsync({icon:false,text:'I DO NOT RECALL\nTHE EGG.',buttons:[{label:'OK',cls:'default'}]}); },
    async p75(c){ await dialogAsync({icon:false,text:'THAT NUMBER WAS\nPROVIDED TO ME.',buttons:[{label:'OK',cls:'default'}]});
      await dialogAsync({icon:false,text:'I WAS ADVISED THAT\nWAS NOT AN EGG.',buttons:[{label:'OK',cls:'default'}]}); },
    async finale(c){ if(c._desk)c._desk.remove(); EM.tie(false);
      await dialogAsync({icon:'!',text:'EGGMAN IS FOUND\nIN CONTEMPT.',buttons:[{label:'OK',cls:'default'}]});
      dom.eggman.classList.add('walking'); await sleep(700); dom.eggman.classList.remove('walking');
      await chaosPayoff(c, { endText:'HE THINKS HE WON.\nNUDE EGG.' }); } },

  { id:'heist', title:'THE HEIST', weight:2, minPlayCount:2,
    async p25(c){ c._bp=prop('<rect class="ln" x="-50" y="-34" width="100" height="68" fill="#fff"/><line class="ln" x1="-40" y1="-10" x2="40" y2="-10"/><line class="ln" x1="0" y1="-30" x2="0" y2="26"/>', 720, 180);
      await dialogAsync({icon:false,text:'I NEED ONE LAST EGG.',buttons:[{label:'OK',cls:'default'}]}); },
    async p50(c){ c._mask=prop('<rect x="-40" y="-118" width="80" height="18" fill="#000"/>', EM.x, EM.y);
      await dialogAsync({icon:false,text:'THE LASER GRID IS\nEXTREMELY ADVANCED.',buttons:[{label:'OK',cls:'default'}]}); },
    async p75(c){ c._laser=prop('<line class="ln" x1="120" y1="300" x2="860" y2="330"/><line class="ln" x1="120" y1="360" x2="860" y2="342"/>',0,0);
      await dialogAsync({icon:false,text:'PHASE ONE OF NINETEEN.',buttons:[{label:'OK',cls:'default'}]}); },
    async finale(c){ if(c._laser)c._laser.remove(); if(c._bp)c._bp.remove();
      await EM.walkTo(EM.HOMEX+60,1300); EM.eating(true); await sleep(300); EM.eating(false); if(c._mask)c._mask.remove();
      await dialogAsync({icon:'*',text:'WE DID IT.',buttons:[{label:'OK',cls:'default'}]});
      await EM.walkTo(480,900);
      await chaosPayoff(c, { skipWalk:true, endText:'THE PERFECT HEIST.\nNUDE EGG.' }); } },

  { id:'riddle', title:'HERE’S A RIDDLE FOR YOU, DICKWEED', weight:2, minPlayCount:2,
    async p25(c){ c._cb=prop('<rect class="ln" x="-120" y="-70" width="240" height="140" fill="#fff"/>', 480, 175);
      await dialogAsync({icon:false,text:'HERE’S A RIDDLE FOR\nYOU, DICKWEED.',buttons:[{label:'OK',cls:'default'}]});
      await dialogAsync({icon:false,text:'I HAVE SIX FATHERS, NO\nDRIVEWAY, AND I AM LEGALLY\nA BOAT ON THURSDAYS.\nWHAT AM I?',buttons:[{label:'EGG'},{label:'DELAWARE'},{label:'I NEED AN ATTORNEY'}]});
      await dialogAsync({icon:false,text:'WRONG.',buttons:[{label:'OK',cls:'default'}]}); },
    async p50(c){ await dialogAsync({icon:false,text:'I AM MY OWN UNCLE.\nI NEVER HAD SIX FATHERS.\nI NEVER SAID BOAT.\nWHAT AM I?',buttons:[{label:'EGG'},{label:'STILL DELAWARE'}]});
      await dialogAsync({icon:false,text:'WRONG.',buttons:[{label:'OK',cls:'default'}]}); },
    async p75(c){ await dialogAsync({icon:false,text:'FORGET THE FATHERS.\nTHERE IS NO THURSDAY.\nI AM AFRAID OF THE NUMBER\nYOU ARE THINKING OF.',buttons:[{label:'EGG?'},{label:'A BOAT'}]});
      await dialogAsync({icon:false,text:'WRONG.',buttons:[{label:'OK',cls:'default'}]}); },
    async finale(c){ await dialogAsync({icon:false,text:'I DON’T KNOW EITHER.',buttons:[{label:'OK',cls:'default'}]});
      await dialogAsync({icon:'!',text:'YOU WASTED MY TIME,\nDICKWEED.',buttons:[{label:'OK',cls:'default'}]});
      const t=document.createElementNS('http://www.w3.org/2000/svg','text'); t.setAttribute('x','480'); t.setAttribute('y','190'); t.setAttribute('text-anchor','middle'); t.setAttribute('font-size','44'); t.setAttribute('font-weight','700'); t.textContent='EGG?'; dom.props.appendChild(t);
      await dialogAsync({icon:false,text:'INCORRECT.',buttons:[{label:'OK',cls:'default'}]});
      await chaosPayoff(c, { endText:'NO ONE WON.\nNUDE EGG.' }); } },

  { id:'murder', title:'EGG MURDER', weight:2, minPlayCount:2,
    async p25(c){ c._greg=prop(EGGLET+'<rect class="ln" x="-20" y="-64" width="40" height="14" fill="#fff"/>', 720, 300);
      await dialogAsync({icon:false,text:'THIS IS GREG.',buttons:[{label:'OK',cls:'default'}]}); },
    async p50(c){ const dark=prop('<rect x="0" y="0" width="960" height="540" fill="#000"/>',0,0); sound.error(); await sleep(450); dark.remove();
      if(c._greg){ c._greg.innerHTML=EGGLET+'<line class="ln" x1="-18" y1="-18" x2="2" y2="2"/><line class="ln" x1="2" y1="2" x2="-12" y2="16"/><line class="ln" x1="2" y1="2" x2="20" y2="-6"/>'; c._greg.setAttribute('transform','translate(720 440) rotate(90)'); }
      sound.error(); await dialogAsync({icon:'!',text:'DO NOT TOUCH GREG.',buttons:[{label:'OK',cls:'default'}]});
      await EM.turn(true); await sleep(250); await EM.turn(false); },
    async p75(c){ c._det=prop(EGGLET+'<rect class="ln" x="-30" y="-8" width="60" height="42" fill="#fff"/><rect class="ln" x="-22" y="-62" width="44" height="16" fill="#fff"/><circle class="ln" cx="36" cy="2" r="12" fill="#fff"/><line class="ln" x1="45" y1="11" x2="58" y2="24"/>', 620, 300);
      for(const q of ['I DON’T KNOW GREG.','GREG WAS LIKE THAT.','I WAS EATING OTHER EGGS.','I HAVE NEVER BEEN\nIN THIS ROOM.']){ await dialogAsync({icon:false,text:q,buttons:[{label:'OK',cls:'default'}]}); await EM.shake(); }
      EM.arm3(true); },
    async finale(c){ if(c._det)c._det.remove(); EM.arm3(false);
      const line=[]; for(let i=0;i<4;i++) line.push(prop(EGGLET, 230+i*120, 300));
      await dialogAsync({icon:false,text:'IDENTIFY THE MURDERER.',buttons:[{label:'OK',cls:'default'}]});
      if(c._greg){ c._greg.innerHTML=EGGLET; c._greg.setAttribute('transform','translate(470 300)'); }
      await dialogAsync({icon:false,text:'I’M HARD BOILED.',buttons:[{label:'…',cls:'default'}]}); await sleep(900);
      await dialogAsync({icon:false,text:'THAT DOESN’T EXPLAIN\nANYTHING.',buttons:[{label:'OK',cls:'default'}]});
      line.forEach(p=>p.remove()); if(c._greg)c._greg.remove();
      await chaosPayoff(c, { endText:'CASE CLOSED.\nNUDE EGG.', duringReveal:async()=>{
        const cam=prop('<rect class="ln" x="-20" y="-14" width="40" height="28" fill="#fff"/><circle class="ln" cx="0" cy="0" r="8" fill="#fff"/>', 630, 300);
        const flash=prop('<rect x="0" y="0" width="960" height="540" fill="#fff"/>',0,0); sound.pickup(); await sleep(120); flash.remove();
        await sleep(600); cam.remove(); } }); } },

  { id:'audit', title:'EGG AUDIT', weight:2, minPlayCount:2,
    async p25(c){ c._aud=prop(EGGLET+'<rect class="ln" x="18" y="-20" width="34" height="46" fill="#fff"/>', 680, 300);
      await dialogAsync({icon:false,text:'WE NEED TO TALK ABOUT\nTHE SIX EGGS.',buttons:[{label:'OK',cls:'default'}]}); },
    async p50(c){ const b=showDialog({icon:false,text:'REPORTED EGGS: 6\nOBSERVED EGGS: 25?\n80 PACK: UNVERIFIED\n40-EGG TXN: SUSPICIOUS',buttons:[{label:'OK',cls:'default'}]});
      for(let i=0;i<4;i++){ await sleep(550); if(dom.dialogs.contains(b)) b.querySelector('.dlg-text').textContent='REPORTED EGGS: 6\nOBSERVED EGGS: '+(18+rand(50))+'?\n80 PACK: UNVERIFIED\n40-EGG TXN: SUSPICIOUS'; else break; } },
    async p75(c){ for(const t of ['BUSINESS EGG','PERSONAL EGG','DEPENDENT EGG','CAPITAL EGG','EGG, MISC.']){ ui.setCounter(t); await sleep(480); }
      await dialogAsync({icon:false,text:'THIS EGG REQUIRES\nSUPPORTING DOCUMENTATION.',buttons:[{label:'OK',cls:'default'}]}); },
    async finale(c){ if(c._aud)c._aud.remove();
      const b=showDialog({icon:false,text:'PENALTY: LATE EGG\nPENALTY: EXTRA EGG\nPENALTY: NO EGG\nPENALTY: EGG',buttons:[]}); await sleep(1700); closeDialog(b);
      await dialogAsync({icon:'*',text:'AUDIT COMPLETE.\n\nREFUND:\n1 NUDE EGG.',buttons:[{label:'GREAT NEWS',cls:'default'}]});
      await chaosPayoff(c, { endText:'REFUND ISSUED.\nNUDE EGG.', duringReveal:async()=>{
        const box=prop('<rect class="ln" x="-52" y="-18" width="104" height="36" fill="#fff"/>', 470, 250); box.setAttribute('transform','translate(470 250) rotate(-12)');
        const lbl=labelProp(470,257,'DEDUCTIBLE',20,-12); sound.pack(); await sleep(1400); box.remove(); lbl.remove(); } }); } },

  { id:'performance', title:'PERFORMANCE REVIEW', weight:2, minPlayCount:2,
    async p25(c){ c._hr=prop(EGGLET+'<rect class="ln" x="18" y="-18" width="30" height="42" fill="#fff"/>', 690, 300);
      await dialogAsync({icon:false,text:'EGGMAN’S EGG CONSUMPTION\nIS BELOW EXPECTATIONS.',buttons:[{label:'OK',cls:'default'}]}); },
    async p50(c){ await dialogAsync({icon:false,text:'EGG PERFORMANCE\nIMPROVEMENT PLAN:\nMORE EGGS · BETTER EGGS\nLEADERSHIP · SYNERGY',buttons:[{label:'OK',cls:'default'}]}); },
    async p75(c){ EM.tie(true); ui.setCounter('EGG');
      await dialogAsync({icon:false,text:'DOCUMENT EVERY EGG.',buttons:[{label:'OK',cls:'default'}]}); },
    async finale(c){ if(c._hr)c._hr.remove();
      await dialogAsync({icon:false,text:'AFTER CAREFUL REVIEW…',buttons:[{label:'…',cls:'default'}]}); await sleep(700);
      ui.setTitle('SENIOR EGG'); await dialogAsync({icon:'*',text:'EGGMAN HAS BEEN\nPROMOTED. SENIOR EGG.',buttons:[{label:'OK',cls:'default'}]});
      await dialogAsync({icon:false,text:'YOU HAVE BEEN PLACED ON A\nPERFORMANCE IMPROVEMENT PLAN.',buttons:[{label:'OK',cls:'default'}]});
      EM.tie(false); dom.eggman.classList.add('walking'); await sleep(700); dom.eggman.classList.remove('walking');
      await chaosPayoff(c, { endText:'SENIOR EGG.\nNUDE EGG.', duringReveal:async()=>{ const l=labelProp(480,240,'LEADERSHIP',22); await sleep(1300); l.remove(); } }); } },

  { id:'timetravel', title:'TIME TRAVEL', weight:2, minPlayCount:3,
    async p25(c){ const g=futureEggman(1000,EM.y,'EGGMAN 2029'); g.style.transition='transform .9s steps(6)';
      await sleep(30); g.setAttribute('transform',`translate(${EM.x+190} ${EM.y})`); await sleep(950);
      await dialogAsync({icon:false,text:'STOP FEEDING HIM.',buttons:[{label:'OK',cls:'default'}]});
      EM.eating(true); await sleep(250); EM.eating(false);
      g.setAttribute('transform',`translate(1040 ${EM.y})`); await sleep(950); g.remove(); },
    async p50(c){ const g=futureEggman(1000,EM.y,'EGGMAN 2047','<path class="ln" d="M-20,-4 q20,18 40,0"/><line class="ln" x1="42" y1="10" x2="54" y2="42"/>'); g.style.transition='transform .9s steps(6)';
      await sleep(30); g.setAttribute('transform',`translate(${EM.x+190} ${EM.y})`); await sleep(950);
      await dialogAsync({icon:false,text:'YOU HAVE TO KEEP\nFEEDING HIM.',buttons:[{label:'OK',cls:'default'}]});
      await dialogAsync({icon:false,text:'NOT THAT ONE.',buttons:[{label:'OK',cls:'default'}]});
      g.setAttribute('transform',`translate(1040 ${EM.y})`); await sleep(950); g.remove(); },
    async p75(c){ const g=futureEggman(1000,EM.y,'EGGMAN NEXT TUESDAY'); g.style.transition='transform .9s steps(6)';
      await sleep(30); g.setAttribute('transform',`translate(${EM.x+190} ${EM.y})`); await sleep(950);
      await dialogAsync({icon:false,text:'THERE ISN’T MUCH TIME.',buttons:[{label:'…',cls:'default'}]});
      await dialogAsync({icon:false,text:'I HAVE A DENTIST\nAPPOINTMENT.',buttons:[{label:'OK',cls:'default'}]});
      g.setAttribute('transform',`translate(1040 ${EM.y})`); await sleep(950); g.remove(); },
    async finale(c){ const tm=prop('<rect class="ln" x="-50" y="-70" width="100" height="120" fill="#fff"/><circle class="ln" cx="0" cy="-16" r="22" fill="#fff"/>', 640, EM.y-6);
      const g1=futureEggman(140,EM.y,'2029'), g2=futureEggman(300,EM.y,'2047','<line class="ln" x1="42" y1="10" x2="54" y2="42"/>'), g3=futureEggman(830,EM.y,'NEXT TUES');
      await dialogAsync({icon:false,text:'YOU DID THIS.',buttons:[{label:'OK',cls:'default'}]});
      await dialogAsync({icon:false,text:'NO, YOU DID THIS.',buttons:[{label:'OK',cls:'default'}]});
      await EM.walkTo(585,1200); EM.eating(true); await sleep(400); tm.remove(); EM.eating(false);
      g1.remove(); g2.remove(); g3.remove();
      await dialogAsync({icon:'*',text:'TIMELINE FIXED.',buttons:[{label:'OK',cls:'default'}]});
      await EM.walkTo(480,700);
      await chaosPayoff(c, { skipWalk:true, endText:'TIMELINE FIXED.\nNUDE EGG.', duringReveal:async()=>{
        const g=futureEggman(140,EM.y,'2029'); await sleep(650); g.remove(); } }); } },

  { id:'laquinta', title:'LA QUINTA STANDOFF', weight:2, minPlayCount:3,
    async p25(c){ c._gun=prop('<rect class="ln" x="0" y="-6" width="34" height="12" fill="#fff"/><rect class="ln" x="4" y="6" width="10" height="16" fill="#fff"/>', EM.x+120, EM.y-40);
      await dialogAsync({icon:false,text:'WELL, WELL, WELL,\nIF IT ISN’T THE CLEANING LADY\nAT THE LA QUINTA INN.',buttons:[{label:'OK',cls:'default'}]}); },
    async p50(c){ const cart=prop('<rect class="ln" x="-24" y="-30" width="48" height="40" fill="#fff"/><circle class="eye" cx="-14" cy="14" r="7"/><circle class="eye" cx="14" cy="14" r="7"/>', -60, 320);
      cart.style.transition='transform 1.4s linear'; await sleep(30); cart.setAttribute('transform','translate(1020 320)'); await sleep(1450); cart.remove();
      await dialogAsync({icon:false,text:'WHERE WERE YOU BETWEEN\nCHECKOUT AND CONTINENTAL\nBREAKFAST?',buttons:[{label:'OK',cls:'default'}]}); },
    async p75(c){ await dialogAsync({icon:false,text:'*CLICK*  *CLICK*',buttons:[{label:'OK',cls:'default'}]});
      const flag=prop('<rect class="ln" x="34" y="-18" width="30" height="20" fill="#fff"/>', EM.x+120, EM.y-40); const t=labelProp(EM.x+169,EM.y-40,'EGG',12);
      await dialogAsync({icon:'!',text:'…',buttons:[{label:'OK',cls:'default'}]}); flag.remove(); t.remove(); },
    async finale(c){ if(c._gun)c._gun.remove();
      const cl=prop(EGGLET+'<path class="ln" d="M-26,-52 q26,-18 52,0"/><rect class="ln" x="-20" y="-4" width="40" height="30" fill="#fff"/><line class="ln" x1="30" y1="-42" x2="48" y2="24"/>', 660, EM.y);
      await dialogAsync({icon:false,text:'…',buttons:[{label:'…',cls:'default'}]}); await sleep(1000);
      await dialogAsync({icon:false,text:'YOU LEFT YOUR ICE\nMACHINE RUNNING.',buttons:[{label:'OK',cls:'default'}]});
      const gun2=prop('<rect class="ln" x="0" y="-6" width="34" height="12" fill="#fff"/>', EM.x+120, EM.y-40); sound.pack();
      const dots=[]; for(let i=0;i<10;i++) dots.push(prop('<circle r="4" fill="#000"/>', EM.x+150+rand(120), EM.y-60+rand(80)));
      await sleep(700); dots.forEach(d=>d.remove()); gun2.remove();
      await chaosPayoff(c, { endText:'CHECKOUT COMPLETE.\nNUDE EGG.', duringReveal:async()=>{
        const cart=prop('<rect class="ln" x="-24" y="-30" width="48" height="40" fill="#fff"/>', -60, 330); cart.style.transition='transform 1.6s linear'; await sleep(30); cart.setAttribute('transform','translate(1020 330)'); await sleep(1500); cart.remove(); if(cl)cl.remove(); } }); } }
];

/* ---- FINALE SHUFFLE BAG (persisted) ----
   Every eligible arc is seen once before the pool repeats; the first 5 Chaos
   runs are always distinct; a new bag never opens with the previous finale. */
function pickArc(pc){
  const h = saveState.chaosHistory;
  const eligible = FINALE_ARCS.filter(a=>pc>=(a.minPlayCount||0)).map(a=>a.id);
  let bag = (h.finaleBag||[]).filter(id=>eligible.includes(id));
  if(bag.length===0) bag = shuffle(eligible.slice());          // refill + reshuffle
  const last = h.recentFinales[h.recentFinales.length-1];
  const excluded = (h.chaosRuns < 5) ? h.recentFinales.slice() : (last ? [last] : []);
  let idx = bag.findIndex(id=>!excluded.includes(id));
  if(idx < 0){ idx = bag.findIndex(id=>id!==last); if(idx<0) idx=0; }   // graceful relax
  const id = bag.splice(idx,1)[0];
  h.finaleBag = bag;
  h.recentFinales.push(id); while(h.recentFinales.length>5) h.recentFinales.shift();
  h.chaosRuns = (h.chaosRuns|0) + 1;
  persist();
  return FINALE_ARCS.find(a=>a.id===id) || FINALE_ARCS[0];
}

/* ---- MINOR anti-repetition (stronger for distinctive events) ---- */
const DISTINCTIVE_MINORS = new Set(['adventure365','danFlashes','babyOfYear','tcTuggers','briansEgg','bozoEgg',
  'order55','eggUnion','didntDo','juryDuty','prevTimeline','managementEgg','sloppyMudpie','hotDog','coffinEgg']);
function pickMinor(pc){
  const h = saveState.chaosHistory, recent = h.recentMinors;
  const elig = MINOR_EVENTS.filter(e=>pc>=(e.min||0));
  const last8 = recent.slice(-8), last12 = recent.slice(-12);
  let pool = elig.filter(e=> !last8.includes(e.id) && !(DISTINCTIVE_MINORS.has(e.id) && last12.includes(e.id)));
  if(!pool.length) pool = elig.filter(e=> !recent.slice(-3).includes(e.id));
  if(!pool.length) pool = elig;
  const e = pool.length ? pickWeighted(pool) : null;
  if(e){ recent.push(e.id); while(recent.length>15) recent.shift(); persist(); }
  return e;
}

/* ---- hidden target: persisted anti-similarity + gentle per-arc bias ---- */
function pickTarget(arcId){
  const h = saveState.chaosHistory;
  let lo=90, hi=240;
  if(arcId==='wife'||arcId==='murder'||arcId==='timetravel'){ lo=140; hi=240; }   // longer stories
  else if(arcId==='riddle'||arcId==='audit'){ lo=90; hi=170; }                     // shorter, dialog-heavy
  let t,tries=0; do{ t=lo+rand(hi-lo+1); }while(Math.abs(t-h.lastTarget)<30 && tries++<8);
  h.lastTarget=t; persist(); return t;
}

/* ---- milestone dispatch with PACING (beats must breathe) ---- */
const MIN_FINALE_FEEDS = 9, MIN_FINALE_MS = 20000;
function finaleAllowed(c){ return c.feeds>=MIN_FINALE_FEEDS && (Date.now()-c.startT)>=MIN_FINALE_MS; }
function checkMilestones(c){
  if(c.milestone > 3) return;
  const THRESH=[0.25,0.5,0.75,1.0], KEYS=['p25','p50','p75','finale'];
  if(c.score/c.target < THRESH[c.milestone]) return;                 // next milestone not reached
  if(c.milestone > 0){                                               // hold pending until it's had room to breathe
    if(c.feedsSinceBeat < 1) return;
    if(performance.now()-c.lastBeatTime < c.arcGap) return;
  }
  if(c.milestone===3 && !finaleAllowed(c)) return;                   // minimum-run guard
  const key = KEYS[c.milestone]; c.milestone++;
  c.fired.add(key); c.log.push('arc:'+key);
  c.lastBeatTime=performance.now(); c.feedsSinceBeat=0; c.arcGap=2000+rand(2000);
  if(key==='finale'){ c.finaleTriggered=true; clearChaosEvents(); runChaosEvent({id:'arc:finale', async run(){ await c.arc.finale(c); }}); }
  else { runChaosEvent({id:'arc:'+key, async run(){ await c.arc[key](c); }}); }
  // NB: don't reset the minor cooldown here — chaosBusy already blocks minors
  // DURING a beat; resetting every beat starved minors entirely.
}

/* ---- minor-event pressure timing (irregular gaps; nudged by run modifier) ---- */
function resetMinorCooldown(c){ c.lastEventTime=performance.now(); c.feedsSinceEvent=0;
  let fMin=2,fRange=4,mMin=3000,mRange=6000;
  if(c.mod==='quietShift'){ fMin=4; fRange=4; mMin=6000; mRange=7000; }
  else if(c.mod==='badDay'){ fMin=1; fRange=3; mMin=2000; mRange=4000; }
  c.cooldownFeeds=fMin+rand(fRange); c.cooldownMs=mMin+rand(mRange); c.minorChance=0; }
function maybeFireMinor(c){
  if(chaosBusy() || c.feedsSinceEvent<c.cooldownFeeds || (performance.now()-c.lastEventTime)<c.cooldownMs) return;
  c.minorChance=Math.min(0.85, c.minorChance+0.2);
  if(chance(c.minorChance)){ const ev=pickMinor(saveState.playCount); if(ev){ c.log.push('minor:'+ev.id); resetMinorCooldown(c); runChaosEvent(ev); } }
}

/* ---- displayed counter: reliable score hidden; the readout lies (modifier-tuned) ---- */
function renderDisplay(c, v){
  const lieChance = (c.mod==='liar') ? 0.32 : 0.14;
  if(chance(lieChance)){ ui.setCounter(pick(DISPLAY_LIES)); return; }
  const flip = (c.mod==='auditorsNightmare') ? 0.5 : 0.2;
  if(chance(0.76)) c.disp += v;
  else if(chance(flip)) c.disp -= (1+rand(9));
  else c.disp += rand(9)-4;
  ui.setCounter(ui.eggsPlural(c.disp));
}

/* ---- the payoff (shared; finales pass variations) ---- */
async function chaosPayoff(c, opts={}){
  c.done=true; feedingLocked=true; ui.setTitle('EGG'); clearChaosEvents(); clearEggs();
  // a light layer of the beloved payoff mutations on top of any arc variation
  const muts = shuffle(['walkPast','turnTwice','buttHat','rate','giantBush','pantsBackOn']).slice(0, rand(3));
  const has = (m)=>muts.includes(m);
  if(!opts.skipWalk){
    if(has('walkPast')){ await EM.walkTo(1040,1400); await sleep(250); await EM.walkTo(480,1300); }
    else await EM.walkTo(480,1400);
    await sleep(300);
  }
  if(!opts.skipPants){ await EM.dropPants(); if(has('pantsBackOn')){ await sleep(300); await EM.raisePants(); await sleep(250); await EM.dropPants(); } }
  EM.bush(true); if(has('giantBush')) EM.bigBush(true); await sleep(900); EM.bush(false); EM.bigBush(false);
  if(has('turnTwice')){ await EM.turn(true); await EM.turn(false); await EM.turn(true); } else await EM.turn(true);
  sound.reveal();
  await EM.bend(true);
  if(has('buttHat')) EM.buttHat(true);
  if(opts.duringReveal){ try{ await opts.duringReveal(); }catch(e){} }
  await sleep(2200);
  if(has('rate')) showDialog({icon:false,text:'RATE THIS EGG:\n★★★★★',at:{x:740,y:150},buttons:[{label:'OK'}]});
  await dialogAsync({ icon:false, text:opts.endText || pick(END_MESSAGES), buttons:[{label:'PLAY AGAIN',cls:'default'}] });
  saveState.playCount += 1; persist();
  startChaos();
}

function startChaos(){
  resetPresentation();
  _eventActive=false; clearChaosEvents();      // fresh scheduler each run
  const pc = saveState.playCount;
  const arc = pickArc(pc);
  const mod = chance(0.27) ? pick(['slowCount','hotEggs','liar','quietShift','badDay','auditorsNightmare']) : null;
  const c = { score:0, disp:0, target:pickTarget(arc.id), feeds:0, done:false, finaleTriggered:false,
              arc, mod, fired:new Set(), startT:Date.now(), log:[],
              milestone:0, lastBeatTime:0, feedsSinceBeat:0, arcGap:2000+rand(2000),
              lastEventTime:0, feedsSinceEvent:0, cooldownFeeds:2+rand(4), cooldownMs:3000+rand(6000), minorChance:0 };
  resetMinorCooldown(c);            // seed initial cooldown (respects modifier)
  _chaos = c;
  refillBasket(5);

  if(pc>=2 && chance(0.30)) setTimeout(()=>{ if(!c.done && !chaosBusy()) showDialog({icon:false,text:pick(REPEAT_MESSAGES),buttons:[{label:'OK',cls:'default'}]}); }, 450);
  else if(chance(0.012)) setTimeout(()=>{ if(!c.done && !chaosBusy()) showDialog({text:'THIS IS NOT EGG GAME.',buttons:[{label:'OK',cls:'default'}]}); }, 500);

  activeController = { feedEgg(){
    if(c.done || c.finaleTriggered) return;
    c.feeds++; c.feedsSinceEvent++; c.feedsSinceBeat++;
    const v = normalEggValue(c.mod);
    c.score += v;                                     // reliable hidden progression
    renderDisplay(c, v);                              // the readout lies independently
    // safety: never strand the player
    if(c.feeds>=30 || (Date.now()-c.startT)>150000) c.score = Math.max(c.score, c.target);
    // arc beats first (take priority; paced)
    checkMilestones(c);
    if(c.finaleTriggered) return;
    // occasional out-of-eggs (respects cooldown/scheduler)
    if(!chaosBusy() && c.feedsSinceEvent>=c.cooldownFeeds && c.feeds>=2 && chance(0.10)){ resetMinorCooldown(c); return outOfEggsChaos(c); }
    // pressure-based minor event
    maybeFireMinor(c);
    refillBasket(5);
  }};
}

function outOfEggsChaos(c){
  const packSize = weighted(PACKS);
  const resume = (msg) => { refillBasket(4+rand(3)); feedingLocked=false; if(msg) showDialog({icon:false,text:msg,buttons:[{label:'OK',cls:'default'}]}); };
  feedingLocked = true; clearEggs(); if(c&&c.log) c.log.push('outOfEggs');
  showDialog({ icon:'!', text:'OUT OF EGGS.\n\nBUY '+packSize+' PACK OF EGGS?',
    buttons:[
      { label:'YES', cls:'default', onClick(){ sound.pack(); resume(weighted([['80 EGGS.',5],['3 EGGS.',2],['160 EGGS.',1],['0 EGGS.',1]])); } },
      { label:'NO', onClick(){ const n=weighted([['no-anyway',4],['okay',3],['again',2],['lose',2]]);
          if(n==='no-anyway') resume('80 EGGS.');
          else if(n==='okay') resume('OKAY.');
          else if(n==='lose'){ c.disp-=1; ui.setCounter(ui.eggsPlural(c.disp)); resume(null); }
          else outOfEggsChaos(c); } }
    ]});
}

/* ==========================================================================
   BOOT
   ========================================================================== */
function ensureEggs(){
  if(!feedingLocked && dialogStack.length===0 && activeController &&
     dom.play.querySelectorAll('.egg:not(.gag)').length === 0 && freeSlot()>=0){
    addBasketEgg();
  }
}
setInterval(ensureEggs, 800);

document.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('dragstart', e => e.preventDefault());

/* Chaos is unlocked ONLY once the birthday has actually been shown. If a save
   somehow has canonicalCompleted but not birthdayShown, we replay canonical. */
function boot(){ if(saveState.birthdayShown) startChaos(); else startCanonical(); }
boot();

/* ---- development-only mouth debug overlay (hidden during normal play) ----
   green rectangle = the actual forgiving eatRect used by gameplay
   red dot        = last pointer-release position */
let _dbgRect=null, _dbgDot=null, _dbgLabel=null, _dbgRAF=null;
function debugMouth(on){
  if(on){
    if(!_dbgRect){
      _dbgRect=document.createElement('div');
      _dbgRect.style.cssText='position:fixed;z-index:9999;pointer-events:none;box-sizing:border-box;';
      document.body.appendChild(_dbgRect);
      _dbgLabel=document.createElement('div');
      _dbgLabel.textContent='ARMED';
      _dbgLabel.style.cssText='position:fixed;z-index:10001;font:700 12px monospace;color:#0a0;pointer-events:none;';
      document.body.appendChild(_dbgLabel);
      _dbgDot=document.createElement('div');
      _dbgDot.style.cssText='position:fixed;z-index:10000;width:10px;height:10px;margin:-5px 0 0 -5px;'+
        'border-radius:50%;background:red;pointer-events:none;';
      document.body.appendChild(_dbgDot);
    }
    _dbgRect.hidden=false; _dbgDot.hidden=false;
    (function loop(){ const R=getMouthEatRect();      // SAME helper as gameplay
      const armed=_mouthDebug.mouthArmed;
      _dbgRect.style.left=R.left+'px'; _dbgRect.style.top=R.top+'px';
      _dbgRect.style.width=R.width+'px'; _dbgRect.style.height=R.height+'px';
      _dbgRect.style.border = armed ? '4px dashed #0a0' : '2px solid #0a0';
      _dbgRect.style.background = armed ? 'rgba(0,200,0,.40)' : 'rgba(0,200,0,.22)';
      _dbgLabel.hidden = !armed; _dbgLabel.style.left=(R.left+4)+'px'; _dbgLabel.style.top=(R.top-16)+'px';
      const r=_mouthDebug.pointer || _mouthDebug.lastRelease;
      if(r){ _dbgDot.hidden=false; _dbgDot.style.left=r.x+'px'; _dbgDot.style.top=r.y+'px'; } else _dbgDot.hidden=true;
      _dbgRAF=requestAnimationFrame(loop); })();
  } else {
    if(_dbgRAF) cancelAnimationFrame(_dbgRAF); _dbgRAF=null;
    if(_dbgRect) _dbgRect.hidden=true;
    if(_dbgDot) _dbgDot.hidden=true;
    if(_dbgLabel) _dbgLabel.hidden=true;
  }
  return on;
}

/* dev / test hooks */
window.EGG = {
  get saveState(){ return saveState; },
  getSaveState(){ return {...saveState}; },
  /* EGG.reset() clears eggGameBirthdayProgress (canonicalCompleted, birthdayShown,
     playCount) and reloads -> full canonical birthday run again. */
  reset(){ localStorage.removeItem(SAVE_KEY); location.reload(); },
  chaos(){ saveState.canonicalCompleted=true; saveState.birthdayShown=true; persist(); startChaos(); },
  debugMouth,                       // EGG.debugMouth(true) / EGG.debugMouth(false)
  feed(){ if(activeController && !feedingLocked) activeController.feedEgg(); },
  counter(){ return dom.counter.textContent; },
  title(){ return dom.feedTitle.textContent; },
  dialog(){ const d=dialogStack[dialogStack.length-1]; return d?d.querySelector('.dlg-text').textContent:null; },
  press(label){ const b=[...document.querySelectorAll('.dialog button')]; const t=label?b.find(x=>x.textContent===label):b[b.length-1]; if(t) t.click(); return !!t; },
  locked(){ return feedingLocked; },
  eggs(){ return [...dom.play.querySelectorAll('.egg')]; },
  mouth(){ return getMouthEatRect(); },
  getMouthDebug(){ return _mouthDebug; },
  chaosInfo(){ return _chaos && { arc:_chaos.arc.id, mod:_chaos.mod, target:_chaos.target, score:_chaos.score,
    feeds:_chaos.feeds, disp:_chaos.disp, fired:[..._chaos.fired], done:_chaos.done, log:_chaos.log.slice() }; },
  history(){ return saveState.chaosHistory; }
};

if('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(()=>{}));
}
