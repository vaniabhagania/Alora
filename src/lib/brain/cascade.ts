import { supabase } from '@/lib/supabase';
import { trackEvent } from './events';
import type { Topic, Task, Goal } from '@/lib/types';

export async function cascadeQuizResults(
  quizId: string,
  questions: { topic: string; is_correct: boolean; correct_answer: string; user_answer: string }[],
  courseId: string | null,
): Promise<void> {
  const topicNames = [...new Set(questions.map((q) => q.topic).filter(Boolean))];

  for (const topicName of topicNames) {
    const topicQuestions = questions.filter((q) => q.topic === topicName);
    const correct = topicQuestions.filter((q) => q.is_correct).length;
    const total = topicQuestions.length;
    const wrong = total - correct;

    if (total === 0) continue;

    const { data: topics } = await supabase
      .from('topics')
      .select('*')
      .ilike('name', topicName)
      .limit(5);

    if (!topics || topics.length === 0) continue;

    for (const topic of topics as Topic[]) {
      const newMistakes = topicQuestions
        .filter((q) => !q.is_correct)
        .map((q) => q.question || q.topic)
        .filter((m) => !topic.mistakes.includes(m));

      const updatedMistakes = [...topic.mistakes, ...newMistakes].slice(-20);
      const allCorrect = correct === total;
      const mostlyWrong = wrong >= total * 0.6;

      let newConfidence = topic.confidence;
      let newStatus = topic.status;

      if (allCorrect) {
        newConfidence = Math.min(100, topic.confidence + 10);
        if (newConfidence >= 80 && topic.status === 'learning') newStatus = 'understood';
        if (newConfidence >= 90 && topic.status === 'understood') newStatus = 'strong';
        if (newConfidence >= 95 && topic.status === 'strong') newStatus = 'mastered';
      } else if (mostlyWrong) {
        newConfidence = Math.max(0, topic.confidence - 15);
        if (newConfidence < 40 && topic.status !== 'not_started') newStatus = 'learning';
        if (newConfidence < 20) newStatus = 'introduced';
      } else {
        newConfidence = Math.max(0, Math.min(100, topic.confidence + (correct - wrong) * 3));
      }

      await supabase.from('topics').update({
        confidence: newConfidence,
        status: newStatus,
        mistakes: updatedMistakes,
        is_weak: mostlyWrong || newConfidence < 50,
        is_strong: allCorrect || newConfidence >= 85,
        last_studied: new Date().toISOString(),
        review_count: topic.review_count + 1,
      }).eq('id', topic.id);

      await trackEvent('topic_mastery_changed', 'topic', topic.id, {
        topic_name: topic.name,
        old_confidence: topic.confidence,
        new_confidence: newConfidence,
        old_status: topic.status,
        new_status: newStatus,
        correct,
        total,
      });

      if (mostlyWrong) {
        await trackEvent('mistake_recorded', 'topic', topic.id, {
          topic_name: topic.name,
          mistake_count: wrong,
        });
      }
    }
  }

  await trackEvent('quiz_completed', 'quiz', quizId, {
    course_id: courseId,
    question_count: questions.length,
    correct_count: questions.filter((q) => q.is_correct).length,
  });
}

export async function cascadeTaskCompletion(task: Task): Promise<void> {
  await trackEvent('task_completed', 'task', task.id, {
    title: task.title,
    category: task.category,
    priority: task.priority,
  });

  if (task.related_goal_id) {
    const { data: goal } = await supabase
      .from('goals')
      .select('*')
      .eq('id', task.related_goal_id)
      .maybeSingle();

    if (goal) {
      const { data: allGoalTasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('related_goal_id', task.related_goal_id);

      if (allGoalTasks && allGoalTasks.length > 0) {
        const completed = allGoalTasks.filter((t) => t.status === 'completed').length;
        const newProgress = Math.round((completed / allGoalTasks.length) * 100);
        const newStatus = newProgress >= 100 ? 'completed' : 'active';

        await supabase.from('goals').update({
          progress: newProgress,
          status: newStatus,
          updated_at: new Date().toISOString(),
        }).eq('id', task.related_goal_id);

        await trackEvent('goal_progress_updated', 'goal', task.related_goal_id, {
          title: (goal as Goal).title,
          new_progress: newProgress,
          reason: 'task_completed',
        });
      }
    }
  }

  if (task.related_identity_id) {
    const { data: identity } = await supabase
      .from('identities')
      .select('*')
      .eq('id', task.related_identity_id)
      .maybeSingle();

    if (identity) {
      const { data: allIdentityTasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('related_identity_id', task.related_identity_id);

      if (allIdentityTasks && allIdentityTasks.length > 0) {
        const completed = allIdentityTasks.filter((t) => t.status === 'completed').length;
        const newProgress = Math.round((completed / allIdentityTasks.length) * 100);

        await supabase.from('identities').update({
          progress: newProgress,
          updated_at: new Date().toISOString(),
        }).eq('id', task.related_identity_id);

        await trackEvent('identity_progress_updated', 'identity', task.related_identity_id, {
          new_progress: newProgress,
          reason: 'task_completed',
        });
      }
    }
  }
}

export async function cascadeTaskCreation(task: Task): Promise<void> {
  await trackEvent('task_created', 'task', task.id, {
    title: task.title,
    category: task.category,
    priority: task.priority,
    related_goal_id: task.related_goal_id,
    related_course_id: task.related_course_id,
  });
}

export async function cascadeGoalProgress(
  goalId: string,
  newProgress: number,
): Promise<void> {
  const status = newProgress >= 100 ? 'completed' : 'active';

  await supabase.from('goals').update({
    progress: newProgress,
    status,
    updated_at: new Date().toISOString(),
  }).eq('id', goalId);

  await trackEvent('goal_progress_updated', 'goal', goalId, {
    new_progress: newProgress,
    status,
  });

  if (status === 'completed') {
    await trackEvent('goal_completed', 'goal', goalId, {});
  }
}

export async function cascadeHabitCompletion(habitId: string): Promise<void> {
  const { data: habit } = await supabase
    .from('habits')
    .select('*')
    .eq('id', habitId)
    .maybeSingle();

  if (!habit) return;

  const today = new Date().toISOString().split('T')[0];
  const newStreak = habit.last_completed === today ? habit.streak : habit.streak + 1;

  await supabase.from('habits').update({
    streak: newStreak,
    last_completed: today,
  }).eq('id', habitId);

  await trackEvent('habit_completed', 'habit', habitId, {
    name: habit.name,
    new_streak: newStreak,
  });
}

export async function cascadeJournalToMemory(
  journalId: string,
  content: string,
  category: string,
  mood: string,
): Promise<void> {
  await trackEvent('journal_saved_to_memory', 'journal', journalId, {
    content_preview: content.slice(0, 100),
    category,
    mood,
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('memories').insert({
    user_id: user.id,
    content,
    source: 'journal',
    category: category === 'academic' ? 'academic' : 'personal',
    importance: 'normal',
    memory_type: 'explicit',
    related_journal_id: journalId,
    tags: [mood, category],
  });

  await trackEvent('memory_created', 'memory', null, {
    source: 'journal',
    journal_id: journalId,
  });
}

export async function cascadeWorldPreference(
  worldId: string,
  themeSettings: Record<string, unknown>,
): Promise<void> {
  const colors = themeSettings.colors as Record<string, string> | undefined;
  const typography = themeSettings.typography as Record<string, string> | undefined;

  await trackEvent('world_theme_changed', 'world', worldId, {
    accent_color: colors?.accent,
    display_font: typography?.displayFont,
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: existing } = await supabase
    .from('memories')
    .select('*')
    .eq('user_id', user.id)
    .eq('category', 'preferences')
    .ilike('content', '%aesthetic%')
    .eq('memory_type', 'inferred')
    .limit(1);

  if (!existing || existing.length === 0) {
    const accent = colors?.accent || 'unknown';
    const font = typography?.displayFont || 'unknown';
    await supabase.from('memories').insert({
      user_id: user.id,
      content: `Aesthetic preference: accent color ${accent}, display font ${font}`,
      source: 'world',
      category: 'preferences',
      importance: 'low',
      memory_type: 'inferred',
      confidence: 0.3,
      recurrence_count: 1,
      evidence: [{ world_id: worldId, accent, font }],
    });
  } else {
    const memory = existing[0];
    const newCount = (memory.recurrence_count || 0) + 1;
    const newConfidence = Math.min(1.0, 0.3 + newCount * 0.1);
    await supabase.from('memories').update({
      recurrence_count: newCount,
      confidence: newConfidence,
      last_reinforced: new Date().toISOString(),
    }).eq('id', memory.id);
  }
}
