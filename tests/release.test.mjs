import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const app = read('app.js');
const html = read('index.html');
const style = read('style.css');
const storage = read('storage.js');
const worker = read('sw.js');
const manifest = JSON.parse(read('manifest.webmanifest'));

function serviceWorkerHarness({ cacheNames = [], clientCount = 1, activeScriptUrl = 'https://agenda.test/app/sw.js?v=2026.14.0' } = {}) {
  const handlers = new Map();
  const openedCaches = [];
  const deletedCaches = [];
  const cachedRequests = [];
  const fetchedRequests = [];
  const clientQueries = [];
  let claimedClients = 0;
  let skipWaitingCount = 0;
  let windowClientCount = clientCount;
  const cache = {
    async match() { return undefined; },
    async put(request) { cachedRequests.push(request.url); }
  };
  const context = {
    console,
    Promise,
    Request,
    Response,
    Set,
    URL,
    clearTimeout,
    setTimeout,
    caches: {
      async open(name) { openedCaches.push(name); return cache; },
      async keys() { return [...cacheNames]; },
      async delete(name) { deletedCaches.push(name); return true; }
    },
    async fetch(request, options) {
      fetchedRequests.push({ url: request.url, options });
      return new Response('network', { status: 200 });
    },
    self: {
      location: new URL('https://agenda.test/app/sw.js?v=2026.15.2'),
      addEventListener(type, handler) { handlers.set(type, handler); },
      registration: { scope: 'https://agenda.test/app/', active: activeScriptUrl ? { scriptURL: activeScriptUrl } : null },
      clients: {
        async claim() { claimedClients += 1; },
        async matchAll(options) {
          clientQueries.push({ ...options });
          return Array.from({ length: windowClientCount }, (_, index) => ({ id: `client-${index + 1}`, url: `https://agenda.test/app/?window=${index + 1}` }));
        }
      },
      async skipWaiting() { skipWaitingCount += 1; }
    }
  };
  context.globalThis = context;
  vm.runInNewContext(`${worker}\nself.__testHooks = { shellResponse };`, context, { filename: 'sw.release-test.js' });
  return {
    shellResponse: context.self.__testHooks.shellResponse,
    activate: async () => {
      let completion;
      handlers.get('activate')({ waitUntil(promise) { completion = promise; } });
      await completion;
    },
    message: async (data, { withPort = true } = {}) => {
      let completion;
      let reply;
      const port = { postMessage(value) { reply = value; } };
      handlers.get('message')({
        data,
        ports: withPort ? [port] : [],
        waitUntil(promise) { completion = promise; }
      });
      await completion;
      return reply;
    },
    setClientCount(value) { windowClientCount = value; },
    result: () => ({
      openedCaches: [...openedCaches],
      deletedCaches: [...deletedCaches],
      cachedRequests: [...cachedRequests],
      fetchedRequests: [...fetchedRequests],
      clientQueries: [...clientQueries],
      skipWaitingCount,
      claimedClients
    })
  };
}

function applicationStartupHarness({ controllerBuild = '2026.15.2', clientCount = 1, messageChannel = true } = {}) {
  const pwaStart = app.indexOf('  function serviceWorkerBuild(');
  const pwaEnd = app.indexOf('\n  function registerServiceWorker()', pwaStart);
  const startup = app.match(/app\.ready = \(async \(\) => \{([\s\S]*?)\n\s*\}\)\(\);/)?.[1] || '';
  assert.ok(pwaStart > 0 && pwaEnd > pwaStart && startup, 'Le démarrage PWA à instrumenter est introuvable');

  const serviceWorkerListeners = new Map();
  const postedMessages = [];
  let storageInitialiseCount = 0;
  let registrationCount = 0;
  let reloadCount = 0;
  let retryButton = null;
  const spinner = { hidden: false };
  const title = { textContent: '' };
  const detail = { textContent: '' };
  const card = {
    querySelector(selector) {
      if (selector === '.storage-loading-spinner') return spinner;
      if (selector === 'strong') return title;
      if (selector === 'small') return detail;
      return null;
    },
    append(element) { retryButton = element; }
  };
  const loading = {
    ariaLabel: '',
    querySelector(selector) { return selector === '.storage-loading-card' ? card : null; },
    setAttribute(name, value) { if (name === 'aria-label') this.ariaLabel = value; }
  };

  class TestMessageChannel {
    constructor() {
      const port1 = { onmessage: null, onmessageerror: null, start() {}, close() {} };
      this.port1 = port1;
      this.port2 = { postMessage(value) { port1.onmessage?.({ data: value }); }, close() {} };
    }
  }

  const serviceWorker = {
    controller: null,
    addEventListener(type, listener) { serviceWorkerListeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (serviceWorkerListeners.get(type) === listener) serviceWorkerListeners.delete(type);
    },
    async register() { registrationCount += 1; return registration; }
  };
  const makeWorker = ({ build, activated, state }) => {
    const workerState = { activated };
    return {
      scriptURL: `https://agenda.test/app/sw.js?v=${build}`,
      state,
      postMessage(message, ports = []) {
        postedMessages.push(message.type);
        if (message.type === 'WORKER_STATUS') {
          ports[0]?.postMessage({ activated: workerState.activated, clientCount });
          return;
        }
        if (message.type !== 'SKIP_WAITING') return;
        const accepted = clientCount <= 1;
        ports[0]?.postMessage({ activated: workerState.activated, clientCount, accepted });
        if (!accepted) return;
        queueMicrotask(() => {
          workerState.activated = true;
          this.state = 'activated';
          serviceWorker.controller = this;
          serviceWorkerListeners.get('controllerchange')?.();
        });
      }
    };
  };
  const oldWorker = controllerBuild ? makeWorker({
    build: controllerBuild,
    activated: true,
    state: 'activated'
  }) : null;
  const currentWorker = controllerBuild === '2026.15.2' ? oldWorker : makeWorker({
    build: '2026.15.2',
    activated: false,
    state: 'installed'
  });
  serviceWorker.controller = oldWorker;
  const registration = {
    waiting: currentWorker === oldWorker ? null : currentWorker,
    installing: null,
    active: oldWorker,
    async update() {}
  };

  const context = {
    URL,
    clearTimeout,
    setTimeout,
    queueMicrotask,
    navigator: { serviceWorker },
    document: {
      body: { dataset: {} },
      createElement() {
        return {
          id: '', type: '', className: '', textContent: '',
          addEventListener(type, listener) { if (type === 'click') this.click = listener; }
        };
      }
    },
    location: { href: 'https://agenda.test/app/', reload() { reloadCount += 1; } },
    __select(selector) {
      if (selector === '#storageLoading') return loading;
      if (selector === '#updateBarrierRetry') return retryButton;
      return null;
    },
    async initialiseSecureStorage() { storageInitialiseCount += 1; return true; },
    registerServiceWorker() { registrationCount += 1; }
  };
  if (messageChannel) context.MessageChannel = TestMessageChannel;
  context.globalThis = context;
  const pwaSource = app.slice(pwaStart, pwaEnd);
  vm.runInNewContext(`
    const BUILD_ID = '2026.15.2';
    const app = { ui: {} };
    const $ = globalThis.__select;
    ${pwaSource}
    globalThis.__runStartup = () => (async () => {${startup}\n})();
  `, context, { filename: 'app.pwa-release-test.js' });

  return {
    runStartup: () => context.__runStartup(),
    result: () => ({
      storageInitialiseCount,
      registrationCount,
      reloadCount,
      postedMessages: [...postedMessages],
      bodyDataset: { ...context.document.body.dataset },
      ariaLabel: loading.ariaLabel,
      title: title.textContent,
      detail: detail.textContent,
      retryButton
    })
  };
}

test('les scripts JavaScript ont une syntaxe valide', () => {
  for (const [name, source] of [['app.js', app], ['storage.js', storage], ['sw.js', worker]]) {
    assert.doesNotThrow(() => new vm.Script(source, { filename: name }));
  }
});

test('la version visible et le build sont cohérents', () => {
  assert.match(app, /const APP_VERSION = ['"]2026\.15['"]/);
  assert.match(app, /const BUILD_ID = ['"]2026\.15\.2['"]/);
  assert.match(worker, /const BUILD_ID = ['"]2026\.15\.2['"]/);
  assert.equal(manifest.start_url, './?v=2026.15.2');
  for (const resource of ['manifest.webmanifest', 'style.css', 'storage.js', 'app.js']) {
    assert.match(html, new RegExp(`${resource.replace('.', '\\.')}\\?v=2026\\.15\\.2`));
  }
  assert.match(app, /serviceWorker\.register\(`\.\/sw\.js\?v=\$\{BUILD_ID\}`/);
});

test('toutes les ressources livrées existent', () => {
  for (const name of ['index.html', 'style.css', 'storage.js', 'app.js', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png']) {
    assert.ok(fs.statSync(path.join(root, name)).isFile(), `${name} est manquant`);
  }

  const localReferences = [...html.matchAll(/\b(?:href|src)="(?!https?:|mailto:|tel:|#)([^"]+)"/g)]
    .map(match => match[1].replace(/^\.\//, '').split('?')[0])
    .filter(Boolean);
  for (const reference of localReferences) {
    assert.ok(fs.existsSync(path.join(root, reference)), `La ressource HTML ${reference} est manquante`);
  }
});

test('le manifeste et les icônes sont cohérents', () => {
  assert.equal(manifest.id, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  const expected = new Map([['icon-192.png', [192, 192]], ['icon-512.png', [512, 512]]]);
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(root, icon.src)), `${icon.src} est manquante`);
    if (!expected.has(icon.src)) continue;
    const bytes = fs.readFileSync(path.join(root, icon.src));
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], expected.get(icon.src));
  }
});

test('les identifiants HTML sont uniques', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('les références DOM littérales pointent vers un élément livré ou créé dynamiquement', () => {
  const known = new Set([
    ...[...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]),
    ...[...app.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]),
    ...[...app.matchAll(/\.id\s*=\s*['"]([^'"]+)['"]/g)].map(match => match[1])
  ]);
  const referenced = new Set([...app.matchAll(/\$\(["']#([A-Za-z][\w:-]*)/g)].map(match => match[1]));
  const missing = [...referenced].filter(id => !known.has(id)).sort();
  assert.deepEqual(missing, []);
});

test('chaque dialogue possède un nom accessible', () => {
  const dialogs = [...html.matchAll(/<dialog\b[^>]*>/g)].map(match => match[0]);
  assert.ok(dialogs.length >= 20);
  const unnamed = dialogs.filter(tag => !/\baria-(?:label|labelledby)=/.test(tag));
  assert.deepEqual(unnamed, []);
});

test('les relations ARIA et les labels for ciblent des identifiants existants', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const references = [];
  for (const attribute of ['aria-labelledby', 'aria-describedby']) {
    for (const match of html.matchAll(new RegExp(`\\b${attribute}="([^"]+)"`, 'g'))) {
      for (const id of match[1].trim().split(/\s+/)) references.push({ attribute, id });
    }
  }
  for (const match of html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)) references.push({ attribute: 'for', id: match[1] });
  const missing = references.filter(reference => !ids.has(reference.id));
  assert.deepEqual(missing, []);
});

test('le Bilan simplifié conserve les contrôles utiles sans accès rapides', () => {
  for (const period of ['day', 'week', 'month', 'year']) assert.match(html, new RegExp(`data-report-period="${period}"`));
  for (const tab of ['activity', 'payments', 'expenses']) assert.match(html, new RegExp(`data-report-tab="${tab}"`));
  assert.doesNotMatch(html, /data-report-question=/);
  assert.doesNotMatch(html, />Accès rapide</);
});

test('le remboursement est présent dans le formulaire et dans les règles métier', () => {
  assert.match(html, /<option value="refunded">Remboursé<\/option>/);
  assert.match(html, /id="refundDateField"/);
  assert.match(html, /id="refundDate"/);
  assert.match(app, /refunded\s*:\s*['"]Remboursé['"]/);
  assert.match(app, /refundDate/);
});

test('les raccourcis de paiement et le verrou financier gardent leurs garde-fous', () => {
  assert.match(app, /if \(target\.dataset\.reviewPaid\)[^\n]+markAppointmentPaid\(appointment\.id, todayKey\(\)\)/);
  assert.match(app, /if \(target\.dataset\.reminderPaid\) \{ markAppointmentPaid\(target\.dataset\.reminderPaid, todayKey\(\)\)/);
  assert.match(app, /existingAppointment && hasCollectedPayment\(existingAppointment\) && appointmentFinancialSignature\(existingAppointment\) !== appointmentFinancialSignature\(draft\)/);
  assert.match(app, /\['paid', 'refunded'\]\.includes\(raw\?\.paymentStatus\) && pickDate\(raw\?\.paymentDate\) > todayKey\(\)/);
});

test('la grille semaine garde des demi-heures tactiles de 24 px sans chevauchement', () => {
  assert.match(app, /const COMFORTABLE_WEEK_HOUR_HEIGHT = 48/);
  assert.match(app, /const COMPACT_WEEK_HOUR_HEIGHT = 48/);
  assert.match(app, /height:\$\{hourHeight \/ 2\}px/);
  assert.match(style, /transparent 23px, var\(--grid-minor\) 23px, var\(--grid-minor\) 24px, transparent 24px, transparent 47px, var\(--grid-major\) 47px, var\(--grid-major\) 48px/);
  const emptySlotRule = style.match(/\.week-empty-slot\s*\{([^}]*)\}/)?.[1] || '';
  assert.ok(emptySlotRule, 'La règle .week-empty-slot est absente');
  assert.doesNotMatch(emptySlotRule, /min-height\s*:/);
});

test('le changement de contrôleur PWA diffère le rechargement si une saisie est sale', () => {
  const controllerHandler = app.match(/navigator\.serviceWorker\.addEventListener\?\.\('controllerchange', \(\) => \{([\s\S]*?)\n\s*\}\);/)?.[1] || '';
  assert.match(controllerHandler, /saveOpenFormDrafts\(\)/);
  assert.match(controllerHandler, /!storageSaveCount && !hasOpenUnsavedChanges\(\)/);
  assert.match(controllerHandler, /showUpdateNotice\(null, true\)/);
  assert.match(controllerHandler, /Termine ta saisie/);
});

test('la barrière de mise à jour précède strictement toute ouverture du stockage', async () => {
  const startup = app.match(/app\.ready = \(async \(\) => \{([\s\S]*?)\n\s*\}\)\(\);/)?.[1] || '';
  assert.ok(startup, 'Le démarrage sécurisé de l’application est introuvable');

  const runStartup = async barrierResult => {
    const calls = [];
    const result = await vm.runInNewContext(`(async () => {${startup}\n})()`, {
      async ensureCurrentServiceWorker() { calls.push('barrière'); return barrierResult; },
      async initialiseSecureStorage() { calls.push('stockage'); return 'prêt'; },
      registerServiceWorker() { calls.push('enregistrement'); }
    });
    return { calls, result };
  };

  const blocked = await runStartup(false);
  assert.deepEqual(blocked.calls, ['barrière']);
  assert.equal(blocked.result, false);

  const current = await runStartup(true);
  assert.deepEqual(current.calls, ['barrière', 'stockage', 'enregistrement']);
  assert.equal(current.result, 'prêt');
});

test('aucune lecture legacy ne démarre avant la barrière PWA', () => {
  assert.doesNotMatch(app, /(?:const|let)\s+legacyBootState\s*=\s*loadLegacyState\(\)/);
  const initialiseAt = app.indexOf('async function initialiseSecureStorage()');
  const legacyReadAt = app.indexOf('legacyBootState = loadLegacyState()');
  const pwaBarrierAt = app.indexOf('if (!(await ensureCurrentServiceWorker())) return false;');
  assert.ok(initialiseAt >= 0 && legacyReadAt > initialiseAt, 'La lecture legacy doit rester dans l’initialisation sécurisée');
  assert.ok(pwaBarrierAt > legacyReadAt, 'Le démarrage doit appeler la barrière avant la fonction qui lit le legacy');
});

test('le démarrage réel reste derrière la barrière tant que plusieurs fenêtres sont ouvertes', async () => {
  const harness = applicationStartupHarness({ clientCount: 2 });
  assert.equal(await harness.runStartup(), false);
  const result = harness.result();
  assert.equal(result.storageInitialiseCount, 0);
  assert.deepEqual(result.postedMessages, ['WORKER_STATUS']);
  assert.equal(result.bodyDataset.updateBarrier, 'true');
  assert.match(result.title, /Ferme les autres fenêtres/);
  assert.match(result.detail, /autres onglets ou fenêtres/);
  assert.equal(result.retryButton?.textContent, 'Réessayer');
  result.retryButton.click();
  assert.equal(harness.result().reloadCount, 1);
});

test('le démarrage réel ouvre le stockage avec un contrôleur courant et une seule fenêtre', async () => {
  const harness = applicationStartupHarness({ clientCount: 1 });
  assert.equal(await harness.runStartup(), true);
  const result = harness.result();
  assert.equal(result.storageInitialiseCount, 1);
  assert.deepEqual(result.postedMessages, ['WORKER_STATUS']);
  assert.equal(result.bodyDataset.updateBarrier, undefined);
});

test('le démarrage active le nouveau worker seul puis recharge sans ouvrir le stockage', async () => {
  const harness = applicationStartupHarness({ controllerBuild: '2026.14.0', clientCount: 1 });
  assert.equal(await harness.runStartup(), false);
  const result = harness.result();
  assert.equal(result.storageInitialiseCount, 0);
  assert.equal(result.registrationCount, 1);
  assert.deepEqual(result.postedMessages, ['WORKER_STATUS', 'SKIP_WAITING', 'WORKER_STATUS']);
  assert.equal(result.reloadCount, 1);
});

test('le démarrage échoue fermé si MessageChannel est indisponible', async () => {
  const harness = applicationStartupHarness({ clientCount: 1, messageChannel: false });
  assert.equal(await harness.runStartup(), false);
  const result = harness.result();
  assert.equal(result.storageInitialiseCount, 0);
  assert.deepEqual(result.postedMessages, []);
  assert.equal(result.bodyDataset.updateBarrier, 'true');
  assert.match(result.detail, /Reconnecte cet appareil/);
});

test('le démarrage échoue fermé si le worker ne voit même pas la fenêtre émettrice', async () => {
  const harness = applicationStartupHarness({ clientCount: 0 });
  assert.equal(await harness.runStartup(), false);
  const result = harness.result();
  assert.equal(result.storageInitialiseCount, 0);
  assert.deepEqual(result.postedMessages, ['WORKER_STATUS']);
  assert.equal(result.bodyDataset.updateBarrier, 'true');
  assert.match(result.detail, /Reconnecte cet appareil/);
});

test('les sauvegardes transportent et contrôlent une empreinte', () => {
  assert.match(app, /checksum/);
  assert.match(app, /counts/);
  assert.match(app, /BACKUP_CHECKSUM|backupChecksum|checksum\(state\)/);
});

test('le service worker utilise uniquement le cache du build courant', () => {
  assert.match(worker, /cache:\s*['"]reload['"]/);
  assert.match(worker, /caches\.open\(CACHE_NAME\)/);
  assert.doesNotMatch(worker, /caches\.match\(event\.request\)/);
  assert.match(worker, /INDEX_FALLBACK/);
  assert.match(worker, /APP_SHELL_URLS\.has\(request\.url\)/);
  assert.match(worker, /LEGACY_CACHE_NAMES\.has\(name\)/);
  for (const resource of ['index.html', 'style.css', 'storage.js', 'app.js', 'manifest.webmanifest']) {
    assert.match(worker, new RegExp(`${resource.replace('.', '\\.')}\\?v=\\$\\{BUILD_ID\\}`));
  }
});

test('un ancien service worker ne place jamais les ressources d’un autre build dans son cache', async () => {
  const harness = serviceWorkerHarness();
  const response = await harness.shellResponse(new Request('https://agenda.test/app/app.js?v=2026.16.0'));
  assert.equal(await response.text(), 'network');
  const result = harness.result();
  assert.deepEqual(result.openedCaches, []);
  assert.deepEqual(result.cachedRequests, []);
  assert.equal(result.fetchedRequests.length, 1);
  assert.equal(result.fetchedRequests[0].options.cache, 'no-store');
});

test('le service worker accepte SKIP_WAITING avec exactement une fenêtre, même sans port de réponse 12.5', async () => {
  const harness = serviceWorkerHarness({ clientCount: 0 });
  await harness.message({ type: 'SKIP_WAITING' }, { withPort: false });
  assert.equal(harness.result().skipWaitingCount, 0);

  harness.setClientCount(2);
  await harness.message({ type: 'SKIP_WAITING' }, { withPort: false });
  assert.equal(harness.result().skipWaitingCount, 0);

  harness.setClientCount(1);
  await harness.message({ type: 'SKIP_WAITING' }, { withPort: false });
  const result = harness.result();
  assert.equal(result.skipWaitingCount, 1);
  assert.deepEqual(result.clientQueries, [
    { type: 'window', includeUncontrolled: true },
    { type: 'window', includeUncontrolled: true },
    { type: 'window', includeUncontrolled: true }
  ]);
});

test('le service worker communique son activation et le nombre de fenêtres par le port dédié', async () => {
  const waiting = serviceWorkerHarness({ clientCount: 2 });
  const waitingStatus = await waiting.message({ type: 'WORKER_STATUS' });
  assert.deepEqual({ ...waitingStatus }, { activated: false, clientCount: 2 });

  const active = serviceWorkerHarness({
    clientCount: 1,
    activeScriptUrl: 'https://agenda.test/app/sw.js?v=2026.15.2'
  });
  const activeStatus = await active.message({ type: 'WORKER_STATUS' });
  assert.deepEqual({ ...activeStatus }, { activated: true, clientCount: 1 });
});

test('le nettoyage supprime seulement les caches de cette application et le cache historique connu', async () => {
  const current = 'mon-agenda-shell-2026.15.2';
  const harness = serviceWorkerHarness({
    cacheNames: [
      current,
      'mon-agenda-shell-2026.14.0',
      'mon-agenda-v12-5-beta-1',
      'mon-agenda-v12-5-beta-2',
      'mon-agenda-shellboard-2026.14.0',
      'cache-autre-application'
    ]
  });
  await harness.activate();
  const result = harness.result();
  assert.deepEqual(result.deletedCaches.sort(), ['mon-agenda-shell-2026.14.0', 'mon-agenda-v12-5-beta-1']);
  assert.equal(result.claimedClients, 1);
});
