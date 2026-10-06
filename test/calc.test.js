const test = require('node:test');
const assert = require('node:assert/strict');
const { workdayCounts } = require('../lib/calc');
const { open } = require('../lib/db');
const { createService } = require('../lib/service');

const none = new Set();

test('October 2026 matches the spreadsheet: 3 worked by 10/3, 27 total', () => {
  assert.deepEqual(workdayCounts('2026-10-03', none), { worked: 3, total: 27 });
});

test('Sundays and holidays are not workable', () => {
  assert.equal(workdayCounts('2026-10-04', none).worked, 3); // Sunday
  assert.equal(workdayCounts('2026-10-06', new Set(['2026-10-05'])).worked, 4);
  assert.equal(workdayCounts('2026-10-06', new Set(['2026-10-12'])).total, 26);
});

const setup = () => {
  const svc = createService(open(':memory:'));
  const id = (name) => svc.branches().find((b) => b.name === name).id;
  return { svc, id };
};

test('carry-in date shows the spreadsheet MTD and tracking figure', () => {
  const { svc } = setup();
  const r = svc.report('2026-10-03');
  assert.equal(r.newMtd.revenue, 1496511.86);
  assert.equal(r.trackingMonth.revenue, 13468606.74); // sheet shows ...75 (hardcoded); formula gives ...74
});

test('daily total adds up all branches and rolls into MTD + tracking', () => {
  const { svc, id } = setup();
  svc.submit({ branchId: id('Hendersonville'), date: '2026-10-05', metrics: { knock: 5, talk: 4, walk: 3, contingency: 1, approved: 1, contracts: 3, revenue: '$2,000', soft_sets: 12 } });
  svc.submit({ branchId: id('Memphis'), date: '2026-10-05', metrics: { knock: 10, revenue: 500.5 } });
  let r = svc.report('2026-10-05');
  assert.equal(r.dayTotal.knock, 15);
  assert.equal(r.dayTotal.revenue, 2500.5);
  assert.equal(r.oldMtd.revenue, 1496511.86);
  assert.equal(r.newMtd.revenue, 1499012.36);
  assert.equal(r.daysWorked, 4);
  assert.equal(r.trackingDaily.revenue, 374753.09);
  assert.equal(r.missing.length, 53);

  // next day builds on the previous day, and a Sunday adds no work day
  svc.submit({ branchId: id('Memphis'), date: '2026-10-06', metrics: { revenue: 1000 } });
  r = svc.report('2026-10-06');
  assert.equal(r.oldMtd.revenue, 1499012.36);
  assert.equal(r.newMtd.revenue, 1500012.36);
  assert.equal(r.daysWorked, 5);
});

test('resubmitting replaces rather than double counts', () => {
  const { svc, id } = setup();
  svc.submit({ branchId: id('Memphis'), date: '2026-10-05', metrics: { revenue: 100 } });
  const again = svc.submit({ branchId: id('Memphis'), date: '2026-10-05', metrics: { revenue: 300 } });
  assert.equal(again.updated, true);
  assert.equal(svc.report('2026-10-05').dayTotal.revenue, 300);
});

test('rejects bad input', () => {
  const { svc, id } = setup();
  const bad = (m) => assert.throws(() => svc.submit({ branchId: id('Memphis'), date: '2026-10-05', metrics: m }), /must be/);
  bad({ knock: -1 }); bad({ talk: 1.5 }); bad({ revenue: 'abc' });
  assert.throws(() => svc.submit({ branchId: 9999, date: '2026-10-05', metrics: {} }), /unknown branch/);
  assert.throws(() => svc.submit({ branchId: id('Memphis'), date: '2026-13-40', metrics: {} }), /invalid date/);
});

test('a new month with no carry-in starts from zero', () => {
  const { svc, id } = setup();
  svc.submit({ branchId: id('Memphis'), date: '2026-11-02', metrics: { revenue: 700 } });
  const r = svc.report('2026-11-02');
  assert.equal(r.newMtd.revenue, 700);
  assert.equal(r.oldMtd.revenue, 0);
  assert.equal(r.daysWorked, 1); // Nov 1 is a Sunday, so Nov 2 is day 1
});
