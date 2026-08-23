(() => {
  'use strict';

  const STATE_KEY = 'nail-planner-state-v6';
  const PREVIOUS_STATE_KEY = 'nail-planner-state-v5';
  const LEGACY_APPOINTMENTS_KEY = 'nail-planner-v1';
  const LEGACY_PROFILES_KEY = 'nail-client-profiles-v1';
  const HOUR_HEIGHT = 68;
  const STATUS = {
    to_confirm: 'À confirmer', confirmed: 'Confirmé', completed: 'Terminé', cancelled: 'Annulé'
  };
  const PAYMENT = { pending: 'À régler', paid: 'Payé' };
  const METHOD = { cash: 'Espèces', card: 'Carte', transfer: 'Virement', other: 'Autre' };
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const pad = number => String(number).padStart(2, '0');
  const localDate = (year, monthIndex, day) => new Date(year, monthIndex, day, 12, 0, 0, 0);
  const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parseDate = value => {
    const [year, month, day] = String(value || '').split('-').map(Number);
    return [year, month, day].every(Number.isFinite) ? localDate(year, month - 1, day) : null;
  };
  const startOfDay = date => localDate(date.getFullYear(), date.getMonth(), date.getDate());
  const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };
  const mondayOf = date => addDays(startOfDay(date), -((date.getDay() + 6) % 7));
  const sameDay = (one, two) => dateKey(one) === dateKey(two);
  const uuid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const normaliseName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ');
  const format = (date, options) => new Intl.DateTimeFormat('fr-FR', options).format(date);
  const toMinutes = time => {
    const [hours, minutes] = String(time || '').split(':').map(Number);
    return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0;
  };
  const timeText = minutes => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  const endTime = appointment => timeText(toMinutes(appointment.time) + Number(appointment.duration || 0));
  const appointmentTimestamp = appointment => new Date(`${appointment.date}T${appointment.time || '00:00'}:00`).getTime();
  const safeJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } };
  const activeAppointment = appointment => appointment.status !== 'cancelled';
  const isWeekend = date => date.getDay() === 0 || date.getDay() === 6;

  function easterSunday(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451), n = h + l - 7 * m + 114;
    return localDate(year, Math.floor(n / 31) - 1, (n % 31) + 1);
  }

  const holidayCache = new Map();
  function frenchHolidays(year) {
    if (holidayCache.has(year)) return holidayCache.get(year);
    const easter = easterSunday(year);
    const items = [
      ['Jour de l’an', localDate(year, 0, 1)], ['Lundi de Pâques', addDays(easter, 1)], ['Fête du Travail', localDate(year, 4, 1)],
      ['Victoire 1945', localDate(year, 4, 8)], ['Ascension', addDays(easter, 39)], ['Lundi de Pentecôte', addDays(easter, 50)],
      ['Fête nationale', localDate(year, 6, 14)], ['Assomption', localDate(year, 7, 15)], ['Toussaint', localDate(year, 10, 1)],
      ['Armistice 1918', localDate(year, 10, 11)], ['Noël', localDate(year, 11, 25)]
    ].map(([label, date]) => ({ label, key: dateKey(date) }));
    holidayCache.set(year, items);
    return items;
  }

  function dateMeta(date) {
    const holidays = frenchHolidays(date.getFullYear()).filter(item => item.key === dateKey(date));
    return { weekend: isWeekend(date), holiday: holidays[0] || null };
  }

  function validAppointment(raw) {
    return raw && typeof raw === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date || '') && /^\d{2}:\d{2}$/.test(raw.time || '');
  }

  const baseSettings = () => ({ travelBuffer: 15, lastBackupAt: null });
  function migrateState(source, legacyProfiles = {}) {
    const data = source?.state || source || {};
    const clients = [];
    const byName = new Map();
    const addClient = raw => {
      const name = String(raw?.name || raw?.client || raw?.clientName || '').trim();
      if (!name) return null;
      const key = normaliseName(name);
      if (byName.has(key)) {
        const existing = byName.get(key);
        existing.phone ||= String(raw.phone || '').trim();
        existing.address ||= String(raw.address || '').trim();
        existing.notes ||= String(raw.notes || '').trim();
        return existing;
      }
      const client = { id: raw.id || uuid(), name, phone: String(raw.phone || '').trim(), address: String(raw.address || '').trim(), notes: String(raw.notes || '').trim(), createdAt: raw.createdAt || new Date().toISOString(), updatedAt: raw.updatedAt || new Date().toISOString() };
      clients.push(client); byName.set(key, client); return client;
    };
    if (Array.isArray(data.clients)) data.clients.forEach(addClient);
    Object.values(legacyProfiles || data.clientProfiles || {}).forEach(addClient);
    const appointments = [];
    const rawAppointments = Array.isArray(data.appointments) ? data.appointments : Array.isArray(data) ? data : [];
    rawAppointments.filter(validAppointment).forEach(raw => {
      let client = raw.clientId ? clients.find(item => item.id === raw.clientId) : null;
      client ||= addClient(raw) || addClient({ name: 'Cliente sans nom' });
      appointments.push({
        id: raw.id || uuid(), clientId: client.id, date: raw.date, time: raw.time, duration: Math.max(15, Number(raw.duration) || 60),
        price: raw.price ?? '', service: String(raw.service || 'Prestation').trim(), notes: String(raw.notes || '').trim(),
        status: STATUS[raw.status] ? raw.status : 'confirmed', paymentStatus: PAYMENT[raw.paymentStatus] ? raw.paymentStatus : 'pending',
        paymentMethod: METHOD[raw.paymentMethod] ? raw.paymentMethod : '', createdAt: raw.createdAt || new Date().toISOString(), updatedAt: raw.updatedAt || new Date().toISOString()
      });
    });
    const unavailableDays = Array.isArray(data.unavailableDays) ? data.unavailableDays.filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item?.date || '')).map(item => ({ id: item.id || uuid(), date: item.date, reason: String(item.reason || 'Indisponible') })) : [];
    const settings = { ...baseSettings(), ...(data.settings || {}) };
    settings.travelBuffer = [0, 15, 30, 45].includes(Number(settings.travelBuffer)) ? Number(settings.travelBuffer) : 15;
    return { version: 6, clients, appointments, unavailableDays, settings };
  }

  function loadState() {
    const current = safeJson(STATE_KEY, null);
    if (current?.version === 6) return migrateState(current);
    const v5 = safeJson(PREVIOUS_STATE_KEY, null);
    if (v5?.clients || v5?.appointments) return migrateState(v5);
    return migrateState({ appointments: safeJson(LEGACY_APPOINTMENTS_KEY, []) }, safeJson(LEGACY_PROFILES_KEY, {}));
  }

  const app = {
    state: loadState(),
    ui: {
      screen: 'agenda', mode: 'week', selectedDate: startOfDay(new Date()), weekStart: mondayOf(new Date()),
      monthDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1), overviewWeekStart: null,
      editingAppointmentId: null, pendingDraft: null, formClientId: null
    }
  };
  const saveState = () => localStorage.setItem(STATE_KEY, JSON.stringify(app.state));
  const clientById = id => app.state.clients.find(client => client.id === id) || null;
  const clientFor = appointment => clientById(appointment.clientId) || { id: '', name: 'Cliente supprimée', phone: '', address: '', notes: '' };
  const appointmentsForDate = key => app.state.appointments.filter(appointment => appointment.date === key).sort((a, b) => a.time.localeCompare(b.time));
  const activeAppointmentsForDate = key => appointmentsForDate(key).filter(activeAppointment);
  const unavailableForDate = key => app.state.unavailableDays.find(item => item.date === key) || null;
  const sortedAppointments = () => [...app.state.appointments].sort((a, b) => appointmentTimestamp(a) - appointmentTimestamp(b));

  function serviceTheme(service) {
    const value = normaliseName(service);
    if (value.includes('depose')) return 'service-depose';
    if (value.includes('rempl')) return 'service-remplissage';
    if (value.includes('nail') || value.includes('art')) return 'service-art';
    if (value.includes('pose')) return 'service-pose';
    return 'service-default';
  }

  function findConflicts(draft) {
    if (draft.status === 'cancelled') return [];
    const conflicts = [];
    const unavailable = unavailableForDate(draft.date);
    if (unavailable) conflicts.push({ type: 'unavailable', unavailable });
    const start = toMinutes(draft.time), end = start + Number(draft.duration || 0), buffer = Number(app.state.settings.travelBuffer || 0);
    activeAppointmentsForDate(draft.date).filter(appointment => appointment.id !== draft.id).forEach(appointment => {
      const oldStart = toMinutes(appointment.time), oldEnd = oldStart + Number(appointment.duration || 0);
      if (start < oldEnd + buffer && end > oldStart - buffer) conflicts.push({ type: 'appointment', appointment, direct: start < oldEnd && end > oldStart });
    });
    return conflicts;
  }

  function hasAppointmentConflict(appointment) {
    return findConflicts(appointment).some(conflict => conflict.type === 'appointment');
  }

  function wazeUrl(address) { return `https://www.waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`; }
  function openWaze(address) { if (address) window.open(wazeUrl(address), '_blank', 'noopener'); }
  const money = value => value === '' || value === null || value === undefined ? '' : `${Number(value).toLocaleString('fr-FR')} €`;

  function render() {
    renderHeader(); renderAgenda(); renderClients(); renderScreen();
  }

  function renderHeader() {
    $('#todayLabel').textContent = format(new Date(), { weekday: 'long', day: 'numeric', month: 'long' });
    const next = sortedAppointments().find(appointment => activeAppointment(appointment) && appointmentTimestamp(appointment) >= Date.now());
    if (!next) {
      $('#nextAppointment').className = 'next-card empty';
      $('#nextAppointment').innerHTML = '<span class="next-icon">✦</span><div><p class="next-title">Prochain rendez-vous</p><h2>Rien de prévu</h2><p>Ajoute un rendez-vous quand tu es prête.</p></div>';
    } else {
      const client = clientFor(next);
      $('#nextAppointment').className = 'next-card';
      $('#nextAppointment').innerHTML = `<button class="next-main" data-edit="${next.id}"><span class="next-title">Prochain rendez-vous</span><span class="next-time">${format(parseDate(next.date), { weekday: 'long', day: 'numeric', month: 'long' })} · ${next.time}</span><strong>${escapeHtml(client.name)}</strong><span>${escapeHtml(next.service)} · ${Number(next.duration)} min</span>${client.address ? `<small>${escapeHtml(client.address)}</small>` : ''}</button>${client.address ? `<button class="route-icon" data-waze="${encodeURIComponent(client.address)}" aria-label="Itinéraire Waze">⌖</button>` : ''}`;
    }
    const last = app.state.settings.lastBackupAt ? new Date(app.state.settings.lastBackupAt) : null;
    const late = !last || Date.now() - last.getTime() > 7 * 24 * 60 * 60 * 1000;
    $('#backupNotice').hidden = !late;
    $('#backupNotice').textContent = last ? '⇩ Pense à sauvegarder tes données' : '⇩ Fais une première sauvegarde de tes données';
  }

  function renderAgenda() {
    const week = app.ui.mode === 'week';
    $('#weekView').hidden = !week; $('#monthView').hidden = week;
    $$('.mode-button').forEach(button => button.classList.toggle('active', button.dataset.mode === app.ui.mode));
    if (week) renderWeekView(); else renderMonthView();
  }

  function renderWeekView() {
    $('#periodLabel').textContent = `${format(app.ui.weekStart, { day: 'numeric', month: 'short' })} – ${format(addDays(app.ui.weekStart, 6), { day: 'numeric', month: 'short' })}`;
    $('#dayStrip').innerHTML = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(app.ui.weekStart, index), meta = dateMeta(date), count = appointmentsForDate(dateKey(date)).length;
      const flags = `${meta.holiday ? '<span class="holiday-badge">Férié</span>' : ''}${meta.weekend ? '<span class="weekend-label">WE</span>' : ''}`;
      return `<button class="day-button ${sameDay(date, app.ui.selectedDate) ? 'selected' : ''} ${sameDay(date, new Date()) ? 'today' : ''} ${meta.weekend ? 'weekend' : ''} ${meta.holiday ? 'holiday' : ''} ${count ? 'has-event' : ''}" data-select-date="${dateKey(date)}"><span class="day-name">${format(date, { weekday: 'short' }).slice(0, 3)}</span><span class="day-number">${date.getDate()}</span>${flags}</button>`;
    }).join('');
    $('#selectedDayTitle').textContent = format(app.ui.selectedDate, { weekday: 'long', day: 'numeric', month: 'long' });
    renderHolidayBanner(); renderDaySummary(); renderDayTimeline();
    const unavailable = unavailableForDate(dateKey(app.ui.selectedDate));
    $('#toggleUnavailable').textContent = unavailable ? '▧ Modifier indisponibilité' : '▧ Indisponible';
  }

  function renderHolidayBanner() {
    const meta = dateMeta(app.ui.selectedDate), unavailable = unavailableForDate(dateKey(app.ui.selectedDate));
    const parts = [];
    if (meta.holiday) parts.push(`<strong>☀ Jour férié</strong> · ${escapeHtml(meta.holiday.label)}`);
    if (meta.weekend) parts.push('<strong>◒ Week-end</strong>');
    if (unavailable) parts.push(`<strong>▧ Indisponible</strong> · ${escapeHtml(unavailable.reason)}`);
    $('#holidayBanner').hidden = !parts.length;
    $('#holidayBanner').innerHTML = parts.length ? `<div class="calendar-banner ${unavailable ? 'unavailable' : ''}">${parts.join(' &nbsp; · &nbsp; ')}</div>` : '';
  }

  function renderDaySummary() {
    const appointments = activeAppointmentsForDate(dateKey(app.ui.selectedDate));
    const count = appointments.length, minutes = appointments.reduce((sum, appointment) => sum + Number(appointment.duration || 0), 0);
    const predicted = appointments.reduce((sum, appointment) => sum + (Number(appointment.price) || 0), 0);
    const paid = appointments.filter(appointment => appointment.paymentStatus === 'paid').reduce((sum, appointment) => sum + (Number(appointment.price) || 0), 0);
    const buffer = Number(app.state.settings.travelBuffer || 0);
    $('#daySummary').innerHTML = `<span><strong>${count}</strong> RDV</span><span><strong>${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60}` : ''}</strong> de prestation</span><span><strong>${money(predicted) || '—'}</strong> prévu</span>${paid ? `<span><strong>${money(paid)}</strong> encaissé</span>` : ''}${buffer && count > 1 ? `<span class="travel-summary">↝ marge trajet ${buffer} min</span>` : ''}`;
  }

  function routeRow(client) {
    return client.address ? `<button class="route-row" data-waze="${encodeURIComponent(client.address)}" aria-label="Itinéraire vers ${escapeHtml(client.address)}"><span class="route-address">⌖ ${escapeHtml(client.address)}</span><span class="route-icon-small">➤</span></button>` : '';
  }

  function renderDayTimeline() {
    const appointments = appointmentsForDate(dateKey(app.ui.selectedDate));
    const visibleAppointments = appointments.filter(appointment => appointment.status !== 'cancelled');
    if (!appointments.length) {
      $('#dayTimeline').innerHTML = '<button class="timeline-empty-state" data-create-time="10:00"><span>✦</span><p>Aucun rendez-vous. Touche ici pour ajouter un créneau.</p></button>';
      return;
    }
    const firstHour = Math.min(8, ...appointments.map(appointment => Math.floor(toMinutes(appointment.time) / 60)));
    const lastHour = Math.max(20, ...appointments.map(appointment => Math.ceil((toMinutes(appointment.time) + Number(appointment.duration)) / 60)));
    const totalHours = lastHour - firstHour;
    const lines = Array.from({ length: totalHours + 1 }, (_, index) => `<span class="timeline-hour" style="top:${index * HOUR_HEIGHT}px">${pad(firstHour + index)}:00</span><i class="timeline-line" style="top:${index * HOUR_HEIGHT}px"></i>`).join('');
    const empty = Array.from({ length: totalHours }, (_, index) => `<button class="timeline-empty" data-create-time="${pad(firstHour + index)}:00" style="top:${index * HOUR_HEIGHT}px;height:${HOUR_HEIGHT}px" aria-label="Ajouter un rendez-vous à ${pad(firstHour + index)} h"></button>`).join('');
    const buffer = Number(app.state.settings.travelBuffer || 0);
    const blocks = appointments.map((appointment, index) => {
      const client = clientFor(appointment), top = ((toMinutes(appointment.time) - firstHour * 60) / 60) * HOUR_HEIGHT;
      const height = Math.max(68, (Number(appointment.duration) / 60) * HOUR_HEIGHT - 4), hasConflict = hasAppointmentConflict(appointment);
      const next = visibleAppointments.find(item => toMinutes(item.time) > toMinutes(appointment.time));
      const after = next ? toMinutes(next.time) - (toMinutes(appointment.time) + Number(appointment.duration)) : 0;
      const travel = buffer && appointment.status !== 'cancelled' && next && after >= 0 ? `<span class="travel-buffer ${after < buffer ? 'too-short' : ''}" style="top:${top + (Number(appointment.duration) / 60) * HOUR_HEIGHT}px;height:${Math.min(buffer, after) / 60 * HOUR_HEIGHT}px">↝ ${after < buffer ? 'Marge insuffisante' : `Trajet ${buffer} min`}</span>` : '';
      return `<article class="appointment-block ${serviceTheme(appointment.service)} status-${appointment.status} ${hasConflict ? 'conflicted' : ''}" style="top:${top}px;height:${height}px"><button class="appointment-edit" data-edit="${appointment.id}"><span class="appointment-time">${appointment.time} – ${endTime(appointment)}</span><strong class="appointment-name">${escapeHtml(client.name)}</strong><span class="appointment-meta">${escapeHtml(appointment.service)} · ${Number(appointment.duration)} min${appointment.price !== '' ? ` · ${money(appointment.price)}` : ''}</span></button><div class="appointment-footer"><span class="status-badge">${STATUS[appointment.status]}</span>${appointment.paymentStatus === 'paid' ? '<span class="paid-badge">Payé</span>' : ''}${routeRow(client)}</div></article>${travel}`;
    }).join('');
    $('#dayTimeline').innerHTML = `<div class="timeline-inner" style="height:${totalHours * HOUR_HEIGHT}px">${lines}${empty}${blocks}</div>`;
  }

  function renderMonthView() {
    const month = app.ui.monthDate;
    $('#monthLabel').textContent = format(month, { month: 'long', year: 'numeric' });
    const first = localDate(month.getFullYear(), month.getMonth(), 1), last = localDate(month.getFullYear(), month.getMonth() + 1, 0);
    const start = mondayOf(first), end = addDays(last, (7 - ((last.getDay() + 6) % 7) - 1) % 7), dates = [];
    for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
    const headings = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => `<div class="month-weekday">${day}</div>`).join('');
    $('#monthGrid').innerHTML = headings + dates.map(date => {
      const meta = dateMeta(date), unavailable = unavailableForDate(dateKey(date)), count = appointmentsForDate(dateKey(date)).length;
      const selectedWeek = app.ui.overviewWeekStart && sameDay(mondayOf(date), app.ui.overviewWeekStart);
      return `<button class="month-day ${date.getMonth() !== month.getMonth() ? 'muted' : ''} ${meta.weekend ? 'weekend' : ''} ${meta.holiday ? 'holiday' : ''} ${unavailable ? 'unavailable' : ''} ${sameDay(date, new Date()) ? 'today' : ''} ${selectedWeek ? 'selected-week' : ''}" data-select-week="${dateKey(date)}"><span class="month-number">${date.getDate()}</span>${meta.holiday ? '<span class="month-holiday">F</span>' : ''}${unavailable ? '<span class="month-unavailable">×</span>' : ''}${count ? `<span class="month-event-count">${count}</span>` : ''}</button>`;
    }).join('');
    renderWeekOverview();
  }

  function renderWeekOverview() {
    const target = $('#weekOverview');
    if (!app.ui.overviewWeekStart) { target.hidden = true; return; }
    const days = Array.from({ length: 7 }, (_, index) => addDays(app.ui.overviewWeekStart, index));
    const cards = days.map(date => {
      const meta = dateMeta(date), unavailable = unavailableForDate(dateKey(date)), appointments = appointmentsForDate(dateKey(date));
      const content = appointments.length ? appointments.map(appointment => { const client = clientFor(appointment); return `<button class="overview-appointment ${serviceTheme(appointment.service)}" data-edit="${appointment.id}"><span class="overview-time">${appointment.time}</span><span><strong>${escapeHtml(client.name)}</strong><span>${escapeHtml(appointment.service)} · fin ${endTime(appointment)}</span></span><span class="mini-status">${STATUS[appointment.status]}</span></button>`; }).join('') : '<p>Aucun rendez-vous</p>';
      return `<article class="overview-day ${meta.weekend ? 'weekend' : ''} ${meta.holiday ? 'holiday' : ''} ${unavailable ? 'unavailable' : ''}"><h3>${format(date, { weekday: 'long', day: 'numeric', month: 'short' })}${meta.holiday ? ` <small>· Férié : ${escapeHtml(meta.holiday.label)}</small>` : ''}${unavailable ? ` <small>· ${escapeHtml(unavailable.reason)}</small>` : ''}</h3>${content}</article>`;
    }).join('');
    target.hidden = false;
    target.innerHTML = `<div class="week-overview-header"><h2>Semaine du ${format(app.ui.overviewWeekStart, { day: 'numeric', month: 'long' })}</h2><button class="text-button" data-close-overview>Retour au mois</button></div><div class="week-overview-list">${cards}</div>`;
  }

  function clientHistory(clientId) { return app.state.appointments.filter(appointment => appointment.clientId === clientId).sort((a, b) => appointmentTimestamp(b) - appointmentTimestamp(a)); }
  function clientLastAppointment(clientId) { return clientHistory(clientId)[0] || null; }

  function renderClients() {
    const query = ($('#clientSearch')?.value || '').trim().toLocaleLowerCase('fr-FR');
    const clients = [...app.state.clients].filter(client => `${client.name} ${client.phone} ${client.address}`.toLocaleLowerCase('fr-FR').includes(query)).sort((a, b) => appointmentTimestamp(clientLastAppointment(b.id) || { date: '1900-01-01', time: '00:00' }) - appointmentTimestamp(clientLastAppointment(a.id) || { date: '1900-01-01', time: '00:00' }));
    $('#clientList').innerHTML = clients.length ? clients.map(client => {
      const latest = clientLastAppointment(client.id);
      return `<button class="client-card" data-client="${client.id}"><span class="client-initial">${escapeHtml(client.name[0]?.toUpperCase() || '?')}</span><span><h3>${escapeHtml(client.name)}</h3><p>${latest ? `Dernier RDV · ${format(parseDate(latest.date), { day: 'numeric', month: 'short' })} · ${escapeHtml(latest.service)}` : 'Aucun rendez-vous'}${client.address ? ` · ${escapeHtml(client.address)}` : ''}</p></span><span class="chevron">›</span></button>`;
    }).join('') : '<section class="empty-message"><h2>Aucune cliente</h2><p>Les clientes se créeront lors de tes prochains rendez-vous.</p></section>';
  }

  function renderScreen() {
    $('#agendaScreen').hidden = app.ui.screen !== 'agenda'; $('#clientsScreen').hidden = app.ui.screen !== 'clients';
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.screen === app.ui.screen));
  }

  function showScreen(screen) {
    if (screen === 'settings') { openSettings(); return; }
    app.ui.screen = screen; renderScreen(); if (screen === 'clients') renderClients();
  }

  function resetAppointmentForm() {
    $('#appointmentForm').reset(); $('#appointmentId').value = ''; $('#date').value = dateKey(app.ui.selectedDate); $('#time').value = '10:00'; $('#duration').value = '60';
    $('#status').value = 'to_confirm'; $('#paymentStatus').value = 'pending'; $('#paymentMethod').value = ''; $('#repeatWeeks').value = '0';
    $('#clientSuggestions').hidden = true; $('#conflictHint').hidden = true; app.ui.editingAppointmentId = null; app.ui.formClientId = null;
  }

  function openAppointment(appointment = null, defaults = {}) {
    resetAppointmentForm();
    $('#appointmentFormTitle').textContent = appointment ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'; $('#deleteAppointment').hidden = !appointment;
    if (appointment) {
      const client = clientFor(appointment); app.ui.editingAppointmentId = appointment.id; app.ui.formClientId = client.id; $('#appointmentId').value = appointment.id;
      $('#clientName').value = client.name; $('#phone').value = client.phone; $('#date').value = appointment.date; $('#time').value = appointment.time; $('#duration').value = String(appointment.duration); $('#price').value = appointment.price; $('#service').value = appointment.service; $('#address').value = client.address; $('#status').value = appointment.status; $('#paymentStatus').value = appointment.paymentStatus; $('#paymentMethod').value = appointment.paymentMethod; $('#notes').value = appointment.notes;
    } else if (defaults.from) {
      const prior = defaults.from, client = clientFor(prior); app.ui.formClientId = client.id; $('#clientName').value = client.name; $('#phone').value = client.phone; $('#address').value = client.address; $('#service').value = prior.service; $('#duration').value = String(prior.duration); $('#price').value = prior.price; $('#date').value = defaults.date || dateKey(app.ui.selectedDate); $('#time').value = defaults.time || prior.time;
    } else { $('#date').value = defaults.date || dateKey(app.ui.selectedDate); $('#time').value = defaults.time || '10:00'; }
    updateConflictHint(); $('#appointmentDialog').showModal(); setTimeout(() => $('#clientName').focus(), 30);
  }

  function fillFromClient(client) {
    app.ui.formClientId = client.id; $('#clientName').value = client.name; $('#phone').value = client.phone || ''; $('#address').value = client.address || ''; $('#clientSuggestions').hidden = true; updateConflictHint();
  }

  function renderSuggestions() {
    const input = $('#clientName'), term = normaliseName(input.value), target = $('#clientSuggestions');
    const matches = term ? app.state.clients.filter(client => normaliseName(client.name).includes(term)).slice(0, 6) : [];
    if (!matches.length) { target.hidden = true; return; }
    target.hidden = false;
    target.innerHTML = matches.map(client => `<button type="button" class="client-suggestion" data-suggestion="${client.id}"><strong>${escapeHtml(client.name)}</strong><span>${escapeHtml(client.phone || 'Sans téléphone')}${client.address ? ` · ${escapeHtml(client.address)}` : ''}</span></button>`).join('');
  }

  function getDraft() {
    return { id: app.ui.editingAppointmentId || $('#appointmentId').value || uuid(), clientId: app.ui.formClientId, clientName: $('#clientName').value.trim(), phone: $('#phone').value.trim(), address: $('#address').value.trim(), date: $('#date').value, time: $('#time').value, duration: Number($('#duration').value), price: $('#price').value.trim(), service: $('#service').value.trim(), status: $('#status').value, paymentStatus: $('#paymentStatus').value, paymentMethod: $('#paymentMethod').value, notes: $('#notes').value.trim(), repeatWeeks: Number($('#repeatWeeks').value) };
  }

  function updateConflictHint() {
    const date = $('#date').value, time = $('#time').value, duration = Number($('#duration').value);
    if (!date || !time || !duration) { $('#conflictHint').hidden = true; return; }
    const conflicts = findConflicts({ id: app.ui.editingAppointmentId, date, time, duration, status: $('#status').value });
    const selected = parseDate(date), meta = selected ? dateMeta(selected) : { holiday: null, weekend: false };
    const messages = [];
    if (conflicts.length) messages.push(`Attention : ${conflicts.filter(item => item.type === 'appointment').length ? 'la marge ou le créneau chevauche un rendez-vous' : 'ce jour est indisponible'}.`);
    if (meta.holiday) messages.push(`Jour férié : ${meta.holiday.label}.`); else if (meta.weekend) messages.push('Ce créneau est un week-end.');
    $('#conflictHint').hidden = !messages.length; $('#conflictHint').textContent = messages.join(' ');
  }

  function ensureClient(draft) {
    let client = draft.clientId ? clientById(draft.clientId) : null;
    if (!client) { client = { id: uuid(), name: draft.clientName, phone: draft.phone, address: draft.address, notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; app.state.clients.push(client); }
    else { client.name = draft.clientName; client.phone = draft.phone; client.address = draft.address; client.updatedAt = new Date().toISOString(); }
    return client;
  }

  function createRecurringAppointment(appointment, weeks) {
    if (!weeks) return '';
    const date = addDays(parseDate(appointment.date), weeks * 7), repeated = { ...appointment, id: uuid(), date: dateKey(date), status: 'to_confirm', paymentStatus: 'pending', paymentMethod: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const conflicts = findConflicts(repeated);
    if (conflicts.length) return `Le prochain RDV dans ${weeks} semaines n’a pas été créé : ce créneau est déjà occupé ou indisponible.`;
    app.state.appointments.push(repeated); return `Le prochain RDV a été créé le ${format(date, { day: 'numeric', month: 'long' })}, à confirmer.`;
  }

  function commitDraft(draft) {
    const client = ensureClient(draft);
    const existing = app.state.appointments.find(item => item.id === draft.id);
    const appointment = { id: draft.id, clientId: client.id, date: draft.date, time: draft.time, duration: draft.duration, price: draft.price, service: draft.service, status: draft.status, paymentStatus: draft.paymentStatus, paymentMethod: draft.paymentMethod, notes: draft.notes, createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    const index = app.state.appointments.findIndex(item => item.id === appointment.id);
    if (index === -1) app.state.appointments.push(appointment); else app.state.appointments[index] = appointment;
    const recurrenceMessage = createRecurringAppointment(appointment, draft.repeatWeeks);
    app.ui.selectedDate = parseDate(appointment.date) || app.ui.selectedDate; app.ui.weekStart = mondayOf(app.ui.selectedDate); app.ui.monthDate = localDate(app.ui.selectedDate.getFullYear(), app.ui.selectedDate.getMonth(), 1);
    saveState(); $('#appointmentDialog').close(); render(); if (recurrenceMessage) window.alert(recurrenceMessage);
  }

  function openConflictDialog(draft, conflicts) {
    app.ui.pendingDraft = draft;
    $('#conflictList').innerHTML = conflicts.map(conflict => {
      if (conflict.type === 'unavailable') return `<article class="conflict-item"><strong>Jour indisponible</strong><span>${escapeHtml(conflict.unavailable.reason)}</span></article>`;
      const appointment = conflict.appointment;
      return `<article class="conflict-item"><strong>${escapeHtml(clientFor(appointment).name)}</strong><span>${appointment.time} – ${endTime(appointment)} · ${escapeHtml(appointment.service)}${conflict.direct ? '' : ' · marge trajet'}</span></article>`;
    }).join('');
    $('#conflictDialog').showModal();
  }

  function openUnavailable(date = app.ui.selectedDate) {
    const existing = unavailableForDate(dateKey(date)); $('#unavailableForm').reset(); $('#unavailableId').value = existing?.id || ''; $('#unavailableDate').value = existing?.date || dateKey(date); $('#unavailableReason').value = existing?.reason || ''; $('#unavailableTitle').textContent = existing ? 'Modifier indisponibilité' : 'Jour indisponible'; $('#deleteUnavailable').hidden = !existing; $('#unavailableDialog').showModal();
  }

  function openRouteDay() {
    const appointments = activeAppointmentsForDate(dateKey(app.ui.selectedDate)).filter(appointment => clientFor(appointment).address);
    $('#routeDate').textContent = format(app.ui.selectedDate, { weekday: 'long', day: 'numeric', month: 'long' });
    $('#routeList').innerHTML = appointments.length ? appointments.map(appointment => { const client = clientFor(appointment); return `<article class="route-item"><span class="route-time">${appointment.time}</span><span><strong>${escapeHtml(client.name)}</strong><small>${escapeHtml(client.address)}</small></span><button class="route-icon" data-waze="${encodeURIComponent(client.address)}" aria-label="Itinéraire">⌖</button></article>`; }).join('') : '<p class="empty-route">Aucun rendez-vous avec adresse ce jour-là.</p>';
    $('#routeDialog').showModal();
  }

  function openClient(clientId) {
    const client = clientById(clientId); if (!client) return;
    $('#profileKey').value = client.id; $('#profileName').value = client.name; $('#profilePhone').value = client.phone; $('#profileAddress').value = client.address; $('#profileNotes').value = client.notes; $('#profileWaze').hidden = !client.address;
    const history = clientHistory(client.id).slice(0, 8);
    $('#clientHistory').innerHTML = `<p class="history-label">Historique</p>${history.length ? history.map(appointment => `<article class="history-item"><span><strong>${format(parseDate(appointment.date), { day: 'numeric', month: 'short' })} · ${escapeHtml(appointment.service)}</strong><small>${appointment.time} · ${STATUS[appointment.status]}${appointment.price !== '' ? ` · ${money(appointment.price)}` : ''}</small></span><button class="small-reuse" data-repeat-from="${appointment.id}">↻ Reprendre</button></article>`).join('') : '<p class="small-copy">Aucun rendez-vous enregistré.</p>'}`;
    $('#clientDialog').showModal();
  }

  function openSettings() {
    $('#travelBuffer').value = String(app.state.settings.travelBuffer || 0);
    const last = app.state.settings.lastBackupAt ? new Date(app.state.settings.lastBackupAt) : null;
    $('#backupStatus').textContent = last ? `Dernière sauvegarde : ${format(last, { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Aucune sauvegarde enregistrée.';
    $('#settingsDialog').showModal();
  }

  function exportData() {
    app.state.settings.lastBackupAt = new Date().toISOString(); saveState();
    const content = { version: 6, exportedAt: app.state.settings.lastBackupAt, state: app.state };
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `sauvegarde-agenda-${dateKey(new Date())}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); renderHeader();
  }

  async function importData(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()), migrated = migrateState(data?.state || data, data?.clientProfiles || {});
      if (!migrated.clients.length && !migrated.appointments.length) throw new Error('empty');
      if (!window.confirm('Remplacer les rendez-vous, clientes et réglages actuels par cette sauvegarde ?')) return;
      app.state = migrated; saveState(); $('#settingsDialog').close(); render();
    } catch { window.alert('Cette sauvegarde ne semble pas valide.'); }
  }

  function setMode(mode) { app.ui.mode = mode; if (mode === 'month') app.ui.monthDate = localDate(app.ui.selectedDate.getFullYear(), app.ui.selectedDate.getMonth(), 1); renderAgenda(); }

  document.addEventListener('click', event => {
    const target = event.target.closest('button'); if (!target) return;
    if (target.dataset.close) { $(`#${target.dataset.close}`).close(); return; }
    if (target.dataset.mode) { setMode(target.dataset.mode); return; }
    if (target.dataset.screen) { showScreen(target.dataset.screen); return; }
    if (target.id === 'backToAgenda') { showScreen('agenda'); return; }
    if (target.id === 'addAppointment') { openAppointment(); return; }
    if (target.id === 'previousPeriod') { app.ui.weekStart = addDays(app.ui.weekStart, -7); app.ui.selectedDate = app.ui.weekStart; renderAgenda(); return; }
    if (target.id === 'nextPeriod') { app.ui.weekStart = addDays(app.ui.weekStart, 7); app.ui.selectedDate = app.ui.weekStart; renderAgenda(); return; }
    if (target.id === 'previousMonth') { app.ui.monthDate = localDate(app.ui.monthDate.getFullYear(), app.ui.monthDate.getMonth() - 1, 1); app.ui.overviewWeekStart = null; renderAgenda(); return; }
    if (target.id === 'nextMonth') { app.ui.monthDate = localDate(app.ui.monthDate.getFullYear(), app.ui.monthDate.getMonth() + 1, 1); app.ui.overviewWeekStart = null; renderAgenda(); return; }
    if (target.id === 'todayButton') { app.ui.selectedDate = startOfDay(new Date()); app.ui.weekStart = mondayOf(app.ui.selectedDate); renderAgenda(); return; }
    if (target.id === 'routeDay') { openRouteDay(); return; }
    if (target.id === 'toggleUnavailable') { openUnavailable(); return; }
    if (target.id === 'deleteAppointment') { if (app.ui.editingAppointmentId && window.confirm('Supprimer ce rendez-vous ?')) { app.state.appointments = app.state.appointments.filter(appointment => appointment.id !== app.ui.editingAppointmentId); saveState(); $('#appointmentDialog').close(); render(); } return; }
    if (target.id === 'deleteUnavailable') { const id = $('#unavailableId').value; if (id && window.confirm('Supprimer cette indisponibilité ?')) { app.state.unavailableDays = app.state.unavailableDays.filter(item => item.id !== id); saveState(); $('#unavailableDialog').close(); render(); } return; }
    if (target.id === 'changeConflict') { $('#conflictDialog').close(); return; }
    if (target.id === 'confirmConflict') { const draft = app.ui.pendingDraft; $('#conflictDialog').close(); app.ui.pendingDraft = null; if (draft) commitDraft(draft); return; }
    if (target.id === 'exportData' || target.id === 'backupButton' || target.id === 'backupNotice') { exportData(); return; }
    if (target.id === 'profileWaze') { openWaze($('#profileAddress').value.trim()); return; }
    if (target.dataset.selectDate) { app.ui.selectedDate = parseDate(target.dataset.selectDate); app.ui.weekStart = mondayOf(app.ui.selectedDate); renderAgenda(); return; }
    if (target.dataset.selectWeek) { const date = parseDate(target.dataset.selectWeek); app.ui.overviewWeekStart = mondayOf(date); app.ui.selectedDate = date; renderAgenda(); return; }
    if (target.dataset.closeOverview !== undefined) { app.ui.overviewWeekStart = null; renderAgenda(); return; }
    if (target.dataset.edit) { const appointment = app.state.appointments.find(item => item.id === target.dataset.edit); if (appointment) openAppointment(appointment); return; }
    if (target.dataset.repeatFrom) { const appointment = app.state.appointments.find(item => item.id === target.dataset.repeatFrom); if (appointment) { $('#clientDialog').close(); openAppointment(null, { from: appointment }); } return; }
    if (target.dataset.waze) { openWaze(decodeURIComponent(target.dataset.waze)); return; }
    if (target.dataset.createTime) { openAppointment(null, { date: dateKey(app.ui.selectedDate), time: target.dataset.createTime }); return; }
    if (target.dataset.suggestion) { const client = clientById(target.dataset.suggestion); if (client) fillFromClient(client); return; }
    if (target.dataset.client) { openClient(target.dataset.client); }
  });

  $('#appointmentForm').addEventListener('submit', event => {
    event.preventDefault(); if (!$('#appointmentForm').reportValidity()) return;
    const draft = getDraft(); if (!draft.clientName || !draft.service || !draft.date || !draft.time) return;
    const conflicts = findConflicts(draft); if (conflicts.length) openConflictDialog(draft, conflicts); else commitDraft(draft);
  });
  $('#unavailableForm').addEventListener('submit', event => {
    event.preventDefault(); if (!$('#unavailableForm').reportValidity()) return;
    const id = $('#unavailableId').value, record = { id: id || uuid(), date: $('#unavailableDate').value, reason: $('#unavailableReason').value.trim() || 'Indisponible' };
    const index = app.state.unavailableDays.findIndex(item => item.id === record.id); if (index === -1) app.state.unavailableDays.push(record); else app.state.unavailableDays[index] = record;
    app.ui.selectedDate = parseDate(record.date); app.ui.weekStart = mondayOf(app.ui.selectedDate); saveState(); $('#unavailableDialog').close(); render();
  });
  $('#settingsForm').addEventListener('submit', event => { event.preventDefault(); app.state.settings.travelBuffer = Number($('#travelBuffer').value); saveState(); $('#settingsDialog').close(); render(); });
  $('#clientForm').addEventListener('submit', event => {
    event.preventDefault(); if (!$('#clientForm').reportValidity()) return;
    const client = clientById($('#profileKey').value); if (!client) return;
    client.name = $('#profileName').value.trim(); client.phone = $('#profilePhone').value.trim(); client.address = $('#profileAddress').value.trim(); client.notes = $('#profileNotes').value.trim(); client.updatedAt = new Date().toISOString(); saveState(); $('#clientDialog').close(); render();
  });

  $('#clientName').addEventListener('input', event => {
    const exact = app.state.clients.find(client => normaliseName(client.name) === normaliseName(event.target.value));
    if (exact) fillFromClient(exact); else { app.ui.formClientId = null; renderSuggestions(); }
  });
  $('#clientName').addEventListener('focus', renderSuggestions);
  $('#clientName').addEventListener('blur', () => setTimeout(() => { $('#clientSuggestions').hidden = true; }, 150));
  ['#date', '#time', '#duration', '#status'].forEach(selector => $(selector).addEventListener('input', updateConflictHint));
  $('#clientSearch').addEventListener('input', renderClients);
  $('#importData').addEventListener('change', event => importData(event.target.files[0]));

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
  render();
})();
