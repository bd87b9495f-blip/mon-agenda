(() => {
  'use strict';

  const STATE_KEY = 'nail-planner-state-v5';
  const LEGACY_APPOINTMENTS_KEY = 'nail-planner-v1';
  const LEGACY_PROFILES_KEY = 'nail-client-profiles-v1';
  const DAY_HEIGHT_PER_HOUR = 68;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  const pad = value => String(value).padStart(2, '0');
  const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const startOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const parseDate = value => {
    const parts = String(value || '').split('-').map(Number);
    return parts.length === 3 && parts.every(Number.isFinite) ? new Date(parts[0], parts[1] - 1, parts[2]) : null;
  };
  const mondayOf = date => {
    const result = startOfDay(date);
    result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
    return result;
  };
  const addDays = (date, count) => {
    const result = new Date(date);
    result.setDate(result.getDate() + count);
    return result;
  };
  const sameDay = (a, b) => dateKey(a) === dateKey(b);
  const uuid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const normaliseName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ');
  const format = (date, options) => new Intl.DateTimeFormat('fr-FR', options).format(date);
  const formatTime = minutes => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  const toMinutes = time => {
    const [hours, minutes] = String(time || '').split(':').map(Number);
    return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0;
  };
  const endTime = appointment => formatTime(toMinutes(appointment.time) + Number(appointment.duration || 0));
  const appointmentTimestamp = appointment => new Date(`${appointment.date}T${appointment.time || '00:00'}:00`).getTime();
  const safeJson = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
  };

  function validAppointment(raw) {
    return raw && typeof raw === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date || '') && /^\d{2}:\d{2}$/.test(raw.time || '');
  }

  function migrateState(source, legacyProfiles = {}) {
    const clients = [];
    const clientsByName = new Map();
    const addClient = raw => {
      const name = String(raw?.name || raw?.client || '').trim();
      if (!name) return null;
      const key = normaliseName(name);
      if (clientsByName.has(key)) {
        const existing = clientsByName.get(key);
        existing.phone = existing.phone || String(raw.phone || '').trim();
        existing.address = existing.address || String(raw.address || '').trim();
        existing.notes = existing.notes || String(raw.notes || '').trim();
        return existing;
      }
      const client = { id: raw.id || uuid(), name, phone: String(raw.phone || '').trim(), address: String(raw.address || '').trim(), notes: String(raw.notes || '').trim(), createdAt: raw.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
      clients.push(client);
      clientsByName.set(key, client);
      return client;
    };

    if (Array.isArray(source?.clients)) source.clients.forEach(addClient);
    Object.values(legacyProfiles || {}).forEach(addClient);
    const appointments = [];
    const rawAppointments = Array.isArray(source?.appointments) ? source.appointments : Array.isArray(source) ? source : [];
    rawAppointments.filter(validAppointment).forEach(raw => {
      let client = null;
      if (raw.clientId && Array.isArray(source?.clients)) client = clients.find(item => item.id === raw.clientId) || null;
      client ||= addClient({ name: raw.client || raw.clientName, phone: raw.phone, address: raw.address });
      if (!client) client = addClient({ name: 'Cliente sans nom' });
      appointments.push({
        id: raw.id || uuid(), clientId: client.id, date: raw.date, time: raw.time,
        duration: Math.max(15, Number(raw.duration) || 60), price: raw.price ?? '',
        service: String(raw.service || 'Prestation').trim(), notes: String(raw.notes || '').trim(),
        createdAt: raw.createdAt || new Date().toISOString(), updatedAt: raw.updatedAt || new Date().toISOString()
      });
    });
    return { version: 5, clients, appointments };
  }

  function loadState() {
    const stored = safeJson(STATE_KEY, null);
    if (stored?.version === 5 && Array.isArray(stored.clients) && Array.isArray(stored.appointments)) return migrateState(stored);
    const legacyAppointments = safeJson(LEGACY_APPOINTMENTS_KEY, []);
    const legacyProfiles = safeJson(LEGACY_PROFILES_KEY, {});
    return migrateState({ appointments: legacyAppointments }, legacyProfiles);
  }

  const app = {
    state: loadState(),
    ui: {
      screen: 'agenda', mode: 'week', selectedDate: startOfDay(new Date()), weekStart: mondayOf(new Date()),
      monthDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1), overviewWeekStart: null,
      editingAppointmentId: null, pendingDraft: null, formClientId: null
    }
  };

  function saveState() { localStorage.setItem(STATE_KEY, JSON.stringify(app.state)); }
  function clientById(id) { return app.state.clients.find(client => client.id === id) || null; }
  function appointmentClient(appointment) { return clientById(appointment.clientId) || { id: '', name: 'Cliente supprimée', phone: '', address: '', notes: '' }; }
  function appointmentsForDate(key) { return app.state.appointments.filter(appointment => appointment.date === key).sort((a, b) => a.time.localeCompare(b.time)); }
  function sortedAppointments() { return [...app.state.appointments].sort((a, b) => appointmentTimestamp(a) - appointmentTimestamp(b)); }

  function findConflicts(draft) {
    const start = toMinutes(draft.time);
    const finish = start + Number(draft.duration);
    return appointmentsForDate(draft.date).filter(appointment => appointment.id !== draft.id).filter(appointment => {
      const oldStart = toMinutes(appointment.time);
      const oldFinish = oldStart + Number(appointment.duration);
      return start < oldFinish && finish > oldStart;
    });
  }

  function conflictsForAppointment(appointment) { return findConflicts(appointment); }
  function wazeUrl(address) { return `https://www.waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`; }
  function openWaze(address) { if (address) window.open(wazeUrl(address), '_blank', 'noopener'); }

  function render() {
    renderHeader();
    renderAgenda();
    renderClients();
    renderScreen();
  }

  function renderHeader() {
    $('#todayLabel').textContent = format(new Date(), { weekday: 'long', day: 'numeric', month: 'long' });
    const now = Date.now();
    const next = sortedAppointments().find(appointment => appointmentTimestamp(appointment) >= now);
    if (!next) {
      $('#nextAppointment').className = 'next-card empty';
      $('#nextAppointment').innerHTML = '<span class="next-icon">✦</span><div><p class="next-title">Prochain rendez-vous</p><h2>Rien de prévu</h2><p>Ajoute un rendez-vous quand tu es prête.</p></div>';
      return;
    }
    const client = appointmentClient(next);
    $('#nextAppointment').className = 'next-card';
    $('#nextAppointment').innerHTML = `<div class="next-content"><p class="next-title">Prochain rendez-vous</p><p class="next-time">${format(parseDate(next.date), { weekday: 'long', day: 'numeric', month: 'long' })} · ${next.time}</p><h2>${escapeHtml(client.name)}</h2><p>${escapeHtml(next.service)} · ${Number(next.duration)} min${client.address ? ` · ${escapeHtml(client.address)}` : ''}</p></div>${client.address ? `<button class="waze-button" data-waze="${encodeURIComponent(client.address)}">⌖ Waze</button>` : ''}<button class="next-icon" data-edit="${next.id}" aria-label="Modifier le prochain rendez-vous">›</button>`;
  }

  function renderAgenda() {
    const isWeek = app.ui.mode === 'week';
    $('#weekView').hidden = !isWeek;
    $('#monthView').hidden = isWeek;
    $$('.mode-button').forEach(button => button.classList.toggle('active', button.dataset.mode === app.ui.mode));
    if (isWeek) renderWeekView(); else renderMonthView();
  }

  function renderWeekView() {
    $('#periodLabel').textContent = `${format(app.ui.weekStart, { day: 'numeric', month: 'short' })} – ${format(addDays(app.ui.weekStart, 6), { day: 'numeric', month: 'short' })}`;
    $('#dayStrip').innerHTML = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(app.ui.weekStart, index);
      const hasEvent = appointmentsForDate(dateKey(date)).length > 0;
      return `<button class="day-button ${sameDay(date, app.ui.selectedDate) ? 'selected' : ''} ${sameDay(date, new Date()) ? 'today' : ''} ${hasEvent ? 'has-event' : ''}" data-select-date="${dateKey(date)}"><span class="day-name">${format(date, { weekday: 'short' }).slice(0, 3)}</span><span class="day-number">${date.getDate()}</span></button>`;
    }).join('');
    $('#selectedDayTitle').textContent = format(app.ui.selectedDate, { weekday: 'long', day: 'numeric', month: 'long' });
    renderDayTimeline();
  }

  function renderDayTimeline() {
    const dayAppointments = appointmentsForDate(dateKey(app.ui.selectedDate));
    if (!dayAppointments.length) {
      $('#dayTimeline').innerHTML = `<button class="timeline-empty-state" data-create-time="10:00"><span>✦</span><p>Aucun rendez-vous. Touche ici pour ajouter un créneau.</p></button>`;
      return;
    }
    const firstHour = Math.min(8, ...dayAppointments.map(appointment => Math.floor(toMinutes(appointment.time) / 60)));
    const lastHour = Math.max(20, ...dayAppointments.map(appointment => Math.ceil((toMinutes(appointment.time) + Number(appointment.duration)) / 60)));
    const totalHours = lastHour - firstHour;
    const lines = Array.from({ length: totalHours + 1 }, (_, index) => `<span class="timeline-hour" style="top:${index * DAY_HEIGHT_PER_HOUR}px">${pad(firstHour + index)}:00</span><i class="timeline-line" style="top:${index * DAY_HEIGHT_PER_HOUR}px"></i>`).join('');
    const emptyAreas = Array.from({ length: totalHours }, (_, index) => `<button class="timeline-empty" data-create-time="${pad(firstHour + index)}:00" style="top:${index * DAY_HEIGHT_PER_HOUR}px;height:${DAY_HEIGHT_PER_HOUR}px" aria-label="Ajouter un rendez-vous à ${pad(firstHour + index)} h"></button>`).join('');
    const blocks = dayAppointments.map(appointment => {
      const client = appointmentClient(appointment);
      const top = ((toMinutes(appointment.time) - firstHour * 60) / 60) * DAY_HEIGHT_PER_HOUR;
      const height = Math.max(62, (Number(appointment.duration) / 60) * DAY_HEIGHT_PER_HOUR - 4);
      const conflicted = conflictsForAppointment(appointment).length > 0;
      return `<article class="appointment-block ${conflicted ? 'conflicted' : ''}" style="top:${top}px;height:${height}px"><button class="appointment-edit" data-edit="${appointment.id}"><span class="appointment-time">${appointment.time} – ${endTime(appointment)}${conflicted ? ' · conflit' : ''}</span><strong class="appointment-name">${escapeHtml(client.name)}</strong><span class="appointment-meta">${escapeHtml(appointment.service)} · ${Number(appointment.duration)} min</span></button>${client.address ? `<div class="appointment-actions"><button class="waze-button" data-waze="${encodeURIComponent(client.address)}">⌖ Waze</button></div>` : ''}</article>`;
    }).join('');
    $('#dayTimeline').innerHTML = `<div class="timeline-inner" style="height:${totalHours * DAY_HEIGHT_PER_HOUR}px">${lines}${emptyAreas}${blocks}</div>`;
  }

  function renderMonthView() {
    const monthDate = app.ui.monthDate;
    $('#monthLabel').textContent = format(monthDate, { month: 'long', year: 'numeric' });
    const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const start = mondayOf(first);
    const end = addDays(last, (7 - ((last.getDay() + 6) % 7) - 1) % 7);
    const days = [];
    for (let date = start; date <= end; date = addDays(date, 1)) days.push(date);
    const headings = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => `<div class="month-weekday">${day}</div>`).join('');
    const selectedWeek = app.ui.overviewWeekStart;
    const cells = days.map(date => {
      const count = appointmentsForDate(dateKey(date)).length;
      const isSelectedWeek = selectedWeek && sameDay(mondayOf(date), selectedWeek);
      return `<button class="month-day ${date.getMonth() !== monthDate.getMonth() ? 'muted' : ''} ${sameDay(date, new Date()) ? 'today' : ''} ${isSelectedWeek ? 'selected-week' : ''}" data-select-week="${dateKey(date)}"><span class="month-number">${date.getDate()}</span>${count ? `<span class="month-event-count">${count} RDV</span>` : ''}</button>`;
    }).join('');
    $('#monthGrid').innerHTML = `${headings}${cells}`;
    renderWeekOverview();
  }

  function renderWeekOverview() {
    const target = $('#weekOverview');
    if (!app.ui.overviewWeekStart) { target.hidden = true; return; }
    const start = app.ui.overviewWeekStart;
    const dayCards = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(start, index);
      const dayAppointments = appointmentsForDate(dateKey(date));
      const content = dayAppointments.length ? dayAppointments.map(appointment => {
        const client = appointmentClient(appointment);
        return `<button class="overview-appointment" data-edit="${appointment.id}"><span class="overview-time">${appointment.time}</span><span><strong>${escapeHtml(client.name)}</strong><span>${escapeHtml(appointment.service)} · fin ${endTime(appointment)}</span></span></button>`;
      }).join('') : '<p>Aucun rendez-vous</p>';
      return `<article class="overview-day ${dayAppointments.length ? '' : 'empty-day'}"><h3>${format(date, { weekday: 'long', day: 'numeric', month: 'short' })}</h3>${content}</article>`;
    }).join('');
    target.hidden = false;
    target.innerHTML = `<div class="week-overview-header"><h2>Semaine du ${format(start, { day: 'numeric', month: 'long' })}</h2><button class="text-button" data-close-overview>Retour au mois</button></div><div class="week-overview-list">${dayCards}</div>`;
  }

  function clientLastAppointment(clientId) {
    return app.state.appointments.filter(appointment => appointment.clientId === clientId).sort((a, b) => appointmentTimestamp(b) - appointmentTimestamp(a))[0] || null;
  }

  function renderClients() {
    const query = ($('#clientSearch')?.value || '').trim().toLocaleLowerCase('fr-FR');
    const clients = [...app.state.clients].filter(client => `${client.name} ${client.phone} ${client.address}`.toLocaleLowerCase('fr-FR').includes(query)).sort((a, b) => appointmentTimestamp(clientLastAppointment(b.id) || { date: '1900-01-01', time: '00:00' }) - appointmentTimestamp(clientLastAppointment(a.id) || { date: '1900-01-01', time: '00:00' }));
    $('#clientList').innerHTML = clients.length ? clients.map(client => {
      const latest = clientLastAppointment(client.id);
      return `<button class="client-card" data-client="${client.id}"><span class="client-initial">${escapeHtml(client.name[0]?.toUpperCase() || '?')}</span><span><h3>${escapeHtml(client.name)}</h3><p>${latest ? `Dernier RDV · ${format(parseDate(latest.date), { day: 'numeric', month: 'short' })} · ${escapeHtml(latest.service)}` : 'Aucun rendez-vous'}${client.address ? ` · ${escapeHtml(client.address)}` : ''}</p></span><span class="chevron">›</span></button>`;
    }).join('') : '<section class="empty-message"><h2>Aucune cliente</h2><p>Les clientes se créeront lors de tes prochains rendez-vous.</p></section>';
  }

  function renderScreen() {
    $('#agendaScreen').hidden = app.ui.screen !== 'agenda';
    $('#clientsScreen').hidden = app.ui.screen !== 'clients';
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.screen === app.ui.screen));
  }

  function showScreen(screen) {
    if (screen === 'settings') { $('#settingsDialog').showModal(); return; }
    app.ui.screen = screen;
    renderScreen();
    if (screen === 'clients') renderClients();
  }

  function resetForm() {
    $('#appointmentForm').reset();
    $('#appointmentId').value = '';
    $('#date').value = dateKey(app.ui.selectedDate);
    $('#time').value = '10:00';
    $('#duration').value = '60';
    $('#clientSuggestions').hidden = true;
    $('#conflictHint').hidden = true;
    app.ui.editingAppointmentId = null;
    app.ui.formClientId = null;
  }

  function openAppointment(appointment = null, defaults = {}) {
    resetForm();
    const client = appointment ? appointmentClient(appointment) : null;
    $('#appointmentFormTitle').textContent = appointment ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous';
    $('#deleteAppointment').hidden = !appointment;
    if (appointment) {
      app.ui.editingAppointmentId = appointment.id;
      app.ui.formClientId = client?.id || null;
      $('#appointmentId').value = appointment.id;
      $('#clientName').value = client?.name || '';
      $('#phone').value = client?.phone || '';
      $('#date').value = appointment.date;
      $('#time').value = appointment.time;
      $('#duration').value = String(appointment.duration);
      $('#price').value = appointment.price;
      $('#service').value = appointment.service;
      $('#address').value = client?.address || '';
      $('#notes').value = appointment.notes || '';
    } else {
      $('#date').value = defaults.date || dateKey(app.ui.selectedDate);
      $('#time').value = defaults.time || '10:00';
    }
    updateConflictHint();
    $('#appointmentDialog').showModal();
    setTimeout(() => $('#clientName').focus(), 30);
  }

  function fillFromClient(client) {
    app.ui.formClientId = client.id;
    $('#clientName').value = client.name;
    $('#phone').value = client.phone || '';
    $('#address').value = client.address || '';
    $('#clientSuggestions').hidden = true;
    updateConflictHint();
  }

  function matchingClients(query) {
    const term = normaliseName(query);
    if (!term) return [];
    return app.state.clients.filter(client => normaliseName(client.name).includes(term)).slice(0, 6);
  }

  function renderSuggestions() {
    const input = $('#clientName');
    const suggestions = matchingClients(input.value);
    const target = $('#clientSuggestions');
    if (!suggestions.length || !input.value.trim()) { target.hidden = true; return; }
    target.hidden = false;
    target.innerHTML = suggestions.map(client => `<button type="button" class="client-suggestion" data-suggestion="${client.id}"><strong>${escapeHtml(client.name)}</strong><span>${escapeHtml(client.phone || 'Sans téléphone')}${client.address ? ` · ${escapeHtml(client.address)}` : ''}</span></button>`).join('');
  }

  function getDraft() {
    return {
      id: app.ui.editingAppointmentId || $('#appointmentId').value || uuid(), clientId: app.ui.formClientId,
      clientName: $('#clientName').value.trim(), phone: $('#phone').value.trim(), address: $('#address').value.trim(),
      date: $('#date').value, time: $('#time').value, duration: Number($('#duration').value), price: $('#price').value.trim(),
      service: $('#service').value.trim(), notes: $('#notes').value.trim()
    };
  }

  function updateConflictHint() {
    const date = $('#date').value;
    const time = $('#time').value;
    const duration = Number($('#duration').value);
    if (!date || !time || !duration) { $('#conflictHint').hidden = true; return; }
    const conflicts = findConflicts({ id: app.ui.editingAppointmentId, date, time, duration });
    $('#conflictHint').hidden = !conflicts.length;
    $('#conflictHint').innerHTML = conflicts.length ? `Attention : ce créneau chevauche ${conflicts.length === 1 ? 'un rendez-vous' : `${conflicts.length} rendez-vous`} (${conflicts.map(appointment => `${appointmentClient(appointment).name} · ${appointment.time}`).join(', ')}).` : '';
  }

  function commitDraft(draft) {
    let client = draft.clientId ? clientById(draft.clientId) : null;
    if (!client) {
      client = { id: uuid(), name: draft.clientName, phone: draft.phone, address: draft.address, notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      app.state.clients.push(client);
    } else {
      client.name = draft.clientName;
      client.phone = draft.phone;
      client.address = draft.address;
      client.updatedAt = new Date().toISOString();
    }
    const appointment = { id: draft.id, clientId: client.id, date: draft.date, time: draft.time, duration: draft.duration, price: draft.price, service: draft.service, notes: draft.notes, createdAt: app.state.appointments.find(item => item.id === draft.id)?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    const index = app.state.appointments.findIndex(item => item.id === appointment.id);
    if (index === -1) app.state.appointments.push(appointment); else app.state.appointments[index] = appointment;
    app.ui.selectedDate = parseDate(appointment.date) || app.ui.selectedDate;
    app.ui.weekStart = mondayOf(app.ui.selectedDate);
    app.ui.monthDate = new Date(app.ui.selectedDate.getFullYear(), app.ui.selectedDate.getMonth(), 1);
    saveState();
    $('#appointmentDialog').close();
    render();
  }

  function openConflictDialog(draft, conflicts) {
    app.ui.pendingDraft = draft;
    $('#conflictList').innerHTML = conflicts.map(appointment => `<article class="conflict-item"><strong>${escapeHtml(appointmentClient(appointment).name)}</strong><span>${appointment.time} – ${endTime(appointment)} · ${escapeHtml(appointment.service)}</span></article>`).join('');
    $('#conflictDialog').showModal();
  }

  function openClient(clientId) {
    const client = clientById(clientId);
    if (!client) return;
    const latest = clientLastAppointment(client.id);
    $('#profileKey').value = client.id;
    $('#profileName').value = client.name;
    $('#profilePhone').value = client.phone;
    $('#profileAddress').value = client.address;
    $('#profileNotes').value = client.notes;
    $('#profileWaze').hidden = !client.address;
    $('#lastAppointment').innerHTML = latest ? `<p class="last-label">Dernier rendez-vous</p><p><strong>${format(parseDate(latest.date), { day: 'numeric', month: 'long', year: 'numeric' })}</strong> · ${escapeHtml(latest.service)}</p>` : '<p class="last-label">Dernier rendez-vous</p><p>Aucun rendez-vous enregistré.</p>';
    $('#clientDialog').showModal();
  }

  function exportData() {
    const payload = { version: 5, exportedAt: new Date().toISOString(), state: app.state };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sauvegarde-agenda-${dateKey(new Date())}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  async function importData(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const candidate = data?.state || data;
      const migrated = migrateState(candidate, data?.clientProfiles || {});
      if (!migrated.appointments.length && !migrated.clients.length) throw new Error('empty');
      if (!window.confirm('Remplacer les rendez-vous et clientes actuels par cette sauvegarde ?')) return;
      app.state = migrated;
      saveState();
      $('#settingsDialog').close();
      render();
    } catch { window.alert('Cette sauvegarde ne semble pas valide.'); }
  }

  function setMode(mode) {
    app.ui.mode = mode;
    if (mode === 'month') app.ui.monthDate = new Date(app.ui.selectedDate.getFullYear(), app.ui.selectedDate.getMonth(), 1);
    renderAgenda();
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.close) { $(`#${target.dataset.close}`).close(); return; }
    if (target.dataset.mode) { setMode(target.dataset.mode); return; }
    if (target.dataset.screen) { showScreen(target.dataset.screen); return; }
    if (target.id === 'backToAgenda') { showScreen('agenda'); return; }
    if (target.id === 'addAppointment') { openAppointment(); return; }
    if (target.id === 'previousPeriod') { app.ui.weekStart = addDays(app.ui.weekStart, -7); app.ui.selectedDate = app.ui.weekStart; renderAgenda(); return; }
    if (target.id === 'nextPeriod') { app.ui.weekStart = addDays(app.ui.weekStart, 7); app.ui.selectedDate = app.ui.weekStart; renderAgenda(); return; }
    if (target.id === 'previousMonth') { app.ui.monthDate = new Date(app.ui.monthDate.getFullYear(), app.ui.monthDate.getMonth() - 1, 1); app.ui.overviewWeekStart = null; renderAgenda(); return; }
    if (target.id === 'nextMonth') { app.ui.monthDate = new Date(app.ui.monthDate.getFullYear(), app.ui.monthDate.getMonth() + 1, 1); app.ui.overviewWeekStart = null; renderAgenda(); return; }
    if (target.id === 'todayButton') { app.ui.selectedDate = startOfDay(new Date()); app.ui.weekStart = mondayOf(app.ui.selectedDate); renderAgenda(); return; }
    if (target.id === 'deleteAppointment') {
      if (app.ui.editingAppointmentId && window.confirm('Supprimer ce rendez-vous ?')) { app.state.appointments = app.state.appointments.filter(appointment => appointment.id !== app.ui.editingAppointmentId); saveState(); $('#appointmentDialog').close(); render(); }
      return;
    }
    if (target.id === 'changeConflict') { $('#conflictDialog').close(); return; }
    if (target.id === 'confirmConflict') { const draft = app.ui.pendingDraft; $('#conflictDialog').close(); if (draft) commitDraft(draft); app.ui.pendingDraft = null; return; }
    if (target.id === 'exportData' || target.id === 'backupButton') { exportData(); return; }
    if (target.id === 'profileWaze') { openWaze($('#profileAddress').value.trim()); return; }
    if (target.dataset.selectDate) { app.ui.selectedDate = parseDate(target.dataset.selectDate); app.ui.weekStart = mondayOf(app.ui.selectedDate); renderAgenda(); return; }
    if (target.dataset.selectWeek) { const date = parseDate(target.dataset.selectWeek); app.ui.overviewWeekStart = mondayOf(date); app.ui.selectedDate = date; renderAgenda(); return; }
    if (target.dataset.closeOverview !== undefined) { app.ui.overviewWeekStart = null; renderAgenda(); return; }
    if (target.dataset.edit) { const appointment = app.state.appointments.find(item => item.id === target.dataset.edit); if (appointment) openAppointment(appointment); return; }
    if (target.dataset.waze) { openWaze(decodeURIComponent(target.dataset.waze)); return; }
    if (target.dataset.createTime) { openAppointment(null, { date: dateKey(app.ui.selectedDate), time: target.dataset.createTime }); return; }
    if (target.dataset.suggestion) { const client = clientById(target.dataset.suggestion); if (client) fillFromClient(client); return; }
    if (target.dataset.client) { openClient(target.dataset.client); }
  });

  $('#appointmentForm').addEventListener('submit', event => {
    event.preventDefault();
    const form = $('#appointmentForm');
    if (!form.reportValidity()) return;
    const draft = getDraft();
    if (!draft.clientName || !draft.service || !draft.date || !draft.time) return;
    const conflicts = findConflicts(draft);
    if (conflicts.length) openConflictDialog(draft, conflicts); else commitDraft(draft);
  });

  $('#clientName').addEventListener('input', event => {
    const exact = app.state.clients.find(client => normaliseName(client.name) === normaliseName(event.target.value));
    if (exact) fillFromClient(exact); else { app.ui.formClientId = null; renderSuggestions(); }
  });
  $('#clientName').addEventListener('focus', renderSuggestions);
  $('#clientName').addEventListener('blur', () => setTimeout(() => { $('#clientSuggestions').hidden = true; }, 160));
  ['#date', '#time', '#duration'].forEach(selector => $(selector).addEventListener('input', updateConflictHint));
  $('#clientSearch').addEventListener('input', renderClients);
  $('#importData').addEventListener('change', event => importData(event.target.files[0]));

  $('#clientForm').addEventListener('submit', event => {
    event.preventDefault();
    const form = $('#clientForm');
    if (!form.reportValidity()) return;
    const client = clientById($('#profileKey').value);
    if (!client) return;
    client.name = $('#profileName').value.trim();
    client.phone = $('#profilePhone').value.trim();
    client.address = $('#profileAddress').value.trim();
    client.notes = $('#profileNotes').value.trim();
    client.updatedAt = new Date().toISOString();
    saveState();
    $('#clientDialog').close();
    render();
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
  render();
})();
