<script setup lang="ts">
import type { Game, Command } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
import { activeOrders } from "../lib/patience";
import { compensationLabel, modeSpecs } from "../lib/commitment";
import OrderCard from "./OrderCard.vue";
const closed = (g: Game) =>
  g.orders
    .filter((o) => o.commitment && (o.status === "served" || o.status === "left"))
    .slice(-4)
    .reverse();
defineProps<{ game: Game }>();
defineEmits<{ command: [cmd: Command] }>();
</script>
<template>
  <section class="orders-section">
    <div class="section-heading">
      <div>
        <span class="eyebrow">01 / FRONT OF HOUSE</span>
        <h2>
          今日订单 <span class="count">{{ activeOrders(game).length }}</span>
        </h2>
      </div>
      <span class="muted">
        点单后选择承诺 · 接受即冻结价格、期限与菜品 · 截止当刻仍可交付，超过才离店
      </span>
    </div>
    <div class="tickets">
      <OrderCard
        v-for="o in activeOrders(game)"
        :key="o.id"
        :order="o"
        :game="game"
        @accept="(id, mode) => $emit('command', { type: 'accept', id, mode })"
        @select="(id) => $emit('command', { type: 'select-order', id })"
        @extend="(id) => $emit('command', { type: 'extend', id })"
        @abandon="(id) => $emit('command', { type: 'abandon', id })"
      />
      <div v-if="!activeOrders(game).length" class="empty">
        餐厅暂时安静，整理一下厨房吧。
      </div>
    </div>
    <div v-if="closed(game).length" class="commit-history">
      <span class="eyebrow">承诺结算</span>
      <span v-for="o in closed(game)" :key="o.id" class="history-item">
        {{ recipes[o.recipe].icon }} #{{ String(o.id).padStart(3, "0") }} ·
        {{ modeSpecs[o.commitment!.mode].label }} · {{ compensationLabel(o) }}
      </span>
    </div>
  </section>
</template>
