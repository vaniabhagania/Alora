import { getStudentContext } from '@/lib/brain';
import type { ChatContext } from './types';
import type { AloraProfile } from '@/lib/types';
import type { ContextType } from '@/lib/brain/types';

const EMPTY_CONTEXT: ChatContext = {
  userName: '', recentClasses: [], upcomingTasks: [], overdueTasks: [],
  weakTopics: [], strongTopics: [], goals: [], identities: [], streak: 0, quizAvgScore: 0,
};

/**
 * Builds the same unified-brain ChatContext that Alora Chat uses, so every
 * caller (the Chat page, an inline "Ask Alora" box on any other page) sees
 * the same picture of the user instead of a stripped-down version.
 */
export async function buildChatContext(profile: AloraProfile | null, source: ContextType): Promise<ChatContext> {
  if (!profile) return EMPTY_CONTEXT;

  const ctx = await getStudentContext(source);
  const courseNameById = new Map(ctx.courses.map((c) => [c.id, c.name]));

  return {
    userName: profile.display_name || 'there',
    recentClasses: ctx.recentClasses.slice(0, 10).map((c) => ({
      course: courseNameById.get(c.course_id) || 'Unknown',
      title: c.title,
      date: c.session_date,
    })),
    upcomingTasks: ctx.upcomingTasks.slice(0, 5).map((t) => ({ title: t.title, deadline: t.deadline!, priority: t.priority })),
    overdueTasks: ctx.overdueTasks.map((t) => ({ title: t.title, deadline: t.deadline! })),
    weakTopics: ctx.weakTopics.map((w) => w.name),
    strongTopics: ctx.strongTopics,
    goals: ctx.activeGoals.map((g) => ({ title: g.title, progress: g.progress })),
    identities: ctx.identities.map((i) => ({ name: i.name, progress: i.progress })),
    streak: ctx.streak,
    quizAvgScore: ctx.quizAverage,
  };
}
