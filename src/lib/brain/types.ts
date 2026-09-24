import type {
  Task, Topic, Course, Goal, Identity, JournalEntry, Memory,
  QuizAttempt, Habit, ClassSession, AloraProfile,
} from '@/lib/types';

export type ContextType =
  | 'daily' | 'academic' | 'planning' | 'chat' | 'goals'
  | 'journal' | 'creative' | 'personal' | 'quiz' | 'full';

export type MemoryType = 'explicit' | 'inferred' | 'system_fact';
export type MemoryStatus = 'active' | 'dismissed' | 'incorrect';

export interface ActivityEvent {
  id: string;
  user_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface InsightRecord {
  id: string;
  user_id: string;
  insight_type: string;
  title: string;
  description: string;
  evidence: EvidenceItem[];
  severity: 'info' | 'warning' | 'positive';
  is_dismissed: boolean;
  created_at: string;
}

export interface EvidenceItem {
  source: string;
  detail: string;
}

export interface ChatConversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRecord {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ExtendedMemory extends Memory {
  memory_type: MemoryType;
  confidence: number;
  status: MemoryStatus;
  last_accessed: string | null;
  last_reinforced: string | null;
  recurrence_count: number;
  evidence: Record<string, unknown>[];
}

export interface StudentContext {
  profile: AloraProfile | null;
  tasks: Task[];
  courses: Course[];
  topics: Topic[];
  recentClasses: ClassSession[];
  quizAttempts: QuizAttempt[];
  goals: Goal[];
  identities: Identity[];
  habits: Habit[];
  journalEntries: JournalEntry[];
  memories: ExtendedMemory[];
  activityEvents: ActivityEvent[];
  insights: InsightRecord[];
  streak: number;
  quizAverage: number;
  overdueTasks: Task[];
  upcomingTasks: Task[];
  todayTasks: Task[];
  weakTopics: { name: string; confidence: number; reasons: string[] }[];
  strongTopics: string[];
  activeGoals: Goal[];
  completedTasksThisWeek: number;
  totalTasksThisWeek: number;
}

export interface ContextQueryOptions {
  contextType: ContextType;
  limit?: number;
  since?: Date;
}

export type EventType =
  | 'task_created' | 'task_completed' | 'task_postponed' | 'task_deleted'
  | 'quiz_started' | 'quiz_completed' | 'question_answered' | 'mistake_recorded'
  | 'topic_reviewed' | 'topic_mastery_changed'
  | 'class_logged' | 'journal_created' | 'journal_saved_to_memory'
  | 'goal_created' | 'goal_progress_updated' | 'goal_completed'
  | 'habit_completed' | 'habit_skipped'
  | 'memory_created' | 'memory_updated' | 'memory_corrected'
  | 'world_created' | 'world_activated' | 'world_theme_changed'
  | 'identity_created' | 'identity_progress_updated'
  | 'chat_message_sent' | 'chat_conversation_created' | 'distress_flagged';
