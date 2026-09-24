export type UnderstandingLevel = 'low' | 'medium' | 'high';
export type TopicStatus = 'not_started' | 'introduced' | 'learning' | 'understood' | 'strong' | 'mastered';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'completed';
export type MemoryCategory =
  | 'academic'
  | 'personal'
  | 'goals'
  | 'preferences'
  | 'habits'
  | 'patterns'
  | 'projects'
  | 'important_events'
  | 'creative_ideas';

export interface AcademicYear {
  id: string;
  user_id: string;
  label: string;
  start_date: string | null;
  end_date: string | null;
  position: number;
  archived: boolean;
  created_at: string;
}

export interface Semester {
  id: string;
  academic_year_id: string;
  user_id: string;
  label: string;
  start_date: string | null;
  end_date: string | null;
  position: number;
  archived: boolean;
  created_at: string;
}

export interface Course {
  id: string;
  semester_id: string;
  user_id: string;
  name: string;
  course_code: string;
  professor: string;
  description: string;
  understanding_level: UnderstandingLevel;
  confidence_level: UnderstandingLevel;
  weak_topics: string[];
  strong_topics: string[];
  color: string;
  position: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Module {
  id: string;
  course_id: string;
  user_id: string;
  name: string;
  description: string;
  position: number;
  archived: boolean;
  created_at: string;
}

export interface Topic {
  id: string;
  module_id: string;
  user_id: string;
  name: string;
  description: string;
  is_weak: boolean;
  is_strong: boolean;
  understanding_level: UnderstandingLevel;
  confidence: number;
  last_studied: string | null;
  review_count: number;
  mistakes: string[];
  status: TopicStatus;
  archived: boolean;
  created_at: string;
}

export interface ClassSession {
  id: string;
  topic_id: string | null;
  course_id: string;
  user_id: string;
  title: string;
  session_date: string;
  created_at: string;
}

export interface ClassLog {
  id: string;
  class_id: string;
  user_id: string;
  raw_thoughts: string;
  structured_notes: Record<string, unknown>;
  understanding_rating: number;
  usefulness_rating: number;
  questions: string[];
  confusions: string[];
  learnings: string[];
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  category: string;
  deadline: string | null;
  estimated_effort: string;
  related_course_id: string | null;
  related_goal_id: string | null;
  related_identity_id: string | null;
  depends_on: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Quiz {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  quiz_date: string;
  status: string;
  created_at: string;
}

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  user_id: string;
  question_type: string;
  question: string;
  options: string[];
  correct_answer: string;
  user_answer: string;
  is_correct: boolean;
  explanation: string;
  topic: string;
  difficulty: string;
  created_at: string;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  user_id: string;
  score: number;
  total_questions: number;
  correct_count: number;
  concepts_mastered: string[];
  concepts_needing_review: string[];
  retention_trend: unknown[];
  completed_at: string;
}

export type MemoryType = 'explicit' | 'inferred' | 'system_fact';
export type MemoryStatus = 'active' | 'dismissed' | 'incorrect';

export interface Memory {
  id: string;
  user_id: string;
  content: string;
  source: string;
  category: MemoryCategory;
  importance: string;
  related_course_id: string | null;
  related_goal_id: string | null;
  related_identity_id: string | null;
  related_journal_id: string | null;
  tags: string[];
  memory_type: MemoryType;
  confidence: number;
  status: MemoryStatus;
  last_accessed: string | null;
  last_reinforced: string | null;
  recurrence_count: number;
  evidence: Record<string, unknown>[];
  created_at: string;
  updated_at: string;
}

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
  evidence: { source: string; detail: string }[];
  severity: 'info' | 'warning' | 'positive';
  is_dismissed: boolean;
  created_at: string;
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

export interface JournalEntry {
  id: string;
  user_id: string;
  content: string;
  mood: string;
  category: string;
  tags: string[];
  related_course_id: string | null;
  related_goal_id: string | null;
  is_novel_eligible: boolean;
  created_at: string;
  updated_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string;
  target_date: string | null;
  progress: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Identity {
  id: string;
  user_id: string;
  name: string;
  vision: string;
  why_it_matters: string;
  skills_required: string[];
  current_level: { skill: string; level: string }[];
  target_level: { skill: string; level: string }[];
  projects: string[];
  milestones: { title: string; done: boolean }[];
  deadlines: { title: string; date: string }[];
  progress: number;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface Habit {
  id: string;
  user_id: string;
  identity_id: string | null;
  goal_id: string | null;
  name: string;
  frequency: string;
  streak: number;
  last_completed: string | null;
  is_active: boolean;
  created_at: string;
}

export interface NovelProject {
  id: string;
  user_id: string;
  title: string;
  description: string;
  themes: string[];
  characters: unknown[];
  timeline: unknown[];
  created_at: string;
  updated_at: string;
}

export interface NovelChapter {
  id: string;
  novel_project_id: string;
  user_id: string;
  title: string;
  summary: string;
  position: number;
  status: string;
  source_memory_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface NovelScene {
  id: string;
  chapter_id: string;
  user_id: string;
  title: string;
  raw_content: string;
  curated_content: string;
  ai_suggestions: unknown[];
  position: number;
  source_memory_id: string | null;
  source_class_log_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Theme {
  id: string;
  user_id: string;
  name: string;
  inspiration: string;
  month: string;
  bg_primary: string;
  bg_secondary: string;
  accent: string;
  accent_secondary: string;
  text_primary: string;
  text_secondary: string;
  card_bg: string;
  is_active: boolean;
  created_at: string;
}

export interface Settings {
  id: string;
  user_id: string;
  quiz_mix: { recent: number; older: number; weak: number; upcoming: number; lateral: number };
  active_theme_id: string | null;
  ai_provider: string;
  custom_chat_instructions: string;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AloraProfile {
  id: string;
  user_id: string;
  display_name: string;
  current_phase: string;
  streak_days: number;
  last_active_date: string | null;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Phase 2: Your Worlds
// ============================================================

export type WorldElementType =
  | 'image'
  | 'text'
  | 'quote'
  | 'color'
  | 'shape'
  | 'sticker'
  | 'music'
  | 'memory'
  | 'journal'
  | 'date';

export type ShapeKind = 'rectangle' | 'circle' | 'line';
export type StickerKind = 'star' | 'tape' | 'arrow' | 'film' | 'grain' | 'sparkle' | 'moon' | 'heart' | 'note' | 'leaf';
export type MusicVisibility = 'visible' | 'minimal' | 'floating' | 'background' | 'disabled';

export interface WorldThemeSettings {
  background: {
    type: 'solid' | 'gradient' | 'image';
    color1: string;
    color2: string;
    angle: number;
    imageUrl: string | null;
    texture: 'none' | 'grain' | 'paper';
  };
  surfaces: {
    cardBg: string;
    sidebarBg: string;
    modalBg: string;
    chatBg: string;
  };
  colors: {
    accent: string;
    accentSecondary: string;
    highlight: string;
    success: string;
    warning: string;
    danger: string;
    textPrimary: string;
    textSecondary: string;
    muted: string;
    border: string;
  };
  typography: {
    displayFont: string;
    bodyFont: string;
    accentFont: string;
  };
  components: {
    borderRadius: number;
    borderOpacity: number;
    shadowIntensity: number;
    blur: number;
    glassEffect: boolean;
    grain: boolean;
    transparency: number;
  };
}

export interface WorldElement {
  id: string;
  world_id: string;
  element_type: WorldElementType;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  opacity: number;
  props: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorldMusic {
  id: string;
  world_id: string;
  song_title: string | null;
  artist: string | null;
  album_art_url: string | null;
  player_visibility: MusicVisibility;
  is_playing: boolean;
  created_at: string;
  updated_at: string;
}

export interface World {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  position: number;
  is_active: boolean;
  theme_settings: WorldThemeSettings;
  created_at: string;
  updated_at: string;
}
