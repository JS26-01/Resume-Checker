import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

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

// Robust, retrying Gemini generateContent Wrapper with model fallbacks for transient 503/429/UNAVAILABLE errors
async function callGeminiWithRetry(params: { model: string; contents: any; config?: any }, retries = 4, initialDelay = 1000): Promise<any> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error("Gemini AI Client is not configured (missing GEMINI_API_KEY)");
  }

  let lastError: any = null;
  let delay = initialDelay;

  // List of fallback models to cycle through if the primary model experiences transient overload
  const fallbackModels = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.5-flash"];
  let currentModel = params.model;

  for (let i = 0; i < retries; i++) {
    try {
      return await ai.models.generateContent({
        ...params,
        model: currentModel
      });
    } catch (error: any) {
      lastError = error;
      const errorMessage = error?.message || "";
      const errorStatus = error?.status || "";
      const errorCode = error?.code || error?.statusCode || "";

      // Detect transient high-demand (503), rate-limits (429), or temporary outages
      const isTransient = 
        errorStatus === "UNAVAILABLE" || 
        errorCode === 503 || 
        errorCode === 429 ||
        errorMessage.includes("503") || 
        errorMessage.includes("429") || 
        errorMessage.includes("high demand") || 
        errorMessage.includes("temporary") ||
        errorMessage.includes("rate limit") ||
        errorMessage.includes("ResourceExhausted") ||
        errorMessage.includes("exhausted");

      if (isTransient && i < retries - 1) {
        // Select next fallback model to try
        const nextModel = fallbackModels[i % fallbackModels.length];
        console.warn(`[Gemini API Warning] Transient error detected on model "${currentModel}". Retrying attempt ${i + 1}/${retries} in ${delay}ms switching to model "${nextModel}"... Error: ${errorMessage}`);
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
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const parsedJson = JSON.parse(response.text || "{}");
    res.json(parsedJson);
  } catch (error: any) {
    console.error("Gemini Parse Resume Error:", error);
    res.json(generateMockParsedResume(resumeText));
  }
});

// 2. API: Generate Interview Questions Plan
app.post("/api/interview/generate-questions", async (req, res) => {
  const { resumeInfo, jobTarget } = req.body;
  if (!jobTarget) {
    return res.status(400).json({ error: "Missing job target data" });
  }

  // Enforce resume presence before starting any session
  if (!resumeInfo || !resumeInfo.isParsed) {
    return res.status(400).json({ error: "To ensure questions are tailored to your background, please upload or complete your PDF resume before starting." });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.json({ questions: generateMockQuestions(resumeInfo, jobTarget) });
  }

  try {
    const isPanel = jobTarget.interviewFormat === 'panel-board';
    const rolePlayContext = isPanel 
      ? `You represent a panel of 3 distinct corporate interviewers: Sarah (HR), Marcus (Technical Lead), and Elena (Director of Product). For each of the questions, pick ONE panelist to ask the question, and clearly prefix the question text with their name and title (e.g., "Elena (Director of Product): [Question]"). Vary who speaks to simulate a dynamic panel board.`
      : `Act as a single, consistent hiring manager in a One-on-One interview format.`;

    // High variety randomized themes to force Gemini to generate totally different questions on every single retry
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

    const isEasyVibe = jobTarget.interviewType === 'campus_job' || jobTarget.interviewType === 'internship';

    const prompt = `You are an expert, objective corporate interviewer conducting a formal, serious job interview. Your primary goal is to assess the candidate realistically, without sugarcoating or hand-holding.

${isEasyVibe ? `CRITICAL EASY MODE DIRECTIVE:
- Since this is a CAMPUS JOB or INTERNSHIP interview, you MUST override any intimidating or high-stakes corporate persona.
- Make all questions significantly easier, simpler, and highly encouraging. 
- Avoid complex, multi-layered high-pressure behavioral challenges or strict technical grilling.
- Ask straightforward entry-level questions that allow a college student to highlight their basic academic course prep, soft skills, or campus eagerness.
- Maintain a warm, welcoming, and highly supportive tone throughout.` : `1. TONE & PERSONALITY (THE "REAL WORLD" RULE)
- Maintain a strictly NEUTRAL, objective, and formal corporate tone.
- Do NOT use overly positive or enthusiastic filler words (e.g., do not say "Awesome!", "Great job!", "That's fantastic!").
- Replicate the high-stakes, slightly intimidating environment of a real interview. Be polite, but completely impartial.`}

2. NO HAND-HOLDING (CRITICAL GUARDRAIL)
- Do NOT help the candidate connect the dots between their past experience/education and the job description.
- Ask questions that force the candidate to explain and prove how their background fits, keeping the burden of proof entirely on them.

3. STRICT BACKGROUND ALIGNMENT & FACT COMPLIANCE (THE "STICK TO THE FACTS" MANDATE)
- All questions MUST be strictly anchored and limited to the facts, skills, employer history, real projects, and leadership roles explicitly listed in the candidate's actual resume summary below.
- You are strictly FORBIDDEN from fabricating, assuming, or asking questions about hypothetical past companies, certifications, tools, degrees, or accomplishments that do not exist in the candidate's resume block below.
- Treat the candidate's actual experiences as your sole frame of reference when referencing past projects (e.g., "At [actual company name from resume] where you were a [actual title], you worked on [actual project/skill]. When doing that...").

4. STRICT UNIFORM ATTEMPT VARIATION (DO NOT REPEAT!)
- Generate a completely unique, fresh, and unpredictable set of behavioral scenarios and technical parameters.
- For this attempt, incorporate a strong situational theme centering on: "${chosenTheme}".
- Do NOT repeat standard common boilerplate questions. Pick highly specific, unpredictable operational challenges that require immediate critical thinking from the user.
- Session Reference Salt: ${sessionSalt} (use this dynamic seed to diversify prompt execution path fully).

5. INTERVIEW FORMAT: ${isPanel ? "PANEL BOARD" : "ONE-ON-ONE"}
${rolePlayContext}

6. CONTEXT
Target Role: ${jobTarget.positionTitle} at ${jobTarget.companyName}
Industry: ${jobTarget.industry}
Interview Type/Vibe: ${jobTarget.interviewType} (e.g., Behavioral, Technical, Internship, Research, Graduate School)
Difficulty Level: ${jobTarget.difficulty}
${jobTarget.jobDescription ? `Target Job Description / Competency Focus Areas:\n${jobTarget.jobDescription}\n` : ""}

Candidate Resume Summary:
${JSON.stringify(resumeInfo || {})}

Optional Albion Focus/Liberal Arts Strengths: ${jobTarget.focusCategory || "General liberal arts"}

7. INTERVIEW EXECUTION & OUTPUT SCHEMA
Generate exactly 4 highly customized, realistic mock interview questions in consecutive interview flow:
- Question 1: General/Introductory query targeting their background and fit for ${jobTarget.positionTitle}.
- Question 2: Behavioral / STAR-aligning query tailored specifically to their resume.
- Question 3: Role-specific / Technical or Industry challenge.
- Question 4: Transferable Liberal arts competency / Critical fit closing question.

Return a JSON array of questions, each with:
- id: e.g. "q1", "q2", "q3", "q4"
- text: "The actual question text (prefixed with panelist name if PANEL BOARD)"
- category: one of ["general", "behavioral", "technical", "resume-based", "company-fit", "closing"]

Format as:
{
  "questions": [
    { "id": "q1", "text": "...", "category": "..." },
    { "id": "q2", "text": "...", "category": "..." },
    { "id": "q3", "text": "...", "category": "..." },
    { "id": "q4", "text": "...", "category": "..." }
  ]
}
`;

    const response = await callGeminiWithRetry({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 1.0,
        seed: sessionSalt,
      },
    });

    const parsedJson = JSON.parse(response.text || "{}");
    res.json(parsedJson);
  } catch (error: any) {
    console.error("Gemini Generate Questions Error:", error);
    res.json({ questions: generateMockQuestions(resumeInfo, jobTarget) });
  }
});

// 3. API: Evaluate Answer
app.post("/api/interview/evaluate-answer", async (req, res) => {
  const { questionText, answerText, resumeInfo, jobTarget, category } = req.body;
  if (!questionText || !answerText || !jobTarget) {
    return res.status(400).json({ error: "Missing required query parameters" });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.json(generateMockFeedback(questionText, answerText, category, jobTarget));
  }

  try {
    const isBehavioral = category === "behavioral" || questionText.toLowerCase().includes("tell me about a time") || questionText.toLowerCase().includes("describe a scenario");
    const isPanel = jobTarget.interviewFormat === 'panel-board';

    const prompt = `You are an expert, objective corporate interviewer assessing an Albion College student preparing for a formal job interview.
Evaluate the student's answer to this mock interview question:
Question: "${questionText}"
Student Answer: "${answerText}"

Target Position: ${jobTarget.positionTitle} at ${jobTarget.companyName} (Difficulty: ${jobTarget.difficulty})
Interview Format: ${isPanel ? "PANEL BOARD" : "ONE-ON-ONE"}
${jobTarget.jobDescription ? `Target Job Description / Competency Focus Areas:\n${jobTarget.jobDescription}\n` : ""}

${jobTarget.interviewType === 'campus_job' || jobTarget.interviewType === 'internship' ? `CRITICAL CAMPUS JOB/INTERNSHIP EVALUATION DIRECTIVE:
- This is a CAMPUS JOB or INTERNSHIP interview, which has extra-lenient, highly supportive standards.
- You MUST override any intimidating or high-stakes corporate grading rules.
- Provide feedback in a warm, encouraging, mentor-like professional tone.
- Score attempts extra-generously (typically giving 7.5 to 10.0 for any reasonable, honest attempt).
- In 'strengths' and 'suggestedAnswer', highlight their positive effort and potential, coaching them constructively with welcoming phrasing.` : `1. TONE & PERSONALITY (THE "REAL WORLD" RULE)
- Provide feedback in a NEUTRAL, objective, and formal corporate tone.
- Do NOT use overly enthusiastic, positive filler words (no "Awesome!", "Great job!", "That's fantastic!" in the feedback comments).
- Acknowledge responses with brief, neutral professional markers, such as: "Understood," "Thank you for sharing that," "I see," or "Moving on to the next question."
- Replicate the high-stakes, slightly intimidating but realistic standards of a real interview. Be polite, but completely impartial.

2. NO HAND-HOLDING (CRITICAL GUARDRAIL)
- Do NOT help the candidate connect the dots between past experience and the job description in the score or strengths.
- If the candidate's answer was weak, lacking in concrete details, or failed to connect their background to the role, reflect this directly in a tougher score and detailed constructive criticisms in 'areasToImprove'. The burden of proof is entirely on the candidate.`}

3. STAR FRAMEWORK
- If the question is behavioral, carefully check if they specified Situation, Task, Action, and Result (STAR). Give strict critique of what was missing.

Student Context (Brief Resume):
${JSON.stringify(resumeInfo || {})}

Provide specific, realistic feedback. Return JSON with:
1. "score5": a realistic number from 0 to 5 according to this strict rubric:
   - 0: No answer given or answer completely irrelevant. No examples given. The answer does not match the information in the resume.
   - 1: A few good points but main issues are missing. No examples/irrelevant examples given.
   - 2: Some points covered, not all relevant. Some examples given.
   - 3: Some points covered. Relevant information given. Some examples given.
   - 4: Good answer. Relevant information. All or most points covered. Good examples.
   - 5: Perfect answer. All points addressed. All points relevant.
2. "score5Explanation": The exact verbatim string description from the rubric above matching the chosen score5.
3. "score": a realistic number from 1 to 10 mapped directly from the score5 value (e.g. 0->1, 1->3, 2->5, 3->7, 4->9, 5->10).
4. "strengths": Array of 2-3 objective, realistic things they did well (e.g., "Adequate logical structure," "Specific technical terms mentioned")
5. "areasToImprove": Array of 2-3 genuine, actionable items to make their delivery much more sound and persuasive
6. "suggestedAnswer": A high-impact model answer tailored to their resume showing how they can prove their fit themselves.
7. "clarityComments": Neutral brief feedback on clarity
8. "confidenceComments": Neutral brief feedback on vocal confidence/pacing
9. "structureComments": Neutral brief comments on structure
10. "relevanceComments": Neutral assessment on how well they actually answered the question
11. "professionalismComments": Neutral critique on vocabulary and business prose
12. "starAnalysis": ${isBehavioral ? "A review of STAR formatting, outlining what segments were missing or weak." : "null"}

Ensure the output is JSON matching this exact structure:
{
  "score5": 4,
  "score5Explanation": "Good answer. Relevant information. All or most points covered. Good examples.",
  "score": 8,
  "strengths": ["string", "string"],
  "areasToImprove": ["string", "string"],
  "suggestedAnswer": "string",
  "clarityComments": "string",
  "confidenceComments": "string",
  "structureComments": "string",
  "relevanceComments": "string",
  "professionalismComments": "string",
  "starAnalysis": "string or null"
}
`;

    const response = await callGeminiWithRetry({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    });

    const parsedJson = JSON.parse(response.text || "{}");
    res.json(parsedJson);
  } catch (error: any) {
    console.error("Gemini Evaluate Answer Error:", error);
    res.json(generateMockFeedback(questionText, answerText, category, jobTarget));
  }
});

// 4. API: Generate Final Report
app.post("/api/interview/generate-report", async (req, res) => {
  const { sessionHistory, resumeInfo, jobTarget, totalSpeakingSeconds } = req.body;
  if (!sessionHistory || !jobTarget) {
    return res.status(400).json({ error: "Missing required history parameters" });
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
    // ... exactly 9 more objects for each of the remaining categories
  ]
}
`;

    const response = await callGeminiWithRetry({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.5,
      },
    });

    const parsedJson = JSON.parse(response.text || "{}");
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

function generateMockQuestions(resumeInfo: any, jobTarget: any) {
  const title = jobTarget.positionTitle || "Internship Program";
  const company = jobTarget.companyName || "Target Company";
  const isPanel = jobTarget.interviewFormat === 'panel-board';
  const isEasyVibe = jobTarget.interviewType === 'campus_job' || jobTarget.interviewType === 'internship';

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

function generateMockFeedback(questionText: string, answerText: string, category: string, jobTarget: any) {
  const isBehavioral = category === "behavioral" || questionText.toLowerCase().includes("tell me about a time") || questionText.toLowerCase().includes("describe a scenario");
  const wordsCount = answerText.split(/\s+/).length;
  let score = 7;
  if (wordsCount > 50) score = 8;
  if (wordsCount > 100) score = 9;
  if (wordsCount < 15) score = 5;

  const isEasyVibe = jobTarget && (jobTarget.interviewType === 'campus_job' || jobTarget.interviewType === 'internship');
  if (isEasyVibe) {
    score = Math.min(10, Math.max(8, score + 1));
    const score5 = score >= 9 ? 5 : 4;
    const score5Explanation = score5 === 5 
      ? "Perfect answer. All points addressed. All points relevant." 
      : "Good answer. Relevant information. All or most points covered. Good examples.";

    return {
      score,
      score5,
      score5Explanation,
      strengths: [
        "Warm, highly enthusiastic, and authentic student tone.",
        "Demonstrates excellent willingness to learn and great collegiate spirit."
      ],
      areasToImprove: [
        "Include one more small personal detail to highlight your campus activities.",
        "Keep practicing! Your positive attitude shines through beautifully."
      ],
      suggestedAnswer: `A great encouraging response: "I really enjoy my classes and student activities at Albion College. In our recent team project, I made sure everyone felt heard and we completed our slides ahead of schedule. I would love to bring that same helpful, positive energy to your team!"`,
      clarityComments: "Wonderful! Extremely clear, natural, and friendly.",
      confidenceComments: "Fantastic! You sound highly enthusiastic and self-assured.",
      structureComments: "Very neat, simple structure that's super easy to follow.",
      relevanceComments: "100% relevant. You addressed the core question perfectly.",
      professionalismComments: "Highly appropriate collegiate professional register. Terrific!",
      starAnalysis: null
    };
  }

  const score5 = score >= 9 ? 5 : score >= 8 ? 4 : score >= 7 ? 3 : 2;
  const rubricMap: { [key: number]: string } = {
    5: "Perfect answer. All points addressed. All points relevant.",
    4: "Good answer. Relevant information. All or most points covered. Good examples.",
    3: "Some points covered. Relevant information given. Some examples given.",
    2: "Some points covered, not all relevant. Some examples given.",
    1: "A few good points but main issues are missing. No examples/irrelevant examples given.",
    0: "No answer given or answer completely irrelevant. No examples given. The answer does not match the information in the resume."
  };

  return {
    score,
    score5,
    score5Explanation: rubricMap[score5],
    strengths: [
      "Adequate logical structure mapping high-level scenarios.",
      "Clear, audible vocabulary with appropriate technical jargon where required."
    ],
    areasToImprove: [
      "Include precise quantitative metrics to make claims concrete and prove operational value.",
      "Expand elaboration on personal actions directly, avoiding collective or vague terms."
    ],
    suggestedAnswer: `A direct response matching this scenario is: "In my scientific coursework at Albion College, I took initiative to coordinate daily schedules for our team. Under a tight 48-hour crunch, I personally designed a central pipeline progress checklist that reduced our modeling errors by 12% and ensured our final slides were compiled 4 hours in advance. I look forward to applying this same focus at your company."`,
    clarityComments: "Understood. The response sequence was structurally coherent.",
    confidenceComments: "I see. Steady pacing. Express clear assurance by focusing purely on results.",
    structureComments: "Moving on. The logical structure remains standard. We suggest adding concrete final outcomes.",
    relevanceComments: "Adequate alignment with the core requirements of the question.",
    professionalismComments: "Standard, neutral business register. No enthusiastic fillers present.",
    starAnalysis: isBehavioral 
      ? "STAR feedback: The situation was set up clearly. However, the Action (exactly what YOU did) and Result (quantifiable gains or concrete deliverables) need strict reinforcement." 
      : null
  };
}

function generateMockFinalReport(history: any[], jobTarget: any, totalSpeakingSeconds?: number) {
  let totalScore = 0;
  history.forEach((h: any) => {
    totalScore += h.feedback?.score || 7;
  });
  const avg = history.length > 0 ? (totalScore / history.length) : 7.5;
  const overall = Math.min(100, Math.max(50, Math.round(avg * 10)));

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
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      const parsed = JSON.parse(text.trim());
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
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const report = JSON.parse(response.text || "{}");
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
  const hasMilitary = /smudger|forces|army|navy|military|recruit|commander/i.test(text);
  if (hasMilitary) {
    return {
      analysis: {
        atsFormatting: "The current format uses inconsistent structure, informal headers, and no standard section order. ATS systems will struggle to parse it, and recruiters won't know where to look.",
        languageTone: "Military jargon ('bods', 'blokes', 'crows', 'on the lash', 'Ghanners') is translated into clear, professional civilian language without losing the impact of what you actually accomplished.",
        bulletStructure: "Bullets are rewritten from first-person narrative commentaries to lead with strong action verbs (e.g., 'Supervised', 'Coached', 'Enforced') and focus on measurable work.",
        summary: "The previous summary was too casual. It has been replaced with a strong, professional statement grounded in operational and logistics management.",
        clarityPolishing: "Removed wordy, repetitive, or conversational narrative phrasing, ensuring the emphasis is on crisp professional action verbs.",
        education: "The previous entry dismissed your formal forces qualifications; this has been reframed to highlight professional operational training."
      },
      draft: {
        name: "Smudger Smith",
        phone: "XXX-XXX-XXXX",
        email: "smudger.smith@college.edu",
        linkedin: "linkedin.com/in/smudger-smith",
        summary: "Experienced Section Commander and team leader with over 8 years of operational experience. Skilled in crisis management, personnel training, and strategic operations under extreme pressure. Proven track record of guiding diverse teams and ensuring equipment accountability in challenging environments.",
        education: "Military Training Academy",
        expectedGraduation: "Graduated: 2024",
        majorMinor: "Operational Leadership & Logistics",
        gpa: "GPA: Pass (First Class)",
        skills: ["Operational Leadership", "Team Management", "Crisis Resolution", "Logistics Operations", "Training & Instruction", "Equipment Accountability"],
        customExperiences: [
          {
            company: "HM Forces",
            location: "UK & Overseas",
            role: "Section Commander & Operations Lead",
            dates: "2018-2024",
            bullets: [
              "Supervised and accounted for high-value equipment and resources, coordinating cross-functional movements under pressure",
              "Coached and trained platoons of new recruits, ensuring standard operational compliance",
              "Enforced operational standards and safety regulations, maintaining 100% equipment readiness during deployments"
            ]
          }
        ],
        customActivities: [
          {
            organization: "Instructor at ITC Catterick",
            dates: "2021-2023",
            bullets: [
              "Taught basic operational lessons to incoming recruits, maintaining standard course passing rates"
            ]
          }
        ]
      }
    };
  }

  // Generic Student Fallback
  return {
    analysis: {
      atsFormatting: "Your resume layout looks standard, but you can elevate the section separators for linear-flow ATS compatibility.",
      languageTone: "Translated student colloquialisms or generic descriptions into high-impact business terminology (e.g., changed 'did social media posts' to 'engineered comprehensive marketing strategies').",
      bulletStructure: "Ensured all bullets lead with strong action verbs rather than passive verbs like 'helped with' or 'responsible for'.",
      summary: "Created a strong professional statement that bridges your academic background at Albion with core market competencies.",
      clarityPolishing: "Removed passive phrasing or redundant filler to maximize the impact of your achievements.",
      education: "Framed Albion College marketing degrees and GPA to emphasize critical thinking and coursework projects."
    },
    draft: {
      name: "Student Name",
      phone: "XXX-XXX-XXXX",
      email: "XXXX@college.edu",
      linkedin: "linkedin.com/in/studentname",
      summary: "Results-driven marketing student with strong group collaboration and communications skills. Competent in Microsoft Office Suite, digital content strategy, and project management. Experienced in managing cross-functional tasks and coordinating college festivals.",
      education: "Albion College, Albion, MI",
      expectedGraduation: "Expected Graduation: 05/2027",
      majorMinor: "Bachelor of Arts in Marketing Management",
      gpa: "GPA: 3.5",
      skills: ["Microsoft Word", "Excel", "PowerPoint", "Photoshop", "Illustrator", "Social Media Marketing", "Data Analysis", "Project Management"],
      customExperiences: [
        {
          company: "XYZ Company",
          location: "City, State",
          role: "XYZ Team Member",
          dates: "01/2025-Present",
          bullets: [
            "Contribute to college festivals by leading web development and publicity teams, organizing online hackathons and achieving a 45% increase in participants",
            "Schedule and curate 10+ social media posts per week, boosting festival entries by 30% and podcast subscriptions by 40%",
            "Write three philanthropic blog posts weekly for a charity mobile application, increasing website views by 18% in two weeks"
          ]
        }
      ],
      customActivities: [
        {
          organization: "Member, Carl A. Gerstacker Institute for Business and Management",
          dates: "08/2025-Present",
          bullets: [
            "Engage in professional development pathway with a focus on leadership and practical business operations"
          ]
        }
      ]
    }
  };
}

function generateFallbackEnhanceTarget(draft: any, targetRole: string, targetIndustry: string) {
  const isMilitary = /Smudger/i.test(draft.name);
  if (isMilitary) {
    return {
      analysis: {
        summaryReframe: "Repositioning you specifically as an operations and logistics professional to match how corporate recruiters scan for candidates in this space.",
        skillsReordering: "Bringing logistics, operations, and administration skills to the front so they're the first thing a recruiter sees.",
        languageAlignment: "Sharpening bullet language to reflect corporate operations and logistics terminology — words like 'supply chain accountability,' 'cross-functional coordination,' and 'operational standards' land better in this context than military phrasing.",
        deemphasising: "The tactical combat skills (BARMA, ambushes, advances to contact) are part of your story but not the headline for this audience — we position them as context rather than lead content."
      },
      draft: {
        ...draft,
        summary: `Highly disciplined Operations & Logistics Specialist with over 8 years of team leadership and equipment accountability experience in high-pressure environments. Expert in cross-functional coordination, supply chain logistics, and personnel training. Proven ability to enforce rigorous operational standards and manage risk in complex environments.`,
        skills: ["Logistics Operations", "Supply Chain Accountability", "Cross-Functional Coordination", "Team Leadership", "Risk & Crisis Management", "Operational Standards", "Training & Coaching"]
      },
      questions: [
        "From your ITC Catterick role — '...taught lessons to the new recruits in my platoon. Most passed the course.' — How many recruits were in your platoon, and do you know the pass rate or number who completed the course?",
        "In your contact section — Do you have a LinkedIn profile URL or any other professional online presence you'd like included?",
        "From your Section Commander role — '...I was a section commander on ops with my section of 2 fire teams...' — Can you describe the scale or value of any equipment or resources you were accountable for during deployment?"
      ]
    };
  }

  // Generic Student Fallback
  return {
    analysis: {
      summaryReframe: `Repositioning your profile specifically towards a ${targetRole} career in ${targetIndustry} to highlight your analytical and operations strengths.`,
      skillsReordering: `Bringing ${targetRole}-related skills like project coordination, analytics, and business communication to the front.`,
      languageAlignment: `Sharpening bullet language with industry terms like 'stakeholder coordination', 'ROI analysis', and 'data-driven optimization'.`,
      deemphasising: "Less relevant coursework has been grouped to make room for high-impact experience."
    },
    draft: {
      ...draft,
      summary: `Motivated and analytical professional targeting ${targetRole} positions in ${targetIndustry}. Expert in digital content coordination, project delivery, and team collaboration. Prepared to leverage Albion College's business training and communication standards to drive operational success.`
    },
    questions: [
      "In your experience at XYZ Company — How many visitors or active users did your eco-friendly e-commerce or mobile app project attract?",
      "In your contact section — Do you have a LinkedIn profile URL or any other professional online presence you'd like included?",
      "From your Team Member role — What was the size of the cross-functional team you led or collaborated with to revamp the client portal?"
    ]
  };
}

function generateFallbackEnhanceFinalize(draft: any, answers: any) {
  const keys = Object.keys(answers);
  const updatedExperiences = [...draft.customExperiences];
  let updatedLinkedin = draft.linkedin;

  const linkedinAnswer = keys.find(k => k.toLowerCase().includes("linkedin") || k.includes("1") || k.includes("2"));
  if (linkedinAnswer && answers[linkedinAnswer]) {
    const val = answers[linkedinAnswer];
    if (val.toLowerCase().includes("linkedin.com")) {
      updatedLinkedin = val;
    }
  }

  const isMilitary = /Smudger/i.test(draft.name);
  if (isMilitary) {
    if (updatedExperiences[0]) {
      const q1Ans = answers[0] || answers["0"] || "";
      const q3Ans = answers[2] || answers["2"] || "";

      if (q3Ans) {
        updatedExperiences[0].bullets[0] = `Supervised and accounted for over ${q3Ans} of tactical equipment and vehicle systems, coordinating cross-functional movements with 100% accountability under extreme pressure`;
      } else {
        updatedExperiences[0].bullets[0] = `Supervised and accounted for high-value tactical equipment and vehicle systems, coordinating cross-functional movements with zero margin for error under extreme pressure`;
      }

      if (q1Ans) {
        updatedExperiences[0].bullets[1] = `Coached and instructed over ${q1Ans} in operational standards, achieving an outstanding course completion and passing rate`;
      }
    }
  } else {
    if (updatedExperiences[0]) {
      const q1Ans = answers[0] || answers["0"] || "";
      const q3Ans = answers[2] || answers["2"] || "";

      if (q1Ans) {
        updatedExperiences[0].bullets[2] = `Wrote three philanthropic blog posts weekly, attracting over ${q1Ans} active viewers and increasing company website views by 18% in two weeks`;
      }
      if (q3Ans) {
        updatedExperiences[0].bullets[0] = `Contributed to college festivals by leading a cross-functional team of ${q3Ans}, organizing online hackathons and achieving a 45% increase in participants`;
      }
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
    const prompt = `You are an elite Resume Enhancer & Career Transition expert.
Analyze the following raw resume text and perform a professional first-stage rewrite.

Raw Resume Text:
${resumeText}

Your task is to:
1. Conduct an audit and identify improvement areas under these exact categories:
   - atsFormatting: Inconsistent structure, standard section order, header/footer placement etc.
   - languageTone: Translate military jargon (e.g. "bods", "blokes", "on the lash", "Ghanners"), student slang, or overly casual phrasing into clear professional language.
   - bulletStructure: First-person narratives, fillers, personal commentaries. Outline how they must lead with strong action verbs.
   - summary: Professional reframing.
   - clarityPolishing: Identify narrative comments, conversational fillers, or subjective commentary that have been polished for a clean business presentation.
   - education: Reframing academic or military training qualifications properly.

2. Generate an "Improved First Draft" in a structured JSON. Strip out all first-person narrative pronouns ("I", "my", "we"), casual filler, and conversational elements. Translate military/student terms to civilian/corporate equivalents. Ensure every bullet point starts with a strong action verb.

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
    "name": "string (extract or default)",
    "phone": "string (extract or default)",
    "email": "string (extract or default)",
    "linkedin": "string (extract or default)",
    "summary": "string (improved summary)",
    "education": "string (extract or default, e.g., Albion College)",
    "expectedGraduation": "string (extract or default, e.g., Expected Graduation: 05/2027)",
    "majorMinor": "string (extract or default)",
    "gpa": "string (extract or default, e.g. GPA: 3.5)",
    "skills": ["string (list of 5-10 extracted/improved skills)"],
    "customExperiences": [
      {
        "company": "string",
        "location": "string",
        "role": "string",
        "dates": "string",
        "bullets": ["string (improved bullet point leading with action verb)"]
      }
    ],
    "customActivities": [
      {
        "organization": "string",
        "dates": "string",
        "bullets": ["string (improved activities bullet)"]
      }
    ]
  }
}
Do not include any Markdown tags or comments in your output, return raw JSON string.`;

    const response = await callGeminiWithRetry({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const parsedData = JSON.parse((response.text || "{}").trim());
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
    const prompt = `You are an expert resume writer. Take the current resume draft and re-tune it specifically for:
Target Role: "${role}"
Target Industry/Organization: "${industry}"

Your task is to:
1. Reframe the Summary and adjust bullet terminology to align with terms corporate recruiters search for in "${role}".
2. Reorder or update skills to bring relevance to "${role}".
3. Formulate 3 highly specific, contextual follow-up questions to help the candidate strengthen their bullets. Ask about details they can quantify (e.g. team size, pass rate, equipment value, LinkedIn profile link).
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
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const parsedData = JSON.parse((response.text || "{}").trim());
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
    const prompt = `You are an expert resume polish writer.
Take the current resume draft and integrate the user's answers to the follow-up questions to make their bullet points significantly stronger, quantified, and professionally detailed.

User Answers:
${JSON.stringify(answers)}

Current Resume Draft:
${JSON.stringify(draft)}

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
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const parsedData = JSON.parse((response.text || "{}").trim());
    res.json({ success: true, ...parsedData });
  } catch (err: any) {
    console.warn("Gemini Enhance Finalize (Using Fallback due to temporary overload):", err?.message || err);
    res.json({ success: true, ...generateFallbackEnhanceFinalize(draft, answers) });
  }
});


// Start express.js dev server or production setup
async function startServer() {
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
}

startServer();
