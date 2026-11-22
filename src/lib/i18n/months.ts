/**
 * Month names written inside a longer text ("Revenue by Company — August 2026", "12 October 2026"). The dictionary translates a month that stands
 * alone, but a name that is part of a sentence built in code would stay English, so every month followed by a year is put into Bahasa Melayu here.
 */
const MS_MONTH: Record<string, string> = {
  January: "Januari",
  February: "Februari",
  March: "Mac",
  April: "April",
  May: "Mei",
  June: "Jun",
  July: "Julai",
  August: "Ogos",
  September: "September",
  October: "Oktober",
  November: "November",
  December: "Disember",
  Jan: "Jan",
  Feb: "Feb",
  Mar: "Mac",
  Apr: "Apr",
  Jun: "Jun",
  Jul: "Jul",
  Aug: "Ogo",
  Sep: "Sep",
  Sept: "Sep",
  Oct: "Okt",
  Nov: "Nov",
  Dec: "Dis",
};

const MONTH_BEFORE_YEAR = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\b(?=\.?,?\s*\d{4}\b)/g;

export function localizeMonthsMs(text: string): string {
  if (!/\d{4}/.test(text)) return text;
  return text.replace(MONTH_BEFORE_YEAR, (m) => MS_MONTH[m] ?? m);
}
