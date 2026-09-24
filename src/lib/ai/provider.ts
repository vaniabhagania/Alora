import type {
  AIProvider,
  AIChatResponse,
  AIQuizQuestion,
  AIClassSummary,
  AITaskExtraction,
  AIReflection,
  AINovelCuration,
  MemorySearchResult,
  ChatMessage,
  ChatContext,
} from './types';
import { ALORA_SYSTEM_PROMPT, detectEmotionalDistress, detectEmotionalState, CRISIS_RESOURCES } from './types';
import { ClaudeProvider } from './claudeProvider';

/**
 * Local AI provider — generates contextual responses based on user data
 * without requiring an external API. This is a placeholder that produces
 * intelligent, data-driven responses using the user's actual stored information.
 * When a real AI provider is connected, swap this out for the real implementation.
 */
class LocalAIProvider implements AIProvider {
  name = 'local';

  async chat(messages: ChatMessage[], context: ChatContext): Promise<AIChatResponse> {
    await delay(400 + Math.random() * 600);

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMessage) {
      return { message: "I'm here. What's on your mind?", insights: [], suggestedActions: [] };
    }

    const msg = lastUserMessage.content.toLowerCase();

    if (detectEmotionalDistress(lastUserMessage.content)) {
      return {
        message: `I hear you, and what you're feeling right now is real. But I want to pause here — what you're describing goes beyond what I'm equipped to help with alone.\n\n${CRISIS_RESOURCES}\n\nI'm not going anywhere. When you're ready, we'll figure out the next step together.`,
        insights: [],
        suggestedActions: ['Reach out to a crisis line right now', 'Talk to someone you trust today'],
      };
    }

    const emotions = detectEmotionalState(lastUserMessage.content);
    if (emotions.length > 0) {
      return generateEmotionalResponse(emotions, context);
    }

    // Order matters: more specific intents are checked before broader ones,
    // so e.g. "how am I doing with my tasks" hits the task branch, not the
    // generic progress branch just because it contains "how am i doing".
    if (/\b(task|tasks|assignment|assignments|deadline|deadlines|due|overdue|avoiding|procrastinat)\b/.test(msg)) {
      return generateTaskResponse(context);
    }

    if (/\b(study|revise|review|practice)\b/.test(msg) && /\b(what|should|today|now)\b/.test(msg)) {
      return generateStudyRecommendation(context);
    }

    if (/\b(weak|struggling|bad at|difficult|hard)\b/.test(msg)) {
      return generateWeaknessResponse(context);
    }

    if (/\b(learned|last week|last month|remember|recap)\b/.test(msg)) {
      return generateRecapResponse(context);
    }

    if (/\b(progress|on track)\b/.test(msg) || /how (am i|'?s it) (doing|going|progressing)\b/.test(msg)) {
      return generateProgressResponse(context);
    }

    return generateDefaultResponse(lastUserMessage.content, context);
  }

  async generateQuiz(
    topics: string[],
    weakTopics: string[],
    mix: { recent: number; older: number; weak: number; upcoming: number; lateral: number }
  ): Promise<AIQuizQuestion[]> {
    await delay(800);
    const questions: AIQuizQuestion[] = [];
    const allTopics = [...new Set([...topics, ...weakTopics])].filter(Boolean);

    if (allTopics.length === 0) {
      allTopics.push('General Knowledge');
    }

    for (const topic of allTopics.slice(0, 5)) {
      questions.push({
        question_type: 'mcq',
        question: `Which of the following best describes the core concept of ${topic}?`,
        options: [
          `A foundational principle that underpins ${topic}`,
          `An unrelated mathematical theorem`,
          `A historical event from the 1800s`,
          `A type of data structure`,
        ],
        correct_answer: `A foundational principle that underpins ${topic}`,
        explanation: `${topic} is best understood through its foundational principles. Review your class notes for the specific details.`,
        topic,
        difficulty: 'medium',
      });
    }

    // mix.weak / mix.lateral are 0-100 weights from Settings — a weight of 0
    // means the user asked to exclude that question type entirely.
    if (weakTopics.length > 0 && mix.weak > 0) {
      questions.push({
        question_type: 'explain',
        question: `Explain ${weakTopics[0]} in your own words. What is it, why does it matter, and where does it apply?`,
        options: [],
        correct_answer: `A thorough explanation demonstrating understanding of ${weakTopics[0]} and its applications.`,
        explanation: `This is a weak area — focus on understanding the "why" behind ${weakTopics[0]}, not just the "what".`,
        topic: weakTopics[0],
        difficulty: 'hard',
      });
    }

    if (mix.lateral > 0) {
      questions.push({
        question_type: 'lateral',
        question: `If you had to teach ${allTopics[0] || 'your subject'} to a 10-year-old using only a pizza as a metaphor, how would you do it?`,
        options: [],
        correct_answer: `Any creative answer that demonstrates deep understanding through analogy.`,
        explanation: `Lateral thinking questions test whether you truly understand a concept well enough to explain it through unexpected analogies.`,
        topic: allTopics[0] || 'General',
        difficulty: 'hard',
      });
    }

    return questions;
  }

  async summarizeClass(rawInput: string): Promise<AIClassSummary> {
    await delay(600);
    const sentences = splitSentences(rawInput);
    const questions = sentences.filter((s) => s.trim().endsWith('?'));
    const weakAreas = sentences.filter((s) => /\b(confus\w*|don'?t (get|understand)|unclear|struggl\w*|lost|hard to)\b/i.test(s));
    const learnings = sentences.filter((s) => /\b(learn(ed)?|realiz\w*|understood|now (i )?(get|know)|makes sense)\b/i.test(s));
    const understanding: AIClassSummary['understanding'] =
      weakAreas.length > learnings.length ? 'low' : learnings.length > weakAreas.length ? 'high' : 'medium';

    return {
      course: '',
      topics: [],
      understanding,
      weakAreas: weakAreas.length ? weakAreas.slice(0, 5) : [],
      tasks: [],
      questions: questions.slice(0, 5),
      learnings: learnings.slice(0, 5),
    };
  }

  async extractTasks(rawInput: string): Promise<AITaskExtraction> {
    await delay(500);
    const sentences = splitSentences(rawInput);
    const taskLike = sentences.filter((s) => /\b(due|deadline|submit|assignment|homework|by (mon|tue|wed|thu|fri|sat|sun)|need to|have to|must)\b/i.test(s));
    const urgent = /\b(urgent|asap|tonight|tomorrow)\b/i;
    return {
      tasks: taskLike.slice(0, 5).map((s) => ({
        title: s.trim().replace(/^(and|also|then)\s+/i, '').slice(0, 120),
        deadline: '',
        priority: urgent.test(s) ? 'high' : 'medium',
        category: 'academic',
      })),
    };
  }

  async reflect(journalEntries: string[]): Promise<AIReflection> {
    await delay(700);
    if (journalEntries.length === 0) {
      return { patterns: [], insights: [], challenges: [], suggestedActions: [] };
    }

    const emotionCounts = new Map<string, number>();
    const challengeEntries: string[] = [];
    for (const entry of journalEntries) {
      const states = detectEmotionalState(entry);
      for (const s of states) emotionCounts.set(s, (emotionCounts.get(s) || 0) + 1);
      if (states.length > 0 || /\b(struggl|difficult|hard|can'?t|stuck)\b/i.test(entry)) {
        challengeEntries.push(entry.length > 140 ? entry.slice(0, 140) + '…' : entry);
      }
    }
    const sortedEmotions = [...emotionCounts.entries()].sort((a, b) => b[1] - a[1]);
    const topEmotion = sortedEmotions[0];

    const patterns = topEmotion
      ? [`"${topEmotion[0]}" shows up in ${topEmotion[1]} of your last ${journalEntries.length} entries — that's a real pattern, not a one-off.`]
      : [`No single emotional theme dominates your last ${journalEntries.length} entries — that reads as steady, not stuck.`];
    const insights = topEmotion
      ? [`Recurring "${topEmotion[0]}" usually has a specific, findable trigger. Worth naming it directly instead of letting it stay vague.`]
      : ['Your entries vary in tone entry to entry — normal, as long as the lows are recovering, not compounding.'];

    return {
      patterns,
      insights,
      challenges: challengeEntries.slice(0, 3),
      suggestedActions: topEmotion
        ? ['Name the specific trigger behind this pattern, not just the feeling', 'Bring this pattern up next time you talk to Alora']
        : ['Keep journaling consistently — patterns need volume to show up clearly'],
    };
  }

  async curateNovelScene(rawContent: string): Promise<AINovelCuration> {
    await delay(800);
    return {
      curatedContent: rawContent,
      aiSuggestions: [
        { type: 'grammar', content: 'Consider tightening this sentence for impact.' },
        { type: 'context', content: 'Adding sensory detail here would ground the reader.' },
      ],
    };
  }

  async searchMemories(
    query: string,
    memories: { id: string; content: string; category: string }[]
  ): Promise<MemorySearchResult[]> {
    await delay(300);
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

    return memories
      .map((m) => {
        const contentLower = m.content.toLowerCase();
        let score = 0;
        for (const word of queryWords) {
          if (contentLower.includes(word)) score += 1;
        }
        return {
          memoryId: m.id,
          content: m.content,
          relevanceScore: score,
          category: m.category,
        };
      })
      .filter((r) => r.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 10);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function generateEmotionalResponse(emotions: string[], context: ChatContext): AIChatResponse {
  const primary = emotions[0];
  const responses: Record<string, AIChatResponse> = {
    overwhelmed: {
      message: `Okay, let's slow down for a second. "Overwhelmed" is a signal, not a verdict. It means the load exceeded your current capacity in this moment — not that you can't handle it.\n\nYou have ${context.upcomingTasks.length} things coming up and ${context.overdueTasks.length} overdue. That's real. But let's separate what's urgent from what's just loud. What's the one thing that would make the biggest difference if you finished it today?`,
      insights: ['Overwhelm often comes from trying to hold everything at once — get it out of your head and onto a list'],
      suggestedActions: ['Pick ONE task to focus on right now', 'List everything else so it stops circling in your mind'],
    },
    sad: {
      message: `I'm not going to pretend a sentence from me fixes this. You're feeling something real, and I want to understand it before I try to "fix" anything.\n\nWhat happened? And is this a wave, or has it been building for a while?`,
      insights: ['Sadness has context — understanding the trigger matters more than the feeling itself'],
      suggestedActions: ['Name what triggered this feeling', 'Write it out in your journal — no editing, just honesty'],
    },
    unmotivated: {
      message: `Here's the thing about motivation: it's a lagging indicator. You don't get motivated and then act — you act and then motivation follows.\n\nYou've kept a ${context.streak}-day streak going. That's not someone who lacks drive. That's someone who's temporarily disconnected from it. So let's not wait for motivation. What's the smallest possible action you could take in the next 5 minutes?`,
      insights: ['Action precedes motivation, not the other way around'],
      suggestedActions: ['Do one tiny thing — even 5 minutes counts', 'Revisit your "why" in My Future'],
    },
    anxious: {
      message: `Anxiety is your brain trying to protect you from a threat that hasn't arrived yet. It's not broken — it's miscalibrated.\n\nLet's ground this. What specifically are you worried about? Not the vague cloud of dread — the actual specific thing. Because vague anxiety is paralyzing, but specific anxiety has a solution.`,
      insights: ['Naming the specific fear shrinks it — vagueness is what makes anxiety paralyzing'],
      suggestedActions: ['Name the specific worst-case scenario', "Ask: what's the evidence for and against this fear?"],
    },
    lost: {
      message: `Feeling lost means you're between maps. The old one doesn't work anymore and you haven't drawn the new one yet. That's uncomfortable, but it's not failure.\n\nYou have ${context.identities.length} future-self identities defined and ${context.goals.length} active goals. Let's use those as a compass. Which one feels most alive right now?`,
      insights: ['Feeling lost is a transition state, not a destination'],
      suggestedActions: ['Review your My Future identities', 'Pick one direction and take a small step — clarity comes from movement'],
    },
    frustrated: {
      message: `Frustration is energy. The question is whether you're going to spend it or waste it.\n\nWhat specifically is blocking you right now? Is it a skill gap, a resource gap, or a process gap? Because each one has a different solution, and "just try harder" isn't any of them.`,
      insights: ["Frustration points directly at what needs to change — it's diagnostic, not destructive"],
      suggestedActions: ['Identify the specific blocker: skill, resource, or process?', 'Take a 10-minute break, then come back with fresh eyes'],
    },
    'burnt out': {
      message: `Burnout isn't laziness. It's your system running on empty for too long. Pushing harder right now would be like pressing the gas with no fuel in the tank.\n\nYou need actual rest — not "rest where you feel guilty the whole time." And then we need to look at what's draining you, because rest without change is just a pause button on the same problem.`,
      insights: ['Burnout requires both rest AND change — rest alone just delays the next burnout'],
      suggestedActions: ['Take genuine rest today — no guilt, no "should be studying"', "After rest, audit what's draining you most"],
    },
    disappointed: {
      message: `Disappointment means you cared about something and it didn't match your expectation. That's not weakness — that's evidence you're aiming at something.\n\nBut let's be honest: was the expectation realistic, or were you setting yourself up to feel exactly this way? There's a difference between "I failed" and "I set an impossible target and then felt bad about missing it."`,
      insights: ['Disappointment reveals what you actually care about — pay attention to it'],
      suggestedActions: ['Separate the outcome from the expectation', 'Adjust the target, not the ambition'],
    },
  };

  return responses[primary] || responses.overwhelmed;
}

function generateStudyRecommendation(context: ChatContext): AIChatResponse {
  const weak = context.weakTopics.slice(0, 3);
  const upcoming = context.upcomingTasks.slice(0, 3);

  let message = `Based on your data, here's what I'd focus on today:\n\n`;
  if (weak.length > 0) {
    message += `**Weak areas to target:** ${weak.join(', ')}\nThese keep showing up — avoiding them won't make them go away.\n\n`;
  }
  if (upcoming.length > 0) {
    message += `**Deadlines approaching:**\n`;
    upcoming.forEach((t) => {
      message += `- ${t.title} (due ${new Date(t.deadline).toLocaleDateString()})\n`;
    });
  }
  message += `\nYour quiz average is ${context.quizAvgScore}%. `;
  if (context.quizAvgScore < 70) {
    message += `That's below where you should be. Let's raise it.`;
  } else {
    message += `Solid, but don't coast.`;
  }

  return {
    message,
    insights: weak.length > 0 ? [`You've been avoiding: ${weak.join(', ')}`] : [],
    suggestedActions: ['Start with your weakest topic for 25 minutes', 'Take a quiz after studying to verify retention'],
  };
}

function generateWeaknessResponse(context: ChatContext): AIChatResponse {
  if (context.weakTopics.length === 0) {
    return {
      message: `Honestly? I don't have enough data yet to tell you what you're weak at. That means either you're genuinely solid across the board (unlikely), or you haven't been logging your classes consistently enough for me to see the gaps.\n\nStart logging classes after each session — especially the parts that confused you. I'll build the picture from there.`,
      insights: ['Not enough class logs to identify weak areas — start logging consistently'],
      suggestedActions: ['Log your most recent class right now', 'Mark topics as weak when you log them'],
    };
  }

  return {
    message: `Your weak areas, based on what you've told me:\n\n${context.weakTopics.map((t) => `- ${t}`).join('\n')}\n\nThese aren't character flaws — they're just gaps. Gaps close with targeted practice, not avoidance. Which one are we tackling first?`,
    insights: [`You have ${context.weakTopics.length} tracked weak areas`],
    suggestedActions: ['Pick one weak area and study it for 25 minutes', 'Log a class session after studying to track improvement'],
  };
}

function generateProgressResponse(context: ChatContext): AIChatResponse {
  const activeGoals = context.goals.filter((g) => g.progress < 100);
  const identities = context.identities;

  let message = `Here's your honest progress snapshot:\n\n`;
  message += `**Streak:** ${context.streak} days\n`;
  message += `**Quiz average:** ${context.quizAvgScore}%\n\n`;

  if (activeGoals.length > 0) {
    message += `**Goals in progress:**\n`;
    activeGoals.forEach((g) => {
      message += `- ${g.title}: ${g.progress}%\n`;
    });
  }

  if (identities.length > 0) {
    message += `\n**Future-self identities:**\n`;
    identities.forEach((i) => {
      message += `- ${i.name}: ${i.progress}%\n`;
    });
  }

  message += `\nHere's the question: are you moving, or just maintaining? Because those look the same from the inside until suddenly they don't.`;

  return {
    message,
    insights: [`${activeGoals.length} goals still in progress`, `${identities.length} identities being tracked`],
    suggestedActions: ["Review goals that haven't moved in a while", 'Take a quiz to verify retention'],
  };
}

function generateTaskResponse(context: ChatContext): AIChatResponse {
  const overdue = context.overdueTasks;
  const upcoming = context.upcomingTasks;

  if (overdue.length > 0) {
    return {
      message: `You have ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}:\n\n${overdue.map((t) => `- ${t.title} (was due ${new Date(t.deadline).toLocaleDateString()})`).join('\n')}\n\nLet us stop pretending these will resolve themselves. Which one has been sitting there the longest? That is probably the one you are avoiding most — and the one that will feel best to kill.`,
      insights: [`${overdue.length} overdue tasks — avoidance pattern detected`],
      suggestedActions: ['Complete the oldest overdue task first', 'If a task is no longer relevant, delete it instead of letting it haunt you'],
    };
  }

  if (upcoming.length > 0) {
    return {
      message: `You have ${upcoming.length} task${upcoming.length > 1 ? 's' : ''} due soon:\n\n${upcoming.map((t) => `- ${t.title} (due ${new Date(t.deadline).toLocaleDateString()}, ${t.priority} priority)`).join('\n')}\n\nBased on urgency and effort, I'd start with the highest-priority one closest to its deadline. Want me to break it down?`,
      insights: [`${upcoming.length} upcoming deadlines`],
      suggestedActions: ['Start with the most urgent task', 'Block time on your calendar for each'],
    };
  }

  return {
    message: `Your task list is clear. No overdue, nothing due soon. That is either genuinely great or you haven't been tracking things. Which is it?`,
    insights: [],
    suggestedActions: ['Add any tasks you might be holding in your head', 'Use this time to get ahead on studying'],
  };
}

function generateRecapResponse(context: ChatContext): AIChatResponse {
  const recent = context.recentClasses.slice(0, 5);

  if (recent.length === 0) {
    return {
      message: `I do not have any logged classes to recap. You haven't been logging your sessions — which means I cannot help you remember what you learned. That is literally my main job.\n\nLog your most recent class and I will start building your memory.`,
      insights: ['No class logs found — start logging to build memory'],
      suggestedActions: ['Log your most recent class now', 'Make class logging a post-class habit'],
    };
  }

  return {
    message: `Here's what you've been learning recently:\n\n${recent.map((c) => `- ${c.course}: ${c.title} (${new Date(c.date).toLocaleDateString()})`).join('\n')}\n\nWant me to pull up the details of any of these? Or quiz you on them?`,
    insights: [`${recent.length} recent class sessions logged`],
    suggestedActions: ['Review notes from your most recent class', 'Take a quiz on recent material'],
  };
}

function generateDefaultResponse(userMessage: string, context: ChatContext): AIChatResponse {
  const name = context.userName || 'there';
  return {
    message: `I hear you. Tell me more about what's going on, ${name}. I can help you figure out what to study, review your progress, look at your tasks, or just talk through whatever's on your mind.\n\nWhat do you need right now?`,
    insights: [],
    suggestedActions: ['Ask "What should I study today?"', 'Ask "What am I avoiding?"', 'Ask "How am I progressing?"'],
  };
}

export const aiProvider: AIProvider = new ClaudeProvider(new LocalAIProvider());

export { ALORA_SYSTEM_PROMPT };
