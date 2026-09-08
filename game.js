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

/* ==========================================================================
   SAVE STATE
   ========================================================================== */
let saveState = loadSave();
function loadSave(){
  try{ const o = JSON.parse(localStorage.getItem(SAVE_KEY)||'');
       return { canonicalCompleted:!!o.canonicalCompleted, playCount:o.playCount|0 }; }
  catch(e){ return { canonicalCompleted:false, playCount:0 }; }
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
  egFace:$('eg-face'), egButt:$('eg-butt'), egMouth:$('eg-mouth'),
  egBush:$('eg-bush'), egHat:$('eg-hat'), egButtHat:$('eg-butt-hat'),
  egTie:$('eg-tie'), egArm3:$('eg-arm3'),
  mini:$('mini-eggman'),
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
  mouth(){ return { x:this.x, y:this.y-40 }; },
  eatZone(){ return { x:this.x, y:this.y-70, rx:135, ry:120 }; },
  eating(on){ dom.eggman.classList.toggle('eating', on); },
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

/* ---- robust drag: EVERY completed gesture ends EATEN or HOME ---- */
function attachEggDrag(el){
  let s = null;   // active drag session

  function inEatZone(cx, cy){
    const z = EM.eatZone();
    const dx=(cx-z.x)/z.rx, dy=(cy-z.y)/z.ry;
    return dx*dx + dy*dy <= 1;
  }

  el.addEventListener('pointerdown', (e) => {
    if(feedingLocked || el._eaten) return;
    e.preventDefault();
    const c = eggCenter(el);
    const p = toLogical(e.clientX, e.clientY);
    s = { id:e.pointerId, done:false, moved:0,
          offX:p.x-c.x, offY:p.y-c.y, downT:Date.now(),
          lastX:c.x, lastY:c.y };
    el.classList.add('grab'); el.classList.remove('snap','fly');
    try{ el.setPointerCapture(e.pointerId); }catch(_){}
    sound.pickup();
  });

  el.addEventListener('pointermove', (e) => {
    if(!s || s.done) return;
    e.preventDefault();
    const p = toLogical(e.clientX, e.clientY);
    const cx = p.x - s.offX, cy = p.y - s.offY;
    s.moved += Math.abs(cx - s.lastX) + Math.abs(cy - s.lastY);
    s.lastX = cx; s.lastY = cy;
    positionEgg(el, cx, cy);
  });

  function finalize(eaten){
    if(!s || s.done) return;
    s.done = true;
    el.classList.remove('grab');
    try{ el.releasePointerCapture(s.id); }catch(_){}
    if(eaten) flyAndEat(el);
    else snapHome(el);
    s = null;
  }

  el.addEventListener('pointerup', () => {
    if(!s || s.done) return;
    const tap = s.moved < 12 && (Date.now()-s.downT) < 260;
    finalize(tap || inEatZone(s.lastX, s.lastY));
  });
  el.addEventListener('pointercancel', () => finalize(false));
  el.addEventListener('lostpointercapture', () => finalize(false));
}

function snapHome(el){
  el.classList.add('snap');
  positionEgg(el, el._homeX, el._homeY);
  setTimeout(() => el.classList.remove('snap'), 200);
}

function flyAndEat(el){
  if(el._eaten) return; el._eaten = true;
  if(el._slot!=null) occupied.delete(el._slot);
  const m = EM.mouth();
  el.classList.add('fly');
  positionEgg(el, m.x, m.y);
  el.style.transform = 'scale(0.12)';
  EM.eating(true); sound.eat();
  setTimeout(() => {
    el.remove(); sound.chew();
    setTimeout(() => EM.eating(false), 130);
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
  // I. BIRTHDAY
  await dialogAsync({ icon:'*', text:'HAPPY BIRTHDAY, '+birthdayConfig.sisterName+'.', buttons:[{label:'OK',cls:'default'}] });
  startParty();
  await dialogAsync({ icon:false,
    text:'YOU WON A NUDE EGG.\n\nYOU SHOULD BE ABLE TO LOOK AT\nA LITTLE PORN AT WORK.\n\n'+
         birthdayConfig.birthdayMessage.toUpperCase()+'\n\n— '+birthdayConfig.fromName,
    buttons:[{label:'PLAY AGAIN',cls:'default'}] });
  // COMPLETE
  saveState.canonicalCompleted = true;
  saveState.playCount += 1;
  persist();
  startChaos();
}

/* ==========================================================================
   MODE 2 — CHAOS REPLAY (curated event engine, always completable)
   ========================================================================== */
const EGG_VALUES = [[0,10],[1,26],[2,20],[3,14],[4,8],[6,4],[8,4],[10,3],[17,2],[23,2],[40,1],[41,0.6],[80,0.6],[-1,4]];
const SYS_MESSAGES = ['EGG ACCEPTED.','THAT WAS AN EGG.','THAT EGG DIDN’T COUNT.','THAT EGG COUNTED TWICE.',
  'THIS EGG IS 17 EGGS.','EGG NOT FOUND.','YOU HAVE TOO MANY EGGS.','YOU LOST 4 EGGS.','EGGMAN HAS NOTICED.',
  'HE NEEDS THIS.','PLEASE KEEP FEEDING HIM.','WRONG EGG.','EGG TOTAL UNAVAILABLE.','THE NUMBER IS CORRECT.',
  'DO NOT COUNT THEM YOURSELF.','THAT WAS PROBABLY FINE.','YOU NOW HAVE EGG.','NO.','EGG REMEMBERS.'];
const REPEAT_MESSAGES = ['YOU HAVE PLAYED EGG BEFORE.','EGG REMEMBERS.','YOU CAME BACK.','MORE?'];
const END_MESSAGES = ['YOU WON A NUDE EGG.','ANOTHER NUDE EGG.','YOU WON HIM AGAIN.','THIS ONE IS DIFFERENT.',
  'YOU HAVE SEEN TOO MUCH EGG.','EGGMAN REMEMBERS YOUR BIRTHDAY.','THIS IS YOUR EGG NOW.',
  'PLEASE DO NOT CLOSE THE EGG.','CONGRATS, MEDIUM BOY.','NUDE EGG ACHIEVED.'];
const PACKS = [[80,20],[37,3],[1,3],[400,2],[6,3],[-12,2]];

/* ---- curated CHAOS EVENTS. Each cleans up after itself. ---- */
const CHAOS_EVENTS = [
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
  { id:'secondMini', min:2, weight:2, async run(){ await miniWander(); } },
  { id:'necktie', min:2, weight:2, async run(){ EM.tie(true); await sleep(2600); EM.tie(false); } },
  { id:'leftInsist', min:3, weight:2, async run(){ await EM.walkTo(-260,1200); showDialog({text:'EGGMAN IS STILL HERE.',buttons:[{label:'OK',cls:'default'}]}); await sleep(900); await EM.walkTo(EM.HOMEX,1200); } },
  // ---- EGG BEHAVIOR ----
  { id:'runaway', min:1, weight:3, async run(){ const e=makeEgg(EM.x+140, EM.HOMEY+60, {legs:true, gag:true});
      e.classList.add('snap'); await sleep(30); positionEgg(e, LW+80, EM.HOMEY+60); await sleep(1200); e.remove(); } },
  { id:'giantEgg', min:1, weight:3, async run(){ const e=addBasketEgg({big:true}); if(e) flash('THIS EGG IS BIG.'); } },
  { id:'microEgg', min:1, weight:3, async run(){ addBasketEgg({tiny:true}); } },
  { id:'squareEgg', min:1, weight:3, async run(){ addBasketEgg({square:true}); /* nobody acknowledges it */ } },
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
  { id:'inMeeting', min:2, weight:2, async run(){ await dialogAsync({text:'EGGMAN IS CURRENTLY\nIN A MEETING.',buttons:[{label:'OK',cls:'default'}]}); } }
];

function flash(text){ showDialog({ icon:false, text, buttons:[{label:'OK',cls:'default'}] }); }

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

function startChaos(){
  resetPresentation();
  const pc = saveState.playCount;   // completed runs so far
  const c = { disp:0, feeds:0, forceAt:7+rand(8), startT:Date.now(),
              lastMsgFeed:-5, done:false, firstEggIs41:false, refuseFirst:false, schedule:new Map() };

  refillBasket(5);

  // choose a handful of events for this run (more, and weirder, as playCount grows)
  const nEvents = pc<=1 ? 2 : pc===2 ? (3+rand(2)) : (3+rand(4));   // 2, 3-4, 3-6
  const eligible = shuffle(CHAOS_EVENTS.filter(ev => pc >= ev.min));
  const chosen = [];
  for(const ev of eligible){ if(chosen.length>=nEvents) break; chosen.push(ev); }
  // spread them over feeds 1..(forceAt-1)
  chosen.forEach((ev,i) => { const f = 1 + Math.floor((i+1) * (c.forceAt-1) / (chosen.length+1));
    if(!c.schedule.has(f)) c.schedule.set(f, ev); else c.schedule.set(f+1, ev); });

  // rare opening easter eggs
  const roll = Math.random(); let opened=false;
  if(roll < 0.010){ opened=true; showDialog({text:'THIS IS NOT EGG GAME.',buttons:[{label:'OK',cls:'default'}]}); }
  else if(roll < 0.020){ opened=true; feedingLocked=true; showDialog({text:'YOU WIN.',buttons:[{label:'OK',cls:'default',onClick(){ chaosEnding(c); }}]}); }
  else if(roll < 0.030){ opened=true; ui.setCounter('42 EGGS'); showDialog({text:'42 EGGS.\nYOU LOSE.',buttons:[{label:'OK',cls:'default',onClick(){ ui.setCounter('0 EGGS'); }}]}); }
  else if(roll < 0.040){ c.firstEggIs41=true; }
  else if(roll < 0.050){ c.refuseFirst=true; }

  if(!opened && pc>=2 && chance(0.35))
    setTimeout(()=>showDialog({icon:false,text:pick(REPEAT_MESSAGES),buttons:[{label:'OK',cls:'default'}]}), 400);

  activeController = { feedEgg(){
    if(c.done) return;
    c.feeds++;

    if(c.refuseFirst && c.feeds===1){ c.refuseFirst=false; c.feeds--;
      EM.shake(); showDialog({text:pick(['WRONG EGG.','NO.','EGG NOT FOUND.']),buttons:[{label:'OK',cls:'default'}]}); return; }
    if(c.firstEggIs41 && c.feeds===1){ c.disp=41; render(); return chaosWin(c); }

    const v = weighted(EGG_VALUES);
    if(!chance(0.10)) c.disp += v;
    if(c.disp<0 && chance(0.5)) c.disp=0;
    render(chance(0.06));

    if(c.feeds - c.lastMsgFeed >= 2 && chance(0.28)){ c.lastMsgFeed=c.feeds;
      showDialog({icon:false,text:pick(SYS_MESSAGES),buttons:[{label:'OK',cls:'default'}]}); }

    // scheduled curated event?
    const ev = c.schedule.get(c.feeds);
    if(ev){ c.schedule.delete(c.feeds); Promise.resolve().then(()=>ev.run(c)).catch(()=>{}); }

    // random out-of-eggs -> weird pack
    if(c.feeds>=2 && chance(0.12)) return outOfEggsChaos(c);

    // win conditions
    if(c.disp>=41) return chaosWin(c);
    if(c.disp===6 && chance(0.20)) return chaosWin(c);
    if(v===-1 && chance(0.15)) return chaosWin(c);
    if(chance(0.04)) return chaosWin(c);
    if(c.feeds>=c.forceAt || (Date.now()-c.startT)>110000) return chaosWin(c);

    refillBasket(5);
  }};

  function render(textCounter){ ui.setCounter(textCounter ? 'EGG' : ui.eggsPlural(c.disp)); }
}

function outOfEggsChaos(c){
  const packSize = weighted(PACKS);
  const resume = (msg) => { refillBasket(4+rand(3)); feedingLocked=false; if(msg) showDialog({icon:false,text:msg,buttons:[{label:'OK',cls:'default'}]}); };
  feedingLocked = true; clearEggs();
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

function chaosWin(c){
  if(c.done) return; c.done=true; feedingLocked=true;
  ui.setCounter('41 EGGS'); ui.setTitle('EGG'); sound.win();
  setTimeout(()=>showDialog({icon:false,text:'YOU WIN',buttons:[{label:'OK',cls:'default',onClick(){ chaosEnding(c); }}]}), 500);
}

/* Chaos ending: the pants/butt sequence, mutated by a few curated twists. */
async function chaosEnding(c){
  feedingLocked = true; ui.setTitle('EGG');
  clearEggs();
  const muts = shuffle(['walkPast','pantsEarly','doublePants','pantsUp','turnTwice','wrongBend',
                        'wrongSide','pantsBackOn','miniWatch','longWalk','victoryEarly','giantBush','buttHat','rate'])
                 .slice(0, 1+rand(3));
  const has = (m)=>muts.includes(m);

  if(has('miniWatch')){ setShown(dom.mini,true); dom.mini.style.transform='translate(90px,150px)'; }

  // walk to center (maybe absurdly)
  if(has('longWalk')){ await EM.walkTo(EM.HOMEX+40, 3000); }
  else if(has('walkPast')){ await EM.walkTo(1040,1500); await sleep(300); await EM.walkTo(480,1400); }
  else { await EM.walkTo(480,1500); }
  await sleep(400);

  if(has('pantsEarly')){ /* already could have dropped; just drop now emphatically */ }
  if(has('pantsUp')){ await EM.dropPantsUp(); }
  else { await EM.dropPants(); }
  if(has('doublePants')){ await sleep(150); await EM.dropPants(); }

  EM.bush(true);
  if(has('giantBush')){ EM.bigBush(true); }
  await sleep(1000);
  EM.bush(false); EM.bigBush(false);

  if(has('turnTwice')){ await EM.turn(true); await EM.turn(false); await EM.turn(true); }
  else { await EM.turn(true); }
  sound.reveal();

  if(has('victoryEarly')){ showDialog({icon:false,text:'YOU WIN',buttons:[{label:'OK',cls:'default'}]}); await sleep(700); }

  if(has('wrongBend')){ await EM.bend(-30);
      await dialogAsync({text:'WRONG SIDE',buttons:[{label:'OK',cls:'default'}]}); await EM.bend(30); }
  else { await EM.bend(true); }

  if(has('wrongSide')){ await dialogAsync({text:'WRONG SIDE',buttons:[{label:'OK',cls:'default'}]}); }
  if(has('buttHat')){ EM.buttHat(true); }

  if(has('pantsBackOn')){ await sleep(500); await EM.raisePants(); await sleep(300); await EM.dropPants(); }

  await sleep(2400);

  if(has('rate')){ showDialog({icon:false,text:'RATE THIS EGG:\n★★★★★',at:{x:720,y:150},buttons:[{label:'OK'}]}); }

  // ending message — smaller birthday references, occasionally the porn line
  let text = pick(END_MESSAGES);
  if(chance(0.16)) text = 'YOU WON A NUDE EGG.\n\nYOU SHOULD BE ABLE TO LOOK AT\nA LITTLE PORN AT WORK.';
  else if(chance(0.15)) text = 'EGGMAN REMEMBERS YOUR\nBIRTHDAY, '+birthdayConfig.sisterName+'.';
  await dialogAsync({ icon:false, text, buttons:[{label:'PLAY AGAIN',cls:'default'}] });

  saveState.playCount += 1; persist();
  startChaos();
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

function boot(){ if(saveState.canonicalCompleted) startChaos(); else startCanonical(); }
boot();

/* dev / test hooks */
window.EGG = {
  get saveState(){ return saveState; },
  reset(){ localStorage.removeItem(SAVE_KEY); location.reload(); },
  chaos(){ saveState.canonicalCompleted=true; persist(); startChaos(); },
  feed(){ if(activeController && !feedingLocked) activeController.feedEgg(); },
  counter(){ return dom.counter.textContent; },
  title(){ return dom.feedTitle.textContent; },
  dialog(){ const d=dialogStack[dialogStack.length-1]; return d?d.querySelector('.dlg-text').textContent:null; },
  press(label){ const b=[...document.querySelectorAll('.dialog button')]; const t=label?b.find(x=>x.textContent===label):b[b.length-1]; if(t) t.click(); return !!t; },
  locked(){ return feedingLocked; },
  eggs(){ return [...dom.play.querySelectorAll('.egg')]; },
  em(){ return { x:EM.x, y:EM.y, zone:EM.eatZone() }; }
};

if('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(()=>{}));
}
