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
  | 'internship'
  | 'research'
  | 'campus_job'
  | 'graduate_school'
  | 'full_time_job'
  | 'behavioral'
  | 'technical'
  | 'general';

export type DifficultyLevel = 'beginner' | 'standard' | 'challenging';

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
  score5?: number; // 0-5 from the document rubric
  score5Explanation?: string; // Text rubric description
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
  category: 'behavioral' | 'technical' | 'resume-based' | 'company-fit' | 'general' | 'closing';
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
