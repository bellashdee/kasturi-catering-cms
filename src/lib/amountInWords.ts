/** The amount written in words, the way AutoCount prints it. Plain code (no browser-only parts), so a server page can use it too. */

const ONES = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} HUNDRED`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ""));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" AND ");
}

/** 1234.50 gives "RINGGIT MALAYSIA ONE THOUSAND TWO HUNDRED AND THIRTY-FOUR AND CENTS FIFTY ONLY" (the way AutoCount prints it). */
export function amountInWords(amount: number): string {
  const sen = Math.round(Math.abs(amount) * 100);
  let ringgit = Math.floor(sen / 100);
  const cents = sen % 100;
  const groups: [number, string][] = [[1_000_000_000, "BILLION"], [1_000_000, "MILLION"], [1000, "THOUSAND"]];
  const words: string[] = [];
  for (const [size, name] of groups) {
    if (ringgit >= size) {
      words.push(`${below1000(Math.floor(ringgit / size))} ${name}`);
      ringgit %= size;
    }
  }
  if (ringgit > 0) words.push(ringgit < 100 && words.length > 0 ? `AND ${below1000(ringgit)}` : below1000(ringgit));
  const ringgitText = words.length > 0 ? words.join(" ") : "ZERO";
  return `RINGGIT MALAYSIA ${ringgitText}${cents > 0 ? ` AND CENTS ${below1000(cents)}` : ""} ONLY`;
}
