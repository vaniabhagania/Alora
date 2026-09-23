import { Home, GraduationCap, Brain, CheckSquare, MessageSquare, BookOpen, Sparkles, BookA, Database, Settings, Globe, type LucideIcon } from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'academia', label: 'Academia', icon: GraduationCap },
  { id: 'quiz', label: 'Daily Quiz', icon: Brain },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'chat', label: 'Alora Chat', icon: MessageSquare },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'future', label: 'My Future', icon: Sparkles },
  { id: 'novel', label: 'Novel', icon: BookA },
  { id: 'memory', label: 'Memory', icon: Database },
  { id: 'worlds', label: 'Your Worlds', icon: Globe },
  { id: 'settings', label: 'Settings', icon: Settings },
];
