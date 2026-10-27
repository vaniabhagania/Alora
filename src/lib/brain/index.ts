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
  generateInsights, saveInsights, dismissInsight, getActiveInsights, refreshInsights,
  buildExplainableRecommendation,
} from './insights';

export {
  cascadeQuizResults, cascadeTaskCompletion, cascadeTaskStatusChange, cascadeTaskCreation, cascadeTaskDeletion,
  recomputeLinkedProgress, cascadeGoalProgress, cascadeHabitCompletion, cascadeHabitUndo,
  cascadeJournalToMemory, cascadeWorldPreference, cascadeWorldActivated, cascadeClassLog, cascadeClassEdit, cascadeClassDeletion, buildClassMemoryContent, cascadeNovelSceneSaved,
} from './cascade';

export {
  fetchMemories, createMemory, updateMemory, correctMemory,
  deleteMemory, markMemoryImportant, dismissMemory, restoreMemory, reinforceMemory,
  searchMemories, getMemoryTypeLabel, getMemoryTypeColor,
} from './memory';
