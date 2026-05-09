export type GlossLessonDraft = {
  id: string;
  language: string;
  title: string;
  topicSuggestion: string;
  context: string;
  scenario: string;
  objective: string;
  sentences: string[];
  chunks: string[];
  source: "gloss";
  sourceScore: number;
  warnings: string[];
};

export type ApprovalResult = {
  ok: boolean;
  message: string;
};
