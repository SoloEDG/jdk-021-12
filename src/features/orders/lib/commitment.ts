import type {
  Commitment,
  CommitmentItem,
  Game,
  Order,
  RecipeId,
  ServiceMode,
} from "../../../shared/types";
import { recipes } from "../../../shared/catalog";

/**
 * 三种服务承诺。
 * - 普通：沿用接单时的原始等待剩余，不收费。
 * - 加急：承诺时限压到剩余的 60%（至少 8 秒），接单即收 25% 附加费。
 * - 分次：沿用原始剩余，拆成两份；首份交付后安抚 12 秒。
 *
 * 所有数值都只在接单瞬间计算一次并写入 Commitment，之后不会跟随菜单变化。
 */
export const modeSpecs: Record<
  ServiceMode,
  {
    label: string;
    icon: string;
    factor: number;
    minSeconds: number;
    itemCount: number;
    surchargeRate: number;
    patienceBonus: number;
    note: string;
  }
> = {
  standard: {
    label: "普通",
    icon: "◷",
    factor: 1,
    minSeconds: 0,
    itemCount: 1,
    surchargeRate: 0,
    patienceBonus: 0,
    note: "保留原始等待期限，不收附加费",
  },
  rush: {
    label: "加急",
    icon: "⚡",
    factor: 0.6,
    minSeconds: 8,
    itemCount: 1,
    surchargeRate: 0.25,
    patienceBonus: 0,
    note: "承诺缩短 40%，加收 25% 附加费",
  },
  split: {
    label: "分次",
    icon: "⇉",
    factor: 1,
    minSeconds: 0,
    itemCount: 2,
    surchargeRate: 0,
    patienceBonus: 12,
    note: "分两份上，首份安抚 12 秒",
  },
};

/** 时间以 0.1 秒为粒度，统一舍入避免浮点漂移影响截止显示。 */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export const EXTENSION_SECONDS = 20;
export const EXTENSION_DISCOUNT_RATE = 0.1;
export const FAILURE_COMPENSATION_RATE = 0.3;
export const MIN_COMPENSATION = 6;

/** 加急按剩余时间缩短；普通与分次原样保留接单时的期限。 */
export function promiseSeconds(
  mode: ServiceMode,
  remaining: number,
): number {
  const spec = modeSpecs[mode];
  if (spec.factor >= 1) return remaining;
  return Math.max(spec.minSeconds, Math.round(remaining * spec.factor));
}

/** 只有能真正缩短承诺时，才允许选择加急。 */
export function canRush(order: Order, time: number): boolean {
  const remaining = order.deadline - time;
  return (
    remaining > modeSpecs.rush.minSeconds &&
    promiseSeconds("rush", remaining) < remaining
  );
}

/** 面板预览：此刻选择该承诺会得到的秒数。 */
export function previewSeconds(
  order: Order,
  time: number,
  mode: ServiceMode,
): number {
  return promiseSeconds(mode, Math.max(0, order.deadline - time));
}

function shareValue(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const values = Array.from({ length: count }, () => base);
  values[0] += total - base * count;
  return values;
}

/** 接单瞬间冻结价格、期限与菜品要求，之后不再重新计算。 */
export function buildCommitment(
  g: Game,
  order: Order,
  mode: ServiceMode,
): Commitment {
  const spec = modeSpecs[mode];
  const price = recipes[order.recipe].price;
  const values = shareValue(price, spec.itemCount);
  const items: CommitmentItem[] = values.map((value) => ({
    recipe: order.recipe,
    value,
    deliveredAt: null,
  }));
  const deadline = round1(
    g.time + promiseSeconds(mode, Math.max(0, order.deadline - g.time)),
  );
  const surcharge = Math.round(price * spec.surchargeRate);
  return {
    mode,
    acceptedAt: g.time,
    initialDeadline: deadline,
    deadline,
    patienceBonus: 0,
    patiencePenalty: 0,
    penalty: 0,
    unitPrice: price,
    items,
    surcharge,
    prepaid: mode === "split" ? price : 0,
    discount: 0,
    extensionUsed: false,
    surchargeCharged: false,
    discountApplied: false,
    appeased: false,
    settled: false,
    refunded: 0,
  };
}

/** 承诺截止之外，分次安抚与错菜扣减只影响真正离店的时点。 */
export function departureLimit(c: Commitment): number {
  return round1(c.deadline + c.patienceBonus - c.patiencePenalty);
}

export function remainingValue(c: Commitment): number {
  return c.items
    .filter((item) => item.deliveredAt === null)
    .reduce((sum, item) => sum + item.value, 0);
}

export function undeliveredItems(c: Commitment): CommitmentItem[] {
  return c.items.filter((item) => item.deliveredAt === null);
}

export function deliveredCount(c: Commitment): number {
  return c.items.filter((item) => item.deliveredAt !== null).length;
}

/** 面板上的补偿状态文案：未承诺 / 待履约 / 已延期 / 已补偿 / 已退未完成。 */
export function compensationLabel(order: Order): string {
  const c = order.commitment;
  if (!c) return "未承诺";
  if (order.status === "served") return "已履约";
  if (c.settled) {
    const parts: string[] = [];
    if (c.penalty > 0) parts.push(`已补偿 ¥${c.penalty}`);
    if (c.refunded > 0) parts.push(`退未完成 ¥${c.refunded}`);
    return parts.length ? parts.join(" · ") : "已结清";
  }
  const parts: string[] = ["待履约"];
  if (c.surcharge > 0) parts.push(`附加费 ¥${c.surcharge}`);
  if (c.extensionUsed) parts.push(`已延期 −¥${c.discount}`);
  if (c.appeased) parts.push(`已安抚 +${c.patienceBonus}s`);
  return parts.join(" · ");
}

export function extensionDiscount(c: Commitment): number {
  return Math.max(1, Math.round(c.unitPrice * EXTENSION_DISCOUNT_RATE));
}

export function itemProgress(order: Order): string {
  const c = order.commitment;
  if (!c) return "";
  return `${deliveredCount(c)} / ${c.items.length} 份`;
}

export function dishValue(
  recipe: RecipeId,
  quality: number,
  base = recipes[recipe].price,
) {
  return Math.round((base * Math.max(0, Math.min(100, quality))) / 100);
}
