const $ = (s) => document.querySelector(s);
const storeKey = 'nail-planner-v1';
let appointments = JSON.parse(localStorage.getItem(storeKey) || '[]');
let selected = startOfDay(new Date());
let weekStart = mondayOf(selected);
let editingId = null;
const pad = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseLocalDate = v => { const [y,m,d]=v.split('-').map(Number); return new Date(y,m-1,d); };
function startOfDay(d){const c=new Date(d);c.setHours(0,0,0,0);return c}
function mondayOf(d){const c=startOfDay(d);c.setDate(c.getDate()-(c.getDay()+6)%7);return c}
function addDays(d,n){const c=new Date(d);c.setDate(c.getDate()+n);return c}
function save(){localStorage.setItem(storeKey,JSON.stringify(appointments));}
function fmt(d, options){return new Intl.DateTimeFormat('fr-FR',options).format(d)}
function render(){
  $('#todayLabel').textContent = fmt(new Date(),{weekday:'long',day:'numeric',month:'long'});
  $('#weekRange').textContent = `${fmt(weekStart,{day:'numeric',month:'short'})} – ${fmt(addDays(weekStart,6),{day:'numeric',month:'short'})}`;
  $('#weekDays').innerHTML='';
  for(let i=0;i<7;i++){const d=addDays(weekStart,i), key=dateKey(d), btn=document.createElement('button'); const has=appointments.some(a=>a.date===key);
    btn.className=`day-button ${dateKey(d)===dateKey(selected)?'selected':''} ${dateKey(d)===dateKey(new Date())?'today':''} ${has?'has-event':''}`;
    btn.innerHTML=`<span class="name">${fmt(d,{weekday:'short'}).slice(0,3)}</span><span class="number">${d.getDate()}</span>`;
    btn.onclick=()=>{selected=startOfDay(d);render()}; $('#weekDays').append(btn);
  }
  $('#selectedDayTitle').textContent=fmt(selected,{weekday:'long',day:'numeric',month:'long'});
  const list=appointments.filter(a=>a.date===dateKey(selected)).sort((a,b)=>a.time.localeCompare(b.time));
  $('#appointments').innerHTML=list.map(a=>`<button class="appointment" data-id="${a.id}" aria-label="Modifier le rendez-vous de ${escapeHtml(a.client)}"><span class="time">${a.time}</span><span><h3>${escapeHtml(a.client)}</h3><p>${escapeHtml(a.service)}${a.address?' · '+escapeHtml(a.address):''}</p><span class="tag">${a.duration>=120?Math.floor(a.duration/60)+' h'+(a.duration%60?' 30':''):a.duration+' min'}${a.price?' · '+a.price+' €':''}</span></span></button>`).join('');
  $('#emptyState').hidden=!!list.length;
  document.querySelectorAll('.appointment').forEach(el=>el.onclick=()=>openForm(appointments.find(a=>a.id===el.dataset.id)));
}
function escapeHtml(s=''){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function openForm(a){editingId=a?.id||null;$('#formTitle').textContent=a?'Modifier le rendez-vous':'Nouveau rendez-vous';$('#deleteAppointment').hidden=!a;
  $('#appointmentId').value=a?.id||''; $('#clientName').value=a?.client||'';$('#phone').value=a?.phone||'';$('#date').value=a?.date||dateKey(selected);$('#time').value=a?.time||'10:00';$('#duration').value=a?.duration||'60';$('#price').value=a?.price||'';$('#service').value=a?.service||'';$('#address').value=a?.address||'';$('#notes').value=a?.notes||'';$('#appointmentDialog').showModal();
}
$('#addAppointment').onclick=()=>openForm();
$('#appointmentForm').addEventListener('submit',e=>{e.preventDefault();const get=id=>$(id).value.trim(); const a={id:editingId||crypto.randomUUID(),client:get('#clientName'),phone:get('#phone'),date:get('#date'),time:get('#time'),duration:Number($('#duration').value),price:get('#price'),service:get('#service'),address:get('#address'),notes:get('#notes')};
  if(editingId)appointments=appointments.map(x=>x.id===editingId?a:x);else appointments.push(a); save();selected=parseLocalDate(a.date);weekStart=mondayOf(selected);$('#appointmentDialog').close();render();
});
$('#deleteAppointment').onclick=()=>{if(confirm('Supprimer ce rendez-vous ?')){appointments=appointments.filter(a=>a.id!==editingId);save();$('#appointmentDialog').close();render()}};
$('#previousWeek').onclick=()=>{weekStart=addDays(weekStart,-7);selected=weekStart;render()};$('#nextWeek').onclick=()=>{weekStart=addDays(weekStart,7);selected=weekStart;render()};$('#todayButton').onclick=()=>{selected=startOfDay(new Date());weekStart=mondayOf(selected);render()};
function downloadBackup(){const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),appointments},null,2)],{type:'application/json'});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=`sauvegarde-agenda-${dateKey(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
$('#backupButton').onclick=downloadBackup;$('#exportData').onclick=downloadBackup;
$('.nav-item[data-view="settings"]').onclick=()=>$('#settingsDialog').showModal();
document.querySelectorAll('.close-button').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('.nav-item[data-view="clients"]').onclick=()=>{const clients=[...new Set(appointments.map(a=>a.client))];alert(clients.length?`Clientes enregistrées (${clients.length})\n\n${clients.join('\n')}`:'Aucune cliente enregistrée pour le moment. Elles seront créées automatiquement avec les rendez-vous.')};
$('#importData').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.appointments))throw Error();if(confirm('Remplacer tous les rendez-vous par cette sauvegarde ?')){appointments=data.appointments;save();$('#settingsDialog').close();render()}}catch{alert('Cette sauvegarde ne semble pas valide.')}};
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js');render();
