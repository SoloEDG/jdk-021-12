<script setup lang="ts">
import type { Game, Command } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
import { servingQuality, servicePair } from "../lib/freshness";
import {
  compensationLabel,
  remainingValue,
  undeliveredItems,
  itemProgress,
} from "../../orders/lib/commitment";
import { promiseWait } from "../../orders/lib/patience";
defineProps<{ game: Game }>();
defineEmits<{ command: [cmd: Command] }>();
</script>
<template>
  <section class="panel service-panel">
    <span class="eyebrow">04 / PASS & SERVE</span>
    <h2>装盘与上菜 <span class="small">SERVE</span></h2>
    <div class="dish-list">
      <article
        v-for="d in game.dishes"
        :key="d.id"
        class="dish-row"
        :class="{ selected: game.selectedDish === d.id }"
      >
        <span class="dish-icon">{{ recipes[d.recipe].icon }}</span>
        <div>
          <b>{{ recipes[d.recipe].name }}</b
          ><small
            >品质 {{ servingQuality(game, d) }} ·
            {{ d.stage === "plated" ? "已装盘" : "待装盘" }}</small
          >
        </div>
        <button
          class="tiny soft"
          @click="
            $emit('command', {
              type: d.stage === 'counter' ? 'plate' : 'select-dish',
              id: d.id,
            })
          "
        >
          {{ d.stage === "counter" ? "装盘" : "选择" }}</button
        ><button
          class="trash"
          aria-label="丢弃菜品"
          @click="$emit('command', { type: 'discard', id: d.id })"
        >
          ×
        </button>
      </article>
      <div v-if="!game.dishes.length" class="empty plate-empty">
        <div>◌</div>
        这里等待你的第一道美味<small>起锅 → 装盘 → 选择订单 → 上菜</small>
      </div>
    </div>
    <div class="delivery-target">
      上菜目标：<b>{{ servicePair(game).order?.guest || "尚未选择订单" }}</b>
      <template v-if="servicePair(game).order?.commitment">
        <span class="target-line">
          承诺截止 {{ promiseWait(game, servicePair(game).order!) }}s ·
          {{ itemProgress(servicePair(game).order!) }} · 待上
          {{ undeliveredItems(servicePair(game).order!.commitment!).length }}
          份 · {{ compensationLabel(servicePair(game).order!) }}
        </span>
        <span class="target-line">
          未完成部分价值 ¥{{ remainingValue(servicePair(game).order!.commitment!) }}
        </span>
      </template>
    </div>
    <button class="serve-button" @click="$emit('command', { type: 'serve' })">
      上菜 <span>↗</span>
    </button>
    <p class="muted">
      错配扣10秒耐心 · 起锅15秒后开始失温 · 分次安抚只推迟离店，不会让失温的菜回温
    </p>
  </section>
</template>
