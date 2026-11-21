import type { Game } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
import { servingQuality, servicePair } from "../lib/freshness";
import {
  dishValue,
  departureLimit,
  remainingValue,
  undeliveredItems,
} from "../../orders/lib/commitment";

const WRONG_DISH_PENALTY = 10;
const REJECT_PENALTY = 8;
const MIN_ACCEPT_QUALITY = 30;

function pushEntry(
  g: Game,
  label: string,
  amount: number,
  kind: "sale" | "refund",
) {
  g.entries.push({ id: g.nextId++, time: g.time, label, amount, kind });
}

/**
 * 交付一份菜品。
 * - 价格使用接单快照中的 item.value，而不是当前菜单价。
 * - 分次承诺在接单时已预收全款，交付不再重复计入营业收入。
 * - 首份交付给一次性的安抚时间，只推迟离店时点，不影响菜品温度。
 */
export function deliver(g: Game) {
  const { dish, order } = servicePair(g);
  if (!dish || dish.stage !== "plated" || !order) {
    g.notice = "请选择已装盘菜品和已接订单";
    return;
  }
  const c = order.commitment;
  if (!c || c.settled) {
    g.notice = "该订单的承诺已经结清，不能再上菜";
    return;
  }
  if (g.time > departureLimit(c)) {
    g.notice = "承诺已超过离店时点，无法再交付";
    return;
  }

  const target = undeliveredItems(c)[0];
  if (!target) {
    g.notice = "该承诺没有待上的菜品";
    return;
  }
  if (dish.recipe !== target.recipe) {
    // 错配只削减耐心，不修改承诺截止，也不触发补偿或附加费。
    c.patiencePenalty += WRONG_DISH_PENALTY;
    g.combo = 0;
    g.notice = `上错菜！客人耐心减少 ${WRONG_DISH_PENALTY} 秒，菜品仍留在出餐台`;
    return;
  }

  const q = servingQuality(g, dish);
  if (q < MIN_ACCEPT_QUALITY) {
    c.patiencePenalty += REJECT_PENALTY;
    g.combo = 0;
    g.notice = `品质低于 ${MIN_ACCEPT_QUALITY}，客人拒收，耐心减少 ${REJECT_PENALTY} 秒`;
    return;
  }

  target.deliveredAt = g.time;
  g.dishes = g.dishes.filter((d) => d.id !== dish.id);
  g.selectedDish = null;

  const firstOfSplit = c.mode === "split" && !c.appeased;
  if (firstOfSplit) {
    c.appeased = true;
    c.patienceBonus = 12;
  }

  const completed = undeliveredItems(c).length === 0;
  if (c.prepaid === 0) {
    // 普通/加急：交付时按品质结算，单价来自接单快照。
    g.combo++;
    const amount =
      dishValue(target.recipe, q, target.value) +
      Math.min(10, (g.combo - 1) * 2);
    pushEntry(
      g,
      `${order.guest} · ${recipes[target.recipe].name}`,
      amount,
      "sale",
    );
  }

  if (!completed) {
    order.status = "partial";
    g.notice = firstOfSplit
      ? `第 1 份已上，客人安心了（离店时点 +${c.patienceBonus} 秒）；还剩 ${undeliveredItems(c).length} 份`
      : `已上 1 份，还剩 ${undeliveredItems(c).length} 份`;
    return;
  }

  c.settled = true;
  order.status = "served";
  g.served++;
  if (c.prepaid > 0) {
    // 分次预收款早已入账；完成时只记录连续交付，不重复计入收入。
    g.combo++;
    g.notice = `${order.guest} 的 ${c.items.length} 份已上齐，承诺完成`;
  } else {
    g.notice = `交付成功 · 连续交付 ${g.combo} 单`;
  }
  g.selectedOrder = null;
}
