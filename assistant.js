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
  const HOUR_WORDS = new Map([
    ...NUMBER_WORDS,
    ['treize', 13], ['quatorze', 14], ['quinze', 15], ['seize', 16],
    ['dix sept', 17], ['dix huit', 18], ['dix neuf', 19], ['vingt', 20],
    ['vingt et une', 21], ['vingt deux', 22], ['vingt trois', 23]
  ]);
  const MINUTE_WORDS = new Map([
    ['quart', 15], ['dix', 10], ['quinze', 15], ['vingt', 20], ['vingt cinq', 25],
    ['demi', 30], ['demie', 30], ['trente', 30], ['trente cinq', 35], ['quarante', 40],
    ['quarante cinq', 45], ['cinquante', 50], ['cinquante cinq', 55]
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
    .replace(/\bstp\b/g, 's il te plait')
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

  function weekdayDate(now, day, qualifier = '') {
    if (/semaine prochaine/.test(qualifier)) {
      const daysUntilNextMonday = ((8 - now.getDay()) % 7) || 7;
      const offsetFromMonday = (day + 6) % 7;
      return addDays(startOfDay(now), daysUntilNextMonday + offsetFromMonday);
    }
    let delta = (day - now.getDay() + 7) % 7;
    if (/prochain/.test(qualifier)) {
      if (delta === 0) delta = 7;
    }
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
      const expression = new RegExp(`\\b(?:(ce|cet|cette|la\\s+semaine\\s+prochaine)\\s+)?${alias}(?:\\s+(prochain|prochaine)|\\s+((?:de\\s+)?la\\s+semaine\\s+prochaine))?\\b`, 'g');
      let match;
      while ((match = expression.exec(source))) add(match.index, weekdayDate(now, day, `${match[1] || ''} ${match[2] || ''} ${match[3] || ''}`), match[0]);
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
    const source = normalize(text), found = [], expression = /(?:\b(?:a|vers|pour|des)\s+)?\b([01]?\d|2[0-3])\s*(?:h|heure|heures|:)\s*([0-5]?\d)?\b/g;
    let match;
    while ((match = expression.exec(source))) {
      const prefix = source.slice(Math.max(0, match.index - 18), match.index);
      if (/\b(?:pendant|duree(?:\s+de)?|durant|sur)\s*$/.test(prefix)) continue;
      const time = `${pad(Number(match[1]))}:${pad(Number(match[2] || 0))}`;
      if (!found.some(item => item.index === match.index && item.time === time)) found.push({ index: match.index, time, raw: match[0] });
    }
    const specialTimes = [
      { expression: /\bmidi(?:\s+et\s+demi(?:e)?)?\b/g, hour: 12 },
      { expression: /\bminuit(?:\s+et\s+demi(?:e)?)?\b/g, hour: 0 }
    ];
    specialTimes.forEach(item => {
      let special;
      while ((special = item.expression.exec(source))) {
        const minutes = /demi/.test(special[0]) ? 30 : 0;
        found.push({ index: special.index, time: `${pad(item.hour)}:${pad(minutes)}`, raw: special[0] });
      }
    });
    const wordPattern = [...HOUR_WORDS.keys()].sort((one, two) => two.length - one.length).join('|');
    const minutePattern = [...MINUTE_WORDS.keys()].sort((one, two) => two.length - one.length).join('|');
    const wordHours = new RegExp(`\\b(${wordPattern})\\s+heure(?:s)?(?:\\s+(?:et\\s+)?(${minutePattern}|[0-5]?\\d))?\\b`, 'g');
    while ((match = wordHours.exec(source))) {
      const prefix = source.slice(Math.max(0, match.index - 18), match.index);
      if (/\b(?:pendant|duree(?:\s+de)?|durant|sur)\s*$/.test(prefix)) continue;
      const hour = HOUR_WORDS.get(match[1]);
      const minutes = MINUTE_WORDS.has(match[2]) ? MINUTE_WORDS.get(match[2]) : Number(match[2] || 0);
      if (hour < 24 && minutes < 60) found.push({ index: match.index, time: `${pad(hour)}:${pad(minutes)}`, raw: match[0] });
    }
    found.sort((one, two) => one.index - two.index);
    return found.filter((item, index) => !found.slice(0, index).some(previous => previous.index === item.index && previous.time === item.time));
  }

  function extractDuration(text) {
    const source = normalize(text);
    let match = source.match(/\b(\d{1,3})\s*(?:min|minute|minutes)\b/);
    if (match) return Math.max(15, Number(match[1]));
    const hourExpression = /\b(\d{1,2})\s*(?:h|heure|heures)\s*([0-5]?\d)?\s*(?:min|minute|minutes)?\b/g;
    while ((match = hourExpression.exec(source))) {
      const prefix = source.slice(Math.max(0, match.index - 12), match.index);
      const hours = Number(match[1]);
      if (!/\b(?:pendant|duree|durant|sur|de)\s*$/.test(prefix) || hours > 6) continue;
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

  function editDistance(one, two) {
    const left = normalize(one), right = normalize(two);
    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let row = 1; row <= left.length; row += 1) {
      let diagonal = previous[0]; previous[0] = row;
      for (let column = 1; column <= right.length; column += 1) {
        const above = previous[column], substitution = diagonal + (left[row - 1] === right[column - 1] ? 0 : 1);
        previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, substitution);
        diagonal = above;
      }
    }
    return previous[right.length];
  }

  const significantWords = value => normalize(value).split(' ').filter(word => word.length >= 3);

  function fuzzyEntityCandidates(text, entities, labelKey = 'name') {
    const sourceWords = significantWords(text);
    if (!sourceWords.length) return [];
    return [...(entities || [])].map(item => {
      const label = normalize(item?.[labelKey]), labelWords = significantWords(label);
      if (!labelWords.length) return null;
      let score = 0;
      labelWords.forEach((word, index) => {
        if (sourceWords.includes(word)) score += index === 0 ? 5 : 3;
        else if (word.length >= 4 && sourceWords.some(sourceWord => Math.abs(sourceWord.length - word.length) <= 1 && editDistance(sourceWord, word) <= 1)) score += index === 0 ? 3 : 2;
      });
      if (labelWords.every(word => sourceWords.includes(word))) score += 10;
      return score ? { item, score } : null;
    }).filter(Boolean).sort((one, two) => two.score - one.score || normalize(one.item[labelKey]).localeCompare(normalize(two.item[labelKey])));
  }

  function extractUnknownClientName(text) {
    const source = String(text || '').replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
    const expressions = [
      /(?:rendez[- ]vous)(?:\s+(?:avec|pour|de))?\s+(.+?)(?=\s+(?:aujourd'hui|aujourd hui|demain|après[- ]demain|apres[- ]demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|le\s+\d|[àa]\s+\d|\d{1,2}\s*h|pour\s+(?:une?|le|la)\s+|$))/i,
      /(?:ajoute|crée|cree|note|prends?|programme|planifie|cale|mets?)\s+(.+?)(?=\s+(?:aujourd'hui|aujourd hui|demain|après[- ]demain|apres[- ]demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|le\s+\d|[àa]\s+\d|\d{1,2}\s*h|pour\s+(?:une?|le|la)\s+|$))/i
    ];
    for (const expression of expressions) {
      const match = source.match(expression);
      const candidate = match?.[1]?.replace(/^(?:(?:un|une|le|la|avec|pour|moi|moi un|moi une)\s+)+/i, '').replace(/\s+(?:s il te plait|stp)$/i, '').trim();
      if (candidate && candidate.length >= 2 && candidate.split(' ').length <= 5) return candidate.replace(/(^|[\s-])([a-zà-ÿ])/giu, (_, separator, character) => `${separator}${character.toLocaleUpperCase('fr-FR')}`);
    }
    return '';
  }

  function serviceForText(text, state) {
    const services = state?.settings?.services || [], exact = matchKnownEntity(text, services, 'name');
    if (exact) return exact;
    const fuzzy = fuzzyEntityCandidates(text, services, 'name');
    return fuzzy.length && (fuzzy.length === 1 || fuzzy[0].score > fuzzy[1].score) && fuzzy[0].score >= 3 ? fuzzy[0].item : null;
  }

  function clientCandidatesForText(text, state) {
    const source = ` ${normalize(text)} `, clients = state?.clients || [], exact = matchKnownEntity(text, clients, 'name');
    if (exact) return [exact];
    const firstNameMatches = clients.filter(client => {
      const firstName = normalize(client.name).split(' ')[0];
      return firstName.length >= 3 && source.includes(` ${firstName} `);
    });
    if (firstNameMatches.length) return firstNameMatches;
    const fuzzy = fuzzyEntityCandidates(text, clients, 'name');
    if (!fuzzy.length || fuzzy[0].score < 3) return [];
    const bestScore = fuzzy[0].score;
    return fuzzy.filter(candidate => candidate.score === bestScore).map(candidate => candidate.item);
  }

  function standaloneName(text) {
    const value = String(text || '').replace(/[.!?,;:]+$/g, '').trim();
    const source = normalize(value);
    if (!source || source.split(' ').length > 5 || /\d/.test(source)) return '';
    const excluded = /\b(?:rendez vous|demain|aujourd hui|heure|heures|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|pose|remplissage|depose|renfort|semi permanent|oui|non|confirme)\b/;
    if (excluded.test(source)) return '';
    return value.replace(/^(?:c est|ce sera|pour|avec|la cliente|cliente)\s+/i, '').trim().replace(/(^|[\s-])([a-zà-ÿ])/giu, (_, separator, character) => `${separator}${character.toLocaleUpperCase('fr-FR')}`);
  }

  function clientForText(text, state) {
    const candidates = clientCandidatesForText(text, state);
    return candidates.length === 1 ? candidates[0] : null;
  }

  function inferIntent(text) {
    const source = normalize(text);
    if (!source) return 'unknown';
    const hasDateOrTime = /\b(?:aujourd hui|demain|apres demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|[01]?\d|2[0-3])\s*(?:h|heure|heures|:)\b/.test(source);
    if (/\b(?:annule|annuler|supprime|supprimer|retire|retirer)\b/.test(source) && (/\brendez vous\b/.test(source) || hasDateOrTime || /\b(?:cliente?|prochain)\b/.test(source))) return 'cancel';
    if (/\b(?:deplace|deplacer|decale|decaler|reporte|reporter|change|changer|modifier|bouge|bouger)\b/.test(source) && (/\brendez vous\b/.test(source) || hasDateOrTime || /\b(?:cliente?|prochain)\b/.test(source))) return 'move';
    if (/\b(?:prochain rendez vous|rendez vous suivant|qui est ma prochaine cliente|quelle est ma prochaine cliente|qui je vois ensuite|qui vient ensuite)\b/.test(source)) return 'next_appointment';
    if (/\b(?:commence|commencer|finis|fini|termine|terminer)\b/.test(source)) return 'day_summary';
    if (/\b(?:trouve|trouver|cherche|chercher|disponibilite|disponible|libre|libres|creneau libre|quand puis je|quand est ce que je peux)\b/.test(source)) return 'find_slots';
    if (/\b(?:relance|relances|paiement|paiements|a regler|impaye|impayes)\b/.test(source) && /\b(?:ouvre|ouvrir|affiche|afficher|montre|voir|liste|quels?|qui|relance|relances)\b/.test(source)) return 'reminders';
    if (/\b(?:suivi|cloture|cloturer|fin de journee|bilan de la journee)\b/.test(source)) return 'open_day_review';
    if (/\b(?:ajoute|ajouter|cree|creer|note|noter|prends?|prendre|mets?|mettre|nouveau|nouvelle|programme|programmer|planifie|planifier|cale|caler)\b/.test(source)
      && (/\b(?:rendez vous|cliente?)\b/.test(source) || /\b(?:aujourd hui|demain|apres demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/.test(source) || /\b(?:[01]?\d|2[0-3])\s*(?:h|heure|heures|:)\s*[0-5]?\d?\b/.test(source))) return 'create';
    if (/\b(?:resume|resumer|programme|planning|rendez vous|commence|commencer|finis|fini|termine|terminer|point|combien)\b/.test(source) && /\b(?:aujourd hui|demain|journee|programme|planning|resume|commence|commencer|finis|fini|termine|terminer|point|rendez vous)\b/.test(source)) return 'day_summary';
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

  function nextAppointment(state, now) {
    return (state?.appointments || []).filter(activeAppointment).filter(item => dateTime(item.date, item.time) >= now.getTime()).sort((one, two) => dateTime(one.date, one.time) - dateTime(two.date, two.time))[0] || null;
  }

  const voiceTime = value => String(value || '').replace(':', ' heures ');

  function createClarificationMessage(missing) {
    if (missing.length === 1) {
      if (missing[0] === 'cliente') return 'Pour quelle cliente ?';
      if (missing[0] === 'prestation') return 'Quelle prestation veux-tu prévoir ?';
      if (missing[0] === 'date') return 'Quel jour veux-tu prendre ce rendez-vous ?';
      if (missing[0] === 'heure') return 'À quelle heure ?';
    }
    const labels = { cliente: 'la cliente', prestation: 'la prestation', date: 'le jour', heure: 'l’heure' };
    const parts = missing.map(item => labels[item] || item);
    const last = parts.pop();
    return `Il me manque ${parts.length ? `${parts.join(', ')} et ` : ''}${last}. Tu peux me les donner dans une seule phrase.`;
  }

  function conversationService(state, memory) {
    const services = state?.settings?.services || [];
    return services.find(item => item.id === memory?.serviceId)
      || services.find(item => normalize(item.name) === normalize(memory?.serviceName))
      || null;
  }

  function createMemoryFromAction(action, state) {
    if (action?.type === 'create_appointment') {
      const payload = action.payload || {}, client = (state?.clients || []).find(item => item.id === payload.clientId);
      return {
        intent: 'create',
        entities: {
          clientId: payload.clientId || '', name: client?.name || payload.clientName || '', date: payload.date || '', time: payload.time || '',
          serviceId: payload.serviceId || '', serviceName: payload.service || '', duration: payload.duration, price: payload.price
        }
      };
    }
    if (action?.type === 'move_appointment') {
      return { intent: 'move', appointmentId: action.appointmentId, entities: { date: action.changes?.date || '', time: action.changes?.time || '' } };
    }
    return null;
  }

  function parseCommand(text, context = {}) {
    const state = context.state || {}, now = context.now instanceof Date ? context.now : new Date(), source = normalize(text);
    const conversation = context.conversation || null, dates = extractDates(source, now), times = extractTimes(source);
    const currentClientCandidates = clientCandidatesForText(source, state), currentClient = currentClientCandidates.length === 1 ? currentClientCandidates[0] : null;
    const currentService = serviceForText(source, state), explicitDuration = extractDuration(source), explicitPrice = extractPrice(text);
    let intent = inferIntent(source);
    if (context.forceContinuation && conversation?.intent) intent = conversation.intent;
    else if (intent === 'unknown' && conversation?.intent) intent = conversation.intent;
    else if (intent === 'unknown' && dates.length && times.length && (currentClient || currentService || extractUnknownClientName(text))) intent = 'create';
    const sameConversation = conversation?.intent === intent ? conversation : null, memory = sameConversation?.entities || {};
    const rememberedClient = (state?.clients || []).find(item => item.id === memory.clientId) || null;
    const client = currentClient || rememberedClient;
    const service = currentService || conversationService(state, memory);
    const duration = explicitDuration || (currentService ? Number(currentService.duration) || 60 : Number(memory.duration) || Number(service?.duration) || 60);

    if (intent === 'unknown') return { intent, confidence: 0, missing: [], message: 'Je n’ai pas bien compris. Tu peux dire par exemple : « Ajoute Sarah demain à 14 heures pour un remplissage », ou « Résume ma journée de demain ».' };

    if (intent === 'day_summary') {
      const date = dates[0]?.date || startOfDay(now), summary = daySummary(state, date);
      return { intent, confidence: 1, entities: { date: dateKey(date) }, result: summary, message: summary.message, spoken: summary.appointments.length ? `${summary.appointments.length} rendez-vous. Début à ${voiceTime(summary.firstTime)}, fin à ${voiceTime(summary.lastTime)}.` : summary.message };
    }

    if (intent === 'next_appointment') {
      const appointment = nextAppointment(state, now);
      if (!appointment) return { intent, confidence: 1, result: null, message: 'Tu n’as aucun rendez-vous à venir.', spoken: 'Tu n’as aucun rendez-vous à venir.' };
      const clientItem = (state.clients || []).find(item => item.id === appointment.clientId), date = parseDateKey(appointment.date);
      const message = `Ton prochain rendez-vous est avec ${clientItem?.name || 'une cliente'}, ${date ? formatDate(date) : appointment.date} à ${appointment.time}, pour ${appointment.service || 'une prestation'}.`;
      return { intent, confidence: 1, result: appointment, message, spoken: `Prochain rendez-vous avec ${clientItem?.name || 'une cliente'}, ${date ? formatShortDate(date) : appointment.date} à ${voiceTime(appointment.time)}.` };
    }

    if (intent === 'open_day_review') {
      const date = dates[0]?.date || startOfDay(now);
      return { intent, confidence: 1, entities: { date: dateKey(date) }, navigation: { view: 'day-review', date: dateKey(date) }, message: `J’ouvre le suivi de ${formatDate(date)}.`, spoken: 'J’ouvre le suivi de la journée.' };
    }

    if (intent === 'reminders') {
      const reminders = paymentReminders(state, now), total = reminders.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
      const names = reminders.slice(0, 3).map(item => (state.clients || []).find(clientItem => clientItem.id === item.clientId)?.name || 'Cliente');
      const message = reminders.length ? `${reminders.length} paiement${reminders.length > 1 ? 's' : ''} à relancer${total ? `, pour ${money(total)}` : ''}. ${names.join(', ')}${reminders.length > 3 ? ` et ${reminders.length - 3} autre${reminders.length > 4 ? 's' : ''}` : ''}.` : 'Tu n’as aucun paiement à relancer aujourd’hui.';
      return { intent, confidence: 1, result: { reminders, total }, navigation: { view: 'payment-reminders' }, message, spoken: reminders.length ? `${reminders.length} paiement${reminders.length > 1 ? 's' : ''} à relancer.` : message };
    }

    if (intent === 'find_slots') {
      const requestedDate = dates[0]?.date || null;
      const slots = findFreeSlots(state, { date: requestedDate, duration, afterTime: times[0]?.time || '', now, limit: 5 });
      const serviceText = service ? ` pour ${service.name}` : '';
      const message = slots.length ? `Voici ${slots.length} créneau${slots.length > 1 ? 'x' : ''} libre${slots.length > 1 ? 's' : ''}${serviceText} : ${slots.map(slot => slot.label).join(', ')}.` : `Je n’ai trouvé aucun créneau libre${requestedDate ? ` ${formatDate(requestedDate)}` : ' dans les 14 prochains jours'}.`;
      const spoken = slots.length ? `J’ai trouvé ${slots.length} créneau${slots.length > 1 ? 'x' : ''}. Le premier est ${formatShortDate(parseDateKey(slots[0].date))} à ${voiceTime(slots[0].time)}.` : message;
      return { intent, confidence: 1, entities: { date: requestedDate ? dateKey(requestedDate) : '', duration, serviceId: service?.id || '' }, result: { slots }, message, spoken };
    }

    if (intent === 'create') {
      const continuationName = !client && !memory.name && sameConversation ? standaloneName(text) : '';
      const name = client?.name || extractUnknownClientName(text) || continuationName || memory.name || '';
      const date = dates[0]?.date || parseDateKey(memory.date) || null, time = times[0]?.time || memory.time || '';
      const price = explicitPrice ?? (currentService ? currentService.price ?? '' : memory.price ?? service?.price ?? '');
      if (!client && currentClientCandidates.length > 1) {
        const choices = currentClientCandidates.slice(0, 6).map(item => ({ id: item.id, label: item.name }));
        return {
          intent, confidence: 0.55, missing: ['cliente précise'], choices,
          conversation: { intent, entities: { ...memory, name: '', date: date ? dateKey(date) : '', time, serviceId: service?.id || '', serviceName: service?.name || '', duration, price } },
          message: `J’ai trouvé plusieurs clientes qui correspondent. Laquelle veux-tu choisir ?`
        };
      }
      const missing = [];
      if (!name) missing.push('cliente');
      if (!date) missing.push('date');
      if (!time) missing.push('heure');
      if (!service) missing.push('prestation');
      const collected = { clientId: client?.id || '', name, date: date ? dateKey(date) : '', time, serviceId: service?.id || '', serviceName: service?.name || '', duration, price };
      if (missing.length) {
        const message = createClarificationMessage(missing);
        return { intent, confidence: 0.65, missing, entities: collected, conversation: { intent, entities: collected }, message, spoken: message };
      }
      const action = {
        type: 'create_appointment',
        payload: {
          id: uid(), clientId: client?.id || '', clientName: name, date: dateKey(date), time, duration,
          serviceId: service.id, service: service.name, serviceColor: service.color || 'rose', price,
          status: 'confirmed', paymentStatus: 'unreviewed', paymentDate: '', paymentReminderDate: '', paymentMethod: '', notes: ''
        }
      };
      const conflicts = conflictsFor(state, action.payload);
      const warning = conflicts.length ? ` Attention, ce créneau chevauche ${conflicts.length > 1 ? `${conflicts.length} éléments` : conflicts[0].label}.` : ' Aucun conflit détecté.';
      const message = `${name}, ${service.name}, ${formatDate(date)} de ${time} à ${timeText(toMinutes(time) + duration)}.${warning} Veux-tu confirmer ?`;
      const spokenWarning = conflicts.length ? 'Attention, il y a un conflit.' : 'Aucun conflit.';
      return { intent, confidence: 1, entities: action.payload, action, conflicts, conversation: createMemoryFromAction(action, state), message, spoken: `${name}, ${formatShortDate(date)} à ${voiceTime(time)}. ${spokenWarning} Tu confirmes ?` };
    }

    if (intent === 'move' || intent === 'cancel') {
      const rememberedAppointment = (state.appointments || []).find(item => item.id === sameConversation?.appointmentId) || null;
      const resolution = rememberedAppointment ? { candidates: [rememberedAppointment], appointment: rememberedAppointment } : resolveAppointment(source, state, now, intent, dates, times, client);
      if (!resolution.appointment) {
        if (resolution.candidates.length > 1) {
          const choices = resolution.candidates.slice(0, 5).map(item => ({ id: item.id, label: appointmentLabel(item, state) }));
          const rememberedDestination = intent === 'move' ? {
            date: dates.length ? dateKey(dates[dates.length - 1].date) : memory.date || '',
            time: times.length ? times[times.length - 1].time : memory.time || ''
          } : memory;
          return { intent, confidence: 0.5, missing: ['rendez-vous précis'], choices, conversation: { intent, entities: rememberedDestination }, message: 'J’ai trouvé plusieurs rendez-vous possibles. Lequel veux-tu choisir ?' };
        }
        return { intent, confidence: 0.4, missing: ['rendez-vous'], conversation: { intent, entities: memory }, message: 'Je ne trouve pas le rendez-vous concerné. Donne-moi le nom de la cliente et, si possible, la date.' };
      }
      const appointment = resolution.appointment;
      if (intent === 'cancel') {
        const action = { type: 'cancel_appointment', appointmentId: appointment.id, changes: { status: 'cancelled' } };
        return { intent, confidence: 1, action, appointment, message: `Tu veux annuler ${appointmentLabel(appointment, state)}. Veux-tu confirmer ?`, spoken: `Annuler le rendez-vous de ${appointmentLabel(appointment, state)}. Tu confirmes ?` };
      }
      const newDate = dates.length ? dates[dates.length - 1].date : parseDateKey(memory.date), newTime = times.length ? times[times.length - 1].time : memory.time || '';
      const missing = [];
      if (!newDate) missing.push('nouvelle date');
      if (!newTime) missing.push('nouvelle heure');
      if (missing.length) {
        const message = missing.length === 2 ? `J’ai trouvé ${appointmentLabel(appointment, state)}. Quel nouveau jour et quelle nouvelle heure veux-tu ?` : `J’ai trouvé ${appointmentLabel(appointment, state)}, mais il me manque ${missing[0]}.`;
        return { intent, confidence: 0.65, missing, appointment, conversation: { intent, appointmentId: appointment.id, entities: { date: newDate ? dateKey(newDate) : '', time: newTime } }, message, spoken: message };
      }
      const draft = { ...appointment, date: dateKey(newDate), time: newTime }, conflicts = conflictsFor(state, draft, appointment.id);
      const action = { type: 'move_appointment', appointmentId: appointment.id, changes: { date: draft.date, time: draft.time } };
      const warning = conflicts.length ? ` Attention, le nouveau créneau chevauche ${conflicts.length > 1 ? `${conflicts.length} éléments` : conflicts[0].label}.` : ' Aucun conflit détecté.';
      const message = `${appointmentLabel(appointment, state)} sera déplacé ${formatDate(newDate)} à ${newTime}.${warning} Veux-tu confirmer ?`;
      return { intent, confidence: 1, action, appointment, conflicts, conversation: createMemoryFromAction(action, state), message, spoken: `Déplacer ce rendez-vous ${formatShortDate(newDate)} à ${voiceTime(newTime)}. ${conflicts.length ? 'Attention, il y a un conflit.' : 'Aucun conflit.'} Tu confirmes ?` };
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
      return { kind: 'preview', message: parsed.message, spoken: parsed.spoken || parsed.message, confirmationId, action: clone(parsed.action), conflicts: clone(parsed.conflicts || []), parsed };
    }
    if (parsed.missing?.length || parsed.choices?.length) return { kind: 'clarification', message: parsed.message, spoken: parsed.spoken || parsed.message, missing: parsed.missing || [], choices: parsed.choices || [], parsed };
    if (parsed.intent === 'unknown') return { kind: 'error', message: parsed.message, spoken: parsed.spoken || parsed.message, parsed };
    return { kind: 'answer', message: parsed.message, spoken: parsed.spoken || parsed.message, navigation: parsed.navigation || null, result: parsed.result || null, parsed };
  }

  function isAffirmative(text) {
    const source = normalize(text)
      .replace(/\s+(?:le|ce|ca|cela)\s+rendez vous$/g, '')
      .replace(/\s+(?:la|cette)\s+proposition$/g, '');
    return /^(?:oui(?:\s+(?:(?:je\s+)?(?:confirme|valide)|vas y|c est bon|tu peux (?:confirmer|valider|enregistrer)))?|ok(?:ay)?|d accord|vas y|confirme|confirmer|valide|valider|enregistre|c est bon|tu peux (?:confirmer|valider|enregistrer))$/.test(source);
  }

  function isNegative(text) {
    return /^(?:non|annule|annuler|laisse tomber|ne fais rien|oublie|stop)$/.test(normalize(text));
  }

  function looksLikeCorrection(text, state, now, action = null) {
    const source = normalize(text);
    if (/\b(?:plutot|finalement|en fait|corrige|correction|je voulais dire|non mais|change|changer|remplace)\b/.test(source)) return true;
    const inferred = inferIntent(source);
    const expected = action?.type === 'create_appointment' ? 'create' : action?.type === 'move_appointment' ? 'move' : action?.type === 'cancel_appointment' ? 'cancel' : '';
    if (inferred === expected) return true;
    if (inferred !== 'unknown') return false;
    return extractDates(source, now).length > 0 || extractTimes(source).length > 0 || extractDuration(source) !== null || extractPrice(text) !== null || Boolean(serviceForText(source, state)) || clientCandidatesForText(source, state).length > 0;
  }

  function createAssistant(options = {}) {
    const getState = typeof options.getState === 'function' ? options.getState : () => options.state || {};
    const execute = typeof options.execute === 'function' ? options.execute : null;
    const navigate = typeof options.navigate === 'function' ? options.navigate : null;
    const now = typeof options.now === 'function' ? options.now : () => new Date();
    const pending = new Map();
    let lastConfirmationId = '';
    let dialogue = null;
    let lastChoices = [];

    async function confirm(confirmationId = lastConfirmationId) {
      const action = pending.get(confirmationId);
      if (!action) return { kind: 'error', message: 'Cette confirmation a expiré. Reformule ta demande.', spoken: 'Cette confirmation a expiré.' };
      if (!execute) return { kind: 'error', message: 'L’application n’a pas encore relié cette action à l’agenda.', spoken: 'Je ne peux pas encore enregistrer cette action.' };
      pending.delete(confirmationId); if (lastConfirmationId === confirmationId) lastConfirmationId = '';
      dialogue = null; lastChoices = [];
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
      dialogue = null; lastChoices = [];
      return { kind: 'cancelled', message: removed ? 'D’accord, je n’ai rien modifié.' : 'Cette proposition n’était plus active.', spoken: 'D’accord.' };
    }

    return {
      submit(text) {
        const state = getState(), currentTime = now();
        if (lastConfirmationId && isAffirmative(text)) return confirm(lastConfirmationId);
        if (lastConfirmationId && isNegative(text)) return Promise.resolve(reject(lastConfirmationId));
        if (!lastConfirmationId && dialogue && isNegative(text)) {
          dialogue = null; lastChoices = [];
          return Promise.resolve({ kind: 'cancelled', message: 'D’accord, on laisse tomber. Rien n’a été modifié.', spoken: 'D’accord, on laisse tomber.' });
        }

        let parsingText = text, forceContinuation = false;
        const chosen = lastChoices.find(choice => normalize(choice.label) === normalize(text));
        if (chosen && dialogue) {
          if (dialogue.intent === 'create') dialogue = { ...dialogue, entities: { ...(dialogue.entities || {}), clientId: chosen.id, name: chosen.label } };
          else if (dialogue.intent === 'move' || dialogue.intent === 'cancel') dialogue = { ...dialogue, appointmentId: chosen.id };
          parsingText = ''; forceContinuation = true;
        }

        if (lastConfirmationId) {
          const pendingAction = pending.get(lastConfirmationId);
          if (pendingAction && looksLikeCorrection(text, state, currentTime, pendingAction)) {
            dialogue = createMemoryFromAction(pendingAction, state);
            pending.clear(); lastConfirmationId = ''; lastChoices = [];
            forceContinuation = true;
          } else {
            pending.clear(); lastConfirmationId = ''; dialogue = null; lastChoices = [];
          }
        }

        const parsed = parseCommand(parsingText, { state, now: currentTime, conversation: dialogue, forceContinuation });
        if (parsed.action) pending.clear();
        const response = responseFromParsed(parsed, pending);
        if (response.confirmationId) lastConfirmationId = response.confirmationId;
        dialogue = response.kind === 'clarification' ? parsed.conversation || dialogue : null;
        lastChoices = response.choices || [];
        if (response.navigation && navigate) navigate(response.navigation);
        return Promise.resolve(response);
      },
      confirm,
      reject,
      clearPending() { pending.clear(); lastConfirmationId = ''; dialogue = null; lastChoices = []; },
      pendingCount() { return pending.size; }
    };
  }

  function createVoiceController(options = {}) {
    const scope = options.scope || (typeof window !== 'undefined' ? window : globalThis);
    const Recognition = scope.SpeechRecognition || scope.webkitSpeechRecognition;
    const synthesis = scope.speechSynthesis, Utterance = scope.SpeechSynthesisUtterance;
    let recognition = null, activeSession = null, listening = false, speechTimer = null, currentUtterance = null, availableVoices = [], speechGeneration = 0;
    const emitState = state => options.onState?.(state);

    function refreshVoices() {
      try { availableVoices = [...(synthesis?.getVoices?.() || [])]; }
      catch { availableVoices = []; }
      const voices = getVoices();
      options.onVoicesChanged?.(voices);
      return voices;
    }

    function getVoices() {
      return availableVoices.map(voice => ({
        name: voice.name || '', lang: voice.lang || '', voiceURI: voice.voiceURI || '',
        default: Boolean(voice.default), localService: voice.localService !== false
      }));
    }

    function chooseVoice(speakOptions = {}) {
      const preferred = normalize(speakOptions.voiceURI || speakOptions.voiceName || options.voiceURI || options.voiceName || '');
      if (preferred) {
        const selected = availableVoices.find(voice => normalize(voice.voiceURI) === preferred || normalize(voice.name) === preferred);
        if (selected) return selected;
      }
      const lang = String(speakOptions.lang || options.lang || 'fr-FR').replace('_', '-').toLowerCase();
      const language = lang.split('-')[0];
      const scored = availableVoices.map((voice, index) => {
        const voiceLang = String(voice.lang || '').replace('_', '-').toLowerCase(), name = normalize(voice.name);
        let score = voiceLang === lang ? 100 : voiceLang.split('-')[0] === language ? 60 : 0;
        if (voice.localService !== false) score += 12;
        if (voice.default) score += 8;
        if (/premium|enhanced|natural|amelie|audrey|aurelie|thomas/.test(name)) score += 10;
        if (/compact|eloquence/.test(name)) score -= 15;
        return { voice, score, index };
      }).filter(item => item.score >= 60).sort((one, two) => two.score - one.score || one.index - two.index);
      return scored[0]?.voice || null;
    }

    function stopSpeaking() {
      speechGeneration += 1;
      if (speechTimer) scope.clearTimeout?.(speechTimer);
      speechTimer = null; currentUtterance = null;
      try { synthesis?.cancel?.(); } catch {}
      if (!listening) emitState('idle');
    }

    refreshVoices();
    if (synthesis?.addEventListener) synthesis.addEventListener('voiceschanged', refreshVoices);
    else if (synthesis && 'onvoiceschanged' in synthesis) {
      const previousHandler = synthesis.onvoiceschanged;
      synthesis.onvoiceschanged = event => { if (typeof previousHandler === 'function') previousHandler.call(synthesis, event); refreshVoices(); };
    }

    return {
      supported: Boolean(Recognition),
      get listening() { return listening; },
      start() {
        if (!Recognition) {
          const error = new Error('RECONNAISSANCE_VOCALE_INDISPONIBLE');
          options.onError?.(error); return Promise.reject(error);
        }
        if (recognition || listening) return Promise.reject(new Error('ECOUTE_DEJA_ACTIVE'));
        stopSpeaking();
        const instance = new Recognition(), session = { aborted: false, failed: false, settled: false, finalText: '', interimText: '' };
        recognition = instance; activeSession = session; instance.lang = options.lang || 'fr-FR';
        instance.continuous = false; instance.interimResults = true; instance.maxAlternatives = 1;
        return new Promise((resolve, reject) => {
          const settle = (callback, value) => { if (session.settled) return; session.settled = true; callback(value); };
          const cleanup = () => {
            if (recognition === instance) recognition = null;
            if (activeSession === session) activeSession = null;
            listening = false;
          };
          instance.onstart = () => { if (session.aborted) return; listening = true; emitState('listening'); };
          instance.onresult = event => {
            if (session.aborted || session.failed) return;
            let interim = '';
            for (let index = event.resultIndex; index < event.results.length; index += 1) {
              const transcript = event.results[index][0]?.transcript || '';
              if (event.results[index].isFinal) session.finalText += `${transcript} `;
              else interim += transcript;
            }
            session.interimText = interim || session.interimText;
            options.onInterim?.(`${session.finalText}${interim}`.trim());
          };
          instance.onerror = event => {
            if (session.settled) return;
            if (session.aborted || event.error === 'aborted') { settle(resolve, ''); return; }
            session.failed = true; cleanup(); emitState('idle');
            const error = new Error(event.error || 'ERREUR_RECONNAISSANCE_VOCALE'); options.onError?.(error); settle(reject, error);
          };
          instance.onend = () => {
            if (session.settled) return;
            cleanup(); emitState('idle');
            if (session.aborted || session.failed) { settle(resolve, ''); return; }
            const transcript = (session.finalText.trim() || session.interimText.trim());
            if (transcript) options.onTranscript?.(transcript);
            settle(resolve, transcript);
          };
          try { instance.start(); }
          catch (error) { cleanup(); emitState('idle'); options.onError?.(error); settle(reject, error); }
        });
      },
      stop() { recognition?.stop(); },
      abort() {
        if (activeSession) activeSession.aborted = true;
        try { recognition?.abort(); } catch {}
        recognition = null; activeSession = null; listening = false; emitState('idle');
      },
      speak(text, speakOptions = {}) {
        const content = String(text || '').trim();
        if (!synthesis || !Utterance || !content || speakOptions.enabled === false) return false;
        const wasBusy = Boolean(synthesis.speaking || synthesis.pending);
        stopSpeaking();
        const generation = speechGeneration;
        if (!availableVoices.length) refreshVoices();
        const utterance = new Utterance(content);
        utterance.lang = speakOptions.lang || options.lang || 'fr-FR';
        utterance.rate = Math.min(1.4, Math.max(0.7, Number(speakOptions.rate ?? options.rate ?? 0.96)));
        utterance.pitch = Math.min(1.3, Math.max(0.7, Number(speakOptions.pitch ?? options.pitch ?? 1)));
        const voice = chooseVoice(speakOptions); if (voice) utterance.voice = voice;
        utterance.onstart = () => { if (generation !== speechGeneration) return; currentUtterance = utterance; emitState('speaking'); options.onSpeechStart?.(); };
        utterance.onend = () => { if (generation !== speechGeneration || currentUtterance !== utterance) return; currentUtterance = null; emitState('idle'); options.onSpeechEnd?.(); };
        utterance.onerror = event => { if (generation !== speechGeneration || currentUtterance !== utterance) return; currentUtterance = null; emitState('idle'); options.onSpeechError?.(event); };
        const run = () => {
          speechTimer = null;
          if (generation !== speechGeneration) return;
          currentUtterance = utterance;
          try { synthesis.resume?.(); synthesis.speak(utterance); }
          catch (error) { currentUtterance = null; options.onSpeechError?.(error); }
        };
        if (wasBusy && scope.setTimeout) speechTimer = scope.setTimeout(run, 40);
        else run();
        return true;
      },
      stopSpeaking,
      getVoices,
      refreshVoices
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
    const directCreation = parseCommand('Sarah demain quatorze heures remplissage', { state, now });
    test('phrase naturelle sans verbe', directCreation.action?.type === 'create_appointment' && directCreation.action?.payload.time === '14:00');
    const fuzzyClient = parseCommand('Programme Sara demain à 16h pour un remplissage', { state, now });
    test('prénom proche reconnu prudemment', fuzzyClient.action?.payload.clientId === 'c1');
    const wordMinutes = extractTimes('finalement à quinze heures trente');
    test('heure entièrement dictée en lettres', wordMinutes[0]?.time === '15:30');
    const durationOnly = extractTimes('prévois une durée de 1h30');
    test('durée non confondue avec heure', durationOnly.length === 0);
    const next = parseCommand('Qui est ma prochaine cliente ?', { state, now });
    test('prochain rendez-vous', next.intent === 'next_appointment' && next.result?.id === 'a1');
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
    const multiTurnOne = await assistant.submit('Programme Sarah demain');
    const multiTurnTwo = await assistant.submit('remplissage à quatorze heures');
    tests.push({ name: 'dialogue multi-tour', passed: multiTurnOne.kind === 'clarification' && multiTurnTwo.kind === 'preview' && multiTurnTwo.action?.payload.time === '14:00' && executions === 1 });
    const corrected = await assistant.submit('non, finalement à quinze heures trente');
    tests.push({ name: 'correction avant confirmation', passed: corrected.kind === 'preview' && corrected.action?.payload.time === '15:30' && executions === 1 && assistant.pendingCount() === 1 });
    const correctedConfirmation = await assistant.submit('oui je confirme');
    tests.push({ name: 'correction confirmée une fois', passed: correctedConfirmation.kind === 'success' && executions === 2 && executedAction?.payload?.time === '15:30' && assistant.pendingCount() === 0 });
    return { passed: tests.filter(item => item.passed).length, total: tests.length, failures: tests.filter(item => !item.passed).map(item => item.name), tests };
  }

  return Object.freeze({
    version: '1.1.0', normalize, extractDates, extractTimes, extractDuration, extractPrice, inferIntent, parseCommand,
    findFreeSlots, conflictsFor, daySummary, paymentReminders, applyActionToState,
    createAssistant, createVoiceController, runSelfTests, runAsyncSelfTests
  });
});
