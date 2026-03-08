import sys

content = open('src/App.jsx', 'r', encoding='utf-8').read()
lines = content.split('\n')

replacement = """    try {
      const quizMeta = AVAILABLE_QUIZZES.find(q => q.id === currentQuizId);
      const oauthData = readStoredOauthResponse();
      const discordToken = oauthData?.access_token ?? "";

      const response = await fetch(DISCORD_RELAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          userId: user.id,
          username: user.username,
          avatar: user.avatar,
          quizId: currentQuizId,
          quizTitle: quizMeta?.title ?? "Quiz",
          siteBaseUrl: SITE_BASE_URL,
          userAnswers: allAnswers,
          turnstileToken,
          discordToken,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to submit quiz.");
      }

      const data = await response.json();
      setScore(data.score ?? 0);
      setBestStreak(data.bestStreak ?? 0);
      const results = data.results ?? [];
      setFetchedCorrectAnswers(results.map(r => r.correctIndex));
      setFetchedExplanations(results.map(r => r.explanation ?? ""));

      setQuizState("results");
      if ((data.score ?? 0) >= Math.ceil(currentQuizData.length * 0.6)) {
        setShowConfetti(true);
      }

      // Reload stats
      void loadUserStats(user, { syncProfile: false });

    } catch (error) {
      console.error(error);
      setQuizState("dashboard");
      // Could show an error toast here
    } finally {
      setIsSubmitting(false);
      if (turnstileConfigured) {
        resetTurnstileChallenge();
      }
    }
  }

  async function sendResultsToDiscord() {"""

new_content = '\n'.join(lines[0:933]) + '\n' + replacement + '\n' + '\n'.join(lines[980:])

open('src/App.jsx', 'w', encoding='utf-8').write(new_content)
print('Fixed App.jsx')
