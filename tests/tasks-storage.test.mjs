import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storageSource = fs.readFileSync(path.join(root, 'storage.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const legacyKey = 'tasks-storage-test';
const databaseName = 'mon-agenda-secure-v1';
const plain = value => JSON.parse(JSON.stringify(value));
const clone = value => value === undefined ? undefined : structuredClone(value);

// Réutilise le simulateur transactionnel de la suite stockage sans exécuter ses tests.
const fakeSource = fs.readFileSync(path.join(root, 'tests/storage-behavior.test.mjs'), 'utf8');
const fakeContext = { assert, clone, databaseName, queueMicrotask, setTimeout, clearTimeout, structuredClone };
vm.runInNewContext(fakeSource.slice(fakeSource.indexOf('class MemoryStorage'), fakeSource.indexOf('function baseState('))
  + '\nglobalThis.fakes = { MemoryStorage, FakeIndexedDB };', fakeContext);
const { MemoryStorage, FakeIndexedDB } = fakeContext.fakes;

function harness(now = '2026-10-28T12:00:00.000Z') {
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  let sequence = 0;
  const context = { console, Date: FixedDate, Intl, JSON, Math, Map, Set, Promise, structuredClone, setTimeout, clearTimeout,
    crypto: { randomUUID: () => `task-test-${++sequence}` }, localStorage: new MemoryStorage() };
  context.globalThis = context;
  vm.runInNewContext(storageSource, context);
  const beforeState = appSource.indexOf('\n  let dataIndexes = null;');
  const backupStart = appSource.indexOf('  function backupCounts(state)');
  const backupEnd = appSource.indexOf('  function backupErrorText(error)');
  assert.ok(beforeState > 0 && backupStart > 0 && backupEnd > backupStart);
  vm.runInNewContext(appSource.slice(0, beforeState)
    + '\n  const cloneState = state => JSON.parse(JSON.stringify(state));\n'
    + appSource.slice(backupStart, backupEnd)
    + '\n globalThis.hooks = { migrateStoredState, migrateState, makeBackupPayload, readValidatedBackupFile, validateBackupEnvelope, backupCounts };\n})();', context);
  return { ...context.hooks, storage: context.AgendaStorage };
}

function v15State() {
  return { version: 15, clients: [{ id: 'c1', name: 'Alice' }],
    appointments: [{ id: 'a1', clientId: 'c1', date: '2026-09-01', time: '10:00', duration: 60, price: '90',
      serviceId: 's1', service: 'Pose', serviceColor: 'rose', status: 'completed', paymentStatus: 'refunded',
      paymentDate: '2026-09-01', refundDate: '2026-10-01', paymentReminderDate: '', paymentMethod: 'card', history: [] }],
    blocks: [], expenses: [], settings: { services: [{ id: 's1', name: 'Pose', duration: 60, price: '90', color: 'rose', active: true }],
      supplementTypes: [], clientBadges: [], expenseCategories: [] } };
}

function task(overrides = {}) {
  return { id: 't1', title: 'Commander les capsules', dueDate: '2026-11-02', completed: false,
    createdAt: '2026-10-28T10:00:00.000Z', updatedAt: '2026-10-28T10:00:00.000Z', completedAt: '', ...overrides };
}

function options(h, indexedDB, localStorage, state, extra = {}) {
  return { indexedDB, localStorage, legacyKey, legacyState: state, legacyFallbackAllowed: true, legacyEvidence: false,
    legacySource: 'test', appVersion: '2026.15', dataVersion: 16, migrationDate: '2026-10-28',
    validateState: (state, context) => h.migrateStoredState(state, context), ...extra };
}

function fileFor(payload) {
  const text = JSON.stringify(payload);
  return { size: Buffer.byteLength(text), text: async () => text };
}

test('v15 vers v16 ajoute les tâches sans réinterpréter paiements et remboursements après recul de l’horloge', () => {
  const h = harness('2026-01-01T12:00:00.000Z'), source = v15State();
  const next = h.migrateStoredState(source, { migrationDate: '2026-01-01' });
  assert.equal(next.version, 16);
  assert.deepEqual(plain(next.tasks), []);
  assert.equal(next.appointments[0].paymentDate, '2026-09-01');
  assert.equal(next.appointments[0].refundDate, '2026-10-01');
  assert.deepEqual(plain(next.appointments[0].history), []);
  const invalid = v15State(); invalid.appointments[0].paymentReminderDate = '2026-09-02';
  assert.throws(() => h.migrateStoredState(invalid), /INVALID_APPOINTMENT_STRUCTURE/);
  delete invalid.appointments[0].paymentReminderDate; delete invalid.appointments[0].refundDate;
  assert.throws(() => h.migrateStoredState(invalid), /INVALID_APPOINTMENT_STRUCTURE/);
});

test('les empreintes historiques restent stables, les titres et états des tâches v16 sont protégés', () => {
  const h = harness(), source = v15State();
  assert.deepEqual(Object.keys(h.storage.counts(source)), ['clients', 'appointments', 'blocks', 'expenses', 'services', 'supplements']);
  // Empreinte du même objet produite par storage.js livré avec 2026.15.1.
  assert.equal(h.storage.checksum(source), 'fnv1a-4d8e635a-574');
  const state = h.migrateStoredState(source); state.tasks = [task()];
  const checksum = h.storage.checksum(state);
  state.tasks[0].title = 'Autre tâche';
  assert.notEqual(h.storage.checksum(state), checksum);
  assert.equal(h.storage.counts(state).tasks, 1);
});

test('les tâches invalides sont refusées avant persistance, y compris dates et doublons', () => {
  const h = harness(), state = h.migrateStoredState(v15State());
  const invalid = [null, { ...task(), id: '' }, { ...task(), id: ' t1' }, { ...task(), id: 1 },
    { ...task(), title: '' }, { ...task(), title: 'x'.repeat(201) }, { ...task(), dueDate: '2026-02-30' },
    { ...task(), dueDate: '2026-01-01T00:00:00Z' }, { ...task(), completed: 'false' },
    { ...task(), createdAt: '2026-02-30T10:00:00.000Z' }, { ...task(), updatedAt: '' },
    { ...task(), completed: true }, { ...task(), completedAt: '2026-10-28T10:00:00.000Z' }];
  for (const value of invalid) assert.throws(() => h.migrateStoredState({ ...state, tasks: [value] }), /INVALID_TASK/);
  assert.throws(() => h.migrateStoredState({ ...state, tasks: [task(), task()] }), /INVALID_TASK/);
  assert.throws(() => h.migrateStoredState({ ...state, tasks: undefined }), /INVALID_TASKS_STRUCTURE/);
  assert.throws(() => h.migrateStoredState({ ...state, tasks: Array(20001).fill(task()) }), /INVALID_TOO_MANY_ITEMS/);
  assert.throws(() => h.migrateStoredState({ ...v15State(), tasks: [task()] }), /INVALID_TASKS_VERSION/);
});

test('JSON format4 conserve les tâches, leurs compteurs et accepte encore une sauvegarde v15', async () => {
  const h = harness(), state = h.migrateStoredState(v15State()); state.tasks = [task()];
  const backup = h.makeBackupPayload(state);
  assert.equal(backup.backupFormatVersion, 4); assert.equal(backup.dataVersion, 16); assert.equal(backup.counts.tasks, 1);
  const restored = await h.readValidatedBackupFile(fileFor(backup));
  assert.deepEqual(plain(restored.state.tasks), [task()]);
  const old = h.makeBackupPayload(v15State());
  assert.equal(old.dataVersion, 15); assert.equal(Object.hasOwn(old.counts, 'tasks'), false);
  assert.deepEqual(plain((await h.readValidatedBackupFile(fileFor(old))).state.tasks), []);
  assert.throws(() => h.validateBackupEnvelope(v15State()), /INVALID_BACKUP_FORMAT/);
  backup.state.tasks[0].title = 'Titre altéré';
  await assert.rejects(h.readValidatedBackupFile(fileFor(backup)), /INVALID_BACKUP_CHECKSUM/);
  const incomplete = h.makeBackupPayload(state); delete incomplete.counts.tasks;
  await assert.rejects(h.readValidatedBackupFile(fileFor(incomplete)), /INVALID_BACKUP_COUNTS/);
});

test('la montée IndexedDB2 vers3 garde le brut v15 et sa provenance avant le premier commit de tâches', async () => {
  const h = harness(), indexedDB = new FakeIndexedDB(), localStorage = new MemoryStorage(), raw = v15State();
  const names = ['clients', 'appointments', 'blocks', 'expenses', 'settings', 'meta', 'snapshots', 'diagnostics', 'recoveries'];
  const stores = new Map(names.map(name => [name, new Map()]));
  for (const name of names.slice(0, 4)) raw[name].forEach((value, order) => stores.get(name).set(value.id, { id: value.id, order, value: clone(value) }));
  stores.get('settings').set('settings', { id: 'settings', value: clone(raw.settings) });
  const meta = { id: 'state', databaseVersion: 2, dataVersion: 15, databaseId: 'database-v15', revision: 4,
    checksum: h.storage.checksum(raw), counts: h.storage.counts(raw), createdAt: '2026-10-27T12:00:00.000Z', updatedAt: '2026-10-27T12:00:00.000Z' };
  stores.get('meta').set('state', meta);
  indexedDB.databases.set(databaseName, { version: 2, stores, owner: indexedDB });
  localStorage.setItem(legacyKey, JSON.stringify(raw));
  localStorage.setItem(`${legacyKey}-storage-meta-v1`, JSON.stringify({ ...meta, source: 'indexeddb' }));
  const opened = await h.storage.initialise(options(h, indexedDB, localStorage, h.migrateStoredState(raw), { legacyEvidence: true }));
  assert.equal(indexedDB.backend().version, 3); assert.equal(opened.state.version, 16);
  assert.deepEqual(plain(opened.state.tasks), []);
  const after = indexedDB.record('meta', 'state');
  assert.equal(after.migratedFromDataVersion, 15); assert.equal(after.migratedFromChecksum, meta.checksum);
  const preserved = indexedDB.records('snapshots').find(record => record.id === after.migrationSnapshotId);
  assert.deepEqual(plain(preserved.state), raw); assert.equal(Object.hasOwn(preserved.counts, 'tasks'), false);
  const changed = clone(opened.state); changed.tasks = [task()];
  await opened.storage.save(changed);
  assert.equal(indexedDB.records('tasks')[0].value.title, task().title);
  const restored = await opened.storage.restoreSnapshot(preserved.id);
  assert.deepEqual(plain(restored.tasks), []);
  assert.equal(restored.appointments[0].refundDate, raw.appointments[0].refundDate);
  opened.storage.close();
});

test('création, achèvement, réouverture et suppression survivent au redémarrage et au retour par snapshot', async () => {
  const h = harness(), indexedDB = new FakeIndexedDB(), localStorage = new MemoryStorage();
  const initial = h.migrateStoredState(v15State()), opts = options(h, indexedDB, localStorage, initial);
  let opened = await h.storage.initialise(opts), state = clone(opened.state);
  state.tasks = [task()]; await opened.storage.save(state, { reason: 'task-create' });
  state.tasks[0] = task({ completed: true, completedAt: '2026-10-28T11:00:00.000Z', updatedAt: '2026-10-28T11:00:00.000Z' });
  await opened.storage.save(state, { reason: 'task-complete' }); opened.storage.close();
  opened = await h.storage.initialise({ ...opts, legacyState: state, legacyEvidence: true });
  assert.equal(opened.state.tasks[0].completed, true);
  state = clone(opened.state); state.tasks[0] = task({ updatedAt: '2026-10-28T12:00:00.000Z' });
  await opened.storage.save(state, { reason: 'task-reopen' });
  state.tasks = []; await opened.storage.save(state, { reason: 'task-delete' });
  assert.equal(indexedDB.records('tasks').length, 0);
  const snapshots = await opened.storage.snapshotList(), previous = snapshots.find(item => item.reason === 'task-delete');
  assert.equal(previous.counts.tasks, 1);
  const restored = await opened.storage.restoreSnapshot(previous.id);
  assert.equal(restored.tasks[0].completed, false); assert.equal(restored.tasks[0].completedAt, '');
  const diagnostic = await opened.storage.diagnosticsReport();
  assert.equal(diagnostic.verification.counts.tasks, 1);
  assert.equal(JSON.stringify(diagnostic).includes(task().title), false);
  assert.equal(JSON.stringify(diagnostic).includes('2026-11-02'), false);
  opened.storage.close();
});

test('un quota sur une tâche annule atomiquement tâches, rendez-vous, méta et snapshot', async () => {
  const h = harness(), indexedDB = new FakeIndexedDB(), localStorage = new MemoryStorage(), state = h.migrateStoredState(v15State());
  const opened = await h.storage.initialise(options(h, indexedDB, localStorage, state));
  const beforeMeta = indexedDB.record('meta', 'state'), beforeAppointments = indexedDB.records('appointments');
  const changed = clone(opened.state); changed.tasks = [task()]; changed.appointments[0].notes = 'Ne doit pas survivre';
  indexedDB.failNextOperation('tasks', 'put');
  await assert.rejects(opened.storage.save(changed));
  assert.deepEqual(indexedDB.record('meta', 'state'), beforeMeta);
  assert.deepEqual(indexedDB.records('appointments'), beforeAppointments);
  assert.equal(indexedDB.records('tasks').length, 0); assert.equal(indexedDB.records('snapshots').length, 0);
  assert.deepEqual(plain(opened.storage.getState()), plain(opened.state));
  opened.storage.close();
});

test('deux fenêtres ne peuvent écraser les tâches de la première', async () => {
  const h = harness(), indexedDB = new FakeIndexedDB(), localStorage = new MemoryStorage(), state = h.migrateStoredState(v15State());
  const opts = options(h, indexedDB, localStorage, state), first = await h.storage.initialise(opts);
  const second = await h.storage.initialise({ ...opts, legacyEvidence: true });
  const one = clone(first.state); one.tasks = [task()]; await first.storage.save(one);
  const two = clone(second.state); two.tasks = [task({ id: 't2', title: 'Tâche concurrente' })];
  await assert.rejects(second.storage.save(two), error => error.code === 'CONCURRENT_CHANGE');
  assert.deepEqual(plain(indexedDB.records('tasks').map(record => record.value.title)), [task().title]);
  first.storage.close(); second.storage.close();
});

test('un ancien miroir v16 lié reste identifiable après un commit de tâches sans miroir', async () => {
  const h = harness(), indexedDB = new FakeIndexedDB(), localStorage = new MemoryStorage(), state = h.migrateStoredState(v15State());
  state.tasks = [task()];
  const opts = options(h, indexedDB, localStorage, state), first = await h.storage.initialise(opts);
  const changed = clone(first.state); changed.tasks.push(task({ id: 't2', title: 'Confirmer la livraison' }));
  localStorage.failNextSet(legacyKey);
  assert.equal((await first.storage.save(changed)).mirrorOk, false); first.storage.close();
  const reopened = await h.storage.initialise({ ...opts, legacyEvidence: true });
  assert.equal(reopened.state.tasks.length, 2);
  assert.match(reopened.warning, /plus ancienne/);
  reopened.storage.close();
});

test('une tâche altérée invalide son snapshot sans affecter l’état courant', async () => {
  const h = harness(), indexedDB = new FakeIndexedDB(), localStorage = new MemoryStorage(), state = h.migrateStoredState(v15State());
  state.tasks = [task()];
  const opened = await h.storage.initialise(options(h, indexedDB, localStorage, state));
  const changed = clone(opened.state); changed.tasks[0].title = 'Nouvelle commande';
  await opened.storage.save(changed);
  const snapshot = indexedDB.records('snapshots')[0]; snapshot.state.tasks[0].title = 'Altération'; indexedDB.put('snapshots', snapshot);
  assert.deepEqual(plain(await opened.storage.snapshotList()), []);
  await assert.rejects(opened.storage.restoreSnapshot(snapshot.id));
  assert.equal(opened.storage.getState().tasks[0].title, 'Nouvelle commande');
  assert.equal(indexedDB.records('tasks')[0].value.title, 'Nouvelle commande');
  opened.storage.close();
});
