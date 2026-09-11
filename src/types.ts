export interface TemplateExperience {
  company: string;
  location: string;
  role: string;
  dates: string;
  bullets: string[];
}

export interface TemplateActivity {
  organization: string;
  dates: string;
  bullets: string[];
}

export interface ResumeInfo {
  name: string;
  education: string;
  majorMinor: string;
  skills: string[];
  workExperience: string[];
  researchExperience: string[];
  projects: string[];
  leadership: string[];
  certifications: string[];
  isParsed?: boolean;
  phone?: string;
  email?: string;
  linkedin?: string;
  summary?: string;
  gpa?: string;
  expectedGraduation?: string;
  campusActivities?: string[];
  customExperiences?: TemplateExperience[];
  customActivities?: TemplateActivity[];
}

export type InterviewType = 
  | 'medical_school'
  | 'internship'
  | 'research'
  | 'campus_job'
  | 'graduate_school'
  | 'full_time_job'
  | 'behavioral'
  | 'technical'
  | 'general';

export type DifficultyLevel = 'basic' | 'beginner' | 'standard' | 'challenging';

export interface JobTarget {
  positionTitle: string;
  companyName: string;
  industry: string;
  interviewType: InterviewType;
  difficulty: DifficultyLevel;
  focusCategory?: string; // Albion specific category
  interviewFormat?: 'one-on-one' | 'panel-board';
  jobDescription?: string;
}

export interface SpeakingStats {
  paceWpm: number; // Words per minute
  longPausesCount: number;
  fillerWordsCount: number;
  fillerWordsList: string[];
  volumeConsistency: 'steady' | 'fluctuating' | 'low';
  eyeContactEstimatePercentage?: number;
  facialEngagementEstimatePercentage?: number;
  nervousnessIndicators: string[];
}

export interface QuestionFeedback {
  score: number; // 1-10
  numericScore?: number; // 0-100 scale
  score5?: number; // 0-5 from the document rubric
  score5Explanation?: string; // Text rubric description
  
  // Universal v2.0 Schema
  track_evaluated?: 'MEDICAL_SCHOOL' | 'STANDARD_JOB';
  domain_classification?: string;
  targeted_competencies?: string[];
  overall_score?: number; // 0.0 to 5.0
  score_breakdown?: {
    claim_or_situation: number;
    evidence_or_action: number;
    insight_or_result: number;
    red_flag_deduction: number;
  };
  // Progressive 3-Tier Hint System & Penalty Engine
  hints_unlocked?: number;
  raw_evaluation_score?: number;
  penalty_points?: number;
  max_score_cap?: number;
  final_score?: number;
  aamc_competency_id?: string;

  // Objective Rubric & Custom Filler Word Calibration Engine
  objective_rubric?: {
    relevance_to_target: number; // 0-100
    professional_register: number; // 0-100
    clarity_conciseness: number; // 0-100
    vocal_composure_pace: number; // 0-100
  };
  filler_analysis?: {
    total_words: number;
    total_fillers: number;
    filler_density_pct: number;
    filler_breakdown: { word: string; count: number }[];
    custom_calibrated_words_used: string[];
  };

  feedback?: {
    strengths: string[];
    vulnerabilities: string[];
    red_flag_alert: string | null;
  };
  recommended_rewrite?: string;

  starChecklist?: {
    situation: boolean;
    task: boolean;
    action: boolean;
    result: boolean;
  };
  starChecklistFormatted?: string; // "S: ✓ | T: ✓ | A: ✓ | R: ✗"
  keyTip?: string; // One actionable tip to improve
  starBreakdown?: {
    situationTaskScore: number; // 0 to 30
    actionScore: number; // 0 to 40
    resultScore: number; // 0 to 30
  };
  strengths: string[];
  areasToImprove: string[];
  suggestedAnswer: string;
  clarityComments: string;
  confidenceComments: string;
  structureComments: string;
  relevanceComments: string;
  professionalismComments: string;
  starAnalysis?: string; // Enforce STAR method feedback for behavioral questions
  speakingAnalysis?: SpeakingStats;
}

export interface InterviewQuestion {
  id: string;
  text: string;
  category: 'behavioral' | 'technical' | 'resume-based' | 'company-fit' | 'general' | 'closing' | 'mmi' | string;
  scenario_id?: string;
  title?: string;
  aamc_competency_primary?: string;
  aamc_competency_secondary?: string;
  help_drawer_content?: {
    competency_overview?: string;
    underlying_dilemma?: string;
    key_talking_points?: string[];
  };
  follow_up_probes?: string[];
  timing?: {
    prep_seconds?: number;
    station_seconds?: number;
  };
}

export interface InterviewSession {
  id: string;
  date: string;
  jobTarget: JobTarget;
  resumeInfo: ResumeInfo | null;
  questions: InterviewQuestion[];
  currentQuestionIndex: number;
  userAnswers: { [questionId: string]: string };
  feedbacks: { [questionId: string]: QuestionFeedback };
  speakingStatsHistory: { [questionId: string]: SpeakingStats };
  videoUrls?: { [questionId: string]: string };
  isCompleted: boolean;
  finalReport?: FinalReport;
  userId?: string;
  totalSpeakingSeconds?: number;
}

export interface CategoryEvaluation {
  categoryName: string;
  rating: number; // 1-5
  explanation: string; // 2-4 sentences
  evidence: string; // Evidence from the candidate's answer
  suggestion: string; // One suggestion for improvement
}

export interface FinalReport {
  overallScore: number;
  communicationScore: number;
  contentQualityScore: number;
  resumeAlignmentScore: number;
  confidenceClarityScore: number;
  topStrengths: string[];
  topImprovementAreas: string[];
  bestAnswer: { question: string; answer: string; score: number };
  weakestAnswer: { question: string; answer: string; score: number };
  recommendedQuestions: string[];
  personalizedAdvice: string;
  atsResumeReport?: any;
  categoryEvaluations?: CategoryEvaluation[];
}

export interface UserAccount {
  email: string;
  name: string;
  createdAt: string;
  savedResume: ResumeInfo | null;
  sessions: InterviewSession[];
}
