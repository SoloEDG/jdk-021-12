import type { Game } from "../../../shared/types";
function sumKind(g: Game, kind: string) {
  return g.entries
    .filter((e) => e.kind === kind)
    .reduce((s, e) => s + e.amount, 0);
}
export function totals(g: Game) {
  return {
    net: g.entries.reduce((s, e) => s + e.amount, 0),
    sales: sumKind(g, "sale"),
    cost: -g.entries
      .filter((e) => e.kind === "supply" || e.kind === "waste" || e.kind === "miss")
      .reduce((s, e) => s + e.amount, 0),
    refunds: -sumKind(g, "refund"),
    compensation: -sumKind(g, "compensation"),
    discounts: -sumKind(g, "discount"),
  };
}
export function grade(g: Game) {
  const n = totals(g).net;
  return n >= 400 ? "S" : n >= 250 ? "A" : n >= 120 ? "B" : "C";
}

/** 结算小计，供打烊面板与手账共用。 */
export function settlement(g: Game) {
  const t = totals(g);
  return {
    ...t,
    refundsAndCompensation: t.refunds + t.compensation,
  };
}
