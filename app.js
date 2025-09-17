(() => {
  'use strict';

  // State & persistence ------------------------------------------------------
  const LS_KEY = 'scheduler:data:v1';
  const LS_ACH = 'scheduler:achievedDays:v1';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** @typedef {{id:string,title:string,day:string,start:string,end:string,notes?:string,status:'pending'|'done'|'missed',createdAt:number,updatedAt:number,promptedOn?:string}} Task */
  /** @type {{tasks: Task[]}} */
  let state = { tasks: [] };
  /** @type {Set<string>} */
  let achievedDays = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tasks)) state.tasks = parsed.tasks;
    } catch (e) { state = { tasks: [] }; }
    try { achievedDays = new Set(JSON.parse(localStorage.getItem(LS_ACH)||'[]')); } catch(_) { achievedDays = new Set(); }
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
    catch (_) {}
  }
  function saveAch(){ try { localStorage.setItem(LS_ACH, JSON.stringify(Array.from(achievedDays))); } catch(_) {}
  }

  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

  // Utilities ----------------------------------------------------------------
  // Today's date in IST (Asia/Kolkata)
  const todayStr = () => {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const y = parts.find(p=>p.type==='year').value;
      const m = parts.find(p=>p.type==='month').value;
      const d = parts.find(p=>p.type==='day').value;
      return `${y}-${m}-${d}`;
    } catch (_) {
      return new Date().toISOString().slice(0,10);
    }
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  function timeToMs(dayStr, hm) {
    const [H,M] = hm.split(':').map(Number);
    const [y,m,d] = dayStr.split('-').map(Number);
    const dt = new Date(y, (m-1), d, H, M, 0, 0);
    return dt.getTime();
  }
  function msToTime(ms){ const d=new Date(ms); return pad2(d.getHours())+':'+pad2(d.getMinutes()); }
  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
  function dateToDay(dt){ return dt.getFullYear()+ '-' + pad2(dt.getMonth()+1) + '-' + pad2(dt.getDate()); }


  function isHourString(s){
    if (typeof s !== 'string' || s.length !== 5) return false;
    if (s[2] !== ':') return false;
    if (s.slice(3) !== '00') return false;
    const h = Number(s.slice(0,2));
    return Number.isFinite(h) && h >= 0 && h <= 23;
  }

  // Elements -----------------------------------------------------------------
  const elDay = $('#day');
  let selectedDay = null;
  const elForm = $('#task-form');
  const elTitle = $('#title');
  const elStart = $('#start');
  const elEnd = $('#end');
  const elNotes = $('#notes');
  const elTitleErr = $('#title-error');
  const elStartErr = $('#start-error');
  const elEndErr = $('#end-error');
  const elListAct = $('#task-list-active');
  const elListDone = $('#task-list-completed');
  const elEmptyAct = $('#empty-active');
  const elEmptyDone = $('#empty-completed');
  const elDayFriendly = $('#day-friendly');
  const btnClear = $('#btn-clear');
  const btnMarkAll = $('#mark-all-done');
  const btnFilterAll = $('#filter-all');
  const btnFilterActive = $('#filter-active');
  const btnFilterCompleted = $('#filter-completed');
  const ringFg = $('#ring-fg');
  const elProgNum = $('#progress-num');
  const elProgDen = $('#progress-den');
  const elAddCard = $('#add-card');
  // Calendar
  const elCalendar = $('#calendar');
  const elCalLabel = $('#cal-label');
  const btnCalPrev = $('#cal-prev');
  const btnCalNext = $('#cal-next');
  const btnCalToday = $('#cal-today');
  const selCalView = $('#cal-view');
  // History
  const elHistList = $('#history-list');
  const elHistEmpty = $('#history-empty');
  const elHistRange = $('#history-range');

  // Filter state
  let viewFilter = 'all'; // 'all' | 'active' | 'completed'

  // Toast & Dialog ------------------------------------------------------------
  const elToast = $('#toast');
  const elToastMsg = $('#toast-msg');
  const elToastA1 = $('#toast-act-1');
  const elToastA2 = $('#toast-act-2');
  let toastTimer = 0;
  function showToast(msg, actions = [], opts = {}){
    elToastMsg.textContent = msg;
    [elToastA1, elToastA2].forEach((b,i)=>{
      const a = actions[i];
      if (a) { b.hidden=false; b.textContent=a.label; b.onclick=() => { hideToast(); a.onClick?.(); }; }
      else { b.hidden=true; b.onclick=null; b.textContent=''; }
    });
    if (opts.center) elToast.classList.add('center'); else elToast.classList.remove('center');
    if (opts.task) elToast.classList.add('task'); else elToast.classList.remove('task');
    elToast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hideToast, 8000);
  }
  function hideToast(){ elToast.hidden = true; clearTimeout(toastTimer); try { stopChime(); } catch(_) {} }

  const elDialog = $('#dialog');
  const elDlgTitle = $('#dialog-title');
  const elDlgDesc = $('#dialog-desc');
  const btnDlgDone = $('#dlg-done');
  const btnDlgResched = $('#dlg-resched');
  const btnDlgSnooze = $('#dlg-snooze');
  const btnDlgCancel = $('#dlg-cancel');
  let activeDialogTaskId = null;
  let dialogLastFocus = null;
    function openDialogFor(task){
      const __today = todayStr();
      if (task.promptedOn === __today) return;
      task.promptedOn = __today; save();
      activeDialogTaskId = task.id;
    dialogLastFocus = document.activeElement;
    elDlgTitle.textContent = 'Task finished';
elDlgDesc.textContent = '"' + task.title + '" from ' + task.start + ' to ' + task.end + '. Did you achieve it?';
elDialog.hidden = false;
btnDlgDone.focus();
  }
  function closeDialog(){
    elDialog.hidden = true; activeDialogTaskId = null;
    dialogLastFocus?.focus(); dialogLastFocus=null;
  }

  // Notifications -------------------------------------------------------------
  const canSystemNotify = () => location.protocol.startsWith('http') && 'Notification' in window;
    // Long, gentle notification + toast
    let chime = { ctx: null, int: 0 };
    async function tryNotify(title, body){
      try {
        if (canSystemNotify()) {
          let perm = Notification.permission;
          if (perm === 'default') perm = await Notification.requestPermission();
          if (perm === 'granted') { new Notification(title, { body }); }
        }
      } catch(_){}
      // Always show in-app toast with Stop action and a 30s soft chime
      startChime(30000);
      showToast(body, [ {label:'Stop', onClick: stopChime}, {label:'Close', onClick: hideToast} ], { center:true, task:true });
  }
    function beep(){
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type='triangle'; o.frequency.value=880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime+0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.15);
        o.start(); o.stop(ctx.currentTime+0.16);
      } catch(_){}
    }
    function startChime(durationMs=30000){
      try {
        stopChime();
        chime.ctx = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = chime.ctx;
        const ping = () => {
          const t0 = ctx.currentTime;
          [523.25,659.25,783.99].forEach((f,i)=>{ // C5 E5 G5
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.type='sine'; o.frequency.value=f; o.connect(g); g.connect(ctx.destination);
            const s = t0 + i*0.02; const e = s + 0.8;
            g.gain.setValueAtTime(0.0005, s);
            g.gain.exponentialRampToValueAtTime(0.08, s+0.05);
            g.gain.exponentialRampToValueAtTime(0.0001, e);
            o.start(s); o.stop(e+0.02);
          });
        };
        ping();
        chime.int = window.setInterval(ping, 2000);
        window.setTimeout(stopChime, durationMs);
      } catch(_){}
    }
    function stopChime(){
      try { if (chime.int) { clearInterval(chime.int); chime.int=0; } chime.ctx?.close(); chime.ctx=null; } catch(_){ }
    }

  // Rendering ----------------------------------------------------------------
  let achShownDay = '';
  function render(){
    const day = selectedDay || todayStr();
    // Show today's tasks plus overdue pending tasks from past days
    const todays = state.tasks.filter(t => t.day === day);
    const overdueAct = state.tasks.filter(t => t.status==='pending' && t.day < day);
    const tasks = todays.sort((a,b)=> a.start.localeCompare(b.start));
    const act = tasks.filter(t=>t.status==='pending');
    // Include overdue pending into Active
    act.push(...overdueAct);
    const doneOrMissed = tasks.filter(t=>t.status!=='pending');
    elListAct.innerHTML = '';
    elListDone.innerHTML = '';
    elEmptyAct.hidden = act.length>0;
    elEmptyDone.hidden = doneOrMissed.length>0;

    if (viewFilter !== 'completed') for (const t of act){
      const li = document.createElement('li'); li.className = 'task'; li.dataset.id = t.id;
      li.classList.add(t.status==='done'?'is-done':t.status==='missed'?'is-missed':'is-pending');
      const time = document.createElement('div'); time.className='task-time'; time.textContent = t.start + ' - ' + t.end;


      const mid = document.createElement('div');
      const title = document.createElement('div'); title.className='task-title'; title.textContent = t.title;
      const notes = document.createElement('div'); notes.className='task-notes'; if (t.notes) { notes.textContent = t.notes; } else { notes.textContent=''; }
      mid.appendChild(title); if (t.notes) mid.appendChild(notes);
      li.append(time, mid);
      elListAct.appendChild(li);
    }

    if (viewFilter !== 'active') for (const t of doneOrMissed){
      const li = document.createElement('li'); li.className = 'task'; li.dataset.id = t.id;
      li.classList.add(t.status==='done'?'is-done':t.status==='missed'?'is-missed':'is-pending');
      const time = document.createElement('div'); time.className='task-time'; time.textContent = t.start + ' - ' + t.end;

      const mid = document.createElement('div');
      const title = document.createElement('div'); title.className='task-title'; title.textContent = t.title;
      const notes = document.createElement('div'); notes.className='task-notes'; if (t.notes) notes.textContent = t.notes;
      mid.appendChild(title); if (t.notes) mid.appendChild(notes);
      li.append(time, mid);
      elListDone.appendChild(li);
    }

    // Toggle sections per filter
    const subActive = document.getElementById('active-sub');
    const subCompleted = document.getElementById('completed-sub');
    if (subActive) subActive.hidden = (viewFilter === 'completed');
    if (subCompleted) subCompleted.hidden = (viewFilter === 'active');

    // Progress ring
    const total = todays.length; // today's planned tasks
    const done = todays.filter(t=>t.status==='done').length;
    // Show denom as the number of active tasks if any; otherwise today's planned count
    const activeCount = act.length;
    elProgNum.textContent = String(done);
    elProgDen.textContent = String(activeCount > 0 ? activeCount : total);
    const C = 2 * Math.PI * 52; // circumference (matches CSS dasharray)
    const pct = total? (done/total) : 0;
    ringFg.style.strokeDasharray = `${C}`;
    ringFg.style.strokeDashoffset = String(C * (1 - pct));
    // Ring background: amber if there are any tasks (today or overdue active), else light grey
    const anyActiveOrPlanned = total > 0 || overdueAct.length > 0;
    try { document.documentElement.style.setProperty('--ring-bg', anyActiveOrPlanned ? '#ffcc66' : '#e5e7eb'); } catch(_){ }
    // If no today tasks but there are overdue active, reflect count in denom to signal attention
    if (total === 0 && overdueAct.length > 0) {
      elProgNum.textContent = '0';
      elProgDen.textContent = String(overdueAct.length);
    }
    // Dynamic ring color (red -> yellow -> green)
    let color = getProgressColor(pct);
    ringFg.style.stroke = color;

    // Achievement
    if (total>0 && done===total) {
      if (achShownDay !== day && !(achievedDays && achievedDays.has(day))) { showAchievement(); celebrateAdd(); achShownDay = day; }
    } else { hideAchievement(); achShownDay = ''; }

    // Render history (past days)
    renderHistory();
  }

  function getProgressColor(pct){
    if (pct <= 0.001) return '#ff5d5d';
    if (pct < 0.66) return '#ffcc66';
    return '#3ccf91';
  }

  function celebrateAdd(){
    try{
      if (!elAddCard) return;
      elAddCard.classList.remove('add-celebrate');
      // restart animation
      void elAddCard.offsetWidth;
      elAddCard.classList.add('add-celebrate');
      setTimeout(()=> elAddCard.classList.remove('add-celebrate'), 1400);
    } catch(_){ }
  }

  // Friendly day banner ------------------------------------------------------
function updateDayBanner(){
    const day = selectedDay || todayStr();
    try {
      const [y,m,d] = day.split('-').map(Number);
      const dt = new Date(y, (m-1), d);
      const str = dt.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
      if (elDayFriendly) elDayFriendly.textContent = str;
    } catch(_){ if (elDayFriendly) elDayFriendly.textContent = day; }
  }

  // CRUD ---------------------------------------------------------------------
  function validateForm(day, title, start, end){
    const errors = { title:'', start:'', end:'', form:'' };
    if (!title || !title.trim()) errors.title = 'Please enter a task title.';
    const startOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(start);
    const endOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(end);
    if (!startOk) errors.start = 'Set a valid start time (HH:MM).';
    if (!endOk) errors.end = 'Set a valid end time (HH:MM).';
    if (startOk && endOk){
      const msS = timeToMs(day, start), msE = timeToMs(day, end);
      if (msE <= msS) { errors.end = 'End must be after start.'; }
    }
    return errors;
  }

  function addTask({title, day, start, end, notes}){
    title = (title||'').trim(); notes = (notes||'').trim();
    const errs = validateForm(day, title, start, end);
    setFieldErrors(errs);
    if (errs.title || errs.start || errs.end) return;
    const now = Date.now();
    const t = { id: uid(), title, day, start, end, notes, status: 'pending', createdAt: now, updatedAt: now };
    state.tasks.push(t);
    save();
    scheduleAll();
    render();
    elForm.reset();
  }

function editTask(id){
    const t = state.tasks.find(x=>x.id===id); if (!t) return;
    // Prefill form with task and focus title
    if (elDay) elDay.value = t.day;
    elTitle.value = t.title; elStart.value = t.start; elEnd.value = t.end; elNotes.value = t.notes||'';
    elTitle.focus();
    // Replace submit handler temporarily
    elForm.dataset.editing = id;
    showToast('Editing task. Save to apply.', [{label:'Cancel', onClick:()=>{ elForm.dataset.editing=''; elForm.reset(); }}]);
  }

  function updateTask(id, patch){
    const t = state.tasks.find(x=>x.id===id); if (!t) return;
    Object.assign(t, patch, {updatedAt: Date.now()});
    save();
    scheduleAll();
    render();
  }

  function markDone(id){ updateTask(id, {status:'done'}); }
  function markPending(id){ updateTask(id, {status:'pending'}); }
  function markMissed(id){ updateTask(id, {status:'missed'}); }
  function delTask(id){ state.tasks = state.tasks.filter(x=>x.id!==id); save(); scheduleAll(); render(); }

  function reschedTask(id){
    const t = state.tasks.find(x=>x.id===id); if (!t) return;
    // Quick inline reschedule: set start to next quarter hour from now, keep duration
    const now = new Date();
    const q = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), Math.ceil((now.getMinutes()+1)/15)*15, 0, 0);
    const dur = timeToMs(t.day, t.end) - timeToMs(t.day, t.start);
    const newDay = q.toISOString().slice(0,10);
    const newStart = msToTime(q.getTime());
    const newEnd = msToTime(q.getTime()+dur);
    updateTask(id, { day: newDay, start: newStart, end: newEnd, status:'pending' });
    showToast('Rescheduled to ' + newStart, [
      { label: 'Undo', onClick: ()=> updateTask(id, { day: t.day, start: t.start, end: t.end }) }
    ]);
  }

  // Scheduling ---------------------------------------------------------------
  /** @type {Record<string, number>} */
  const timers = {};
  function clearTimersFor(id){
    if (timers[id+':pre']) { clearTimeout(timers[id+':pre']); delete timers[id+':pre']; }
    if (timers[id+':end']) { clearTimeout(timers[id+':end']); delete timers[id+':end']; }
  }
  function scheduleForTask(t){
    clearTimersFor(t.id);
    if (t.status !== 'pending') return;

    const msStart = timeToMs(t.day, t.start);
    const msEnd = timeToMs(t.day, t.end);
    const preAt = msStart - 5*60*1000;
    const now = Date.now();

    // Pre-start reminder
    if (preAt > now) {
      timers[t.id+':pre'] = window.setTimeout(()=>{
          tryNotify('Upcoming task', t.title + ' starts at ' + t.start);
          // Offer snooze
          showToast(`Starts soon: ${t.title}`, [
            {label:'Snooze 5m', onClick:()=>{
              const target = Date.now()+5*60*1000;
              const delay = clamp(target-Date.now(), 0, 24*60*60*1000);
              timers[t.id+':pre'] && clearTimeout(timers[t.id+':pre']);
              timers[t.id+':pre'] = window.setTimeout(()=>tryNotify('Upcoming task', t.title + ' starts at ' + t.start), delay);
            }},
            {label:'Open', onClick:()=>document.querySelector(`[data-id='${t.id}']`)?.scrollIntoView({behavior:'smooth',block:'center'})}
          ], { center:true, task:true });
        }, preAt - now);
    } else if (now < msStart) {
      // If page opened within 5 minutes of start, notify immediately
      tryNotify('Upcoming task', t.title + ' starts at ' + t.start);
    }

    // End prompt
    if (msEnd > now) {
      timers[t.id+':end'] = window.setTimeout(()=>{
          // Notify and open dialog asking completion or reschedule once per day per task
          const today = todayStr();
          if (t.promptedOn !== today) {
            tryNotify('Task finished', `${t.title} finished at ${t.end}`);
            openDialogFor(t);
          }
        }, msEnd - now);
    } else if (t.status==='pending') {
        // Time already passed, notify now and ask (but only once per day)
        const today = todayStr();
        if (t.promptedOn !== today) {
          tryNotify('Task finished', `${t.title} finished at ${t.end}`);
          openDialogFor(t);
        }
    }
  }
  function scheduleAll(){
    // Clear all
    Object.keys(timers).forEach(k => { clearTimeout(timers[k]); delete timers[k]; });
    const day = selectedDay || todayStr();
    const pending = state.tasks.filter(t=>t.status==='pending' && t.day===day);
    pending.forEach(scheduleForTask);
  }

  // Achievement --------------------------------------------------------------
  const elAch = $('#achievement');
  const elConfetti = $('#confetti');
  const btnAchClose = $('#close-achievement');
  let confettiSpawned = false;
  function showAchievement(){
    const d = selectedDay || todayStr();
    if (achievedDays && achievedDays.has(d)) return;
    if (elAch.hidden) {
      elAch.hidden = false;
      if (achievedDays) achievedDays.add(d); saveAch();
      spawnConfetti();
    }
  }
  function hideAchievement(){ elAch.hidden = true; }
  function spawnConfetti(){
    if (confettiSpawned) return; confettiSpawned=true;
    elConfetti.innerHTML='';
    const colors = ['#5b7cfa','#7aa2ff','#3ccf91','#ffcc66','#ff7aa2','#ffd166'];
    const N = 120;
    for(let i=0;i<N;i++){
      const el = document.createElement('div'); el.className='confetti';
      el.style.left = Math.random()*100+'%';
      el.style.top = '-10vh';
      el.style.background = colors[i%colors.length];
      el.style.transform = `translateY(-10vh) rotate(${Math.random()*360}deg)`;
      el.style.animation = `fall ${2.5+Math.random()*2.5}s ease-in forwards`;
      el.style.animationDelay = `${Math.random()*0.8}s`;
      elConfetti.appendChild(el);
    }
    // Cleanup after 6s
    setTimeout(()=>{ elConfetti.innerHTML=''; confettiSpawned=false; }, 6000);
  }

  // Event handlers -----------------------------------------------------------
elForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const day = selectedDay || todayStr();
    const title = String(elTitle.value||'').slice(0,120);
    const start = String(elStart.value||'');
    const end = String(elEnd.value||'');
    const notes = String(elNotes.value||'').slice(0,300);

    const editing = elForm.dataset.editing || '';
    elTitleErr.textContent = '';
    elStartErr.textContent = '';
    elEndErr.textContent = '';
    if (editing) {
      const errs = validateForm(day, title, start, end); setFieldErrors(errs);
      if (errs.title || errs.start || errs.end) return;
      updateTask(editing, { title: title.trim(), day, start, end, notes });
      elForm.dataset.editing = '';
      elForm.reset();
      return;
    }
    addTask({ title, day, start, end, notes });
  });
  btnClear.addEventListener('click', () => { elForm.reset(); elTitleErr.textContent=''; elTitle.focus(); });
  if (elDay) elDay.addEventListener('change', () => { selectedDay = elDay.value || todayStr(); updateDayBanner(); render(); });

  btnMarkAll.addEventListener('click', () => {
    const day = selectedDay || todayStr();
    let changed = false;
    for (const t of state.tasks) if (t.day===day && t.status!=='done') { t.status='done'; t.updatedAt=Date.now(); changed=true; }
    if (changed) { save(); scheduleAll(); render(); }
  });
  function setFilter(next){
    viewFilter = next;
    if (btnFilterAll) btnFilterAll.classList.toggle('active', next==='all');
    if (btnFilterActive) btnFilterActive.classList.toggle('active', next==='active');
    if (btnFilterCompleted) btnFilterCompleted.classList.toggle('active', next==='completed');
    if (btnFilterAll) btnFilterAll.setAttribute('aria-pressed', String(next==='all'));
    if (btnFilterActive) btnFilterActive.setAttribute('aria-pressed', String(next==='active'));
    if (btnFilterCompleted) btnFilterCompleted.setAttribute('aria-pressed', String(next==='completed'));
    render();
  }
  if (btnFilterAll) btnFilterAll.addEventListener('click', ()=> setFilter('all'));
  if (btnFilterActive) btnFilterActive.addEventListener('click', ()=> setFilter('active'));
  if (btnFilterCompleted) btnFilterCompleted.addEventListener('click', ()=> setFilter('completed'));
  // No clear-day per request

  // Dialog actions
  btnDlgDone.addEventListener('click', () => { if (activeDialogTaskId) markDone(activeDialogTaskId); closeDialog(); });
    btnDlgResched.addEventListener('click', () => { if (activeDialogTaskId) promptReschedule(activeDialogTaskId); closeDialog(); });
  btnDlgSnooze.addEventListener('click', () => {
    if (!activeDialogTaskId) return; const t = state.tasks.find(x=>x.id===activeDialogTaskId); if (!t) return;
    const delay = 10*60*1000; // 10 minutes
    showToast('Snoozed for 10 minutes');
    setTimeout(()=> openDialogFor(t), delay);
    closeDialog();
  });
  btnDlgCancel.addEventListener('click', () => closeDialog());
  elDialog.addEventListener('click', (e) => { if (e.target === elDialog) closeDialog(); });
  if (btnAchClose) btnAchClose.addEventListener('click', () => hideAchievement());
  if (elAch) elAch.addEventListener('click', (e)=>{ if (e.target === elAch) hideAchievement(); });

  // Keyboard: Escape closes dialog or toast
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!elDialog.hidden) closeDialog(); else if (!elToast.hidden) hideToast(); }
  });

  // Init ---------------------------------------------------------------------
  function initDay(){
    selectedDay = todayStr();
    if (elDay) elDay.value = selectedDay;
  }

  load();
  initDay();
  selectedDay = elDay?.value || todayStr();
  updateDayBanner();
  render();
  scheduleAll();
  // Review any overdue tasks from previous days once per day
  try { (function(){ const today = todayStr(); const first = state.tasks.find(t=> t.status==='pending' && t.day < today && t.promptedOn !== today); if (first) openDialogFor(first); })(); } catch(_){ }

  // Periodic refresh to keep time-relative UI fresh
  setInterval(()=>{
    // If any pending task crossed end time while page is open without timer firing, catch up
    const now = Date.now();
    const day = selectedDay || todayStr();
    for (const t of state.tasks) {
      if (t.day!==day) continue;
      if (t.status==='pending' && now >= timeToMs(t.day, t.end)) {
        openDialogFor(t);
      }
    }
  }, 30000);

  // Calendar rendering -------------------------------------------------------
  let calView = (selCalView?.value) || 'month';
  let calAnchor = dayToDate(selectedDay || todayStr());

  function startOfWeek(d){
    // Monday as start of week
    const day = d.getDay(); // 0 Sun .. 6 Sat
    const diff = (day === 0 ? -6 : 1) - day; // move back to Monday
    const nd = new Date(d); nd.setDate(d.getDate() + diff); nd.setHours(0,0,0,0); return nd;
  }
  function renderCalendar(){
    if (!elCalendar) return;
    calView = selCalView?.value || calView || 'month';
    const sel = selectedDay || todayStr();
    const today = todayStr();
    const label = (()=>{
      if (calView==='year') return String(calAnchor.getFullYear());
      if (calView==='week') {
        const s = startOfWeek(calAnchor);
        const e = new Date(s); e.setDate(s.getDate()+6);
        const fmt = (dt)=> dt.toLocaleDateString(undefined, { month:'short', day:'numeric' });
        return `Week of ${fmt(s)} – ${fmt(e)} ${e.getFullYear()}`;
      }
      return calAnchor.toLocaleDateString(undefined, { month:'long', year:'numeric' });
    })();
    if (elCalLabel) elCalLabel.textContent = label;

    elCalendar.innerHTML='';
    if (calView==='year') return renderYear();
    if (calView==='week') return renderWeek();
    return renderMonth();
  }

  function renderMonth(){
    const y = calAnchor.getFullYear();
    const m = calAnchor.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m+1, 0);
    const startIdx = (first.getDay()+6)%7 + 1; // Monday=1..Sunday=7
    const totalCells = Math.ceil((startIdx-1 + last.getDate())/7)*7;
    const wrap = document.createElement('div'); wrap.className='cal-month';
    const daysRow = document.createElement('div'); daysRow.className='cal-month';
    // Weekday headers (Mon..Sun)
    const names = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const head = document.createElement('div'); head.className='cal-month'; head.style.marginBottom='6px';
    for(const n of names){ const d=document.createElement('div'); d.className='cal-weekday'; d.textContent=n; head.appendChild(d); }
    elCalendar.appendChild(head);
    const grid = document.createElement('div'); grid.className='cal-grid';
    for(let i=0;i<totalCells;i++){
      const idx = i - (startIdx-1) + 1; // day number for current month
      let dt = new Date(y, m, idx);
      let outside = false;
      if (idx < 1){ dt = new Date(y, m, idx); outside = true; }
      else if (idx > last.getDate()){ dt = new Date(y, m, idx); outside = true; }
      const dayStr = dateToDay(dt);
      const btn = document.createElement('button'); btn.type='button'; btn.className='cal-cell'; btn.setAttribute('data-day', dayStr);
      if (outside) btn.classList.add('is-outside');
      if (dayStr === todayStr()) btn.classList.add('is-today');
      if (dayStr === (selectedDay||'')) btn.classList.add('is-selected');
      const hasTasks = state.tasks.some(t=>t.day===dayStr);
      if (hasTasks) btn.classList.add('has-tasks');
      const num = document.createElement('div'); num.className='cal-num'; num.textContent= String(dt.getDate()); btn.appendChild(num);
      btn.addEventListener('click', ()=>{ selectedDay = dayStr; calAnchor = dt; updateDayBanner(); render(); renderCalendar(); });
      grid.appendChild(btn);
    }
    elCalendar.appendChild(grid);
  }

  function renderWeek(){
    const start = startOfWeek(calAnchor);
    const grid = document.createElement('div'); grid.className='cal-week';
    for(let i=0;i<7;i++){
      const dt = new Date(start); dt.setDate(start.getDate()+i);
      const dayStr = dateToDay(dt);
      const btn = document.createElement('button'); btn.type='button'; btn.className='cal-day'; btn.setAttribute('data-day', dayStr);
      if (dayStr === todayStr()) btn.classList.add('is-today');
      if (dayStr === (selectedDay||'')) btn.classList.add('is-selected');
      const label = dt.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
      btn.textContent = label;
      btn.addEventListener('click', ()=>{ selectedDay = dayStr; calAnchor = dt; updateDayBanner(); render(); renderCalendar(); });
      grid.appendChild(btn);
    }
    elCalendar.appendChild(grid);
  }

  function renderYear(){
    const grid = document.createElement('div'); grid.className='cal-year';
    for(let i=0;i<12;i++){
      const dt = new Date(calAnchor.getFullYear(), i, 1);
      const btn = document.createElement('button'); btn.type='button'; btn.className='cal-month-btn';
      btn.textContent = dt.toLocaleDateString(undefined, { month:'long' });
      btn.addEventListener('click', ()=>{ calAnchor = dt; if (selCalView) selCalView.value='month'; calView='month'; renderCalendar(); });
      grid.appendChild(btn);
    }
    elCalendar.appendChild(grid);
  }

  function shiftAnchor(dir){
    const d = new Date(calAnchor);
    if (calView==='year') d.setFullYear(d.getFullYear()+dir);
    else if (calView==='week') d.setDate(d.getDate()+7*dir);
    else d.setMonth(d.getMonth()+dir);
    calAnchor = d; renderCalendar();
  }

  if (btnCalPrev) btnCalPrev.addEventListener('click', ()=> shiftAnchor(-1));
  if (btnCalNext) btnCalNext.addEventListener('click', ()=> shiftAnchor(1));
  if (btnCalToday) btnCalToday.addEventListener('click', ()=>{ const now = new Date(); calAnchor = now; selectedDay = todayStr(); updateDayBanner(); render(); renderCalendar(); });
  if (selCalView) selCalView.addEventListener('change', ()=>{ calView = selCalView.value; renderCalendar(); });

  // Initial calendar paint
  renderCalendar();

  // Simple kebab menu management --------------------------------------------
  let openMenuEl = null; let openMenuBtn = null;
    function closeMenu(menu, btn){ if (!menu) return; menu.hidden = true; menu.style.position=''; menu.style.left=''; menu.style.top=''; menu.style.zIndex=''; btn?.setAttribute('aria-expanded','false'); if (openMenuEl===menu) { openMenuEl=null; openMenuBtn=null; } }
    function openMenu(menu, btn){
      if (openMenuEl && openMenuEl!==menu) closeMenu(openMenuEl, openMenuBtn);
      // Make it measurable off-screen
      menu.hidden=false; menu.style.visibility='hidden'; menu.classList.remove('open-up');
      // Position as fixed overlay centered on the button horizontally
      try {
        const br = btn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.zIndex = '100000';
        const mw = menu.offsetWidth || 180;
        const mh = menu.offsetHeight || 160;
        let left = Math.min(Math.max(16, br.left + br.width - mw), window.innerWidth - mw - 16);
        let top = br.bottom + 8;
        if (window.innerHeight - br.bottom < mh + 16) { top = br.top - mh - 8; menu.classList.add('open-up'); }
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
      } catch(_){ }
      menu.style.visibility='visible';
      btn?.setAttribute('aria-expanded','true'); openMenuEl = menu; openMenuBtn = btn;
    }
  function toggleMenu(menu, btn){ if (menu.hidden) openMenu(menu, btn); else closeMenu(menu, btn); }
      document.addEventListener('click', (e)=>{
        const t = e.target;
        if (t && t.classList && t.classList.contains('more-btn')) {
          const wrap = t.parentElement; const menu = wrap.querySelector('.menu');
          if (openMenuEl === menu) closeMenu(menu, t); else openMenu(menu, t);
          e.stopPropagation();
        } else if (openMenuEl && !openMenuEl.contains(t) && !openMenuBtn?.contains(t)) {
          closeMenu(openMenuEl, openMenuBtn);
        }
      });
    document.addEventListener('keydown', (e)=>{ if (e.key==='Escape' && openMenuEl) { closeMenu(openMenuEl, openMenuBtn); } });
    function adjustMenuDirection(menu, btn){ try{ const r = menu.getBoundingClientRect(); const vb = window.innerHeight; const spaceBelow = vb - (btn.getBoundingClientRect().bottom); if (spaceBelow < r.height + 16) { menu.classList.add('open-up'); } else { menu.classList.remove('open-up'); } }catch(_){ } }

    function setFieldErrors(errs){
      if (elTitleErr) elTitleErr.textContent = errs.title || '';
      if (elStartErr) elStartErr.textContent = errs.start || '';
      if (elEndErr) elEndErr.textContent = errs.end || '';
    }

    // Prompt dialog for Reopen / Reschedule ----------------------------------
    const elPrompt = document.getElementById('prompt');
    const elPromptTitle = document.getElementById('prompt-title');
    const elPromptBody = document.getElementById('prompt-body');
    const btnPromptOk = document.getElementById('prompt-confirm');
    const btnPromptCancel = document.getElementById('prompt-cancel');
    function openPrompt(title, bodyEl, onConfirm){
      if (!elPrompt) { onConfirm?.(); return; }
      elPromptTitle.textContent = title; elPromptBody.innerHTML=''; elPromptBody.appendChild(bodyEl);
      elPrompt.hidden = false; btnPromptOk.focus();
      btnPromptOk.onclick = () => { try { onConfirm?.(); } finally { elPrompt.hidden = true; btnPromptOk.onclick = btnPromptCancel.onclick = null; } };
      btnPromptCancel.onclick = () => { elPrompt.hidden = true; btnPromptOk.onclick = btnPromptCancel.onclick = null; };
    }
    function promptReopen(id){
      const t = state.tasks.find(x=>x.id===id); if (!t) return;
      const div = document.createElement('div'); div.textContent = `Reopen "${t.title}"?`;
      openPrompt('Reopen task', div, ()=> markPending(id));
    }
    function promptReschedule(id){
      const t = state.tasks.find(x=>x.id===id); if (!t) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = `<label class="label">Start</label><input type="time" id="pr-start" value="${t.start}">`+
                       `<label class="label" style="margin-top:8px">End</label><input type="time" id="pr-end" value="${t.end}">`;
      openPrompt('Reschedule task', wrap, ()=>{
        const start = /** @type {HTMLInputElement} */(wrap.querySelector('#pr-start')).value;
        const end = /** @type {HTMLInputElement} */(wrap.querySelector('#pr-end')).value;
        const errs = validateForm(t.day, t.title, start, end);
        if (errs.start || errs.end) { showToast(errs.start || errs.end); return; }
        updateTask(id, { start, end, status:'pending' });
      });
    }

  // History rendering --------------------------------------------------------
  function renderHistory(){
    if (!elHistList) return;
    const today = todayStr();
    const rangeVal = elHistRange?.value || '7';
    const now = new Date();
    const cutoffDays = rangeVal==='all' ? Infinity : Number(rangeVal)||7;
    // Group tasks by day for days before today
    const tasksByDay = new Map();
    for (const t of state.tasks){
      if (t.day >= today) continue; // only strictly past
      if (t.status === 'pending') continue; // keep overdue pending in Active, not in history
      const [y,m,d] = t.day.split('-').map(Number);
      const dt = new Date(y,(m-1),d);
      const diffDays = Math.floor((now - dt)/86400000);
      if (diffDays < 0 || diffDays > cutoffDays) continue;
      if (!tasksByDay.has(t.day)) tasksByDay.set(t.day, []);
      tasksByDay.get(t.day).push(t);
    }
    // Sort days descending
    const days = Array.from(tasksByDay.keys()).sort((a,b)=> b.localeCompare(a));
    elHistList.innerHTML = '';
    if (!days.length){ elHistEmpty.hidden = false; return; } else { elHistEmpty.hidden = true; }
    for (const day of days){
      const wrap = document.createElement('div'); wrap.className='hist-day';
      const title = document.createElement('div'); title.className='hist-day-title';
      const dt = dayToDate(day);
      const friendly = dt.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' });
      const items = tasksByDay.get(day).sort((a,b)=> a.start.localeCompare(b.start));
      const counts = { total: items.length, done: items.filter(x=>x.status==='done').length };
      title.innerHTML = `<span>${friendly}</span><span>${counts.done}/${counts.total}</span>`;
      const list = document.createElement('ul'); list.className='hist-list'; list.setAttribute('role','list');
      for (const t of items){
        const li = document.createElement('li'); li.className='hist-item';
        li.style.setProperty('--dot', t.status==='done'?'#3ccf91': t.status==='missed'?'#ff5d5d':'#ffcc66');
        li.innerHTML = `<div class="task-time">${t.start} - ${t.end}</div><div class="task-title">${escapeText(t.title)}</div>`;
        list.appendChild(li);
      }
      wrap.append(title, list);
      elHistList.appendChild(wrap);
    }
  }

  function dayToDate(day){ const [y,m,d] = day.split('-').map(Number); return new Date(y,(m-1),d); }
  function escapeText(s){ return String(s).replace(/[&<>"']/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch])); }
  if (elHistRange) elHistRange.addEventListener('change', renderHistory);
  })();








