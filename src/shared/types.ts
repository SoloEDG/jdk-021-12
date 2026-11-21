export type RecipeId = "steak" | "pasta" | "salad";
export type Ingredient = "beef" | "noodle" | "greens";
export interface Recipe {
  id: RecipeId;
  name: string;
  icon: string;
  ingredient: Ingredient;
  station: "pan" | "pot";
  target: number;
  price: number;
}

/** 客人可以选择的服务承诺类型。 */
export type ServiceMode = "standard" | "rush" | "split";

/** 承诺中的一份菜品要求。deliveredAt 为 null 表示尚未交付。 */
export interface CommitmentItem {
  recipe: RecipeId;
  /** 接单时锁定的单份价值（分次承诺把总价拆成多份）。 */
  value: number;
  deliveredAt: number | null;
}

/**
 * 接单时冻结下来的服务承诺。
 * unitPrice / items / initialDeadline 都是接单瞬间的快照，之后不会随菜单变化。
 * deadline 只会因为“顾客同意延期”而改变；分次上菜的安抚另记在 patienceBonus 中。
 */
export interface Commitment {
  mode: ServiceMode;
  acceptedAt: number;
  /** 接单瞬间的原始期限快照，用于对照展示，永不修改。 */
  initialDeadline: number;
  /** 承诺截止时间；只有顾客同意延期时才会增加。 */
  deadline: number;
  /** 分次上菜首份交付后的临时安抚，只影响离店时点，不影响菜品温度。 */
  patienceBonus: number;
  /** 上错菜或品质被拒造成的耐心扣减，同样不修改承诺截止。 */
  patiencePenalty: number;
  /** 已支付的超时补偿。 */
  penalty: number;
  /** 接单瞬间锁定的单价。 */
  unitPrice: number;
  /** 接单瞬间锁定的菜品要求快照。 */
  items: CommitmentItem[];
  surcharge: number;
  /** 分次承诺在接单时预收的总额；普通/加急为 0。 */
  prepaid: number;
  discount: number;
  extensionUsed: boolean;
  surchargeCharged: boolean;
  discountApplied: boolean;
  /** 分次上菜是否已经发放过安抚时间。 */
  appeased: boolean;
  settled: boolean;
  refunded: number;
}

export type OrderStatus =
  | "waiting"
  | "accepted"
  | "served"
  | "partial"
  | "left";

export interface Order {
  id: number;
  recipe: RecipeId;
  guest: string;
  arrived: number;
  /** 原始等待期限：接单前适用，接单后保留用于对照展示。 */
  deadline: number;
  status: OrderStatus;
  commitment: Commitment | null;
}
export interface Portion {
  id: number;
  recipe: RecipeId;
  preparedAt: number;
}
export interface Stove {
  id: number;
  kind: "pan" | "pot";
  portion: Portion | null;
  started: number;
}
export interface Dish {
  id: number;
  recipe: RecipeId;
  quality: number;
  cookedAt: number;
  stage: "counter" | "plated";
}
export interface Entry {
  id: number;
  time: number;
  label: string;
  amount: number;
  kind:
    | "sale"
    | "waste"
    | "miss"
    | "supply"
    | "refund"
    | "discount"
    | "compensation";
}
export interface Game {
  time: number;
  duration: number;
  running: boolean;
  ended: boolean;
  nextId: number;
  selectedOrder: number | null;
  selectedDish: number | null;
  orders: Order[];
  stock: Record<Ingredient, number>;
  portions: Portion[];
  stoves: Stove[];
  dishes: Dish[];
  entries: Entry[];
  combo: number;
  served: number;
  missed: number;
  notice: string;
  best: number;
}
export type Command =
  | { type: "accept"; id: number; mode?: ServiceMode }
  | { type: "extend"; id: number }
  | { type: "abandon"; id: number }
  | { type: "select-order"; id: number }
  | { type: "prepare"; recipe: RecipeId }
  | { type: "cook"; portion: number; stove: number }
  | { type: "lift"; id: number }
  | { type: "plate"; id: number }
  | { type: "select-dish"; id: number }
  | { type: "serve" }
  | { type: "discard"; id: number }
  | { type: "restock"; ingredient: Ingredient };
