import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function appointment(overrides = {}) {
  return {
    id: 'appointment-1', clientId: 'client-1', date: '2026-05-20', time: '10:00',
    duration: 60, price: '100', supplements: [], service: 'Pose', serviceId: 'service-1',
    serviceColor: 'rose', status: 'completed', paymentStatus: 'unreviewed',
    paymentDate: '', refundDate: '', paymentReminderDate: '', paymentMethod: '',
    history: [], createdAt: '2026-05-01T10:00:00.000Z', ...overrides
  };
}

// Keep the real delegated click and form-submit listeners. Only rendering,
// persistence and the next form step are replaced with observable test doubles.
function harness(item) {
  const elements = new Map(), listeners = new Map(), values = new Map();
  let saveCount = 0, confirmCount = 0, submitted = null, alert = '';
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', hidden: false, open: false, dataset: {}, style: {},
      innerHTML: '', textContent: '', checked: false,
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(type, listener) { listeners.set(`${id}:${type}`, listener); },
      querySelector() { return null; }, querySelectorAll() { return []; },
      setAttribute() {}, removeAttribute() {}, focus() { this.focused = true; },
      reportValidity() { return true; }, close() { this.open = false; },
      showModal() { this.open = true; }
    });
    return elements.get(id);
  };
  const context = {
    console, Date, Intl, JSON, Math, Map, Set, Promise, structuredClone, setTimeout, clearTimeout,
    crypto: { randomUUID: () => 'generated-id' },
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key)
    },
    navigator: {},
    document: {
      body: { dataset: {} },
      querySelector: selector => element(selector.slice(1)),
      querySelectorAll: () => [],
      addEventListener(type, listener, capture) { if (!capture) listeners.set(`document:${type}`, listener); }
    },
    window: { confirm: () => { confirmCount += 1; return true; } },
    recordSave: () => { saveCount += 1; },
    recordSubmission: draft => { submitted = structuredClone(draft); },
    recordAlert: message => { alert = message; }
  };
  context.globalThis = context;
  const end = source.indexOf('\n  if (globalThis.setInterval)');
  assert.ok(end > 0, 'Le point d’instrumentation avant le démarrage est présent');
  vm.runInNewContext(source.slice(0, end) + `
    saveState = async () => { recordSave(); invalidateDataIndexes(); return true; };
    render = () => {};
    offerUndo = () => {};
    clearAppointmentDraft = () => {};
    showAppAlert = recordAlert;
    continueDraftSubmission = recordSubmission;
    globalThis.hooks = {
      initialise: item => {
        app.state = migrateState({ version: CURRENT_DATA_VERSION,
          clients: [{ id: 'client-1', name: 'Alice', phone: '' }], appointments: [], blocks: [], expenses: [],
          settings: { services: [{ id: 'service-1', name: 'Pose', duration: 60, price: '100', color: 'rose', active: true }] }
        });
        app.state.appointments = [structuredClone(item)];
        app.ui.editingAppointmentId = item.id; app.ui.formClientId = item.clientId;
        invalidateDataIndexes();
      },
      state: () => cloneState(app.state),
      saving: () => app.ui.appointmentSaving,
      summary: (start, end) => financialSummary(parseDate(start), parseDate(end)),
      commit: draft => commitDraft(draft),
      markPaid: () => markAppointmentPaid('appointment-1', '2026-06-15')
    };
  })();`, context, { filename: 'app.finance-safety.js' });
  context.hooks.initialise(item);
  const fill = overrides => {
    const form = {
      appointmentId: item.id, clientName: 'Alice', phone: '', contactVia: '', address: '',
      serviceSelect: 'service-1', service: 'Pose', date: item.date, time: item.time, duration: '60',
      price: item.price == null ? '' : String(item.price), status: item.status, paymentStatus: item.paymentStatus,
      paymentDate: item.paymentDate, refundDate: item.refundDate, paymentReminderDate: item.paymentReminderDate,
      paymentMethod: item.paymentMethod, repeatWeeks: '0', repeatDate: '', repeatTime: '',
      notes: '', cancellationReason: '', ...overrides
    };
    for (const [id, value] of Object.entries(form)) element(id).value = value;
  };
  fill();
  return {
    hooks: context.hooks, fill, element,
    click: async (id, dataset = {}) => listeners.get('document:click')({ target: { closest: () => ({ id, dataset }) } }),
    submit: () => listeners.get('appointmentForm:submit')({ preventDefault() {} }),
    result: () => ({ saveCount, confirmCount, submitted, alert })
  };
}

test('la suppression réelle préserve les encaissements et remboursements, même après annulation', async () => {
  for (const status of ['completed', 'cancelled', 'no_show']) {
    for (const paymentStatus of ['paid', 'refunded']) {
      const h = harness(appointment({ status, paymentStatus, price: '120', paymentDate: '2026-06-15', refundDate: paymentStatus === 'refunded' ? '2026-07-10' : '' }));
      const before = JSON.stringify(h.hooks.state());
      const june = JSON.stringify(h.hooks.summary('2026-06-01', '2026-07-01'));
      const july = JSON.stringify(h.hooks.summary('2026-07-01', '2026-08-01'));
      await h.click('deleteAppointment');
      assert.equal(JSON.stringify(h.hooks.state()), before);
      assert.equal(JSON.stringify(h.hooks.summary('2026-06-01', '2026-07-01')), june);
      assert.equal(JSON.stringify(h.hooks.summary('2026-07-01', '2026-08-01')), july);
      assert.equal(h.result().saveCount, 0);
      assert.equal(h.result().confirmCount, 0);
      assert.match(h.result().alert, /Annulé/);
    }
  }
});

test('un rendez-vous sans paiement reste supprimable après confirmation', async () => {
  const h = harness(appointment());
  await h.click('deleteAppointment');
  assert.equal(h.hooks.state().appointments.length, 0);
  assert.equal(h.result().saveCount, 1);
  assert.equal(h.result().confirmCount, 1);
});

test('les deux raccourcis Payé refusent un prix absent sans modifier le rendez-vous', async () => {
  for (const key of ['reviewPaid', 'reminderPaid']) {
    for (const price of ['', '   ', null, undefined]) {
      const h = harness(appointment({ price, supplements: [{ id: 's-1', label: 'Décoration', amount: 20 }] }));
      const before = JSON.stringify(h.hooks.state());
      await h.click('', { [key]: 'appointment-1' });
      assert.equal(JSON.stringify(h.hooks.state()), before);
      assert.equal(h.result().saveCount, 0);
      assert.match(h.result().alert, /prix de base valide/);
    }
  }
});

test('le marquage payé refuse les prix invalides mais accepte zéro explicite', async () => {
  for (const price of ['abc', -1, Infinity, 1000001, true]) {
    const h = harness(appointment({ price }));
    await h.hooks.markPaid();
    assert.equal(h.hooks.state().appointments[0].paymentStatus, 'unreviewed');
    assert.equal(h.result().saveCount, 0);
  }
  for (const price of [0, '0', '0.00', '95.50']) {
    const h = harness(appointment({ price }));
    await h.hooks.markPaid();
    assert.equal(h.hooks.state().appointments[0].paymentStatus, 'paid');
    assert.equal(h.hooks.state().appointments[0].paymentDate, '2026-06-15');
    assert.equal(h.result().saveCount, 1);
  }
});

test('le formulaire exige un prix avant paiement ou remboursement et ouvre le tarif à corriger', () => {
  for (const paymentStatus of ['paid', 'refunded']) {
    const h = harness(appointment({ price: '' }));
    h.element('appointmentServiceAdjustments').hidden = true;
    h.fill({ paymentStatus, paymentDate: '2026-06-15', refundDate: paymentStatus === 'refunded' ? '2026-07-10' : '' });
    h.submit();
    assert.equal(h.result().submitted, null);
    assert.equal(h.result().saveCount, 0);
    assert.equal(h.hooks.saving(), false);
    assert.equal(h.element('appointmentServiceAdjustments').hidden, false);
    assert.equal(h.element('price').focused, true);
    assert.match(h.result().alert, /saisis 0/);
  }
});

test('le formulaire autorise un paiement offert et laisse un prix inconnu pour un rendez-vous non payé', () => {
  for (const [paymentStatus, price] of [['paid', '0'], ['unreviewed', '']]) {
    const h = harness(appointment({ price: '' }));
    h.fill({ paymentStatus, price, paymentDate: paymentStatus === 'paid' ? '2026-06-15' : '' });
    h.submit();
    assert.equal(h.result().submitted?.price, price);
    assert.equal(h.result().submitted?.paymentStatus, paymentStatus);
  }
});

test('la dernière étape refuse aussi un brouillon payé sans prix avant toute mutation', async () => {
  const h = harness(appointment({ price: '' }));
  const before = JSON.stringify(h.hooks.state());
  const saved = await h.hooks.commit({ ...appointment({ price: '', paymentStatus: 'paid', paymentDate: '2026-06-15' }), clientName: 'Nom à ne pas enregistrer' });
  assert.equal(saved, false);
  assert.equal(JSON.stringify(h.hooks.state()), before);
  assert.equal(h.result().saveCount, 0);
});

test('annuler un rendez-vous payé conserve son encaissement et le verrouillage du montant', async () => {
  const h = harness(appointment({ paymentStatus: 'paid', paymentDate: '2026-06-15' }));
  h.fill({ status: 'cancelled' });
  h.submit();
  assert.equal(h.result().submitted?.status, 'cancelled');
  await h.hooks.commit(h.result().submitted);
  assert.equal(h.hooks.state().appointments[0].status, 'cancelled');
  assert.equal(h.hooks.summary('2026-06-01', '2026-07-01').net, 100);

  const locked = harness(appointment({ paymentStatus: 'paid', paymentDate: '2026-06-15' }));
  locked.fill({ price: '150' });
  locked.submit();
  assert.equal(locked.result().submitted, null);
  assert.match(locked.result().alert, /figés/);
});

test('un raccourci Payé ne remplace pas un remboursement enregistré', async () => {
  const h = harness(appointment({ paymentStatus: 'refunded', paymentDate: '2026-06-15', refundDate: '2026-07-10' }));
  const before = JSON.stringify(h.hooks.state());
  await h.hooks.markPaid();
  assert.equal(JSON.stringify(h.hooks.state()), before);
  assert.equal(h.result().saveCount, 0);
  assert.match(h.result().alert, /remboursé/);
});
