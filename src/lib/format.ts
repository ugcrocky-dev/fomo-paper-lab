export function money(n: number, digits = 2) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(digits)}`;
}

export function pnlClass(n: number) {
  if (n > 0) return "pos";
  if (n < 0) return "neg";
  return "";
}
