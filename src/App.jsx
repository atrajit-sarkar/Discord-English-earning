import { useEffect, useState, useCallback, useRef } from "react";

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID?.trim() ?? "";
const DISCORD_WEBHOOK_URL =
  import.meta.env.VITE_DISCORD_WEBHOOK_URL?.trim() ?? "";
const REDIRECT_URI = `${window.location.origin}${window.location.pathname}`;
const OAUTH_STORAGE_KEY = "discord-oauth-response";

const questions = [
  {
    question:
      'A friendly cashier says, "Hey! How\'s it going?" What is the most natural, casual response?',
    options: [
      "I am functioning optimally, thank you.",
      "Not much, you?",
      "I do not know.",
      "It goes well.",
    ],
    correct: 1,
    explanation: '"Not much, you?" mirrors the casual tone perfectly.',
  },
  {
    question:
      "Someone is speaking very fast and you completely missed their point. What should you say?",
    options: [
      "I'm not sure I follow you.",
      "What is your meaning?",
      "Speak to me slower.",
      "I am confused by your words.",
    ],
    correct: 0,
    explanation:
      '"I\'m not sure I follow you" is polite and natural in conversation.',
  },
  {
    question:
      "You see a friend you haven't seen in three months. What do you say?",
    options: [
      "How are you existing?",
      "What is up?",
      "How have you been?",
      "Are you fine?",
    ],
    correct: 2,
    explanation:
      '"How have you been?" naturally asks about the time since you last met.',
  },
  {
    question:
      'Which of these is a casual way to say "Hello" when passing a coworker in the hallway?',
    options: [
      "Greetings to you.",
      "What's up?",
      "How do you do?",
      "I acknowledge you.",
    ],
    correct: 1,
    explanation:
      '"What\'s up?" is the go-to casual greeting in everyday English.',
  },
  {
    question:
      "You didn't hear what someone just said. What is the most polite, natural response?",
    options: [
      "Repeat it.",
      "What?",
      "Would you mind repeating that?",
      "Say again your words.",
    ],
    correct: 2,
    explanation:
      '"Would you mind repeating that?" is both polite and commonly used.',
  },
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
function getResultSummary(score) {
  const percentage = Math.round((score / questions.length) * 100);

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

/* ─── Main App ─── */
export default function App() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState("");
  const [quizState, setQuizState] = useState("welcome");
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [webhookStatus, setWebhookStatus] = useState("idle");
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [questionKey, setQuestionKey] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  const discordConfigured = !isPlaceholder(DISCORD_CLIENT_ID);
  const webhookConfigured = !isPlaceholder(DISCORD_WEBHOOK_URL);

  useEffect(() => {
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
      setAuthError(
        oauthErrorDescription?.replace(/\+/g, " ") ||
          "Discord login was cancelled or denied."
      );
      clearStoredOauthResponse();
      setLoadingAuth(false);
      return;
    }

    if (!accessToken || !tokenType) {
      clearStoredOauthResponse();
      setLoadingAuth(false);
      return;
    }

    let ignore = false;

    fetch("https://discord.com/api/users/@me", {
      headers: {
        authorization: `${tokenType} ${accessToken}`,
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch Discord profile.");
        }
        return response.json();
      })
      .then((profile) => {
        if (ignore) return;
        setUser({
          id: profile.id,
          username: profile.username,
          avatar: profile.avatar
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
            : "https://cdn.discordapp.com/embed/avatars/0.png",
        });
        setAuthError("");
      })
      .catch(() => {
        if (ignore) return;
        setAuthError("Could not load your Discord profile.");
      })
      .finally(() => {
        clearStoredOauthResponse();
        if (!ignore) setLoadingAuth(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  function handleDiscordLogin() {
    if (!discordConfigured) {
      setAuthError(
        "Add VITE_DISCORD_CLIENT_ID to .env before using Discord login."
      );
      return;
    }

    const oauthUrl =
      "https://discord.com/api/oauth2/authorize" +
      `?client_id=${DISCORD_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      "&response_type=token&scope=identify";

    window.location.href = oauthUrl;
  }

  const handleAnswerClick = useCallback(
    (index) => {
      if (answerRevealed) return;

      setSelectedAnswer(index);
      setAnswerRevealed(true);

      const isCorrect = index === questions[currentQuestion].correct;

      if (isCorrect) {
        setScore((prev) => prev + 1);
        setStreak((prev) => {
          const next = prev + 1;
          setBestStreak((best) => Math.max(best, next));
          return next;
        });
      } else {
        setStreak(0);
      }

      // Auto-advance after showing feedback
      setTimeout(() => {
        if (currentQuestion + 1 < questions.length) {
          setCurrentQuestion((prev) => prev + 1);
          setSelectedAnswer(null);
          setAnswerRevealed(false);
          setQuestionKey((prev) => prev + 1);
        } else {
          setQuizState("results");
          if (score + (isCorrect ? 1 : 0) >= Math.ceil(questions.length * 0.6)) {
            setShowConfetti(true);
          }
        }
      }, 1200);
    },
    [answerRevealed, currentQuestion, score]
  );

  async function sendResultsToDiscord() {
    if (!user || !webhookConfigured) {
      setWebhookStatus("error");
      return;
    }

    setWebhookStatus("sending");
    const result = getResultSummary(score);

    const payload = {
      username: "English Quiz Bot",
      embeds: [
        {
          title: `${result.emoji} Quiz Results: ${user.username}`,
          description: `${user.username} completed the Modern Spoken English Quiz.`,
          color: result.color,
          thumbnail: { url: user.avatar },
          fields: [
            {
              name: "\u{1F3AF} Score",
              value: `**${score} / ${questions.length}** (${result.percentage}%)`,
              inline: true,
            },
            {
              name: "\u{1F4CA} Level",
              value: `**${result.level}**`,
              inline: true,
            },
            {
              name: "\u{1F525} Best Streak",
              value: `**${bestStreak}** in a row`,
              inline: true,
            },
          ],
          footer: {
            text: "Try the quiz yourself! \u{1F60E}",
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    try {
      const response = await fetch(DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setWebhookStatus(response.ok ? "success" : "error");
    } catch (error) {
      console.error(error);
      setWebhookStatus("error");
    }
  }

  function resetQuiz() {
    setCurrentQuestion(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setQuizState("welcome");
    setWebhookStatus("idle");
    setSelectedAnswer(null);
    setAnswerRevealed(false);
    setQuestionKey(0);
    setShowConfetti(false);
  }

  /* ─── Loading State ─── */
  if (loadingAuth) {
    return (
      <main className="page-shell">
        <FloatingParticles />
        <section className="card card--compact status-card">
          <SpinnerIcon className="icon icon--spin icon--large" />
          <p>Connecting to Discord...</p>
        </section>
      </main>
    );
  }

  /* ─── Quiz State ─── */
  if (quizState === "quiz") {
    const question = questions[currentQuestion];
    const progress = ((currentQuestion + (answerRevealed ? 1 : 0)) / questions.length) * 100;

    return (
      <main className="page-shell">
        <FloatingParticles />
        <section className="card quiz-card">
          <div className="quiz-progress">
            <div
              className="quiz-progress__bar"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="quiz-header">
            <p className="eyebrow">
              Question {currentQuestion + 1} / {questions.length}
            </p>
            {streak >= 2 && (
              <div className="streak-badge" key={streak}>
                <span className="fire">{"\u{1F525}"}</span>
                {streak} streak!
              </div>
            )}
          </div>

          <div className="question-enter" key={questionKey}>
            <h1 className="quiz-title">{question.question}</h1>

            <div className="quiz-options">
              {question.options.map((option, index) => {
                let optionClass = "quiz-option";
                if (answerRevealed) {
                  if (index === question.correct) {
                    optionClass += " quiz-option--correct";
                  } else if (index === selectedAnswer) {
                    optionClass += " quiz-option--wrong";
                  } else {
                    optionClass += " quiz-option--disabled";
                  }
                }

                return (
                  <button
                    key={option}
                    type="button"
                    className={optionClass}
                    onClick={() => handleAnswerClick(index)}
                    disabled={answerRevealed}
                  >
                    <span className="quiz-option__label">
                      {OPTION_LETTERS[index]}
                    </span>
                    {option}
                  </button>
                );
              })}
            </div>

            {answerRevealed && (
              <div
                className={`feedback-message ${
                  selectedAnswer === question.correct
                    ? "feedback-message--correct"
                    : "feedback-message--wrong"
                }`}
              >
                {selectedAnswer === question.correct ? (
                  <>
                    <CheckIcon className="icon" />
                    <span>
                      Correct! {question.explanation}
                    </span>
                  </>
                ) : (
                  <>
                    <ErrorIcon className="icon" />
                    <span>
                      Not quite. {question.explanation}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="quiz-footer">
            <span>
              Score: {score}/{currentQuestion + (answerRevealed ? 1 : 0)}
            </span>
            {user && (
              <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <img
                  src={user.avatar}
                  alt=""
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: "1.5px solid var(--dc-blurple)",
                  }}
                />
                {user.username}
              </span>
            )}
          </div>
        </section>
      </main>
    );
  }

  /* ─── Results State ─── */
  if (quizState === "results") {
    const result = getResultSummary(score);

    return (
      <main className="page-shell">
        <FloatingParticles />
        {showConfetti && <Confetti />}
        <section className="card card--compact results-card">
          <p className="eyebrow">Quiz complete</p>
          <h1 className="hero-title">Your Results</h1>

          <div className="score-badge">
            <strong>
              {score} / {questions.length}
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

          {!webhookConfigured && (
            <div className="notice notice--warning">
              <ErrorIcon className="icon" />
              <span>
                Add VITE_DISCORD_WEBHOOK_URL in .env to enable sharing.
              </span>
            </div>
          )}

          <div className="actions" style={{ justifyContent: "center" }}>
            <button
              type="button"
              className="button button--discord"
              onClick={sendResultsToDiscord}
              disabled={webhookStatus === "sending" || !webhookConfigured}
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
              className="button button--ghost"
              onClick={resetQuiz}
            >
              Play again
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
              <span>Could not send the result. Check the webhook URL.</span>
            </div>
          )}
        </section>
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
              Connect with Discord
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
                onClick={() => setQuizState("quiz")}
              >
                Start Quiz
                <ArrowRightIcon className="icon" />
              </button>
            </div>
          )}
        </div>

        <aside className="setup-panel" aria-label="Setup checklist">
          <div className="setup-panel__header">
            <TrophyIcon className="icon icon--accent icon--large" />
            <div>
              <h2>Setup Checklist</h2>
              <p>Configure before deploying</p>
            </div>
          </div>

          <ul className="setup-list">
            <li className={discordConfigured ? "is-ready" : "is-missing"}>
              <span className="setup-list__status" />
              Discord Client ID
            </li>
            <li className={webhookConfigured ? "is-ready" : "is-missing"}>
              <span className="setup-list__status" />
              Discord Webhook URL
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
        </aside>
      </section>
    </main>
  );
}
