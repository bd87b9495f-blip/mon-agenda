import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { makeDom } from './helpers/atelier-dom.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(root, 'storage.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const TODAY = '2026-10-28';
const NativeDate = Date;
class FixedDate extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [`${TODAY}T12:00:00.000Z`])); }
  static now() { return new NativeDate(`${TODAY}T12:00:00.000Z`).getTime(); }
}
const appointment = (overrides = {}) => ({ id: 'rdv-1', clientId: 'c-1', date: '2026-10-28', time: '09:00', duration: 60, price: '42', supplements: [], serviceId: 's-1', service: 'Pose', serviceColor: 'rose', status: 'completed', paymentStatus: 'paid', paymentDate: TODAY, refundDate: '', paymentReminderDate: '', paymentMethod: 'cash', notes: '', history: [], ...overrides });
const task = (overrides = {}) => ({ id: 't-1', title: 'Acheter des limes', dueDate: '', completed: false, createdAt: '2026-10-27T12:00:00.000Z', updatedAt: '2026-10-27T12:00:00.000Z', completedAt: '', ...overrides });
function initial(overrides = {}) {
  return { version: 16, clients: [{ id: 'c-1', name: 'Cliente fictive', phone: '0600000000' }], appointments: [], blocks: [], expenses: [], tasks: [], settings: { services: [{ id: 's-1', name: 'Pose', duration: 60, price: '42', color: 'rose', active: true }], supplementTypes: [], clientBadges: [], expenseCategories: [{ id: 'cat-1', name: 'Matériel', active: true }] }, ...overrides };
}
function harness(state = initial(), options = {}) {
  const dom = makeDom(html), values = new Map(Object.entries(options.local || {})), writes = [], confirmations = [], exports = [], errors = [];
  let seq = 0, now = FixedDate.now();
  class HarnessDate extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const context = {
    console, Date: HarnessDate, Intl, JSON, Math, Map, Set, Promise, structuredClone, Blob, Event,
    crypto: { randomUUID: () => `new-${++seq}` }, document: dom.document,
    navigator: {}, window: { confirm: text => { confirmations.push(text); return options.confirm !== false; }, alert: text => errors.push(text) },
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) },
    setTimeout: () => 1, clearTimeout() {},
    recordExport: (blob, filename) => exports.push({ blob, filename }), recordAlert: message => errors.push(message)
  };
  context.globalThis = context;
  vm.runInNewContext(storageSource, context, { filename: 'storage.atelier-dom.js' });
  const cut = source.indexOf('\n  if (globalThis.setInterval)');
  assert.ok(cut > 0, 'Point de coupe avant démarrage conservé');
  const expose = `
    shareOrDownload = async (blob, filename) => recordExport(blob, filename);
    showAppAlert = recordAlert;
    globalThis.hooks = {
      setState: state => { app.state = migrateState(state); lastCommittedState = cloneState(app.state); invalidateDataIndexes(); },
      state: () => cloneState(app.state), ui: () => app.ui,
      setAdapter: adapter => { storageAdapter = adapter; },
      render, renderAgenda, renderReport, todayKey, openAppointment, getDraft,
      openSettings, showSettingsPage, saveAppearance,
      suggestedAppointmentSlots: (...args) => suggestedAppointmentSlots(...args),
      openTask, saveTask, toggleTask, deleteTask, taskDraftValues, saveTaskDraft, taskFormDraft,
      resumeLatestDraft, renderDraftNotice, requestDialogClose,
      duplicateExpense: id => duplicateExpense(id), saveExpense,
      displayMoney, money, setPrivacyMode, exportReportCsv,
      summary: (start, end) => financialSummary(parseDate(start), parseDate(end)),
      taskSaving: () => app.ui.taskSaving,
      flushSaves: () => applicationSaveQueue,
      refreshTimeSensitiveUI: () => refreshTimeSensitiveUI(),
      setExclusive: enabled => { exclusiveReplacementToken = enabled ? 'qa-replacement' : null; }
    };
  })();`;
  vm.runInNewContext(source.slice(0, cut) + expose, context, { filename: 'app.atelier-dom.js' });
  const hooks = context.hooks;
  hooks.setState(state);
  hooks.setAdapter({ mode: 'indexeddb', async save(candidate, meta) { writes.push({ candidate: structuredClone(candidate), meta }); if (options.failSave) throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' }); return { mode: 'indexeddb', snapshotOk: true }; }, async recordError() {} });
  return { ...dom, advanceTime: ms => { now += ms; }, hooks, values, writes, confirmations, exports, errors, element: id => dom.document.querySelector(`#${id}`) };
}

// These tests execute the actual listeners and domain functions. They do not
// replace the real iPhone/Safari, IndexedDB, offline and layout acceptance tests.
test('les IDs sont uniques et les références de libellés/dialogues visent le HTML livré', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'Un ID dupliqué rendrait les branchements ambigus');
  const known = new Set(ids);
  for (const match of html.matchAll(/\b(?:for|aria-labelledby|aria-describedby)="([^"]+)"/g)) {
    for (const ref of match[1].split(/\s+/)) assert.ok(known.has(ref), `Référence manquante ${ref}`);
  }
});

test('tous les branchements initiaux utilisent des éléments réellement présents et Jour ouvre la date actuelle', () => {
  const h = harness();
  assert.equal(h.hooks.ui().screen, 'agenda'); assert.equal(h.hooks.ui().mode, 'day');
  assert.equal(h.hooks.todayKey(), TODAY);
  h.hooks.render();
  assert.equal(h.element('dayView').hidden, false);
  assert.equal(h.element('fullWeekView').hidden, true);
  assert.equal(h.element('monthView').hidden, true);
  assert.match(h.element('dayTimeline').innerHTML, /timeline|hour|create-time/);
});

test('une tâche sans échéance est enregistrée via saveState, complétée puis réouverte', async () => {
  const h = harness(); h.hooks.openTask(); h.element('taskTitle').value = 'Commander les limes';
  assert.equal(await h.hooks.saveTask(), true);
  const saved = h.hooks.state().tasks[0];
  assert.equal(saved.title, 'Commander les limes'); assert.equal(saved.dueDate, ''); assert.equal(saved.completed, false);
  assert.equal(h.writes[0].meta.reason, 'task-create'); assert.equal(h.element('taskDialog').open, false);
  assert.equal(await h.hooks.toggleTask(saved.id), true);
  assert.equal(h.hooks.state().tasks[0].completed, true); assert.ok(h.hooks.state().tasks[0].completedAt);
  assert.equal(await h.hooks.toggleTask(saved.id), true);
  assert.equal(h.hooks.state().tasks[0].completed, false); assert.equal(h.hooks.state().tasks[0].completedAt, '');
});

test('échec de sauvegarde : création et complétion de tâche reviennent à la dernière version valide', async () => {
  const h = harness(initial({ tasks: [task()] }), { failSave: true }); const before = JSON.stringify(h.hooks.state());
  h.hooks.openTask(); h.element('taskTitle').value = 'Ne doit pas être enregistrée';
  assert.equal(await h.hooks.saveTask(), false); assert.equal(JSON.stringify(h.hooks.state()), before);
  assert.equal(h.element('taskDialog').open, true); assert.equal(h.hooks.taskSaving(), false);
  assert.equal(await h.hooks.toggleTask('t-1'), false); assert.equal(JSON.stringify(h.hooks.state()), before);
  assert.ok(h.errors.some(e => e.includes('dernière version valide')));
});

test('une tâche refuse une date invalide et ne peut pas écrire pendant une restauration', async () => {
  const h = harness(); h.hooks.openTask(); h.element('taskTitle').value = 'Essai'; h.element('taskDueDate').value = '2026-02-30';
  assert.equal(await h.hooks.saveTask(), false); assert.equal(h.writes.length, 0);
  h.element('taskDueDate').value = ''; h.hooks.setExclusive(true);
  assert.equal(await h.hooks.saveTask(), false); assert.equal(h.writes.length, 0);
});

test('fermer une tâche modifiée propose une protection et le brouillon peut être repris', () => {
  const h = harness(); h.hooks.openTask(); h.element('taskTitle').value = 'Brouillon fictif'; h.element('taskDueDate').value = '2026-10-30';
  h.hooks.saveTaskDraft(); assert.equal(h.hooks.taskFormDraft().values.title, 'Brouillon fictif');
  h.hooks.requestDialogClose('taskDialog'); assert.equal(h.element('unsavedChangesDialog').open, true);
  h.element('taskDialog').close(); h.element('unsavedChangesDialog').close(); h.element('taskTitle').value = '';
  h.hooks.renderDraftNotice(); h.hooks.resumeLatestDraft();
  assert.equal(h.element('taskDialog').open, true); assert.equal(h.element('taskTitle').value, 'Brouillon fictif');
  assert.equal(h.element('taskDueDate').value, '2026-10-30'); assert.equal(h.writes.length, 0);
});

test('la suppression de tâche demande confirmation et un refus conserve les données', async () => {
  const h = harness(initial({ tasks: [task()] }), { confirm: false });
  assert.equal(await h.hooks.deleteTask('t-1'), false); assert.equal(h.hooks.state().tasks.length, 1); assert.equal(h.writes.length, 0);
  assert.equal(h.confirmations.length, 1);
});

test('discrétion : affichage masqué, données/calculs/CSV inchangés', async () => {
  const h = harness(initial({ appointments: [appointment()] }));
  h.hooks.ui().reportTab = 'payments'; h.hooks.ui().reportMode = 'day'; h.hooks.ui().reportDate = new FixedDate(`${TODAY}T12:00:00Z`);
  const before = JSON.stringify(h.hooks.state()); const sum = JSON.stringify(h.hooks.summary(TODAY, '2026-10-29'));
  await h.hooks.exportReportCsv(); const original = await h.exports[0].blob.text();
  h.hooks.setPrivacyMode(true);
  assert.equal(h.hooks.displayMoney(42), '•••'); assert.match(h.hooks.money(42), /42/);
  assert.equal(JSON.stringify(h.hooks.state()), before); assert.equal(JSON.stringify(h.hooks.summary(TODAY, '2026-10-29')), sum);
  await h.hooks.exportReportCsv(); const maskedModeExport = await h.exports[1].blob.text();
  assert.equal(maskedModeExport, original); assert.match(maskedModeExport, /42\.00/); assert.doesNotMatch(maskedModeExport, /•••/);
  assert.equal(h.writes.length, 0);
});

test('le Bilan en discrétion masque les montants mais conserve les libellés financiers', () => {
  const h = harness(initial({ appointments: [appointment()] }));
  h.hooks.ui().reportTab = 'payments'; h.hooks.ui().reportMode = 'day'; h.hooks.ui().reportDate = new FixedDate(`${TODAY}T12:00:00Z`);
  h.hooks.setPrivacyMode(true); h.hooks.renderReport();
  assert.doesNotMatch(h.element('reportSummary').innerHTML, /42(?:[.,]00)?\s*€/);
  assert.match(h.element('reportSummary').innerHTML, /•••/);
  assert.match(h.element('reportSummary').innerHTML, /[Nn]et|[Ee]ncaissé/);
  assert.equal(h.hooks.ui().privacyMode, true);
});

test('dupliquer une dépense prépare une nouvelle saisie datée du jour et préserve la catégorie historique', async () => {
  const expense = { id: 'e-1', categoryId: 'cat-old', categoryLabel: 'Ancienne catégorie', date: '2026-09-01', amount: 23.5, details: 'Limes', supplier: 'Fournisseur fictif', createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-01T12:00:00.000Z' };
  const h = harness(initial({ expenses: [expense], settings: { expenseCategories: [{ id: 'cat-old', name: 'Ancienne catégorie', active: false }] } }));
  h.hooks.duplicateExpense('e-1');
  assert.equal(h.element('expenseDialog').open, true); assert.notEqual(h.element('expenseId').value, 'e-1');
  assert.equal(h.element('expenseDate').value, TODAY); assert.equal(h.element('expenseAmount').value, '23.5');
  assert.equal(h.element('expenseCategory').value, 'cat-old'); assert.equal(h.element('expenseDetails').value, 'Limes');
  assert.equal(h.writes.length, 0); assert.equal(h.hooks.state().expenses.length, 1);
  assert.equal(await h.hooks.saveExpense(), true);
  assert.equal(h.hooks.state().expenses.length, 2); assert.equal(h.hooks.state().expenses.find(e => e.id === 'e-1').date, '2026-09-01');
});

function workHours(start = '09:00', end = '18:00', breakStart = '12:00', breakEnd = '13:00') {
  return Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, { enabled: d >= 1 && d <= 5, start, end, breakStart, breakEnd }]));
}
const searchOptions = extra => ({ date: TODAY, duration: 60, now: new NativeDate('2026-10-28T07:00:00').getTime(), limit: 100, days: 1, ...extra });

test('créneaux proposés : durée complète, pause, rendez-vous actif et événement informatif respectés', () => {
  const h = harness(initial({ settings: { workingHours: workHours() }, appointments: [appointment({ time: '09:00', duration: 90, status: 'confirmed', paymentStatus: 'unreviewed', paymentDate: '', paymentMethod: '' })], blocks: [{ id: 'info', startDate: TODAY, endDate: TODAY, startTime: '14:00', endTime: '15:00', allDay: false, reason: 'Information', blocksAppointments: false }] }));
  const slots = h.hooks.suggestedAppointmentSlots(searchOptions());
  assert.ok(slots.length > 0);
  for (const slot of slots) {
    const [hour, min] = slot.time.split(':').map(Number), start = hour * 60 + min, end = start + slot.duration;
    assert.ok(start >= 630 && end <= 1080); assert.ok(end <= 720 || start >= 780, `Respect pause ${slot.time}`);
  }
  assert.ok(slots.some(s => s.time === '14:00'), 'Un événement informatif ne bloque pas le créneau');
});

test('créneaux proposés : blocage sur plusieurs jours et rendez-vous débordant de la veille', () => {
  const h = harness(initial({ settings: { workingHours: workHours('00:00', '18:00', '', '') }, appointments: [appointment({ date: '2026-10-27', time: '23:30', duration: 120, status: 'confirmed', paymentStatus: 'unreviewed', paymentDate: '', paymentMethod: '' })] }));
  const early = h.hooks.suggestedAppointmentSlots(searchOptions({ now: new NativeDate('2026-10-28T00:00:00').getTime() }));
  assert.ok(early.length); assert.ok(early.every(s => s.time >= '01:30'));
  const blocked = initial({ settings: { workingHours: workHours() }, blocks: [{ id: 'away', startDate: '2026-10-27', endDate: '2026-10-29', startTime: '00:00', endTime: '00:00', allDay: true, reason: 'Absence', blocksAppointments: true }] });
  h.hooks.setState(blocked);
  assert.equal(h.hooks.suggestedAppointmentSlots(searchOptions()).length, 0);
});

test('la proposition de créneaux n’interdit pas la saisie libre et ne modifie aucune donnée', () => {
  const h = harness(initial({ settings: { workingHours: workHours('09:00', '10:00', '', '') } }));
  const before = JSON.stringify(h.hooks.state());
  h.hooks.openAppointment(null, { date: '2026-10-31', time: '22:00' });
  assert.equal(h.element('appointmentDialog').open, true); assert.equal(h.element('time').value, '22:00'); assert.equal(h.element('date').value, '2026-10-31');
  assert.equal(h.writes.length, 0); assert.equal(JSON.stringify(h.hooks.state()), before);
});

test('parcours réel : Ajouter puis rendez-vous, enregistrer, retrouver et consulter son paiement', async () => {
  const h = harness(); h.hooks.render();
  await h.click('addAppointment'); assert.equal(h.element('quickAddDialog').open, true);
  await h.click('quickAddAppointment'); assert.equal(h.element('quickAddDialog').open, false); assert.equal(h.element('appointmentDialog').open, true);
  h.element('clientName').value = 'Nouvelle cliente de test'; h.element('serviceSelect').value = 's-1'; h.element('price').value = '0';
  h.element('date').value = TODAY; h.element('time').value = '15:00'; h.element('duration').value = '60'; h.element('status').value = 'confirmed';
  await h.submit('appointmentForm'); await h.hooks.flushSaves();
  const saved = h.hooks.state().appointments[0];
  assert.ok(saved); assert.equal(saved.paymentStatus, 'unreviewed'); assert.equal(Number(saved.price), 0);
  assert.equal(h.element('appointmentDialog').open, false);
  const block = h.element('dayTimeline').querySelector(`[data-edit="${saved.id}"]`);
  assert.ok(block, 'Le rendez-vous enregistré apparaît dans le planning');
  await h.click(block); assert.equal(h.element('appointmentDialog').open, true);
  assert.equal(h.element('paymentStatus').value, 'unreviewed'); assert.equal(h.element('appointmentEditFields').hidden, false);
  assert.equal(h.hooks.state().appointments.length, 1);
});

test('actualisation minute : les blocs horaires, le défilement et le focus restent stables', () => {
  const h = harness(initial({ appointments: [appointment({ time: '15:00', status: 'confirmed', paymentStatus: 'unreviewed', paymentDate: '', paymentMethod: '' })] }));
  h.hooks.render(); const timeline = h.element('dayTimeline'), button = timeline.querySelector('[data-edit="rdv-1"]');
  assert.ok(button); button.focus(); timeline.scrollTop = 200;
  const writes = timeline.htmlWrites;
  h.advanceTime(60_000); h.hooks.refreshTimeSensitiveUI();
  assert.equal(timeline.htmlWrites, writes, 'La minuterie ne reconstruit pas innerHTML du planning');
  assert.equal(timeline.querySelector('[data-edit="rdv-1"]'), button); assert.equal(h.document.activeElement, button); assert.equal(timeline.scrollTop, 200);
  h.hooks.openAppointment(null, { date: TODAY, time: '17:00' }); h.element('clientName').value = 'Saisie en cours'; h.element('clientName').focus();
  const formFocus = h.document.activeElement; h.advanceTime(60_000); h.hooks.refreshTimeSensitiveUI();
  assert.equal(h.element('clientName').value, 'Saisie en cours'); assert.equal(h.document.activeElement, formFocus);
});

test('supprimer une tâche confirmée est persistant et un refus du stockage annule la suppression', async () => {
  const h = harness(initial({ tasks: [task()] }));
  assert.equal(await h.hooks.deleteTask('t-1'), true); assert.equal(h.hooks.state().tasks.length, 0);
  assert.equal(h.writes[0].meta.reason, 'task-delete'); assert.equal(h.confirmations.length, 1);
  const failure = harness(initial({ tasks: [task()] }), { failSave: true });
  assert.equal(await failure.hooks.deleteTask('t-1'), false); assert.equal(failure.hooks.state().tasks[0].id, 't-1');
});

test('changer de prestation préserve durée et prix saisis manuellement, même zéro', async () => {
  const h = harness(); h.hooks.openAppointment();
  h.element('duration').value = '90'; h.element('duration').dispatchEvent(new Event('input', { bubbles: true }));
  h.element('price').value = '0'; h.element('price').dispatchEvent(new Event('input', { bubbles: true }));
  h.element('serviceSelect').value = 's-1'; h.element('serviceSelect').dispatchEvent(new Event('change', { bubbles: true }));
  assert.equal(h.element('duration').value, '90'); assert.equal(h.element('price').value, '0');
  const originalDate = h.element('date').value, originalTime = h.element('time').value;
  await h.click('slotSuggestionsToggle');
  assert.equal(h.element('date').value, originalDate); assert.equal(h.element('time').value, originalTime);
  const choice = h.element('slotSuggestionsList').querySelector('[data-slot-date]'); assert.ok(choice);
  await h.click(choice);
  assert.equal(h.element('date').value, choice.dataset.slotDate); assert.equal(h.element('time').value, choice.dataset.slotTime);
  assert.equal(h.element('duration').value, '90'); assert.equal(h.element('price').value, '0'); assert.equal(h.writes.length, 0);
});

test('les créneaux suggérés ignorent annulations et propre RDV modifié, mais pas les horaires passés', () => {
  const h = harness(initial({ settings: { workingHours: workHours('09:00', '12:00', '', '') }, appointments: [appointment({ time: '09:00', duration: 60 }), appointment({ id: 'cancel', time: '10:00', duration: 60, status: 'cancelled' })] }));
  const slots = h.hooks.suggestedAppointmentSlots(searchOptions());
  assert.ok(!slots.some(s => s.time === '09:00')); assert.ok(slots.some(s => s.time === '10:00'));
  assert.ok(h.hooks.suggestedAppointmentSlots(searchOptions({ excludeId: 'rdv-1' })).some(s => s.time === '09:00'));
  const now = new NativeDate('2026-10-28T10:32:00').getTime();
  assert.ok(h.hooks.suggestedAppointmentSlots(searchOptions({ now })).every(s => s.time >= '10:32'));
});

test('enregistrer Clair/Sombre et Confortable/Compact préserve les horaires indépendamment', async () => {
  const h = harness(initial({ settings: { workingHours: workHours('08:00', '17:00', '12:30', '13:30') } }));
  const beforeHours = JSON.stringify(h.hooks.state().settings.workingHours);
  h.hooks.openSettings(); h.hooks.showSettingsPage('appearance');
  h.element('colorTheme').value = 'dark'; h.element('displayDensity').value = 'compact';
  await h.click('saveAppearance');
  assert.equal(h.hooks.state().settings.colorTheme, 'dark'); assert.equal(h.hooks.state().settings.displayDensity, 'compact');
  assert.equal(JSON.stringify(h.hooks.state().settings.workingHours), beforeHours);
  assert.equal(h.document.documentElement.dataset.theme, 'dark');
});

test('actualisation minute : une suggestion de créneau focalisée garde son élément et le focus', async () => {
  const h = harness();
  h.hooks.openAppointment(null, { date: TODAY, time: '15:00' });
  await h.click('slotSuggestionsToggle');
  const list = h.element('slotSuggestionsList'), choice = list.querySelector('[data-slot-date]');
  assert.ok(choice, 'Une suggestion est disponible pour la durée du formulaire');
  choice.focus(); const writes = list.htmlWrites;
  h.advanceTime(60_000); h.hooks.refreshTimeSensitiveUI();
  assert.equal(list.htmlWrites, writes, 'La minuterie ne remplace pas la liste pendant sa navigation');
  assert.equal(list.querySelector('[data-slot-date]'), choice);
  assert.equal(h.document.activeElement, choice);
});
