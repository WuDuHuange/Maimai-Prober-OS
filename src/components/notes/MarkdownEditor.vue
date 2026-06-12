<template>
  <div class="markdown-editor">
    <div class="toolbar">
      <button class="tb-btn" title="加粗" @click="insertMarkdown('**', '**')"><b>B</b></button>
      <button class="tb-btn" title="斜体" @click="insertMarkdown('*', '*')"><i>I</i></button>
      <button class="tb-btn" title="标题" @click="insertMarkdown('\n## ', '')">H</button>
      <button class="tb-btn" title="列表" @click="insertMarkdown('\n- ', '')">-</button>
      <button class="tb-btn" title="代码" @click="insertMarkdown('\n```\n', '\n```\n')">&lt;/&gt;</button>
      <button class="tb-btn" :class="{ active: showPreview }" @click="showPreview = !showPreview">预览</button>
    </div>

    <div class="editor-body">
      <textarea
        v-if="!showPreview"
        ref="textareaEl"
        v-model="content"
        class="edit-area"
        :placeholder="placeholder"
        @input="handleInput"
      />
      <div v-else class="preview-area" v-html="renderedHTML" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { marked } from 'marked';

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const content = ref(props.modelValue);
const textareaEl = ref<HTMLTextAreaElement | null>(null);
const showPreview = ref(false);

const renderedHTML = computed(() => {
  try {
    return marked(content.value || '') as string;
  } catch {
    return content.value;
  }
});

function handleInput() {
  emit('update:modelValue', content.value);
}

function insertMarkdown(before: string, after: string) {
  const ta = textareaEl.value;
  if (!ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const selected = content.value.slice(start, end);

  content.value =
    content.value.slice(0, start) +
    before +
    selected +
    after +
    content.value.slice(end);

  emit('update:modelValue', content.value);

  nextTick(() => {
    ta.focus();
    ta.selectionStart = start + before.length;
    ta.selectionEnd = start + before.length + selected.length;
  });
}
</script>

<style scoped>
.markdown-editor {
  border: 1px solid var(--bg-hover);
  border-radius: 6px;
  overflow: hidden;
}

.toolbar {
  display: flex;
  gap: 2px;
  padding: 4px 6px;
  background-color: var(--bg-primary);
  border-bottom: 1px solid var(--bg-hover);
}

.tb-btn {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 13px;
  border: none;
  background-color: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.tb-btn:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.tb-btn.active {
  background-color: var(--color-primary);
  color: white;
}

.edit-area {
  width: 100%;
  min-height: 120px;
  padding: 12px;
  background-color: var(--bg-primary);
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'Courier New', monospace;
  line-height: 1.6;
  outline: none;
  resize: vertical;
}

.edit-area::placeholder {
  color: var(--text-muted);
}

.preview-area {
  padding: 12px;
  min-height: 120px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
}

.preview-area :deep(h1), .preview-area :deep(h2), .preview-area :deep(h3) {
  margin-bottom: 8px;
  font-weight: 600;
}

.preview-area :deep(p) {
  margin-bottom: 8px;
}

.preview-area :deep(code) {
  background-color: var(--bg-card);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
}

.preview-area :deep(pre) {
  background-color: var(--bg-card);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin-bottom: 8px;
}

.preview-area :deep(ul), .preview-area :deep(ol) {
  padding-left: 20px;
  margin-bottom: 8px;
}
</style>
