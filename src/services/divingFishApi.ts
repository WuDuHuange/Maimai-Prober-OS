import type { SongItem, PlayerRecordsResponse } from '@/types/sync';
import { API_BASE } from '@/types/sync';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${endpoint}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string> || {}) },
    ...options,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`API ${endpoint} => ${resp.status}: ${text || resp.statusText}`);
  }
  return resp.json();
}

// Public: get song list (supports ETag)
export async function fetchSongList(etag?: string): Promise<{ songs: SongItem[]; etag: string | null }> {
  const headers: Record<string, string> = {};
  if (etag) headers['If-None-Match'] = etag;
  const resp = await fetch(`${API_BASE}/music_data`, { headers });
  if (resp.status === 304) return { songs: [], etag: etag! };
  if (!resp.ok) throw new Error(`获取歌曲列表失败: ${resp.status}`);
  const data: SongItem[] = await resp.json();
  const newEtag = resp.headers.get('etag');
  return { songs: data, etag: newEtag };
}

// Import-Token auth: get player full records
export async function fetchPlayerRecords(importToken: string): Promise<PlayerRecordsResponse> {
  return request<PlayerRecordsResponse>('/player/records', {
    headers: { 'Import-Token': importToken },
  });
}

// Public: get simplified b50 (POST with username)
export async function queryPlayerB50(username: string): Promise<PlayerRecordsResponse> {
  return request<PlayerRecordsResponse>('/query/player', {
    method: 'POST',
    body: JSON.stringify({ username, b50: '1' }),
  });
}
