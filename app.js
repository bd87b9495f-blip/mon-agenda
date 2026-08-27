(() => {
  'use strict';

  const APP_VERSION = '12.2 bêta';
  const CURRENT_DATA_VERSION = 14;
  const BACKUP_FORMAT_VERSION = 3;
  const BACKUP_APP_ID = 'mon-agenda-prothesiste';
  const STATE_KEY = 'nail-planner-state-v14';
  const V13_KEY = 'nail-planner-state-v13';
  const V12_KEY = 'nail-planner-state-v12';
  const V11_KEY = 'nail-planner-state-v11';
  const V10_KEY = 'nail-planner-state-v10';
  const V9_KEY = 'nail-planner-state-v9';
  const V8_KEY = 'nail-planner-state-v8';
  const V7_KEY = 'nail-planner-state-v7';
  const V6_KEY = 'nail-planner-state-v6';
  const V5_KEY = 'nail-planner-state-v5';
  const LEGACY_APPOINTMENTS_KEY = 'nail-planner-v1';
  const LEGACY_PROFILES_KEY = 'nail-client-profiles-v1';
  const RESTORE_SAFETY_KEY = 'nail-planner-before-restore-v14';
  const V13_RESTORE_SAFETY_KEY = 'nail-planner-before-restore-v13';
  const V12_RESTORE_SAFETY_KEY = 'nail-planner-before-restore-v12';
  const V11_RESTORE_SAFETY_KEY = 'nail-planner-before-restore-v11';
  const V10_RESTORE_SAFETY_KEY = 'nail-planner-before-restore-v10';
  const V9_RESTORE_SAFETY_KEY = 'nail-planner-before-restore-v9';
  const V8_RESTORE_SAFETY_KEY = 'nail-planner-before-restore-v8';
  const MIGRATION_SAFETY_KEY = 'nail-planner-before-migration-v14';
  const APPOINTMENT_DRAFT_KEY = 'nail-planner-appointment-draft-v14';
  const V13_APPOINTMENT_DRAFT_KEY = 'nail-planner-appointment-draft-v13';
  const V12_APPOINTMENT_DRAFT_KEY = 'nail-planner-appointment-draft-v12';
  const V11_APPOINTMENT_DRAFT_KEY = 'nail-planner-appointment-draft-v11';
  const CLIENT_DRAFT_KEY = 'nail-planner-client-draft-v14';
  const V13_CLIENT_DRAFT_KEY = 'nail-planner-client-draft-v13';
  const V12_CLIENT_DRAFT_KEY = 'nail-planner-client-draft-v12';
  const BLOCK_DRAFT_KEY = 'nail-planner-block-draft-v14';
  const V13_BLOCK_DRAFT_KEY = 'nail-planner-block-draft-v13';
  const V12_BLOCK_DRAFT_KEY = 'nail-planner-block-draft-v12';
 const EXPENSE_DRAFT_KEY = 'nail-planner-expense-draft-v14';
  const EXPENSE_CATEGORY_DRAFT_KEY = 'nail-planner-expense-category-draft-v14';
  const CORRUPT_STATE_KEY = 'nail-planner-unreadable-state-v14';
  const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
  const LIMITS = { clients: 20000, appointments: 100000, blocks: 20000, expenses: 50000, settingsItems: 500, text: 5000, shortText: 200, duration: 24 * 60, amount: 1000000 };
  const HOUR_HEIGHT = 68;
  const WEEK_HOUR_HEIGHT = 44;
  const STATUS = {
    to_confirm: 'À confirmer', confirmed: 'Confirmé', completed: 'Terminé',
    cancelled: 'Annulé', no_show: 'Absente'
  };
  const PAYMENT = { unreviewed: 'À vérifier', pending: 'À régler', paid: 'Payé' };
  const METHOD = { cash: 'Espèces', card: 'Carte', transfer: 'Virement', other: 'Autre' };
  const CONTACT = { instagram: 'Instagram', messenger: 'Facebook / Messenger', phone: 'Téléphone / SMS', whatsapp: 'WhatsApp', other: 'Autre' };
  const COLORS = ['rose', 'purple', 'orange', 'teal', 'blue', 'green', 'amber', 'coral'];
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
  const numericAmount = value => Math.round(Math.max(0, Number(String(value ?? '').replace(',', '.')) || 0) * 100) / 100;
  const boundedText = (value, maximum = LIMITS.text) => String(value || '').trim().slice(0, maximum);

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
      { id: 'preset-renfort', name: 'Renfort', duration: 60, price: '', color: 'teal', active: true },
      { id: 'preset-semi-permanent', name: 'Semi-permanent', duration: 45, price: '', color: 'blue', active: true }
    ];
  }

  function defaultSupplementTypes() {
    return [
      { id: 'supp-decoration', name: 'Décorations', price: '', active: true },
      { id: 'supp-travel-30', name: 'Déplacement +30 km', price: '', active: true },
      { id: 'supp-other', name: 'Autre', price: '', active: true }
    ];
  }

  function defaultClientBadges() {
    return [
      { id: 'badge-favourite', name: 'Cliente appréciée', emoji: '🩷', symbol: '🩷' },
      { id: 'badge-priority', name: 'Prioritaire', emoji: '⭐', symbol: '⭐' },
      { id: 'badge-watch', name: 'Vigilance', emoji: '⚠️', symbol: '⚠️' },
      { id: 'badge-late', name: 'Annulations tardives', emoji: '⏰', symbol: '⏰' }
    ];
  }

  function defaultExpenseCategories() {
    return [
      { id: 'expense-consumables', name: 'Réapprovisionnement / consommables', active: true },
      { id: 'expense-equipment', name: 'Matériel / équipement', active: true },
      { id: 'expense-training', name: 'Formation', active: true },
      { id: 'expense-travel', name: 'Déplacement', active: true },
      { id: 'expense-marketing', name: 'Communication / publicité', active: true },
      { id: 'expense-software', name: 'Abonnement / logiciel', active: true },
      { id: 'expense-other', name: 'Autre', active: true }
    ];
  }

  function firstGrapheme(value, fallback = '🏷️') {
    const text = String(value || '').trim();
    if (!text) return fallback;
    try {
      const segment = new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(text)[Symbol.iterator]().next().value?.segment;
      return segment || fallback;
    } catch { return Array.from(text)[0] || fallback; }
  }

  function normaliseSupplementTypes(raw) {
    const source = Array.isArray(raw) ? raw : defaultSupplementTypes(), result = [], ids = new Set(), names = new Set();
    source.slice(0, LIMITS.settingsItems).forEach(item => {
      const name = String(item?.name || '').trim().slice(0, 80), suppliedId = String(item?.id || '').trim() === 'custom' ? '' : String(item?.id || '').trim();
      if (!name || names.has(normaliseName(name))) return;
      let id = suppliedId || uuid();
      if (ids.has(id)) id = uuid();
      const price = item?.price === '' || item?.price === null || item?.price === undefined ? '' : String(Math.min(LIMITS.amount, numericAmount(item.price)));
      result.push({ id, name, price, active: item?.active !== false }); ids.add(id); names.add(normaliseName(name));
    });
    return result.length ? result : defaultSupplementTypes();
  }

  function normaliseClientBadges(raw) {
    const supplied = Array.isArray(raw), source = supplied ? raw : defaultClientBadges(), result = [], ids = new Set(), names = new Set();
    source.slice(0, LIMITS.settingsItems).forEach(item => {
      const name = String(item?.name || '').trim().slice(0, 60), suppliedId = String(item?.id || '').trim() === 'custom' ? '' : String(item?.id || '').trim();
      if (!name || names.has(normaliseName(name))) return;
      let id = suppliedId || uuid();
      if (ids.has(id)) id = uuid();
      const emoji = firstGrapheme(item?.emoji || item?.symbol);
      const requestedColor = String(item?.color || '').trim().toLowerCase();
      const badge = { id, name, emoji, symbol: emoji };
      if (/^#[0-9a-f]{6}$/.test(requestedColor)) badge.color = requestedColor;
      result.push(badge); ids.add(id); names.add(normaliseName(name));
    });
    return supplied ? result : (result.length ? result : defaultClientBadges());
  }

  function normaliseExpenseCategories(raw) {
    const source = Array.isArray(raw) ? raw : defaultExpenseCategories(), result = [], ids = new Set(), names = new Set();
    source.slice(0, LIMITS.settingsItems).forEach(item => {
      const name = boundedText(item?.name || item?.label, 100), suppliedId = String(item?.id || '').trim();
      const nameKey = normaliseName(name);
      if (!name || names.has(nameKey)) return;
      let id = suppliedId || uuid();
      if (ids.has(id)) id = uuid();
      result.push({ id, name, active: item?.active !== false });
      ids.add(id); names.add(nameKey);
    });
    return result.length ? result : defaultExpenseCategories();
  }

  function normaliseExpenses(raw, categories) {
    if (!Array.isArray(raw)) return [];
    const categoryById = new Map(categories.map(category => [category.id, category]));
    const categoryByName = new Map(categories.map(category => [normaliseName(category.name), category]));
    const defaults = defaultExpenseCategories();
    const fallbackCategory = categoryById.get('expense-other') || categories[0] || defaults[defaults.length - 1];
    const ids = new Set();
    return raw.slice(0, LIMITS.expenses).map(item => {
      const date = pickDate(item?.date || item?.expenseDate || item?.createdAt);
      const amount = numericAmount(item?.amount ?? item?.price ?? item?.total);
      if (!validDate(date) || amount <= 0) return null;
      let id = String(item?.id || '').trim() || uuid();
      if (ids.has(id)) id = uuid();
      ids.add(id);
      const suppliedLabel = boundedText(item?.categoryLabel || item?.categoryName || item?.category || item?.nature, 100);
      const category = categoryById.get(String(item?.categoryId || '').trim()) || categoryByName.get(normaliseName(suppliedLabel)) || fallbackCategory;
      return {
        id,
        categoryId: category.id,
        categoryLabel: suppliedLabel || category.name,
        details: boundedText(item?.details || item?.description || item?.content || item?.items),
        supplier: boundedText(item?.supplier || item?.vendor || item?.store || item?.enseigne, LIMITS.shortText),
        date,
        amount: Math.min(LIMITS.amount, amount),
        createdAt: String(item?.createdAt || new Date().toISOString()),
        updatedAt: String(item?.updatedAt || item?.createdAt || new Date().toISOString())
      };
    }).filter(Boolean);
  }

  function normaliseSupplements(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 20).map(item => ({
      id: String(item?.id || uuid()), typeId: String(item?.typeId || ''),
      label: String(item?.label || item?.name || 'Supplément').trim().slice(0, 80) || 'Supplément',
      amount: Math.min(LIMITS.amount, numericAmount(item?.amount))
    })).filter(item => item.amount > 0 || item.label);
  }

  function normaliseHistory(raw, fallbackCreatedAt) {
    if (!Array.isArray(raw)) return [];
    return raw.slice(-100).map(item => ({
      id: String(item?.id || uuid()), type: String(item?.type || 'update').slice(0, 30),
      at: String(item?.at || fallbackCreatedAt || new Date().toISOString()),
      label: String(item?.label || 'Rendez-vous modifié').trim().slice(0, 180),
      details: String(item?.details || '').trim().slice(0, 500)
    }));
  }

  function appointmentTotal(appointment) {
    return numericAmount(appointment?.price) + normaliseSupplements(appointment?.supplements).reduce((sum, item) => sum + numericAmount(item.amount), 0);
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

  function normaliseServices(raw, options = {}) {
    const source = Array.isArray(raw) ? raw : defaultServices();
    const services = [], byId = new Map(), legacyNames = new Set();
    source.slice(0, LIMITS.settingsItems).forEach((item, index) => {
      const name = String(item?.name || '').trim(), nameKey = normaliseName(name), suppliedId = String(item?.id || '').trim() === 'custom' ? '' : String(item?.id || '').trim();
      if (!name || (suppliedId && byId.has(suppliedId)) || (!suppliedId && legacyNames.has(nameKey))) return;
      const service = {
        id: suppliedId || `service-${index}-${uuid()}`, name,
        duration: Math.min(LIMITS.duration, Math.max(15, Number(item.duration) || 60)),
        price: item.price === '' || item.price === null || item.price === undefined ? '' : String(Math.min(LIMITS.amount, numericAmount(item.price))),
        color: COLORS.includes(item.color) ? item.color : COLORS[index % COLORS.length], active: item.active !== false
      };
      services.push(service); byId.set(service.id, service); if (!suppliedId) legacyNames.add(nameKey);
    });
    if (options.addDefaults !== false) {
      defaultServices().forEach(preset => {
        if (services.length >= LIMITS.settingsItems) return;
        if (services.some(service => normaliseName(service.name) === normaliseName(preset.name))) return;
        const id = byId.has(preset.id) ? `${preset.id}-${uuid()}` : preset.id;
        const service = { ...preset, id };
        services.push(service); byId.set(id, service);
      });
    }
    return services;
  }

  function validAppointment(raw) {
    return raw && typeof raw === 'object' && validDate(raw.date) && validTime(raw.time);
  }

  function normaliseBlock(raw) {
    const allDay = Boolean(raw?.allDay) || Boolean(raw?.date && !raw?.startDate && !raw?.startTime);
    const startDate = pickDate(raw?.startDate || raw?.date);
    if (!validDate(startDate)) return null;
    const blocksAppointments = typeof raw?.blocksAppointments === 'boolean' ? raw.blocksAppointments
      : (typeof raw?.blocking === 'boolean' ? raw.blocking : (typeof raw?.blocksBookings === 'boolean' ? raw.blocksBookings : true));
    const details = {
      blocksAppointments,
      address: boundedText(raw?.address || raw?.location, LIMITS.shortText), notes: boundedText(raw?.notes || raw?.comment || raw?.commentaire),
      createdAt: String(raw?.createdAt || new Date().toISOString()), updatedAt: String(raw?.updatedAt || raw?.createdAt || new Date().toISOString())
    };
    if (allDay) {
      const endDate = raw?.endDate ? pickDate(raw.endDate) : startDate;
      if (!validDate(endDate) || endDate < startDate) return null;
      return { id: String(raw.id || uuid()), allDay: true, startDate, startTime: '00:00', endDate, endTime: '00:00', reason: boundedText(raw.reason || raw.title || raw.label || 'Événement personnel', LIMITS.shortText) || 'Événement personnel', ...details };
    }
    const endDate = pickDate(raw?.endDate || startDate), startTime = validTime(raw?.startTime) ? raw.startTime : '09:00', endTime = validTime(raw?.endTime) ? raw.endTime : '10:00';
    if (!validDate(endDate) || dateTimeMs(endDate, endTime) <= dateTimeMs(startDate, startTime)) return null;
    return { id: String(raw.id || uuid()), allDay: false, startDate, startTime, endDate, endTime, reason: boundedText(raw.reason || raw.title || raw.label || 'Événement personnel', LIMITS.shortText) || 'Événement personnel', ...details };
  }

  function validateImportedState(data) {
    const state = data?.state || data || {};
    const currentSchema = Number(data?.dataVersion ?? state?.version ?? data?.version ?? 0) >= CURRENT_DATA_VERSION;
    const appointments = Array.isArray(state) ? state : (Array.isArray(state.appointments) ? state.appointments : []);
    const clients = Array.isArray(state.clients) ? state.clients : [];
    const blocks = [state.blocks, state.blockedSlots, state.unavailableDays].filter(Array.isArray).flat();
    const expenses = Array.isArray(state.expenses) ? state.expenses : (Array.isArray(state.spendings) ? state.spendings : []);
    const settings = state.settings && typeof state.settings === 'object' ? state.settings : {};
    if (clients.length > LIMITS.clients || appointments.length > LIMITS.appointments || blocks.length > LIMITS.blocks || expenses.length > LIMITS.expenses) throw new Error('INVALID_TOO_MANY_ITEMS');
    if ((settings.services?.length || 0) > LIMITS.settingsItems || (settings.supplementTypes?.length || 0) > LIMITS.settingsItems || (settings.clientBadges?.length || 0) > LIMITS.settingsItems || (settings.expenseCategories?.length || 0) > LIMITS.settingsItems) throw new Error('INVALID_TOO_MANY_SETTINGS');
    const textTooLong = value => typeof value === 'string' && value.length > LIMITS.text;
    const inspectText = raw => Object.values(raw || {}).some(value => textTooLong(value));
    const settingsText = ['services', 'supplementTypes', 'clientBadges', 'expenseCategories'].some(key => Array.isArray(settings[key]) && settings[key].some(inspectText));
    if (clients.some(inspectText) || blocks.some(inspectText) || expenses.some(inspectText) || settingsText || appointments.some(raw => inspectText(raw) || (Array.isArray(raw?.supplements) && raw.supplements.some(inspectText)) || (Array.isArray(raw?.history) && raw.history.some(inspectText)))) throw new Error('INVALID_TEXT_LENGTH');
    if (appointments.some(raw => raw?.duration !== undefined && (!Number.isFinite(Number(raw.duration)) || Number(raw.duration) < 15 || Number(raw.duration) > LIMITS.duration))) throw new Error('INVALID_DURATION');
    if (currentSchema && appointments.some(raw =>
      (Object.prototype.hasOwnProperty.call(raw || {}, 'supplements') && !Array.isArray(raw.supplements))
      || (Object.prototype.hasOwnProperty.call(raw || {}, 'history') && !Array.isArray(raw.history))
      || (raw?.status !== undefined && !Object.prototype.hasOwnProperty.call(STATUS, raw.status))
      || (raw?.paymentStatus !== undefined && !Object.prototype.hasOwnProperty.call(PAYMENT, raw.paymentStatus))
      || (raw?.paymentMethod !== undefined && raw.paymentMethod !== '' && !Object.prototype.hasOwnProperty.call(METHOD, raw.paymentMethod))
      || (raw?.contactVia !== undefined && raw.contactVia !== '' && !Object.prototype.hasOwnProperty.call(CONTACT, raw.contactVia))
      || (raw?.lateCancellation !== undefined && typeof raw.lateCancellation !== 'boolean')
    )) throw new Error('INVALID_APPOINTMENT_STRUCTURE');
    if (currentSchema && clients.some(raw => raw?.contactVia !== undefined && raw.contactVia !== '' && !Object.prototype.hasOwnProperty.call(CONTACT, raw.contactVia))) throw new Error('INVALID_CLIENT_CONTACT');
    const invalidAmount = (value, required = false) => {
      if (!required && (value === '' || value === null || value === undefined)) return false;
      const amount = Number(String(value ?? '').replace(',', '.'));
      return !Number.isFinite(amount) || amount < (required ? 0.01 : 0) || amount > LIMITS.amount;
    };
    if (appointments.some(raw => invalidAmount(raw?.price) || (Array.isArray(raw?.supplements) && raw.supplements.some(item => invalidAmount(item?.amount))))
      || (Array.isArray(settings.supplementTypes) && settings.supplementTypes.some(item => invalidAmount(item?.price)))
      || expenses.some(item => invalidAmount(item?.amount ?? item?.price ?? item?.total, true))) throw new Error('INVALID_AMOUNT');
    if (blocks.some(raw =>
      (Object.prototype.hasOwnProperty.call(raw || {}, 'blocksAppointments') && typeof raw.blocksAppointments !== 'boolean')
      || (Object.prototype.hasOwnProperty.call(raw || {}, 'blocking') && typeof raw.blocking !== 'boolean')
      || (Object.prototype.hasOwnProperty.call(raw || {}, 'blocksBookings') && typeof raw.blocksBookings !== 'boolean')
      || (currentSchema && Object.prototype.hasOwnProperty.call(raw || {}, 'allDay') && typeof raw.allDay !== 'boolean')
    )) throw new Error('INVALID_BLOCKING_VALUE');
    if (expenses.some(item => !validDate(pickDate(item?.date || item?.expenseDate)))) throw new Error('INVALID_EXPENSE_DATE');
  }

  function migrateState(source, legacyProfiles = {}, options = {}) {
    const data = source?.state || source || {}, strict = Boolean(options.strict), clients = [], clientsById = new Map(), firstClientByName = new Map();
    if (strict) validateImportedState(source);
    if (strict && !Array.isArray(data)) {
      for (const key of ['clients', 'appointments', 'blocks', 'blockedSlots', 'unavailableDays', 'expenses', 'spendings']) {
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
      client.contactVia ||= CONTACT[raw?.contactVia] ? raw.contactVia : '';
      client.badgeId ||= String(raw?.badgeId || '').trim();
      return client;
    };
    const addClient = (raw, { dedupeByName = false, fallbackName = '' } = {}) => {
      const name = boundedText(raw?.name || raw?.client || raw?.clientName || fallbackName, LIMITS.shortText);
      if (!name) return null;
      const suppliedId = String(raw?.id || raw?.clientId || '').trim(), nameKey = normaliseName(name);
      if (suppliedId && clientsById.has(suppliedId)) return mergeMissingClientFields(clientsById.get(suppliedId), raw);
      if (!suppliedId && dedupeByName && firstClientByName.has(nameKey)) return mergeMissingClientFields(firstClientByName.get(nameKey), raw);
      const client = {
        id: suppliedId || uuid(), name, phone: boundedText(raw?.phone, 80), address: boundedText(raw?.address, LIMITS.shortText), notes: boundedText(raw?.notes),
        contactVia: CONTACT[raw?.contactVia] ? raw.contactVia : '', badgeId: String(raw?.badgeId || '').trim(),
        lateBadgePromptDisabled: raw?.lateBadgePromptDisabled === true, lateBadgePromptLastCount: Math.max(0, Number(raw?.lateBadgePromptLastCount) || 0),
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
    if (strict && Object.prototype.hasOwnProperty.call(rawSettings, 'supplementTypes') && !Array.isArray(rawSettings.supplementTypes)) throw new Error('INVALID_STRUCTURE');
    if (strict && Object.prototype.hasOwnProperty.call(rawSettings, 'clientBadges') && !Array.isArray(rawSettings.clientBadges)) throw new Error('INVALID_STRUCTURE');
    if (strict && Object.prototype.hasOwnProperty.call(rawSettings, 'expenseCategories') && !Array.isArray(rawSettings.expenseCategories)) throw new Error('INVALID_STRUCTURE');
    if (strict && Array.isArray(rawSettings.services)) {
      const serviceIds = rawSettings.services.map(service => String(service?.id || '').trim()).filter(Boolean);
      if (rawSettings.services.some(service => !String(service?.name || '').trim()) || new Set(serviceIds).size !== serviceIds.length) throw new Error('INVALID_SERVICE');
    }
    if (strict && Array.isArray(rawSettings.clientBadges)) {
      const badgeIds = rawSettings.clientBadges.map(badge => String(badge?.id || '').trim()).filter(Boolean);
      const badgeNames = rawSettings.clientBadges.map(badge => normaliseName(badge?.name)).filter(Boolean);
      const emojiRequired = Number(data.version || 0) >= CURRENT_DATA_VERSION;
      if (rawSettings.clientBadges.some(badge => !String(badge?.name || '').trim()) || new Set(badgeIds).size !== badgeIds.length || new Set(badgeNames).size !== badgeNames.length
        || (emojiRequired && rawSettings.clientBadges.some(badge => !String(badge?.id || '').trim() || !String(badge?.emoji || badge?.symbol || '').trim()))) throw new Error('INVALID_CLIENT_BADGE');
    }
    if (strict && Array.isArray(rawSettings.expenseCategories)) {
      const categoryIds = rawSettings.expenseCategories.map(category => String(category?.id || '').trim()).filter(Boolean);
      const categoryNames = rawSettings.expenseCategories.map(category => normaliseName(category?.name || category?.label)).filter(Boolean);
      if (rawSettings.expenseCategories.some(category => !String(category?.id || '').trim() || !String(category?.name || category?.label || '').trim()) || new Set(categoryIds).size !== categoryIds.length || new Set(categoryNames).size !== categoryNames.length) throw new Error('INVALID_EXPENSE_CATEGORY');
    }
    const services = normaliseServices(rawSettings.services, { addDefaults: Number(data.version || 0) < 12 });
    const serviceByName = name => services.find(service => normaliseName(service.name) === normaliseName(name));
    const ensureService = (name, duration, price, color) => {
      const found = serviceByName(name);
      if (found) return found;
      const service = { id: uuid(), name: boundedText(name || 'Prestation', LIMITS.shortText) || 'Prestation', duration: Math.min(LIMITS.duration, Math.max(15, Number(duration) || 60)), price: price === '' || price === undefined || price === null ? '' : String(Math.min(LIMITS.amount, numericAmount(price))), color: COLORS.includes(color) ? color : 'rose', active: true };
      services.push(service); return service;
    };
    const rawAppointments = Array.isArray(data.appointments) ? data.appointments : Array.isArray(data) ? data : [];
    if (strict) {
      const appointmentIds = rawAppointments.map(appointment => String(appointment?.id || '').trim()).filter(Boolean);
      if (rawAppointments.some(raw => !validAppointment(raw)) || new Set(appointmentIds).size !== appointmentIds.length) throw new Error('INVALID_APPOINTMENT');
    }
    const appointments = rawAppointments.filter(validAppointment).map(raw => {
      const requestedClientId = String(raw.clientId || '').trim(), legacyName = String(raw.name || raw.client || raw.clientName || '').trim();
      const appointmentClient = {
        id: requestedClientId, name: legacyName || 'Cliente sans nom', phone: raw.phone, address: raw.address,
        notes: raw.clientNotes || '', contactVia: raw.contactVia, badgeId: raw.badgeId,
        createdAt: raw.clientCreatedAt, updatedAt: raw.clientUpdatedAt
      };
      let client = requestedClientId ? clientsById.get(requestedClientId) : null;
      if (!client && requestedClientId) client = addClient(appointmentClient, { fallbackName: legacyName || 'Cliente sans nom' });
      client ||= firstClientByName.get(normaliseName(legacyName)) || addClient(appointmentClient, { dedupeByName: true }) || addClient({ name: 'Cliente sans nom' }, { dedupeByName: true });
      let service = raw.serviceId ? services.find(item => item.id === raw.serviceId) : null;
      service ||= serviceByName(raw.service || 'Prestation') || ensureService(raw.service || 'Prestation', raw.duration, raw.price, raw.serviceColor);
      const paymentStatus = Object.prototype.hasOwnProperty.call(PAYMENT, raw.paymentStatus) ? raw.paymentStatus : 'unreviewed';
      const suppliedPaymentDate = pickDate(raw.paymentDate) || pickDate(raw.paidAt);
      const suppliedReminderDate = pickDate(raw.paymentReminderDate) || pickDate(raw.paymentDueDate) || pickDate(raw.reminderDate);
      if (strict && raw.paymentDate && !validDate(pickDate(raw.paymentDate))) throw new Error('INVALID_PAYMENT_DATE');
      if (strict && (raw.paymentReminderDate || raw.paymentDueDate || raw.reminderDate) && !validDate(suppliedReminderDate)) throw new Error('INVALID_PAYMENT_REMINDER');
      const paymentDate = paymentStatus === 'paid' ? (validDate(suppliedPaymentDate) ? suppliedPaymentDate : raw.date) : '';
      const paymentReminderDate = paymentStatus === 'pending' && validDate(suppliedReminderDate) ? suppliedReminderDate : '';
      return {
        id: String(raw.id || uuid()), clientId: client.id, date: raw.date, time: raw.time, duration: Math.min(LIMITS.duration, Math.max(15, Number(raw.duration) || 60)),
        price: raw.price === '' || raw.price === null || raw.price === undefined ? '' : String(Math.min(LIMITS.amount, numericAmount(raw.price))), service: boundedText(raw.service || service.name || 'Prestation', LIMITS.shortText),
        serviceId: service.id, serviceColor: COLORS.includes(raw.serviceColor) ? raw.serviceColor : service.color,
        notes: boundedText(raw.notes), address: boundedText(raw.address || client.address, LIMITS.shortText), contactVia: CONTACT[raw.contactVia] ? raw.contactVia : (client.contactVia || ''), supplements: normaliseSupplements(raw.supplements),
        status: STATUS[raw.status] ? raw.status : 'confirmed', paymentStatus,
        paymentDate, paymentReminderDate, paymentMethod: METHOD[raw.paymentMethod] ? raw.paymentMethod : '', cancellationReason: String(raw.cancellationReason || raw.statusReason || raw.reason || '').trim(),
        lateCancellation: raw.lateCancellation === true,
        recurrenceId: String(raw.recurrenceId || '').trim(), parentAppointmentId: String(raw.parentAppointmentId || raw.sourceAppointmentId || '').trim(),
        history: normaliseHistory(raw.history, raw.createdAt), createdAt: raw.createdAt || new Date().toISOString(), updatedAt: raw.updatedAt || new Date().toISOString()
      };
    });
   const blockSources = [data.blocks, data.blockedSlots, data.unavailableDays].filter(Array.isArray).flat();
   if (strict) {
      [data.blocks, data.blockedSlots, data.unavailableDays].filter(Array.isArray).forEach(collection => {
        const blockIds = collection.map(block => String(block?.id || '').trim()).filter(Boolean);
        if (new Set(blockIds).size !== blockIds.length) throw new Error('INVALID_BLOCK');
      });
   }
    const seenBlocks = new Map();
    const rawBlocks = blockSources.filter(raw => {
      const key = String(raw?.id || '') || JSON.stringify(raw);
      const normalised = normaliseBlock(raw);
      const signature = normalised ? JSON.stringify({
        allDay: normalised.allDay, startDate: normalised.startDate, startTime: normalised.startTime,
        endDate: normalised.endDate, endTime: normalised.endTime, reason: normalised.reason,
        blocksAppointments: normalised.blocksAppointments, address: normalised.address, notes: normalised.notes
      }) : '';
      if (seenBlocks.has(key)) {
        if (strict && seenBlocks.get(key) !== signature) throw new Error('INVALID_BLOCK_CONFLICT');
        return false;
      }
      seenBlocks.set(key, signature); return true;
    });
    if (strict && rawBlocks.some(raw => !normaliseBlock(raw))) throw new Error('INVALID_BLOCK');
    const blocks = rawBlocks.map(normaliseBlock).filter(Boolean);
   const expenseCategories = normaliseExpenseCategories(rawSettings.expenseCategories);
   const rawExpenses = Array.isArray(data.expenses) ? data.expenses : (Array.isArray(data.spendings) ? data.spendings : []);
   if (strict) {
     const expenseIds = rawExpenses.map(expense => String(expense?.id || '').trim()).filter(Boolean);
     if (rawExpenses.some(expense => !String(expense?.id || '').trim()) || new Set(expenseIds).size !== expenseIds.length) throw new Error('INVALID_EXPENSE');
      if (Number(data.version || 0) >= CURRENT_DATA_VERSION) {
        const categoryIds = new Set(expenseCategories.map(category => category.id));
        if (rawExpenses.some(expense => !categoryIds.has(String(expense?.categoryId || '').trim()))) throw new Error('INVALID_EXPENSE_CATEGORY_REFERENCE');
      }
   }
    const expenses = normaliseExpenses(rawExpenses, expenseCategories);
    const settings = {
      lastBackupAt: rawSettings.lastBackupAt || null,
      workingHours: normaliseHours(rawSettings.workingHours || rawSettings.workHours),
      services,
      supplementTypes: normaliseSupplementTypes(rawSettings.supplementTypes),
      clientBadges: normaliseClientBadges(rawSettings.clientBadges),
      expenseCategories,
      lateCancellationThreshold: Math.min(20, Math.max(1, Number(rawSettings.lateCancellationThreshold) || 3)),
      lateCancellationPromptEnabled: rawSettings.lateCancellationPromptEnabled !== false,
      backupReminderDays: Math.min(90, Math.max(1, Number(rawSettings.backupReminderDays) || 7))
    };
    const validBadgeIds = new Set(settings.clientBadges.map(badge => badge.id));
    clients.forEach(client => { if (!validBadgeIds.has(client.badgeId)) client.badgeId = ''; });
    return { version: CURRENT_DATA_VERSION, clients, appointments, blocks, expenses, settings };
  }

  function hasStoredState(state) {
    return Boolean(state && (Array.isArray(state) || state.clients || state.appointments || state.blocks || state.expenses || state.settings));
  }

  function preserveBeforeMigration(state, sourceVersion) {
    if (!hasStoredState(state)) return;
    try {
      localStorage.setItem(MIGRATION_SAFETY_KEY, JSON.stringify({
        app: BACKUP_APP_ID,
        backupFormatVersion: BACKUP_FORMAT_VERSION,
        dataVersion: Number(sourceVersion) || Number(state?.version) || 1,
        exportedAt: new Date().toISOString(),
        reason: 'before-migration',
        state
      }));
    } catch {}
  }

  let startupLoadWarning = '';
  function loadState() {
    let rawCurrent = null;
    try { rawCurrent = localStorage.getItem(STATE_KEY); } catch {}
    if (rawCurrent !== null) {
      try {
        const current = JSON.parse(rawCurrent);
        if (!hasStoredState(current)) throw new Error('INVALID_CURRENT_STATE');
        if (Number(current?.version) !== CURRENT_DATA_VERSION) preserveBeforeMigration(current, current?.version);
        return migrateState(current, {}, { strict: true });
      } catch {
        try { localStorage.setItem(CORRUPT_STATE_KEY, rawCurrent); } catch {}
        startupLoadWarning = 'Les données de la version actuelle étaient illisibles. Une ancienne copie exploitable a été chargée sans supprimer la copie abîmée. Vérifie tes rendez-vous puis fais une sauvegarde.';
      }
    }
    const candidates = [
      [13, V13_KEY], [12, V12_KEY], [11, V11_KEY], [10, V10_KEY], [9, V9_KEY], [8, V8_KEY], [7, V7_KEY], [6, V6_KEY], [5, V5_KEY]
    ];
    for (const [version, key] of candidates) {
      let raw = null;
      try { raw = localStorage.getItem(key); } catch {}
      if (raw === null) continue;
      try {
        const state = JSON.parse(raw);
        if (!hasStoredState(state)) throw new Error('INVALID_LEGACY_STATE');
        const migrated = migrateState(state, {}, { strict: true });
        preserveBeforeMigration(state, version);
        return migrated;
      } catch {
        try { localStorage.setItem(`nail-planner-unreadable-state-v${version}`, raw); } catch {}
        startupLoadWarning ||= `Les données de la version ${version} étaient illisibles. Une copie plus ancienne a été recherchée sans supprimer la copie abîmée.`;
      }
    }
    const legacyAppointments = safeJson(LEGACY_APPOINTMENTS_KEY, []), legacyProfiles = safeJson(LEGACY_PROFILES_KEY, {});
    if (legacyAppointments.length || Object.keys(legacyProfiles).length) preserveBeforeMigration({ appointments: legacyAppointments, clientProfiles: legacyProfiles }, 1);
    return migrateState({ appointments: legacyAppointments }, legacyProfiles);
  }

  const app = {
    state: loadState(),
    ui: {
      screen: 'agenda', mode: 'day', selectedDate: startOfDay(new Date()), weekStart: mondayOf(new Date()),
      monthDate: localDate(new Date().getFullYear(), new Date().getMonth(), 1), overviewWeekStart: null,
      editingAppointmentId: null, editingBlockId: null, pendingDraft: null, formClientId: null, formServiceColor: 'rose', repeatDateEdited: false, repeatTimeEdited: false,
      reportMode: 'week', expenseReportMode: 'month', expenseReportView: 'global', reportTab: 'activity', reportDate: startOfDay(new Date()),
      reviewDate: startOfDay(new Date()), reviewPendingId: null,
     quickAddDate: todayKey(), quickAddTime: '10:00', pendingDuplicate: null,
     appointmentSaving: false, blockSaving: false, expenseSaving: false, clientSaving: false, serviceSaving: false, supplementSaving: false, badgeSaving: false, undo: null, undoTimer: null, successTimer: null,
      appointmentContactExpanded: true, appointmentAdjustmentsExpanded: false,
      updateRegistration: null, reloadingForUpdate: false, settingsPage: 'home', settingsDirty: false,
      editingSupplementTypeId: null, editingBadgeId: null, editingExpenseId: null, pendingLateBadgeClientId: null, pendingBlockConflict: null,
      appointmentDraftBaseline: '', clientDraftBaseline: '', blockDraftBaseline: '', expenseDraftBaseline: '',
      formBaselines: {}, pendingUnsavedClose: null, reviewFinancialDraft: null
    }
  };
  const cloneState = state => JSON.parse(JSON.stringify(state));
  const saveState = (state = app.state, silent = false) => {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); hideUndo(); return true; }
    catch {
      if (!silent) window.alert('Impossible d’enregistrer sur cet appareil. Tes changements n’ont pas été appliqués. Libère un peu d’espace, puis réessaie.');
      return false;
    }
  };
  saveState();
  if (startupLoadWarning) setTimeout(() => window.alert(startupLoadWarning), 0);

  function hideUndo() {
    if (app.ui.undoTimer) clearTimeout(app.ui.undoTimer);
    app.ui.undoTimer = null; app.ui.undo = null;
    const toast = $('#undoToast'); if (toast) toast.hidden = true;
  }

  function showSuccess(message) {
    const toast = $('#successToast');
    if (!toast) return;
    if (app.ui.successTimer) clearTimeout(app.ui.successTimer);
    const label = $('#successMessage'); if (label) label.textContent = message; else toast.textContent = message;
    toast.hidden = false;
    app.ui.successTimer = setTimeout(() => { toast.hidden = true; app.ui.successTimer = null; }, 3200);
  }

  function offerUndo(previousState, message) {
    if (!previousState) return;
    if (app.ui.undoTimer) clearTimeout(app.ui.undoTimer);
    app.ui.undo = { state: previousState, message };
    $('#undoMessage').textContent = message; $('#undoToast').hidden = false;
    app.ui.undoTimer = setTimeout(hideUndo, 9000);
  }

  function undoLastAction() {
    if (!app.ui.undo?.state) return;
    const state = cloneState(app.ui.undo.state);
    if (!saveState(state)) return;
    app.state = state; hideUndo(); render();
  }

  const DRAFT_FIELDS = ['clientName', 'phone', 'contactVia', 'serviceSelect', 'service', 'price', 'date', 'time', 'duration', 'status', 'address', 'notes', 'paymentStatus', 'paymentDate', 'paymentMethod', 'paymentReminderDate', 'repeatWeeks', 'repeatDate', 'repeatTime', 'cancellationReason'];

  function appointmentDraftPayload() {
    const values = Object.fromEntries(DRAFT_FIELDS.map(id => [id, $(`#${id}`).value]));
    return { version: 1, kind: 'appointment', editingAppointmentId: app.ui.editingAppointmentId || '', formClientId: app.ui.formClientId || '', formServiceColor: app.ui.formServiceColor || 'rose', supplements: supplementsFromForm(true), lateCancellation: $('#lateCancellation').checked, values };
  }

  const draftSignature = draft => JSON.stringify({ ...draft, savedAt: undefined });

  function appointmentDraft() {
    const draft = safeJson(APPOINTMENT_DRAFT_KEY, null) || safeJson(V13_APPOINTMENT_DRAFT_KEY, null) || safeJson(V12_APPOINTMENT_DRAFT_KEY, null) || safeJson(V11_APPOINTMENT_DRAFT_KEY, null);
    if (!draft || draft.version !== 1 || !draft.values || typeof draft.values !== 'object') return null;
    return draft;
  }

  function clearAppointmentDraft() {
    try { localStorage.removeItem(APPOINTMENT_DRAFT_KEY); localStorage.removeItem(V13_APPOINTMENT_DRAFT_KEY); localStorage.removeItem(V12_APPOINTMENT_DRAFT_KEY); localStorage.removeItem(V11_APPOINTMENT_DRAFT_KEY); } catch {}
    renderDraftNotice();
  }

  function clearAllFormDrafts() {
    try {
      localStorage.removeItem(APPOINTMENT_DRAFT_KEY); localStorage.removeItem(V13_APPOINTMENT_DRAFT_KEY); localStorage.removeItem(V12_APPOINTMENT_DRAFT_KEY); localStorage.removeItem(V11_APPOINTMENT_DRAFT_KEY);
      localStorage.removeItem(CLIENT_DRAFT_KEY); localStorage.removeItem(V13_CLIENT_DRAFT_KEY); localStorage.removeItem(V12_CLIENT_DRAFT_KEY); localStorage.removeItem(BLOCK_DRAFT_KEY); localStorage.removeItem(V13_BLOCK_DRAFT_KEY); localStorage.removeItem(V12_BLOCK_DRAFT_KEY);
     localStorage.removeItem(EXPENSE_DRAFT_KEY);
      localStorage.removeItem(EXPENSE_CATEGORY_DRAFT_KEY);
    } catch {}
    renderDraftNotice();
  }

  function saveAppointmentDraft() {
    if (!$('#appointmentDialog').open) return;
    const draft = appointmentDraftPayload(), values = draft.values;
    if (draftSignature(draft) === app.ui.appointmentDraftBaseline) { clearAppointmentDraft(); return; }
    const meaningful = values.clientName.trim() || values.serviceSelect || values.service.trim() || values.phone.trim() || values.address.trim() || values.notes.trim();
    if (!meaningful) { clearAppointmentDraft(); return; }
    draft.savedAt = new Date().toISOString();
    try { localStorage.setItem(APPOINTMENT_DRAFT_KEY, JSON.stringify(draft)); renderDraftNotice(); } catch {}
  }

  function renderDraftNotice() {
    const candidates = [appointmentDraft(), clientFormDraft(), blockFormDraft(), expenseFormDraft(), expenseCategoryFormDraft()].filter(draft => draft?.savedAt && draft?.values).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    const draft = candidates[0], target = $('#draftNotice');
    if (!target) return;
    target.hidden = !draft;
    if (!draft) return;
    app.ui.draftNoticeKind = draft.kind || 'appointment';
    if (app.ui.draftNoticeKind === 'client') { $('#draftNoticeTitle').textContent = 'Fiche cliente en cours'; $('#draftNoticeText').textContent = draft.values.name || 'Modifications non enregistrées'; return; }
    if (app.ui.draftNoticeKind === 'block') { $('#draftNoticeTitle').textContent = 'Événement personnel en cours'; $('#draftNoticeText').textContent = draft.values.reason || 'Événement à terminer'; return; }
   if (app.ui.draftNoticeKind === 'expense') { $('#draftNoticeTitle').textContent = 'Dépense en cours'; $('#draftNoticeText').textContent = `${draft.values.categoryLabel || 'Catégorie à choisir'}${draft.values.amount ? ` · ${money(draft.values.amount)}` : ''}`; return; }
    if (app.ui.draftNoticeKind === 'expenseCategory') { $('#draftNoticeTitle').textContent = 'Catégorie de dépense en cours'; $('#draftNoticeText').textContent = draft.values.name || 'Nom à terminer'; return; }
    $('#draftNoticeTitle').textContent = 'Rendez-vous en cours';
    const name = String(draft.values.clientName || '').trim() || 'cliente non renseignée', date = validDate(draft.values.date) ? format(parseDate(draft.values.date), { day: 'numeric', month: 'short' }) : 'date à choisir';
    $('#draftNoticeText').textContent = `${name} · ${date}${validTime(draft.values.time) ? ` à ${draft.values.time}` : ''}`;
  }

  function resumeAppointmentDraft() {
    const draft = appointmentDraft(); if (!draft) return;
    const editing = draft.editingAppointmentId ? app.state.appointments.find(item => item.id === draft.editingAppointmentId) : null;
    openAppointment(editing || null);
    const serviceId = String(draft.values.serviceSelect || '');
    populateServiceSelect(serviceId, draft.values.service || '');
    DRAFT_FIELDS.forEach(id => {
      const element = $(`#${id}`); if (element && draft.values[id] !== undefined) element.value = draft.values[id];
    });
    setTimePicker('time', draft.values.time || '10:00'); setDurationValue(draft.values.duration); if (validTime(draft.values.repeatTime)) setTimePicker('repeatTime', draft.values.repeatTime); renderSupplementRows(draft.supplements || []); $('#lateCancellation').checked = draft.lateCancellation === true;
    app.ui.formClientId = draft.formClientId || null; app.ui.formServiceColor = draft.formServiceColor || 'rose';
    app.ui.repeatDateEdited = validDate(draft.values.repeatDate); app.ui.repeatTimeEdited = validTime(draft.values.repeatTime);
    const client = app.ui.formClientId ? clientById(app.ui.formClientId) : null;
    renderSelectedClientInfo(client); syncAppointmentContactSummary(client, !client); setAppointmentAdjustments($('#serviceSelect').value === 'custom'); syncStatusFields(); syncPaymentFields(); syncRepeatDate(false); updateAppointmentTotal(); updateConflictHint();
  }

  function clientDraftValues() {
    return { id: $('#profileKey').value, name: $('#profileName').value, phone: $('#profilePhone').value, contactVia: $('#profileContactVia').value, badgeId: $('#profileBadge').value, address: $('#profileAddress').value, notes: $('#profileNotes').value };
  }

 const clientFormDraft = () => safeJson(CLIENT_DRAFT_KEY, null) || safeJson(V13_CLIENT_DRAFT_KEY, null) || safeJson(V12_CLIENT_DRAFT_KEY, null);
  const blockFormDraft = () => safeJson(BLOCK_DRAFT_KEY, null) || safeJson(V13_BLOCK_DRAFT_KEY, null) || safeJson(V12_BLOCK_DRAFT_KEY, null);
  const expenseFormDraft = () => safeJson(EXPENSE_DRAFT_KEY, null);
 const expenseCategoryFormDraft = () => safeJson(EXPENSE_CATEGORY_DRAFT_KEY, null);

  function expenseDraftValues() {
    const category = app.state.settings.expenseCategories.find(item => item.id === $('#expenseCategory')?.value);
    return {
      id: $('#expenseId')?.value || '', categoryId: $('#expenseCategory')?.value || '', categoryLabel: category?.name || '',
      details: $('#expenseDetails')?.value || '', supplier: $('#expenseSupplier')?.value || '', date: $('#expenseDate')?.value || '', amount: $('#expenseAmount')?.value || ''
    };
  }

  const expenseDraftSignature = values => JSON.stringify({
    id: values.id, categoryId: values.categoryId, details: values.details,
    supplier: values.supplier, date: values.date, amount: values.amount
  });

  function saveClientDraft() {
    if (!$('#clientDialog').open) return;
    const values = clientDraftValues();
    if (JSON.stringify(values) === app.ui.clientDraftBaseline) { clearFormDraft('client'); return; }
    try { localStorage.setItem(CLIENT_DRAFT_KEY, JSON.stringify({ version: 1, kind: 'client', savedAt: new Date().toISOString(), values })); renderDraftNotice(); } catch {}
  }

  function saveBlockDraft() {
    if (!$('#blockDialog').open) return;
    const values = blockDraft();
    if (JSON.stringify(values) === app.ui.blockDraftBaseline) { clearFormDraft('block'); return; }
    try { localStorage.setItem(BLOCK_DRAFT_KEY, JSON.stringify({ version: 1, kind: 'block', savedAt: new Date().toISOString(), values })); renderDraftNotice(); } catch {}
  }

  function saveExpenseDraft() {
    if (!$('#expenseDialog')?.open) return;
    const values = expenseDraftValues();
    if (expenseDraftSignature(values) === app.ui.expenseDraftBaseline || (!values.details.trim() && !values.supplier.trim() && !values.amount && !values.categoryId)) { clearFormDraft('expense'); return; }
   try { localStorage.setItem(EXPENSE_DRAFT_KEY, JSON.stringify({ version: 1, kind: 'expense', savedAt: new Date().toISOString(), values })); renderDraftNotice(); } catch {}
 }

  function expenseCategoryDraftValues() {
    return { id: $('#expenseCategoryId')?.value || '', name: $('#expenseCategoryName')?.value || '' };
  }

 function saveExpenseCategoryDraft() {
   if (!$('#expenseCategoriesDialog')?.open) return;
    const changed = formHasChanges('expenseCategoriesDialog');
   const values = expenseCategoryDraftValues();
    if (!changed || !values.name.trim()) {
      try { localStorage.removeItem(EXPENSE_CATEGORY_DRAFT_KEY); } catch {}
      renderDraftNotice(); return;
    }
    try { localStorage.setItem(EXPENSE_CATEGORY_DRAFT_KEY, JSON.stringify({ version: 1, kind: 'expenseCategory', savedAt: new Date().toISOString(), values })); renderDraftNotice(); } catch {}
  }

  function clearFormDraft(kind = app.ui.draftNoticeKind) {
    try {
      if (kind === 'client') { localStorage.removeItem(CLIENT_DRAFT_KEY); localStorage.removeItem(V13_CLIENT_DRAFT_KEY); localStorage.removeItem(V12_CLIENT_DRAFT_KEY); }
      else if (kind === 'block') { localStorage.removeItem(BLOCK_DRAFT_KEY); localStorage.removeItem(V13_BLOCK_DRAFT_KEY); localStorage.removeItem(V12_BLOCK_DRAFT_KEY); }
     else if (kind === 'expense') localStorage.removeItem(EXPENSE_DRAFT_KEY);
      else if (kind === 'expenseCategory') localStorage.removeItem(EXPENSE_CATEGORY_DRAFT_KEY);
      else { localStorage.removeItem(APPOINTMENT_DRAFT_KEY); localStorage.removeItem(V13_APPOINTMENT_DRAFT_KEY); localStorage.removeItem(V12_APPOINTMENT_DRAFT_KEY); localStorage.removeItem(V11_APPOINTMENT_DRAFT_KEY); }
    } catch {}
    renderDraftNotice();
  }

 function resumeLatestDraft() {
   const kind = app.ui.draftNoticeKind;
    if (kind === 'expenseCategory') {
      const draft = expenseCategoryFormDraft(), values = draft?.values;
      if (!values) { clearFormDraft('expenseCategory'); return; }
      openExpenseCategories();
      if (expenseCategoryById(values.id)) editExpenseCategory(values.id);
      $('#expenseCategoryName').value = values.name || '';
      return;
    }
   if (kind === 'client') {
      const draft = clientFormDraft(), client = clientById(draft?.values?.id); if (!draft || !client) { clearFormDraft('client'); return; }
      openClient(client.id); $('#profileName').value = draft.values.name; $('#profilePhone').value = draft.values.phone; $('#profileContactVia').value = draft.values.contactVia; $('#profileBadge').value = draft.values.badgeId; $('#profileAddress').value = draft.values.address; $('#profileNotes').value = draft.values.notes; $('#profileWaze').hidden = !String(draft.values.address || '').trim(); syncProfileBadgeSummary(false); return;
    }
    if (kind === 'block') {
      const draft = blockFormDraft(), values = draft?.values; if (!values) { clearFormDraft('block'); return; }
      const existing = app.state.blocks.find(block => block.id === values.id); openBlock(existing || null, { date: values.startDate, time: values.startTime }); app.ui.editingBlockId = existing?.id || null; $('#blockId').value = values.id || existing?.id || $('#blockId').value; $('#blockAllDay').checked = values.allDay; $('#blockAllDayDate').value = values.startDate; $('#blockAllDayEndDate').value = values.endDate && values.endDate !== values.startDate ? values.endDate : ''; $('#blockStartDate').value = values.startDate; $('#blockStartTime').value = values.startTime; $('#blockEndDate').value = values.endDate || values.startDate; $('#blockEndTime').value = values.endTime; $('#blockReason').value = values.reason; $('#blockAppointments').checked = values.blocksAppointments !== false; $('#blockAddress').value = values.address; $('#blockNotes').value = values.notes; syncBlockAllDay(); syncBlockModePreview(); return;
    }
    if (kind === 'expense') {
      const draft = expenseFormDraft(), values = draft?.values; if (!values) { clearFormDraft('expense'); return; }
      const existing = app.state.expenses.find(expense => expense.id === values.id); openExpense(existing || null, { date: values.date });
      $('#expenseId').value = values.id || existing?.id || $('#expenseId').value; populateExpenseCategorySelect(values.categoryId); $('#expenseDetails').value = values.details || ''; $('#expenseSupplier').value = values.supplier || ''; $('#expenseDate').value = values.date || todayKey(); $('#expenseAmount').value = values.amount || ''; return;
    }
    resumeAppointmentDraft();
  }

  function formSignature(form) {
    if (!form) return '';
    return JSON.stringify([...form.elements].filter(element => !['button', 'submit', 'reset'].includes(element.type)).map((element, index) => ({
      key: element.id || element.name || String(index), type: element.type || element.tagName,
      value: element.type === 'checkbox' || element.type === 'radio' ? Boolean(element.checked) : String(element.value ?? '')
    })));
  }

  function captureFormBaseline(dialogId) {
    const form = $(`#${dialogId}`)?.querySelector('form');
    if (form) app.ui.formBaselines[dialogId] = formSignature(form);
  }

  function formHasChanges(dialogId) {
    if (dialogId === 'settingsDialog') return app.ui.settingsDirty;
    if (dialogId === 'dayReviewDialog') return false;
    const form = $(`#${dialogId}`)?.querySelector('form'), baseline = app.ui.formBaselines[dialogId];
    return Boolean(form && baseline !== undefined && formSignature(form) !== baseline);
  }

  function saveDraftForDialog(dialogId) {
    if (dialogId === 'appointmentDialog') saveAppointmentDraft();
    else if (dialogId === 'clientDialog') saveClientDraft();
    else if (dialogId === 'blockDialog') saveBlockDraft();
   else if (dialogId === 'expenseDialog') saveExpenseDraft();
    else if (dialogId === 'expenseCategoriesDialog') saveExpenseCategoryDraft();
  }

  function discardDraftForDialog(dialogId) {
    if (dialogId === 'appointmentDialog') clearAppointmentDraft();
    else if (dialogId === 'clientDialog') clearFormDraft('client');
    else if (dialogId === 'blockDialog') clearFormDraft('block');
   else if (dialogId === 'expenseDialog') clearFormDraft('expense');
    else if (dialogId === 'expenseCategoriesDialog') clearFormDraft('expenseCategory');
  }

  function afterDialogClosed(dialogId) {
    delete app.ui.formBaselines[dialogId];
    if (dialogId === 'settingsDialog') { app.ui.settingsDirty = false; showSettingsPage('home', true); renderScreen(); }
    if (dialogId === 'dayReviewDialog') { app.ui.reviewFinancialDraft = null; app.ui.reviewPendingId = null; }
    if (dialogId === 'reviewFinancialDialog') app.ui.reviewFinancialDraft = null;
    if (dialogId === 'conflictDialog') { app.ui.pendingDraft = null; setAppointmentSaving(false); }
    if (dialogId === 'blockConflictDialog') { app.ui.pendingBlockConflict = null; setBlockSaving(false); }
    if (dialogId === 'duplicateClientDialog') { app.ui.pendingDuplicate = null; setAppointmentSaving(false); }
  }

  function closeDialogNow(dialogId, discard = false) {
    const dialog = $(`#${dialogId}`); if (!dialog?.open) return;
    if (discard) discardDraftForDialog(dialogId);
    dialog.close(); afterDialogClosed(dialogId);
  }

  function setUnsavedActionLabels(navigation = false) {
    $('#unsavedSave').textContent = navigation ? 'Enregistrer puis continuer' : 'Enregistrer et fermer';
    $('#unsavedDiscard').textContent = navigation ? 'Continuer sans enregistrer' : 'Quitter sans enregistrer';
    $('#unsavedContinue').textContent = navigation ? 'Rester ici' : 'Continuer la modification';
  }

  function requestDialogClose(dialogId) {
    const dialog = $(`#${dialogId}`); if (!dialog?.open) return;
    if (!formHasChanges(dialogId)) { closeDialogNow(dialogId); return; }
    saveDraftForDialog(dialogId);
    app.ui.pendingUnsavedClose = { dialogId };
    setUnsavedActionLabels(false);
    const labels = { appointmentDialog: 'ce rendez-vous', clientDialog: 'cette fiche cliente', blockDialog: 'cet événement personnel', expenseDialog: 'cette dépense', expenseCategoriesDialog: 'ces catégories', serviceDialog: 'cette prestation', supplementTypeDialog: 'ce supplément', badgeDialog: 'ce repère', settingsDialog: 'ces réglages', reviewFinancialDialog: 'cet ajustement de tarif' };
    $('#unsavedChangesText').textContent = `Enregistrer les modifications de ${labels[dialogId] || 'cette saisie'} avant de fermer ?`;
    if (!$('#unsavedChangesDialog').open) $('#unsavedChangesDialog').showModal();
  }

  function saveSettingsBeforeClose() {
    const buttonByPage = { agenda: '#saveWorkingHours', clients: '#saveClientSettings', data: '#saveReminderSettings' };
    const button = $(buttonByPage[app.ui.settingsPage]);
    if (!button) return false;
    button.click();
    return !app.ui.settingsDirty;
  }

  function requestSettingsPageChange(page) {
    app.ui.pendingUnsavedClose = { dialogId: 'settingsDialog', settingsTarget: page };
    setUnsavedActionLabels(true);
    $('#unsavedChangesText').textContent = 'Enregistrer les modifications de ces réglages avant de changer de rubrique ?';
    if (!$('#unsavedChangesDialog').open) $('#unsavedChangesDialog').showModal();
 }

  function requestExpenseCategoryChange(categoryId) {
    app.ui.pendingUnsavedClose = { dialogId: 'expenseCategoriesDialog', expenseCategoryTarget: categoryId };
    setUnsavedActionLabels(true);
    $('#unsavedChangesText').textContent = 'Enregistrer cette catégorie avant d’en modifier une autre ?';
    if (!$('#unsavedChangesDialog').open) $('#unsavedChangesDialog').showModal();
  }

 function resolveUnsavedClose(action) {
    const pending = app.ui.pendingUnsavedClose, prompt = $('#unsavedChangesDialog');
    if (prompt.open) prompt.close();
    if (!pending) return;
    if (action === 'continue') { app.ui.pendingUnsavedClose = null; return; }
    const { dialogId, settingsTarget, expenseCategoryTarget } = pending; app.ui.pendingUnsavedClose = null;
   if (action === 'discard') {
     if (settingsTarget) { app.ui.settingsDirty = false; showSettingsPage(settingsTarget, true); return; }
      if (expenseCategoryTarget) { clearFormDraft('expenseCategory'); resetExpenseCategoryForm(); editExpenseCategory(expenseCategoryTarget); return; }
     closeDialogNow(dialogId, true); return;
   }
    if (dialogId === 'settingsDialog') {
      if (!saveSettingsBeforeClose()) return;
      if (settingsTarget) showSettingsPage(settingsTarget, true); else closeDialogNow(dialogId);
     return;
   }
    if (expenseCategoryTarget) {
      const form = $('#expenseCategoryForm'); form?.requestSubmit();
      if (!formHasChanges('expenseCategoriesDialog')) editExpenseCategory(expenseCategoryTarget);
      return;
    }
   const form = $(`#${dialogId}`)?.querySelector('form');
    form?.requestSubmit();
    if ($(`#${dialogId}`)?.open && !formHasChanges(dialogId)) closeDialogNow(dialogId);
 }

  function hasOpenUnsavedChanges() {
    return ['appointmentDialog', 'clientDialog', 'blockDialog', 'expenseDialog', 'expenseCategoriesDialog', 'serviceDialog', 'supplementTypeDialog', 'badgeDialog', 'settingsDialog', 'reviewFinancialDialog']
      .some(dialogId => $(`#${dialogId}`)?.open && formHasChanges(dialogId));
  }

  const clientById = id => app.state.clients.find(client => client.id === id) || null;
  const clientFor = appointment => clientById(appointment.clientId) || { id: '', name: 'Cliente supprimée', phone: '', address: '', notes: '', badgeId: '', contactVia: '' };
  const serviceById = id => app.state.settings.services.find(service => service.id === id) || null;
  const serviceByName = name => app.state.settings.services.find(service => normaliseName(service.name) === normaliseName(name)) || null;
  const badgeById = id => app.state.settings.clientBadges.find(badge => badge.id === id) || null;
  const supplementTypeById = id => app.state.settings.supplementTypes.find(type => type.id === id) || null;
  const expenseCategoryById = id => app.state.settings.expenseCategories.find(category => category.id === id) || null;
  const appointmentAddress = appointment => boundedText(appointment?.address || clientFor(appointment).address, LIMITS.shortText);
  const appointmentsForDate = key => app.state.appointments.filter(appointment => appointment.date === key).sort((a, b) => a.time.localeCompare(b.time));
  const activeAppointmentsForDate = key => appointmentsForDate(key).filter(activeAppointment);
  const sortedAppointments = () => [...app.state.appointments].sort((a, b) => appointmentTimestamp(a) - appointmentTimestamp(b));
  const dayStartMs = date => dateTimeMs(dateKey(date), '00:00');
  const dayEndMs = date => dayStartMs(addDays(date, 1));

  function clientBadge(client) { return client?.badgeId ? badgeById(client.badgeId) : null; }

  function badgeHtml(client, className = '') {
    const badge = clientBadge(client); if (!badge) return '';
    return `<span class="client-badge ${className}" title="${escapeHtml(badge.name)}" aria-label="${escapeHtml(badge.name)}">${escapeHtml(badge.emoji || badge.symbol)}</span>`;
  }

  function expenseCategoryLabel(expense) {
    return expenseCategoryById(expense?.categoryId)?.name || boundedText(expense?.categoryLabel, 100) || 'Autre';
  }

  function eventBlocksAppointments(block) { return block?.blocksAppointments !== false; }

  function blockTitle(block) { return boundedText(block?.reason || block?.title || 'Événement personnel', LIMITS.shortText) || 'Événement personnel'; }

 function blockStatusMeta(block) {
   return eventBlocksAppointments(block)
     ? { icon: '🔒', label: 'Indisponible', className: 'blocking' }
      : { icon: 'ℹ️', label: 'Information', className: 'informational' };
  }

  function lateCancellationCount(clientId) {
    return app.state.appointments.filter(appointment => appointment.clientId === clientId && appointment.status === 'cancelled' && appointment.lateCancellation === true).length;
  }

  function appointmentHistoryEntry(type, label, details = '') {
    return { id: uuid(), type, at: new Date().toISOString(), label, details };
  }

  function appendAppointmentHistory(appointment, type, label, details = '') {
    appointment.history = normaliseHistory([...(appointment.history || []), appointmentHistoryEntry(type, label, details)], appointment.createdAt);
  }

  function addressWarning(address) {
    const value = boundedText(address, LIMITS.shortText);
    if (!value) return 'Adresse manquante : Waze ne pourra pas être ouvert pour ce rendez-vous.';
    if (value.length < 8 || !/\d/.test(value)) return 'Adresse peut-être incomplète : vérifie-la avant le déplacement.';
    return '';
  }

  function blockBounds(block) {
    const start = dateTimeMs(block.startDate, block.allDay ? '00:00' : block.startTime);
    const inclusiveEnd = parseDate(block.endDate) || parseDate(block.startDate);
    const end = block.allDay ? dateTimeMs(dateKey(addDays(inclusiveEnd, 1)), '00:00') : dateTimeMs(block.endDate, block.endTime);
    return { start, end };
  }

  function blocksOnDate(date) {
    const start = dayStartMs(date), end = dayEndMs(date);
    return app.state.blocks.filter(block => { const bounds = blockBounds(block); return intersects(bounds.start, bounds.end, start, end); });
  }

 function blockSegment(block, date) {
    const key = dateKey(date);
    if (key < block.startDate || key > block.endDate) return null;
    if (block.allDay) return { startMinutes: 0, endMinutes: 1440 };
    const startMinutes = key === block.startDate ? toMinutes(block.startTime) : 0;
    const endMinutes = key === block.endDate ? toMinutes(block.endTime) : 1440;
    return endMinutes > startMinutes ? { startMinutes, endMinutes } : null;
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

  function scheduleWarnings(draft) {
    const warnings = [], date = parseDate(draft?.date);
    const workWarning = outsideWorkHours(draft); if (workWarning) warnings.push(workWarning);
    if (date) {
      const meta = dateMeta(date);
      if (meta.holiday) warnings.push(`Jour férié : ${meta.holiday.label}.`);
      else if (meta.weekend) warnings.push('Ce créneau est prévu pendant le week-end.');
    }
    return warnings;
  }

  function findConflicts(draft) {
    if (!draft || !activeAppointment(draft)) return [];
    const start = appointmentStart(draft), end = appointmentEnd(draft);
    if (!Number.isFinite(start) || end <= start) return [];
    const conflicts = [];
    app.state.appointments.filter(appointment => activeAppointment(appointment) && appointment.id !== draft.id).forEach(appointment => {
      if (intersects(start, end, appointmentStart(appointment), appointmentEnd(appointment))) conflicts.push({ type: 'appointment', appointment });
    });
    app.state.blocks.filter(eventBlocksAppointments).forEach(block => { const bounds = blockBounds(block); if (intersects(start, end, bounds.start, bounds.end)) conflicts.push({ type: 'block', block }); });
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
  function openWaze(address) {
    if (!address) return;
    const opened = window.open(wazeUrl(address), '_blank', 'noopener,noreferrer');
    if (opened) opened.opener = null;
  }

 function routeEntriesForDate(date) {
   const key = dateKey(date);
   return [
     ...activeAppointmentsForDate(key).filter(appointment => appointmentAddress(appointment)).map(appointment => ({ sortTime: appointment.time, time: appointment.time, title: clientFor(appointment).name, address: appointmentAddress(appointment) })),
      ...blocksOnDate(date).filter(block => block.address).map(block => {
        const startsToday = block.startDate === key, endsToday = block.endDate === key;
        const time = block.allDay ? 'Journée' : startsToday ? block.startTime : endsToday ? `Jusqu’à ${block.endTime}` : 'Journée';
        return { sortTime: startsToday && !block.allDay ? block.startTime : '00:00', time, title: `Événement personnel · ${blockTitle(block)}`, address: block.address };
      })
   ].sort((one, two) => one.sortTime.localeCompare(two.sortTime));
 }

  function unreviewedForDate(key) {
    return activeAppointmentsForDate(key).filter(appointment => appointment.paymentStatus === 'unreviewed');
  }

  function dayCanBeClosed(date) {
    const key = dateKey(date), unreviewed = unreviewedForDate(key), active = activeAppointmentsForDate(key);
    if (!unreviewed.length || !active.length || key > todayKey()) return false;
    if (key < todayKey()) return true;
    return Date.now() >= Math.max(...active.map(appointmentEnd));
  }

  function unclosedDays() {
    const today = todayKey(), keys = new Set();
    app.state.appointments.forEach(appointment => {
      if (activeAppointment(appointment) && appointment.paymentStatus === 'unreviewed' && appointment.date < today) keys.add(appointment.date);
    });
    return [...keys].sort().map(parseDate).filter(Boolean);
  }

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
      const client = clientFor(next), address = appointmentAddress(next);
      $('#nextAppointment').className = 'next-card';
      $('#nextAppointment').innerHTML = `<button class="next-main" data-edit="${escapeHtml(next.id)}"><span class="next-title">Prochain rendez-vous</span><span class="next-time">${format(parseDate(next.date), { weekday: 'long', day: 'numeric', month: 'long' })} · ${next.time}</span><strong>${badgeHtml(client, 'small')}${escapeHtml(client.name)}</strong><span>${escapeHtml(next.service)} · ${Number(next.duration)} min${appointmentTotal(next) ? ` · ${money(appointmentTotal(next))}` : ''}</span>${address ? `<small>${escapeHtml(address)}</small>` : ''}</button>${address ? `<button class="route-icon" data-waze="${encodeURIComponent(address)}" aria-label="Itinéraire Waze">⌖</button>` : ''}`;
    }
    renderPaymentReminders(); renderTodos(); renderDraftNotice(); renderUnclosedDayNotice();
    const last = app.state.settings.lastBackupAt ? new Date(app.state.settings.lastBackupAt) : null, lastTime = last?.getTime();
    const reminderDays = Number(app.state.settings.backupReminderDays) || 7;
    const late = !Number.isFinite(lastTime) || Date.now() - lastTime > reminderDays * 24 * 60 * 60 * 1000;
    $('#backupNotice').hidden = !late;
    $('#backupNotice').textContent = last ? '⇩ Pense à sauvegarder tes données' : '⇩ Fais une première sauvegarde de tes données';
  }

  function renderUnclosedDayNotice() {
    const days = unclosedDays(), target = $('#unclosedDayNotice');
    target.hidden = !days.length;
    if (!days.length) { target.innerHTML = ''; delete target.dataset.reviewDate; return; }
    const first = days[0], count = unreviewedForDate(dateKey(first)).length, remaining = days.length - 1;
    target.dataset.reviewDate = dateKey(first);
    target.innerHTML = `<span><strong>Journée du ${format(first, { day: 'numeric', month: 'long' })} non clôturée</strong><small>${count} paiement${count > 1 ? 's' : ''} à vérifier${remaining ? ` · ${remaining} autre${remaining > 1 ? 's' : ''} journée${remaining > 1 ? 's' : ''}` : ''}</small></span><b>Faire le point ›</b>`;
  }

  function pendingConfirmations() {
    const today = todayKey();
    return sortedAppointments().filter(appointment => appointment.status === 'to_confirm' && appointment.date >= today);
  }

  function pendingPayments() {
    const today = todayKey();
    return sortedAppointments()
      .filter(appointment => activeAppointment(appointment) && appointment.paymentStatus === 'pending' && validDate(appointment.paymentReminderDate) && appointment.paymentReminderDate <= today)
      .sort((one, two) => one.paymentReminderDate.localeCompare(two.paymentReminderDate) || appointmentTimestamp(one) - appointmentTimestamp(two));
  }

  function renderPaymentReminders() {
    const reminders = pendingPayments(), target = $('#paymentReminderCard');
    target.hidden = !reminders.length;
    if (!reminders.length) { target.innerHTML = ''; return; }
    const first = reminders[0], client = clientFor(first), remaining = reminders.length - 1;
    target.innerHTML = `<button data-todo="payments"><span class="reminder-icon">!</span><span><small>Relance paiement</small><strong>Relancer « ${escapeHtml(client.name)} » pour le paiement</strong><em>${first.paymentReminderDate < todayKey() ? 'Relance en retard' : 'À relancer aujourd’hui'}${appointmentTotal(first) ? ` · ${money(appointmentTotal(first))}` : ''}${remaining ? ` · +${remaining} autre${remaining > 1 ? 's' : ''}` : ''}</em></span><b>Voir ›</b></button>`;
  }

  function renderTodos() {
    const confirmations = pendingConfirmations(), target = $('#todoCard');
    target.hidden = !confirmations.length;
    if (target.hidden) { target.innerHTML = ''; return; }
    target.innerHTML = `<div><p class="next-title">À faire</p><strong>${confirmations.length} rendez-vous à confirmer</strong></div><div class="todo-actions"><button data-todo="confirm"><b>${confirmations.length}</b> ouvrir</button></div>`;
  }

  function renderAgenda() {
    const isDay = app.ui.mode === 'day', isWeek = app.ui.mode === 'week';
    $('#dayView').hidden = !isDay; $('#fullWeekView').hidden = !isWeek; $('#monthView').hidden = app.ui.mode !== 'month';
    $$('.mode-button').forEach(button => { const active = button.dataset.mode === app.ui.mode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    if (isDay) renderDayView(); else if (isWeek) renderFullWeekView(); else renderMonthView();
  }

  function weekLabel(start) {
    return `${format(start, { day: 'numeric', month: 'short' })} – ${format(addDays(start, 6), { day: 'numeric', month: 'short' })}`;
  }

  function dayStripHtml(attribute) {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(app.ui.weekStart, index), meta = dateMeta(date), count = activeAppointmentsForDate(dateKey(date)).length, blockCount = blocksOnDate(date).length;
      const flags = `${meta.holiday ? '<span class="holiday-badge">Férié</span>' : ''}${meta.weekend ? '<span class="weekend-label">WE</span>' : ''}${blockCount ? '<span class="block-dot">◇</span>' : ''}`;
      const selected = sameDay(date, app.ui.selectedDate), label = `${format(date, { weekday: 'long', day: 'numeric', month: 'long' })}${meta.holiday ? `, jour férié ${meta.holiday.label}` : ''}, ${count} rendez-vous${blockCount ? `, ${blockCount} événement${blockCount > 1 ? 's' : ''} personnel${blockCount > 1 ? 's' : ''}` : ''}`;
      return `<button class="day-button ${selected ? 'selected' : ''} ${sameDay(date, new Date()) ? 'today' : ''} ${meta.weekend ? 'weekend' : ''} ${meta.holiday ? 'holiday' : ''} ${count ? 'has-event' : ''}" ${attribute}="${dateKey(date)}" aria-pressed="${selected}" aria-label="${escapeHtml(label)}"><span class="day-name">${format(date, { weekday: 'short' }).slice(0, 3)}</span><span class="day-number">${date.getDate()}</span>${flags}</button>`;
    }).join('');
  }

  function renderDayView() {
    $('#periodLabel').textContent = weekLabel(app.ui.weekStart);
    $('#dayStrip').innerHTML = dayStripHtml('data-select-date');
    $('#selectedDayTitle').textContent = format(app.ui.selectedDate, { weekday: 'long', day: 'numeric', month: 'long' });
    $('#routeDay').hidden = !routeEntriesForDate(app.ui.selectedDate).length;
    renderHolidayBanner(); renderDaySummary(); renderDayClosure(); renderDayTimeline();
  }

  function renderDayClosure() {
    const unreviewed = unreviewedForDate(dateKey(app.ui.selectedDate)), target = $('#dayClosureCard');
    target.hidden = !dayCanBeClosed(app.ui.selectedDate);
    if (target.hidden) return;
    $('#dayClosureText').textContent = `${unreviewed.length} paiement${unreviewed.length > 1 ? 's' : ''} à vérifier`;
  }

  function renderFullWeekView() {
    const dates = Array.from({ length: 7 }, (_, index) => addDays(app.ui.weekStart, index));
    const weekDays = dates.map(date => {
      const key = dateKey(date);
      return { date, key, meta: dateMeta(date), hours: workHoursFor(date), appointments: appointmentsForDate(key), blocks: blocksOnDate(date) };
    });
    const appointments = weekDays.flatMap(day => day.appointments.filter(activeAppointment));
    const blocks = [...new Map(weekDays.flatMap(day => day.blocks).map(block => [block.id, block])).values()];
    const minutes = appointments.reduce((sum, appointment) => sum + Number(appointment.duration || 0), 0), planned = appointments.reduce((sum, appointment) => sum + appointmentTotal(appointment), 0);
    $('#weekPeriodLabel').textContent = weekLabel(app.ui.weekStart);
    $('#weekSummary').innerHTML = `<span><strong>${appointments.length}</strong> RDV</span><span><strong>${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60}` : ''}</strong> de prestation</span>${planned ? `<span><strong>${money(planned)}</strong> prévu</span>` : ''}${blocks.length ? `<span class="block-summary">◇ ${blocks.length} événement${blocks.length > 1 ? 's' : ''}</span>` : ''}`;
    $('#weekSchedule').innerHTML = buildWeekTimeline(dates, weekDays);
  }

  function weekHorizontalStyle(layout = { column: 0, columns: 1 }) {
    if (layout.columns <= 1) return 'left:2px;right:2px';
    const width = 100 / layout.columns, rightColumns = layout.columns - layout.column - 1;
    return `left:calc(${layout.column * width}% + 1px);right:calc(${rightColumns * width}% + 1px)`;
  }

  function weekWorkShading(hours, firstHour, lastHour) {
    const rangeStart = firstHour * 60, rangeEnd = lastHour * 60;
    const shade = (start, end, label) => {
      const visibleStart = Math.max(start, rangeStart), visibleEnd = Math.min(end, rangeEnd);
      if (visibleEnd <= visibleStart) return '';
      const top = ((visibleStart - rangeStart) / 60) * WEEK_HOUR_HEIGHT, height = ((visibleEnd - visibleStart) / 60) * WEEK_HOUR_HEIGHT;
      return `<span class="week-work-shade" style="top:${top}px;height:${height}px" title="${label}"></span>`;
    };
    if (!hours.enabled) return shade(rangeStart, rangeEnd, 'Jour non travaillé');
    const pieces = [shade(rangeStart, toMinutes(hours.start), 'Hors horaires'), shade(toMinutes(hours.end), rangeEnd, 'Hors horaires')];
    if (hours.breakStart && hours.breakEnd) pieces.push(shade(toMinutes(hours.breakStart), toMinutes(hours.breakEnd), 'Coupure'));
    return pieces.join('');
  }

  function buildWeekTimeline(dates, suppliedDays = null) {
    const days = suppliedDays || dates.map(date => {
      const key = dateKey(date);
      return { date, key, meta: dateMeta(date), hours: workHoursFor(date), appointments: appointmentsForDate(key), blocks: blocksOnDate(date) };
    });
    const timedSegments = days.flatMap(day => day.blocks.filter(block => !block.allDay).map(block => ({ ...day, block, segment: blockSegment(block, day.date) })).filter(item => item.segment));
    const allAppointments = days.flatMap(day => day.appointments);
    const starts = allAppointments.map(appointment => toMinutes(appointment.time)).concat(timedSegments.map(item => item.segment.startMinutes));
    const ends = allAppointments.map(appointment => toMinutes(appointment.time) + Number(appointment.duration || 0)).concat(timedSegments.map(item => item.segment.endMinutes));
    days.forEach(day => {
      if (!day.hours.enabled || !validTime(day.hours.start) || !validTime(day.hours.end)) return;
      starts.push(toMinutes(day.hours.start)); ends.push(toMinutes(day.hours.end));
    });
    const earliest = starts.length ? starts.reduce((minimum, value) => Math.min(minimum, value), starts[0]) : 9 * 60;
    const latest = ends.length ? ends.reduce((maximum, value) => Math.max(maximum, value), ends[0]) : 19 * 60;
    const firstHour = Math.max(0, Math.floor(earliest / 60));
    const lastHour = Math.min(24, Math.ceil(latest / 60));
    const totalHours = Math.max(1, lastHour - firstHour), height = totalHours * WEEK_HOUR_HEIGHT;
    const header = days.map(day => {
      const { date, key, meta } = day, flag = meta.holiday ? 'Férié' : meta.weekend ? 'WE' : '';
      const label = `Ouvrir ${format(date, { weekday: 'long', day: 'numeric', month: 'long' })}${meta.holiday ? `, jour férié ${meta.holiday.label}` : meta.weekend ? ', week-end' : ''}`;
      return `<button class="week-day-header ${meta.weekend ? 'weekend' : ''} ${meta.holiday ? 'holiday' : ''} ${sameDay(date, new Date()) ? 'today' : ''}" data-open-day="${key}" aria-label="${escapeHtml(label)}"><span>${format(date, { weekday: 'short' }).slice(0, 3)}</span><strong>${date.getDate()}</strong>${flag ? `<small class="week-day-flag">${flag}</small>` : ''}</button>`;
    }).join('');
    const allDay = days.map(day => {
      const { meta } = day, blocks = day.blocks.filter(block => block.allDay);
      const content = `${meta.holiday ? `<span class="week-holiday-chip" title="${escapeHtml(meta.holiday.label)}">${escapeHtml(meta.holiday.label)}</span>` : ''}${blocks.map(block => { const status = blockStatusMeta(block); return `<button class="week-all-day-block personal-event ${status.className}" data-edit-block="${escapeHtml(block.id)}" title="${escapeHtml(`${blockTitle(block)} · ${blockDisplayLabel(block)}`)}" aria-label="${status.label} : ${escapeHtml(blockTitle(block))}, ${escapeHtml(blockDisplayLabel(block))}">${status.icon} ${escapeHtml(blockTitle(block))}</button>`; }).join('')}`;
      return `<div class="week-all-day-cell ${meta.weekend ? 'weekend' : ''} ${meta.holiday ? 'holiday' : ''}">${content}</div>`;
    }).join('');
    const hourLabels = Array.from({ length: totalHours + 1 }, (_, index) => `<span style="top:${index * WEEK_HOUR_HEIGHT}px">${pad(firstHour + index)}h</span>`).join('');
    const lanes = days.map(day => {
      const { date, key, meta } = day, dayAppointments = day.appointments;
      const timedEvents = day.blocks.filter(block => !block.allDay).map(block => ({ block, segment: blockSegment(block, date) })).filter(item => item.segment);
      const layouts = timelineLayouts([
        ...dayAppointments.map(appointment => ({ key: `a:${appointment.id}`, start: toMinutes(appointment.time), end: toMinutes(appointment.time) + Number(appointment.duration || 0) })),
        ...timedEvents.map(item => ({ key: `b:${item.block.id}`, start: item.segment.startMinutes, end: item.segment.endMinutes }))
      ]);
      const slots = Array.from({ length: totalHours * 2 }, (_, index) => {
        const minutes = firstHour * 60 + index * 30, time = timeText(minutes);
        return `<button class="week-empty-slot" data-create-date="${key}" data-create-time="${time}" style="top:${index * WEEK_HOUR_HEIGHT / 2}px;height:${WEEK_HOUR_HEIGHT / 2}px" aria-label="Ajouter un élément ${format(date, { weekday: 'long', day: 'numeric' })} à ${time}"></button>`;
      }).join('');
      const blockHtml = timedEvents.map(({ block, segment }) => {
        const start = Math.max(firstHour * 60, segment.startMinutes), end = Math.min(lastHour * 60, segment.endMinutes);
        if (end <= start) return '';
        const top = ((start - firstHour * 60) / 60) * WEEK_HOUR_HEIGHT, blockHeight = Math.max(22, ((end - start) / 60) * WEEK_HOUR_HEIGHT - 2), layout = layouts.get(`b:${block.id}`), status = blockStatusMeta(block);
        return `<button class="week-blocked-block personal-event ${status.className} ${layout?.columns > 1 ? 'overlapped' : ''}" data-edit-block="${escapeHtml(block.id)}" style="top:${top}px;height:${blockHeight}px;${weekHorizontalStyle(layout)}" title="${escapeHtml(blockTitle(block))}" aria-label="${status.label} : ${escapeHtml(blockTitle(block))}"><span>${status.icon}</span><small>${escapeHtml(blockTitle(block))}</small></button>`;
      }).join('');
      const appointmentHtml = dayAppointments.map(appointment => {
        const client = clientFor(appointment), firstName = client.name.trim().split(/\s+/)[0] || client.name;
        const top = ((toMinutes(appointment.time) - firstHour * 60) / 60) * WEEK_HOUR_HEIGHT;
        const appointmentHeight = Math.max(22, (Number(appointment.duration || 0) / 60) * WEEK_HOUR_HEIGHT - 2), layout = layouts.get(`a:${appointment.id}`);
        const conflicted = hasAppointmentConflict(appointment), compactTime = appointment.time;
        return `<button class="week-appointment ${serviceTheme(appointment)} ${Number(appointment.duration || 0) <= 30 ? 'micro' : ''} ${layout?.columns > 1 ? 'overlapped' : ''} ${!activeAppointment(appointment) ? 'inactive' : ''} ${conflicted ? 'conflicted' : ''}" data-edit="${escapeHtml(appointment.id)}" style="top:${top}px;height:${appointmentHeight}px;${weekHorizontalStyle(layout)}" aria-label="${appointment.time}, ${escapeHtml(client.name)}, ${escapeHtml(appointment.service)}"><span class="week-appointment-time">${compactTime}</span><strong class="week-appointment-name">${escapeHtml(firstName)}</strong>${badgeHtml(client, 'week')}${conflicted ? '<span class="week-conflict-marker" aria-hidden="true">!</span>' : ''}</button>`;
      }).join('');
      const now = sameDay(date, new Date()) ? toMinutes(`${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`) : -1;
      const nowLine = now >= firstHour * 60 && now <= lastHour * 60 ? `<span id="weekCurrentTimeLine" class="week-current-time" style="top:${((now - firstHour * 60) / 60) * WEEK_HOUR_HEIGHT}px" aria-label="Heure actuelle"></span>` : '';
      return `<div class="week-day-lane ${meta.weekend ? 'weekend' : ''} ${meta.holiday ? 'holiday' : ''}" style="height:${height}px">${weekWorkShading(day.hours, firstHour, lastHour)}${slots}${blockHtml}${appointmentHtml}${nowLine}</div>`;
    }).join('');
    return `<div class="week-grid" data-first-hour="${firstHour}" data-last-hour="${lastHour}"><div class="week-sticky-head"><div class="week-grid-header"><span class="week-corner"></span>${header}</div><div class="week-all-day-row"><span class="week-all-day-label">Jour<br>entier</span><div class="week-all-day-cells">${allDay}</div></div></div><div class="week-time-row"><div class="week-hour-labels" style="height:${height}px">${hourLabels}</div><div class="week-day-lanes" style="height:${height}px">${lanes}</div></div></div>`;
  }

  function updateWeekCurrentTimeLine() {
    const grid = $('#weekSchedule .week-grid'); if (!grid) return;
    const now = new Date(), index = Array.from({ length: 7 }, (_, dayIndex) => dateKey(addDays(app.ui.weekStart, dayIndex))).indexOf(dateKey(now));
    const firstHour = Number(grid.dataset.firstHour), lastHour = Number(grid.dataset.lastHour), minutes = now.getHours() * 60 + now.getMinutes();
    let line = $('#weekCurrentTimeLine');
    if (index < 0 || !Number.isFinite(firstHour) || !Number.isFinite(lastHour) || minutes < firstHour * 60 || minutes > lastHour * 60) { line?.remove(); return; }
    const lane = $$('#weekSchedule .week-day-lane')[index]; if (!lane) return;
    if (!line) { line = document.createElement('span'); line.id = 'weekCurrentTimeLine'; line.className = 'week-current-time'; line.setAttribute('aria-label', 'Heure actuelle'); lane.append(line); }
    else if (line.parentElement !== lane) lane.append(line);
    line.style.top = `${((minutes - firstHour * 60) / 60) * WEEK_HOUR_HEIGHT}px`;
  }

  function blockDisplayLabel(block) {
    if (block.allDay) {
      if (!block.endDate || block.endDate === block.startDate) return 'Toute la journée';
      const start = parseDate(block.startDate), end = parseDate(block.endDate);
      return `Du ${format(start, { day: 'numeric', month: 'short' })} au ${format(end, { day: 'numeric', month: 'short' })} · journées entières`;
    }
    if (block.startDate === block.endDate) return `${block.startTime} – ${block.endTime}`;
    return `${format(parseDate(block.startDate), { day: 'numeric', month: 'short' })} ${block.startTime} → ${format(parseDate(block.endDate), { day: 'numeric', month: 'short' })} ${block.endTime}`;
  }

  function blockDetailsLabel(block) {
    return `${blockDisplayLabel(block)}${block.address ? ` · ${block.address}` : ''}`;
  }

  function renderHolidayBanner() {
    const meta = dateMeta(app.ui.selectedDate), blocks = blocksOnDate(app.ui.selectedDate), parts = [];
    if (meta.holiday) parts.push(`<strong>☀ Jour férié</strong> · ${escapeHtml(meta.holiday.label)}`);
    if (meta.weekend) parts.push('<strong>◒ Week-end</strong>');
    if (blocks.length) parts.push(`<strong>◇ ${blocks.length} événement${blocks.length > 1 ? 's' : ''} personnel${blocks.length > 1 ? 's' : ''}</strong> · ${escapeHtml(blockTitle(blocks[0]))}`);
    $('#holidayBanner').hidden = !parts.length;
    $('#holidayBanner').innerHTML = parts.length ? `<div class="calendar-banner ${blocks.some(eventBlocksAppointments) ? 'blocked' : ''}">${parts.join(' &nbsp; · &nbsp; ')}</div>` : '';
    const allDay = blocks.filter(block => block.allDay), target = $('#dayAllDayBlocks');
    target.hidden = !allDay.length;
    target.innerHTML = allDay.map(block => { const status = blockStatusMeta(block); return `<button class="personal-event ${status.className}" data-edit-block="${escapeHtml(block.id)}"><span>${escapeHtml(blockDisplayLabel(block))} · ${status.label}</span><strong>${status.icon} ${escapeHtml(blockTitle(block))}</strong>${block.address ? `<small>${escapeHtml(block.address)}</small>` : ''}</button>`; }).join('');
  }

  function renderDaySummary() {
    const appointments = activeAppointmentsForDate(dateKey(app.ui.selectedDate)), blocks = blocksOnDate(app.ui.selectedDate), hours = workHoursFor(app.ui.selectedDate);
    const minutes = appointments.reduce((sum, appointment) => sum + Number(appointment.duration || 0), 0);
    const planned = appointments.reduce((sum, appointment) => sum + appointmentTotal(appointment), 0);
    const paid = appointments.filter(appointment => appointment.paymentStatus === 'paid').reduce((sum, appointment) => sum + appointmentTotal(appointment), 0);
    const first = appointments[0], last = [...appointments].sort((one, two) => appointmentEnd(two) - appointmentEnd(one))[0];
    const clientSpan = first && last ? `<span class="client-hours-summary"><strong>${first.time}</strong> début clientes</span><span class="client-hours-summary"><strong>${endTime(last)}</strong> fin clientes</span>` : '';
    $('#daySummary').innerHTML = `${clientSpan}<span><strong>${appointments.length}</strong> RDV</span><span><strong>${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60}` : ''}</strong> de prestation</span>${planned ? `<span><strong>${money(planned)}</strong> prévu</span>` : ''}${paid ? `<span><strong>${money(paid)}</strong> encaissé</span>` : ''}${blocks.length ? `<span class="block-summary">◇ ${blocks.length} événement${blocks.length > 1 ? 's' : ''}</span>` : ''}<span class="hours-summary">◷ ${workHoursLabel(hours)}</span>`;
  }

  function timelineLayouts(items) {
    const layouts = new Map(), ordered = [...items].filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start).sort((one, two) => one.start - two.start || one.end - two.end || String(one.key).localeCompare(String(two.key)));
    let group = [], groupEnd = -Infinity;
    const placeGroup = items => {
      const columnEnds = [], placed = [];
      items.forEach(item => {
        const { start, end } = item;
        let column = columnEnds.findIndex(value => value <= start);
        if (column === -1) column = columnEnds.length;
        columnEnds[column] = end; placed.push({ item, column });
      });
      placed.forEach(placedItem => layouts.set(placedItem.item.key, { column: placedItem.column, columns: columnEnds.length }));
    };
    ordered.forEach(item => {
      const { start, end } = item;
      if (group.length && start >= groupEnd) { placeGroup(group); group = []; groupEnd = -Infinity; }
      group.push(item); groupEnd = Math.max(groupEnd, end);
    });
    if (group.length) placeGroup(group);
    return layouts;
  }

  function appointmentHorizontalStyle(layout = { column: 0, columns: 1 }) {
    if (layout.columns <= 1) return 'left:6px;right:7px';
    const percentage = 100 / layout.columns, last = layout.column === layout.columns - 1;
    const left = layout.column ? `calc(${layout.column * percentage}% + 2px)` : '6px';
    const rightColumns = layout.columns - layout.column - 1;
    const right = last ? '7px' : `calc(${rightColumns * percentage}% + 2px)`;
    return `left:${left};right:${right}`;
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
    const timedBlocks = blocks.map(block => ({ block, segment: blockSegment(block, date) })).filter(item => item.segment && !item.block.allDay);
    const itemStarts = appointments.map(appointment => toMinutes(appointment.time)).concat(timedBlocks.map(item => item.segment.startMinutes));
    const itemEnds = appointments.map(appointment => toMinutes(appointment.time) + Number(appointment.duration || 0)).concat(timedBlocks.map(item => item.segment.endMinutes));
    if (sameDay(date, new Date())) {
      const now = new Date().getHours() * 60 + new Date().getMinutes(); itemStarts.push(now); itemEnds.push(now);
    }
    const firstHour = Math.floor(Math.min(8 * 60, ...itemStarts) / 60), lastHour = Math.ceil(Math.max(20 * 60, ...itemEnds) / 60), totalHours = Math.max(1, lastHour - firstHour);
    const lines = Array.from({ length: totalHours + 1 }, (_, index) => `<span class="timeline-hour" style="top:${index * HOUR_HEIGHT}px">${pad(firstHour + index)}:00</span><i class="timeline-line" style="top:${index * HOUR_HEIGHT}px"></i>`).join('');
    const empty = Array.from({ length: totalHours }, (_, index) => `<button class="timeline-empty" data-create-time="${pad(firstHour + index)}:00" style="top:${index * HOUR_HEIGHT}px;height:${HOUR_HEIGHT}px" aria-label="Ajouter un rendez-vous à ${pad(firstHour + index)} h"></button>`).join('');
    const layouts = timelineLayouts([
      ...appointments.map(appointment => ({ key: `a:${appointment.id}`, start: toMinutes(appointment.time), end: toMinutes(appointment.time) + Number(appointment.duration || 0) })),
      ...timedBlocks.map(item => ({ key: `b:${item.block.id}`, start: item.segment.startMinutes, end: item.segment.endMinutes }))
    ]);
    const blockHtml = timedBlocks.map(({ block, segment }) => {
      const start = Math.max(firstHour * 60, segment.startMinutes), end = Math.min(lastHour * 60, segment.endMinutes), top = ((start - firstHour * 60) / 60) * HOUR_HEIGHT, height = Math.max(28, ((end - start) / 60) * HOUR_HEIGHT - 2);
      const layout = layouts.get(`b:${block.id}`), status = blockStatusMeta(block);
      return `<button class="blocked-block personal-event ${status.className} ${layout?.columns > 1 ? 'overlapped' : ''}" data-edit-block="${escapeHtml(block.id)}" style="top:${top}px;height:${height}px;${appointmentHorizontalStyle(layout)}"><span>${status.icon} ${escapeHtml(blockTitle(block))}</span><small>${status.label} · ${escapeHtml(blockDetailsLabel(block))}</small></button>`;
    }).join('');
    const appointmentHtml = appointments.map(appointment => {
      const client = clientFor(appointment), top = ((toMinutes(appointment.time) - firstHour * 60) / 60) * HOUR_HEIGHT;
      const height = Math.max(30, (Number(appointment.duration || 0) / 60) * HOUR_HEIGHT - 4), compact = Number(appointment.duration || 0) <= 60;
      const inactive = !activeAppointment(appointment), conflicted = hasAppointmentConflict(appointment), layout = layouts.get(`a:${appointment.id}`);
      const reason = appointment.cancellationReason ? ` · ${escapeHtml(appointment.cancellationReason)}` : '';
      return `<article class="appointment-block ${serviceTheme(appointment)} status-${appointment.status} ${compact ? 'compact' : ''} ${layout?.columns > 1 ? 'overlapped' : ''} ${inactive ? 'inactive' : ''} ${conflicted ? 'conflicted' : ''}" style="top:${top}px;height:${height}px;${appointmentHorizontalStyle(layout)}"><button class="appointment-edit" data-edit="${escapeHtml(appointment.id)}"><span class="appointment-time">${appointment.time} – ${endTime(appointment)}</span><strong class="appointment-name">${badgeHtml(client, 'planning')}${escapeHtml(client.name)}</strong><span class="appointment-meta">${escapeHtml(appointment.service)} · ${Number(appointment.duration)} min${appointmentTotal(appointment) ? ` · ${money(appointmentTotal(appointment))}` : ''}${reason}</span></button><div class="appointment-footer"><span class="status-badge">${STATUS[appointment.status]}</span>${appointment.paymentStatus === 'paid' && activeAppointment(appointment) ? '<span class="paid-badge">Payé</span>' : ''}</div></article>`;
    }).join('');
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    const currentLine = sameDay(date, new Date()) && now >= firstHour * 60 && now <= lastHour * 60 ? `<span id="currentTimeLine" class="current-time-line" style="top:${((now - firstHour * 60) / 60) * HOUR_HEIGHT}px"><b>${pad(new Date().getHours())}:${pad(new Date().getMinutes())}</b></span>` : '';
    $('#dayTimeline').innerHTML = `<div class="timeline-inner" style="height:${totalHours * HOUR_HEIGHT}px">${renderWorkShading(workHoursFor(date), firstHour, lastHour)}${lines}${empty}${blockHtml}${appointmentHtml}${currentLine}</div>`;
  }

  function dayOrdinal(value) {
    const date = value instanceof Date ? value : parseDate(value);
    return date ? Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000) : NaN;
  }

  function blockCalendarEndDate(block) {
    if (block.allDay || block.endTime !== '00:00' || block.endDate === block.startDate) return block.endDate;
    return dateKey(addDays(parseDate(block.endDate), -1));
  }

  function buildMonthEventSegments(calendarStart, weekCount, blocks = app.state.blocks, maxLanes = 3) {
    const startOrdinal = dayOrdinal(calendarStart), totalDays = Math.max(1, Number(weekCount) || 1) * 7, finalOrdinal = startOrdinal + totalDays - 1;
    const candidates = blocks.map(block => {
      const start = dayOrdinal(block.startDate), end = dayOrdinal(blockCalendarEndDate(block));
      return { block, start, end, visibleStart: Math.max(startOrdinal, start), visibleEnd: Math.min(finalOrdinal, end) };
    }).filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.visibleEnd >= item.visibleStart)
      .sort((one, two) => one.visibleStart - two.visibleStart || (two.visibleEnd - two.visibleStart) - (one.visibleEnd - one.visibleStart) || String(one.block.id).localeCompare(String(two.block.id)));
    const perRow = Array.from({ length: Math.max(1, Number(weekCount) || 1) }, () => []);
    candidates.forEach(item => {
      const firstRow = Math.floor((item.visibleStart - startOrdinal) / 7), lastRow = Math.floor((item.visibleEnd - startOrdinal) / 7);
      for (let row = firstRow; row <= lastRow; row += 1) {
        const rowStart = startOrdinal + row * 7, segmentStart = Math.max(item.visibleStart, rowStart), segmentEnd = Math.min(item.visibleEnd, rowStart + 6);
        perRow[row].push({ block: item.block, blockId: item.block.id, row, startColumn: segmentStart - rowStart + 1, span: segmentEnd - segmentStart + 1, startOrdinal: segmentStart, endOrdinal: segmentEnd, continuesBefore: item.start < segmentStart, continuesAfter: item.end > segmentEnd });
      }
    });
    const segments = [], overflowByDate = {};
    perRow.forEach(rowItems => {
      const laneEnds = [];
      rowItems.forEach(segment => {
        let lane = laneEnds.findIndex(end => end < segment.startColumn);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = segment.startColumn + segment.span - 1;
        if (lane < maxLanes) segments.push({ ...segment, lane });
        else {
          for (let offset = 0; offset < segment.span; offset += 1) {
            const key = dateKey(addDays(calendarStart, segment.row * 7 + segment.startColumn - 1 + offset));
            overflowByDate[key] = (overflowByDate[key] || 0) + 1;
          }
        }
      });
    });
    return { segments, overflowByDate };
  }

  function renderMonthView() {
    const month = app.ui.monthDate;
    $('#monthLabel').textContent = format(month, { month: 'long', year: 'numeric' });
    const first = localDate(month.getFullYear(), month.getMonth(), 1), last = localDate(month.getFullYear(), month.getMonth() + 1, 0), start = mondayOf(first), end = addDays(mondayOf(last), 6), dates = [];
    for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
    const headings = DAYS.map(day => `<div class="month-weekday">${day.short}</div>`).join('');
    const weekCount = dates.length / 7, monthEvents = buildMonthEventSegments(start, weekCount, app.state.blocks, 3);
    const rows = Array.from({ length: weekCount }, (_, row) => {
      const rowDates = dates.slice(row * 7, row * 7 + 7);
      const days = rowDates.map(date => {
        const meta = dateMeta(date), eventCount = blocksOnDate(date).length, count = activeAppointmentsForDate(dateKey(date)).length, selectedWeek = app.ui.overviewWeekStart && sameDay(mondayOf(date), app.ui.overviewWeekStart);
        const label = `${format(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${meta.holiday ? `, jour férié ${meta.holiday.label}` : ''}${count ? `, ${count} rendez-vous` : ', aucun rendez-vous'}${eventCount ? `, ${eventCount} événement${eventCount > 1 ? 's' : ''} personnel${eventCount > 1 ? 's' : ''}` : ''}`;
        return `<button class="month-day ${date.getMonth() !== month.getMonth() ? 'muted' : ''} ${meta.weekend ? 'weekend' : ''} ${meta.holiday ? 'holiday' : ''} ${eventCount ? 'has-event' : ''} ${sameDay(date, new Date()) ? 'today' : ''} ${selectedWeek ? 'selected-week' : ''}" data-select-week="${dateKey(date)}" aria-label="${escapeHtml(label)}"><span class="month-number">${date.getDate()}</span>${meta.holiday ? '<span class="month-holiday">F</span>' : ''}${count ? `<span class="month-event-count">${count}</span>` : ''}</button>`;
      }).join('');
      const bands = monthEvents.segments.filter(segment => segment.row === row).map(segment => {
        const status = blockStatusMeta(segment.block), before = segment.continuesBefore ? 'continues-before' : '', after = segment.continuesAfter ? 'continues-after' : '';
        return `<button class="month-event-band event-${status.className} ${before} ${after}" data-edit-block="${escapeHtml(segment.block.id)}" data-event-lane="${segment.lane}" style="grid-column:${segment.startColumn} / span ${segment.span};grid-row:${segment.lane + 1};--event-lane:${segment.lane}" title="${escapeHtml(`${blockTitle(segment.block)} · ${blockDisplayLabel(segment.block)}`)}">${status.icon} ${escapeHtml(blockTitle(segment.block))}</button>`;
      }).join('');
      const overflow = rowDates.map((date, column) => {
        const hidden = monthEvents.overflowByDate[dateKey(date)] || 0;
        return hidden ? `<button class="month-event-overflow" data-select-week="${dateKey(date)}" style="grid-column:${column + 1}">+${hidden} événement${hidden > 1 ? 's' : ''}</button>` : '';
      }).join('');
      return `<section class="month-week-row"><div class="month-days-row">${days}</div><div class="month-event-layer">${bands}${overflow}</div></section>`;
    }).join('');
    $('#monthGrid').innerHTML = headings + rows;
    renderWeekOverview();
  }

  function buildWeekCards(start) {
    return Array.from({ length: 7 }, (_, index) => addDays(start, index)).map(date => {
      const key = dateKey(date), meta = dateMeta(date), blocks = blocksOnDate(date), appointments = appointmentsForDate(key), hours = workHoursFor(date);
      const entries = [
        ...blocks.map(block => ({ type: 'block', time: block.allDay || block.startDate < key ? '00:00' : block.startTime, block })),
        ...appointments.map(appointment => ({ type: 'appointment', time: appointment.time, appointment }))
      ].sort((a, b) => a.time.localeCompare(b.time));
      const content = entries.length ? entries.map(entry => {
        if (entry.type === 'block') {
          const block = entry.block, status = blockStatusMeta(block);
          return `<div class="overview-entry"><button class="overview-block event-${status.className}" data-edit-block="${escapeHtml(block.id)}"><span>${status.icon}</span><span><strong>${escapeHtml(blockTitle(block))}</strong><small>${status.label} · ${escapeHtml(blockDetailsLabel(block))}</small></span></button></div>`;
        }
        const appointment = entry.appointment, client = clientFor(appointment), payment = activeAppointment(appointment) ? ` · ${PAYMENT[appointment.paymentStatus] || 'À vérifier'}` : '';
        return `<div class="overview-entry"><button class="overview-appointment ${serviceTheme(appointment)} ${!activeAppointment(appointment) ? 'inactive' : ''}" data-edit="${escapeHtml(appointment.id)}"><span class="overview-time">${appointment.time}</span><span><strong>${badgeHtml(client, 'small')}${escapeHtml(client.name)}</strong><span>${escapeHtml(appointment.service)} · fin ${endTime(appointment)}${appointmentTotal(appointment) ? ` · ${money(appointmentTotal(appointment))}` : ''}${payment}</span></span><span class="mini-status">${STATUS[appointment.status]}</span></button></div>`;
      }).join('') : '<p>Aucun rendez-vous ni événement personnel</p>';
      return `<article class="overview-day ${meta.weekend ? 'weekend' : ''} ${meta.holiday ? 'holiday' : ''}"><div class="overview-day-heading"><button data-open-day="${key}"><h3>${format(date, { weekday: 'long', day: 'numeric', month: 'short' })}${meta.holiday ? ` <small>· Férié : ${escapeHtml(meta.holiday.label)}</small>` : ''}</h3><small>${appointments.filter(activeAppointment).length} RDV · ${blocks.length} événement${blocks.length > 1 ? 's' : ''} · ${escapeHtml(workHoursLabel(hours))}</small></button><span>›</span></div>${content}</article>`;
    }).join('');
  }

  function renderWeekOverview() {
    const target = $('#weekOverview');
    if (!app.ui.overviewWeekStart) { target.hidden = true; return; }
    target.hidden = false;
    target.innerHTML = `<div class="week-overview-header"><h2>Semaine du ${format(app.ui.overviewWeekStart, { day: 'numeric', month: 'long' })}</h2><button class="text-button" data-close-overview>Retour au mois</button></div><div class="week-overview-list">${buildWeekCards(app.ui.overviewWeekStart)}</div>`;
  }

  function clientHistory(clientId) { return app.state.appointments.filter(appointment => appointment.clientId === clientId).sort((a, b) => appointmentTimestamp(b) - appointmentTimestamp(a)); }
  function clientFirstVisit(clientId) { return [...clientHistory(clientId)].reverse().find(activeAppointment) || null; }

  function renderClients() {
    const query = ($('#clientSearch').value || '').trim().toLocaleLowerCase('fr-FR'), filterValue = $('#clientFilter')?.value || 'all', now = Date.now();
    const historyByClient = new Map();
    app.state.appointments.forEach(appointment => {
      const history = historyByClient.get(appointment.clientId) || [];
      history.push(appointment); historyByClient.set(appointment.clientId, history);
    });
    historyByClient.forEach(history => history.sort((a, b) => appointmentTimestamp(b) - appointmentTimestamp(a)));
    const historyFor = clientId => historyByClient.get(clientId) || [];
    const lastFor = clientId => historyFor(clientId).find(appointment => activeAppointment(appointment) && appointmentTimestamp(appointment) <= now) || null;
    const matchesFilter = client => {
      const history = historyFor(client.id), last = lastFor(client.id), lastTime = last ? appointmentStart(last) : 0;
      if (filterValue === 'badge') return Boolean(clientBadge(client));
      if (filterValue === 'late') return history.some(appointment => appointment.status === 'cancelled' && appointment.lateCancellation === true);
      if (filterValue === 'pending') return history.some(appointment => activeAppointment(appointment) && appointment.paymentStatus === 'pending');
      if (filterValue === 'inactive90') return !last || now - lastTime >= 90 * 86400000;
      if (filterValue === 'inactive180') return !last || now - lastTime >= 180 * 86400000;
      return true;
    };
    const clients = [...app.state.clients].filter(client => `${client.name} ${client.phone} ${client.address} ${CONTACT[client.contactVia] || ''}`.toLocaleLowerCase('fr-FR').includes(query) && matchesFilter(client)).sort((a, b) => appointmentTimestamp(lastFor(b.id) || { date: '1900-01-01', time: '00:00' }) - appointmentTimestamp(lastFor(a.id) || { date: '1900-01-01', time: '00:00' }));
    $('#clientList').innerHTML = clients.length ? clients.map(client => {
      const latest = lastFor(client.id), history = historyFor(client.id), noShows = history.filter(appointment => appointment.status === 'no_show').length, late = history.filter(appointment => appointment.status === 'cancelled' && appointment.lateCancellation === true).length;
      return `<button class="client-card" data-client="${escapeHtml(client.id)}"><span class="client-initial">${escapeHtml(client.name[0]?.toUpperCase() || '?')}</span><span><h3>${badgeHtml(client, 'small')}${escapeHtml(client.name)}</h3><p>${latest ? `Dernier RDV · ${format(parseDate(latest.date), { day: 'numeric', month: 'short' })} · ${escapeHtml(latest.service)}` : 'Aucun rendez-vous réalisé'}${client.contactVia ? ` · ${escapeHtml(CONTACT[client.contactVia])}` : ''}${noShows ? ` · ${noShows} absence${noShows > 1 ? 's' : ''}` : ''}${late ? ` · ${late} annulation${late > 1 ? 's' : ''} tardive${late > 1 ? 's' : ''}` : ''}</p></span><span class="chevron">›</span></button>`;
    }).join('') : '<section class="empty-message"><h2>Aucune cliente trouvée</h2><p>Essaie un autre nom ou retire le filtre.</p></section>';
  }

  function reportRange(mode = app.ui.reportMode) {
    if (mode === 'day') { const start = startOfDay(app.ui.reportDate); return { start, end: addDays(start, 1) }; }
    if (mode === 'week') { const start = mondayOf(app.ui.reportDate); return { start, end: addDays(start, 7) }; }
    if (mode === 'year') { const start = localDate(app.ui.reportDate.getFullYear(), 0, 1); return { start, end: localDate(start.getFullYear() + 1, 0, 1) }; }
    const start = localDate(app.ui.reportDate.getFullYear(), app.ui.reportDate.getMonth(), 1);
    return { start, end: localDate(start.getFullYear(), start.getMonth() + 1, 1) };
  }

  function expenseReportRange(mode = app.ui.expenseReportMode) { return reportRange(mode); }

 function currentReportMode() { return app.ui.reportTab === 'expenses' ? app.ui.expenseReportMode : app.ui.reportMode; }

  function shiftReportDate(direction) {
    const mode = currentReportMode(), amount = direction < 0 ? -1 : 1;
    if (mode === 'day') app.ui.reportDate = addDays(app.ui.reportDate, amount);
    else if (mode === 'week') app.ui.reportDate = addDays(app.ui.reportDate, amount * 7);
    else if (mode === 'year') app.ui.reportDate = localDate(app.ui.reportDate.getFullYear() + amount, 0, 1);
    else app.ui.reportDate = localDate(app.ui.reportDate.getFullYear(), app.ui.reportDate.getMonth() + amount, 1);
  }

  function expensesForRange(start, end) {
    return app.state.expenses.filter(expense => { const date = parseDate(expense.date); return date && date >= start && date < end; }).sort((one, two) => one.date.localeCompare(two.date) || String(one.createdAt).localeCompare(String(two.createdAt)));
  }

  function expenseSummary(expenses) {
    const total = numericAmount(expenses.reduce((sum, expense) => sum + numericAmount(expense.amount), 0)), count = expenses.length;
    return { total, count, average: count ? numericAmount(total / count) : 0 };
  }

  function aggregateExpensesByCategory(expenses) {
    const groups = new Map();
    expenses.forEach(expense => {
      const id = expense.categoryId || 'expense-other', row = groups.get(id) || { id, categoryId: id, label: expenseCategoryLabel(expense), total: 0, count: 0 };
      row.total = numericAmount(row.total + numericAmount(expense.amount)); row.count += 1; groups.set(id, row);
    });
    return [...groups.values()].sort((one, two) => two.total - one.total || one.label.localeCompare(two.label, 'fr'));
  }

  function renderReport() {
    const mode = currentReportMode(), { start, end } = reportRange(mode), expensesTab = app.ui.reportTab === 'expenses';
    $('#reportPeriodLabel').textContent = mode === 'day' ? format(start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : mode === 'week' ? `${format(start, { day: 'numeric', month: 'short' })} – ${format(addDays(end, -1), { day: 'numeric', month: 'short' })}` : mode === 'year' ? String(start.getFullYear()) : format(start, { month: 'long', year: 'numeric' });
    $$('.report-period-button').forEach(button => { const allowed = expensesTab ? button.dataset.reportPeriod !== 'week' : button.dataset.reportPeriod !== 'day'; button.hidden = !allowed; const active = allowed && button.dataset.reportPeriod === mode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    $$('.report-tab').forEach(button => { const active = button.dataset.reportTab === app.ui.reportTab; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    $('#exportReportCsv').textContent = expensesTab ? 'Exporter les dépenses' : 'Exporter CSV';
    if (expensesTab) { renderExpensesReport(start, end); return; }
    const byAppointmentDate = appointment => { const date = parseDate(appointment.date); return date >= start && date < end; };
    if (app.ui.reportTab === 'activity') renderActivityReport(byAppointmentDate); else renderPaymentsReport(byAppointmentDate, start, end);
    if (mode === 'year') $('#reportContent').insertAdjacentHTML('beforeend', annualBreakdown(start));
  }

  function renderExpensesReport(start, end) {
    const expenses = expensesForRange(start, end), summary = expenseSummary(expenses), globalActive = app.ui.expenseReportView === 'global';
    const switcher = `<section class="expense-view-switch" aria-label="Présentation des dépenses"><button class="${globalActive ? 'active' : ''}" data-expense-view="global" aria-pressed="${globalActive}">Vue globale</button><button class="${globalActive ? '' : 'active'}" data-expense-view="categories" aria-pressed="${!globalActive}">Par catégorie</button></section>`;
    const note = '<p class="information-note expense-separate-note"><span>i</span><strong>Information uniquement : les revenus encaissés ne sont pas diminués par les dépenses.</strong></p>';
    if (globalActive) {
      const rows = [...expenses].reverse().map(expense => `<button class="expense-row" data-edit-expense="${escapeHtml(expense.id)}"><span class="expense-row-date">${format(parseDate(expense.date), { day: 'numeric', month: 'short' })}</span><span><strong>${escapeHtml(expenseCategoryLabel(expense))}</strong><small>${escapeHtml([expense.details, expense.supplier].filter(Boolean).join(' · ') || 'Aucun détail')}</small></span><b>${money(expense.amount)} ›</b></button>`).join('') || '<p class="empty-report">Aucune dépense sur cette période.</p>';
      $('#reportContent').innerHTML = `${switcher}${note}<section class="metrics-grid expense-metrics"><article><span>Total des dépenses</span><strong>${money(summary.total) || '0 €'}</strong><small>sans déduction des revenus</small></article><article><span>Nombre</span><strong>${summary.count}</strong><small>achat${summary.count > 1 ? 's' : ''} enregistré${summary.count > 1 ? 's' : ''}</small></article><article><span>Montant moyen</span><strong>${money(summary.average) || '0 €'}</strong><small>moyenne des dépenses</small></article></section><section class="report-panel"><h2>Historique des dépenses</h2>${rows}</section>`;
      return;
    }
    const groups = aggregateExpensesByCategory(expenses), maximum = Math.max(1, ...groups.map(group => group.total));
    const rows = groups.map((group, index) => `<article class="expense-category-row"><div class="expense-category-heading"><span><strong>${escapeHtml(group.label)}</strong><small>${group.count} dépense${group.count > 1 ? 's' : ''}</small></span><b>${money(group.total)}</b></div><div class="expense-category-bar"><span style="--bar-width:${Math.max(2, group.total / maximum * 100).toFixed(1)}%;--expense-bar-index:${index % 7}"></span></div></article>`).join('') || '<p class="empty-report">Aucune dépense sur cette période.</p>';
    $('#reportContent').innerHTML = `${switcher}${note}<section class="metrics-grid expense-metrics"><article><span>Total des dépenses</span><strong>${money(summary.total) || '0 €'}</strong><small>${summary.count} dépense${summary.count > 1 ? 's' : ''}</small></article></section><section class="report-panel"><h2>Dépenses par catégorie</h2>${rows}</section>`;
  }

  function annualBreakdown(yearStart) {
    const rows = Array.from({ length: 12 }, (_, monthIndex) => {
      const start = localDate(yearStart.getFullYear(), monthIndex, 1), end = localDate(yearStart.getFullYear(), monthIndex + 1, 1);
      const inMonth = appointment => { const date = parseDate(appointment.date); return date >= start && date < end; };
      const appointments = app.state.appointments.filter(inMonth), active = appointments.filter(activeAppointment), clients = new Set(active.map(item => item.clientId));
      const minutes = active.filter(item => appointmentEnd(item) <= Date.now()).reduce((sum, item) => sum + Number(item.duration || 0), 0);
      const collected = app.state.appointments.filter(item => {
        const paidDate = parseDate(item.paymentDate); return item.paymentStatus === 'paid' && paidDate && paidDate >= start && paidDate < end;
      }).reduce((sum, item) => sum + appointmentTotal(item), 0);
      const pending = active.filter(item => item.paymentStatus === 'pending').reduce((sum, item) => sum + appointmentTotal(item), 0);
      return `<tr><th>${format(start, { month: 'long' })}</th><td>${active.length}</td><td>${clients.size}</td><td>${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60}` : ''}</td><td>${money(collected) || '0 €'}</td><td>${money(pending) || '0 €'}</td></tr>`;
    }).join('');
    return `<section class="report-panel annual-panel"><h2>Détail des 12 mois</h2><div class="report-table-wrap"><table><thead><tr><th>Mois</th><th>RDV</th><th>Clientes</th><th>Heures</th><th>Encaissé</th><th>À régler</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  function csvCell(value) {
    let textValue = String(value ?? '').replace(/[\r\n]+/g, ' ');
    if (/^[=+\-@\t]/.test(textValue)) textValue = `'${textValue}`;
    return `"${textValue.replace(/"/g, '""')}"`;
  }

  async function exportReportCsv() {
    if (app.ui.reportTab === 'expenses') {
      const mode = app.ui.expenseReportMode, { start, end } = expenseReportRange(mode), expenses = expensesForRange(start, end);
      const header = ['Date', 'Catégorie', 'Description', 'Fournisseur', 'Montant'];
      const rows = expenses.map(expense => [expense.date, expenseCategoryLabel(expense), expense.details, expense.supplier, numericAmount(expense.amount).toFixed(2)].map(csvCell).join(';'));
      const label = mode === 'year' ? String(start.getFullYear()) : mode === 'month' ? `${start.getFullYear()}-${pad(start.getMonth() + 1)}` : dateKey(start);
      const blob = new Blob([`\ufeff${header.map(csvCell).join(';')}\r\n${rows.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
      return shareOrDownload(blob, `depenses-${mode}-${label}.csv`, 'Dépenses Mon agenda');
    }
    const { start, end } = reportRange(app.ui.reportMode), appointments = app.state.appointments.filter(item => { const date = parseDate(item.date); return date >= start && date < end; }).sort((a, b) => appointmentTimestamp(a) - appointmentTimestamp(b));
    const header = ['Date', 'Heure', 'Cliente', 'Téléphone', 'Contact via', 'Prestation', 'Durée (min)', 'Prix de base', 'Suppléments', 'Total', 'Statut', 'Paiement', 'Date paiement', 'Date relance'];
    const rows = appointments.map(appointment => {
      const client = clientFor(appointment), supplementText = normaliseSupplements(appointment.supplements).map(item => `${item.label}: ${numericAmount(item.amount).toFixed(2)} €`).join(' | ');
      return [appointment.date, appointment.time, client.name, client.phone, CONTACT[appointment.contactVia || client.contactVia] || '', appointment.service, appointment.duration, numericAmount(appointment.price).toFixed(2), supplementText, appointmentTotal(appointment).toFixed(2), STATUS[appointment.status], PAYMENT[appointment.paymentStatus], appointment.paymentDate, appointment.paymentReminderDate].map(csvCell).join(';');
    });
    const label = app.ui.reportMode === 'year' ? String(start.getFullYear()) : app.ui.reportMode === 'month' ? `${start.getFullYear()}-${pad(start.getMonth() + 1)}` : dateKey(start);
    const blob = new Blob([`\ufeff${header.map(csvCell).join(';')}\r\n${rows.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    await shareOrDownload(blob, `bilan-${app.ui.reportMode}-${label}.csv`, 'Bilan Mon agenda');
  }

  function renderActivityReport(inRange) {
    const appointments = app.state.appointments.filter(inRange), active = appointments.filter(activeAppointment), clientIds = new Set(active.map(appointment => appointment.clientId));
    const newClients = [...clientIds].filter(clientId => { const first = clientFirstVisit(clientId); return first && inRange(first); }).length;
    const cancelled = appointments.filter(appointment => appointment.status === 'cancelled').length, noShows = appointments.filter(appointment => appointment.status === 'no_show').length;
    const services = new Map();
    const workedMinutes = active.filter(appointment => appointmentEnd(appointment) <= Date.now()).reduce((sum, appointment) => sum + Number(appointment.duration || 0), 0);
    const plannedMinutes = active.filter(appointment => appointmentEnd(appointment) > Date.now()).reduce((sum, appointment) => sum + Number(appointment.duration || 0), 0);
    active.forEach(appointment => { const row = services.get(appointment.service) || { count: 0, total: 0, color: appointment.serviceColor || 'rose' }; row.count += 1; row.total += appointmentTotal(appointment); services.set(appointment.service, row); });
    const serviceRows = [...services.entries()].sort((a, b) => b[1].count - a[1].count).map(([name, row]) => `<article class="report-row"><span class="service-dot ${COLORS.includes(row.color) ? row.color : 'rose'}"></span><span><strong>${escapeHtml(name)}</strong><small>${row.count} prestation${row.count > 1 ? 's' : ''}${row.total ? ` · ${money(row.total)}` : ''}</small></span></article>`).join('') || '<p class="empty-report">Aucune prestation sur cette période.</p>';
    $('#reportContent').innerHTML = `<section class="metrics-grid"><article><span>Rendez-vous</span><strong>${active.length}</strong><small>${appointments.filter(appointment => appointment.status === 'completed').length} terminé${appointments.filter(appointment => appointment.status === 'completed').length > 1 ? 's' : ''}</small></article><article><span>Clientes</span><strong>${clientIds.size}</strong><small>${newClients} nouvelle${newClients > 1 ? 's' : ''}</small></article><article><span>Heures travaillées</span><strong>${Math.floor(workedMinutes / 60)} h${workedMinutes % 60 ? ` ${workedMinutes % 60}` : ''}</strong><small>${plannedMinutes ? `${Math.floor(plannedMinutes / 60)} h${plannedMinutes % 60 ? ` ${plannedMinutes % 60}` : ''} encore planifiées` : 'hors annulations et absences'}</small></article><article class="metric-alert"><span>Annulées</span><strong>${cancelled}</strong><small>${noShows} absence${noShows > 1 ? 's' : ''}</small></article></section><section class="report-panel"><h2>Prestations prévues</h2>${serviceRows}</section>`;
  }

  function renderPaymentsReport(inRange, start, end) {
    const appointments = app.state.appointments.filter(inRange), active = appointments.filter(activeAppointment), planned = active.reduce((sum, appointment) => sum + appointmentTotal(appointment), 0);
    const paid = app.state.appointments.filter(appointment => {
      const paymentDate = parseDate(appointment.paymentDate || appointment.date);
      return activeAppointment(appointment) && appointment.paymentStatus === 'paid' && paymentDate >= start && paymentDate < end;
    }).reduce((sum, appointment) => sum + appointmentTotal(appointment), 0);
    const pending = active.filter(appointment => appointment.paymentStatus === 'pending'), pendingTotal = pending.reduce((sum, appointment) => sum + appointmentTotal(appointment), 0);
    const unreviewed = active.filter(appointment => appointment.paymentStatus === 'unreviewed');
    const rows = [...pending, ...unreviewed].sort((a, b) => appointmentTimestamp(a) - appointmentTimestamp(b)).map(appointment => {
      const client = clientFor(appointment), label = appointment.paymentStatus === 'pending' ? 'À régler' : 'À vérifier';
      return `<button class="payment-row" data-edit="${escapeHtml(appointment.id)}"><span><strong>${badgeHtml(client, 'small')}${escapeHtml(client.name)}</strong><small>${format(parseDate(appointment.date), { day: 'numeric', month: 'short' })} · ${escapeHtml(appointment.service)} · ${label}</small></span><b>${money(appointmentTotal(appointment)) || 'À définir'} <i>›</i></b></button>`;
    }).join('') || '<p class="empty-report">Aucun paiement à suivre sur cette période.</p>';
    $('#reportContent').innerHTML = `<section class="metrics-grid payments"><article class="metric-paid"><span>Encaissé</span><strong>${money(paid) || '0 €'}</strong><small>selon la date de paiement</small></article><article><span>À encaisser</span><strong>${money(pendingTotal) || '0 €'}</strong><small>${pending.length} paiement${pending.length > 1 ? 's' : ''} avec relance</small></article><article class="metric-review"><span>À vérifier</span><strong>${unreviewed.length}</strong><small>à contrôler en fin de journée</small></article><article><span>Prévu</span><strong>${money(planned) || '0 €'}</strong><small>selon la date du RDV</small></article></section><section class="report-panel"><h2>Paiements à suivre</h2>${rows}</section>`;
  }

  function renderScreen() {
    $('#agendaScreen').hidden = app.ui.screen !== 'agenda'; $('#clientsScreen').hidden = app.ui.screen !== 'clients'; $('#reportScreen').hidden = app.ui.screen !== 'report';
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.screen === app.ui.screen));
  }

  function showScreen(screen) {
    if (screen === 'settings') { openSettings(); return; }
    app.ui.screen = screen; render();
  }

  function populateServiceSelect(selectedId = '', fallbackName = '') {
    const selectedService = serviceById(selectedId) || serviceByName(fallbackName), active = app.state.settings.services.filter(service => service.active || service.id === selectedService?.id), selected = selectedService?.id || (fallbackName ? 'custom' : '');
    $('#serviceSelect').innerHTML = `<option value="">Choisir…</option>${active.map(service => `<option value="${escapeHtml(service.id)}">${escapeHtml(service.name)}${service.price !== '' ? ` · ${money(service.price)}` : ''}</option>`).join('')}<option value="custom">Autre prestation…</option>`;
    $('#serviceSelect').value = selected;
    $('#customServiceField').hidden = selected !== 'custom'; $('#service').required = selected === 'custom';
  }

  function durationLabel(minutes) {
    const value = Number(minutes) || 0, hours = Math.floor(value / 60), rest = value % 60;
    if (!hours) return `${rest} min`;
    return `${hours} h${rest ? ` ${rest}` : ''}`;
  }

  function updateAppointmentServiceSummary() {
    const preset = serviceById($('#serviceSelect').value), name = preset?.name || $('#service').value.trim(), selected = Boolean(name);
    $('#appointmentServiceSummary').hidden = !selected;
    if (selected) $('#appointmentServiceSummaryText').textContent = `${name} · ${durationLabel($('#duration').value)} · ${money($('#price').value) || 'prix à définir'}`;
  }

  function setAppointmentAdjustments(expanded) {
    const custom = $('#serviceSelect').value === 'custom', visible = Boolean(expanded || custom);
    $('#appointmentServiceAdjustments').hidden = !visible; $('#toggleAppointmentAdjustments').setAttribute('aria-expanded', String(visible)); $('#toggleAppointmentAdjustments').textContent = visible && !custom ? 'Réduire' : 'Ajuster';
    app.ui.appointmentAdjustmentsExpanded = visible; updateAppointmentServiceSummary();
  }

  function syncAppointmentContactSummary(client, expanded = app.ui.appointmentContactExpanded) {
    const selected = Boolean(client?.id), summary = $('#appointmentContactSummary'), fields = $('#appointmentContactFields');
    summary.hidden = !selected || expanded; fields.hidden = selected && !expanded;
    if (!selected) { app.ui.appointmentContactExpanded = true; return; }
    const details = [$('#phone').value || 'sans téléphone', CONTACT[$('#contactVia').value] || 'contact non précisé', $('#address').value || 'sans adresse'];
    $('#appointmentContactSummaryText').textContent = details.join(' · '); app.ui.appointmentContactExpanded = Boolean(expanded);
  }

  function syncPaymentFields() {
    const editing = Boolean(app.ui.editingAppointmentId), status = $('#paymentStatus').value, paid = status === 'paid', pending = status === 'pending';
    $('#paymentDateField').hidden = !paid; $('#paymentDate').disabled = !editing || !paid;
    $('#paymentMethodField').hidden = !paid; $('#paymentMethod').disabled = !editing || !paid;
    $('#paymentReminderField').hidden = !pending; $('#paymentReminderDate').disabled = !editing || !pending; $('#paymentReminderDate').required = editing && pending;
    if (paid && !$('#paymentDate').value) $('#paymentDate').value = $('#date').value || todayKey();
  }

  function populateStatusSelect(editing, selected = 'confirmed') {
    const allowed = editing ? Object.keys(STATUS) : ['to_confirm', 'confirmed'];
    $('#status').innerHTML = allowed.map(value => `<option value="${value}">${STATUS[value]}</option>`).join('');
    $('#status').value = allowed.includes(selected) ? selected : 'confirmed';
  }

  function setTimePicker(baseId, value = '10:00') {
    const hourSelect = $(`#${baseId}Hour`), minuteSelect = $(`#${baseId}Minute`), hidden = $(`#${baseId}`);
    if (!hourSelect || !minuteSelect || !hidden) return;
    const safe = validTime(value) ? value : '10:00', [hour, minute] = safe.split(':');
    hourSelect.innerHTML = Array.from({ length: 24 }, (_, index) => `<option value="${pad(index)}">${pad(index)}</option>`).join('');
    const regularMinutes = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
    const minutes = regularMinutes.includes(minute) ? regularMinutes : [minute, ...regularMinutes];
    minuteSelect.innerHTML = minutes.map(item => `<option value="${item}">${item}${regularMinutes.includes(item) ? '' : ' · ancien horaire'}</option>`).join('');
    hourSelect.value = hour; minuteSelect.value = minute; hidden.step = regularMinutes.includes(minute) ? '300' : '60'; hidden.value = safe;
  }

  function syncTimePicker(baseId) {
    const hour = $(`#${baseId}Hour`)?.value, minute = $(`#${baseId}Minute`)?.value, hidden = $(`#${baseId}`);
    if (!hidden || !hour || minute === undefined) return;
    hidden.step = Number(minute) % 5 === 0 ? '300' : '60'; hidden.value = `${hour}:${minute}`;
    hidden.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function setDurationValue(value, selectId = 'duration') {
    const select = $(`#${selectId}`), duration = Math.min(LIMITS.duration, Math.max(15, Math.round(Number(value) || 60))), stringValue = String(duration);
    select.querySelectorAll?.('option[data-legacy-duration]').forEach(option => option.remove());
    if (!select.querySelector(`option[value="${stringValue}"]`)) select.insertAdjacentHTML('beforeend', `<option data-legacy-duration value="${stringValue}">${duration} min · durée existante</option>`);
    select.value = stringValue;
  }

  function syncStatusFields() {
    const status = $('#status').value, inactive = Boolean(app.ui.editingAppointmentId) && ['cancelled', 'no_show'].includes(status);
    $('#cancellationReasonField').hidden = !inactive; $('#cancellationReason').disabled = !inactive;
    $('#lateCancellationField').hidden = !(Boolean(app.ui.editingAppointmentId) && status === 'cancelled'); $('#lateCancellation').disabled = !(Boolean(app.ui.editingAppointmentId) && status === 'cancelled');
    if (status !== 'cancelled') $('#lateCancellation').checked = false;
    $('#cancellationReasonLabel').textContent = status === 'no_show' ? 'Motif de l’absence' : 'Motif de l’annulation';
  }

  function syncRepeatDate(force = false) {
    const editing = Boolean(app.ui.editingAppointmentId), weeks = Number($('#repeatWeeks').value), active = editing && weeks > 0, baseDate = parseDate($('#date').value), dateInput = $('#repeatDate'), timeInput = $('#repeatTime');
    $('#repeatScheduleFields').hidden = !active; dateInput.disabled = !active; timeInput.disabled = !active; dateInput.required = active; timeInput.required = active;
    if (!active) { dateInput.value = ''; timeInput.value = ''; $('#repeatHelp').textContent = 'La date et l’heure seront calculées automatiquement, puis restent modifiables.'; return; }
    if (baseDate) {
      dateInput.min = dateKey(addDays(baseDate, 1));
      if (force || !app.ui.repeatDateEdited || !validDate(dateInput.value)) dateInput.value = dateKey(addDays(baseDate, weeks * 7));
    }
    if (force || !app.ui.repeatTimeEdited || !validTime(timeInput.value)) setTimePicker('repeatTime', $('#time').value || '10:00');
    const repeatDate = parseDate(dateInput.value), time = timeInput.value, duration = Number($('#duration').value) || 60, messages = ['Date et heure modifiables.'];
    if (repeatDate && validTime(time)) {
      const repeated = { id: '__repeat-preview__', date: dateInput.value, time, duration, status: 'confirmed' }, conflicts = findConflicts(repeated), warning = outsideWorkHours(repeated), meta = dateMeta(repeatDate);
      if (conflicts.length) messages.push('Attention : ce prochain créneau est déjà occupé ou bloqué.');
      if (warning) messages.push(warning);
      if (meta.holiday) messages.push(`Jour férié : ${meta.holiday.label}.`); else if (meta.weekend) messages.push('Ce jour est un week-end.');
    } else if (repeatDate) messages.push('Choisis une heure valide.');
    $('#repeatHelp').textContent = messages.join(' ');
  }

  function syncAppointmentFormMode() {
    const editing = Boolean(app.ui.editingAppointmentId), linked = editing ? app.state.appointments.find(item => item.parentAppointmentId === app.ui.editingAppointmentId && activeAppointment(item)) : null;
    $('#appointmentEditFields').hidden = !editing; $('#recurrenceSection').hidden = !editing; $('#repeatWeeks').disabled = !editing || Boolean(linked); $('#repeatComposer').hidden = Boolean(linked);
    $('#paymentStatus').disabled = !editing; $('#paymentDate').disabled = !editing; $('#paymentMethod').disabled = !editing; $('#paymentReminderDate').disabled = !editing;
    $('#linkedNextAppointment').hidden = !linked;
    if (linked) {
      $('#repeatWeeks').value = '0';
      $('#linkedNextAppointment').innerHTML = `<button type="button" data-edit-linked="${escapeHtml(linked.id)}"><span><strong>Prochain RDV déjà créé</strong><small>${format(parseDate(linked.date), { weekday: 'long', day: 'numeric', month: 'long' })} à ${linked.time}</small></span><b>Ouvrir ›</b></button>`;
    } else $('#linkedNextAppointment').innerHTML = '';
    if (!editing) { $('#repeatWeeks').value = '0'; app.ui.repeatDateEdited = false; app.ui.repeatTimeEdited = false; }
    syncStatusFields(); syncRepeatDate(true); syncPaymentFields();
  }

 function resetAppointmentForm() {
   $('#appointmentForm').reset(); $('#appointmentId').value = ''; populateServiceSelect();
    app.ui.appointmentContactExpanded = true; app.ui.appointmentAdjustmentsExpanded = false;
    $('#appointmentContactSummary').hidden = true; $('#appointmentContactFields').hidden = false; $('#appointmentServiceSummary').hidden = true; setAppointmentAdjustments(false);
    $('#date').value = dateKey(app.ui.selectedDate); setTimePicker('time', '10:00'); setTimePicker('repeatTime', '10:00'); setDurationValue(60); populateStatusSelect(false, 'confirmed');
    $('#paymentStatus').value = 'unreviewed'; $('#paymentDate').value = ''; $('#paymentReminderDate').value = ''; $('#paymentMethod').value = ''; $('#repeatWeeks').value = '0'; $('#repeatDate').value = ''; $('#repeatTime').value = '';
    $('#contactVia').value = ''; $('#lateCancellation').checked = false; renderSupplementRows([]); renderAppointmentHistory(null);
    $('#clientSuggestions').hidden = true; $('#selectedClientInfo').hidden = true; $('#selectedClientInfo').innerHTML = ''; $('#conflictHint').hidden = true; app.ui.editingAppointmentId = null; app.ui.formClientId = null; app.ui.formServiceColor = 'rose'; app.ui.repeatDateEdited = false; app.ui.repeatTimeEdited = false;
    $('#appointmentWaze').hidden = true; $('#addressHint').hidden = true;
    setAppointmentSaving(false);
    syncPaymentFields(); syncAppointmentFormMode();
  }

 function setAppointmentSaving(value) {
   app.ui.appointmentSaving = Boolean(value);
    const submit = $('#appointmentSubmitButton');
    if (submit) { submit.disabled = app.ui.appointmentSaving; submit.textContent = app.ui.appointmentSaving ? 'Enregistrement…' : (app.ui.editingAppointmentId ? 'Enregistrer les modifications' : 'Créer le rendez-vous'); }
 }

 function setBlockSaving(value) {
   app.ui.blockSaving = Boolean(value);
    const submit = $('#blockSubmitButton');
    if (submit) { submit.disabled = app.ui.blockSaving; submit.textContent = app.ui.blockSaving ? 'Enregistrement…' : (app.ui.editingBlockId ? 'Enregistrer les modifications' : 'Ajouter l’événement'); }
 }

  function openAppointment(appointment = null, defaults = {}) {
    resetAppointmentForm();
    $('#appointmentFormTitle').textContent = appointment ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'; $('#deleteAppointment').hidden = !appointment;
    if (appointment) {
      const client = clientFor(appointment); app.ui.editingAppointmentId = appointment.id; app.ui.formClientId = client.id; app.ui.formServiceColor = appointment.serviceColor || 'rose';
      populateStatusSelect(true, appointment.status); $('#appointmentId').value = appointment.id; $('#clientName').value = client.name; $('#phone').value = client.phone; $('#contactVia').value = appointment.contactVia || client.contactVia || ''; $('#date').value = appointment.date; setTimePicker('time', appointment.time); setDurationValue(appointment.duration); $('#price').value = appointment.price; renderSupplementRows(appointment.supplements); populateServiceSelect(appointment.serviceId, appointment.service); $('#service').value = appointment.service; $('#address').value = appointmentAddress(appointment); $('#paymentStatus').value = appointment.paymentStatus; $('#paymentDate').value = appointment.paymentDate || ''; $('#paymentReminderDate').value = appointment.paymentReminderDate || ''; $('#paymentMethod').value = appointment.paymentMethod; $('#notes').value = appointment.notes; $('#cancellationReason').value = appointment.cancellationReason || ''; $('#lateCancellation').checked = appointment.lateCancellation === true; $('#appointmentWaze').hidden = !appointmentAddress(appointment); renderSelectedClientInfo(client); renderAppointmentHistory(appointment);
    } else if (defaults.from) {
      const prior = defaults.from, client = clientFor(prior); app.ui.formClientId = client.id; app.ui.formServiceColor = prior.serviceColor || 'rose';
      $('#clientName').value = client.name; $('#phone').value = client.phone; $('#contactVia').value = prior.contactVia || client.contactVia || ''; $('#address').value = appointmentAddress(prior); setDurationValue(prior.duration); $('#price').value = prior.price; renderSupplementRows(prior.supplements); populateServiceSelect(prior.serviceId, prior.service); $('#service').value = prior.service; $('#date').value = defaults.date || dateKey(app.ui.selectedDate); setTimePicker('time', defaults.time || prior.time); $('#appointmentWaze').hidden = !appointmentAddress(prior); renderSelectedClientInfo(client);
    } else { $('#date').value = defaults.date || dateKey(app.ui.selectedDate); setTimePicker('time', defaults.time || '10:00'); }
   syncAppointmentFormMode(); updateAppointmentTotal(); updateConflictHint(); app.ui.appointmentDraftBaseline = draftSignature(appointmentDraftPayload()); $('#appointmentDialog').showModal(); captureFormBaseline('appointmentDialog'); if (!appointment) setTimeout(() => $('#clientName').focus(), 30);
    const selectedClient = app.ui.formClientId ? clientById(app.ui.formClientId) : null;
    syncAppointmentContactSummary(selectedClient, !selectedClient); setAppointmentAdjustments($('#serviceSelect').value === 'custom'); setAppointmentSaving(false);
 }

 function renderSelectedClientInfo(client) {
   const target = $('#selectedClientInfo');
   if (!client?.id) { target.hidden = true; target.innerHTML = ''; syncAppointmentContactSummary(null, true); return; }
    target.hidden = false;
    const late = lateCancellationCount(client.id);
    target.innerHTML = `<div class="selected-client-heading"><span>Fiche cliente sélectionnée</span>${badgeHtml(client)}</div><strong>${escapeHtml(client.name)}</strong><p>${client.contactVia ? `Contact via ${escapeHtml(CONTACT[client.contactVia])} · ` : ''}${late ? `${late} annulation${late > 1 ? 's' : ''} tardive${late > 1 ? 's' : ''} · ` : ''}${client.notes ? escapeHtml(client.notes) : 'Aucune note cliente.'}</p>`;
  }

 function fillFromClient(client) {
   app.ui.formClientId = client.id; app.ui.appointmentContactExpanded = false; $('#clientName').value = client.name; $('#phone').value = client.phone || ''; $('#contactVia').value = client.contactVia || ''; $('#address').value = client.address || ''; $('#appointmentWaze').hidden = !client.address; $('#clientSuggestions').hidden = true; renderSelectedClientInfo(client); syncAppointmentContactSummary(client, false); updateConflictHint();
 }

  function renderSuggestions() {
    const term = normaliseName($('#clientName').value), target = $('#clientSuggestions');
    const matches = term.length >= 2 ? app.state.clients.filter(client => normaliseName(client.name).includes(term)).slice(0, 6) : [];
    if (!matches.length) { target.hidden = true; return; }
    target.hidden = false;
    target.innerHTML = matches.map(client => `<button type="button" class="client-suggestion" data-suggestion="${escapeHtml(client.id)}"><strong>${badgeHtml(client, 'small')}${escapeHtml(client.name)}</strong><span>${escapeHtml(client.phone || 'Sans téléphone')}${client.contactVia ? ` · ${escapeHtml(CONTACT[client.contactVia])}` : ''}${client.address ? ` · ${escapeHtml(client.address)}` : ''}</span></button>`).join('');
  }

  function applyServicePreset() {
    const id = $('#serviceSelect').value, preset = serviceById(id), custom = id === 'custom';
    $('#customServiceField').hidden = !custom; $('#service').required = custom;
    if (preset) {
      $('#service').value = preset.name; setDurationValue(preset.duration); $('#price').value = preset.price; app.ui.formServiceColor = preset.color;
    } else if (!custom) { $('#service').value = ''; app.ui.formServiceColor = 'rose'; }
    if (custom) setTimeout(() => $('#service').focus(), 0);
    setAppointmentAdjustments(custom); updateAppointmentTotal(); updateConflictHint();
  }

  function supplementsFromForm(keepEmpty = false) {
    return $$('#supplementRows .supplement-row').map(row => {
      const select = row.querySelector('[data-supplement-type]'), input = row.querySelector('[data-supplement-amount]'), type = supplementTypeById(select?.value);
      return { id: row.dataset.supplementId || uuid(), typeId: type?.id || '', label: type?.name || row.dataset.fallbackLabel || 'Supplément', amount: numericAmount(input?.value) };
    }).filter(item => keepEmpty || item.amount > 0);
  }

  function renderSupplementRows(items = []) {
    const target = $('#supplementRows'); if (!target) return;
    target.innerHTML = normaliseSupplements(items).map(item => {
      const current = supplementTypeById(item.typeId), types = app.state.settings.supplementTypes.filter(type => type.active || type.id === current?.id);
      const legacy = !current && item.label ? `<option value="" selected>${escapeHtml(item.label)} · ancienne nature</option>` : '';
      return `<div class="supplement-row" data-supplement-id="${escapeHtml(item.id)}" data-fallback-label="${escapeHtml(item.label)}"><label>Nature<select data-supplement-type>${legacy}${types.map(type => `<option value="${escapeHtml(type.id)}" ${type.id === item.typeId ? 'selected' : ''}>${escapeHtml(type.name)}</option>`).join('')}</select></label><label>Montant (€)<input data-supplement-amount type="number" min="0" max="1000000" step="0.01" inputmode="decimal" value="${item.amount || ''}"></label><button type="button" class="remove-supplement" data-remove-supplement="${escapeHtml(item.id)}" aria-label="Supprimer ce supplément">×</button></div>`;
    }).join('');
    updateAppointmentTotal();
  }

  function addSupplementRow() {
    const active = app.state.settings.supplementTypes.find(type => type.active) || app.state.settings.supplementTypes[0];
    if (!active) { window.alert('Ajoute d’abord une nature de supplément dans les réglages.'); return; }
    renderSupplementRows([...supplementsFromForm(true), { id: uuid(), typeId: active.id, label: active.name, amount: numericAmount(active.price) }]);
    $('#supplementRows .supplement-row:last-child [data-supplement-amount]')?.focus();
  }

  function applySupplementDefaultPrice(select) {
    const row = select?.closest?.('.supplement-row'), type = supplementTypeById(select?.value), amount = row?.querySelector?.('[data-supplement-amount]');
    if (!row || !type || !amount) return;
    row.dataset.fallbackLabel = type.name;
    amount.value = type.price === '' ? '' : String(numericAmount(type.price));
    updateAppointmentTotal();
  }

 function updateAppointmentTotal() {
   const total = numericAmount($('#price')?.value) + supplementsFromForm().reduce((sum, item) => sum + item.amount, 0);
   if ($('#appointmentTotal')) $('#appointmentTotal').textContent = `Total : ${money(total) || '0 €'}`;
    updateAppointmentServiceSummary();
 }

  function renderAppointmentHistory(appointment) {
    const target = $('#appointmentHistory'); if (!target) return;
    const entries = [...(appointment?.history || [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    target.innerHTML = entries.length ? entries.map(entry => {
      const date = new Date(entry.at), when = Number.isNaN(date.getTime()) ? '' : format(date, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `<article><span class="history-dot"></span><span><strong>${escapeHtml(entry.label)}</strong><small>${escapeHtml(when)}${entry.details ? ` · ${escapeHtml(entry.details)}` : ''}</small></span></article>`;
    }).join('') : '<p class="small-copy">Aucune modification enregistrée dans les anciennes versions.</p>';
  }

  function getDraft() {
    const preset = serviceById($('#serviceSelect').value), service = preset?.name || $('#service').value.trim();
    const editing = Boolean(app.ui.editingAppointmentId), recurring = editing ? Number($('#repeatWeeks').value) : 0;
    const paymentStatus = editing ? $('#paymentStatus').value : 'unreviewed';
    return { id: app.ui.editingAppointmentId || $('#appointmentId').value || uuid(), clientId: app.ui.formClientId, clientName: $('#clientName').value.trim(), phone: $('#phone').value.trim(), contactVia: $('#contactVia').value, address: $('#address').value.trim(), date: $('#date').value, time: $('#time').value, duration: Number($('#duration').value), price: $('#price').value.trim(), supplements: supplementsFromForm(), service, serviceId: preset?.id || '', serviceColor: preset?.color || app.ui.formServiceColor || 'rose', status: $('#status').value, paymentStatus, paymentDate: paymentStatus === 'paid' ? (editing ? ($('#paymentDate').value || $('#date').value) : $('#date').value) : '', paymentReminderDate: paymentStatus === 'pending' ? $('#paymentReminderDate').value : '', paymentMethod: editing ? $('#paymentMethod').value : '', notes: $('#notes').value.trim(), cancellationReason: editing && ['cancelled', 'no_show'].includes($('#status').value) ? $('#cancellationReason').value.trim() : '', lateCancellation: editing && $('#status').value === 'cancelled' && $('#lateCancellation').checked, repeatWeeks: recurring, repeatDate: recurring ? $('#repeatDate').value : '', repeatTime: recurring ? $('#repeatTime').value : '' };
  }

  function updateConflictHint() {
    const date = $('#date').value, time = $('#time').value, duration = Number($('#duration').value);
    if (!date || !time || !duration) { $('#conflictHint').hidden = true; return; }
    const draft = { id: app.ui.editingAppointmentId, date, time, duration, status: $('#status').value };
    const conflicts = findConflicts(draft), selected = parseDate(date), meta = selected ? dateMeta(selected) : { holiday: null, weekend: false }, messages = [];
    conflicts.forEach(conflict => messages.push(`Chevauche ${conflictDescription(conflict)}.`));
    const workWarning = outsideWorkHours(draft); if (workWarning) messages.push(workWarning);
    if (meta.holiday) messages.push(`Jour férié : ${meta.holiday.label}.`); else if (meta.weekend) messages.push('Ce créneau est un week-end.');
    const warning = addressWarning($('#address').value);
    $('#addressHint').hidden = !warning; $('#addressHint').textContent = warning;
    $('#appointmentWaze').hidden = !$('#address').value.trim();
    $('#conflictHint').hidden = !messages.length; $('#conflictHint').textContent = messages.join(' ');
  }

  function conflictDescription(conflict) {
    if (conflict.type === 'block') return `l’événement personnel « ${blockTitle(conflict.block)} » · ${blockDetailsLabel(conflict.block)}`;
    const appointment = conflict.appointment;
    return `le rendez-vous de ${clientFor(appointment).name} · ${appointment.service} · ${appointment.time}–${endTime(appointment)}`;
  }

  function normalisePhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.startsWith('33') && digits.length === 11 ? `0${digits.slice(2)}` : digits;
  }

  function editDistance(one, two) {
    const left = normaliseName(one), right = normaliseName(two), row = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      let diagonal = row[0]; row[0] = leftIndex;
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const previous = row[rightIndex];
        row[rightIndex] = Math.min(row[rightIndex] + 1, row[rightIndex - 1] + 1, diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1));
        diagonal = previous;
      }
    }
    return row[right.length];
  }

  function similarClient(draft) {
    if (draft.clientId) return null;
    const phone = normalisePhone(draft.phone), name = normaliseName(draft.clientName);
    const byPhone = phone.length >= 8 ? app.state.clients.find(client => normalisePhone(client.phone) === phone) : null;
    if (byPhone) return byPhone;
    return app.state.clients.find(client => {
      const candidate = normaliseName(client.name), longest = Math.max(name.length, candidate.length);
      if (!name || !candidate || longest < 5) return false;
      return editDistance(name, candidate) <= (longest >= 9 ? 2 : 1);
    }) || null;
  }

  function openDuplicateClientDialog(draft, client) {
    app.ui.pendingDuplicate = { draft, clientId: client.id };
    $('#duplicateClientText').textContent = 'Le nom ou le numéro ressemble à une fiche déjà présente.';
    $('#duplicateClientDetails').innerHTML = `<strong>${escapeHtml(client.name)}</strong><span>${escapeHtml(client.phone || 'Sans téléphone')}</span>${client.address ? `<small>${escapeHtml(client.address)}</small>` : ''}`;
    $('#duplicateClientDialog').showModal();
  }

  function commitDraftWithWarnings(draft) {
    const warnings = scheduleWarnings(draft);
    if (warnings.length && !window.confirm(`${warnings.join('\n')}\n\nEnregistrer quand même ?`)) { setAppointmentSaving(false); return false; }
    return commitDraft(draft);
  }

  function continueDraftSubmission(draft) {
    const conflicts = findConflicts(draft);
    if (conflicts.length) { openConflictDialog(draft, conflicts); return; }
    commitDraftWithWarnings(draft);
  }

  function ensureClient(draft, existingAppointment = null) {
    let client = draft.clientId ? clientById(draft.clientId) : null;
    if (!client) { client = { id: uuid(), name: draft.clientName, phone: draft.phone, contactVia: draft.contactVia, address: draft.address, notes: '', badgeId: '', lateBadgePromptDisabled: false, lateBadgePromptLastCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; app.state.clients.push(client); }
    else {
      client.name = draft.clientName; client.phone = draft.phone;
      // L’adresse et la plateforme sont figées dans chaque rendez-vous. Une modification
      // d’un ancien rendez-vous ne doit donc pas réécrire les coordonnées actuelles.
      if (!existingAppointment) { client.contactVia = draft.contactVia; client.address = draft.address; }
      client.updatedAt = new Date().toISOString();
    }
    return client;
  }

  function createRecurringAppointment(appointment, weeks, requestedDate, requestedTime) {
    if (!weeks) return '';
    const date = parseDate(requestedDate); if (!date || !validTime(requestedTime)) return 'Le prochain RDV n’a pas été créé : sa date ou son heure n’est pas valide.';
    const alreadyExists = app.state.appointments.some(item => item.parentAppointmentId === appointment.id && activeAppointment(item));
    if (alreadyExists) return 'Ce prochain RDV existe déjà : aucun doublon n’a été créé.';
    const recurrenceId = appointment.recurrenceId || uuid();
    const createdAt = new Date().toISOString();
    const repeated = { ...appointment, id: uuid(), date: requestedDate, time: requestedTime, supplements: normaliseSupplements(appointment.supplements), status: 'confirmed', paymentStatus: 'unreviewed', paymentDate: '', paymentReminderDate: '', paymentMethod: '', cancellationReason: '', lateCancellation: false, recurrenceId, parentAppointmentId: appointment.id, history: [appointmentHistoryEntry('created', 'Prochain rendez-vous créé', `Depuis le rendez-vous du ${appointment.date}`)], createdAt, updatedAt: createdAt };
    const conflicts = findConflicts(repeated), warnings = scheduleWarnings(repeated);
    if ((conflicts.length || warnings.length) && !window.confirm(`Le prochain RDV du ${format(date, { day: 'numeric', month: 'long' })} à ${repeated.time} demande ton attention.\n${conflicts.length ? 'Il chevauche un rendez-vous ou un événement personnel bloquant.\n' : ''}${warnings.join('\n')}\n\nLe créer quand même ?`)) return 'Le rendez-vous principal est enregistré. Le prochain RDV n’a pas été créé afin que tu puisses choisir un autre jour.';
    appointment.recurrenceId = recurrenceId;
    app.state.appointments.push(repeated); return `Le prochain RDV a été créé le ${format(date, { day: 'numeric', month: 'long' })} avec le statut Confirmé.`;
  }

  function commitDraft(draft) {
    const previousState = cloneState(app.state);
    const existing = app.state.appointments.find(item => item.id === draft.id), previousClient = existing ? previousState.clients.find(item => item.id === existing.clientId) : null, client = ensureClient(draft, existing);
    const createdAt = existing?.createdAt || new Date().toISOString();
    const appointment = { id: draft.id, clientId: client.id, date: draft.date, time: draft.time, duration: draft.duration, price: draft.price, supplements: normaliseSupplements(draft.supplements), service: draft.service, serviceId: draft.serviceId, serviceColor: draft.serviceColor, address: draft.address, contactVia: draft.contactVia, status: draft.status, paymentStatus: draft.paymentStatus, paymentDate: draft.paymentStatus === 'paid' ? draft.paymentDate : '', paymentReminderDate: draft.paymentStatus === 'pending' ? draft.paymentReminderDate : '', paymentMethod: draft.paymentStatus === 'paid' ? draft.paymentMethod : '', notes: draft.notes, cancellationReason: draft.cancellationReason, lateCancellation: draft.lateCancellation === true, recurrenceId: existing?.recurrenceId || '', parentAppointmentId: existing?.parentAppointmentId || '', history: normaliseHistory(existing?.history, createdAt), createdAt, updatedAt: new Date().toISOString() };
    if (!existing) appendAppointmentHistory(appointment, 'created', 'Rendez-vous créé', `${appointment.date} à ${appointment.time}`);
    else {
      if (existing.date !== appointment.date || existing.time !== appointment.time) appendAppointmentHistory(appointment, 'moved', 'Rendez-vous déplacé', `${existing.date} ${existing.time} → ${appointment.date} ${appointment.time}`);
      if (existing.status !== appointment.status) appendAppointmentHistory(appointment, 'status', `Statut : ${STATUS[appointment.status]}`, `Ancien statut : ${STATUS[existing.status]}`);
      if (existing.paymentStatus !== appointment.paymentStatus || existing.paymentDate !== appointment.paymentDate || existing.paymentMethod !== appointment.paymentMethod || existing.paymentReminderDate !== appointment.paymentReminderDate) appendAppointmentHistory(appointment, 'payment', `Paiement : ${PAYMENT[appointment.paymentStatus]}`, appointment.paymentDate ? `Date ${appointment.paymentDate}` : appointment.paymentReminderDate ? `Relance ${appointment.paymentReminderDate}` : '');
      if (existing.service !== appointment.service || existing.duration !== appointment.duration || numericAmount(existing.price) !== numericAmount(appointment.price) || JSON.stringify(normaliseSupplements(existing.supplements)) !== JSON.stringify(normaliseSupplements(appointment.supplements))) appendAppointmentHistory(appointment, 'details', 'Prestation ou tarif modifié');
      const otherChanges = [];
      if (existing.clientId !== appointment.clientId) otherChanges.push('cliente');
      if (existing.address !== appointment.address) otherChanges.push('adresse du rendez-vous');
      if (existing.contactVia !== appointment.contactVia) otherChanges.push('plateforme de contact');
      if (existing.notes !== appointment.notes) otherChanges.push('notes');
      if (existing.cancellationReason !== appointment.cancellationReason) otherChanges.push('motif');
      if (Boolean(existing.lateCancellation) !== appointment.lateCancellation) otherChanges.push('annulation tardive');
      if (previousClient && previousClient.id === client.id && (previousClient.name !== client.name || previousClient.phone !== client.phone)) otherChanges.push('coordonnées cliente');
      if (otherChanges.length) appendAppointmentHistory(appointment, 'update', 'Autres informations modifiées', otherChanges.join(', '));
    }
    const index = app.state.appointments.findIndex(item => item.id === appointment.id); if (index === -1) app.state.appointments.push(appointment); else app.state.appointments[index] = appointment;
    const recurrenceMessage = createRecurringAppointment(appointment, draft.repeatWeeks, draft.repeatDate, draft.repeatTime);
    app.ui.selectedDate = parseDate(appointment.date) || app.ui.selectedDate; app.ui.weekStart = mondayOf(app.ui.selectedDate); app.ui.monthDate = localDate(app.ui.selectedDate.getFullYear(), app.ui.selectedDate.getMonth(), 1);
    if (!saveState()) { app.state = previousState; setAppointmentSaving(false); return false; }
    clearAppointmentDraft(); $('#appointmentDialog').close(); render();
    const moved = existing && (existing.date !== appointment.date || existing.time !== appointment.time), cancelled = existing && existing.status !== appointment.status && ['cancelled', 'no_show'].includes(appointment.status);
    offerUndo(previousState, cancelled ? 'Rendez-vous annulé' : moved ? 'Rendez-vous déplacé' : existing ? 'Rendez-vous modifié' : 'Rendez-vous créé');
    if (recurrenceMessage) window.alert(recurrenceMessage);
    maybePromptLateBadge(client, appointment, existing);
    return true;
  }

  function maybePromptLateBadge(client, appointment, existing) {
    const newlyLate = appointment.status === 'cancelled' && appointment.lateCancellation && !(existing?.status === 'cancelled' && existing?.lateCancellation);
    const count = lateCancellationCount(client.id), threshold = Number(app.state.settings.lateCancellationThreshold) || 3;
    if (!newlyLate || !app.state.settings.clientBadges.length || !app.state.settings.lateCancellationPromptEnabled || client.lateBadgePromptDisabled || count < threshold || Number(client.lateBadgePromptLastCount || 0) >= count) return;
    app.ui.pendingLateBadgeClientId = client.id;
    const currentBadge = clientBadge(client);
    $('#lateBadgeText').textContent = `${client.name} totalise déjà ${count} annulation${count > 1 ? 's' : ''} tardive${count > 1 ? 's' : ''}. Veux-tu lui attribuer un repère de vigilance ?${currentBadge ? ` Son repère actuel « ${currentBadge.name} » sera remplacé si tu valides.` : ''}`;
    const preferred = badgeById('badge-watch') || app.state.settings.clientBadges[0];
    $('#lateBadgeChoice').innerHTML = app.state.settings.clientBadges.map(badge => `<option value="${escapeHtml(badge.id)}">${escapeHtml(badge.emoji || badge.symbol)} ${escapeHtml(badge.name)}</option>`).join('');
    $('#lateBadgeChoice').value = preferred?.id || '';
    $('#lateBadgeDialog').showModal();
  }

  function settleLateBadgePrompt(action) {
    const client = clientById(app.ui.pendingLateBadgeClientId); if (!client) { $('#lateBadgeDialog').close(); return; }
    const previousState = cloneState(app.state), count = lateCancellationCount(client.id);
    if (action === 'apply') client.badgeId = $('#lateBadgeChoice').value;
    if (action === 'disable') client.lateBadgePromptDisabled = true;
    client.lateBadgePromptLastCount = count; client.updatedAt = new Date().toISOString();
    if (!saveState()) { app.state = previousState; return; }
    app.ui.pendingLateBadgeClientId = null; $('#lateBadgeDialog').close(); render();
  }

  function openConflictDialog(draft, conflicts) {
    app.ui.pendingDraft = draft;
    $('#conflictList').innerHTML = conflicts.map(conflict => {
      if (conflict.type === 'block') { const status = blockStatusMeta(conflict.block); return `<article class="conflict-item"><strong>${status.icon} ${status.label}</strong><span>${escapeHtml(conflictDescription(conflict))}</span></article>`; }
      const appointment = conflict.appointment;
      return `<article class="conflict-item"><strong>${escapeHtml(clientFor(appointment).name)}</strong><span>${escapeHtml(appointment.service)} · ${appointment.time} – ${endTime(appointment)}</span></article>`;
    }).join('');
    $('#conflictDialog').showModal();
  }

  function syncBlockAllDay() {
    const allDay = $('#blockAllDay').checked, start = $('#blockAllDayDate'), end = $('#blockAllDayEndDate');
    if (allDay) {
      if (validDate($('#blockStartDate').value)) start.value = $('#blockStartDate').value;
      if (validDate($('#blockEndDate').value) && $('#blockEndDate').value !== start.value) end.value = $('#blockEndDate').value;
      else end.value = '';
    } else if (validDate(start.value)) {
      $('#blockStartDate').value = start.value;
      $('#blockEndDate').value = validDate(end.value) ? end.value : start.value;
    }
    end.min = start.value || '';
    $('#blockTimeFields').hidden = allDay; $('#blockAllDayDateFields').hidden = !allDay;
    ['#blockStartDate', '#blockStartTime', '#blockEndDate', '#blockEndTime'].forEach(selector => { $(selector).disabled = allDay; });
    start.disabled = !allDay; end.disabled = !allDay;
  }

  function syncBlockModePreview() {
    const blocking = $('#blockAppointments')?.checked !== false, target = $('#blockModePreview');
    if (!target) return;
    target.classList.toggle('blocking', blocking); target.classList.toggle('informational', !blocking);
    target.innerHTML = blocking
      ? '<span aria-hidden="true">🔒</span><div><strong>Indisponible</strong><small>Les rendez-vous qui chevauchent seront signalés, sans être interdits.</small></div>'
      : '<span aria-hidden="true">ℹ️</span><div><strong>Information</strong><small>L’événement reste visible mais ne déclenche aucun conflit.</small></div>';
  }

  function resetBlockForm() {
    $('#blockForm').reset(); app.ui.editingBlockId = null; $('#blockId').value = ''; $('#blockAllDay').checked = false; $('#blockAppointments').checked = true; $('#blockAllDayDate').value = dateKey(app.ui.selectedDate); $('#blockAllDayEndDate').value = ''; $('#blockStartDate').value = dateKey(app.ui.selectedDate); $('#blockEndDate').value = dateKey(app.ui.selectedDate); $('#blockStartTime').value = '09:00'; $('#blockEndTime').value = '10:00'; $('#blockAddress').value = ''; $('#blockNotes').value = ''; $('#blockValidation').hidden = true; $('#deleteBlock').hidden = true; setBlockSaving(false); syncBlockAllDay(); syncBlockModePreview();
  }

  function openBlock(block = null, defaults = {}) {
    resetBlockForm();
    $('#blockFormTitle').textContent = block ? 'Modifier l’événement personnel' : 'Nouvel événement personnel';
    if (block) {
      app.ui.editingBlockId = block.id; $('#blockId').value = block.id; $('#blockAllDay').checked = block.allDay; $('#blockAppointments').checked = eventBlocksAppointments(block); $('#blockAllDayDate').value = block.startDate; $('#blockAllDayEndDate').value = block.endDate !== block.startDate ? block.endDate : ''; $('#blockStartDate').value = block.startDate; $('#blockEndDate').value = block.endDate; $('#blockStartTime').value = block.startTime; $('#blockEndTime').value = block.endTime; $('#blockReason').value = blockTitle(block); $('#blockAddress').value = block.address || ''; $('#blockNotes').value = block.notes || ''; $('#deleteBlock').hidden = false; syncBlockAllDay(); syncBlockModePreview();
    } else {
      const date = validDate(defaults.date) ? defaults.date : dateKey(app.ui.selectedDate), time = validTime(defaults.time) ? defaults.time : '09:00';
      $('#blockId').value = uuid(); $('#blockAllDayDate').value = date; $('#blockAllDayEndDate').value = ''; $('#blockStartDate').value = date; $('#blockEndDate').value = date; $('#blockStartTime').value = time; $('#blockEndTime').value = timeText(toMinutes(time) + 60);
    }
    $('#blockSubmitButton').textContent = block ? 'Enregistrer les modifications' : 'Ajouter l’événement';
    app.ui.blockDraftBaseline = JSON.stringify(blockDraft());
    $('#blockDialog').showModal(); captureFormBaseline('blockDialog');
  }

  function openQuickAdd(date = dateKey(app.ui.selectedDate), time = '10:00') {
    app.ui.quickAddDate = validDate(date) ? date : dateKey(app.ui.selectedDate);
    app.ui.quickAddTime = validTime(time) ? time : '10:00';
    const parsed = parseDate(app.ui.quickAddDate);
    $('#quickAddWhen').textContent = `${format(parsed, { weekday: 'long', day: 'numeric', month: 'long' })} à ${app.ui.quickAddTime}`;
    $('#quickAddDialog').showModal();
  }

  function blockDraft() {
    const allDay = $('#blockAllDay').checked, startDate = allDay ? $('#blockAllDayDate').value : $('#blockStartDate').value;
    const endDate = allDay ? ($('#blockAllDayEndDate').value || startDate) : $('#blockEndDate').value;
    return { id: app.ui.editingBlockId || $('#blockId').value || uuid(), allDay, startDate, startTime: allDay ? '00:00' : $('#blockStartTime').value, endDate, endTime: allDay ? '00:00' : $('#blockEndTime').value, reason: $('#blockReason').value.trim(), blocksAppointments: $('#blockAppointments').checked, address: $('#blockAddress').value.trim(), notes: $('#blockNotes').value.trim() };
  }

  function activeAppointmentsOverlappingBlock(block) {
    if (!eventBlocksAppointments(block)) return [];
    const bounds = blockBounds(block);
    return app.state.appointments.filter(appointment => activeAppointment(appointment) && intersects(bounds.start, bounds.end, appointmentStart(appointment), appointmentEnd(appointment))).sort((a, b) => appointmentTimestamp(a) - appointmentTimestamp(b));
  }

  function needsBlockConflictCheck(block, previous) {
    if (!eventBlocksAppointments(block)) return false;
    if (!previous || !eventBlocksAppointments(previous)) return true;
    const next = blockBounds(block), before = blockBounds(previous);
    return next.start !== before.start || next.end !== before.end;
  }

  function openBlockConflictDialog(block, overlaps) {
    app.ui.pendingBlockConflict = block;
    $('#blockConflictList').innerHTML = overlaps.map(appointment => `<article class="conflict-item"><strong>${escapeHtml(clientFor(appointment).name)}</strong><span>${escapeHtml(appointment.service)} · ${format(parseDate(appointment.date), { day: 'numeric', month: 'short' })} · ${appointment.time}–${endTime(appointment)}</span></article>`).join('');
    $('#blockConflictDialog').showModal();
  }

  function commitBlock(block) {
   const previousState = cloneState(app.state), index = app.state.blocks.findIndex(item => item.id === block.id);
    const now = new Date().toISOString(), existing = index >= 0 ? app.state.blocks[index] : null;
    const clean = normaliseBlock({ ...block, createdAt: existing?.createdAt || now, updatedAt: now }); if (!clean) { setBlockSaving(false); return false; }
    if (index === -1) app.state.blocks.push(clean); else app.state.blocks[index] = clean;
    if (!saveState()) { app.state = previousState; setBlockSaving(false); return false; }
    app.ui.selectedDate = parseDate(clean.startDate) || app.ui.selectedDate; app.ui.weekStart = mondayOf(app.ui.selectedDate); app.ui.monthDate = localDate(app.ui.selectedDate.getFullYear(), app.ui.selectedDate.getMonth(), 1);
    clearFormDraft('block'); $('#blockDialog').close(); render(); offerUndo(previousState, index === -1 ? 'Événement personnel ajouté' : 'Événement personnel modifié');
    return true;
  }

  function saveBlock() {
    if (app.ui.blockSaving) return;
    setBlockSaving(true);
    const block = blockDraft(), validation = $('#blockValidation');
    let error = '';
    if (!block.reason) error = 'Donne un titre à cet événement personnel.';
    else if (!validDate(block.startDate)) error = block.allDay ? 'Choisis la date de début.' : 'Choisis la date et l’heure de début.';
    else if (!validDate(block.endDate) || (block.allDay && block.endDate < block.startDate)) error = 'Le jour de fin doit être identique ou postérieur au jour de début.';
    else if (!block.allDay && (!validTime(block.startTime) || !validTime(block.endTime) || dateTimeMs(block.endDate, block.endTime) <= dateTimeMs(block.startDate, block.startTime))) error = 'La fin doit être après le début du créneau.';
    if (error) { validation.hidden = false; validation.textContent = error; setBlockSaving(false); return; }
    const existing = app.state.blocks.find(item => item.id === block.id), overlaps = needsBlockConflictCheck(block, existing) ? activeAppointmentsOverlappingBlock(block) : [];
    if (overlaps.length) { openBlockConflictDialog(block, overlaps); return; }
    commitBlock(block);
  }

  function populateExpenseCategorySelect(selectedId = '') {
    const target = $('#expenseCategory'); if (!target) return;
    const selected = expenseCategoryById(selectedId), categories = app.state.settings.expenseCategories.filter(category => category.active || category.id === selected?.id);
    target.innerHTML = categories.map(category => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}${category.active ? '' : ' · ancienne catégorie'}</option>`).join('');
    target.value = selected?.id || categories[0]?.id || '';
  }

  function setExpenseSaving(value) {
    app.ui.expenseSaving = Boolean(value);
    const submit = $('#expenseSubmitButton');
    if (submit) { submit.disabled = app.ui.expenseSaving; submit.textContent = app.ui.expenseSaving ? 'Enregistrement…' : (app.ui.editingExpenseId ? 'Enregistrer les modifications' : 'Ajouter la dépense'); }
  }

  function resetExpenseForm(defaults = {}) {
    $('#expenseForm').reset(); app.ui.editingExpenseId = null; $('#expenseId').value = uuid(); populateExpenseCategorySelect(); $('#expenseDate').value = validDate(defaults.date) ? defaults.date : todayKey(); $('#expenseValidation').hidden = true; $('#deleteExpense').hidden = true; setExpenseSaving(false);
  }

  function openExpense(expense = null, defaults = {}) {
    resetExpenseForm(defaults);
    $('#expenseFormTitle').textContent = expense ? 'Modifier la dépense' : 'Nouvelle dépense';
    if (expense) {
      app.ui.editingExpenseId = expense.id; $('#expenseId').value = expense.id; populateExpenseCategorySelect(expense.categoryId); $('#expenseDetails').value = expense.details || ''; $('#expenseSupplier').value = expense.supplier || ''; $('#expenseDate').value = expense.date; $('#expenseAmount').value = String(numericAmount(expense.amount)); $('#deleteExpense').hidden = false;
    }
    $('#expenseSubmitButton').textContent = expense ? 'Enregistrer les modifications' : 'Ajouter la dépense';
    app.ui.expenseDraftBaseline = expenseDraftSignature(expenseDraftValues()); $('#expenseDialog').showModal(); captureFormBaseline('expenseDialog');
  }

  function saveExpense() {
    if (app.ui.expenseSaving || !$('#expenseForm').reportValidity()) return false;
    setExpenseSaving(true);
    const values = expenseDraftValues(), validation = $('#expenseValidation'), rawAmount = Number(String(values.amount).replace(',', '.'));
    let error = '';
    if (!expenseCategoryById(values.categoryId)) error = 'Choisis une catégorie de dépense.';
    else if (!validDate(values.date)) error = 'Choisis une date valide.';
    else if (!Number.isFinite(rawAmount) || rawAmount <= 0 || rawAmount > LIMITS.amount) error = 'Saisis un montant supérieur à 0 €.';
    if (error) { validation.textContent = error; validation.hidden = false; setExpenseSaving(false); return false; }
    const existing = app.state.expenses.find(expense => expense.id === values.id), category = expenseCategoryById(values.categoryId), now = new Date().toISOString();
    const record = normaliseExpenses([{ id: values.id || uuid(), categoryId: category.id, categoryLabel: category.name, details: values.details, supplier: values.supplier, date: values.date, amount: rawAmount, createdAt: existing?.createdAt || now, updatedAt: now }], app.state.settings.expenseCategories)[0];
    if (!record) { validation.textContent = 'Cette dépense ne peut pas être enregistrée. Vérifie les informations.'; validation.hidden = false; setExpenseSaving(false); return false; }
    const previousState = cloneState(app.state), index = app.state.expenses.findIndex(expense => expense.id === record.id);
    if (index === -1) app.state.expenses.push(record); else app.state.expenses[index] = record;
    if (!saveState()) { app.state = previousState; setExpenseSaving(false); return false; }
    app.ui.editingExpenseId = null; clearFormDraft('expense'); $('#expenseDialog').close(); render(); offerUndo(previousState, index === -1 ? 'Dépense enregistrée' : 'Dépense modifiée');
    return true;
  }

  function deleteExpense(id = app.ui.editingExpenseId || $('#expenseId')?.value) {
    const expense = app.state.expenses.find(item => item.id === id); if (!expense || !window.confirm('Supprimer cette dépense ?')) return false;
    const previousState = cloneState(app.state); app.state.expenses = app.state.expenses.filter(item => item.id !== expense.id);
    if (!saveState()) { app.state = previousState; return false; }
    app.ui.editingExpenseId = null; clearFormDraft('expense'); if ($('#expenseDialog').open) $('#expenseDialog').close(); render(); offerUndo(previousState, 'Dépense supprimée');
    return true;
  }

  function renderExpenseCategoryList() {
    const target = $('#expenseCategoryList'); if (!target) return;
    target.innerHTML = app.state.settings.expenseCategories.map(category => {
      const count = app.state.expenses.filter(expense => expense.categoryId === category.id).length;
      return `<button class="settings-service ${category.active ? '' : 'inactive'}" data-edit-expense-category="${escapeHtml(category.id)}"><span class="settings-symbol">€</span><span><strong>${escapeHtml(category.name)}</strong><small>${count} dépense${count > 1 ? 's' : ''}${category.active ? '' : ' · masquée'}</small></span><b>›</b></button>`;
    }).join('');
  }

  function resetExpenseCategoryForm() {
    $('#expenseCategoryForm').reset(); $('#expenseCategoryId').value = ''; $('#deleteExpenseCategory').hidden = true; $('#expenseCategorySubmit').textContent = 'Ajouter la catégorie'; captureFormBaseline('expenseCategoriesDialog');
  }

  function openExpenseCategories() {
    renderExpenseCategoryList(); resetExpenseCategoryForm(); $('#expenseCategoriesDialog').showModal(); captureFormBaseline('expenseCategoriesDialog');
  }

  function editExpenseCategory(categoryId) {
    const category = expenseCategoryById(categoryId); if (!category) return;
    $('#expenseCategoryId').value = category.id; $('#expenseCategoryName').value = category.name; $('#deleteExpenseCategory').hidden = false; $('#expenseCategorySubmit').textContent = category.active ? 'Enregistrer le nom' : 'Réactiver et enregistrer'; captureFormBaseline('expenseCategoriesDialog');
  }

 function saveExpenseCategory() {
   if (!$('#expenseCategoryForm').reportValidity()) return false;
   const id = $('#expenseCategoryId').value || uuid(), name = boundedText($('#expenseCategoryName').value, 100);
    if (!name) { window.alert('Donne un nom à cette catégorie.'); $('#expenseCategoryName').focus(); return false; }
    if (app.state.settings.expenseCategories.some(category => category.id !== id && normaliseName(category.name) === normaliseName(name))) { window.alert('Cette catégorie existe déjà.'); return false; }
    const index = app.state.settings.expenseCategories.findIndex(category => category.id === id);
    if (index === -1 && app.state.settings.expenseCategories.length >= LIMITS.settingsItems) { window.alert('Le nombre maximal de catégories est atteint.'); return false; }
    const previousState = cloneState(app.state), record = { id, name, active: true };
    if (index === -1) app.state.settings.expenseCategories.push(record);
    else {
      app.state.settings.expenseCategories[index] = record;
      app.state.expenses.forEach(expense => { if (expense.categoryId === id) expense.categoryLabel = name; });
    }
    if (!saveState()) { app.state = previousState; return false; }
    clearFormDraft('expenseCategory'); populateExpenseCategorySelect($('#expenseCategory').value || id); renderExpenseCategoryList(); resetExpenseCategoryForm(); showSuccess(index === -1 ? 'Catégorie ajoutée' : 'Catégorie mise à jour');
    return true;
  }

 function deleteExpenseCategory() {
   const id = $('#expenseCategoryId').value, category = expenseCategoryById(id); if (!category) return false;
    const selectedExpenseCategoryId = $('#expenseCategory').value;
    const used = app.state.expenses.some(expense => expense.categoryId === id), activeCount = app.state.settings.expenseCategories.filter(item => item.active).length;
    if (category.active && activeCount <= 1) { window.alert('Garde au moins une catégorie disponible.'); return false; }
    const wording = used ? 'Cette catégorie est déjà utilisée. La masquer pour les prochaines dépenses ?' : 'Supprimer cette catégorie ?';
    if (!window.confirm(wording)) return false;
    const previousState = cloneState(app.state);
    if (used) category.active = false; else app.state.settings.expenseCategories = app.state.settings.expenseCategories.filter(item => item.id !== id);
    if (!saveState()) { app.state = previousState; return false; }
    clearFormDraft('expenseCategory'); populateExpenseCategorySelect(selectedExpenseCategoryId); renderExpenseCategoryList(); resetExpenseCategoryForm(); showSuccess(used ? 'Catégorie masquée' : 'Catégorie supprimée');
    return true;
  }

  function openRouteDay() {
    const routes = routeEntriesForDate(app.ui.selectedDate);
    $('#routeDate').textContent = format(app.ui.selectedDate, { weekday: 'long', day: 'numeric', month: 'long' });
    $('#routeList').innerHTML = routes.length ? routes.map(route => `<article class="route-item"><span class="route-time">${route.time}</span><span><strong>${escapeHtml(route.title)}</strong><small>${escapeHtml(route.address)}</small></span><button class="route-icon" data-waze="${encodeURIComponent(route.address)}" aria-label="Itinéraire">⌖</button></article>`).join('') : '<p class="empty-route">Aucune adresse enregistrée ce jour-là.</p>';
    $('#routeDialog').showModal();
  }

  function openTodo(type) {
    const items = type === 'confirm' ? pendingConfirmations() : pendingPayments();
    $('#todoTitle').textContent = type === 'confirm' ? 'Rendez-vous à confirmer' : 'Paiements à relancer';
    $('#todoList').innerHTML = items.length ? items.map(appointment => {
      const client = clientFor(appointment), details = `${format(parseDate(appointment.date), { weekday: 'short', day: 'numeric', month: 'short' })} · ${appointment.time} · ${escapeHtml(appointment.service)}`;
      if (type === 'payments') return `<article class="todo-payment-item"><button class="todo-item-main" data-edit="${escapeHtml(appointment.id)}"><span><strong>Relancer « ${escapeHtml(client.name)} »</strong><small>${details} · relance ${format(parseDate(appointment.paymentReminderDate), { day: 'numeric', month: 'short' })}</small></span><b>${money(appointmentTotal(appointment)) || 'À définir'}</b></button><button class="todo-paid-button" data-reminder-paid="${escapeHtml(appointment.id)}">✓ Payé aujourd’hui</button></article>`;
      return `<button class="todo-item" data-edit="${escapeHtml(appointment.id)}"><span><strong>${escapeHtml(client.name)}</strong><small>${details}</small></span><b>›</b></button>`;
    }).join('') : '<p class="empty-route">Rien à faire pour le moment.</p>';
    if (!$('#todoDialog').open) $('#todoDialog').showModal();
  }

  function openDayReview(date = app.ui.selectedDate) {
    app.ui.reviewDate = startOfDay(date); app.ui.reviewPendingId = null; app.ui.reviewFinancialDraft = null;
    renderDayReview(); $('#dayReviewDialog').showModal();
  }

  function reviewSupplementsFromForm(keepEmpty = false) {
    return $$('#reviewSupplementRows .supplement-row').map(row => {
      const select = row.querySelector('[data-review-supplement-type]'), input = row.querySelector('[data-review-supplement-amount]'), type = supplementTypeById(select?.value);
      return { id: row.dataset.supplementId || uuid(), typeId: type?.id || '', label: type?.name || row.dataset.fallbackLabel || 'Supplément', amount: numericAmount(input?.value) };
    }).filter(item => keepEmpty || item.amount > 0);
  }

  function renderReviewSupplementRows(items = []) {
    const target = $('#reviewSupplementRows'); if (!target) return;
    target.innerHTML = normaliseSupplements(items).map(item => {
      const current = supplementTypeById(item.typeId), types = app.state.settings.supplementTypes.filter(type => type.active || type.id === current?.id);
      const legacy = !current && item.label ? `<option value="" selected>${escapeHtml(item.label)} · ancienne nature</option>` : '';
      return `<div class="supplement-row" data-supplement-id="${escapeHtml(item.id)}" data-fallback-label="${escapeHtml(item.label)}"><label>Nature<select data-review-supplement-type>${legacy}${types.map(type => `<option value="${escapeHtml(type.id)}" ${type.id === item.typeId ? 'selected' : ''}>${escapeHtml(type.name)}</option>`).join('')}</select></label><label>Montant (€)<input data-review-supplement-amount type="number" min="0" max="1000000" step="0.01" inputmode="decimal" value="${item.amount || ''}"></label><button type="button" class="remove-supplement" data-remove-review-supplement="${escapeHtml(item.id)}" aria-label="Supprimer ce supplément">×</button></div>`;
    }).join('');
    updateReviewFinancialTotal();
  }

  function updateReviewFinancialTotal() {
    const target = $('#reviewFinancialTotal'); if (!target) return;
    const total = numericAmount($('#reviewFinancialPrice')?.value) + reviewSupplementsFromForm().reduce((sum, item) => sum + item.amount, 0);
    target.textContent = `Total : ${money(total) || '0 €'}`;
  }

  function addReviewSupplementRow() {
    const active = app.state.settings.supplementTypes.find(type => type.active) || app.state.settings.supplementTypes[0];
    if (!active) { window.alert('Ajoute d’abord une nature de supplément dans les réglages.'); return; }
    renderReviewSupplementRows([...reviewSupplementsFromForm(true), { id: uuid(), typeId: active.id, label: active.name, amount: numericAmount(active.price) }]);
    $('#reviewSupplementRows .supplement-row:last-child [data-review-supplement-amount]')?.focus();
  }

  function applyReviewSupplementDefaultPrice(select) {
    const row = select?.closest?.('.supplement-row'), type = supplementTypeById(select?.value), amount = row?.querySelector?.('[data-review-supplement-amount]');
    if (!row || !type || !amount) return;
    row.dataset.fallbackLabel = type.name; amount.value = type.price === '' ? '' : String(numericAmount(type.price)); updateReviewFinancialTotal();
  }

  function openReviewFinancialEditor(appointmentId) {
    const appointment = app.state.appointments.find(item => item.id === appointmentId); if (!appointment) return;
    const client = clientFor(appointment);
    app.ui.reviewFinancialDraft = { appointmentId };
    $('#reviewFinancialAppointmentId').value = appointment.id; $('#reviewFinancialPrice').value = appointment.price ?? '';
    $('#reviewFinancialClient').textContent = `${client.name} · ${appointment.service} · ${appointment.time}–${endTime(appointment)}`;
    renderReviewSupplementRows(appointment.supplements);
    $('#reviewFinancialDialog').showModal(); captureFormBaseline('reviewFinancialDialog');
  }

  function saveReviewFinancials(appointmentId, suppliedPrice, suppliedSupplements) {
    const appointment = app.state.appointments.find(item => item.id === appointmentId); if (!appointment) return false;
    const usingForm = suppliedPrice === undefined && suppliedSupplements === undefined;
    if (usingForm && !$('#reviewFinancialForm').reportValidity()) return false;
    const rawPrice = usingForm ? $('#reviewFinancialPrice')?.value : suppliedPrice;
    const price = rawPrice === '' || rawPrice === null || rawPrice === undefined ? '' : String(numericAmount(rawPrice));
    const supplements = normaliseSupplements(usingForm ? reviewSupplementsFromForm() : suppliedSupplements);
    const previousSupplements = normaliseSupplements(appointment.supplements);
    if (price === appointment.price && JSON.stringify(supplements) === JSON.stringify(previousSupplements)) {
      app.ui.reviewFinancialDraft = null;
      if (usingForm && $('#reviewFinancialDialog')?.open) closeDialogNow('reviewFinancialDialog');
      return true;
    }
    const beforeTotal = appointmentTotal(appointment), previousState = cloneState(app.state);
    appointment.price = price; appointment.supplements = supplements; appointment.updatedAt = new Date().toISOString();
    appendAppointmentHistory(appointment, 'financial', 'Tarif ajusté en fin de journée', `${money(beforeTotal) || '0 €'} → ${money(appointmentTotal(appointment)) || '0 €'}`);
    if (!saveState()) { app.state = previousState; return false; }
    offerUndo(previousState, 'Tarif du rendez-vous ajusté');
    app.ui.reviewFinancialDraft = null; render();
    if ($('#dayReviewDialog')?.open) renderDayReview();
    if (usingForm && $('#reviewFinancialDialog')?.open) closeDialogNow('reviewFinancialDialog');
    return true;
  }

  function renderDayReview() {
    const key = dateKey(app.ui.reviewDate), appointments = appointmentsForDate(key), active = appointments.filter(activeAppointment);
    $('#reviewDateLabel').textContent = format(app.ui.reviewDate, { weekday: 'long', day: 'numeric', month: 'long' });
    const paidCount = active.filter(appointment => appointment.paymentStatus === 'paid').length;
    const pendingCount = active.filter(appointment => appointment.paymentStatus === 'pending').length;
    const reviewCount = active.filter(appointment => appointment.paymentStatus === 'unreviewed').length;
    $('#reviewDaySummary').innerHTML = `<span><strong>${active.length}</strong> RDV actif${active.length > 1 ? 's' : ''}</span><span><strong>${paidCount}</strong> payé${paidCount > 1 ? 's' : ''}</span><span><strong>${pendingCount}</strong> à régler</span><span class="review-summary"><strong>${reviewCount}</strong> à vérifier</span>`;
    $('#reviewAppointmentList').innerHTML = appointments.length ? appointments.map(appointment => {
      const client = clientFor(appointment), inactive = !activeAppointment(appointment), chooseReminder = !inactive && (appointment.paymentStatus === 'pending' || app.ui.reviewPendingId === appointment.id);
      const paymentControls = inactive ? `<span class="review-inactive">${STATUS[appointment.status]}</span>` : `<button class="review-adjust-button" data-review-adjust="${escapeHtml(appointment.id)}">✎ Ajuster prix et suppléments</button><div class="review-payment-actions"><button class="${appointment.paymentStatus === 'paid' ? 'active' : ''}" data-review-paid="${escapeHtml(appointment.id)}">✓ Payé</button><button class="${appointment.paymentStatus === 'pending' ? 'active' : ''}" data-review-pending="${escapeHtml(appointment.id)}">À régler</button></div>${chooseReminder ? `<div class="review-reminder-editor"><label>Date de relance<input type="date" data-review-reminder="${escapeHtml(appointment.id)}" value="${escapeHtml(appointment.paymentReminderDate || '')}"></label><button data-review-save="${escapeHtml(appointment.id)}">Enregistrer la relance</button></div>` : ''}`;
      return `<article class="review-appointment ${inactive ? 'inactive' : ''}"><div class="review-appointment-heading"><button data-edit="${escapeHtml(appointment.id)}"><span>${appointment.time} – ${endTime(appointment)}</span><strong>${badgeHtml(client, 'small')}${escapeHtml(client.name)}</strong><small>${escapeHtml(appointment.service)}${appointmentTotal(appointment) ? ` · ${money(appointmentTotal(appointment))}` : ''}</small></button><span class="service-dot ${appointment.serviceColor || 'rose'}"></span></div>${paymentControls}</article>`;
    }).join('') : '<section class="empty-message"><h2>Aucun rendez-vous</h2><p>Il n’y a rien à vérifier pour cette journée.</p></section>';
  }

  function markAppointmentPaid(appointmentId, paymentDate) {
    const appointment = app.state.appointments.find(item => item.id === appointmentId); if (!appointment) return;
    if (appointment.paymentStatus === 'paid' && appointment.paymentDate === paymentDate && !appointment.paymentReminderDate) return;
    const previousState = cloneState(app.state); appointment.paymentStatus = 'paid'; appointment.paymentDate = paymentDate; appointment.paymentReminderDate = ''; appointment.updatedAt = new Date().toISOString(); appendAppointmentHistory(appointment, 'payment', 'Paiement marqué comme payé', `Date ${paymentDate}`);
    if (!saveState()) { app.state = previousState; return; }
    offerUndo(previousState, 'Paiement marqué comme payé');
    app.ui.reviewPendingId = null; render();
    if ($('#dayReviewDialog').open) renderDayReview();
    if ($('#todoDialog').open) openTodo('payments');
  }

  function savePaymentReminder(appointmentId, reminderDate) {
    if (!validDate(reminderDate)) { window.alert('Choisis une date de relance valide.'); return; }
    const appointment = app.state.appointments.find(item => item.id === appointmentId); if (!appointment) return;
    if (appointment.paymentStatus === 'pending' && appointment.paymentReminderDate === reminderDate && !appointment.paymentDate) return;
    const previousState = cloneState(app.state); appointment.paymentStatus = 'pending'; appointment.paymentDate = ''; appointment.paymentMethod = ''; appointment.paymentReminderDate = reminderDate; appointment.updatedAt = new Date().toISOString(); appendAppointmentHistory(appointment, 'payment', 'Paiement à relancer', `Relance ${reminderDate}`);
    if (!saveState()) { app.state = previousState; return; }
    offerUndo(previousState, 'Relance de paiement enregistrée');
    app.ui.reviewPendingId = null; render(); renderDayReview();
  }

 function clientStats(clientId) {
    const history = clientHistory(clientId), visits = history.filter(activeAppointment), paid = visits.filter(appointment => appointment.paymentStatus === 'paid').reduce((sum, appointment) => sum + appointmentTotal(appointment), 0);
    return { visits: visits.length, cancelled: history.filter(appointment => appointment.status === 'cancelled').length, late: lateCancellationCount(clientId), noShows: history.filter(appointment => appointment.status === 'no_show').length, paid };
 }

  function syncProfileBadgeSummary(expanded = false) {
    const badge = badgeById($('#profileBadge').value);
    $('#profileBadgeField').hidden = Boolean(badge) && !expanded;
    $('#profileBadgeSummary').hidden = !badge || expanded;
    if (badge) $('#profileBadgeSummaryText').textContent = `${badge.emoji || badge.symbol} ${badge.name}`;
  }

 function openClient(clientId) {
    const client = clientById(clientId); if (!client) return;
    app.ui.clientSaving = false;
   $('#profileKey').value = client.id; $('#profileName').value = client.name; $('#profilePhone').value = client.phone; $('#profileContactVia').value = client.contactVia || ''; $('#profileBadge').innerHTML = `<option value="">Aucun repère</option>${app.state.settings.clientBadges.map(badge => `<option value="${escapeHtml(badge.id)}">${escapeHtml(badge.emoji || badge.symbol)} ${escapeHtml(badge.name)}</option>`).join('')}`; $('#profileBadge').value = client.badgeId || ''; $('#profileAddress').value = client.address; $('#profileNotes').value = client.notes; $('#profileWaze').hidden = !client.address;
    syncProfileBadgeSummary(false);
    const stats = clientStats(client.id), history = clientHistory(client.id).slice(0, 12);
    $('#clientStats').innerHTML = `<article><strong>${stats.visits}</strong><span>RDV</span></article><article><strong>${stats.cancelled}</strong><span>annulé${stats.cancelled > 1 ? 's' : ''}</span></article><article><strong>${stats.late}</strong><span>tardive${stats.late > 1 ? 's' : ''}</span></article><article><strong>${stats.noShows}</strong><span>absence${stats.noShows > 1 ? 's' : ''}</span></article>${stats.paid ? `<article><strong>${money(stats.paid)}</strong><span>encaissé</span></article>` : ''}`;
    $('#clientHistory').innerHTML = `<p class="history-label">Historique</p>${history.length ? history.map(appointment => `<article class="history-item"><span><strong>${format(parseDate(appointment.date), { day: 'numeric', month: 'short' })} · ${escapeHtml(appointment.service)}</strong><small>${appointment.time} · ${STATUS[appointment.status]}${appointmentTotal(appointment) ? ` · ${money(appointmentTotal(appointment))}` : ''}${appointment.supplements?.length ? ` · ${appointment.supplements.length} supplément${appointment.supplements.length > 1 ? 's' : ''}` : ''}${activeAppointment(appointment) && appointment.paymentStatus === 'unreviewed' ? ' · À vérifier' : ''}${appointment.paymentStatus === 'pending' && activeAppointment(appointment) ? ` · À régler${validDate(appointment.paymentReminderDate) ? ` · relance ${format(parseDate(appointment.paymentReminderDate), { day: 'numeric', month: 'short' })}` : ''}` : ''}${appointment.lateCancellation ? ' · Annulation tardive' : ''}${appointment.cancellationReason ? ` · ${escapeHtml(appointment.cancellationReason)}` : ''}</small></span><button type="button" class="small-reuse" data-repeat-from="${escapeHtml(appointment.id)}">↻ Reprendre</button></article>`).join('') : '<p class="small-copy">Aucun rendez-vous enregistré.</p>'}`;
    app.ui.clientDraftBaseline = JSON.stringify(clientDraftValues()); $('#clientDialog').showModal(); captureFormBaseline('clientDialog');
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

  function renderSettingsSupplementList() {
    $('#settingsSupplementList').innerHTML = app.state.settings.supplementTypes.map(type => `<button class="settings-service ${type.active ? '' : 'inactive'}" data-edit-supplement-type="${escapeHtml(type.id)}"><span class="settings-symbol">＋</span><span><strong>${escapeHtml(type.name)}</strong><small>${type.price !== '' ? money(type.price) : 'Prix à définir'}${type.active ? ' · disponible' : ' · masquée'}</small></span><b>›</b></button>`).join('') || '<p class="small-copy">Aucune nature de supplément.</p>';
  }

 function renderSettingsBadgeList() {
    $('#settingsBadgeList').innerHTML = app.state.settings.clientBadges.map(badge => `<button class="settings-service" data-edit-badge="${escapeHtml(badge.id)}"><span class="client-badge">${escapeHtml(badge.emoji || badge.symbol)}</span><span><strong>${escapeHtml(badge.name)}</strong><small>${app.state.clients.filter(client => client.badgeId === badge.id).length} cliente(s)</small></span><b>›</b></button>`).join('') || '<p class="small-copy">Aucun repère. Tu peux en recréer un avec « Ajouter ».</p>';
 }

  function renderSettingsHome() {
    const workingDays = Object.values(app.state.settings.workingHours).filter(hours => hours.enabled).length;
    $('#settingsAgendaSummary').textContent = `${workingDays} jour${workingDays > 1 ? 's' : ''} travaillé${workingDays > 1 ? 's' : ''}`;
    $('#settingsServicesSummary').textContent = `${app.state.settings.services.filter(service => service.active).length} prestation(s) disponible(s)`;
    $('#settingsSupplementsSummary').textContent = `${app.state.settings.supplementTypes.filter(type => type.active).length} nature(s) disponible(s)`;
    $('#settingsClientsSummary').textContent = `${app.state.settings.clientBadges.length} repère(s) · seuil ${app.state.settings.lateCancellationThreshold}`;
   const last = app.state.settings.lastBackupAt ? new Date(app.state.settings.lastBackupAt) : null;
    const exportLabel = last && !Number.isNaN(last.getTime()) ? `dernier export ${format(last, { day: 'numeric', month: 'short' })}` : 'aucun export';
    $('#settingsDataSummary').textContent = `${exportLabel} · rappel après ${app.state.settings.backupReminderDays} jours`;
  }

  function renderBackupStatus() {
    const target = $('#backupStatus');
    if (!target) return;
    const last = app.state.settings.lastBackupAt ? new Date(app.state.settings.lastBackupAt) : null;
    target.textContent = last && !Number.isNaN(last.getTime())
      ? `Dernière sauvegarde exportée : ${format(last, { day: 'numeric', month: 'long', year: 'numeric' })}`
      : 'Aucune sauvegarde exportée.';
  }

  function showSettingsPage(page = 'home', force = false) {
    if (!force && app.ui.settingsDirty) { requestSettingsPageChange(page); return false; }
    app.ui.settingsDirty = false; app.ui.settingsPage = page;
    $('#settingsHome').hidden = page !== 'home'; $('#settingsBack').hidden = page === 'home';
    $$('[data-settings-content]').forEach(section => { section.hidden = section.dataset.settingsContent !== page; });
    const labels = { agenda: 'Agenda et horaires', services: 'Prestations et tarifs', supplements: 'Suppléments', clients: 'Clientes et repères', data: 'Données et sauvegardes', about: 'À propos' };
    $('#settingsTitle').textContent = page === 'home' ? 'Réglages' : labels[page] || 'Réglages';
    if (page === 'agenda') renderWorkingHoursEditor();
    if (page === 'services') renderSettingsServiceList();
    if (page === 'supplements') renderSettingsSupplementList();
    if (page === 'clients') { renderSettingsBadgeList(); $('#lateCancellationThreshold').value = String(app.state.settings.lateCancellationThreshold); $('#lateCancellationPromptEnabled').checked = app.state.settings.lateCancellationPromptEnabled; }
    if (page === 'data') { $('#backupReminderDays').value = String(app.state.settings.backupReminderDays); updateStorageStatus(); }
    return true;
  }

  function openSettings() {
    renderSettingsHome(); renderWorkingHoursEditor(); renderSettingsServiceList(); renderSettingsSupplementList(); renderSettingsBadgeList();
    renderBackupStatus();
    $('#appVersionLabel').textContent = `Mon agenda · version ${APP_VERSION}`;
    $('#aboutVersion').textContent = `Version ${APP_VERSION} · données v${CURRENT_DATA_VERSION}`;
    $('#undoRestore').hidden = !safeJson(RESTORE_SAFETY_KEY, null) && !safeJson(V13_RESTORE_SAFETY_KEY, null) && !safeJson(V12_RESTORE_SAFETY_KEY, null) && !safeJson(V11_RESTORE_SAFETY_KEY, null) && !safeJson(V10_RESTORE_SAFETY_KEY, null) && !safeJson(V9_RESTORE_SAFETY_KEY, null) && !safeJson(V8_RESTORE_SAFETY_KEY, null);
    $('#undoMigration').hidden = !safeJson(MIGRATION_SAFETY_KEY, null);
    showSettingsPage('home', true); $('#settingsDialog').showModal();
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.screen === 'settings'));
  }

  function setWeekdayHoursInEditor() {
    for (let day = 0; day < 7; day += 1) {
      $(`#workEnabled-${day}`).checked = day >= 1 && day <= 5; $(`#workStart-${day}`).value = '09:00'; $(`#workEnd-${day}`).value = '19:00'; $(`#workBreakStart-${day}`).value = ''; $(`#workBreakEnd-${day}`).value = '';
      syncWorkingHoursRow(day);
    }
    app.ui.settingsDirty = true;
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
    app.ui.settingsDirty = false; render(); renderWorkingHoursEditor(); renderSettingsHome(); window.alert('Horaires enregistrés.');
  }

  function openService(service = null) {
    app.ui.serviceSaving = false; $('#serviceForm button[type="submit"]').disabled = false; $('#serviceForm').reset(); $('#serviceId').value = service?.id || ''; $('#serviceDialogTitle').textContent = service ? 'Modifier la prestation' : 'Nouvelle prestation'; $('#serviceName').value = service?.name || ''; setDurationValue(service?.duration || 60, 'serviceDuration'); $('#servicePrice').value = service?.price ?? ''; $('#serviceColor').value = service?.color || 'rose'; $('#serviceActive').checked = service?.active !== false; $('#serviceDialog').showModal(); captureFormBaseline('serviceDialog');
  }

  function saveService() {
    if (app.ui.serviceSaving || !$('#serviceForm').reportValidity()) return;
    app.ui.serviceSaving = true;
    const id = $('#serviceId').value || uuid(), name = $('#serviceName').value.trim();
    if (!name) { app.ui.serviceSaving = false; return; }
    const duplicate = app.state.settings.services.find(service => service.id !== id && normaliseName(service.name) === normaliseName(name));
    if (duplicate) { app.ui.serviceSaving = false; window.alert('Une prestation avec ce nom existe déjà.'); return; }
    const index = app.state.settings.services.findIndex(service => service.id === id);
    if (index === -1 && app.state.settings.services.length >= LIMITS.settingsItems) { app.ui.serviceSaving = false; window.alert('Le nombre maximal de prestations est atteint.'); return; }
    const previousState = cloneState(app.state), record = { id, name, duration: Number($('#serviceDuration').value), price: $('#servicePrice').value.trim(), color: $('#serviceColor').value, active: $('#serviceActive').checked };
    if (index === -1) app.state.settings.services.push(record); else app.state.settings.services[index] = record;
    if (!saveState()) { app.state = previousState; app.ui.serviceSaving = false; return; }
    app.ui.serviceSaving = false; $('#serviceDialog').close(); renderSettingsServiceList(); renderSettingsHome();
  }

  function openSupplementType(type = null) {
    app.ui.supplementSaving = false; $('#supplementTypeForm button[type="submit"]').disabled = false; $('#supplementTypeForm').reset(); $('#supplementTypeId').value = type?.id || ''; $('#supplementTypeTitle').textContent = type ? 'Modifier la nature' : 'Nouvelle nature'; $('#supplementTypeName').value = type?.name || ''; $('#supplementTypePrice').value = type?.price ?? ''; $('#supplementTypeActive').checked = type?.active !== false; $('#supplementTypeDialog').showModal(); captureFormBaseline('supplementTypeDialog');
  }

  function saveSupplementType() {
    if (app.ui.supplementSaving || !$('#supplementTypeForm').reportValidity()) return;
    app.ui.supplementSaving = true; $('#supplementTypeForm button[type="submit"]').disabled = true;
    const id = $('#supplementTypeId').value || uuid(), name = $('#supplementTypeName').value.trim();
    if (app.state.settings.supplementTypes.some(type => type.id !== id && normaliseName(type.name) === normaliseName(name))) { app.ui.supplementSaving = false; $('#supplementTypeForm button[type="submit"]').disabled = false; window.alert('Cette nature existe déjà.'); return; }
    const rawPrice = $('#supplementTypePrice').value.trim(), index = app.state.settings.supplementTypes.findIndex(type => type.id === id);
    if (index === -1 && app.state.settings.supplementTypes.length >= LIMITS.settingsItems) { app.ui.supplementSaving = false; $('#supplementTypeForm button[type="submit"]').disabled = false; window.alert('Le nombre maximal de suppléments est atteint.'); return; }
    const previousState = cloneState(app.state), record = { id, name, price: rawPrice === '' ? '' : String(numericAmount(rawPrice)), active: $('#supplementTypeActive').checked };
    if (index === -1) app.state.settings.supplementTypes.push(record); else app.state.settings.supplementTypes[index] = record;
    if (!saveState()) { app.state = previousState; app.ui.supplementSaving = false; $('#supplementTypeForm button[type="submit"]').disabled = false; return; }
    $('#supplementTypeDialog').close(); renderSettingsSupplementList(); renderSettingsHome();
  }

 function openBadge(badge = null) {
    app.ui.badgeSaving = false; $('#badgeSubmitButton').disabled = false; $('#badgeForm').reset(); $('#badgeId').value = badge?.id || ''; $('#badgeDialogTitle').textContent = badge ? 'Modifier le repère' : 'Nouveau repère'; $('#badgeName').value = badge?.name || ''; $('#badgeSymbol').value = badge?.emoji || badge?.symbol || '🙂'; $('#deleteBadge').hidden = !badge; $('#badgeSubmitButton').textContent = badge ? 'Enregistrer les modifications' : 'Ajouter le repère'; updateBadgePreview(); $('#badgeDialog').showModal(); captureFormBaseline('badgeDialog');
 }

  function updateBadgePreview() {
    $('#badgeEmojiPreview').textContent = firstGrapheme($('#badgeSymbol').value, '🙂');
    $('#badgePreviewName').textContent = $('#badgeName').value.trim() || 'Nouveau repère';
  }

 function saveBadge() {
   if (app.ui.badgeSaving || !$('#badgeForm').reportValidity()) return;
    app.ui.badgeSaving = true; $('#badgeSubmitButton').disabled = true;
   const id = $('#badgeId').value || uuid(), name = $('#badgeName').value.trim();
    if (app.state.settings.clientBadges.some(badge => badge.id !== id && normaliseName(badge.name) === normaliseName(name))) { app.ui.badgeSaving = false; $('#badgeSubmitButton').disabled = false; window.alert('Un repère avec ce nom existe déjà.'); return; }
    const emoji = firstGrapheme($('#badgeSymbol').value, '');
    if (!emoji) { app.ui.badgeSaving = false; $('#badgeSubmitButton').disabled = false; window.alert('Choisis un emoji pour ce repère.'); return; }
    const index = app.state.settings.clientBadges.findIndex(badge => badge.id === id);
    if (index === -1 && app.state.settings.clientBadges.length >= LIMITS.settingsItems) { app.ui.badgeSaving = false; $('#badgeSubmitButton').disabled = false; window.alert('Le nombre maximal de repères est atteint.'); return; }
    const previousState = cloneState(app.state), record = { id, name, emoji, symbol: emoji };
   if (index === -1) app.state.settings.clientBadges.push(record); else app.state.settings.clientBadges[index] = record;
    if (!saveState()) { app.state = previousState; app.ui.badgeSaving = false; $('#badgeSubmitButton').disabled = false; return; }
    $('#badgeDialog').close(); renderSettingsBadgeList(); renderSettingsHome(); render(); showSuccess(index === -1 ? 'Repère ajouté' : 'Repère mis à jour');
 }

  function deleteBadge() {
    const id = $('#badgeId').value, badge = badgeById(id); if (!badge) return;
    const assigned = app.state.clients.filter(client => client.badgeId === id).length;
    if (!window.confirm(`Supprimer « ${badge.name} » ?${assigned ? ` Il sera retiré de ${assigned} cliente${assigned > 1 ? 's' : ''}.` : ''}`)) return;
    const previousState = cloneState(app.state); app.state.settings.clientBadges = app.state.settings.clientBadges.filter(item => item.id !== id); app.state.clients.forEach(client => { if (client.badgeId === id) client.badgeId = ''; });
    if (!saveState()) { app.state = previousState; return; }
    $('#badgeDialog').close(); renderSettingsBadgeList(); renderSettingsHome(); render();
  }

  function saveClientSettings() {
    const threshold = Number($('#lateCancellationThreshold').value);
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 20) { window.alert('Choisis un seuil entre 1 et 20.'); return; }
    const previous = cloneState(app.state); app.state.settings.lateCancellationThreshold = threshold; app.state.settings.lateCancellationPromptEnabled = $('#lateCancellationPromptEnabled').checked;
    if (!saveState()) { app.state = previous; return; }
    app.ui.settingsDirty = false; renderSettingsHome(); window.alert('Réglages clientes enregistrés.');
  }

  function saveReminderSettings() {
    const days = Number($('#backupReminderDays').value), previous = app.state.settings.backupReminderDays; app.state.settings.backupReminderDays = days;
    if (!saveState()) { app.state.settings.backupReminderDays = previous; return; }
    app.ui.settingsDirty = false; renderSettingsHome(); renderHeader(); window.alert('Rappel enregistré.');
  }

  async function updateStorageStatus() {
    const target = $('#storageStatus'); if (!target) return;
    try {
      const persisted = await navigator.storage?.persisted?.(), estimate = await navigator.storage?.estimate?.();
      const used = estimate?.usage ? `${(estimate.usage / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo utilisés` : 'espace utilisé non disponible';
      target.textContent = `${persisted ? 'Stockage persistant accordé' : 'Stockage local standard'} · ${used}`;
    } catch { target.textContent = 'État du stockage non disponible sur ce navigateur.'; }
  }

  function backupCounts(state) {
    return {
      clients: state.clients.length,
      appointments: state.appointments.length,
      blocks: state.blocks.length,
      expenses: Array.isArray(state.expenses) ? state.expenses.length : 0,
      services: state.settings.services.length,
      expenseCategories: Array.isArray(state.settings.expenseCategories) ? state.settings.expenseCategories.length : 0
    };
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
    return ['clients', 'appointments', 'blocks', 'blockedSlots', 'unavailableDays', 'expenses', 'spendings', 'clientProfiles'].some(key => Object.prototype.hasOwnProperty.call(state, key));
  }

  function backupPreview(data, state) {
    const exported = data?.exportedAt ? new Date(data.exportedAt) : null, when = exported && !Number.isNaN(exported.getTime()) ? format(exported, { day: 'numeric', month: 'long', year: 'numeric' }) : 'date inconnue';
    const counts = backupCounts(state);
    return `Sauvegarde du ${when} · version ${backupVersion(data)}\n${counts.clients} cliente${counts.clients > 1 ? 's' : ''}, ${counts.appointments} RDV, ${counts.blocks} événement${counts.blocks > 1 ? 's' : ''} personnel${counts.blocks > 1 ? 's' : ''}, ${counts.expenses} dépense${counts.expenses > 1 ? 's' : ''}, ${counts.services} prestation${counts.services > 1 ? 's' : ''}.\nLes horaires, repères, catégories et autres réglages sont inclus.\n\nRemplacer les données actuelles ? Une copie de secours sera conservée sur cet appareil.`;
  }

  async function shareOrDownload(blob, filename, title) {
    let file = null;
    try { file = new File([blob], filename, { type: blob.type || 'application/octet-stream', lastModified: Date.now() }); } catch {}
    let canShareFile = false;
    try { canShareFile = Boolean(file && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })); } catch {}
    if (canShareFile) {
      try { await navigator.share({ files: [file], title }); return true; }
      catch (error) { if (error?.name === 'AbortError') return false; }
    }
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  async function exportData() {
    const previousDate = app.state.settings.lastBackupAt, content = makeBackupPayload();
    content.state.settings.lastBackupAt = content.exportedAt;
    const now = new Date(), stamp = `${todayKey()}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const blob = new Blob([JSON.stringify(content)], { type: 'application/json' });
    const delivered = await shareOrDownload(blob, `sauvegarde-agenda-${stamp}.json`, 'Sauvegarde Mon agenda');
    if (!delivered) return false;
    app.state.settings.lastBackupAt = content.exportedAt;
    if (!saveState()) { app.state.settings.lastBackupAt = previousDate; return false; }
    renderHeader(); renderSettingsHome(); renderBackupStatus(); showSuccess('Sauvegarde créée'); return true;
  }

  async function importData(file) {
    const input = $('#importData'); if (!file) return;
    try {
      if (Number(file.size) > MAX_BACKUP_BYTES) throw new Error('INVALID_FILE_SIZE');
      const data = JSON.parse(await file.text());
      if (!recognisedBackup(data) || (data.app && data.app !== BACKUP_APP_ID)) throw new Error('UNKNOWN_BACKUP');
      if (Number(data.backupFormatVersion || 1) > BACKUP_FORMAT_VERSION || backupVersion(data) > CURRENT_DATA_VERSION) throw new Error('FUTURE_BACKUP');
      const migrated = migrateState(data, data.clientProfiles || data.state?.clientProfiles || {}, { strict: true });
      if (!window.confirm(backupPreview(data, migrated))) return;
      const safety = makeBackupPayload(app.state, 'before-restore');
      try { localStorage.setItem(RESTORE_SAFETY_KEY, JSON.stringify(safety)); }
      catch { window.alert('La restauration a été annulée : impossible de créer la copie de secours sur cet appareil.'); return; }
      if (!saveState(migrated)) { try { localStorage.removeItem(RESTORE_SAFETY_KEY); } catch {} return; }
      app.state = migrated; clearAllFormDrafts(); $('#settingsDialog').close(); render(); window.alert('Sauvegarde restaurée et adaptée à la version actuelle. Toutes les données compatibles ont été conservées.');
    } catch (error) {
      if (error?.message === 'FUTURE_BACKUP') window.alert('Cette sauvegarde vient d’une version plus récente. Mets d’abord l’application à jour : tes données actuelles n’ont pas été modifiées.');
      else if (error?.message === 'INVALID_FILE_SIZE') window.alert('Ce fichier est trop volumineux. La taille maximale acceptée est de 25 Mo. Tes données actuelles n’ont pas été modifiées.');
      else if (String(error?.message || '').startsWith('INVALID_')) window.alert('La sauvegarde contient au moins une donnée incomplète ou abîmée. Rien n’a été restauré afin d’éviter une perte partielle.');
      else window.alert('Ce fichier ne semble pas être une sauvegarde valide de Mon agenda.');
    } finally { input.value = ''; }
  }

  function undoLastRestore() {
    const backup = safeJson(RESTORE_SAFETY_KEY, null) || safeJson(V13_RESTORE_SAFETY_KEY, null) || safeJson(V12_RESTORE_SAFETY_KEY, null) || safeJson(V11_RESTORE_SAFETY_KEY, null) || safeJson(V10_RESTORE_SAFETY_KEY, null) || safeJson(V9_RESTORE_SAFETY_KEY, null) || safeJson(V8_RESTORE_SAFETY_KEY, null);
    if (!backup || !window.confirm('Revenir aux données présentes juste avant la dernière restauration ?')) return;
    try {
      if (!recognisedBackup(backup) || (backup.app && backup.app !== BACKUP_APP_ID) || backupVersion(backup) > CURRENT_DATA_VERSION) throw new Error('INVALID_SAFETY_COPY');
      const restored = migrateState(backup, backup.clientProfiles || backup.state?.clientProfiles || {}, { strict: true });
      if (!saveState(restored)) return;
      app.state = restored; clearAllFormDrafts(); try { localStorage.removeItem(RESTORE_SAFETY_KEY); localStorage.removeItem(V13_RESTORE_SAFETY_KEY); localStorage.removeItem(V12_RESTORE_SAFETY_KEY); localStorage.removeItem(V11_RESTORE_SAFETY_KEY); localStorage.removeItem(V10_RESTORE_SAFETY_KEY); localStorage.removeItem(V9_RESTORE_SAFETY_KEY); localStorage.removeItem(V8_RESTORE_SAFETY_KEY); } catch {} $('#settingsDialog').close(); render(); window.alert('Les données d’avant la restauration ont été récupérées.');
    } catch { window.alert('La copie de secours locale n’est pas exploitable. Tes données actuelles n’ont pas été modifiées.'); }
  }

  function undoLastMigration() {
    const backup = safeJson(MIGRATION_SAFETY_KEY, null);
    if (!backup || !window.confirm('Récupérer la copie créée juste avant la mise à jour ? Les ajouts effectués depuis seront remplacés.')) return;
    try {
      if (!recognisedBackup(backup) || (backup.app && backup.app !== BACKUP_APP_ID) || backupVersion(backup) > CURRENT_DATA_VERSION) throw new Error('INVALID_MIGRATION_COPY');
      const restored = migrateState(backup, backup.clientProfiles || backup.state?.clientProfiles || {}, { strict: true });
      if (!saveState(restored)) return;
      app.state = restored; clearAllFormDrafts(); try { localStorage.removeItem(MIGRATION_SAFETY_KEY); } catch {}
      $('#settingsDialog').close(); render(); window.alert('Les données présentes avant la mise à jour ont été récupérées et adaptées à cette version.');
    } catch { window.alert('La copie d’avant mise à jour n’est pas exploitable. Tes données actuelles n’ont pas été modifiées.'); }
  }

  function showUpdateNotice(registration) {
    app.ui.updateRegistration = registration;
    const notice = $('#updateNotice'); notice.hidden = !registration?.waiting;
  }

  function activateWaitingWorker() {
    const worker = app.ui.updateRegistration?.waiting;
    if (!worker) return;
    saveOpenFormDrafts();
    if (hasOpenUnsavedChanges()) { window.alert('Une saisie a été modifiée. Enregistre-la ou ferme-la avant d’appliquer la mise à jour.'); return; }
    app.ui.reloadingForUpdate = true; worker.postMessage({ type: 'SKIP_WAITING' });
  }

 function saveOpenFormDrafts() {
   if ($('#appointmentDialog')?.open) saveAppointmentDraft();
   if ($('#clientDialog')?.open) saveClientDraft();
   if ($('#blockDialog')?.open) saveBlockDraft();
   if ($('#expenseDialog')?.open) saveExpenseDraft();
    if ($('#expenseCategoriesDialog')?.open) saveExpenseCategoryDraft();
 }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener?.('controllerchange', () => {
      if (!app.ui.reloadingForUpdate) return;
      app.ui.reloadingForUpdate = false; globalThis.location?.reload?.();
    });
    navigator.serviceWorker.register('./sw.js?v=12.2', { updateViaCache: 'none' }).then(registration => {
      if (registration.waiting) showUpdateNotice(registration);
      registration.addEventListener?.('updatefound', () => {
        const worker = registration.installing; if (!worker) return;
        worker.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateNotice(registration); });
      });
      registration.update?.().catch?.(() => {});
    }).catch(() => {});
  }

  function setMode(mode) {
    if (!['day', 'week', 'month'].includes(mode)) return;
    app.ui.mode = mode;
    if (mode === 'month') { app.ui.monthDate = localDate(app.ui.selectedDate.getFullYear(), app.ui.selectedDate.getMonth(), 1); app.ui.overviewWeekStart = null; }
    else app.ui.weekStart = mondayOf(app.ui.selectedDate);
    renderAgenda();
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('button'); if (!target) return;
    if (target.dataset.close) { requestDialogClose(target.dataset.close); return; }
    if (target.dataset.mode) { setMode(target.dataset.mode); return; }
    if (target.dataset.screen) { showScreen(target.dataset.screen); return; }
    if (target.dataset.reportPeriod) { if (app.ui.reportTab === 'expenses') app.ui.expenseReportMode = target.dataset.reportPeriod; else app.ui.reportMode = target.dataset.reportPeriod; renderReport(); return; }
    if (target.dataset.reportTab) { app.ui.reportTab = target.dataset.reportTab; renderReport(); return; }
    if (target.dataset.expenseView) { app.ui.expenseReportView = target.dataset.expenseView; renderReport(); return; }
    if (target.id === 'backToAgenda') { showScreen('agenda'); return; }
    if (target.id === 'addAppointment') { openQuickAdd(); return; }
    if (target.id === 'quickAddAppointment') { $('#quickAddDialog').close(); openAppointment(null, { date: app.ui.quickAddDate, time: app.ui.quickAddTime }); return; }
    if (target.id === 'quickAddBlock') { $('#quickAddDialog').close(); openBlock(null, { date: app.ui.quickAddDate, time: app.ui.quickAddTime }); return; }
    if (target.id === 'quickAddExpense') { $('#quickAddDialog').close(); openExpense(null, { date: app.ui.quickAddDate }); return; }
    if (target.id === 'resumeDraft') { resumeLatestDraft(); return; }
    if (target.id === 'discardDraft') { if (window.confirm('Supprimer cette saisie en cours ?')) clearFormDraft(); return; }
    if (target.id === 'previousPeriod') { app.ui.selectedDate = addDays(app.ui.selectedDate, -7); app.ui.weekStart = mondayOf(app.ui.selectedDate); renderAgenda(); return; }
    if (target.id === 'nextPeriod') { app.ui.selectedDate = addDays(app.ui.selectedDate, 7); app.ui.weekStart = mondayOf(app.ui.selectedDate); renderAgenda(); return; }
    if (target.id === 'previousWeek') { app.ui.weekStart = addDays(app.ui.weekStart, -7); app.ui.selectedDate = app.ui.weekStart; renderAgenda(); return; }
    if (target.id === 'nextWeek') { app.ui.weekStart = addDays(app.ui.weekStart, 7); app.ui.selectedDate = app.ui.weekStart; renderAgenda(); return; }
    if (target.id === 'previousMonth') { app.ui.monthDate = localDate(app.ui.monthDate.getFullYear(), app.ui.monthDate.getMonth() - 1, 1); app.ui.overviewWeekStart = null; renderAgenda(); return; }
    if (target.id === 'nextMonth') { app.ui.monthDate = localDate(app.ui.monthDate.getFullYear(), app.ui.monthDate.getMonth() + 1, 1); app.ui.overviewWeekStart = null; renderAgenda(); return; }
    if (target.id === 'todayButton') { app.ui.selectedDate = startOfDay(new Date()); app.ui.weekStart = mondayOf(app.ui.selectedDate); renderAgenda(); return; }
    if (target.id === 'currentWeekButton') { app.ui.selectedDate = startOfDay(new Date()); app.ui.weekStart = mondayOf(app.ui.selectedDate); renderAgenda(); return; }
    if (target.id === 'reportToday') { app.ui.reportDate = startOfDay(new Date()); renderReport(); return; }
    if (target.id === 'previousReport') { shiftReportDate(-1); renderReport(); return; }
    if (target.id === 'nextReport') { shiftReportDate(1); renderReport(); return; }
    if (target.id === 'exportReportCsv') { exportReportCsv(); return; }
    if (target.id === 'routeDay') { openRouteDay(); return; }
    if (target.id === 'dayReview') { openDayReview(app.ui.selectedDate); return; }
    if (target.id === 'unclosedDayNotice') { const date = parseDate(target.dataset.reviewDate); if (date) openDayReview(date); return; }
    if (target.id === 'previousReviewDay') { app.ui.reviewDate = addDays(app.ui.reviewDate, -1); app.ui.reviewPendingId = null; renderDayReview(); return; }
    if (target.id === 'nextReviewDay') { app.ui.reviewDate = addDays(app.ui.reviewDate, 1); app.ui.reviewPendingId = null; renderDayReview(); return; }
    if (target.id === 'deleteAppointment') {
      if (app.ui.editingAppointmentId && window.confirm('Supprimer ce rendez-vous ?')) {
        const previousState = cloneState(app.state); app.state.appointments = app.state.appointments.filter(appointment => appointment.id !== app.ui.editingAppointmentId);
        if (!saveState()) app.state = previousState; else { clearAppointmentDraft(); $('#appointmentDialog').close(); render(); offerUndo(previousState, 'Rendez-vous supprimé'); }
      }
      return;
    }
    if (target.id === 'deleteBlock') {
      const id = $('#blockId').value;
      if (id && window.confirm('Supprimer cet événement personnel ?')) {
        const previousState = cloneState(app.state); app.state.blocks = app.state.blocks.filter(block => block.id !== id);
        if (!saveState()) app.state = previousState; else { clearFormDraft('block'); $('#blockDialog').close(); render(); offerUndo(previousState, 'Événement personnel supprimé'); }
      }
      return;
    }
    if (target.id === 'changeConflict') { $('#conflictDialog').close(); app.ui.pendingDraft = null; setAppointmentSaving(false); return; }
    if (target.id === 'confirmConflict') { const draft = app.ui.pendingDraft; $('#conflictDialog').close(); app.ui.pendingDraft = null; if (draft) commitDraftWithWarnings(draft); else setAppointmentSaving(false); return; }
    if (target.id === 'changeBlockConflict') { $('#blockConflictDialog').close(); app.ui.pendingBlockConflict = null; setBlockSaving(false); return; }
    if (target.id === 'confirmBlockConflict') { const block = app.ui.pendingBlockConflict; $('#blockConflictDialog').close(); app.ui.pendingBlockConflict = null; if (block) commitBlock(block); else setBlockSaving(false); return; }
    if (target.id === 'changeDuplicate') { $('#duplicateClientDialog').close(); app.ui.pendingDuplicate = null; setAppointmentSaving(false); return; }
    if (target.id === 'createDuplicate') {
      const pending = app.ui.pendingDuplicate; $('#duplicateClientDialog').close(); app.ui.pendingDuplicate = null;
      if (pending?.draft) continueDraftSubmission(pending.draft); else setAppointmentSaving(false); return;
    }
    if (target.id === 'useDuplicate') {
      const pending = app.ui.pendingDuplicate, client = pending ? clientById(pending.clientId) : null; $('#duplicateClientDialog').close(); app.ui.pendingDuplicate = null;
      if (pending?.draft && client) continueDraftSubmission({ ...pending.draft, clientId: client.id, clientName: client.name, phone: pending.draft.phone || client.phone, contactVia: pending.draft.contactVia || client.contactVia, address: pending.draft.address || client.address });
      else setAppointmentSaving(false); return;
    }
    if (target.id === 'exportData' || target.id === 'backupButton' || target.id === 'backupNotice') { exportData(); return; }
    if (target.id === 'undoRestore') { undoLastRestore(); return; }
    if (target.id === 'undoMigration') { undoLastMigration(); return; }
    if (target.id === 'undoLastAction') { undoLastAction(); return; }
    if (target.id === 'updateNotice') { activateWaitingWorker(); return; }
    if (target.id === 'appointmentWaze') { openWaze($('#address').value.trim()); return; }
    if (target.id === 'profileWaze') { openWaze($('#profileAddress').value.trim()); return; }
    if (target.id === 'applyWeekdayHours') { setWeekdayHoursInEditor(); return; }
    if (target.id === 'saveWorkingHours') { saveWorkingHours(); return; }
    if (target.id === 'addService') { openService(); return; }
    if (target.id === 'addSupplement') { addSupplementRow(); return; }
    if (target.id === 'addReviewSupplement') { addReviewSupplementRow(); return; }
    if (target.id === 'addSupplementType') { openSupplementType(); return; }
    if (target.id === 'addBadge') { openBadge(); return; }
    if (target.id === 'manageExpenseCategories') { openExpenseCategories(); return; }
    if (target.id === 'deleteExpense') { deleteExpense(); return; }
    if (target.id === 'deleteExpenseCategory') { deleteExpenseCategory(); return; }
    if (target.id === 'editAppointmentContact') { const client = app.ui.formClientId ? clientById(app.ui.formClientId) : null; syncAppointmentContactSummary(client, true); $('#phone').focus(); return; }
    if (target.id === 'toggleAppointmentAdjustments') { setAppointmentAdjustments(!app.ui.appointmentAdjustmentsExpanded); return; }
    if (target.id === 'changeProfileBadge') { $('#profileBadgeSummary').hidden = true; $('#profileBadgeField').hidden = false; $('#profileBadge').focus(); return; }
    if (target.id === 'deleteBadge') { deleteBadge(); return; }
    if (target.id === 'saveClientSettings') { saveClientSettings(); return; }
    if (target.id === 'saveReminderSettings') { saveReminderSettings(); return; }
    if (target.id === 'settingsBack') { showSettingsPage('home'); return; }
    if (target.id === 'applyLateBadge') { settleLateBadgePrompt('apply'); return; }
    if (target.id === 'dismissLateBadge') { settleLateBadgePrompt('dismiss'); return; }
    if (target.id === 'disableLateBadge') { settleLateBadgePrompt('disable'); return; }
    if (target.id === 'unsavedSave') { resolveUnsavedClose('save'); return; }
    if (target.id === 'unsavedDiscard') { resolveUnsavedClose('discard'); return; }
    if (target.id === 'unsavedContinue') { resolveUnsavedClose('continue'); return; }
    if (target.dataset.settingsPage) { showSettingsPage(target.dataset.settingsPage); return; }
    if (target.dataset.removeSupplement) { renderSupplementRows(supplementsFromForm(true).filter(item => item.id !== target.dataset.removeSupplement)); return; }
    if (target.dataset.removeReviewSupplement) { renderReviewSupplementRows(reviewSupplementsFromForm(true).filter(item => item.id !== target.dataset.removeReviewSupplement)); return; }
    if (target.dataset.selectDate) { app.ui.selectedDate = parseDate(target.dataset.selectDate); app.ui.weekStart = mondayOf(app.ui.selectedDate); renderAgenda(); return; }
    if (target.dataset.openDay) { app.ui.selectedDate = parseDate(target.dataset.openDay); app.ui.weekStart = mondayOf(app.ui.selectedDate); app.ui.mode = 'day'; renderAgenda(); return; }
    if (target.dataset.selectWeek) { const date = parseDate(target.dataset.selectWeek); app.ui.overviewWeekStart = mondayOf(date); app.ui.weekStart = mondayOf(date); app.ui.selectedDate = date; renderAgenda(); return; }
    if (target.dataset.closeOverview !== undefined) { app.ui.overviewWeekStart = null; renderAgenda(); return; }
    if (target.dataset.edit) { const appointment = app.state.appointments.find(item => item.id === target.dataset.edit); if (appointment) { if ($('#todoDialog').open) $('#todoDialog').close(); if ($('#dayReviewDialog').open) $('#dayReviewDialog').close(); openAppointment(appointment); } return; }
    if (target.dataset.editBlock) { const block = app.state.blocks.find(item => item.id === target.dataset.editBlock); if (block) openBlock(block); return; }
    if (target.dataset.editService) { const service = serviceById(target.dataset.editService); if (service) openService(service); return; }
    if (target.dataset.editSupplementType) { const type = supplementTypeById(target.dataset.editSupplementType); if (type) openSupplementType(type); return; }
    if (target.dataset.editBadge) { const badge = badgeById(target.dataset.editBadge); if (badge) openBadge(badge); return; }
    if (target.dataset.editExpense) { const expense = app.state.expenses.find(item => item.id === target.dataset.editExpense); if (expense) openExpense(expense); return; }
    if (target.dataset.editExpenseCategory) {
      if ($('#expenseCategoryId').value === target.dataset.editExpenseCategory) return;
      if (formHasChanges('expenseCategoriesDialog')) requestExpenseCategoryChange(target.dataset.editExpenseCategory);
      else editExpenseCategory(target.dataset.editExpenseCategory);
      return;
    }
    if (target.dataset.editLinked) { const appointment = app.state.appointments.find(item => item.id === target.dataset.editLinked); if (appointment) { saveAppointmentDraft(); $('#appointmentDialog').close(); openAppointment(appointment); } return; }
    if (target.dataset.repeatFrom) { const appointment = app.state.appointments.find(item => item.id === target.dataset.repeatFrom); if (appointment) { saveClientDraft(); $('#clientDialog').close(); openAppointment(null, { from: appointment }); } return; }
    if (target.dataset.waze) { openWaze(decodeURIComponent(target.dataset.waze)); return; }
    if (target.dataset.createTime) { const requestedDate = target.dataset.createDate || dateKey(app.ui.selectedDate); app.ui.selectedDate = parseDate(requestedDate) || app.ui.selectedDate; openQuickAdd(requestedDate, target.dataset.createTime); return; }
    if (target.dataset.suggestion) { const client = clientById(target.dataset.suggestion); if (client) fillFromClient(client); return; }
    if (target.dataset.todo) { openTodo(target.dataset.todo); return; }
    if (target.dataset.reviewPaid) { const appointment = app.state.appointments.find(item => item.id === target.dataset.reviewPaid); if (appointment) markAppointmentPaid(appointment.id, appointment.date); return; }
    if (target.dataset.reviewAdjust) { openReviewFinancialEditor(target.dataset.reviewAdjust); return; }
    if (target.dataset.reviewPending) { app.ui.reviewPendingId = target.dataset.reviewPending; renderDayReview(); return; }
    if (target.dataset.reviewSave) { const input = $$('[data-review-reminder]').find(item => item.dataset.reviewReminder === target.dataset.reviewSave); savePaymentReminder(target.dataset.reviewSave, input?.value || ''); return; }
    if (target.dataset.reminderPaid) { markAppointmentPaid(target.dataset.reminderPaid, todayKey()); return; }
    if (target.dataset.client) { openClient(target.dataset.client); }
  });

  $('#appointmentForm').addEventListener('submit', event => {
    event.preventDefault();
    if (app.ui.appointmentSaving || !$('#appointmentForm').reportValidity()) return;
    setAppointmentSaving(true);
    const draft = getDraft();
    if (!draft.clientName || !draft.service || !draft.date || !draft.time) { setAppointmentSaving(false); window.alert('Renseigne la cliente et la prestation.'); return; }
    if (!validDate(draft.date) || !validTime(draft.time) || !Number.isFinite(draft.duration) || draft.duration < 15) { setAppointmentSaving(false); window.alert('Vérifie la date, l’heure et la durée du rendez-vous.'); return; }
    if (app.ui.editingAppointmentId && draft.paymentStatus === 'pending' && !validDate(draft.paymentReminderDate)) { setAppointmentSaving(false); window.alert('Choisis la date à laquelle tu veux relancer la cliente pour le paiement.'); $('#paymentReminderDate').focus(); return; }
    if (draft.repeatWeeks && (!validDate(draft.repeatDate) || dateTimeMs(draft.repeatDate, '00:00') <= dateTimeMs(draft.date, '00:00'))) { setAppointmentSaving(false); window.alert('Choisis une date du prochain RDV après le rendez-vous actuel.'); $('#repeatDate').focus(); return; }
    if (draft.repeatWeeks && !validTime(draft.repeatTime)) { setAppointmentSaving(false); window.alert('Choisis une heure valide pour le prochain rendez-vous.'); $('#repeatTime').focus(); return; }
    const duplicate = similarClient(draft);
    if (duplicate) { openDuplicateClientDialog(draft, duplicate); return; }
    continueDraftSubmission(draft);
  });
  $('#blockForm').addEventListener('submit', event => { event.preventDefault(); saveBlock(); });
  $('#expenseForm').addEventListener('submit', event => { event.preventDefault(); saveExpense(); });
  $('#expenseCategoryForm').addEventListener('submit', event => { event.preventDefault(); saveExpenseCategory(); });
  $('#clientForm').addEventListener('submit', event => {
   event.preventDefault(); if (app.ui.clientSaving || !$('#clientForm').reportValidity()) return; app.ui.clientSaving = true;
    $('#clientSubmitButton').disabled = true;
    const client = clientById($('#profileKey').value); if (!client) { app.ui.clientSaving = false; $('#clientSubmitButton').disabled = false; return; }
    const previousState = cloneState(app.state); client.name = $('#profileName').value.trim(); client.phone = $('#profilePhone').value.trim(); client.contactVia = $('#profileContactVia').value; client.badgeId = $('#profileBadge').value; client.address = $('#profileAddress').value.trim(); client.notes = $('#profileNotes').value.trim(); client.updatedAt = new Date().toISOString();
    if (!saveState()) { app.state = previousState; app.ui.clientSaving = false; $('#clientSubmitButton').disabled = false; return; }
    app.ui.clientSaving = false; $('#clientSubmitButton').disabled = false; clearFormDraft('client'); $('#clientDialog').close(); render(); showSuccess('Fiche cliente enregistrée');
  });
  $('#serviceForm').addEventListener('submit', event => { event.preventDefault(); saveService(); });
  $('#supplementTypeForm').addEventListener('submit', event => { event.preventDefault(); saveSupplementType(); });
  $('#badgeForm').addEventListener('submit', event => { event.preventDefault(); saveBadge(); });
  $('#reviewFinancialForm').addEventListener('submit', event => { event.preventDefault(); saveReviewFinancials($('#reviewFinancialAppointmentId').value); });
  $('#clientName').addEventListener('input', event => {
    const exact = app.state.clients.filter(client => normaliseName(client.name) === normaliseName(event.target.value));
    if (exact.length === 1) fillFromClient(exact[0]);
    else { app.ui.formClientId = null; app.ui.appointmentContactExpanded = true; renderSelectedClientInfo(null); renderSuggestions(); }
  });
  $('#clientName').addEventListener('blur', () => setTimeout(() => { $('#clientSuggestions').hidden = true; }, 150));
 $('#serviceSelect').addEventListener('change', applyServicePreset);
  $('#service').addEventListener('input', updateAppointmentTotal);
 $('#price').addEventListener('input', updateAppointmentTotal);
  $('#supplementRows').addEventListener('input', updateAppointmentTotal);
  $('#supplementRows').addEventListener('change', event => { if (event.target.matches('[data-supplement-type]')) applySupplementDefaultPrice(event.target); else updateAppointmentTotal(); });
  $('#reviewFinancialPrice').addEventListener('input', updateReviewFinancialTotal);
  $('#reviewSupplementRows').addEventListener('input', updateReviewFinancialTotal);
  $('#reviewSupplementRows').addEventListener('change', event => { if (event.target.matches('[data-review-supplement-type]')) applyReviewSupplementDefaultPrice(event.target); else updateReviewFinancialTotal(); });
  $('#paymentStatus').addEventListener('change', syncPaymentFields);
  $('#status').addEventListener('change', () => { syncStatusFields(); updateConflictHint(); });
  $('#date').addEventListener('input', () => { updateConflictHint(); syncRepeatDate(false); });
  ['#time', '#duration'].forEach(selector => $(selector).addEventListener('input', () => { updateConflictHint(); syncRepeatDate(false); updateAppointmentServiceSummary(); }));
  ['timeHour', 'timeMinute'].forEach(id => $(`#${id}`).addEventListener('change', () => syncTimePicker('time')));
  ['repeatTimeHour', 'repeatTimeMinute'].forEach(id => $(`#${id}`).addEventListener('change', () => { app.ui.repeatTimeEdited = true; syncTimePicker('repeatTime'); }));
  $('#address').addEventListener('input', updateConflictHint);
  $('#repeatWeeks').addEventListener('change', () => { app.ui.repeatDateEdited = false; app.ui.repeatTimeEdited = false; syncRepeatDate(true); });
  $('#repeatDate').addEventListener('input', () => { app.ui.repeatDateEdited = true; syncRepeatDate(false); });
  $('#repeatTime').addEventListener('input', () => { app.ui.repeatTimeEdited = true; syncRepeatDate(false); });
 $('#blockAllDay').addEventListener('change', syncBlockAllDay);
  $('#blockAppointments').addEventListener('change', syncBlockModePreview);
  $('#blockAllDayDate').addEventListener('input', () => {
    $('#blockAllDayEndDate').min = $('#blockAllDayDate').value || '';
    $('#blockValidation').hidden = true;
  });
 $('#blockAllDayEndDate').addEventListener('input', () => { $('#blockValidation').hidden = true; });
  ['#blockStartDate', '#blockStartTime', '#blockEndDate', '#blockEndTime'].forEach(selector => $(selector).addEventListener('input', () => { $('#blockValidation').hidden = true; }));
  $('#workingHoursEditor').addEventListener('change', event => {
    app.ui.settingsDirty = true; const match = event.target.id?.match(/^workEnabled-(\d)$/); if (match) syncWorkingHoursRow(Number(match[1]));
  });
  $('#clientSearch').addEventListener('input', renderClients);
  $('#clientFilter').addEventListener('change', renderClients);
 $('#profileAddress').addEventListener('input', event => { $('#profileWaze').hidden = !event.target.value.trim(); });
  $('#profileBadge').addEventListener('change', () => syncProfileBadgeSummary(true));
  $('#badgeName').addEventListener('input', updateBadgePreview);
  $('#badgeSymbol').addEventListener('input', updateBadgePreview);
  $('#lateCancellationThreshold').addEventListener('input', () => { app.ui.settingsDirty = true; });
  $('#lateCancellationPromptEnabled').addEventListener('change', () => { app.ui.settingsDirty = true; });
  $('#backupReminderDays').addEventListener('change', () => { app.ui.settingsDirty = true; });
  $('#importData').addEventListener('change', event => importData(event.target.files[0]));
 $('#conflictDialog').addEventListener('cancel', () => { app.ui.pendingDraft = null; setAppointmentSaving(false); });
  $('#blockConflictDialog').addEventListener('cancel', () => { app.ui.pendingBlockConflict = null; setBlockSaving(false); });
  $('#duplicateClientDialog').addEventListener('cancel', () => { app.ui.pendingDuplicate = null; setAppointmentSaving(false); });
  $('#lateBadgeDialog').addEventListener('cancel', event => { event.preventDefault(); settleLateBadgePrompt('dismiss'); });
  let draftTimer = null;
  $('#appointmentForm').addEventListener('input', () => { clearTimeout(draftTimer); draftTimer = setTimeout(saveAppointmentDraft, 250); });
  $('#appointmentForm').addEventListener('change', () => { clearTimeout(draftTimer); draftTimer = setTimeout(saveAppointmentDraft, 100); });
  let clientDraftTimer = null, blockDraftTimer = null, expenseDraftTimer = null, expenseCategoryDraftTimer = null;
  $('#clientForm').addEventListener('input', () => { clearTimeout(clientDraftTimer); clientDraftTimer = setTimeout(saveClientDraft, 150); });
  $('#clientForm').addEventListener('change', () => { clearTimeout(clientDraftTimer); clientDraftTimer = setTimeout(saveClientDraft, 80); });
  $('#blockForm').addEventListener('input', () => { clearTimeout(blockDraftTimer); blockDraftTimer = setTimeout(saveBlockDraft, 150); });
 $('#blockForm').addEventListener('change', () => { clearTimeout(blockDraftTimer); blockDraftTimer = setTimeout(saveBlockDraft, 80); });
  $('#expenseForm').addEventListener('input', () => { clearTimeout(expenseDraftTimer); expenseDraftTimer = setTimeout(saveExpenseDraft, 150); });
 $('#expenseForm').addEventListener('change', () => { clearTimeout(expenseDraftTimer); expenseDraftTimer = setTimeout(saveExpenseDraft, 80); });
  $('#expenseCategoryForm').addEventListener('input', () => { clearTimeout(expenseCategoryDraftTimer); expenseCategoryDraftTimer = setTimeout(saveExpenseCategoryDraft, 150); });
  ['appointmentDialog', 'clientDialog', 'blockDialog', 'expenseDialog', 'expenseCategoriesDialog', 'serviceDialog', 'supplementTypeDialog', 'badgeDialog', 'settingsDialog', 'reviewFinancialDialog', 'dayReviewDialog'].forEach(dialogId => {
    $(`#${dialogId}`).addEventListener('cancel', event => { event.preventDefault(); requestDialogClose(dialogId); });
  });
  $('#unsavedChangesDialog').addEventListener('cancel', event => { event.preventDefault(); resolveUnsavedClose('continue'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveOpenFormDrafts(); });
  globalThis.addEventListener?.('pagehide', saveOpenFormDrafts);
  globalThis.addEventListener?.('beforeunload', event => {
    saveOpenFormDrafts();
    if (app.ui.reloadingForUpdate || !hasOpenUnsavedChanges()) return;
    event.preventDefault(); event.returnValue = '';
  });

  if (globalThis.setInterval) globalThis.setInterval(() => {
    renderHeader();
    if (app.ui.screen !== 'agenda') return;
    if (app.ui.mode === 'day') renderAgenda();
    else if (app.ui.mode === 'week') updateWeekCurrentTimeLine();
  }, 60 * 1000);
  registerServiceWorker();
  navigator.storage?.persist?.().catch?.(() => {});
  render();
})();
