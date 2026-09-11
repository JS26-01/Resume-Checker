import React, { useState, useEffect } from 'react';
import { JobTarget, InterviewType, DifficultyLevel } from '../types';
import { Briefcase, Compass, Sparkles, Stethoscope, Building, CheckCircle2 } from 'lucide-react';

interface InterviewPreparerProps {
  onStartPlanning: (target: JobTarget) => void;
  isLoading: boolean;
  initialTrack?: 'regular' | 'medical_school';
}

export default function InterviewPreparer({ onStartPlanning, isLoading, initialTrack = 'regular' }: InterviewPreparerProps) {
  const [track, setTrack] = useState<'regular' | 'medical_school'>(initialTrack);
  const [position, setPosition] = useState('');
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState('');
  const [type, setType] = useState<InterviewType>('general');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('standard');
  const [format, setFormat] = useState<'one-on-one' | 'panel-board'>('one-on-one');
  const [jobDescription, setJobDescription] = useState('');

  // Handle track switches
  useEffect(() => {
    if (track === 'medical_school') {
      setPosition('Medical School Candidate (MD / DO)');
      setCompany('Medical School Admissions Committee (AMCAS / MMI)');
      setIndustry('Medicine & Healthcare');
      setType('medical_school');
      if (!jobDescription) {
        setJobDescription('Reflecting on clinical shadowing, AAMC core competencies (service orientation, bioethics, communication), patient care experiences, and motivation for medicine.');
      }
    } else {
      if (position === 'Medical School Candidate (MD / DO)') setPosition('');
      if (company === 'Medical School Admissions Committee (AMCAS / MMI)') setCompany('');
      if (industry === 'Medicine & Healthcare') setIndustry('');
      if (type === 'medical_school') setType('general');
    }
  }, [track]);

  const selectTrack = (newTrack: 'regular' | 'medical_school') => {
    setTrack(newTrack);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!position.trim()) return;

    onStartPlanning({
      positionTitle: position.trim(),
      companyName: company.trim() || (track === 'medical_school' ? 'Medical School Admissions Committee' : 'General Recruiter'),
      industry: industry.trim() || (track === 'medical_school' ? 'Medicine & Healthcare' : 'General Services'),
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
          Select Interview Track & Target
        </h2>
        <p className="text-gray-550 text-sm leading-relaxed">
          Choose whether you are preparing for a standard job/internship or a medical school admissions panel. We will align questions and evaluation scoring accordingly.
        </p>
      </div>

      {/* TRACK SELECTION OPTIONS */}
      <div className="space-y-3">
        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block">
          Select Interview Track
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Option 1: Regular */}
          <button
            type="button"
            id="track-btn-regular"
            onClick={() => selectTrack('regular')}
            className={`p-5 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex items-start space-x-4 relative ${
              track === 'regular'
                ? 'bg-albion-purple text-white border-albion-purple shadow-xl ring-2 ring-albion-purple/50 scale-102'
                : 'bg-white/80 hover:bg-white text-gray-700 border-purple-100 hover:border-purple-300 shadow-sm'
            }`}
          >
            <div className={`p-3 rounded-xl shrink-0 ${track === 'regular' ? 'bg-white/20 text-albion-gold' : 'bg-purple-50 text-albion-purple'}`}>
              <Briefcase className="w-6 h-6" />
            </div>
            <div className="space-y-2 flex-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm block">Regular Interview</span>
                {track === 'regular' && <CheckCircle2 className="w-4 h-4 text-albion-gold shrink-0" />}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${track === 'regular' ? 'bg-white/20 text-white' : 'bg-purple-100 text-albion-purple'}`}>
                  STAR Method
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${track === 'regular' ? 'bg-white/20 text-white' : 'bg-purple-100 text-albion-purple'}`}>
                  Corporate & Internship
                </span>
              </div>
              <p className={`text-xs leading-relaxed ${track === 'regular' ? 'text-purple-100' : 'text-gray-500'}`}>
                Designed for corporate roles, internships, and behavioral questions evaluated using the STAR method.
              </p>
            </div>
          </button>

          {/* Option 2: Medical School */}
          <button
            type="button"
            id="track-btn-medical"
            onClick={() => selectTrack('medical_school')}
            className={`p-5 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex items-start space-x-4 relative ${
              track === 'medical_school'
                ? 'bg-gradient-to-br from-[#49266F] to-[#2a1343] text-white border-albion-gold shadow-xl ring-2 ring-albion-gold/50 scale-102'
                : 'bg-white/80 hover:bg-white text-gray-700 border-purple-100 hover:border-purple-300 shadow-sm'
            }`}
          >
            <div className={`p-3 rounded-xl shrink-0 ${track === 'medical_school' ? 'bg-albion-gold text-albion-purple-dark' : 'bg-purple-50 text-albion-purple'}`}>
              <Stethoscope className="w-6 h-6" />
            </div>
            <div className="space-y-2 flex-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm block">Medical School Interview</span>
                {track === 'medical_school' && <CheckCircle2 className="w-4 h-4 text-albion-gold shrink-0" />}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${track === 'medical_school' ? 'bg-amber-400/30 text-amber-200' : 'bg-amber-100 text-amber-900'}`}>
                  AAMC Core Competencies
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${track === 'medical_school' ? 'bg-amber-400/30 text-amber-200' : 'bg-amber-100 text-amber-900'}`}>
                  MMI Stations
                </span>
              </div>
              <p className={`text-xs leading-relaxed ${track === 'medical_school' ? 'text-purple-100' : 'text-gray-500'}`}>
                Designed for medical school admissions evaluated on AAMC Core Competencies and MMI scenarios.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Main Parameter inputs */}
      <div className="glass-card rounded-[28px] p-6 sm:p-8 space-y-6">
        <h3 className="font-display font-semibold text-gray-800 border-b border-gray-100 pb-2 flex items-center gap-1.5">
          {track === 'medical_school' ? (
            <>
              <Stethoscope className="w-4 h-4 text-albion-purple" />
              <span>Medical School Admissions Configuration</span>
            </>
          ) : (
            <>
              <Briefcase className="w-4 h-4 text-albion-purple" />
              <span>Interview Target Configuration</span>
            </>
          )}
        </h3>

        {track === 'medical_school' && (
          <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl text-xs text-amber-900 flex items-start space-x-2.5">
            <Stethoscope className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold block text-amber-900 mb-0.5">🩺 Medical School Track Activated</strong>
              Your practice questions will test AAMC 15 Core Competencies, patient care reflections, clinical volunteering experiences, and bioethical MMI scenarios.
            </div>
          </div>
        )}

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
                placeholder={track === 'medical_school' ? 'e.g. Medical School Candidate (MD / DO)' : 'e.g. Research Fellow, Business Analyst'}
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
                placeholder={track === 'medical_school' ? 'e.g. Medical School Admissions Committee' : 'e.g. Pfizer, Albion Career Center'}
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
              placeholder={track === 'medical_school' ? 'e.g. Medicine & Healthcare' : 'e.g. Biotechnology, Non-Profit, Higher Ed'}
              className="w-full px-4 py-2 bg-gray-50/50 text-sm rounded-xl border border-purple-100 focus:border-albion-purple focus:ring-1 focus:ring-albion-purple outline-none font-medium text-gray-800"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
              Question Type
            </label>
            <select
              id="target-type"
              value={type}
              onChange={(e) => setType(e.target.value as InterviewType)}
              className="w-full px-4 py-2 bg-gray-50/50 text-sm rounded-xl border border-purple-100 focus:border-albion-purple focus:ring-1 focus:ring-albion-purple outline-none font-medium text-gray-800 cursor-pointer"
            >
              {track === 'medical_school' ? (
                <>
                  <option value="general">Traditional Questions (Motivation, Why Medicine & Fit)</option>
                  <option value="behavioral">Behavioral Questions (STAR Method, Teamwork & Leadership)</option>
                  <option value="medical_school">Multiple Mini-Interview (MMI) Stations (Bioethics & Dilemmas)</option>
                  <option value="research">Comprehensive Mix (Balanced Traditional, Behavioral & MMI)</option>
                </>
              ) : (
                <>
                  <option value="general">Traditional Questions (Fit, Background & Career Goals)</option>
                  <option value="behavioral">Behavioral Questions (STAR Method & Conflict Resolution)</option>
                  <option value="technical">Technical & Analytical Domain Questions</option>
                  <option value="internship">Internship & Entry-Level Questions</option>
                  <option value="research">Science & Academic Research Selection Board</option>
                  <option value="campus_job">Campus Leadership & Student Aide Questions</option>
                  <option value="graduate_school">Graduate School & Defense Committee</option>
                </>
              )}
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
              <option value="panel-board">Admissions Panel Board</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
            {track === 'medical_school' ? 'Clinical Focus / Competencies / Notes (Optional)' : 'Job Description / Target Competency Areas (Optional)'}
          </label>
          <p className="text-[10px] text-gray-400 mb-1.5 leading-tight">
            {track === 'medical_school' 
              ? 'Add specific clinical shadowing experiences, volunteering details, or special medical school prompt focuses.'
              : 'Paste the job posting description, key duties, or special requirements to tailor mock questions and focus audits.'}
          </p>
          <textarea
            id="target-job-desc"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder={track === 'medical_school'
              ? 'e.g. Shadowed Dr. Smith in emergency medicine for 120 hours, volunteered at community clinic, interested in primary care...'
              : 'e.g. We are looking for an analyst to conduct database queries, manage stakeholder relations...'}
            rows={3}
            className="w-full px-4 py-2 bg-gray-50/50 text-xs rounded-xl border border-purple-100 focus:border-albion-purple focus:ring-1 focus:ring-albion-purple outline-none font-medium text-gray-800 resize-y"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
            Assessor Difficulty Level
            <span className="text-[10px] text-gray-400 font-normal lowercase ml-1.5">
              (Controls scenario length, stakeholder complexity & domain terminology)
            </span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { 
                id: 'basic', 
                label: 'Basic', 
                desc: 'Short, direct, fundamental questions (core motivations, simple scenarios)' 
              },
              { 
                id: 'standard', 
                label: 'Standard', 
                desc: 'Standard-length scenarios requiring stakeholder identification & reasoning' 
              },
              { 
                id: 'challenging', 
                label: 'Challenging', 
                desc: 'Complex multi-layered scenarios with domain terms (SDOH, bioethics, system incentives)' 
              },
            ].map((diff) => (
              <button
                key={diff.id}
                id={`btn-difficulty-${diff.id}`}
                type="button"
                onClick={() => setDifficulty(diff.id as DifficultyLevel)}
                className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                  difficulty === diff.id || (difficulty === 'beginner' && diff.id === 'basic')
                    ? 'border-albion-purple bg-purple-50/70 text-albion-purple-dark shadow-sm scale-102 font-semibold'
                    : 'border-white/30 bg-white/45 hover:bg-white/70 text-gray-500'
                }`}
              >
                <p className="text-xs font-bold text-gray-900">{diff.label}</p>
                <p className="text-[10px] mt-1 text-gray-500 leading-tight">{diff.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Unified Pipeline Banner */}
        <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100 flex items-center justify-between text-[11px] text-purple-900">
          <div className="flex items-center gap-2">
            <span className="font-bold text-purple-700 font-mono uppercase text-[10px] bg-purple-100 px-2 py-0.5 rounded border border-purple-200">
              Unified Recording Pipeline
            </span>
            <span className="text-purple-800 font-medium">
              Captures video & audio transcription. <strong>Audio transcript serves as sole evaluation basis.</strong> Video is saved strictly for candidate self-reflection.
            </span>
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
                <span className="text-sm">
                  {track === 'medical_school' ? 'Begin Medical School Mock Interview' : 'Begin Regular Mock Interview Session'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
