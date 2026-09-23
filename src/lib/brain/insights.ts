import { supabase } from '@/lib/supabase';
import type { StudentContext, InsightRecord, EvidenceItem } from './types';
import { trackEvent } from './events';

export async function generateInsights(
  ctx: StudentContext,
): Promise<InsightRecord[]> {
  const insights: Omit<InsightRecord, 'id' | 'user_id' | 'created_at' | 'is_dismissed'>[] = [];

  insights.push(...detectTaskBehavior(ctx));
  insights.push(...detectQuizTrends(ctx));
  insights.push(...detectStudyGaps(ctx));
  insights.push(...detectGoalProgress(ctx));
  insights.push(...detectContradictions(ctx));
  insights.push(...detectWorkloadConflicts(ctx));
  insights.push(...detectHabitPatterns(ctx));

  return insights as InsightRecord[];
}

function detectTaskBehavior(ctx: StudentContext) {
  const results: Omit<InsightRecord, 'id' | 'user_id' | 'created_at' | 'is_dismissed'>[] = [];

  if (ctx.overdueTasks.length >= 3) {
    results.push({
      insight_type: 'task_behavior',
      title: `${ctx.overdueTasks.length} overdue tasks`,
      description: `You have ${ctx.overdueTasks.length} overdue tasks. The oldest has been pending since ${new Date(ctx.overdueTasks[0].deadline).toLocaleDateString()}. This may indicate avoidance rather than lack of time.`,
      evidence: ctx.overdueTasks.slice(0, 3).map((t) => ({
        source: 'task',
        detail: `${t.title} — due ${t.deadline ? new Date(t.deadline).toLocaleDateString() : 'no deadline'}`,
      })),
      severity: 'warning',
    });
  }

  if (ctx.totalTasksThisWeek > 0) {
    const completionRate = Math.round((ctx.completedTasksThisWeek / ctx.totalTasksThisWeek) * 100);
    if (completionRate >= 80) {
      results.push({
        insight_type: 'progress',
        title: `${completionRate}% of this week's tasks completed`,
        description: `You've completed ${ctx.completedTasksThisWeek} of ${ctx.totalTasksThisWeek} tasks created this week. That's strong execution.`,
        evidence: [{ source: 'tasks', detail: `${ctx.completedTasksThisWeek}/${ctx.totalTasksThisWeek} completed` }],
        severity: 'positive',
      });
    } else if (completionRate < 40 && ctx.totalTasksThisWeek >= 5) {
      results.push({
        insight_type: 'task_behavior',
        title: `Low completion rate this week (${completionRate}%)`,
        description: `You've completed ${ctx.completedTasksThisWeek} of ${ctx.totalTasksThisWeek} tasks this week. Consider whether you're creating too many tasks or avoiding the harder ones.`,
        evidence: [{ source: 'tasks', detail: `${ctx.completedTasksThisWeek}/${ctx.totalTasksThisWeek} completed` }],
        severity: 'warning',
      });
    }
  }

  return results;
}

function detectQuizTrends(ctx: StudentContext) {
  const results: Omit<InsightRecord, 'id' | 'user_id' | 'created_at' | 'is_dismissed'>[] = [];

  if (ctx.quizAttempts.length >= 2) {
    const recent = ctx.quizAttempts.slice(0, 3);
    const older = ctx.quizAttempts.slice(3, 6);
    const recentAvg = avgScore(recent);
    const olderAvg = avgScore(older);

    if (recentAvg > olderAvg + 10) {
      const improvement = Math.round(recentAvg - olderAvg);
      results.push({
        insight_type: 'progress',
        title: `Quiz accuracy improved ${improvement}%`,
        description: `Your recent quiz average is ${Math.round(recentAvg)}%, up from ${Math.round(olderAvg)}% in earlier attempts. Your study approach is working.`,
        evidence: [
          { source: 'quiz', detail: `Recent average: ${Math.round(recentAvg)}%` },
          { source: 'quiz', detail: `Earlier average: ${Math.round(olderAvg)}%` },
        ],
        severity: 'positive',
      });
    } else if (recentAvg < olderAvg - 10) {
      const decline = Math.round(olderAvg - recentAvg);
      results.push({
        insight_type: 'progress',
        title: `Quiz accuracy dropped ${decline}%`,
        description: `Your recent quiz average is ${Math.round(recentAvg)}%, down from ${Math.round(olderAvg)}%. This may indicate retention issues or insufficient review.`,
        evidence: [
          { source: 'quiz', detail: `Recent average: ${Math.round(recentAvg)}%` },
          { source: 'quiz', detail: `Earlier average: ${Math.round(olderAvg)}%` },
        ],
        severity: 'warning',
      });
    }
  }

  return results;
}

function detectStudyGaps(ctx: StudentContext) {
  const results: Omit<InsightRecord, 'id' | 'user_id' | 'created_at' | 'is_dismissed'>[] = [];

  if (ctx.weakTopics.length > 0) {
    const weakest = ctx.weakTopics[0];
    results.push({
      insight_type: 'study_gap',
      title: `Biggest knowledge gap: ${weakest.name}`,
      description: `${weakest.name} is your weakest topic at ${weakest.confidence}% confidence. ${weakest.reasons.join('. ')}.`,
      evidence: weakest.reasons.map((r) => ({ source: 'topic', detail: r })),
      severity: 'info',
    });
  }

  const staleTopics = ctx.topics.filter((t) => {
    if (!t.last_studied || t.status === 'mastered') return false;
    const daysSince = Math.floor((Date.now() - new Date(t.last_studied).getTime()) / (24 * 60 * 60 * 1000));
    return daysSince > 14;
  });

  if (staleTopics.length >= 3) {
    results.push({
      insight_type: 'study_gap',
      title: `${staleTopics.length} topics not reviewed in over 2 weeks`,
      description: `These topics may be fading from memory: ${staleTopics.slice(0, 5).map((t) => t.name).join(', ')}. Consider a review session.`,
      evidence: staleTopics.slice(0, 3).map((t) => ({
        source: 'topic',
        detail: `${t.name} — last studied ${new Date(t.last_studied!).toLocaleDateString()}`,
      })),
      severity: 'info',
    });
  }

  return results;
}

function detectGoalProgress(ctx: StudentContext) {
  const results: Omit<InsightRecord, 'id' | 'user_id' | 'created_at' | 'is_dismissed'>[] = [];

  const stalledGoals = ctx.activeGoals.filter((g) => {
    if (!g.updated_at) return false;
    const daysSinceUpdate = Math.floor((Date.now() - new Date(g.updated_at).getTime()) / (24 * 60 * 60 * 1000));
    return daysSinceUpdate > 14 && g.progress < 50;
  });

  for (const goal of stalledGoals.slice(0, 2)) {
    const days = Math.floor((Date.now() - new Date(goal.updated_at).getTime()) / (24 * 60 * 60 * 1000));
    results.push({
      insight_type: 'goal_progress',
      title: `Goal "${goal.title}" hasn't moved in ${days} days`,
      description: `"${goal.title}" is at ${goal.progress}% and hasn't been updated in ${days} days. It may need to be broken into smaller steps or reconsidered.`,
      evidence: [
        { source: 'goal', detail: `Progress: ${goal.progress}%` },
        { source: 'goal', detail: `Last updated: ${new Date(goal.updated_at).toLocaleDateString()}` },
      ],
      severity: 'warning',
    });
  }

  return results;
}

function detectContradictions(ctx: StudentContext) {
  const results: Omit<InsightRecord, 'id' | 'user_id' | 'created_at' | 'is_dismissed'>[] = [];

  const statedPreferences = ctx.memories.filter(
    (m) => m.memory_type === 'explicit' && m.category === 'preferences' && m.status === 'active',
  );

  for (const pref of statedPreferences) {
    const content = pref.content.toLowerCase();
    if (content.includes('morning') && content.includes('study')) {
      const morningEvents = ctx.activityEvents.filter(
        (e) => e.event_type === 'quiz_completed' &&
        e.metadata.hour !== undefined &&
        (e.metadata.hour as number) < 12,
      );
      if (morningEvents.length >= 3) {
        const morningScores = morningEvents
          .map((e) => e.metadata.score as number)
          .filter((s) => s !== undefined);
        if (morningScores.length > 0) {
          const avgMorning = morningScores.reduce((a, b) => a + b, 0) / morningScores.length;
          if (content.includes('hate') || content.includes('dislike') || content.includes('not good')) {
            results.push({
              insight_type: 'contradiction',
              title: 'Stated preference vs. observed performance',
              description: `You've mentioned mornings aren't your favorite for studying, but your quiz performance after morning sessions averages ${Math.round(avgMorning)}% — above your overall average of ${ctx.quizAverage}%.`,
              evidence: [
                { source: 'memory', detail: `Stated: "${pref.content}"` },
                { source: 'activity', detail: `${morningEvents.length} morning quizzes, avg ${Math.round(avgMorning)}%` },
              ],
              severity: 'info',
            });
          }
        }
      }
    }
  }

  return results;
}

function detectWorkloadConflicts(ctx: StudentContext) {
  const results: Omit<InsightRecord, 'id' | 'user_id' | 'created_at' | 'is_dismissed'>[] = [];

  if (ctx.overdueTasks.length > 0 && ctx.activeGoals.length > 0) {
    const soonestGoal = ctx.activeGoals.find((g) => g.target_date);
    if (soonestGoal) {
      const daysToGoal = Math.floor((new Date(soonestGoal.target_date!).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      if (daysToGoal > 0 && daysToGoal < 30 && ctx.overdueTasks.length >= 3) {
        results.push({
          insight_type: 'workload_conflict',
          title: 'Overdue tasks may conflict with goal timeline',
          description: `You have ${ctx.overdueTasks.length} overdue tasks and your goal "${soonestGoal.title}" is due in ${daysToGoal} days at ${soonestGoal.progress}%. Clearing the backlog should be a priority.`,
          evidence: [
            { source: 'tasks', detail: `${ctx.overdueTasks.length} overdue` },
            { source: 'goal', detail: `"${soonestGoal.title}" — ${daysToGoal} days remaining, ${soonestGoal.progress}%` },
          ],
          severity: 'warning',
        });
      }
    }
  }

  return results;
}

function detectHabitPatterns(ctx: StudentContext) {
  const results: Omit<InsightRecord, 'id' | 'user_id' | 'created_at' | 'is_dismissed'>[] = [];

  const strongHabits = ctx.habits.filter((h) => h.streak >= 7);
  for (const habit of strongHabits.slice(0, 2)) {
    results.push({
      insight_type: 'habit_pattern',
      title: `${habit.streak}-day streak: ${habit.name}`,
      description: `You've maintained "${habit.name}" for ${habit.streak} days. This consistency is building momentum toward your goals.`,
      evidence: [{ source: 'habit', detail: `${habit.streak}-day streak, last completed ${habit.last_completed}` }],
      severity: 'positive',
    });
  }

  return results;
}

function avgScore(attempts: { correct_count: number; total_questions: number }[]): number {
  if (attempts.length === 0) return 0;
  return attempts.reduce((sum, a) => sum + (a.total_questions > 0 ? (a.correct_count / a.total_questions) * 100 : 0), 0) / attempts.length;
}

export async function saveInsights(insights: InsightRecord[]): Promise<void> {
  if (insights.length === 0) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const rows = insights.map((i) => ({
    user_id: user.id,
    insight_type: i.insight_type,
    title: i.title,
    description: i.description,
    evidence: i.evidence,
    severity: i.severity,
  }));

  await supabase.from('insights').insert(rows);
  await trackEvent('memory_created', 'insight', null, { count: insights.length });
}

export async function dismissInsight(insightId: string): Promise<void> {
  await supabase.from('insights').update({ is_dismissed: true }).eq('id', insightId);
}

export async function getActiveInsights(): Promise<InsightRecord[]> {
  const { data, error } = await supabase
    .from('insights')
    .select('*')
    .eq('is_dismissed', false)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) return [];
  return (data as InsightRecord[]) || [];
}

export function buildExplainableRecommendation(
  recommendation: string,
  evidence: EvidenceItem[],
): string {
  if (evidence.length === 0) return recommendation;
  const reasons = evidence.map((e) => e.detail).join('; ');
  return `${recommendation}\n\nWhy: ${reasons}`;
}
