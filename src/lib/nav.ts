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
  { id: 'worlds', label: 'Vibe', icon: Globe },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const HIDE_WORDS = /\b(hide|remove|delete|get rid of|don'?t need|turn off)\b/i;
const SHOW_WORDS = /\b(show|add|bring back|restore|unhide|turn on|enable)\b/i;
const NAV_CONTEXT_WORDS = /\b(tab|sidebar|nav|menu|navigation)\b/i;

export interface NavIntent {
  action: 'hide' | 'show';
  item: NavItem;
}

/**
 * Lets Alora Chat itself drive nav customization: if a message clearly asks
 * to hide/show a specific tab, ChatPage surfaces a confirm chip instead of
 * silently acting — same review-before-apply pattern as every other AI
 * suggestion in this app.
 */
export function detectNavIntent(message: string): NavIntent | null {
  if (!NAV_CONTEXT_WORDS.test(message)) return null;
  const lower = message.toLowerCase();
  const item = NAV_ITEMS.find(
    (n) => n.id !== 'home' && n.id !== 'settings' && lower.includes(n.label.toLowerCase())
  );
  if (!item) return null;
  if (HIDE_WORDS.test(message)) return { action: 'hide', item };
  if (SHOW_WORDS.test(message)) return { action: 'show', item };
  return null;
}
