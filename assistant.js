/*
 * Assistant local pour « Mon agenda »
 * ------------------------------------
 * Ce module ne fait aucun appel réseau et ne conserve jamais l'audio.
 * Il fournit :
 *   - un analyseur de commandes françaises ;
 *   - des réponses et prévisualisations déterministes ;
 *   - une confirmation obligatoire avant toute écriture ;
 *   - une recherche de créneaux libres ;
 *   - un contrôleur vocal push-to-talk basé sur Web Speech, si disponible.
 *
 * Intégration minimale :
 *
 *   const assistant = NailPlannerAssistant.createAssistant({
 *     getState: () => app.state,
 *     execute: action => {
 *       // Appliquer action.type puis sauvegarder. Cette fonction n'est appelée
 *       // qu'après assistant.confirm(confirmationId).
 *     },
 *     navigate: navigation => {
 *       // Facultatif : ouvrir le suivi du jour ou les relances.
 *     }
 *   });
 *
 *   const response = await assistant.submit('Ajoute Sarah demain à 14h pour un remplissage');
 *   // Afficher response.message. Si response.kind === 'preview', proposer :
 *   // assistant.confirm(response.confirmationId) / assistant.reject(...)
 *
 * Chargement navigateur : <script src="assistant.js"></script>
 * Chargement Node/tests : const api = require('./assistant.js')
 */
(function exposeAssistant(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NailPlannerAssistant = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildAssistantApi() {
  'use strict';

  const WRITE_ACTIONS = new Set(['create_appointment', 'move_appointment', 'cancel_appointment']);
  const INACTIVE_STATUSES = new Set(['cancelled', 'no_show']);
  const WEEKDAYS = [
    { aliases: ['dimanche'], day: 0 },
    { aliases: ['lundi'], day: 1 },
    { aliases: ['mardi'], day: 2 },
    { aliases: ['mercredi'], day: 3 },
    { aliases: ['jeudi'], day: 4 },
    { aliases: ['vendredi'], day: 5 },
    { aliases: ['samedi'], day: 6 }
  ];
  const MONTHS = [
    ['janvier', 'janv'], ['fevrier', 'fevr', 'fev'], ['mars'], ['avril', 'avr'],
    ['mai'], ['juin'], ['juillet', 'juil'], ['aout'], ['septembre', 'sept'],
    ['octobre', 'oct'], ['novembre', 'nov'], ['decembre', 'dec']
  ];
  const NUMBER_WORDS = new Map([
    ['zero', 0], ['une', 1], ['un', 1], ['deux', 2], ['trois', 3], ['quatre', 4],
    ['cinq', 5], ['six', 6], ['sept', 7], ['huit', 8], ['neuf', 9], ['dix', 10],
    ['onze', 11], ['douze', 12]
  ]);

  const pad = value => String(value).padStart(2, '0');
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = () => globalThis.crypto?.randomUUID?.() || `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const normalize = value => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[’']/g, ' ')
    .replace(/\brdv\b/g, 'rendez vous')
    .replace(/\brendez[- ]vous\b/g, 'rendez vous')
    .replace(/\bapres[- ]demain\b/g, 'apres demain')
    .replace(/[^a-zA-Z0-9:/+ -]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const localDate = (year, month, day) => new Date(year, month, day, 12, 0, 0, 0);
  const startOfDay = date => localDate(date.getFullYear(), date.getMonth(), date.getDate());
  const addDays = (date, days) => { const result = new Date(date); result.setDate(result.getDate() + days); return result; };
  const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parseDateKey = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const result = localDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return dateKey(result) === value ? result : null;
  };
  const toMinutes = value => {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return NaN;
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    return Number(match[1]) < 24 && Number(match[2]) < 60 ? minutes : NaN;
  };
  const timeText = minutes => {
    const safe = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
  };
  const dateTime = (date, time) => {
    const day = typeof date === 'string' ? parseDateKey(date) : startOfDay(date);
    const minutes = toMinutes(time);
    if (!day || !Number.isFinite(minutes)) return NaN;
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0).getTime();
  };
  const intersects = (startOne, endOne, startTwo, endTwo) => startOne < endTwo && endOne > startTwo;
  const activeAppointment = appointment => !INACTIVE_STATUSES.has(appointment?.status);
  const formatDate = date => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  const formatShortDate = date => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(date);
  const money = value => value === '' || value === null || value === undefined || Number.isNaN(Number(value)) ? '' : `${Number(value).toLocaleString('fr-FR')} €`;

  function nextWeekday(now, day) {
    let delta = (day - now.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    return addDays(startOfDay(now), delta);
  }

  function extractDates(text, now = new Date()) {
    const source = normalize(text), found = [];
    const add = (index, date, raw) => {
      if (!date || Number.isNaN(date.getTime())) return;
      if (!found.some(item => item.index === index && dateKey(item.date) === dateKey(date))) found.push({ index, date, raw });
    };
    const relative = [
      { expression: /\bapres demain\b/g, days: 2 },
      { expression: /\bdemain\b/g, days: 1 },
      { expression: /\baujourd hui\b/g, days: 0 }
    ];
    relative.forEach(item => {
      let match;
      while ((match = item.expression.exec(source))) {
        if (item.days === 1 && source.slice(Math.max(0, match.index - 6), match.index) === 'apres ') continue;
        add(match.index, addDays(startOfDay(now), item.days), match[0]);
      }
    });
    WEEKDAYS.forEach(({ aliases, day }) => aliases.forEach(alias => {
      const expression = new RegExp(`\\b${alias}(?:\\s+(prochain|prochaine))?\\b`, 'g');
      let match;
      while ((match = expression.exec(source))) add(match.index, nextWeekday(now, day), match[0]);
    }));
    let match;
    const numeric = /\b(?:le\s+)?(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?\b/g;
    while ((match = numeric.exec(source))) {
      let year = match[3] ? Number(match[3]) : now.getFullYear();
      if (year < 100) year += 2000;
      let date = localDate(year, Number(match[2]) - 1, Number(match[1]));
      if (!match[3] && date < startOfDay(now)) date = localDate(year + 1, Number(match[2]) - 1, Number(match[1]));
      if (date.getDate() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1) add(match.index, date, match[0]);
    }
    const monthNames = MONTHS.flatMap((names, month) => names.map(name => ({ name, month }))).sort((a, b) => b.name.length - a.name.length);
    monthNames.forEach(({ name, month }) => {
      const expression = new RegExp(`\\b(?:le\\s+)?(\\d{1,2})\\s+${name}(?:\\s+(\\d{4}))?\\b`, 'g');
      let named;
      while ((named = expression.exec(source))) {
        let year = named[2] ? Number(named[2]) : now.getFullYear();
        let date = localDate(year, month, Number(named[1]));
        if (!named[2] && date < startOfDay(now)) date = localDate(year + 1, month, Number(named[1]));
        if (date.getDate() === Number(named[1]) && date.getMonth() === month) add(named.index, date, named[0]);
      }
    });
    return found.sort((one, two) => one.index - two.index);
  }

  function extractTimes(text) {
    const source = normalize(text), found = [], expression = /(?:\b(?:a|vers|pour)\s+)?\b([01]?\d|2[0-3])\s*(?:h|heure|heures|:)\s*([0-5]?\d)?\b/g;
    let match;
    while ((match = expression.exec(source))) {
      const time = `${pad(Number(match[1]))}:${pad(Number(match[2] || 0))}`;
      if (!found.some(item => item.index === match.index && item.time === time)) found.push({ index: match.index, time, raw: match[0] });
    }
    return found;
  }

  function extractDuration(text) {
    const source = normalize(text);
    let match = source.match(/\b(\d{1,3})\s*(?:min|minute|minutes)\b/);
    if (match) return Math.max(15, Number(match[1]));
    const hourExpression = /\b(\d{1,2})\s*(?:h|heure|heures)\s*([0-5]?\d)?\s*(?:min|minute|minutes)?\b/g;
    while ((match = hourExpression.exec(source))) {
      const prefix = source.slice(Math.max(0, match.index - 12), match.index);
      const hours = Number(match[1]);
      if (/\b(?:a|vers)\s*$/.test(prefix) || hours > 6) continue;
      return Math.max(15, hours * 60 + Number(match[2] || 0));
    }
    match = source.match(/\b(une|un|deux|trois|quatre)\s+heure(?:s)?(?:\s+et\s+demie)?\b/);
    if (match) return NUMBER_WORDS.get(match[1]) * 60 + (/demie/.test(match[0]) ? 30 : 0);
    return null;
  }

  function extractPrice(text) {
    const match = String(text || '').replace(',', '.').match(/\b(\d+(?:\.\d{1,2})?)\s*(?:€|euros?)\b/i);
    return match ? String(Number(match[1])) : null;
  }

  function matchKnownEntity(text, entities, labelKey = 'name') {
    const source = ` ${normalize(text)} `;
    return [...(entities || [])]
      .filter(item => normalize(item?.[labelKey]))
      .sort((one, two) => normalize(two[labelKey]).length - normalize(one[labelKey]).length)
      .find(item => source.includes(` ${normalize(item[labelKey])} `)) || null;
  }

  function extractUnknownClientName(text) {
    const source = String(text || '').replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
    const expressions = [
      /(?:rendez[- ]vous)(?:\s+(?:avec|pour|de))?\s+(.+?)(?=\s+(?:aujourd'hui|aujourd hui|demain|après[- ]demain|apres[- ]demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|le\s+\d|[àa]\s+\d|\d{1,2}\s*h|pour\s+(?:une?|le|la)\s+|$))/i,
      /(?:ajoute|crée|cree|note|prends?)\s+(.+?)(?=\s+(?:aujourd'hui|aujourd hui|demain|après[- ]demain|apres[- ]demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|le\s+\d|[àa]\s+\d|\d{1,2}\s*h|pour\s+(?:une?|le|la)\s+|$))/i
    ];
    for (const expression of expressions) {
      const match = source.match(expression);
      const candidate = match?.[1]?.replace(/^(?:un|une|le|la|avec|pour)\s+/i, '').trim();
      if (candidate && candidate.length >= 2 && candidate.split(' ').length <= 5) return candidate.replace(/(^|[\s-])([a-zà-ÿ])/giu, (_, separator, character) => `${separator}${character.toLocaleUpperCase('fr-FR')}`);
    }
    return '';
  }

  function serviceForText(text, state) {
    return matchKnownEntity(text, state?.settings?.services || [], 'name');
  }

  function clientCandidatesForText(text, state) {
    const source = ` ${normalize(text)} `, clients = state?.clients || [], exact = matchKnownEntity(text, clients, 'name');
    if (exact) return [exact];
    return clients.filter(client => {
      const firstName = normalize(client.name).split(' ')[0];
      return firstName.length >= 3 && source.includes(` ${firstName} `);
    });
  }

  function clientForText(text, state) {
    const candidates = clientCandidatesForText(text, state);
    return candidates.length === 1 ? candidates[0] : null;
  }

  function inferIntent(text) {
    const source = normalize(text);
    if (!source) return 'unknown';
    const hasDateOrTime = /\b(?:aujourd hui|demain|apres demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|[01]?\d|2[0-3])\s*(?:h|heure|heures|:)\b/.test(source);
    if (/\b(?:annule|annuler|supprime|supprimer)\b/.test(source) && (/\brendez vous\b/.test(source) || hasDateOrTime)) return 'cancel';
    if (/\b(?:deplace|deplacer|decale|decaler|reporte|reporter|change|modifier)\b/.test(source) && (/\brendez vous\b/.test(source) || hasDateOrTime)) return 'move';
    if (/\b(?:trouve|trouver|cherche|chercher|disponibilite|disponible|libre|libres|creneau libre|quelle heure)\b/.test(source)) return 'find_slots';
    if (/\b(?:relance|relances|paiement|paiements|a regler|impaye|impayes)\b/.test(source) && /\b(?:ouvre|ouvrir|affiche|afficher|montre|voir|liste|quels?|qui|relance|relances)\b/.test(source)) return 'reminders';
    if (/\b(?:suivi|cloture|cloturer|fin de journee|bilan de la journee)\b/.test(source)) return 'open_day_review';
    if (/\b(?:ajoute|ajouter|cree|creer|note|noter|prends?|prendre|mets?|mettre|nouveau|nouvelle)\b/.test(source)
      && (/\b(?:rendez vous|cliente?)\b/.test(source) || /\b(?:aujourd hui|demain|apres demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/.test(source) || /\b(?:[01]?\d|2[0-3])\s*(?:h|heure|heures|:)\s*[0-5]?\d?\b/.test(source))) return 'create';
    if (/\b(?:resume|resumer|programme|planning|rendez vous|commence|finis|fini|point)\b/.test(source) && /\b(?:aujourd hui|demain|journee|programme|planning|resume|commence|finis|fini|point)\b/.test(source)) return 'day_summary';
    return 'unknown';
  }

  function candidateAppointments(state, options, now) {
    const current = now.getTime();
    return (state?.appointments || []).filter(activeAppointment).filter(appointment => {
      if (options.client && appointment.clientId !== options.client.id) return false;
      if (options.date && appointment.date !== dateKey(options.date)) return false;
      if (options.time && appointment.time !== options.time) return false;
      return options.allowPast || dateTime(appointment.date, appointment.time) >= current;
    }).sort((one, two) => dateTime(one.date, one.time) - dateTime(two.date, two.time));
  }

  function appointmentLabel(appointment, state) {
    const client = (state?.clients || []).find(item => item.id === appointment.clientId);
    const date = parseDateKey(appointment.date);
    return `${client?.name || 'Cliente'} · ${date ? formatDate(date) : appointment.date} à ${appointment.time}`;
  }

  function resolveAppointment(text, state, now, intent, dates, times, client) {
    const source = normalize(text), targetDate = intent === 'move' ? (dates.length > 1 ? dates[0].date : null) : dates[0]?.date || null;
    const targetTime = intent === 'cancel' ? times[0]?.time || null : intent === 'move' && times.length > 1 ? times[0].time : null;
    let candidates = candidateAppointments(state, {
      client,
      date: /\bprochain(?:e)?\b/.test(source) ? null : targetDate,
      time: targetTime,
      allowPast: false
    }, now);
    if (!candidates.length && targetDate) candidates = candidateAppointments(state, { client, date: targetDate, time: targetTime, allowPast: true }, now);
    return { candidates, appointment: candidates.length === 1 || /\bprochain(?:e)?\b/.test(source) ? candidates[0] || null : null };
  }

  function blockIntervals(state, fromDate, toDate) {
    return (state?.blocks || []).map(block => {
      const startDate = parseDateKey(block.startDate || block.date), endDate = parseDateKey(block.endDate || block.startDate || block.date);
      if (!startDate || !endDate) return null;
      const start = block.allDay ? dateTime(dateKey(startDate), '00:00') : dateTime(dateKey(startDate), block.startTime || '00:00');
      const end = block.allDay ? dateTime(dateKey(addDays(endDate, 1)), '00:00') : dateTime(dateKey(endDate), block.endTime || '23:59');
      return { start, end, label: block.reason || 'Indisponibilité', block };
    }).filter(item => item && item.end > fromDate && item.start < toDate);
  }

  function conflictsFor(state, draft, excludedAppointmentId = '') {
    const start = dateTime(draft.date, draft.time), end = start + Number(draft.duration || 60) * 60000;
    if (!Number.isFinite(start)) return [];
    const appointments = (state?.appointments || []).filter(activeAppointment).filter(item => item.id !== excludedAppointmentId).filter(item => {
      const itemStart = dateTime(item.date, item.time), itemEnd = itemStart + Number(item.duration || 60) * 60000;
      return intersects(start, end, itemStart, itemEnd);
    }).map(item => ({ type: 'appointment', id: item.id, label: appointmentLabel(item, state) }));
    const blocks = blockIntervals(state, start, end).filter(item => intersects(start, end, item.start, item.end)).map(item => ({ type: 'block', id: item.block.id, label: item.label }));
    return [...appointments, ...blocks];
  }

  function workHoursFor(state, date) {
    const fallback = date.getDay() >= 1 && date.getDay() <= 5 ? { enabled: true, start: '09:00', end: '19:00', breakStart: '', breakEnd: '' } : { enabled: false, start: '09:00', end: '19:00', breakStart: '', breakEnd: '' };
    return state?.settings?.workingHours?.[date.getDay()] || state?.settings?.workingHours?.[String(date.getDay())] || fallback;
  }

  function findFreeSlots(state, options = {}) {
    const now = options.now instanceof Date ? options.now : new Date();
    const duration = Math.max(15, Number(options.duration) || 60), step = Math.max(15, Number(options.step) || 30), limit = Math.max(1, Number(options.limit) || 5);
    const startDate = startOfDay(options.date || now), exactDate = Boolean(options.date), dayCount = exactDate ? 1 : Math.max(1, Number(options.days) || 14), requestedStart = toMinutes(options.afterTime || ''), slots = [];
    for (let dayOffset = 0; dayOffset < dayCount && slots.length < limit; dayOffset += 1) {
      const date = addDays(startDate, dayOffset), hours = workHoursFor(state, date);
      if (!hours.enabled) continue;
      const startMinutes = toMinutes(hours.start), endMinutes = toMinutes(hours.end);
      if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) continue;
      const firstMinute = exactDate && Number.isFinite(requestedStart) ? Math.max(startMinutes, Math.ceil(requestedStart / step) * step) : startMinutes;
      for (let minute = firstMinute; minute + duration <= endMinutes && slots.length < limit; minute += step) {
        const time = timeText(minute), start = dateTime(dateKey(date), time), end = start + duration * 60000;
        if (start <= now.getTime()) continue;
        const inBreak = hours.breakStart && hours.breakEnd && intersects(minute, minute + duration, toMinutes(hours.breakStart), toMinutes(hours.breakEnd));
        if (inBreak || conflictsFor(state, { date: dateKey(date), time, duration }).length) continue;
        slots.push({ date: dateKey(date), time, duration, label: `${formatDate(date)} à ${time}` });
      }
    }
    return slots;
  }

  function dayAppointments(state, date) {
    return (state?.appointments || []).filter(activeAppointment).filter(item => item.date === dateKey(date)).sort((one, two) => one.time.localeCompare(two.time));
  }

  function daySummary(state, date) {
    const appointments = dayAppointments(state, date);
    if (!appointments.length) return { message: `Tu n’as aucun rendez-vous ${formatDate(date)}.`, appointments: [], firstTime: '', lastTime: '' };
    const firstTime = appointments[0].time;
    const lastEnd = Math.max(...appointments.map(item => toMinutes(item.time) + Number(item.duration || 60)));
    const lastTime = timeText(lastEnd);
    const details = appointments.map(item => {
      const client = (state?.clients || []).find(candidate => candidate.id === item.clientId);
      return `${item.time}, ${client?.name || 'Cliente'}, ${item.service || 'prestation'}`;
    });
    return {
      message: `${appointments.length} rendez-vous ${formatDate(date)}. Tu commences à ${firstTime} et tu termines à ${lastTime}. ${details.join('. ')}.`,
      appointments, firstTime, lastTime
    };
  }

  function paymentReminders(state, now) {
    const today = dateKey(now);
    return (state?.appointments || []).filter(activeAppointment).filter(item => item.paymentStatus === 'pending' && item.paymentReminderDate && item.paymentReminderDate <= today).sort((one, two) => one.paymentReminderDate.localeCompare(two.paymentReminderDate));
  }

  function parseCommand(text, context = {}) {
    const state = context.state || {}, now = context.now instanceof Date ? context.now : new Date(), source = normalize(text), intent = inferIntent(source);
    const dates = extractDates(source, now), times = extractTimes(source), clientCandidates = clientCandidatesForText(source, state), client = clientCandidates.length === 1 ? clientCandidates[0] : null, service = serviceForText(source, state), explicitDuration = extractDuration(source), explicitPrice = extractPrice(text);
    const duration = explicitDuration || Number(service?.duration) || 60;

    if (intent === 'unknown') return { intent, confidence: 0, missing: [], message: 'Je n’ai pas compris. Essaie par exemple : « Ajoute Sarah demain à 14 h pour un remplissage ».' };

    if (intent === 'day_summary') {
      const date = dates[0]?.date || startOfDay(now), summary = daySummary(state, date);
      return { intent, confidence: 1, entities: { date: dateKey(date) }, result: summary, message: summary.message };
    }

    if (intent === 'open_day_review') {
      const date = dates[0]?.date || startOfDay(now);
      return { intent, confidence: 1, entities: { date: dateKey(date) }, navigation: { view: 'day-review', date: dateKey(date) }, message: `J’ouvre le suivi de ${formatDate(date)}.` };
    }

    if (intent === 'reminders') {
      const reminders = paymentReminders(state, now), total = reminders.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
      const names = reminders.slice(0, 3).map(item => (state.clients || []).find(clientItem => clientItem.id === item.clientId)?.name || 'Cliente');
      const message = reminders.length ? `${reminders.length} paiement${reminders.length > 1 ? 's' : ''} à relancer${total ? `, pour ${money(total)}` : ''}. ${names.join(', ')}${reminders.length > 3 ? ` et ${reminders.length - 3} autre${reminders.length > 4 ? 's' : ''}` : ''}.` : 'Tu n’as aucun paiement à relancer aujourd’hui.';
      return { intent, confidence: 1, result: { reminders, total }, navigation: { view: 'payment-reminders' }, message };
    }

    if (intent === 'find_slots') {
      const requestedDate = dates[0]?.date || null;
      const slots = findFreeSlots(state, { date: requestedDate, duration, afterTime: times[0]?.time || '', now, limit: 5 });
      const serviceText = service ? ` pour ${service.name}` : '';
      const message = slots.length ? `Voici ${slots.length} créneau${slots.length > 1 ? 'x' : ''} libre${slots.length > 1 ? 's' : ''}${serviceText} : ${slots.map(slot => slot.label).join(', ')}.` : `Je n’ai trouvé aucun créneau libre${requestedDate ? ` ${formatDate(requestedDate)}` : ' dans les 14 prochains jours'}.`;
      return { intent, confidence: 1, entities: { date: requestedDate ? dateKey(requestedDate) : '', duration, serviceId: service?.id || '' }, result: { slots }, message };
    }

    if (intent === 'create') {
      const name = client?.name || extractUnknownClientName(text), date = dates[0]?.date || null, time = times[0]?.time || '';
      if (!client && clientCandidates.length > 1) return { intent, confidence: 0.55, missing: ['cliente précise'], choices: clientCandidates.map(item => ({ id: item.id, label: item.name })), message: `J’ai trouvé plusieurs clientes appelées ${name || 'ainsi'}. Laquelle veux-tu choisir ?` };
      const missing = [];
      if (!name) missing.push('cliente');
      if (!date) missing.push('date');
      if (!time) missing.push('heure');
      if (!service) missing.push('prestation');
      if (missing.length) return { intent, confidence: 0.65, missing, entities: { client, name, date: date ? dateKey(date) : '', time, service, duration }, message: `Il me manque ${missing.join(', ')} pour préparer le rendez-vous.` };
      const action = {
        type: 'create_appointment',
        payload: {
          id: uid(), clientId: client?.id || '', clientName: name, date: dateKey(date), time, duration,
          serviceId: service.id, service: service.name, serviceColor: service.color || 'rose', price: explicitPrice ?? service.price ?? '',
          status: 'confirmed', paymentStatus: 'unreviewed', paymentDate: '', paymentReminderDate: '', paymentMethod: '', notes: ''
        }
      };
      const conflicts = conflictsFor(state, action.payload);
      const warning = conflicts.length ? ` Attention, ce créneau chevauche ${conflicts.length > 1 ? `${conflicts.length} éléments` : conflicts[0].label}.` : ' Aucun conflit détecté.';
      return { intent, confidence: 1, entities: action.payload, action, conflicts, message: `${name}, ${service.name}, ${formatDate(date)} de ${time} à ${timeText(toMinutes(time) + duration)}.${warning} Veux-tu confirmer ?` };
    }

    if (intent === 'move' || intent === 'cancel') {
      const resolution = resolveAppointment(source, state, now, intent, dates, times, client);
      if (!resolution.appointment) {
        if (resolution.candidates.length > 1) return { intent, confidence: 0.5, missing: ['rendez-vous précis'], choices: resolution.candidates.slice(0, 5).map(item => ({ id: item.id, label: appointmentLabel(item, state) })), message: 'J’ai trouvé plusieurs rendez-vous possibles. Lequel veux-tu modifier ?' };
        return { intent, confidence: 0.4, missing: ['rendez-vous'], message: 'Je ne trouve pas le rendez-vous concerné. Précise le nom de la cliente et la date.' };
      }
      const appointment = resolution.appointment;
      if (intent === 'cancel') {
        const action = { type: 'cancel_appointment', appointmentId: appointment.id, changes: { status: 'cancelled' } };
        return { intent, confidence: 1, action, appointment, message: `Tu veux annuler ${appointmentLabel(appointment, state)}. Veux-tu confirmer ?` };
      }
      const newDate = dates.length ? dates[dates.length - 1].date : null, newTime = times.length ? times[times.length - 1].time : '';
      const missing = [];
      if (!newDate) missing.push('nouvelle date');
      if (!newTime) missing.push('nouvelle heure');
      if (missing.length) return { intent, confidence: 0.65, missing, appointment, message: `J’ai trouvé ${appointmentLabel(appointment, state)}, mais il me manque ${missing.join(' et ')}.` };
      const draft = { ...appointment, date: dateKey(newDate), time: newTime }, conflicts = conflictsFor(state, draft, appointment.id);
      const action = { type: 'move_appointment', appointmentId: appointment.id, changes: { date: draft.date, time: draft.time } };
      const warning = conflicts.length ? ` Attention, le nouveau créneau chevauche ${conflicts.length > 1 ? `${conflicts.length} éléments` : conflicts[0].label}.` : ' Aucun conflit détecté.';
      return { intent, confidence: 1, action, appointment, conflicts, message: `${appointmentLabel(appointment, state)} sera déplacé ${formatDate(newDate)} à ${newTime}.${warning} Veux-tu confirmer ?` };
    }

    return { intent: 'unknown', confidence: 0, message: 'Je n’ai pas compris cette demande.' };
  }

  function applyActionToState(sourceState, action, now = new Date()) {
    const state = clone(sourceState || {});
    state.clients ||= []; state.appointments ||= []; state.blocks ||= []; state.settings ||= {};
    if (!action || !WRITE_ACTIONS.has(action.type)) throw new Error('ACTION_INVALIDE');
    if (action.type === 'create_appointment') {
      const payload = clone(action.payload || {});
      if (!payload.clientId) {
        let client = state.clients.find(item => normalize(item.name) === normalize(payload.clientName));
        if (!client) {
          client = { id: uid(), name: payload.clientName, phone: '', address: '', notes: '', createdAt: now.toISOString(), updatedAt: now.toISOString() };
          state.clients.push(client);
        }
        payload.clientId = client.id;
      }
      delete payload.clientName;
      payload.createdAt ||= now.toISOString(); payload.updatedAt = now.toISOString();
      state.appointments.push(payload);
      return { state, result: { appointmentId: payload.id } };
    }
    const index = state.appointments.findIndex(item => item.id === action.appointmentId);
    if (index === -1) throw new Error('RENDEZ_VOUS_INTROUVABLE');
    state.appointments[index] = { ...state.appointments[index], ...clone(action.changes || {}), updatedAt: now.toISOString() };
    return { state, result: { appointmentId: action.appointmentId } };
  }

  function responseFromParsed(parsed, pending) {
    if (parsed.action && WRITE_ACTIONS.has(parsed.action.type)) {
      const confirmationId = uid();
      pending.set(confirmationId, parsed.action);
      return { kind: 'preview', message: parsed.message, spoken: parsed.message, confirmationId, action: clone(parsed.action), conflicts: clone(parsed.conflicts || []), parsed };
    }
    if (parsed.missing?.length || parsed.choices?.length) return { kind: 'clarification', message: parsed.message, spoken: parsed.message, missing: parsed.missing || [], choices: parsed.choices || [], parsed };
    if (parsed.intent === 'unknown') return { kind: 'error', message: parsed.message, spoken: parsed.message, parsed };
    return { kind: 'answer', message: parsed.message, spoken: parsed.message, navigation: parsed.navigation || null, result: parsed.result || null, parsed };
  }

  function createAssistant(options = {}) {
    const getState = typeof options.getState === 'function' ? options.getState : () => options.state || {};
    const execute = typeof options.execute === 'function' ? options.execute : null;
    const navigate = typeof options.navigate === 'function' ? options.navigate : null;
    const now = typeof options.now === 'function' ? options.now : () => new Date();
    const pending = new Map();
    let lastConfirmationId = '';

    async function confirm(confirmationId = lastConfirmationId) {
      const action = pending.get(confirmationId);
      if (!action) return { kind: 'error', message: 'Cette confirmation a expiré. Reformule ta demande.', spoken: 'Cette confirmation a expiré.' };
      if (!execute) return { kind: 'error', message: 'L’application n’a pas encore relié cette action à l’agenda.', spoken: 'Je ne peux pas encore enregistrer cette action.' };
      pending.delete(confirmationId); if (lastConfirmationId === confirmationId) lastConfirmationId = '';
      try {
        const result = await execute(clone(action));
        return { kind: 'success', message: 'C’est enregistré.', spoken: 'C’est enregistré.', action: clone(action), result };
      } catch (error) {
        return { kind: 'error', message: error?.message || 'L’enregistrement a échoué.', spoken: 'L’enregistrement a échoué.', error };
      }
    }

    function reject(confirmationId = lastConfirmationId) {
      const removed = pending.delete(confirmationId);
      if (lastConfirmationId === confirmationId) lastConfirmationId = '';
      return { kind: 'cancelled', message: removed ? 'D’accord, je n’ai rien modifié.' : 'Cette proposition n’était plus active.', spoken: 'D’accord.' };
    }

    return {
      submit(text) {
        const shortCommand = normalize(text);
        if (lastConfirmationId && /^(?:oui|ok|d accord|vas y|confirme|confirmer|valide|valider|enregistre|c est bon)$/.test(shortCommand)) return confirm(lastConfirmationId);
        if (lastConfirmationId && /^(?:non|annule|annuler|laisse tomber|ne fais rien)$/.test(shortCommand)) return Promise.resolve(reject(lastConfirmationId));
        if (lastConfirmationId) { pending.clear(); lastConfirmationId = ''; }
        const parsed = parseCommand(text, { state: getState(), now: now() });
        if (parsed.action) pending.clear();
        const response = responseFromParsed(parsed, pending);
        if (response.confirmationId) lastConfirmationId = response.confirmationId;
        if (response.navigation && navigate) navigate(response.navigation);
        return Promise.resolve(response);
      },
      confirm,
      reject,
      clearPending() { pending.clear(); lastConfirmationId = ''; },
      pendingCount() { return pending.size; }
    };
  }

  function createVoiceController(options = {}) {
    const scope = options.scope || (typeof window !== 'undefined' ? window : globalThis);
    const Recognition = scope.SpeechRecognition || scope.webkitSpeechRecognition;
    let recognition = null, listening = false, finalText = '';
    const emitState = state => options.onState?.(state);
    return {
      supported: Boolean(Recognition),
      get listening() { return listening; },
      start() {
        if (!Recognition) {
          const error = new Error('RECONNAISSANCE_VOCALE_INDISPONIBLE');
          options.onError?.(error); return Promise.reject(error);
        }
        if (listening) return Promise.reject(new Error('ECOUTE_DEJA_ACTIVE'));
        finalText = ''; recognition = new Recognition(); recognition.lang = options.lang || 'fr-FR';
        recognition.continuous = false; recognition.interimResults = true; recognition.maxAlternatives = 1;
        return new Promise((resolve, reject) => {
          recognition.onstart = () => { listening = true; emitState('listening'); };
          recognition.onresult = event => {
            let interim = '';
            for (let index = event.resultIndex; index < event.results.length; index += 1) {
              const transcript = event.results[index][0]?.transcript || '';
              if (event.results[index].isFinal) finalText += `${transcript} `;
              else interim += transcript;
            }
            options.onInterim?.(`${finalText}${interim}`.trim());
          };
          recognition.onerror = event => {
            listening = false; emitState('idle');
            const error = new Error(event.error || 'ERREUR_RECONNAISSANCE_VOCALE'); options.onError?.(error); reject(error);
          };
          recognition.onend = () => {
            listening = false; emitState('idle'); recognition = null;
            const transcript = finalText.trim();
            if (transcript) options.onTranscript?.(transcript);
            resolve(transcript);
          };
          try { recognition.start(); }
          catch (error) { listening = false; recognition = null; emitState('idle'); options.onError?.(error); reject(error); }
        });
      },
      stop() { recognition?.stop(); },
      abort() { recognition?.abort(); recognition = null; listening = false; emitState('idle'); },
      speak(text, speakOptions = {}) {
        const synthesis = scope.speechSynthesis, Utterance = scope.SpeechSynthesisUtterance;
        if (!synthesis || !Utterance || speakOptions.enabled === false) return false;
        synthesis.cancel();
        const utterance = new Utterance(String(text || '')); utterance.lang = speakOptions.lang || 'fr-FR';
        utterance.rate = Number(speakOptions.rate) || 1; utterance.pitch = Number(speakOptions.pitch) || 1;
        const frenchVoice = synthesis.getVoices().find(voice => /^fr(?:-|_)/i.test(voice.lang));
        if (frenchVoice) utterance.voice = frenchVoice;
        synthesis.speak(utterance); return true;
      },
      stopSpeaking() { scope.speechSynthesis?.cancel(); }
    };
  }

  function runSelfTests() {
    const now = new Date(2026, 7, 25, 9, 0, 0, 0);
    const state = {
      clients: [{ id: 'c1', name: 'Sarah Pelle', phone: '0600000000', address: 'Paris' }],
      appointments: [{ id: 'a1', clientId: 'c1', date: '2026-08-26', time: '10:00', duration: 60, service: 'Remplissage', serviceId: 's2', status: 'confirmed', paymentStatus: '' }],
      blocks: [{ id: 'b1', allDay: false, startDate: '2026-08-26', startTime: '14:00', endDate: '2026-08-26', endTime: '15:00', reason: 'Personnel' }],
      settings: {
        workingHours: { 1: { enabled: true, start: '09:00', end: '19:00' }, 2: { enabled: true, start: '09:00', end: '19:00' }, 3: { enabled: true, start: '09:00', end: '19:00' }, 4: { enabled: true, start: '09:00', end: '19:00' }, 5: { enabled: true, start: '09:00', end: '19:00' } },
        services: [{ id: 's1', name: 'Pose complète', duration: 60, price: '45', color: 'rose' }, { id: 's2', name: 'Remplissage', duration: 60, price: '35', color: 'purple' }]
      }
    };
    const tests = [];
    const test = (name, condition) => tests.push({ name, passed: Boolean(condition) });
    const creation = parseCommand('Ajoute un rendez-vous avec Sarah Pelle demain à 11h pour un remplissage', { state, now });
    test('création comprise', creation.intent === 'create' && creation.action?.payload.clientId === 'c1');
    test('paiement à vérifier à la création', creation.action?.payload.paymentStatus === 'unreviewed' && creation.action?.payload.paymentDate === '' && creation.action?.payload.paymentReminderDate === '');
    test('date et heure françaises', creation.action?.payload.date === '2026-08-26' && creation.action?.payload.time === '11:00');
    const slots = findFreeSlots(state, { date: localDate(2026, 7, 26), duration: 60, now, limit: 20 });
    test('créneau occupé exclu', !slots.some(slot => slot.time === '10:00'));
    test('indisponibilité exclue', !slots.some(slot => slot.time === '14:00'));
    const cancellation = parseCommand('Annule le prochain rendez-vous de Sarah Pelle', { state, now });
    test('annulation préparée', cancellation.action?.type === 'cancel_appointment' && cancellation.action?.appointmentId === 'a1');
    const move = parseCommand('Déplace le rendez-vous de Sarah Pelle à jeudi 15h', { state, now });
    test('déplacement avec destination seule', move.action?.type === 'move_appointment' && move.action?.appointmentId === 'a1' && move.action?.changes.date === '2026-08-27' && move.action?.changes.time === '15:00');
    const summary = parseCommand('Résume ma journée de demain', { state, now });
    test('résumé du jour', summary.result?.appointments?.length === 1 && summary.result?.firstTime === '10:00');
    const applied = applyActionToState(state, creation.action, now);
    test('application pure sans mutation', state.appointments.length === 1 && applied.state.appointments.length === 2);
    const naturalCreation = parseCommand('Ajoute Léa après-demain à 9h30 pour une pose complète', { state, now });
    test('création sans prononcer rendez-vous', naturalCreation.intent === 'create' && naturalCreation.action?.payload.clientName === 'Léa');
    test('après-demain correctement reconnu', naturalCreation.action?.payload.date === '2026-08-27');
    test('heure non confondue avec durée', naturalCreation.action?.payload.time === '09:30' && naturalCreation.action?.payload.duration === 60);
    const afternoonSlots = parseCommand('Trouve un créneau demain après 15h pour un remplissage', { state, now });
    test('recherche après une heure', afternoonSlots.result?.slots?.every(slot => slot.time >= '15:00'));
    return { passed: tests.filter(item => item.passed).length, total: tests.length, failures: tests.filter(item => !item.passed).map(item => item.name), tests };
  }

  async function runAsyncSelfTests() {
    const now = new Date(2026, 7, 25, 9, 0, 0, 0), tests = [];
    const state = {
      clients: [{ id: 'c1', name: 'Sarah Pelle' }], appointments: [], blocks: [],
      settings: { services: [{ id: 's1', name: 'Remplissage', duration: 60, price: '40', color: 'purple' }] }
    };
    let executions = 0, executedAction = null;
    const assistant = createAssistant({
      state, now: () => now,
      execute: action => { executions += 1; executedAction = action; return { ok: true }; }
    });
    const preview = await assistant.submit('Ajoute Sarah demain à 14h pour un remplissage');
    tests.push({ name: 'prévisualisation obligatoire', passed: preview.kind === 'preview' && executions === 0 && assistant.pendingCount() === 1 });
    const confirmation = await assistant.submit('confirme');
    tests.push({ name: 'confirmation vocale applique une fois', passed: confirmation.kind === 'success' && executions === 1 && executedAction?.type === 'create_appointment' && assistant.pendingCount() === 0 });
    const secondPreview = await assistant.submit('Ajoute Sarah demain à 16h pour un remplissage');
    const rejection = await assistant.submit('non');
    tests.push({ name: 'refus vocal ne modifie rien', passed: secondPreview.kind === 'preview' && rejection.kind === 'cancelled' && executions === 1 && assistant.pendingCount() === 0 });
    const stalePreview = await assistant.submit('Ajoute Sarah demain à 17h pour un remplissage');
    await assistant.submit('Résume ma journée de demain');
    const staleConfirmation = await assistant.submit('oui');
    tests.push({ name: 'ancienne proposition invalidée par une nouvelle demande', passed: stalePreview.kind === 'preview' && staleConfirmation.kind !== 'success' && executions === 1 && assistant.pendingCount() === 0 });
    return { passed: tests.filter(item => item.passed).length, total: tests.length, failures: tests.filter(item => !item.passed).map(item => item.name), tests };
  }

  return Object.freeze({
    version: '1.0.0', normalize, extractDates, extractTimes, extractDuration, extractPrice, inferIntent, parseCommand,
    findFreeSlots, conflictsFor, daySummary, paymentReminders, applyActionToState,
    createAssistant, createVoiceController, runSelfTests, runAsyncSelfTests
  });
});
