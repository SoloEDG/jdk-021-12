import type { Game, Order } from "../../../shared/types";
import { departureLimit } from "./commitment";

/** 客人的耐心比例。承诺订单以承诺截止 + 安抚/扣减后的离店时点计算。 */
export function patience(g: Game, o: Order) {
  if (o.commitment) {
    const c = o.commitment;
    const limit = departureLimit(c);
    const span = Math.max(1, limit - c.acceptedAt);
    return Math.max(0, Math.min(1, (limit - g.time) / span));
  }
  return Math.max(
    0,
    Math.min(1, (o.deadline - g.time) / Math.max(1, o.deadline - o.arrived)),
  );
}

/** 原始等待剩余秒数（未接单时的倒计时，接单后仍保留展示）。 */
export function originalWait(g: Game, o: Order) {
  return Math.max(0, Math.ceil(o.deadline - g.time));
}

/** 承诺截止剩余秒数。 */
export function promiseWait(g: Game, o: Order) {
  if (!o.commitment) return null;
  return Math.ceil(o.commitment.deadline - g.time);
}

export function activeOrders(g: Game) {
  return g.orders.filter(
    (o) =>
      o.status === "waiting" ||
      o.status === "accepted" ||
      o.status === "partial",
  );
}

export function acceptedOrders(g: Game) {
  return g.orders.filter(
    (o) => o.status === "accepted" || o.status === "partial",
  );
}
