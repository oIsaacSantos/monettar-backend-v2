const BRT_TIME_ZONE = "America/Sao_Paulo";

const brtDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BRT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getBRTDateParts(date: Date) {
  const parts = brtDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Unable to format date in America/Sao_Paulo timezone");
  }

  return { year, month, day };
}

export function toBRTDateString(date: Date): string {
  const { year, month, day } = getBRTDateParts(date);
  return `${year}-${month}-${day}`;
}

export function toBRTMonthString(date: Date): string {
  const { year, month } = getBRTDateParts(date);
  return `${year}-${month}`;
}

export function todayBRT(): string {
  return toBRTDateString(new Date());
}

export function currentMonthBRT(): string {
  return toBRTMonthString(new Date());
}
