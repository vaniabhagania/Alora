import { useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';
import { WorldProvider } from '@/lib/worlds';
import { AppShell } from '@/components/AppShell';
import { AuthPage } from '@/pages/AuthPage';
import { HomePage } from '@/pages/HomePage';
import { AcademiaPage } from '@/pages/AcademiaPage';
import { TasksPage } from '@/pages/TasksPage';
import { QuizPage } from '@/pages/QuizPage';
import { ChatPage } from '@/pages/ChatPage';
import { JournalPage } from '@/pages/JournalPage';
import { FuturePage } from '@/pages/FuturePage';
import { NovelPage } from '@/pages/NovelPage';
import { MemoryPage } from '@/pages/MemoryPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { WorldsPage } from '@/pages/WorldsPage';
import { LoadingSpinner } from '@/components/ui';

function AppContent() {
  const { session, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('home');

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)]"><LoadingSpinner label="Loading ALORA..." /></div>;
  }

  if (!session) return <AuthPage />;

  const pages: Record<string, React.ReactNode> = {
    home: <HomePage onNavigate={setCurrentPage} />,
    academia: <AcademiaPage />,
    quiz: <QuizPage />,
    tasks: <TasksPage />,
    chat: <ChatPage />,
    journal: <JournalPage />,
    future: <FuturePage />,
    novel: <NovelPage />,
    memory: <MemoryPage />,
    worlds: <WorldsPage onNavigate={setCurrentPage} />,
    settings: <SettingsPage />,
  };

  return (
    <WorldProvider>
      <AppShell currentPage={currentPage} onNavigate={setCurrentPage}>{pages[currentPage] || pages.home}</AppShell>
    </WorldProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
