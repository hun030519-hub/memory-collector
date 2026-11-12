/* Memory Collector — standalone, dependency-free browser rhythm demo.
   All sounds are generated with Web Audio; no copyrighted music is used. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const canvas = $('#game-canvas');
  const c = canvas.getContext('2d');
  const W = 960, H = 540;
  const STEP = 750, START = 3000, TOTAL_NOTES = 14, WINDOW = 245, PERFECT_WINDOW = 105;
  const STORAGE_KEY = 'memory-collector-demo-v1';
  const STAGES = {
    dog: {id:'dog',num:'MEMORY 01',title:'퇴근길 댕댕이의 마중',short:'댕댕이의 마중',icon:'🐶',description:'발걸음과 짖는 소리에 맞춰 탭! 마지막은 길게 눌러 강아지를 안아 주세요.',color:'#efbe89'},
    rain: {id:'rain',num:'MEMORY 02',title:'빗속의 댄스',short:'빗속의 댄스',icon:'🌧️',description:'빗방울과 발걸음에 맞춰 화면을 톡! 터치해 보세요.',color:'#9cb5e6'},
    popcorn: {id:'popcorn',num:'MEMORY 03',title:'톡! 톡! 팝콘 데이트',short:'팝콘 데이트',icon:'🍿',description:'팝콘이 톡톡 튀는 박자에 맞춰 탭! 첫 데이트의 설렘을 다시 느껴 보세요.',color:'#d392ad'}
  };
  let selected = STAGES.rain;
  let phase = 'idle', run = null, animationId = 0, lastDrawAt = performance.now(), currentInput = false;
  let muted = false, ac = null, records = loadRecords();
  let particles = [], judgementUntil = 0, expression = '', flash = 0, lastFilter = -1;
  const overlay = $('#game-overlay'), overlayContent = $('#overlay-content');
  const cue = $('#cue'), cueRing = $('#cue-ring'), cueLabel = $('#cue-label'), cueIcon = $('#cue-icon');
  const holdFill = $('#hold-fill');
  const liveFeedback = $('#live-feedback'), judgeText = $('#judge-text');
  const soundBtn = $('#sound-btn'), pauseBtn = $('#pause-btn');

  function loadRecords() { try { const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
  function saveRecords() { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(records)); } catch {} }
  function renderRecords() {
    const passed = Object.values(STAGES).filter(s => records[s.id]?.cleared);
    $('#album-count').textContent = `${passed.length} / 3`;
    $('#album-chips').innerHTML = passed.length ? passed.map(s=>`<span class="album-chip">${s.icon} ${s.short}</span>`).join('') : '<span>아직 모은 기억이 없어요 ♡</span>';
    $$('.stage-option').forEach(btn => {const id=btn.dataset.stage; const active=id===selected.id; btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));btn.querySelector('.stage-check').textContent=records[id]?.cleared?'✓':'○';});
  }
  function setStage(id) {
    if (!STAGES[id]) return;
    if (phase==='playing'||phase==='countdown') stopAudio();
    phase='idle';run=null;particles=[];selected=STAGES[id];currentInput=false;flash=0;
    $('#hud-stage-label').textContent=selected.num; $('#hud-stage-title').textContent=selected.title;
    $('#hud-combo').textContent='0';$('#progress-fill').style.width='0%';
    $('#judge-text').classList.remove('visible'); liveFeedback.textContent='시작 버튼을 눌러 주세요';
    pauseBtn.disabled=true;cue.style.opacity='0';
    showOverlay(`<span class="overlay-eyebrow">READY TO REMEMBER?</span><div class="overlay-emoji">${selected.icon}</div><h3>${selected.title}</h3><p>${selected.description}</p><button type="button" id="start-game" class="button button-primary">▶ &nbsp;체험 시작하기</button><small>PC SPACE · 모바일 화면 터치 · 약 15초</small>`);
    $('#start-game').addEventListener('click',startGame);
    renderRecords();draw(performance.now());
  }
  function showOverlay(markup) {overlayContent.innerHTML=markup;overlay.hidden=false;}
  function hideOverlay() {overlay.hidden=true;}
  function soundContext() { if (!ac) try{ac=new (window.AudioContext||window.webkitAudioContext)();}catch{};if(ac?.state==='suspended')ac.resume().catch(()=>{}); }
  function playTone(freq,duration=.11,shape='sine',volume=.035) {
    if(muted||!ac||ac.state!=='running')return;
    try{
      const t=ac.currentTime,osc=ac.createOscillator(),gain=ac.createGain();
      osc.type=shape;osc.frequency.setValueAtTime(freq,t);
      gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),t+.012);
      gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
      osc.connect(gain);gain.connect(ac.destination);osc.start(t);osc.stop(t+duration+.01);
    }catch{}
  }
  function stopAudio(){currentInput=false;}
  function beatSound(beat){const scale = selected.id==='rain'?[392,440,523,440]:selected.id==='dog'?[329.63,392,440,392]:[440,523.25,659.25,523.25];playTone(scale[beat%scale.length],.13,'sine',.033);if(beat%2===0)playTone(130,.10,'triangle',.025);}
  function soundHit(kind){if(kind==='Perfect'){playTone(784,.11,'sine',.060);playTone(1046,.18,'sine',.022);}else if(kind==='Good')playTone(590,.09,'sine',.048);else playTone(225,.14,'triangle',.029);}
  function startGame(){
    soundContext();
    phase='countdown';const now=performance.now();
    run={started:now,pausedAt:0,pauseTotal:0,score:0,combo:0,maxCombo:0,perfect:0,good:0,miss:0,success:0,beatsPlayed:-1,events:Array.from({length:TOTAL_NOTES},(_,i)=>({ms:START+i*STEP,type:selected.id==='dog'&&i===TOTAL_NOTES-1?'hold':'tap',judged:false})),hold:null,over:false};
    particles=[];flash=0;cue.style.opacity='0';$('#hud-combo').textContent='0';$('#progress-fill').style.width='0%';
    judgementUntil=0;judgeText.classList.remove('visible');pauseBtn.disabled=false;pauseBtn.textContent='Ⅱ 일시정지';hideOverlay();
    liveFeedback.textContent='3 · 2 · 1 · 시작!';
    if(!animationId)animationId=requestAnimationFrame(loop);
  }
  function getTime(now){return run?now-run.started-run.pauseTotal:0;}
  function nextEvent(){return run?.events.find(e=>!e.judged)||null;}
  function beginInput(){
    if((phase!=='playing'&&phase!=='countdown')||!run||currentInput)return;
    currentInput=true;const now=performance.now(),t=getTime(now),ev=nextEvent();
    if(!ev)return;
    if(t<START-350){flashLabel('조금만 더 기다려요',650);return;}
    const err=t-ev.ms;
    if(err< -WINDOW){flashLabel('원을 기다려 주세요!',650);return;}
    if(err>WINDOW)return;
    if(ev.type==='hold') {run.hold={event:ev,start:t,quality:Math.abs(err)<=PERFECT_WINDOW?'Perfect':'Good'};flashLabel('길게 누르세요! ♡',600);cue.classList.add('is-hold');return;}
    register(ev,Math.abs(err)<=PERFECT_WINDOW?'Perfect':'Good');
  }
  function endInput(){
    currentInput=false;
    if(!run?.hold)return;
    const hold=run.hold;run.hold=null;
    if(hold.event.judged)return;
    const held=getTime(performance.now())-hold.start;
    if(held>=580) register(hold.event,held>=850?hold.quality:'Good');
    else register(hold.event,'Miss');
  }
  function register(ev,quality){
    if(!run||ev.judged)return;
    ev.judged=true;
    if(quality==='Perfect'){run.perfect++;run.success++;run.combo++;run.score+=100;}
    else if(quality==='Good'){run.good++;run.success++;run.combo++;run.score+=60;}
    else{run.miss++;run.combo=0;}
    run.maxCombo=Math.max(run.maxCombo,run.combo);
    $('#hud-combo').textContent=String(run.combo);$('#progress-fill').style.width=(run.events.filter(e=>e.judged).length/TOTAL_NOTES*100)+'%';
    soundHit(quality);const shown=quality==='Perfect'?'PERFECT!':quality==='Good'?'GOOD!':'MISS';
    flashLabel(shown,490);liveFeedback.textContent=quality==='Miss'?'괜찮아요, 다음 박자에 도전!':quality==='Perfect'?'완벽한 박자! 기억이 빛나요 ✦':'좋아요! 색이 돌아오고 있어요 ♡';
    if(quality!=='Miss'){flash=1;spawnParticles();}
    cue.classList.remove('is-hold');holdFill.style.width='0%';
  }
  function flashLabel(txt,ms){expression=txt;judgementUntil=performance.now()+ms;judgeText.textContent=txt;judgeText.classList.add('visible');}
  function spawnParticles(){const x=selected.id==='rain'?510:selected.id==='dog'?570:490;const y=selected.id==='popcorn'?335:345;for(let i=0;i<16;i++){const a=Math.random()*Math.PI*2,sp=1+Math.random()*4;particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2,life:1,r:2+Math.random()*5,hue:i%3});}}
  function pauseGame(){if(phase!=='playing'&&phase!=='countdown')return;phase='paused';run.pausedAt=performance.now();currentInput=false;pauseBtn.textContent='▶ 계속하기';showOverlay(`<span class="overlay-eyebrow">TAKE YOUR TIME</span><div class="overlay-emoji">⏸️</div><h3>잠시 쉬어갈까요?</h3><p>행복한 기억은 도망가지 않아요.</p><button id="resume-game" type="button" class="button button-primary">▶ &nbsp;이어서 플레이</button><button id="leave-game" type="button" class="button button-ghost" style="margin-top:9px">스테이지 선택</button>`);$('#resume-game').onclick=resumeGame;$('#leave-game').onclick=()=>setStage(selected.id);}
  function resumeGame(){if(phase!=='paused')return;run.pauseTotal+=performance.now()-run.pausedAt;phase='playing';pauseBtn.textContent='Ⅱ 일시정지';hideOverlay();}
  function finishGame(){
    if(run?.over)return;run.over=true;phase='result';pauseBtn.disabled=true;cue.style.opacity='0';currentInput=false;
    const accuracy=Math.round(run.score/(TOTAL_NOTES*100)*100),clear=accuracy>=60;
    const rank=accuracy>=93?'S':accuracy>=82?'A':accuracy>=70?'B':accuracy>=60?'C':'D';
    if(clear){const older=records[selected.id];if(!older||!older.cleared||older.score<run.score){records[selected.id]={cleared:true,score:run.score,rank};saveRecords();}renderRecords();}
    liveFeedback.textContent=clear?'기억 수집 완료! ♡':'다시 도전하면 더 아름답게 복원할 수 있어요';
    const message=clear?'잊고 있던 행복한 순간이 다시 빛나고 있어요.':'조금만 더! 다음에는 기억의 색을 더 되찾아 봐요.';
    showOverlay(`<span class="overlay-eyebrow">${clear?'MEMORY RESTORED':'ONE MORE TRY?'}</span><div class="overlay-emoji">${clear?'💌':'🌱'}</div><h3>${clear?'기억을 수집했어요!':'조금만 더 해볼까요?'}</h3><div class="result-rank">${rank} RANK</div><p>${message}</p><div class="result-stats"><div><small>SCORE</small><strong>${run.score.toLocaleString()}</strong></div><div><small>PERFECT</small><strong>${run.perfect}</strong></div><div><small>GOOD / MISS</small><strong>${run.good} / ${run.miss}</strong></div></div><p style="margin:-2px auto 13px">달성률 ${accuracy}% · MAX COMBO ${run.maxCombo}</p><button id="again-game" type="button" class="button button-primary">↻ &nbsp;다시 플레이</button><button id="back-to-album" type="button" class="button button-ghost" style="margin-top:8px">기억 선택으로</button>`);
    $('#again-game').onclick=startGame;$('#back-to-album').onclick=()=>setStage(selected.id);
  }
  function loop(now){animationId=requestAnimationFrame(loop);const interval=(phase==='playing'||phase==='countdown')?55:130;if(now-lastDrawAt<interval)return;const dt=Math.min(95,now-lastDrawAt);lastDrawAt=now;
    if(run&&(phase==='countdown'||phase==='playing')){
      const t=getTime(now);if(t>=START&&phase==='countdown')phase='playing';
      const bi=Math.floor(t/STEP);if(bi>run.beatsPlayed){run.beatsPlayed=bi;beatSound(bi);}
      if(run.hold&&!run.hold.event.judged){const v=(t-run.hold.start)/900;holdFill.style.width=Math.min(100,Math.max(0,v*100))+'%';if(v>=1){register(run.hold.event,run.hold.quality);run.hold=null;}}
      for(const ev of run.events){if(!ev.judged&&!(run.hold&&run.hold.event===ev)&&t>ev.ms+WINDOW)register(ev,'Miss');}
      const pending=nextEvent();if(pending){const delta=pending.ms-t;const show=(delta<820&&delta> -WINDOW)||!!run.hold;cue.style.opacity=show?'1':'0';cueRing.style.transform=`scale(${Math.max(.94,1+Math.max(0,delta)/820*.7)})`;cueLabel.textContent=pending.type==='hold'?'HOLD':'TAP!';cueIcon.textContent=pending.type==='hold'?'♥':'♫';cue.classList.toggle('is-hold',pending.type==='hold');}else{cue.style.opacity='0';}
      if(t>START+(TOTAL_NOTES-1)*STEP+1100)finishGame();
    }
    if(now>judgementUntil)judgeText.classList.remove('visible');
    flash=Math.max(0,flash-dt/900);particles=particles.filter(p=>p.life>0);for(const p of particles){p.x+=p.vx*dt/16;p.y+=p.vy*dt/16;p.vy+=.025*dt/16;p.life-=dt/800;}
    draw(now);
  }

  /* Scene renderer — all visuals are original vector drawings on canvas. */
  function fillRound(x,y,w,h,r,color){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
  function rect(x,y,w,h,color){c.fillStyle=color;c.fillRect(x,y,w,h);}
  function ellipse(x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
  function line(points,color,width=3){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(points[0][0],points[0][1]);for(const p of points.slice(1))c.lineTo(p[0],p[1]);c.stroke();}
  function text(txt,x,y,size,color,align='center',weight='700'){c.fillStyle=color;c.font=`${weight} ${size}px system-ui, sans-serif`;c.textAlign=align;c.fillText(txt,x,y);}
  function star(x,y,r,color){c.save();c.translate(x,y);c.fillStyle=color;c.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4-Math.PI/2,rr=i%2?r*.26:r;c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.closePath();c.fill();c.restore();}
  function gradient(y1,y2,c1,c2){const g=c.createLinearGradient(0,y1,0,y2);g.addColorStop(0,c1);g.addColorStop(1,c2);return g;}
  function cloud(x,y,s,color){ellipse(x,y,56*s,21*s,color);ellipse(x-25*s,y-12*s,27*s,25*s,color);ellipse(x+15*s,y-18*s,35*s,32*s,color);}
  function leaf(x,y,s,color){c.save();c.translate(x,y);c.rotate(-.4);ellipse(0,0,15*s,7*s,color);c.restore();}
  function character(x,y,s,coat='yellow',jump=0){
    c.save();c.translate(x,y-jump);c.scale(s,s);
    ellipse(0,94,61,14,'#3a547d24');
    line([[-25,38],[-32,78]],'#404767',14);line([[22,38],[29,76]],'#404767',14);
    ellipse(-34,80,22,11,'#f8e7b2');ellipse(31,80,22,11,'#f8e7b2');
    const color=coat==='yellow'?'#f6cc63':coat==='pink'?'#f1a1bb':'#b4a0e9';
    fillRound(-42,-37,84,86,24,color);line([[-34,-22],[-68,9]],color,17);line([[34,-22],[67,7]],color,17);
    ellipse(-68,11,12,12,'#f3c2a5');ellipse(67,10,12,12,'#f3c2a5');
    ellipse(0,-75,49,46,'#f7cfb6');ellipse(-43,-73,9,14,'#f0b9a4');ellipse(43,-73,9,14,'#f0b9a4');
    ellipse(0,-109,46,23,'#4c4662');ellipse(-30,-94,21,29,'#4c4662');ellipse(28,-94,20,28,'#4c4662');
    ellipse(-16,-76,4.4,6,'#39374f');ellipse(17,-76,4.4,6,'#39374f');
    ellipse(-31,-60,11,6,'#f6b1a9');ellipse(31,-60,11,6,'#f6b1a9');
    c.strokeStyle='#733d4c';c.lineWidth=3;c.beginPath();c.arc(0,-63,9,0,Math.PI);c.stroke();
    if(coat==='yellow'){c.strokeStyle='#f9e7a3';c.lineWidth=8;c.beginPath();c.arc(0,-94,50,Math.PI*1.06,Math.PI*1.93);c.stroke();}
    c.restore();
  }
  function dog(x,y,s,wiggle){c.save();c.translate(x,y);c.scale(s,s);c.rotate(Math.sin(wiggle)*.035);
    ellipse(5,39,75,18,'#584d6950');ellipse(0,-1,72,51,'#df995e');ellipse(43,-32,47,39,'#e7a366');
    ellipse(12,-60,19,35,'#ba7048');ellipse(77,-59,20,39,'#bb734c');
    ellipse(47,-23,31,26,'#f7e9ce');ellipse(28,-40,5,7,'#4e3c40');ellipse(65,-40,5,7,'#4e3c40');
    ellipse(48,-22,7,5,'#553f46');ellipse(13,26,18,13,'#fff0d7');ellipse(61,30,18,13,'#fff0d7');
    line([[-63,-12],[-90+Math.sin(wiggle)*13,-45]],'#cf8551',18);c.restore();}
  function drawRain(t,progress){
    rect(0,0,W,H,gradient(0,H,'#829ac8','#bdb7db'));
    ellipse(800,105,110,110,'#d7deec88');cloud(230,93,1.45,'#e0dff0bb');cloud(690,150,1,'#e3e8f6a8');
    c.fillStyle='#7289a9';for(let x=0;x<W;x+=110)fillRound(x,150+(x%4)*20,95,220,9,'#7184a6');
    rect(0,339,W,201,'#718aac');rect(0,372,W,168,gradient(370,540,'#8ea1c5','#7188b1'));
    for(let i=0;i<8;i++){const x=(i*149+25)%980;ellipse(x,410+i%3*35,93,9,'#b7e1ec82');}
    line([[109,358],[109,110]],'#465d84',13);ellipse(109,105,25,20,'#f6da9a');fillRound(84,107,50,8,3,'#53648c');
    for(let x of [35,890]){fillRound(x,298,52,102,12,'#667d9b');ellipse(x+27,302,46,28,'#5c8e96');ellipse(x+3,296,27,31,'#76a99e');}
    const bounce = phase==='playing'||phase==='countdown'?Math.sin(t/STEP*Math.PI*2)*8:0;
    character(515,326,.95,'yellow',Math.max(0,bounce));
    for(let i=0;i<55;i++){const x=(i*173+Math.floor(t*.15))%1040-40;const y=(i*79+Math.floor(t*.5))%610-30;line([[x,y],[x-9,y+18]],'#d8f2f4a3',2);}
    for(let i=0;i<8;i++){ellipse(i*153+40,472+((i*7)%3)*10,30,4,'#d3edfa5c');}
    if(progress>.20){const a=progress*.58;rect(0,0,W,H,`rgba(236,190,236,${a*.14})`);c.save();c.globalAlpha=progress;for(let i=0;i<5;i++)star(85+i*165,110+(i%3)*80,16,'#fff4b3');c.restore();}
  }
  function drawDog(t,progress){
    rect(0,0,W,H,gradient(0,H,'#b7a3c2','#edc2b6'));rect(0,360,960,180,'#ba88a0');
    rect(0,379,W,161,gradient(379,540,'#b794a5','#a47c92'));
    for(let i=0;i<8;i++)line([[0,389+i*23],[960,389+i*23]],'#e6bcc24c',2);
    fillRound(92,130,210,225,16,'#fff0d9');fillRound(113,151,168,184,9,'#a9b9d1');
    ellipse(195,218,61,62,'#ffe8b5');cloud(192,243,.57,'#edf0f2e0');line([[197,153],[197,335]],'#f7e8d4',6);
    fillRound(400,120,146,250,14,'#b1858a');fillRound(417,135,111,220,9,'#e2bbad');ellipse(504,252,5,5,'#f9e7b5');
    fillRound(690,284,217,104,25,'#8b749d');fillRound(718,259,165,64,23,'#a58bab');
    fillRound(725,240,30,48,10,'#977b9f');fillRound(843,240,30,48,10,'#977b9f');
    ellipse(510,415,255,40,'#eed8b1');
    character(345,310,.78,'pink',0);
    const joy=Math.min(1,progress*1.3);const dx=680-joy*108;
    dog(dx,385,.85,t*.009);
    ellipse(817,185,26,37,'#659087');line([[817,245],[817,330]],'#876a7a',8);for(const p of [[787,205],[844,190],[807,149],[842,232]])leaf(p[0],p[1],1.3,'#7b9e8b');
    c.save();c.globalAlpha=Math.max(0,.3+progress*.7);for(let i=0;i<6;i++)star(260+i*91,90+(i%3)*65,10,'#fff0c2');c.restore();
  }
  function drawPopcorn(t,progress){
    rect(0,0,W,H,gradient(0,H,'#55466f','#312a4e'));
    rect(0,0,W,175,'#75608a');ellipse(510,160,300,100,'#f7b6bb14');
    for(let row=0;row<3;row++)for(let i=0;i<9;i++){
      fillRound(i*115-5,125+row*83,91,80,24,row===2?'#7e4e72':'#6b426a');
      ellipse(i*115+38,135+row*83,48,22,'#99698570');
    }
    rect(0,452,W,88,'#3b304f');
    character(287,339,.78,'pink',0);character(665,339,.78,'purple',0);
    // snack bucket
    c.fillStyle='#fff3e0';c.beginPath();c.moveTo(397,331);c.lineTo(559,331);c.lineTo(531,484);c.lineTo(426,484);c.closePath();c.fill();
    for(let i=0;i<5;i++)line([[420+i*27,344],[435+i*22,469]],'#f4a0b0',12);
    for(let i=0;i<9;i++)ellipse(411+i*16,322+(i%3)*-9,13,13,'#fff2c2');
    for(let i=0;i<6;i++){const y=315-(Math.sin(t/320+i*1.9)+1)*53;const x=430+i*22+Math.sin(t/480+i)*13;ellipse(x,y,11,10,'#ffe4a5');}
    for(let i=0;i<8;i++){const x=380+i*38;const y=140+i%3*35;star(x,y,progress>0.35?15:10,progress>.4?'#ffe49e':'#d4acc5');}
    ellipse(280,410,135,28,'#bb6b9940');ellipse(660,415,135,28,'#bb6b9940');
  }
  function draw(now){
    const t=run?getTime(phase==='paused'?run.pausedAt:now):now;
    const progress=run?Math.min(1,run.success/TOTAL_NOTES):records[selected.id]?.cleared?.8:0;
    const filterStep=Math.round(progress*100);if(filterStep!==lastFilter){canvas.style.filter=`grayscale(${Math.round((1-progress)*76)}%)`;lastFilter=filterStep;}c.clearRect(0,0,W,H);
    if(selected.id==='rain')drawRain(t,progress);else if(selected.id==='dog')drawDog(t,progress);else drawPopcorn(t,progress);
    if(flash){rect(0,0,W,H,`rgba(255,235,204,${flash*.095})`);}
    for(const p of particles){c.globalAlpha=Math.max(0,p.life);star(p.x,p.y,p.r*2,['#fff0b4','#fca4c7','#f5ebff'][p.hue]);}c.globalAlpha=1;
    if(phase==='countdown'&&run){const left=Math.ceil((START-t)/STEP);if(left>0){text(String(left),W/2,230,98,'#fff5db','center','900');text('리듬에 맞춰 준비!',W/2,270,20,'#fff9ed');}}
    if(phase==='idle'){c.save();c.globalAlpha=.67;for(let i=0;i<4;i++)star(210+i*166,100+(i%2)*45,14,'#fff3cc');c.restore();}
  }
  // Controls and navigation
  $$('.stage-option').forEach(btn=>btn.addEventListener('click',()=>setStage(btn.dataset.stage)));
  $$('.memory-card').forEach(btn=>btn.addEventListener('click',()=>{setStage(btn.dataset.pick);$('#demo').scrollIntoView({behavior:'smooth'});}));
  pauseBtn.addEventListener('click',()=>phase==='paused'?resumeGame():pauseGame());
  soundBtn.addEventListener('click',()=>{muted=!muted;soundBtn.textContent=muted?'♪ 소리 꺼짐':'♫ 소리 켜짐';soundBtn.setAttribute('aria-label',muted?'사운드 켜기':'사운드 끄기');if(!muted)soundContext();});
  $('#reset-records').addEventListener('click',()=>{if(confirm('이 브라우저에 저장된 기억 수집 기록을 초기화할까요?')){records={};saveRecords();renderRecords();}});
  $('#game-canvas').addEventListener('pointerdown',e=>{e.preventDefault();beginInput();});
  $('#game-canvas').addEventListener('pointerup',endInput);
  $('#game-canvas').addEventListener('pointercancel',endInput);
  $('#game-canvas').addEventListener('pointerleave',endInput);
  $('#game-canvas').style.touchAction='none';
  window.addEventListener('keydown',e=>{
    if(e.code==='Space'&&!e.repeat&&(phase==='playing'||phase==='countdown')){e.preventDefault();beginInput();}
    if(e.code==='Escape'&&(phase==='playing'||phase==='countdown')){e.preventDefault();pauseGame();}
  });
  window.addEventListener('keyup',e=>{if(e.code==='Space')endInput();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&(phase==='playing'||phase==='countdown'))pauseGame();});
  window.addEventListener('blur',()=>{if(phase==='playing'||phase==='countdown')pauseGame();});
  const menuToggle=$('#menu-toggle'),mobileNav=$('#mobile-nav');
  menuToggle.addEventListener('click',()=>{const open=menuToggle.getAttribute('aria-expanded')==='true';menuToggle.setAttribute('aria-expanded',String(!open));mobileNav.hidden=open;});
  mobileNav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{mobileNav.hidden=true;menuToggle.setAttribute('aria-expanded','false');}));
  // Accessible results and persistent records are available without server-side storage.
  renderRecords();setStage('rain');animationId=requestAnimationFrame(loop);
})();
