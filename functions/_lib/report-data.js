// Adapts service.report() output to the shape the image and text renderers take.
// Branches stay in spreadsheet order here; the image renderer alphabetizes its own copy.
export function reportToData(r) {
  return {
    date: r.date,
    daysWorked: r.daysWorked,
    totalDays: r.totalDays,
    branches: r.rows.map((b) => ({
      name: b.branch.trim(),
      contingency: b.contingency ?? 0,
      approved: b.approved ?? 0,
      contracts: b.contracts ?? 0,
      revenue: b.revenue ?? 0,
      soft_sets: b.soft_sets ?? 0,
    })),
    daily: r.dayTotal,
    mtd: r.newMtd,
    tracking: Math.round(r.trackingMonth.revenue),
    reported: r.submittedCount,
    missing: r.missing,
  };
}
