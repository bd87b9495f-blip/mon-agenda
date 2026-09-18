import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const storageSource = fs.readFileSync(new URL('../storage.js', import.meta.url), 'utf8');

function harness() {
  const elements = new Map(), records = new Map(), writes = [], alerts = [], confirmations = [];
  let sequence = 0;
  const element = selector => {
    if (!elements.has(selector)) {
      const classes = new Set();
      elements.set(selector, {
        value: '', innerHTML: '', textContent: '', open: false, hidden: false, disabled: false, dataset: {},
        classList: {
          add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
          toggle(name, active) { if (active) classes.add(name); else classes.delete(name); }
        },
        showModal() { this.open = true; }, close() { this.open = false; },
        querySelector() { return null; }, setAttribute() {}, removeAttribute() {}
      });
    }
    return elements.get(selector);
  };
  const context = {
    console, Intl, Date, Math, JSON, Map, Set, Promise, structuredClone, setTimeout, clearTimeout,
    crypto: { randomUUID: () => `recovery-test-${++sequence}` },
    localStorage: {
      getItem: key => records.get(key) ?? null,
      setItem(key, value) { records.set(key, String(value)); writes.push(key); },
      removeItem(key) { records.delete(key); writes.push(key); }
    },
    navigator: { storage: {} },
    document: { body: { dataset: {} }, querySelector: element, querySelectorAll: () => [] },
    window: { confirm(message) { confirmations.push(message); return context.confirmAnswer; } },
    confirmAnswer: true,
    testAlert: message => alerts.push(message)
  };
  context.globalThis = context;
  vm.runInNewContext(storageSource, context);
  const cut = source.indexOf("\n  document.addEventListener('click'");
  assert.ok(cut > 0);
  vm.runInNewContext(source.slice(0, cut) + `
    showAppAlert = message => globalThis.testAlert(message);
    render = () => {};
    clearAllFormDrafts = () => {};
    globalThis.hooks = {
      updateStorageStatus, verifySecureStorage, importRecoveryData,
      openAutomaticSnapshotChooser, restoreAutomaticSnapshot, requestDialogClose,
      setAdapter: adapter => { storageAdapter = adapter; },
      setState: state => { app.state = migrateStoredState(state); lastCommittedState = cloneState(app.state); },
      state: () => cloneState(app.state),
      makeBackup: () => makeBackupPayload(app.state),
      failRendering: () => { render = () => { throw new Error('RENDER_FAILED'); }; }
    };
  })();`, context);
  context.hooks.setState({ version: 15, clients: [{ id: 'current', name: 'État actuel' }], appointments: [], blocks: [], expenses: [], settings: {} });
  return { hooks: context.hooks, context, element, records, writes, alerts, confirmations };
}

const verification = { ok: true, mode: 'indexeddb', counts: { appointments: 12, clients: 3 } };
const snapshots = Array.from({ length: 5 }, (_, index) => ({
  id: `snapshot-${index}`, createdAt: `2026-09-${18 - index}T12:30:00.000Z`,
  counts: { appointments: 10 + index, clients: 2 + index, blocks: index, expenses: 7 + index }
}));
function backupFile(data) {
  const text = JSON.stringify(data);
  return { size: Buffer.byteLength(text), text: async () => text };
}

test('une vérification impossible efface un ancien contrôle réussi', async () => {
  const h = harness();
  h.hooks.setAdapter({ verify: async () => verification, snapshotList: async () => snapshots });
  assert.equal(await h.hooks.updateStorageStatus(), true);
  assert.match(h.element('#secureStorageStatus').innerHTML, /contrôle réussi/);
  h.hooks.setAdapter({ verify: async () => { throw new Error('DB_UNAVAILABLE'); }, snapshotList: async () => snapshots });
  assert.equal(await h.hooks.updateStorageStatus(), false);
  assert.match(h.element('#secureStorageStatus').innerHTML, /Vérification impossible/);
  assert.doesNotMatch(h.element('#secureStorageStatus').innerHTML, /contrôle réussi/);
  assert.equal(h.element('#secureStorageStatus').classList.contains('warning'), true);
  assert.equal(h.element('#restoreAutomaticSnapshot').hidden, false, 'les copies valides restent accessibles si la base courante ne passe pas le contrôle');
});

test('un échec de l’estimation d’espace ne masque pas le contrôle réel de la base', async () => {
  const h = harness();
  h.context.navigator.storage.estimate = async () => { throw new Error('UNSUPPORTED'); };
  h.hooks.setAdapter({ verify: async () => verification, snapshotList: async () => snapshots });
  assert.equal(await h.hooks.updateStorageStatus(), true);
  assert.match(h.element('#secureStorageStatus').innerHTML, /contrôle réussi/);
  assert.match(h.element('#storageStatus').textContent, /non communiqué/);
});

test('le contrôle manuel publie son propre résultat une seule fois et gère même un journal indisponible', async () => {
  const h = harness();
  let checks = 0;
  h.hooks.setAdapter({ verify: async () => { checks += 1; return verification; }, snapshotList: async () => snapshots });
  await h.hooks.verifySecureStorage();
  assert.equal(checks, 1);
  assert.match(h.alerts.at(-1), /base est valide/);
  h.hooks.setAdapter({ verify: async () => { throw new Error('CORRUPTED'); }, recordError: async () => { throw new Error('DB_UNAVAILABLE'); } });
  await h.hooks.verifySecureStorage();
  assert.match(h.element('#secureStorageStatus').innerHTML, /Vérification impossible/);
  assert.match(h.alerts.at(-1), /anomalie/);
  assert.equal(h.element('#verifySecureStorage').disabled, false);
});

test('l’erreur des copies ne conserve pas une ancienne liste présentée comme disponible', async () => {
  const h = harness();
  h.hooks.setAdapter({ verify: async () => verification, snapshotList: async () => { throw new Error('READ_FAILED'); } });
  await h.hooks.updateStorageStatus();
  assert.match(h.element('#automaticSnapshotStatus').textContent, /ne peuvent pas être vérifiées/);
  assert.equal(h.element('#restoreAutomaticSnapshot').hidden, true);
});

test('la récupération distingue un fichier invalide d’un fichier valide bloqué par le quota', async () => {
  const h = harness();
  let recoveryCalls = 0;
  h.context.AgendaStorage = {
    ...h.context.AgendaStorage,
    recoverFromState: async () => {
      recoveryCalls += 1;
      throw Object.assign(new Error('RECOVERY_REQUIRED'), { cause: Object.assign(new Error('QUOTA'), { name: 'QuotaExceededError' }) });
    }
  };
  await h.hooks.importRecoveryData({ size: 2, text: async () => '{!' });
  assert.equal(recoveryCalls, 0);
  assert.match(h.alerts.at(-1), /JSON lisible/);
  const before = h.hooks.state();
  await h.hooks.importRecoveryData(backupFile(h.hooks.makeBackup()));
  assert.equal(recoveryCalls, 1);
  assert.match(h.alerts.at(-1), /fichier de sauvegarde est valide/);
  assert.match(h.alerts.at(-1), /manque d’espace/);
  assert.deepEqual(h.hooks.state(), before);
  assert.equal(h.element('#recoveryImportData').value, '');
});

test('une erreur d’affichage après récupération réussie n’accuse pas le fichier ni l’enregistrement', async () => {
  const h = harness();
  h.context.AgendaStorage = { ...h.context.AgendaStorage, recoverFromState: async (_options, state) => ({ state, storage: { mode: 'indexeddb' }, mode: 'indexeddb' }) };
  h.hooks.failRendering();
  await h.hooks.importRecoveryData(backupFile(h.hooks.makeBackup()));
  assert.match(h.alerts.at(-1), /sauvegarde a été enregistrée/);
  assert.match(h.alerts.at(-1), /Redémarre/);
});

test('le choix expose les cinq copies et leurs compteurs ; fermer ne modifie aucune donnée', async () => {
  const h = harness();
  h.hooks.setAdapter({ snapshotList: async () => snapshots });
  const before = h.hooks.state();
  assert.equal(await h.hooks.openAutomaticSnapshotChooser(), true);
  const html = h.element('#automaticSnapshotChoices').innerHTML;
  assert.equal((html.match(/type="radio"/g) || []).length, 5);
  assert.match(html, /snapshot-4/);
  assert.match(html, /14 rendez-vous · 6 clientes · 4 événements · 11 dépenses/);
  assert.match(html, /2026/);
  assert.equal(h.element('#automaticSnapshotDialog').open, true);
  h.hooks.requestDialogClose('automaticSnapshotDialog');
  assert.equal(h.element('#automaticSnapshotDialog').open, false);
  assert.equal(h.writes.length, 0);
  assert.deepEqual(h.hooks.state(), before);
});

test('la restauration utilise la copie choisie et protège l’état précédent avec le même identifiant', async () => {
  const h = harness();
  const previous = h.hooks.state(), restored = structuredClone(previous);
  restored.clients[0].name = 'Ancienne copie choisie';
  let requestedId, operationId;
  h.hooks.setAdapter({
    snapshotList: async () => snapshots,
    restoreSnapshot: async (id, options) => {
      requestedId = id; operationId = options.restoreSafetyId;
      return { ...restored, settings: { ...restored.settings, restoreSafetyId: operationId } };
    }
  });
  assert.equal(await h.hooks.restoreAutomaticSnapshot('snapshot-3'), true);
  assert.equal(requestedId, 'snapshot-3');
  assert.match(h.confirmations[0], /15 septembre 2026/);
  assert.equal(h.hooks.state().clients[0].name, 'Ancienne copie choisie');
  const safety = JSON.parse(h.records.get('nail-planner-before-restore-v15'));
  assert.equal(safety.restoreSafetyId, operationId);
  assert.equal(safety.state.clients[0].name, previous.clients[0].name);
});

test('annuler la confirmation ou sélectionner une copie disparue ne restaure jamais la dernière par défaut', async () => {
  const h = harness();
  let restores = 0;
  h.hooks.setAdapter({ snapshotList: async () => snapshots, restoreSnapshot: async () => { restores += 1; } });
  h.context.confirmAnswer = false;
  assert.equal(await h.hooks.restoreAutomaticSnapshot('snapshot-2'), false);
  h.context.confirmAnswer = true;
  assert.equal(await h.hooks.restoreAutomaticSnapshot('snapshot-disparue'), false);
  assert.equal(restores, 0);
  assert.equal(h.writes.length, 0);
  assert.match(h.alerts.at(-1), /n’est plus disponible/);
});
