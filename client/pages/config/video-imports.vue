<template>
  <app-settings-content :header-text="$strings.HeaderVideoImports">
    <p class="text-sm text-gray-300 mb-4">{{ $strings.MessageVideoLibraryHelp }}</p>
    <ui-btn :disabled="loading" @click="refresh">{{ $strings.ButtonRefresh }}</ui-btn>
    <p v-if="error" role="alert" class="text-error mt-4">{{ error }}</p>
    <p v-else-if="!loading && !enabled" class="mt-4">{{ $strings.MessageVideoDisabled }}</p>
    <p v-else-if="!loading && !records.length" class="mt-4">{{ $strings.MessageVideoImportsEmpty }}</p>
    <ul v-else class="mt-4">
      <li v-for="record in records" :key="record.id" class="p-4 mb-2 border border-white/10 rounded">
        <nuxt-link :to="`/item/${record.libraryItemId}`" class="font-semibold hover:underline">{{ record.manifest.title || record.id }}</nuxt-link>
        <p class="text-sm mt-1" :class="record.state === 'ready' ? 'text-success' : 'text-warning'">{{ record.state }} · {{ $strings.LabelLastUpdate }}: {{ new Date(record.updatedAt).toLocaleString() }}</p>
        <p v-if="record.error" class="text-sm text-error mt-2">{{ record.error }}</p>
      </li>
    </ul>
  </app-settings-content>
</template>

<script>
export default {
  data: () => ({ records: [], enabled: false, loading: false, error: null }),
  methods: {
    async refresh() {
      this.loading = true
      this.error = null
      try {
        const capabilities = await this.$axios.$get('/api/capabilities')
        this.enabled = capabilities.videoPodcastsV1
        this.records = this.enabled ? await this.$axios.$get('/api/video-imports') : []
      } catch (error) {
        this.error = error.response?.data?.error || error.message
      } finally {
        this.loading = false
      }
    }
  },
  mounted() { this.refresh() }
}
</script>
