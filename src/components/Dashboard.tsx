import { InterviewSession } from '../types';
import { Calendar, ChevronRight, Award, Plus, FolderSync, History, Check, LineChart, FileText, ArrowRight, ShieldAlert } from 'lucide-react';

interface DashboardProps {
  sessions: InterviewSession[];
  onStartNewSession: () => void;
  onViewSessionDetail: (session: InterviewSession) => void;
  savedResume: any;
  onGoToResume: () => void;
  isGuest?: boolean;
  onConnectAccount?: () => void;
}

export default function Dashboard({
  sessions,
  onStartNewSession,
  onViewSessionDetail,
  savedResume,
  onGoToResume,
  isGuest,
  onConnectAccount,
}: DashboardProps) {
  // Aggregate Metrics
  const completed = sessions.filter(s => s.isCompleted);
  const completedCount = completed.length;

  const totalScores = completed.reduce((sum, s) => sum + (s.finalReport?.overallScore || 0), 0);
  const averageScore = completedCount > 0 ? Math.round(totalScores / completedCount) : 0;

  // Compute category distributions
  const categoriesMap: { [cat: string]: number } = {};
  completed.forEach(s => {
    const focus = s.jobTarget.focusCategory || 'General liberal arts';
    categoriesMap[focus] = (categoriesMap[focus] || 0) + 1;
  });

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
    if (score >= 80) return 'text-blue-600 bg-blue-50 border-blue-100';
    if (score >= 70) return 'text-amber-600 bg-amber-50 border-amber-100';
    return 'text-red-500 bg-red-50 border-red-100';
  };

  return (
    <div className="space-y-8" id="dashboard-wrapper">
      {/* Dynamic Welcome card tailored to Albion students */}
      <div className="glass-card-deep p-6 sm:p-8 rounded-[32px] flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-3 relative z-10">
          <span className="text-xs font-mono tracking-widest text-albion-gold font-bold uppercase block">
            Brit Career Progress Hub
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-albion-purple-dark tracking-tight">
            Welcome to Your Progress Hub!
          </h2>
          <p className="text-sm text-gray-550 max-w-xl leading-relaxed">
            We help you practice job interviews and improve your resume. Use this page to track your practice history and see your scores improve over time.
          </p>
        </div>

        <button
          id="btn-dash-new-session"
          onClick={onStartNewSession}
          className="bg-albion-purple hover:bg-albion-purple-light text-white font-bold py-3.5 px-6 rounded-xl shadow-lg hover:shadow-xl transition duration-220 cursor-pointer flex items-center space-x-1.5 shrink-0"
        >
          <Plus className="w-4 h-4 text-albion-gold-light" />
          <span>Start Practice Session</span>
        </button>
      </div>

      {completedCount === 0 ? (
        /* Empty State */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Quick Start wizard */}
          <div className="lg:col-span-8 glass-card rounded-[32px] p-8 text-center space-y-6">
            <div className="bg-purple-50 h-16 w-16 rounded-2xl flex items-center justify-center text-albion-purple mx-auto border border-purple-100">
              <LineChart className="w-8 h-8" />
            </div>

            <div className="space-y-2 max-w-lg mx-auto">
              <h3 className="text-xl font-bold text-albion-purple-dark">You have not completed any practice runs yet!</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Complete your first mock interview to unlock your score history, see personal feedback on your resume, and get simple tips to improve your answers.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto pt-2">
              <button
                id="btn-dash-start"
                onClick={onStartNewSession}
                className="w-full bg-albion-purple hover:bg-albion-purple-light text-white font-bold py-3 px-6 rounded-xl shadow-md transition duration-150 cursor-pointer text-xs"
              >
                Start Mock Interview
              </button>
              
              {!savedResume?.isParsed && (
                <button
                  id="btn-dash-resume"
                  onClick={onGoToResume}
                  className="w-full bg-white hover:bg-gray-50 text-albion-purple-dark border border-purple-200 font-bold py-3 px-6 rounded-xl shadow-sm transition duration-150 cursor-pointer text-xs"
                >
                  Fill Out Resume Details First
                </button>
              )}
            </div>
          </div>

          {/* Guidelines info card on right */}
          <div className="lg:col-span-4 glass-card-deep rounded-[32px] p-6 space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="bg-white border border-purple-150/50 h-10 w-10 rounded-xl flex items-center justify-center text-albion-gold">
                <FolderSync className="w-5 h-5 text-albion-gold-dark" />
              </div>
              <h4 className="font-display font-semibold text-gray-800 leading-snug">
                How It Works
              </h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                Employers love answers that use the <strong>STAR</strong> method (Situation, Task, Action, Result). Our AI coach will read your answers to make sure you include all these parts.
              </p>
            </div>

            <div className="text-xs font-semibold text-[#49266F] space-y-3 block bg-white/40 p-4 rounded-2xl border border-white/40 backdrop-blur-sm shadow-sm">
              <div className="flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-albion-gold" />
                <span>1. Add your resume details</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-albion-gold" />
                <span>2. Pick your target job</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-albion-gold" />
                <span>3. Answer practice questions</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Stateful Dashboard Layout */
        <div className="space-y-8 animate-fade-in">
          {isGuest && (
            <div className="bg-[#49266F]/5 border border-[#49266F]/15 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
              <div className="flex items-center space-x-2 text-[#49266F]">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <span>
                  <strong>Guest Mode Active:</strong> Your sessions and resume drafts are saved transiently for this session, but will not persist if you close your browser. 
                </span>
              </div>
              <button
                onClick={onConnectAccount}
                className="bg-[#49266F] hover:bg-[#5f338d] text-white font-extrabold px-4 py-2 rounded-xl text-[11px] uppercase tracking-wider shrink-0 cursor-pointer"
              >
                Connect Account
              </button>
            </div>
          )}

          {/* Top Level Metric Dashboard cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Completed */}
            <div className="glass-card p-6 rounded-[28px] flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs text-gray-450 font-bold uppercase block">Completed Sessions</span>
                <span className="text-3xl font-black font-display text-albion-purple">{completedCount}</span>
                <span className="text-[10px] text-gray-400 block font-light">Interactive panels</span>
              </div>
              <div className="bg-[#49266F]/10 p-3 rounded-xl border border-purple-100 text-albion-purple shrink-0">
                <Check className="w-6 h-6" />
              </div>
            </div>

            {/* Average Overall Score */}
            <div className="glass-card p-6 rounded-[28px] flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs text-gray-450 font-bold uppercase block">Average Score</span>
                <span className="text-3xl font-black font-display text-[#49266F]">{averageScore}%</span>
                <span className="text-[10px] text-gray-400 block font-light">Assessor rating metric</span>
              </div>
              <div className="bg-[#f2c057]/15 p-3 rounded-xl border border-white/20 text-[#a37612] shrink-0">
                <Award className="w-6 h-6" />
              </div>
            </div>

            {/* Latest Progress */}
            <div className="glass-card p-6 rounded-[28px] flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs text-gray-450 font-bold uppercase block">Latest rating</span>
                <span className="text-3xl font-black font-display text-albion-purple">
                  {completed[completed.length - 1]?.finalReport?.overallScore || 0}%
                </span>
                <span className="text-[10px] text-gray-400 block font-light">Last session prep readiness</span>
              </div>
              <div className="bg-indigo-50/50 p-3 rounded-xl border border-white/20 text-indigo-700 shrink-0">
                <LineChart className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Session Logs table on Left */}
            <div className="lg:col-span-8 glass-card rounded-[28px] p-6 space-y-4">
              <h3 className="font-display font-bold text-lg text-albion-purple-dark">My Past Sessions & Reports</h3>
              <p className="text-xs text-gray-400">Click any session to view target roles details and granular final reports.</p>

              <div className="space-y-3 pt-2">
                {[...completed].reverse().map((ses) => (
                  <div
                    key={ses.id}
                    id={`session-row-${ses.id}`}
                    onClick={() => onViewSessionDetail(ses)}
                    className="p-4 rounded-2xl border border-white/25 hover:border-[#49266F]/35 hover:bg-white/40 flex justify-between items-center transition cursor-pointer gap-4 group"
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap gap-1">
                        <strong className="text-xs text-gray-800 font-bold truncate block">
                          {ses.jobTarget.positionTitle}
                        </strong>
                        <span className="text-gray-400 text-xs hidden sm:inline">•</span>
                        <span className="text-xs text-gray-500 font-medium truncate block">
                          {ses.jobTarget.companyName}
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-2 text-[10px] text-gray-400 font-sans">
                        <Calendar className="w-3 h-3" />
                        <span>Date: {ses.date}</span>
                        {ses.jobTarget.focusCategory && (
                          <>
                            <span>•</span>
                            <span className="text-albion-purple font-semibold">{ses.jobTarget.focusCategory}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 shrink-0">
                      {ses.finalReport && (
                        <div className={`px-3 py-1 rounded-full text-xs font-bold border ${getScoreColor(ses.finalReport.overallScore)}`}>
                          Overall: {ses.finalReport.overallScore}%
                        </div>
                      )}
                      <ChevronRight className="w-4 h-4 text-purple-300 group-hover:text-albion-purple transition" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Performance analysis & focus metrics on Right */}
            <div className="lg:col-span-4 glass-card rounded-[28px] p-6 space-y-6 flex flex-col justify-between">
              <div className="space-y-4">
                <h4 className="font-display font-bold text-xs uppercase tracking-widest text-albion-purple-dark">
                  Target focal Areas Count
                </h4>
                
                <div className="space-y-3 pt-2 text-xs">
                  {Object.keys(categoriesMap).map((cat, i) => (
                    <div key={i} className="flex justify-between items-center border-b border-gray-100 pb-2">
                      <span className="text-gray-600 font-medium">{cat}</span>
                      <span className="bg-purple-50 border border-purple-100 text-albion-purple px-2 py-0.5 rounded font-mono font-bold">
                        {categoriesMap[cat]} round{categoriesMap[cat] > 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick tip */}
              <div className="bg-white/40 p-4 rounded-2xl border border-white/40 backdrop-blur-sm text-xs text-gray-600 pt-1 mt-6">
                <span className="font-bold text-[#49266F] uppercase text-[10px] block mb-1">
                  Advisory Insight
                </span>
                <p className="leading-relaxed">
                  Excellent consistency! Try shifting categories (e.g. to Liberal Arts Transferable Skills or Graduate School selection boards) to build balanced multidisciplinary responses.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
