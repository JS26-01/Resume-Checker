import React, { useState } from 'react';
import { JobTarget, InterviewType, DifficultyLevel } from '../types';
import { Briefcase, Building2, Flame, HelpCircle, School, Compass, ShieldAlert, Sparkles } from 'lucide-react';

interface InterviewPreparerProps {
  onStartPlanning: (target: JobTarget) => void;
  isLoading: boolean;
}

export default function InterviewPreparer({ onStartPlanning, isLoading }: InterviewPreparerProps) {
  const [position, setPosition] = useState('');
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState('');
  const [type, setType] = useState<InterviewType>('general');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('standard');
  const [format, setFormat] = useState<'one-on-one' | 'panel-board'>('one-on-one');
  const [jobDescription, setJobDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!position.trim()) return;

    onStartPlanning({
      positionTitle: position.trim(),
      companyName: company.trim() || 'General Recruiter',
      industry: industry.trim() || 'General Services',
      interviewType: type,
      difficulty,
      focusCategory: undefined,
      interviewFormat: format,
      jobDescription: jobDescription.trim() || undefined
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl mx-auto" id="preparer-form">
      {/* Intro section */}
      <div className="glass-card-deep p-6 sm:p-8 rounded-[32px] space-y-2">
        <span className="text-xs font-mono tracking-widest text-albion-gold font-bold uppercase block">
          Phase 2 of 2: Interview Target & Configuration
        </span>
        <h2 className="text-2xl font-bold text-albion-purple-dark flex items-center gap-2">
          <Compass className="w-6 h-6 text-albion-purple" />
          Map Your Destination
        </h2>
        <p className="text-gray-550 text-sm leading-relaxed">
          Enter the specific career opportunity or internship you are targeting. We will tailor the questions and scoring criteria to fit your desired role perfectly.
        </p>
      </div>

      {/* Main Parameter inputs */}
      <div className="glass-card rounded-[28px] p-6 sm:p-8 space-y-6">
        <h3 className="font-display font-semibold text-gray-800 border-b border-gray-100 pb-2 flex items-center gap-1">
          <Briefcase className="w-4 h-4 text-albion-purple" />
          Interview Target Configuration
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Target Position Title *
            </label>
            <div className="relative">
              <input
                id="target-position"
                type="text"
                required
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="e.g. Research Fellow, Business Analyst"
                className="w-full px-4 py-2 bg-gray-50/50 text-sm rounded-xl border border-purple-100 focus:border-albion-purple focus:ring-1 focus:ring-albion-purple outline-none font-medium text-gray-800"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Company / Organization
            </label>
            <div className="relative">
              <input
                id="target-company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Pfizer, Albion Career Center"
                className="w-full px-4 py-2 bg-gray-50/50 text-sm rounded-xl border border-purple-100 focus:border-albion-purple focus:ring-1 focus:ring-albion-purple outline-none font-medium text-gray-800"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Industry Sector
            </label>
            <input
              id="target-industry"
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Biotechnology, Non-Profit, Higher Ed"
              className="w-full px-4 py-2 bg-gray-50/50 text-sm rounded-xl border border-purple-100 focus:border-albion-purple focus:ring-1 focus:ring-albion-purple outline-none font-medium text-gray-800"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Vibe / Interview Flow
            </label>
            <select
              id="target-type"
              value={type}
              onChange={(e) => setType(e.target.value as InterviewType)}
              className="w-full px-4 py-2 bg-gray-50/50 text-sm rounded-xl border border-purple-100 focus:border-albion-purple focus:ring-1 focus:ring-albion-purple outline-none font-medium text-gray-800 cursor-pointer"
            >
              <option value="general">General Screening (Fit, Strengths)</option>
              <option value="behavioral">Behavioral (Tell me about a time...)</option>
              <option value="technical">Technical / Analytical Domain</option>
              <option value="internship">Internship Specific Vibe</option>
              <option value="research">Science Research Selection board</option>
              <option value="campus_job">Campus Job or Student Aide</option>
              <option value="graduate_school">Grad School Board / Thesis Committee</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Interview Format
            </label>
            <select
              id="target-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as 'one-on-one' | 'panel-board')}
              className="w-full px-4 py-2 bg-gray-50/50 text-sm rounded-xl border border-purple-100 focus:border-albion-purple focus:ring-1 focus:ring-albion-purple outline-none font-medium text-gray-800 cursor-pointer"
            >
              <option value="one-on-one">One-on-One Interview</option>
              <option value="panel-board">Panel Board (HR, Tech, PM)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
            Job Description / Target Competency Areas (Optional)
          </label>
          <p className="text-[10px] text-gray-400 mb-1.5 leading-tight">
            Paste the job posting description, key duties, or special requirements to tailor mock questions and focus audits.
          </p>
          <textarea
            id="target-job-desc"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="e.g., We are looking for an analyst to conduct database queries, manage stakeholder relations, present insights, and write Python scripts..."
            rows={3}
            className="w-full px-4 py-2 bg-gray-50/50 text-xs rounded-xl border border-purple-100 focus:border-albion-purple focus:ring-1 focus:ring-albion-purple outline-none font-medium text-gray-800 resize-y"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
            Assessor Difficulty Level
            <span className="text-[10px] text-gray-400 font-normal lowercase ml-1.5">
              (Beginner mode is extra encouraging & lenient)
            </span>
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'beginner', label: 'Beginner', desc: 'Slightly shorter questions, generous tips' },
              { id: 'standard', label: 'Standard', desc: 'Standard business panel expectation' },
              { id: 'challenging', label: 'Challenging', desc: 'Asks smart follow-ups, strict grading' },
            ].map((diff) => (
              <button
                key={diff.id}
                id={`btn-difficulty-${diff.id}`}
                type="button"
                onClick={() => setDifficulty(diff.id as DifficultyLevel)}
                className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                  difficulty === diff.id
                    ? 'border-albion-purple bg-purple-50/70 text-albion-purple-dark shadow-sm scale-102 font-semibold'
                    : 'border-white/30 bg-white/45 hover:bg-white/70 text-gray-500'
                }`}
              >
                <p className="text-xs font-bold">{diff.label}</p>
                <p className="text-[10px] mt-0.5 opacity-80 leading-tight hidden sm:block">{diff.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <button
            id="btn-generate-interview"
            type="submit"
            disabled={isLoading || !position.trim()}
            className="w-full bg-albion-purple hover:bg-albion-purple-light text-white font-bold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition duration-220 disabled:opacity-50 cursor-pointer flex items-center justify-center space-x-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Weaving Your Custom Interview Questions...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-albion-gold-light" />
                <span className="text-sm">Begin Mock Interview Session</span>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
