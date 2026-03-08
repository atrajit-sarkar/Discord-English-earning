import { useEffect, useState, useCallback, useRef } from "react";
import { getUserProgress } from "./firebase";
import modernSpokenQuizImage from "../modern-spoken-quiz.png";
import businessQuizImage from "../business-quiz.png";
import nauticalQuizImage from "../public/nautical-origin-idioms-expressions.png";

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID?.trim() ?? "";
const DISCORD_RELAY_URL = import.meta.env.VITE_DISCORD_RELAY_URL?.trim() ?? "";
const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";
const REDIRECT_URI = `${window.location.origin}${window.location.pathname}`;
const SITE_BASE_URL = `${window.location.origin}${window.location.pathname}`;
const PENDING_QUIZ_KEY = "discord-pending-quiz";
const OAUTH_STORAGE_KEY = "discord-oauth-response";
const USER_STORAGE_KEY = "discord-user-profile";
const USER_STATS_STORAGE_KEY_PREFIX = "discord-user-stats:";
const EMPTY_USER_STATS = Object.freeze({
  totalAttempts: 0,
  bestScore: 0,
  bestStreak: 0,
  quizHistory: [],
  seenQuizzes: [],
});

const QUIZZES = {
  "everyday-spoken": [
    {
      question: 'A friendly cashier says, "Hey! How\'s it going?" What is the most natural, casual response?',
      options: ["I am functioning optimally, thank you.", "Not much, you?", "I do not know.", "It goes well."],
      correct: 1,
      explanation: '"Not much, you?" mirrors the casual tone perfectly.',
    },
    {
      question: "Someone is speaking very fast and you completely missed their point. What should you say?",
      options: ["I'm not sure I follow you.", "What is your meaning?", "Speak to me slower.", "I am confused by your words."],
      correct: 0,
      explanation: '"I\'m not sure I follow you" is polite and natural in conversation.',
    },
    {
      question: "You see a friend you haven't seen in three months. What do you say?",
      options: ["How are you existing?", "What is up?", "How have you been?", "Are you fine?"],
      correct: 2,
      explanation: '"How have you been?" naturally asks about the time since you last met.',
    },
    {
      question: 'Which of these is a casual way to say "Hello" when passing a coworker in the hallway?',
      options: ["Greetings to you.", "What's up?", "How do you do?", "I acknowledge you."],
      correct: 1,
      explanation: '"What\'s up?" is the go-to casual greeting in everyday English.',
    },
    {
      question: "You didn't hear what someone just said. What is the most polite, natural response?",
      options: ["Repeat it.", "What?", "Would you mind repeating that?", "Say again your words."],
      correct: 2,
      explanation: '"Would you mind repeating that?" is both polite and commonly used.',
    },
  ],
  "advanced-business": [
    {
      question: "In a formal meeting, how would you best express that you agree with a colleague's point?",
      options: ["I concur completely.", "You betcha.", "That is truth.", "I'm with you dog."],
      correct: 0,
      explanation: '"I concur completely" or simply "I agree" is professional and clear.'
    },
    {
      question: "You need to delay a project deadline. What is the most professional way to tell your manager?",
      options: ["I can't do this now.", "We need to push the deadline back.", "This is too much work.", "Give me more time."],
      correct: 1,
      explanation: '"We need to push the deadline back" is professional and direct.'
    },
    {
      question: "How do you politely interrupt someone in a meeting?",
      options: ["Stop talking.", "May I interject for a moment?", "Hold up.", "My turn."],
      correct: 1,
      explanation: '"May I interject for a moment?" is a polite and professional way to interrupt.'
    },
    {
      question: "When explaining a complex issue, how can you check for understanding?",
      options: ["Are you stupid?", "Do you understand me?", "Does that make sense?", "Get it?"],
      correct: 2,
      explanation: '"Does that make sense?" is a non-confrontational way to check understanding.'
    },
    {
      question: "How would you formally decline a meeting invitation?",
      options: ["No thanks.", "I'll pass.", "I am unable to attend due to prior commitments.", "Nah."],
      correct: 2,
      explanation: '"I am unable to attend due to prior commitments." is polite and formal.'
    }
  ],
  "nautical-idioms": [
    {
      question: "If a business owner says, \"Sales are dropping this quarter, so we need to ________ by cutting costs,\" which nautical idiom completes the sentence to mean preparing for a difficult situation?",
      options: ["Batten down the hatches", "Rock the boat", "Jump ship", "Go overboard"],
      correct: 0,
      explanation: '"Batten down the hatches" means to get ready for a difficult situation by preparing in every way possible. It comes from sailors securely closing a ship\'s hatches when a severe storm is approaching.',
    },
    {
      question: "If you want to compliment a manager by saying they control their business or organization very firmly and effectively, which nautical idiom would you use?",
      options: ["Steer the course", "Sail close to the wind", "Run a tight ship", "Anchor the team"],
      correct: 2,
      explanation: 'When someone \"runs a tight ship,\" it means they keep everything highly organized, disciplined, and functioning smoothly. Native speakers often use this in the workplace to describe a strict but highly effective leader.',
    },
    {
      question: "A coworker tells you, \"We have lots of major bookings ________ and are confident of making excellent profits.\" Which nautical phrase completes the sentence to mean that something is \"likely to happen soon\"?",
      options: ["On the horizon", "In the offing", "At the helm", "In the wake"],
      correct: 1,
      explanation: 'The \"offing\" was a nautical term for the part of the sea visible on the distant horizon. In modern English, if something is \"in the offing,\" it means it can be seen on the horizon and is likely to happen soon.',
    },
    {
      question: "What idiom would you use to describe a situation where you have no good choices, and are placed between two equally hazardous alternatives?",
      options: ["Caught in the doldrums", "Between the devil and the deep blue sea", "Lost at sea", "Up the creek without a paddle"],
      correct: 1,
      explanation: 'This proverb describes being trapped between two equally precarious situations. The \"devil\" was actually the outermost seam on the deck of a wooden ship, putting sailors dangerously close to falling into the deep ocean. Today it means being stuck between two bad options.',
    },
    {
      question: "You wake up feeling ill and need to call your boss to ask for a day off. Which nautical cliché would you use to describe feeling unwell?",
      options: ["All at sea", "In deep water", "Under the weather", "Adrift"],
      correct: 2,
      explanation: 'To be \"under the weather\" means to feel unwell. This expression originally referred to seasickness—suffering from nausea on board a ship because of heavy seas and bad weather. Today, it is a very common cliché to simply mean you are sick.',
    }
  ]
};

const AVAILABLE_QUIZZES = [
  {
    id: "everyday-spoken",
    title: "Modern Spoken English",
    description: "Test your everyday English skills with natural, casual scenarios.",
    image: modernSpokenQuizImage,
    tagline: "Everyday English",
    level: "Beginner/Int",
    duration: "2 mins"
  },
  {
    id: "advanced-business",
    title: "Advanced Business English",
    description: "Master formal communication for the modern workplace.",
    image: businessQuizImage,
    tagline: "Professional English",
    level: "Advanced",
    duration: "3 mins",
    isNew: true
  },
  {
    id: "nautical-idioms",
    title: "Nautical-Origin Idioms",
    description: "Master everyday English expressions that originated from Britain's rich seafaring history.",
    image: nauticalQuizImage,
    tagline: "Nautical English",
    level: "Intermediate",
    duration: "3 mins",
    isNew: true
  }
];

const OPTION_LETTERS = ["A", "B", "C", "D"];

/* ─── SVG Icons ─── */
function DiscordLogo(props) {
  return (
    <svg viewBox="0 0 24 24" className="discord-logo" {...props}>
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
    </svg>
  );
}

function TrophyIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M8 21h8m-7-4h6m-6-2.5V13A5 5 0 0 1 7 9V4h10v5a5 5 0 0 1-2 4v1.5M7 6H4a1 1 0 0 0-1 1 5 5 0 0 0 5 5m9-6h3a1 1 0 0 1 1 1 5 5 0 0 1-5 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ArrowRightIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="m5 12h14m-5-5 5 5-5 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ArrowLeftIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="m19 12H5m5-5-5 5 5 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function LoginIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SendIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="m22 2-7 20-4-9-9-4 20-7Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="m5 12 4.5 4.5L19 7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ErrorIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M12 8v5m0 3h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SpinnerIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M21 12a9 9 0 1 1-3.04-6.77"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

/* ─── Confetti Effect ─── */
function Confetti() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#5865f2", "#57f287", "#fee75c", "#eb459e", "#ed4245", "#ffffff"];
    const particles = [];

    for (let i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height * -1,
        w: Math.random() * 8 + 4,
        h: Math.random() * 4 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        speed: Math.random() * 3 + 2,
        drift: (Math.random() - 0.5) * 2,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
        opacity: 1,
      });
    }

    let frame;
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let allDone = true;

      particles.forEach((p) => {
        p.y += p.speed;
        p.x += p.drift;
        p.rotation += p.rotSpeed;
        if (p.y > canvas.height * 0.7) {
          p.opacity -= 0.02;
        }

        if (p.opacity > 0) {
          allDone = false;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = Math.max(0, p.opacity);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }
      });

      if (!allDone) {
        frame = requestAnimationFrame(animate);
      }
    }

    animate();
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={canvasRef} className="confetti-canvas" />;
}

/* ─── Floating Particles Background ─── */
function FloatingParticles() {
  const particles = useRef(
    Array.from({ length: 6 }, (_, i) => ({
      id: i,
      size: Math.random() * 6 + 3,
      left: Math.random() * 100,
      duration: Math.random() * 20 + 15,
      delay: Math.random() * 10,
      color:
        i % 3 === 0
          ? "rgba(88, 101, 242, 0.3)"
          : i % 3 === 1
            ? "rgba(87, 242, 135, 0.2)"
            : "rgba(254, 231, 92, 0.2)",
    }))
  ).current;

  return (
    <div className="particles">
      {particles.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.left}%`,
            background: p.color,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Helpers ─── */
function getResultSummary(score, totalQuestions) {
  const percentage = Math.round((score / totalQuestions) * 100);

  if (percentage >= 80) {
    return {
      percentage,
      level: "Advanced",
      levelClass: "level-badge--advanced",
      emoji: "\u{1F451}",
      message: "Strong instincts for everyday spoken English!",
      color: 0x23a559,
    };
  }

  if (percentage >= 60) {
    return {
      percentage,
      level: "Intermediate",
      levelClass: "level-badge--intermediate",
      emoji: "\u{2B50}",
      message: "You are picking up natural phrasing well!",
      color: 0xf0b232,
    };
  }

  return {
    percentage,
    level: "Beginner",
    levelClass: "level-badge--beginner",
    emoji: "\u{1F4DA}",
    message: "Keep practicing common conversational patterns!",
    color: 0xf47b67,
  };
}

function isPlaceholder(value) {
  return !value || value.includes("YOUR_");
}

function readStoredOauthResponse() {
  try {
    const storedValue = window.sessionStorage.getItem(OAUTH_STORAGE_KEY);
    return storedValue ? JSON.parse(storedValue) : null;
  } catch {
    return null;
  }
}

function writeStoredOauthResponse(payload) {
  try {
    window.sessionStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures.
  }
}

function clearStoredOauthResponse() {
  try {
    window.sessionStorage.removeItem(OAUTH_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

/* ─── Persistent user profile (localStorage) ─── */
function readStoredUser() {
  try {
    const val = window.localStorage.getItem(USER_STORAGE_KEY);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

function writeStoredUser(user) {
  try {
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch {}
}

function clearStoredUser() {
  try {
    window.localStorage.removeItem(USER_STORAGE_KEY);
  } catch {}
}

function getUserStatsStorageKey(userId) {
  return `${USER_STATS_STORAGE_KEY_PREFIX}${userId}`;
}

function normalizeUserStats(progress) {
  const safeProgress =
    progress && typeof progress === "object" ? progress : EMPTY_USER_STATS;
  const quizHistory = Array.isArray(safeProgress.quizHistory)
    ? safeProgress.quizHistory
    : [];
  const derivedBestScore = quizHistory.reduce(
    (best, attempt) => Math.max(best, attempt?.score ?? 0),
    0
  );
  const derivedBestStreak = quizHistory.reduce(
    (best, attempt) => Math.max(best, attempt?.bestStreak ?? 0),
    0
  );
  const seenQuizzes = new Set(
    Array.isArray(safeProgress.seenQuizzes) ? safeProgress.seenQuizzes : []
  );

  quizHistory.forEach((attempt) => {
    if (attempt?.quizId) {
      seenQuizzes.add(attempt.quizId);
    }
  });

  return {
    ...EMPTY_USER_STATS,
    ...safeProgress,
    totalAttempts:
      typeof safeProgress.totalAttempts === "number"
        ? Math.max(safeProgress.totalAttempts, quizHistory.length)
        : quizHistory.length,
    bestScore:
      typeof safeProgress.bestScore === "number"
        ? Math.max(safeProgress.bestScore, derivedBestScore)
        : derivedBestScore,
    bestStreak:
      typeof safeProgress.bestStreak === "number"
        ? Math.max(safeProgress.bestStreak, derivedBestStreak)
        : derivedBestStreak,
    quizHistory,
    seenQuizzes: Array.from(seenQuizzes),
  };
}

function readStoredUserStats(userId) {
  if (!userId) return null;

  try {
    const val = window.localStorage.getItem(getUserStatsStorageKey(userId));
    return val ? normalizeUserStats(JSON.parse(val)) : null;
  } catch {
    return null;
  }
}

function writeStoredUserStats(userId, stats) {
  if (!userId) return;

  try {
    window.localStorage.setItem(
      getUserStatsStorageKey(userId),
      JSON.stringify(normalizeUserStats(stats))
    );
  } catch {}
}

/* ─── Main App ─── */
export default function App() {
  const [user, setUser] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [loadingUserStats, setLoadingUserStats] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState("");
  const [quizState, setQuizState] = useState("welcome");
  const [currentQuizId, setCurrentQuizId] = useState(null);
  const currentQuizData = currentQuizId ? QUIZZES[currentQuizId] : [];
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [webhookStatus, setWebhookStatus] = useState("idle");
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [questionKey, setQuestionKey] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const authBootstrapStartedRef = useRef(false);
  const isMountedRef = useRef(false);
  const [userAnswers, setUserAnswers] = useState([]);
  const [pastReviewAttempt, setPastReviewAttempt] = useState(null);
  const quizCardRefs = useRef({});
  const turnstileContainerRef = useRef(null);
  const turnstileWidgetIdRef = useRef(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");

  const discordConfigured = !isPlaceholder(DISCORD_CLIENT_ID);
  const relayConfigured = !isPlaceholder(DISCORD_RELAY_URL);
  const turnstileConfigured = !isPlaceholder(TURNSTILE_SITE_KEY);
  const userStatsView = userStats ?? EMPTY_USER_STATS;
  const recentQuizHistory = userStatsView.quizHistory;
  const seenQuizIds = new Set(userStatsView.seenQuizzes);

  /* Load Firestore stats for a given user */
  async function loadUserStats(u, options = {}) {
    if (!u?.id) return EMPTY_USER_STATS;

    const { syncProfile = true } = options;
    const cachedProgress = readStoredUserStats(u.id);

    if (isMountedRef.current) {
      if (cachedProgress) {
        setUserStats(cachedProgress);
      }
      setLoadingUserStats(true);
    }

    try {
      const progress = await getUserProgress(u.id);
      const nextStats =
        progress === null && cachedProgress
          ? cachedProgress
          : normalizeUserStats(progress);

      if (!isMountedRef.current) return nextStats;
      setUserStats(nextStats);
      writeStoredUserStats(u.id, nextStats);
      return nextStats;
    } catch (err) {
      console.error("loadUserStats:", err);
      const fallbackStats = cachedProgress ?? EMPTY_USER_STATS;
      if (!isMountedRef.current) return fallbackStats;
      setUserStats(fallbackStats);
      return fallbackStats;
    } finally {
      if (isMountedRef.current) {
        setLoadingUserStats(false);
      }
    }
  }

  useEffect(() => {
    isMountedRef.current = true;

    if (authBootstrapStartedRef.current) {
      return () => {
        isMountedRef.current = false;
      };
    }

    authBootstrapStartedRef.current = true;

    function finishLoading() {
      if (!isMountedRef.current) return;
      setLoadingAuth(false);
    }

    function applyDiscordUser(nextUser) {
      if (!isMountedRef.current) return;
      const cachedProgress = readStoredUserStats(nextUser.id);
      setUser(nextUser);
      setUserStats(cachedProgress);
      setLoadingUserStats(true);
      writeStoredUser(nextUser);
      setAuthError("");

      /* Auto-start a quiz if a deep-link was pending */
      const pendingQuiz = sessionStorage.getItem(PENDING_QUIZ_KEY);
      if (pendingQuiz && QUIZZES[pendingQuiz]) {
        sessionStorage.removeItem(PENDING_QUIZ_KEY);
        setCurrentQuizId(pendingQuiz);
        setCurrentQuestion(0);
        setScore(0);
        setStreak(0);
        setBestStreak(0);
        setSelectedAnswer(null);
        setAnswerRevealed(false);
        setQuestionKey(0);
        setShowConfetti(false);
        setWebhookStatus("idle");
        setUserAnswers([]);
        setQuizState("quiz");
      } else {
        setQuizState("dashboard");
      }

      return cachedProgress;
    }

    async function bootstrapAuth() {
      /* 0. Capture ?quiz= deep-link param and persist it for after OAuth */
      const searchParams = new URLSearchParams(window.location.search);
      const quizParam = searchParams.get("quiz");
      if (quizParam && QUIZZES[quizParam]) {
        sessionStorage.setItem(PENDING_QUIZ_KEY, quizParam);
        searchParams.delete("quiz");
        const cleanSearch = searchParams.toString();
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ""}`
        );
      }

      /* 1. Check for an OAuth callback in the URL hash */
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const hashPayload = {
        accessToken: fragment.get("access_token"),
        tokenType: fragment.get("token_type"),
        oauthError: fragment.get("error"),
        oauthErrorDescription: fragment.get("error_description"),
      };
      const hasHashPayload = Object.values(hashPayload).some(Boolean);

      if (hasHashPayload) {
        writeStoredOauthResponse(hashPayload);
      }

      if (window.location.hash) {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`
        );
      }

      const oauthPayload = readStoredOauthResponse();
      const accessToken = oauthPayload?.accessToken ?? "";
      const tokenType = oauthPayload?.tokenType ?? "";
      const oauthError = oauthPayload?.oauthError ?? "";
      const oauthErrorDescription = oauthPayload?.oauthErrorDescription ?? "";

      if (oauthError) {
        if (!isMountedRef.current) return;
        setAuthError(
          oauthErrorDescription?.replace(/\+/g, " ") ||
            "Discord login was cancelled or denied."
        );
        clearStoredOauthResponse();
        finishLoading();
        return;
      }

      /* 2. If we have a fresh token from the hash, fetch profile */
      if (accessToken && tokenType) {
        try {
          const response = await fetch("https://discord.com/api/users/@me", {
            headers: { authorization: `${tokenType} ${accessToken}` },
          });

          if (!response.ok) {
            throw new Error("Failed to fetch Discord profile.");
          }

          const profile = await response.json();
          const nextUser = {
            id: profile.id,
            username: profile.username,
            avatar: profile.avatar
              ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
              : "https://cdn.discordapp.com/embed/avatars/0.png",
          };

          const cachedProgress = applyDiscordUser(nextUser);
          if (cachedProgress) {
            finishLoading();
          }
          await loadUserStats(nextUser);
          finishLoading();
        } catch {
          if (!isMountedRef.current) return;
          setAuthError("Could not load your Discord profile.");
          finishLoading();
        } finally {
          clearStoredOauthResponse();
        }

        return;
      }

      /* 3. No fresh token — try restoring from localStorage */
      clearStoredOauthResponse();
      const savedUser = readStoredUser();

      if (savedUser?.id) {
        const cachedProgress = applyDiscordUser(savedUser);
        if (cachedProgress) {
          finishLoading();
        }
        await loadUserStats(savedUser);
        finishLoading();
        return;
      }

      /* 4. No saved user — show login page (no auto-redirect) */
      finishLoading();
    }

    void bootstrapAuth();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  function clearTurnstileWidget() {
    if (!window.turnstile || turnstileWidgetIdRef.current === null) {
      turnstileWidgetIdRef.current = null;
      return;
    }

    try {
      window.turnstile.remove(turnstileWidgetIdRef.current);
    } catch {
      // Ignore stale widget cleanup failures.
    }

    turnstileWidgetIdRef.current = null;
  }

  function resetTurnstileChallenge() {
    setTurnstileToken("");

    if (!window.turnstile || turnstileWidgetIdRef.current === null) {
      return;
    }

    try {
      window.turnstile.reset(turnstileWidgetIdRef.current);
    } catch {
      clearTurnstileWidget();
    }
  }

  useEffect(() => {
    if (!turnstileConfigured || quizState !== "results") {
      setTurnstileToken("");
      setTurnstileError("");
      clearTurnstileWidget();
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let intervalId = null;

    setTurnstileToken("");
    setTurnstileError("");
    clearTurnstileWidget();

    function mountTurnstile() {
      if (cancelled || !window.turnstile || !turnstileContainerRef.current) {
        return false;
      }

      turnstileContainerRef.current.innerHTML = "";
      turnstileWidgetIdRef.current = window.turnstile.render(
        turnstileContainerRef.current,
        {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "dark",
          callback(token) {
            if (!cancelled) {
              setTurnstileError("");
              setTurnstileToken(token);
            }
          },
          "expired-callback"() {
            if (!cancelled) {
              setTurnstileToken("");
            }
          },
          "error-callback"() {
            if (!cancelled) {
              setTurnstileToken("");
              setTurnstileError(
                "Could not load the anti-spam check. Refresh and try again."
              );
            }
          },
        }
      );

      return true;
    }

    if (!mountTurnstile()) {
      intervalId = window.setInterval(() => {
        attempts += 1;

        if (mountTurnstile()) {
          window.clearInterval(intervalId);
          return;
        }

        if (attempts >= 20) {
          window.clearInterval(intervalId);
          if (!cancelled) {
            setTurnstileError(
              "Could not load the anti-spam check. Refresh and try again."
            );
          }
        }
      }, 250);
    }

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      clearTurnstileWidget();
    };
  }, [quizState, currentQuizId, score, turnstileConfigured]);

  function handleDiscordLogin() {
    if (!discordConfigured) {
      setAuthError(
        "Add VITE_DISCORD_CLIENT_ID to .env before using Discord login."
      );
      return;
    }

    /* Preserve any pending quiz deep-link through the OAuth flow */
    const pendingQuiz = sessionStorage.getItem(PENDING_QUIZ_KEY);
    if (!pendingQuiz && currentQuizId) {
      sessionStorage.setItem(PENDING_QUIZ_KEY, currentQuizId);
    }

    const oauthUrl =
      "https://discord.com/api/oauth2/authorize" +
      `?client_id=${DISCORD_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      "&response_type=token&scope=identify";

    window.location.href = oauthUrl;
  }

  function handleLogout() {
    clearStoredUser();
    setUser(null);
    setUserStats(null);
    setLoadingUserStats(false);
    setQuizState("welcome");
  }

  /* Just record the selected answer — no reveal, no scoring yet */
  const handleAnswerClick = useCallback(
    (index) => {
      setSelectedAnswer(index);
    },
    []
  );

  /* Move to the next question (records the answer) */
  function handleNextQuestion() {
    if (selectedAnswer === null) return;
    setUserAnswers((prev) => [...prev, selectedAnswer]);
    setSelectedAnswer(null);
    setCurrentQuestion((prev) => prev + 1);
    setQuestionKey((prev) => prev + 1);
  }

  /* Finish quiz: record last answer, compute score, go to results */
  async function handleFinishQuiz() {
    if (selectedAnswer === null) return;
    const allAnswers = [...userAnswers, selectedAnswer];
    setUserAnswers(allAnswers);

    // Calculate score & streaks from all answers
    let finalScore = 0;
    let currentStreak = 0;
    let maxStreak = 0;
    allAnswers.forEach((ans, i) => {
      if (ans === currentQuizData[i].correct) {
        finalScore++;
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    });

    setScore(finalScore);
    setBestStreak(maxStreak);
    setQuizState("results");

    if (finalScore >= Math.ceil(currentQuizData.length * 0.6)) {
      setShowConfetti(true);
    }


  }

  async function sendResultsToDiscord() {
    if (!user || !relayConfigured) {
      setWebhookStatus("error");
      return;
    }

    if (turnstileConfigured && !turnstileToken) {
      setTurnstileError("Complete the anti-spam check before sharing.");
      setWebhookStatus("error");
      return;
    }

    setWebhookStatus("sending");
    setTurnstileError("");
    const quizMeta = AVAILABLE_QUIZZES.find(q => q.id === currentQuizId);
    const quizTitle = quizMeta?.title ?? "Quiz";

    try {
      const response = await fetch(DISCORD_RELAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          username: user.username,
          avatar: user.avatar,
          quizId: currentQuizId,
          quizTitle,
          siteBaseUrl: SITE_BASE_URL,
          userAnswers,
          turnstileToken,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error("Relay error body:", errBody);
        throw new Error(`Relay responded with ${response.status}: ${errBody}`);
      }

      setWebhookStatus("success");
      // Reload stats from Firestore (worker saved the result)
      await loadUserStats(user, { syncProfile: false });
    } catch (error) {
      console.error(error);
      setWebhookStatus("error");
    } finally {
      if (turnstileConfigured) {
        resetTurnstileChallenge();
      }
    }
  }

  function resetQuiz() {
    setCurrentQuestion(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setQuizState("dashboard");
    setWebhookStatus("idle");
    setSelectedAnswer(null);
    setAnswerRevealed(false);
    setQuestionKey(0);
    setShowConfetti(false);
    setCurrentQuizId(null);
    setUserAnswers([]);
  }

  function handleBackToDashboard() {
    setCurrentQuestion(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setQuizState("dashboard");
    setSelectedAnswer(null);
    setAnswerRevealed(false);
    setQuestionKey(0);
    setCurrentQuizId(null);
    setUserAnswers([]);
  }

  function handleStartQuiz(quizId) {
    setCurrentQuizId(quizId);
    setCurrentQuestion(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setSelectedAnswer(null);
    setAnswerRevealed(false);
    setQuestionKey(0);
    setShowConfetti(false);
    setWebhookStatus("idle");
    setUserAnswers([]);
    setQuizState("quiz");

    // Mark quiz as seen so the NEW badge disappears (persisted in Firestore)
    if (user) {
      setUserStats((prev) => {
        if (!prev) return prev;

        const nextStats = normalizeUserStats({
          ...prev,
          seenQuizzes: [...(prev.seenQuizzes ?? []), quizId],
        });

        writeStoredUserStats(user.id, nextStats);
        return nextStats;
      });

      void loadUserStats(user, { syncProfile: false });
    }
  }

  function scrollToQuizCard(quizId) {
    const el = quizCardRefs.current[quizId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("quiz-card--glow");
      setTimeout(() => el.classList.remove("quiz-card--glow"), 1800);
    }
  }

  function handleViewPastAttempt(attempt) {
    setPastReviewAttempt(attempt);
    setQuizState("past-review");
  }

  function handleQuizCardKeyDown(event, quizId) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    handleStartQuiz(quizId);
  }

  /* ─── Loading State ─── */
  if (loadingAuth) {
    return (
      <main className="page-shell">
        <FloatingParticles />
        <section className="card card--compact status-card">
          <SpinnerIcon className="icon icon--spin icon--large" />
          <p>Logging you in...</p>
        </section>
      </main>
    );
  }

  /* ─── Login Page (no user) ─── */
  if (!user) {
    return (
      <main className="login-page">
        <FloatingParticles />
        <div className="login-card">
          <div className="login-card__logo">
            <DiscordLogo />
          </div>
          <h1 className="login-card__title">English Quiz</h1>
          <p className="login-card__subtitle">
            Test your everyday English skills and track your progress with the community.
          </p>

          {authError && (
            <div className="notice notice--error" style={{ width: "100%" }}>
              <ErrorIcon className="icon" />
              <span>{authError}</span>
            </div>
          )}

          <div className="login-card__divider" />

          <button
            type="button"
            className="button button--discord"
            onClick={handleDiscordLogin}
          >
            <DiscordLogo />
            Login with Discord
          </button>

          <div className="login-card__features">
            <div className="login-card__feature">
              <span className="login-card__feature-icon">{"\u{1F3AF}"}</span>
              5 real-world English questions
            </div>
            <div className="login-card__feature">
              <span className="login-card__feature-icon">{"\u{1F4CA}"}</span>
              Track your score &amp; streaks
            </div>
            <div className="login-card__feature">
              <span className="login-card__feature-icon">{"\u{2601}\uFE0F"}</span>
              Progress saved to cloud
            </div>
            <div className="login-card__feature">
              <span className="login-card__feature-icon">{"\u{1F4E2}"}</span>
              Share results to Discord
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* ─── Quiz State ─── */
  if (quizState === "quiz" && currentQuizData) {
    const question = currentQuizData[currentQuestion];
    const progress = ((currentQuestion + (selectedAnswer !== null ? 1 : 0)) / currentQuizData.length) * 100;
    const isLastQuestion = currentQuestion + 1 === currentQuizData.length;

    return (
      <main className="page-shell">
        <FloatingParticles />
        <section className="card quiz-card">
          <div className="quiz-topbar">
            <button
              type="button"
              className="button button--ghost quiz-back-btn"
              onClick={handleBackToDashboard}
            >
              <ArrowLeftIcon className="icon" />
              Dashboard
            </button>
            <div className="quiz-topbar__info">
              {user && (
                <span className="quiz-topbar__user">
                  <img src={user.avatar} alt="" className="quiz-topbar__avatar" />
                  {user.username}
                </span>
              )}
            </div>
          </div>

          <div className="quiz-progress">
            <div
              className="quiz-progress__bar"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="quiz-header">
            <p className="eyebrow">
              Question {currentQuestion + 1} / {currentQuizData.length}
            </p>
            <span className="quiz-footer__quiz-name">
              {AVAILABLE_QUIZZES.find(q => q.id === currentQuizId)?.title ?? "Quiz"}
            </span>
          </div>

          <div className="question-enter" key={questionKey}>
            <h1 className="quiz-title">{question.question}</h1>

            <div className="quiz-options">
              {question.options.map((option, index) => {
                let optionClass = "quiz-option";
                if (selectedAnswer === index) {
                  optionClass += " quiz-option--selected";
                }

                return (
                  <button
                    key={option}
                    type="button"
                    className={optionClass}
                    onClick={() => handleAnswerClick(index)}
                  >
                    <span className="quiz-option__label">
                      {OPTION_LETTERS[index]}
                    </span>
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="quiz-footer">
            <span className="quiz-footer__progress-text">
              {currentQuestion + 1} of {currentQuizData.length}
            </span>
            {isLastQuestion ? (
              <button
                type="button"
                className="button button--success quiz-next-btn"
                onClick={handleFinishQuiz}
                disabled={selectedAnswer === null}
              >
                Finish Quiz
                <CheckIcon className="icon" />
              </button>
            ) : (
              <button
                type="button"
                className="button button--primary quiz-next-btn"
                onClick={handleNextQuestion}
                disabled={selectedAnswer === null}
              >
                Next
                <ArrowRightIcon className="icon" />
              </button>
            )}
          </div>
        </section>
      </main>
    );
  }

  /* ─── Review State (dedicated page) ─── */
  if (quizState === "review" && currentQuizData) {
    return (
      <main className="page-shell">
        <FloatingParticles />
        <section className="card review-card">
          <div className="quiz-topbar">
            <button
              type="button"
              className="button button--ghost quiz-back-btn"
              onClick={() => setQuizState("results")}
            >
              <ArrowLeftIcon className="icon" />
              Results
            </button>
            <span className="quiz-topbar__user" style={{ fontWeight: 700, color: "var(--dc-text-primary)" }}>
              {AVAILABLE_QUIZZES.find(q => q.id === currentQuizId)?.title ?? "Quiz"} — Review
            </span>
          </div>

          <div className="review-summary">
            <span className="review-summary__score">
              {score} / {currentQuizData.length} correct
            </span>
          </div>

          <div className="review-list">
            {currentQuizData.map((q, i) => {
              const userAns = userAnswers[i];
              const isCorrect = userAns === q.correct;
              return (
                <div key={i} className={`review-item ${isCorrect ? "review-item--correct" : "review-item--wrong"}`}>
                  <div className="review-item__header">
                    <span className="review-item__number">Q{i + 1}</span>
                    <span className={`review-item__badge ${isCorrect ? "review-item__badge--correct" : "review-item__badge--wrong"}`}>
                      {isCorrect ? "Correct" : "Incorrect"}
                    </span>
                  </div>
                  <p className="review-item__question">{q.question}</p>
                  <div className="review-item__answers">
                    {q.options.map((opt, j) => {
                      let cls = "review-option";
                      if (j === q.correct) cls += " review-option--correct";
                      if (j === userAns && j !== q.correct) cls += " review-option--wrong";
                      return (
                        <div key={j} className={cls}>
                          <span className="review-option__letter">{OPTION_LETTERS[j]}</span>
                          <span>{opt}</span>
                          {j === q.correct && <CheckIcon className="icon review-option__icon" />}
                          {j === userAns && j !== q.correct && <ErrorIcon className="icon review-option__icon" />}
                        </div>
                      );
                    })}
                  </div>
                  <div className="review-item__explanation">
                    <strong>{"\u{1F4A1}"} Explanation:</strong> {q.explanation}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="actions" style={{ justifyContent: "center", marginTop: "1.5rem" }}>
            <button type="button" className="button button--primary" onClick={resetQuiz}>
              <ArrowLeftIcon className="icon" />
              Back to Dashboard
            </button>
          </div>
        </section>
      </main>
    );
  }

  /* ─── Past Attempt Review State ─── */
  if (quizState === "past-review" && pastReviewAttempt) {
    const pastQuizData = QUIZZES[pastReviewAttempt.quizId] ?? [];
    const pastQuizTitle = AVAILABLE_QUIZZES.find(q => q.id === pastReviewAttempt.quizId)?.title ?? "Quiz";

    return (
      <main className="page-shell">
        <FloatingParticles />
        <section className="card review-card">
          <div className="quiz-topbar">
            <button
              type="button"
              className="button button--ghost quiz-back-btn"
              onClick={() => { setPastReviewAttempt(null); setQuizState("dashboard"); }}
            >
              <ArrowLeftIcon className="icon" />
              Dashboard
            </button>
            <span className="quiz-topbar__user" style={{ fontWeight: 700, color: "var(--dc-text-primary)" }}>
              {pastQuizTitle} — Past Attempt
            </span>
          </div>

          <div className="review-summary">
            <span className="review-summary__score">
              {pastReviewAttempt.score} / {pastReviewAttempt.total} correct ({pastReviewAttempt.percentage}%)
            </span>
            <span style={{ fontSize: "0.82rem", color: "var(--dc-text-muted)" }}>
              {pastReviewAttempt.completedAt ? new Date(pastReviewAttempt.completedAt).toLocaleString() : ""}
            </span>
          </div>

          <div className="review-list">
            {pastQuizData.map((q, i) => {
              const userAns = pastReviewAttempt.userAnswers?.[i];
              const isCorrect = userAns === q.correct;
              return (
                <div key={i} className={`review-item ${isCorrect ? "review-item--correct" : "review-item--wrong"}`}>
                  <div className="review-item__header">
                    <span className="review-item__number">Q{i + 1}</span>
                    <span className={`review-item__badge ${isCorrect ? "review-item__badge--correct" : "review-item__badge--wrong"}`}>
                      {isCorrect ? "Correct" : "Incorrect"}
                    </span>
                  </div>
                  <p className="review-item__question">{q.question}</p>
                  <div className="review-item__answers">
                    {q.options.map((opt, j) => {
                      let cls = "review-option";
                      if (j === q.correct) cls += " review-option--correct";
                      if (j === userAns && j !== q.correct) cls += " review-option--wrong";
                      return (
                        <div key={j} className={cls}>
                          <span className="review-option__letter">{OPTION_LETTERS[j]}</span>
                          <span>{opt}</span>
                          {j === q.correct && <CheckIcon className="icon review-option__icon" />}
                          {j === userAns && j !== q.correct && <ErrorIcon className="icon review-option__icon" />}
                        </div>
                      );
                    })}
                  </div>
                  <div className="review-item__explanation">
                    <strong>{"\u{1F4A1}"} Explanation:</strong> {q.explanation}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="actions" style={{ justifyContent: "center", marginTop: "1.5rem" }}>
            <button type="button" className="button button--primary" onClick={() => { setPastReviewAttempt(null); setQuizState("dashboard"); }}>
              <ArrowLeftIcon className="icon" />
              Back to Dashboard
            </button>
          </div>
        </section>
      </main>
    );
  }

  /* ─── Results State ─── */
  if (quizState === "results") {
    const result = getResultSummary(score, currentQuizData.length);

    return (
      <main className="page-shell">
        <FloatingParticles />
        {showConfetti && <Confetti />}
        <section className="card card--compact results-card">
          <p className="eyebrow">Quiz complete</p>
          <h1 className="hero-title">Your Results</h1>

          <div className="score-badge">
            <strong>
              {score} / {currentQuizData.length}
            </strong>
            <span>{result.percentage}%</span>
          </div>

          <div className={`level-badge ${result.levelClass}`}>
            {result.emoji} {result.level}
          </div>

          {bestStreak > 0 && (
            <p
              style={{
                color: "var(--dc-text-muted)",
                fontSize: "0.85rem",
                marginTop: "0.5rem",
              }}
            >
              {"\u{1F525}"} Best streak: {bestStreak} in a row
            </p>
          )}

          <p className="support-copy" style={{ textAlign: "center" }}>
            {result.message}
          </p>

          {!relayConfigured && (
            <div className="notice notice--warning">
              <ErrorIcon className="icon" />
              <span>
                Add VITE_DISCORD_RELAY_URL in .env to enable sharing.
              </span>
            </div>
          )}

          {relayConfigured && !turnstileConfigured && (
            <div className="notice notice--warning">
              <ErrorIcon className="icon" />
              <span>
                Add VITE_TURNSTILE_SITE_KEY to enable the Worker&apos;s anti-spam check.
              </span>
            </div>
          )}

          {turnstileConfigured && (
            <div
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <div ref={turnstileContainerRef} />
              {!turnstileToken && (
                <span
                  style={{
                    color: "var(--dc-text-muted)",
                    fontSize: "0.82rem",
                    textAlign: "center",
                  }}
                >
                  Complete the anti-spam check to enable sharing.
                </span>
              )}
              {turnstileError && (
                <div className="notice notice--error" style={{ width: "100%" }}>
                  <ErrorIcon className="icon" />
                  <span>{turnstileError}</span>
                </div>
              )}
            </div>
          )}

          <div className="actions" style={{ justifyContent: "center", flexDirection: "column", alignItems: "center", gap: "0.6rem" }}>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
              <button
                type="button"
                className="button button--discord"
                onClick={sendResultsToDiscord}
                disabled={
                  webhookStatus === "sending" ||
                  !relayConfigured ||
                  (turnstileConfigured && !turnstileToken)
                }
              >
                {webhookStatus === "sending" ? (
                  <>
                    <SpinnerIcon className="icon icon--spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <DiscordLogo />
                    Share to Discord
                  </>
                )}
              </button>

              <button
                type="button"
                className="button button--primary"
                onClick={() => setQuizState("review")}
              >
                {"\u{1F50D}"} Review Answers
              </button>
            </div>

            <button
              type="button"
              className="button button--ghost"
              onClick={resetQuiz}
            >
              <ArrowLeftIcon className="icon" />
              Back to Dashboard
            </button>
          </div>

          {webhookStatus === "success" && (
            <div className="notice notice--success">
              <CheckIcon className="icon" />
              <span>Results sent to your Discord channel!</span>
            </div>
          )}

          {webhookStatus === "error" && (
            <div className="notice notice--error">
              <ErrorIcon className="icon" />
              <span>Could not share the result. Check the relay URL or Worker logs.</span>
            </div>
          )}
        </section>
      </main>
    );
  }

  /* ─── Dashboard State ─── */
  if (quizState === "dashboard" && user) {
    return (
      <main className="dashboard-layout page-shell">
        <FloatingParticles />
        <div className="dashboard-container">
          <header className="dashboard-header">
            <div className="dashboard-header__content">
              <div className="dashboard-header__left">
                <img src={user.avatar} alt="" className="dashboard-avatar" />
                <div>
                  <p className="eyebrow">{"\u{1F44B}"} Welcome back</p>
                  <h1 className="dashboard-title">{user.username}</h1>
                </div>
              </div>
              <div className="user-panel">
                <button type="button" className="button button--ghost" onClick={handleLogout} style={{ fontSize: "0.8rem", height: "2.2rem", padding: "0 0.9rem", minHeight: "auto" }}>
                  Logout
                </button>
              </div>
            </div>
          </header>

          {loadingUserStats && !userStats && (
            <div className="notice notice--warning" style={{ marginBottom: "1.25rem" }}>
              <SpinnerIcon className="icon icon--spin" />
              <span>Syncing your progress from Firestore...</span>
            </div>
          )}

          {/* Stats Cards Row */}
          <section className="stats-row">
            <div className="stat-card">
              <div className="stat-card__icon stat-card__icon--blue">{"\u{1F3AF}"}</div>
              <div className="stat-card__info">
                <span className="stat-card__value">{userStatsView.totalAttempts}</span>
                <span className="stat-card__label">Quizzes Taken</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card__icon stat-card__icon--green">{"\u{1F451}"}</div>
              <div className="stat-card__info">
                <span className="stat-card__value">{userStatsView.bestScore}</span>
                <span className="stat-card__label">Best Score</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card__icon stat-card__icon--orange">{"\u{1F525}"}</div>
              <div className="stat-card__info">
                <span className="stat-card__value">{userStatsView.bestStreak}</span>
                <span className="stat-card__label">Best Streak</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card__icon stat-card__icon--purple">{"\u{1F4CA}"}</div>
              <div className="stat-card__info">
                <span className="stat-card__value">
                  {recentQuizHistory.length
                    ? `${Math.round(recentQuizHistory.reduce((s, h) => s + (h.percentage ?? 0), 0) / recentQuizHistory.length)}%`
                    : "—"}
                </span>
                <span className="stat-card__label">Avg Score</span>
              </div>
            </div>
          </section>

          <section className="dashboard-content">
            <h2 className="dashboard-section-title">Available Quizzes</h2>
            <div className="quiz-grid">
              {AVAILABLE_QUIZZES.map((quiz) => {
                const attemptCount = recentQuizHistory.filter((h) => h.quizId === quiz.id).length;
                return (
                <div
                  key={quiz.id}
                  ref={(el) => { quizCardRefs.current[quiz.id] = el; }}
                  className="dashboard-quiz-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleStartQuiz(quiz.id)}
                  onKeyDown={(event) => handleQuizCardKeyDown(event, quiz.id)}
                >
                  <div className="quiz-card__image-wrapper">
                    <img
                      src={quiz.image}
                      alt=""
                      aria-hidden="true"
                      className="quiz-card__image"
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="quiz-card__image-tag">{quiz.tagline}</span>
                    {quiz.isNew && (!loadingUserStats || userStats) && !seenQuizIds.has(quiz.id) && (
                      <span className="quiz-card__badge">New</span>
                    )}
                  </div>
                  <div className="quiz-card__body">
                    <div className="quiz-card__copy">
                      <h3>{quiz.title}</h3>
                      <p>{quiz.description}</p>
                    </div>
                    <div className="quiz-card__meta">
                      <span className="meta-tag">
                        <span className="meta-tag__label">Level</span>
                        <span className="meta-tag__value">{quiz.level}</span>
                      </span>
                      <span className="meta-tag">
                        <span className="meta-tag__label">Duration</span>
                        <span className="meta-tag__value">{quiz.duration}</span>
                      </span>
                      <span className="meta-tag">
                        <span className="meta-tag__label">Questions</span>
                        <span className="meta-tag__value">{QUIZZES[quiz.id]?.length ?? 0}</span>
                      </span>
                      {attemptCount > 0 && (
                        <span className="meta-tag meta-tag--accent">
                          <span className="meta-tag__label">Attempts</span>
                          <span className="meta-tag__value">{attemptCount}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="quiz-card__cta">
                    <span>Start Quiz</span>
                    <ArrowRightIcon className="icon" />
                  </div>
                </div>
                );
              })}
            </div>
          </section>

          {/* Recent Activity */}
          {recentQuizHistory.length > 0 && (
            <section className="dashboard-content">
              <h2 className="dashboard-section-title">Recent Activity</h2>
              <div className="activity-list">
                {recentQuizHistory.slice(-5).reverse().map((h, i) => {
                  const quizMeta = AVAILABLE_QUIZZES.find(q => q.id === h.quizId);
                  return (
                  <div key={i} className="activity-item">
                    {quizMeta && (
                      <button
                        type="button"
                        className="activity-item__quiz-name"
                        onClick={() => scrollToQuizCard(h.quizId)}
                        title={`Scroll to ${quizMeta.title}`}
                      >
                        {quizMeta.title}
                      </button>
                    )}
                    <div className="activity-item__score">
                      <strong>{h.score}/{h.total}</strong>
                      <span>({h.percentage}%)</span>
                    </div>
                    <span className={`level-badge level-badge--${h.level?.toLowerCase()}`} style={{ fontSize: "0.7rem", padding: "0.15rem 0.55rem", marginTop: 0 }}>
                      {h.level}
                    </span>
                    <span className="activity-item__date">
                      {h.completedAt ? new Date(h.completedAt).toLocaleDateString() : "—"}
                    </span>
                    {h.userAnswers?.length > 0 && (
                      <button
                        type="button"
                        className="button button--ghost activity-item__review-btn"
                        onClick={() => handleViewPastAttempt(h)}
                      >
                        View Results
                      </button>
                    )}
                  </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </main>
    );
  }

  /* ─── Welcome / Landing State ─── */
  return (
    <main className="page-shell">
      <FloatingParticles />
      <section className="card hero-card">
        <div className="hero-copy">
          <p className="eyebrow">{"\u{1F30D}"} Discord community activity</p>
          <h1 className="hero-title">Modern Spoken English Quiz</h1>
          <p className="support-copy">
            Log in with Discord, test your everyday English skills, and share
            your score with the community. Quick, fun, and competitive!
          </p>

          {authError && (
            <div className="notice notice--error">
              <ErrorIcon className="icon" />
              <span>{authError}</span>
            </div>
          )}

          {!user ? (
            <button
              type="button"
              className="button button--discord"
              onClick={handleDiscordLogin}
            >
              <DiscordLogo />
              Login with Discord
            </button>
          ) : (
            <div className="user-panel">
              <div className="user-chip">
                <img src={user.avatar} alt="" className="avatar" />
                <span>{user.username}</span>
              </div>

              <button
                type="button"
                className="button button--primary"
                onClick={() => setQuizState("dashboard")}
              >
                Go to Dashboard
                <ArrowRightIcon className="icon" />
              </button>

              <button
                type="button"
                className="button button--ghost"
                onClick={handleLogout}
                style={{ fontSize: "0.8rem", minHeight: "2.2rem", padding: "0.35rem 0.9rem" }}
              >
                Logout
              </button>
            </div>
          )}
        </div>

        <aside className="setup-panel" aria-label="Your progress">
          <div className="setup-panel__header">
            <TrophyIcon className="icon icon--accent icon--large" />
            <div>
              <h2>{user ? "Your Stats" : "Setup Checklist"}</h2>
              <p>{user ? "Progress saved to cloud" : "Configure before deploying"}</p>
            </div>
          </div>

          {user && userStats ? (
            <>
              <ul className="setup-list">
                <li className="is-ready">
                  <span className="setup-list__status" />
                  Total attempts: <strong style={{ marginLeft: "auto" }}>{userStats.totalAttempts ?? 0}</strong>
                </li>
                <li className="is-ready">
                  <span className="setup-list__status" />
                  Best score: <strong style={{ marginLeft: "auto" }}>{userStats.bestScore ?? 0}/{currentQuizData.length}</strong>
                </li>
                <li className="is-ready">
                  <span className="setup-list__status" />
                  Best streak: <strong style={{ marginLeft: "auto" }}>{"\u{1F525}"} {userStats.bestStreak ?? 0}</strong>
                </li>
              </ul>

              {userStats.quizHistory?.length > 0 && (
                <div className="setup-note">
                  <strong>Recent Attempts</strong>
                  {userStats.quizHistory.slice(-3).reverse().map((h, i) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "0.4rem 0.5rem", borderRadius: "6px",
                      background: "var(--dc-bg-accent)", fontSize: "0.82rem"
                    }}>
                      <span>{h.score}/{h.total} ({h.percentage}%)</span>
                      <span className={`level-badge level-badge--${h.level?.toLowerCase()}`}
                        style={{ fontSize: "0.7rem", padding: "0.15rem 0.5rem", marginTop: 0 }}>
                        {h.level}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : user && !userStats ? (
            <ul className="setup-list">
              <li className="is-ready">
                <span className="setup-list__status" />
                First time here — take the quiz!
              </li>
            </ul>
          ) : (
            <>
              <ul className="setup-list">
                <li className={discordConfigured ? "is-ready" : "is-missing"}>
                  <span className="setup-list__status" />
                  Discord Client ID
                </li>
                <li className={relayConfigured ? "is-ready" : "is-missing"}>
                  <span className="setup-list__status" />
                  Discord relay URL
                </li>
                <li className={turnstileConfigured ? "is-ready" : "is-missing"}>
                  <span className="setup-list__status" />
                  Turnstile site key (recommended)
                </li>
                <li className="is-ready">
                  <span className="setup-list__status" />
                  Redirect URI (auto-generated)
                </li>
              </ul>

              <div className="setup-note">
                <strong>Redirect URIs</strong>
                <code>http://localhost:5173/</code>
                <code>{REDIRECT_URI}</code>
              </div>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}
