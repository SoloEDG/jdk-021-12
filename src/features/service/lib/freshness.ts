import type { Dish, Game, Order } from "../../../shared/types";
import { acceptedOrders } from "../../orders/lib/patience";

/**
 * 菜品温度只随起锅后的时间下降，任何服务承诺（包括分次上菜的安抚）
 * 都不会让已经失温的菜重新变热。
 */
export function servingQuality(g: Game, d: Dish) {
  return Math.max(
    0,
    d.quality - Math.floor(Math.max(0, g.time - d.cookedAt - 15) * 2),
  );
}

export function servicePair(g: Game): { dish?: Dish; order?: Order } {
  return {
    dish: g.dishes.find((d) => d.id === g.selectedDish),
    order: acceptedOrders(g).find((o) => o.id === g.selectedOrder),
  };
}
