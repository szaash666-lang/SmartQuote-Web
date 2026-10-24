<script setup lang="ts">
import PlatformConversationPage from "@/views/chat/PlatformConversationPage.vue";

withDefaults(defineProps<{ active?: boolean }>(), {
  active: true,
});
</script>

<template>
  <PlatformConversationPage :active="active" />
</template>
