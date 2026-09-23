export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface ChatContext {
  userName: string;
  recentClasses: { course: string; title: string; date: string }[];
  upcomingTasks: { title: string; deadline: string; priority: string }[];
  overdueTasks: { title: string; deadline: string }[];
  weakTopics: string[];
  strongTopics: string[];
  goals: { title: string; progress: number }[];
  identities: { name: string; progress: number }[];
  streak: number;
  quizAvgScore: number;
}

export interface AIChatResponse {
  message: string;
  insights: string[];
  suggestedActions: string[];
}

export interface AIQuizQuestion {
  question_type: 'mcq' | 'short_answer' | 'explain' | 'scenario' | 'problem_solving' | 'reverse' | 'lateral' | 'cross_topic';
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface AIClassSummary {
  course: string;
  topics: string[];
  understanding: 'low' | 'medium' | 'high';
  weakAreas: string[];
  tasks: { title: string; deadline: string }[];
  questions: string[];
  learnings: string[];
}

export interface AITaskExtraction {
  tasks: { title: string; deadline: string; priority: string; category: string }[];
}

export interface AIReflection {
  patterns: string[];
  insights: string[];
  challenges: string[];
  suggestedActions: string[];
}

export interface AINovelCuration {
  curatedContent: string;
  aiSuggestions: { type: string; content: string }[];
}

export interface MemorySearchResult {
  memoryId: string;
  content: string;
  relevanceScore: number;
  category: string;
}

export interface AIProvider {
  name: string;
  chat(messages: ChatMessage[], context: ChatContext): Promise<AIChatResponse>;
  generateQuiz(topics: string[], weakTopics: string[], mix: { recent: number; older: number; weak: number; upcoming: number; lateral: number }): Promise<AIQuizQuestion[]>;
  summarizeClass(rawInput: string): Promise<AIClassSummary>;
  extractTasks(rawInput: string): Promise<AITaskExtraction>;
  reflect(journalEntries: string[]): Promise<AIReflection>;
  curateNovelScene(rawContent: string): Promise<AINovelCuration>;
  searchMemories(query: string, memories: { id: string; content: string; category: string }[]): Promise<MemorySearchResult[]>;
}

export const ALORA_SYSTEM_PROMPT = `You are ALORA — a personal AI agent and operating system for one user.

Your personality:
- Intelligent, warm, perceptive, direct, playful, ambitious, emotionally aware
- Occasionally sarcastic but never cruel
- Never robotic or generic
- You are "the smartest person in the room who genuinely wants the user to win"

Your principles:
- NEVER simply agree with the user if they are making excuses, avoiding work, or making poor decisions
- Respectfully point out contradictions, procrastination, and self-deception
- Use the user's actual stored data to answer questions — never fabricate memories
- If information isn't available, say so honestly
- When the user is emotionally distressed: acknowledge the feeling, understand the situation, separate feelings from facts, identify patterns, challenge unhealthy thinking, suggest a realistic next action
- You are NOT a licensed therapist — do not present yourself as one
- If the user expresses risk of self-harm, prioritize crisis/safety guidance

Always respond in a natural, human voice. Be concise but substantive.`;

export function detectEmotionalDistress(message: string): boolean {
  const distressPatterns = [
    /\b(can't|cannot)\s+(do|handle|take)\s+(it|this|anymore)\b/i,
    /\b(useless|worthless|hopeless|pointless)\b/i,
    /\b(give up|giving up)\b/i,
    /\b(end it all|end everything)\b/i,
    /\b(hurt myself|harming myself|self.?harm)\b/i,
    /\b(kill myself|suicide|suicidal)\b/i,
    /\b(nobody cares|no one cares)\b/i,
    /\b(better off (dead|gone|without me))\b/i,
  ];
  return distressPatterns.some((p) => p.test(message));
}

export function detectEmotionalState(message: string): string[] {
  const states: string[] = [];
  if (/\b(overwhelm|overwhelmed|drowning|buried|swamped)\b/i.test(message)) states.push('overwhelmed');
  if (/\b(sad|down|depressed|unhappy|miserable)\b/i.test(message)) states.push('sad');
  if (/\b(unmotivated|no motivation|can't be bothered|lazy|apathetic)\b/i.test(message)) states.push('unmotivated');
  if (/\b(anxious|anxiety|panicking|worried|nervous|stress)\b/i.test(message)) states.push('anxious');
  if (/\b(lost|confused|don't know what|no direction)\b/i.test(message)) states.push('lost');
  if (/\b(frustrat|angry|furious|irritated|annoyed)\b/i.test(message)) states.push('frustrated');
  if (/\b(burnt? ?out|burned out|exhausted|drained|depleted)\b/i.test(message)) states.push('burnt out');
  if (/\b(disappoint|let down|failed|failure)\b/i.test(message)) states.push('disappointed');
  return states;
}

export const CRISIS_RESOURCES = `If you're in immediate danger or having thoughts of self-harm, please reach out right now:
- National Suicide Prevention Lifeline (US): 988 or 1-800-273-8255
- Crisis Text Line: Text HOME to 741741
- International: findahelpline.com

You matter. Please talk to someone who can help right now.`;
