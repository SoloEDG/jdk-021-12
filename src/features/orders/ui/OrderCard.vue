<script setup lang="ts">
import type { Game, Order, ServiceMode } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
import { originalWait, patience, promiseWait } from "../lib/patience";
import {
  canRush,
  compensationLabel,
  deliveredCount,
  extensionDiscount,
  modeSpecs,
  previewSeconds,
} from "../lib/commitment";
defineProps<{ order: Order; game: Game }>();
defineEmits<{
  accept: [id: number, mode: ServiceMode];
  select: [id: number];
  extend: [id: number];
  abandon: [id: number];
}>();
const modes: ServiceMode[] = ["standard", "rush", "split"];
</script>
<template>
  <article
    class="ticket"
    :class="{
      selected: game.selectedOrder === order.id,
      urgent: patience(game, order) < 0.25,
      committed: !!order.commitment,
      partial: order.status === 'partial',
    }"
  >
    <div class="ticket-top">
      <b>#{{ String(order.id).padStart(3, "0") }}</b>
      <span v-if="order.commitment" class="mode-chip">
        {{ modeSpecs[order.commitment.mode].icon }}
        {{ modeSpecs[order.commitment.mode].label }}承诺
      </span>
      <span v-else class="wait-chip">原等待 {{ originalWait(game, order) }}s</span>
    </div>
    <div class="ticket-dish">
      <span>{{ recipes[order.recipe].icon }}</span
      ><strong>{{ recipes[order.recipe].name }}</strong>
    </div>
    <div class="muted">
      {{ order.guest }} · 锁定价 ¥{{
        order.commitment?.unitPrice ?? recipes[order.recipe].price
      }}
    </div>

    <template v-if="order.status === 'waiting'">
      <div class="patience pending">
        <i :style="{ width: patience(game, order) * 100 + '%' }"></i>
      </div>
      <div class="mode-picker">
        <button
          v-for="mode in modes"
          :key="mode"
          class="mode-button"
          :disabled="mode === 'rush' && !canRush(order, game.time)"
          @click="$emit('accept', order.id, mode)"
        >
          <b>{{ modeSpecs[mode].icon }} {{ modeSpecs[mode].label }}</b>
          <small v-if="mode === 'standard'">
            承诺 {{ previewSeconds(order, game.time, mode) }}s · ¥0
          </small>
          <small v-else-if="mode === 'rush'">
            承诺 {{ previewSeconds(order, game.time, mode) }}s · 加收 ¥{{
              Math.round(
                recipes[order.recipe].price * modeSpecs.rush.surchargeRate,
              )
            }}
          </small>
          <small v-else>
            承诺 {{ previewSeconds(order, game.time, mode) }}s · 首份安抚
            {{ modeSpecs.split.patienceBonus }}s
          </small>
        </button>
      </div>
      <div class="ticket-hint">接受后价格、期限与菜品即冻结</div>
    </template>

    <template v-else-if="order.commitment">
      <div class="commit-grid">
        <div>
          <small>原始等待</small>
          <b>{{ originalWait(game, order) }}s</b>
        </div>
        <div>
          <small>承诺截止</small>
          <b>{{ promiseWait(game, order) }}s</b>
          <small v-if="order.commitment.extensionUsed" class="ext-note">
            原承诺第 {{ Math.ceil(order.commitment.initialDeadline) }} 秒
          </small>
        </div>
      </div>
      <div class="commit-meta">
        <span :class="{ paid: order.commitment.settled }">
          补偿：{{ compensationLabel(order) }}
        </span>
        <span v-if="order.commitment.items.length > 1">
          已上 {{ deliveredCount(order.commitment) }}/{{
            order.commitment.items.length
          }}
          份
        </span>
      </div>
      <div class="patience dual">
        <i :style="{ width: patience(game, order) * 100 + '%' }"></i>
      </div>
      <div class="ticket-actions">
        <button class="soft" @click="$emit('select', order.id)">
          {{
            game.selectedOrder === order.id ? "已选为上菜目标" : "选择上菜目标"
          }}
        </button>
        <button
          v-if="!order.commitment.extensionUsed"
          class="tiny soft"
          @click="$emit('extend', order.id)"
        >
          请求延期 −¥{{ extensionDiscount(order.commitment) }}
        </button>
        <button
          v-else
          class="tiny soft"
          disabled
          title="每位客人只能同意一次延期"
        >
          已延期
        </button>
        <button
          v-if="order.status === 'partial' && order.commitment.mode === 'split'"
          class="tiny abandon"
          @click="$emit('abandon', order.id)"
        >
          放弃剩余
        </button>
      </div>
    </template>
  </article>
</template>
