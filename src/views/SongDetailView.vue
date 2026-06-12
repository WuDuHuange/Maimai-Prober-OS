<template>
  <div class="song-detail p-4 flex flex-col gap-4 h-full overflow-y-auto">
    <template v-if="!isNaN(songId) && songId > 0">
      <!-- 标题和难度选择 -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-lg font-bold">{{ song?.title ?? '未知曲目' }}</h1>
          <p v-if="song" class="text-xs text-text-muted mt-0.5">{{ song.artist }}</p>
        </div>
        <div class="flex gap-1">
          <button
            v-for="diff in availableDiffs"
            :key="diff"
            class="diff-btn"
            :class="{ active: selectedDiff === diff }"
            @click="selectDifficulty(diff)"
          >
            {{ diffLabel(diff) }}
          </button>
        </div>
      </div>

      <section class="chart-card">
        <h2 class="card-title">受苦进化史</h2>
        <div class="h-[220px]">
          <SongHistoryChart :records="historyRecords" />
        </div>
      </section>

      <section class="chart-card">
        <h2 class="card-title">判定偏差趋势</h2>
        <div class="h-[200px]">
          <JudgeScatterChart :records="historyRecords" />
        </div>
      </section>

      <section class="chart-card">
        <div class="flex items-center justify-between mb-2">
          <h2 class="card-title mb-0">谱面笔记</h2>
          <button class="save-btn" @click="handleSaveNote">保存笔记</button>
        </div>
        <MarkdownEditor v-model="noteContent" placeholder="在此记录机况、手法心得或读谱笔记..." />
      </section>
    </template>
    <div v-else class="flex items-center justify-center h-full text-text-muted text-sm">
      请从歌曲库中选择一首曲目查看详情
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useSongStore } from '@/stores/useSongStore';
import { usePlayLogStore } from '@/stores/usePlayLogStore';
import { db } from '@/services/db';
import SongHistoryChart from '@/components/charts/SongHistoryChart.vue';
import JudgeScatterChart from '@/components/charts/JudgeScatterChart.vue';
import MarkdownEditor from '@/components/notes/MarkdownEditor.vue';
import { DIFFICULTY_LIST, type DifficultyType } from '@/types/song';

const props = defineProps<{ songId?: number | null }>();
defineEmits<{ back: [] }>();

const route = useRoute();
const songStore = useSongStore();
const playLogStore = usePlayLogStore();

const songId = computed(() => props.songId ?? Number(route.params.songId));
const song = computed(() => songStore.getSong(songId.value));
const selectedDiff = ref<DifficultyType>('master');
const historyRecords = ref<any[]>([]);
const noteContent = ref('');

const availableDiffs = computed(() => {
  const s = song.value;
  if (!s) return [];
  return DIFFICULTY_LIST.filter(d => {
    const map: Record<string, number | null> = {
      basic: s.basicConst, advanced: s.advancedConst, expert: s.expertConst,
      master: s.masterConst, remaster: s.remasterConst,
    };
    return map[d] != null;
  });
});

async function selectDifficulty(d: DifficultyType) {
  const sid = songId.value;
  if (isNaN(sid) || sid <= 0) return;
  selectedDiff.value = d;
  historyRecords.value = await playLogStore.getSongHistory(sid, d);
  try {
    const note = await db.songNotes.get([sid, d]);
    noteContent.value = note?.content ?? '';
  } catch { noteContent.value = ''; }
}

function diffLabel(d: DifficultyType): string {
  const map: Record<string, string> = { basic: 'BAS', advanced: 'ADV', expert: 'EXP', master: 'MAS', remaster: 'ReM' };
  return map[d] ?? d.toUpperCase();
}

async function handleSaveNote() {
  const sid = songId.value;
  if (isNaN(sid) || sid <= 0) return;
  try {
    await db.songNotes.put({
      songId: sid,
      difficulty: selectedDiff.value,
      content: noteContent.value,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) { /* ignore */ }
}

onMounted(async () => {
  if (songStore.songs.size === 0) {
    await songStore.loadFromDB();
  }
  await selectDifficulty(selectedDiff.value);
});
</script>

<style scoped>
.chart-card {
  background-color: var(--bg-secondary);
  border-radius: 8px;
  padding: 16px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.diff-btn {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--bg-hover);
  background-color: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.diff-btn:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.diff-btn.active {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.note-editor {
  width: 100%;
  background-color: var(--bg-primary);
  border: 1px solid var(--bg-hover);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;
}

.note-editor:focus {
  border-color: var(--color-primary);
}

.save-btn {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  border: 1px solid var(--color-primary);
  background-color: transparent;
  color: var(--color-primary);
  cursor: pointer;
  transition: background-color 0.15s;
}

.save-btn:hover {
  background-color: rgba(99, 102, 241, 0.1);
}
</style>
