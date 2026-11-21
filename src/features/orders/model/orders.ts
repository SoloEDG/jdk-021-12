import type { Game, Order, ServiceMode } from "../../../shared/types";
import { activeOrders } from "../lib/patience";
import {
  EXTENSION_SECONDS,
  FAILURE_COMPENSATION_RATE,
  MIN_COMPENSATION,
  buildCommitment,
  canRush,
  departureLimit,
  extensionDiscount,
  modeSpecs,
  promiseSeconds,
  remainingValue,
  round1,
  undeliveredItems,
} from "../lib/commitment";

/**
 * 接单即冻结服务承诺。
 *
 * mode 只在此刻生效：价格、期限和菜品要求被写入 commitment 快照，
 * 之后没有任何命令能修改它们，因此无法在临近超时时改回普通承诺逃避赔偿。
 * 普通/加急在交付时按品质结算；分次在接单时预收全价，未完成部分可退。
 */
export function accept(g: Game, id: number, mode: ServiceMode = "standard") {
  const o = g.orders.find((o) => o.id === id);
  if (!o || o.status !== "waiting") return;
  const spec = modeSpecs[mode];
  if (!spec) return;

  const remaining = Math.max(0, o.deadline - g.time);
  if (remaining <= 0) {
    g.notice = `${o.guest} 已经等到原始时限，无法再接受新的承诺`;
    return;
  }
  if (mode === "rush" && !canRush(o, g.time)) {
    g.notice = `剩余等待仅 ${Math.ceil(remaining)} 秒，无法再缩短加急承诺`;
    return;
  }

  const c = buildCommitment(g, o, mode);
  o.commitment = c;
  o.status = "accepted";
  g.selectedOrder = id;

  // 附加费与分次预收都只在此处收取，并由各自的标记保证不会重复入账。
  if (c.surcharge > 0 && !c.surchargeCharged) {
    c.surchargeCharged = true;
    g.entries.push({
      id: g.nextId++,
      time: g.time,
      label: `${o.guest} 加急附加费`,
      amount: c.surcharge,
      kind: "sale",
    });
  }
  if (c.prepaid > 0) {
    g.entries.push({
      id: g.nextId++,
      time: g.time,
      label: `${o.guest} 分次预收 ${c.items.length} 份`,
      amount: c.prepaid,
      kind: "sale",
    });
  }

  g.notice =
    mode === "rush"
      ? `已接加急单：${promiseSeconds(mode, remaining)} 秒承诺，附加费 ¥${c.surcharge}`
      : mode === "split"
        ? `已接分次单：共 ${c.items.length} 份，首份上菜后会安抚客人 ${spec.patienceBonus} 秒`
        : `已接普通单：承诺截止第 ${Math.ceil(c.deadline)} 秒`;
}

/**
 * 顾客主动同意延期：每位客人只能同意一次。
 * 延期把承诺截止推后 20 秒，餐厅付出 10% 折扣。
 */
export function extend(g: Game, id: number) {
  const o = g.orders.find((o) => o.id === id);
  const c = o?.commitment;
  if (!o || !c) return;
  if (o.status !== "accepted" && o.status !== "partial") return;
  if (c.settled) return;
  if (g.time > departureLimit(c)) {
    g.notice = `${o.guest} 已经离店，无法再同意延期`;
    return;
  }
  if (c.extensionUsed) {
    g.notice = `${o.guest} 已经同意过一次延期，不能再次延期`;
    return;
  }

  c.extensionUsed = true;
  c.deadline = round1(c.deadline + EXTENSION_SECONDS);
  const discount = extensionDiscount(c);
  c.discount = discount;
  c.discountApplied = true;
  g.entries.push({
    id: g.nextId++,
    time: g.time,
    label: `${o.guest} 延期折扣`,
    amount: -discount,
    kind: "discount",
  });
  g.notice = `${o.guest} 同意延期 ${EXTENSION_SECONDS} 秒，餐厅付出折扣 ¥${discount}`;
}

/**
 * 部分已交付后放弃剩余菜品：只退还未完成部分，已交付份额不退。
 * 该操作只对已上过一部分的分次承诺开放，结算后不会再产生补偿。
 */
export function abandon(g: Game, id: number) {
  const o = g.orders.find((o) => o.id === id);
  const c = o?.commitment;
  if (!o || !c || c.settled) return;
  if (o.status !== "partial" || c.mode !== "split") {
    g.notice = "只有已上过一部分的分次订单才能放弃剩余菜品";
    return;
  }
  if (g.time > departureLimit(c)) {
    g.notice = `${o.guest} 已经离店，剩余菜品按超时规则结算`;
    return;
  }
  const remaining = remainingValue(c);
  if (remaining > 0) {
    c.refunded = remaining;
    g.entries.push({
      id: g.nextId++,
      time: g.time,
      label: `${o.guest} 退未完成 ${undeliveredItems(c).length} 份`,
      amount: -remaining,
      kind: "refund",
    });
  }
  c.settled = true;
  o.status = "left";
  g.missed++;
  g.combo = 0;
  if (g.selectedOrder === o.id) g.selectedOrder = null;
  g.notice = `${o.guest} 放弃剩余菜品，只退未完成部分 ¥${remaining}`;
}

/** 超时补偿：每张承诺只结算一次，重复调用不会重复扣款。 */
function compensate(g: Game, o: Order) {
  const c = o.commitment;
  if (!c || c.settled) return;
  const undelivered = remainingValue(c);
  const penalty = Math.max(
    MIN_COMPENSATION,
    Math.round(undelivered * FAILURE_COMPENSATION_RATE),
  );
  c.penalty = penalty;
  if (penalty > 0) {
    g.entries.push({
      id: g.nextId++,
      time: g.time,
      label: `${o.guest} 超时补偿`,
      amount: -penalty,
      kind: "compensation",
    });
  }
  // 分次预收的部分，未完成份额原路退回；与补偿是两笔独立账目。
  if (c.prepaid > 0 && undelivered > 0) {
    c.refunded = undelivered;
    g.entries.push({
      id: g.nextId++,
      time: g.time,
      label: `${o.guest} 退未完成 ${undeliveredItems(c).length} 份`,
      amount: -undelivered,
      kind: "refund",
    });
  }
  c.settled = true;
}

/**
 * 离店判定使用严格大于：离店时点（承诺截止 + 安抚 − 扣减）当刻仍可交付，
 * 交付优先于离店；只有时间真正超过才离店。
 * 同一时刻多位客人离店时，按离店时点、再按订单号稳定排序。
 */
export function expire(g: Game) {
  const limitOf = (o: Order) =>
    o.commitment ? departureLimit(o.commitment) : o.deadline;
  const leaving = activeOrders(g)
    .filter((o) => g.time > limitOf(o))
    .sort((a, b) => limitOf(a) - limitOf(b) || a.id - b.id);

  for (const o of leaving) {
    const c = o.commitment;
    if (c) {
      compensate(g, o);
      g.notice = `${o.guest} 未按承诺上齐，补偿 ¥${c.penalty}`;
    } else {
      g.entries.push({
        id: g.nextId++,
        time: g.time,
        label: `${o.guest} 等待超时`,
        amount: -5,
        kind: "miss",
      });
      g.notice = `${o.guest} 离店，损失 ¥5`;
    }
    o.status = "left";
    g.missed++;
    g.combo = 0;
    if (g.selectedOrder === o.id) g.selectedOrder = null;
  }
}

export function arrive(g: Game) {
  if (g.time >= 150 || activeOrders(g).length >= 6) return;
  const seq = Math.floor(g.time / 18);
  const list = ["steak", "pasta", "salad"] as const;
  g.orders.push({
    id: g.nextId++,
    recipe: list[seq % 3],
    guest: ["阿宁", "许小姐", "赵先生", "晓晴"][seq % 4],
    arrived: g.time,
    deadline: g.time + 60 + (seq % 3) * 5,
    status: "waiting",
    commitment: null,
  });
}
