import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const worker = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const scope = 'https://agenda.test/mon-agenda/';
const build = worker.match(/const BUILD_ID = '([^']+)'/)[1];
const scriptURL = `${scope}sw.js?v=${build}`;

function harness(urls, activeScriptURL = scriptURL) {
  const handlers = new Map();
  let activationRequests = 0;
  const clientQueries = [];
  vm.runInNewContext(worker, {
    URL,
    Set,
    self: {
      location: new URL(scriptURL),
      registration: { scope, active: { scriptURL: activeScriptURL } },
      addEventListener(name, handler) { handlers.set(name, handler); },
      clients: {
        async matchAll(options) {
          clientQueries.push({ ...options });
          return urls.map((url, index) => ({ id: `window-${index}`, url }));
        }
      },
      async skipWaiting() { activationRequests += 1; }
    }
  });
  return {
    async message(type) {
      let completion;
      let response;
      handlers.get('message')({
        data: { type },
        ports: [{ postMessage(value) { response = { ...value }; } }],
        waitUntil(promise) { completion = promise; }
      });
      await completion;
      return response;
    },
    activationRequests: () => activationRequests,
    clientQueries
  };
}

test('unrelated same-origin projects do not block an agenda update', async () => {
  const worker = harness([
    `${scope}?v=${build}`,
    'https://agenda.test/autre-projet/',
    'https://agenda.test/mon-agenda-archives/',
    'https://agenda.test/'
  ]);
  assert.deepEqual(await worker.message('WORKER_STATUS'), { activated: true, clientCount: 1 });
  assert.deepEqual(await worker.message('SKIP_WAITING'), { activated: true, clientCount: 1, accepted: true });
  assert.equal(worker.activationRequests(), 1);
  assert.deepEqual(worker.clientQueries[0], { type: 'window', includeUncontrolled: true });
});

test('two agenda windows still block activation, including a nested page', async () => {
  const worker = harness([scope, `${scope}index.html?v=${build}`, 'https://agenda.test/autre-projet/']);
  assert.deepEqual(await worker.message('WORKER_STATUS'), { activated: true, clientCount: 2 });
  assert.deepEqual(await worker.message('SKIP_WAITING'), { activated: true, clientCount: 2, accepted: false });
  assert.equal(worker.activationRequests(), 0);
});

test('a window outside the app cannot satisfy the single-window activation gate', async () => {
  const worker = harness(['https://agenda.test/autre-projet/']);
  assert.deepEqual(await worker.message('SKIP_WAITING'), { activated: true, clientCount: 0, accepted: false });
  assert.equal(worker.activationRequests(), 0);
});

test('filtering windows preserves the exact active worker build check', async () => {
  const worker = harness([scope, 'https://agenda.test/autre-projet/'], `${scope}sw.js?v=older-build`);
  assert.deepEqual(await worker.message('WORKER_STATUS'), { activated: false, clientCount: 1 });
});
