import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storageSource = fs.readFileSync(path.join(root, 'storage.js'), 'utf8');
const databaseName = 'mon-agenda-secure-v1';
const legacyKey = 'agenda-storage-test';
const legacyMetaKey = `${legacyKey}-storage-meta-v1`;
const legacyV14Key = 'agenda-storage-test-v14';
const legacyV14MetaKey = `${legacyV14Key}-storage-meta-v1`;
const storeNames = ['clients', 'appointments', 'blocks', 'expenses', 'settings', 'meta', 'snapshots', 'diagnostics', 'recoveries'];
const clone = value => value === undefined ? undefined : structuredClone(value);
const plain = value => JSON.parse(JSON.stringify(value));

function loadStorageModule() {
  let uuidSequence = 0;
  const context = {
    console,
    Date,
    Intl,
    JSON,
    Math,
    Promise,
    clearTimeout,
    setTimeout,
    structuredClone,
    crypto: { randomUUID: () => `storage-test-${++uuidSequence}` }
  };
  context.globalThis = context;
  vm.runInNewContext(storageSource, context, { filename: 'storage.behavior.js' });
  return context.AgendaStorage;
}

const AgendaStorage = loadStorageModule();

class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial).map(([key, value]) => [String(key), String(value)]));
    this.getFailures = [];
    this.setFailures = [];
    this.setCalls = 0;
  }

  getItem(key) {
    key = String(key);
    const failureIndex = this.getFailures.findIndex(failure => failure.key === key);
    if (failureIndex >= 0) {
      const [failure] = this.getFailures.splice(failureIndex, 1);
      throw failure.error;
    }
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    key = String(key);
    this.setCalls += 1;
    const failureIndex = this.setFailures.findIndex(failure => failure.key === key);
    if (failureIndex >= 0) {
      const [failure] = this.setFailures.splice(failureIndex, 1);
      throw failure.error;
    }
    this.values.set(key, String(value));
  }

  removeItem(key) { this.values.delete(String(key)); }
  clear() { this.values.clear(); }

  failNextGet(key, message = 'SecurityError') {
    const error = new Error(message);
    error.name = message;
    this.getFailures.push({ key: String(key), error });
  }

  failNextSet(key, message = 'QuotaExceededError') {
    const error = new Error(message);
    error.name = message;
    this.setFailures.push({ key: String(key), error });
  }
}

function cloneMap(source) {
  return new Map([...source].map(([key, value]) => [key, clone(value)]));
}

class FakeObjectStore {
  constructor(transaction, name) {
    this.transaction = transaction;
    this.name = name;
  }

  get map() { return this.transaction.views.get(this.name); }

  get(key) {
    return this.transaction.request(() => clone(this.map.get(String(key))), this.name, 'get');
  }

  getAll() {
    return this.transaction.request(() => [...this.map.values()].map(clone), this.name, 'getAll');
  }

  put(record) {
    return this.transaction.request(() => {
      if (this.transaction.mode !== 'readwrite') throw new Error('ReadOnlyError');
      const key = String(record?.id);
      this.map.set(key, clone(record));
      return key;
    }, this.name, 'put');
  }

  delete(key) {
    return this.transaction.request(() => {
      if (this.transaction.mode !== 'readwrite') throw new Error('ReadOnlyError');
      this.map.delete(String(key));
      return undefined;
    }, this.name, 'delete');
  }

  clear() {
    return this.transaction.request(() => {
      if (this.transaction.mode !== 'readwrite') throw new Error('ReadOnlyError');
      this.map.clear();
      return undefined;
    }, this.name, 'clear');
  }
}

class FakeTransaction {
  constructor(backend, names, mode) {
    this.backend = backend;
    this.names = Array.isArray(names) ? names : [names];
    this.mode = mode;
    this.active = true;
    this.pending = 0;
    this.generation = 0;
    this.error = null;
    this.oncomplete = null;
    this.onabort = null;
    this.onerror = null;
    this.requests = new Set();
    this.views = new Map();
    this.names.forEach(name => {
      if (!backend.stores.has(name)) throw new Error(`NotFoundError:${name}`);
      this.views.set(name, cloneMap(backend.stores.get(name)));
    });
    this.scheduleCompletion();
  }

  objectStore(name) {
    if (!this.views.has(name)) throw new Error(`NotFoundError:${name}`);
    return new FakeObjectStore(this, name);
  }

  request(operation, storeName = '', operationName = '') {
    if (!this.active) throw new Error('TransactionInactiveError');
    const request = { result: undefined, error: null, onsuccess: null, onerror: null };
    this.requests.add(request);
    this.pending += 1;
    this.generation += 1;
    queueMicrotask(() => {
      if (!this.active) return;
      if (this.backend.owner.consumeHang(storeName, operationName)) return;
      try {
        this.backend.owner.consumeFailure(storeName, operationName);
        request.result = operation();
        request.onsuccess?.({ target: request });
      } catch (error) {
        request.error = error;
        request.onerror?.({ target: request });
        this.fail(error);
      } finally {
        this.requests.delete(request);
        this.pending -= 1;
        if (this.active) this.scheduleCompletion();
      }
    });
    return request;
  }

  scheduleCompletion() {
    const expectedGeneration = ++this.generation;
    setTimeout(() => {
      if (!this.active || this.pending !== 0 || this.generation !== expectedGeneration) return;
      if (this.mode === 'readwrite') {
        this.names.forEach(name => this.backend.stores.set(name, cloneMap(this.views.get(name))));
      }
      this.active = false;
      this.oncomplete?.();
    }, 0);
  }

  fail(error) {
    if (!this.active) return;
    this.active = false;
    this.error = error;
    queueMicrotask(() => {
      this.onerror?.();
      this.onabort?.();
    });
  }

  abort() {
    if (!this.active) return;
    this.active = false;
    const error = new Error('AbortError');
    error.name = 'AbortError';
    this.error = error;
    this.backend.owner.abortCalls += 1;
    queueMicrotask(() => {
      this.requests.forEach(request => {
        request.error = error;
        request.onerror?.({ target: request });
      });
      this.requests.clear();
      this.onabort?.();
    });
  }
}

class FakeUpgradeObjectStore {
  constructor(backend, name) {
    this.backend = backend;
    this.name = name;
  }

  createIndex() {}

  put(record) {
    const request = { result: undefined, error: null, onsuccess: null, onerror: null };
    try {
      const key = String(record?.id);
      this.backend.stores.get(this.name).set(key, clone(record));
      request.result = key;
      queueMicrotask(() => request.onsuccess?.({ target: request }));
    } catch (error) {
      request.error = error;
      queueMicrotask(() => request.onerror?.({ target: request }));
    }
    return request;
  }
}

class FakeUpgradeTransaction {
  constructor(backend) {
    this.backend = backend;
    this.error = null;
    this.oncomplete = null;
    this.onabort = null;
    this.onerror = null;
  }

  objectStore(name) {
    name = String(name);
    if (!this.backend.stores.has(name)) throw new Error(`NotFoundError:${name}`);
    return new FakeUpgradeObjectStore(this.backend, name);
  }

  abort() {
    const error = new Error('AbortError');
    error.name = 'AbortError';
    this.error = error;
    queueMicrotask(() => this.onabort?.());
  }
}

class FakeDatabaseConnection {
  constructor(backend) {
    this.backend = backend;
    this.closed = false;
    this.onversionchange = null;
    this.objectStoreNames = { contains: name => backend.stores.has(String(name)) };
  }

  createObjectStore(name) {
    name = String(name);
    if (this.backend.stores.has(name)) throw new Error(`ConstraintError:${name}`);
    this.backend.stores.set(name, new Map());
    return new FakeUpgradeObjectStore(this.backend, name);
  }

  transaction(names, mode = 'readonly') {
    if (this.closed) throw new Error('InvalidStateError');
    this.backend.owner.consumeTransactionHook(mode, names);
    return new FakeTransaction(this.backend, names, mode);
  }

  close() { this.closed = true; }
}

class FakeIndexedDB {
  constructor() {
    this.databases = new Map();
    this.operationFailures = [];
    this.operationHangs = [];
    this.transactionHooks = [];
    this.abortCalls = 0;
    this.openHangs = 0;
    this.openCalls = 0;
  }

  hangNextOpen() { this.openHangs += 1; }

  beforeNextTransaction(mode, callback) {
    this.transactionHooks.push({ mode, callback });
  }

  consumeTransactionHook(mode, names) {
    const index = this.transactionHooks.findIndex(hook => hook.mode === mode);
    if (index < 0) return;
    const [hook] = this.transactionHooks.splice(index, 1);
    hook.callback({ mode, names });
  }

  failNextOperation(storeName, operationName, errorName = 'QuotaExceededError') {
    const error = new Error(errorName);
    error.name = errorName;
    this.operationFailures.push({ storeName, operationName, error });
  }

  consumeFailure(storeName, operationName) {
    const index = this.operationFailures.findIndex(failure => failure.storeName === storeName && failure.operationName === operationName);
    if (index < 0) return;
    const [failure] = this.operationFailures.splice(index, 1);
    throw failure.error;
  }

  hangNextOperation(storeName, operationName, afterMatches = 0) {
    this.operationHangs.push({ storeName, operationName, remaining: Math.max(0, Number(afterMatches) || 0) });
  }

  consumeHang(storeName, operationName) {
    const index = this.operationHangs.findIndex(hang => hang.storeName === storeName && hang.operationName === operationName);
    if (index < 0) return false;
    if (this.operationHangs[index].remaining > 0) {
      this.operationHangs[index].remaining -= 1;
      return false;
    }
    this.operationHangs.splice(index, 1);
    return true;
  }

  open(name, version) {
    this.openCalls += 1;
    const request = {
      result: null,
      error: null,
      transaction: null,
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      onblocked: null
    };
    if (this.openHangs > 0) {
      this.openHangs -= 1;
      return request;
    }
    queueMicrotask(() => {
      try {
        let backend = this.databases.get(name);
        const oldVersion = Number(backend?.version || 0);
        if (backend && Number(version) < oldVersion) throw new Error('VersionError');
        if (!backend) {
          backend = { version: 0, stores: new Map(), owner: this };
          this.databases.set(name, backend);
        }
        request.result = new FakeDatabaseConnection(backend);
        if (Number(version) > oldVersion) {
          backend.version = Number(version);
          request.transaction = new FakeUpgradeTransaction(backend);
          request.onupgradeneeded?.({ oldVersion, newVersion: Number(version), target: request });
        }
        queueMicrotask(() => request.onsuccess?.({ target: request }));
      } catch (error) {
        request.error = error;
        request.onerror?.({ target: request });
      }
    });
    return request;
  }

  backend(name = databaseName) {
    const backend = this.databases.get(name);
    assert.ok(backend, `La base ${name} devrait exister`);
    return backend;
  }

  records(storeName) {
    const store = this.backend().stores.get(storeName);
    assert.ok(store, `Le store ${storeName} devrait exister`);
    return [...store.values()].map(clone);
  }

  record(storeName, id) {
    return clone(this.backend().stores.get(storeName)?.get(String(id)));
  }

  put(storeName, record) {
    const store = this.backend().stores.get(storeName);
    assert.ok(store, `Le store ${storeName} devrait exister`);
    store.set(String(record.id), clone(record));
  }

  delete(storeName, id) {
    this.backend().stores.get(storeName)?.delete(String(id));
  }
}

function baseState(version = 15, name = 'Alice') {
  return {
    version,
    clients: [{ id: 'client-1', name, phone: '0600000000' }],
    appointments: version === 14
      ? [{ id: 'appointment-1', clientId: 'client-1', paymentStatus: 'paid', paymentDate: '2026-06-10' }]
      : [{ id: 'appointment-1', clientId: 'client-1', paymentStatus: 'paid', paymentDate: '2026-06-10', refundDate: '' }],
    blocks: [],
    expenses: [],
    settings: {
      services: [{ id: 'service-1', name: 'Pose' }],
      supplementTypes: [],
      clientBadges: [],
      expenseCategories: []
    }
  };
}

function assertStateShape(state) {
  ['clients', 'appointments', 'blocks', 'expenses'].forEach(name => {
    if (!Array.isArray(state?.[name])) throw new Error(`INVALID_${name.toUpperCase()}`);
  });
  if (!state.settings || typeof state.settings !== 'object') throw new Error('INVALID_SETTINGS');
}

function validateV14(state) {
  const next = clone(state);
  assertStateShape(next);
  if (Number(next.version) !== 14) throw new Error('INVALID_VERSION');
  return next;
}

function migrateToV15(state) {
  const next = clone(state);
  assertStateShape(next);
  if (![14, 15].includes(Number(next.version))) throw new Error('INVALID_VERSION');
  if (Number(next.version) === 14) {
    next.appointments = next.appointments.map(appointment => ({ refundDate: '', ...appointment }));
    next.version = 15;
  }
  return next;
}

function options({
  indexedDB,
  localStorage,
  state = baseState(),
  dataVersion = 15,
  validateState = migrateToV15,
  legacyEvidence,
  legacyFallbackAllowed = true,
  legacyReadUncertain = false,
  startupTimeoutMs,
  migrationDate,
  key = legacyKey,
  legacyReadKey
} = {}) {
  return {
    indexedDB,
    localStorage,
    legacyKey: key,
    legacyReadKey,
    legacyState: clone(state),
    legacyFallbackAllowed,
    legacyEvidence,
    legacySource: 'test-fixture',
    legacyReadUncertain,
    startupTimeoutMs,
    migrationDate,
    validateState,
    appVersion: '2026.15-test',
    dataVersion
  };
}

function clientNameFromDatabase(indexedDB) {
  return indexedDB.record('clients', 'client-1')?.value?.name;
}

function persistenceFootprint(indexedDB, localStorage) {
  return {
    stores: Object.fromEntries(storeNames.map(name => [name, indexedDB.records(name)])),
    legacyStateRaw: localStorage.getItem(legacyKey),
    legacyMetaRaw: localStorage.getItem(legacyMetaKey)
  };
}

test('la première création écrit une base complète, sa méta et son miroir', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const initial = baseState(15, 'Première création');

  const result = await AgendaStorage.initialise(options({ indexedDB, localStorage, state: initial, legacyEvidence: false }));

  assert.equal(result.mode, 'indexeddb');
  assert.equal(result.migrated, false);
  assert.equal(clientNameFromDatabase(indexedDB), 'Première création');
  const meta = indexedDB.record('meta', 'state');
  assert.equal(meta.databaseVersion, 2);
  assert.equal(meta.dataVersion, 15);
  assert.equal(meta.revision, 1);
  assert.match(meta.databaseId, /^database-/);
  assert.equal(meta.checksum, AgendaStorage.checksum(initial));
  assert.equal(JSON.parse(localStorage.getItem(legacyKey)).clients[0].name, 'Première création');
  assert.equal(JSON.parse(localStorage.getItem(legacyMetaKey)).databaseId, meta.databaseId);
  assert.deepEqual([...indexedDB.backend().stores.keys()].sort(), [...storeNames].sort());
  result.storage.close();
});

test('une DB fraîche garde la provenance d’un miroir v15 déjà canonique si sa nouvelle lignée ne peut pas être reflétée', async () => {
  const localStorage = new MemoryStorage();
  const oldIndexedDB = new FakeIndexedDB();
  const stateA = baseState(15, 'Miroir v15 d’une ancienne lignée');
  const old = await AgendaStorage.initialise(options({ indexedDB: oldIndexedDB, localStorage, state: stateA, legacyEvidence: false }));
  const oldDatabaseId = oldIndexedDB.record('meta', 'state').databaseId;
  old.storage.close();

  const indexedDB = new FakeIndexedDB();
  localStorage.failNextSet(legacyKey);
  const bootstrapped = await AgendaStorage.initialise(options({ indexedDB, localStorage, state: stateA }));
  assert.notEqual(indexedDB.record('meta', 'state').databaseId, oldDatabaseId);
  assert.match(bootstrapped.warning, /copie locale liée n’a pas pu être mise à jour/i);

  const stateB = baseState(15, 'Commit après recréation IDB');
  localStorage.failNextSet(legacyKey);
  const saved = await bootstrapped.storage.save(stateB, { reason: 'save-après-bootstrap-sans-miroir' });
  assert.equal(saved.mirrorOk, false);
  bootstrapped.storage.close();

  const beforeReload = persistenceFootprint(indexedDB, localStorage);
  const previousSetCalls = localStorage.setCalls;
  const reopened = await AgendaStorage.initialise(options({ indexedDB, localStorage, state: stateA }));
  assert.equal(reopened.state.clients[0].name, 'Commit après recréation IDB');
  assert.match(reopened.warning, /plus ancienne/i);
  assert.equal(localStorage.setCalls, previousSetCalls);
  assert.deepEqual(persistenceFootprint(indexedDB, localStorage), beforeReload);
  reopened.storage.close();
});

test('la preuve local-bootstrap survit à la rotation de son snapshot tant que le miroir historique reste exact', async () => {
  const indexedDB = new FakeIndexedDB();
  const rawV14 = baseState(14, 'Raw v14 sans méta à attester');
  const localStorage = new MemoryStorage({ [legacyV14Key]: JSON.stringify(rawV14) });

  localStorage.failNextSet(legacyKey);
  const migrated = await AgendaStorage.initialise(options({
    indexedDB,
    localStorage,
    state: rawV14,
    legacyEvidence: true,
    key: legacyKey,
    legacyReadKey: legacyV14Key,
    migrationDate: '2026-09-01'
  }));
  const migrationSnapshotId = indexedDB.record('meta', 'state').migrationSnapshotId;
  assert.ok(migrationSnapshotId);

  for (let index = 1; index <= 5; index += 1) {
    localStorage.failNextSet(legacyKey);
    const result = await migrated.storage.save(baseState(15, `Commit post-bootstrap ${index}`), { reason: `post-bootstrap-${index}` });
    assert.equal(result.mirrorOk, false);
  }
  migrated.storage.close();
  assert.equal(indexedDB.records('snapshots').some(snapshot => snapshot.id === migrationSnapshotId), false, 'le snapshot historique peut sortir de la rotation normale');
  assert.equal(localStorage.getItem(legacyKey), null);
  assert.equal(localStorage.getItem(legacyV14Key), JSON.stringify(rawV14));

  const alteredRawV14 = clone(rawV14);
  alteredRawV14.clients[0].name = 'Autre raw v14 sans méta';
  localStorage.setItem(legacyV14Key, JSON.stringify(alteredRawV14));
  const beforeAlteredReload = persistenceFootprint(indexedDB, localStorage);
  const setCallsBeforeAlteredReload = localStorage.setCalls;
  await assert.rejects(
    AgendaStorage.initialise(options({
      indexedDB,
      localStorage,
      state: alteredRawV14,
      legacyEvidence: true,
      key: legacyKey,
      legacyReadKey: legacyV14Key,
      migrationDate: '2026-09-01'
    })),
    error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'AMBIGUOUS_STORAGE_SOURCES'
  );
  assert.equal(localStorage.setCalls, setCallsBeforeAlteredReload);
  assert.deepEqual(persistenceFootprint(indexedDB, localStorage), beforeAlteredReload);

  localStorage.setItem(legacyV14Key, JSON.stringify(rawV14));
  const beforeReload = persistenceFootprint(indexedDB, localStorage);
  const previousSetCalls = localStorage.setCalls;
  const reopened = await AgendaStorage.initialise(options({
    indexedDB,
    localStorage,
    state: rawV14,
    legacyEvidence: true,
    key: legacyKey,
    legacyReadKey: legacyV14Key,
    migrationDate: '2026-09-01'
  }));
  assert.equal(reopened.state.clients[0].name, 'Commit post-bootstrap 5');
  assert.match(reopened.warning, /plus ancienne/i);
  assert.equal(localStorage.setCalls, previousSetCalls);
  assert.deepEqual(persistenceFootprint(indexedDB, localStorage), beforeReload);
  reopened.storage.close();
});

test('une lecture legacy incertaine bloque une DB neuve sans créer état ni miroir', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();

  await assert.rejects(
    AgendaStorage.initialise(options({
      indexedDB,
      localStorage,
      legacyEvidence: false,
      legacyReadUncertain: true
    })),
    error => error?.code === 'RECOVERY_REQUIRED'
  );

  assert.equal(indexedDB.openCalls, 0);
  assert.equal(indexedDB.databases.size, 0);
  assert.equal(localStorage.getItem(legacyKey), null);
  assert.equal(localStorage.getItem(legacyMetaKey), null);
});

test('une lecture legacy incertaine ne touche pas une IDB v14 existante ni ses miroirs', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const rawV14 = baseState(14, 'IDB v14 intacte');
  const v14 = await AgendaStorage.initialise(options({
    indexedDB,
    localStorage,
    state: rawV14,
    dataVersion: 14,
    validateState: validateV14,
    legacyEvidence: false,
    key: legacyV14Key
  }));
  v14.storage.close();
  const openCallsBefore = indexedDB.openCalls;
  const storesBefore = Object.fromEntries(storeNames.map(name => [name, indexedDB.records(name)]));
  const legacyV14StateBefore = localStorage.getItem(legacyV14Key);
  const legacyV14MetaBefore = localStorage.getItem(legacyV14MetaKey);
  const legacyV15StateBefore = localStorage.getItem(legacyKey);
  const legacyV15MetaBefore = localStorage.getItem(legacyMetaKey);

  await assert.rejects(
    AgendaStorage.initialise(options({
      indexedDB,
      localStorage,
      state: rawV14,
      key: legacyKey,
      legacyReadKey: legacyV14Key,
      legacyReadUncertain: true
    })),
    error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'LEGACY_READ_UNCERTAIN'
  );

  assert.equal(indexedDB.openCalls, openCallsBefore);
  assert.deepEqual(Object.fromEntries(storeNames.map(name => [name, indexedDB.records(name)])), storesBefore);
  assert.equal(localStorage.getItem(legacyV14Key), legacyV14StateBefore);
  assert.equal(localStorage.getItem(legacyV14MetaKey), legacyV14MetaBefore);
  assert.equal(localStorage.getItem(legacyKey), legacyV15StateBefore);
  assert.equal(localStorage.getItem(legacyMetaKey), legacyV15MetaBefore);
});

test('un legacy v1 composite avec un RDV incomplet bloque avant toute ouverture ou migration partielle', async () => {
  const applicationSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const cutMarker = "\n  document.addEventListener('click'";
  const cutAt = applicationSource.indexOf(cutMarker);
  assert.ok(cutAt > 0, 'Le point d’instrumentation de app.js est introuvable');

  const rawAppointments = JSON.stringify([{
    id: 'legacy-appointment-incomplet',
    client: 'Alice',
    service: 'Pose',
    duration: 60,
    price: '45'
  }]);
  const rawProfiles = JSON.stringify({ Alice: { name: 'Alice', phone: '0600000000' } });
  const localStorage = new MemoryStorage({
    'nail-planner-v1': rawAppointments,
    'nail-client-profiles-v1': rawProfiles
  });
  const indexedDB = new FakeIndexedDB();
  let optionsAtInitialise = null;
  let legacyFootprintAtInitialise = null;
  let setCallsAtInitialise = 0;
  const legacyFootprint = () => ({
    appointments: localStorage.getItem('nail-planner-v1'),
    profiles: localStorage.getItem('nail-client-profiles-v1'),
    quarantinedAppointments: localStorage.getItem('nail-planner-unreadable-v1-appointments'),
    quarantinedProfiles: localStorage.getItem('nail-planner-unreadable-v1-profiles')
  });
  const agendaStorage = {
    checksum: AgendaStorage.checksum,
    async initialise(receivedOptions) {
      optionsAtInitialise = receivedOptions;
      legacyFootprintAtInitialise = legacyFootprint();
      setCallsAtInitialise = localStorage.setCalls;
      return AgendaStorage.initialise(receivedOptions);
    }
  };

  let uuidSequence = 0;
  const elements = new Map();
  const elementFor = selector => {
    if (!String(selector).startsWith('#')) return null;
    const id = String(selector).slice(1);
    if (!elements.has(id)) elements.set(id, {
      id, hidden: false, open: false, innerHTML: '', textContent: '', value: '', dataset: {}, style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      querySelector() { return null; },
      setAttribute() {}, removeAttribute() {},
      close() { this.open = false; },
      showModal() { this.open = true; }
    });
    return elements.get(id);
  };
  const context = {
    console,
    Blob,
    Date,
    Intl,
    JSON,
    Math,
    Map,
    Set,
    Promise,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    crypto: { randomUUID: () => `legacy-v1-test-${++uuidSequence}` },
    localStorage,
    indexedDB,
    AgendaStorage: agendaStorage,
    navigator: {
      serviceWorker: {
        controller: {},
        addEventListener() {},
        register() { return new Promise(() => {}); }
      }
    },
    document: {
      body: { dataset: {}, append() {} },
      createElement() { return { click() {}, remove() {} }; },
      querySelector: elementFor,
      querySelectorAll() { return []; }
    },
    window: { alert() {}, confirm: () => true },
    location: { reload() {} },
    setTimeout,
    clearTimeout,
    structuredClone
  };
  context.globalThis = context;
  const exposure = `
  globalThis.__legacyV1TestHooks = Object.freeze({
    initialiseSecureStorage,
    legacyLoadInfo: () => ({ ...legacyLoadInfo }),
    startupError: () => app.ui.storageStartupError
  });
})();`;
  vm.runInNewContext(applicationSource.slice(0, cutAt) + exposure, context, { filename: 'app.legacy-v1-storage-behavior.js' });

  assert.equal(await context.__legacyV1TestHooks.initialiseSecureStorage(), false);
  const loadInfo = context.__legacyV1TestHooks.legacyLoadInfo();
  assert.equal(loadInfo.evidence, true);
  assert.equal(loadInfo.usable, false);
  assert.equal(loadInfo.readUncertain, true);
  assert.equal(optionsAtInitialise?.legacyReadUncertain, true);
  assert.equal(context.__legacyV1TestHooks.startupError()?.code, 'RECOVERY_REQUIRED');
  assert.equal(context.__legacyV1TestHooks.startupError()?.cause?.code, 'LEGACY_READ_UNCERTAIN');

  assert.equal(indexedDB.openCalls, 0, 'le stockage sécurisé doit refuser avant indexedDB.open');
  assert.equal(indexedDB.databases.size, 0);
  assert.equal(localStorage.setCalls, setCallsAtInitialise, 'initialise ne doit plus écrire après le signalement legacy incertain');
  assert.deepEqual(legacyFootprint(), legacyFootprintAtInitialise);
  assert.equal(localStorage.getItem('nail-planner-v1'), rawAppointments);
  assert.equal(localStorage.getItem('nail-client-profiles-v1'), rawProfiles);
  assert.equal(localStorage.getItem('nail-planner-unreadable-v1-appointments'), rawAppointments);
  assert.equal(localStorage.getItem('nail-planner-unreadable-v1-profiles'), rawProfiles);
  assert.equal(localStorage.getItem('nail-planner-state-v15'), null);
  assert.equal(localStorage.getItem('nail-planner-state-v15-storage-meta-v1'), null);
  assert.equal(localStorage.getItem('nail-planner-before-migration-v15'), null);
});

test('une preuve legacy sans candidate disponible bloque une DB neuve sans écrire', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();

  await assert.rejects(
    AgendaStorage.initialise(options({
      indexedDB,
      localStorage,
      legacyEvidence: true,
      legacyFallbackAllowed: false
    })),
    error => error?.code === 'RECOVERY_REQUIRED'
  );

  assert.equal(indexedDB.record('meta', 'state'), undefined);
  assert.ok(indexedDB.record('meta', 'bootstrap'));
  ['clients', 'appointments', 'blocks', 'expenses', 'settings'].forEach(name => assert.equal(indexedDB.records(name).length, 0));
  assert.equal(localStorage.getItem(legacyKey), null);
  assert.equal(localStorage.getItem(legacyMetaKey), null);
});

test('la migration v14 vers v15 contrôle le brut puis conserve un snapshot v14', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const rawV14 = baseState(14, 'Avant migration');
  const first = await AgendaStorage.initialise(options({
    indexedDB,
    localStorage,
    state: rawV14,
    dataVersion: 14,
    validateState: validateV14,
    legacyEvidence: false,
    key: legacyV14Key
  }));
  const databaseId = indexedDB.record('meta', 'state').databaseId;
  first.storage.close();

  const migrated = await AgendaStorage.initialise(options({
    indexedDB,
    localStorage,
    state: rawV14,
    key: legacyKey,
    legacyReadKey: legacyV14Key,
    migrationDate: '2026-09-02'
  }));

  assert.equal(migrated.migrated, true);
  assert.equal(migrated.state.version, 15);
  assert.equal(migrated.state.appointments[0].refundDate, '');
  const meta = indexedDB.record('meta', 'state');
  assert.equal(meta.databaseId, databaseId);
  assert.equal(meta.dataVersion, 15);
  assert.equal(meta.migratedFromDataVersion, 14);
  assert.equal(meta.migrationDate, '2026-09-02');
  const snapshots = indexedDB.records('snapshots');
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].state.version, 14);
  assert.equal(snapshots[0].dataVersion, 14);
  assert.equal(snapshots[0].migrationDate, '2026-09-02');
  assert.equal(snapshots[0].checksum, AgendaStorage.checksum(rawV14));
  assert.equal(snapshots[0].databaseId, databaseId);
  assert.equal(JSON.parse(localStorage.getItem(legacyV14Key)).version, 14);
  assert.equal(JSON.parse(localStorage.getItem(legacyV14MetaKey)).dataVersion, 14);
  assert.equal(JSON.parse(localStorage.getItem(legacyKey)).version, 15);
  assert.equal(JSON.parse(localStorage.getItem(legacyMetaKey)).dataVersion, 15);
  const tamperedSnapshot = clone(snapshots[0]);
  tamperedSnapshot.migrationDate = '2026-09-03';
  indexedDB.put('snapshots', tamperedSnapshot);
  await assert.rejects(
    migrated.storage.restoreSnapshot(tamperedSnapshot.id),
    error => error?.code === 'SNAPSHOT_NOT_FOUND',
    'modifier uniquement le contexte financier doit invalider le snapshot de migration'
  );
  migrated.storage.close();
});

test('une migration v15 reconnaît uniquement son miroir v14 exact après un échec d’écriture du nouveau miroir', async t => {
  async function migrationAvecMiroirHerite() {
    const indexedDB = new FakeIndexedDB();
    const localStorage = new MemoryStorage();
    const rawV14 = baseState(14, 'Source v14 sans lignée');
    const first = await AgendaStorage.initialise(options({
      indexedDB,
      localStorage,
      state: rawV14,
      dataVersion: 14,
      validateState: validateV14,
      legacyEvidence: false
    }));
    first.storage.close();

    const sourceMeta = indexedDB.record('meta', 'state');
    delete sourceMeta.databaseId;
    indexedDB.put('meta', sourceMeta);
    const inheritedMeta = JSON.parse(localStorage.getItem(legacyMetaKey));
    delete inheritedMeta.databaseId;
    localStorage.setItem(legacyMetaKey, JSON.stringify(inheritedMeta));
    const inheritedStateRaw = localStorage.getItem(legacyKey);
    const inheritedMetaRaw = localStorage.getItem(legacyMetaKey);

    localStorage.failNextSet(legacyKey);
    const migrated = await AgendaStorage.initialise(options({ indexedDB, localStorage, state: rawV14 }));
    assert.equal(migrated.migrated, true);
    assert.match(migrated.warning, /copie locale liée n’a pas pu être mise à jour/);
    migrated.storage.close();

    const migratedMeta = indexedDB.record('meta', 'state');
    assert.equal(migratedMeta.dataVersion, 15);
    assert.equal(migratedMeta.migratedFromDataVersion, 14);
    assert.equal(migratedMeta.migratedFromChecksum, sourceMeta.checksum);
    assert.equal(migratedMeta.migratedFromRevision, sourceMeta.revision);
    assert.equal(migratedMeta.migratedFromDatabaseId, '');
    assert.equal(migratedMeta.migratedFromSource, 'indexeddb');
    assert.equal(localStorage.getItem(legacyKey), inheritedStateRaw);
    assert.equal(localStorage.getItem(legacyMetaKey), inheritedMetaRaw);

    return { indexedDB, localStorage };
  }

  await t.test('la copie héritée exacte est acceptée au rechargement', async () => {
    const { indexedDB, localStorage } = await migrationAvecMiroirHerite();
    const before = persistenceFootprint(indexedDB, localStorage);
    const previousSetCalls = localStorage.setCalls;

    const reopened = await AgendaStorage.initialise(options({ indexedDB, localStorage }));

    assert.equal(reopened.state.version, 15);
    assert.equal(reopened.state.clients[0].name, 'Source v14 sans lignée');
    assert.match(reopened.warning, /copie locale liée est plus ancienne/);
    assert.equal(localStorage.setCalls, previousSetCalls);
    assert.deepEqual(persistenceFootprint(indexedDB, localStorage), before);
    reopened.storage.close();
  });

  for (const scenario of [
    {
      name: 'empreinte différente mais copie cohérente',
      alter(localStorage) {
        const state = JSON.parse(localStorage.getItem(legacyKey));
        state.clients[0].name = 'Autre source v14 cohérente';
        const meta = JSON.parse(localStorage.getItem(legacyMetaKey));
        meta.checksum = AgendaStorage.checksum(state);
        meta.counts = plain(AgendaStorage.counts(state));
        localStorage.setItem(legacyKey, JSON.stringify(state));
        localStorage.setItem(legacyMetaKey, JSON.stringify(meta));
      }
    },
    {
      name: 'révision différente',
      alter(localStorage) {
        const meta = JSON.parse(localStorage.getItem(legacyMetaKey));
        meta.revision += 1;
        localStorage.setItem(legacyMetaKey, JSON.stringify(meta));
      }
    }
  ]) {
    await t.test(scenario.name, async () => {
      const { indexedDB, localStorage } = await migrationAvecMiroirHerite();
      scenario.alter(localStorage);
      const before = persistenceFootprint(indexedDB, localStorage);
      const previousSetCalls = localStorage.setCalls;
      const candidateMeta = JSON.parse(localStorage.getItem(legacyMetaKey));
      const databaseMeta = indexedDB.record('meta', 'state');
      if (scenario.name === 'révision différente') {
        assert.notEqual(candidateMeta.revision, databaseMeta.migratedFromRevision);
        assert.equal(candidateMeta.revision, databaseMeta.revision);
        assert.equal(candidateMeta.databaseId, undefined);
        assert.ok(databaseMeta.databaseId);
        assert.notEqual(AgendaStorage.checksum(JSON.parse(localStorage.getItem(legacyKey))), databaseMeta.checksum);
      }

      await assert.rejects(
        AgendaStorage.initialise(options({ indexedDB, localStorage })),
        error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'AMBIGUOUS_STORAGE_SOURCES'
      );

      assert.equal(localStorage.setCalls, previousSetCalls);
      assert.deepEqual(persistenceFootprint(indexedDB, localStorage), before);
    });
  }
});

test('la provenance v12.5 minimale survit à un commit v15 sans miroir avant le rechargement', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const rawV14 = baseState(14, 'Source v12.5 exacte');
  const first = await AgendaStorage.initialise(options({
    indexedDB,
    localStorage,
    state: rawV14,
    dataVersion: 14,
    validateState: validateV14,
    legacyEvidence: false,
    key: legacyV14Key
  }));
  first.storage.close();

  // v12.5 ne liait encore ni la base ni son miroir par databaseId et sa
  // petite méta localStorage ne contenait ni compteurs ni dataVersion.
  const sourceMeta = indexedDB.record('meta', 'state');
  sourceMeta.databaseVersion = 1;
  delete sourceMeta.databaseId;
  indexedDB.put('meta', sourceMeta);
  const minimalV125Meta = {
    source: 'indexeddb',
    updatedAt: sourceMeta.updatedAt,
    revision: sourceMeta.revision,
    checksum: AgendaStorage.checksum(rawV14)
  };
  localStorage.setItem(legacyV14MetaKey, JSON.stringify(minimalV125Meta));
  const inheritedStateRaw = localStorage.getItem(legacyV14Key);
  const inheritedMetaRaw = localStorage.getItem(legacyV14MetaKey);

  localStorage.failNextSet(legacyKey);
  const migrated = await AgendaStorage.initialise(options({
    indexedDB,
    localStorage,
    state: rawV14,
    legacyReadKey: legacyV14Key
  }));
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.storage.getState().version, 15);
  assert.match(migrated.warning, /copie locale liée n’a pas pu être mise à jour/);

  const afterMigration = baseState(15, 'Commit v15 sans miroir');
  localStorage.failNextSet(legacyKey);
  const saveResult = await migrated.storage.save(afterMigration, { reason: 'post-migration-sans-miroir' });
  assert.equal(saveResult.mirrorOk, false);
  migrated.storage.close();

  const committedMeta = indexedDB.record('meta', 'state');
  assert.equal(committedMeta.migratedFromChecksum, sourceMeta.checksum);
  assert.equal(committedMeta.migratedFromRevision, sourceMeta.revision);
  assert.equal(committedMeta.migratedFromDataVersion, 14);
  assert.equal(committedMeta.migratedFromDatabaseId, '');
  assert.equal(committedMeta.migratedFromSource, 'indexeddb');
  assert.equal(committedMeta.migratedFromLegacyKey, legacyV14Key);
  assert.equal(localStorage.getItem(legacyKey), null);
  assert.equal(localStorage.getItem(legacyMetaKey), null);
  assert.equal(localStorage.getItem(legacyV14Key), inheritedStateRaw);
  assert.equal(localStorage.getItem(legacyV14MetaKey), inheritedMetaRaw);

  const beforeReload = persistenceFootprint(indexedDB, localStorage);
  const setCallsBeforeReload = localStorage.setCalls;
  const reopened = await AgendaStorage.initialise(options({
    indexedDB,
    localStorage,
    state: rawV14,
    legacyReadKey: legacyV14Key
  }));

  assert.equal(reopened.state.version, 15);
  assert.equal(reopened.state.clients[0].name, 'Commit v15 sans miroir');
  assert.match(reopened.warning, /copie locale liée est plus ancienne/);
  assert.equal(localStorage.setCalls, setCallsBeforeReload);
  assert.deepEqual(persistenceFootprint(indexedDB, localStorage), beforeReload);
  assert.equal(localStorage.getItem(legacyV14Key), inheritedStateRaw);
  assert.equal(localStorage.getItem(legacyV14MetaKey), inheritedMetaRaw);
  reopened.storage.close();
});

test('un snapshot dont l’empreinte est invalide est ignoré et ne peut pas être restauré', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const result = await AgendaStorage.initialise(options({ indexedDB, localStorage, legacyEvidence: false }));
  const changed = baseState(15, 'Après sauvegarde');
  await result.storage.save(changed, { reason: 'snapshot-valide' });
  const validIds = (await result.storage.snapshotList()).map(snapshot => snapshot.id);
  assert.equal(validIds.length, 1);

  const meta = indexedDB.record('meta', 'state');
  indexedDB.put('snapshots', {
    id: 'snapshot-invalide',
    createdAt: '9999-12-31T23:59:59.999Z',
    reason: 'corrompu',
    dataVersion: 15,
    databaseId: meta.databaseId,
    revision: 999,
    counts: plain(AgendaStorage.counts(changed)),
    checksum: 'empreinte-volontairement-fausse',
    state: clone(changed)
  });

  assert.deepEqual((await result.storage.snapshotList()).map(snapshot => snapshot.id), validIds);
  await assert.rejects(result.storage.restoreSnapshot('snapshot-invalide'), error => error?.code === 'SNAPSHOT_NOT_FOUND');
  result.storage.close();
});

test('un snapshot lié ne remplace pas automatiquement un legacy viable mais non lié', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const result = await AgendaStorage.initialise(options({ indexedDB, localStorage, legacyEvidence: false }));
  await result.storage.save(baseState(15, 'Primaire avant corruption'));
  result.storage.close();

  const foreignMeta = JSON.parse(localStorage.getItem(legacyMetaKey));
  foreignMeta.databaseId = 'database-etrangere';
  localStorage.setItem(legacyMetaKey, JSON.stringify(foreignMeta));
  const corruptClient = indexedDB.record('clients', 'client-1');
  corruptClient.value.name = 'Valeur corrompue';
  indexedDB.put('clients', corruptClient);
  const legacyStateRaw = localStorage.getItem(legacyKey);
  const legacyMetaRaw = localStorage.getItem(legacyMetaKey);

  await assert.rejects(
    AgendaStorage.initialise(options({ indexedDB, localStorage })),
    error => error?.code === 'RECOVERY_REQUIRED'
  );
  assert.equal(localStorage.getItem(legacyKey), legacyStateRaw);
  assert.equal(localStorage.getItem(legacyMetaKey), legacyMetaRaw);
  assert.equal(clientNameFromDatabase(indexedDB), 'Valeur corrompue');
  assert.equal(indexedDB.record('meta', 'state').revision, 2);
  assert.equal(indexedDB.records('snapshots').length, 1);
  assert.equal(indexedDB.records('recoveries').length, 0);
});

test('un miroir stale ne remplace pas la base principale plus récente', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const first = await AgendaStorage.initialise(options({ indexedDB, localStorage, legacyEvidence: false }));
  const previousMirror = localStorage.getItem(legacyKey);
  const previousMirrorMeta = localStorage.getItem(legacyMetaKey);
  localStorage.failNextSet(legacyKey);

  const saveResult = await first.storage.save(baseState(15, 'Primaire plus récent'));
  assert.equal(saveResult.mirrorOk, false);
  assert.equal(localStorage.getItem(legacyKey), previousMirror);
  assert.equal(localStorage.getItem(legacyMetaKey), previousMirrorMeta);
  first.storage.close();

  const reopened = await AgendaStorage.initialise(options({ indexedDB, localStorage }));
  assert.equal(reopened.state.clients[0].name, 'Primaire plus récent');
  assert.match(reopened.warning, /plus ancienne/);
  assert.equal(indexedDB.record('meta', 'state').revision, 2);
  reopened.storage.close();
});

test('un miroir cohérent d’une autre databaseId reste ambigu même avec une révision plus basse', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const first = await AgendaStorage.initialise(options({ indexedDB, localStorage, legacyEvidence: false }));
  first.storage.close();

  const foreignState = baseState(15, 'Lignée étrangère à préserver');
  localStorage.setItem(legacyKey, JSON.stringify(foreignState));
  localStorage.setItem(legacyMetaKey, JSON.stringify({
    source: 'indexeddb',
    updatedAt: '2026-08-31T12:00:00.000Z',
    revision: 0,
    checksum: AgendaStorage.checksum(foreignState),
    counts: plain(AgendaStorage.counts(foreignState)),
    dataVersion: 15,
    databaseId: 'database-etrangere'
  }));
  const before = persistenceFootprint(indexedDB, localStorage);

  await assert.rejects(
    AgendaStorage.initialise(options({ indexedDB, localStorage, state: foreignState })),
    error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'AMBIGUOUS_STORAGE_SOURCES'
  );

  assert.deepEqual(persistenceFootprint(indexedDB, localStorage), before);
});

test('une exception pendant la lecture de la méta legacy bloque avant toute ouverture ou écriture', async () => {
  const indexedDB = new FakeIndexedDB();
  const current = baseState(15, 'État local à préserver');
  const stateRaw = JSON.stringify(current);
  const metaRaw = JSON.stringify({
    source: 'indexeddb',
    updatedAt: '2026-08-31T12:00:00.000Z',
    revision: 1,
    checksum: AgendaStorage.checksum(current),
    counts: plain(AgendaStorage.counts(current)),
    dataVersion: 15,
    databaseId: 'database-locale'
  });
  const localStorage = new MemoryStorage({ [legacyKey]: stateRaw, [legacyMetaKey]: metaRaw });
  localStorage.failNextGet(legacyMetaKey, 'SecurityError');

  await assert.rejects(
    AgendaStorage.initialise(options({ indexedDB, localStorage, state: current, legacyEvidence: true })),
    error => error?.code === 'RECOVERY_REQUIRED'
  );

  assert.equal(indexedDB.openCalls, 0);
  assert.equal(indexedDB.databases.size, 0);
  assert.equal(localStorage.getItem(legacyKey), stateRaw);
  assert.equal(localStorage.getItem(legacyMetaKey), metaRaw);
});

test('un état courant divergent sans méta exploitable reste ambigu et intact', async t => {
  for (const scenario of [
    { name: 'méta absente', metaRaw: null },
    { name: 'méta invalide', metaRaw: '{"source":' }
  ]) {
    await t.test(scenario.name, async () => {
      const indexedDB = new FakeIndexedDB();
      const localStorage = new MemoryStorage();
      const first = await AgendaStorage.initialise(options({ indexedDB, localStorage, legacyEvidence: false }));
      first.storage.close();

      const divergent = baseState(15, `Source divergente · ${scenario.name}`);
      localStorage.setItem(legacyKey, JSON.stringify(divergent));
      if (scenario.metaRaw === null) localStorage.removeItem(legacyMetaKey);
      else localStorage.setItem(legacyMetaKey, scenario.metaRaw);
      const before = persistenceFootprint(indexedDB, localStorage);

      await assert.rejects(
        AgendaStorage.initialise(options({ indexedDB, localStorage, state: divergent, legacyEvidence: true })),
        error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'AMBIGUOUS_STORAGE_SOURCES'
      );

      assert.deepEqual(persistenceFootprint(indexedDB, localStorage), before);
    });
  }
});

test('un alias legacy significatif reste ambigu même si son empreinte brute canonique égale celle d’IndexedDB', async () => {
  const migrateAliases = state => {
    const next = migrateToV15(state);
    const aliases = Array.isArray(state?.blockedSlots) ? state.blockedSlots.map(clone) : [];
    next.blocks = [...next.blocks, ...aliases];
    delete next.blockedSlots;
    return next;
  };
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const primary = baseState();
  const first = await AgendaStorage.initialise(options({
    indexedDB,
    localStorage,
    state: primary,
    validateState: migrateAliases,
    legacyEvidence: false
  }));
  first.storage.close();

  const aliasOnly = clone(primary);
  aliasOnly.blockedSlots = [{
    id: 'legacy-block-1',
    allDay: true,
    startDate: '2026-09-02',
    endDate: '2026-09-03',
    reason: 'Bloc présent uniquement dans un alias legacy'
  }];
  const primaryChecksum = indexedDB.record('meta', 'state').checksum;
  assert.equal(AgendaStorage.checksum(aliasOnly), primaryChecksum, 'la collision canonique brute doit être réelle');
  assert.notEqual(AgendaStorage.checksum(migrateAliases(aliasOnly)), primaryChecksum, 'la migration doit révéler le bloc caché');

  localStorage.setItem(legacyKey, JSON.stringify(aliasOnly));
  localStorage.removeItem(legacyMetaKey);
  const before = persistenceFootprint(indexedDB, localStorage);

  await assert.rejects(
    AgendaStorage.initialise(options({
      indexedDB,
      localStorage,
      state: aliasOnly,
      validateState: migrateAliases,
      legacyEvidence: true
    })),
    error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'AMBIGUOUS_STORAGE_SOURCES'
  );

  assert.deepEqual(persistenceFootprint(indexedDB, localStorage), before);
});

test('un miroir rev inférieure lié mais enrichi par un alias ne passe pas pour un stale sûr', async () => {
  const migrateAliases = state => {
    const next = migrateToV15(state);
    const aliases = Array.isArray(state?.blockedSlots) ? state.blockedSlots.map(clone) : [];
    next.blocks = [...next.blocks, ...aliases];
    delete next.blockedSlots;
    return next;
  };
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const revisionOne = baseState(15, 'Révision liée initiale');
  const first = await AgendaStorage.initialise(options({
    indexedDB,
    localStorage,
    state: revisionOne,
    validateState: migrateAliases,
    legacyEvidence: false
  }));
  const revisionOneMeta = indexedDB.record('meta', 'state');
  await first.storage.save(baseState(15, 'Révision IDB plus récente'));
  first.storage.close();

  const staleWithAlias = clone(revisionOne);
  staleWithAlias.blockedSlots = [{
    id: 'legacy-stale-block',
    allDay: true,
    startDate: '2026-09-03',
    endDate: '2026-09-04',
    reason: 'Alias à ne jamais écraser comme simple stale'
  }];
  assert.equal(AgendaStorage.checksum(staleWithAlias), revisionOneMeta.checksum, 'l’alias doit rester invisible à l’empreinte brute historique');
  localStorage.setItem(legacyKey, JSON.stringify(staleWithAlias));
  localStorage.setItem(legacyMetaKey, JSON.stringify({
    source: 'indexeddb',
    updatedAt: revisionOneMeta.updatedAt,
    revision: revisionOneMeta.revision,
    checksum: revisionOneMeta.checksum,
    counts: revisionOneMeta.counts,
    dataVersion: revisionOneMeta.dataVersion,
    databaseId: revisionOneMeta.databaseId,
    baseRevision: revisionOneMeta.revision,
    baseChecksum: revisionOneMeta.checksum
  }));
  const before = persistenceFootprint(indexedDB, localStorage);

  await assert.rejects(
    AgendaStorage.initialise(options({
      indexedDB,
      localStorage,
      state: staleWithAlias,
      validateState: migrateAliases,
      legacyEvidence: true
    })),
    error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'AMBIGUOUS_STORAGE_SOURCES'
  );

  assert.deepEqual(persistenceFootprint(indexedDB, localStorage), before);
});

test('un ancien legacy-fallback v14 lié est migré quand IndexedDB revient', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const baseV14 = baseState(14, 'Base v14');
  const first = await AgendaStorage.initialise(options({
    indexedDB,
    localStorage,
    state: baseV14,
    dataVersion: 14,
    validateState: validateV14,
    legacyEvidence: false,
    key: legacyV14Key
  }));
  const baseMeta = indexedDB.record('meta', 'state');
  first.storage.close();

  const fallbackV14 = baseState(14, 'Modification historique hors ligne');
  localStorage.setItem(legacyV14Key, JSON.stringify(fallbackV14));
  localStorage.setItem(legacyV14MetaKey, JSON.stringify({
    source: 'legacy-fallback',
    updatedAt: '2026-08-31T12:00:00.000Z',
    revision: baseMeta.revision + 1,
    checksum: AgendaStorage.checksum(fallbackV14),
    counts: plain(AgendaStorage.counts(fallbackV14)),
    dataVersion: 14,
    databaseId: baseMeta.databaseId,
    baseRevision: baseMeta.revision,
    baseChecksum: baseMeta.checksum
  }));
  const oldStateRaw = localStorage.getItem(legacyV14Key);
  const oldMetaRaw = localStorage.getItem(legacyV14MetaKey);

  const reconnected = await AgendaStorage.initialise(options({
    indexedDB,
    localStorage,
    state: fallbackV14,
    key: legacyKey,
    legacyReadKey: legacyV14Key
  }));

  assert.equal(reconnected.migrated, true);
  assert.equal(reconnected.recovered, true);
  assert.equal(reconnected.state.version, 15);
  assert.equal(reconnected.state.clients[0].name, 'Modification historique hors ligne');
  assert.equal(reconnected.state.appointments[0].refundDate, '');
  assert.equal(clientNameFromDatabase(indexedDB), 'Modification historique hors ligne');
  assert.equal(indexedDB.record('meta', 'state').revision, baseMeta.revision + 1);
  assert.equal(indexedDB.record('meta', 'state').migratedFromDataVersion, 14);
  assert.equal(indexedDB.records('snapshots')[0].state.clients[0].name, 'Base v14');
  assert.equal(localStorage.getItem(legacyV14Key), oldStateRaw);
  assert.equal(localStorage.getItem(legacyV14MetaKey), oldMetaRaw);
  assert.equal(JSON.parse(localStorage.getItem(legacyKey)).version, 15);
  assert.equal(JSON.parse(localStorage.getItem(legacyMetaKey)).source, 'indexeddb');
  reconnected.storage.close();
});

test('une base contenant des entités sans métadonnée est bloquée et préservée', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const first = await AgendaStorage.initialise(options({ indexedDB, localStorage, legacyEvidence: false }));
  first.storage.close();
  indexedDB.delete('meta', 'state');

  await assert.rejects(
    AgendaStorage.initialise(options({ indexedDB, localStorage })),
    error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'DATABASE_METADATA_MISSING'
  );
  assert.equal(clientNameFromDatabase(indexedDB), 'Alice');
  assert.equal(indexedDB.record('meta', 'state'), undefined);
});

test('une révision de méta corrompue bloque puis la récupération repart sur une nouvelle lignée', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const current = baseState(15, 'État intact sous méta corrompue');
  const first = await AgendaStorage.initialise(options({ indexedDB, localStorage, state: current, legacyEvidence: false }));
  first.storage.close();
  const originalMeta = indexedDB.record('meta', 'state');
  indexedDB.put('meta', { ...originalMeta, revision: 'corrompue' });

  await assert.rejects(
    AgendaStorage.initialise(options({ indexedDB, localStorage, state: current })),
    error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'DATABASE_METADATA_INVALID'
  );
  assert.equal(clientNameFromDatabase(indexedDB), 'État intact sous méta corrompue');
  assert.equal(indexedDB.record('meta', 'state').revision, 'corrompue');

  const replacement = baseState(15, 'Sauvegarde autorisée');
  const recovered = await AgendaStorage.recoverFromState(options({ indexedDB, localStorage, state: replacement }), replacement);
  const repairedMeta = indexedDB.record('meta', 'state');

  assert.equal(recovered.state.clients[0].name, 'Sauvegarde autorisée');
  assert.equal(repairedMeta.revision, 1);
  assert.notEqual(repairedMeta.databaseId, originalMeta.databaseId);
  assert.equal(repairedMeta.checksum, AgendaStorage.checksum(replacement));
  assert.equal(indexedDB.records('recoveries').length, 1);
  assert.equal(indexedDB.records('recoveries')[0].state.clients[0].name, 'État intact sous méta corrompue');
  recovered.storage.close();
});

test('une récupération sur nouvelle lignée reconnaît uniquement le miroir exact qu’elle a remplacé', async t => {
  async function recoverWithStaleMirror() {
    const indexedDB = new FakeIndexedDB();
    const localStorage = new MemoryStorage();
    const previous = baseState(15, 'État avant récupération');
    const first = await AgendaStorage.initialise(options({ indexedDB, localStorage, state: previous, legacyEvidence: false }));
    first.storage.close();
    const originalMeta = indexedDB.record('meta', 'state');
    indexedDB.put('meta', { ...originalMeta, revision: 'corrompue' });
    const staleStateRaw = localStorage.getItem(legacyKey);
    const staleMetaRaw = localStorage.getItem(legacyMetaKey);

    localStorage.failNextSet(legacyKey);
    const replacement = baseState(15, 'Sauvegarde récupérée malgré le miroir');
    const recovered = await AgendaStorage.recoverFromState(options({ indexedDB, localStorage, state: replacement }), replacement);
    assert.equal(recovered.state.clients[0].name, 'Sauvegarde récupérée malgré le miroir');
    assert.equal(recovered.storage.getState().clients[0].name, 'Sauvegarde récupérée malgré le miroir');
    assert.match(recovered.warning, /copie locale liée n’a pas pu être mise à jour/i);
    recovered.storage.close();
    assert.equal(localStorage.getItem(legacyKey), staleStateRaw);
    assert.equal(localStorage.getItem(legacyMetaKey), staleMetaRaw);
    return { indexedDB, localStorage };
  }

  await t.test('le miroir remplacé exact ne rebloque pas le lancement', async () => {
    const { indexedDB, localStorage } = await recoverWithStaleMirror();
    const before = persistenceFootprint(indexedDB, localStorage);
    const previousSetCalls = localStorage.setCalls;

    const reopened = await AgendaStorage.initialise(options({ indexedDB, localStorage }));

    assert.equal(reopened.state.clients[0].name, 'Sauvegarde récupérée malgré le miroir');
    assert.match(reopened.warning, /copie locale liée est plus ancienne|remplacée/i);
    assert.equal(localStorage.setCalls, previousSetCalls);
    assert.deepEqual(persistenceFootprint(indexedDB, localStorage), before);
    reopened.storage.close();
  });

  await t.test('une variation cohérente de ce miroir reste ambiguë et intacte', async () => {
    const { indexedDB, localStorage } = await recoverWithStaleMirror();
    const altered = JSON.parse(localStorage.getItem(legacyKey));
    altered.clients[0].name = 'Autre branche locale après récupération';
    const alteredMeta = JSON.parse(localStorage.getItem(legacyMetaKey));
    alteredMeta.checksum = AgendaStorage.checksum(altered);
    alteredMeta.counts = plain(AgendaStorage.counts(altered));
    localStorage.setItem(legacyKey, JSON.stringify(altered));
    localStorage.setItem(legacyMetaKey, JSON.stringify(alteredMeta));
    const before = persistenceFootprint(indexedDB, localStorage);
    const previousSetCalls = localStorage.setCalls;

    await assert.rejects(
      AgendaStorage.initialise(options({ indexedDB, localStorage, state: altered })),
      error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'AMBIGUOUS_STORAGE_SOURCES'
    );

    assert.equal(localStorage.setCalls, previousSetCalls);
    assert.deepEqual(persistenceFootprint(indexedDB, localStorage), before);
  });
});

test('une nouvelle lignée garde la provenance même si recovery et miroir avaient initialement le même contenu', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const common = baseState(15, 'Même contenu avant et après recovery');
  const first = await AgendaStorage.initialise(options({ indexedDB, localStorage, state: common, legacyEvidence: false }));
  first.storage.close();
  const originalMeta = indexedDB.record('meta', 'state');
  indexedDB.put('meta', { ...originalMeta, revision: 'corrompue' });
  const staleStateRaw = localStorage.getItem(legacyKey);
  const staleMetaRaw = localStorage.getItem(legacyMetaKey);

  localStorage.failNextSet(legacyKey);
  const recovered = await AgendaStorage.recoverFromState(options({ indexedDB, localStorage, state: common }), common);
  const newLineageMeta = indexedDB.record('meta', 'state');
  assert.notEqual(newLineageMeta.databaseId, originalMeta.databaseId);
  assert.equal(localStorage.getItem(legacyKey), staleStateRaw);
  assert.equal(localStorage.getItem(legacyMetaKey), staleMetaRaw);

  const later = baseState(15, 'Commit ultérieur de la nouvelle lignée');
  localStorage.failNextSet(legacyKey);
  const saved = await recovered.storage.save(later, { reason: 'post-recovery-sans-miroir' });
  assert.equal(saved.mirrorOk, false);
  recovered.storage.close();

  const beforeReload = persistenceFootprint(indexedDB, localStorage);
  const previousSetCalls = localStorage.setCalls;
  const reopened = await AgendaStorage.initialise(options({ indexedDB, localStorage, state: common }));
  assert.equal(reopened.state.clients[0].name, 'Commit ultérieur de la nouvelle lignée');
  assert.match(reopened.warning, /plus ancienne|déjà été remplacée/i);
  assert.equal(localStorage.setCalls, previousSetCalls);
  assert.deepEqual(persistenceFootprint(indexedDB, localStorage), beforeReload);
  reopened.storage.close();
});

test('recoverFromState accepte et protège une vraie paire v12.5 minimale avant remplacement autorisé', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const rawV14 = baseState(14, 'Source v12.5 à protéger');
  const first = await AgendaStorage.initialise(options({
    indexedDB,
    localStorage,
    state: rawV14,
    dataVersion: 14,
    validateState: validateV14,
    legacyEvidence: false,
    key: legacyV14Key
  }));
  first.storage.close();
  const sourceMeta = indexedDB.record('meta', 'state');
  indexedDB.put('meta', { ...sourceMeta, revision: 'corrompue' });
  localStorage.setItem(legacyV14MetaKey, JSON.stringify({
    source: 'indexeddb',
    updatedAt: sourceMeta.updatedAt,
    revision: sourceMeta.revision,
    checksum: AgendaStorage.checksum(rawV14)
  }));
  const protectedStateRaw = localStorage.getItem(legacyV14Key);
  const protectedMetaRaw = localStorage.getItem(legacyV14MetaKey);
  const replacement = baseState(15, 'Sauvegarde utilisateur autorisée');

  const recovered = await AgendaStorage.recoverFromState(options({
    indexedDB,
    localStorage,
    state: replacement,
    key: legacyKey,
    legacyReadKey: legacyV14Key
  }), replacement);

  assert.equal(recovered.state.clients[0].name, 'Sauvegarde utilisateur autorisée');
  assert.equal(indexedDB.records('recoveries')[0].state.clients[0].name, 'Source v12.5 à protéger');
  assert.equal(localStorage.getItem(legacyV14Key), protectedStateRaw);
  assert.equal(localStorage.getItem(legacyV14MetaKey), protectedMetaRaw);
  recovered.storage.close();
});

test('une récupération v1 sans méta conserve le raw exact et ne reconnaît aucune variante au reload', async t => {
  const rawV1 = {
    version: 1,
    appointments: [{ id: 'legacy-rdv-1', clientId: 'legacy-client-1', paymentStatus: 'paid', paymentDate: '2026-06-10' }],
    clientProfiles: { Alice: { id: 'legacy-client-1', name: 'Alice', phone: '0600000000' } }
  };
  const validateV1OrV15 = state => {
    const source = clone(state);
    if (Number(source?.version) === 15) {
      assertStateShape(source);
      return source;
    }
    if (Number(source?.version) !== 1 || !Array.isArray(source.appointments) || !source.clientProfiles || typeof source.clientProfiles !== 'object') {
      throw new Error('INVALID_VERSION');
    }
    const profile = Object.values(source.clientProfiles)[0];
    return {
      ...baseState(15, profile?.name || 'Cliente v1'),
      appointments: source.appointments.map(item => ({ ...item, refundDate: '' }))
    };
  };

  async function recoverFresh() {
    const indexedDB = new FakeIndexedDB();
    const localStorage = new MemoryStorage();
    const replacement = baseState(15, 'Sauvegarde choisie après v1');
    localStorage.failNextSet(legacyKey);
    const recovered = await AgendaStorage.recoverFromState({
      ...options({ indexedDB, localStorage, state: replacement, validateState: validateV1OrV15 }),
      legacyReadKey: legacyKey,
      legacyRawKey: 'legacy-v1-composite',
      legacyRawState: clone(rawV1),
      legacyEvidence: true,
      legacySource: 'v1'
    }, replacement);
    assert.equal(recovered.storage.getState().clients[0].name, 'Sauvegarde choisie après v1');
    assert.match(recovered.warning, /copie locale liée n’a pas pu être mise à jour/i);
    recovered.storage.close();
    const preserved = indexedDB.records('snapshots').find(snapshot => snapshot.reason === 'before-user-recovery-legacy-source');
    assert.deepEqual(preserved?.state, rawV1);
    assert.equal(preserved?.checksumKind, 'exact-json-v1');
    return { indexedDB, localStorage };
  }

  const reopenOptions = (indexedDB, localStorage, legacyRawState) => ({
    ...options({ indexedDB, localStorage, state: validateV1OrV15(rawV1), validateState: validateV1OrV15 }),
    legacyReadKey: legacyKey,
    legacyRawKey: 'legacy-v1-composite',
    legacyRawState,
    legacyEvidence: true,
    legacySource: 'v1'
  });

  await t.test('le composite exact laisse la base récupérée active', async () => {
    const { indexedDB, localStorage } = await recoverFresh();
    const before = persistenceFootprint(indexedDB, localStorage);
    const reopened = await AgendaStorage.initialise(reopenOptions(indexedDB, localStorage, clone(rawV1)));
    assert.equal(reopened.state.clients[0].name, 'Sauvegarde choisie après v1');
    assert.match(reopened.warning, /plus ancienne|déjà été remplacée/i);
    assert.deepEqual(persistenceFootprint(indexedDB, localStorage), before);
    reopened.storage.close();
  });

  await t.test('un seul champ v1 différent rebloque sans écriture', async () => {
    const { indexedDB, localStorage } = await recoverFresh();
    const alteredRaw = clone(rawV1);
    alteredRaw.clientProfiles.Alice.phone = '0699999999';
    const before = persistenceFootprint(indexedDB, localStorage);
    const previousSetCalls = localStorage.setCalls;
    await assert.rejects(
      AgendaStorage.initialise(reopenOptions(indexedDB, localStorage, alteredRaw)),
      error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'AMBIGUOUS_STORAGE_SOURCES'
    );
    assert.equal(localStorage.setCalls, previousSetCalls);
    assert.deepEqual(persistenceFootprint(indexedDB, localStorage), before);
  });
});

test('la récupération d’une méta corrompue respecte le CAS et ne remplace pas une source devenue divergente', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const current = baseState(15, 'État observé avant récupération');
  const first = await AgendaStorage.initialise(options({ indexedDB, localStorage, state: current, legacyEvidence: false }));
  first.storage.close();
  const originalMeta = indexedDB.record('meta', 'state');
  indexedDB.put('meta', { ...originalMeta, revision: 'corrompue' });

  const divergent = baseState(15, 'État concurrent à préserver');
  const divergentMeta = {
    ...originalMeta,
    revision: 2,
    updatedAt: '2026-09-01T12:00:00.000Z',
    checksum: AgendaStorage.checksum(divergent),
    counts: plain(AgendaStorage.counts(divergent))
  };
  indexedDB.beforeNextTransaction('readwrite', () => {
    indexedDB.put('clients', { id: 'client-1', order: 0, value: divergent.clients[0] });
    indexedDB.put('meta', divergentMeta);
  });
  const replacement = baseState(15, 'Sauvegarde qui ne doit pas écraser');

  await assert.rejects(
    AgendaStorage.recoverFromState(options({ indexedDB, localStorage, state: replacement }), replacement),
    error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'CONCURRENT_CHANGE'
  );

  assert.equal(indexedDB.transactionHooks.length, 0);
  assert.equal(clientNameFromDatabase(indexedDB), 'État concurrent à préserver');
  assert.deepEqual(indexedDB.record('meta', 'state'), divergentMeta);
  assert.equal(indexedDB.records('recoveries').length, 0);
  assert.equal(JSON.parse(localStorage.getItem(legacyKey)).clients[0].name, 'État observé avant récupération');
});

test('la récupération manuelle remplace atomiquement et met l’ancien état en quarantaine', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const first = await AgendaStorage.initialise(options({ indexedDB, localStorage, state: baseState(15, 'À conserver'), legacyEvidence: false }));
  first.storage.close();

  const replacement = baseState(15, 'Sauvegarde choisie');
  const recovered = await AgendaStorage.recoverFromState(options({ indexedDB, localStorage, state: replacement }), replacement);

  assert.equal(recovered.recovered, true);
  assert.equal(recovered.state.clients[0].name, 'Sauvegarde choisie');
  assert.equal(clientNameFromDatabase(indexedDB), 'Sauvegarde choisie');
  const visibleRecoveries = await recovered.storage.recoveryList();
  assert.equal(visibleRecoveries.length, 1);
  assert.equal(visibleRecoveries[0].counts.clients, 1);
  const quarantined = indexedDB.records('recoveries')[0];
  assert.equal(quarantined.state.clients[0].name, 'À conserver');
  assert.equal(quarantined.replacementChecksum, AgendaStorage.checksum(replacement));
  assert.equal(indexedDB.record('meta', 'state').quarantineId, quarantined.id);
  recovered.storage.close();
});

test('recoverFromState bloque après deux lectures temporaires sans état observé et ne modifie rien', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const first = await AgendaStorage.initialise(options({
    indexedDB,
    localStorage,
    state: baseState(15, 'État primaire intact'),
    legacyEvidence: false
  }));
  first.storage.close();
  const before = persistenceFootprint(indexedDB, localStorage);
  indexedDB.failNextOperation('clients', 'getAll', 'UnknownError');
  indexedDB.failNextOperation('clients', 'getAll', 'UnknownError');
  const replacement = baseState(15, 'Récupération interdite');

  await assert.rejects(
    AgendaStorage.recoverFromState(options({ indexedDB, localStorage, state: replacement }), replacement),
    error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'DATABASE_READ_FAILED'
  );

  assert.equal(indexedDB.operationFailures.length, 0, 'les deux tentatives de lecture doivent avoir consommé une erreur temporaire');
  assert.deepEqual(persistenceFootprint(indexedDB, localStorage), before);
});

test('recoverFromState refuse trois sources divergentes et les laisse strictement intactes', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const primary = baseState(15, 'État IndexedDB');
  const first = await AgendaStorage.initialise(options({ indexedDB, localStorage, state: primary, legacyEvidence: false }));
  first.storage.close();

  const legacyState = baseState(15, 'État legacy divergent');
  const legacyMeta = JSON.parse(localStorage.getItem(legacyMetaKey));
  legacyMeta.checksum = AgendaStorage.checksum(legacyState);
  legacyMeta.counts = plain(AgendaStorage.counts(legacyState));
  localStorage.setItem(legacyKey, JSON.stringify(legacyState));
  localStorage.setItem(legacyMetaKey, JSON.stringify(legacyMeta));
  const before = persistenceFootprint(indexedDB, localStorage);
  const backup = baseState(15, 'Sauvegarde divergente');

  await assert.rejects(
    AgendaStorage.recoverFromState(options({ indexedDB, localStorage, state: backup }), backup),
    error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'AMBIGUOUS_STORAGE_SOURCES'
  );

  assert.deepEqual(persistenceFootprint(indexedDB, localStorage), before);
});

test('une sauvegarde identique à l’état IDB autorise la résolution d’un miroir divergent', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const primary = baseState(15, 'État IndexedDB confirmé par le fichier');
  const first = await AgendaStorage.initialise(options({ indexedDB, localStorage, state: primary, legacyEvidence: false }));
  first.storage.close();

  const legacyState = baseState(15, 'Ancienne branche locale à conserver');
  const legacyMeta = JSON.parse(localStorage.getItem(legacyMetaKey));
  legacyMeta.checksum = AgendaStorage.checksum(legacyState);
  legacyMeta.counts = plain(AgendaStorage.counts(legacyState));
  localStorage.setItem(legacyKey, JSON.stringify(legacyState));
  localStorage.setItem(legacyMetaKey, JSON.stringify(legacyMeta));

  const recovered = await AgendaStorage.recoverFromState(options({ indexedDB, localStorage, state: primary }), primary);

  assert.equal(recovered.state.clients[0].name, 'État IndexedDB confirmé par le fichier');
  assert.equal(clientNameFromDatabase(indexedDB), 'État IndexedDB confirmé par le fichier');
  assert.ok(indexedDB.records('snapshots').some(snapshot => snapshot.state.clients[0].name === 'Ancienne branche locale à conserver'));
  assert.ok(indexedDB.records('recoveries').some(record => record.state.clients[0].name === 'État IndexedDB confirmé par le fichier'));
  assert.equal(JSON.parse(localStorage.getItem(legacyKey)).clients[0].name, 'État IndexedDB confirmé par le fichier');
  recovered.storage.close();
});

test('deux onglets ne peuvent pas écraser silencieusement la même révision', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const first = await AgendaStorage.initialise(options({ indexedDB, localStorage, legacyEvidence: false }));
  const second = await AgendaStorage.initialise(options({ indexedDB, localStorage }));

  await first.storage.save(baseState(15, 'Écrit par onglet A'));
  await assert.rejects(
    second.storage.save(baseState(15, 'Écrit par onglet B')),
    error => error?.code === 'CONCURRENT_CHANGE'
  );
  assert.equal(clientNameFromDatabase(indexedDB), 'Écrit par onglet A');
  assert.equal(indexedDB.record('meta', 'state').revision, 2);
  first.storage.close();
  second.storage.close();
});

test('la rotation conserve exactement les cinq snapshots les plus récents', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const result = await AgendaStorage.initialise(options({ indexedDB, localStorage, legacyEvidence: false }));

  for (let index = 1; index <= 6; index += 1) {
    await result.storage.save(baseState(15, `Révision ${index}`), { reason: `rotation-${index}` });
  }

  assert.equal((await result.storage.snapshotList()).length, 5);
  const revisions = indexedDB.records('snapshots').map(snapshot => snapshot.revision).sort((one, two) => one - two);
  assert.deepEqual(revisions, [2, 3, 4, 5, 6]);
  result.storage.close();
});

test('IndexedDB absent bloque sans retourner d’adapter ni modifier la paire legacy', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const first = await AgendaStorage.initialise(options({ indexedDB, localStorage, legacyEvidence: false }));
  first.storage.close();
  const previousState = localStorage.getItem(legacyKey);
  const previousMeta = localStorage.getItem(legacyMetaKey);
  const previousSetCalls = localStorage.setCalls;

  await assert.rejects(
    AgendaStorage.initialise(options({ localStorage })),
    error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'INDEXEDDB_UNAVAILABLE'
  );

  assert.equal(localStorage.getItem(legacyKey), previousState);
  assert.equal(localStorage.getItem(legacyMetaKey), previousMeta);
  assert.equal(localStorage.setCalls, previousSetCalls);
});

test('un échec d’ouverture IndexedDB bloque sans modifier la paire legacy', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const first = await AgendaStorage.initialise(options({ indexedDB, localStorage, legacyEvidence: false }));
  first.storage.close();
  const previousState = localStorage.getItem(legacyKey);
  const previousMeta = localStorage.getItem(legacyMetaKey);
  const previousSetCalls = localStorage.setCalls;
  const failingIndexedDB = {
    open() {
      const error = new Error('Ouverture temporairement impossible');
      error.name = 'UnknownError';
      throw error;
    }
  };

  await assert.rejects(
    AgendaStorage.initialise(options({ indexedDB: failingIndexedDB, localStorage })),
    error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'DATABASE_OPEN_FAILED'
  );

  assert.equal(localStorage.setCalls, previousSetCalls);
  assert.equal(localStorage.getItem(legacyKey), previousState);
  assert.equal(localStorage.getItem(legacyMetaKey), previousMeta);
});

test('une ouverture IndexedDB muette expire et bloque sans aucune écriture', { timeout: 1000 }, async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const first = await AgendaStorage.initialise(options({ indexedDB, localStorage, legacyEvidence: false }));
  first.storage.close();
  const before = persistenceFootprint(indexedDB, localStorage);
  const previousSetCalls = localStorage.setCalls;
  const previousOpenCalls = indexedDB.openCalls;
  indexedDB.hangNextOpen();

  await assert.rejects(
    AgendaStorage.initialise(options({ indexedDB, localStorage, startupTimeoutMs: 20 })),
    error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'DATABASE_OPEN_TIMEOUT'
  );

  assert.equal(indexedDB.openCalls, previousOpenCalls + 1);
  assert.equal(localStorage.setCalls, previousSetCalls);
  assert.deepEqual(persistenceFootprint(indexedDB, localStorage), before);
});

test('une première lecture readonly muette est annulée et bloque sans aucune écriture', { timeout: 1000 }, async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const first = await AgendaStorage.initialise(options({ indexedDB, localStorage, legacyEvidence: false }));
  first.storage.close();
  const before = persistenceFootprint(indexedDB, localStorage);
  const previousSetCalls = localStorage.setCalls;
  const previousAbortCalls = indexedDB.abortCalls;
  indexedDB.hangNextOperation('clients', 'getAll');

  await assert.rejects(
    AgendaStorage.initialise(options({ indexedDB, localStorage, startupTimeoutMs: 20 })),
    error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'DATABASE_READ_TIMEOUT'
  );

  assert.equal(indexedDB.abortCalls, previousAbortCalls + 1);
  assert.equal(indexedDB.operationHangs.length, 0);
  assert.equal(localStorage.setCalls, previousSetCalls);
  assert.deepEqual(persistenceFootprint(indexedDB, localStorage), before);
});

test('la relecture muette après le premier commit expire sans rejouer la création au retry', { timeout: 1000 }, async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const initial = baseState(15, 'Premier commit déjà durable');
  const previousAbortCalls = indexedDB.abortCalls;
  indexedDB.hangNextOperation('clients', 'getAll', 1);

  await assert.rejects(
    AgendaStorage.initialise(options({ indexedDB, localStorage, state: initial, legacyEvidence: false, startupTimeoutMs: 20 })),
    error => error?.code === 'RECOVERY_REQUIRED' && error?.cause?.code === 'DATABASE_READ_TIMEOUT'
  );

  assert.equal(indexedDB.abortCalls, previousAbortCalls + 1);
  assert.equal(clientNameFromDatabase(indexedDB), 'Premier commit déjà durable');
  assert.equal(indexedDB.record('meta', 'state').revision, 1);
  assert.equal(indexedDB.records('snapshots').length, 0);

  const retry = await AgendaStorage.initialise(options({ indexedDB, localStorage, state: initial, startupTimeoutMs: 20 }));
  assert.equal(retry.state.clients[0].name, 'Premier commit déjà durable');
  assert.equal(indexedDB.record('meta', 'state').revision, 1, 'le retry doit seulement relire le commit déjà durable');
  assert.equal(indexedDB.records('snapshots').length, 0);
  retry.storage.close();
});

test('la relecture muette après migration expire sans rejouer migration ni snapshot au retry', { timeout: 1000 }, async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const rawV14 = baseState(14, 'Migration déjà durable');
  const first = await AgendaStorage.initialise(options({
    indexedDB,
    localStorage,
    state: rawV14,
    dataVersion: 14,
    validateState: validateV14,
    legacyEvidence: false
  }));
  first.storage.close();
  const previousAbortCalls = indexedDB.abortCalls;
  indexedDB.hangNextOperation('clients', 'getAll', 1);

  await assert.rejects(
    AgendaStorage.initialise(options({ indexedDB, localStorage, state: rawV14, startupTimeoutMs: 20 })),
    error => error?.code === 'RECOVERY_REQUIRED' && error?.stage === 'migration' && error?.cause?.code === 'DATABASE_READ_TIMEOUT'
  );

  assert.equal(indexedDB.abortCalls, previousAbortCalls + 1);
  assert.equal(clientNameFromDatabase(indexedDB), 'Migration déjà durable');
  assert.equal(indexedDB.record('meta', 'state').revision, 2);
  assert.equal(indexedDB.record('meta', 'state').dataVersion, 15);
  assert.equal(indexedDB.records('snapshots').length, 1);

  const retry = await AgendaStorage.initialise(options({ indexedDB, localStorage, state: rawV14, startupTimeoutMs: 20 }));
  assert.equal(retry.state.version, 15);
  assert.equal(indexedDB.record('meta', 'state').revision, 2, 'le retry ne doit pas rejouer la migration');
  assert.equal(indexedDB.records('snapshots').length, 1, 'le snapshot v14 ne doit pas être dupliqué');
  retry.storage.close();
});

test('un nouvel essai peut initialiser une base neuve restée vide après l’échec du premier commit', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const initial = baseState(15, 'Deuxième tentative');
  indexedDB.failNextOperation('meta', 'put', 'AbortError');

  await assert.rejects(
    AgendaStorage.initialise(options({ indexedDB, localStorage, state: initial, legacyEvidence: false })),
    error => error?.code === 'RECOVERY_REQUIRED'
  );
  assert.equal(indexedDB.record('meta', 'state'), undefined);
  assert.ok(indexedDB.record('meta', 'bootstrap'), 'le marqueur de création doit survivre au premier commit avorté');
  assert.equal(indexedDB.records('clients').length, 0);
  assert.equal(indexedDB.records('snapshots').length, 0);
  assert.equal(indexedDB.records('recoveries').length, 0);

  const retry = await AgendaStorage.initialise(options({ indexedDB, localStorage, state: initial, legacyEvidence: false }));

  assert.equal(retry.mode, 'indexeddb');
  assert.equal(retry.state.clients[0].name, 'Deuxième tentative');
  assert.equal(indexedDB.record('meta', 'state').revision, 1);
  assert.equal(indexedDB.record('meta', 'bootstrap'), undefined, 'le premier commit réussi doit supprimer le marqueur atomiquement');
  assert.equal(clientNameFromDatabase(indexedDB), 'Deuxième tentative');
  retry.storage.close();
});

test('un quota sur le snapshot conserve le commit métier sans snapshot et le signale', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const result = await AgendaStorage.initialise(options({ indexedDB, localStorage, legacyEvidence: false }));
  indexedDB.failNextOperation('snapshots', 'put', 'QuotaExceededError');

  const saveResult = await result.storage.save(baseState(15, 'Commit sans snapshot'));

  assert.equal(saveResult.ok, true);
  assert.equal(saveResult.snapshotOk, false);
  assert.equal(saveResult.revision, 2);
  assert.equal(clientNameFromDatabase(indexedDB), 'Commit sans snapshot');
  assert.equal(indexedDB.record('meta', 'state').revision, 2);
  assert.equal(indexedDB.records('snapshots').length, 0);
  assert.equal(JSON.parse(localStorage.getItem(legacyKey)).clients[0].name, 'Commit sans snapshot');
  result.storage.close();
});

test('restoreSnapshot injecte le restoreSafetyId dans le même commit que l’état restauré', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const result = await AgendaStorage.initialise(options({ indexedDB, localStorage, legacyEvidence: false }));
  await result.storage.save(baseState(15, 'État courant avant retour'));
  const snapshotId = (await result.storage.snapshotList())[0]?.id;
  assert.ok(snapshotId, 'la copie à restaurer doit exister');

  const restored = await result.storage.restoreSnapshot(snapshotId, { restoreSafetyId: 'restore-operation-atomique' });
  const storedSettings = indexedDB.record('settings', 'settings')?.value;
  const storedMeta = indexedDB.record('meta', 'state');
  const mirrored = JSON.parse(localStorage.getItem(legacyKey));

  assert.equal(restored.settings.restoreSafetyId, 'restore-operation-atomique');
  assert.equal(result.storage.getState().settings.restoreSafetyId, 'restore-operation-atomique');
  assert.equal(storedSettings.restoreSafetyId, 'restore-operation-atomique');
  assert.equal(mirrored.settings.restoreSafetyId, 'restore-operation-atomique');
  assert.equal(storedMeta.checksum, AgendaStorage.checksum(restored));
  assert.equal(storedMeta.revision, 3);
  const preservedCurrent = indexedDB.records('snapshots').find(snapshot => snapshot.reason === 'restore-automatic-snapshot');
  assert.equal(preservedCurrent?.state?.clients?.[0]?.name, 'État courant avant retour');
  assert.equal(preservedCurrent?.state?.settings?.restoreSafetyId, undefined);
  result.storage.close();
});

test('un snapshot v14 transmet createdAt comme migrationDate et restaure la même date financière', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const contexts = [];
  const validateWithMigrationDate = (state, context = {}) => {
    const next = clone(state);
    assertStateShape(next);
    if (Number(next.version) === 14) {
      contexts.push(clone(context));
      const migrationDate = String(context.migrationDate || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(migrationDate)) throw new Error('MISSING_MIGRATION_DATE');
      next.appointments = next.appointments.map(item => ({
        ...item,
        paymentDate: item.paymentStatus === 'paid' && item.paymentDate > migrationDate ? migrationDate : item.paymentDate,
        refundDate: ''
      }));
      next.version = 15;
    }
    if (Number(next.version) !== 15) throw new Error('INVALID_VERSION');
    return next;
  };
  const result = await AgendaStorage.initialise(options({
    indexedDB,
    localStorage,
    legacyEvidence: false,
    validateState: validateWithMigrationDate
  }));
  const meta = indexedDB.record('meta', 'state');
  const rawV14 = baseState(14, 'Snapshot financier v14');
  rawV14.appointments[0].date = '2026-09-10';
  rawV14.appointments[0].paymentDate = '2026-09-10';
  const createdAt = '2026-09-01T09:00:00.000Z';
  indexedDB.put('snapshots', {
    id: 'snapshot-v14-date-figee',
    createdAt,
    reason: 'before-data-migration',
    appVersion: '12.5-beta',
    dataVersion: 14,
    databaseId: meta.databaseId,
    revision: 0,
    counts: plain(AgendaStorage.counts(rawV14)),
    checksum: AgendaStorage.checksum(rawV14),
    state: rawV14
  });

  const listed = await result.storage.snapshotList();
  assert.ok(listed.some(snapshot => snapshot.id === 'snapshot-v14-date-figee'));
  const restored = await result.storage.restoreSnapshot('snapshot-v14-date-figee');

  assert.equal(restored.appointments[0].paymentDate, '2026-09-01');
  assert.ok(contexts.length >= 2, 'la liste et la restauration doivent toutes deux valider le snapshot historique');
  assert.ok(contexts.every(context => context.migrationDate === '2026-09-01'));
  assert.equal(indexedDB.record('appointments', 'appointment-1').value.paymentDate, '2026-09-01');

  contexts.length = 0;
  indexedDB.put('snapshots', {
    id: 'snapshot-v14-date-locale-explicite',
    createdAt: '2026-09-01T10:30:00.000Z',
    migrationDate: '2026-09-02',
    reason: 'before-data-migration',
    appVersion: '12.5-beta',
    dataVersion: 14,
    databaseId: meta.databaseId,
    revision: 0,
    counts: plain(AgendaStorage.counts(rawV14)),
    checksum: AgendaStorage.checksum(rawV14),
    state: rawV14
  });

  const restoredWithLocalDate = await result.storage.restoreSnapshot('snapshot-v14-date-locale-explicite');
  assert.equal(restoredWithLocalDate.appointments[0].paymentDate, '2026-09-02');
  assert.ok(contexts.length >= 1);
  assert.ok(contexts.some(context => context.migrationDate === '2026-09-02'), 'la date locale explicite doit primer sur le jour UTC de createdAt');
  assert.equal(indexedDB.record('appointments', 'appointment-1').value.paymentDate, '2026-09-02');

  result.storage.close();
});

test('restoreSnapshot et requireSnapshot refusent le quota sans modifier état, méta ni révision', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const result = await AgendaStorage.initialise(options({ indexedDB, localStorage, legacyEvidence: false }));
  await result.storage.save(baseState(15, 'État courant'));
  const snapshotId = (await result.storage.snapshotList())[0]?.id;
  assert.ok(snapshotId, 'la restauration doit disposer d’un snapshot antérieur');

  const footprint = () => ({
    clients: indexedDB.records('clients'),
    appointments: indexedDB.records('appointments'),
    blocks: indexedDB.records('blocks'),
    expenses: indexedDB.records('expenses'),
    settings: indexedDB.records('settings'),
    meta: indexedDB.record('meta', 'state'),
    snapshots: indexedDB.records('snapshots'),
    legacyStateRaw: localStorage.getItem(legacyKey),
    legacyMetaRaw: localStorage.getItem(legacyMetaKey)
  });
  const assertQuotaLeavesEverythingUntouched = async operation => {
    const before = footprint();
    indexedDB.failNextOperation('snapshots', 'put', 'QuotaExceededError');
    await assert.rejects(operation(), error => error?.code === 'SNAPSHOT_QUOTA_EXCEEDED');
    assert.deepEqual(footprint(), before);
    assert.equal(result.storage.getState().clients[0].name, 'État courant');
    assert.equal((await result.storage.verify()).revision, 2);
  };

  await assertQuotaLeavesEverythingUntouched(() => result.storage.restoreSnapshot(snapshotId));
  await assertQuotaLeavesEverythingUntouched(() => result.storage.save(
    baseState(15, 'État exigeant un snapshot'),
    { reason: 'snapshot-obligatoire', requireSnapshot: true }
  ));
  result.storage.close();
});

test('un échec de migration IDB bloque sans modifier données, méta ni paire legacy', async () => {
  const indexedDB = new FakeIndexedDB();
  const localStorage = new MemoryStorage();
  const rawV14 = baseState(14, 'État v14 à préserver');
  const first = await AgendaStorage.initialise(options({
    indexedDB,
    localStorage,
    state: rawV14,
    dataVersion: 14,
    validateState: validateV14,
    legacyEvidence: false
  }));
  first.storage.close();
  const protectedStores = ['clients', 'appointments', 'blocks', 'expenses', 'settings', 'meta', 'snapshots', 'recoveries'];
  const storesBefore = Object.fromEntries(protectedStores.map(name => [name, indexedDB.records(name)]));
  const legacyStateBefore = localStorage.getItem(legacyKey);
  const legacyMetaBefore = localStorage.getItem(legacyMetaKey);
  const setCallsBefore = localStorage.setCalls;
  indexedDB.failNextOperation('meta', 'put', 'AbortError');

  await assert.rejects(
    AgendaStorage.initialise(options({ indexedDB, localStorage, state: rawV14 })),
    error => error?.code === 'RECOVERY_REQUIRED' && error?.stage === 'migration'
  );

  assert.equal(indexedDB.operationFailures.length, 0);
  assert.deepEqual(Object.fromEntries(protectedStores.map(name => [name, indexedDB.records(name)])), storesBefore);
  assert.equal(localStorage.getItem(legacyKey), legacyStateBefore);
  assert.equal(localStorage.getItem(legacyMetaKey), legacyMetaBefore);
  assert.equal(localStorage.setCalls, setCallsBefore);
});
