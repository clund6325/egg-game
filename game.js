/* ==========================================================================
   EGG
   A crude vintage recreation of the Egg Game.
   Vanilla JS. No dependencies.
   --------------------------------------------------------------------------
   >>> EDIT YOUR BIRTHDAY MESSAGE HERE <<<
   The three values below are all you need to personalize the gift.
   ========================================================================== */
const birthdayConfig = {
  sisterName: "KORRI",          // shown in the big birthday reveal
  fromName:   "CAMERON",        // signed at the bottom of the reveal
  birthdayMessage: "Happy Birthday!"
};

/* localStorage key that remembers the birthday playthrough.
   To retest the FIRST (canonical birthday) experience, run in the console:
       localStorage.removeItem('eggGameBirthdayProgress')
   ...then refresh. */
const SAVE_KEY = 'eggGameBirthdayProgress';
const MUTE_KEY = 'eggGameMuted';

/* ==========================================================================
   SAVE STATE
   ========================================================================== */
let saveState = loadSave();

function loadSave(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(raw){
      const o = JSON.parse(raw);
      return { canonicalCompleted: !!o.canonicalCompleted, playCount: o.playCount|0 };
    }
  }catch(e){}
  return { canonicalCompleted:false, playCount:0 };
}
function persist(){
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(saveState)); }catch(e){}
}

/* ==========================================================================
   DOM
   ========================================================================== */
const $ = (id) => document.getElementById(id);
/* Show/hide an element via the `hidden` ATTRIBUTE.
   (The `.hidden` IDL property is not reflected on SVG elements, and our CSS
    keys off `[hidden]`, so we must toggle the attribute directly.) */
const setShown = (el, shown) => el.toggleAttribute('hidden', !shown);
const dom = {
  window:   $('window'),
  stage:    $('stage'),
  feedTitle:$('feed-title'),
  counter:  $('counter'),
  eggman:   $('eggman'),
  egFront:  $('eg-front'),
  egBack:   $('eg-back'),
  egHat:    $('eg-hat'),
  egPants:  $('eg-pants'),
  egMouth:  $('eg-mouth'),
  egEyeL:   $('eg-eyeL'),
  egEyeR:   $('eg-eyeR'),
  basketArea: $('basket-area'),
  basket:   $('basket'),
  eggs:     $('eggs'),
  dragLayer:$('drag-layer'),
  dialogLayer:$('dialog-layer'),
  dialogs:  $('dialogs'),
  mute:     $('mute'),
  confetti: $('confetti'),
  balloons: $('balloons'),
  bdayText: $('bday-text'),
};

/* ==========================================================================
   SOUND  (Web Audio, primitive, all original)
   ========================================================================== */
const sound = (() => {
  let ctx = null;
  let muted = false;
  try{ muted = localStorage.getItem(MUTE_KEY) === '1'; }catch(e){}

  function ensure(){
    if(muted) return null;
    if(!ctx){
      try{ ctx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ return null; }
    }
    if(ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function beep(freq, dur, type='square', gain=0.05, when=0){
    const c = ensure(); if(!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, gain=0.05){
    const c = ensure(); if(!c) return;
    const t = c.currentTime;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0;i<n;i++) d[i] = (Math.random()*2-1) * (1 - i/n);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(g).connect(c.destination); src.start(t);
  }

  return {
    isMuted: () => muted,
    toggle(){
      muted = !muted;
      try{ localStorage.setItem(MUTE_KEY, muted ? '1':'0'); }catch(e){}
      if(!muted) ensure();
      return muted;
    },
    unlock(){ ensure(); },
    pickup(){ beep(520, 0.06, 'square', 0.04); },
    eat(){ beep(300, 0.05, 'square', 0.05); beep(180, 0.09, 'square', 0.05, 0.04); },
    chew(){ noise(0.05, 0.03); },
    error(){ beep(160, 0.12, 'square', 0.06); beep(120, 0.16, 'square', 0.06, 0.1); },
    pack(){ beep(440, 0.05, 'square', 0.05); beep(660, 0.08, 'square', 0.05, 0.05); },
    win(){ [523,659,784,1047].forEach((f,i)=> beep(f, 0.14, 'square', 0.05, i*0.11)); },
    reveal(){ beep(200,0.5,'sawtooth',0.05); beep(150,0.6,'sawtooth',0.04,0.05); },
    jingle(){
      // primitive "birthday-ish" original ditty (not the copyrighted tune)
      const notes = [392,392,440,392,523,494, 392,392,440,392,587,523];
      notes.forEach((f,i)=> beep(f, 0.18, 'square', 0.05, i*0.19));
    }
  };
})();

function refreshMuteLabel(){ dom.mute.textContent = 'SND: ' + (sound.isMuted() ? 'OFF' : 'ON'); }
refreshMuteLabel();
dom.mute.addEventListener('click', () => { sound.toggle(); refreshMuteLabel(); });

/* first user gesture unlocks audio (mobile restriction) */
window.addEventListener('pointerdown', () => sound.unlock(), { once:true });

/* ==========================================================================
   EGG ART  (mini SVG for a draggable egg)
   ========================================================================== */
function eggSVG(){
  return `<svg viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg">
    <path class="eshape" d="M20,3 C11,3 6,20 6,30 C6,43 12,49 20,49 C28,49 34,43 34,30 C34,20 29,3 20,3 Z"/>
    <rect class="esquare" x="7" y="10" width="26" height="34" fill="#fff" stroke="#000" stroke-width="3"/>
    <g class="elegs"><path d="M15,48 L13,52" stroke="#000" stroke-width="2"/><path d="M25,48 L27,52" stroke="#000" stroke-width="2"/></g>
  </svg>`;
}

/* ==========================================================================
   UI HELPERS
   ========================================================================== */
const ui = {
  setTitle(t){ dom.feedTitle.textContent = t; },
  setCounter(t){ dom.counter.textContent = t; },
  eggsPlural(n){ return (n === 1 || n === -1) ? (n + ' EGG') : (n + ' EGGS'); },

  clearBasket(){ dom.eggs.innerHTML = ''; },

  /* keep the basket looking like it holds `n` eggs (visual only) */
  fillBasket(n, opts={}){
    ui.clearBasket();
    for(let i=0;i<n;i++) ui.addEgg(opts);
  },
  addEgg(opts={}){
    const el = document.createElement('div');
    el.className = 'egg';
    if(opts.big) el.classList.add('big');
    if(opts.tiny) el.classList.add('tiny');
    if(opts.square) el.classList.add('square');
    if(opts.legs) el.classList.add('legs');
    el.innerHTML = eggSVG();
    dom.eggs.appendChild(el);
    attachEggDrag(el, opts);
    return el;
  },
  eggCount(){ return dom.eggs.querySelectorAll('.egg').length; },

  eggmanEating(on){ dom.eggman.classList.toggle('eating', on); },

  reset(){
    dom.eggman.className = 'eggman';
    setShown(dom.egFront, true);
    setShown(dom.egBack, false);
    setShown(dom.egHat, false);
    dom.egPants.classList.remove('drop');
    dom.egMouth.classList.remove('huge');
    dom.egEyeL.classList.remove('big');
    dom.egEyeR.classList.remove('big');
    dom.basketArea.classList.remove('left','right');
    stopParty();
    hideAllDialogs();
    ui.setTitle('FEED EGGS');
    ui.setCounter('0 EGGS');
  }
};

/* ==========================================================================
   DIALOGS  (crude system alerts)
   ========================================================================== */
let dialogStack = [];
function showDialog(opts){
  // opts: { icon, text, buttons:[{label, cls, onClick}], behind }
  dom.dialogLayer.hidden = false;
  const box = document.createElement('div');
  box.className = 'dialog';
  if(opts.behind){                       // "a dialog opens behind another dialog" glitch
    box.style.transform = 'translate(-14px,-12px)';
    box.style.zIndex = '0';
  }
  const icon = opts.icon === false ? '' :
    `<div class="dlg-icon">${opts.icon || '!'}</div>`;
  const btns = (opts.buttons || [{label:'OK'}]).map((b,i)=>
    `<button data-i="${i}" class="${b.cls || (i===0?'default':'')}">${b.label}</button>`).join('');
  box.innerHTML = `${icon}<div class="dlg-text">${opts.text}</div><div class="dlg-buttons">${btns}</div>`;
  dom.dialogs.appendChild(box);
  dialogStack.push(box);

  box.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.i;
      const b = (opts.buttons || [{label:'OK'}])[i];
      sound.pickup();
      closeDialog(box);
      if(b && typeof b.onClick === 'function') b.onClick();
    });
  });
  sound.error();
  return box;
}
function closeDialog(box){
  const idx = dialogStack.indexOf(box);
  if(idx >= 0) dialogStack.splice(idx,1);
  box.remove();
  if(dialogStack.length === 0) dom.dialogLayer.hidden = true;
}
function hideAllDialogs(){
  dialogStack = [];
  dom.dialogs.innerHTML = '';
  dom.dialogLayer.hidden = true;
}

/* ==========================================================================
   FEEDING  (drag + tap), shared by both modes
   ========================================================================== */
let activeController = null;   // has .feedEgg(el)
let feedingLocked = false;     // during dialogs / cutscenes

function mouthRect(){
  const r = dom.egMouth.getBoundingClientRect();
  return r;
}
function pointOverMouth(x, y){
  const r = mouthRect();
  const pad = 46; // generous hit area for phones
  return x >= r.left - pad && x <= r.right + pad &&
         y >= r.top  - pad && y <= r.bottom + pad;
}

function attachEggDrag(el, opts={}){
  let dragging = false;
  let moved = 0;
  let startX = 0, startY = 0, downT = 0;
  let offX = 0, offY = 0;
  let refused = false;

  el.addEventListener('pointerdown', (e) => {
    if(feedingLocked) return;
    if(opts.refuseOnce && !refused){        // "an egg refuses to move once"
      refused = true;
      sound.error();
      shake(el);
      return;
    }
    e.preventDefault();
    dragging = true; moved = 0; downT = Date.now();
    startX = e.clientX; startY = e.clientY;
    const r = el.getBoundingClientRect();
    offX = e.clientX - r.left;
    offY = e.clientY - r.top;
    // move egg to the drag layer so it can travel over Eggman
    el.classList.add('dragging');
    dom.dragLayer.appendChild(el);
    el.style.left = (e.clientX - offX) + 'px';
    el.style.top  = (e.clientY - offY) + 'px';
    try{ el.setPointerCapture(e.pointerId); }catch(_){}
    sound.pickup();
  });

  el.addEventListener('pointermove', (e) => {
    if(!dragging) return;
    e.preventDefault();
    moved += Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY);
    el.style.left = (e.clientX - offX) + 'px';
    el.style.top  = (e.clientY - offY) + 'px';
  });

  const end = (e) => {
    if(!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    const dt = Date.now() - downT;
    const dist = Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY);
    const isTap = dt < 350 && dist < 12;

    if(pointOverMouth(e.clientX, e.clientY)){
      consume(el);
    }else if(isTap){
      // tap-to-feed fallback: fling toward mouth then eat
      flingToMouth(el);
    }else{
      returnToBasket(el);
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

function shake(el){
  el.animate(
    [{transform:'translateX(0)'},{transform:'translateX(-4px)'},
     {transform:'translateX(4px)'},{transform:'translateX(0)'}],
    {duration:180, iterations:1});
}

function returnToBasket(el){
  el.style.transition = 'left 160ms steps(4), top 160ms steps(4)';
  // just drop it back into the basket flow
  setTimeout(() => {
    el.style.transition = '';
    el.style.left = el.style.top = '';
    if(!el.classList.contains('rolling')) dom.eggs.appendChild(el);
  }, 170);
}

function flingToMouth(el){
  const r = mouthRect();
  const er = el.getBoundingClientRect();
  const tx = r.left + r.width/2 - er.width/2;
  const ty = r.top  + r.height/2 - er.height/2;
  if(el.parentElement !== dom.dragLayer) dom.dragLayer.appendChild(el);
  el.style.left = er.left + 'px';
  el.style.top  = er.top + 'px';
  el.style.transition = 'left 200ms steps(6), top 200ms steps(6)';
  requestAnimationFrame(() => {
    el.style.left = tx + 'px';
    el.style.top  = ty + 'px';
  });
  setTimeout(() => consume(el), 210);
}

function consume(el){
  // animate egg into the mouth
  const r = mouthRect();
  const er = el.getBoundingClientRect();
  const tx = r.left + r.width/2 - er.width/2;
  const ty = r.top  + r.height/2 - er.height/2;
  if(el.parentElement !== dom.dragLayer) dom.dragLayer.appendChild(el);
  el.style.left = er.left + 'px';
  el.style.top  = er.top + 'px';
  el.style.transition = 'left 130ms steps(4), top 130ms steps(4), transform 130ms steps(4)';
  ui.eggmanEating(true);
  sound.eat();
  requestAnimationFrame(() => {
    el.style.left = tx + 'px';
    el.style.top  = ty + 'px';
    el.style.transform = 'scale(0.15)';
  });
  setTimeout(() => {
    el.remove();
    sound.chew();
    setTimeout(() => ui.eggmanEating(false), 120);
    if(activeController && typeof activeController.feedEgg === 'function'){
      activeController.feedEgg();
    }
  }, 140);
}

/* ==========================================================================
   PARTY EFFECTS  (confetti / balloons / flashing text / jingle)
   ========================================================================== */
let confettiRAF = null;
function startConfetti(){
  const cv = dom.confetti;
  const ctx = cv.getContext('2d');
  function size(){ cv.width = innerWidth; cv.height = innerHeight; }
  size();
  const bits = [];
  for(let i=0;i<160;i++){
    bits.push({
      x: Math.random()*cv.width,
      y: Math.random()*-cv.height,
      s: 3 + Math.random()*5,
      vy: 1 + Math.random()*3,
      vx: -1 + Math.random()*2,
      rot: Math.random()*6,
      vr: -0.2 + Math.random()*0.4,
      shade: Math.random() < 0.5 ? '#000' : '#fff',
      sq: Math.random() < 0.5
    });
  }
  function frame(){
    ctx.clearRect(0,0,cv.width,cv.height);
    for(const b of bits){
      b.y += b.vy; b.x += b.vx; b.rot += b.vr;
      if(b.y > cv.height + 10){ b.y = -10; b.x = Math.random()*cv.width; }
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      ctx.fillStyle = b.shade;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      if(b.sq){ ctx.fillRect(-b.s/2,-b.s/2,b.s,b.s); ctx.strokeRect(-b.s/2,-b.s/2,b.s,b.s); }
      else { ctx.beginPath(); ctx.arc(0,0,b.s/2,0,7); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    }
    confettiRAF = requestAnimationFrame(frame);
  }
  frame();
}
function startBalloons(){
  dom.balloons.innerHTML = '';
  for(let i=0;i<7;i++){
    const b = document.createElement('div');
    b.className = 'balloon';
    b.style.left = (5 + Math.random()*88) + 'vw';
    b.style.top  = (100 + Math.random()*40) + 'vh';
    b.style.transition = 'top ' + (6 + Math.random()*5) + 's linear';
    dom.balloons.appendChild(b);
    requestAnimationFrame(() => { b.style.top = '-25vh'; });
  }
}
function flashText(t){
  dom.bdayText.textContent = t;
  dom.bdayText.classList.add('on');
}
function startParty(){
  startConfetti();
  startBalloons();
  setShown(dom.egHat, true);
  flashText('HAPPY BIRTHDAY ' + birthdayConfig.sisterName);
  sound.jingle();
}
function stopParty(){
  if(confettiRAF){ cancelAnimationFrame(confettiRAF); confettiRAF = null; }
  const cv = dom.confetti;
  const c = cv.getContext('2d'); c && c.clearRect(0,0,cv.width,cv.height);
  dom.balloons.innerHTML = '';
  dom.bdayText.classList.remove('on');
  dom.bdayText.textContent = '';
}

/* ==========================================================================
   NUDE EGG  (the payoff — a stupid cartoon egg butt, original line art)
   ========================================================================== */
function nudeEgg(cb){
  feedingLocked = true;
  ui.setTitle('EGG');
  // turn around
  dom.eggman.classList.add('turn');
  setTimeout(() => {
    dom.eggman.classList.remove('turn');
    setShown(dom.egFront, false);
    setShown(dom.egBack, true);
    sound.reveal();
    // pants drop
    setTimeout(() => dom.egPants.classList.add('drop'), 150);
    // let it sit 2–4s before whatever comes next
    setTimeout(cb, 3000);
  }, 260);
}

/* ==========================================================================
   RANDOM HELPERS
   ========================================================================== */
function rand(n){ return Math.floor(Math.random()*n); }
function chance(p){ return Math.random() < p; }
function pick(arr){ return arr[rand(arr.length)]; }
function weighted(pairs){          // [[value, weight], ...]
  let total = 0; for(const p of pairs) total += p[1];
  let r = Math.random()*total;
  for(const p of pairs){ if((r -= p[1]) < 0) return p[0]; }
  return pairs[pairs.length-1][0];
}

/* ==========================================================================
   MODE 1 — CANONICAL FIRST PLAYTHROUGH (scripted, deterministic)
   INTRO -> FEEDING(=>6) -> OUT_OF_EGGS -> 80_PACK ->
   40_EGGS -> 41_EGGS -> WIN -> NUDE_EGG -> BIRTHDAY -> COMPLETE
   ========================================================================== */
function startCanonical(){
  activeController = null;
  ui.reset();
  feedingLocked = false;

  // displayed count lags behind what you actually feed, ending on the
  // famous "6 EGGS" after clearly feeding many more than six.
  const displaySeq = [1,2,3,3,4,4,5,5,6]; // 9 feeds -> "6 EGGS"
  let phase = 'feeding';
  let fed = 0;

  ui.fillBasket(displaySeq.length);   // a basket clearly holding way more than 6

  activeController = {
    feedEgg(){
      if(phase === 'feeding'){
        fed++;
        const disp = displaySeq[Math.min(fed-1, displaySeq.length-1)];
        ui.setCounter(disp + ' EGGS');
        if(fed >= displaySeq.length){
          // ran out — offer the 80 pack
          phase = 'await80';
          feedingLocked = true;
          setTimeout(outOfEggs80, 500);
        }
      }
      else if(phase === 'forty'){
        // one visible egg -> 40 EGGS
        ui.setCounter('40 EGGS');
        sound.win();
        phase = 'fortyone';
      }
      else if(phase === 'fortyone'){
        // next egg -> 41 EGGS -> win
        ui.setCounter('41 EGGS');
        phase = 'done';
        feedingLocked = true;
        setTimeout(canonicalWin, 650);
      }
    }
  };

  function outOfEggs80(){
    showDialog({
      icon:'!',
      text:'OUT OF EGGS.\n\nBUY 80 PACK OF EGGS?',
      buttons:[{ label:'YES', cls:'default', onClick(){
        sound.pack();
        // the 80 pack (we only need a couple to reach the gag)
        ui.fillBasket(6);
        ui.setCounter('6 EGGS');
        phase = 'forty';
        feedingLocked = false;
      }}]
    });
  }

  function canonicalWin(){
    ui.setTitle('EGG');
    showDialog({
      icon:false,
      text:'CONGRATS, BIG BOY.',
      buttons:[{ label:'OK', cls:'default', onClick(){
        nudeEgg(canonicalBirthday);
      }}]
    });
    sound.win();
  }

  function canonicalBirthday(){
    // FIRST the plain Egg Game payoff has landed. NOW the birthday bolts on.
    showDialog({
      icon:'*',
      text:'HAPPY BIRTHDAY, ' + birthdayConfig.sisterName + '.',
      buttons:[{ label:'OK', cls:'default', onClick(){
        startParty();
        showDialog({
          icon:false,
          text:
            'YOU WON A NUDE EGG.\n\n' +
            'YOU SHOULD BE ABLE TO LOOK AT\n' +
            'A LITTLE PORN AT WORK.\n\n' +
            birthdayConfig.birthdayMessage.toUpperCase() + '\n\n' +
            '— ' + birthdayConfig.fromName,
          buttons:[{ label:'PLAY AGAIN', cls:'default', onClick(){
            completeCanonical();
          }}]
        });
      }}]
    });
  }

  function completeCanonical(){
    saveState.canonicalCompleted = true;
    saveState.playCount += 1;      // first playthrough -> 1
    persist();
    stopParty();
    startChaos();
  }
}

/* ==========================================================================
   MODE 2 — CHAOS REPLAY MODE (curated randomness, always completable)
   ========================================================================== */
const EGG_VALUES = [
  [0,10],[1,26],[2,20],[3,14],[4,8],[6,4],[8,4],
  [10,3],[17,2],[23,2],[40,1],[41,0.6],[80,0.6],[-1,4]
];
const SYS_MESSAGES = [
  'EGG ACCEPTED.','THAT WAS AN EGG.','THAT EGG DIDN’T COUNT.',
  'THAT EGG COUNTED TWICE.','THIS EGG IS 17 EGGS.','EGG NOT FOUND.',
  'YOU HAVE TOO MANY EGGS.','YOU LOST 4 EGGS.','EGGMAN HAS NOTICED.',
  'HE NEEDS THIS.','PLEASE KEEP FEEDING HIM.','WRONG EGG.',
  'EGG TOTAL UNAVAILABLE.','THE NUMBER IS CORRECT.',
  'DO NOT COUNT THEM YOURSELF.','THAT WAS PROBABLY FINE.',
  'YOU NOW HAVE EGG.','NO.','EGG REMEMBERS.'
];
const REPEAT_MESSAGES = ['YOU HAVE PLAYED EGG BEFORE.','EGG REMEMBERS.','YOU CAME BACK.','MORE?'];
const END_MESSAGES = [
  'YOU WON A NUDE EGG.','ANOTHER NUDE EGG.','YOU WON HIM AGAIN.',
  'THIS ONE IS DIFFERENT.','YOU HAVE SEEN TOO MUCH EGG.',
  'EGGMAN REMEMBERS YOUR BIRTHDAY.','THIS IS YOUR EGG NOW.',
  'PLEASE DO NOT CLOSE THE EGG.','CONGRATS, MEDIUM BOY.','NUDE EGG ACHIEVED.'
];
const PACKS = [
  [80,20],[37,3],[1,3],[400,2],[6,3],[-12,2]
];

function startChaos(){
  activeController = null;
  ui.reset();
  feedingLocked = false;

  const c = {
    disp: 0,
    actualFed: 0,
    feeds: 0,
    forceAt: 7 + rand(8),      // guarantee a win within ~7–14 feeds
    startT: Date.now(),
    lastMsgFeed: -5,
    firstEggIs41: false,
    packBonus: 0,              // e.g. 81-pack sets +1
    done: false
  };

  ui.setCounter('0 EGGS');
  ui.fillBasket(5);

  // ---- rare opening events -------------------------------------------------
  const roll = Math.random();
  let opened = false;
  if(roll < 0.005){                                   // 0.5%
    opened = true;
    showDialog({ text:'THIS IS NOT EGG GAME.', buttons:[{label:'OK',cls:'default'}] });
  } else if(roll < 0.010){                            // 0.5%  backward-then-turn
    opened = true;
    setShown(dom.egFront, false); setShown(dom.egBack, true);
    setTimeout(() => {
      showDialog({ text:'…', buttons:[{label:'TURN AROUND',cls:'default',onClick(){
        dom.eggman.classList.add('turn');
        setTimeout(()=>{ dom.eggman.classList.remove('turn'); setShown(dom.egBack,false); setShown(dom.egFront,true); },260);
      }}]});
    }, 700);
  } else if(roll < 0.020){                            // 1%  instant win + reveal
    opened = true;
    feedingLocked = true;
    showDialog({ text:'YOU WIN.', buttons:[{label:'OK',cls:'default',onClick(){ chaosEnding(c); }}]});
  } else if(roll < 0.030){                            // 1%  42 EGGS. YOU LOSE. then continue
    opened = true;
    ui.setCounter('42 EGGS');
    showDialog({ text:'42 EGGS.\nYOU LOSE.', buttons:[{label:'OK',cls:'default',onClick(){ ui.setCounter('0 EGGS'); }}]});
  } else if(roll < 0.040){                            // 1%  first egg counts as 41
    c.firstEggIs41 = true;
  } else if(roll < 0.050){                            // 1%  eggman refuses first egg
    c._refuseFirst = true;
  }

  // ---- repeat-player nod (sparingly) --------------------------------------
  if(!opened && saveState.playCount >= 2 && chance(0.35)){
    setTimeout(() => showDialog({
      icon:false, text: pick(REPEAT_MESSAGES), buttons:[{label:'OK',cls:'default'}]
    }), 400);
  }

  activeController = {
    feedEgg(){
      if(c.done) return;
      c.feeds++; c.actualFed++;

      // refuse the very first egg once
      if(c._refuseFirst && c.feeds === 1){
        c._refuseFirst = false; c.feeds--; c.actualFed--;
        showDialog({ text: pick(['WRONG EGG.','NO.','EGG NOT FOUND.']), buttons:[{label:'OK',cls:'default'}]});
        return;
      }

      // first-egg-is-41 easter egg
      if(c.firstEggIs41 && c.feeds === 1){
        c.disp = 41; render(); return chaosWin(c);
      }

      // apply a (frequently wrong) egg value
      const v = weighted(EGG_VALUES);
      if(!chance(0.10)) c.disp += v;   // 10% of the time the egg simply doesn't change it
      if(c.disp < 0 && chance(0.5)) c.disp = 0;

      // occasionally the counter is text, not a number (this feed only)
      const textCounter = chance(0.06);
      render(textCounter);

      // curated system message, with breathing room
      if(c.feeds - c.lastMsgFeed >= 2 && chance(0.30)){
        c.lastMsgFeed = c.feeds;
        showDialog({ icon:false, text: pick(SYS_MESSAGES), buttons:[{label:'OK',cls:'default'}] });
      }

      // rare visual glitch
      if(chance(0.08)) glitch();

      // random run-out-of-eggs -> weird pack
      if(c.feeds >= 2 && chance(0.14)){
        return outOfEggsChaos(c);
      }

      // ---- win conditions ----
      const elapsed = (Date.now() - c.startT)/1000;
      if(c.disp >= 41) return chaosWin(c);
      if(c.disp === 6 && chance(0.20)) return chaosWin(c);      // exactly 6 wins
      if(v === -1 && chance(0.15)) return chaosWin(c);          // losing eggs wins
      if(chance(0.04)) return chaosWin(c);                       // random single-egg win
      if(c.feeds >= c.forceAt || elapsed > 110) return chaosWin(c); // never strand
    }
  };

  function render(textCounter){
    if(textCounter){ ui.setCounter('EGG'); return; }
    ui.setCounter(ui.eggsPlural(c.disp));
  }
}

function outOfEggsChaos(c){
  const packSize = weighted(PACKS);
  const doPack = (label) => {
    // resume: refill a few eggs (count is cosmetic)
    ui.fillBasket(4 + rand(3));
    feedingLocked = false;
    if(label) showToastDialog(label);
  };
  showDialog({
    icon:'!',
    text:'OUT OF EGGS.\n\nBUY ' + packSize + ' PACK OF EGGS?',
    buttons:[
      { label:'YES', cls:'default', onClick(){
        sound.pack();
        const yes = weighted([['80 EGGS.',5],['3 EGGS.',2],['160 EGGS.',1],['0 EGGS.',1]]);
        doPack(yes);
      }},
      { label:'NO', onClick(){
        const no = weighted([
          ['no-anyway',4], ['okay-anyway',3], ['again',2], ['lose',2]
        ]);
        if(no === 'no-anyway'){ doPack('80 EGGS.'); }
        else if(no === 'okay-anyway'){ doPack('OKAY.'); }
        else if(no === 'lose'){ c.disp -= 1; ui.setCounter(ui.eggsPlural(c.disp)); doPack(null); }
        else { /* dialog immediately appears again */ outOfEggsChaos(c); }
      }}
    ]
  });
  feedingLocked = true;
}
function showToastDialog(text){
  // a brief acknowledgement styled as a system message
  showDialog({ icon:false, text, buttons:[{label:'OK',cls:'default'}] });
}

function chaosWin(c){
  if(c.done) return;
  c.done = true;
  feedingLocked = true;
  ui.setCounter('41 EGGS');          // the number may disagree; the game insists
  ui.setTitle('EGG');
  sound.win();
  setTimeout(() => {
    showDialog({ icon:false, text:'YOU WIN', buttons:[{label:'OK',cls:'default',onClick(){ chaosEnding(c); }}]});
  }, 500);
}

function chaosEnding(c){
  nudeEgg(() => {
    // occasionally reuse the porn line; sometimes a small birthday nod;
    // but NOT the full first-birthday reveal.
    let text = pick(END_MESSAGES);
    if(chance(0.18)){
      text = 'YOU WON A NUDE EGG.\n\nYOU SHOULD BE ABLE TO LOOK AT\nA LITTLE PORN AT WORK.';
    } else if(chance(0.15)){
      text = 'EGGMAN REMEMBERS YOUR BIRTHDAY,\n' + birthdayConfig.sisterName + '.';
    }
    showDialog({
      icon:false,
      text,
      buttons:[{ label:'PLAY AGAIN', cls:'default', onClick(){
        saveState.playCount += 1;
        persist();
        startChaos();
      }}]
    });
  });
}

/* ==========================================================================
   VISUAL GLITCHES (rare)
   ========================================================================== */
function glitch(){
  const g = pick([
    'eye','shift','mouth','basket','title-egg','title-swap','backward',
    'giant','tiny','legs','roll','refuse','square','behind'
  ]);
  switch(g){
    case 'eye':
      (chance(0.5)?dom.egEyeL:dom.egEyeR).classList.add('big');
      setTimeout(()=>{ dom.egEyeL.classList.remove('big'); dom.egEyeR.classList.remove('big'); }, 3000);
      break;
    case 'shift':
      dom.eggman.classList.add('shift');
      setTimeout(()=>dom.eggman.classList.remove('shift'), 2500);
      break;
    case 'mouth':
      dom.egMouth.classList.add('huge');
      setTimeout(()=>dom.egMouth.classList.remove('huge'), 2500);
      break;
    case 'basket':
      dom.basketArea.classList.toggle(chance(0.5)?'left':'right');
      break;
    case 'title-egg':
      ui.setTitle('FEED EGG');
      setTimeout(()=>ui.setTitle('FEED EGGS'), 2500);
      break;
    case 'title-swap':
      ui.setTitle('EGGS FEED');
      setTimeout(()=>ui.setTitle('FEED EGGS'), 2500);
      break;
    case 'backward':
      setShown(dom.egFront, false); setShown(dom.egBack, true);
      setTimeout(()=>{ setShown(dom.egBack, false); setShown(dom.egFront, true); }, 900);
      break;
    case 'giant': ui.addEgg({big:true}); break;
    case 'tiny':  ui.addEgg({tiny:true}); break;
    case 'legs':  ui.addEgg({legs:true}); break;
    case 'square':ui.addEgg({square:true}); break;
    case 'refuse':ui.addEgg({refuseOnce:true}); break;
    case 'roll': {
      const e = ui.addEgg({});
      e.classList.add('rolling');
      setTimeout(()=>e.remove(), 950);
      break;
    }
    case 'behind':
      showDialog({ icon:false, text: pick(SYS_MESSAGES), behind:true, buttons:[{label:'OK',cls:'default'}] });
      break;
  }
}

/* ==========================================================================
   BOOT  — always ensure at least one egg is available to feed
   ========================================================================== */
function ensureEggs(){
  // if the basket somehow empties mid-feed (and we're not in a dialog),
  // top it back up so the player is never stranded without an egg.
  if(!feedingLocked && dialogStack.length === 0 && ui.eggCount() === 0 && activeController){
    ui.addEgg({});
  }
}
setInterval(ensureEggs, 700);

/* prevent long-press selection / context menu on the play area */
dom.stage.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('dragstart', e => e.preventDefault());

/* keep confetti canvas sized */
window.addEventListener('resize', () => {
  if(confettiRAF){ dom.confetti.width = innerWidth; dom.confetti.height = innerHeight; }
});

/* GO: first ever run is the birthday playthrough; after that, chaos. */
function boot(){
  if(saveState.canonicalCompleted){ startChaos(); }
  else { startCanonical(); }
}
boot();

/* dev hook so you can inspect / drive it from the console */
window.EGG = {
  get saveState(){ return saveState; },
  reset(){ localStorage.removeItem(SAVE_KEY); location.reload(); },
  canonical(){ localStorage.removeItem(SAVE_KEY); location.reload(); },
  chaos(){ saveState.canonicalCompleted = true; persist(); startChaos(); },
  feed(){ if(activeController && !feedingLocked) activeController.feedEgg(); },   // simulate one fed egg
  counter(){ return dom.counter.textContent; },
  title(){ return dom.feedTitle.textContent; },
  dialog(){ const d = dialogStack[dialogStack.length-1]; return d ? d.querySelector('.dlg-text').textContent : null; },
  press(label){ const btns=[...document.querySelectorAll('.dialog button')];
    const b = label ? btns.find(x=>x.textContent===label) : btns[btns.length-1]; if(b) b.click(); return !!b; },
  locked(){ return feedingLocked; }
};

/* service worker (offline / installable) — optional, non-fatal if it fails */
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  });
}
