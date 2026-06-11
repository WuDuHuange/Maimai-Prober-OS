import { defineStore } from 'pinia';
import { ref } from 'vue';
import { db } from '@/services/db';

export const useNoteStore = defineStore('note', () => {
  const currentSongId = ref<number | null>(null);
  const currentDifficulty = ref('master');
  const noteContent = ref('');

  async function loadNote(songId: number, difficulty: string) {
    currentSongId.value = songId;
    currentDifficulty.value = difficulty;
    const note = await db.songNotes.get([songId, difficulty]);
    noteContent.value = note?.content ?? '';
  }

  async function saveNote() {
    if (currentSongId.value == null) return;
    await db.songNotes.put({
      songId: currentSongId.value,
      difficulty: currentDifficulty.value,
      content: noteContent.value,
      updatedAt: new Date().toISOString(),
    });
  }

  function clearNote() {
    currentSongId.value = null;
    currentDifficulty.value = 'master';
    noteContent.value = '';
  }

  return {
    currentSongId, currentDifficulty, noteContent,
    loadNote, saveNote, clearNote,
  };
});
