(() => {
  'use strict';

  const DATABASE_NAME = 'mon-agenda-secure-v1';
  const DATABASE_VERSION = 2;
  const SNAPSHOT_LIMIT = 5;
  const RECOVERY_LIMIT = 3;
  const DIAGNOSTIC_LIMIT = 40;
  const DEFAULT_STARTUP_TIMEOUT_MS = 12000;
  const ENTITY_STORES = ['clients', 'appointments', 'blocks', 'expenses'];
  const LINEAGE_META_FIELDS = [
    'migrationReason', 'migratedFromDataVersion', 'migratedFromChecksum', 'migratedFromChecksumKind',
    'migratedFromRevision', 'migratedFromDatabaseId', 'migratedFromSource', 'migratedFromLegacyKey',
    'migrationSnapshotId', 'migrationDate', 'recoveryReason', 'quarantineId',
    'supersededLegacyChecksum', 'supersededLegacyChecksumKind', 'supersededLegacyRevision',
    'supersededLegacyDatabaseId', 'supersededLegacySource', 'supersededLegacyDataVersion',
    'supersededLegacyKey', 'supersededLegacySnapshotId'
  ];

  const legacyMetaKey = (options, key = options.legacyKey) => `${key}-storage-meta-v1`;

  function readLegacyMeta(options, key = options.legacyKey) {
    let raw = null;
    try {
      raw = options.localStorage?.getItem?.(legacyMetaKey(options, key)) ?? null;
    } catch (error) {
      return { status: 'uncertain', meta: null, error };
    }
    if (raw === null) return { status: 'absent', meta: null, error: null };
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'invalid', meta: null, error: null };
      return { status: 'valid', meta: value, error: null };
    } catch (error) {
      return { status: 'invalid', meta: null, error };
    }
  }

  function writeLegacyMeta(options, state, source, updatedAt, revision = 0, lineage = {}) {
    const record = {
      source,
      updatedAt,
      revision: Number(revision || 0),
      checksum: checksum(state),
      counts: counts(state),
      dataVersion: Number(state?.version || options.dataVersion || 0)
    };
    if (lineage.databaseId) record.databaseId = String(lineage.databaseId);
    if (lineage.baseRevision !== null && lineage.baseRevision !== undefined && Number.isFinite(Number(lineage.baseRevision))) record.baseRevision = Number(lineage.baseRevision);
    if (lineage.baseChecksum) record.baseChecksum = String(lineage.baseChecksum);
    options.localStorage?.setItem?.(legacyMetaKey(options), JSON.stringify(record));
  }

  function localStorageHasState(options, key = options.legacyKey) {
    try { return options.localStorage?.getItem?.(key) !== null; }
    catch { return false; }
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

  function withTransactionTimeout(operation, transaction, timeoutMs, code = 'DATABASE_READ_TIMEOUT', stage = 'read') {
    if (!Number.isFinite(Number(timeoutMs)) || Number(timeoutMs) < 1) return operation;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true; clearTimeout(timer); callback(value);
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { transaction.abort(); } catch {}
        reject(storageError(code, stage));
      }, Number(timeoutMs));
      Promise.resolve(operation).then(value => finish(resolve, value), error => finish(reject, error));
    });
  }

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

  function mirrorWarning(warning, mirrorOk) {
    if (mirrorOk !== false) return warning || '';
    return [warning, 'La base sécurisée est valide, mais sa copie locale liée n’a pas pu être mise à jour. Crée une sauvegarde dans Fichiers.'].filter(Boolean).join(' ');
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
    return hashText(text);
  }

  function exactChecksum(value) {
    return hashText(JSON.stringify(value));
  }

  function hashText(text) {
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

  function validDateKey(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function inheritLineageMeta(target, source) {
    LINEAGE_META_FIELDS.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(source || {}, key)) target[key] = clone(source[key]);
    });
    return target;
  }

  function validate(options, state, context = {}) {
    try {
      const validated = options.validateState(clone(state), clone(context));
      if (!validated || typeof validated !== 'object') throw new Error('INVALID_STATE');
      return validated;
    } catch (cause) {
      throw storageError('INVALID_STATE', 'validation', cause);
    }
  }

  function openDatabase(indexedDb, timeoutMs = DEFAULT_STARTUP_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      let request, timer = null, createdFresh = false, settled = false;
      const fail = error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        reject(error);
      };
      try { request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION); }
      catch (cause) { fail(storageError('DATABASE_OPEN_FAILED', 'open', cause)); return; }
      timer = setTimeout(() => {
        const error = storageError('DATABASE_OPEN_TIMEOUT', 'open');
        fail(error);
        try { request.transaction?.abort?.(); } catch {}
      }, Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) >= 1 ? Number(timeoutMs) : DEFAULT_STARTUP_TIMEOUT_MS);
      request.onupgradeneeded = event => {
        createdFresh = Number(event.oldVersion || 0) === 0;
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
        if (!database.objectStoreNames.contains('recoveries')) {
          const store = database.createObjectStore('recoveries', { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (createdFresh) {
          request.transaction.objectStore('meta').put({
            id: 'bootstrap',
            status: 'pending',
            databaseVersion: DATABASE_VERSION,
            createdAt: new Date().toISOString()
          });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        if (settled) { database.close(); return; }
        settled = true; clearTimeout(timer);
        database.onversionchange = () => database.close();
        resolve({ database, createdFresh });
      };
      request.onblocked = () => fail(storageError('DATABASE_BLOCKED', 'open'));
      request.onerror = () => fail(storageError('DATABASE_OPEN_FAILED', 'open', request.error));
    });
  }

  function unpackRecords(records) {
    return [...(records || [])]
      .sort((one, two) => Number(one.order || 0) - Number(two.order || 0))
      .map(record => clone(record.value));
  }

  async function readDatabaseState(database, timeoutMs = 0) {
    const transaction = database.transaction([...ENTITY_STORES, 'settings', 'meta'], 'readonly');
    const completed = transactionDone(transaction);
    const entityRequests = ENTITY_STORES.map(name => requestResult(transaction.objectStore(name).getAll()));
    const settingsRequest = requestResult(transaction.objectStore('settings').get('settings'));
    const metaRequest = requestResult(transaction.objectStore('meta').get('state'));
    const [entityValues, settingsRecord, meta] = await withTransactionTimeout(
      Promise.all([Promise.all(entityRequests), settingsRequest, metaRequest, completed]).then(values => values.slice(0, 3)),
      transaction, timeoutMs, 'DATABASE_READ_TIMEOUT', 'read'
    );
    const state = {
      version: Number(meta?.dataVersion || 0),
      clients: unpackRecords(entityValues[0]),
      appointments: unpackRecords(entityValues[1]),
      blocks: unpackRecords(entityValues[2]),
      expenses: unpackRecords(entityValues[3]),
      settings: clone(settingsRecord?.value || {})
    };
    if (!meta) {
      const hasStoredContent = entityValues.some(records => records.length > 0) || Boolean(settingsRecord);
      if (!hasStoredContent) return null;
      const error = storageError('DATABASE_METADATA_MISSING', 'read');
      error.observedState = state;
      throw error;
    }
    return { state, meta };
  }

  async function readDatabaseMeta(database, timeoutMs = 0) {
    const transaction = database.transaction('meta', 'readonly');
    const completed = transactionDone(transaction);
    const [meta] = await withTransactionTimeout(
      Promise.all([requestResult(transaction.objectStore('meta').get('state')), completed]),
      transaction, timeoutMs, 'DATABASE_READ_TIMEOUT', 'read-meta'
    );
    return meta || null;
  }

  async function readBootstrapFootprint(database, timeoutMs = 0) {
    const transaction = database.transaction(['meta', 'snapshots', 'recoveries'], 'readonly');
    const completed = transactionDone(transaction);
    const bootstrapRequest = requestResult(transaction.objectStore('meta').get('bootstrap'));
    const snapshotRequest = requestResult(transaction.objectStore('snapshots').getAll());
    const recoveryRequest = requestResult(transaction.objectStore('recoveries').getAll());
    const [bootstrap, snapshots, recoveries] = await withTransactionTimeout(
      Promise.all([bootstrapRequest, snapshotRequest, recoveryRequest, completed]).then(values => values.slice(0, 3)),
      transaction, timeoutMs, 'DATABASE_READ_TIMEOUT', 'read-bootstrap'
    );
    return {
      pending: bootstrap?.status === 'pending' && Number(bootstrap?.databaseVersion || 0) === DATABASE_VERSION,
      hasRecoveryHistory: Boolean(snapshots.length || recoveries.length)
    };
  }

  function serialised(value) {
    try { return JSON.stringify(value); }
    catch { return ''; }
  }

  function exactStoredValue(one, two, seen = new WeakMap()) {
    if (Object.is(one, two)) return true;
    if (one === null || two === null || typeof one !== 'object' || typeof two !== 'object') return false;
    if (Object.prototype.toString.call(one) !== Object.prototype.toString.call(two)) return false;
    if (one instanceof Date || two instanceof Date) return one instanceof Date && two instanceof Date && one.getTime() === two.getTime();
    if (seen.get(one) === two) return true;
    seen.set(one, two);
    const oneKeys = Object.keys(one).sort(), twoKeys = Object.keys(two).sort();
    return oneKeys.length === twoKeys.length
      && oneKeys.every((key, index) => key === twoKeys[index] && exactStoredValue(one[key], two[key], seen));
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

  async function readRecentRecords(database, storeName, timeoutMs = 0) {
    const transaction = database.transaction(storeName, 'readonly');
    const completed = transactionDone(transaction);
    const [records] = await withTransactionTimeout(
      Promise.all([requestResult(transaction.objectStore(storeName).getAll()), completed]),
      transaction, timeoutMs, 'DATABASE_READ_TIMEOUT', `read-${storeName}`
    );
    return records.sort((one, two) => String(one.createdAt).localeCompare(String(two.createdAt)));
  }

  async function appendDiagnostic(database, options, code, stage, error, state, extra = {}) {
    try {
      const timeoutMs = Math.min(Number(options.startupTimeoutMs || DEFAULT_STARTUP_TIMEOUT_MS), 3000);
      const existing = await readRecentRecords(database, 'diagnostics', timeoutMs);
      const transaction = database.transaction('diagnostics', 'readwrite');
      const store = transaction.objectStore('diagnostics');
      existing.slice(0, Math.max(0, existing.length - DIAGNOSTIC_LIMIT + 1)).forEach(record => store.delete(record.id));
      store.put(diagnosticRecord(options, code, stage, error, state, extra));
      await withTransactionTimeout(transactionDone(transaction), transaction, timeoutMs, 'DIAGNOSTIC_TIMEOUT', 'diagnostic');
    } catch {}
  }

  function inspectStoredState(options, stored) {
    if (!stored?.state || !stored?.meta) throw storageError('DATABASE_EMPTY', 'verification');
    const storedRevision = Number(stored.meta.revision);
    if (!Number.isSafeInteger(storedRevision) || storedRevision < 1) {
      throw storageError('DATABASE_METADATA_INVALID', 'verification');
    }
    const rawState = clone(stored.state);
    const rawCounts = counts(rawState), rawChecksum = checksum(rawState), rawExactChecksum = exactChecksum(rawState);
    if (!sameCounts(rawCounts, stored.meta.counts || {}) || rawChecksum !== stored.meta.checksum) {
      throw storageError('INTEGRITY_CHECK_FAILED', 'verification');
    }
    let state;
    try { state = validate(options, rawState); }
    catch (cause) {
      if (Number(stored.meta.dataVersion || rawState.version || 0) !== options.dataVersion) {
        throw storageError('DATA_MIGRATION_FAILED', 'migration', cause);
      }
      throw cause;
    }
    return {
      state,
      rawState,
      rawChecksum,
      rawExactChecksum,
      meta: stored.meta,
      migrated: Number(stored.meta.dataVersion || rawState.version || 0) !== options.dataVersion
        || Number(stored.meta.databaseVersion || 0) !== DATABASE_VERSION
        || !String(stored.meta.databaseId || '')
        || checksum(state) !== rawChecksum
    };
  }

  function verifyStoredState(options, stored) {
    return inspectStoredState(options, stored).state;
  }

  function inspectLegacyCandidate(options, legacyState) {
    let rawState = null, rawStateValid = true, rawPresent = false, stateReadUncertain = false;
    const readKey = options.legacyReadKey || options.legacyKey;
    try {
      const raw = options.localStorage?.getItem?.(readKey);
      rawPresent = raw !== null;
      if (rawPresent) rawState = JSON.parse(raw);
    } catch { rawStateValid = false; stateReadUncertain = true; }
    const suppliedRawPresent = options.legacyRawState !== null && options.legacyRawState !== undefined;
    if (rawPresent && suppliedRawPresent
      && String(options.legacyRawKey || readKey) === String(readKey)
      && !exactStoredValue(rawState, options.legacyRawState)) {
      rawStateValid = false;
      stateReadUncertain = true;
    }
    const sourceState = rawPresent ? rawState : suppliedRawPresent ? clone(options.legacyRawState) : legacyState;
    const sourceKey = rawPresent ? readKey : String(options.legacyRawKey || readKey);
    const sourceRawPresent = rawPresent || suppliedRawPresent;
    const rawChecksum = checksum(sourceState);
    const rawExactChecksum = exactChecksum(sourceState);
    let state;
    try { state = validate(options, sourceState); }
    catch (error) {
      if (!sourceRawPresent) throw error;
      rawStateValid = false;
      state = validate(options, legacyState);
    }
    const stateChecksum = checksum(state);
    const metaRead = readLegacyMeta(options, sourceKey);
    const meta = metaRead.meta;
    const evidence = options.legacyEvidence === true
      || (options.legacyEvidence === undefined && localStorageHasState(options, readKey));
    const available = Boolean(options.legacyFallbackAllowed && evidence);
    const metadataValid = Boolean(available && rawStateValid && meta && meta.checksum === rawChecksum);
    const metadataCountsValid = !meta?.counts || sameCounts(meta.counts, counts(sourceState));
    return {
      available,
      metadataValid: metadataValid && metadataCountsValid,
      state,
      rawState: clone(sourceState),
      checksum: stateChecksum,
      rawChecksum,
      rawExactChecksum,
      meta: metadataValid && metadataCountsValid ? meta : null,
      source: metadataValid && metadataCountsValid ? String(meta.source || '') : String(options.legacySource || 'legacy-unverified'),
      key: sourceKey,
      rawPresent: sourceRawPresent,
      rawStateValid,
      metaReadStatus: metaRead.status,
      readUncertain: stateReadUncertain || metaRead.status === 'uncertain'
    };
  }

  function inspectLegacyPairForReplacement(options) {
    let rawStateText, rawMetaText;
    const readKey = options.legacyReadKey || options.legacyKey;
    const suppliedRawPresent = options.legacyRawState !== null && options.legacyRawState !== undefined;
    const suppliedKey = String(options.legacyRawKey || readKey);
    const suppliedCandidate = parsedRaw => {
      if (!suppliedRawPresent || options.legacyReadUncertain) return null;
      try {
        const suppliedRawState = clone(options.legacyRawState);
        if (parsedRaw !== undefined && !exactStoredValue(parsedRaw, suppliedRawState)) return null;
        const state = validate(options, suppliedRawState);
        return {
          status: 'supplied-valid', state, rawState: suppliedRawState,
          rawChecksum: checksum(suppliedRawState), rawExactChecksum: exactChecksum(suppliedRawState),
          stateChecksum: checksum(state),
          meta: { revision: 0, dataVersion: Number(suppliedRawState?.version || 1), databaseId: '', source: String(options.legacySource || 'legacy-unverified') },
          key: suppliedKey, source: String(options.legacySource || 'legacy-unverified')
        };
      } catch (error) { return { status: 'uncertain', error }; }
    };
    try {
      rawStateText = options.localStorage?.getItem?.(readKey) ?? null;
      rawMetaText = options.localStorage?.getItem?.(legacyMetaKey(options, readKey)) ?? null;
    } catch (error) { return { status: 'uncertain', error }; }
    if (rawStateText === null && rawMetaText === null) return suppliedCandidate(undefined) || { status: 'absent' };
    if (rawStateText === null) return { status: 'uncertain' };
    try {
      const rawState = JSON.parse(rawStateText);
      if (rawMetaText === null) return suppliedCandidate(rawState) || { status: 'uncertain' };
      const meta = JSON.parse(rawMetaText);
      if (!rawState || typeof rawState !== 'object' || !meta || typeof meta !== 'object' || Array.isArray(meta)) return { status: 'uncertain' };
      const rawChecksum = checksum(rawState);
      if (String(meta.checksum || '') !== rawChecksum || (meta.counts && !sameCounts(meta.counts, counts(rawState)))) return { status: 'uncertain' };
      const state = validate(options, rawState);
      return { status: 'valid', state, rawState, rawChecksum, rawExactChecksum: exactChecksum(rawState), stateChecksum: checksum(state), meta, key: readKey, source: String(meta.source || '') };
    } catch (error) { return { status: 'uncertain', error }; }
  }

  function validSnapshot(options, snapshot) {
    try {
      const rawState = clone(snapshot?.state);
      const observedChecksum = snapshot?.checksumKind === 'exact-json-v1' ? exactChecksum(rawState) : checksum(rawState);
      if (snapshot?.checksum !== observedChecksum || !sameCounts(snapshot?.counts || {}, counts(rawState))) return null;
      const sourceDataVersion = Number(snapshot?.dataVersion || rawState?.version || 0);
      const explicitMigrationDate = validDateKey(snapshot?.migrationDate) ? String(snapshot.migrationDate) : '';
      const migrationDate = explicitMigrationDate || (/^\d{4}-\d{2}-\d{2}/.test(String(snapshot?.createdAt || '')) ? String(snapshot.createdAt).slice(0, 10) : '');
      if (snapshot?.migrationContextChecksum !== undefined
        && snapshot.migrationContextChecksum !== exactChecksum({ dataVersion: sourceDataVersion, migrationDate, state: rawState })) return null;
      if (snapshot?.checksumKind === 'exact-json-v1' && sourceDataVersion < options.dataVersion && !snapshot?.migrationContextChecksum) return null;
      if (Number.isFinite(sourceDataVersion) && sourceDataVersion >= 1 && sourceDataVersion < options.dataVersion && !migrationDate) return null;
      const state = validate(options, rawState, { source: 'snapshot', migrationDate });
      return { snapshot, state, rawState };
    } catch { return null; }
  }

  async function validSnapshots(database, options, timeoutMs = 0) {
    const snapshots = (await readRecentRecords(database, 'snapshots', timeoutMs)).reverse();
    return snapshots.map(snapshot => validSnapshot(options, snapshot)).filter(Boolean).sort((one, two) => {
      const oneRevision = Number(one.snapshot.revision), twoRevision = Number(two.snapshot.revision);
      if (Number.isFinite(oneRevision) && Number.isFinite(twoRevision) && oneRevision !== twoRevision) return twoRevision - oneRevision;
      return String(two.snapshot.createdAt || '').localeCompare(String(one.snapshot.createdAt || ''));
    });
  }

  async function latestValidSnapshot(database, options, databaseMeta = null, timeoutMs = 0) {
    const snapshots = await validSnapshots(database, options, timeoutMs);
    if (!databaseMeta) return snapshots[0] || null;
    return snapshots.find(({ snapshot }) => (databaseMeta.databaseId
      ? snapshot.databaseId === databaseMeta.databaseId
      : !snapshot.databaseId)
      && Number.isFinite(Number(snapshot.revision))
      && Number(snapshot.revision) < Number(databaseMeta.revision || 0)) || null;
  }

  function sameDatabaseMeta(one, two) {
    if (!one || !two) return one === two;
    return Number(one.revision || 0) === Number(two.revision || 0)
      && String(one.checksum || '') === String(two.checksum || '')
      && String(one.databaseId || '') === String(two.databaseId || '');
  }

  function linkedLegacyCandidate(candidate, databaseMeta) {
    if (!candidate?.metadataValid || !databaseMeta) return false;
    const meta = candidate.meta;
    const sameDatabase = !meta.databaseId && !databaseMeta.databaseId
      || (Boolean(meta.databaseId) && meta.databaseId === databaseMeta.databaseId);
    if (!sameDatabase) return false;
    if (meta.source === 'indexeddb') {
      return Number(meta.revision || 0) === Number(databaseMeta.revision || 0)
        && candidate.rawChecksum === databaseMeta.checksum;
    }
    if (meta.source !== 'legacy-fallback') return false;
    return Number.isFinite(Number(meta.baseRevision))
      && Number(meta.baseRevision) === Number(databaseMeta.revision || 0)
      && String(meta.baseChecksum || '') === String(databaseMeta.checksum || '')
      && Number(meta.revision || 0) > Number(meta.baseRevision);
  }

  function legacyForkCanReconcile(candidate, databaseMeta) {
    return candidate?.metadataValid
      && candidate.meta.source === 'legacy-fallback'
      && candidate.rawChecksum !== databaseMeta?.checksum
      && linkedLegacyCandidate(candidate, databaseMeta);
  }

  function exactMigrationSource(candidate, databaseMeta) {
    if (!candidate?.rawPresent || !candidate?.rawStateValid || !databaseMeta || !databaseMeta.migratedFromChecksum) return false;
    const candidateRevision = Number(candidate.meta?.revision);
    const sourceRevision = Number(databaseMeta.migratedFromRevision);
    const candidateVersion = Number(candidate.meta?.dataVersion ?? candidate.rawState?.version);
    const sourceVersion = Number(databaseMeta.migratedFromDataVersion);
    const observedChecksum = databaseMeta.migratedFromChecksumKind === 'exact-json-v1'
      ? candidate.rawExactChecksum
      : candidate.rawChecksum;
    const commonMatch = observedChecksum === String(databaseMeta.migratedFromChecksum)
      && Number.isSafeInteger(candidateVersion) && candidateVersion >= 1
      && candidateVersion === sourceVersion
      && (!databaseMeta.migratedFromLegacyKey || String(candidate.key || '') === String(databaseMeta.migratedFromLegacyKey));
    if (!commonMatch) return false;
    if (candidate.metadataValid) {
      return ['indexeddb', 'legacy-fallback'].includes(String(candidate.meta?.source || ''))
        && String(candidate.meta.source) === String(databaseMeta.migratedFromSource || '')
        && Number.isSafeInteger(candidateRevision) && candidateRevision >= 1
        && candidateRevision === sourceRevision
        && String(candidate.meta?.databaseId || '') === String(databaseMeta.migratedFromDatabaseId || '');
    }
    // Une source historique sans métadonnée n’est reconnue directement que
    // par la nouvelle empreinte JSON exacte et par sa provenance bootstrap.
    // Cette attestation survit à la rotation normale des snapshots.
    return databaseMeta.migratedFromChecksumKind === 'exact-json-v1'
      && String(databaseMeta.migratedFromSource || '') === 'local-bootstrap'
      && sourceRevision === 0
      && !String(databaseMeta.migratedFromDatabaseId || '');
  }

  function exactSupersededLegacySource(candidate, databaseMeta) {
    if (!candidate?.rawPresent || !candidate?.rawStateValid || !databaseMeta || !databaseMeta.supersededLegacyChecksum) return false;
    const candidateRevision = Number(candidate.meta?.revision);
    const sourceRevision = Number(databaseMeta.supersededLegacyRevision);
    const candidateVersion = Number(candidate.meta?.dataVersion ?? candidate.rawState?.version);
    const sourceVersion = Number(databaseMeta.supersededLegacyDataVersion);
    const observedChecksum = databaseMeta.supersededLegacyChecksumKind === 'exact-json-v1'
      ? candidate.rawExactChecksum
      : candidate.rawChecksum;
    const commonMatch = observedChecksum === String(databaseMeta.supersededLegacyChecksum)
      && Number.isSafeInteger(candidateVersion) && candidateVersion >= 1
      && candidateVersion === sourceVersion
      && (!databaseMeta.supersededLegacyKey || String(candidate.key || '') === String(databaseMeta.supersededLegacyKey));
    if (!commonMatch) return false;
    if (candidate.metadataValid) {
      return Number.isSafeInteger(candidateRevision) && candidateRevision >= 0
        && candidateRevision === sourceRevision
        && String(candidate.meta?.databaseId || '') === String(databaseMeta.supersededLegacyDatabaseId || '')
        && String(candidate.meta?.source || '') === String(databaseMeta.supersededLegacySource || '');
    }
    return sourceRevision === 0
      && !String(databaseMeta.supersededLegacyDatabaseId || '')
      && String(candidate.source || '') === String(databaseMeta.supersededLegacySource || '');
  }

  function quarantineRecord(options, state, meta, reason, error) {
    let stateChecksum = '';
    try { stateChecksum = checksum(state); } catch {}
    return {
      id: uniqueId('recovery'),
      createdAt: new Date().toISOString(),
      reason: String(reason || 'automatic-recovery').slice(0, 80),
      errorCode: String(error?.code || error?.name || 'INTEGRITY_CHECK_FAILED').slice(0, 80),
      appVersion: options.appVersion,
      dataVersion: Number(meta?.dataVersion || state?.version || 0),
      databaseId: String(meta?.databaseId || ''),
      sourceRevision: Number(meta?.revision || 0),
      sourceUpdatedAt: String(meta?.updatedAt || ''),
      sourceChecksum: String(meta?.checksum || stateChecksum),
      observedChecksum: stateChecksum,
      counts: counts(state),
      state: clone(state)
    };
  }

  function createDatabaseAdapter(database, options, initialState, initialMeta) {
    let lastState = clone(initialState);
    let revision = Number(initialMeta?.revision || 0);
    let databaseId = String(initialMeta?.databaseId || '');
    let queue = Promise.resolve();
    let closed = false;

    async function commitAttempt(candidate, saveOptions, shouldSnapshot) {
      const previousChecksum = checksum(lastState), candidateChecksum = checksum(candidate);
      const existingSnapshots = shouldSnapshot ? await readRecentRecords(database, 'snapshots') : [];
      const transactionStores = [...ENTITY_STORES, 'settings', 'meta', ...(shouldSnapshot ? ['snapshots'] : [])];
      const transaction = database.transaction(transactionStores, 'readwrite');
      const completed = transactionDone(transaction);
      const metaStore = transaction.objectStore('meta');
      let currentMeta;
      try { currentMeta = await requestResult(metaStore.get('state')); }
      catch (error) { await completed.catch(() => {}); throw error; }
      const expectedRevision = revision;
      const concurrentChange = currentMeta && (
        Number(currentMeta.revision || 0) !== expectedRevision
        || String(currentMeta.databaseId || '') !== databaseId
        || String(currentMeta.checksum || '') !== previousChecksum
      );
      if (!saveOptions.force && concurrentChange) {
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

      let snapshotWrite = null;
      if (shouldSnapshot) {
        const snapshotStore = transaction.objectStore('snapshots');
        const removeCount = Math.max(0, existingSnapshots.length - SNAPSHOT_LIMIT + 1);
        existingSnapshots.slice(0, removeCount).forEach(snapshot => snapshotStore.delete(snapshot.id));
        snapshotWrite = requestResult(snapshotStore.put({
          id: uniqueId('snapshot'),
          createdAt: new Date().toISOString(),
          reason: String(saveOptions.reason || 'automatic').slice(0, 80),
          appVersion: options.appVersion,
          dataVersion: options.dataVersion,
          databaseId,
          revision,
          counts: counts(lastState),
          checksum: previousChecksum,
          state: clone(lastState)
        }));
      }

      const nextRevision = Number(currentMeta?.revision || revision || 0) + 1;
      const nextDatabaseId = String(currentMeta?.databaseId || databaseId || uniqueId('database'));
      const updatedAt = new Date().toISOString();
      const nextMeta = {
        id: 'state',
        databaseVersion: DATABASE_VERSION,
        dataVersion: options.dataVersion,
        appVersion: options.appVersion,
        databaseId: nextDatabaseId,
        revision: nextRevision,
        createdAt: currentMeta?.createdAt || new Date().toISOString(),
        updatedAt,
        counts: counts(candidate),
        checksum: candidateChecksum
      };
      inheritLineageMeta(nextMeta, currentMeta);
      if (!currentMeta && expectedRevision === 0) metaStore.delete('bootstrap');
      metaStore.put(nextMeta);
      if (snapshotWrite) {
        try { await snapshotWrite; }
        catch (error) {
          await completed.catch(() => {});
          if (error?.name === 'QuotaExceededError') throw storageError('SNAPSHOT_QUOTA_EXCEEDED', 'snapshot', error);
          throw error;
        }
      }
      await completed;
      lastState = clone(candidate); revision = nextRevision; databaseId = nextDatabaseId;

      let mirrorOk = true;
      try {
        options.localStorage?.setItem?.(options.legacyKey, JSON.stringify(candidate));
        writeLegacyMeta(options, candidate, 'indexeddb', updatedAt, revision, {
          baseRevision: revision,
          baseChecksum: candidateChecksum,
          databaseId
        });
      }
      catch (error) {
        mirrorOk = false;
        await appendDiagnostic(database, options, 'LEGACY_MIRROR_FAILED', 'mirror', error, candidate, { revision });
      }
      return { ok: true, mode: 'indexeddb', revision, mirrorOk, snapshotOk: true, counts: counts(candidate) };
    }

    async function commit(nextState, saveOptions = {}) {
      if (closed) throw storageError('DATABASE_CLOSED', 'save');
      const candidate = validate(options, nextState);
      const changed = checksum(lastState) !== checksum(candidate);
      const shouldSnapshot = saveOptions.snapshot !== false && changed && Boolean(lastState);
      const snapshotSource = shouldSnapshot ? clone(lastState) : null;
      try { return await commitAttempt(candidate, saveOptions, shouldSnapshot); }
      catch (error) {
        if (!shouldSnapshot || error?.code !== 'SNAPSHOT_QUOTA_EXCEEDED' || saveOptions.requireSnapshot === true) throw error;
        const result = await commitAttempt(candidate, { ...saveOptions, snapshot: false }, false);
        await appendDiagnostic(database, options, 'SNAPSHOT_SKIPPED_QUOTA', 'snapshot', error.cause || error, candidate, {
          revision: result.revision,
          snapshotCounts: counts(snapshotSource)
        });
        return { ...result, snapshotOk: false };
      }
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
      return (await validSnapshots(database, options)).map(({ snapshot }) => ({
        id: snapshot.id,
        createdAt: snapshot.createdAt,
        reason: snapshot.reason,
        counts: snapshot.counts
      }));
    }

    async function restoreSnapshot(id = '', restoreOptions = {}) {
      await queue;
      const snapshots = await validSnapshots(database, options);
      const selected = id ? snapshots.find(item => item.snapshot.id === id) : snapshots[0];
      if (!selected) throw storageError('SNAPSHOT_NOT_FOUND', 'restore');
      const state = clone(selected.state);
      const restoreSafetyId = String(restoreOptions.restoreSafetyId || '').slice(0, 100);
      if (restoreSafetyId) state.settings = { ...(state.settings || {}), restoreSafetyId };
      await save(state, { reason: 'restore-automatic-snapshot', snapshot: true, requireSnapshot: true });
      return clone(state);
    }

    async function recoveryList() {
      await queue;
      return (await readRecentRecords(database, 'recoveries')).reverse().map(record => ({
        id: record.id,
        createdAt: record.createdAt,
        reason: record.reason,
        errorCode: record.errorCode,
        dataVersion: record.dataVersion,
        sourceRevision: record.sourceRevision,
        counts: record.counts
      }));
    }

    async function diagnosticsReport(storageEstimate = {}) {
      await queue;
      const verification = await verify().catch(error => ({ ok: false, code: error.code || error.message }));
      const snapshots = await snapshotList().catch(() => []);
      const recoveries = await recoveryList().catch(() => []);
      const logs = (await readRecentRecords(database, 'diagnostics').catch(() => [])).slice(-DIAGNOSTIC_LIMIT);
      return {
        app: 'mon-agenda-prothesiste-diagnostic',
        exportedAt: new Date().toISOString(),
        appVersion: options.appVersion,
        dataVersion: options.dataVersion,
        storage: { mode: 'indexeddb', database: DATABASE_NAME, databaseVersion: DATABASE_VERSION, usage: Number(storageEstimate.usage || 0), quota: Number(storageEstimate.quota || 0) },
        verification,
        snapshots,
        recoveries,
        logs
      };
    }

    async function recordError(error, stage = 'application', state = lastState) {
      await appendDiagnostic(database, options, error?.code || error?.name || 'APPLICATION_ERROR', stage, error, state, { revision });
    }

    return {
      mode: 'indexeddb', save, verify, snapshotList, restoreSnapshot, recoveryList, diagnosticsReport, recordError,
      getState: () => clone(lastState),
      close: () => { closed = true; database.close(); }
    };
  }

  async function writeInitialDatabase(database, options, state, reason, context = {}) {
    if (context.preserveAsSnapshot) {
      return replaceDatabaseState(database, options, state, reason, {
        kind: 'migration',
        preserveAsSnapshot: context.preserveAsSnapshot,
        snapshotReason: 'before-local-storage-migration',
        migrationDate: options.migrationDate,
        migrationSource: context.migrationSource
      });
    }
    const empty = { version: options.dataVersion, clients: [], appointments: [], blocks: [], expenses: [], settings: {} };
    const adapter = createDatabaseAdapter(database, options, empty, { revision: 0 });
    const saveResult = await adapter.save(state, { snapshot: false, reason });
    const stored = await readDatabaseState(database, options.startupTimeoutMs);
    const verified = verifyStoredState(options, stored);
    if (checksum(verified) !== checksum(state)) throw storageError('MIGRATION_VERIFICATION_FAILED', 'migration');
    return { adapter, state: verified, meta: stored.meta, mirrorOk: saveResult.mirrorOk };
  }

  async function replaceDatabaseState(database, options, state, reason, context = {}) {
    const candidate = validate(options, state), updatedAt = new Date().toISOString();
    if (checksum(validate(options, candidate)) !== checksum(candidate)) throw storageError('INVALID_STATE', context.kind || 'validation');
    const quarantine = context.quarantineState ? quarantineRecord(
      options,
      context.quarantineState,
      context.expectedMeta || null,
      reason,
      context.error
    ) : null;
    if (quarantine) {
      quarantine.replacementSource = String(context.candidateSource || reason || 'recovery-candidate').slice(0, 80);
      quarantine.replacementChecksum = checksum(candidate);
      quarantine.replacementCounts = counts(candidate);
    }
    const existingRecoveries = quarantine ? await readRecentRecords(database, 'recoveries', options.startupTimeoutMs) : [];
    const existingSnapshots = context.preserveAsSnapshot ? await readRecentRecords(database, 'snapshots', options.startupTimeoutMs) : [];
    const transactionStores = [
      ...ENTITY_STORES,
      'settings',
      'meta',
      ...(quarantine ? ['recoveries'] : []),
      ...(context.preserveAsSnapshot ? ['snapshots'] : [])
    ];
    const transaction = database.transaction(transactionStores, 'readwrite');
    const completed = transactionDone(transaction);
    const metaStore = transaction.objectStore('meta');
    let currentMeta;
    try { currentMeta = await requestResult(metaStore.get('state')); }
    catch (error) { await completed.catch(() => {}); throw error; }
    const hasExpectedMeta = Object.prototype.hasOwnProperty.call(context, 'expectedMeta');
    const expectedRevision = Number(context.expectedMeta?.revision);
    const expectedRevisionValid = Number.isSafeInteger(expectedRevision) && expectedRevision >= 1;
    const metadataMatches = !hasExpectedMeta
      || (expectedRevisionValid
        ? sameDatabaseMeta(currentMeta, context.expectedMeta)
        : exactStoredValue(currentMeta, context.expectedMeta));
    if (!metadataMatches) {
      try { transaction.abort(); } catch {}
      await completed.catch(() => {});
      throw storageError('CONCURRENT_CHANGE', 'recovery');
    }
    const currentRevision = Number(currentMeta?.revision);
    const resetLineage = Boolean(currentMeta) && (!Number.isSafeInteger(currentRevision) || currentRevision < 1);
    const nextDatabaseId = resetLineage
      ? uniqueId('database')
      : String(currentMeta?.databaseId || context.databaseId || uniqueId('database'));

    ENTITY_STORES.forEach(name => {
      const store = transaction.objectStore(name);
      store.clear();
      candidate[name].forEach((value, order) => store.put({ id: String(value.id), order, value: clone(value) }));
    });
    const settingsStore = transaction.objectStore('settings');
    settingsStore.clear(); settingsStore.put({ id: 'settings', value: clone(candidate.settings) });
    if (quarantine) {
      const recoveryStore = transaction.objectStore('recoveries');
      existingRecoveries.slice(0, Math.max(0, existingRecoveries.length - RECOVERY_LIMIT + 1)).forEach(record => recoveryStore.delete(record.id));
      recoveryStore.put(quarantine);
    }
    let preservedSnapshotId = '';
    if (context.preserveAsSnapshot) {
      const snapshotStore = transaction.objectStore('snapshots');
      const removeCount = Math.max(0, existingSnapshots.length - SNAPSHOT_LIMIT + 1);
      existingSnapshots.slice(0, removeCount).forEach(snapshot => snapshotStore.delete(snapshot.id));
      preservedSnapshotId = uniqueId('snapshot');
      const snapshotDataVersion = Number(context.preserveDataVersion || currentMeta?.dataVersion || context.preserveAsSnapshot.version || 0);
      const snapshotMigrationDate = String(context.migrationDate || options.migrationDate || '');
      snapshotStore.put({
        id: preservedSnapshotId,
        createdAt: updatedAt,
        reason: String(context.snapshotReason || 'before-data-migration').slice(0, 80),
        appVersion: String(currentMeta?.appVersion || options.appVersion),
        dataVersion: snapshotDataVersion,
        migrationDate: snapshotMigrationDate,
        databaseId: nextDatabaseId,
        revision: resetLineage ? 0 : Number(currentMeta?.revision || 0),
        counts: counts(context.preserveAsSnapshot),
        checksum: exactChecksum(context.preserveAsSnapshot),
        checksumKind: 'exact-json-v1',
        migrationContextChecksum: exactChecksum({ dataVersion: snapshotDataVersion, migrationDate: snapshotMigrationDate, state: context.preserveAsSnapshot }),
        state: clone(context.preserveAsSnapshot)
      });
    }
    const nextRevision = resetLineage ? 1 : Number(currentMeta?.revision || 0) + 1;
    const meta = {
      id: 'state', databaseVersion: DATABASE_VERSION, dataVersion: options.dataVersion,
      appVersion: options.appVersion, databaseId: nextDatabaseId, revision: nextRevision, createdAt: resetLineage ? updatedAt : (currentMeta?.createdAt || updatedAt), updatedAt,
      counts: counts(candidate), checksum: checksum(candidate)
    };
    if (context.kind === 'migration') {
      meta.migrationReason = String(reason || 'data-migration').slice(0, 80);
      const source = context.migrationSource || {};
      meta.migratedFromDataVersion = Number(currentMeta?.dataVersion || source.rawVersion || context.preserveAsSnapshot?.version || 0);
      meta.migratedFromChecksum = String(source.rawExactChecksum || source.rawChecksum || '');
      meta.migratedFromChecksumKind = source.rawExactChecksum ? 'exact-json-v1' : 'canonical-state-v1';
      meta.migratedFromRevision = Number(source.meta?.revision || 0);
      meta.migratedFromDatabaseId = String(source.meta?.databaseId || '');
      meta.migratedFromSource = String(source.source || source.meta?.source || 'indexeddb').slice(0, 40);
      meta.migratedFromLegacyKey = String(source.key || options.legacyReadKey || '').slice(0, 160);
      meta.migrationSnapshotId = preservedSnapshotId;
      meta.migrationDate = String(context.migrationDate || options.migrationDate || '');
    } else {
      meta.recoveryReason = String(reason || 'read-recovery').slice(0, 80);
      if (quarantine) meta.quarantineId = quarantine.id;
      if (context.supersededLegacy) {
        const source = context.supersededLegacy;
        meta.supersededLegacyChecksum = String(source.rawExactChecksum || source.rawChecksum || '');
        meta.supersededLegacyChecksumKind = source.rawExactChecksum ? 'exact-json-v1' : 'canonical-state-v1';
        meta.supersededLegacyRevision = Number(source.meta?.revision || 0);
        meta.supersededLegacyDatabaseId = String(source.meta?.databaseId || '');
        meta.supersededLegacySource = String(source.meta?.source || source.source || 'legacy').slice(0, 40);
        meta.supersededLegacyDataVersion = Number(source.meta?.dataVersion || source.rawState?.version || 0);
        meta.supersededLegacyKey = String(source.key || options.legacyReadKey || '').slice(0, 160);
        meta.supersededLegacySnapshotId = preservedSnapshotId;
      }
    }
    metaStore.delete('bootstrap');
    metaStore.put(meta);
    await completed;
    const stored = await readDatabaseState(database, options.startupTimeoutMs);
    const verified = verifyStoredState(options, stored);
    if (checksum(verified) !== checksum(candidate)) throw storageError('MIGRATION_VERIFICATION_FAILED', context.kind || 'verification');
    let mirrorOk = true;
    try {
      options.localStorage?.setItem?.(options.legacyKey, JSON.stringify(verified));
      writeLegacyMeta(options, verified, 'indexeddb', updatedAt, nextRevision, {
        baseRevision: nextRevision,
        baseChecksum: checksum(verified),
        databaseId: nextDatabaseId
      });
    } catch (error) {
      mirrorOk = false;
      await appendDiagnostic(database, options, 'LEGACY_MIRROR_FAILED', 'mirror', error, verified, { revision: nextRevision });
    }
    return { adapter: createDatabaseAdapter(database, options, verified, stored.meta), state: verified, mirrorOk, quarantineId: quarantine?.id || '' };
  }

  async function replaceUnreadableDatabase(database, options, state, reason, context = {}) {
    return replaceDatabaseState(database, options, state, reason, { ...context, kind: 'recovery' });
  }

  async function migrateDatabaseState(database, options, inspection, targetState = inspection.state, reason = 'data-version-upgrade', migrationSource = null) {
    return replaceDatabaseState(database, options, targetState, reason, {
      kind: 'migration',
      expectedMeta: inspection.meta,
      preserveAsSnapshot: inspection.rawState,
      snapshotReason: 'before-data-migration',
      migrationDate: options.migrationDate,
      migrationSource: migrationSource || { rawChecksum: inspection.rawChecksum, rawExactChecksum: inspection.rawExactChecksum, rawVersion: Number(inspection.rawState?.version || inspection.meta?.dataVersion || 0), meta: { ...inspection.meta, source: 'indexeddb' } }
    });
  }

  async function recoverFromState(userOptions, recoveryState) {
    const options = {
      indexedDB: userOptions.indexedDB || globalThis.indexedDB,
      localStorage: userOptions.localStorage || globalThis.localStorage,
      legacyKey: userOptions.legacyKey,
      legacyReadKey: String(userOptions.legacyReadKey || userOptions.legacyKey || ''),
      legacyRawKey: String(userOptions.legacyRawKey || ''),
      legacyRawState: userOptions.legacyRawState === null || userOptions.legacyRawState === undefined ? null : clone(userOptions.legacyRawState),
      legacyState: clone(recoveryState),
      legacyFallbackAllowed: false,
      legacyEvidence: typeof userOptions.legacyEvidence === 'boolean' ? userOptions.legacyEvidence : true,
      legacySource: String(userOptions.legacySource || 'user-authorised-recovery'),
      legacyReadUncertain: userOptions.legacyReadUncertain === true,
      validateState: userOptions.validateState,
      appVersion: userOptions.appVersion,
      dataVersion: Number(userOptions.dataVersion || 0),
      migrationDate: validDateKey(userOptions.migrationDate) ? String(userOptions.migrationDate) : '',
      startupTimeoutMs: Number.isFinite(Number(userOptions.startupTimeoutMs)) && Number(userOptions.startupTimeoutMs) >= 1
        ? Number(userOptions.startupTimeoutMs)
        : DEFAULT_STARTUP_TIMEOUT_MS
    };
    const candidate = validate(options, recoveryState);
    const protectedLegacy = inspectLegacyPairForReplacement(options);
    if (protectedLegacy.status === 'uncertain') throw storageError('RECOVERY_REQUIRED', 'manual-recovery', storageError('AMBIGUOUS_STORAGE_SOURCES', 'legacy-read', protectedLegacy.error));
    const protectedLegacyValid = protectedLegacy.status === 'valid' || protectedLegacy.status === 'supplied-valid';
    if (!options.indexedDB?.open) throw storageError('RECOVERY_REQUIRED', 'manual-recovery');
    let opened;
    try { opened = await openDatabase(options.indexedDB, options.startupTimeoutMs); }
    catch (error) { throw storageError('RECOVERY_REQUIRED', 'manual-recovery', error); }
    const { database, createdFresh } = opened;
    let stored = null, observedState = null, currentMeta = null, readError = null;
    try {
      stored = await readDatabaseState(database, options.startupTimeoutMs);
      observedState = stored?.state || null;
      currentMeta = stored?.meta || null;
    } catch (firstError) {
      try {
        if (firstError?.code === 'DATABASE_READ_TIMEOUT') throw firstError;
        stored = await readDatabaseState(database, options.startupTimeoutMs);
        observedState = stored?.state || null;
        currentMeta = stored?.meta || null;
      } catch (error) {
        readError = error;
        observedState = error.observedState || null;
        currentMeta = await readDatabaseMeta(database, options.startupTimeoutMs).catch(() => null);
      }
    }
    try {
      if (readError && !observedState) throw storageError('DATABASE_READ_FAILED', 'manual-recovery', readError);
      let protectedMatchesObserved = Boolean(observedState && protectedLegacyValid && protectedLegacy.rawChecksum === checksum(observedState));
      let candidateMatchesObserved = false;
      if (observedState) {
        try { candidateMatchesObserved = checksum(candidate) === checksum(validate(options, observedState)); }
        catch {}
      }
      if (observedState && protectedLegacyValid && !protectedMatchesObserved) {
        try { protectedMatchesObserved = protectedLegacy.stateChecksum === checksum(validate(options, observedState)); }
        catch {}
      }
      const freshSuppliedRecovery = !stored && createdFresh && protectedLegacy.status === 'supplied-valid';
      if (protectedLegacyValid
        && protectedLegacy.stateChecksum !== checksum(candidate)
        && !protectedMatchesObserved
        && !candidateMatchesObserved
        && !freshSuppliedRecovery) {
        throw storageError('AMBIGUOUS_STORAGE_SOURCES', 'manual-recovery');
      }
      const currentRevision = Number(currentMeta?.revision);
      const recoveryStartsNewLineage = !currentMeta
        || !Number.isSafeInteger(currentRevision) || currentRevision < 1
        || !String(currentMeta?.databaseId || '');
      const supersededLegacy = protectedLegacyValid && (recoveryStartsNewLineage
        || protectedLegacy.rawChecksum !== checksum(candidate)
        || Number(protectedLegacy.meta?.dataVersion || protectedLegacy.rawState?.version || 0) !== options.dataVersion)
        ? protectedLegacy
        : null;
      if (!stored && createdFresh) {
        if (supersededLegacy) {
          const replaced = await replaceUnreadableDatabase(database, options, candidate, 'user-authorised-recovery', {
            expectedMeta: undefined,
            preserveAsSnapshot: supersededLegacy.rawState,
            preserveDataVersion: Number(supersededLegacy.meta?.dataVersion || supersededLegacy.rawState?.version || 0),
            snapshotReason: 'before-user-recovery-legacy-source',
            migrationDate: options.migrationDate,
            supersededLegacy,
            candidateSource: 'user-backup'
          });
          return { storage: replaced.adapter, state: replaced.state, mode: 'indexeddb', warning: mirrorWarning('', replaced.mirrorOk), migrated: false, recovered: true };
        }
        const created = await writeInitialDatabase(database, options, candidate, 'user-authorised-recovery');
        return { storage: created.adapter, state: created.state, mode: 'indexeddb', warning: mirrorWarning('', created.mirrorOk), migrated: false, recovered: true };
      }
      const replaced = await replaceUnreadableDatabase(database, options, candidate, 'user-authorised-recovery', {
        expectedMeta: currentMeta,
        quarantineState: observedState,
        candidateSource: 'user-backup',
        preserveAsSnapshot: supersededLegacy ? supersededLegacy.rawState : null,
        preserveDataVersion: supersededLegacy ? Number(supersededLegacy.meta?.dataVersion || supersededLegacy.rawState?.version || 0) : 0,
        snapshotReason: 'before-user-recovery-legacy-source',
        migrationDate: options.migrationDate,
        supersededLegacy,
        error: readError || storageError('USER_AUTHORISED_RECOVERY', 'manual-recovery')
      });
      const warning = mirrorWarning(observedState
        ? 'La sauvegarde choisie a remplacé la base après conservation de l’état précédent.'
        : 'La sauvegarde choisie a remplacé la base après confirmation.', replaced.mirrorOk);
      return { storage: replaced.adapter, state: replaced.state, mode: 'indexeddb', warning, migrated: false, recovered: true };
    } catch (error) {
      database.close();
      throw storageError('RECOVERY_REQUIRED', 'manual-recovery', error);
    }
  }

  async function initialise(userOptions) {
    const options = {
      indexedDB: userOptions.indexedDB || globalThis.indexedDB,
      localStorage: userOptions.localStorage || globalThis.localStorage,
      legacyKey: userOptions.legacyKey,
      legacyReadKey: String(userOptions.legacyReadKey || userOptions.legacyKey || ''),
      legacyRawKey: String(userOptions.legacyRawKey || ''),
      legacyRawState: userOptions.legacyRawState === null || userOptions.legacyRawState === undefined ? null : clone(userOptions.legacyRawState),
      legacyState: clone(userOptions.legacyState),
      legacyFallbackAllowed: userOptions.legacyFallbackAllowed !== false,
      legacyEvidence: typeof userOptions.legacyEvidence === 'boolean' ? userOptions.legacyEvidence : undefined,
      legacySource: String(userOptions.legacySource || ''),
      legacyReadUncertain: userOptions.legacyReadUncertain === true,
      validateState: userOptions.validateState,
      appVersion: userOptions.appVersion,
      dataVersion: Number(userOptions.dataVersion || 0),
      migrationDate: validDateKey(userOptions.migrationDate) ? String(userOptions.migrationDate) : '',
      startupTimeoutMs: Number.isFinite(Number(userOptions.startupTimeoutMs)) && Number(userOptions.startupTimeoutMs) >= 1
        ? Number(userOptions.startupTimeoutMs)
        : DEFAULT_STARTUP_TIMEOUT_MS
    };
    const legacyState = validate(options, options.legacyState);
    const legacyCandidate = inspectLegacyCandidate(options, legacyState);
    if (options.legacyReadUncertain || legacyCandidate.readUncertain) {
      throw storageError('RECOVERY_REQUIRED', 'startup', storageError('LEGACY_READ_UNCERTAIN', 'legacy-read'));
    }
    if (!options.indexedDB?.open) {
      throw storageError('RECOVERY_REQUIRED', 'startup', storageError('INDEXEDDB_UNAVAILABLE', 'open'));
    }

    let opened;
    try { opened = await openDatabase(options.indexedDB, options.startupTimeoutMs); }
    catch (error) {
      throw storageError('RECOVERY_REQUIRED', 'startup', error);
    }
    const { database, createdFresh } = opened;

    let stored;
    try { stored = await readDatabaseState(database, options.startupTimeoutMs); }
    catch (firstError) {
      if (firstError?.code === 'DATABASE_READ_TIMEOUT') {
        database.close();
        throw storageError('RECOVERY_REQUIRED', 'startup', firstError);
      }
      await appendDiagnostic(database, options, 'DATABASE_READ_FAILED', 'startup-first-read', firstError, legacyState);
      try { stored = await readDatabaseState(database, options.startupTimeoutMs); }
      catch (retryError) {
        await appendDiagnostic(database, options, 'DATABASE_READ_FAILED', 'startup-second-read', retryError, legacyState);
        database.close();
        throw storageError('RECOVERY_REQUIRED', 'startup', retryError);
      }
    }
    if (!stored) {
      let bootstrapFootprint;
      try { bootstrapFootprint = await readBootstrapFootprint(database, options.startupTimeoutMs); }
      catch (error) {
        await appendDiagnostic(database, options, 'BOOTSTRAP_CHECK_FAILED', 'startup', error, legacyState);
        database.close();
        throw storageError('RECOVERY_REQUIRED', 'startup', error);
      }
      const legacySourceAmbiguous = options.legacyReadUncertain || (options.legacyEvidence === true && !legacyCandidate.available);
      const safeBootstrap = !legacySourceAmbiguous && !bootstrapFootprint.hasRecoveryHistory && (createdFresh || bootstrapFootprint.pending);
      if (!safeBootstrap) {
        const error = storageError('DATABASE_METADATA_MISSING', 'startup');
        await appendDiagnostic(database, options, error.code, error.stage, error, legacyState);
        database.close();
        throw storageError('RECOVERY_REQUIRED', 'startup', error);
      }
      try {
        const legacySourceVersion = Number(legacyCandidate.rawState?.version || legacyCandidate.meta?.dataVersion || 0);
        // Une base neuve ouvre nécessairement une nouvelle lignée. Même si le
        // miroir contient déjà un état v15 identique, sa provenance doit être
        // attestée afin qu’un échec durable de réécriture du miroir ne crée pas
        // une ambiguïté après les sauvegardes suivantes.
        const preserveLegacySource = legacyCandidate.available && legacyCandidate.rawPresent;
        const created = await writeInitialDatabase(database, options, legacyState, 'migration-local-storage', preserveLegacySource ? {
          preserveAsSnapshot: legacyCandidate.rawState,
          migrationSource: {
            rawChecksum: legacyCandidate.rawChecksum,
            rawExactChecksum: legacyCandidate.rawExactChecksum,
            rawVersion: legacySourceVersion,
            key: legacyCandidate.key,
            source: legacyCandidate.metadataValid ? legacyCandidate.meta.source : 'local-bootstrap',
            meta: legacyCandidate.meta || { revision: 0, databaseId: '' }
          }
        } : {});
        return { storage: created.adapter, state: created.state, mode: 'indexeddb', warning: mirrorWarning('', created.mirrorOk), migrated: legacyCandidate.available, recovered: false };
      } catch (error) {
        await appendDiagnostic(database, options, error.code || 'MIGRATION_FAILED', error.stage || 'migration', error, legacyState);
        database.close();
        throw storageError('RECOVERY_REQUIRED', 'migration', error);
      }
    }

    let inspection;
    try {
      inspection = inspectStoredState(options, stored);
    } catch (error) {
      await appendDiagnostic(database, options, error.code || 'INTEGRITY_CHECK_FAILED', error.stage || 'startup', error, stored.state || legacyState);
      const legacyIsLinked = linkedLegacyCandidate(legacyCandidate, stored.meta);
      if (legacyIsLinked) {
        try {
          const replaced = await replaceUnreadableDatabase(database, options, legacyCandidate.state, 'linked-legacy-recovery', {
            expectedMeta: stored.meta,
            quarantineState: stored.state,
            preserveAsSnapshot: legacyCandidate.rawChecksum !== legacyCandidate.checksum ? legacyCandidate.rawState : null,
            snapshotReason: 'before-linked-legacy-migration',
            error
          });
          const warning = mirrorWarning(`La base principale était anormale. La copie liée à la révision ${Number(stored.meta.revision || 0)} a été récupérée et l’état remplacé a été conservé.`, replaced.mirrorOk);
          return { storage: replaced.adapter, state: replaced.state, mode: 'indexeddb', warning, migrated: false, recovered: true, startupError: error };
        } catch (recoveryError) {
          await appendDiagnostic(database, options, 'LINKED_LEGACY_RECOVERY_FAILED', 'startup', recoveryError, legacyState);
        }
      }
      const recovered = options.legacyReadUncertain || legacyCandidate.available ? null : await latestValidSnapshot(database, options, stored.meta, options.startupTimeoutMs).catch(() => null);
      if (recovered) {
        try {
          const replaced = await replaceUnreadableDatabase(database, options, recovered.state, 'snapshot-after-integrity-failure', {
            expectedMeta: stored.meta,
            quarantineState: stored.state,
            error
          });
          const warning = mirrorWarning(`La base principale était anormale. La copie automatique du ${new Date(recovered.snapshot.createdAt).toLocaleString('fr-FR')} a été récupérée et l’état remplacé a été conservé.`, replaced.mirrorOk);
          return { storage: replaced.adapter, state: replaced.state, mode: 'indexeddb', warning, migrated: false, recovered: true, startupError: error };
        } catch (recoveryError) {
          await appendDiagnostic(database, options, 'SNAPSHOT_RECOVERY_FAILED', 'startup', recoveryError, legacyState);
        }
      }
      database.close();
      throw storageError('RECOVERY_REQUIRED', 'startup', error);
    }

    const divergentLegacy = legacyCandidate.available
      && (legacyCandidate.rawChecksum !== stored.meta.checksum
        || legacyCandidate.checksum !== checksum(inspection.state));
    const safeFallback = legacyForkCanReconcile(legacyCandidate, stored.meta);
    const sameExplicitDatabase = Boolean(legacyCandidate.metadataValid
      && legacyCandidate.meta.databaseId
      && stored.meta.databaseId
      && legacyCandidate.meta.databaseId === stored.meta.databaseId);
    const canonicalMirrorKeys = ['version', 'clients', 'appointments', 'blocks', 'expenses', 'settings'];
    const rawMirrorKeys = legacyCandidate.rawState && typeof legacyCandidate.rawState === 'object' && !Array.isArray(legacyCandidate.rawState)
      ? Object.keys(legacyCandidate.rawState)
      : [];
    const canonicalIndexedMirrorShape = rawMirrorKeys.length === canonicalMirrorKeys.length
      && canonicalMirrorKeys.every(key => rawMirrorKeys.includes(key));
    const candidateRevision = Number(legacyCandidate.meta?.revision);
    const databaseRevision = Number(stored.meta.revision);
    const staleIndexedMirror = Boolean(divergentLegacy
      && legacyCandidate.metadataValid
      && legacyCandidate.meta.source === 'indexeddb'
      && canonicalIndexedMirrorShape
      && sameExplicitDatabase
      && Number.isSafeInteger(candidateRevision)
      && candidateRevision >= 0
      && Number.isSafeInteger(databaseRevision)
      && databaseRevision >= 0
      && candidateRevision < databaseRevision);
    let exactPreMigrationMirror = Boolean(divergentLegacy && exactMigrationSource(legacyCandidate, stored.meta));
    if (!exactPreMigrationMirror && divergentLegacy && legacyCandidate.rawPresent && legacyCandidate.rawStateValid
      && stored.meta.migratedFromSource === 'local-bootstrap' && stored.meta.migrationSnapshotId) {
      const migrationSnapshots = await validSnapshots(database, options, options.startupTimeoutMs).catch(() => []);
      const sourceSnapshot = migrationSnapshots.find(item => item.snapshot.id === stored.meta.migrationSnapshotId);
      exactPreMigrationMirror = Boolean(sourceSnapshot && exactStoredValue(sourceSnapshot.rawState, legacyCandidate.rawState));
    }
    const exactSupersededMirror = Boolean(divergentLegacy && exactSupersededLegacySource(legacyCandidate, stored.meta));
    if (divergentLegacy && !safeFallback && !staleIndexedMirror && !exactPreMigrationMirror && !exactSupersededMirror) {
      database.close();
      throw storageError('RECOVERY_REQUIRED', 'startup', storageError('AMBIGUOUS_STORAGE_SOURCES', 'startup'));
    }

    if (inspection.migrated) {
      try {
        const targetState = safeFallback ? legacyCandidate.state : inspection.state;
        const reason = safeFallback ? 'data-version-upgrade-with-legacy-fallback' : 'data-version-upgrade';
        const migrationSource = safeFallback
          ? { rawChecksum: legacyCandidate.rawChecksum, rawExactChecksum: legacyCandidate.rawExactChecksum, rawVersion: Number(legacyCandidate.rawState?.version || legacyCandidate.meta?.dataVersion || 0), key: legacyCandidate.key, source: legacyCandidate.source, meta: legacyCandidate.meta }
          : { rawChecksum: inspection.rawChecksum, rawExactChecksum: inspection.rawExactChecksum, rawVersion: Number(inspection.rawState?.version || inspection.meta?.dataVersion || 0), meta: { ...inspection.meta, source: 'indexeddb' } };
        const migrated = await migrateDatabaseState(database, options, inspection, targetState, reason, migrationSource);
        const warning = mirrorWarning(safeFallback
          ? 'Les données d’une ancienne copie de secours liée ont été migrées vers la nouvelle version.'
          : 'Les données ont été contrôlées puis migrées vers la nouvelle version.', migrated.mirrorOk);
        return { storage: migrated.adapter, state: migrated.state, mode: 'indexeddb', warning, migrated: true, recovered: safeFallback };
      } catch (error) {
        await appendDiagnostic(database, options, 'DATA_MIGRATION_FAILED', 'migration', error, inspection.rawState);
        database.close();
        throw storageError('RECOVERY_REQUIRED', 'migration', error);
      }
    }

    const adapter = createDatabaseAdapter(database, options, inspection.state, stored.meta);
    if (safeFallback) {
      try {
        const saveResult = await adapter.save(legacyCandidate.state, { reason: 'reconcile-legacy-fallback', requireSnapshot: true });
        const warning = mirrorWarning('Les données d’une ancienne copie de secours liée ont été réintégrées dans la base sécurisée.', saveResult.mirrorOk);
        return { storage: adapter, state: legacyCandidate.state, mode: 'indexeddb', warning, migrated: false, recovered: true };
      } catch (error) {
        await appendDiagnostic(database, options, 'LEGACY_RECONCILIATION_FAILED', 'startup', error, legacyCandidate.state);
        database.close();
        throw storageError('RECOVERY_REQUIRED', 'startup', error);
      }
    }
    const staleMirrorWarning = exactSupersededMirror
      ? 'La copie locale liée a déjà été remplacée par la récupération choisie. La base vérifiée reste active.'
      : staleIndexedMirror || exactPreMigrationMirror
        ? 'La copie locale liée est plus ancienne que la base principale. La base vérifiée reste active.'
        : '';
    return { storage: adapter, state: inspection.state, mode: 'indexeddb', warning: staleMirrorWarning, migrated: false, recovered: false };
  }

  globalThis.AgendaStorage = Object.freeze({
    initialise,
    recoverFromState,
    checksum,
    counts,
    constants: Object.freeze({ databaseName: DATABASE_NAME, databaseVersion: DATABASE_VERSION, snapshotLimit: SNAPSHOT_LIMIT })
  });
})();
