export function fmt(n) {
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function unitLabel(unit) {
  return unit === "METER" ? "m" : "pc";
}

export function matName(m) {
  return `${m.name}${m.color ? " — " + m.color : ""}`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitsToWords(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
}
function threeDigitsToWords(n) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return (hundred ? ONES[hundred] + " Hundred" + (rest ? " " : "") : "") + (rest ? twoDigitsToWords(rest) : "");
}

// Indian numbering (Crore/Lakh/Thousand), for the "Amount in words" line
// on the client-facing invoice. Rounds to the nearest rupee.
export function numberToWordsINR(amount) {
  let n = Math.round(amount);
  if (n <= 0) return "Rupees Zero Only";

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  const parts = [];
  if (crore) parts.push(threeDigitsToWords(crore) + " Crore");
  if (lakh) parts.push(threeDigitsToWords(lakh) + " Lakh");
  if (thousand) parts.push(threeDigitsToWords(thousand) + " Thousand");
  if (hundred) parts.push(threeDigitsToWords(hundred));

  return "Rupees " + parts.join(" ") + " Only";
}