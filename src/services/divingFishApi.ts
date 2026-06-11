import type { PlayerProfile, PlayRecordItem, SongItem } from '@/types/sync';

const API_BASE = 'https://www.diving-fish.com/api/maimaidx';

async function request<T>(endpoint: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, { headers });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`API ${endpoint} 返回 ${response.status}: ${text || response.statusText}`);
  }

  return response.json();
}

export async function fetchPlayerProfile(token: string): Promise<PlayerProfile> {
  const data = await request<any>('/player/profile', token);
  return {
    nickname: data.nickname ?? '',
    rating: data.rating ?? 0,
    additionalRating: data.additional_rating ?? 0,
    plate: data.plate ?? '',
    courseRank: data.course_rank ?? 0,
    classRank: data.class_rank ?? 0,
    trophy: data.trophy ?? { title: '', color: '' },
  };
}

export async function fetchPlayerRecords(token: string): Promise<PlayRecordItem[]> {
  const data = await request<{ records: PlayRecordItem[] }>('/player/records', token);
  return data.records ?? [];
}

export async function fetchSongList(): Promise<SongItem[]> {
  const data = await request<{ songs: SongItem[] }>('/song/list');
  return data.songs ?? [];
}
