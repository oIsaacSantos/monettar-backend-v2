"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toBRTDateString = toBRTDateString;
exports.toBRTMonthString = toBRTMonthString;
exports.todayBRT = todayBRT;
exports.currentMonthBRT = currentMonthBRT;
const BRT_TIME_ZONE = "America/Sao_Paulo";
const brtDateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BRT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});
function getBRTDateParts(date) {
    const parts = brtDateFormatter.formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (!year || !month || !day) {
        throw new Error("Unable to format date in America/Sao_Paulo timezone");
    }
    return { year, month, day };
}
function toBRTDateString(date) {
    const { year, month, day } = getBRTDateParts(date);
    return `${year}-${month}-${day}`;
}
function toBRTMonthString(date) {
    const { year, month } = getBRTDateParts(date);
    return `${year}-${month}`;
}
function todayBRT() {
    return toBRTDateString(new Date());
}
function currentMonthBRT() {
    return toBRTMonthString(new Date());
}
