import React from 'react';
import { Sparkles, FileText, ArrowLeft, ChevronRight, Bot, Compass, CheckCircle } from 'lucide-react';

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
          Boost your hiring potential. Whether you want a conversational, guided overhaul of an existing draft or a classic, high-fidelity template builder, we have you covered.
        </p>
      </div>

      {/* Grid Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
        {/* Card A: Conversational Resume Enhancer */}
        <div className="glass-card-deep p-8 rounded-[32px] border border-emerald-100 bg-white/75 flex flex-col justify-between space-y-8 hover:shadow-lg transition duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full blur-2xl opacity-60 -mr-8 -mt-8 group-hover:scale-110 transition duration-300"></div>
          
          <div className="space-y-6 relative">
            {/* Tag & Icon */}
            <div className="flex items-center justify-between">
              <span className="bg-emerald-50 text-emerald-700 text-[10px] font-mono font-bold uppercase tracking-widest px-3 py-1 rounded-full border border-emerald-100">
                RECOMMENDED • CONVERSATIONAL COACH
              </span>
              <div className="bg-emerald-500/10 h-12 w-12 rounded-2xl flex items-center justify-center text-emerald-600">
                <Sparkles className="w-6 h-6 animate-pulse text-emerald-600" />
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-display font-extrabold text-gray-900 group-hover:text-emerald-700 transition duration-150">
                Conversational Enhancer
              </h2>
              <p className="text-xs text-gray-500 leading-relaxed font-light">
                Upload or paste any existing text (even military papers, basic outlines, or casual bullet points). Engage in a guided 3-stage dialogue with a supportive coach to translate jargon, inject quantitative metrics, and finalize an executive CV.
              </p>
            </div>

            {/* List of Benefits */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">How it works:</h3>
              <ul className="space-y-2.5 text-xs text-gray-600">
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span><strong>Tone & Clarity Audit:</strong> Refines narrative phrasing, passive fillers, and casual expressions.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span><strong>Audience Alignment:</strong> Restructures skills and summary for your specific target role.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span><strong>Quantitative Deep-dive:</strong> Asks supportive questions to uncover metrics recruiters look for.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span><strong>Instant Export:</strong> Directly download as Microsoft Word (.doc) or print pristine PDF.</span>
                </li>
              </ul>
            </div>
          </div>

          <button
            onClick={onSelectEnhancer}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-2xl text-xs transition duration-150 shadow-md flex items-center justify-center gap-1.5 cursor-pointer relative z-10"
          >
            <span>Launch Conversational Enhancer</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Card B: Interactive Template Builder */}
        <div className="glass-card-deep p-8 rounded-[32px] border border-purple-100 bg-white/75 flex flex-col justify-between space-y-8 hover:shadow-lg transition duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-full blur-2xl opacity-60 -mr-8 -mt-8 group-hover:scale-110 transition duration-300"></div>

          <div className="space-y-6 relative">
            {/* Tag & Icon */}
            <div className="flex items-center justify-between">
              <span className="bg-purple-50 text-albion-purple text-[10px] font-mono font-bold uppercase tracking-widest px-3 py-1 rounded-full border border-purple-100">
                CLASSIC TEMPLATE • GUIDED BUILDER
              </span>
              <div className="bg-purple-500/10 h-12 w-12 rounded-2xl flex items-center justify-center text-albion-purple">
                <FileText className="w-6 h-6 text-albion-purple" />
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
                  <span><strong>Hot Reloading Canvas:</strong> Watch your Changes reflect immediately on a printable sheet.</span>
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
