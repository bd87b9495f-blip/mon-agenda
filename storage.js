(() => {
  'use strict';

  const DATABASE_NAME = 'mon-agenda-secure-v1';
  const DATABASE_VERSION = 1;
  const SNAPSHOT_LIMIT = 5;
  const DIAGNOSTIC_LIMIT = 40;
  const ENTITY_STORES = ['clients', 'appointments', 'blocks', 'expenses'];

  const legacyMetaKey = options => `${options.legacyKey}-storage-meta-v1`;

  function readLegacyMeta(options) {
    try {
      const value = JSON.parse(options.localStorage?.getItem?.(legacyMetaKey(options)) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch { return null; }
  }

  function writeLegacyMeta(options, state, source, updatedAt, revision = 0) {
    options.localStorage?.setItem?.(legacyMetaKey(options), JSON.stringify({
      source, updatedAt, revision: Number(revision || 0), checksum: checksum(state)
    }));
  }

  const clone = value => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  };

  const requestResult = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('INDEXEDDB_REQUEST_FAILED'));
  });

  const transactionDone = transaction => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('INDEXEDDB_TRANSACTION_ABORTED'));
    transaction.onerror = () => {};
  });

  function storageError(code, stage, cause = null) {
    const error = new Error(code);
    error.code = code;
    error.stage = stage;
    error.cause = cause || undefined;
    return error;
  }

  function safeMessage(error) {
    return String(error?.name || error?.code || error?.message || 'Erreur inconnue').slice(0, 160);
  }

  function counts(state) {
    return {
      clients: Array.isArray(state?.clients) ? state.clients.length : 0,
      appointments: Array.isArray(state?.appointments) ? state.appointments.length : 0,
      blocks: Array.isArray(state?.blocks) ? state.blocks.length : 0,
      expenses: Array.isArray(state?.expenses) ? state.expenses.length : 0,
      services: Array.isArray(state?.settings?.services) ? state.settings.services.length : 0,
      supplements: Array.isArray(state?.settings?.supplementTypes) ? state.settings.supplementTypes.length : 0
    };
  }

  function canonicalState(state) {
    return {
      version: Number(state?.version || 0),
      clients: state?.clients || [],
      appointments: state?.appointments || [],
      blocks: state?.blocks || [],
      expenses: state?.expenses || [],
      settings: state?.settings || {}
    };
  }

  function checksum(state) {
    const text = JSON.stringify(canonicalState(state));
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${text.length}`;
  }

  function sameCounts(one, two) {
    const keys = Object.keys(one || {});
    return keys.length === Object.keys(two || {}).length && keys.every(key => Number(one[key]) === Number(two[key]));
  }

  function validate(options, state) {
    try {
      const validated = options.validateState(clone(state));
      if (!validated || typeof validated !== 'object') throw new Error('INVALID_STATE');
      return validated;
    } catch (cause) {
      throw storageError('INVALID_STATE', 'validation', cause);
    }
  }

  function openDatabase(indexedDb) {
    return new Promise((resolve, reject) => {
      let request;
      try { request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION); }
      catch (cause) { reject(storageError('DATABASE_OPEN_FAILED', 'open', cause)); return; }
      request.onupgradeneeded = () => {
        const database = request.result;
        ENTITY_STORES.forEach(name => {
          if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: 'id' });
        });
        if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('snapshots')) {
          const store = database.createObjectStore('snapshots', { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!database.objectStoreNames.contains('diagnostics')) {
          const store = database.createObjectStore('diagnostics', { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onblocked = () => reject(storageError('DATABASE_BLOCKED', 'open'));
      request.onerror = () => reject(storageError('DATABASE_OPEN_FAILED', 'open', request.error));
    });
  }

  function unpackRecords(records) {
    return [...(records || [])]
      .sort((one, two) => Number(one.order || 0) - Number(two.order || 0))
      .map(record => clone(record.value));
  }

  async function readDatabaseState(database) {
    const transaction = database.transaction([...ENTITY_STORES, 'settings', 'meta'], 'readonly');
    const completed = transactionDone(transaction);
    const entityRequests = ENTITY_STORES.map(name => requestResult(transaction.objectStore(name).getAll()));
    const settingsRequest = requestResult(transaction.objectStore('settings').get('settings'));
    const metaRequest = requestResult(transaction.objectStore('meta').get('state'));
    let entityValues, settingsRecord, meta;
    try {
      [entityValues, settingsRecord, meta] = await Promise.all([Promise.all(entityRequests), settingsRequest, metaRequest]);
      await completed;
    } catch (error) {
      await completed.catch(() => {});
      throw error;
    }
    if (!meta) return null;
    const state = {
      version: Number(meta.dataVersion || 0),
      clients: unpackRecords(entityValues[0]),
      appointments: unpackRecords(entityValues[1]),
      blocks: unpackRecords(entityValues[2]),
      expenses: unpackRecords(entityValues[3]),
      settings: clone(settingsRecord?.value || {})
    };
    return { state, meta };
  }

  function serialised(value) {
    try { return JSON.stringify(value); }
    catch { return ''; }
  }

  function applyEntityDiff(store, previousItems, nextItems) {
    const previous = new Map((previousItems || []).map((item, order) => [String(item.id), { item, order }]));
    const next = new Map((nextItems || []).map((item, order) => [String(item.id), { item, order }]));
    previous.forEach((_record, id) => { if (!next.has(id)) store.delete(id); });
    next.forEach((record, id) => {
      const before = previous.get(id);
      if (!before || before.order !== record.order || serialised(before.item) !== serialised(record.item)) {
        store.put({ id, order: record.order, value: clone(record.item) });
      }
    });
  }

  function uniqueId(prefix) {
    const random = globalThis.crypto?.randomUUID?.() || `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    return `${prefix}-${new Date().toISOString()}-${random}`;
  }

  function diagnosticRecord(options, code, stage, error, state, extra = {}) {
    return {
      id: uniqueId('diagnostic'),
      createdAt: new Date().toISOString(),
      appVersion: options.appVersion,
      dataVersion: options.dataVersion,
      code: String(code || 'UNKNOWN').slice(0, 80),
      stage: String(stage || 'unknown').slice(0, 80),
      error: safeMessage(error),
      counts: counts(state),
      ...extra
    };
  }

  async function readRecentRecords(database, storeName) {
    const transaction = database.transaction(storeName, 'readonly');
    const completed = transactionDone(transaction);
    let records;
    try {
      records = await requestResult(transaction.objectStore(storeName).getAll());
      await completed;
    } catch (error) {
      await completed.catch(() => {});
      throw error;
    }
    return records.sort((one, two) => String(one.createdAt).localeCompare(String(two.createdAt)));
  }

  async function appendDiagnostic(database, options, code, stage, error, state, extra = {}) {
    try {
      const existing = await readRecentRecords(database, 'diagnostics');
      const transaction = database.transaction('diagnostics', 'readwrite');
      const store = transaction.objectStore('diagnostics');
      existing.slice(0, Math.max(0, existing.length - DIAGNOSTIC_LIMIT + 1)).forEach(record => store.delete(record.id));
      store.put(diagnosticRecord(options, code, stage, error, state, extra));
      await transactionDone(transaction);
    } catch {}
  }

  function verifyStoredState(options, stored) {
    if (!stored?.state || !stored?.meta) throw storageError('DATABASE_EMPTY', 'verification');
    const state = validate(options, stored.state);
    const actualCounts = counts(state), actualChecksum = checksum(state);
    if (!sameCounts(actualCounts, stored.meta.counts || {}) || actualChecksum !== stored.meta.checksum) {
      throw storageError('INTEGRITY_CHECK_FAILED', 'verification');
    }
    return state;
  }

  async function latestValidSnapshot(database, options) {
    const snapshots = (await readRecentRecords(database, 'snapshots')).reverse();
    for (const snapshot of snapshots) {
      try {
        const state = validate(options, snapshot.state);
        if (snapshot.checksum === checksum(state) && sameCounts(snapshot.counts || {}, counts(state))) return { snapshot, state };
      } catch {}
    }
    return null;
  }

  function createDatabaseAdapter(database, options, initialState, initialMeta) {
    let lastState = clone(initialState);
    let revision = Number(initialMeta?.revision || 0);
    let queue = Promise.resolve();
    let closed = false;

    async function commit(nextState, saveOptions = {}) {
      if (closed) throw storageError('DATABASE_CLOSED', 'save');
      const candidate = validate(options, nextState);
      const previousChecksum = checksum(lastState), candidateChecksum = checksum(candidate);
      const changed = previousChecksum !== candidateChecksum;
      const shouldSnapshot = saveOptions.snapshot !== false && changed && Boolean(lastState);
      const existingSnapshots = shouldSnapshot ? await readRecentRecords(database, 'snapshots') : [];
      const transactionStores = [...ENTITY_STORES, 'settings', 'meta', ...(shouldSnapshot ? ['snapshots'] : [])];
      const transaction = database.transaction(transactionStores, 'readwrite');
      const completed = transactionDone(transaction);
      const metaStore = transaction.objectStore('meta');
      let currentMeta;
      try { currentMeta = await requestResult(metaStore.get('state')); }
      catch (error) { await completed.catch(() => {}); throw error; }
      const expectedRevision = revision;
      if (!saveOptions.force && currentMeta && Number(currentMeta.revision || 0) !== expectedRevision) {
        try { transaction.abort(); } catch {}
        await completed.catch(() => {});
        throw storageError('CONCURRENT_CHANGE', 'save');
      }
      if (!currentMeta && expectedRevision > 0 && !saveOptions.force) {
        try { transaction.abort(); } catch {}
        await completed.catch(() => {});
        throw storageError('DATABASE_STATE_MISSING', 'save');
      }

      ENTITY_STORES.forEach(name => applyEntityDiff(transaction.objectStore(name), lastState?.[name], candidate[name]));
      if (serialised(lastState?.settings) !== serialised(candidate.settings)) transaction.objectStore('settings').put({ id: 'settings', value: clone(candidate.settings) });

      if (shouldSnapshot) {
        const snapshotStore = transaction.objectStore('snapshots');
        const removeCount = Math.max(0, existingSnapshots.length - SNAPSHOT_LIMIT + 1);
        existingSnapshots.slice(0, removeCount).forEach(snapshot => snapshotStore.delete(snapshot.id));
        snapshotStore.put({
          id: uniqueId('snapshot'),
          createdAt: new Date().toISOString(),
          reason: String(saveOptions.reason || 'automatic').slice(0, 80),
          appVersion: options.appVersion,
          dataVersion: options.dataVersion,
          counts: counts(lastState),
          checksum: previousChecksum,
          state: clone(lastState)
        });
      }

      const nextRevision = Number(currentMeta?.revision || revision || 0) + 1;
      const updatedAt = new Date().toISOString();
      const nextMeta = {
        id: 'state',
        databaseVersion: DATABASE_VERSION,
        dataVersion: options.dataVersion,
        appVersion: options.appVersion,
        revision: nextRevision,
        createdAt: currentMeta?.createdAt || new Date().toISOString(),
        updatedAt,
        counts: counts(candidate),
        checksum: candidateChecksum
      };
      metaStore.put(nextMeta);
      await completed;
      lastState = clone(candidate); revision = nextRevision;

      let mirrorOk = true;
      try {
        options.localStorage?.setItem?.(options.legacyKey, JSON.stringify(candidate));
        writeLegacyMeta(options, candidate, 'indexeddb', updatedAt, revision);
      }
      catch (error) {
        mirrorOk = false;
        await appendDiagnostic(database, options, 'LEGACY_MIRROR_FAILED', 'mirror', error, candidate, { revision });
      }
      return { ok: true, mode: 'indexeddb', revision, mirrorOk, counts: counts(candidate) };
    }

    function save(nextState, saveOptions = {}) {
      const operation = queue.then(() => commit(clone(nextState), saveOptions));
      queue = operation.catch(() => {});
      return operation;
    }

    async function verify() {
      await queue;
      const stored = await readDatabaseState(database);
      const state = verifyStoredState(options, stored);
      const snapshots = await readRecentRecords(database, 'snapshots');
      return { ok: true, mode: 'indexeddb', revision: Number(stored.meta.revision || 0), counts: counts(state), checksum: checksum(state), snapshots: snapshots.length, updatedAt: stored.meta.updatedAt };
    }

    async function snapshotList() {
      await queue;
      return (await readRecentRecords(database, 'snapshots')).reverse().map(snapshot => ({ id: snapshot.id, createdAt: snapshot.createdAt, reason: snapshot.reason, counts: snapshot.counts }));
    }

    async function restoreSnapshot(id = '') {
      await queue;
      const snapshots = (await readRecentRecords(database, 'snapshots')).reverse();
      const selected = id ? snapshots.find(snapshot => snapshot.id === id) : snapshots[0];
      if (!selected) throw storageError('SNAPSHOT_NOT_FOUND', 'restore');
      const state = validate(options, selected.state);
      if (selected.checksum !== checksum(state) || !sameCounts(selected.counts || {}, counts(state))) throw storageError('SNAPSHOT_INVALID', 'restore');
      await save(state, { reason: 'restore-automatic-snapshot', snapshot: true });
      return clone(state);
    }

    async function diagnosticsReport(storageEstimate = {}) {
      await queue;
      const verification = await verify().catch(error => ({ ok: false, code: error.code || error.message }));
      const snapshots = await snapshotList().catch(() => []);
      const logs = (await readRecentRecords(database, 'diagnostics').catch(() => [])).slice(-DIAGNOSTIC_LIMIT);
      return {
        app: 'mon-agenda-prothesiste-diagnostic',
        exportedAt: new Date().toISOString(),
        appVersion: options.appVersion,
        dataVersion: options.dataVersion,
        storage: { mode: 'indexeddb', database: DATABASE_NAME, databaseVersion: DATABASE_VERSION, usage: Number(storageEstimate.usage || 0), quota: Number(storageEstimate.quota || 0) },
        verification,
        snapshots,
        logs
      };
    }

    async function recordError(error, stage = 'application', state = lastState) {
      await appendDiagnostic(database, options, error?.code || error?.name || 'APPLICATION_ERROR', stage, error, state, { revision });
    }

    return {
      mode: 'indexeddb', save, verify, snapshotList, restoreSnapshot, diagnosticsReport, recordError,
      getState: () => clone(lastState),
      close: () => { closed = true; database.close(); }
    };
  }

  async function writeInitialDatabase(database, options, state, reason) {
    const empty = { version: options.dataVersion, clients: [], appointments: [], blocks: [], expenses: [], settings: {} };
    const adapter = createDatabaseAdapter(database, options, empty, { revision: 0 });
    await adapter.save(state, { force: true, snapshot: false, reason });
    const stored = await readDatabaseState(database);
    const verified = verifyStoredState(options, stored);
    if (checksum(verified) !== checksum(state)) throw storageError('MIGRATION_VERIFICATION_FAILED', 'migration');
    return { adapter, state: verified, meta: stored.meta };
  }

  async function replaceUnreadableDatabase(database, options, state, reason) {
    const candidate = validate(options, state), updatedAt = new Date().toISOString();
    const transaction = database.transaction([...ENTITY_STORES, 'settings', 'meta'], 'readwrite');
    ENTITY_STORES.forEach(name => {
      const store = transaction.objectStore(name);
      store.clear();
      candidate[name].forEach((value, order) => store.put({ id: String(value.id), order, value: clone(value) }));
    });
    const settingsStore = transaction.objectStore('settings');
    settingsStore.clear(); settingsStore.put({ id: 'settings', value: clone(candidate.settings) });
    const meta = {
      id: 'state', databaseVersion: DATABASE_VERSION, dataVersion: options.dataVersion,
      appVersion: options.appVersion, revision: 1, createdAt: updatedAt, updatedAt,
      recoveryReason: String(reason || 'read-recovery').slice(0, 80), counts: counts(candidate), checksum: checksum(candidate)
    };
    transaction.objectStore('meta').put(meta);
    await transactionDone(transaction);
    const stored = await readDatabaseState(database);
    const verified = verifyStoredState(options, stored);
    try {
      options.localStorage?.setItem?.(options.legacyKey, JSON.stringify(verified));
      writeLegacyMeta(options, verified, 'indexeddb', updatedAt, 1);
    } catch (error) {
      await appendDiagnostic(database, options, 'LEGACY_MIRROR_FAILED', 'mirror', error, verified, { revision: 1 });
    }
    return { adapter: createDatabaseAdapter(database, options, verified, stored.meta), state: verified };
  }

  function createLegacyAdapter(options, initialState, warning) {
    let state = clone(initialState), revision = 0;
    const diagnostics = [];
    const adapter = {
      mode: 'legacy', warning,
      async save(nextState) {
        const candidate = validate(options, nextState);
        const updatedAt = new Date().toISOString(), nextRevision = revision + 1;
        try {
          writeLegacyMeta(options, candidate, 'legacy-fallback', updatedAt, nextRevision);
          options.localStorage?.setItem?.(options.legacyKey, JSON.stringify(candidate));
        }
        catch (cause) {
          diagnostics.push(diagnosticRecord(options, 'LEGACY_SAVE_FAILED', 'legacy-save', cause, candidate));
          throw storageError('LEGACY_SAVE_FAILED', 'legacy-save', cause);
        }
        state = clone(candidate); revision = nextRevision;
        return { ok: true, mode: 'legacy', revision, mirrorOk: true, counts: counts(candidate) };
      },
      async verify() { return { ok: true, mode: 'legacy', revision, counts: counts(state), checksum: checksum(state), snapshots: 0 }; },
      async snapshotList() { return []; },
      async restoreSnapshot() { throw storageError('SNAPSHOT_NOT_FOUND', 'restore'); },
      async diagnosticsReport(storageEstimate = {}) {
        return { app: 'mon-agenda-prothesiste-diagnostic', exportedAt: new Date().toISOString(), appVersion: options.appVersion, dataVersion: options.dataVersion, storage: { mode: 'legacy', usage: Number(storageEstimate.usage || 0), quota: Number(storageEstimate.quota || 0) }, verification: await adapter.verify(), snapshots: [], logs: diagnostics.slice(-DIAGNOSTIC_LIMIT) };
      },
      async recordError(error, stage = 'application') { diagnostics.push(diagnosticRecord(options, error?.code || error?.name || 'APPLICATION_ERROR', stage, error, state)); },
      getState: () => clone(state), close() {}
    };
    return adapter;
  }

  async function initialise(userOptions) {
    const options = {
      indexedDB: userOptions.indexedDB || globalThis.indexedDB,
      localStorage: userOptions.localStorage || globalThis.localStorage,
      legacyKey: userOptions.legacyKey,
      legacyState: clone(userOptions.legacyState),
      legacyFallbackAllowed: userOptions.legacyFallbackAllowed !== false,
      validateState: userOptions.validateState,
      appVersion: userOptions.appVersion,
      dataVersion: Number(userOptions.dataVersion || 0)
    };
    const legacyState = validate(options, options.legacyState);
    if (!options.indexedDB?.open) {
      if (!options.legacyFallbackAllowed) throw storageError('RECOVERY_REQUIRED', 'startup');
      const warning = 'La base sécurisée n’est pas disponible sur ce navigateur. Le stockage de compatibilité reste actif.';
      return { storage: createLegacyAdapter(options, legacyState, warning), state: legacyState, mode: 'legacy', warning, migrated: false, recovered: false };
    }

    let database;
    try { database = await openDatabase(options.indexedDB); }
    catch (error) {
      if (!options.legacyFallbackAllowed) throw storageError('RECOVERY_REQUIRED', 'startup', error);
      const warning = 'La base sécurisée n’a pas pu être ouverte. Le stockage de compatibilité reste actif pour éviter de bloquer l’application.';
      return { storage: createLegacyAdapter(options, legacyState, warning), state: legacyState, mode: 'legacy', warning, migrated: false, recovered: false, startupError: error };
    }

    let stored;
    try { stored = await readDatabaseState(database); }
    catch (firstError) {
      await appendDiagnostic(database, options, 'DATABASE_READ_FAILED', 'startup-first-read', firstError, legacyState);
      try { stored = await readDatabaseState(database); }
      catch (retryError) {
        await appendDiagnostic(database, options, 'DATABASE_READ_FAILED', 'startup-second-read', retryError, legacyState);
        const recovered = await latestValidSnapshot(database, options).catch(() => null);
        if (recovered) {
          try {
            const replaced = await replaceUnreadableDatabase(database, options, recovered.state, 'snapshot-after-read-failure');
            const warning = `La base principale n’était plus lisible. La copie automatique du ${new Date(recovered.snapshot.createdAt).toLocaleString('fr-FR')} a été récupérée.`;
            return { storage: replaced.adapter, state: replaced.state, mode: 'indexeddb', warning, migrated: false, recovered: true, startupError: retryError };
          } catch (recoveryError) {
            await appendDiagnostic(database, options, 'SNAPSHOT_RECOVERY_FAILED', 'startup', recoveryError, legacyState);
          }
        }
        database.close();
        if (!options.legacyFallbackAllowed) throw storageError('RECOVERY_REQUIRED', 'startup', retryError);
        const warning = 'La base sécurisée n’a pas pu être lue. La copie de compatibilité reste active et aucune donnée n’a été remplacée.';
        return { storage: createLegacyAdapter(options, legacyState, warning), state: legacyState, mode: 'legacy', warning, migrated: false, recovered: false, startupError: retryError };
      }
    }
    if (!stored) {
      if (!options.legacyFallbackAllowed) {
        database.close();
        throw storageError('RECOVERY_REQUIRED', 'migration');
      }
      try {
        const created = await writeInitialDatabase(database, options, legacyState, 'migration-local-storage');
        return { storage: created.adapter, state: created.state, mode: 'indexeddb', warning: '', migrated: true, recovered: false };
      } catch (error) {
        await appendDiagnostic(database, options, error.code || 'MIGRATION_FAILED', error.stage || 'migration', error, legacyState);
        database.close();
        const warning = 'La migration vers la base sécurisée a échoué. Les données d’origine sont restées intactes et continuent d’être utilisées.';
        return { storage: createLegacyAdapter(options, legacyState, warning), state: legacyState, mode: 'legacy', warning, migrated: false, recovered: false, startupError: error };
      }
    }

    try {
      const state = verifyStoredState(options, stored);
      const adapter = createDatabaseAdapter(database, options, state, stored.meta);
      const legacyMeta = readLegacyMeta(options);
      const legacyUpdatedAt = Date.parse(legacyMeta?.updatedAt || ''), databaseUpdatedAt = Date.parse(stored.meta.updatedAt || '');
      const legacyIsNewer = legacyMeta?.source === 'legacy-fallback'
        && legacyMeta.checksum === checksum(legacyState)
        && Number.isFinite(legacyUpdatedAt)
        && (!Number.isFinite(databaseUpdatedAt) || legacyUpdatedAt >= databaseUpdatedAt)
        && legacyMeta.checksum !== stored.meta.checksum;
      if (legacyIsNewer) {
        try {
          await adapter.save(legacyState, { reason: 'reconcile-legacy-fallback' });
          const warning = 'Les modifications enregistrées pendant le mode de compatibilité ont été réintégrées dans la base sécurisée.';
          return { storage: adapter, state: legacyState, mode: 'indexeddb', warning, migrated: false, recovered: true };
        } catch (error) {
          await appendDiagnostic(database, options, 'LEGACY_RECONCILIATION_FAILED', 'startup', error, legacyState);
          database.close();
          const warning = 'La copie de compatibilité contient des modifications plus récentes. Elle reste active car leur réintégration a échoué.';
          return { storage: createLegacyAdapter(options, legacyState, warning), state: legacyState, mode: 'legacy', warning, migrated: false, recovered: false, startupError: error };
        }
      }
      return { storage: adapter, state, mode: 'indexeddb', warning: '', migrated: false, recovered: false };
    } catch (error) {
      await appendDiagnostic(database, options, error.code || 'INTEGRITY_CHECK_FAILED', error.stage || 'startup', error, stored.state || legacyState);
      const recovered = await latestValidSnapshot(database, options);
      if (recovered) {
        const adapter = createDatabaseAdapter(database, options, stored.state, stored.meta);
        await adapter.save(recovered.state, { force: true, snapshot: false, reason: 'automatic-recovery' });
        const warning = `La base principale était illisible. La copie automatique du ${new Date(recovered.snapshot.createdAt).toLocaleString('fr-FR')} a été récupérée.`;
        return { storage: adapter, state: recovered.state, mode: 'indexeddb', warning, migrated: false, recovered: true };
      }
      try {
        if (!options.legacyFallbackAllowed) throw storageError('LEGACY_RECOVERY_UNAVAILABLE', 'startup');
        const fallback = validate(options, legacyState);
        const adapter = createDatabaseAdapter(database, options, stored.state, stored.meta);
        await adapter.save(fallback, { force: true, snapshot: false, reason: 'legacy-recovery' });
        const warning = 'La base principale était illisible. La copie de compatibilité V12.4.1 a été récupérée sans être supprimée.';
        return { storage: adapter, state: fallback, mode: 'indexeddb', warning, migrated: false, recovered: true };
      } catch (fallbackError) {
        await appendDiagnostic(database, options, 'RECOVERY_REQUIRED', 'startup', fallbackError, stored.state || legacyState);
        database.close();
        throw storageError('RECOVERY_REQUIRED', 'startup', fallbackError);
      }
    }
  }

  globalThis.AgendaStorage = Object.freeze({
    initialise,
    checksum,
    counts,
    constants: Object.freeze({ databaseName: DATABASE_NAME, databaseVersion: DATABASE_VERSION, snapshotLimit: SNAPSHOT_LIMIT })
  });
})();
