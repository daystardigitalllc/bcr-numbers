import test from 'node:test';
import assert from 'node:assert/strict';
import { workdayCounts } from '../functions/_lib/calc.js';
import { createService } from '../functions/_lib/service.js';
import { createD1 } from './d1shim.js';

const none = new Set();

test('October 2026 matches the spreadsheet: 3 worked by 10/3, 27 total', () => {
  assert.deepEqual(workdayCounts('2026-10-03', none), { worked: 3, total: 27 });
});

test('Sundays and holidays are not workable', () => {
  assert.equal(workdayCounts('2026-10-04', none).worked, 3); // Sunday
  assert.equal(workdayCounts('2026-10-06', new Set(['2026-10-05'])).worked, 4);
  assert.equal(workdayCounts('2026-10-06', new Set(['2026-10-12'])).total, 26);
});

const setup = async () => {
  const svc = createService(createD1());
  const list = await svc.branches();
  const id = (name) => list.find((b) => b.name === name).id;
  return { svc, id };
};

test('carry-in date shows the spreadsheet MTD and tracking figure', async () => {
  const { svc } = await setup();
  const r = await svc.report('2026-10-03');
  assert.equal(r.newMtd.revenue, 1496511.86);
  assert.equal(r.trackingMonth.revenue, 13468606.74); // sheet shows ...75 (hardcoded); formula gives ...74
});

test('daily total adds up all branches and rolls into MTD + tracking', async () => {
  const { svc, id } = await setup();
  await svc.submit({ branchId: id('Hendersonville'), date: '2026-10-05', metrics: { knock: 5, talk: 4, walk: 3, contingency: 1, approved: 1, contracts: 3, revenue: '$2,000', soft_sets: 12 } });
  await svc.submit({ branchId: id('Memphis'), date: '2026-10-05', metrics: { knock: 10, revenue: 500.5 } });
  let r = await svc.report('2026-10-05');
  assert.equal(r.dayTotal.knock, 15);
  assert.equal(r.dayTotal.revenue, 2500.5);
  assert.equal(r.oldMtd.revenue, 1496511.86);
  assert.equal(r.newMtd.revenue, 1499012.36);
  assert.equal(r.daysWorked, 4);
  assert.equal(r.trackingDaily.revenue, 374753.09);
  assert.equal(r.missing.length, 53);

  // next day builds on the previous day, and a Sunday adds no work day
  await svc.submit({ branchId: id('Memphis'), date: '2026-10-06', metrics: { revenue: 1000 } });
  r = await svc.report('2026-10-06');
  assert.equal(r.oldMtd.revenue, 1499012.36);
  assert.equal(r.newMtd.revenue, 1500012.36);
  assert.equal(r.daysWorked, 5);
});

test('a branch can only submit once per date; accounting can edit or delete so it can resubmit', async () => {
  const { svc, id } = await setup();
  const memphis = id('Memphis');
  await svc.submit({ branchId: memphis, date: '2026-10-05', metrics: { revenue: 100 } });

  // second form submission for the same branch + date is refused and changes nothing
  await assert.rejects(svc.submit({ branchId: memphis, date: '2026-10-05', metrics: { revenue: 300 } }),
    (e) => e.status === 409 && /already been submitted for 10\/05\/2026/.test(e.message) && /Memphis/.test(e.message));
  assert.equal((await svc.report('2026-10-05')).dayTotal.revenue, 100);

  // another date or another branch is unaffected
  await svc.submit({ branchId: memphis, date: '2026-10-06', metrics: { revenue: 5 } });
  await svc.submit({ branchId: id('Vegas'), date: '2026-10-05', metrics: { revenue: 7 } });

  // accounting edit replaces without double counting
  const edited = await svc.submit({ branchId: memphis, date: '2026-10-05', metrics: { revenue: 300 }, source: 'accounting', replace: true });
  assert.equal(edited.updated, true);
  assert.equal((await svc.report('2026-10-05')).dayTotal.revenue, 307);

  // delete -> shows as missing -> branch can submit again
  await svc.deleteSubmission(memphis, '2026-10-05');
  let r = await svc.report('2026-10-05');
  assert.equal(r.dayTotal.revenue, 7);
  assert.ok(r.missing.includes('Memphis'));
  await svc.submit({ branchId: memphis, date: '2026-10-05', metrics: { revenue: 150 } });
  assert.equal((await svc.report('2026-10-05')).dayTotal.revenue, 157);
  await assert.rejects(svc.deleteSubmission(id('Tupelo'), '2026-10-05'), /No submission found/);
});

test('rejects bad input', async () => {
  const { svc, id } = await setup();
  const bad = (m) => assert.rejects(svc.submit({ branchId: id('Memphis'), date: '2026-10-05', metrics: m }), /must be/);
  await bad({ knock: -1 }); await bad({ talk: 1.5 }); await bad({ revenue: 'abc' });
  await assert.rejects(svc.submit({ branchId: 9999, date: '2026-10-05', metrics: {} }), /unknown branch/);
  await assert.rejects(svc.submit({ branchId: id('Memphis'), date: '2026-13-40', metrics: {} }), /invalid date/);
});

test('a new month with no carry-in starts from zero', async () => {
  const { svc, id } = await setup();
  await svc.submit({ branchId: id('Memphis'), date: '2026-11-02', metrics: { revenue: 700 } });
  const r = await svc.report('2026-11-02');
  assert.equal(r.newMtd.revenue, 700);
  assert.equal(r.oldMtd.revenue, 0);
  assert.equal(r.daysWorked, 1); // Nov 1 is a Sunday, so Nov 2 is day 1
});

test('real 10/05/26 GroupMe post: carry-in + that day reproduces the pasted Daily Total and MTD', async () => {
  const { readFileSync } = await import('node:fs');
  const sample = JSON.parse(readFileSync(new URL('../sample/2026-10-05.json', import.meta.url), 'utf8'));
  const { svc, id } = await setup();
  // The post only lists contingency..soft sets per branch; knock/talk/walk exist only in its totals, so park them on one branch.
  for (const [i, b] of sample.branches.entries()) {
    const extra = i === 0 ? { knock: sample.daily.knock, talk: sample.daily.talk, walk: sample.daily.walk } : {};
    await svc.submit({ branchId: id(b.name), date: sample.date, metrics: { ...b, ...extra } });
  }
  const r = await svc.report(sample.date);
  assert.deepEqual(r.dayTotal, sample.daily);
  assert.deepEqual(r.newMtd, sample.mtd);
  assert.equal(r.daysWorked, 4);
  assert.equal(r.totalDays, 27);
  assert.equal(Math.round(r.trackingMonth.revenue), sample.tracking);
  assert.equal(r.missing.length, 0);
});

test('GroupMe text matches the format accounting pastes today, character for character', async () => {
  const { readFileSync } = await import('node:fs');
  const { groupmeText } = await import('../functions/_lib/report-text.js');
  const sample = JSON.parse(readFileSync(new URL('../sample/2026-10-05.json', import.meta.url), 'utf8'));
  const expected = readFileSync(new URL('../sample/2026-10-05.groupme.txt', import.meta.url), 'utf8');
  assert.equal(groupmeText(sample), expected);
});
