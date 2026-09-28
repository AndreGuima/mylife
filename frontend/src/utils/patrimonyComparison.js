export function buildPatrimonyComparisonSummary(
  points = [],
  referenceDateKey = null,
) {
  const normalizedPoints = (points || [])
    .filter((point) => Number.isFinite(Number(point?.total)))
    .map((point) => ({
      dateKey: point.dateKey,
      total: Number(point.total),
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  if (normalizedPoints.length === 0) {
    return [
      { label: "Patrimônio atual", value: 0 },
      { label: "Ontem", value: 0 },
      { label: "Semana passada", value: 0 },
      { label: "Mês passado", value: 0 },
    ];
  }

  const reference =
    referenceDateKey || normalizedPoints[normalizedPoints.length - 1]?.dateKey;
  if (!reference) {
    return [
      { label: "Patrimônio atual", value: 0 },
      { label: "Ontem", value: 0 },
      { label: "Semana passada", value: 0 },
      { label: "Mês passado", value: 0 },
    ];
  }

  const referenceDate = new Date(`${reference}T00:00:00`);
  const previousDay = new Date(referenceDate);
  previousDay.setDate(referenceDate.getDate() - 1);
  const previousWeek = new Date(referenceDate);
  previousWeek.setDate(referenceDate.getDate() - 7);
  const previousMonth = new Date(referenceDate);
  previousMonth.setMonth(referenceDate.getMonth() - 1);

  const findClosestPoint = (date) => {
    const target = date.toISOString().slice(0, 10);
    const exact = normalizedPoints.find((point) => point.dateKey === target);
    if (exact) return exact.total;

    let lastValue = normalizedPoints[0]?.total ?? 0;
    let lastDate = normalizedPoints[0]?.dateKey;

    for (const point of normalizedPoints) {
      if (point.dateKey > target) break;
      lastValue = point.total;
      lastDate = point.dateKey;
    }

    return lastDate && lastDate <= target
      ? lastValue
      : (normalizedPoints[0]?.total ?? 0);
  };

  return [
    {
      label: "Patrimônio atual",
      value: normalizedPoints[normalizedPoints.length - 1]?.total ?? 0,
    },
    { label: "Ontem", value: findClosestPoint(previousDay) },
    { label: "Semana passada", value: findClosestPoint(previousWeek) },
    { label: "Mês passado", value: findClosestPoint(previousMonth) },
  ];
}

export function getPatrimonyComparisonDelta(item, comparisonSummary = []) {
  const current = comparisonSummary[0]?.value ?? 0;
  const yesterday = comparisonSummary[1]?.value ?? 0;
  const toCents = (value) => Math.round(value * 100) / 100;

  if (item?.label === "Patrimônio atual") {
    return {
      value: toCents(current - yesterday),
      referenceLabel: "de ontem",
    };
  }

  return {
    value: toCents(Number(item?.value || 0) - current),
    referenceLabel: "do patrimônio atual",
  };
}

export function buildPreviousAccountValuesByLastChange(snapshots = []) {
  const lastValuesByAccount = new Map();
  const previousValuesByAccount = new Map();

  const orderedSnapshots = (snapshots || [])
    .filter((snapshot) => Array.isArray(snapshot?.accounts))
    .slice()
    .sort((a, b) => {
      const snapshotAtA = new Date(a.snapshot_at).getTime();
      const snapshotAtB = new Date(b.snapshot_at).getTime();

      if (snapshotAtA !== snapshotAtB) {
        return snapshotAtA - snapshotAtB;
      }

      return Number(a.id || 0) - Number(b.id || 0);
    });

  orderedSnapshots.forEach((snapshot) => {
    snapshot.accounts.forEach((item) => {
      const accountId = item?.bank_account_id;
      if (!accountId) return;

      const currentValue = Number(item.total_value || 0);
      const hasLastValue = lastValuesByAccount.has(accountId);
      const lastValue = lastValuesByAccount.get(accountId);

      if (hasLastValue && currentValue !== lastValue) {
        previousValuesByAccount.set(accountId, lastValue);
      }

      lastValuesByAccount.set(accountId, currentValue);
    });
  });

  return previousValuesByAccount;
}
