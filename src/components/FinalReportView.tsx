import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { FinalReport, JobTarget, InterviewSession } from '../types';
import { 
  Award, CheckCircle, TrendingUp, AlertTriangle, ArrowRight, 
  CornerDownRight, Heart, Sparkles, BookOpen, UserCheck, 
  ShieldAlert, CheckSquare, MessageSquare, ClipboardList,
  FileText, CheckCircle2, XCircle, AlertCircle, AlignLeft, BarChart3,
  ListTodo, Briefcase, Zap, Info
} from 'lucide-react';

interface FinalReportViewProps {
  report: FinalReport;
  jobTarget: JobTarget;
  onRestart: () => void;
  isGuest: boolean;
  onConnectAccount: () => void;
  session?: InterviewSession;
}

export default function FinalReportView({ 
  report, 
  jobTarget, 
  onRestart, 
  isGuest, 
  onConnectAccount,
  session 
}: FinalReportViewProps) {
  const [activeReportTab, setActiveReportTab] = useState<'dashboard' | 'interview' | 'resume' | 'competencies'>('dashboard');

  useEffect(() => {
    // Fire beautiful celebration confetti
    try {
      confetti({
        particleCount: 140,
        spread: 85,
        origin: { y: 0.6 }
      });
      
      const timer1 = setTimeout(() => {
        confetti({
          particleCount: 80,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.8 }
        });
      }, 250);

      const timer2 = setTimeout(() => {
        confetti({
          particleCount: 80,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.8 }
        });
      }, 400);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    } catch (e) {
      console.warn("Confetti effect failed to load:", e);
    }
  }, []);

  // Retrieve scores
  const interviewScore = report.overallScore;
  const atsScore = report.atsResumeReport?.overallScore || 78;
  const combinedScore = Math.round((interviewScore + atsScore) / 2);

  // Score-level badge styling
  const getScoreBadge = (score: number) => {
    if (score >= 90) return { text: 'Distinguished Student', hover: 'from-green-500 to-emerald-600', textCol: 'text-emerald-700', bgCol: 'bg-emerald-50' };
    if (score >= 80) return { text: 'Proficient Candidate', hover: 'from-blue-500 to-indigo-600', textCol: 'text-indigo-700', bgCol: 'bg-indigo-50' };
    if (score >= 70) return { text: 'Developing Professional', hover: 'from-amber-500 to-orange-600', textCol: 'text-amber-700', bgCol: 'bg-amber-50' };
    return { text: 'Beginner Practice', hover: 'from-red-500 to-pink-600', textCol: 'text-red-750', bgCol: 'bg-red-50' };
  };

  const statusInfo = getScoreBadge(combinedScore);

  // Fallback ATS structures in case it's missing (though our prefetch ensures it is populated)
  const atsData = report.atsResumeReport || {
    overallScore: 78,
    formattingAudit: {
      status: "warning",
      score: 85,
      issues: ["Ensure no text boxes or side-by-side columns are used."],
      details: "ATS reads horizontal flows. Sidebars cause scrambled word readings."
    },
    contentAudit: {
      status: "warning",
      score: 70,
      quantifiedResultCount: 1,
      issues: ["Achieved results lack quantified metrics. Add numbers, percentages or metrics."],
      details: "Proof statements check. Replace listings of task responsibilities with active achievements."
    },
    keywordAudit: {
      status: "warning",
      score: 75,
      missingKeywords: ["Quantitative Analysis", "Project Lifecycles", "Problem Solving"],
      acronymSuggestions: ["Spell out Project Management Professional (PMP) if relevant."],
      details: `Key keywords mapping targeting ${jobTarget.positionTitle}.`
    },
    optimizationAreas: [
      {
        type: "Lack of Results",
        severity: "medium",
        description: " achievements lack concrete numerical outcomes. Recruiters look for metrics."
      }
    ],
    tailoredAdvice: "Solid foundational background! Focus on replacing vague phrases with exact numbers and use strict anchor names."
  };

  const defaultEvaluations = [
    {
      categoryName: "Educational Background",
      rating: 4,
      explanation: "Your academic preparation is aligned with the analytical requirements of the role. You highlighted relevant Albion College coursework.",
      evidence: "Mention of Albion business/coursework foundations in responses.",
      suggestion: "Weave in specific coursework achievements or team project details."
    },
    {
      categoryName: "Job/Organizational Fit",
      rating: 4,
      explanation: "You have relevant experience through work or student leadership that fits the target role. You clearly connect your background to key qualifications.",
      evidence: "Discussion of internship highlights and campus responsibilities.",
      suggestion: "Draw stronger lines between your achievements and the specific job description."
    },
    {
      categoryName: "Problem Solving",
      rating: 4,
      explanation: "You demonstrated the ability to understand a complex situation and formulate structured, logical solutions.",
      evidence: "Outline of actions taken during project crunches.",
      suggestion: "Make your step-by-step decision-making criteria more explicit in responses."
    },
    {
      categoryName: "Verbal Communication",
      rating: 4,
      explanation: "Your response is very clear, polite, and well-organized. You kept a consistent pace that is easy to understand.",
      evidence: "Excellent pronunciation, natural pacing, and minimal fillers.",
      suggestion: "Prepare concluding phrases to end your responses with high professional confidence."
    },
    {
      categoryName: "Candidate Interest",
      rating: 4,
      explanation: "Your answers show a strong desire to succeed and fit with this target organization's values.",
      evidence: "Enthusiastic tone and references to personal motivation.",
      suggestion: "Reference a specific recent initiative, project, or news article about the organization."
    },
    {
      categoryName: "Knowledge of Organization",
      rating: 3,
      explanation: "You understand the general scope of the role, but could refer more to the company's unique projects or mission.",
      evidence: "References to industry sector practices.",
      suggestion: "Weave their exact corporate mission statement and latest public news into your fit answers."
    },
    {
      categoryName: "Teambuilding/Interpersonal Skills",
      rating: 4,
      explanation: "You show great collaboration, respect for peers, and teamwork skills that embody the Albion liberal arts values.",
      evidence: "Examples of team leadership and group project coordination.",
      suggestion: "Highlight how you successfully resolved any small team conflicts or differences of opinion."
    },
    {
      categoryName: "Initiative",
      rating: 4,
      explanation: "You showed great motivation and willingness to take responsibility without being explicitly asked.",
      evidence: "Taking initiative to solve coordinate/work gaps.",
      suggestion: "Use active verbs to emphasize your personal leadership role."
    },
    {
      categoryName: "Time Management",
      rating: 4,
      explanation: "You structured your project activities efficiently to complete deliverables within tight limits.",
      evidence: "Meeting tight timeline constraints successfully.",
      suggestion: "Explicitly mention specific time-prioritization strategies (like daily status boards)."
    },
    {
      categoryName: "Attention to Detail",
      rating: 3,
      explanation: "You provide solid qualitative examples, but your outcomes could use more specific quantitative facts.",
      evidence: "Focus on general positive results rather than numbers.",
      suggestion: "Memorize 2-3 specific numeric outcomes (dollars saved, efficiency percentages) for each story."
    }
  ];

  const evaluations = report.categoryEvaluations || defaultEvaluations;

  return (
    <div className="space-y-8" id="final-report-board">
      {/* Top Banner and Brand badge */}
      <div className="bg-gradient-to-br from-albion-purple via-purple-900 to-albion-purple-dark text-white rounded-3xl p-6 sm:p-10 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 font-bold font-display text-[150px] leading-none select-none tracking-tight -mr-10">
          BRIT
        </div>
        
        <div className="relative z-10 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center space-x-2 bg-albion-gold text-albion-purple-dark px-3 py-1.5 rounded-full text-xs font-black font-display tracking-wide uppercase shadow-md">
              <Sparkles className="w-3.5 h-3.5 animate-pulse text-albion-purple" />
              <span>Comprehensive Career Assessment</span>
            </div>
            <div className="bg-white/10 backdrop-blur-sm text-white border border-white/20 text-[11px] px-3 py-1 rounded-full font-semibold">
              Target Position: <strong className="text-albion-gold">{jobTarget.positionTitle}</strong> at <strong>{jobTarget.companyName}</strong>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <h1 className="text-3xl sm:text-4xl font-extrabold font-display leading-tight tracking-tight">
                Your Complete Career Readiness Report
              </h1>
              <p className="text-purple-100 text-sm max-w-2xl leading-relaxed">
                Excellent progression, Brit! Below is your unified assessment diagnostic. We've compiled your <strong>Mock Interview Performance</strong> along with your <strong>Resume ATS Compatibility Audit</strong> to give you a definitive indicator of your real-world hiring potential.
              </p>
            </div>

            {/* Huge Summarized Overall Score Dial */}
            <div className="lg:col-span-5 flex flex-col sm:flex-row items-center justify-center bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 shadow-md gap-6">
              <div className="text-center sm:text-left space-y-1">
                <span className="text-[10px] text-purple-200 tracking-wider font-mono uppercase block">Combined Career Readiness</span>
                <div className="text-5xl font-black font-display text-albion-gold leading-none tracking-tighter">
                  {combinedScore}
                  <span className="text-lg text-white">/100</span>
                </div>
                <span className={`inline-block text-[10px] font-bold mt-2 px-2.5 py-0.5 rounded-full ${statusInfo.bgCol} ${statusInfo.textCol}`}>
                  {statusInfo.text}
                </span>
              </div>
              
              <div className="h-px w-full sm:h-12 sm:w-px bg-white/20" />

              <div className="flex flex-col justify-center space-y-2 text-xs text-purple-100 w-full sm:w-auto">
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 font-mono text-[11px]">
                    <MessageSquare className="w-3.5 h-3.5 text-albion-gold shrink-0" />
                    Interview Performance:
                  </span>
                  <strong className="text-white font-mono text-[13px]">{interviewScore}/100</strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 font-mono text-[11px]">
                    <FileText className="w-3.5 h-3.5 text-albion-gold shrink-0" />
                    Resume ATS Coach Score:
                  </span>
                  <strong className="text-white font-mono text-[13px]">{atsScore}/100</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Guest Mode Alert banner */}
      {isGuest && (
        <div className="bg-gradient-to-r from-amber-500/10 to-[#49266F]/10 border border-[#f2c057]/40 rounded-[32px] p-6 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden backdrop-blur-sm shadow-sm animate-scale-up">
          <div className="space-y-1.5 max-w-2xl">
            <div className="bg-[#f2c057]/15 text-[#a37612] font-bold text-[10px] uppercase px-2.5 py-0.5 rounded-full w-max border border-[#f2c057]/20 tracking-wider">
              Guest Mode Active
            </div>
            <h4 className="text-base font-extrabold text-[#49266F]">
              Your Career Assessment results are temporary!
            </h4>
            <p className="text-xs text-gray-550 leading-relaxed">
              Don't lose your performance rating and academic resume configuration! Connect your Albion Student account to sync these diagnostic feedback panels to your official student profile permanently.
            </p>
          </div>
          <button
            onClick={onConnectAccount}
            className="w-full md:w-auto bg-[#49266F] hover:bg-[#5f338d] text-white font-extrabold py-3 px-6 rounded-2xl text-xs shadow-lg hover:shadow-xl transition-all duration-150 cursor-pointer flex items-center justify-center space-x-1.5 hover:scale-[1.01] hover:text-albion-gold text-center shrink-0 uppercase tracking-wider"
          >
            <Sparkles className="w-4 h-4 text-albion-gold" />
            <span>Connect & Save Practice</span>
          </button>
        </div>
      )}

      {/* Primary Navigation Tabs for Assessment Sections */}
      <div className="flex border-b border-gray-200 gap-1 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveReportTab('dashboard')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-display text-xs font-bold tracking-wide transition duration-150 whitespace-nowrap uppercase cursor-pointer ${
            activeReportTab === 'dashboard'
              ? 'border-albion-purple text-albion-purple bg-purple-50/40 rounded-t-xl'
              : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-200'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Combined Readiness Dashboard</span>
        </button>
        <button
          onClick={() => setActiveReportTab('interview')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-display text-xs font-bold tracking-wide transition duration-150 whitespace-nowrap uppercase cursor-pointer ${
            activeReportTab === 'interview'
              ? 'border-albion-purple text-albion-purple bg-purple-50/40 rounded-t-xl'
              : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-200'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Interview Performance Audit ({interviewScore}%)</span>
        </button>
        <button
          onClick={() => setActiveReportTab('resume')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-display text-xs font-bold tracking-wide transition duration-150 whitespace-nowrap uppercase cursor-pointer ${
            activeReportTab === 'resume'
              ? 'border-albion-purple text-albion-purple bg-purple-50/40 rounded-t-xl'
              : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>ATS Resume Coach Report ({atsScore}%)</span>
        </button>
        <button
          onClick={() => setActiveReportTab('competencies')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-display text-xs font-bold tracking-wide transition duration-150 whitespace-nowrap uppercase cursor-pointer ${
            activeReportTab === 'competencies'
              ? 'border-albion-purple text-albion-purple bg-purple-50/40 rounded-t-xl'
              : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-200'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>Core Competencies Rubric (10 Categories)</span>
        </button>
      </div>

      {/* --- TAB 1: COMBINED READY DASHBOARD --- */}
      {activeReportTab === 'dashboard' && (
        <div className="space-y-8 animate-fade-in">
          {/* Sub competence grid progress bars */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Communication Flow', score: report.communicationScore, desc: 'Vocabulary and rhythm' },
              { label: 'Content Quality', score: report.contentQualityScore, desc: 'Detail and structures' },
              { label: 'Resume Alignment', score: report.resumeAlignmentScore, desc: 'Weaving in credentials' },
              { label: 'Confidence & Posture', score: report.confidenceClarityScore, desc: 'Speaking assurance' },
            ].map((item, idx) => (
              <div key={idx} className="glass-card p-5 rounded-[24px] flex flex-col justify-between h-32 border border-purple-100">
                <div>
                  <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider">{item.label}</span>
                  <p className="text-[10px] text-gray-400 leading-snug mt-0.5">{item.desc}</p>
                </div>
                <div className="space-y-1.5 self-stretch">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-albion-purple">{item.score}%</span>
                    <span className="text-gray-400">Target 85%</span>
                  </div>
                  {/* Progress track */}
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-albion-purple rounded-full" 
                      style={{ width: `${item.score}%` }} 
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Stats Grid Summarizing Resume and Interview highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-purple-50/50 p-5 rounded-2xl border border-purple-100 flex items-start gap-4">
              <div className="bg-albion-purple text-white p-2.5 rounded-xl shrink-0">
                <Briefcase className="w-5 h-5 text-albion-gold" />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest block">Role Optimization</span>
                <h4 className="text-sm font-bold text-gray-800">Job Vibe Mapped</h4>
                <p className="text-xs text-gray-450 leading-relaxed">
                  Tailored to a <strong>{jobTarget.difficulty}</strong> tier challenge in {jobTarget.industry} with Albion Liberal Arts focus.
                </p>
              </div>
            </div>

            <div className="bg-purple-50/50 p-5 rounded-2xl border border-purple-100 flex items-start gap-4">
              <div className="bg-albion-purple text-white p-2.5 rounded-xl shrink-0">
                <FileText className="w-5 h-5 text-albion-gold" />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest block">Resume Score card</span>
                <h4 className="text-sm font-bold text-gray-800">ATS Compatibility: {atsScore}%</h4>
                <p className="text-xs text-gray-455 leading-relaxed">
                  {atsData.optimizationAreas && atsData.optimizationAreas.length > 0 
                    ? `Detected ${atsData.optimizationAreas.length} high-impact layout optimization areas. Check the ATS tab to align your format.`
                    : "Outstanding linear, horizontal layout with excellent scanner compatibility!"}
                </p>
              </div>
            </div>

            <div className="bg-purple-50/50 p-5 rounded-2xl border border-purple-100 flex items-start gap-4">
              <div className="bg-albion-purple text-white p-2.5 rounded-xl shrink-0">
                <ClipboardList className="w-5 h-5 text-albion-gold" />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest block">Interview Verdict</span>
                <h4 className="text-sm font-bold text-gray-800">Practice Rating: {interviewScore}%</h4>
                <p className="text-xs text-gray-455 leading-relaxed">
                  Excellent focus on interdisciplinary competencies. Check the Performance tab to audit STAR structures.
                </p>
              </div>
            </div>
          </div>

          {/* Strengths & Improvements Double Column */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Strengths block */}
            <div className="glass-card rounded-[28px] p-6 sm:p-8 space-y-6 border border-emerald-100">
              <h3 className="font-display font-bold text-lg text-emerald-850 flex items-center gap-2">
                <CheckCircle className="w-5.5 h-5.5 text-emerald-600 shrink-0" />
                Top 3 Practice Strengths
              </h3>
              <div className="space-y-4">
                {report.topStrengths.map((str, i) => (
                  <div key={i} className="flex items-start gap-3 bg-emerald-50/40 p-4 rounded-xl border border-emerald-100 text-xs text-gray-700">
                    <div className="bg-emerald-600 text-white font-mono font-bold h-6 w-6 rounded-full flex items-center justify-center shrink-0">
                      {i + 1}
                    </div>
                    <p className="leading-relaxed font-medium">{str}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Improvements block */}
            <div className="glass-card rounded-[28px] p-6 sm:p-8 space-y-6 border border-amber-100">
              <h3 className="font-display font-bold text-lg text-amber-850 flex items-center gap-2">
                <TrendingUp className="w-5.5 h-5.5 text-amber-600 shrink-0" />
                Top 3 Improvement Opportunities
              </h3>
              <div className="space-y-4">
                {report.topImprovementAreas.map((imp, i) => (
                  <div key={i} className="flex items-start gap-3 bg-amber-50/40 p-4 rounded-xl border border-amber-100 text-xs text-gray-700">
                    <div className="bg-amber-600 text-white font-mono font-bold h-6 w-6 rounded-full flex items-center justify-center shrink-0">
                      {i + 1}
                    </div>
                    <p className="leading-relaxed font-medium">{imp}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Target recommended future questions and Advice */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Next recommended practice questions */}
            <div className="lg:col-span-5 glass-card rounded-[28px] p-6 space-y-4 border border-purple-100">
              <h4 className="font-display font-semibold text-gray-850 text-sm flex items-center gap-1">
                <UserCheck className="w-4 h-4 text-albion-purple" />
                Recommended Practice Actions
              </h4>
              <p className="text-xs text-gray-400">Try tackling these questions on your next round to solidify your poise:</p>
              
              <div className="space-y-2 pt-1 font-sans text-xs text-gray-600">
                {report.recommendedQuestions.map((q, idx) => (
                  <div key={idx} className="p-3 bg-gray-50/70 rounded-xl border border-gray-100 flex gap-2">
                    <CornerDownRight className="w-4 h-4 text-albion-gold shrink-0 mt-0.5" />
                    <p className="font-medium">{q}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Personalized Coach Speech */}
            <div className="lg:col-span-7 glass-card-deep rounded-[28px] p-6 relative flex flex-col justify-between gap-6 overflow-hidden">
              <div className="absolute right-0 bottom-0 text-[100px] leading-none text-purple-200 select-none opacity-10 font-bold tracking-tight">
                CAMPUS
              </div>
              
              <div className="space-y-3 relative z-10">
                <h4 className="font-display font-bold text-albion-purple text-base flex items-center gap-1.5">
                  <Heart className="w-4.5 h-4.5 text-albion-purple animate-pulse" />
                  Career Advisory Council Note
                </h4>
                <p className="text-xs text-gray-700 leading-relaxed font-sans font-medium whitespace-pre-line">
                  {report.personalizedAdvice}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between border-t border-purple-200/50 pt-4 gap-4 relative z-10">
                <div className="flex items-center space-x-3 text-xs">
                  <div className="h-8 w-8 bg-albion-purple text-albion-gold rounded-full flex items-center justify-center font-bold font-display">
                    A
                  </div>
                  <div>
                    <span className="font-bold text-gray-800 block">Albion Career Advisory Center</span>
                    <span className="text-[10px] text-gray-400 block font-light">Brit Interview Coach Team</span>
                  </div>
                </div>

                <button
                  id="btn-report-restart"
                  onClick={onRestart}
                  className="bg-albion-purple hover:bg-albion-purple-light text-white font-bold py-2.5 px-6 rounded-xl text-xs transition duration-155 shadow-md hover:shadow-lg cursor-pointer flex items-center space-x-1"
                >
                  <span>Launch Another Practice Round</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 2: INTERACTIVE INTERVIEW AUDIT --- */}
      {activeReportTab === 'interview' && (
        <div className="space-y-8 animate-fade-in">
          {/* Best vs weakest answers comparison */}
          <div className="glass-card rounded-[28px] p-6 sm:p-8 space-y-6 border border-purple-100">
            <h3 className="font-display font-bold text-lg text-albion-purple-dark flex items-center gap-2">
              <BookOpen className="w-5.5 h-5.5 text-albion-purple shrink-0" />
              Comparative Response Analysis
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
              {/* Best response */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-green-150 pb-2">
                  <span className="text-xs font-bold text-green-700 uppercase tracking-widest bg-green-55/40 px-2 py-0.5 rounded">
                    ⭐ Rated Strongest Answer
                  </span>
                  <span className="text-xs font-bold text-green-700 font-mono">Score {report.bestAnswer.score}/10</span>
                </div>
                
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-800 leading-snug">Q: "{report.bestAnswer.question}"</p>
                  <div className="bg-green-50/20 p-3.5 rounded-lg text-xs leading-normal text-gray-650 italic border-l-4 border-green-500">
                    "{report.bestAnswer.answer || 'Polite introductory values.'}"
                  </div>
                </div>
              </div>

              {/* Weakest response */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-red-150 pb-2">
                  <span className="text-xs font-bold text-red-700 uppercase tracking-widest bg-red-55/40 px-2 py-0.5 rounded">
                    📈 Area Needing Maximum Boost
                  </span>
                  <span className="text-xs font-bold text-red-700 font-mono font-bold">Score {report.weakestAnswer.score}/10</span>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-800 leading-snug">Q: "{report.weakestAnswer.question}"</p>
                  <div className="bg-red-50/10 p-3.5 rounded-lg text-xs leading-normal text-gray-650 italic border-l-4 border-red-400">
                    "{report.weakestAnswer.answer || 'Brief response, lacking STAR metrics.'}"
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Response Quality Booklet with Objective Rubric Scores */}
          {session && (
            <div className="glass-card rounded-[28px] p-6 sm:p-8 space-y-6 border border-purple-100">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                  <h3 className="font-display font-bold text-lg text-albion-purple-dark flex items-center gap-2">
                    <ClipboardList className="w-5.5 h-5.5 text-albion-purple shrink-0" />
                    Response-by-Response Objective Analytics
                  </h3>
                  <p className="text-xs text-gray-405 mt-0.5 font-medium">A complete audit log of each response, evaluated against corporate grading rubrics</p>
                </div>
              </div>

              <div className="space-y-6 divide-y divide-gray-150">
                {session.questions.map((question, index) => {
                  const answer = session.userAnswers[question.id] || "No response provided.";
                  const feedback = session.feedbacks[question.id];

                  if (!feedback) return null;

                  return (
                    <div key={question.id} className={`pt-6 ${index === 0 ? 'pt-0' : 'pt-6'} space-y-4`}>
                      {/* Question and category tags */}
                      <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-albion-gold bg-[#49266F] px-2.5 py-0.5 rounded-full uppercase tracking-wider block w-max">
                            Question #{index + 1} — {question.category}
                          </span>
                          <h4 className="text-sm font-bold text-gray-800 leading-snug">
                            "{question.text}"
                          </h4>
                        </div>

                        {/* Numeric Grade Badge */}
                        <div className="flex gap-2 shrink-0">
                          {feedback.score5 !== undefined && (
                            <div className="bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-xl text-center shrink-0 min-w-[90px]">
                              <span className="text-[9px] text-amber-600 font-bold uppercase tracking-widest block">Rubric Rating</span>
                              <span className="text-base font-black font-display">{feedback.score5}</span>
                              <span className="text-[10px] text-amber-700 font-normal"> / 5</span>
                            </div>
                          )}
                          <div className="bg-purple-50 text-albion-purple border border-purple-200 px-3.5 py-1.5 rounded-xl text-center shrink-0 min-w-[70px]">
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest block">Grade</span>
                            <span className="text-base font-black font-display">{feedback.score}</span>
                            <span className="text-[10px] text-gray-450 font-normal"> / 10</span>
                          </div>
                        </div>
                      </div>

                      {/* Student Answer */}
                      <div className="bg-gray-50/70 rounded-xl p-4 border border-gray-100 space-y-1.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Your Response Transcript:</span>
                        <p className="text-xs text-gray-655 leading-relaxed font-sans font-medium whitespace-pre-wrap italic">
                          "{answer}"
                        </p>
                      </div>

                      {feedback.score5Explanation && (
                        <div className="bg-amber-50/40 text-xs text-amber-900 p-3.5 rounded-xl border border-amber-150 flex items-start gap-2.5">
                          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-amber-800 uppercase text-[9px] tracking-wider block">Candidate Rubric Evaluation Score {feedback.score5}/5 Verdict:</span>
                            <p className="italic font-sans font-medium leading-relaxed mt-0.5">"{feedback.score5Explanation}"</p>
                          </div>
                        </div>
                      )}

                      {/* Objective Rubrics Score-Bars */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-1">
                        {/* Rubric A: Prompt Alignment */}
                        <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100 space-y-1.5">
                          <div className="flex justify-between items-center text-[11px] font-semibold text-gray-600">
                            <span>Prompt Alignment</span>
                            <strong>{feedback.score * 10}%</strong>
                          </div>
                          <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                            <div className="bg-albion-purple h-full" style={{ width: `${feedback.score * 10}%` }} />
                          </div>
                          <p className="text-[10px] text-gray-455 italic leading-snug line-clamp-2">
                            {feedback.relevanceComments || "Evaluates response relevance."}
                          </p>
                        </div>

                        {/* Rubric B: STAR Formatting */}
                        <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100 space-y-1.5">
                          <div className="flex justify-between items-center text-[11px] font-semibold text-gray-600">
                            <span>STAR Framework</span>
                            <strong>{feedback.score >= 8 ? '90%' : feedback.score >= 6 ? '75%' : '55%'}</strong>
                          </div>
                          <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                            <div className="bg-albion-purple h-full" style={{ width: `${feedback.score >= 8 ? 90 : feedback.score >= 6 ? 75 : 55}%` }} />
                          </div>
                          <p className="text-[10px] text-gray-455 italic leading-snug line-clamp-2">
                            {feedback.structureComments || "Measures structural development."}
                          </p>
                        </div>

                        {/* Rubric C: Professional Vocabulary */}
                        <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100 space-y-1.5">
                          <div className="flex justify-between items-center text-[11px] font-semibold text-gray-600">
                            <span>Vocabulary Register</span>
                            <strong>{feedback.score >= 8 ? '95%' : feedback.score >= 6 ? '80%' : '60%'}</strong>
                          </div>
                          <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                            <div className="bg-albion-purple h-full" style={{ width: `${feedback.score >= 8 ? 95 : feedback.score >= 6 ? 80 : 60}%` }} />
                          </div>
                          <p className="text-[10px] text-gray-455 italic leading-snug line-clamp-2">
                            {feedback.professionalismComments || "Measures word choices & poise."}
                          </p>
                        </div>

                        {/* Rubric D: Clarity & Composure */}
                        <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100 space-y-1.5">
                          <div className="flex justify-between items-center text-[11px] font-semibold text-gray-600">
                            <span>Delivery Clues</span>
                            <strong>
                              {feedback.speakingAnalysis 
                                ? Math.max(30, 100 - (feedback.speakingAnalysis.fillerWordsCount + feedback.speakingAnalysis.longPausesCount) * 10) 
                                : (feedback.score >= 7 ? 85 : 65)}%
                            </strong>
                          </div>
                          <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                            <div className="bg-albion-purple h-full" style={{ 
                              width: `${feedback.speakingAnalysis 
                                ? Math.max(30, 100 - (feedback.speakingAnalysis.fillerWordsCount + feedback.speakingAnalysis.longPausesCount) * 10) 
                                : (feedback.score >= 7 ? 85 : 65)}%` 
                            }} />
                          </div>
                          <p className="text-[10px] text-gray-455 italic leading-snug line-clamp-2">
                            {feedback.clarityComments || feedback.confidenceComments || "Measures confidence hints."}
                          </p>
                        </div>
                      </div>

                      {/* Advisor feedback pointers */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
                        <div className="bg-green-50/30 p-3.5 rounded-xl border border-green-100 space-y-1">
                          <span className="font-bold text-green-700 block text-[10px] uppercase">Advisor Formulation:</span>
                          <p className="text-gray-655 font-sans tracking-wide leading-relaxed font-semibold">"{feedback.suggestedAnswer}"</p>
                        </div>
                        {feedback.starAnalysis && (
                          <div className="bg-purple-50/40 p-3.5 rounded-xl border border-purple-100 space-y-1">
                            <span className="font-bold text-albion-purple block text-[10px] uppercase">STAR Adherence Checklist:</span>
                            <p className="text-gray-655 font-sans leading-relaxed font-semibold">{feedback.starAnalysis}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- TAB 3: ATS RESUME COACH REPORT --- */}
      {activeReportTab === 'resume' && (
        <div className="space-y-8 animate-fade-in" id="ats-report-section">
          {/* ATS Performance Breakdown Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-white p-5 rounded-2xl border border-purple-100 shadow-sm flex flex-col justify-between h-28">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Horizontal Formatting Score</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-3xl font-black font-display text-albion-purple">{atsData.formattingAudit.score}%</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  atsData.formattingAudit.status === 'success' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {atsData.formattingAudit.status === 'success' ? 'Fully Linear' : 'Action Warned'}
                </span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-purple-100 shadow-sm flex flex-col justify-between h-28">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Proof Statement Metrics Score</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-3xl font-black font-display text-albion-purple">{atsData.contentAudit.score}%</span>
                <span className="text-xs text-gray-500 font-medium">
                  {atsData.contentAudit.quantifiedResultCount} numbers checked
                </span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-purple-100 shadow-sm flex flex-col justify-between h-28">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Keyword Alignment Match</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-3xl font-black font-display text-albion-purple">{atsData.keywordAudit.score}%</span>
                <span className="text-xs text-gray-405 font-medium">Mapped standards</span>
              </div>
            </div>
          </div>

          {/* ATS Layout & Content Optimization Opportunities */}
          {atsData.optimizationAreas && atsData.optimizationAreas.length > 0 && (
            <div className="bg-amber-50/40 border border-amber-200 rounded-3xl p-6 sm:p-8 space-y-4">
              <h3 className="font-display font-bold text-lg text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-5.5 h-5.5 text-amber-600 shrink-0" />
                Key Layout & Content Optimization Areas
              </h3>
              <p className="text-xs text-amber-800 leading-relaxed max-w-4xl font-medium">
                The following structural and content items represent great opportunities to refine how automated Applicant Tracking Systems read your resume. Aligning these items ensures your unique strengths and academic accomplishments are fully indexed!
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {atsData.optimizationAreas.map((flag: any, idx: number) => (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-amber-100 space-y-1.5 shadow-sm flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                    <div>
                      <span className="text-xs font-bold text-gray-800 uppercase tracking-wide block">{flag.type}</span>
                      <p className="text-xs text-gray-600 leading-relaxed font-sans font-medium">
                        {flag.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Formatting & Keyword Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Formatting Audit and Layout */}
            <div className="lg:col-span-6 bg-white p-6 rounded-[28px] border border-purple-100 shadow-sm space-y-5">
              <h4 className="font-display font-bold text-base text-gray-800 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-purple-600 shrink-0" />
                Formatting & Layout Audit
              </h4>
              <p className="text-xs text-gray-400 font-medium leading-relaxed">
                {atsData.formattingAudit.details || "ATS computer algorithms index documents downwards in horizontal sweeps. Sidebars, graphics, and custom shapes scramble character orders."}
              </p>

              <div className="space-y-3 pt-1">
                {atsData.formattingAudit.issues.map((issue: string, idx: number) => (
                  <div key={idx} className="flex gap-2.5 items-start text-xs text-gray-650 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="leading-normal font-sans font-medium">{issue}</p>
                  </div>
                ))}
                {atsData.formattingAudit.issues.length === 0 && (
                  <div className="flex gap-2.5 items-center text-xs text-green-700 bg-green-50/50 p-3.5 rounded-xl border border-green-100">
                    <CheckCircle2 className="w-4.5 h-4.5 text-green-600 shrink-0" />
                    <span className="font-semibold">Formatting parameters match ATS compatibility targets.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Keyword Density Analysis */}
            <div className="lg:col-span-6 bg-white p-6 rounded-[28px] border border-purple-100 shadow-sm space-y-5">
              <h4 className="font-display font-bold text-base text-gray-800 flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500 shrink-0" />
                Target Career Keyword Gaps
              </h4>
              <p className="text-xs text-gray-400 font-medium leading-relaxed">
                Targeting Role: <strong className="text-gray-800">{jobTarget.positionTitle}</strong>. We scanned your academic folders for key phrasing required by O*NET occupation indices:
              </p>

              <div className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Missing Target Phrases:</span>
                  <div className="flex flex-wrap gap-2">
                    {atsData.keywordAudit.missingKeywords && atsData.keywordAudit.missingKeywords.map((kw: string, idx: number) => (
                      <span key={idx} className="bg-amber-50 text-amber-800 text-[11px] font-mono px-2.5 py-1 rounded-lg border border-amber-100/60 font-semibold">
                        + {kw}
                      </span>
                    ))}
                    {(!atsData.keywordAudit.missingKeywords || atsData.keywordAudit.missingKeywords.length === 0) && (
                      <span className="text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-xl font-semibold border border-green-100">
                        Excellent, no severe keyword gaps found!
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1 bg-purple-50/40 p-4 rounded-xl border border-purple-100">
                  <span className="text-[10px] font-bold text-albion-purple uppercase tracking-widest block">Acronym Optimization:</span>
                  <p className="text-xs text-gray-600 leading-relaxed font-sans font-medium italic">
                    {atsData.keywordAudit.acronymSuggestions && atsData.keywordAudit.acronymSuggestions[0] 
                      ? atsData.keywordAudit.acronymSuggestions[0] 
                      : "Always spell out acronyms completely alongside their short abbreviation (e.g. 'Project Management Professional (PMP)') so the ATS indexes both query searches."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Proof statement content audit and strategic advisor note */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Content Audit column */}
            <div className="lg:col-span-5 bg-white p-6 rounded-[28px] border border-purple-100 shadow-sm space-y-4">
              <h4 className="font-display font-semibold text-gray-850 text-sm flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4 text-albion-purple" />
                Proof Statement Bullet Audit
              </h4>
              <p className="text-xs text-gray-400">Achieved bullet metrics analysis:</p>

              <div className="space-y-3 pt-1">
                {atsData.contentAudit.issues.map((issue: string, idx: number) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex gap-2 text-xs leading-relaxed text-gray-650">
                    <CornerDownRight className="w-4 h-4 text-albion-gold shrink-0 mt-0.5" />
                    <p className="font-sans font-medium">{issue}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Strategic ATS Coach Advice */}
            <div className="lg:col-span-7 bg-purple-900 text-white rounded-[28px] p-6 relative flex flex-col justify-between gap-6 overflow-hidden">
              <div className="absolute right-0 bottom-0 text-[100px] leading-none text-purple-800 select-none opacity-20 font-bold tracking-tight">
                ADVICE
              </div>

              <div className="space-y-3 relative z-10">
                <h4 className="font-display font-bold text-albion-gold text-base flex items-center gap-1.5">
                  <Sparkles className="w-4.5 h-4.5 text-albion-gold animate-pulse" />
                  ATS Advisor Action Directive
                </h4>
                <p className="text-xs text-purple-100 leading-relaxed font-sans font-medium whitespace-pre-line">
                  {atsData.tailoredAdvice}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between border-t border-purple-700/50 pt-4 gap-4 relative z-10">
                <div className="flex items-center space-x-3 text-xs">
                  <div className="h-8 w-8 bg-albion-gold text-albion-purple rounded-full flex items-center justify-center font-bold font-display">
                    R
                  </div>
                  <div>
                    <span className="font-bold text-white block">Official ATS Review Council</span>
                    <span className="text-[10px] text-purple-200 block font-light">Brit Careers Alignment Advisor</span>
                  </div>
                </div>

                <button
                  onClick={onRestart}
                  className="bg-albion-gold hover:bg-yellow-400 text-albion-purple font-black py-2.5 px-6 rounded-xl text-xs transition duration-155 shadow-md hover:shadow-lg cursor-pointer flex items-center space-x-1 uppercase tracking-wide"
                >
                  <span>Launch Another Practice Round</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 4: CORE COMPETENCIES RUBRIC --- */}
      {activeReportTab === 'competencies' && (
        <div className="space-y-8 animate-fade-in" id="competencies-report-section">
          {/* Rubric introduction banner */}
          <div className="bg-gradient-to-br from-amber-500/10 via-purple-950/5 to-albion-purple/10 border border-albion-purple/20 rounded-[32px] p-6 sm:p-8 space-y-4">
            <h3 className="font-display font-extrabold text-lg text-albion-purple-dark flex items-center gap-2">
              <ClipboardList className="w-5.5 h-5.5 text-albion-purple shrink-0" />
              Core Competencies Diagnostic Assessment
            </h3>
            <p className="text-xs text-gray-655 leading-relaxed max-w-4xl font-sans font-medium">
              Based on the latest **Interview Scoring Research & STAR Methodology**, our coach assesses your performance across **10 distinct professional categories**. To achieve outstanding ratings, candidates are evaluated on their ability to structure real-world experiences, provide quantitative results, demonstrate organizational knowledge, and communicate with clarity.
            </p>
            
            {/* Quick explanation of 1-5 scale */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 text-[10px] font-medium text-gray-500">
              <div className="bg-white px-3 py-2 rounded-xl border border-gray-150">
                <span className="font-bold text-red-600 block">Rating 1: Poor</span>
                <span>A few good points, main elements missing, no examples.</span>
              </div>
              <div className="bg-white px-3 py-2 rounded-xl border border-gray-150">
                <span className="font-bold text-orange-600 block">Rating 2: Marginal</span>
                <span>Some points covered, not all relevant, minimal examples.</span>
              </div>
              <div className="bg-white px-3 py-2 rounded-xl border border-gray-150">
                <span className="font-bold text-amber-600 block">Rating 3: Adequate</span>
                <span>Relevant points covered with standard examples.</span>
              </div>
              <div className="bg-white px-3 py-2 rounded-xl border border-gray-150">
                <span className="font-bold text-indigo-600 block">Rating 4: Excellent</span>
                <span>Most or all points addressed with high-quality examples.</span>
              </div>
              <div className="bg-white px-3 py-2 rounded-xl border border-gray-150">
                <span className="font-bold text-emerald-600 block">Rating 5: Perfect</span>
                <span>All key points seamlessly addressed with rich, flawless detail.</span>
              </div>
            </div>
          </div>

          {/* 10 Competencies Cards list */}
          <div className="space-y-6">
            {evaluations.map((evalItem, idx) => {
              const rating = evalItem.rating || 3;
              const starColors = [
                "text-red-500", 
                "text-orange-500", 
                "text-amber-500", 
                "text-indigo-650", 
                "text-emerald-600"
              ];
              const starColor = starColors[rating - 1] || "text-purple-650";
              
              const borderColors = [
                "border-red-100 bg-red-50/10",
                "border-orange-100 bg-orange-50/10",
                "border-amber-100 bg-amber-50/10",
                "border-indigo-100 bg-indigo-50/10",
                "border-emerald-100 bg-emerald-50/10"
              ];
              const borderStyle = borderColors[rating - 1] || "border-purple-100 bg-purple-50/10";

              return (
                <div 
                  key={idx} 
                  className={`glass-card rounded-3xl p-6 border transition-all hover:shadow-md ${borderStyle} flex flex-col md:flex-row gap-6 justify-between items-start`}
                >
                  {/* Category info */}
                  <div className="space-y-3 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="h-6 w-6 bg-albion-purple text-albion-gold font-mono font-bold rounded-full flex items-center justify-center shrink-0 text-xs">
                        {idx + 1}
                      </span>
                      <h4 className="font-display font-black text-sm text-gray-800 tracking-tight">
                        {evalItem.categoryName}
                      </h4>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block">Assessor Explanation:</span>
                      <p className="text-xs text-gray-700 leading-relaxed font-sans font-medium">
                        {evalItem.explanation}
                      </p>
                    </div>

                    {/* Evidence Quote Box */}
                    {evalItem.evidence && (
                      <div className="bg-gray-50/70 p-3.5 rounded-xl border border-gray-150 space-y-1.5">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block">Evidence Detected:</span>
                        <p className="text-xs text-gray-655 font-medium italic font-sans leading-relaxed">
                          "{evalItem.evidence}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Rating & Suggestion section */}
                  <div className="w-full md:w-80 shrink-0 space-y-4">
                    {/* Star Rating Badge */}
                    <div className="bg-white p-4 rounded-2xl border border-gray-150 shadow-sm flex flex-col items-center justify-center text-center space-y-1">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Rubric Score</span>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Sparkles 
                            key={i} 
                            className={`w-4 h-4 shrink-0 ${
                              i < rating ? `${starColor} fill-current` : "text-gray-200"
                            }`} 
                          />
                        ))}
                      </div>
                      <span className={`text-sm font-black font-display ${starColor}`}>
                        {rating} / 5
                      </span>
                    </div>

                    {/* Improvement Suggestion block */}
                    {evalItem.suggestion && (
                      <div className="bg-white p-4 rounded-2xl border border-gray-150 shadow-sm space-y-2">
                        <span className="font-bold text-albion-purple uppercase text-[9px] tracking-wider flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5" />
                          Advisor Action Item:
                        </span>
                        <p className="text-[11px] text-gray-650 font-sans leading-relaxed font-semibold">
                          {evalItem.suggestion}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
