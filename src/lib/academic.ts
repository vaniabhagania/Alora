import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type {
  AcademicYear, Semester, Course, Module, Topic, ClassSession, ClassLog,
  Task, QuizAttempt, QuizQuestion,
} from '@/lib/types';

export interface AcademicData {
  years: AcademicYear[];
  semesters: Semester[];
  courses: Course[];
  modules: Module[];
  topics: Topic[];
  classes: ClassSession[];
  classLogs: ClassLog[];
  tasks: Task[];
  quizAttempts: QuizAttempt[];
  quizQuestions: QuizQuestion[];
}

export function useAcademicData() {
  const { profile } = useAuth();
  const [data, setData] = useState<AcademicData>({
    years: [], semesters: [], courses: [], modules: [], topics: [],
    classes: [], classLogs: [], tasks: [], quizAttempts: [], quizQuestions: [],
  });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [y, s, c, m, t, cl, clg, tasks, qa, qq] = await Promise.all([
      supabase.from('academic_years').select('*').order('position'),
      supabase.from('semesters').select('*').order('position'),
      supabase.from('courses').select('*').order('position'),
      supabase.from('modules').select('*').order('position'),
      supabase.from('topics').select('*').order('created_at'),
      supabase.from('classes').select('*').order('session_date', { ascending: false }),
      supabase.from('class_logs').select('*').order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').order('deadline', { ascending: true }),
      supabase.from('quiz_attempts').select('*').order('completed_at', { ascending: false }),
      supabase.from('quiz_questions').select('*').order('created_at', { ascending: false }),
    ]);
    setData({
      years: (y.data as AcademicYear[]) || [],
      semesters: (s.data as Semester[]) || [],
      courses: (c.data as Course[]) || [],
      modules: (m.data as Module[]) || [],
      topics: (t.data as Topic[]) || [],
      classes: (cl.data as ClassSession[]) || [],
      classLogs: (clg.data as ClassLog[]) || [],
      tasks: (tasks.data as Task[]) || [],
      quizAttempts: (qa.data as QuizAttempt[]) || [],
      quizQuestions: (qq.data as QuizQuestion[]) || [],
    });
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { data, loading, reload: loadData };
}

export interface WeakSpot {
  topic: Topic;
  course: Course | null;
  confidence: number;
  reasons: string[];
  daysSinceStudied: number;
}

export function computeWeakSpots(data: AcademicData): WeakSpot[] {
  const now = new Date();
  const spots: WeakSpot[] = [];

  for (const topic of data.topics) {
    if (topic.archived) continue;
    const reasons: string[] = [];
    let score = 100;

    // Low confidence
    if (topic.confidence < 50) {
      reasons.push(`Confidence marked at ${topic.confidence}%`);
      score = Math.min(score, topic.confidence);
    }

    // Status indicates difficulty
    if (topic.status === 'learning' || topic.status === 'introduced' || topic.status === 'not_started') {
      reasons.push(`Status: ${topic.status.replace('_', ' ')}`);
      score -= 20;
    }

    // Quiz mistakes related to this topic
    const topicQuestions = data.quizQuestions.filter((q) => q.topic === topic.name && !q.is_correct);
    if (topicQuestions.length >= 2) {
      reasons.push(`${topicQuestions.length} incorrect quiz answers`);
      score -= topicQuestions.length * 5;
    }

    // Long period without revision
    if (topic.last_studied) {
      const days = Math.floor((now.getTime() - new Date(topic.last_studied).getTime()) / (1000 * 60 * 60 * 24));
      if (days > 7) {
        reasons.push(`Not reviewed in ${days} days`);
        score -= Math.min(30, days);
      }
    } else if (data.classes.some((c) => c.topic_id === topic.id)) {
      reasons.push('Never explicitly reviewed');
      score -= 15;
    }

    // Multiple mistakes recorded
    if (topic.mistakes.length >= 2) {
      reasons.push(`${topic.mistakes.length} recorded mistakes`);
      score -= 10;
    }

    if (reasons.length > 0) {
      const mod = data.modules.find((m) => m.id === topic.module_id);
      const course = mod ? data.courses.find((c) => c.id === mod.course_id) || null : null;
      const daysSince = topic.last_studied
        ? Math.floor((now.getTime() - new Date(topic.last_studied).getTime()) / (1000 * 60 * 60 * 24))
        : -1;
      spots.push({
        topic,
        course,
        confidence: Math.max(0, Math.min(100, score)),
        reasons,
        daysSinceStudied: daysSince,
      });
    }
  }

  return spots.sort((a, b) => a.confidence - b.confidence);
}

export interface StrengthSpot {
  topic: Topic;
  course: Course | null;
  reasons: string[];
}

export function computeStrengths(data: AcademicData): StrengthSpot[] {
  const strengths: StrengthSpot[] = [];

  for (const topic of data.topics) {
    if (topic.archived) continue;
    const reasons: string[] = [];

    if (topic.status === 'mastered' || topic.status === 'strong') {
      reasons.push(`Status: ${topic.status}`);
    }

    if (topic.confidence >= 80) {
      reasons.push(`Confidence at ${topic.confidence}%`);
    }

    const topicQuestions = data.quizQuestions.filter((q) => q.topic === topic.name);
    const correctQuestions = topicQuestions.filter((q) => q.is_correct);
    if (topicQuestions.length >= 3 && correctQuestions.length / topicQuestions.length >= 0.8) {
      reasons.push(`${correctQuestions.length}/${topicQuestions.length} quiz answers correct`);
    }

    if (topic.review_count >= 3 && topic.status !== 'not_started') {
      reasons.push(`Reviewed ${topic.review_count} times`);
    }

    if (reasons.length >= 2 || topic.status === 'mastered') {
      const mod = data.modules.find((m) => m.id === topic.module_id);
      const course = mod ? data.courses.find((c) => c.id === mod.course_id) || null : null;
      strengths.push({ topic, course, reasons });
    }
  }

  return strengths.sort((a, b) => {
    const order = { mastered: 5, strong: 4, understood: 3, learning: 2, introduced: 1, not_started: 0 };
    return (order[b.topic.status] || 0) - (order[a.topic.status] || 0);
  });
}

export interface TimelineEvent {
  id: string;
  date: string;
  type: 'class' | 'deadline' | 'quiz' | 'milestone';
  title: string;
  subtitle: string;
  color: string;
}

export function computeTimeline(data: AcademicData): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const cls of data.classes) {
    const course = data.courses.find((c) => c.id === cls.course_id);
    events.push({
      id: cls.id,
      date: cls.session_date,
      type: 'class',
      title: cls.title,
      subtitle: course?.name || 'Unknown course',
      color: course?.color || '#6366f1',
    });
  }

  for (const task of data.tasks) {
    if (task.deadline && task.status !== 'completed') {
      const course = task.related_course_id ? data.courses.find((c) => c.id === task.related_course_id) : null;
      events.push({
        id: task.id,
        date: task.deadline,
        type: 'deadline',
        title: task.title,
        subtitle: course?.name || task.category,
        color: task.priority === 'urgent' ? '#f43f5e' : task.priority === 'high' ? '#f97316' : '#6366f1',
      });
    }
  }

  for (const attempt of data.quizAttempts) {
    events.push({
      id: attempt.id,
      date: attempt.completed_at,
      type: 'quiz',
      title: `Quiz: ${attempt.correct_count}/${attempt.total_questions} correct`,
      subtitle: `${Math.round((attempt.correct_count / Math.max(1, attempt.total_questions)) * 100)}% score`,
      color: '#a78bfa',
    });
  }

  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function computeRetention(data: AcademicData): number {
  if (data.quizAttempts.length === 0) return 0;
  const total = data.quizAttempts.reduce((acc, a) => acc + (a.correct_count / Math.max(1, a.total_questions)) * 100, 0);
  return Math.round(total / data.quizAttempts.length);
}

export function getActiveCourses(data: AcademicData): Course[] {
  return data.courses.filter((c) => !c.archived);
}

export function getActiveTopics(data: AcademicData): Topic[] {
  return data.topics.filter((t) => !t.archived);
}

export function getUpcomingDeadlines(data: AcademicData, limit = 5): Task[] {
  const now = new Date();
  return data.tasks
    .filter((t) => t.status !== 'completed' && t.deadline && new Date(t.deadline) >= now)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    .slice(0, limit);
}
