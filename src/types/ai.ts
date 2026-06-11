export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface CoachAnalysisRequest {
  recentFails: string;
  playerRating: number;
  focusArea?: string;
}
