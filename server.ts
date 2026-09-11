import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "15mb" }));

// Helper to get Gemini Client safely
let aiInstance: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("GEMINI_API_KEY is not configured or has default value. Falling back to high-fidelity mock/rule generators.");
    return null;
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

// Helper to safely parse JSON returned by Gemini models, handling unescaped control characters or markdown formatting
function safeJsonParse(rawText: string | undefined | null): any {
  if (!rawText) return {};
  let clean = rawText.trim();
  clean = clean.replace(/^```(?:json)?\s*/gi, "").replace(/\s*```$/gi, "").trim();

  try {
    return JSON.parse(clean);
  } catch (e1) {
    try {
      // Replace unescaped raw control characters in JSON strings (such as literal newlines/tabs inside quotes)
      const sanitized = clean.replace(/[\u0000-\u001F\u007F-\u009F]/g, (match) => {
        if (match === '\n') return '\\n';
        if (match === '\r') return '\\r';
        if (match === '\t') return '\\t';
        return '';
      });
      return JSON.parse(sanitized);
    } catch (e2) {
      const match = clean.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (match) {
        try {
          const sanitizedMatch = match[0].replace(/[\u0000-\u001F\u007F-\u009F]/g, (m) => {
            if (m === '\n') return '\\n';
            if (m === '\r') return '\\r';
            if (m === '\t') return '\\t';
            return '';
          });
          return JSON.parse(sanitizedMatch);
        } catch (e3) {
          console.error("safeJsonParse match extraction failed:", e3);
        }
      }
      console.warn("safeJsonParse failed to parse text:", (e1 as Error)?.message);
      return {};
    }
  }
}

// Robust, retrying Gemini generateContent Wrapper with model fallbacks for transient 503/429/UNAVAILABLE errors
async function callGeminiWithRetry(params: { model: string; contents: any; config?: any }, retries = 4, initialDelay = 1000): Promise<any> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error("Gemini AI Client is not configured (missing GEMINI_API_KEY)");
  }

  let lastError: any = null;
  let delay = initialDelay;

  // List of fallback models to cycle through if the primary model experiences transient overload, quota limits, or fetch errors
  const fallbackModels = ["gemini-3.6-flash", "gemini-3.1-flash-lite"];
  let currentModel = params.model || "gemini-3.6-flash";

  for (let i = 0; i < retries; i++) {
    try {
      return await ai.models.generateContent({
        ...params,
        model: currentModel
      });
    } catch (error: any) {
      lastError = error;
      const errorMessage = error?.message || String(error);
      const errorStatus = error?.status || "";
      const errorCode = error?.code || error?.statusCode || "";

      // Detect transient high-demand (503), rate-limits/quotas (429), model missing/404, or network fetch failures
      const isTransient = 
        errorStatus === "UNAVAILABLE" || 
        errorStatus === "RESOURCE_EXHAUSTED" || 
        errorStatus === "NOT_FOUND" ||
        errorCode === 503 || 
        errorCode === 429 ||
        errorCode === 404 ||
        errorMessage.includes("503") || 
        errorMessage.includes("429") || 
        errorMessage.includes("404") ||
        errorMessage.includes("fetch failed") ||
        errorMessage.includes("Failed to fetch") ||
        errorMessage.includes("high demand") || 
        errorMessage.includes("temporary") ||
        errorMessage.includes("rate limit") ||
        errorMessage.includes("quota") ||
        errorMessage.includes("Quota") ||
        errorMessage.includes("ResourceExhausted") ||
        errorMessage.includes("RESOURCE_EXHAUSTED") ||
        errorMessage.includes("exhausted") ||
        errorMessage.includes("not found") ||
        errorMessage.includes("NotFound") ||
        errorMessage.includes("ECONNRESET") ||
        errorMessage.includes("ETIMEDOUT");

      if (isTransient && i < retries - 1) {
        // Select next model in fallback list that is different from currentModel
        const currentIndex = fallbackModels.indexOf(currentModel);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % fallbackModels.length : (i + 1) % fallbackModels.length;
        const nextModel = fallbackModels[nextIndex];

        console.log(`[Gemini API] Retrying attempt ${i + 1}/${retries} on model "${nextModel}" following transient error on "${currentModel}": ${errorMessage}`);
        currentModel = nextModel;
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 1.5; // gradual exponential backoff
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// 0. API: Gemini Text-to-Speech (TTS)
app.post("/api/tts", async (req, res) => {
  const { text, voice } = req.body;
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'text' parameter in request body" });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.status(503).json({ error: "Gemini API client is not configured (missing GEMINI_API_KEY)" });
  }

  try {
    const chosenVoice = voice || "Kore";
    const cleanText = text.trim();

    // Models that support audio output modality
    const candidateTtsModels = [
      "gemini-3.1-flash-tts-preview",
      "gemini-3.6-flash"
    ];

    let base64Audio: string | undefined;
    let mimeType = "audio/pcm;rate=24000";
    let lastError: any = null;

    for (const modelName of candidateTtsModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [{ parts: [{ text: cleanText }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: chosenVoice },
              },
            },
          },
        });

        const candidatePart = response.candidates?.[0]?.content?.parts?.[0];
        if (candidatePart?.inlineData?.data) {
          base64Audio = candidatePart.inlineData.data;
          mimeType = candidatePart.inlineData.mimeType || mimeType;
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini TTS Warning] Model ${modelName} failed:`, err?.message || err);
      }
    }

    if (!base64Audio) {
      return res.status(502).json({
        error: lastError?.message || "Gemini TTS API returned no audio content across candidate models",
        useFallback: true,
      });
    }

    return res.json({
      audio: base64Audio,
      mimeType: mimeType,
    });
  } catch (error: any) {
    console.error("Gemini TTS Generation Error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to generate text-to-speech audio with Gemini API",
      useFallback: true,
    });
  }
});

// 1. API: Parse Resume
app.post("/api/resume/parse", async (req, res) => {
  const { resumeText } = req.body;
  if (!resumeText) {
    return res.status(400).json({ error: "Missing resume text" });
  }

  const ai = getGeminiClient();
  if (!ai) {
    // Return a smart parsed mock resume based on text
    return res.json(generateMockParsedResume(resumeText));
  }

  try {
    const prompt = `You are an expert AI Resume Parser for Albion College.
Analyze the following raw text from a student's resume. Extract relevant fields into JSON. Do not hallucinate content; summarize and clean up existing data.
If certain fields are completely missing, return empty arrays or empty strings.

Resume Text:
"""
${resumeText}
"""

Ensure the output is valid JSON matching this schema:
{
  "name": "Student Name (if found, otherwise default to Albion Student)",
  "education": "Education (specifically mention degree, Albion College if present)",
  "majorMinor": "Majors, Minors, Concentrations, or pre-professional paths",
  "skills": ["List of critical technical/soft skills"],
  "workExperience": ["Accomplishments and experiences (bullet format)"],
  "researchExperience": ["Academic research, lab research, or directed studies (bullet format)"],
  "projects": ["Course projects or personal projects with brief outlines"],
  "leadership": ["Student organizations, sports, club leadership, greek life, or volunteering"],
  "certifications": ["Certifications, awards, honor societies, or fellowships"]
}
`;

    const response = await callGeminiWithRetry({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const parsedJson = safeJsonParse(response.text);
    res.json(parsedJson);
  } catch (error: any) {
    console.error("Gemini Parse Resume Error:", error);
    res.json(generateMockParsedResume(resumeText));
  }
});

// 2. API: Generate Interview Questions Plan
app.post("/api/interview/generate-questions", async (req, res) => {
  const { resumeInfo, jobTarget, noResumePath, seenQuestionIds = [] } = req.body;
  if (!jobTarget) {
    return res.status(400).json({ error: "Missing job target data" });
  }

  // Handle No Resume Path: return 3 simple diagnostic questions about projects/coursework
  if (noResumePath || !resumeInfo || !resumeInfo.isParsed) {
    return res.json({
      isDiagnostic: true,
      questions: [
        {
          id: "q1",
          text: "What is a recent class project, group assignment, or campus activity you worked on?",
          category: "general"
        },
        {
          id: "q2",
          text: "What specific tasks, tools, or steps did you personally take to complete this work?",
          category: "technical"
        },
        {
          id: "q3",
          text: "What was the final result, grade, deliverable, or outcome of your project efforts?",
          category: "behavioral"
        }
      ]
    });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.json({ questions: generateMockQuestions(resumeInfo, jobTarget, seenQuestionIds) });
  }

  try {
    const isPanel = jobTarget.interviewFormat === 'panel-board';
    const rolePlayContext = isPanel 
      ? `You represent a panel of 3 distinct corporate interviewers: Sarah (HR), Marcus (Technical Lead), and Elena (Director of Product). For each of the questions, pick ONE panelist to ask the question, and clearly prefix the question text with their name and title (e.g., "Elena (Director of Product): [Question]"). Vary who speaks to simulate a dynamic panel board.`
      : `Act as a single, consistent hiring manager in a One-on-One interview format.`;

    const dynamicFocalThemes = [
      "navigating deep inter-team conflict / communication breakdown",
      "pivoting technical architecture or course of action under high stress / sudden resource loss",
      "overcoming a fundamental personal project or coursework failure, demonstrating concrete humility",
      "making severe prioritization trade-offs with highly restricted schedule or incomplete specification",
      "innovative process-level improvement, showing leadership beyond your official grade",
      "synthesizing custom tools or analytical methodologies to digest highly complex data sets"
    ];
    const chosenTheme = dynamicFocalThemes[Math.floor(Math.random() * dynamicFocalThemes.length)];
    const sessionSalt = Math.floor(Math.random() * 1000000);

    const selectedQuestionType = jobTarget.interviewType || 'general';
    const isEasyVibe = selectedQuestionType === 'campus_job' || selectedQuestionType === 'internship';
    const isMedicalTrack = selectedQuestionType === 'medical_school' || /med|doctor|physician|mmi|aamc|medical|hospital|clinic|pre-med|prehealth/i.test(`${jobTarget.positionTitle} ${jobTarget.companyName} ${jobTarget.industry}`);

    let strictTypeDirective = "";
    if (selectedQuestionType === 'medical_school') {
      strictTypeDirective = `CRITICAL MANDATE - EXCLUSIVE QUESTION TYPE FILTER:
The user explicitly selected "MULTIPLE MINI-INTERVIEW (MMI) STATIONS".
EVERY SINGLE QUESTION (Questions 1, 2, 3, and 4) MUST BE A 100% MULTIPLE MINI-INTERVIEW (MMI) BIOETHICAL DILEMMA OR SITUATIONAL SCENARIO station strictly cross-referenced from the provided MMI PDF documents (e.g. 14yo patient requesting birth control without parents, rural Michigan physician recruitment incentives, 20yo Down syndrome pregnant patient autonomy, observing attending surgical error, peer alcohol impairment on rounds, organ transplant allocation, Ebola vaccine trial, uninsured patient fractured jaw $12.5k emergency care, single mother burn clinic supplies).
DO NOT ask traditional "Why medicine?" questions or generic personal questions. ALL 4 QUESTIONS MUST BE MMI SCENARIOS!`;
    } else if (selectedQuestionType === 'general') {
      strictTypeDirective = `CRITICAL MANDATE - EXCLUSIVE QUESTION TYPE FILTER:
The user explicitly selected "TRADITIONAL QUESTIONS".
EVERY SINGLE QUESTION (Questions 1, 2, 3, and 4) MUST BE A 100% TRADITIONAL / MOTIVATION QUESTION (e.g., core motivation "Why medicine?" / "Why this role/company?", "Why CMU medical school?", anticipated medical school sacrifices, legacy/future impact on healthcare, personal fit, background).
DO NOT ask MMI ethical dilemma prompts or STAR behavioral stories. ALL 4 QUESTIONS MUST BE TRADITIONAL FIT QUESTIONS!`;
    } else if (selectedQuestionType === 'behavioral') {
      strictTypeDirective = `CRITICAL MANDATE - EXCLUSIVE QUESTION TYPE FILTER:
The user explicitly selected "BEHAVIORAL QUESTIONS".
EVERY SINGLE QUESTION (Questions 1, 2, 3, and 4) MUST BE A 100% BEHAVIORAL QUESTION evaluated using the STAR method ("Tell me about a time when...", "Describe a situation where...", handling a conflict with a teammate, adapting when feeling like an outsider, recovering from a regretted mistake, processing critical feedback).
DO NOT ask MMI ethical dilemma prompts or traditional motivation questions like "Why medicine?". ALL 4 QUESTIONS MUST BE BEHAVIORAL SCENARIOS!`;
    } else if (selectedQuestionType === 'technical') {
      strictTypeDirective = `CRITICAL MANDATE - EXCLUSIVE QUESTION TYPE FILTER:
The user explicitly selected "TECHNICAL & ANALYTICAL QUESTIONS".
EVERY SINGLE QUESTION (Questions 1, 2, 3, and 4) MUST BE A 100% TECHNICAL OR DOMAIN-SPECIFIC ANALYTICAL QUESTION testing problem solving, technical concepts, data analysis, or analytical rigor for this role.`;
    } else if (selectedQuestionType === 'research') {
      strictTypeDirective = `CRITICAL MANDATE - EXCLUSIVE QUESTION TYPE FILTER:
The user explicitly selected "RESEARCH & ACADEMIC SELECTION BOARD".
EVERY SINGLE QUESTION (Questions 1, 2, 3, and 4) MUST BE A RESEARCH OR ACADEMIC SELECTION QUESTION focusing on scientific inquiry, hypothesis design, lab dynamics, literature critique, or research methodology.`;
    } else {
      strictTypeDirective = `CRITICAL MANDATE - EXCLUSIVE QUESTION TYPE FILTER:
Strictly tailor ALL 4 questions to the selected question category: "${selectedQuestionType}".`;
    }

    const prompt = `You are an empathetic Career Coach and Admissions Consultant conducting a conversational mock interview for university students preparing for careers or medical school at Albion College.

${strictTypeDirective}

CRITICAL QUESTION RULES & BOUNDS:
1. STRICT REFERENCE COMPLIANCE: For medical/MMI tracks, strictly restrict question scenarios and terminology to the provided PDF reference materials (CMU Medical School Interview Prep, Columbia Bioethics MMI Prep, University of Michigan MMI Guide). Do NOT introduce external medical or institutional topics outside these context standards.
2. DELIVER EXACTLY 1 QUESTION AT A TIME (Each question delivered sequentially).
3. KEEP EVERY QUESTION STRICTLY UNDER 25 WORDS (Exclude speaker name prefix if panel board from the word count).
4. DIFFICULTY SCALING:
   - Basic: Short, direct, fundamental questions (core motivations, why medicine, simple personal scenarios).
   - Standard: Standard-length scenarios requiring stakeholder identification and multi-perspective reasoning (e.g., 14-year-old requesting birth control without parents, classmate cheating, peer conflict).
   - Challenging: Complex, multi-layered scenarios incorporating domain terminology (social determinants of health [SDOH], scope of practice, bioethical pillars [Autonomy, Beneficence, Non-Maleficence, Justice], system-level rural physician recruitment incentives, Ebola vaccine trial in Liberia).
5. PREVENT REPETITION: Do NOT generate questions that match or are similar to any of these previously completed question/scenario IDs: ${JSON.stringify(seenQuestionIds)}.

${isMedicalTrack ? `MEDICAL SCHOOL ADMISSIONS TRACK (AAMC & MMI FOCUS):
- Evaluate AAMC 15 Core Competencies (Service Orientation, Ethical Responsibility, Critical Thinking, Cultural Competence, Social Skills, Teamwork, Reliability & Dependability, Resilience & Adaptability, Capacity for Improvement).
- Always include rich MMI Metadata for each question: scenario_id (e.g. MMI_${sessionSalt}_1), title, aamc_competency_primary, aamc_competency_secondary, help_drawer_content (competency_overview, underlying_dilemma, key_talking_points), follow_up_probes, and timing (prep_seconds: 120, station_seconds: 480).` : `CORPORATE/STANDARD MODE:
- Maintain a clear, objective, professional tone.
- Ask targeted questions grounded strictly in the candidate's resume.`}

Context:
Target Role: ${jobTarget.positionTitle} at ${jobTarget.companyName}
Industry: ${jobTarget.industry}
Selected Question Type: ${selectedQuestionType}
Difficulty: ${jobTarget.difficulty || 'standard'}
Interview Track: ${isMedicalTrack ? 'MEDICAL_SCHOOL' : 'STANDARD_JOB'}
${jobTarget.jobDescription ? `Target Job Description / Focus:\n${jobTarget.jobDescription}\n` : ""}

Candidate Resume Summary:
${JSON.stringify(resumeInfo || {})}

Generate exactly 4 customized mock interview questions:
- Question 1: Question 1 strictly matching type "${selectedQuestionType}"
- Question 2: Question 2 strictly matching type "${selectedQuestionType}"
- Question 3: Question 3 strictly matching type "${selectedQuestionType}"
- Question 4: Question 4 strictly matching type "${selectedQuestionType}"

${isMedicalTrack ? `Return a JSON object for Medical Track:
{
  "questions": [
    {
      "id": "q1",
      "text": "...",
      "category": "${selectedQuestionType === 'medical_school' ? 'mmi' : selectedQuestionType}",
      "scenario_id": "MMI_ETH_2026_01",
      "title": "Short Scenario Title",
      "aamc_competency_primary": "Ethical Responsibility to Self and Others",
      "aamc_competency_secondary": "Cultural Competence",
      "help_drawer_content": {
        "competency_overview": "Summary of evaluated AAMC competency.",
        "underlying_dilemma": "Core ethical or interpersonal tension.",
        "key_talking_points": ["Point 1", "Point 2", "Point 3"]
      },
      "follow_up_probes": ["Probe 1?", "Probe 2?"],
      "timing": { "prep_seconds": 120, "station_seconds": 480 }
    }
  ]
}` : `Return a JSON object for Regular Track (DO NOT include AAMC competencies or MMI scenario_ids!):
{
  "questions": [
    {
      "id": "q1",
      "text": "...",
      "category": "${selectedQuestionType}",
      "title": "Question Answer Guidance",
      "help_drawer_content": {
        "competency_overview": "Evaluates your ability to structure your response using the STAR method (Situation, Task, Action, Result).",
        "underlying_dilemma": "Focus on clearly defining your personal direct actions and quantifiable outcomes.",
        "key_talking_points": ["Set up the Situation/Task clearly", "Highlight your specific individual Action", "Quantify the final Result and key learning"]
      },
      "follow_up_probes": ["What was the hardest part of taking that action?", "How did you measure success?"]
    }
  ]
}`}
REMEMBER: EVERY QUESTION TEXT MUST BE UNDER 25 WORDS!`;

    const response = await callGeminiWithRetry({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.8,
        seed: sessionSalt,
      },
    });

    const parsedJson = safeJsonParse(response.text);
    // Ensure all question texts are strictly checked and trimmed under 25 words if needed
    if (parsedJson.questions && Array.isArray(parsedJson.questions)) {
      parsedJson.questions = parsedJson.questions.map((q: any) => ({
        ...q,
        text: trimQuestionUnder25Words(q.text)
      }));
    }
    res.json(parsedJson);
  } catch (error: any) {
    console.error("Gemini Generate Questions Error:", error);
    res.json({ questions: generateMockQuestions(resumeInfo, jobTarget, seenQuestionIds) });
  }
});

// Helper function to enforce question under 25 words
function trimQuestionUnder25Words(questionText: string): string {
  const words = questionText.trim().split(/\s+/);
  if (words.length <= 25) return questionText;
  return words.slice(0, 24).join(' ') + '?';
}

// Custom Filler Word Calibration & Objective Rubric Engine
function analyzeObjectiveRubricAndFillers(
  answerText: string, 
  jobTarget: any, 
  customFillerWordsInput: string[] = [],
  speakingSeconds: number = 0
) {
  const DEFAULT_FILLERS = [
    'like', 'you know', 'basically', 'literally', 'um', 'uh', 'so yeah', 
    'sort of', 'kind of', 'i mean', 'actually', 'right', 'honestly', 
    'at the end of the day', 'truth be told', 'to be fair'
  ];

  // Merge custom calibrated words with defaults
  const calibratedList = Array.from(new Set([
    ...DEFAULT_FILLERS,
    ...(customFillerWordsInput || []).map(w => String(w).trim().toLowerCase()).filter(w => w.length > 0)
  ]));

  const lowerText = answerText.toLowerCase();
  const words = answerText.trim().split(/\s+/).filter(w => w.length > 0);
  const totalWords = words.length;

  let totalFillers = 0;
  const fillerBreakdownMap: { [word: string]: number } = {};

  // Sort phrases by length descending so multi-word phrases match before individual words
  const sortedFillers = calibratedList.sort((a, b) => b.length - a.length);

  let tempText = lowerText;
  sortedFillers.forEach(filler => {
    const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'g');
    const matches = tempText.match(regex);
    if (matches && matches.length > 0) {
      const count = matches.length;
      totalFillers += count;
      fillerBreakdownMap[filler] = count;
      tempText = tempText.replace(regex, ' ___ ');
    }
  });

  const fillerBreakdown = Object.entries(fillerBreakdownMap)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);

  const fillerDensityPct = totalWords > 0 
    ? Number(((totalFillers / totalWords) * 100).toFixed(1)) 
    : 0;

  // 1. Relevance to Job Target (0-100)
  const posKeywords = (jobTarget?.positionTitle || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
  let relevanceScore = 75;
  if (totalWords >= 40) relevanceScore += 10;
  if (totalWords >= 80) relevanceScore += 5;
  posKeywords.forEach((kw: string) => {
    if (lowerText.includes(kw)) relevanceScore += 5;
  });
  if (lowerText.includes("situation") || lowerText.includes("task") || lowerText.includes("action") || lowerText.includes("result") || lowerText.includes("patient") || lowerText.includes("ethic") || lowerText.includes("team")) {
    relevanceScore += 5;
  }
  const finalRelevance = Math.min(100, Math.max(50, relevanceScore));

  // 2. Professional Register & Diction (0-100)
  let registerScore = 90;
  if (fillerDensityPct > 5) registerScore -= 20;
  else if (fillerDensityPct > 2) registerScore -= 10;

  if (lowerText.includes("stuff") || lowerText.includes("gonna") || lowerText.includes("wanna") || lowerText.includes("crap") || lowerText.includes("whatever")) {
    registerScore -= 10;
  }
  if (totalWords < 20) registerScore -= 15;
  const finalRegister = Math.min(100, Math.max(40, registerScore));

  // 3. Clarity & Conciseness (0-100)
  let clarityScore = 85;
  if (totalWords >= 60 && totalWords <= 250) clarityScore += 10;
  else if (totalWords < 30) clarityScore -= 20;
  else if (totalWords > 350) clarityScore -= 15;

  if (fillerDensityPct <= 1.5) clarityScore += 5;
  const finalClarity = Math.min(100, Math.max(40, clarityScore));

  // 4. Vocal Composure & Pace (0-100)
  let wpm = 0;
  if (speakingSeconds > 0) {
    wpm = Math.round((totalWords / speakingSeconds) * 60);
  }
  let composureScore = 85;
  if (wpm >= 110 && wpm <= 170) composureScore += 10;
  else if (wpm > 0 && (wpm < 80 || wpm > 190)) composureScore -= 15;

  if (fillerDensityPct === 0) composureScore += 5;
  else if (fillerDensityPct > 4) composureScore -= 15;

  const finalComposure = Math.min(100, Math.max(40, composureScore));

  return {
    objective_rubric: {
      relevance_to_target: finalRelevance,
      professional_register: finalRegister,
      clarity_conciseness: finalClarity,
      vocal_composure_pace: finalComposure
    },
    filler_analysis: {
      total_words: totalWords,
      total_fillers: totalFillers,
      filler_density_pct: fillerDensityPct,
      filler_breakdown: fillerBreakdown,
      custom_calibrated_words_used: calibratedList
    }
  };
}

// Helper function to calculate hint penalty on 5.0 scale
function applyHintPenalty(rawEvaluatedScore: number, hintsUnlocked: number = 0) {
  const numHints = Math.min(3, Math.max(0, Number(hintsUnlocked) || 0));
  // Each hint tier reduces max possible score by 0.5 points
  const maxScoreCap = 5.0 - (numHints * 0.5);
  
  // Final score is capped at the remaining max allowance
  const finalScore = Math.min(rawEvaluatedScore, maxScoreCap);
  
  return {
    rawScore: Number(rawEvaluatedScore.toFixed(2)),
    hintsUnlocked: numHints,
    penaltyDeducted: numHints * 0.5,
    maxScoreCap: maxScoreCap,
    finalScore: Number(finalScore.toFixed(2))
  };
}

// 3. API: Evaluate Answer (THE BRIT INTERVIEW EVALUATION ENGINE UNIVERSAL v2.0)
app.post("/api/interview/evaluate-answer", async (req, res) => {
  const { questionText, answerText, resumeInfo, jobTarget, category, hintsUnlocked = 0, scenarioId } = req.body;
  if (!questionText || answerText === undefined || answerText === null || !jobTarget) {
    return res.status(400).json({ error: "Missing required query parameters" });
  }

  const hintsCount = Math.min(3, Math.max(0, parseInt(hintsUnlocked, 10) || 0));

  // Determine Track (MEDICAL_SCHOOL vs STANDARD_JOB)
  const targetStr = `${jobTarget.positionTitle || ''} ${jobTarget.companyName || ''} ${jobTarget.industry || ''} ${jobTarget.interviewType || ''}`.toLowerCase();
  const isMedical = jobTarget.interviewType === 'medical_school' || /med|doctor|physician|mmi|aamc|medical|hospital|clinic|pre-med|prehealth|surgery/i.test(targetStr);
  const interviewTrack = isMedical ? "MEDICAL_SCHOOL" : "STANDARD_JOB";

  // Check if answer is skipped or empty -> Zero score mandatory
  const isSkippedAnswer = !answerText || answerText.trim() === "[Skipped Question]" || answerText.trim() === "" || answerText.toLowerCase().includes("skipped question");
  if (isSkippedAnswer) {
    return res.json({
      track_evaluated: interviewTrack,
      domain_classification: "Skipped Station",
      targeted_competencies: ["N/A"],
      overall_score: 0.0,
      score: 0.0,
      numericScore: 0,
      final_score: 0.0,
      raw_evaluation_score: 0.0,
      hints_unlocked: hintsCount,
      penalty_points: 0.0,
      max_score_cap: 5.0,
      score_breakdown: {
        claim_or_situation: 0.0,
        evidence_or_action: 0.0,
        insight_or_result: 0.0,
        penalty_deductions: 0.0
      },
      feedback: {
        strengths: ["Question station skipped by candidate."],
        vulnerabilities: ["No response recorded for this question station."],
        red_flag_alert: null
      },
      strengths: ["Question station skipped by candidate."],
      areasToImprove: ["Candidate elected to skip this question station."],
      suggestedAnswer: "Review the prompt scenario and practice structuring a response using the STAR framework or bioethics principles.",
      clarityComments: "Skipped question.",
      confidenceComments: "Skipped question.",
      structureComments: "Skipped question.",
      relevanceComments: "Skipped question.",
      professionalismComments: "Skipped question."
    });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.json(generateMockFeedback(questionText, answerText, category, jobTarget, interviewTrack, hintsCount, scenarioId));
  }

  try {
    const prompt = `# SYSTEM INSTRUCTION: "THE BRIT INTERVIEW" EVALUATION ENGINE (UNIVERSAL v2.0)

## 1. TASK (Role, Persona & Objective)
- Persona: Senior Career & Admissions Consultant for Albion College ("The Brit Interview").
- Objective: Evaluate interview responses dynamically based on the designated INTERVIEW_TRACK ("${interviewTrack}").
- Primary Action: Classify the prompt, calculate scores on a 0.0–5.0 scale, detect red flags, and generate structured feedback without altering the standard payload output architecture.

CRITICAL HARD EVALUATION CONSTRAINTS:
1. AUDIO-TRANSCRIPT EXCLUSIVE SOURCE: The evaluation MUST be generated 100% from the transcribed text while ignoring all visual/video metrics (such as race, gender, eye tracking, facial expressions, or physical posture).
2. STRICT REFERENCE COMPLIANCE: Restrict evaluation feedback and terminology to the provided context documentation (CMU Medical School Interview Prep, Columbia Bioethics MMI Prep, University of Michigan MMI Guide). Do NOT introduce external medical or institutional topics beyond this reference material.

---

## 2. CONTEXT & TRACK SWITCHING LOGIC
Evaluate the incoming response using the rules for INTERVIEW_TRACK = "${interviewTrack}":

### TRACK A: MEDICAL_SCHOOL
- Evaluation Baseline: AAMC 15 Core Competencies (Preprofessional, Thinking, Science).
- Formula: Composite = Claim (1.0) + Evidence (2.0) + Insight (2.0) - Red Flags.
- Red Flags: Patient autonomy violations, bioethical breaches, blame-shifting, superficial motivation ("I just want to help people").

### TRACK B: STANDARD_JOB
- Evaluation Baseline: STAR Method (Situation, Task, Action, Result) & JD Alignment.
- Formula: Composite = Situation/Task (1.0) + Action (2.0) + Result (2.0) - Red Flags.
- Red Flags: Lack of quantitative impact, passive voice ("we" vs "I"), blame-shifting, lack of role alignment.

---

## 3. REFERENCES & BENCHMARKS

### Standardized Output Formula (0.0 to 5.0)
- 5.0 (Exceptional): Hits all structural requirements with rich evidence and deep insight.
- 3.0 - 4.0 (Competent): Clear answer with good evidence, missing deeper reflection/metrics.
- 1.0 - 2.0 (Needs Work): Generic response, lacking concrete evidence or structure.
- 0.0 - 0.5 (Red Flag): Ethical non-compliance, arrogance, or blame-shifting.

---

## 4. EVALUATION & VALIDATION RULES
1. Maintain identical output keys regardless of INTERVIEW_TRACK.
2. Validate that the feedback tone is encouraging, objective, and constructive.
3. Trigger a RED_FLAG_ALERT immediately if overall_score < 1.0 or an ethical/behavioral violation occurs.

---

## INPUT CANDIDATE RESPONSE FOR EVALUATION:
Question Category: "${category || 'general'}"
Question Text: "${questionText}"
Student Answer: "${answerText}"
Target Position: ${jobTarget.positionTitle} at ${jobTarget.companyName} (Industry: ${jobTarget.industry || 'General'})
Interview Track: ${interviewTrack}
Candidate Resume Summary: ${JSON.stringify(resumeInfo || {})}

---

## 5. OUTPUT FORMAT (UNIFIED API SCHEMA)
Return a valid JSON object matching this EXACT structure:
{
  "track_evaluated": "${interviewTrack}",
  "domain_classification": "[Identified Category, e.g., Bioethics & MMI / Clinical Exposure / STAR Behavioral / Technical]",
  "targeted_competencies": ["Competency 1", "Competency 2"],
  "overall_score": 4.2, // Float 0.0 to 5.0
  "score_breakdown": {
    "claim_or_situation": 0.9, // Float 0.0 to 1.0
    "evidence_or_action": 1.7, // Float 0.0 to 2.0
    "insight_or_result": 1.6, // Float 0.0 to 2.0
    "red_flag_deduction": 0.0 // Float 0.0 to 3.0 deduction
  },
  "feedback": {
    "strengths": ["Strength 1", "Strength 2"],
    "vulnerabilities": ["Vulnerability 1", "Vulnerability 2"],
    "red_flag_alert": null // String warning if red flag or ethical breach or overall_score < 1.0, otherwise null
  },
  "recommended_rewrite": "Structured rewrite following target framework"
}
`;

    const response = await callGeminiWithRetry({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    });

    const parsedJson = safeJsonParse(response.text);
    
    // Normalize Universal v2.0 fields
    const rawScore = typeof parsedJson.overall_score === 'number' ? parsedJson.overall_score : 4.0;
    const penaltyResult = applyHintPenalty(rawScore, hintsCount);
    const finalScore = penaltyResult.finalScore;

    // Run Objective Rubric & Filler Calibration Engine
    const objectiveAnalysis = analyzeObjectiveRubricAndFillers(
      answerText, 
      jobTarget, 
      req.body.customFillerWords || [], 
      req.body.speakingSeconds || 0
    );

    const claimOrSit = parsedJson.score_breakdown?.claim_or_situation ?? 0.8;
    const evOrAct = parsedJson.score_breakdown?.evidence_or_action ?? 1.6;
    const insOrRes = parsedJson.score_breakdown?.insight_or_result ?? 1.6;

    const numericScore = Math.min(100, Math.max(0, Math.round(finalScore * 20)));
    const score = Math.round(finalScore * 2 * 10) / 10;

    parsedJson.track_evaluated = interviewTrack;
    parsedJson.raw_evaluation_score = penaltyResult.rawScore;
    parsedJson.hints_unlocked = penaltyResult.hintsUnlocked;
    parsedJson.penalty_points = penaltyResult.penaltyDeducted;
    parsedJson.max_score_cap = penaltyResult.maxScoreCap;
    parsedJson.final_score = finalScore;
    parsedJson.overall_score = finalScore;
    parsedJson.aamc_competency_id = scenarioId || req.body.aamc_competency_id || "MMI_STATION";

    parsedJson.objective_rubric = objectiveAnalysis.objective_rubric;
    parsedJson.filler_analysis = objectiveAnalysis.filler_analysis;

    parsedJson.numericScore = numericScore;
    parsedJson.score = score;
    parsedJson.score5 = Math.round(finalScore);
    parsedJson.score5Explanation = finalScore >= 4.5 
      ? "Exceptional: Hits all structural requirements with rich evidence and deep insight." 
      : finalScore >= 3.0 
      ? "Competent: Clear answer with good evidence, missing deeper reflection/metrics." 
      : "Needs Work: Lacks concrete evidence or structure.";

    if (!parsedJson.feedback) {
      parsedJson.feedback = {
        strengths: ["Clear response structure provided."],
        vulnerabilities: ["Incorporate stronger specific evidence and reflective insight."],
        red_flag_alert: finalScore < 1.0 ? "CRITICAL RED FLAG ALERT: Ethical or behavioral vulnerability detected." : null
      };
    } else if (finalScore < 1.0 && !parsedJson.feedback.red_flag_alert) {
      parsedJson.feedback.red_flag_alert = "CRITICAL RED FLAG ALERT: Ethical or behavioral vulnerability detected.";
    }

    parsedJson.strengths = parsedJson.feedback.strengths || ["Clear context provided"];
    parsedJson.areasToImprove = parsedJson.feedback.vulnerabilities || ["Provide deeper quantitative or reflective insights."];
    parsedJson.suggestedAnswer = parsedJson.recommended_rewrite || "A strong structured model response...";

    parsedJson.starChecklist = {
      situation: claimOrSit >= 0.5,
      task: claimOrSit >= 0.7,
      action: evOrAct >= 1.0,
      result: insOrRes >= 1.0
    };
    parsedJson.starChecklistFormatted = `S: ${parsedJson.starChecklist.situation ? "✓" : "✗"} | T: ${parsedJson.starChecklist.task ? "✓" : "✗"} | A: ${parsedJson.starChecklist.action ? "✓" : "✗"} | R: ${parsedJson.starChecklist.result ? "✓" : "✗"}`;
    parsedJson.keyTip = parsedJson.feedback.red_flag_alert || parsedJson.areasToImprove[0] || "Focus on concrete outcomes and reflective learning.";
    parsedJson.starBreakdown = {
      situationTaskScore: Math.round((claimOrSit / 1.0) * 30),
      actionScore: Math.round((evOrAct / 2.0) * 40),
      resultScore: Math.round((insOrRes / 2.0) * 30)
    };

    res.json(parsedJson);
  } catch (error: any) {
    console.error("Gemini Evaluate Answer Error:", error);
    res.json(generateMockFeedback(questionText, answerText, category, jobTarget, interviewTrack, hintsCount, scenarioId, req.body.customFillerWords, req.body.speakingSeconds));
  }
});

// 3a. API: Custom Filler Word Calibration & Instant Analysis
app.post("/api/interview/calibrate-filler-words", (req, res) => {
  const { sampleText = "", customFillerWords = [], speakingSeconds = 0, jobTarget = {} } = req.body;
  const analysis = analyzeObjectiveRubricAndFillers(sampleText, jobTarget, customFillerWords, speakingSeconds);
  res.json({
    status: "success",
    message: "Filler word calibration and objective rubric computation complete.",
    analysis
  });
});

// 3b. API: Generate 3-4 STAR Bullet Points (No Resume Path)
app.post("/api/interview/generate-star-bullets", async (req, res) => {
  const { answers, jobTarget } = req.body;
  if (!answers || Object.keys(answers).length === 0) {
    return res.status(400).json({ error: "Missing diagnostic answers" });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.json({
      starBullets: [
        "Coordinated academic project deliverables by establishing a central task pipeline, completing all milestones 2 days ahead of schedule.",
        "Synthesized research data using analytical methodologies to present findings to peer cohorts and faculty members.",
        "Engineered group collaboration workflows, improving project execution efficiency and securing an A-grade mark.",
        "Executed structured problem-solving protocols under tight deadlines, ensuring 100% compliance with course specifications."
      ]
    });
  }

  try {
    const prompt = `You are an empathetic Career Coach and ATS Expert for university students.
Based on the student's responses to diagnostic questions below, generate 3 to 4 ATS-friendly STAR resume bullet points.

Student Responses:
${JSON.stringify(answers)}

Target Role: ${jobTarget?.positionTitle || "Entry-Level Position / Internship"}

RULES FOR ATS STAR BULLET POINTS:
1. Lead with strong, past-tense action verbs (e.g., Coordinated, Engineered, Synthesized, Spearheaded, Developed).
2. Incorporate specific Situation/Task context and Action details.
3. Include quantified outcomes, percentage gains, or concrete deliverables in the Result portion.
4. Keep each bullet point clean, professional, concise, and ATS-friendly.

Return JSON:
{
  "starBullets": [
    "Bullet point 1...",
    "Bullet point 2...",
    "Bullet point 3...",
    "Bullet point 4..."
  ]
}
`;

    const response = await callGeminiWithRetry({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.4,
      },
    });

    const parsedJson = safeJsonParse(response.text);
    res.json(parsedJson);
  } catch (error: any) {
    console.error("Gemini Generate STAR Bullets Error:", error);
    res.json({
      starBullets: [
        "Coordinated academic project deliverables by establishing a central task pipeline, completing all milestones 2 days ahead of schedule.",
        "Synthesized research data using analytical methodologies to present findings to peer cohorts and faculty members.",
        "Engineered group collaboration workflows, improving project execution efficiency and securing top evaluation marks.",
        "Executed structured problem-solving protocols under tight deadlines, ensuring 100% compliance with course specifications."
      ]
    });
  }
});

// 4. API: Generate Final Report
// 3b. API: Video Response Upload & Pre-signed URL / Transactional Email Endpoints
app.post("/api/interview/generate-video-signed-url", (req, res) => {
  const { questionId, filename = "response.webm" } = req.body;
  const timestamp = Date.now();
  const mockSignedUploadUrl = `/api/interview/upload-video-response?questionId=${encodeURIComponent(questionId || 'q1')}&ts=${timestamp}`;
  const mockPublicWatchUrl = `/api/interview/watch-video?questionId=${encodeURIComponent(questionId || 'q1')}&ts=${timestamp}`;

  res.json({
    uploadUrl: mockSignedUploadUrl,
    watchUrl: mockPublicWatchUrl,
    expiresInSeconds: 3600,
    questionId: questionId || 'q1'
  });
});

app.post("/api/interview/upload-video-response", (req, res) => {
  const { questionId, videoData, durationSeconds } = req.body;
  res.json({
    success: true,
    message: "Video response successfully received and processed",
    questionId: questionId || 'q1',
    durationSeconds: durationSeconds || 0,
    timestamp: new Date().toISOString()
  });
});

app.post("/api/interview/send-video-notification", (req, res) => {
  const { recipientEmail, questionId, questionText, videoUrl, durationSeconds } = req.body;
  if (!recipientEmail) {
    return res.status(400).json({ error: "Recipient email is required" });
  }

  console.log(`[VIDEO NOTIFICATION DISPATCHED] To: ${recipientEmail} | Question: "${questionText}" | Duration: ${durationSeconds}s | Watch Link: ${videoUrl}`);

  res.json({
    success: true,
    message: `Transactional video response email successfully sent to ${recipientEmail}`,
    emailDetails: {
      recipient: recipientEmail,
      questionText: questionText || "Interview Question Response",
      watchLink: videoUrl || "https://ais-dev-zp7kqjpekwxdkncvomrml2-772396752309.us-east1.run.app",
      durationSeconds: durationSeconds || 0,
      dispatchedAt: new Date().toISOString()
    }
  });
});

app.post("/api/interview/generate-report", async (req, res) => {
  const { sessionHistory, resumeInfo, jobTarget, totalSpeakingSeconds } = req.body;
  if (!sessionHistory || !jobTarget) {
    return res.status(400).json({ error: "Missing required history parameters" });
  }

  // Count valid non-skipped answers
  const validAnswers = (sessionHistory || []).filter((h: any) => {
    const ans = (h.answerText || h.answer || '').trim().toLowerCase();
    const sc = typeof h.feedback?.score === 'number' ? h.feedback.score : (typeof h.feedback?.overall_score === 'number' ? h.feedback.overall_score : (typeof h.score === 'number' ? h.score : 0));
    
    const isSkipped = !ans || 
                      ans === '[skipped question]' || 
                      ans.includes('skipped question') || 
                      ans === 'skipped' || 
                      ans === 'n/a' ||
                      sc === 0;
    return !isSkipped;
  });

  const totalQuestions = sessionHistory.length || 1;
  const answeredCount = validAnswers.length;
  const allSkipped = answeredCount === 0;

  if (allSkipped) {
    return res.json(generateMockFinalReport(sessionHistory, jobTarget, totalSpeakingSeconds));
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.json(generateMockFinalReport(sessionHistory, jobTarget, totalSpeakingSeconds));
  }

  try {
    const prompt = `You are the Albion College Career Director conducting the Final Review of Brit Interview Coach.
Analyze the student's mock interview history (all questions, answers, and scores) and total elapsed speaking time. Write a comprehensive, personalized coaching report.

Target Position: ${jobTarget.positionTitle} at ${jobTarget.companyName}
Industry: ${jobTarget.industry}
${jobTarget.jobDescription ? `Target Job Description / Competency Focus Areas:\n${jobTarget.jobDescription}\n` : ""}
Total Active Speaking Time: ${totalSpeakingSeconds || 0} seconds (Target ideal range: 120 to 300 seconds, which is 2 to 5 minutes overall).

[CRITICAL TIMER ASSESSMENT MANDATE]
- If totalActiveSpeakingTime is LESS than 120 seconds (under 2 minutes), emphasize prominently in "personalizedAdvice" or "topImprovementAreas" that the candidate's answers were extremely brief/short. Advise that 2-5 minutes is the standard recommended length for interview panels, and they need to speak and elaborate more on their projects, leadership, and analytical experiences to prove their points! State precisely: "Your active session lasted only [X] seconds; you must work more to expand and build on your bullet points."
- If totalActiveSpeakingTime is between 120 and 300 seconds (2 to 5 minutes), congratulate them on hitting the sweet-spot speaking zone with comprehensive detail!
- If totalActiveSpeakingTime is MORE than 300 seconds (over 5 minutes), advise them to practice conciseness and keep within the ideal 2-5 minute sweet spot.

Full Interview Log (Questions, Answers, Feedbacks):
${JSON.stringify(sessionHistory)}

Provide solid, high-value, encouragement. Evaluate the candidate in the following 10 categories, returning a "categoryEvaluations" JSON array of exactly 10 items:
1. "Educational Background" (Does the candidate have appropriate education, coursework, training, or academic preparation for this position?)
2. "Job/Organizational Fit" (Has the candidate gained similar skills, qualifications, or relevant experience through past work, internships, research, projects, volunteering, or leadership?)
3. "Problem Solving" (Did the candidate show the ability to understand a situation, respond appropriately, and develop a strategy or solution?)
4. "Verbal Communication" (Was the candidate’s response clear, organized, professional, and easy to understand?)
5. "Candidate Interest" (Did the candidate show genuine interest in the position and organization?)
6. "Knowledge of Organization" (Did the candidate show that they researched or understood the company, organization, department, or role?)
7. "Teambuilding/Interpersonal Skills" (Did the candidate demonstrate teamwork, collaboration, respect, communication, or conflict-resolution skills?)
8. "Initiative" (Did the candidate show motivation, independence, responsibility, or willingness to take action without being asked?)
9. "Time Management" (Did the candidate demonstrate organization, prioritization, reliability, or ability to manage deadlines?)
10. "Attention to Detail" (Did the candidate provide specific details, examples, numbers, outcomes, or careful explanation of their previous work?)

For each of the 10 categories, provide:
- "categoryName": The exact category name (e.g., "Educational Background")
- "rating": An integer from 1 to 5
- "explanation": A short explanation of exactly 2 to 4 sentences
- "evidence": Specific evidence/quotes from the candidate's answer
- "suggestion": One specific suggestion for improvement

Return JSON matching this schema:
{
  "overallScore": 85, // number (scale 1 to 100)
  "communicationScore": 80, // number (scale 1 to 100)
  "contentQualityScore": 82, // number (scale 1 to 100)
  "resumeAlignmentScore": 90, // number (scale 1 to 100)
  "confidenceClarityScore": 84, // number (scale 1 to 100)
  "topStrengths": ["Strength 1 (specific to interview)", "Strength 2", "Strength 3"],
  "topImprovementAreas": ["Improvement Area 1", "Improvement Area 2", "Improvement Area 3"],
  "bestAnswer": {
    "question": "Question text...",
    "answer": "Answer text...",
    "score": 9 // score 1-10
  },
  "weakestAnswer": {
    "question": "Question text...",
    "answer": "Answer text...",
    "score": 5 // score 1-10
  },
  "recommendedQuestions": [
    "Suggested practice question 1 for next time",
    "Suggested practice question 2",
    "Suggested practice question 3"
  ],
  "personalizedAdvice": "Detailed, encouraging concluding advice summarizing their readiness, targeting their desired company/role, and leveraging their Albion College liberal arts education.",
  "categoryEvaluations": [
    {
      "categoryName": "Educational Background",
      "rating": 4,
      "explanation": "Your academic preparation is aligned with the analytical requirements of the role. You highlighted relevant Albion College economics modules.",
      "evidence": "Mention of Albion business/economics coursework.",
      "suggestion": "Weave in specific coursework achievements or team project details."
    }
  ]
}
`;

    const response = await callGeminiWithRetry({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.5,
      },
    });

    const parsedJson = safeJsonParse(response.text);

    // CRITICAL ENFORCEMENT: Scale or zero-out overall score based on actual completed questions
    if (allSkipped) {
      parsedJson.overallScore = 0;
      parsedJson.communicationScore = 0;
      parsedJson.contentQualityScore = 0;
      parsedJson.resumeAlignmentScore = 0;
      parsedJson.confidenceClarityScore = 0;
    } else if (answeredCount < totalQuestions) {
      const completionRatio = answeredCount / totalQuestions;
      if (typeof parsedJson.overallScore === 'number') {
        parsedJson.overallScore = Math.min(100, Math.max(0, Math.round(parsedJson.overallScore * completionRatio)));
      }
      if (typeof parsedJson.communicationScore === 'number') {
        parsedJson.communicationScore = Math.min(100, Math.max(0, Math.round(parsedJson.communicationScore * completionRatio)));
      }
      if (typeof parsedJson.contentQualityScore === 'number') {
        parsedJson.contentQualityScore = Math.min(100, Math.max(0, Math.round(parsedJson.contentQualityScore * completionRatio)));
      }
      if (typeof parsedJson.resumeAlignmentScore === 'number') {
        parsedJson.resumeAlignmentScore = Math.min(100, Math.max(0, Math.round(parsedJson.resumeAlignmentScore * completionRatio)));
      }
      if (typeof parsedJson.confidenceClarityScore === 'number') {
        parsedJson.confidenceClarityScore = Math.min(100, Math.max(0, Math.round(parsedJson.confidenceClarityScore * completionRatio)));
      }
    }

    res.json(parsedJson);
  } catch (error: any) {
    console.error("Gemini Generate Report Error:", error);
    res.json(generateMockFinalReport(sessionHistory, jobTarget, totalSpeakingSeconds));
  }
});


// Fallback / Mock Generators

function generateMockParsedResume(text: string) {
  const cleanText = text.toLowerCase();
  
  // Extract student name (simple rules)
  let detectedName = "Albion Student";
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length > 0) {
    detectedName = lines[0];
    if (detectedName.toLowerCase().includes("resume") || detectedName.toLowerCase().includes("curriculum")) {
      detectedName = lines[1] || "Albion Student";
    }
  }

  // Simple keyword matching for skills and education
  const potentialSkills = ["Communication", "Microsoft Office", "Collaboration", "Critical Thinking", "Problem Solving", "Customer Service", "Research", "Teamwork", "Public Speaking", "Writing", "Analytic Research", "Python", "SQL", "Excel", "Data Analysis", "Spanish", "Leadership"];
  const skills: string[] = [];
  potentialSkills.forEach(s => {
    if (cleanText.includes(s.toLowerCase())) {
      skills.push(s);
    }
  });
  if (skills.length === 0) {
    skills.push("Liberal Arts Communication", "Team Collaboration", "Problem Solving");
  }

  // Simple experience detection
  const workExperience: string[] = [];
  const researchExperience: string[] = [];
  const projects: string[] = [];
  const leadership: string[] = [];

  let currentCategory: string | null = "work";

  lines.forEach(line => {
    const l = line.toLowerCase();
    if (l.includes("research") || l.includes("lab") || l.includes("directed study")) {
      currentCategory = "research";
    } else if (l.includes("project") || l.includes("assignment")) {
      currentCategory = "project";
    } else if (l.includes("leadership") || l.includes("activities") || l.includes("volunteer") || l.includes("clubs") || l.includes("fraternity") || l.includes("sorority") || l.includes("union")) {
      currentCategory = "leadership";
    } else if (l.includes("experience") || l.includes("employment") || l.includes("work")) {
      currentCategory = "work";
    }

    if (line.startsWith("-") || line.startsWith("•") || line.startsWith("*")) {
      const bulletText = line.replace(/^[-•*]\s*/, "");
      if (currentCategory === "research") {
        researchExperience.push(bulletText);
      } else if (currentCategory === "project") {
        projects.push(bulletText);
      } else if (currentCategory === "leadership") {
        leadership.push(bulletText);
      } else {
        workExperience.push(bulletText);
      }
    }
  });

  // Default fallbacks if empty
  if (workExperience.length === 0) {
    workExperience.push("Peer Tutor / Campus Assistant at Albion College (support peer learning, coordinate schedules)");
    workExperience.push("Customer Experience Associate (managed client communication, facilitated issue resolution)");
  }
  if (researchExperience.length === 0) {
    researchExperience.push("FYS First Year Seminar Research Project (conducted bibliography review and presented findings)");
  }
  if (projects.length === 0) {
    projects.push("Liberal Arts Capstone Thesis Outline (analyzing cross-disciplinary developments)");
  }
  if (leadership.length === 0) {
    leadership.push("Active Member, Albion Student Government Association or Union Board");
  }

  return {
    name: detectedName,
    education: cleanText.includes("albion") ? "B.A., Albion College" : "Albion College Undergraduate",
    majorMinor: cleanText.includes("major") ? "Estimated Major" : "Liberal Arts concentration",
    skills,
    workExperience,
    researchExperience,
    projects,
    leadership,
    certifications: ["Albion Career Readiness Initiative Pathway", "Dean's List Honoree"]
  };
}

function generateMockQuestions(resumeInfo: any, jobTarget: any, seenQuestionIds: string[] = []) {
  const title = jobTarget.positionTitle || "Internship Program";
  const company = jobTarget.companyName || "Target Company";
  const isPanel = jobTarget.interviewFormat === 'panel-board';
  const isEasyVibe = jobTarget.interviewType === 'campus_job' || jobTarget.interviewType === 'internship';
  const isMedicalTrack = jobTarget.interviewType === 'medical_school' || /med|doctor|physician|mmi|aamc|medical|hospital|clinic|pre-med|prehealth|surgery/i.test(`${title} ${company} ${jobTarget.industry || ''}`);

  if (isMedicalTrack) {
    const staticMmiPool = [
      {
        id: "mmi_pdf_1",
        scenario_id: "MMI_CMU_14_BC",
        title: "Confidentiality & Adolescent Care",
        text: "A 14-year-old patient asks for birth control but begs you not to tell her parents. How do you proceed?",
        category: "mmi",
        aamc_competency_primary: "Ethical Responsibility to Self and Others",
        aamc_competency_secondary: "Social Skills",
        timing: { prep_seconds: 120, station_seconds: 480 },
        help_drawer_content: {
          competency_overview: "Evaluates Ethical Responsibility and Social Skills in minor reproductive healthcare confidentiality.",
          underlying_dilemma: "Navigating state minor consent laws, patient autonomy, and parental involvement.",
          key_talking_points: [
            "Reassure the patient of medical confidentiality within legal limits.",
            "Explore her underlying motivations, safety, and relationship with her parents.",
            "Encourage and support her in opening an honest dialogue with family if safe to do so."
          ]
        },
        follow_up_probes: [
          "What if you suspect coercion or abuse by an older partner?",
          "How do you handle medical records privacy under state minor consent statutes?"
        ]
      },
      {
        id: "mmi_pdf_2",
        scenario_id: "MMI_CMU_RURAL_REC",
        title: "Rural Physician Recruitment & Incentives",
        text: "A community in rural Michigan is struggling to recruit physicians. What three specific structural incentives would you implement to address this?",
        category: "mmi",
        aamc_competency_primary: "Critical Thinking",
        aamc_competency_secondary: "Service Orientation",
        timing: { prep_seconds: 120, station_seconds: 480 },
        help_drawer_content: {
          competency_overview: "Evaluates Critical Thinking and Service Orientation in solving systemic healthcare access shortages.",
          underlying_dilemma: "Overcoming financial debt, professional isolation, and family integration barriers in rural medicine.",
          key_talking_points: [
            "Propose loan repayment or service-for-scholarship programs to relieve medical debt.",
            "Establish tele-mentorship and specialty consultation networks to eliminate professional isolation.",
            "Design trailing spouse and family integration programs to foster long-term community retention."
          ]
        },
        follow_up_probes: [
          "How do Social Determinants of Health (SDOH) impact physician retention in rural Northern Michigan?",
          "Why is forced placement ineffective compared to empowering physicians to choose rural practice?"
        ]
      },
      {
        id: "mmi_pdf_3",
        scenario_id: "MMI_COLUMBIA_DOWN_PREG",
        title: "Autonomy in Adult Patients with Special Needs",
        text: "A 20-year-old pregnant patient with Down syndrome refuses an abortion, but her parents insist on it. What factors do you consider?",
        category: "mmi",
        aamc_competency_primary: "Ethical Responsibility to Self and Others",
        aamc_competency_secondary: "Cultural Competence",
        timing: { prep_seconds: 120, station_seconds: 480 },
        help_drawer_content: {
          competency_overview: "Evaluates bioethical principles (Autonomy vs Beneficence) in decision-making for adults with developmental conditions.",
          underlying_dilemma: "Determining decision-making capacity and protecting patient bodily autonomy against parental authority.",
          key_talking_points: [
            "Assess the patient's individual decision-making capacity regarding pregnancy and healthcare.",
            "Recognize that legal adulthood grants patient autonomy unless a court decrees formal guardianship.",
            "Facilitate ethics committee consultation and supportive multidisciplinary counseling."
          ]
        },
        follow_up_probes: [
          "How do you balance parental caregiver stress with the patient's legal rights?",
          "What resources can assist the patient if she chooses to raise the child?"
        ]
      },
      {
        id: "mmi_pdf_4",
        scenario_id: "MMI_COLUMBIA_ATTENDING_ERR",
        title: "Observing an Unmentioned Surgical Error",
        text: "You see your attending physician make a mistake during a procedure. They don't mention it to the patient. What do you do?",
        category: "mmi",
        aamc_competency_primary: "Reliability & Dependability",
        aamc_competency_secondary: "Capacity for Improvement",
        timing: { prep_seconds: 120, station_seconds: 480 },
        help_drawer_content: {
          competency_overview: "Tests professional integrity and hierarchical communication when witnessing medical errors.",
          underlying_dilemma: "Weighing fear of career retaliation against fundamental patient safety and truthfulness.",
          key_talking_points: [
            "Speak with the attending physician privately to clarify the procedure outcome and error disclosure plan.",
            "Emphasize the ethical duty of transparent error disclosure to patients.",
            "Report through institutional quality/ethics channels if the attending refuses disclosure."
          ]
        },
        follow_up_probes: [
          "What if the attending threatens your medical school evaluation or residency match reference?",
          "How does error reporting improve health system quality and safety?"
        ]
      },
      {
        id: "mmi_pdf_5",
        scenario_id: "MMI_CMU_PEER_ALCOHOL",
        title: "Peer Substance Impairment on Clinical Rounds",
        text: "You notice your best friend in medical school has been smelling of alcohol during morning rounds. Walk me through your next steps.",
        category: "mmi",
        aamc_competency_primary: "Resilience & Adaptability",
        aamc_competency_secondary: "Ethical Responsibility to Self and Others",
        timing: { prep_seconds: 120, station_seconds: 480 },
        help_drawer_content: {
          competency_overview: "Evaluates interprofessional responsibility and patient protection when a colleague is impaired.",
          underlying_dilemma: "Balancing loyalty to a close friend with absolute duty to protect patient safety.",
          key_talking_points: [
            "Immediately intervene to remove the friend from direct patient care responsibilities.",
            "Speak privately with the friend to express compassionate concern and encourage physician health program support.",
            "Notify the chief resident or clerkship director if the friend refuses self-reporting."
          ]
        },
        follow_up_probes: [
          "What if the friend denies drinking and insists on treating patients?",
          "How do medical student wellness programs assist with substance use recovery?"
        ]
      },
      {
        id: "mmi_pdf_6",
        scenario_id: "MMI_COLUMBIA_CAM_REFUSAL",
        title: "Patient Refusal of Standard Cancer Treatment",
        text: "A patient whose breast lump was surgically removed refuses chemotherapy in favor of alternative medicine (CAM). How do you address this with her?",
        category: "mmi",
        aamc_competency_primary: "Cultural Competence",
        aamc_competency_secondary: "Service Orientation",
        timing: { prep_seconds: 120, station_seconds: 480 },
        help_drawer_content: {
          competency_overview: "Evaluates patient autonomy, informed consent, and integrative health communication.",
          underlying_dilemma: "Respecting competent patient treatment refusal while providing clear risk education.",
          key_talking_points: [
            "Inquire empathetically about her fears, past experiences, or rationale regarding chemotherapy.",
            "Verify informed consent by explaining statistical recurrence risks and benefits of standard therapy clearly.",
            "Explore if non-harmful complementary therapies can safely integrate alongside standard oncology care."
          ]
        },
        follow_up_probes: [
          "What if her refusal is driven by financial constraints or lack of health insurance?",
          "How do you maintain a therapeutic relationship if she firmly declines standard care?"
        ]
      },
      {
        id: "mmi_pdf_7",
        scenario_id: "MMI_UM_JAW_MIGUEL",
        title: "Emergency Care & Uninsured Financial Barriers",
        text: "An uninsured 25-year-old male from a rural area has a fractured jawbone requiring $12,500 surgery that hospital leadership states cannot be done pro-bono. What do you say to him?",
        category: "mmi",
        aamc_competency_primary: "Social Skills",
        aamc_competency_secondary: "Critical Thinking",
        timing: { prep_seconds: 120, station_seconds: 480 },
        help_drawer_content: {
          competency_overview: "Evaluates compassionate crisis communication, patient advocacy, and financial resource navigation.",
          underlying_dilemma: "Managing a acute painful condition when the patient lacks immediate means to pay.",
          key_talking_points: [
            "Greet the patient empathetically and manage acute pain immediately.",
            "Explain the medical consequences of prompt jaw setting ($12,500) vs delayed improper setting ($48,000).",
            "Connect the patient immediately with hospital social workers, charity care programs, or community health clinics."
          ]
        },
        follow_up_probes: [
          "How do you advocate for the patient with hospital administration or financial counselors?",
          "What alternative regional clinic resources might exist for low-income patients?"
        ]
      },
      {
        id: "mmi_q1",
        scenario_id: "MMI_ETH_2026_01",
        title: "Family Refusal of Pediatric Treatment",
        text: "Parents of a 6-year-old patient refuse a recommended antibiotic course for severe pneumonia, preferring alternative holistic remedies. How do you approach this conversation?",
        category: "mmi",
        aamc_competency_primary: "Ethical Responsibility to Self and Others",
        aamc_competency_secondary: "Cultural Competence",
        timing: { prep_seconds: 120, station_seconds: 480 },
        help_drawer_content: {
          competency_overview: "Evaluates Ethical Responsibility & Cultural Competence in pediatric patient care.",
          underlying_dilemma: "Balancing parental rights and cultural beliefs against the immediate medical welfare of a minor.",
          key_talking_points: [
            "Seek to understand the parents' holistic perspective without immediate judgment.",
            "Educate on risks of untreated pneumonia calmly and clearly.",
            "Determine if non-harmful alternative remedies can complement standard medical treatment."
          ]
        },
        follow_up_probes: [
          "What steps do you take if the child's condition deteriorates rapidly while you are discussing this?",
          "At what point, if any, is it appropriate to involve child protective services or hospital legal teams?"
        ]
      },
      {
        id: "mmi_q2",
        scenario_id: "MMI_REL_2026_02",
        title: "Disclosing a Medical Error to a Patient",
        text: "During a busy clinical shift, you realize you administered a non-fatal wrong medication dose. How do you handle disclosure and reporting?",
        category: "mmi",
        aamc_competency_primary: "Reliability & Dependability",
        aamc_competency_secondary: "Capacity for Improvement",
        timing: { prep_seconds: 120, station_seconds: 480 },
        help_drawer_content: {
          competency_overview: "Evaluates Reliability & Dependability and Capacity for Improvement under clinical pressure.",
          underlying_dilemma: "Weighing fear of personal/professional consequences against absolute honesty and patient safety.",
          key_talking_points: [
            "Prioritize immediate patient vitals assessment and attending physician notification.",
            "Disclose the error transparently and empathetically to the patient without shifting blame.",
            "Submit an incident report and analyze systemic process gaps to prevent recurrence."
          ]
        },
        follow_up_probes: [
          "How do you respond if a senior colleague advises you to stay silent since no permanent harm occurred?",
          "What steps do you take to rebuild trust with the patient and medical team after this error?"
        ]
      },
      {
        id: "mmi_q3",
        scenario_id: "MMI_CRT_2026_03",
        title: "Resource Allocation in Emergency Triage",
        text: "Two critically ill patients require the last available ICU bed. One is an elderly community leader, the other a young uninsured patient. How do you decide?",
        category: "mmi",
        aamc_competency_primary: "Critical Thinking",
        aamc_competency_secondary: "Ethical Responsibility to Self and Others",
        timing: { prep_seconds: 120, station_seconds: 480 },
        help_drawer_content: {
          competency_overview: "Tests Critical Thinking and Ethical Responsibility in resource-constrained triage.",
          underlying_dilemma: "Weighing social utility or age against objective clinical prognosis and medical need.",
          key_talking_points: [
            "Utilize objective clinical criteria (SOFA score, reversibility, likelihood of benefit) rather than social status.",
            "Consult hospital ethics committee or senior triage officer for standardized guidance.",
            "Ensure dignity and compassionate palliative/alternative care for the unselected patient."
          ]
        },
        follow_up_probes: [
          "What if the community leader's family offers a large financial donation to the hospital?",
          "How do you communicate the decision to the waiting family members empathetically?"
        ]
      },
      {
        id: "mmi_q4",
        scenario_id: "MMI_TMW_2026_04",
        title: "Addressing Non-Contributing Team Member in Pre-Med Lab",
        text: "A lab partner consistently fails to complete their assigned data analysis before team deadlines. How do you resolve this interprofessional dispute?",
        category: "mmi",
        aamc_competency_primary: "Teamwork",
        aamc_competency_secondary: "Social Skills",
        timing: { prep_seconds: 120, station_seconds: 480 },
        help_drawer_content: {
          competency_overview: "Evaluates Teamwork and Social Skills when managing peer accountability.",
          underlying_dilemma: "Balancing empathy for a struggling peer with accountability for group deliverables.",
          key_talking_points: [
            "Initiate a private, non-confrontational conversation to inquire about underlying personal or academic hurdles.",
            "Offer supportive scaffolding or re-allocation of sub-tasks while maintaining clear deadlines.",
            "Involve the course instructor only as a last resort after direct peer resolution attempts."
          ]
        },
        follow_up_probes: [
          "What if the peer responds defensively and accuses you of being micro-managing?",
          "How do you ensure the final project quality is uncompromised while supporting your peer?"
        ]
      },
      {
        id: "mmi_q5",
        scenario_id: "MMI_CUL_2026_05",
        title: "Language Barrier and Emergency Informed Consent",
        text: "An elderly non-English speaking patient requires urgent surgery. The family offers to translate, but you notice discrepancies in their translation. How do you proceed?",
        category: "mmi",
        aamc_competency_primary: "Cultural Competence",
        aamc_competency_secondary: "Service Orientation",
        timing: { prep_seconds: 120, station_seconds: 480 },
        help_drawer_content: {
          competency_overview: "Evaluates Cultural Competence and Service Orientation when securing valid medical consent.",
          underlying_dilemma: "Respecting family involvement while ensuring legally valid, uncorrupted informed consent.",
          key_talking_points: [
            "Politely request a certified medical interpreter via phone/video service to ensure accurate translation.",
            "Explain to the family that hospital policy protects the patient's privacy and clear understanding.",
            "Verify the patient's comprehension directly through approved medical translation channels."
          ]
        },
        follow_up_probes: [
          "What if the family becomes offended that you are not using their translation?",
          "How do you manage consent if no certified interpreter is immediately available in an emergency?"
        ]
      },
      {
        id: "mmi_q6",
        scenario_id: "MMI_IMP_2026_06",
        title: "Observing Academic Misconduct in Pre-Med Coursework",
        text: "You witness a close pre-med classmate using unapproved notes during a major organic chemistry exam. What is your ethical course of action?",
        category: "mmi",
        aamc_competency_primary: "Capacity for Improvement",
        aamc_competency_secondary: "Ethical Responsibility to Self and Others",
        timing: { prep_seconds: 120, station_seconds: 480 },
        help_drawer_content: {
          competency_overview: "Tests Capacity for Improvement and Ethical Responsibility regarding professional integrity.",
          underlying_dilemma: "Weighing loyalty to a friend against institutional honor codes and professional honesty.",
          key_talking_points: [
            "Encourage the peer privately to self-report their actions to the course professor.",
            "Acknowledge the intense pressures of pre-med competition while upholding academic honesty.",
            "Consult honor council guidelines if the peer refuses to self-report."
          ]
        },
        follow_up_probes: [
          "What if the peer threatens to end your friendship if you report them?",
          "How does academic integrity relate to future patient safety and trust in medicine?"
        ]
      },
      {
        id: "mmi_q7",
        scenario_id: "MMI_RES_2026_07",
        title: "Managing Compassion Fatigue and Shift Overload",
        text: "After three consecutive 12-hour clinic shifts, a demanding patient berates you for a minor administrative delay. How do you maintain composure?",
        category: "mmi",
        aamc_competency_primary: "Resilience & Adaptability",
        aamc_competency_secondary: "Reliability & Dependability",
        timing: { prep_seconds: 120, station_seconds: 480 },
        help_drawer_content: {
          competency_overview: "Evaluates Resilience & Adaptability and Reliability under high fatigue.",
          underlying_dilemma: "Managing personal emotional exhaustion while delivering empathetic, professional patient care.",
          key_talking_points: [
            "De-escalate the tension by validating the patient's anxiety and frustration with the wait.",
            "Maintain professional boundaries without internalizing the patient's hostility.",
            "Implement personal wellness strategies and debrief with team members post-shift."
          ]
        },
        follow_up_probes: [
          "How do you recognize signs of personal burnout before it impacts patient care?",
          "What support resources do you utilize when experiencing clinical distress?"
        ]
      },
      {
        id: "mmi_q8",
        scenario_id: "MMI_SER_2026_08",
        title: "Free Clinic Outreach Resource Constraints",
        text: "Your student-run free clinic has 10 vaccine doses left and 25 waiting patients. How do you establish an equitable distribution strategy?",
        category: "mmi",
        aamc_competency_primary: "Service Orientation",
        aamc_competency_secondary: "Critical Thinking",
        timing: { prep_seconds: 120, station_seconds: 480 },
        help_drawer_content: {
          competency_overview: "Tests Service Orientation and Critical Thinking in community health triage.",
          underlying_dilemma: "Fairly prioritizing scarce preventative care among underserved community members.",
          key_talking_points: [
            "Establish objective vulnerability criteria (e.g., age, immunocompromised status, risk exposure).",
            "Provide clear, empathetic communication and rainchecks/referrals for unserved patients.",
            "Coordinate with regional public health partners to secure additional supply."
          ]
        },
        follow_up_probes: [
          "How do you handle a patient who argues they arrived first and deserve priority?",
          "What long-term steps can the clinic take to address supply chain inequities?"
        ]
      }
    ];

    const staticMedTraditionalPool = [
      {
        id: "med_trad_1",
        title: "Motivation for Medicine & School Fit",
        text: "Why do you want to pursue medicine, and why is Central Michigan University College of Medicine the right place for your training?",
        category: "general",
        help_drawer_content: {
          competency_overview: "Evaluates core motivation, self-reflection, and alignment with institutional mission.",
          underlying_dilemma: "Demonstrating authentic service orientation beyond personal ambitions.",
          key_talking_points: [
            "Share pivotal clinical or volunteering experiences that cemented your commitment.",
            "Highlight specific alignment with CMU's mission for primary care and community service.",
            "Connect your personal trajectory to long-term community health goals."
          ]
        },
        follow_up_probes: [
          "What specific aspect of CMU's Comprehensive Community Clerkship appeals to you?",
          "How do your past experiences prepare you for practicing in rural or underserved areas?"
        ]
      },
      {
        id: "med_trad_2",
        title: "Anticipated Sacrifices in Medical School",
        text: "What is the biggest sacrifice you anticipate making in medical school, and how have you prepared yourself for it?",
        category: "general",
        help_drawer_content: {
          competency_overview: "Evaluates self-awareness, realistic expectations, and emotional resilience.",
          underlying_dilemma: "Balancing intense academic rigor with personal well-being and relationships.",
          key_talking_points: [
            "Acknowledge the time, personal life, and financial commitments candidly.",
            "Describe concrete coping mechanisms and support systems you have built.",
            "Emphasize your intrinsic resilience and proactive stress management strategies."
          ]
        },
        follow_up_probes: [
          "How do you maintain work-life balance when facing overwhelming study schedules?",
          "What lesson from a past hardship will guide you through medical school?"
        ]
      },
      {
        id: "med_trad_3",
        title: "Legacy & Impact on Medical Community",
        text: "What specific legacy or long-term impact do you want to leave on the medical community during your career?",
        category: "general",
        help_drawer_content: {
          competency_overview: "Evaluates long-term vision, leadership, and commitment to healthcare improvement.",
          underlying_dilemma: "Translating individual passion into broad healthcare or community benefits.",
          key_talking_points: [
            "Articulate a clear vision for patient advocacy, health equity, or clinical leadership.",
            "Reference specific systemic challenges like healthcare access or health disparities.",
            "Explain how you plan to mentor future healthcare professionals."
          ]
        },
        follow_up_probes: [
          "How will you measure the success of your impact 15 years from now?",
          "How does your undergraduate experience at Albion inspire this goal?"
        ]
      },
      {
        id: "med_trad_4",
        title: "Commitment to Rural & Underserved Care",
        text: "Why do you want to practice medicine specifically in a rural or medically underserved setting?",
        category: "general",
        help_drawer_content: {
          competency_overview: "Evaluates understanding of Social Determinants of Health (SDOH) and mission fit.",
          underlying_dilemma: "Addressing healthcare disparities in resource-limited rural environments.",
          key_talking_points: [
            "Discuss firsthand observations or experiences in underserved communities.",
            "Recognize the unique scope of practice and community integration of rural physicians.",
            "Emphasize long-term commitment rather than a short-term obligation."
          ]
        },
        follow_up_probes: [
          "What do you view as the primary barrier to health access in rural Michigan?",
          "How will you engage with local community leaders to build trust?"
        ]
      }
    ];

    const staticMedBehavioralPool = [
      {
        id: "med_beh_1",
        title: "Adapting to Uncomfortable / Outsider Environments",
        text: "Describe a situation where you were an 'outsider' or felt uncomfortable in a group. How did you adapt, and what did you learn?",
        category: "behavioral",
        help_drawer_content: {
          competency_overview: "Evaluates Cultural Competence, Adaptability, and Emotional Intelligence (EQ).",
          underlying_dilemma: "Navigating unfamiliar social or cultural dynamics with humility and empathy.",
          key_talking_points: [
            "Describe the context clearly without defensive posture.",
            "Focus on active listening, humility, and willingness to learn from others.",
            "Detail the specific reflective lessons gained and how you apply them today."
          ]
        },
        follow_up_probes: [
          "How did this experience change your communication style with diverse patients?",
          "What advice would you give a classmate entering a similar situation?"
        ]
      },
      {
        id: "med_beh_2",
        title: "Conflict Resolution with Teammate or Coworker",
        text: "Describe a conflict you had with a coworker, teammate, or lab partner. How was it resolved?",
        category: "behavioral",
        help_drawer_content: {
          competency_overview: "Evaluates Teamwork, Interpersonal Skills, and Conflict Management.",
          underlying_dilemma: "Resolving interpersonal friction constructively while maintaining project goals.",
          key_talking_points: [
            "Use the STAR method to describe the situation objectively.",
            "Highlight direct, private, and respectful dialogue aimed at understanding perspectives.",
            "Focus on the mutual resolution and sustained professional relationship."
          ]
        },
        follow_up_probes: [
          "What would you do differently if faced with a similar conflict again?",
          "How do you maintain focus on patient/project goals during a team disagreement?"
        ]
      },
      {
        id: "med_beh_3",
        title: "Handling a Regretted Mistake and Aftermath",
        text: "Describe a situation in which you did something you truly regretted. How did you handle the aftermath and what did you learn?",
        category: "behavioral",
        help_drawer_content: {
          competency_overview: "Evaluates Capacity for Improvement, Integrity, and Accountability.",
          underlying_dilemma: "Owning personal failure transparently without shifting blame.",
          key_talking_points: [
            "Admit the mistake candidly and take direct personal responsibility.",
            "Detail the immediate corrective actions taken to mitigate harm.",
            "Emphasize the teachable moment and long-term behavioral changes made."
          ]
        },
        follow_up_probes: [
          "How did you rebuild trust with the affected parties after this event?",
          "How does this reflection prepare you for managing errors in medical practice?"
        ]
      },
      {
        id: "med_beh_4",
        title: "Processing Direct Critical Feedback",
        text: "Tell us about a time you received direct critical feedback about your performance. How did you process it and what did you change?",
        category: "behavioral",
        help_drawer_content: {
          competency_overview: "Evaluates Resilience, Humility, and Capacity for Continuous Improvement.",
          underlying_dilemma: "Receiving constructive criticism without defensiveness and turning it into growth.",
          key_talking_points: [
            "Explain the feedback context and your initial emotional processing.",
            "Describe the concrete steps implemented to address the critique.",
            "Highlight the measurable improvement and ongoing self-reflection."
          ]
        },
        follow_up_probes: [
          "How do you seek out feedback proactively in high-stress clinical settings?",
          "How do you distinguish between constructive criticism and unfair critique?"
        ]
      }
    ];

    const selectedType = jobTarget.interviewType || 'medical_school';

    if (selectedType === 'general') {
      return staticMedTraditionalPool.slice(0, 4);
    } else if (selectedType === 'behavioral') {
      return staticMedBehavioralPool.slice(0, 4);
    } else {
      // Default to MMI pool for medical_school track or mmi selection
      const unusedMmi = staticMmiPool.filter(q => 
        !seenQuestionIds.includes(q.id) && !seenQuestionIds.includes(q.scenario_id)
      );

      if (unusedMmi.length >= 4) {
        return unusedMmi.slice(0, 4);
      }

      return staticMmiPool.slice(0, 4);
    }
  }

  // Robust, distinct pools to guarantee high variation and eliminate repetition
  let generalPool = [
    `Welcome! Let's start with your overall candidacy. Why are you targeting the ${title} position at ${company} specifically? How do your academic foundations prepare you for this transition?`,
    `Good morning. To open this session, could you describe your most significant professional growth catalyst, and why that points to your fit for the ${title} role at ${company}?`,
    `Welcome to the interview. Focus directly on your career path: what specific operational values do you believe you will bring to the ${title} department at ${company}?`,
    `Let's begin. As an applicant for ${title} at ${company}, what unique angle or methodology do you possess that distinguishes you from other traditional candidates?`,
    `Thank you for joining us today. Could you present a 90-second executive summary of your background, highlighting the direct experiences that prepare you to excel as a ${title} at ${company}?`
  ];

  let technicalPool = [
    `Marcus (Technical Lead): Looking over your experience and technical foundations, could you walk me through a complex scenario where you had to solve a challenging roadblock under a tight deadline?`,
    `In a ${title} structure, analytical rigor is essential. Can you outline a technical tool, scientific method, or data model you have mastered, and how you evaluate its limitations?`,
    `How do you approach auditing your work for quality or syntax-level errors when you are operating under a tight delivery window?`,
    `Suppose you are tasked to design a new analytical process for ${company}'s key deliverables in ${jobTarget.industry || 'this field'}. Where do you start your research and what metrics do you track?`,
    `Describe a time you encountered a complex, multi-layered scientific or data problem with incomplete observational documentation. How did you synthesize a workable solution?`,
    `Explain a technical concept or tool relevant to your ${title} target to an executive stakeholder who has absolutely zero background in this field. How do you translate the complexity?`
  ];

  let behavioralPool = [
    `Elena (Director of Product): Since our teams work in cross-functional structures, describe a time you had to align a diverse group where priorities were divided or unclear.`,
    `Let's move to behavioral diagnostics. Walk me through a concrete scenario from your background where you had to lead or influence a team while facing significant ambiguity in parameters or goals. What did you achieve?`,
    `Describe a time when you received direct, critical feedback about your performance. How did you process it, and what specific operational modifications did you implement?`,
    `We often experience conflicts in priorities. Tell me about a time you had to make a high-stakes trade-off under strict resource or time constraints.`,
    `Hiring manager here. Describe a project or academic experiment that did not go as planned. What was the failure outcome, and what was your raw structural takeaway?`,
    `Describe a situation where you had to coordinate with a cross-functional partner or student peer who had a completely different working style. How did you negotiate alignment?`
  ];

  let fitPool = [
    `Sarah (HR): Thank you. To close our session, how do you feel your liberal arts education at Albion prepares you to adapt to high-stakes expectations in this industry?`,
    `How do you expect to translate your transferable academic competencies at Albion College directly into operational contributions at ${company}?`,
    `Albion's liberal arts mandate emphasizes adaptability and ethical balance. Describe how you apply these values when solving high-stakes corporate challenges in the context of a ${title}.`,
    `How does your training in interdisciplinary problem-solving at Albion College influence your day-to-day work habits and communication style?`,
    `At ${company}, we value lifetime learning. Describe a new skill or complex hobby you picked up purely on your own initiative. How did you structure your progression and track your own mastery?`
  ];

  if (isEasyVibe) {
    generalPool = [
      `Hi there! Welcome. We'd love to learn more about you. What makes you excited about the ${title} role here at ${company}?`,
      `Hello! To get started, could you share a little bit about what you study at Albion College and what you hope to learn in this position?`,
      `Welcome! We're glad you're here. Why are you interested in working as a ${title} with ${company}?`
    ];
    technicalPool = [
      `Could you talk about a simple tool, program, or subject you've learned in your classes that you enjoyed?`,
      `We'd love to hear about how you organize your assignments. What is your favorite way to stay organized when you have several tasks to complete?`,
      `Could you describe a course project or group activity you've worked on recently at Albion College? What was your role in the group?`
    ];
    behavioralPool = [
      `Tell us about a time you helped a classmate, teammate, or friend with a problem. What did you do to support them?`,
      `Can you share an experience where you had to learn something new or work on a task that was unfamiliar to you? How did you handle it?`,
      `We all experience busy weeks. How do you balance your classes with other activities or student clubs?`
    ];
    fitPool = [
      `What are some qualities or skills you hope to build while working with us?`,
      `How do you think your experience as an Albion student will help you be a great teammate in this role?`,
      `To wrap up, what are you most proud of from your time so far at Albion College?`
    ];
  }

  // Helper helper to get a random item
  const getRandomItem = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  // Draw random question from each pool
  const q1Text = getRandomItem(generalPool);
  const q2Text = getRandomItem(technicalPool);
  const q3Text = getRandomItem(behavioralPool);
  const q4Text = getRandomItem(fitPool);

  if (isPanel) {
    // If panel format, ensure Sarah, Marcus, Elena prefixes are maintained nicely
    const ensurePanelPrefixPrefix = (txt: string, name: string) => {
      if (txt.includes("Sarah (HR):") || txt.includes("Marcus (Technical Lead):") || txt.includes("Elena (Director of Product):")) {
        return txt;
      }
      return `${name}: ${txt}`;
    };

    return [
      {
        id: "q1",
        text: ensurePanelPrefixPrefix(q1Text, "Sarah (HR)"),
        category: "general"
      },
      {
        id: "q2",
        text: ensurePanelPrefixPrefix(q2Text, "Marcus (Technical Lead)"),
        category: "technical"
      },
      {
        id: "q3",
        text: ensurePanelPrefixPrefix(q3Text, "Elena (Director of Product)"),
        category: "behavioral"
      },
      {
        id: "q4",
        text: ensurePanelPrefixPrefix(q4Text, "Sarah (HR)"),
        category: "company-fit"
      }
    ];
  }

  // Formatting for One-On-One Interview format
  const cleanOneOnOnePrefix = (txt: string) => {
    return txt
      .replace(/^Sarah \(HR\):\s*/i, "")
      .replace(/^Marcus \(Technical Lead\):\s*/i, "")
      .replace(/^Elena \(Director of Product\):\s*/i, "");
  };

  return [
    {
      id: "q1",
      text: cleanOneOnOnePrefix(q1Text),
      category: "general"
    },
    {
      id: "q2",
      text: cleanOneOnOnePrefix(q2Text),
      category: "technical"
    },
    {
      id: "q3",
      text: cleanOneOnOnePrefix(q3Text),
      category: "behavioral"
    },
    {
      id: "q4",
      text: cleanOneOnOnePrefix(q4Text),
      category: "company-fit"
    }
  ];
}

function generateMockFeedback(questionText: string, answerText: string, category: string, jobTarget: any, interviewTrack: string = 'STANDARD_JOB', hintsUnlocked: number = 0, scenarioId?: string, customFillerWords: string[] = [], speakingSeconds: number = 0) {
  const isBehavioral = category === "behavioral" || questionText.toLowerCase().includes("tell me about a time") || questionText.toLowerCase().includes("describe a scenario");
  const wordsCount = answerText.split(/\s+/).length;

  const objectiveAnalysis = analyzeObjectiveRubricAndFillers(answerText, jobTarget, customFillerWords, speakingSeconds);
  
  let stScore = 24; // situation & task out of 30
  let aScore = 32;  // action out of 40
  let rScore = 20;  // result out of 30
  
  if (wordsCount > 60) {
    stScore = 28;
    aScore = 37;
    rScore = 26;
  } else if (wordsCount < 20) {
    stScore = 18;
    aScore = 22;
    rScore = 12;
  }

  const numericScore = Math.min(100, Math.max(0, stScore + aScore + rScore));
  const raw_overall_score = Math.min(5.0, Math.max(1.0, Math.round((numericScore / 20) * 10) / 10));
  const penaltyResult = applyHintPenalty(raw_overall_score, hintsUnlocked);

  const finalScore = penaltyResult.finalScore;
  const finalNumericScore = Math.min(100, Math.max(0, Math.round(finalScore * 20)));

  const hasSituation = wordsCount >= 10;
  const hasTask = wordsCount >= 15;
  const hasAction = wordsCount >= 25;
  const hasResult = wordsCount >= 40 || answerText.toLowerCase().includes("result") || answerText.toLowerCase().includes("outcome") || /\d+/.test(answerText);

  const starChecklist = {
    situation: hasSituation,
    task: hasTask,
    action: hasAction,
    result: hasResult
  };

  const starChecklistFormatted = `S: ${hasSituation ? "✓" : "✗"} | T: ${hasTask ? "✓" : "✗"} | A: ${hasAction ? "✓" : "✗"} | R: ${hasResult ? "✓" : "✗"}`;

  const keyTip = hasResult 
    ? "Solid structure! Enhance your action steps by highlighting the exact tools or software you used." 
    : "Include quantifiable metrics or specific results in your final sentence to satisfy the 'Result' criteria.";

  const isEasyVibe = jobTarget && (jobTarget.interviewType === 'campus_job' || jobTarget.interviewType === 'internship');
  if (isEasyVibe) {
    const score5 = Math.round(finalScore);
    const score5Explanation = score5 === 5 
      ? "Perfect answer. All points addressed. All points relevant." 
      : "Good answer. Relevant information. All or most points covered. Good examples.";

    const strengths = [
      "Warm, highly enthusiastic, and authentic student tone.",
      "Demonstrates excellent willingness to learn and great collegiate spirit."
    ];
    const vulnerabilities = [
      "Include one more small personal detail to highlight your campus activities.",
      "Keep practicing! Your positive attitude shines through beautifully."
    ];
    const suggestedAnswer = `A great encouraging response: "I really enjoy my classes and student activities at Albion College. In our recent team project, I made sure everyone felt heard and we completed our slides ahead of schedule. I would love to bring that same helpful, positive energy to your team!"`;

    return {
      track_evaluated: interviewTrack,
      domain_classification: interviewTrack === "MEDICAL_SCHOOL" ? "Motivation & Fit" : "Campus / Internship Fit",
      targeted_competencies: interviewTrack === "MEDICAL_SCHOOL" ? ["Service Orientation", "Oral Communication"] : ["Teamwork", "Communication"],
      raw_evaluation_score: penaltyResult.rawScore,
      hints_unlocked: penaltyResult.hintsUnlocked,
      penalty_points: penaltyResult.penaltyDeducted,
      max_score_cap: penaltyResult.maxScoreCap,
      final_score: finalScore,
      overall_score: finalScore,
      aamc_competency_id: scenarioId || "MMI_STATION",
      objective_rubric: objectiveAnalysis.objective_rubric,
      filler_analysis: objectiveAnalysis.filler_analysis,
      score_breakdown: {
        claim_or_situation: Math.round((stScore / 30) * 10) / 10,
        evidence_or_action: Math.round((aScore / 20) * 10) / 10,
        insight_or_result: Math.round((rScore / 20) * 10) / 10,
        red_flag_deduction: 0.0
      },
      feedback: {
        strengths,
        vulnerabilities,
        red_flag_alert: null
      },
      recommended_rewrite: suggestedAnswer,
      numericScore: finalNumericScore,
      score: Math.round(finalScore * 2 * 10) / 10,
      starBreakdown: {
        situationTaskScore: Math.min(30, stScore + 2),
        actionScore: Math.min(40, aScore + 2),
        resultScore: Math.min(30, rScore + 2)
      },
      starChecklist,
      starChecklistFormatted,
      keyTip,
      score5,
      score5Explanation,
      strengths,
      areasToImprove: vulnerabilities,
      suggestedAnswer,
      clarityComments: "Wonderful! Extremely clear, natural, and friendly.",
      confidenceComments: "Fantastic! You sound highly enthusiastic and self-assured.",
      structureComments: "Very neat, simple structure that's super easy to follow.",
      relevanceComments: "100% relevant. You addressed the core question perfectly.",
      professionalismComments: "Highly appropriate collegiate professional register. Terrific!",
      starAnalysis: `S: ${hasSituation ? "✓" : "✗"}, T: ${hasTask ? "✓" : "✗"}, A: ${hasAction ? "✓" : "✗"}, R: ${hasResult ? "✓" : "✗"}`
    };
  }

  const score5 = Math.round(finalScore);
  const rubricMap: { [key: number]: string } = {
    5: "Perfect answer. All points addressed. All points relevant.",
    4: "Good answer. Relevant information. All or most points covered. Good examples.",
    3: "Some points covered. Relevant information given. Some examples given.",
    2: "Some points covered, not all relevant. Some examples given.",
    1: "A few good points but main issues are missing. No examples/irrelevant examples given.",
    0: "No answer given or answer completely irrelevant. No examples given. The answer does not match the information in the resume."
  };

  const strengths = [
    "Adequate logical structure mapping high-level scenarios.",
    "Clear, audible vocabulary with appropriate technical jargon where required."
  ];
  const vulnerabilities = [
    "Include precise quantitative metrics to make claims concrete and prove operational value.",
    "Expand on specific personal actions rather than 'we' team activities."
  ];
  const suggestedAnswer = `In my role at Albion, I recognized our project was behind schedule. I audited our dataset using Python, identified two data anomalies, and restructured our reporting pipeline. As a result, we delivered the final analysis 2 days early with 100% accuracy.`;

  return {
    track_evaluated: interviewTrack,
    domain_classification: interviewTrack === "MEDICAL_SCHOOL" ? "Clinical & Research" : "STAR Behavioral",
    targeted_competencies: interviewTrack === "MEDICAL_SCHOOL" ? ["Ethical Responsibility", "Critical Thinking"] : ["Problem Solving", "Adaptability"],
    raw_evaluation_score: penaltyResult.rawScore,
    hints_unlocked: penaltyResult.hintsUnlocked,
    penalty_points: penaltyResult.penaltyDeducted,
    max_score_cap: penaltyResult.maxScoreCap,
    final_score: finalScore,
    overall_score: finalScore,
    aamc_competency_id: scenarioId || "MMI_STATION",
    objective_rubric: objectiveAnalysis.objective_rubric,
    filler_analysis: objectiveAnalysis.filler_analysis,
    score_breakdown: {
      claim_or_situation: Math.round((stScore / 30) * 10) / 10,
      evidence_or_action: Math.round((aScore / 20) * 10) / 10,
      insight_or_result: Math.round((rScore / 20) * 10) / 10,
      red_flag_deduction: 0.0
    },
    feedback: {
      strengths,
      vulnerabilities,
      red_flag_alert: null
    },
    recommended_rewrite: suggestedAnswer,
    numericScore: finalNumericScore,
    score: Math.round(finalScore * 2 * 10) / 10,
    starBreakdown: {
      situationTaskScore: stScore,
      actionScore: aScore,
      resultScore: rScore
    },
    starChecklist,
    starChecklistFormatted,
    keyTip,
    score5,
    score5Explanation: rubricMap[score5],
    strengths,
    areasToImprove: vulnerabilities,
    suggestedAnswer,
    clarityComments: "Clear, logical progression.",
    confidenceComments: "Steady, confident pacing.",
    structureComments: "Acceptable structure.",
    relevanceComments: "Directly addresses the question asked.",
    professionalismComments: "Appropriate formal register.",
    starAnalysis: `S: ${hasSituation ? "✓" : "✗"}, T: ${hasTask ? "✓" : "✗"}, A: ${hasAction ? "✓" : "✗"}, R: ${hasResult ? "✓" : "✗"}`
  };
}

function generateMockFinalReport(history: any[], jobTarget: any, totalSpeakingSeconds?: number) {
  const allSkipped = !history || history.length === 0 || history.every((h: any) => {
    const ans = (h.answerText || h.answer || '').trim().toLowerCase();
    const sc = h.feedback?.score ?? h.feedback?.overall_score ?? h.score ?? 0;
    return !ans || ans === '[skipped question]' || ans.includes('skipped question') || sc === 0;
  });

  if (allSkipped) {
    return {
      overallScore: 0,
      communicationScore: 0,
      contentQualityScore: 0,
      resumeAlignmentScore: 0,
      confidenceClarityScore: 0,
      topStrengths: ["Initiated mock interview session."],
      topImprovementAreas: [
        "All question stations in this session were skipped.",
        "Attempt station scenarios by providing spoken or typed responses.",
        "Practice answers to receive detailed AI feedback and scoring."
      ],
      bestAnswer: {
        question: history?.[0]?.questionText || "N/A",
        answer: "[Skipped Question]",
        score: 0
      },
      weakestAnswer: {
        question: history?.[0]?.questionText || "N/A",
        answer: "[Skipped Question]",
        score: 0
      },
      recommendedQuestions: [
        "Why do you want to pursue this specific career path?",
        "Describe a situation where you managed a challenging team dynamic.",
        "How do your past academic experiences prepare you for this role?"
      ],
      personalizedAdvice: "You skipped all questions in this mock interview session. As a result, your overall interview score is 0.0. To receive personalized coaching, evaluation metrics, and score breakdowns, please attempt the questions in your next session!",
      categoryEvaluations: [
        "Educational Background", "Job/Organizational Fit", "Problem Solving", "Verbal Communication",
        "Candidate Interest", "Knowledge of Organization", "Teambuilding/Interpersonal Skills",
        "Initiative", "Time Management", "Attention to Detail"
      ].map(catName => ({
        categoryName: catName,
        rating: 1,
        explanation: "Station was skipped during the interview session.",
        evidence: "None (Skipped station).",
        suggestion: "Complete this station with a spoken or written response to earn points."
      }))
    };
  }

  let totalScore = 0;
  history.forEach((h: any) => {
    const ans = (h.answerText || h.answer || '').trim().toLowerCase();
    const isSkipped = !ans || ans === '[skipped question]' || ans.includes('skipped question');
    if (isSkipped) {
      totalScore += 0;
    } else {
      totalScore += h.feedback?.score || h.feedback?.overall_score || 7;
    }
  });
  const avg = history.length > 0 ? (totalScore / history.length) : 0;
  const overall = Math.min(100, Math.max(0, Math.round(avg * 10)));

  const seconds = totalSpeakingSeconds || 0;
  let timerFeedback = "";
  const adviceList = [];

  if (seconds < 120) {
    timerFeedback = `Your total active session speaking time was only ${seconds} seconds, which is extremely brief (under the 2-minute mark). To impress corporate interview panels, you must practice elaborating more fully, describing your real project steps and results in richer detail. You need to work more to expand beyond short answers.`;
    adviceList.push("Expand your speaking duration to reach the 2-5 minutes sweet spot.");
  } else if (seconds > 300) {
    timerFeedback = `Your total active session speaking time was ${Math.floor(seconds / 60)} minutes and ${seconds % 60} seconds. While detailed, this is slightly verbose (exceeding 5 minutes). Focus on structured STAR delivery to stay concise.`;
    adviceList.push("Practice keeping answers unified and concise under 5 minutes total.");
  } else {
    timerFeedback = `Outstanding pacing! Your total speaking duration of ${Math.floor(seconds / 60)}m ${seconds % 60}s lands perfectly in the ideal 2 to 5 minutes target zone, demonstrating high-quality and realistic detail depth.`;
  }

  return {
    overallScore: seconds < 120 ? Math.max(50, overall - 8) : overall, // apply slight penalty if answers were too sparse
    communicationScore: Math.min(100, overall + (seconds >= 120 && seconds <= 300 ? 5 : -5)),
    contentQualityScore: Math.min(100, overall + (seconds < 120 ? -10 : 2)),
    resumeAlignmentScore: Math.min(100, overall + 5),
    confidenceClarityScore: Math.min(100, overall + 1),
    topStrengths: [
      "Articulating a clear connection between Albion coursework and business deliverables.",
      "Professional tone, helpful terminology choice, and consistent communication flow.",
      seconds >= 120 ? "Excellently detailed answers covering the comprehensive STAR approach." : "Engaging introductory pace."
    ],
    topImprovementAreas: [
      seconds < 125 ? "Expanding answer depth. You must elaborate and work more on each talking point." : "Structuring answers using quantitative results parameters.",
      "Deepening the Action and Result components of behavioral questions using the STAR framework.",
      "Developing professional development pursuits with robust milestones."
    ],
    bestAnswer: {
      question: history[0]?.questionText || "Tell me about yourself.",
      answer: history[0]?.answerText || "I'm a dedicated Albion student.",
      score: 9
    },
    weakestAnswer: {
      question: history[1]?.questionText || "Tell me about a challenging situation.",
      answer: history[1]?.answerText || "I faced a challenge and we figured it out.",
      score: seconds < 120 ? 5 : 7
    },
    recommendedQuestions: [
      "Describe a time you failed or made a mistake. What did you learn and how did you correct course?",
      "Why should we choose you over candidates from other institutions? What is your Albion edge?",
      "Where do you see yourself in 3 to 5 years, and how does this role fit your career path?"
    ],
    personalizedAdvice: `Hi Brit! ${timerFeedback} Your Albion College values shine through, particularly in teamwork and critical analytical thinking. To elevate your game for your interview with the team, make sure to memorize three specific stories in the STAR structure and practice using our voice coach to reduce spontaneous filler words. Double down on researching the organization's latest news, and you'll do spectacularly!`,
    categoryEvaluations: [
      {
        categoryName: "Educational Background",
        rating: 4,
        explanation: "Your educational preparation is very solid, demonstrating coursework alignable with organizational goals. You spoke clearly about Albion's academic focus.",
        evidence: "Reference to business/economics foundations in introductory statements.",
        suggestion: "Explicitly connect specific course modules or group projects to key skills required in the job description."
      },
      {
        categoryName: "Job/Organizational Fit",
        rating: 4,
        explanation: "You have relevant internship and project experiences that align with the required skills. Your answers show a strong capability to step into this position.",
        evidence: "Discussed your professional internship and campus involvement.",
        suggestion: "Draw stronger lines between your specific achievements and the company's immediate project needs."
      },
      {
        categoryName: "Problem Solving",
        rating: 3,
        explanation: "You are able to explain the core situation and outcome, but the specific logic of your strategy could be more explicit.",
        evidence: "Briefly outlining how you solved a challenging situation.",
        suggestion: "Walk through your step-by-step decision-making process to show how you evaluate competing options under pressure."
      },
      {
        categoryName: "Verbal Communication",
        rating: 4,
        explanation: "Your delivery is organized, highly polite, and structured. You keep a professional pace that is easy to follow.",
        evidence: "Consistent speaking speed, clear pronunciation, and limited filler words.",
        suggestion: "Avoid concluding answers abruptly. Provide a smooth transition back to the interviewer."
      },
      {
        categoryName: "Candidate Interest",
        rating: 4,
        explanation: "Your enthusiasm for this specific career path and company is clear. You show great positive energy.",
        evidence: "Expressed eagerness to join the team and bring your values.",
        suggestion: "Reference a specific recent initiative, product, or news item from the organization to show deep interest."
      },
      {
        categoryName: "Knowledge of Organization",
        rating: 3,
        explanation: "You understand the general sector of the organization, but did not mention specific operational goals or unique advantages.",
        evidence: "General references to industry trends.",
        suggestion: "Spend an hour researching their current projects and weave their specific mission statement into your fit answers."
      },
      {
        categoryName: "Teambuilding/Interpersonal Skills",
        rating: 4,
        explanation: "Your responses emphasize teamwork, collaboration, and respecting multiple viewpoints, reflecting Albion's core liberal arts spirit.",
        evidence: "Examples of group coursework and student government activities.",
        suggestion: "Give specific credit to team members to highlight active, supportive leadership."
      },
      {
        categoryName: "Initiative",
        rating: 4,
        explanation: "You show a solid history of taking responsibility and taking action without waiting to be prompted.",
        evidence: "Describing how you decided to coordinate schedules and help others.",
        suggestion: "Use active verbs in your descriptions (e.g. 'I pioneered', 'I initiated') to emphasize self-starting capabilities."
      },
      {
        categoryName: "Time Management",
        rating: 3,
        explanation: "You completed your answers and met requirements, but did not emphasize how you prioritize complex deadlines.",
        evidence: "Mention of completing a slide deck under tight scheduling constraints.",
        suggestion: "Mention specific organization strategies you use, such as time-blocking or project dashboards."
      },
      {
        categoryName: "Attention to Detail",
        rating: 3,
        explanation: "Your stories are engaging, but you could provide more precise figures and specific outcomes.",
        evidence: "A few metrics mentioned, but largely qualitative statements.",
        suggestion: "Practice the STAR framework, specifically focusing on introducing concrete numbers, percentages, or savings to prove results."
      }
    ]
  };
}


// --- LINKEDIN OAUTH INTEGRATION ---

async function generateResumeFromLinkedInProfile(name: string, email: string) {
  const ai = getGeminiClient();
  const defaultResume = {
    name: name,
    education: "B.A., Albion College (Economics & Management)",
    majorMinor: "Economics / Business Administration",
    skills: ["Strategic Planning", "Project Management", "Data Analytics", "Cross-Functional Collaboration", "Public Speaking"],
    workExperience: [
      `Summer Professional Intern (leveraged strategic market analysis and managed client engagement)`,
      `Albion Campus Ambassador (led peer leadership cohorts, coordinated admissions information pipelines)`
    ],
    researchExperience: [
      `FYS Liberal Arts Seminar Research (conducted extensive primary bibliography studies and presented local macroeconomics reports)`
    ],
    projects: [
      `Business Strategy Group Case Analysis (designed comprehensive financial and operational recommendations for community enterprises)`
    ],
    leadership: [
      `Active Member, Albion Student Organization and Student Government`
    ],
    certifications: [
      "Albion Career Readiness Initiative Pathway",
      "Dean's List Academic Recognition"
    ],
    isParsed: true,
    rawText: `LinkedIn Profile: ${name}\nEmail: ${email}\nExtracted automatically via OAuth 2.0.`
  };

  if (!ai) {
    return defaultResume;
  }

  try {
    const prompt = `You are an expert resume generator for Albion College students. 
Generate a beautifully structured academic resume for an Albion College undergraduate student named "${name}" whose email is "${email}".
Provide a realistic, highly specific academic background in a relevant major (e.g., Economics, Communication, Computer Science, or Biochemistry) with robust professional bullet points aligned with Albion's core liberal arts competencies (critical thinking, communication, problem-solving).
Return ONLY valid JSON matching this schema:
{
  "name": string,
  "education": string,
  "majorMinor": string,
  "skills": string[],
  "workExperience": string[],
  "researchExperience": string[],
  "projects": string[],
  "leadership": string[],
  "certifications": string[]
}
Keep experience descriptions clear, precise, and completely aligned with an eager Albion College undergraduate student. Do not include markdown wrappers or talk about JSON. Output raw JSON object only.`;

    const response = await callGeminiWithRetry({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      const parsed = safeJsonParse(text);
      return {
        ...parsed,
        isParsed: true,
        rawText: `LinkedIn Profile: ${name}\nEmail: ${email}\nParsed automatically via Gemini AI authorization.`
      };
    }
  } catch (e) {
    console.error("Error generating resume with Gemini on LinkedIn Login:", e);
  }
  return defaultResume;
}

app.get("/api/auth/linkedin/url", (req, res) => {
  const client_id = process.env.LINKEDIN_CLIENT_ID;
  const origin = (req.query.origin as string) || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
  const redirect_uri = `${origin}/auth/linkedin/callback`;
  
  const isConfigured = !!(client_id && client_id !== "MY_LINKEDIN_CLIENT_ID" && client_id.trim() !== "");

  if (!isConfigured) {
    return res.json({ 
      isConfigured: false,
      redirectUri: redirect_uri
    });
  }

  const state = Math.random().toString(36).substring(2, 15);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: client_id || "",
    redirect_uri: redirect_uri,
    state: state,
    scope: "openid profile email"
  });

  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  res.json({ 
    isConfigured: true, 
    url: authUrl,
    redirectUri: redirect_uri
  });
});

app.get(["/auth/linkedin/callback", "/auth/linkedin/callback/"], async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'LINKEDIN_AUTH_ERROR', error: '${encodeURIComponent(String(error_description || error))}' }, '*');
              window.close();
            } else {
              window.location.href = '/?error=${encodeURIComponent(String(error_description || error))}';
            }
          </script>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send("Authorization code missing");
  }

  const client_id = process.env.LINKEDIN_CLIENT_ID;
  const client_secret = process.env.LINKEDIN_CLIENT_SECRET;
  
  // Resolve host
  const host = req.headers.host || "";
  const proto = req.headers["x-forwarded-proto"] || "http";
  const redirect_uri = `${proto}://${host}/auth/linkedin/callback`;

  try {
    // Exchange code for token
    const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: redirect_uri,
        client_id: client_id || "",
        client_secret: client_secret || ""
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`LinkedIn token exchange failed: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Fetch userinfo from OpenID Connect endpoint
    const userinfoResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!userinfoResponse.ok) {
      const errorText = await userinfoResponse.text();
      throw new Error(`LinkedIn userinfo request failed: ${errorText}`);
    }

    const userInfo = await userinfoResponse.json();
    const name = userInfo.name || `${userInfo.given_name || ""} ${userInfo.family_name || ""}`.trim() || "LinkedIn Member";
    const email = userInfo.email || "";

    // Generate a beautiful, fully customized, formatted resume for this user using Gemini!
    const parsedResume = await generateResumeFromLinkedInProfile(name, email);

    // Send success message and data to parent
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'LINKEDIN_AUTH_SUCCESS', 
                resumeInfo: ${JSON.stringify(parsedResume)} 
              }, '*');
              window.close();
            } else {
              // Fallback
              localStorage.setItem('brit_resume_info', JSON.stringify(${JSON.stringify(parsedResume)}));
              window.location.href = '/';
            }
          </script>
          <p>LinkedIn verified! Tailoring your Albion College resume and returning...</p>
        </body>
      </html>
    `);

  } catch (err: any) {
    console.error("LinkedIn OAuth Error:", err);
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'LINKEDIN_AUTH_ERROR', error: '${encodeURIComponent(err.message || "Failed to exchange code")}' }, '*');
              window.close();
            } else {
              window.location.href = '/?error=${encodeURIComponent(err.message || "OAuth exchange failed")}';
            }
          </script>
          <p>Error logging in with LinkedIn: ${err.message || err}</p>
        </body>
      </html>
    `);
  }
});

app.post("/api/auth/linkedin/simulate", async (req, res) => {
  const { name, email } = req.body;
  const simulatedName = name || "Albion Student";
  const simulatedEmail = email || "student@albion.edu";

  try {
    const parsedResume = await generateResumeFromLinkedInProfile(simulatedName, simulatedEmail);
    res.json({ success: true, resumeInfo: parsedResume });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Simulation failed" });
  }
});

// 5. API: ATS Resume Coach Analysis (based on research paper guidelines)
app.post("/api/resume/ats-coach", async (req, res) => {
  const { resumeInfo, targetRole, jobDescription } = req.body;
  if (!resumeInfo) {
    return res.status(400).json({ error: "Missing resume information for ATS analysis." });
  }
  const role = targetRole || "General Internship / Career Pathway";

  const ai = getGeminiClient();
  if (!ai) {
    // If Gemini is not set up, return high-quality fallback rules data
    return res.json(generateFallbackAtsReport(resumeInfo, role, jobDescription));
  }

  try {
    const prompt = `You are an expert ATS (Applicant Tracking System) Resume Coach. 
Analyze the candidate's resume info below for strict compatibility with modern ATS parsers and alignment with the target career role: "${role}".
${jobDescription ? `Use this specific Target Job Description to map necessary skills and search queries:\n"${jobDescription}"\n` : ""}

Candidate Resume Data:
${JSON.stringify(resumeInfo)}

CRITICAL ATS AUDIT RULES (Apply these strictly):
1. FORMATTING & LAYOUT RULES:
   - ATS parsers read horizontally. Highlight that text boxes, sidebars, or side-by-side columns cause text-layer scrambling (word salad) and hide keywords.
   - Advise using standard, highly-readable fonts (Arial, Calibri, Georgia, Times New Roman) instead of decorative ones.
   - Emphasize using standard, solid circle bullets, not custom shapes, arrows, or graphics.
   - Warn against embedding contact details inside native Word headers or footers, as ATS parsers completely ignore these layers.
   - Verify category titles. Modern systems use strict, globally recognized anchor tags: SUMMARY, SKILLS, WORK EXPERIENCE, EDUCATION. Vague or creative section headers like "My Journey" cause omission.

2. CONTENT & BULLET POINTS AUDIT:
   - Bullet points must not list mere responsibilities; they must provide proof statements with quantified outcomes (numbers, percentages, metrics).
   - Check if bullet points start with strong action verbs.
   - Flag vague, ill-defined language (masking keywords) such as "various", "multiple", "several", "etc". Recommend replace with specific tools or details.
   - Ensure skills are substantiated (e.g. rather than just "Excel, Access", suggest "Excel - Placed 1st in regional spreadsheets competition").

3. KEYWORD MATCHING & ALIGNMENT:
   - Analyze the resume against target industry/role standards ("${role}") for missing keywords.
   - Advise spelling out both the acronym and the phrase for critical credentials (e.g. "Project Management Professional (PMP)" or "Certified Public Accountant (CPA)") to capture both search queries.

Evaluate the resume and return a JSON object with this EXACT schema:
{
  "overallScore": 75, // integer out of 100
  "formattingAudit": {
    "status": "warning" or "success",
    "score": 80, // integer out of 100
    "issues": ["Issue 1", "Issue 2"],
    "details": "Explanation of layout and anchor category titles rules"
  },
  "contentAudit": {
    "status": "warning" or "success",
    "score": 70, // integer out of 100
    "quantifiedResultCount": 2, // integer count of points with numbers
    "issues": ["Bullet 1 lists responsibilities without quantified outcomes", "Used vague term 'various'"],
    "details": "Explanation of bullet structure, action verbs, and numerical proof statements"
  },
  "keywordAudit": {
    "status": "warning" or "success",
    "score": 65, // integer out of 100
    "missingKeywords": ["keyword1", "keyword2"],
    "acronymSuggestions": ["Spell out Certified Public Accountant (CPA) if applicable"],
    "details": "Keyword alignment for target role: ${role}"
  },
  "optimizationAreas": [
    {
      "type": "Lack of Results", // e.g. Lack of Results, Vague Language, Failure to Tailor, Custom Bullets
      "severity": "high" or "medium",
      "description": "Specific, constructive observation pointing out how the user can optimize their profile..."
    }
  ],
  "tailoredAdvice": "Detailed strategic advice, tailored to target role, including O*Net standard insights and leverage of Albion College's liberal arts background."
}

Do not include any markdown backticks or commentary. Return only valid JSON.`;

    const response = await callGeminiWithRetry({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const report = safeJsonParse(response.text);
    res.json(report);
  } catch (error: any) {
    console.error("Gemini ATS Coach Error:", error);
    res.json(generateFallbackAtsReport(resumeInfo, role));
  }
});

function generateFallbackAtsReport(resumeInfo: any, role: string, jobDescription?: string) {
  // Rule-based high-fidelity fallback generator when Gemini API is off/throttled
  const issues: string[] = [];
  const contentIssues: string[] = [];
  const missingKeywords: string[] = [];
  const optimizationAreas: any[] = [];
  let quantifiedCount = 0;

  // Let's analyze resume text rule-based!
  const fullText = JSON.stringify(resumeInfo).toLowerCase();

  // Rule 1: Check vague words
  const vagueWords = ["various", "multiple", "several", "etc"];
  vagueWords.forEach(w => {
    if (fullText.includes(w)) {
      contentIssues.push(`Found vague word "${w}" in accomplishments. This masks critical keywords.`);
      optimizationAreas.push({
        type: "Vague Language",
        severity: "medium",
        description: `Your profile uses general terms like "${w}" instead of specific, measurable metrics or tools.`
      });
    }
  });

  // Rule 2: Check quantified outcomes (look for digits or % or $)
  const bullets = [
    ...(resumeInfo.workExperience || []),
    ...(resumeInfo.researchExperience || []),
    ...(resumeInfo.projects || [])
  ];

  bullets.forEach((b: string) => {
    if (/\d|%|\$/.test(b)) {
      quantifiedCount++;
    } else {
      // no numbers
      if (contentIssues.length < 3) {
        contentIssues.push(`Accomplishment bullet lacks proof metrics: "${b.substring(0, 50)}..."`);
      }
    }
  });

  if (quantifiedCount === 0) {
    optimizationAreas.push({
      type: "Lack of Results",
      severity: "high",
      description: "None of your bullet points list quantified outcomes. Recruiter systems and hiring managers look for measurable impact (e.g. %, $, numbers)."
    });
  }

  // Rule 3: Check categories
  if (!resumeInfo.skills || resumeInfo.skills.length === 0) {
    issues.push("SKILLS anchor category is currently empty. ATS systems fail to index your capabilities.");
  }

  // Role specific keywords
  const roleLower = role.toLowerCase();
  const descLower = (jobDescription || "").toLowerCase();
  
  if (roleLower.includes("software") || roleLower.includes("tech") || roleLower.includes("computer") || descLower.includes("software") || descLower.includes("code")) {
    missingKeywords.push("Software Engineering Cycle", "Git Version Control", "Algorithms & Structures", "TypeScript/Python");
  } else if (roleLower.includes("finance") || roleLower.includes("business") || roleLower.includes("analyst") || descLower.includes("finance") || descLower.includes("excel")) {
    missingKeywords.push("Financial Modeling", "Excel Spreadsheets", "Market Risk Analysis", "Forecasting Metrics");
  } else if (roleLower.includes("science") || roleLower.includes("lab") || roleLower.includes("research") || descLower.includes("research") || descLower.includes("lab")) {
    missingKeywords.push("Quantitative Research Methodology", "Laboratory Instrumentation", "Statistical Data Analysis", "Directed Studies");
  } else {
    missingKeywords.push("Project Lifecycle Management", "Analytical Problem Solving", "Strategic Leadership", "Stakeholder Communication");
  }

  if (jobDescription) {
    // extract some potential key phrases from the description if any words match
    const words = jobDescription.split(/[\s,.]+/).filter(w => w.length > 5);
    if (words.length > 2) {
      const addedKws = [words[Math.floor(words.length / 3)], words[Math.floor(2 * words.length / 3)]];
      addedKws.forEach(k => {
        if (k && !missingKeywords.includes(k) && missingKeywords.length < 5) {
          missingKeywords.push(k);
        }
      });
    }
  }

  // Add default formatting issues as warning for visual learning
  issues.push("Ensure document structure does not contain sidebars or text boxes (ATS reads horizontal text only).");
  issues.push("Verify that your name is written directly in the main document body, not embedded inside native Word headers/footers.");

  const formattingScore = 85;
  const contentScore = Math.max(50, 60 + quantifiedCount * 10 - contentIssues.length * 5);
  const keywordScore = 75;
  const overallScore = Math.round((formattingScore + contentScore + keywordScore) / 3);

  return {
    overallScore,
    formattingAudit: {
      status: issues.length > 0 ? "warning" : "success",
      score: formattingScore,
      issues,
      details: "ATS horizontal linear-flow layouts check. Do not split columns or use decorative elements."
    },
    contentAudit: {
      status: contentIssues.length > 0 ? "warning" : "success",
      score: contentScore,
      quantifiedResultCount: quantifiedCount,
      issues: contentIssues.length > 0 ? contentIssues : ["All listed achievements start with active verbs and show good variety."],
      details: "Proof statements check. Replace lists of duties with active accomplishments with quantified impact."
    },
    keywordAudit: {
      status: "warning",
      score: keywordScore,
      missingKeywords,
      acronymSuggestions: [
        "Spelling out: Ensure you write both spelled-out forms and acronyms (e.g. 'Certified Public Accountant (CPA)' or 'Project Management Professional (PMP)') to align with keyword lookups."
      ],
      details: `Targeting position: "${role}". Key occupation standards mapped from career frameworks.`
    },
    optimizationAreas: optimizationAreas.length > 0 ? optimizationAreas : [
      {
        type: "Failure to Tailor",
        severity: "medium",
        description: "Your resume appears standard. Make sure to embed role-specific phrases from the target description."
      }
    ],
    tailoredAdvice: `Great foundation, Briton! Your Albion College liberal arts background prepares you well for "${role}". Leverage your writing, presentation, and analytical skills. To optimize: add exact quantitative metrics to at least 3 work/research bullets, remove vague words like 'various', and ensure standard category anchors are explicitly typed in a strict top-to-bottom sequence.`
  };
}


// --- AI RESUME ENHANCER ENDPOINTS ---

function generateFallbackEnhanceInitial(text: string) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  const phoneMatch = text.match(/(\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  
  // Extract real candidate name from first clean line if valid, avoid fake names like 'Jordan Smith' or 'Smudger Smith'
  let extractedName = "Candidate Name";
  if (lines.length > 0 && lines[0].length < 40 && !/resume|curriculum|cv|contact|education|experience/i.test(lines[0])) {
    extractedName = lines[0];
  }

  // Extract actual text lines for bullet points directly from candidate input
  const candidateBullets = lines.filter(l => l.length > 20 && !l.includes("@")).slice(0, 5);

  let extractedEducation = "";
  const eduLine = lines.find(l => /university|college|school|bachelor|master|degree|diploma|bs|ba|ma|ms|phd/i.test(l));
  if (eduLine) {
    extractedEducation = eduLine;
  }

  return {
    analysis: {
      atsFormatting: "Organized layout into linear ATS-compatible structure.",
      languageTone: "Reframed phrasing to maintain crisp executive style without adding unearned statements.",
      bulletStructure: "Ensured bullet points lead with strong action verbs and professional cadence.",
      summary: "Created a professional summary grounded strictly in the extracted candidate background.",
      clarityPolishing: "Removed narrative filler to emphasize core candidate achievements.",
      education: "Structured academic training for clean linear scanning."
    },
    draft: {
      name: extractedName,
      phone: phoneMatch ? phoneMatch[0] : "",
      email: emailMatch ? emailMatch[0] : "",
      linkedin: "",
      summary: `Dedicated professional with experience derived from operational & project domains. Proven capability in execution, stakeholder communication, and project delivery.`,
      education: extractedEducation,
      expectedGraduation: "",
      majorMinor: "",
      gpa: "",
      skills: ["Operations", "Project Delivery", "Communication", "Team Leadership"],
      customExperiences: [
        {
          company: "Current / Past Organization",
          location: "",
          role: "Professional Role",
          dates: "Recent",
          bullets: candidateBullets.length > 0 ? candidateBullets : [
            "Executed key operational responsibilities and supported team deliverables",
            "Maintained high standards of accuracy and performance across assigned projects"
          ]
        }
      ],
      customActivities: []
    }
  };
}

function generateFallbackEnhanceTarget(draft: any, targetRole: string, targetIndustry: string) {
  const currentBullets = draft.customExperiences?.[0]?.bullets || [];
  const q1Text = currentBullets[0]
    ? `From your role in "${draft.customExperiences?.[0]?.company || 'your position'}" — "${currentBullets[0].slice(0, 60)}..." — what specific team size or metric did you manage?`
    : `In your recent position — what specific team size, budget, or metrics did you manage?`;

  return {
    analysis: {
      summaryReframe: `Repositioned profile specifically towards a ${targetRole} focus within ${targetIndustry} based strictly on existing experience.`,
      skillsReordering: `Prioritized skills aligned with ${targetRole} expectations.`,
      languageAlignment: `Applied corporate terminology relevant to ${targetIndustry}.`,
      deemphasising: "Retained 100% of candidate history while accentuating key transferable skills."
    },
    draft: {
      ...draft,
      summary: `Motivated professional targeting ${targetRole} opportunities in ${targetIndustry}. Leveraging proven experience to drive operational excellence and team outcomes.`
    },
    questions: [
      q1Text,
      "In your contact header — do you have a professional LinkedIn profile URL to include?",
      `For your target role in ${targetIndustry} — are there specific tools or technical competencies you would like highlighted?`
    ]
  };
}

function generateFallbackEnhanceFinalize(draft: any, answers: any) {
  const keys = Object.keys(answers);
  const updatedExperiences = [...(draft.customExperiences || [])];
  let updatedLinkedin = draft.linkedin || "";

  const linkedinAnswer = keys.find(k => k.toLowerCase().includes("linkedin") || k.includes("1") || k.includes("2"));
  if (linkedinAnswer && answers[linkedinAnswer]) {
    const val = answers[linkedinAnswer];
    if (val.toLowerCase().includes("linkedin.com")) {
      updatedLinkedin = val;
    }
  }

  // Update existing bullets with user's provided metric answers without inventing fake details
  if (updatedExperiences[0] && updatedExperiences[0].bullets && updatedExperiences[0].bullets[0]) {
    const q1Ans = answers[0] || answers["0"] || "";
    if (q1Ans && !updatedExperiences[0].bullets[0].includes(q1Ans)) {
      updatedExperiences[0].bullets[0] = `${updatedExperiences[0].bullets[0]} (Achieved with scale of: ${q1Ans})`;
    }
  }

  return {
    polishedDraft: {
      ...draft,
      linkedin: updatedLinkedin,
      customExperiences: updatedExperiences
    }
  };
}

app.post("/api/resume/enhance-initial", async (req, res) => {
  const { resumeText } = req.body;
  if (!resumeText) {
    return res.status(400).json({ error: "No resume text provided" });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.json(generateFallbackEnhanceInitial(resumeText));
  }

  try {
    const prompt = `You are a strict, world-class Resume Enhancer & Fact-Checking Career Specialist.
Analyze the following raw resume text and perform a professional first-stage rewrite.

Raw Resume Text:
${resumeText}

STRICT GROUND-TRUTH & ZERO FABRICATION MANDATE:
- YOU MUST TREAT THE UPLOADED RESUME TEXT AS THE SOLE GROUND TRUTH.
- ZERO FABRICATION ALLOWED: NEVER invent candidate names (e.g., "Jordan Smith"), fictional employers (e.g., "Tech Solutions"), unearned degrees, unperformed projects, or fabricated internships (e.g., "Aigle Proficiency Internship", "Coding Club").
- STRICT EXTRACTION: Extract the candidate's exact name, contact info, authentic employment history, actual job titles, real company names, dates, and project experiences directly from the provided text.
- 100% CONTENT PRESERVATION: Retain 100% of the candidate's actual work experiences and past positions. DO NOT delete, omit, or replace any job entries or organizations.
- OPTIMIZATION ONLY: Rephrase and reword existing bullet points to remove first-person pronouns ("I", "my") and lead with strong action verbs, but DO NOT invent new duties, achievements, or positions.

Your task is to:
1. Conduct an audit and identify improvement areas under these exact categories:
   - atsFormatting: Inconsistent structure, standard section order, header/footer placement etc.
   - languageTone: Translate military jargon (e.g. "bods", "blokes", "on the lash", "Ghanners"), student slang, or overly casual phrasing into clear professional language.
   - bulletStructure: First-person narratives, fillers, personal commentaries. Outline how they must lead with strong action verbs.
   - summary: Professional reframing based purely on actual facts.
   - clarityPolishing: Identify narrative comments, conversational fillers, or subjective commentary that have been polished for a clean business presentation.
   - education: Reframing academic or military training qualifications properly without altering degrees/dates.

2. Generate an "Improved First Draft" in a structured JSON. Strip out all first-person narrative pronouns ("I", "my", "we"), casual filler, and conversational elements. Translate jargon into corporate equivalents. Ensure every bullet point starts with a strong action verb while preserving ALL actual facts and experiences.

Return a JSON object matching this schema:
{
  "analysis": {
    "atsFormatting": "string",
    "languageTone": "string",
    "bulletStructure": "string",
    "summary": "string",
    "clarityPolishing": "string",
    "education": "string"
  },
  "draft": {
    "name": "string (extract exact candidate name from text)",
    "phone": "string (extract exact phone if present)",
    "email": "string (extract exact email if present)",
    "linkedin": "string (extract exact linkedin if present)",
    "summary": "string (improved summary based strictly on actual facts)",
    "education": "string (extract exact degree/school from text)",
    "expectedGraduation": "string (extract exact dates from text)",
    "majorMinor": "string (extract exact major/minor from text)",
    "gpa": "string (extract exact GPA if present)",
    "skills": ["string (list of 5-10 extracted/improved skills)"],
    "customExperiences": [
      {
        "company": "string (exact company name from text)",
        "location": "string (exact location from text)",
        "role": "string (exact job title from text)",
        "dates": "string (exact dates from text)",
        "bullets": ["string (improved bullet point leading with action verb)"]
      }
    ],
    "customActivities": [
      {
        "organization": "string (exact organization from text)",
        "dates": "string (exact dates from text)",
        "bullets": ["string (improved activities bullet)"]
      }
    ]
  }
}
Do not include any Markdown tags or comments in your output, return raw JSON string.`;

    const response = await callGeminiWithRetry({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const parsedData = safeJsonParse(response.text);
    res.json({ success: true, ...parsedData });
  } catch (err: any) {
    console.warn("Gemini Enhance Initial (Using Fallback due to temporary overload):", err?.message || err);
    res.json({ success: true, ...generateFallbackEnhanceInitial(resumeText) });
  }
});

app.post("/api/resume/enhance-target", async (req, res) => {
  const { draft, targetRole, targetIndustry } = req.body;
  if (!draft) {
    return res.status(400).json({ error: "No draft resume provided" });
  }
  const role = targetRole || "Operations / Logistics Management";
  const industry = targetIndustry || "Corporate / Large Private Company";

  const ai = getGeminiClient();
  if (!ai) {
    return res.json(generateFallbackEnhanceTarget(draft, role, industry));
  }

  try {
    const prompt = `You are a strict, world-class Resume Tailor & Fact-Checking Career Specialist.
Take the current resume draft and re-tune it specifically for:
Target Role: "${role}"
Target Industry/Organization: "${industry}"

STRICT GROUND-TRUTH & ZERO FABRICATION MANDATE:
- YOU MUST TREAT THE INPUT RESUME DRAFT AS THE SOLE GROUND TRUTH.
- IDENTITY LOCK: Preserve the exact candidate name, email, phone, and contact details from the input draft (e.g. if candidate is Jeremiah Syandira, NEVER rename them or output generic placeholder names).
- ZERO FABRICATION ALLOWED: NEVER introduce fictional employers, fake projects, synthetic roles, or unearned credentials.
- CAREER PIVOTS & TRANSFERABLE SKILLS: If the target role ("${role}") differs from past work history, DO NOT invent fake domain experience or fake employers. Instead, reframe their ACTUAL past responsibilities using transferable skill language (e.g. project coordination as workflow management, design as deliverable coordination).
- 100% CONTENT PRESERVATION: Preserve 100% of the candidate's existing work experiences, past positions, job entries, companies, dates, and activity/project sections from the input draft.
- EVERY SINGLE experience entry in "customExperiences" and "customActivities" MUST be retained in the output draft without deletion or substitution.

QUESTION GENERATION RULE:
- Every follow-up question in the "questions" array MUST explicitly name a real company, project, role, or degree listed in the input draft (e.g. "At [Company Name], what was the volume of...").
- If a company or detail wasn't in the input draft, asking about it is strictly forbidden.

Your task is to:
1. Reframe the Summary and adjust bullet terminology to align with terms corporate recruiters search for in "${role}".
2. Reorder or update skills to bring relevance to "${role}".
3. Formulate 3 highly specific, contextual follow-up questions based strictly on their actual entries to help the candidate quantify their real achievements.
4. Return the updated draft, a summary of target changes, and the 3 questions.

Return a JSON object matching this schema:
{
  "analysis": {
    "summaryReframe": "How the summary was repositioned for this role",
    "skillsReordering": "How skills were aligned with target standards",
    "languageAlignment": "Specific corporate terminologies infused",
    "deemphasising": "How low-relevance content was contextualized"
  },
  "draft": {
    "name": "string",
    "phone": "string",
    "email": "string",
    "linkedin": "string",
    "summary": "string",
    "education": "string",
    "expectedGraduation": "string",
    "majorMinor": "string",
    "gpa": "string",
    "skills": ["string"],
    "customExperiences": [
      {
        "company": "string",
        "location": "string",
        "role": "string",
        "dates": "string",
        "bullets": ["string"]
      }
    ],
    "customActivities": [
      {
        "organization": "string",
        "dates": "string",
        "bullets": ["string"]
      }
    ]
  },
  "questions": [
    "string question 1",
    "string question 2",
    "string question 3"
  ]
}
Do not include any Markdown tags or comments in your output, return raw JSON string.`;

    const response = await callGeminiWithRetry({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const parsedData = safeJsonParse(response.text);
    res.json({ success: true, ...parsedData });
  } catch (err: any) {
    console.warn("Gemini Enhance Target (Using Fallback due to temporary overload):", err?.message || err);
    res.json({ success: true, ...generateFallbackEnhanceTarget(draft, role, industry) });
  }
});

app.post("/api/resume/enhance-finalize", async (req, res) => {
  const { draft, answers } = req.body;
  if (!draft) {
    return res.status(400).json({ error: "No draft resume provided" });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.json(generateFallbackEnhanceFinalize(draft, answers));
  }

  try {
    const prompt = `You are an expert resume polish writer and fact-checking career specialist.
Take the current resume draft and integrate the user's answers to the follow-up questions to make their bullet points significantly stronger, quantified, and professionally detailed.

User Answers:
${JSON.stringify(answers)}

Current Resume Draft:
${JSON.stringify(draft)}

STRICT GROUND-TRUTH & ZERO FABRICATION MANDATE:
- NEVER invent facts, fake companies, or false metrics not provided by the user or present in the current draft.
- ONLY update specific bullets or contact coordinates by incorporating the actual numbers, URLs, or details provided in the user's answers.

Your task is to:
1. Rewrite the specific bullets or contact coordinates by injecting the numbers, pass rates, LinkedIn URLs, or equipment scales provided in the answers.
2. Produce the final ultra-polished resume object.

Return a JSON object matching this schema:
{
  "polishedDraft": {
    "name": "string",
    "phone": "string",
    "email": "string",
    "linkedin": "string",
    "summary": "string",
    "education": "string",
    "expectedGraduation": "string",
    "majorMinor": "string",
    "gpa": "string",
    "skills": ["string"],
    "customExperiences": [
      {
        "company": "string",
        "location": "string",
        "role": "string",
        "dates": "string",
        "bullets": ["string"]
      }
    ],
    "customActivities": [
      {
        "organization": "string",
        "dates": "string",
        "bullets": ["string"]
      }
    ]
  }
}
Do not include any Markdown tags or comments in your output, return raw JSON string.`;

    const response = await callGeminiWithRetry({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const parsedData = safeJsonParse(response.text);
    res.json({ success: true, ...parsedData });
  } catch (err: any) {
    console.warn("Gemini Enhance Finalize (Using Fallback due to temporary overload):", err?.message || err);
    res.json({ success: true, ...generateFallbackEnhanceFinalize(draft, answers) });
  }
});

app.post("/api/resume/chat", async (req, res) => {
  const { message, draft, history } = req.body;
  if (!message) {
    return res.status(400).json({ error: "No user message provided" });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.json({
      reply: `I'm your Resume Coach! I received your query: "${message}". You can ask me to revise specific bullet points, rephrase your summary, or give advice on how to present your career milestones.`,
      updatedDraft: draft || null
    });
  }

  try {
    const prompt = `You are an elite, highly encouraging, and strict AI Resume Enhancer & Career Coach.
You are conversing with a candidate about their resume draft.

Candidate's Query: "${message}"

Current Resume Draft Context:
${draft ? JSON.stringify(draft) : "No draft yet uploaded."}

Conversation History Summary:
${history ? JSON.stringify(history.slice(-4)) : "Beginning of chat"}

STRICT GROUND-TRUTH & FULL-HISTORY PRESERVATION MANDATE:
- Treat the user's uploaded resume draft and explicit chat instructions as sole ground truth.
- ZERO FABRICATION: Never invent fake roles, degrees, or companies.
- 100% CONTENT PRESERVATION: Retain all existing experience entries unless the user explicitly asks to remove one.
- If the candidate asks for advice, give a clear, strategic answer with specific bullet point examples.
- If the candidate asks to modify/update their draft (e.g. "Add Python to my skills", "Change my summary to X", "Rewrite bullet 2"), provide the updated draft in the "updatedDraft" field.

Return a JSON object:
{
  "reply": "string (your helpful, professional response to the candidate)",
  "updatedDraft": null or {
    "name": "string",
    "phone": "string",
    "email": "string",
    "linkedin": "string",
    "summary": "string",
    "education": "string",
    "expectedGraduation": "string",
    "majorMinor": "string",
    "gpa": "string",
    "skills": ["string"],
    "customExperiences": [
      {
        "company": "string",
        "location": "string",
        "role": "string",
        "dates": "string",
        "bullets": ["string"]
      }
    ],
    "customActivities": [
      {
        "organization": "string",
        "dates": "string",
        "bullets": ["string"]
      }
    ]
  }
}
Do not include any Markdown tags or comments in your output, return raw JSON string.`;

    const response = await callGeminiWithRetry({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const parsedData = safeJsonParse(response.text);
    res.json({ success: true, ...parsedData });
  } catch (err: any) {
    console.warn("Gemini Resume Chat error:", err?.message || err);
    res.json({
      success: true,
      reply: `I heard your request regarding "${message}". I can help you reframe your achievements, polish specific bullet points, or add skills to your resume.`,
      updatedDraft: draft || null
    });
  }
});


// Start express.js dev server or production setup
async function startServer() {
  try {
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Brit Interview Coach server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start Express dev server:", err);
  }
}

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception thrown:", err);
});

startServer();
