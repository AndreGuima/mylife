/**
 * Cálculo do "Ponto de Virada" (crossover point / ponto de liberdade).
 *
 * É o patrimônio que você precisa ter investido HOJE para que, apenas com
 * juros compostos (sem novos aportes), ele cresça até o patrimônio necessário
 * para bancar a aposentadoria desejada.
 *
 * Todas as taxas são informadas em percentual (ex.: 5 para 5%) e os valores
 * em reais de hoje (rentabilidade real, já descontada a inflação).
 */

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Aporte mensal (fim de período) necessário para que `presentValue` +
 * aportes alcancem `futureValue` em `months` meses à taxa mensal `monthlyRate`.
 */
export function calculateMonthlyContribution(
  presentValue,
  futureValue,
  monthlyRate,
  months,
) {
  if (months <= 0) {
    return Math.max(futureValue - presentValue, 0);
  }

  const growth = Math.pow(1 + monthlyRate, months);
  const remaining = futureValue - presentValue * growth;

  if (remaining <= 0) {
    return 0;
  }

  if (monthlyRate === 0) {
    return remaining / months;
  }

  return (remaining * monthlyRate) / (growth - 1);
}

export function calculateCrossoverPoint(inputs) {
  const currentAge = toNumber(inputs.currentAge);
  const retirementAge = toNumber(inputs.retirementAge);
  const monthlySpending = toNumber(inputs.monthlySpending);
  const otherMonthlyIncome = toNumber(inputs.otherMonthlyIncome);
  const withdrawalRate = toNumber(inputs.withdrawalRate) / 100;
  const realReturn = toNumber(inputs.realReturn) / 100;
  const currentInvested = toNumber(inputs.currentInvested);

  const errors = [];
  if (withdrawalRate <= 0) {
    errors.push("A taxa de retirada precisa ser maior que zero.");
  }
  if (realReturn <= -1) {
    errors.push("A rentabilidade precisa ser maior que -100%.");
  }
  if (retirementAge < currentAge) {
    errors.push("A idade de aposentadoria é menor que a idade atual.");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const requiredMonthlyIncome = Math.max(
    monthlySpending - otherMonthlyIncome,
    0,
  );
  const annualSpending = requiredMonthlyIncome * 12;
  const requiredPatrimony = annualSpending / withdrawalRate;
  const yearsToRetirement = Math.max(retirementAge - currentAge, 0);
  const growthFactor = Math.pow(1 + realReturn, yearsToRetirement);
  const crossoverPoint = requiredPatrimony / growthFactor;

  const progress = crossoverPoint > 0 ? currentInvested / crossoverPoint : 1;
  const remainingToCrossover = Math.max(crossoverPoint - currentInvested, 0);

  const monthlyRate = Math.pow(1 + realReturn, 1 / 12) - 1;
  const monthlyContribution = calculateMonthlyContribution(
    currentInvested,
    requiredPatrimony,
    monthlyRate,
    yearsToRetirement * 12,
  );

  // Quanto o patrimônio atual vira na aposentadoria sem novos aportes.
  const projectedWithoutContributions = currentInvested * growthFactor;

  return {
    valid: true,
    errors: [],
    requiredMonthlyIncome,
    annualSpending,
    requiredPatrimony,
    yearsToRetirement,
    crossoverPoint,
    progress,
    remainingToCrossover,
    monthlyContribution,
    projectedWithoutContributions,
    reached: currentInvested >= crossoverPoint,
  };
}

/**
 * Projeção ano a ano do patrimônio atual sem aportes versus a curva do
 * ponto de virada (quanto seria preciso ter em cada idade).
 */
export function buildCrossoverProjection(inputs) {
  const result = calculateCrossoverPoint(inputs);
  if (!result.valid) {
    return [];
  }

  const currentAge = toNumber(inputs.currentAge);
  const realReturn = toNumber(inputs.realReturn) / 100;
  const currentInvested = toNumber(inputs.currentInvested);
  const rows = [];

  for (let year = 0; year <= result.yearsToRetirement; year += 1) {
    const yearsLeft = result.yearsToRetirement - year;
    rows.push({
      age: currentAge + year,
      invested: currentInvested * Math.pow(1 + realReturn, year),
      crossoverAtAge:
        result.requiredPatrimony / Math.pow(1 + realReturn, yearsLeft),
    });
  }

  return rows;
}
