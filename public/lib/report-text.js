// The GroupMe post, in the exact format accounting pastes today:
//   COMPANY NUMBERS
//
//   10/05/26
//   Branch: Contingency-Approved-Contracts-$Revenue-SoftSets      (one line per branch, spreadsheet order)
//
//   Daily Total: Knock-Talk-Walk-Contingency-Approved-Contracts-$Revenue-SoftSets
//   MTD: <same eight fields>
//
//   MTD: $<revenue, no commas>
const usd = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const eight = (t) => `${[t.knock, t.talk, t.walk, t.contingency, t.approved, t.contracts].join('-')}-${usd(t.revenue)}-${t.soft_sets}`;

/** @param d { date: 'YYYY-MM-DD', branches: [...] in spreadsheet order, daily, mtd } */
export function groupmeText(d) {
  const [y, m, day] = d.date.split('-');
  return [
    'COMPANY NUMBERS',
    '',
    `${m}/${day}/${y.slice(2)}`,
    ...d.branches.map((b) => `${b.name}: ${b.contingency}-${b.approved}-${b.contracts}-${usd(b.revenue)}-${b.soft_sets}`),
    '',
    `Daily Total: ${eight(d.daily)}`,
    `MTD: ${eight(d.mtd)}`,
    '',
    `MTD: $${d.mtd.revenue.toFixed(2)}`,
  ].join('\n');
}
