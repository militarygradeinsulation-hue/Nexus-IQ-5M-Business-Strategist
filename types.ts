
export interface Gap {
  title: string;
  description: string;
  severity: 'Critical' | 'Moderate' | 'Low';
  category: string;
}

export interface Solution {
  title: string;
  action: string;
  impact: string;
  breakdown?: string[];
  isLoadingBreakdown?: boolean;
}

export interface Pattern {
  name: string;
  status: 'Good' | 'Bad';
  reasoning: string;
  score: number;
}

export interface AnalysisResult {
  executiveSummary: string;
  businessIQRating: number;
  gaps: Gap[];
  solutions: Solution[];
  patterns: Pattern[];
  nextSteps: string[];
}

export interface GroundingChunk {
  web?: { uri: string; title: string };
  maps?: { uri: string; title: string };
}

export interface Message {
  role: 'user' | 'model';
  content: string;
  thinking?: string;
  grounding?: GroundingChunk[];
}
