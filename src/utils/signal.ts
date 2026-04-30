export type SignalCalculationInput = {
  signalType?: string | null;
  signalValue?: number | string | null;
  signalBaseValue?: number | string | null;
  signalPer30Min?: number | string | null;
  durationMinutes?: number | string | null;
  revenue?: number | string | null;
};

function toSafeNumber(value: unknown) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function calculateSignalAmount(input: SignalCalculationInput) {
  const signalType = String(input.signalType ?? "fixed");
  const revenue = toSafeNumber(input.revenue);

  if (signalType === "percentage" || signalType === "percent") {
    return revenue * (toSafeNumber(input.signalValue) / 100);
  }

  if (signalType === "duration") {
    const baseValue = toSafeNumber(input.signalBaseValue ?? 20);
    const per30Minutes = toSafeNumber(input.signalPer30Min ?? 10);
    const durationMinutes = toSafeNumber(input.durationMinutes);
    const extraBlocks = Math.max(0, Math.floor(durationMinutes / 30) - 2);
    return baseValue + extraBlocks * per30Minutes;
  }

  return toSafeNumber(input.signalValue ?? 20);
}
