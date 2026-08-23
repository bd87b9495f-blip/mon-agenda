let plannerMode = 'week';
const originalRender = render;
const HOUR_HEIGHT = 60, FIRST_HOUR = 8, LAST_HOUR = 21;
function endTime(a){const [h,m]=a.time.split(':').map(Number), total=h*60+m+a.duration;return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`}
function visualEscape(s=''){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function renderWeekVisual(){
  const days=Array.from({length:7},(_,i)=>addDays(weekStart,i));
  const header=days.map(d=>`<div class="${dateKey(d)===dateKey(new Date())?'visual-today':''}">${fmt(d,{weekday:'short'}).slice(0,3)}<br>${d.getDate()}</div>`).join('');
  const labels=Array.from({length:LAST_HOUR-FIRST_HOUR+1},(_,i)=>`<span class="hour-label" style="top:${i*HOUR_HEIGHT}px">${String(FIRST_HOUR+i).padStart(2,'0')}:00</span>`).join('');
  const lines=Array.from({length:LAST_HOUR-FIRST_HOUR+1},(_,i)=>`<i class="hour-line" style="top:${i*HOUR_HEIGHT}px"></i>`).join('');
  const columns=days.map((d,i)=>{const events=appointments.filter(a=>a.date===dateKey(d)).sort((a,b)=>a.time.localeCompare(b.time)).map(a=>{const [h,m]=a.time.split(':').map(Number), minutes=h*60+m, top=Math.max(0,(minutes-FIRST_HOUR*60)/60*HOUR_HEIGHT), height=Math.max(28,a.duration/60*HOUR_HEIGHT-3), waze=a.address?`<a class="waze-link" href="https://www.waze.com/ul?q=${encodeURIComponent(a.address)}&navigate=yes" target="_blank" rel="noopener">⌖ Waze</a>`:'';return `<article class="week-event" data-appointment-id="${a.id}" style="top:${top}px;height:${height}px"><strong>${a.time} · ${visualEscape(a.client)}</strong><span>${visualEscape(a.service)} · fin ${endTime(a)}</span>${waze}</article>`}).join('');return `<div class="week-column" style="left:${i/7*100}%;width:${100/7}%">${events}</div>`}).join('');
  $('#weekPlanner').innerHTML=`<div class="planner-scroll"><div class="week-content"><div class="week-visual-header"><div></div>${header}</div><div class="week-canvas">${labels}${lines}${columns}</div></div></div>`;
  document.querySelectorAll('.week-event').forEach(el=>el.onclick=e=>{if(e.target.closest('.waze-link'))return;openForm(appointments.find(a=>a.id===el.dataset.appointmentId))});
}
function renderMonthVisual(){
  const first=new Date(selected.getFullYear(),selected.getMonth(),1), begin=mondayOf(first), last=new Date(selected.getFullYear(),selected.getMonth()+1,0), end=addDays(last,(7-last.getDay())%7); let days=[]; for(let d=begin;d<=end;d=addDays(d,1))days.push(new Date(d));
  const weekday=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(x=>`<div class="month-weekday">${x}</div>`).join('');
  const cells=days.map(d=>{const events=appointments.filter(a=>a.date===dateKey(d)).sort((a,b)=>a.time.localeCompare(b.time));const shown=events.slice(0,2).map(a=>`<span class="month-event">${a.time} ${visualEscape(a.client)}</span>`).join('');const extra=events.length>2?`<span class="more-events">+ ${events.length-2}</span>`:'';return `<button class="month-day ${d.getMonth()!==selected.getMonth()?'muted':''} ${dateKey(d)===dateKey(selected)?'selected':''} ${dateKey(d)===dateKey(new Date())?'today':''}" data-date="${dateKey(d)}"><span class="month-number">${d.getDate()}</span>${shown}${extra}</button>`}).join('');
  $('#monthPlanner').innerHTML=`<h3 class="month-title">${fmt(selected,{month:'long',year:'numeric'})}</h3><div class="month-grid">${weekday}${cells}</div>`;
  document.querySelectorAll('.month-day').forEach(el=>el.onclick=()=>{selected=parseLocalDate(el.dataset.date);weekStart=mondayOf(selected);plannerMode='week';render()});
}
function renderVisual(){
  $('#weekPlanner').hidden=plannerMode!=='week';$('#monthPlanner').hidden=plannerMode!=='month';
  document.querySelectorAll('.view-button').forEach(b=>b.classList.toggle('active',b.dataset.plannerView===plannerMode));
  if(plannerMode==='week')renderWeekVisual(); else renderMonthVisual();
}
render=function(){originalRender();renderVisual()};
document.querySelectorAll('.view-button').forEach(b=>b.onclick=()=>{plannerMode=b.dataset.plannerView;render()});
$('#previousWeek').onclick=()=>{if(plannerMode==='month'){selected=new Date(selected.getFullYear(),selected.getMonth()-1,1);weekStart=mondayOf(selected)}else{weekStart=addDays(weekStart,-7);selected=weekStart}render()};
$('#nextWeek').onclick=()=>{if(plannerMode==='month'){selected=new Date(selected.getFullYear(),selected.getMonth()+1,1);weekStart=mondayOf(selected)}else{weekStart=addDays(weekStart,7);selected=weekStart}render()};
render();
