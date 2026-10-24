<template>
  <div class="stat-card" :class="`stat-card--${tone}`">
    <div class="stat-card__icon"><component :is="icon" :size="22" /></div>
    <div class="stat-card__body">
      <div class="stat-card__label">{{ label }}</div>
      <div class="stat-card__value">{{ value }}</div>
      <div v-if="note" class="stat-card__note">{{ note }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  label: string;
  value: string;
  note?: string;
  icon: Component;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'error';
}>();
</script>

<style scoped>
.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  border-radius: var(--sa-radius);
  background: var(--sa-card);
  box-shadow: var(--sa-shadow);
  padding: 22px 24px;
}

.stat-card__icon {
  display: grid;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: var(--sa-soft);
  color: rgb(var(--v-theme-primary));
}

.stat-card--success .stat-card__icon { background: rgba(var(--v-theme-success), 0.14); color: rgb(var(--v-theme-success)); }
.stat-card--warning .stat-card__icon { background: rgba(var(--v-theme-warning), 0.16); color: rgb(var(--v-theme-warning)); }
.stat-card--error .stat-card__icon { background: rgba(var(--v-theme-error), 0.14); color: rgb(var(--v-theme-error)); }

.stat-card__body { min-width: 0; }
.stat-card__label { color: var(--sa-muted); font-size: 12px; font-weight: 500; }
.stat-card__value { margin-top: 4px; font-size: 26px; font-weight: 800; letter-spacing: -0.03em; color: var(--sa-text); }
.stat-card__note { margin-top: 3px; color: var(--sa-subtle); font-size: 11px; }
</style>
