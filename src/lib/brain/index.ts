export type {
  StudentContext, ContextType, ActivityEvent, InsightRecord,
  MemoryType, MemoryStatus, ExtendedMemory, ChatConversation,
  ChatMessageRecord, EvidenceItem, EventType, ContextQueryOptions,
} from './types';

export {
  getStudentContext,
} from './context';

export {
  trackEvent, getRecentEvents, getEventCount, getEventsByType,
} from './events';

export {
  generateInsights, saveInsights, dismissInsight, getActiveInsights,
  buildExplainableRecommendation,
} from './insights';

export {
  cascadeQuizResults, cascadeTaskCompletion, cascadeTaskCreation,
  cascadeGoalProgress, cascadeHabitCompletion, cascadeJournalToMemory,
  cascadeWorldPreference,
} from './cascade';

export {
  fetchMemories, createMemory, updateMemory, correctMemory,
  deleteMemory, markMemoryImportant, dismissMemory, reinforceMemory,
  searchMemories, getMemoryTypeLabel, getMemoryTypeColor,
} from './memory';
