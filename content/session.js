// session.js — builds the two whole-session prompts: the "ground rules"
// prompt injected once at activation (before any question), and the final
// aggregate review prompt injected when the user ends the session. Per-turn
// delivery prompts are injector.js's job, not this file's.
window.SC = window.SC || {};

(function () {
  // A representative bank of common behavioral ("tell me about a time...")
  // question themes, included as reference material for the AI to draw
  // from — not read aloud verbatim by the plugin itself.
  const BEHAVIORAL_THEMES = [
    "Disagreed with a manager or teammate",
    "Failed at something and what you learned",
    "Had to meet a very tight deadline",
    "Had to persuade someone skeptical of your idea",
    "Took initiative without being asked",
    "Had a conflict with a coworker and resolved it",
    "Received difficult or critical feedback",
    "Had to learn something new very quickly",
    "Made a mistake and how you handled it",
    "Had to prioritize competing tasks",
    "Led a project or a team",
    "Had to work with incomplete or ambiguous information",
    "Went above and beyond what was expected",
    "Had to implement a decision you disagreed with",
    "Had to give difficult feedback to someone else",
    "Your biggest professional achievement",
    "Handled a high-pressure or high-stakes situation",
    "Had to deal with an underperforming teammate",
    "A project you worked on failed or was cancelled",
    "Had to make a decision without your manager's approval",
    "Improved a process or system",
    "Had to say no to a stakeholder or customer",
    "Mentored or coached someone",
    "Had to adapt to a major change at work",
  ];

  function buildContextPrompt(settings) {
    const types = settings.interviewTypes || {};
    const anySelected = types.technical || types.cvBased || types.behavioral;
    const wantTechnical = anySelected ? !!types.technical : true;
    const wantCvBased = anySelected ? !!types.cvBased : true;
    const wantBehavioral = anySelected ? !!types.behavioral : true;

    const lines = [
      "I want to run a mock interview practice session with you, using this voice conversation. Please follow these ground rules for the whole session:",
      "",
      "1. Ask me exactly ONE interview question at a time, then wait for my spoken answer.",
      "2. After I finish answering, do NOT give feedback or move to the next question yet. " +
        "A short follow-up text message will arrive right after with the real acoustic delivery analysis of what I just said " +
        "(pace, filler words, pauses, pitch variation) — wait for that message specifically before reviewing.",
      "3. Once that delivery-analysis message arrives, review my answer covering BOTH correctness/completeness AND how it came " +
        "across delivery-wise given the measurements, then ask the next question.",
      "4. Keep a running mental note of my performance across the whole session — at the end I will ask you for an overall " +
        "session review, and you should summarize my correctness across every question plus recurring delivery strengths, " +
        "weaknesses, and concrete recommendations.",
      "",
      "Question scope for this session:",
    ];

    const scope = [];
    if (wantTechnical) scope.push("- Technical / conceptual questions on the relevant subject matter.");
    if (wantCvBased) scope.push("- Questions specifically about my resume/CV below (my projects, experience, and claims in it).");
    if (wantBehavioral) {
      scope.push(
        "- Behavioral questions in the \"tell me about a time when...\" style. Draw from a variety of themes such as: " +
          BEHAVIORAL_THEMES.slice(0, 12).join("; ") + "; etc. Phrase each one naturally in your own words."
      );
    }
    lines.push(...scope);

    if (settings.jdText && settings.jdText.trim()) {
      lines.push("", "Job description I'm interviewing for:", settings.jdText.trim());
    }
    if (settings.cvText && settings.cvText.trim()) {
      lines.push("", "My CV / resume:", settings.cvText.trim());
    }

    lines.push("", "Please ask your first question now.");
    return lines.join("\n");
  }

  function buildFinalReviewPrompt(turns) {
    const lines = [
      `The mock interview session is over — we covered ${turns.length} question${turns.length === 1 ? "" : "s"}.`,
      "Please give me an overall session review covering:",
      "- My overall correctness/completeness across all the questions.",
      "- Recurring vocal delivery strengths and weaknesses (pace, filler/hedge words, pauses, monotone/pitch variation) based on the measurements I shared throughout.",
      "- Concrete, specific recommendations for what to work on next.",
      "",
      "For reference, here is the acoustic delivery data from each answer this session:",
    ];

    turns.forEach((t, i) => {
      const L = t.report.linguistics || {};
      lines.push(
        `Q${i + 1}: ${(t.questionText || "").slice(0, 200)}`,
        `  wpm=${L.wpm ?? "n/a"}, fillers=${L.filler_count ?? 0} (${L.filler_rate_per_min ?? 0}/min), ` +
          `hedges=${L.hedge_count ?? 0} (${L.hedge_rate_per_min ?? 0}/min), ` +
          `long_pauses=${(t.report.pauses || {}).long_pause_count ?? 0}`
      );
    });

    return lines.join("\n");
  }

  window.SC.BEHAVIORAL_THEMES = BEHAVIORAL_THEMES;
  window.SC.buildContextPrompt = buildContextPrompt;
  window.SC.buildFinalReviewPrompt = buildFinalReviewPrompt;
})();
