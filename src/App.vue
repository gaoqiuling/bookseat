<template>
  <router-view v-slot="{ Component }">
    <keep-alive include="Overview">
      <component :is="Component" />
    </keep-alive>
  </router-view>
</template>
