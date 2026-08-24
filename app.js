(() => {
  'use strict';

  const CURRENT_DATA_VERSION = 8;
  const BACKUP_FORMAT_VERSION = 2;
  const BACKUP_APP_ID = 'mon-agenda-prothesiste';
  const STATE_KEY = 'nail-planner-state-v8';
  const V7_KEY = 'nail-planner-state-v7';
  const V6_KEY = 'nail-planner-state-v6';
  const V5_KEY = 'nail-planner-state-v5';
  const LEGACY_APPOINTMENTS_KEY = 'nail-planner-v1';
  const LEGACY_PROFILES_KEY = 'nail-client-profiles-v1';
  const RESTORE_SAFETY_KEY = 'nail-planner-before-restore-v8';
  const HOUR_HEIGHT = 68;
  const STATUS = {
    to_confirm: 'À confirmer', confirmed: 'Confirmé', completed: 'Terminé',
    cancelled: 'Annulé', no_show: 'Absente'
  };
  const PAYMENT = { pending: 'À régler', paid: 'Payé' };
  const METHOD = { cash: 'Espèces', card: 'Carte', transfer: 'Virement', other: 'Autre' };
  const COLORS = ['rose', 'purple', 'orange', 'teal'];
  const DAYS = [
    { key: 1, label: 'Lundi', short: 'Lun' }, { key: 2, label: 'Mardi', short: 'Mar' },
    { key: 3, label: 'Mercredi', short: 'Mer' }, { key: 4, label: 'Jeudi', short: 'Jeu' },
    { key: 5, label: 'Vendredi', short: 'Ven' }, { key: 6, label: 'Samedi', short: 'Sam' },
    { key: 0, label: 'Dimanche', short: 'Dim' }
  ];
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const pad = value => String(value).padStart(2, '0');
  const uuid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const localDate = (year, month, day) => new Date(year, month, day, 12, 0, 0, 0);
  const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const todayKey = () => dateKey(new Date());
  const parseDate = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]), date = localDate(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  };
  const validDate = value => Boolean(parseDate(value));
  const validTime = value => {
    const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
    return Boolean(match) && Number(match[1]) < 24 && Number(match[2]) < 60;
  };
  const startOfDay = date => localDate(date.getFullYear(), date.getMonth(), date.getDate());
  const addDays = (date, days) => { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy; };
  const mondayOf = date => addDays(startOfDay(date), -((date.getDay() + 6) % 7));
  const sameDay = (one, two) => dateKey(one) === dateKey(two);
  const normaliseName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ');
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const format = (date, options) => new Intl.DateTimeFormat('fr-FR', options).format(date);
  const safeJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } };
  const activeAppointment = appointment => !['cancelled', 'no_show'].includes(appointment.status);
  const isWeekend = date => date.getDay() === 0 || date.getDay() === 6;
  const money = value => value === '' || value === null || value === undefined || Number.isNaN(Number(value)) ? '' : `${Number(value).toLocaleString('fr-FR')} €`;

  function toMinutes(time) {
    const [hours, minutes] = String(time || '').split(':').map(Number);
    return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0;
  }

  function timeText(minutes) {
    const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  }

  function dateTimeMs(date, time = '00:00') {
    const day = parseDate(date);
    if (!day || !validTime(time)) return NaN;
    const [hours, minutes] = time.split(':').map(Number);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0).getTime();
  }

  const appointmentStart = appointment => dateTimeMs(appointment.date, appointment.time || '00:00');
  const appointmentEnd = appointment => appointmentStart(appointment) + Number(appointment.duration || 0) * 60000;
  const appointmentTimestamp = appointment => appointmentStart(appointment);
  const endTime = appointment => timeText(toMinutes(appointment.time) + Number(appointment.duration || 0));
  const intersects = (startOne, endOne, startTwo, endTwo) => startOne < endTwo && endOne > startTwo;
  const pickDate = value => /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : '';

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
    return { weekend: isWeekend(date), holiday: frenchHolidays(date.getFullYear()).find(item => item.key === dateKey(date)) || null };
  }

  function defaultWorkingHours() {
    const hours = {};
    for (let day = 0; day < 7; day += 1) {
      hours[day] = { enabled: day >= 1 && day <= 5, start: '09:00', end: '19:00', breakStart: '', breakEnd: '' };
    }
    return hours;
  }

  function defaultServices() {
    return [
      { id: 'preset-pose-complete', name: 'Pose complète', duration: 60, price: '', color: 'rose', active: true },
      { id: 'preset-remplissage', name: 'Remplissage', duration: 60, price: '', color: 'purple', active: true },
      { id: 'preset-depose', name: 'Dépose', duration: 30, price: '', color: 'orange', active: true },
      { id: 'preset-nail-art', name: 'Nail art', duration: 30, price: '', color: 'teal', active: true }
    ];
  }

  function normaliseHours(raw) {
    const defaults = defaultWorkingHours(), result = {};
    for (let day = 0; day < 7; day += 1) {
      const source = raw?.[day] || raw?.[String(day)] || {}, fallback = defaults[day];
      const start = validTime(source.start) ? source.start : fallback.start;
      const end = validTime(source.end) && toMinutes(source.end) > toMinutes(start) ? source.end : fallback.end;
      const breakStart = validTime(source.breakStart) ? source.breakStart : '';
      const breakEnd = validTime(source.breakEnd) ? source.breakEnd : '';
      const validBreak = breakStart && breakEnd && toMinutes(breakStart) < toMinutes(breakEnd) && toMinutes(breakStart) >= toMinutes(start) && toMinutes(breakEnd) <= toMinutes(end);
      result[day] = { enabled: source.enabled === undefined ? fallback.enabled : Boolean(source.enabled), start, end, breakStart: validBreak ? breakStart : '', breakEnd: validBreak ? breakEnd : '' };
    }
    return result;
  }

  function normaliseServices(raw) {
    const source = Array.isArray(raw) ? raw : defaultServices();
    const services = [], byId = new Map(), legacyNames = new Set();
    source.forEach((item, index) => {
      const name = String(item?.name || '').trim(), nameKey = normaliseName(name), suppliedId = String(item?.id || '').trim();
      if (!name || (suppliedId && byId.has(suppliedId)) || (!suppliedId && legacyNames.has(nameKey))) return;
      const service = {
        id: suppliedId || `service-${index}-${uuid()}`, name,
        duration: Math.max(15, Number(item.duration) || 60),
        price: item.price === '' || item.price === null || item.price === undefined ? '' : String(item.price),
        color: COLORS.includes(item.color) ? item.color : COLORS[index % COLORS.length], active: item.active !== false
      };
      services.push(service); byId.set(service.id, service); if (!suppliedId) legacyNames.add(nameKey);
    });
    return services;
  }

  function validAppointment(raw) {
    return raw && typeof raw === 'object' && validDate(raw.date) && validTime(raw.time);
  }

  function normaliseBlock(raw) {
    const allDay = Boolean(raw?.allDay) || Boolean(raw?.date && !raw?.startDate && !raw?.startTime);
    const startDate = pickDate(raw?.startDate || raw?.date);
    if (!validDate(startDate)) return null;
    if (allDay) return { id: String(raw.id || uuid()), allDay: true, startDate, startTime: '00:00', endDate: startDate, endTime: '00:00', reason: String(raw.reason || raw.label || 'Créneau bloqué').trim() || 'Créneau bloqué' };
    const endDate = pickDate(raw?.endDate || startDate), startTime = validTime(raw?.startTime) ? raw.startTime : '09:00', endTime = validTime(raw?.endTime) ? raw.endTime : '10:00';
    if (!validDate(endDate) || dateTimeMs(endDate, endTime) <= dateTimeMs(startDate, startTime)) return null;
    return { id: String(raw.id || uuid()), allDay: false, startDate, startTime, endDate, endTime, reason: String(raw.reason || raw.label || 'Créneau bloqué').trim() || 'Créneau bloqué' };
  }

  function migrateState(source, legacyProfiles = {}, options = {}) {
    const data = source?.state || source || {}, strict = Boolean(options.strict), clients = [], clientsById = new Map(), firstClientByName = new Map();
    if (strict && !Array.isArray(data)) {
      for (const key of ['clients', 'appointments', 'blocks', 'blockedSlots', 'unavailableDays']) {
        if (Object.prototype.hasOwnProperty.call(data, key) && !Array.isArray(data[key])) throw new Error('INVALID_STRUCTURE');
      }
      if (Object.prototype.hasOwnProperty.call(data, 'settings') && (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings))) throw new Error('INVALID_STRUCTURE');
      if (Object.prototype.hasOwnProperty.call(data, 'clientProfiles') && (!data.clientProfiles || typeof data.clientProfiles !== 'object' || Array.isArray(data.clientProfiles))) throw new Error('INVALID_STRUCTURE');
    }
    if (strict && Array.isArray(data.clients)) {
      const clientIds = data.clients.map(client => String(client?.id || '').trim()).filter(Boolean);
      if (data.clients.some(client => !String(client?.name || client?.client || client?.clientName || '').trim()) || new Set(clientIds).size !== clientIds.length) throw new Error('INVALID_CLIENT');
    }
    const mergeMissingClientFields = (client, raw) => {
      client.phone ||= String(raw?.phone || '').trim(); client.address ||= String(raw?.address || '').trim(); client.notes ||= String(raw?.notes || '').trim();
      return client;
    };
    const addClient = (raw, { dedupeByName = false, fallbackName = '' } = {}) => {
      const name = String(raw?.name || raw?.client || raw?.clientName || fallbackName || '').trim();
      if (!name) return null;
      const suppliedId = String(raw?.id || raw?.clientId || '').trim(), nameKey = normaliseName(name);
      if (suppliedId && clientsById.has(suppliedId)) return mergeMissingClientFields(clientsById.get(suppliedId), raw);
      if (!suppliedId && dedupeByName && firstClientByName.has(nameKey)) return mergeMissingClientFields(firstClientByName.get(nameKey), raw);
      const client = {
        id: suppliedId || uuid(), name, phone: String(raw?.phone || '').trim(), address: String(raw?.address || '').trim(), notes: String(raw?.notes || '').trim(),
        createdAt: raw?.createdAt || new Date().toISOString(), updatedAt: raw?.updatedAt || new Date().toISOString()
      };
      clients.push(client); clientsById.set(client.id, client); if (!firstClientByName.has(nameKey)) firstClientByName.set(nameKey, client); return client;
    };
    if (Array.isArray(data.clients)) data.clients.forEach(raw => addClient(raw, { dedupeByName: !raw?.id }));
    const suppliedProfiles = legacyProfiles && typeof legacyProfiles === 'object' && !Array.isArray(legacyProfiles) ? legacyProfiles : {};
    const profiles = Object.keys(suppliedProfiles).length ? suppliedProfiles : data.clientProfiles || {};
    Object.entries(profiles).forEach(([legacyName, raw]) => addClient(raw, { dedupeByName: !raw?.id, fallbackName: legacyName }));

    const rawSettings = data.settings || {};
    if (strict && Object.prototype.hasOwnProperty.call(rawSettings, 'services') && !Array.isArray(rawSettings.services)) throw new Error('INVALID_STRUCTURE');
    if (strict && Array.isArray(rawSettings.services)) {
      const serviceIds = rawSettings.services.map(service => String(service?.id || '').trim()).filter(Boolean);
      if (rawSettings.services.some(service => !String(service?.name || '').trim()) || new Set(serviceIds).size !== serviceIds.length) throw new Error('INVALID_SERVICE');
    }
    const services = normaliseServices(rawSettings.services);
    const serviceByName = name => services.find(service => normaliseName(service.name) === normaliseName(name));
    const ensureService = (name, duration, price, color) => {
      const found = serviceByName(name);
      if (found) return found;
      const service = { id: uuid(), name: String(name || 'Prestation').trim() || 'Prestation', duration: Math.max(15, Number(duration) || 60), price: price === '' || price === undefined || price === null ? '' : String(price), color: COLORS.includes(color) ? color : 'rose', active: true };
      services.push(service); return service;
    };
    const rawAppointments = Array.isArray(data.appointments) ? data.appointments : Array.isArray(data) ? data : [];
    if (strict) {
      const appointmentIds = rawAppointments.map(appointment => String(appointment?.id || '').trim()).filter(Boolean);
      if (rawAppointments.some(raw => !validAppointment(raw)) || new Set(appointmentIds).size !== appointmentIds.length) throw new Error('INVALID_APPOINTMENT');
    }
    const appointments = rawAppointments.filter(validAppointment).map(raw => {
      const requestedClientId = String(raw.clientId || '').trim(), legacyName = String(raw.name || raw.client || raw.clientName || '').trim();
      let client = requestedClientId ? clientsById.get(requestedClientId) : null;
      if (!client && requestedClientId) client = addClient({ ...raw, id: requestedClientId }, { fallbackName: legacyName || 'Cliente sans nom' });
      client ||= firstClientByName.get(normaliseName(legacyName)) || addClient(raw, { dedupeByName: true }) || addClient({ name: 'Cliente sans nom' }, { dedupeByName: true });
      let service = raw.serviceId ? services.find(item => item.id === raw.serviceId) : null;
      service ||= serviceByName(raw.service || 'Prestation') || ensureService(raw.service || 'Prestation', raw.duration, raw.price, raw.serviceColor);
      const paymentStatus = raw.paymentStatus === 'paid' ? 'paid' : 'pending';
      const paymentDate = paymentStatus === 'paid' ? (pickDate(raw.paymentDate) || pickDate(raw.paidAt) || raw.date) : '';
      return {
        id: String(raw.id || uuid()), clientId: client.id, date: raw.date, time: raw.time, duration: Math.max(15, Number(raw.duration) || 60),
        price: raw.price === '' || raw.price === null || raw.price === undefined ? '' : String(raw.price), service: String(raw.service || service.name || 'Prestation').trim(),
        serviceId: service.id, serviceColor: COLORS.includes(raw.serviceColor) ? raw.serviceColor : service.color,
        notes: String(raw.notes || '').trim(), status: STATUS[raw.status] ? raw.status : 'confirmed', paymentStatus,
        paymentDate, paymentMethod: METHOD[raw.paymentMethod] ? raw.paymentMethod : '', cancellationReason: String(raw.cancellationReason || raw.statusReason || raw.reason || '').trim(),
        recurrenceId: String(raw.recurrenceId || '').trim(), parentAppointmentId: String(raw.parentAppointmentId || raw.sourceAppointmentId || '').trim(),
        createdAt: raw.createdAt || new Date().toISOString(), updatedAt: raw.updatedAt || new Date().toISOString()
      };
    });
    const rawBlocks = Array.isArray(data.blocks) ? data.blocks : Array.isArray(data.blockedSlots) ? data.blockedSlots : Array.isArray(data.unavailableDays) ? data.unavailableDays : [];
    if (strict && rawBlocks.some(raw => !normaliseBlock(raw))) throw new Error('INVALID_BLOCK');
    const blocks = rawBlocks.map(normaliseBlock).filter(Boolean);
    const settings = { lastBackupAt: rawSettings.lastBackupAt || null, workingHours: normaliseHours(rawSettings.workingHours || rawSettings.workHours), services };
    return { version: CURRENT_DATA_VERSION, clients, appointments, blocks, settings };
  }

  function loadState() {
    const current = safeJson(STATE_KEY, null);
    if (Number(current?.version) === CURRENT_DATA_VERSION) return migrateState(current);
    const v7 = safeJson(V7_KEY, null);
    if (v7?.clients || v7?.appointments || v7?.blocks || v7?.settings) return migrateState(v7);
    const v6 = safeJson(V6_KEY, null);
    if (v6?.clients || v6?.appointments) return migrateState(v6);
    const v5 = safeJson(V5_KEY, null);
    if (v5?.clients || v5?.appointments) return migrateState(v5);
    return migrateState({ appointments: safeJson(LEGACY_APPOINTMENTS_KEY, []) }, safeJson(LEGACY_PROFILES_KEY, {}));
  }

  const app = {
    state: loadState(),
    ui: {
      screen: 'agenda', mode: 'week', selectedDate: startOfDay(new Date()), weekStart: mondayOf(new Date()),
      monthDate: localDate(new Date().getFullYear(), new Date().getMonth(), 1), overviewWeekStart: null,
      editingAppointmentId: null, editingBlockId: null, pendingDraft: null, formClientId: null, formServiceColor: 'rose', repeatDateEdited: false,
      reportMode: 'week', reportTab: 'activity', reportDate: startOfDay(new Date())
    }
  };
  const cloneState = state => JSON.parse(JSON.stringify(state));
  const saveState = (state = app.state, silent = false) => {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); return true; }
    catch {
      if (!silent) window.alert('Impossible d’enregistrer sur cet appareil. Tes changements n’ont pas été appliqués. Libère un peu d’espace, puis réessaie.');
      return false;
    }
  };
  saveState();

  const clientById = id => app.state.clients.find(client => client.id === id) || null;
  const clientFor = appointment => clientById(appointment.clientId) || { id: '', name: 'Cliente supprimée', phone: '', address: '', notes: '' };
  const serviceById = id => app.state.settings.services.find(service => service.id === id) || null;
  const serviceByName = name => app.state.settings.services.find(service => normaliseName(service.name) === normaliseName(name)) || null;
  const appointmentsForDate = key => app.state.appointments.filter(appointment => appointment.date === key).sort((a, b) => a.time.localeCompare(b.time));
  const activeAppointmentsForDate = key => appointmentsForDate(key).filter(activeAppointment);
  const sortedAppointments = () => [...app.state.appointments].sort((a, b) => appointmentTimestamp(a) - appointmentTimestamp(b));
  const dayStartMs = date => dateTimeMs(dateKey(date), '00:00');
  const dayEndMs = date => dayStartMs(addDays(date, 1));

  function blockBounds(block) {
    const start = dateTimeMs(block.startDate, block.allDay ? '00:00' : block.startTime);
    const end = block.allDay ? dateTimeMs(dateKey(addDays(parseDate(block.startDate), 1)), '00:00') : dateTimeMs(block.endDate, block.endTime);
    return { start, end };
  }

  function blocksOnDate(date) {
    const start = dayStartMs(date), end = dayEndMs(date);
    return app.state.blocks.filter(block => { const bounds = blockBounds(block); return intersects(bounds.start, bounds.end, start, end); });
  }

  function blockSegment(block, date) {
    const bounds = blockBounds(block), start = dayStartMs(date), end = dayEndMs(date);
    if (!intersects(bounds.start, bounds.end, start, end)) return null;
    return { startMinutes: Math.max(0, (Math.max(bounds.start, start) - start) / 60000), endMinutes: Math.min(1440, (Math.min(bounds.end, end) - start) / 60000) };
  }

  function workHoursFor(date) {
    return app.state.settings.workingHours[date.getDay()] || { enabled: false, start: '09:00', end: '19:00', breakStart: '', breakEnd: '' };
  }

  function workHoursLabel(hours) {
    if (!hours.enabled) return 'Repos';
    return `${hours.start} – ${hours.end}${hours.breakStart && hours.breakEnd ? ` · pause ${hours.breakStart}–${hours.breakEnd}` : ''}`;
  }

  function outsideWorkHours(draft) {
    const date = parseDate(draft.date);
    if (!date) return '';
    const hours = workHoursFor(date), start = toMinutes(draft.time), end = start + Number(draft.duration || 0);
    if (!hours.enabled) return 'Ce jour est défini comme non travaillé dans tes réglages.';
    if (start < toMinutes(hours.start) || end > toMinutes(hours.end)) return `Ce créneau est hors de tes horaires (${hours.start} – ${hours.end}).`;
    if (hours.breakStart && hours.breakEnd && start < toMinutes(hours.breakEnd) && end > toMinutes(hours.breakStart)) return `Ce créneau chevauche ta coupure (${hours.breakStart} – ${hours.breakEnd}).`;
    return '';
  }

  function findConflicts(draft) {
    if (!draft || !activeAppointment(draft)) return [];
    const start = appointmentStart(draft), end = appointmentEnd(draft);
    if (!Number.isFinite(start) || end <= start) return [];
    const conflicts = [];
    app.state.appointments.filter(appointment => activeAppointment(appointment) && appointment.id !== draft.id).forEach(appointment => {
      if (intersects(start, end, appointmentStart(appointment), appointmentEnd(appointment))) conflicts.push({ type: 'appointment', appointment });
    });
    app.state.blocks.forEach(block => { const bounds = blockBounds(block); if (intersects(start, end, bounds.start, bounds.end)) conflicts.push({ type: 'block', block }); });
    return conflicts;
  }

  function hasAppointmentConflict(appointment) {
    return activeAppointment(appointment) && findConflicts(appointment).length > 0;
  }

  function serviceTheme(appointment) {
    const color = appointment.serviceColor || serviceById(appointment.serviceId)?.color || 'rose';
    return COLORS.includes(color) ? `service-${color}` : 'service-rose';
  }

  function wazeUrl(address) { return `https://www.waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`; }
  function openWaze(address) { if (address) window.open(wazeUrl(address), '_blank', 'noopener'); }

  function render() {
    renderHeader(); renderScreen();
    if (app.ui.screen === 'agenda') renderAgenda();
    else if (app.ui.screen === 'clients') renderClients();
    else if (app.ui.screen === 'report') renderReport();
  }

  function renderHeader() {
    $('#todayLabel').textContent = format(new Date(), { weekday: 'long', day: 'numeric', month: 'long' });
    const next = sortedAppointments().find(appointment => activeAppointment(appointment) && appointmentEnd(appointment) >= Date.now());
    if (!next) {
      $('#nextAppointment').className = 'next-card empty';
      $('#nextAppointment').innerHTML = '<span class="next-icon">✦</span><div><p class="next-title">Prochain rendez-vous</p><h2>Rien de prévu</h2><p>Ajoute un rendez-vous quand tu es prête.</p></div>';
    } else {
      const client = clientFor(next);
      $('#nextAppointment').className = 'next-card';
      $('#nextAppointment').innerHTML = `<button class="next-main" data-edit="${escapeHtml(next.id)}"><span class="next-title">Prochain rendez-vous</span><span class="next-time">${format(parseDate(next.date), { weekday: 'long', day: 'numeric', month: 'long' })} · ${next.time}</span><strong>${escapeHtml(client.name)}</strong><span>${escapeHtml(next.service)} · ${Number(next.duration)} min</span>${client.address ? `<small>${escapeHtml(client.address)}</small>` : ''}</button>${client.address ? `<button class="route-icon" data-waze="${encodeURIComponent(client.address)}" aria-label="Itinéraire Waze">⌖</button>` : ''}`;
    }
    renderTodos();
    const last = app.state.settings.lastBackupAt ? new Date(app.state.settings.lastBackupAt) : null, lastTime = last?.getTime();
    const late = !Number.isFinite(lastTime) || Date.now() - lastTime > 7 * 24 * 60 * 60 * 1000;
    $('#backupNotice').hidden = !late;
    $('#backupNotice').textContent = last ? '⇩ Pense à sauvegarder tes données' : '⇩ Fais une première sauvegarde de tes données';
  }

  function pendingConfirmations() {
    const today = todayKey();
    return sortedAppointments().filter(appointment => appointment.status === 'to_confirm' && appointment.date >= today);
  }

  function pendingPayments() {
    const today = todayKey();
    return sortedAppointments().filter(appointment => activeAppointment(appointment) && appointment.paymentStatus === 'pending' && appointment.date <= today);
  }

  function renderTodos() {
    const confirmations = pendingConfirmations(), payments = pendingPayments(), target = $('#todoCard');
    target.hidden = !confirmations.length && !payments.length;
    if (target.hidden) { target.innerHTML = ''; return; }
    target.innerHTML = `<div><p class="next-title">À faire</p><strong>${confirmations.length + payments.length} action${confirmations.length + payments.length > 1 ? 's' : ''}</strong></div><div class="todo-actions">${confirmations.length ? `<button data-todo="confirm"><b>${confirmations.length}</b> à confirmer</button>` : ''}${payments.length ? `<button data-todo="payments"><b>${payments.length}</b> à régler</button>` : ''}</div>`;
  }

  function renderAgenda() {
    const isWeek = app.ui.mode === 'week';
    $('#weekView').hidden = !isWeek; $('#monthView').hidden = isWeek;
    $$('.mode-button').forEach(button => button.classList.toggle('active', button.dataset.mode === app.ui.mode));
    if (isWeek) renderWeekView(); else renderMonthView();
  }

  function renderWeekView() {
    $('#periodLabel').textContent = `${format(app.ui.weekStart, { day: 'numeric', month: 'short' })} – ${format(addDays(app.ui.weekStart, 6), { day: 'numeric', month: 'short' })}`;
    $('#dayStrip').innerHTML = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(app.ui.weekStart, index), meta = dateMeta(date), count = activeAppointmentsForDate(dateKey(date)).length, blockCount = blocksOnDate(date).length;
      const flags = `${meta.holiday ? '<span class="holiday-badge">Férié</span>' : ''}${meta.weekend ? '<span class="weekend-label">WE</span>' : ''}${blockCount ? '<span class="block-dot">⊘</span>' : ''}`;
      return `<button class="day-button ${sameDay(date, app.ui.selectedDate) ? 'selected' : ''} ${sameDay(date, new Date()) ? 'today' : ''} ${meta.weekend ? 'weekend' : ''} ${meta.holiday ? 'holiday' : ''} ${count ? 'has-event' : ''}" data-select-date="${dateKey(date)}"><span class="day-name">${format(date, { weekday: 'short' }).slice(0, 3)}</span><span class="day-number">${date.getDate()}</span>${flags}</button>`;
    }).join('');
    $('#selectedDayTitle').textContent = format(app.ui.selectedDate, { weekday: 'long', day: 'numeric', month: 'long' });
    renderHolidayBanner(); renderDaySummary(); renderDayTimeline();
  }

  function blockDisplayLabel(block) {
    if (block.allDay) return 'Toute la journée';
    if (block.startDate === block.endDate) return `${block.startTime} – ${block.endTime}`;
    return `${format(parseDate(block.startDate), { day: 'numeric', month: 'short' })} ${block.startTime} → ${format(parseDate(block.endDate), { day: 'numeric', month: 'short' })} ${block.endTime}`;
  }

  function renderHolidayBanner() {
    const meta = dateMeta(app.ui.selectedDate), blocks = blocksOnDate(app.ui.selectedDate), parts = [];
    if (meta.holiday) parts.push(`<strong>☀ Jour férié</strong> · ${escapeHtml(meta.holiday.label)}`);
    if (meta.weekend) parts.push('<strong>◒ Week-end</strong>');
    if (blocks.length) parts.push(`<strong>⊘ ${blocks.length} créneau${blocks.length > 1 ? 'x' : ''} bloqué${blocks.length > 1 ? 's' : ''}</strong> · ${escapeHtml(blocks[0].reason)}`);
    $('#holidayBanner').hidden = !parts.length;
    $('#holidayBanner').innerHTML = parts.length ? `<div class="calendar-banner ${blocks.length ? 'blocked' : ''}">${parts.join(' &nbsp; · &nbsp; ')}</div>` : '';
  }

  function renderDaySummary() {
    const appointments = activeAppointmentsForDate(dateKey(app.ui.selectedDate)), blocks = blocksOnDate(app.ui.selectedDate), hours = workHoursFor(app.ui.selectedDate);
    const minutes = appointments.reduce((sum, appointment) => sum + Number(appointment.duration || 0), 0);
    const planned = appointments.reduce((sum, appointment) => sum + (Number(appointment.price) || 0), 0);
    const paid = appointments.filter(appointment => appointment.paymentStatus === 'paid').reduce((sum, appointment) => sum + (Number(appointment.price) || 0), 0);
    $('#daySummary').innerHTML = `<span><strong>${appointments.length}</strong> RDV</span><span><strong>${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60}` : ''}</strong> de prestation</span>${planned ? `<span><strong>${money(planned)}</strong> prévu</span>` : ''}${paid ? `<span><strong>${money(paid)}</strong> encaissé</span>` : ''}${blocks.length ? `<span class="block-summary">⊘ ${blocks.length} bloqué${blocks.length > 1 ? 's' : ''}</span>` : ''}<span class="hours-summary">◷ ${workHoursLabel(hours)}</span>`;
  }

  function routeRow(client) {
    return client.address ? `<button class="route-row" data-waze="${encodeURIComponent(client.address)}" aria-label="Itinéraire vers ${escapeHtml(client.address)}"><span class="route-address">⌖ ${escapeHtml(client.address)}</span><span class="route-icon-small">➤</span></button>` : '';
  }

  function renderWorkShading(hours, firstHour, lastHour) {
    const rangeStart = firstHour * 60, rangeEnd = lastHour * 60;
    const shade = (start, end, label) => {
      const visibleStart = Math.max(start, rangeStart), visibleEnd = Math.min(end, rangeEnd);
      if (visibleEnd <= visibleStart) return '';
      const top = ((visibleStart - rangeStart) / 60) * HOUR_HEIGHT, height = ((visibleEnd - visibleStart) / 60) * HOUR_HEIGHT;
      return `<span class="work-shade" style="top:${top}px;height:${height}px"><i>${label}</i></span>`;
    };
    if (!hours.enabled) return shade(rangeStart, rangeEnd, 'Jour non travaillé');
    const pieces = [shade(rangeStart, toMinutes(hours.start), 'Hors horaires'), shade(toMinutes(hours.end), rangeEnd, 'Hors horaires')];
    if (hours.breakStart && hours.breakEnd) pieces.push(shade(toMinutes(hours.breakStart), toMinutes(hours.breakEnd), 'Coupure'));
    return pieces.join('');
  }

  function renderDayTimeline() {
    const date = app.ui.selectedDate, appointments = appointmentsForDate(dateKey(date)), blocks = blocksOnDate(date);
    if (!appointments.length && !blocks.length) {
      $('#dayTimeline').innerHTML = '<button class="timeline-empty-state" data-create-time="10:00"><span>✦</span><p>Aucun rendez-vous ni créneau bloqué. Touche ici pour ajouter un rendez-vous.</p></button>';
      return;
    }
    const timedBlocks = blocks.map(block => ({ block, segment: blockSegment(block, date) })).filter(item => item.segment && !item.block.allDay);
    const itemStarts = appointments.map(appointment => toMinutes(appointment.time)).concat(timedBlocks.map(item => item.segment.startMinutes));
    const itemEnds = appointments.map(appointment => toMinutes(appointment.time) + Number(appointment.duration || 0)).concat(timedBlocks.map(item => item.segment.endMinutes));
    const firstHour = Math.floor(Math.min(8 * 60, ...itemStarts) / 60), lastHour = Math.ceil(Math.max(20 * 60, ...itemEnds) / 60), totalHours = Math.max(1, lastHour - firstHour);
    const lines = Array.from({ length: totalHours + 1 }, (_, index) => `<span class="timeline-hour" style="top:${index * HOUR_HEIGHT}px">${pad(firstHour + index)}:00</span><i class="timeline-line" style="top:${index * HOUR_HEIGHT}px"></i>`).join('');
    const empty = Array.from({ length: totalHours }, (_, index) => `<button class="timeline-empty" data-create-time="${pad(firstHour + index)}:00" style="top:${index * HOUR_HEIGHT}px;height:${HOUR_HEIGHT}px" aria-label="Ajouter un rendez-vous à ${pad(firstHour + index)} h"></button>`).join('');
    const blockHtml = blocks.map(block => {
      const segment = blockSegment(block, date); if (!segment) return '';
      const start = Math.max(firstHour * 60, segment.startMinutes), end = Math.min(lastHour * 60, segment.endMinutes), top = ((start - firstHour * 60) / 60) * HOUR_HEIGHT, height = Math.max(28, ((end - start) / 60) * HOUR_HEIGHT - 2);
      return `<button class="blocked-block ${block.allDay ? 'all-day-block' : ''}" data-edit-block="${escapeHtml(block.id)}" style="top:${top}px;height:${height}px"><span>⊘ ${escapeHtml(block.reason)}</span><small>${escapeHtml(block.allDay ? 'Toute la journée' : blockDisplayLabel(block))}</small></button>`;
    }).join('');
    const appointmentHtml = appointments.map(appointment => {
      const client = clientFor(appointment), top = ((toMinutes(appointment.time) - firstHour * 60) / 60) * HOUR_HEIGHT, height = Math.max(68, (Number(appointment.duration || 0) / 60) * HOUR_HEIGHT - 4), inactive = !activeAppointment(appointment), conflicted = hasAppointmentConflict(appointment);
      const reason = appointment.cancellationReason ? ` · ${escapeHtml(appointment.cancellationReason)}` : '';
      return `<article class="appointment-block ${serviceTheme(appointment)} status-${appointment.status} ${inactive ? 'inactive' : ''} ${conflicted ? 'conflicted' : ''}" style="top:${top}px;height:${height}px"><button class="appointment-edit" data-edit="${escapeHtml(appointment.id)}"><span class="appointment-time">${appointment.time} – ${endTime(appointment)}</span><strong class="appointment-name">${escapeHtml(client.name)}</strong><span class="appointment-meta">${escapeHtml(appointment.service)} · ${Number(appointment.duration)} min${appointment.price !== '' ? ` · ${money(appointment.price)}` : ''}${reason}</span></button><div class="appointment-footer"><span class="status-badge">${STATUS[appointment.status]}</span>${appointment.paymentStatus === 'paid' && activeAppointment(appointment) ? '<span class="paid-badge">Payé</span>' : ''}${activeAppointment(appointment) ? routeRow(client) : ''}</div></article>`;
    }).join('');
    $('#dayTimeline').innerHTML = `<div class="timeline-inner" style="height:${totalHours * HOUR_HEIGHT}px">${renderWorkShading(workHoursFor(date), firstHour, lastHour)}${lines}${empty}${blockHtml}${appointmentHtml}</div>`;
  }

  function renderMonthView() {
    const month = app.ui.monthDate;
    $('#monthLabel').textContent = format(month, { month: 'long', year: 'numeric' });
    const first = localDate(month.getFullYear(), month.getMonth(), 1), last = localDate(month.getFullYear(), month.getMonth() + 1, 0), start = mondayOf(first), end = addDays(mondayOf(last), 6), dates = [];
    for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
    const headings = DAYS.map(day => `<div class="month-weekday">${day.short}</div>`).join('');
    $('#monthGrid').innerHTML = headings + dates.map(date => {
      const meta = dateMeta(date), blocks = blocksOnDate(date).length, count = activeAppointmentsForDate(dateKey(date)).length, selectedWeek = app.ui.overviewWeekStart && sameDay(mondayOf(date), app.ui.overviewWeekStart);
      return `<button class="month-day ${date.getMonth() !== month.getMonth() ? 'muted' : ''} ${meta.weekend ? 'weekend' : ''} ${meta.holiday ? 'holiday' : ''} ${blocks ? 'has-block' : ''} ${sameDay(date, new Date()) ? 'today' : ''} ${selectedWeek ? 'selected-week' : ''}" data-select-week="${dateKey(date)}"><span class="month-number">${date.getDate()}</span>${meta.holiday ? '<span class="month-holiday">F</span>' : ''}${blocks ? '<span class="month-block">⊘</span>' : ''}${count ? `<span class="month-event-count">${count}</span>` : ''}</button>`;
    }).join('');
    renderWeekOverview();
  }

  function renderWeekOverview() {
    const target = $('#weekOverview');
    if (!app.ui.overviewWeekStart) { target.hidden = true; return; }
    const cards = Array.from({ length: 7 }, (_, index) => addDays(app.ui.overviewWeekStart, index)).map(date => {
      const meta = dateMeta(date), blocks = blocksOnDate(date), appointments = appointmentsForDate(dateKey(date));
      const blockItems = blocks.map(block => `<button class="overview-block" data-edit-block="${escapeHtml(block.id)}"><span>⊘</span><span><strong>${escapeHtml(block.reason)}</strong><small>${escapeHtml(blockDisplayLabel(block))}</small></span></button>`).join('');
      const appointmentItems = appointments.map(appointment => { const client = clientFor(appointment); return `<button class="overview-appointment ${serviceTheme(appointment)} ${!activeAppointment(appointment) ? 'inactive' : ''}" data-edit="${escapeHtml(appointment.id)}"><span class="overview-time">${appointment.time}</span><span><strong>${escapeHtml(client.name)}</strong><span>${escapeHtml(appointment.service)} · fin ${endTime(appointment)}</span></span><span class="mini-status">${STATUS[appointment.status]}</span></button>`; }).join('');
      const content = blockItems || appointmentItems ? `${blockItems}${appointmentItems}` : '<p>Aucun rendez-vous</p>';
      return `<article class="overview-day ${meta.weekend ? 'weekend' : ''} ${meta.holiday ? 'holiday' : ''}"><h3>${format(date, { weekday: 'long', day: 'numeric', month: 'short' })}${meta.holiday ? ` <small>· Férié : ${escapeHtml(meta.holiday.label)}</small>` : ''}</h3>${content}</article>`;
    }).join('');
    target.hidden = false;
    target.innerHTML = `<div class="week-overview-header"><h2>Semaine du ${format(app.ui.overviewWeekStart, { day: 'numeric', month: 'long' })}</h2><button class="text-button" data-close-overview>Retour au mois</button></div><div class="week-overview-list">${cards}</div>`;
  }

  function clientHistory(clientId) { return app.state.appointments.filter(appointment => appointment.clientId === clientId).sort((a, b) => appointmentTimestamp(b) - appointmentTimestamp(a)); }
  function clientLastVisit(clientId) { return clientHistory(clientId).find(appointment => activeAppointment(appointment) && appointmentTimestamp(appointment) <= Date.now()) || null; }
  function clientFirstVisit(clientId) { return [...clientHistory(clientId)].reverse().find(activeAppointment) || null; }

  function renderClients() {
    const query = ($('#clientSearch').value || '').trim().toLocaleLowerCase('fr-FR');
    const clients = [...app.state.clients].filter(client => `${client.name} ${client.phone} ${client.address}`.toLocaleLowerCase('fr-FR').includes(query)).sort((a, b) => appointmentTimestamp(clientLastVisit(b.id) || { date: '1900-01-01', time: '00:00' }) - appointmentTimestamp(clientLastVisit(a.id) || { date: '1900-01-01', time: '00:00' }));
    $('#clientList').innerHTML = clients.length ? clients.map(client => {
      const latest = clientLastVisit(client.id), history = clientHistory(client.id), noShows = history.filter(appointment => appointment.status === 'no_show').length, cancelled = history.filter(appointment => appointment.status === 'cancelled').length;
      return `<button class="client-card" data-client="${escapeHtml(client.id)}"><span class="client-initial">${escapeHtml(client.name[0]?.toUpperCase() || '?')}</span><span><h3>${escapeHtml(client.name)}</h3><p>${latest ? `Dernier RDV · ${format(parseDate(latest.date), { day: 'numeric', month: 'short' })} · ${escapeHtml(latest.service)}` : 'Aucun rendez-vous réalisé'}${(noShows || cancelled) ? ` · ${noShows ? `${noShows} absence${noShows > 1 ? 's' : ''}` : ''}${noShows && cancelled ? ', ' : ''}${cancelled ? `${cancelled} annulation${cancelled > 1 ? 's' : ''}` : ''}` : ''}</p></span><span class="chevron">›</span></button>`;
    }).join('') : '<section class="empty-message"><h2>Aucune cliente</h2><p>Les clientes se créeront lors de tes prochains rendez-vous.</p></section>';
  }

  function reportRange() {
    const start = app.ui.reportMode === 'week' ? mondayOf(app.ui.reportDate) : localDate(app.ui.reportDate.getFullYear(), app.ui.reportDate.getMonth(), 1);
    return { start, end: app.ui.reportMode === 'week' ? addDays(start, 7) : localDate(start.getFullYear(), start.getMonth() + 1, 1) };
  }

  function renderReport() {
    const { start, end } = reportRange();
    $('#reportPeriodLabel').textContent = app.ui.reportMode === 'week' ? `${format(start, { day: 'numeric', month: 'short' })} – ${format(addDays(end, -1), { day: 'numeric', month: 'short' })}` : format(start, { month: 'long', year: 'numeric' });
    $$('.report-period-button').forEach(button => button.classList.toggle('active', button.dataset.reportPeriod === app.ui.reportMode));
    $$('.report-tab').forEach(button => button.classList.toggle('active', button.dataset.reportTab === app.ui.reportTab));
    const byAppointmentDate = appointment => { const date = parseDate(appointment.date); return date >= start && date < end; };
    if (app.ui.reportTab === 'activity') renderActivityReport(byAppointmentDate); else renderPaymentsReport(byAppointmentDate, start, end);
  }

  function renderActivityReport(inRange) {
    const appointments = app.state.appointments.filter(inRange), active = appointments.filter(activeAppointment), clientIds = new Set(active.map(appointment => appointment.clientId));
    const newClients = [...clientIds].filter(clientId => { const first = clientFirstVisit(clientId); return first && inRange(first); }).length;
    const cancelled = appointments.filter(appointment => appointment.status === 'cancelled').length, noShows = appointments.filter(appointment => appointment.status === 'no_show').length;
    const services = new Map();
    active.forEach(appointment => { const row = services.get(appointment.service) || { count: 0, total: 0, color: appointment.serviceColor || 'rose' }; row.count += 1; row.total += Number(appointment.price) || 0; services.set(appointment.service, row); });
    const serviceRows = [...services.entries()].sort((a, b) => b[1].count - a[1].count).map(([name, row]) => `<article class="report-row"><span class="service-dot ${COLORS.includes(row.color) ? row.color : 'rose'}"></span><span><strong>${escapeHtml(name)}</strong><small>${row.count} prestation${row.count > 1 ? 's' : ''}${row.total ? ` · ${money(row.total)}` : ''}</small></span></article>`).join('') || '<p class="empty-report">Aucune prestation sur cette période.</p>';
    $('#reportContent').innerHTML = `<section class="metrics-grid"><article><span>Rendez-vous</span><strong>${active.length}</strong><small>${appointments.filter(appointment => appointment.status === 'completed').length} terminé${appointments.filter(appointment => appointment.status === 'completed').length > 1 ? 's' : ''}</small></article><article><span>Clientes</span><strong>${clientIds.size}</strong><small>${newClients} nouvelle${newClients > 1 ? 's' : ''}</small></article><article class="metric-alert"><span>Annulées</span><strong>${cancelled}</strong><small>${noShows} absence${noShows > 1 ? 's' : ''}</small></article></section><section class="report-panel"><h2>Prestations prévues</h2>${serviceRows}</section>`;
  }

  function renderPaymentsReport(inRange, start, end) {
    const appointments = app.state.appointments.filter(inRange), active = appointments.filter(activeAppointment), planned = active.reduce((sum, appointment) => sum + (Number(appointment.price) || 0), 0);
    const paid = app.state.appointments.filter(appointment => {
      const paymentDate = parseDate(appointment.paymentDate || appointment.date);
      return activeAppointment(appointment) && appointment.paymentStatus === 'paid' && paymentDate >= start && paymentDate < end;
    }).reduce((sum, appointment) => sum + (Number(appointment.price) || 0), 0);
    const pending = active.filter(appointment => appointment.paymentStatus === 'pending'), pendingTotal = pending.reduce((sum, appointment) => sum + (Number(appointment.price) || 0), 0);
    const rows = pending.sort((a, b) => appointmentTimestamp(a) - appointmentTimestamp(b)).map(appointment => { const client = clientFor(appointment); return `<button class="payment-row" data-edit="${escapeHtml(appointment.id)}"><span><strong>${escapeHtml(client.name)}</strong><small>${format(parseDate(appointment.date), { day: 'numeric', month: 'short' })} · ${escapeHtml(appointment.service)}</small></span><b>${money(appointment.price) || 'À définir'} <i>›</i></b></button>`; }).join('') || '<p class="empty-report">Aucun paiement à régler sur cette période.</p>';
    $('#reportContent').innerHTML = `<section class="metrics-grid payments"><article class="metric-paid"><span>Encaissé</span><strong>${money(paid) || '0 €'}</strong><small>selon la date de paiement</small></article><article><span>À encaisser</span><strong>${money(pendingTotal) || '0 €'}</strong><small>${pending.length} paiement${pending.length > 1 ? 's' : ''} en attente</small></article><article><span>Prévu</span><strong>${money(planned) || '0 €'}</strong><small>selon la date du RDV</small></article></section><section class="report-panel"><h2>Paiements à régler</h2>${rows}</section>`;
  }

  function renderScreen() {
    $('#agendaScreen').hidden = app.ui.screen !== 'agenda'; $('#clientsScreen').hidden = app.ui.screen !== 'clients'; $('#reportScreen').hidden = app.ui.screen !== 'report';
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.screen === app.ui.screen));
  }

  function showScreen(screen) {
    if (screen === 'settings') { openSettings(); return; }
    app.ui.screen = screen; renderScreen();
    if (screen === 'report') renderReport(); if (screen === 'clients') renderClients();
  }

  function populateServiceSelect(selectedId = '', fallbackName = '') {
    const selectedService = serviceById(selectedId) || serviceByName(fallbackName), active = app.state.settings.services.filter(service => service.active || service.id === selectedService?.id), selected = selectedService?.id || (fallbackName ? 'custom' : '');
    $('#serviceSelect').innerHTML = `<option value="">Choisir…</option>${active.map(service => `<option value="${service.id}">${escapeHtml(service.name)}${service.price !== '' ? ` · ${money(service.price)}` : ''}</option>`).join('')}<option value="custom">Autre prestation…</option>`;
    $('#serviceSelect').value = selected;
    $('#customServiceField').hidden = selected !== 'custom'; $('#service').required = selected === 'custom';
  }

  function syncPaymentFields() {
    const paid = $('#paymentStatus').value === 'paid';
    $('#paymentDateField').hidden = !paid; $('#paymentDate').disabled = !paid;
    if (paid && !$('#paymentDate').value) $('#paymentDate').value = todayKey();
  }

  function syncStatusFields() {
    const inactive = ['cancelled', 'no_show'].includes($('#status').value);
    $('#cancellationReasonField').hidden = !inactive; $('#cancellationReason').disabled = !inactive;
  }

  function syncRepeatDate(force = false) {
    const weeks = Number($('#repeatWeeks').value), active = weeks > 0, baseDate = parseDate($('#date').value), field = $('#repeatDateField'), input = $('#repeatDate');
    field.hidden = !active; input.disabled = !active; input.required = active;
    if (!active) { input.value = ''; $('#repeatHelp').textContent = 'Date calculée automatiquement.'; return; }
    if (baseDate) {
      input.min = dateKey(addDays(baseDate, 1));
      if (force || !app.ui.repeatDateEdited || !validDate(input.value)) input.value = dateKey(addDays(baseDate, weeks * 7));
    }
    const repeatDate = parseDate(input.value), time = $('#time').value || '10:00', duration = Number($('#duration').value) || 60, messages = [`Même heure : ${time}. Tu peux changer le jour.`];
    if (repeatDate) {
      const repeated = { id: '__repeat-preview__', date: input.value, time, duration, status: 'to_confirm' }, conflicts = findConflicts(repeated), warning = outsideWorkHours(repeated), meta = dateMeta(repeatDate);
      if (conflicts.length) messages.push('Attention : ce prochain créneau est déjà occupé ou bloqué.');
      if (warning) messages.push(warning);
      if (meta.holiday) messages.push(`Jour férié : ${meta.holiday.label}.`); else if (meta.weekend) messages.push('Ce jour est un week-end.');
    }
    $('#repeatHelp').textContent = messages.join(' ');
  }

  function resetAppointmentForm() {
    $('#appointmentForm').reset(); $('#appointmentId').value = ''; populateServiceSelect();
    $('#date').value = dateKey(app.ui.selectedDate); $('#time').value = '10:00'; $('#duration').value = '60'; $('#status').value = 'to_confirm';
    $('#paymentStatus').value = 'paid'; $('#paymentDate').value = todayKey(); $('#paymentMethod').value = ''; $('#repeatWeeks').value = '0'; $('#repeatDate').value = '';
    $('#clientSuggestions').hidden = true; $('#conflictHint').hidden = true; app.ui.editingAppointmentId = null; app.ui.formClientId = null; app.ui.formServiceColor = 'rose'; app.ui.repeatDateEdited = false;
    syncPaymentFields(); syncStatusFields(); syncRepeatDate(true);
  }

  function openAppointment(appointment = null, defaults = {}) {
    resetAppointmentForm();
    $('#appointmentFormTitle').textContent = appointment ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'; $('#deleteAppointment').hidden = !appointment;
    if (appointment) {
      const client = clientFor(appointment); app.ui.editingAppointmentId = appointment.id; app.ui.formClientId = client.id; app.ui.formServiceColor = appointment.serviceColor || 'rose';
      $('#appointmentId').value = appointment.id; $('#clientName').value = client.name; $('#phone').value = client.phone; $('#date').value = appointment.date; $('#time').value = appointment.time; $('#duration').value = String(appointment.duration); $('#price').value = appointment.price; populateServiceSelect(appointment.serviceId, appointment.service); $('#service').value = appointment.service; $('#address').value = client.address; $('#status').value = appointment.status; $('#paymentStatus').value = appointment.paymentStatus; $('#paymentDate').value = appointment.paymentDate || ''; $('#paymentMethod').value = appointment.paymentMethod; $('#notes').value = appointment.notes; $('#cancellationReason').value = appointment.cancellationReason || '';
    } else if (defaults.from) {
      const prior = defaults.from, client = clientFor(prior); app.ui.formClientId = client.id; app.ui.formServiceColor = prior.serviceColor || 'rose';
      $('#clientName').value = client.name; $('#phone').value = client.phone; $('#address').value = client.address; $('#duration').value = String(prior.duration); $('#price').value = prior.price; populateServiceSelect(prior.serviceId, prior.service); $('#service').value = prior.service; $('#date').value = defaults.date || dateKey(app.ui.selectedDate); $('#time').value = defaults.time || prior.time;
    } else { $('#date').value = defaults.date || dateKey(app.ui.selectedDate); $('#time').value = defaults.time || '10:00'; }
    syncPaymentFields(); syncStatusFields(); syncRepeatDate(true); updateConflictHint(); $('#appointmentDialog').showModal(); setTimeout(() => $('#clientName').focus(), 30);
  }

  function fillFromClient(client) {
    app.ui.formClientId = client.id; $('#clientName').value = client.name; $('#phone').value = client.phone || ''; $('#address').value = client.address || ''; $('#clientSuggestions').hidden = true; updateConflictHint();
  }

  function renderSuggestions() {
    const term = normaliseName($('#clientName').value), target = $('#clientSuggestions');
    const matches = term ? app.state.clients.filter(client => normaliseName(client.name).includes(term)).slice(0, 6) : [];
    if (!matches.length) { target.hidden = true; return; }
    target.hidden = false;
    target.innerHTML = matches.map(client => `<button type="button" class="client-suggestion" data-suggestion="${escapeHtml(client.id)}"><strong>${escapeHtml(client.name)}</strong><span>${escapeHtml(client.phone || 'Sans téléphone')}${client.address ? ` · ${escapeHtml(client.address)}` : ''}</span></button>`).join('');
  }

  function applyServicePreset() {
    const id = $('#serviceSelect').value, preset = serviceById(id), custom = id === 'custom';
    $('#customServiceField').hidden = !custom; $('#service').required = custom;
    if (preset) {
      $('#service').value = preset.name; $('#duration').value = String(preset.duration); $('#price').value = preset.price; app.ui.formServiceColor = preset.color;
    } else if (!custom) { $('#service').value = ''; app.ui.formServiceColor = 'rose'; }
    if (custom) setTimeout(() => $('#service').focus(), 0);
    updateConflictHint();
  }

  function getDraft() {
    const preset = serviceById($('#serviceSelect').value), service = preset?.name || $('#service').value.trim();
    return { id: app.ui.editingAppointmentId || $('#appointmentId').value || uuid(), clientId: app.ui.formClientId, clientName: $('#clientName').value.trim(), phone: $('#phone').value.trim(), address: $('#address').value.trim(), date: $('#date').value, time: $('#time').value, duration: Number($('#duration').value), price: $('#price').value.trim(), service, serviceId: preset?.id || '', serviceColor: preset?.color || app.ui.formServiceColor || 'rose', status: $('#status').value, paymentStatus: $('#paymentStatus').value, paymentDate: $('#paymentStatus').value === 'paid' ? ($('#paymentDate').value || todayKey()) : '', paymentMethod: $('#paymentMethod').value, notes: $('#notes').value.trim(), cancellationReason: ['cancelled', 'no_show'].includes($('#status').value) ? $('#cancellationReason').value.trim() : '', repeatWeeks: Number($('#repeatWeeks').value), repeatDate: $('#repeatDate').value };
  }

  function updateConflictHint() {
    const date = $('#date').value, time = $('#time').value, duration = Number($('#duration').value);
    if (!date || !time || !duration) { $('#conflictHint').hidden = true; return; }
    const draft = { id: app.ui.editingAppointmentId, date, time, duration, status: $('#status').value };
    const conflicts = findConflicts(draft), selected = parseDate(date), meta = selected ? dateMeta(selected) : { holiday: null, weekend: false }, messages = [];
    if (conflicts.length) messages.push(`Attention : ce créneau chevauche ${conflicts.length > 1 ? `${conflicts.length} éléments` : conflicts[0].type === 'block' ? 'un créneau bloqué' : 'un rendez-vous'}.`);
    const workWarning = outsideWorkHours(draft); if (workWarning) messages.push(workWarning);
    if (meta.holiday) messages.push(`Jour férié : ${meta.holiday.label}.`); else if (meta.weekend) messages.push('Ce créneau est un week-end.');
    $('#conflictHint').hidden = !messages.length; $('#conflictHint').textContent = messages.join(' ');
  }

  function ensureClient(draft) {
    let client = draft.clientId ? clientById(draft.clientId) : null;
    if (!client) { client = { id: uuid(), name: draft.clientName, phone: draft.phone, address: draft.address, notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; app.state.clients.push(client); }
    else { client.name = draft.clientName; client.phone = draft.phone; client.address = draft.address; client.updatedAt = new Date().toISOString(); }
    return client;
  }

  function createRecurringAppointment(appointment, weeks, requestedDate) {
    if (!weeks) return '';
    const date = parseDate(requestedDate); if (!date) return 'Le prochain RDV n’a pas été créé : sa date n’est pas valide.';
    const alreadyExists = app.state.appointments.some(item => item.parentAppointmentId === appointment.id && item.date === requestedDate && item.time === appointment.time);
    if (alreadyExists) return 'Ce prochain RDV existe déjà : aucun doublon n’a été créé.';
    const recurrenceId = appointment.recurrenceId || uuid(); appointment.recurrenceId = recurrenceId;
    const repeated = { ...appointment, id: uuid(), date: requestedDate, status: 'to_confirm', paymentStatus: 'pending', paymentDate: '', paymentMethod: '', cancellationReason: '', recurrenceId, parentAppointmentId: appointment.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const conflicts = findConflicts(repeated);
    if (conflicts.length && !window.confirm(`Le prochain RDV du ${format(date, { day: 'numeric', month: 'long' })} à ${repeated.time} chevauche un rendez-vous ou un créneau bloqué. Le créer quand même ?`)) return 'Le rendez-vous principal est enregistré. Le prochain RDV n’a pas été créé afin que tu puisses choisir un autre jour.';
    app.state.appointments.push(repeated); return `Le prochain RDV a été créé le ${format(date, { day: 'numeric', month: 'long' })}, à confirmer.`;
  }

  function commitDraft(draft) {
    const previousState = cloneState(app.state);
    const client = ensureClient(draft), existing = app.state.appointments.find(item => item.id === draft.id);
    const appointment = { id: draft.id, clientId: client.id, date: draft.date, time: draft.time, duration: draft.duration, price: draft.price, service: draft.service, serviceId: draft.serviceId, serviceColor: draft.serviceColor, status: draft.status, paymentStatus: draft.paymentStatus, paymentDate: draft.paymentStatus === 'paid' ? draft.paymentDate : '', paymentMethod: draft.paymentMethod, notes: draft.notes, cancellationReason: draft.cancellationReason, recurrenceId: existing?.recurrenceId || '', parentAppointmentId: existing?.parentAppointmentId || '', createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    const index = app.state.appointments.findIndex(item => item.id === appointment.id); if (index === -1) app.state.appointments.push(appointment); else app.state.appointments[index] = appointment;
    const recurrenceMessage = createRecurringAppointment(appointment, draft.repeatWeeks, draft.repeatDate);
    app.ui.selectedDate = parseDate(appointment.date) || app.ui.selectedDate; app.ui.weekStart = mondayOf(app.ui.selectedDate); app.ui.monthDate = localDate(app.ui.selectedDate.getFullYear(), app.ui.selectedDate.getMonth(), 1);
    if (!saveState()) { app.state = previousState; return; }
    $('#appointmentDialog').close(); render(); if (recurrenceMessage) window.alert(recurrenceMessage);
  }

  function openConflictDialog(draft, conflicts) {
    app.ui.pendingDraft = draft;
    $('#conflictList').innerHTML = conflicts.map(conflict => {
      if (conflict.type === 'block') return `<article class="conflict-item"><strong>Créneau bloqué</strong><span>${escapeHtml(conflict.block.reason)} · ${escapeHtml(blockDisplayLabel(conflict.block))}</span></article>`;
      const appointment = conflict.appointment;
      return `<article class="conflict-item"><strong>${escapeHtml(clientFor(appointment).name)}</strong><span>${appointment.time} – ${endTime(appointment)} · ${escapeHtml(appointment.service)}</span></article>`;
    }).join('');
    $('#conflictDialog').showModal();
  }

  function syncBlockAllDay() {
    const allDay = $('#blockAllDay').checked;
    $('#blockTimeFields').hidden = allDay; $('#blockAllDayDateField').hidden = !allDay;
    ['#blockStartDate', '#blockStartTime', '#blockEndDate', '#blockEndTime'].forEach(selector => { $(selector).disabled = allDay; });
    $('#blockAllDayDate').disabled = !allDay;
  }

  function resetBlockForm() {
    $('#blockForm').reset(); app.ui.editingBlockId = null; $('#blockId').value = ''; $('#blockAllDay').checked = false; $('#blockAllDayDate').value = dateKey(app.ui.selectedDate); $('#blockStartDate').value = dateKey(app.ui.selectedDate); $('#blockEndDate').value = dateKey(app.ui.selectedDate); $('#blockStartTime').value = '09:00'; $('#blockEndTime').value = '10:00'; $('#blockValidation').hidden = true; $('#deleteBlock').hidden = true; syncBlockAllDay();
  }

  function openBlock(block = null) {
    resetBlockForm();
    $('#blockFormTitle').textContent = block ? 'Modifier le créneau bloqué' : 'Bloquer un créneau';
    if (block) {
      app.ui.editingBlockId = block.id; $('#blockId').value = block.id; $('#blockAllDay').checked = block.allDay; $('#blockAllDayDate').value = block.startDate; $('#blockStartDate').value = block.startDate; $('#blockEndDate').value = block.endDate; $('#blockStartTime').value = block.startTime; $('#blockEndTime').value = block.endTime; $('#blockReason').value = block.reason; $('#deleteBlock').hidden = false; syncBlockAllDay();
    }
    $('#blockDialog').showModal();
  }

  function blockDraft() {
    const allDay = $('#blockAllDay').checked, startDate = allDay ? $('#blockAllDayDate').value : $('#blockStartDate').value, endDate = allDay ? startDate : $('#blockEndDate').value;
    return { id: app.ui.editingBlockId || $('#blockId').value || uuid(), allDay, startDate, startTime: allDay ? '00:00' : $('#blockStartTime').value, endDate, endTime: allDay ? '00:00' : $('#blockEndTime').value, reason: $('#blockReason').value.trim() || 'Créneau bloqué' };
  }

  function activeAppointmentsOverlappingBlock(block) {
    const bounds = blockBounds(block);
    return app.state.appointments.filter(appointment => activeAppointment(appointment) && intersects(bounds.start, bounds.end, appointmentStart(appointment), appointmentEnd(appointment))).sort((a, b) => appointmentTimestamp(a) - appointmentTimestamp(b));
  }

  function saveBlock() {
    const block = blockDraft(), validation = $('#blockValidation');
    if (!validDate(block.startDate) || !validDate(block.endDate) || (!block.allDay && (!validTime(block.startTime) || !validTime(block.endTime) || dateTimeMs(block.endDate, block.endTime) <= dateTimeMs(block.startDate, block.startTime)))) {
      validation.hidden = false; validation.textContent = 'La fin doit être après le début du créneau.'; return;
    }
    const overlaps = activeAppointmentsOverlappingBlock(block);
    if (overlaps.length && !window.confirm(`Ce créneau bloque aussi ${overlaps.length} rendez-vous déjà enregistré${overlaps.length > 1 ? 's' : ''}. Le conserver quand même ?`)) return;
    const previousState = cloneState(app.state), index = app.state.blocks.findIndex(item => item.id === block.id); if (index === -1) app.state.blocks.push(block); else app.state.blocks[index] = block;
    if (!saveState()) { app.state = previousState; return; }
    app.ui.selectedDate = parseDate(block.startDate) || app.ui.selectedDate; app.ui.weekStart = mondayOf(app.ui.selectedDate); $('#blockDialog').close(); render();
  }

  function openRouteDay() {
    const appointments = activeAppointmentsForDate(dateKey(app.ui.selectedDate)).filter(appointment => clientFor(appointment).address);
    $('#routeDate').textContent = format(app.ui.selectedDate, { weekday: 'long', day: 'numeric', month: 'long' });
    $('#routeList').innerHTML = appointments.length ? appointments.map(appointment => { const client = clientFor(appointment); return `<article class="route-item"><span class="route-time">${appointment.time}</span><span><strong>${escapeHtml(client.name)}</strong><small>${escapeHtml(client.address)}</small></span><button class="route-icon" data-waze="${encodeURIComponent(client.address)}" aria-label="Itinéraire">⌖</button></article>`; }).join('') : '<p class="empty-route">Aucun rendez-vous avec adresse ce jour-là.</p>';
    $('#routeDialog').showModal();
  }

  function openTodo(type) {
    const items = type === 'confirm' ? pendingConfirmations() : pendingPayments();
    $('#todoTitle').textContent = type === 'confirm' ? 'Rendez-vous à confirmer' : 'Paiements à régler';
    $('#todoList').innerHTML = items.length ? items.map(appointment => { const client = clientFor(appointment); return `<button class="todo-item" data-edit="${escapeHtml(appointment.id)}"><span><strong>${escapeHtml(client.name)}</strong><small>${format(parseDate(appointment.date), { weekday: 'short', day: 'numeric', month: 'short' })} · ${appointment.time} · ${escapeHtml(appointment.service)}</small></span><b>${type === 'payments' ? money(appointment.price) || 'À définir' : '›'}</b></button>`; }).join('') : '<p class="empty-route">Rien à faire pour le moment.</p>';
    $('#todoDialog').showModal();
  }

  function clientStats(clientId) {
    const history = clientHistory(clientId), visits = history.filter(activeAppointment), paid = visits.filter(appointment => appointment.paymentStatus === 'paid').reduce((sum, appointment) => sum + (Number(appointment.price) || 0), 0);
    return { visits: visits.length, cancelled: history.filter(appointment => appointment.status === 'cancelled').length, noShows: history.filter(appointment => appointment.status === 'no_show').length, paid };
  }

  function openClient(clientId) {
    const client = clientById(clientId); if (!client) return;
    $('#profileKey').value = client.id; $('#profileName').value = client.name; $('#profilePhone').value = client.phone; $('#profileAddress').value = client.address; $('#profileNotes').value = client.notes; $('#profileWaze').hidden = !client.address;
    const stats = clientStats(client.id), history = clientHistory(client.id).slice(0, 12);
    $('#clientStats').innerHTML = `<article><strong>${stats.visits}</strong><span>RDV</span></article><article><strong>${stats.cancelled}</strong><span>annulé${stats.cancelled > 1 ? 's' : ''}</span></article><article><strong>${stats.noShows}</strong><span>absence${stats.noShows > 1 ? 's' : ''}</span></article>${stats.paid ? `<article><strong>${money(stats.paid)}</strong><span>encaissé</span></article>` : ''}`;
    $('#clientHistory').innerHTML = `<p class="history-label">Historique</p>${history.length ? history.map(appointment => `<article class="history-item"><span><strong>${format(parseDate(appointment.date), { day: 'numeric', month: 'short' })} · ${escapeHtml(appointment.service)}</strong><small>${appointment.time} · ${STATUS[appointment.status]}${appointment.price !== '' ? ` · ${money(appointment.price)}` : ''}${appointment.paymentStatus === 'pending' && activeAppointment(appointment) ? ' · À régler' : ''}${appointment.cancellationReason ? ` · ${escapeHtml(appointment.cancellationReason)}` : ''}</small></span><button class="small-reuse" data-repeat-from="${escapeHtml(appointment.id)}">↻ Reprendre</button></article>`).join('') : '<p class="small-copy">Aucun rendez-vous enregistré.</p>'}`;
    $('#clientDialog').showModal();
  }

  function renderWorkingHoursEditor() {
    $('#workingHoursEditor').innerHTML = DAYS.map(day => {
      const hours = app.state.settings.workingHours[day.key];
      const disabled = hours.enabled ? '' : 'disabled';
      return `<article class="hours-row ${hours.enabled ? '' : 'disabled'}" data-hours-day="${day.key}"><label class="hours-day"><input id="workEnabled-${day.key}" type="checkbox" ${hours.enabled ? 'checked' : ''}><span><strong>${day.label}</strong><small>${hours.enabled ? `${hours.start} – ${hours.end}` : 'Repos'}</small></span></label><div class="hours-values"><input id="workStart-${day.key}" type="time" value="${hours.start}" ${disabled}><span>à</span><input id="workEnd-${day.key}" type="time" value="${hours.end}" ${disabled}></div><div class="break-values"><span>Pause</span><input id="workBreakStart-${day.key}" type="time" value="${hours.breakStart}" ${disabled}><span>à</span><input id="workBreakEnd-${day.key}" type="time" value="${hours.breakEnd}" ${disabled}></div></article>`;
    }).join('');
  }

  function syncWorkingHoursRow(day) {
    const enabled = $(`#workEnabled-${day}`).checked, row = $(`[data-hours-day="${day}"]`);
    row.classList.toggle('disabled', !enabled); row.querySelector('.hours-day small').textContent = enabled ? `${$(`#workStart-${day}`).value} – ${$(`#workEnd-${day}`).value}` : 'Repos';
    [`#workStart-${day}`, `#workEnd-${day}`, `#workBreakStart-${day}`, `#workBreakEnd-${day}`].forEach(selector => { $(selector).disabled = !enabled; });
  }

  function renderSettingsServiceList() {
    const target = $('#settingsServiceList');
    target.innerHTML = app.state.settings.services.length ? app.state.settings.services.map(service => `<button class="settings-service ${service.active ? '' : 'inactive'}" data-edit-service="${escapeHtml(service.id)}"><span class="service-dot ${service.color}"></span><span><strong>${escapeHtml(service.name)}</strong><small>${service.duration} min${service.price !== '' ? ` · ${money(service.price)}` : ' · prix à définir'}${service.active ? '' : ' · masquée'}</small></span><b>›</b></button>`).join('') : '<p class="small-copy">Ajoute ta première prestation.</p>';
  }

  function openSettings() {
    renderWorkingHoursEditor(); renderSettingsServiceList();
    const last = app.state.settings.lastBackupAt ? new Date(app.state.settings.lastBackupAt) : null;
    $('#backupStatus').textContent = last && !Number.isNaN(last.getTime()) ? `Dernier export lancé : ${format(last, { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Aucune sauvegarde exportée.';
    $('#undoRestore').hidden = !safeJson(RESTORE_SAFETY_KEY, null);
    $('#settingsDialog').showModal();
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.screen === 'settings'));
  }

  function setWeekdayHoursInEditor() {
    for (let day = 0; day < 7; day += 1) {
      $(`#workEnabled-${day}`).checked = day >= 1 && day <= 5; $(`#workStart-${day}`).value = '09:00'; $(`#workEnd-${day}`).value = '19:00'; $(`#workBreakStart-${day}`).value = ''; $(`#workBreakEnd-${day}`).value = '';
      syncWorkingHoursRow(day);
    }
  }

  function saveWorkingHours() {
    const hours = {};
    for (let day = 0; day < 7; day += 1) {
      const enabled = $(`#workEnabled-${day}`).checked, start = $(`#workStart-${day}`).value, end = $(`#workEnd-${day}`).value, breakStart = $(`#workBreakStart-${day}`).value, breakEnd = $(`#workBreakEnd-${day}`).value;
      if (enabled && (!validTime(start) || !validTime(end) || toMinutes(start) >= toMinutes(end))) { window.alert(`Vérifie les horaires du ${DAYS.find(item => item.key === day).label.toLowerCase()}.`); return; }
      if (enabled && (breakStart || breakEnd) && (!validTime(breakStart) || !validTime(breakEnd) || toMinutes(breakStart) >= toMinutes(breakEnd) || toMinutes(breakStart) < toMinutes(start) || toMinutes(breakEnd) > toMinutes(end))) { window.alert(`Vérifie la pause du ${DAYS.find(item => item.key === day).label.toLowerCase()}.`); return; }
      hours[day] = { enabled, start: validTime(start) ? start : '09:00', end: validTime(end) ? end : '19:00', breakStart: breakStart || '', breakEnd: breakEnd || '' };
    }
    const previousHours = app.state.settings.workingHours; app.state.settings.workingHours = hours;
    if (!saveState()) { app.state.settings.workingHours = previousHours; return; }
    render(); renderWorkingHoursEditor(); window.alert('Horaires enregistrés.');
  }

  function openService(service = null) {
    $('#serviceForm').reset(); $('#serviceId').value = service?.id || ''; $('#serviceDialogTitle').textContent = service ? 'Modifier la prestation' : 'Nouvelle prestation'; $('#serviceName').value = service?.name || ''; $('#serviceDuration').value = String(service?.duration || 60); $('#servicePrice').value = service?.price ?? ''; $('#serviceColor').value = service?.color || 'rose'; $('#serviceActive').checked = service?.active !== false; $('#serviceDialog').showModal();
  }

  function saveService() {
    if (!$('#serviceForm').reportValidity()) return;
    const id = $('#serviceId').value || uuid(), name = $('#serviceName').value.trim();
    if (!name) return;
    const duplicate = app.state.settings.services.find(service => service.id !== id && normaliseName(service.name) === normaliseName(name));
    if (duplicate) { window.alert('Une prestation avec ce nom existe déjà.'); return; }
    const previousState = cloneState(app.state), record = { id, name, duration: Number($('#serviceDuration').value), price: $('#servicePrice').value.trim(), color: $('#serviceColor').value, active: $('#serviceActive').checked };
    const index = app.state.settings.services.findIndex(service => service.id === id); if (index === -1) app.state.settings.services.push(record); else app.state.settings.services[index] = record;
    if (!saveState()) { app.state = previousState; return; }
    $('#serviceDialog').close(); renderSettingsServiceList();
  }

  function backupCounts(state) {
    return { clients: state.clients.length, appointments: state.appointments.length, blocks: state.blocks.length, services: state.settings.services.length };
  }

  function makeBackupPayload(state = app.state, reason = 'manual') {
    const exportedAt = new Date().toISOString();
    return { app: BACKUP_APP_ID, backupFormatVersion: BACKUP_FORMAT_VERSION, dataVersion: CURRENT_DATA_VERSION, exportedAt, reason, counts: backupCounts(state), state: cloneState(state) };
  }

  function backupVersion(data) {
    const value = data?.dataVersion ?? data?.state?.version ?? data?.version ?? 1;
    return Number.isFinite(Number(value)) ? Number(value) : 1;
  }

  function recognisedBackup(data) {
    if (Array.isArray(data)) return true;
    if (!data || typeof data !== 'object') return false;
    const state = data.state && typeof data.state === 'object' ? data.state : data;
    if (Array.isArray(state)) return true;
    return ['clients', 'appointments', 'blocks', 'blockedSlots', 'unavailableDays', 'settings', 'clientProfiles'].some(key => Object.prototype.hasOwnProperty.call(state, key));
  }

  function backupPreview(data, state) {
    const exported = data?.exportedAt ? new Date(data.exportedAt) : null, when = exported && !Number.isNaN(exported.getTime()) ? format(exported, { day: 'numeric', month: 'long', year: 'numeric' }) : 'date inconnue';
    const counts = backupCounts(state);
    return `Sauvegarde du ${when} · version ${backupVersion(data)}\n${counts.clients} cliente${counts.clients > 1 ? 's' : ''}, ${counts.appointments} RDV, ${counts.blocks} créneau${counts.blocks > 1 ? 'x' : ''} bloqué${counts.blocks > 1 ? 's' : ''}.\n\nRemplacer les données actuelles ? Une copie de secours sera conservée sur cet appareil.`;
  }

  function exportData() {
    const previousDate = app.state.settings.lastBackupAt, content = makeBackupPayload();
    app.state.settings.lastBackupAt = content.exportedAt;
    if (!saveState()) app.state.settings.lastBackupAt = previousDate;
    content.state.settings.lastBackupAt = content.exportedAt;
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' })), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `sauvegarde-agenda-${todayKey()}.json`; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); renderHeader();
  }

  async function importData(file) {
    const input = $('#importData'); if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!recognisedBackup(data) || (data.app && data.app !== BACKUP_APP_ID)) throw new Error('UNKNOWN_BACKUP');
      if (Number(data.backupFormatVersion || 1) > BACKUP_FORMAT_VERSION || backupVersion(data) > CURRENT_DATA_VERSION) throw new Error('FUTURE_BACKUP');
      const migrated = migrateState(data.state || data, data.clientProfiles || data.state?.clientProfiles || {}, { strict: true });
      if (!window.confirm(backupPreview(data, migrated))) return;
      const safety = makeBackupPayload(app.state, 'before-restore');
      try { localStorage.setItem(RESTORE_SAFETY_KEY, JSON.stringify(safety)); }
      catch { window.alert('La restauration a été annulée : impossible de créer la copie de secours sur cet appareil.'); return; }
      if (!saveState(migrated)) { try { localStorage.removeItem(RESTORE_SAFETY_KEY); } catch {} return; }
      app.state = migrated; $('#settingsDialog').close(); render(); window.alert('Sauvegarde restaurée et adaptée à la version actuelle. Toutes les données compatibles ont été conservées.');
    } catch (error) {
      if (error?.message === 'FUTURE_BACKUP') window.alert('Cette sauvegarde vient d’une version plus récente. Mets d’abord l’application à jour : tes données actuelles n’ont pas été modifiées.');
      else if (String(error?.message || '').startsWith('INVALID_')) window.alert('La sauvegarde contient au moins une donnée incomplète ou abîmée. Rien n’a été restauré afin d’éviter une perte partielle.');
      else window.alert('Ce fichier ne semble pas être une sauvegarde valide de Mon agenda.');
    } finally { input.value = ''; }
  }

  function undoLastRestore() {
    const backup = safeJson(RESTORE_SAFETY_KEY, null);
    if (!backup || !window.confirm('Revenir aux données présentes juste avant la dernière restauration ?')) return;
    try {
      const restored = migrateState(backup.state || backup, backup.clientProfiles || {}, { strict: true });
      if (!saveState(restored)) return;
      app.state = restored; try { localStorage.removeItem(RESTORE_SAFETY_KEY); } catch {} $('#settingsDialog').close(); render(); window.alert('Les données d’avant la restauration ont été récupérées.');
    } catch { window.alert('La copie de secours locale n’est pas exploitable. Tes données actuelles n’ont pas été modifiées.'); }
  }

  function setMode(mode) { app.ui.mode = mode; if (mode === 'month') app.ui.monthDate = localDate(app.ui.selectedDate.getFullYear(), app.ui.selectedDate.getMonth(), 1); renderAgenda(); }

  document.addEventListener('click', event => {
    const target = event.target.closest('button'); if (!target) return;
    if (target.dataset.close) { const dialog = $(`#${target.dataset.close}`); dialog.close(); if (target.dataset.close === 'settingsDialog') renderScreen(); return; }
    if (target.dataset.mode) { setMode(target.dataset.mode); return; }
    if (target.dataset.screen) { showScreen(target.dataset.screen); return; }
    if (target.dataset.reportPeriod) { app.ui.reportMode = target.dataset.reportPeriod; renderReport(); return; }
    if (target.dataset.reportTab) { app.ui.reportTab = target.dataset.reportTab; renderReport(); return; }
    if (target.id === 'backToAgenda') { showScreen('agenda'); return; }
    if (target.id === 'addAppointment') { openAppointment(); return; }
    if (target.id === 'previousPeriod') { app.ui.weekStart = addDays(app.ui.weekStart, -7); app.ui.selectedDate = app.ui.weekStart; renderAgenda(); return; }
    if (target.id === 'nextPeriod') { app.ui.weekStart = addDays(app.ui.weekStart, 7); app.ui.selectedDate = app.ui.weekStart; renderAgenda(); return; }
    if (target.id === 'previousMonth') { app.ui.monthDate = localDate(app.ui.monthDate.getFullYear(), app.ui.monthDate.getMonth() - 1, 1); app.ui.overviewWeekStart = null; renderAgenda(); return; }
    if (target.id === 'nextMonth') { app.ui.monthDate = localDate(app.ui.monthDate.getFullYear(), app.ui.monthDate.getMonth() + 1, 1); app.ui.overviewWeekStart = null; renderAgenda(); return; }
    if (target.id === 'todayButton') { app.ui.selectedDate = startOfDay(new Date()); app.ui.weekStart = mondayOf(app.ui.selectedDate); renderAgenda(); return; }
    if (target.id === 'reportToday') { app.ui.reportDate = startOfDay(new Date()); renderReport(); return; }
    if (target.id === 'previousReport') { app.ui.reportDate = app.ui.reportMode === 'week' ? addDays(app.ui.reportDate, -7) : localDate(app.ui.reportDate.getFullYear(), app.ui.reportDate.getMonth() - 1, 1); renderReport(); return; }
    if (target.id === 'nextReport') { app.ui.reportDate = app.ui.reportMode === 'week' ? addDays(app.ui.reportDate, 7) : localDate(app.ui.reportDate.getFullYear(), app.ui.reportDate.getMonth() + 1, 1); renderReport(); return; }
    if (target.id === 'routeDay') { openRouteDay(); return; }
    if (target.id === 'blockTime') { openBlock(); return; }
    if (target.id === 'deleteAppointment') { if (app.ui.editingAppointmentId && window.confirm('Supprimer ce rendez-vous ?')) { const previous = app.state.appointments; app.state.appointments = app.state.appointments.filter(appointment => appointment.id !== app.ui.editingAppointmentId); if (!saveState()) app.state.appointments = previous; else { $('#appointmentDialog').close(); render(); } } return; }
    if (target.id === 'deleteBlock') { const id = $('#blockId').value; if (id && window.confirm('Supprimer ce créneau bloqué ?')) { const previous = app.state.blocks; app.state.blocks = app.state.blocks.filter(block => block.id !== id); if (!saveState()) app.state.blocks = previous; else { $('#blockDialog').close(); render(); } } return; }
    if (target.id === 'changeConflict') { $('#conflictDialog').close(); return; }
    if (target.id === 'confirmConflict') { const draft = app.ui.pendingDraft; $('#conflictDialog').close(); app.ui.pendingDraft = null; if (draft) commitDraft(draft); return; }
    if (target.id === 'exportData' || target.id === 'backupButton' || target.id === 'backupNotice') { exportData(); return; }
    if (target.id === 'undoRestore') { undoLastRestore(); return; }
    if (target.id === 'profileWaze') { openWaze($('#profileAddress').value.trim()); return; }
    if (target.id === 'applyWeekdayHours') { setWeekdayHoursInEditor(); return; }
    if (target.id === 'saveWorkingHours') { saveWorkingHours(); return; }
    if (target.id === 'addService') { openService(); return; }
    if (target.dataset.selectDate) { app.ui.selectedDate = parseDate(target.dataset.selectDate); app.ui.weekStart = mondayOf(app.ui.selectedDate); renderAgenda(); return; }
    if (target.dataset.selectWeek) { const date = parseDate(target.dataset.selectWeek); app.ui.overviewWeekStart = mondayOf(date); app.ui.selectedDate = date; renderAgenda(); return; }
    if (target.dataset.closeOverview !== undefined) { app.ui.overviewWeekStart = null; renderAgenda(); return; }
    if (target.dataset.edit) { const appointment = app.state.appointments.find(item => item.id === target.dataset.edit); if (appointment) { $('#todoDialog').close(); openAppointment(appointment); } return; }
    if (target.dataset.editBlock) { const block = app.state.blocks.find(item => item.id === target.dataset.editBlock); if (block) openBlock(block); return; }
    if (target.dataset.editService) { const service = serviceById(target.dataset.editService); if (service) openService(service); return; }
    if (target.dataset.repeatFrom) { const appointment = app.state.appointments.find(item => item.id === target.dataset.repeatFrom); if (appointment) { $('#clientDialog').close(); openAppointment(null, { from: appointment }); } return; }
    if (target.dataset.waze) { openWaze(decodeURIComponent(target.dataset.waze)); return; }
    if (target.dataset.createTime) { openAppointment(null, { date: dateKey(app.ui.selectedDate), time: target.dataset.createTime }); return; }
    if (target.dataset.suggestion) { const client = clientById(target.dataset.suggestion); if (client) fillFromClient(client); return; }
    if (target.dataset.todo) { openTodo(target.dataset.todo); return; }
    if (target.dataset.client) { openClient(target.dataset.client); }
  });

  $('#appointmentForm').addEventListener('submit', event => {
    event.preventDefault(); if (!$('#appointmentForm').reportValidity()) return;
    const draft = getDraft(); if (!draft.clientName || !draft.service || !draft.date || !draft.time) { window.alert('Renseigne la cliente et la prestation.'); return; }
    if (!validDate(draft.date) || !validTime(draft.time) || !Number.isFinite(draft.duration) || draft.duration < 15) { window.alert('Vérifie la date, l’heure et la durée du rendez-vous.'); return; }
    if (draft.repeatWeeks && (!validDate(draft.repeatDate) || dateTimeMs(draft.repeatDate, '00:00') <= dateTimeMs(draft.date, '00:00'))) { window.alert('Choisis une date du prochain RDV après le rendez-vous actuel.'); $('#repeatDate').focus(); return; }
    const conflicts = findConflicts(draft); if (conflicts.length) openConflictDialog(draft, conflicts); else commitDraft(draft);
  });
  $('#blockForm').addEventListener('submit', event => { event.preventDefault(); saveBlock(); });
  $('#clientForm').addEventListener('submit', event => {
    event.preventDefault(); if (!$('#clientForm').reportValidity()) return;
    const client = clientById($('#profileKey').value); if (!client) return;
    const previousState = cloneState(app.state); client.name = $('#profileName').value.trim(); client.phone = $('#profilePhone').value.trim(); client.address = $('#profileAddress').value.trim(); client.notes = $('#profileNotes').value.trim(); client.updatedAt = new Date().toISOString();
    if (!saveState()) { app.state = previousState; return; }
    $('#clientDialog').close(); render();
  });
  $('#serviceForm').addEventListener('submit', event => { event.preventDefault(); saveService(); });
  $('#clientName').addEventListener('input', event => {
    const exact = app.state.clients.filter(client => normaliseName(client.name) === normaliseName(event.target.value));
    if (exact.length === 1) fillFromClient(exact[0]); else { app.ui.formClientId = null; renderSuggestions(); }
  });
  $('#clientName').addEventListener('focus', renderSuggestions);
  $('#clientName').addEventListener('blur', () => setTimeout(() => { $('#clientSuggestions').hidden = true; }, 150));
  $('#serviceSelect').addEventListener('change', applyServicePreset);
  $('#paymentStatus').addEventListener('change', syncPaymentFields);
  $('#status').addEventListener('change', () => { syncStatusFields(); updateConflictHint(); });
  $('#date').addEventListener('input', () => { updateConflictHint(); syncRepeatDate(false); });
  ['#time', '#duration'].forEach(selector => $(selector).addEventListener('input', () => { updateConflictHint(); syncRepeatDate(false); }));
  $('#repeatWeeks').addEventListener('change', () => { app.ui.repeatDateEdited = false; syncRepeatDate(true); });
  $('#repeatDate').addEventListener('input', () => { app.ui.repeatDateEdited = true; syncRepeatDate(false); });
  $('#blockAllDay').addEventListener('change', syncBlockAllDay);
  $('#workingHoursEditor').addEventListener('change', event => {
    const match = event.target.id?.match(/^workEnabled-(\d)$/); if (match) syncWorkingHoursRow(Number(match[1]));
  });
  $('#clientSearch').addEventListener('input', renderClients);
  $('#importData').addEventListener('change', event => importData(event.target.files[0]));

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=8', { updateViaCache: 'none' }).catch(() => {});
  render();
})();
