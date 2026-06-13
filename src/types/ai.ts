export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** 思考链内容（DeepSeek R1 / Gemini Thinking 等模型的推理过程） */
  thinking?: string;
  timestamp: string;
}

export interface CoachAnalysisRequest {
  recentFails: string;
  playerRating: number;
  focusArea?: string;
}
