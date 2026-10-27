import { describe, it, expect } from 'vitest';
import { countDeps, classIdsUnder, levelTable } from './hierarchy';
import type { AcademicData } from '@/lib/academic';

// Two years' worth of structure, just enough rows to tell levels apart. Cast: tests only fill the columns the helpers read.
const data = {
  years: [{ id: 'y1' }, { id: 'y2' }],
  semesters: [{ id: 's1', academic_year_id: 'y1' }, { id: 's2', academic_year_id: 'y2' }],
  courses: [{ id: 'c1', semester_id: 's1' }, { id: 'c2', semester_id: 's1' }, { id: 'c3', semester_id: 's2' }],
  modules: [{ id: 'm1', course_id: 'c1' }, { id: 'm2', course_id: 'c3' }],
  topics: [{ id: 't1', module_id: 'm1' }, { id: 't2', module_id: 'm1' }],
  classes: [
    { id: 'k1', course_id: 'c1', topic_id: 't1' },
    { id: 'k2', course_id: 'c2', topic_id: null },
    { id: 'k3', course_id: 'c3', topic_id: null },
  ],
  classLogs: [],
  tasks: [{ id: 'task1', related_course_id: 'c1' }],
  quizAttempts: [],
  quizQuestions: [],
} as unknown as AcademicData;

describe('levelTable', () => {
  it('maps every level to its table', () => {
    expect(levelTable('year')).toBe('academic_years');
    expect(levelTable('semester')).toBe('semesters');
    expect(levelTable('course')).toBe('courses');
    expect(levelTable('module')).toBe('modules');
    expect(levelTable('topic')).toBe('topics');
  });
});

describe('classIdsUnder', () => {
  it('finds the classes of a course', () => expect(classIdsUnder(data, 'course', 'c1')).toEqual(['k1']));
  it('finds the classes of every course in a semester', () => expect(classIdsUnder(data, 'semester', 's1')).toEqual(['k1', 'k2']));
  it('finds the classes across a whole year', () => expect(classIdsUnder(data, 'year', 'y2')).toEqual(['k3']));
  it('does not claim classes for levels below a course (modules and topics keep their classes)', () => {
    expect(classIdsUnder(data, 'module', 'm1')).toEqual([]);
    expect(classIdsUnder(data, 'topic', 't1')).toEqual([]);
  });
});

describe('countDeps', () => {
  it('counts what a year contains', () => {
    expect(countDeps(data, 'year', 'y1')).toEqual([{ label: 'semesters', count: 1 }, { label: 'courses', count: 2 }]);
  });
  it('counts what a course contains, including linked tasks', () => {
    expect(countDeps(data, 'course', 'c1')).toEqual([
      { label: 'modules', count: 1 }, { label: 'classes', count: 1 }, { label: 'tasks', count: 1 },
    ]);
  });
  it('counts topics in a module and classes on a topic', () => {
    expect(countDeps(data, 'module', 'm1')).toEqual([{ label: 'topics', count: 2 }]);
    expect(countDeps(data, 'topic', 't1')).toEqual([{ label: 'classes', count: 1 }]);
  });
  it('returns nothing for an empty item', () => {
    expect(countDeps(data, 'year', 'y-missing')).toEqual([]);
    expect(countDeps(data, 'topic', 't2')).toEqual([]);
  });
});
