import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const applicationSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(root, 'storage.js'), 'utf8');

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); }
  };
}

function applicationHarness(options = {}) {
  const cutMarker = "\n  document.addEventListener('click'";
  const cutAt = applicationSource.indexOf(cutMarker);
  assert.ok(cutAt > 0, 'Le point d’instrumentation de app.js est introuvable');

  let capturedBlob = null;
  let reloadCount = 0;
  let lastAlert = '';
  let uuidSequence = 0;
  const elements = new Map();
  const serviceWorkerListeners = new Map();
  const anchor = { click() {}, remove() {} };
  const elementFor = selector => {
    if (!String(selector).startsWith('#')) return null;
    const id = String(selector).slice(1);
    if (!elements.has(id)) elements.set(id, {
      id, hidden: false, open: false, innerHTML: '', textContent: '', value: '', dataset: {},
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      querySelector() { return null; },
      setAttribute() {}, removeAttribute() {},
      close() { this.open = false; },
      showModal() {
        this.open = true;
        if (this.id === 'appAlertDialog') lastAlert = String(elementFor('#appAlertMessage').textContent || '');
      }
    });
    return elements.get(id);
  };
  const context = {
    console,
    Blob,
    Date: options.Date || Date,
    Intl,
    JSON,
    Math,
    Map,
    Set,
    Promise,
    URL: {
      createObjectURL(blob) { capturedBlob = blob; return 'blob:test'; },
      revokeObjectURL() {}
    },
    crypto: { randomUUID: () => `test-id-${++uuidSequence}` },
    localStorage: options.localStorage || memoryStorage(),
    navigator: {
      serviceWorker: {
        controller: {},
        addEventListener(type, listener) { serviceWorkerListeners.set(type, listener); },
        register() { return new Promise(() => {}); }
      }
    },
    document: {
      body: { dataset: {}, append() {} },
      createElement(name) { assert.equal(name, 'a'); return anchor; },
      querySelector(selector) { return elementFor(selector); },
      querySelectorAll() { return []; }
    },
    window: { alert(message) { lastAlert = String(message); }, confirm: () => true },
    location: { reload() { reloadCount += 1; } },
    setTimeout,
    clearTimeout,
    structuredClone
  };
  context.globalThis = context;

  const exposure = `
  globalThis.__agendaTestHooks = Object.freeze({
    migrateState: state => migrateState(state, {}, { strict: true }),
    todayKey,
    legacyLoadInfo: () => ({ ...legacyLoadInfo }),
    startupLoadWarning: () => startupLoadWarning,
    initialiseSecureStorage,
    makeBackupPayload: (state, reason = 'manual') => makeBackupPayload(state, reason),
    readRestoreSafetyBackup,
    migrationSafety: (state, sourceVersion) => {
      preserveBeforeMigration(state, sourceVersion);
      return safeJson(MIGRATION_SAFETY_KEY, null);
    },
    readValidatedBackupFile,
    importData,
    importRecoveryData,
    restoreAutomaticSnapshot,
    undoLastRestore,
    undoLastMigration,
    setAppState: state => { app.state = cloneState(state); lastCommittedState = cloneState(state); },
    setLiveState: state => { app.state = cloneState(state); },
    appState: () => cloneState(app.state),
    saveState: (state, options = {}) => saveState(state === undefined ? app.state : state, true, options),
    exclusiveReplacementActive: () => Boolean(exclusiveReplacementToken),
    setStorageAdapter: adapter => {
      storageAdapter = adapter;
      app.ui.storageMode = adapter?.mode || 'legacy';
    },
    similarClients: (state, draft) => {
      app.state = cloneState(state); invalidateDataIndexes();
      return similarClients(draft).map(client => client.id);
    },
    pendingPayments: state => {
      app.state = cloneState(state); invalidateDataIndexes();
      return pendingPayments().map(appointment => appointment.id);
    },
    financialEditBlocked: (existing, draft) => hasCollectedPayment(existing) && appointmentFinancialSignature(existing) !== appointmentFinancialSignature(draft),
    renderPaymentsReport: (state, start, end) => {
      app.state = cloneState(state); invalidateDataIndexes();
      renderPaymentsReport(parseDate(start), parseDate(end));
      return { summary: $('#reportSummary').innerHTML, content: $('#reportContent').innerHTML };
    },
    financialSummary: (state, start, end) => {
      app.state = cloneState(state); invalidateDataIndexes();
      return financialSummary(parseDate(start), parseDate(end));
    },
    exportReportCsv: async (state, tab, mode, reportDate) => {
      app.state = cloneState(state); invalidateDataIndexes();
      app.ui.reportTab = tab; app.ui.reportMode = mode; app.ui.reportDate = parseDate(reportDate);
      return exportReportCsv();
    },
    registerServiceWorker,
    setDirtySettings: value => { $('#settingsDialog').open = Boolean(value); app.ui.settingsDirty = Boolean(value); }
  });
})();`;
  if (options.agendaStorage) context.AgendaStorage = options.agendaStorage;
  else vm.runInNewContext(storageSource, context, { filename: 'storage.for-app-behavior.js' });
  let instrumentedApplication = applicationSource.slice(0, cutAt);
  if (options.skipStartupRender) {
    const startupRender = 'finishStorageLoading(); render();\n      if (result.warning)';
    assert.ok(instrumentedApplication.includes(startupRender), 'Le rendu de démarrage à neutraliser est introuvable');
    instrumentedApplication = instrumentedApplication.replace(startupRender, 'finishStorageLoading();\n      if (result.warning)');
  }
  vm.runInNewContext(instrumentedApplication + exposure, context, { filename: 'app.behavior.js' });
  return {
    hooks: context.__agendaTestHooks,
    takeBlob: () => capturedBlob,
    fireServiceWorkerEvent: type => serviceWorkerListeners.get(type)?.(),
    pwaResult: () => ({ reloadCount, lastAlert, notice: { ...elementFor('#updateNotice') } })
  };
}

function backupFile(payload) {
  const content = JSON.stringify(payload);
  return { size: Buffer.byteLength(content), async text() { return content; } };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function fixedDate(now) {
  const NativeDate = Date;
  return class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new NativeDate(now).getTime(); }
  };
}

function agendaStorageInitialiseSpy(initialise) {
  const storage = loadStorageModule();
  return { checksum: storage.checksum, initialise };
}

function loadStorageModule() {
  const context = { console, JSON, Math, Date, Promise, structuredClone };
  context.globalThis = context;
  vm.runInNewContext(storageSource, context, { filename: 'storage.behavior.js' });
  return context.AgendaStorage;
}

function baseState(version = 15) {
  return {
    version,
    clients: [{ id: 'client-1', name: 'Alice', phone: '0600000000' }],
    appointments: [],
    blocks: [],
    expenses: [],
    settings: {
      services: [{ id: 'service-1', name: 'Pose', duration: 60, price: '100', color: 'rose', active: true }],
      supplementTypes: [],
      clientBadges: [],
      expenseCategories: []
    }
  };
}

function appointment(overrides = {}) {
  return {
    id: 'appointment-1',
    clientId: 'client-1',
    date: '2026-05-20',
    time: '10:00',
    duration: 60,
    price: '100',
    service: 'Pose',
    serviceId: 'service-1',
    serviceColor: 'rose',
    supplements: [{ id: 'supplement-1', typeId: '', label: 'Décoration', amount: 20 }],
    status: 'completed',
    paymentStatus: 'paid',
    paymentDate: '2026-06-10',
    refundDate: '',
    paymentMethod: 'card',
    paymentReminderDate: '',
    contactVia: '',
    lateCancellation: false,
    ...overrides
  };
}

function parseSemicolonCsv(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  const input = text.replace(/^\ufeff/, '');
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted && character === '"' && input[index + 1] === '"') { value += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (!quoted && character === ';') { row.push(value); value = ''; continue; }
    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(value); value = ''; if (row.some(cell => cell !== '')) rows.push(row); row = []; continue;
    }
    value += character;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}

test('la migration stricte v14 vers v15 conserve le paiement et ajoute refundDate', () => {
  const { hooks } = applicationHarness();
  const legacy = baseState(14);
  const legacyAppointment = appointment();
  delete legacyAppointment.refundDate;
  legacy.appointments.push(legacyAppointment);

  const migrated = hooks.migrateState(legacy);
  assert.equal(migrated.version, 15);
  assert.equal(migrated.clients.length, 1);
  assert.equal(migrated.appointments.length, 1);
  assert.equal(migrated.appointments[0].paymentStatus, 'paid');
  assert.equal(migrated.appointments[0].paymentDate, '2026-06-10');
  assert.equal(migrated.appointments[0].refundDate, '');
});

test('une date de paiement future est refusée en v15 et corrigée avec trace en migrant v14', () => {
  const { hooks } = applicationHarness();
  const current = baseState();
  current.appointments.push(appointment({ paymentDate: '2999-01-01' }));
  assert.throws(() => hooks.migrateState(current), /INVALID_APPOINTMENT_STRUCTURE/);

  const legacy = baseState(14);
  const legacyAppointment = appointment({ paymentDate: '2999-01-01' });
  delete legacyAppointment.refundDate;
  legacy.appointments.push(legacyAppointment);
  const migrated = hooks.migrateState(legacy), result = migrated.appointments[0];
  assert.equal(result.paymentDate, hooks.todayKey());
  assert.ok(result.history.some(entry => entry.type === 'migration' && entry.label === 'Date de paiement future corrigée' && entry.details.includes('2999-01-01')));
});

test('un état v15 déjà commis reste lisible après recul d’horloge mais le même import futur est refusé', async () => {
  const committed = baseState();
  committed.appointments = [appointment({
    date: '2026-09-02',
    paymentStatus: 'refunded',
    paymentDate: '2026-09-02',
    refundDate: '2026-09-02'
  })];
  let validatedAtStartup = null;
  let saved = null;
  const adapter = {
    mode: 'indexeddb',
    async save(state) {
      saved = structuredClone(state);
      return { ok: true, mode: 'indexeddb', mirrorOk: true, snapshotOk: true };
    },
    async recordError() {}
  };
  const harness = applicationHarness({
    Date: fixedDate('2026-09-01T09:00:00.000Z'),
    agendaStorage: agendaStorageInitialiseSpy(async options => {
      validatedAtStartup = options.validateState(committed, { source: 'indexeddb' });
      return { storage: adapter, state: validatedAtStartup, mode: 'indexeddb', warning: '', migrated: false, recovered: false };
    })
  });

  assert.equal(await harness.hooks.initialiseSecureStorage(), true);
  assert.equal(validatedAtStartup.appointments[0].refundDate, '2026-09-02');
  assert.equal(harness.hooks.appState().appointments[0].paymentDate, '2026-09-02');
  assert.equal(await harness.hooks.saveState(), true);
  assert.equal(saved.appointments[0].refundDate, '2026-09-02');

  const explicitImport = harness.hooks.makeBackupPayload(committed);
  await assert.rejects(harness.hooks.readValidatedBackupFile(backupFile(explicitImport)), /INVALID_APPOINTMENT_STRUCTURE/);
});

test('une lecture legacy incertaine est signalée et transmise au stockage sécurisé', async () => {
  const cases = [
    {
      name: 'getItem',
      storage: (() => {
        const backing = memoryStorage();
        return {
          ...backing,
          getItem(key) {
            if (key === 'nail-planner-state-v15') throw new Error('READ_FAILED');
            return backing.getItem(key);
          }
        };
      })()
    },
    {
      name: 'quarantaine',
      storage: (() => {
        const backing = memoryStorage({ 'nail-planner-state-v15': '{json-invalide' });
        return {
          ...backing,
          setItem(key, value) {
            if (key === 'nail-planner-unreadable-state-v15') throw new Error('QUARANTINE_FAILED');
            backing.setItem(key, value);
          }
        };
      })()
    }
  ];

  for (const scenario of cases) {
    let receivedOptions = null;
    const harness = applicationHarness({
      localStorage: scenario.storage,
      agendaStorage: agendaStorageInitialiseSpy(async options => {
        receivedOptions = options;
        throw new Error('STOP_AFTER_OPTIONS');
      })
    });
    assert.equal(harness.hooks.legacyLoadInfo().readUncertain, false, `${scenario.name} ne doit rien lire avant l’initialisation sécurisée`);
    assert.equal(await harness.hooks.initialiseSecureStorage(), false);
    assert.equal(harness.hooks.legacyLoadInfo().readUncertain, true, `${scenario.name} doit marquer la lecture incertaine`);
    assert.match(harness.hooks.startupLoadWarning(), /copie locale|copie locale de la version actuelle/i);
    assert.equal(receivedOptions?.legacyReadUncertain, true, `${scenario.name} doit être transmis à AgendaStorage.initialise`);
  }
});

test('un avertissement legacy reste visible lorsque la base IndexedDB est valide', async () => {
  const backing = memoryStorage();
  const uncertainStorage = {
    ...backing,
    getItem(key) {
      if (key === 'nail-planner-state-v15') throw new Error('READ_FAILED');
      return backing.getItem(key);
    }
  };
  let receivedOptions = null;
  const harness = applicationHarness({
    localStorage: uncertainStorage,
    skipStartupRender: true,
    agendaStorage: agendaStorageInitialiseSpy(async options => {
      receivedOptions = options;
      return {
        storage: { mode: 'indexeddb' },
        state: baseState(),
        mode: 'indexeddb',
        warning: '',
        migrated: false,
        recovered: false
      };
    })
  });

  assert.equal(await harness.hooks.initialiseSecureStorage(), true);
  const warning = harness.hooks.startupLoadWarning();
  assert.match(warning, /lecture d’une copie locale a échoué/i);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(receivedOptions?.legacyReadUncertain, true);
  assert.equal(harness.pwaResult().lastAlert, warning);
  assert.match(applicationSource, /if \(result\.warning\)[^\n]*\n\s*else if \(startupLoadWarning\)/);
  assert.doesNotMatch(applicationSource, /else if \(startupLoadWarning\s*&&/);
});

test('le schéma v15 refuse un remboursement sans dates cohérentes', () => {
  const { hooks } = applicationHarness();
  const missingRefund = baseState();
  missingRefund.appointments.push(appointment({ paymentStatus: 'refunded', refundDate: '' }));
  assert.throws(() => hooks.migrateState(missingRefund), /INVALID_APPOINTMENT_STRUCTURE/);

  const beforePayment = baseState();
  beforePayment.appointments.push(appointment({ paymentStatus: 'refunded', refundDate: '2026-06-09' }));
  assert.throws(() => hooks.migrateState(beforePayment), /INVALID_APPOINTMENT_STRUCTURE/);

  const valid = baseState();
  valid.appointments.push(appointment({ paymentStatus: 'refunded', refundDate: '2026-07-05' }));
  const migrated = hooks.migrateState(valid);
  assert.equal(migrated.appointments[0].paymentStatus, 'refunded');
  assert.equal(migrated.appointments[0].refundDate, '2026-07-05');
});

test('la migration financière v14 reste ancrée au jour initial lors d’une restauration ou d’un Undo ultérieur', async () => {
  const localStorage = memoryStorage();
  const migrationDate = '2026-09-01T09:00:00.000Z';
  const rawV14 = baseState(14);
  const paidInFuture = appointment({ date: '2026-09-10', paymentDate: '2026-09-10' });
  delete paidInFuture.refundDate;
  rawV14.appointments = [paidInFuture];
  const historical = {
    app: 'mon-agenda-prothesiste',
    appVersion: '12.5-beta',
    backupFormatVersion: 3,
    dataVersion: 14,
    exportedAt: migrationDate,
    state: rawV14
  };

  const initialHarness = applicationHarness({ localStorage, Date: fixedDate(migrationDate) });
  const initial = await initialHarness.hooks.readValidatedBackupFile(backupFile(historical));
  assert.equal(initial.state.appointments[0].paymentDate, '2026-09-01');
  const safety = initialHarness.hooks.migrationSafety(rawV14, 14);
  assert.equal(safety.exportedAt, migrationDate);

  const laterHarness = applicationHarness({ localStorage, Date: fixedDate('2026-09-11T09:00:00.000Z') });
  const restoredFile = await laterHarness.hooks.readValidatedBackupFile(backupFile(historical));
  assert.equal(restoredFile.state.appointments[0].paymentDate, '2026-09-01', 'la restauration ne doit pas remigrer au 11 septembre');
  let undoCandidate = null;
  laterHarness.hooks.setAppState(initial.state);
  laterHarness.hooks.setStorageAdapter({
    mode: 'indexeddb',
    async save(state) {
      undoCandidate = structuredClone(state);
      return { ok: true, mode: 'indexeddb', mirrorOk: true, snapshotOk: true };
    },
    async recordError() {}
  });

  await laterHarness.hooks.undoLastMigration();
  assert.equal(undoCandidate.appointments[0].paymentDate, '2026-09-01', 'Undo doit réutiliser la date inscrite dans la safety');
});

test('un pending v14 sans rappel est conservé, daté à la migration et un pending v15 incomplet est refusé', async () => {
  const migrationDate = '2026-09-01T09:00:00.000Z';
  const harness = applicationHarness({ Date: fixedDate(migrationDate) });
  const rawV14 = baseState(14);
  const pendingWithoutReminder = appointment({
    paymentStatus: 'pending',
    paymentDate: '',
    paymentMethod: '',
    paymentReminderDate: ''
  });
  delete pendingWithoutReminder.refundDate;
  rawV14.appointments = [pendingWithoutReminder];
  const historical = {
    app: 'mon-agenda-prothesiste',
    appVersion: '12.5-beta',
    backupFormatVersion: 3,
    dataVersion: 14,
    exportedAt: migrationDate,
    state: rawV14
  };

  const migrated = (await harness.hooks.readValidatedBackupFile(backupFile(historical))).state;
  assert.equal(migrated.appointments[0].paymentStatus, 'pending');
  assert.equal(migrated.appointments[0].paymentReminderDate, '2026-09-01');
  assert.ok(migrated.appointments[0].history.some(entry => entry.type === 'migration' && /relance|rappel|paiement/i.test(`${entry.label} ${entry.details}`)));
  assert.deepEqual([...harness.hooks.pendingPayments(migrated)], ['appointment-1']);

  const invalidV15 = baseState();
  invalidV15.appointments = [appointment({
    paymentStatus: 'pending',
    paymentDate: '',
    paymentMethod: '',
    paymentReminderDate: ''
  })];
  assert.throws(() => harness.hooks.migrateState(invalidV15), /INVALID_APPOINTMENT_STRUCTURE/);
});

test('le bilan place le brut et le remboursement à leurs dates réelles, même après annulation', () => {
  const { hooks } = applicationHarness();
  const state = baseState();
  state.appointments.push(appointment({ status: 'cancelled', paymentStatus: 'refunded', refundDate: '2026-07-05' }));

  assert.deepEqual(
    { ...hooks.financialSummary(state, '2026-06-01', '2026-07-01') },
    { gross: 120, refunded: 0, net: 120 }
  );
  assert.deepEqual(
    { ...hooks.financialSummary(state, '2026-07-01', '2026-08-01') },
    { gross: 0, refunded: 120, net: -120 }
  );
});

test('un paiement et son remboursement le même jour donnent un net nul', () => {
  const { hooks } = applicationHarness();
  const state = baseState();
  state.appointments.push(appointment({ paymentStatus: 'refunded', refundDate: '2026-06-10' }));
  assert.deepEqual(
    { ...hooks.financialSummary(state, '2026-06-01', '2026-07-01') },
    { gross: 120, refunded: 120, net: 0 }
  );
});

test('le tarif est figé dès qu’un paiement ou remboursement est enregistré', () => {
  const { hooks } = applicationHarness();
  for (const paymentStatus of ['paid', 'refunded']) {
    const existing = appointment({ paymentStatus });
    const changedPrice = { ...existing, price: '101' };
    const changedSupplement = { ...existing, supplements: [{ ...existing.supplements[0], amount: 21 }] };
    assert.equal(hooks.financialEditBlocked(existing, existing), false);
    assert.equal(hooks.financialEditBlocked(existing, changedPrice), true);
    assert.equal(hooks.financialEditBlocked(existing, changedSupplement), true);
  }
  const pending = appointment({ paymentStatus: 'pending', paymentDate: '', paymentMethod: '', paymentReminderDate: '2026-06-10' });
  assert.equal(hooks.financialEditBlocked(pending, { ...pending, price: '101' }), false);
});

test('toutes les fiches portant exactement le même nom sont proposées', () => {
  const { hooks } = applicationHarness();
  const state = baseState();
  state.clients = [
    { id: 'alice-1', name: 'Élodie Martin', phone: '0600000001' },
    { id: 'alice-2', name: 'Elodie  Martin', phone: '0600000002' },
    { id: 'alice-3', name: 'ÉLODIE MARTIN', phone: '0600000003' }
  ];
  const matches = hooks.similarClients(state, { clientId: '', clientName: 'élodie martin', phone: '' });
  assert.deepEqual([...matches].sort(), ['alice-1', 'alice-2', 'alice-3']);
});

test('un paiement pending reste à relancer et au Bilan après annulation, y compris dans le CSV', async () => {
  const harness = applicationHarness();
  const state = baseState();
  state.appointments.push(appointment({
    status: 'cancelled',
    paymentStatus: 'pending',
    paymentDate: '',
    paymentMethod: '',
    paymentReminderDate: harness.hooks.todayKey()
  }));

  assert.deepEqual([...harness.hooks.pendingPayments(state)], ['appointment-1']);
  const rendered = harness.hooks.renderPaymentsReport(state, '2026-05-01', '2026-06-01');
  assert.match(rendered.summary, /<strong>120[^<]*€<\/strong><small>1 paiement/);
  assert.match(rendered.content, /data-edit="appointment-1"/);
  assert.match(rendered.content, /À régler/);

  await harness.hooks.exportReportCsv(state, 'payments', 'month', '2026-05-15');
  const rows = parseSemicolonCsv(await harness.takeBlob().text()), headers = rows[0], data = rows[1];
  assert.equal(rows.length, 2);
  assert.equal(data[headers.indexOf('Statut RDV')], 'Annulé');
  assert.equal(data[headers.indexOf('État paiement')], 'À régler');
  assert.equal(data[headers.indexOf('À régler dans la période')], 'Oui');
  assert.equal(data[headers.indexOf('Montant à régler dans la période')], '120.00');
});

test('les colonnes brut, remboursé et net du CSV retombent sur le bilan affiché', async () => {
  const harness = applicationHarness();
  const state = baseState();
  state.appointments.push(
    appointment({ id: 'refunded', status: 'cancelled', paymentStatus: 'refunded', refundDate: '2026-07-05' }),
    appointment({ id: 'paid', date: '2026-06-12', price: '50', supplements: [], paymentDate: '2026-06-12' })
  );

  const assertCsvMatches = async (reportDate, start, end) => {
    await harness.hooks.exportReportCsv(state, 'payments', 'month', reportDate);
    const blob = harness.takeBlob();
    assert.ok(blob, 'L’export CSV n’a produit aucun fichier');
    const rows = parseSemicolonCsv(await blob.text());
    const headers = rows[0];
    const grossIndex = headers.indexOf('Montant encaissé brut dans la période');
    const refundIndex = headers.indexOf('Montant remboursé dans la période');
    const netIndex = headers.indexOf('Net financier dans la période');
    assert.ok(grossIndex >= 0 && refundIndex >= 0 && netIndex >= 0, 'Colonnes financières manquantes dans le CSV');
    const numberFromFinancialCell = (value, column) => {
      assert.match(value, /^-?\d+\.\d{2}$/, `${column} doit rester une valeur numérique dans le CSV, reçu ${JSON.stringify(value)}`);
      return Number(value);
    };
    const totals = rows.slice(1).reduce((sum, row) => ({
      gross: sum.gross + numberFromFinancialCell(row[grossIndex], headers[grossIndex]),
      refunded: sum.refunded + numberFromFinancialCell(row[refundIndex], headers[refundIndex]),
      net: sum.net + numberFromFinancialCell(row[netIndex], headers[netIndex])
    }), { gross: 0, refunded: 0, net: 0 });
    const summary = harness.hooks.financialSummary(state, start, end);
    assert.deepEqual(totals, { ...summary });
    return totals;
  };

  assert.deepEqual(await assertCsvMatches('2026-06-15', '2026-06-01', '2026-07-01'), { gross: 170, refunded: 0, net: 170 });
  assert.deepEqual(await assertCsvMatches('2026-07-15', '2026-07-01', '2026-08-01'), { gross: 0, refunded: 120, net: -120 });
});

test('l’empreinte et les compteurs de stockage couvrent les données métier', () => {
  const storage = loadStorageModule();
  const state = baseState();
  state.appointments.push(appointment());
  const before = storage.checksum(state);
  const changed = structuredClone(state);
  changed.appointments[0].price = '101';
  assert.notEqual(storage.checksum(changed), before);
  assert.deepEqual({ ...storage.counts(state) }, {
    clients: 1,
    appointments: 1,
    blocks: 0,
    expenses: 0,
    services: 1,
    supplements: 0
  });
  assert.equal(storage.constants.databaseVersion, 2);
  assert.equal(storage.constants.snapshotLimit, 5);
});

test('les sauvegardes v4 manuelles et avant migration portent compteurs et empreinte', () => {
  const { hooks } = applicationHarness();
  const state = baseState();
  state.appointments.push(appointment());
  const storage = loadStorageModule();

  assert.match(applicationSource, /const BACKUP_FORMAT_VERSION = 4/);
  assert.match(applicationSource, /const INTEGRITY_BACKUP_FORMAT_VERSION = 4/);

  const manual = hooks.makeBackupPayload(state, 'manual');
  assert.equal(manual.backupFormatVersion, 4);
  assert.deepEqual({ ...manual.counts }, {
    clients: 1,
    appointments: 1,
    blocks: 0,
    expenses: 0,
    services: 1,
    supplements: 0,
    expenseCategories: 0
  });
  assert.equal(manual.checksum, storage.checksum(state));

  const migrationSource = structuredClone(state);
  migrationSource.version = 14;
  const migration = hooks.migrationSafety(migrationSource, 14);
  assert.equal(migration.backupFormatVersion, 4);
  assert.equal(migration.reason, 'before-migration');
  assert.equal(migration.dataVersion, 15);
  assert.equal(migration.state.version, 15);
  assert.equal(migration.sourceDataVersion, 14);
  assert.deepEqual({ ...migration.counts }, {
    clients: 1,
    appointments: 1,
    blocks: 0,
    expenses: 0,
    services: 1,
    supplements: 3,
    expenseCategories: 7
  });
  assert.equal(migration.checksum, storage.checksum(migration.state));
  assert.match(applicationSource, /async function exportData\(\) \{[\s\S]*?const content = makeBackupPayload\(\)[\s\S]*?applyBackupIntegrity\(content\)/);
  assert.match(applicationSource, /function preserveBeforeMigration\(state, sourceVersion, migratedState, migrationDate = todayKey\(\)\) \{[\s\S]*?applyBackupIntegrity\(\{/);
});

test('la safety v4 des formes v1 sans version reste validable et conserve profils, rendez-vous et alias', async t => {
  await t.test('objet v1 sans version avec clientProfiles et blockedSlots', async () => {
    const { hooks } = applicationHarness();
    const legacy = {
      appointments: [{
        id: 'legacy-appointment-1',
        client: 'Marie Dupont',
        date: '2026-08-20',
        time: '10:00',
        duration: 60,
        service: 'Pose historique',
        price: '55',
        status: 'completed'
      }],
      clientProfiles: {
        'Marie Dupont': { phone: '0611223344', address: '12 rue des Fleurs', notes: 'Profil v1 à conserver' }
      },
      blockedSlots: [{
        id: 'legacy-block-1',
        allDay: true,
        startDate: '2026-08-21',
        endDate: '2026-08-22',
        reason: 'Indisponibilité v1'
      }]
    };

    const safety = hooks.migrationSafety(legacy, 1);
    assert.equal(safety.backupFormatVersion, 4);
    assert.equal(safety.dataVersion, 15);
    assert.equal(safety.state.version, 15);
    const verified = await hooks.readValidatedBackupFile(backupFile(safety));
    assert.equal(verified.state.appointments.length, 1);
    assert.equal(verified.state.appointments[0].service, 'Pose historique');
    assert.equal(verified.state.clients.length, 1);
    assert.equal(verified.state.clients[0].name, 'Marie Dupont');
    assert.equal(verified.state.clients[0].phone, '0611223344');
    assert.equal(verified.state.clients[0].notes, 'Profil v1 à conserver');
    assert.equal(verified.state.blocks.length, 1);
    assert.equal(verified.state.blocks[0].reason, 'Indisponibilité v1');
  });

  await t.test('tableau racine v1', async () => {
    const { hooks } = applicationHarness();
    const legacy = [{
      id: 'legacy-array-appointment',
      client: 'Lucie Martin',
      date: '2026-08-22',
      time: '14:00',
      duration: 45,
      service: 'RDV tableau v1',
      status: 'confirmed'
    }];
    const safety = hooks.migrationSafety(legacy, 1);
    assert.equal(safety.backupFormatVersion, 4);
    assert.equal(safety.dataVersion, 15);
    assert.equal(safety.state.version, 15);
    const verified = await hooks.readValidatedBackupFile(backupFile(safety));
    assert.equal(verified.state.appointments.length, 1);
    assert.equal(verified.state.appointments[0].service, 'RDV tableau v1');
    assert.equal(verified.state.clients[0].name, 'Lucie Martin');
  });
});

test('l’import v4 refuse une enveloppe sans compteurs ou sans empreinte valide', async () => {
  const { hooks } = applicationHarness();
  const valid = hooks.makeBackupPayload(baseState());

  const withoutCounts = structuredClone(valid);
  delete withoutCounts.counts;
  await assert.rejects(hooks.readValidatedBackupFile(backupFile(withoutCounts)), /INVALID_BACKUP_COUNTS/);

  const withoutChecksum = structuredClone(valid);
  delete withoutChecksum.checksum;
  await assert.rejects(hooks.readValidatedBackupFile(backupFile(withoutChecksum)), /INVALID_BACKUP_CHECKSUM/);

  const incorrectChecksum = structuredClone(valid);
  incorrectChecksum.checksum = 'fnv1a-00000000-0';
  await assert.rejects(hooks.readValidatedBackupFile(backupFile(incorrectChecksum)), /INVALID_BACKUP_CHECKSUM/);
});

test('un état v15 ne peut pas contourner l’intégrité en supprimant ou rétrogradant son enveloppe', async () => {
  const { hooks } = applicationHarness();
  const state = baseState();
  state.appointments = [appointment({ paymentStatus: 'refunded', refundDate: '2026-07-05' })];
  const original = structuredClone(state);

  const rawRoot = structuredClone(state);
  await assert.rejects(hooks.readValidatedBackupFile(backupFile(rawRoot)), /INVALID_BACKUP/);
  assert.deepEqual(rawRoot, original, 'le contenu v15 refusé ne doit pas être normalisé avant validation');

  const downgradedEnvelope = {
    app: 'mon-agenda-prothesiste',
    backupFormatVersion: 3,
    dataVersion: 15,
    exportedAt: '2026-09-01T09:00:00.000Z',
    state: structuredClone(state)
  };
  await assert.rejects(hooks.readValidatedBackupFile(backupFile(downgradedEnvelope)), /INVALID_BACKUP/);
  assert.deepEqual(downgradedEnvelope.state, original, 'le remboursement doit rester intact dans le fichier refusé');
});

test('l’import v4 refuse dataVersion absent, non entier ou différent de state.version avant toute migration', async () => {
  const { hooks } = applicationHarness();
  const storage = loadStorageModule();
  const valid = hooks.makeBackupPayload(baseState());

  const missingVersion = structuredClone(valid);
  delete missingVersion.dataVersion;
  await assert.rejects(hooks.readValidatedBackupFile(backupFile(missingVersion)), /INVALID_BACKUP_VERSION/);

  const nonIntegerVersion = structuredClone(valid);
  nonIntegerVersion.dataVersion = 14.5;
  nonIntegerVersion.state.version = 14.5;
  nonIntegerVersion.checksum = storage.checksum(nonIntegerVersion.state);
  await assert.rejects(hooks.readValidatedBackupFile(backupFile(nonIntegerVersion)), /INVALID_BACKUP_VERSION/);

  const zeroVersion = structuredClone(valid);
  zeroVersion.dataVersion = 0;
  zeroVersion.state.version = 0;
  zeroVersion.checksum = storage.checksum(zeroVersion.state);
  await assert.rejects(hooks.readValidatedBackupFile(backupFile(zeroVersion)), /INVALID_BACKUP_VERSION/);

  const refundedState = baseState();
  refundedState.appointments.push(appointment({ paymentStatus: 'refunded', refundDate: '2026-07-05' }));
  const mismatchedHeader = hooks.makeBackupPayload(refundedState);
  mismatchedHeader.dataVersion = 14;
  await assert.rejects(hooks.readValidatedBackupFile(backupFile(mismatchedHeader)), /INVALID_BACKUP_VERSION/);
  assert.equal(mismatchedHeader.state.appointments[0].paymentStatus, 'refunded');
  assert.equal(mismatchedHeader.state.appointments[0].refundDate, '2026-07-05');

  const readerBody = applicationSource.match(/async function readValidatedBackupFile\(file\) \{([\s\S]*?)\n\s*\}/)?.[1] || '';
  const validationAt = readerBody.indexOf('validateBackupEnvelope(data)');
  const migrationAt = readerBody.indexOf('migrateState(data');
  assert.ok(validationAt >= 0 && migrationAt > validationAt, 'L’enveloppe v4 doit être validée avant toute migration potentiellement destructive');
});

test('un import échoué restaure exactement la copie locale antérieure sans toucher une clé incertaine', async () => {
  const safetyKey = 'nail-planner-before-restore-v15';
  const pendingKey = 'nail-planner-pending-restore-v15';
  const trackedStorage = ({ previousRaw = null, failGet = false, failSet = false } = {}) => {
    const initial = previousRaw === null ? {} : { [safetyKey]: previousRaw };
    const backing = memoryStorage(initial), operations = [];
    return {
      operations,
      peek: () => backing.getItem(safetyKey),
      peekPending: () => backing.getItem(pendingKey),
      storage: {
        getItem(key) {
          if (key === safetyKey) {
            operations.push({ type: 'active-get' });
            if (failGet) throw new Error('SAFETY_GET_FAILED');
          }
          if (key === pendingKey) operations.push({ type: 'pending-get' });
          return backing.getItem(key);
        },
        setItem(key, value) {
          if (key === pendingKey) {
            operations.push({ type: 'pending-set', value: String(value) });
            if (failSet) throw new Error('SAFETY_SET_FAILED');
          }
          backing.setItem(key, value);
        },
        removeItem(key) {
          if (key === pendingKey) operations.push({ type: 'pending-remove' });
          backing.removeItem(key);
        },
        clear() { backing.clear(); }
      }
    };
  };
  const failedAdapter = {
    mode: 'indexeddb',
    async save() { throw new Error('EXPECTED_IMPORT_SAVE_FAILURE'); },
    async recordError() {}
  };
  const runFailedImport = async tracked => {
    const harness = applicationHarness({ localStorage: tracked.storage });
    const payload = harness.hooks.makeBackupPayload(baseState());
    harness.hooks.setStorageAdapter(failedAdapter);
    await harness.hooks.importData(backupFile(payload));
    return tracked;
  };

  const priorRaw = '{"copie":"exacte", "espaces": true}';
  const existing = await runFailedImport(trackedStorage({ previousRaw: priorRaw }));
  assert.equal(existing.peek(), priorRaw);
  assert.equal(existing.peekPending(), null);
  assert.deepEqual(existing.operations.map(operation => operation.type), ['active-get', 'pending-get', 'pending-set', 'pending-remove']);
  assert.notEqual(existing.operations[2].value, priorRaw);

  const unreadable = await runFailedImport(trackedStorage({ previousRaw: priorRaw, failGet: true }));
  assert.equal(unreadable.peek(), priorRaw);
  assert.deepEqual(unreadable.operations.map(operation => operation.type), ['active-get']);

  const unwritable = await runFailedImport(trackedStorage({ previousRaw: priorRaw, failSet: true }));
  assert.equal(unwritable.peek(), priorRaw);
  assert.equal(unwritable.peekPending(), null);
  assert.deepEqual(unwritable.operations.map(operation => operation.type), ['active-get', 'pending-get', 'pending-set']);

  const absent = await runFailedImport(trackedStorage());
  assert.equal(absent.peek(), null);
  assert.equal(absent.peekPending(), null);
  assert.deepEqual(absent.operations.map(operation => operation.type), ['active-get', 'pending-get', 'pending-set', 'pending-remove']);
});

test('l’import ne poursuit sans copie locale que si son absence a été prouvée', async t => {
  const safetyKey = 'nail-planner-before-restore-v15';
  const pendingKey = 'nail-planner-pending-restore-v15';
  const historicalSafetyKey = 'nail-planner-before-restore-v14';

  async function runScenario({ previousRaw = null, historicalRaw = null, failGet = false, failSet = false, failHistoricalGet = false }) {
    const initial = {};
    if (previousRaw !== null) initial[safetyKey] = previousRaw;
    if (historicalRaw !== null) initial[historicalSafetyKey] = historicalRaw;
    const backing = memoryStorage(initial);
    const operations = [];
    const localStorage = {
      getItem(key) {
        if (key === safetyKey) {
          operations.push({ type: 'active-get' });
          if (failGet) throw new Error('SAFETY_GET_FAILED');
        }
        if (key === pendingKey) operations.push({ type: 'pending-get' });
        if (key === historicalSafetyKey) {
          operations.push({ type: 'historical-get' });
          if (failHistoricalGet) throw new Error('HISTORICAL_SAFETY_GET_FAILED');
        }
        return backing.getItem(key);
      },
      setItem(key, value) {
        if (key === pendingKey) {
          operations.push({ type: 'pending-set' });
          if (failSet) throw new Error('SAFETY_SET_FAILED');
        }
        backing.setItem(key, value);
      },
      removeItem(key) { backing.removeItem(key); },
      clear() { backing.clear(); }
    };
    const saveCalls = [];
    const adapter = {
      mode: 'indexeddb',
      async save(_state, saveOptions) {
        saveCalls.push({ ...saveOptions });
        throw new Error('STOP_AFTER_SAVE_SPY');
      },
      async recordError() {}
    };
    const harness = applicationHarness({ localStorage });
    const payload = harness.hooks.makeBackupPayload(baseState());
    harness.hooks.setStorageAdapter(adapter);
    await harness.hooks.importData(backupFile(payload));
    return { operations, saveCalls, safetyRaw: backing.getItem(safetyKey), pendingRaw: backing.getItem(pendingKey), historicalRaw: backing.getItem(historicalSafetyKey) };
  }

  await t.test('lecture incertaine : aucun save', async () => {
    const result = await runScenario({ previousRaw: '{"ancienne":true}', failGet: true });
    assert.equal(result.saveCalls.length, 0);
    assert.equal(result.safetyRaw, '{"ancienne":true}');
    assert.deepEqual(result.operations.map(operation => operation.type), ['active-get']);
  });

  await t.test('clé préexistante impossible à remplacer : aucun save', async () => {
    const result = await runScenario({ previousRaw: '{"ancienne":true}', failSet: true });
    assert.equal(result.saveCalls.length, 0);
    assert.equal(result.safetyRaw, '{"ancienne":true}');
    assert.equal(result.pendingRaw, null);
    assert.deepEqual(result.operations.map(operation => operation.type), ['active-get', 'pending-get', 'pending-set']);
  });

  await t.test('clé certainement absente : snapshot IndexedDB obligatoire', async () => {
    const result = await runScenario({ failSet: true });
    assert.equal(result.saveCalls.length, 1);
    assert.equal(result.saveCalls[0].requireSnapshot, true);
    assert.equal(result.safetyRaw, null);
    assert.equal(result.pendingRaw, null);
    assert.ok(result.operations.some(operation => operation.type === 'historical-get'));
  });

  await t.test('clé v15 absente mais copie historique présente : aucun save', async () => {
    const historicalRaw = '{"ancienne-v14":true}';
    const result = await runScenario({ historicalRaw, failSet: true });
    assert.equal(result.saveCalls.length, 0);
    assert.equal(result.safetyRaw, null);
    assert.equal(result.historicalRaw, historicalRaw);
    assert.ok(result.operations.some(operation => operation.type === 'historical-get'));
  });

  await t.test('lecture historique incertaine : aucun save', async () => {
    const result = await runScenario({ failSet: true, failHistoricalGet: true });
    assert.equal(result.saveCalls.length, 0);
    assert.equal(result.safetyRaw, null);
    assert.ok(result.operations.some(operation => operation.type === 'historical-get'));
  });
});

test('l’annulation de restauration ne retombe jamais sur une copie historique si la plus récente est illisible', async t => {
  const currentKey = 'nail-planner-before-restore-v15';
  const historicalKey = 'nail-planner-before-restore-v14';
  const historical = JSON.stringify({ ancienne: 'v14' });

  await t.test('une exception de lecture v15 bloque le fallback v14', () => {
    const backing = memoryStorage({ [currentKey]: '{"recente":true}', [historicalKey]: historical });
    const localStorage = {
      ...backing,
      getItem(key) {
        if (key === currentKey) throw new Error('SAFETY_READ_FAILED');
        return backing.getItem(key);
      }
    };
    const { hooks } = applicationHarness({ localStorage });
    assert.throws(() => hooks.readRestoreSafetyBackup(), /RESTORE_SAFETY_READ_FAILED/);
  });

  await t.test('un JSON v15 corrompu bloque le fallback v14', () => {
    const { hooks } = applicationHarness({ localStorage: memoryStorage({ [currentKey]: '{json-invalide', [historicalKey]: historical }) });
    assert.throws(() => hooks.readRestoreSafetyBackup(), /INVALID_SAFETY_COPY/);
  });

  await t.test('une clé v15 réellement absente autorise la première copie historique', () => {
    const { hooks } = applicationHarness({ localStorage: memoryStorage({ [historicalKey]: historical }) });
    assert.deepEqual({ ...hooks.readRestoreSafetyBackup() }, { ancienne: 'v14' });
  });
});

test('le retour à un snapshot protège exactement l’état courant et restaure la safety antérieure en cas d’échec', async t => {
  const safetyKey = 'nail-planner-before-restore-v15';
  const pendingKey = 'nail-planner-pending-restore-v15';
  const current = baseState();
  current.clients[0].notes = 'État exact avant retour automatique';

  async function runScenario({ previousRaw = null, failGet = false, failSet = false }) {
    const initial = previousRaw === null ? {} : { [safetyKey]: previousRaw };
    const backing = memoryStorage(initial), operations = [];
    const localStorage = {
      ...backing,
      getItem(key) {
        if (key === safetyKey) {
          operations.push({ type: 'active-get' });
          if (failGet) throw new Error('SNAPSHOT_SAFETY_GET_FAILED');
        }
        if (key === pendingKey) operations.push({ type: 'pending-get' });
        return backing.getItem(key);
      },
      setItem(key, value) {
        if (key === pendingKey) {
          operations.push({ type: 'pending-set', value: String(value) });
          if (failSet) throw new Error('SNAPSHOT_SAFETY_SET_FAILED');
        }
        backing.setItem(key, value);
      },
      removeItem(key) {
        if (key === pendingKey) operations.push({ type: 'pending-remove' });
        backing.removeItem(key);
      }
    };
    let restoreCalls = 0;
    const adapter = {
      mode: 'indexeddb',
      async snapshotList() { return [{ id: 'snapshot-1', createdAt: '2026-09-01T12:00:00.000Z' }]; },
      async restoreSnapshot() { restoreCalls += 1; throw new Error('EXPECTED_SNAPSHOT_RESTORE_FAILURE'); },
      async recordError() {}
    };
    const harness = applicationHarness({ localStorage });
    harness.hooks.setAppState(current);
    harness.hooks.setStorageAdapter(adapter);
    await harness.hooks.restoreAutomaticSnapshot();
    return { operations, restoreCalls, safetyRaw: backing.getItem(safetyKey), pendingRaw: backing.getItem(pendingKey) };
  }

  await t.test('une lecture incertaine annule avant IndexedDB', async () => {
    const previousRaw = '{"ancienne":true}';
    const result = await runScenario({ previousRaw, failGet: true });
    assert.equal(result.restoreCalls, 0);
    assert.equal(result.safetyRaw, previousRaw);
    assert.deepEqual(result.operations.map(operation => operation.type), ['active-get']);
  });

  await t.test('une écriture impossible annule avant IndexedDB', async () => {
    const previousRaw = '{"ancienne":true}';
    const result = await runScenario({ previousRaw, failSet: true });
    assert.equal(result.restoreCalls, 0);
    assert.equal(result.safetyRaw, previousRaw);
    assert.equal(result.pendingRaw, null);
    assert.deepEqual(result.operations.map(operation => operation.type), ['active-get', 'pending-get', 'pending-set']);
  });

  await t.test('un échec IndexedDB remet exactement la safety précédente', async () => {
    const previousRaw = '{"copie":"exacte", "espaces": true}';
    const result = await runScenario({ previousRaw });
    assert.equal(result.restoreCalls, 1);
    assert.equal(result.safetyRaw, previousRaw);
    assert.equal(result.pendingRaw, null);
    assert.deepEqual(result.operations.map(operation => operation.type), ['active-get', 'pending-get', 'pending-set', 'pending-remove']);
    const captured = JSON.parse(result.operations[2].value);
    assert.equal(captured.reason, 'before-automatic-snapshot-restore');
    assert.deepEqual(captured.state, current);
  });

  await t.test('un échec IndexedDB remet une safety initialement absente', async () => {
    const result = await runScenario({});
    assert.equal(result.restoreCalls, 1);
    assert.equal(result.safetyRaw, null);
    assert.equal(result.pendingRaw, null);
    assert.deepEqual(result.operations.map(operation => operation.type), ['active-get', 'pending-get', 'pending-set', 'pending-remove']);
  });
});

test('restoreSafetyId lie chaque Undo à une seule restauration atomique', async t => {
  const safetyKey = 'nail-planner-before-restore-v15';

  await t.test('un import standard écrit le même identifiant dans la cible et sa safety', async () => {
    const localStorage = memoryStorage();
    const harness = applicationHarness({ localStorage });
    const current = baseState();
    current.clients[0].notes = 'État avant import à protéger';
    const target = baseState();
    target.clients[0].name = 'État importé';
    let savedState = null, savedOptions = null;
    harness.hooks.setAppState(current);
    harness.hooks.setStorageAdapter({
      mode: 'indexeddb',
      async save(state, options) {
        savedState = structuredClone(state);
        savedOptions = { ...options };
        return { ok: true, mode: 'indexeddb', mirrorOk: true, snapshotOk: true };
      },
      async recordError() {}
    });

    await harness.hooks.importData(backupFile(harness.hooks.makeBackupPayload(target)));

    const safety = JSON.parse(localStorage.getItem(safetyKey));
    assert.ok(safety.restoreSafetyId);
    assert.equal(savedState.settings.restoreSafetyId, safety.restoreSafetyId);
    assert.equal(savedOptions.requireSnapshot, true, 'tout remplacement destructif doit aussi conserver un snapshot IDB');
    assert.equal(harness.hooks.appState().settings.restoreSafetyId, safety.restoreSafetyId);
    assert.equal(safety.state.clients[0].notes, 'État avant import à protéger');
    assert.equal(harness.hooks.readRestoreSafetyBackup().restoreSafetyId, safety.restoreSafetyId);
  });

  await t.test('une récupération génère un tombstone qui rend une ancienne safety inactive sans la supprimer', async () => {
    const localStorage = memoryStorage();
    const storage = loadStorageModule();
    let recoveredCandidate = null;
    const recoveredAdapter = { mode: 'indexeddb', async recordError() {} };
    const harness = applicationHarness({
      localStorage,
      agendaStorage: {
        checksum: storage.checksum,
        async recoverFromState(_options, state) {
          recoveredCandidate = structuredClone(state);
          return { storage: recoveredAdapter, state, mode: 'indexeddb', warning: 'Miroir local indisponible, base sécurisée active.', recovered: true };
        }
      }
    });
    const stale = harness.hooks.makeBackupPayload(baseState(), 'before-restore');
    stale.restoreSafetyId = 'ancienne-operation';
    const staleRaw = JSON.stringify(stale);
    localStorage.setItem(safetyKey, staleRaw);

    const target = baseState();
    target.clients[0].name = 'État de récupération';
    await harness.hooks.importRecoveryData(backupFile(harness.hooks.makeBackupPayload(target)));

    assert.ok(recoveredCandidate.settings.restoreSafetyId);
    assert.notEqual(recoveredCandidate.settings.restoreSafetyId, 'ancienne-operation');
    assert.equal(harness.hooks.appState().settings.restoreSafetyId, recoveredCandidate.settings.restoreSafetyId);
    assert.equal(localStorage.getItem(safetyKey), staleRaw, 'la copie historique doit rester physiquement intacte');
    assert.throws(() => harness.hooks.readRestoreSafetyBackup(), /STALE_RESTORE_SAFETY/);
    assert.equal(harness.pwaResult().reloadCount, 0, 'la récupération réussie ne doit pas recharger vers un miroir encore ancien');
    assert.match(harness.pwaResult().lastAlert, /miroir local indisponible/i);
  });

  await t.test('deux safety divergentes portant le même identifiant restent ambiguës', () => {
    const localStorage = memoryStorage();
    const harness = applicationHarness({ localStorage });
    const current = harness.hooks.migrateState(baseState());
    current.settings.restoreSafetyId = 'operation-ambigue';
    harness.hooks.setAppState(current);
    const active = harness.hooks.makeBackupPayload(current, 'before-restore');
    active.restoreSafetyId = current.settings.restoreSafetyId;
    const pending = structuredClone(active);
    pending.state.clients[0].name = 'Autre état sous le même identifiant';
    pending.checksum = loadStorageModule().checksum(pending.state);
    localStorage.setItem(safetyKey, JSON.stringify(active));
    localStorage.setItem('nail-planner-pending-restore-v15', JSON.stringify(pending));

    assert.throws(() => harness.hooks.readRestoreSafetyBackup(), /AMBIGUOUS_RESTORE_SAFETY/);
  });

  await t.test('le retour automatique transmet exactement le même identifiant à la safety et au commit snapshot', async () => {
    const localStorage = memoryStorage();
    const harness = applicationHarness({ localStorage });
    const current = baseState();
    current.clients[0].name = 'Avant snapshot';
    const restored = harness.hooks.migrateState(baseState());
    restored.clients[0].name = 'Après snapshot';
    let restoreOptions = null;
    harness.hooks.setAppState(current);
    harness.hooks.setStorageAdapter({
      mode: 'indexeddb',
      async snapshotList() { return [{ id: 'snapshot-id', createdAt: '2026-09-01T12:00:00.000Z' }]; },
      async restoreSnapshot(_id, options) {
        restoreOptions = { ...options };
        return { ...structuredClone(restored), settings: { ...structuredClone(restored.settings), restoreSafetyId: options.restoreSafetyId } };
      },
      async recordError() {}
    });

    await harness.hooks.restoreAutomaticSnapshot();

    const safety = JSON.parse(localStorage.getItem(safetyKey));
    assert.ok(restoreOptions.restoreSafetyId);
    assert.equal(safety.restoreSafetyId, restoreOptions.restoreSafetyId);
    assert.equal(harness.hooks.appState().settings.restoreSafetyId, restoreOptions.restoreSafetyId);
    assert.equal(harness.hooks.appState().clients[0].name, 'Après snapshot');
  });

  await t.test('un Undo réussi consomme son identifiant même si le nettoyage local s’interrompt', async () => {
    const backing = memoryStorage();
    const localStorage = {
      ...backing,
      removeItem(key) {
        if (key === 'nail-planner-before-restore-v14') throw new Error('EXPECTED_CLEANUP_FAILURE');
        backing.removeItem(key);
      }
    };
    const harness = applicationHarness({ localStorage });
    const before = harness.hooks.migrateState(baseState());
    before.clients[0].name = 'État restauré par Undo';
    const safety = harness.hooks.makeBackupPayload(before, 'before-restore');
    safety.restoreSafetyId = 'operation-a-consommer';
    backing.setItem(safetyKey, JSON.stringify(safety));
    const current = harness.hooks.migrateState(baseState());
    current.clients[0].name = 'État courant avant Undo';
    current.settings.restoreSafetyId = 'operation-a-consommer';
    let savedState = null;
    harness.hooks.setAppState(current);
    harness.hooks.setStorageAdapter({
      mode: 'indexeddb',
      async save(state) {
        savedState = structuredClone(state);
        return { ok: true, mode: 'indexeddb', mirrorOk: true, snapshotOk: true };
      },
      async recordError() {}
    });

    await harness.hooks.undoLastRestore();

    assert.equal(savedState.clients[0].name, 'État restauré par Undo');
    assert.ok(savedState.settings.restoreSafetyId);
    assert.notEqual(savedState.settings.restoreSafetyId, 'operation-a-consommer');
    assert.equal(harness.hooks.appState().settings.restoreSafetyId, savedState.settings.restoreSafetyId);
    assert.notEqual(backing.getItem(safetyKey), null, 'la safety v15 doit rester garde-fou si le nettoyage historique échoue');
    assert.throws(() => harness.hooks.readRestoreSafetyBackup(), /STALE_RESTORE_SAFETY/);
  });
});

test('la récupération transmet la source v14 exacte et continue sans rechargement si son miroir reste ancien', async () => {
  const v14Key = 'nail-planner-state-v14';
  const rawV14 = baseState(14);
  const legacyAppointment = appointment();
  delete legacyAppointment.refundDate;
  rawV14.appointments = [legacyAppointment];
  const localStorage = memoryStorage({ [v14Key]: JSON.stringify(rawV14) });
  const storage = loadStorageModule();
  let recoveryOptions = null;
  const recoveredAdapter = { mode: 'indexeddb', async recordError() {} };
  const harness = applicationHarness({
    localStorage,
    agendaStorage: {
      checksum: storage.checksum,
      async initialise() { throw Object.assign(new Error('RECOVERY_REQUIRED'), { code: 'RECOVERY_REQUIRED' }); },
      async recoverFromState(options, state) {
        recoveryOptions = { ...options, legacyRawState: structuredClone(options.legacyRawState) };
        return {
          storage: recoveredAdapter,
          state,
          mode: 'indexeddb',
          warning: 'La base est restaurée, mais le miroir v14 est resté inchangé.',
          recovered: true
        };
      }
    }
  });

  assert.equal(await harness.hooks.initialiseSecureStorage(), false);
  const target = baseState();
  target.clients[0].name = 'Récupération utilisateur';
  assert.equal(await harness.hooks.importRecoveryData(backupFile(harness.hooks.makeBackupPayload(target))), true);

  assert.equal(recoveryOptions.legacyReadKey, v14Key);
  assert.equal(recoveryOptions.legacyRawKey, v14Key);
  assert.deepEqual(recoveryOptions.legacyRawState, rawV14);
  assert.equal(harness.hooks.appState().clients[0].name, 'Récupération utilisateur');
  assert.equal(harness.pwaResult().reloadCount, 0);
  assert.match(harness.pwaResult().lastAlert, /miroir v14 est resté inchangé/i);
});

test('le journal pending conserve toujours une copie Undo liée à l’état réellement commis', async t => {
  const activeKey = 'nail-planner-before-restore-v15';
  const pendingKey = 'nail-planner-pending-restore-v15';

  function existingOperation(harness, storage) {
    const current = harness.hooks.migrateState(baseState());
    current.clients[0].name = 'État courant protégé';
    current.settings.restoreSafetyId = 'operation-precedente';
    const safety = harness.hooks.makeBackupPayload(current, 'before-restore');
    safety.restoreSafetyId = current.settings.restoreSafetyId;
    const raw = JSON.stringify(safety);
    storage.setItem(activeKey, raw);
    harness.hooks.setAppState(current);
    return { current, raw };
  }

  await t.test('avant le commit, l’ancienne safety active reste intacte et utilisable', async () => {
    const localStorage = memoryStorage();
    const harness = applicationHarness({ localStorage });
    const previous = existingOperation(harness, localStorage);
    const enteredSave = deferred(), finishSave = deferred();
    harness.hooks.setStorageAdapter({
      mode: 'indexeddb',
      async save() {
        enteredSave.resolve();
        return finishSave.promise;
      },
      async recordError() {}
    });
    const target = baseState();
    target.clients[0].name = 'Nouvel import non commis';

    const importing = harness.hooks.importData(backupFile(harness.hooks.makeBackupPayload(target)));
    await enteredSave.promise;

    assert.equal(localStorage.getItem(activeKey), previous.raw, 'la safety active ne doit pas être écrasée avant le commit');
    const pending = JSON.parse(localStorage.getItem(pendingKey));
    assert.ok(pending.restoreSafetyId);
    assert.notEqual(pending.restoreSafetyId, previous.current.settings.restoreSafetyId);
    assert.equal(harness.hooks.readRestoreSafetyBackup().restoreSafetyId, previous.current.settings.restoreSafetyId);

    finishSave.reject(new Error('CRASH_BEFORE_COMMIT'));
    await importing;
    assert.equal(localStorage.getItem(activeKey), previous.raw);
    assert.equal(harness.hooks.readRestoreSafetyBackup().restoreSafetyId, previous.current.settings.restoreSafetyId);
  });

  await t.test('après le commit, une pending correspondante reste utilisable si sa promotion échoue', async () => {
    const backing = memoryStorage();
    let blockPromotion = false;
    const localStorage = {
      ...backing,
      setItem(key, value) {
        if (key === activeKey && blockPromotion) throw new Error('CRASH_DURING_PENDING_PROMOTION');
        backing.setItem(key, value);
      }
    };
    const harness = applicationHarness({ localStorage });
    const previous = existingOperation(harness, backing);
    const target = harness.hooks.migrateState(baseState());
    target.clients[0].name = 'Snapshot automatiquement restauré';
    harness.hooks.setStorageAdapter({
      mode: 'indexeddb',
      async snapshotList() { return [{ id: 'snapshot-crash', createdAt: '2026-09-01T12:00:00.000Z' }]; },
      async restoreSnapshot(_id, options) {
        blockPromotion = true;
        return { ...structuredClone(target), settings: { ...structuredClone(target.settings), restoreSafetyId: options.restoreSafetyId } };
      },
      async recordError() {}
    });

    await harness.hooks.restoreAutomaticSnapshot();

    const committed = harness.hooks.appState();
    const pending = JSON.parse(backing.getItem(pendingKey));
    assert.equal(committed.clients[0].name, 'Snapshot automatiquement restauré');
    assert.ok(committed.settings.restoreSafetyId);
    assert.equal(pending.restoreSafetyId, committed.settings.restoreSafetyId);
    assert.equal(backing.getItem(activeKey), previous.raw, 'une promotion interrompue ne doit pas détruire l’ancienne safety');
    assert.equal(harness.hooks.readRestoreSafetyBackup().restoreSafetyId, committed.settings.restoreSafetyId);
    assert.equal(harness.hooks.readRestoreSafetyBackup().state.clients[0].name, 'État courant protégé');
  });
});

test('le verrou de remplacement exclut une seconde opération destructive et refuse une sauvegarde ordinaire', async () => {
  const localStorage = memoryStorage();
  const harness = applicationHarness({ localStorage });
  const current = harness.hooks.migrateState(baseState());
  current.clients[0].name = 'Dernier état commis';
  harness.hooks.setAppState(current);
  const enteredSave = deferred(), finishSave = deferred();
  const savedCandidates = [];
  harness.hooks.setStorageAdapter({
    mode: 'indexeddb',
    async save(state) {
      savedCandidates.push(structuredClone(state));
      enteredSave.resolve();
      return finishSave.promise;
    },
    async recordError() {}
  });
  const firstTarget = baseState();
  firstTarget.clients[0].name = 'Premier remplacement';
  const secondTarget = baseState();
  secondTarget.clients[0].name = 'Second remplacement interdit';

  const firstImport = harness.hooks.importData(backupFile(harness.hooks.makeBackupPayload(firstTarget)));
  await enteredSave.promise;
  assert.equal(harness.hooks.exclusiveReplacementActive(), true);

  const secondImport = harness.hooks.importData(backupFile(harness.hooks.makeBackupPayload(secondTarget)));
  const secondOutcome = await Promise.race([
    secondImport.then(() => 'refused'),
    new Promise(resolve => setTimeout(() => resolve('blocked'), 50))
  ]);
  assert.equal(secondOutcome, 'refused', 'la seconde opération doit être refusée, pas mise en attente');
  assert.equal(savedCandidates.length, 1);

  const uncommitted = structuredClone(current);
  uncommitted.clients[0].name = 'Mutation ordinaire pendant le remplacement';
  harness.hooks.setLiveState(uncommitted);
  const ordinarySaved = await harness.hooks.saveState(undefined, { reason: 'ordinary-during-replacement' });
  assert.equal(ordinarySaved, false);
  assert.equal(savedCandidates.length, 1, 'la sauvegarde ordinaire ne doit jamais atteindre le stockage');
  assert.equal(harness.hooks.appState().clients[0].name, 'Dernier état commis', 'la mutation non enregistrable doit être annulée en mémoire');

  finishSave.resolve({ ok: true, mode: 'indexeddb', mirrorOk: true, snapshotOk: true });
  await firstImport;
  assert.equal(harness.hooks.exclusiveReplacementActive(), false);
  assert.equal(savedCandidates.length, 1);
  assert.equal(savedCandidates[0].clients[0].name, 'Premier remplacement');
  assert.equal(harness.hooks.appState().clients[0].name, 'Premier remplacement');
});

test('une sauvegarde historique v3 cohérente reste importable mais ses versions déclarées restent strictes', async () => {
  const { hooks } = applicationHarness();
  const historicalState = baseState(14);
  const historicalAppointment = appointment();
  delete historicalAppointment.refundDate;
  historicalState.appointments.push(historicalAppointment);
  const historical = {
    app: 'mon-agenda-prothesiste',
    appVersion: '12.5-beta',
    backupFormatVersion: 3,
    dataVersion: 14,
    exportedAt: '2026-08-31T12:00:00.000Z',
    state: historicalState
  };

  const result = await hooks.readValidatedBackupFile(backupFile(historical));
  assert.equal(result.data.backupFormatVersion, 3);
  assert.equal(result.state.version, 15);
  assert.equal(result.state.appointments.length, 1);
  assert.equal(result.state.appointments[0].refundDate, '');

  const withoutHeaderVersion = structuredClone(historical);
  delete withoutHeaderVersion.dataVersion;
  const withoutHeaderResult = await hooks.readValidatedBackupFile(backupFile(withoutHeaderVersion));
  assert.equal(withoutHeaderResult.state.version, 15);
  assert.equal(withoutHeaderResult.state.appointments.length, 1);

  const decimalHistoricalHeader = structuredClone(historical);
  decimalHistoricalHeader.dataVersion = 12.5;
  await assert.rejects(hooks.readValidatedBackupFile(backupFile(decimalHistoricalHeader)), /INVALID_BACKUP_VERSION/);

  const contradictoryRefund = structuredClone(historical);
  contradictoryRefund.dataVersion = 14;
  contradictoryRefund.state.version = 15;
  contradictoryRefund.state.appointments = [appointment({ paymentStatus: 'refunded', refundDate: '2026-07-05' })];
  await assert.rejects(hooks.readValidatedBackupFile(backupFile(contradictoryRefund)), /INVALID_BACKUP_VERSION/);
  assert.equal(contradictoryRefund.state.appointments[0].paymentStatus, 'refunded');
  assert.equal(contradictoryRefund.state.appointments[0].refundDate, '2026-07-05');

  const decimalStateOnly = structuredClone(historical);
  delete decimalStateOnly.dataVersion;
  decimalStateOnly.state.version = 14.5;
  await assert.rejects(hooks.readValidatedBackupFile(backupFile(decimalStateOnly)), /INVALID_BACKUP_VERSION/);
});

test('les deux annulations de restauration locale passent par le validateur d’enveloppe', () => {
  const restore = applicationSource.match(/async function undoLastRestore\(\) \{([\s\S]*?)\n\s*\}\n\n\s*async function undoLastMigration/)?.[1] || '';
  const migration = applicationSource.match(/async function undoLastMigration\(\) \{([\s\S]*?)\n\s*\}\n\n\s*function showUpdateNotice/)?.[1] || '';
  for (const [name, body] of [['undoLastRestore', restore], ['undoLastMigration', migration]]) {
    assert.ok(body, `${name} est introuvable`);
    const validationAt = body.indexOf('validateBackupEnvelope(backup)');
    const migrationAt = body.indexOf('migrateState(backup');
    assert.ok(validationAt >= 0, `${name} ne valide pas la copie locale`);
    assert.ok(migrationAt > validationAt, `${name} doit valider avant de migrer et restaurer`);
  }
});

test('controllerchange conserve une saisie sale et diffère le rechargement PWA', () => {
  const harness = applicationHarness();
  harness.hooks.setDirtySettings(true);
  harness.hooks.registerServiceWorker();
  harness.fireServiceWorkerEvent('controllerchange');
  const result = harness.pwaResult();
  assert.equal(result.reloadCount, 0);
  assert.equal(result.notice.hidden, false);
  assert.match(result.notice.innerHTML, /Mise à jour installée/);
  assert.match(result.lastAlert, /Termine ta saisie/);
});
