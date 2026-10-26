import type { AcademicData } from '@/lib/academic';

// Pure helpers for the Academia hierarchy. They live apart from the components so fast-refresh keeps working
// and so they can be unit-tested without rendering anything.

export type Level = 'year' | 'semester' | 'course' | 'module' | 'topic';

export function countDeps(data: AcademicData, level: Level, id: string): { label: string; count: number }[] {
  const deps: { label: string; count: number }[] = [];
  if (level === 'year') {
    const sems = data.semesters.filter((s) => s.academic_year_id === id);
    if (sems.length) deps.push({ label: 'semesters', count: sems.length });
    const semIds = sems.map((s) => s.id);
    const courses = data.courses.filter((c) => semIds.includes(c.semester_id));
    if (courses.length) deps.push({ label: 'courses', count: courses.length });
  } else if (level === 'semester') {
    const courses = data.courses.filter((c) => c.semester_id === id);
    if (courses.length) deps.push({ label: 'courses', count: courses.length });
    const courseIds = courses.map((c) => c.id);
    const modules = data.modules.filter((m) => courseIds.includes(m.course_id));
    if (modules.length) deps.push({ label: 'modules', count: modules.length });
  } else if (level === 'course') {
    const modules = data.modules.filter((m) => m.course_id === id);
    if (modules.length) deps.push({ label: 'modules', count: modules.length });
    const classes = data.classes.filter((c) => c.course_id === id);
    if (classes.length) deps.push({ label: 'classes', count: classes.length });
    const tasks = data.tasks.filter((t) => t.related_course_id === id);
    if (tasks.length) deps.push({ label: 'tasks', count: tasks.length });
  } else if (level === 'module') {
    const topics = data.topics.filter((t) => t.module_id === id);
    if (topics.length) deps.push({ label: 'topics', count: topics.length });
  } else if (level === 'topic') {
    const classes = data.classes.filter((c) => c.topic_id === id);
    if (classes.length) deps.push({ label: 'classes', count: classes.length });
  }
  return deps;
}

// --- Delete modal with dependency info ---

/** Every logged class that disappears when this item is deleted (classes hang off courses). */
export function classIdsUnder(data: AcademicData, level: Level, id: string): string[] {
  let courseIds: string[] = [];
  if (level === 'course') courseIds = [id];
  else if (level === 'semester') courseIds = data.courses.filter((c) => c.semester_id === id).map((c) => c.id);
  else if (level === 'year') {
    const semIds = data.semesters.filter((s) => s.academic_year_id === id).map((s) => s.id);
    courseIds = data.courses.filter((c) => semIds.includes(c.semester_id)).map((c) => c.id);
  }
  return data.classes.filter((c) => courseIds.includes(c.course_id)).map((c) => c.id);
}

export function levelTable(level: Level): string {
  return { year: 'academic_years', semester: 'semesters', course: 'courses', module: 'modules', topic: 'topics' }[level];
}
