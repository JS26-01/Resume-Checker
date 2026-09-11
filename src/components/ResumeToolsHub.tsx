import React from 'react';
import { Sparkles, FileText, ArrowLeft, ChevronRight, Bot, Clock, CheckCircle } from 'lucide-react';

interface ResumeToolsHubProps {
  onSelectEnhancer: () => void;
  onSelectBuilder: () => void;
  onBack: () => void;
}

export default function ResumeToolsHub({ onSelectEnhancer, onSelectBuilder, onBack }: ResumeToolsHubProps) {
  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-12" id="resume-tools-hub">
      {/* Header Controls */}
      <div className="flex items-center justify-between pb-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-albion-purple transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Resume Panel</span>
        </button>

        <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-purple-400 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-100">
          Albion Career Suite
        </span>
      </div>

      {/* Hero Welcome Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <h1 className="text-3xl font-display font-black text-gray-900 tracking-tight leading-tight">
          Choose Your Path to an <span className="text-albion-purple">Elite CV</span>
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed font-light">
          Boost your hiring potential. Build a high-fidelity, ATS-optimized resume using our interactive template builder.
        </p>
      </div>

      {/* Grid Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
        {/* Card A: Conversational Resume Enhancer (Hidden / Coming Soon for Version Update) */}
        <div className="glass-card-deep p-8 rounded-[32px] border border-amber-200/70 bg-gradient-to-b from-amber-50/30 to-white flex flex-col justify-between space-y-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-200/20 rounded-full blur-2xl -mr-8 -mt-8"></div>
          
          <div className="space-y-6 relative">
            {/* Tag & Icon */}
            <div className="flex items-center justify-between">
              <span className="bg-amber-100 text-amber-900 text-[10px] font-mono font-bold uppercase tracking-widest px-3 py-1 rounded-full border border-amber-200/80 flex items-center gap-1.5 shadow-sm">
                <Clock className="w-3 h-3 text-amber-600 animate-pulse" />
                <span>COMING SOON • VERSION UPDATE</span>
              </span>
              <div className="bg-amber-500/10 h-12 w-12 rounded-2xl flex items-center justify-center text-amber-600 border border-amber-200/50">
                <Bot className="w-6 h-6 text-amber-600" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-display font-extrabold text-gray-800">
                  Conversational Enhancer
                </h2>
                <span className="bg-purple-100 text-albion-purple font-mono font-bold text-[10px] px-2 py-0.5 rounded-md uppercase">
                  v2.0 Testing
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed font-light">
                This feature is currently offline for internal quality testing and bug fixes in preparation for an upcoming version update.
              </p>
            </div>

            {/* List of Benefits / Feature Preview */}
            <div className="space-y-3 pt-2 bg-amber-50/40 p-4 rounded-2xl border border-amber-100">
              <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Upcoming Feature Capabilities:</span>
              </h3>
              <ul className="space-y-2 text-xs text-gray-600">
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span><strong>3-Stage Guided Dialogue:</strong> Interactive coaching to refine raw resume text.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span><strong>Quantitative Metric Deep-dive:</strong> Automated prompt engine for bullet metrics.</span>
                </li>
              </ul>
            </div>
          </div>

          <button
            disabled
            className="w-full bg-slate-100 border border-slate-200 text-slate-400 font-bold py-4 rounded-2xl text-xs flex items-center justify-center gap-2 cursor-not-allowed relative z-10 shadow-inner"
          >
            <Clock className="w-4 h-4 text-amber-600" />
            <span>Coming Soon in Next Release</span>
          </button>
        </div>

        {/* Card B: Interactive Template Builder (Active Primary Tool) */}
        <div className="glass-card-deep p-8 rounded-[32px] border-2 border-purple-200 bg-white/90 flex flex-col justify-between space-y-8 hover:shadow-xl transition duration-300 relative overflow-hidden group shadow-md">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-100 rounded-full blur-2xl opacity-70 -mr-8 -mt-8 group-hover:scale-110 transition duration-300"></div>

          <div className="space-y-6 relative">
            {/* Tag & Icon */}
            <div className="flex items-center justify-between">
              <span className="bg-purple-100 text-albion-purple text-[10px] font-mono font-bold uppercase tracking-widest px-3 py-1 rounded-full border border-purple-200 shadow-sm">
                PRIMARY TOOL • HARVARD TEMPLATE
              </span>
              <div className="bg-purple-600 text-white h-12 w-12 rounded-2xl flex items-center justify-center shadow-md">
                <FileText className="w-6 h-6 text-albion-gold" />
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-display font-extrabold text-gray-900 group-hover:text-albion-purple transition duration-150">
                Interactive Template Builder
              </h2>
              <p className="text-xs text-gray-500 leading-relaxed font-light">
                Construct your CV manually using a clean, step-by-step form layout. Instantly visualize your resume in a beautiful Harvard/Finance standard single-page template with real-time hot-reloading updates on the side.
              </p>
            </div>

            {/* List of Benefits */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">How it works:</h3>
              <ul className="space-y-2.5 text-xs text-gray-600">
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-albion-purple shrink-0 mt-0.5" />
                  <span><strong>Guided Sections:</strong> Build Education, Experience, Activities, and Skills step-by-step.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-albion-purple shrink-0 mt-0.5" />
                  <span><strong>Bootstrap Templates:</strong> Instantly seed details with Business or Lab Research pre-sets.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-albion-purple shrink-0 mt-0.5" />
                  <span><strong>Hot Reloading Canvas:</strong> Watch your changes reflect immediately on a printable sheet.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-albion-purple shrink-0 mt-0.5" />
                  <span><strong>Pristine Format:</strong> Built specifically to comply with corporate ATS and academic standards.</span>
                </li>
              </ul>
            </div>
          </div>

          <button
            onClick={onSelectBuilder}
            className="w-full bg-albion-purple hover:bg-[#341b50] text-white font-bold py-4 rounded-2xl text-xs transition duration-150 shadow-md flex items-center justify-center gap-1.5 cursor-pointer relative z-10"
          >
            <span>Launch Interactive Builder</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
