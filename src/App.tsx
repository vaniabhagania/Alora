import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';
import { WorldProvider } from '@/lib/worlds';
import { SettingsProvider } from '@/lib/settingsContext';
import { supabaseConfigError } from '@/lib/supabase';
import { usePageRoute } from '@/lib/route';
import { AppShell } from '@/components/AppShell';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ConfigErrorScreen } from '@/components/ConfigErrorScreen';
import { AuthPage, ResetPasswordPage } from '@/pages/AuthPage';
import { LoadingSpinner } from '@/components/ui';

// Each page is its own chunk: the first paint only downloads the shell and the
// page you land on, instead of one ~550 kB bundle containing all twelve.
const page = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(() => load().then((m) => ({ default: m[name] as React.ComponentType<any> }))); // eslint-disable-line @typescript-eslint/no-explicit-any

const HomePage = page(() => import('@/pages/HomePage'), 'HomePage');
const AcademiaPage = page(() => import('@/pages/AcademiaPage'), 'AcademiaPage');
const QuizPage = page(() => import('@/pages/QuizPage'), 'QuizPage');
const TasksPage = page(() => import('@/pages/TasksPage'), 'TasksPage');
const RoutinesPage = page(() => import('@/pages/RoutinesPage'), 'RoutinesPage');
const ChatPage = page(() => import('@/pages/ChatPage'), 'ChatPage');
const JournalPage = page(() => import('@/pages/JournalPage'), 'JournalPage');
const FuturePage = page(() => import('@/pages/FuturePage'), 'FuturePage');
const NovelPage = page(() => import('@/pages/NovelPage'), 'NovelPage');
const MemoryPage = page(() => import('@/pages/MemoryPage'), 'MemoryPage');
const SettingsPage = page(() => import('@/pages/SettingsPage'), 'SettingsPage');
const WorldsPage = page(() => import('@/pages/WorldsPage'), 'WorldsPage');

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex h-dvh items-center justify-center bg-[var(--bg-primary)]">{children}</div>;
}

function AppContent() {
  const { session, loading, profileStatus, recoveryMode, retryProfile, signOut } = useAuth();
  const [currentPage, navigate] = usePageRoute();

  if (loading) {
    return <FullScreenMessage><LoadingSpinner label="Loading ALORA..." /></FullScreenMessage>;
  }

  if (!session) return <AuthPage />;
  if (recoveryMode) return <ResetPasswordPage />;

  if (profileStatus === 'error') {
    return (
      <FullScreenMessage>
        <div className="glass-card max-w-sm p-8 text-center" role="alert">
          <h2 className="mb-1 font-display text-lg font-semibold text-[var(--text-primary)]">Can't load your profile</h2>
          <p className="mb-5 text-sm text-[var(--text-secondary)]">Your data is safe — we just couldn't reach it. Check your connection and try again.</p>
          <div className="flex justify-center gap-3">
            <button onClick={() => retryProfile()} className="btn-primary px-4 py-2 text-sm">Try again</button>
            <button onClick={() => signOut()} className="rounded-xl border border-ink/10 px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-ink/5">Sign out</button>
          </div>
        </div>
      </FullScreenMessage>
    );
  }
  if (profileStatus !== 'ready') {
    return <FullScreenMessage><LoadingSpinner label="Loading ALORA..." /></FullScreenMessage>;
  }

  const pages: Record<string, React.ReactNode> = {
    home: <HomePage onNavigate={navigate} />,
    academia: <AcademiaPage />,
    quiz: <QuizPage onNavigate={navigate} />,
    tasks: <TasksPage />,
    routines: <RoutinesPage />,
    chat: <ChatPage />,
    journal: <JournalPage />,
    future: <FuturePage />,
    novel: <NovelPage />,
    memory: <MemoryPage />,
    worlds: <WorldsPage onNavigate={navigate} />,
    settings: <SettingsPage onNavigate={navigate} />,
  };

  return (
    <SettingsProvider>
      <WorldProvider>
        <AppShell currentPage={currentPage} onNavigate={navigate}>
          {/* keyed by page so a crash on one page resets when you navigate away */}
          <ErrorBoundary scope="page" key={currentPage}>
            <Suspense fallback={<LoadingSpinner label="Loading..." />}>
              {pages[currentPage] || pages.home}
            </Suspense>
          </ErrorBoundary>
        </AppShell>
      </WorldProvider>
    </SettingsProvider>
  );
}

function App() {
  if (supabaseConfigError) return <ConfigErrorScreen message={supabaseConfigError} />;
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
