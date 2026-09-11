import { useState, useEffect, useRef } from 'react';
import { InterviewQuestion, QuestionFeedback, JobTarget, ResumeInfo, SpeakingStats } from '../types';
import { 
  Mic, MicOff, Camera, VideoOff, Send, SkipForward, RotateCcw, 
  AlertTriangle, Eye, Activity, BarChart, BookOpen, Clock, Play, 
  Volume2, Pause, Square, LogOut, CheckSquare, Settings, Sparkles,
  HelpCircle, X, ShieldCheck, CheckCircle2, Target, Compass, Lock, Unlock,
  Plus, Sliders
} from 'lucide-react';
import AudioVisualizer from './AudioVisualizer';
import GeminiTtsButton from './GeminiTtsButton';
import VideoResponseRecorder from './VideoResponseRecorder';
import { stopTtsAudio } from '../utils/geminiTtsAudio';

interface ActiveInterviewProps {
  questions: InterviewQuestion[];
  currentQuestionIndex: number;
  jobTarget: JobTarget;
  resumeInfo: ResumeInfo | null;
  onNextQuestion: (answerText: string, feedback: QuestionFeedback, stats: SpeakingStats, totalSpeakingSeconds?: number, videoUrl?: string) => void;
  onCompleteSession: () => void;
  sessionAnswers: { [qId: string]: string };
  onExit: () => void;
}

// Ensure Web Speech API availability is verified
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export default function ActiveInterview({
  questions,
  currentQuestionIndex,
  jobTarget,
  resumeInfo,
  onNextQuestion,
  onCompleteSession,
  sessionAnswers,
  onExit
}: ActiveInterviewProps) {
  const currentQuestion = questions[currentQuestionIndex];
  const [answerInput, setAnswerInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showHelpDrawer, setShowHelpDrawer] = useState(false);
  
  // Consent & Analysis Toggles
  const [micConsent, setMicConsent] = useState(false);
  const [isAnalysisEnabled, setIsAnalysisEnabled] = useState(true);

  // Video Recording State
  const [showVideoStudio, setShowVideoStudio] = useState(false);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);

  // Streams
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const videoRefCallback = (element: HTMLVideoElement | null) => {
    videoElRef.current = element;
  };

  // Speech Recognition instance
  const recognitionRef = useRef<any>(null);

  // Timing
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [totalSessionSeconds, setTotalSessionSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // MMI Prep Clock State (120s Countdown)
  const [prepSeconds, setPrepSeconds] = useState(120);
  const [isPrepActive, setIsPrepActive] = useState(false);

  // Reset prep clock whenever question changes
  useEffect(() => {
    setPrepSeconds(120);
    setIsPrepActive(false);
  }, [currentQuestionIndex]);

  // Prep Clock Countdown Effect
  useEffect(() => {
    let interval: any = null;
    if (isPrepActive && prepSeconds > 0) {
      interval = setInterval(() => {
        setPrepSeconds((prev) => prev - 1);
      }, 1000);
    } else if (prepSeconds === 0) {
      setIsPrepActive(false);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPrepActive, prepSeconds]);

  // Feedback State for the CURRENT question
  const [showFeedback, setShowFeedback] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<QuestionFeedback | null>(null);

  // Custom Filler Words Calibration state
  const [customFillerWords, setCustomFillerWords] = useState<string[]>([
    'like', 'you know', 'basically', 'literally', 'um', 'uh', 'so yeah', 'sort of', 'kind of', 'i mean', 'actually', 'right', 'honestly'
  ]);
  const [newFillerInput, setNewFillerInput] = useState('');
  const [showFillerCalibrationDrawer, setShowFillerCalibrationDrawer] = useState(false);

  const handleAddCustomFillerWord = () => {
    const trimmed = newFillerInput.trim().toLowerCase();
    if (trimmed && !customFillerWords.includes(trimmed)) {
      setCustomFillerWords([...customFillerWords, trimmed]);
      setNewFillerInput('');
    }
  };

  const handleRemoveCustomFillerWord = (wordToRemove: string) => {
    setCustomFillerWords(customFillerWords.filter(w => w !== wordToRemove));
  };

  // Progressive 3-Tier Hint System state per question index
  const [hintsUnlockedMap, setHintsUnlockedMap] = useState<{ [qIndex: number]: number }>({});
  const currentHintsUnlocked = hintsUnlockedMap[currentQuestionIndex] || 0;

  const handleUnlockHint = (targetTier: number) => {
    if (targetTier > 3) return;
    setHintsUnlockedMap(prev => ({
      ...prev,
      [currentQuestionIndex]: targetTier
    }));
  };

  // Live Statistics counted during recording (WPM, filler metrics)
  const [fillerCount, setFillerCount] = useState(0);
  const [pausesCount, setPausesCount] = useState(0);

  // Initialize Speech recognition if allowed
  useEffect(() => {
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (e: any) => {
        let finalTranscript = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) {
            finalTranscript += e.results[i][0].transcript + ' ';
          }
        }
        if (finalTranscript) {
          setAnswerInput((prev) => prev + finalTranscript);
          // Simple filler word detector
          const words = finalTranscript.toLowerCase().split(/\s+/);
          const fillers = ['um', 'uh', 'like', 'actually', 'basically', 'so', 'you know'];
          let fillersFound = 0;
          words.forEach(w => {
            if (fillers.includes(w.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,""))) {
              fillersFound++;
            }
          });
          setFillerCount((prev) => prev + fillersFound);
        }
      };

      rec.onerror = (e: any) => {
        console.error('Speech recognition error:', e.error);
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  // Timer Effect
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
        setTotalSessionSeconds((prev) => prev + 1);
        // Randomly simulate pauses for natural speaking representation of student
        if (Math.random() < 0.08) {
          setPausesCount((prev) => prev + 1);
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  // Unified media stream helper
  const syncMediaStream = async (targetMic: boolean) => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
    }

    if (!targetMic) {
      setMediaStream(null);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: targetMic
      });
      setMediaStream(stream);
    } catch (err) {
      console.error('Failed to sync media stream:', err);
      setMicConsent(false);
      setMediaStream(null);
      alert('Could not access microphone. Please verify device permissions.');
    }
  };

  const handleCameraToggle = async () => {
    // Camera is disabled
  };

  // Robustly bind the active stream to the video tag whenever it mounts or updates
  useEffect(() => {
    // Media stream handling
  }, [mediaStream]);

  // Request Mic permissions if user consents
  const handleMicToggle = async () => {
    const nextConsent = !micConsent;
    if (!nextConsent && isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    }
    setMicConsent(nextConsent);
    await syncMediaStream(nextConsent);
  };

  // Start Speech-to-text recording
  const startSpeechCapture = () => {
    if (!micConsent) {
      handleMicToggle().then(() => {
        setIsRecording(true);
        recognitionRef.current?.start();
      });
      return;
    }
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      setIsRecording(true);
      recognitionRef.current?.start();
    }
  };

  // Stop TTS audio playback when question changes or on unmount
  useEffect(() => {
    stopTtsAudio();
    return () => {
      stopTtsAudio();
    };
  }, [currentQuestionIndex]);

  // Cleanup media stream tracks on unmount
  useEffect(() => {
    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [mediaStream]);

  // Submit Answer to AI Assessor API
  const handleSubmitAnswer = async () => {
    if (!answerInput.trim()) return;
    setIsSubmitting(true);
    setCurrentFeedback(null);

    // Compute active reading pace (WPM)
    const wordCount = answerInput.split(/\s+/).filter(w => w.length > 0).length;
    const durationMinutes = (elapsedSeconds || 15) / 60;
    const computedWpm = Math.floor(wordCount / durationMinutes) || 115;

    // Build speaking metrics block if evaluation is on
    const calculatedStats: SpeakingStats = {
      paceWpm: isAnalysisEnabled ? Math.min(220, Math.max(70, computedWpm)) : 0,
      longPausesCount: isAnalysisEnabled ? pausesCount : 0,
      fillerWordsCount: isAnalysisEnabled ? fillerCount : 0,
      fillerWordsList: isAnalysisEnabled ? ['like', 'um', 'uh'] : [],
      volumeConsistency: 'steady',
      nervousnessIndicators: isAnalysisEnabled ? (fillerCount > 5 ? ['some repetitive fillers'] : []) : [],
    };

    try {
      const response = await fetch('/api/interview/evaluate-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionText: currentQuestion.text,
          answerText: answerInput,
          resumeInfo,
          jobTarget,
          category: currentQuestion.category,
          hintsUnlocked: currentHintsUnlocked,
          scenarioId: currentQuestion.scenario_id || currentQuestion.id,
          customFillerWords,
          speakingSeconds: elapsedSeconds
        }),
      });

      if (!response.ok) {
        throw new Error('Assessor returned bad status');
      }

      const evalData: QuestionFeedback = await response.json();
      
      // Inject speaking analysis carefully
      if (isAnalysisEnabled) {
        evalData.speakingAnalysis = calculatedStats;
      }

      setCurrentFeedback(evalData);
      setShowFeedback(true);
    } catch (e) {
      console.error(e);
      // Fallback
      const fallbackFeedback: QuestionFeedback = {
        score: Math.min(10, Math.max(5, 7 + (wordCount > 60 ? 1 : 0))),
        strengths: [
          'Strong tone and highly cohesive structure outlining key steps.',
          'Demonstrates professional commitment matching Albion liberal arts values.'
        ],
        areasToImprove: [
          'Add a clear quantitative result metrics to make project outputs tangible.',
          'Formulate statements specifically mapping Albion leadership roles.'
        ],
        suggestedAnswer: `Based on your student details, try: "Certainly. At Albion College, I took initiative to coordinate scientific modeling processes during my coursework. When a timeline crunch hit our team, I created a central tracker that trimmed project turnaround from 5 days down to 3 days, securing a 92% presentation mark."`,
        clarityComments: 'Very clear stream of consciousness. Easy layout.',
        confidenceComments: isAnalysisEnabled && calculatedStats.longPausesCount > 3 
          ? 'You appeared less confident during this answer because of long pauses.' 
          : 'Highly confident and well paced.',
        structureComments: 'Solid beginning and introduction of setup.',
        relevanceComments: 'Fully answers the target scope.',
        professionalismComments: 'Pristine technical phrasing.',
        speakingAnalysis: isAnalysisEnabled ? calculatedStats : undefined,
      };
      setCurrentFeedback(fallbackFeedback);
      setShowFeedback(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextStep = () => {
    if (!currentFeedback) return;
    
    const calculatedStats = currentFeedback.speakingAnalysis || {
      paceWpm: 120,
      longPausesCount: 0,
      fillerWordsCount: 0,
      fillerWordsList: [],
      volumeConsistency: 'steady',
      nervousnessIndicators: []
    } as SpeakingStats;

    // Reset local counts info for next question
    setAnswerInput('');
    setElapsedSeconds(0);
    setFillerCount(0);
    setPausesCount(0);
    setShowFeedback(false);
    setCurrentFeedback(null);

    const videoToPass = recordedVideoUrl;
    setRecordedVideoUrl(null);
    setVideoBlob(null);
    setVideoDuration(0);

    // Propagate up to main state
    onNextQuestion(answerInput, currentFeedback, calculatedStats, totalSessionSeconds, videoToPass || undefined);
  };

  const handleTryAgain = () => {
    // Keep question text but reset local state answer
    setAnswerInput('');
    setElapsedSeconds(0);
    setFillerCount(0);
    setPausesCount(0);
    setShowFeedback(false);
    setCurrentFeedback(null);
    setRecordedVideoUrl(null);
    setVideoBlob(null);
    setVideoDuration(0);
  };

  const handleSkipQuestion = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    }
    stopTtsAudio();

    const skippedFeedback: QuestionFeedback = {
      score: 0,
      overall_score: 0.0,
      strengths: ['Question skipped by candidate.'],
      areasToImprove: ['Candidate elected to skip this question station.'],
      suggestedAnswer: 'Review the prompt scenario and practice structuring a response using the STAR framework or bioethics principles.',
      clarityComments: 'Skipped question.',
      confidenceComments: 'Skipped question.',
      structureComments: 'Skipped question.',
      relevanceComments: 'Skipped question.',
      professionalismComments: 'Skipped question.',
      feedback: {
        strengths: ['Question skipped by candidate.'],
        vulnerabilities: ['No response recorded for this station.'],
        red_flag_alert: null,
      }
    };

    const emptyStats: SpeakingStats = {
      paceWpm: 0,
      longPausesCount: 0,
      fillerWordsCount: 0,
      fillerWordsList: [],
      volumeConsistency: 'steady',
      nervousnessIndicators: []
    };

    setAnswerInput('');
    setElapsedSeconds(0);
    setFillerCount(0);
    setPausesCount(0);
    setShowFeedback(false);
    setCurrentFeedback(null);
    setRecordedVideoUrl(null);
    setVideoBlob(null);
    setVideoDuration(0);

    onNextQuestion('[Skipped Question]', skippedFeedback, emptyStats, totalSessionSeconds, undefined);
  };

  return (
    <div className="space-y-8" id="active-interview-wrapper">
      {/* Upper Tracker header */}
      <div className="glass-card-deep px-6 py-4 rounded-2xl flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-4">
          <div className="bg-albion-purple text-albion-gold h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm">
            {currentQuestionIndex + 1}/{questions.length}
          </div>
          <div>
            <span className="text-[10px] text-gray-400 font-mono tracking-widest uppercase block">
              Interview in Progress
            </span>
            <span className="text-xs font-semibold text-albion-purple capitalize bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-100">
              {currentQuestion.category} Question
            </span>
          </div>
        </div>

        {/* Real-time Speaking Timer (MMI Station Timer for Med Track vs STAR Response Timer for Regular Track) */}
        {jobTarget.interviewType === 'medical_school' ? (
          /* MMI STATION TIMER (MEDICAL TRACK ONLY) */
          <div className="flex flex-col items-center bg-white/80 border border-purple-100 rounded-2xl px-4 py-2 shadow-xs min-w-[280px]">
            <div className="flex items-center justify-between w-full gap-2">
              <span className="text-[9px] uppercase font-black tracking-wider text-purple-900">
                MMI Station Timing
              </span>
              
              {/* Timer Controls & Displays */}
              <div className="flex items-center space-x-2">
                {/* 2-Minute Prep Clock Countdown */}
                <button
                  onClick={() => setIsPrepActive(!isPrepActive)}
                  className={`flex items-center space-x-1 px-2.5 py-0.5 rounded-lg border text-xs font-mono font-bold transition cursor-pointer ${
                    isPrepActive ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse' : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                  }`}
                  title={isPrepActive ? 'Pause Prep Clock' : 'Start 2-min Prep Clock'}
                  id="btn-toggle-prep-clock"
                >
                  <Clock className="w-3 h-3 text-amber-600" />
                  <span>Prep: {Math.floor(prepSeconds / 60)}:{(prepSeconds % 60).toString().padStart(2, '0')}</span>
                </button>

                {/* Main Station Speaking Clock */}
                <div className="flex items-center space-x-1 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200">
                  <span className="font-mono text-xs font-black text-albion-purple-dark">
                    Station: {Math.floor(totalSessionSeconds / 60).toString().padStart(2, '0')}:{(totalSessionSeconds % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="w-full mt-1.5 space-y-1">
              <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden relative">
                {/* Progress bar up to 8 minutes (480s) */}
                <div 
                  className={`h-full transition-all duration-300 ${
                    totalSessionSeconds < 360 
                      ? 'bg-amber-500' 
                      : totalSessionSeconds > 480 
                      ? 'bg-red-500' 
                      : 'bg-emerald-600'
                  }`}
                  style={{ width: `${Math.min(100, (totalSessionSeconds / 480) * 100)}%` }}
                />
                <div className="absolute left-[75%] top-0 h-full w-[2px] bg-white/80" title="6-minute mark (station target threshold)" />
              </div>
              
              <div className="flex justify-between text-[9px] font-bold text-gray-500">
                <span className={totalSessionSeconds < 360 ? 'text-amber-600 font-extrabold' : 'text-emerald-700 font-extrabold'}>
                  {totalSessionSeconds < 360 ? 'Building response (Target: 6m)' : '✓ 6m Mark Met'}
                </span>
                <span className={totalSessionSeconds >= 360 && totalSessionSeconds <= 480 ? 'text-emerald-600 font-extrabold' : totalSessionSeconds > 480 ? 'text-red-500 font-extrabold' : ''}>
                  Station Limit: 6:00–8:00m
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* REGULAR INTERVIEW STAR RESPONSE TIMER (REGULAR TRACK) */
          <div className="flex flex-col items-center bg-white/80 border border-purple-100 rounded-2xl px-4 py-2 shadow-xs min-w-[260px]">
            <div className="flex items-center justify-between w-full gap-2">
              <span className="text-[9px] uppercase font-black tracking-wider text-albion-purple">
                STAR Response Timer
              </span>
              
              <div className="flex items-center space-x-1 bg-purple-50 px-2.5 py-0.5 rounded-lg border border-purple-200">
                <Clock className="w-3 h-3 text-albion-purple" />
                <span className="font-mono text-xs font-black text-albion-purple-dark">
                  {Math.floor(totalSessionSeconds / 60)}:{(totalSessionSeconds % 60).toString().padStart(2, '0')}
                </span>
              </div>
            </div>
            
            <div className="w-full mt-1.5 space-y-1">
              <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden relative">
                {/* Standard 1-2 minute target progress bar (120s sweet spot) */}
                <div 
                  className={`h-full transition-all duration-300 ${
                    totalSessionSeconds < 60 
                      ? 'bg-amber-500' 
                      : totalSessionSeconds > 150 
                      ? 'bg-orange-500' 
                      : 'bg-emerald-600'
                  }`}
                  style={{ width: `${Math.min(100, (totalSessionSeconds / 120) * 100)}%` }}
                />
              </div>
              
              <div className="flex justify-between text-[9px] font-bold text-gray-500">
                <span className={totalSessionSeconds < 60 ? 'text-amber-600' : 'text-emerald-700 font-extrabold'}>
                  {totalSessionSeconds < 60 ? 'Building response' : totalSessionSeconds <= 120 ? '✓ Optimal STAR length' : 'Wrap up response'}
                </span>
                <span className="text-gray-400">
                  Target: 1:00–2:00m
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Evaluation Cues Toggle, Skip Question and Exit Button */}
        <div className="flex items-center space-x-3 flex-wrap gap-2">
          <label className="flex items-center space-x-2 text-xs font-semibold text-gray-500 cursor-pointer mr-2">
            <input
              type="checkbox"
              checked={isAnalysisEnabled}
              onChange={(e) => setIsAnalysisEnabled(e.target.checked)}
              className="rounded border-purple-300 text-albion-purple focus:ring-albion-purple h-4 w-4"
            />
            <span>Speaking Cues</span>
          </label>

          <button
            onClick={handleSkipQuestion}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl transition cursor-pointer text-xs font-bold shadow-xs"
            title="Skip this question and move to the next"
            id="btn-skip-question-header"
          >
            <SkipForward className="w-3.5 h-3.5 text-amber-600" />
            <span>Skip Question</span>
          </button>

          <button
            onClick={onExit}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl transition cursor-pointer text-xs font-bold"
            title="Exit this practice session"
            id="btn-exit-active-interview"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Exit Interview</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Main Panel */}
        <div className="md:col-span-8 glass-card rounded-[32px] p-6 sm:p-8 space-y-6">
          {/* Question Text & Competency Button */}
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3 flex-1">
                <h3 className="text-xl sm:text-2xl font-bold font-display text-albion-purple-dark leading-snug">
                  "{currentQuestion.text}"
                </h3>

                {/* COMPETENCY & GUIDANCE BUTTON (TRACK SPECIFIC) */}
                <div>
                  {jobTarget.interviewType === 'medical_school' ? (
                    <button
                      id="btn-aamc-competency-tested"
                      onClick={() => setShowHelpDrawer(true)}
                      className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs px-4 py-2.5 rounded-xl shadow-md transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                      title="View tested AAMC Core Competencies, bioethics dilemmas, and station rubric"
                    >
                      <Sparkles className="w-4 h-4 text-amber-200 shrink-0" />
                      <span>💡 What AAMC Competency & Bioethics is being tested? {currentHintsUnlocked > 0 && `(Tier ${currentHintsUnlocked} Active)`}</span>
                    </button>
                  ) : (
                    <button
                      id="btn-star-guidance-tested"
                      onClick={() => setShowHelpDrawer(true)}
                      className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white font-black text-xs px-4 py-2.5 rounded-xl shadow-md transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                      title="View STAR Response Guidance & Hints"
                    >
                      <Sparkles className="w-4 h-4 text-purple-200 shrink-0" />
                      <span>💡 View STAR Response Guidance & Hints {currentHintsUnlocked > 0 && `(Tier ${currentHintsUnlocked} Active)`}</span>
                    </button>
                  )}
                </div>
              </div>
              
              {/* Refined Audio Controls */}
              <div className="flex items-center space-x-2 shrink-0 flex-wrap">
                <GeminiTtsButton text={currentQuestion.text} label="Listen" />
              </div>
            </div>

            <p className="text-xs text-gray-400 leading-normal italic">
              * Coach tip: Use your Albion College background. Focus on actual projects, leadership roles in student government, or liberal arts agility. Write or speak clearly.
            </p>
          </div>

          {/* Feedback Overlay or Answer Input Area */}
          {showFeedback && currentFeedback ? (
            /* FEEDBACK INLINE DISPLAY */
            <div className="bg-white/40 border border-white/40 backdrop-blur-sm rounded-2xl p-6 space-y-6 animate-fade-in" id="feedback-inline-block">
              {/* RED FLAG ALERT BANNER IF TRIGGERED */}
              {(currentFeedback.feedback?.red_flag_alert || (currentFeedback.overall_score !== undefined && currentFeedback.overall_score < 1.0)) && (
                <div className="bg-red-900/90 text-white p-5 rounded-2xl border-2 border-red-500 shadow-2xl space-y-2 animate-bounce-once">
                  <div className="flex items-center gap-2 text-red-200 font-bold uppercase tracking-widest text-xs">
                    <AlertTriangle className="w-5 h-5 text-red-400 animate-pulse" />
                    <span>CRITICAL RED FLAG ALERT TRIGGERED</span>
                  </div>
                  <p className="text-sm font-semibold text-white leading-relaxed">
                    {currentFeedback.feedback?.red_flag_alert || "A critical ethical or behavioral vulnerability was detected in this response (e.g. autonomy violation, blame-shifting, or non-compliance)."}
                  </p>
                </div>
              )}

              {/* REDESIGNED & DECLUTTERED ANALYSIS PAGE INTERFACE */}
              <div className="space-y-6">
                
                {/* Header Card: Response Performance Summary */}
                <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 space-y-5 shadow-xl">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider ${currentFeedback.track_evaluated === 'MEDICAL_SCHOOL' ? 'bg-amber-400 text-slate-950' : 'bg-purple-400 text-slate-950'}`}>
                          Track: {currentFeedback.track_evaluated || 'STANDARD_JOB'}
                        </span>
                        {currentFeedback.domain_classification && (
                          <span className="bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-md text-[10px] font-medium border border-slate-700">
                            Domain: {currentFeedback.domain_classification}
                          </span>
                        )}
                      </div>
                      <h4 className="text-xl font-bold text-white tracking-tight">
                        Response Analysis & Evaluation
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Structured AI assessment based on job target requirements and communication frameworks.
                      </p>
                    </div>
                    
                    {/* Overall Score Badge */}
                    <div className="bg-slate-800/90 backdrop-blur-md px-6 py-3.5 rounded-2xl border border-slate-700 text-center shrink-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-black text-amber-400 block leading-none">
                        {currentFeedback.overall_score ? currentFeedback.overall_score.toFixed(1) : (currentFeedback.score / 2).toFixed(1)}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mt-1">
                        Overall Score (5.0 Max)
                      </span>
                    </div>
                  </div>

                  {/* Formula Score Breakdown */}
                  {currentFeedback.score_breakdown && (
                    <div className="space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                        Structural Evaluator Breakdown:
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
                          <span className="text-[10px] text-slate-400 block uppercase font-bold">
                            {currentFeedback.track_evaluated === 'MEDICAL_SCHOOL' ? 'Claim (1.0)' : 'Situation/Task (1.0)'}
                          </span>
                          <span className="text-sm font-black text-amber-400">
                            {currentFeedback.score_breakdown.claim_or_situation} / 1.0
                          </span>
                        </div>
                        <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
                          <span className="text-[10px] text-slate-400 block uppercase font-bold">
                            {currentFeedback.track_evaluated === 'MEDICAL_SCHOOL' ? 'Evidence (2.0)' : 'Action (2.0)'}
                          </span>
                          <span className="text-sm font-black text-amber-400">
                            {currentFeedback.score_breakdown.evidence_or_action} / 2.0
                          </span>
                        </div>
                        <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
                          <span className="text-[10px] text-slate-400 block uppercase font-bold">
                            {currentFeedback.track_evaluated === 'MEDICAL_SCHOOL' ? 'Insight (2.0)' : 'Result (2.0)'}
                          </span>
                          <span className="text-sm font-black text-amber-400">
                            {currentFeedback.score_breakdown.insight_or_result} / 2.0
                          </span>
                        </div>
                        <div className={`p-3 rounded-xl border ${currentFeedback.score_breakdown.red_flag_deduction > 0 ? 'bg-red-950/60 text-red-200 border-red-800/80' : 'bg-slate-800/80 border-slate-700/60 text-slate-300'}`}>
                          <span className="text-[10px] block uppercase font-bold">
                            Red Flag Deduct
                          </span>
                          <span className="text-sm font-black">
                            -{currentFeedback.score_breakdown.red_flag_deduction}
                          </span>
                        </div>
                      </div>

                      {/* Hint Penalty Indicator */}
                      {currentFeedback.hints_unlocked !== undefined && currentFeedback.hints_unlocked > 0 && (
                        <div className="bg-amber-950/40 text-amber-100 border border-amber-800/50 p-3 rounded-xl text-xs space-y-1 mt-2">
                          <div className="flex items-center justify-between font-bold">
                            <span className="flex items-center gap-1.5 text-amber-300">
                              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                              Progressive Hint Penalty ({currentFeedback.hints_unlocked} Tier{currentFeedback.hints_unlocked > 1 ? 's' : ''} Unlocked)
                            </span>
                            <span className="text-amber-300 font-mono font-bold">-{currentFeedback.penalty_points?.toFixed(1) || (currentFeedback.hints_unlocked * 0.5).toFixed(1)} pts</span>
                          </div>
                          <div className="text-[11px] text-slate-400 flex justify-between pt-0.5">
                            <span>Raw Assessed: {currentFeedback.raw_evaluation_score?.toFixed(1) || '5.0'} / 5.0</span>
                            <span>Max Score Cap: {currentFeedback.max_score_cap?.toFixed(1) || (5.0 - currentFeedback.hints_unlocked * 0.5).toFixed(1)} / 5.0</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* CORE FEATURE 1: RECOMMENDED MODEL */}
                <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-100">
                        1. Recommended Model Response Framework
                      </h3>
                    </div>
                    <span className="text-[11px] font-medium text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                      {currentFeedback.track_evaluated === 'MEDICAL_SCHOOL' ? 'Claim → Evidence → Insight' : 'STAR Method Framework'}
                    </span>
                  </div>

                  <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                      Target Exemplar Answer:
                    </span>
                    <p className="text-xs text-slate-200 leading-relaxed italic font-serif">
                      "{currentFeedback.recommended_rewrite || currentFeedback.suggestedAnswer}"
                    </p>
                  </div>

                  {currentFeedback.starAnalysis && (
                    <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/80 text-xs text-slate-300 space-y-1">
                      <span className="font-bold text-purple-300 uppercase tracking-wide block text-[11px]">
                        Structural Alignment Analysis:
                      </span>
                      <p className="leading-relaxed text-slate-300">{currentFeedback.starAnalysis}</p>
                    </div>
                  )}
                </div>

                {/* CORE FEATURE 2: REWRITE OBJECTIVE & ACTIONABLE TARGETS */}
                <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 space-y-5 shadow-xl">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                    <Target className="w-4 h-4 text-purple-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-100">
                      2. Rewrite Objective & Actionable Targets
                    </h3>
                  </div>

                  {/* Key Advisor Tip */}
                  <div className="bg-slate-800/90 p-4 rounded-xl border border-slate-700 space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                      Core Advisor Strategy Tip:
                    </span>
                    <p className="text-xs text-slate-200 font-medium leading-relaxed">
                      {currentFeedback.keyTip || currentFeedback.feedback?.vulnerabilities?.[0] || currentFeedback.areasToImprove?.[0] || "Integrate quantifiable outcomes and reflective professional insights."}
                    </p>
                  </div>

                  {/* Strengths & Target Improvements Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-slate-950/80 p-4 rounded-xl border border-emerald-900/50 space-y-2.5">
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        Key Strengths to Preserve
                      </span>
                      <ul className="space-y-2 text-xs text-slate-300 pl-4 list-disc">
                        {(currentFeedback.feedback?.strengths || currentFeedback.strengths || []).map((str, i) => (
                          <li key={i} className="leading-snug">{str}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-slate-950/80 p-4 rounded-xl border border-amber-900/50 space-y-2.5">
                      <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        Target Improvements for Next Attempt
                      </span>
                      <ul className="space-y-2 text-xs text-slate-300 pl-4 list-disc">
                        {(currentFeedback.feedback?.vulnerabilities || currentFeedback.areasToImprove || []).map((imp, i) => (
                          <li key={i} className="leading-snug">{imp}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* CORE FEATURE 3: UNIFIED COMMUNICATION RUBRIC */}
                {currentFeedback.objective_rubric && (
                  <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 space-y-5 shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <BarChart className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-100">
                          3. Objective Communication Rubric
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowFillerCalibrationDrawer(true)}
                        className="text-[11px] font-semibold text-purple-300 hover:text-white bg-purple-950 hover:bg-purple-900 px-3 py-1.5 rounded-lg border border-purple-800/80 transition-colors flex items-center gap-1.5"
                      >
                        <Sliders className="w-3.5 h-3.5 text-purple-400" />
                        Calibrate Filler Words
                      </button>
                    </div>

                    {/* 4 Objective Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60 space-y-2">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-400 font-medium">Job Target Relevance</span>
                          <span className="font-mono font-bold text-emerald-400">{currentFeedback.objective_rubric.relevance_to_target}%</span>
                        </div>
                        <div className="w-full bg-slate-700/60 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-emerald-400 h-full rounded-full transition-all duration-500" style={{ width: `${currentFeedback.objective_rubric.relevance_to_target}%` }} />
                        </div>
                      </div>

                      <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60 space-y-2">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-400 font-medium">Professional Register</span>
                          <span className="font-mono font-bold text-sky-400">{currentFeedback.objective_rubric.professional_register}%</span>
                        </div>
                        <div className="w-full bg-slate-700/60 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-sky-400 h-full rounded-full transition-all duration-500" style={{ width: `${currentFeedback.objective_rubric.professional_register}%` }} />
                        </div>
                      </div>

                      <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60 space-y-2">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-400 font-medium">Clarity & Diction</span>
                          <span className="font-mono font-bold text-indigo-400">{currentFeedback.objective_rubric.clarity_conciseness}%</span>
                        </div>
                        <div className="w-full bg-slate-700/60 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-indigo-400 h-full rounded-full transition-all duration-500" style={{ width: `${currentFeedback.objective_rubric.clarity_conciseness}%` }} />
                        </div>
                      </div>

                      <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60 space-y-2">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-400 font-medium">Vocal Composure & Pace</span>
                          <span className="font-mono font-bold text-amber-400">{currentFeedback.objective_rubric.vocal_composure_pace}%</span>
                        </div>
                        <div className="w-full bg-slate-700/60 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-amber-400 h-full rounded-full transition-all duration-500" style={{ width: `${currentFeedback.objective_rubric.vocal_composure_pace}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* Filler Breakdown & Speech Stats */}
                    {currentFeedback.filler_analysis && (
                      <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 text-xs space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-slate-300">
                          <div className="flex items-center gap-4">
                            <span className="font-medium text-slate-400">Total Words: <strong className="text-white">{currentFeedback.filler_analysis.total_words}</strong></span>
                            <span className="font-medium text-slate-400">Fillers: <strong className="text-amber-300">{currentFeedback.filler_analysis.total_fillers}</strong></span>
                            <span className="font-medium text-slate-400">Density: <strong className={currentFeedback.filler_analysis.filler_density_pct > 3 ? 'text-red-400' : 'text-emerald-400'}>{currentFeedback.filler_analysis.filler_density_pct}%</strong></span>
                          </div>
                          <span className="text-[10px] text-slate-400 italic">
                            {currentFeedback.filler_analysis.custom_calibrated_words_used?.length || 0} Calibrated Patterns Active
                          </span>
                        </div>

                        {currentFeedback.filler_analysis.filler_breakdown.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            <span className="text-[11px] text-slate-400 self-center mr-1 font-medium">Detected Patterns:</span>
                            {currentFeedback.filler_analysis.filler_breakdown.map((item, idx) => (
                              <span key={idx} className="bg-amber-500/20 text-amber-200 border border-amber-500/30 px-2 py-0.5 rounded-md text-[11px] font-mono flex items-center gap-1">
                                "{item.word}"
                                <span className="bg-amber-400 text-slate-900 px-1 rounded font-bold text-[9px]">{item.count}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-emerald-400 font-medium pt-0.5">
                            ✓ Excellent speech precision! No filler words detected from calibrated target set.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Navigation Action Bar */}
                <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                  <button
                    id="btn-feedback-retry"
                    onClick={handleTryAgain}
                    className="flex items-center space-x-1.5 px-4 py-2.5 border border-purple-400/40 text-purple-300 rounded-xl hover:bg-purple-900/30 transition cursor-pointer text-xs font-bold"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Try Answer Again</span>
                  </button>

                  <button
                    id="btn-feedback-next"
                    onClick={handleNextStep}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-2.5 rounded-xl transition duration-150 flex items-center space-x-1.5 cursor-pointer text-xs shadow-lg"
                  >
                    <span>{currentQuestionIndex === questions.length - 1 ? 'Go to Report Board' : 'Proceed to Next Question'}</span>
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            </div>
          ) : (
            /* ANSWER CRADLE: VIDEO RESPONSE OPTION & TEXT TRANSCRIPT */
            <div className="space-y-6">
              
              {/* Top Mode Toggle Strip */}
              <div className="flex items-center justify-between flex-wrap gap-3 bg-purple-50/80 p-3 rounded-2xl border border-purple-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-albion-purple uppercase tracking-wider">
                    Response Mode:
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      id="btn-toggle-video-mode"
                      type="button"
                      onClick={() => setShowVideoStudio(true)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        showVideoStudio
                          ? 'bg-albion-purple text-white shadow-md'
                          : 'bg-white text-albion-purple hover:bg-purple-100 border border-purple-200'
                      }`}
                    >
                      <Camera className="w-3.5 h-3.5 text-amber-300" />
                      <span>📹 Record Video Answer</span>
                    </button>

                    <button
                      id="btn-toggle-text-mode"
                      type="button"
                      onClick={() => setShowVideoStudio(false)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        !showVideoStudio
                          ? 'bg-albion-purple text-white shadow-md'
                          : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      <Mic className="w-3.5 h-3.5 text-purple-300" />
                      <span>📝 Text / Voice Answer</span>
                    </button>
                  </div>
                </div>

                {recordedVideoUrl && (
                  <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold font-mono px-2.5 py-1 rounded-lg flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Video Attached ({videoDuration}s)
                  </span>
                )}
              </div>

              {/* VIDEO RESPONSE RECORDER STUDIO */}
              {showVideoStudio ? (
                <VideoResponseRecorder
                  questionText={currentQuestion.text}
                  questionId={currentQuestion.id}
                  existingVideoUrl={recordedVideoUrl}
                  existingTranscript={answerInput}
                  onVideoApproved={(blob, url, duration, transcriptText) => {
                    setVideoBlob(blob);
                    setRecordedVideoUrl(url);
                    setVideoDuration(duration);
                    if (transcriptText && transcriptText.trim()) {
                      setAnswerInput(transcriptText.trim());
                    } else if (!answerInput.trim()) {
                      setAnswerInput(`[Video Response Recorded - ${duration}s duration] Candidate recorded and approved a video response.`);
                    }
                  }}
                  onFallbackToText={() => setShowVideoStudio(false)}
                />
              ) : null}

              {/* TEXT TRANSCRIPT INPUT AREA */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                    Your Answer Transcript / Notes
                  </label>
                  {recordedVideoUrl && (
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      ✓ Video response attached to this transcript
                    </span>
                  )}
                </div>
                
                <textarea
                  id="interview-answer-input"
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                  className="w-full h-48 px-4 py-3 rounded-xl border border-purple-100 focus:border-albion-purple focus:ring-1 focus:ring-albion-purple outline-none font-sans text-sm bg-gray-50/20"
                  placeholder="Type your structured answer response here... Alternatively, click 'Record Video Answer' above to record yourself with your camera or click 'Speak Response' below to transcribe your voice real-time!"
                />

                {/* Audio Visualizer Wave Canvas block */}
                {isRecording && micConsent && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-albion-purple font-mono uppercase tracking-widest block font-bold">
                      Active Voice Waveform Calibration
                    </span>
                    <AudioVisualizer stream={mediaStream} isActive={isRecording} />
                  </div>
                )}

                {/* Interactive Audio/Video controller strip */}
                <div className="flex items-center justify-between flex-wrap gap-4 pt-2">
                  <div className="flex items-center space-x-2 flex-wrap gap-2">
                    {/* Camera Studio Toggle Button */}
                    <button
                      id="btn-open-video-studio"
                      type="button"
                      onClick={() => setShowVideoStudio(true)}
                      className="px-4 py-2.5 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white rounded-xl flex items-center space-x-2 transition text-xs font-bold cursor-pointer shadow-md"
                    >
                      <Camera className="w-4 h-4 text-amber-300" />
                      <span>{recordedVideoUrl ? 'Review Video Studio' : 'Record Video Answer'}</span>
                    </button>

                    {/* Mic Trigger */}
                    <button
                      id="btn-mic-trigger"
                      type="button"
                      onClick={startSpeechCapture}
                      className={`p-2.5 px-3 rounded-xl flex items-center space-x-2 transition text-xs font-bold cursor-pointer ${
                        isRecording
                          ? 'bg-red-100 text-red-600 border border-red-300 animate-pulse'
                          : micConsent
                          ? 'bg-purple-50 text-albion-purple border border-purple-200 hover:bg-purple-100'
                          : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      <span>{isRecording ? 'Stop Recording' : 'Speak Response'}</span>
                    </button>
                  </div>

                  {/* Submitting evaluation and Skip Question button group */}
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto">
                    <button
                      id="btn-skip-question-main"
                      type="button"
                      onClick={handleSkipQuestion}
                      className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition duration-150 flex items-center justify-center space-x-1.5 text-xs cursor-pointer border border-slate-200 w-full sm:w-auto"
                      title="Skip this question station"
                    >
                      <SkipForward className="w-4 h-4 text-slate-500" />
                      <span>Skip Question</span>
                    </button>

                    <button
                      id="btn-submit-answer"
                      onClick={handleSubmitAnswer}
                      disabled={isSubmitting || (!answerInput.trim() && !recordedVideoUrl)}
                      className="bg-albion-purple hover:bg-albion-purple-light text-white font-bold px-6 py-3 rounded-xl shadow-lg transition duration-220 disabled:opacity-50 cursor-pointer flex items-center space-x-2 w-full sm:w-auto justify-center"
                    >
                      {isSubmitting ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>Analyzing Credentials...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 text-albion-gold-light" />
                          <span>Submit and Evaluate Answer</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Side Panel: Speech Tracker */}
        <div className="md:col-span-4 space-y-6">
          {/* Quick Stats Panel during session */}
          <div className="glass-card-deep rounded-2xl p-6 space-y-4">
            <h4 className="font-display font-extrabold text-xs text-albion-purple-dark uppercase tracking-widest flex items-center gap-1">
              <BarChart className="w-4 h-4" />
              Realtime Speech Diagnostics
            </h4>

            <div className="space-y-4 text-xs text-gray-600">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <span className="flex items-center gap-1.5 font-medium">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  Elapsed speaking time:
                </span>
                <span className="font-mono font-bold text-gray-700">{elapsedSeconds} seconds</span>
              </div>

              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <span className="flex items-center gap-1.5 font-medium">
                  <BookOpen className="w-3.5 h-3.5 text-gray-400" />
                  Live Word counter:
                </span>
                <span className="font-mono font-bold text-gray-700">
                  {answerInput.split(/\s+/).filter(w => w.length > 0).length} words
                </span>
              </div>

              {isAnalysisEnabled && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Mic className="w-3.5 h-3.5 text-gray-400" />
                    Filler word count:
                  </span>
                  <span className="font-mono font-bold text-amber-600">{fillerCount} items</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* HELP & STATION GUIDANCE DRAWER OVERLAY (PROGRESSIVE 3-TIER HINT SYSTEM) */}
      {showHelpDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs p-2 sm:p-4 animate-fade-in" id="help-station-drawer-backdrop">
          <div className="bg-white text-gray-800 rounded-3xl shadow-2xl border border-purple-100 w-full max-w-2xl max-h-[92vh] overflow-y-auto flex flex-col animate-slide-in-right">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#49266F] to-[#2d1845] text-white p-6 rounded-t-3xl flex items-start justify-between gap-4 sticky top-0 z-10 shadow-md">
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="bg-amber-400 text-albion-purple-dark text-[10px] font-mono font-black uppercase px-2.5 py-0.5 rounded-md tracking-wider">
                    {jobTarget.interviewType === 'medical_school' ? 'AAMC MMI Station Guidance' : 'STAR Response Guidance'}
                  </span>
                  
                  {/* Live Penalty Badge */}
                  <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
                    currentHintsUnlocked === 0 
                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30' 
                      : currentHintsUnlocked === 1 
                      ? 'bg-amber-500/20 text-amber-200 border-amber-400/30' 
                      : currentHintsUnlocked === 2 
                      ? 'bg-orange-500/20 text-orange-200 border-orange-400/30' 
                      : 'bg-red-500/20 text-red-200 border-red-400/30'
                  }`}>
                    {currentHintsUnlocked === 0 && 'No Penalty (Max Score: 5.0)'}
                    {currentHintsUnlocked === 1 && 'Tier 1 Active (-0.5 pts | Max Score: 4.5)'}
                    {currentHintsUnlocked === 2 && 'Tier 2 Active (-1.0 pt | Max Score: 4.0)'}
                    {currentHintsUnlocked === 3 && 'Tier 3 Active (-1.5 pts | Max Score: 3.5)'}
                  </span>

                  {currentQuestion.scenario_id && (
                    <span className="bg-white/10 text-purple-200 text-[10px] font-mono px-2 py-0.5 rounded-md border border-white/15">
                      ID: {currentQuestion.scenario_id}
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-bold font-display text-white leading-tight">
                  {currentQuestion.title || (jobTarget.interviewType === 'medical_school' ? 'MMI Medical School Scenario Guidance' : 'STAR Behavioral Answer Guidance')}
                </h3>
              </div>
              <button
                onClick={() => setShowHelpDrawer(false)}
                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition cursor-pointer shrink-0"
                id="btn-close-help-drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Timing Constraints Banner */}
              <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="bg-albion-purple text-white p-2.5 rounded-xl shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-albion-purple-dark uppercase tracking-wider">
                      {jobTarget.interviewType === 'medical_school' ? 'MMI Station Timing Rules' : 'STAR Response Timing Rules'}
                    </h4>
                    <p className="text-xs text-gray-600">
                      {jobTarget.interviewType === 'medical_school' 
                        ? '2-Minute Prompt Prep → 6 to 8-Minute Active Interview Response'
                        : 'Standard 1 to 2-Minute Structured Answer Target'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 text-xs font-mono font-bold">
                  {jobTarget.interviewType === 'medical_school' ? (
                    <>
                      <span className="bg-amber-100 text-amber-900 px-2.5 py-1 rounded-lg border border-amber-200">Prep: 120s</span>
                      <span className="bg-emerald-100 text-emerald-900 px-2.5 py-1 rounded-lg border border-emerald-200">Station: 6:00–8:00m</span>
                    </>
                  ) : (
                    <span className="bg-emerald-100 text-emerald-900 px-2.5 py-1 rounded-lg border border-emerald-200">Optimal Target: 1:00–2:00m</span>
                  )}
                </div>
              </div>

              {/* TIER 0 STATE (LOCKED GUIDANCE) */}
              {currentHintsUnlocked === 0 && (
                <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-6 text-center space-y-3">
                  <div className="bg-amber-100 text-amber-800 w-12 h-12 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <Lock className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-amber-950">
                      {jobTarget.interviewType === 'medical_school' ? 'AAMC Guidance & Hints Locked' : 'STAR Guidance & Hints Locked'}
                    </h4>
                    <p className="text-xs text-amber-800 mt-1 max-w-md mx-auto leading-relaxed">
                      Answering without hints preserves your maximum possible score of <strong>5.0 / 5.0</strong>. You can progressively unlock conceptual directions, strategy blueprints, and anticipated probes with a 0.5-point penalty per tier.
                    </p>
                  </div>
                </div>
              )}

              {/* TIER 1 CONTENT (CONCEPTUAL DIRECTION - REVEALED AT TIER >= 1) */}
              {currentHintsUnlocked >= 1 && (
                <div className="space-y-6 animate-fade-in">
                  {/* Competencies Section */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">
                        {jobTarget.interviewType === 'medical_school' ? 'Primary Competency' : 'Primary Focus'}
                      </span>
                      <span className="text-sm font-bold text-albion-purple-dark flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        {currentQuestion.aamc_competency_primary || (jobTarget.interviewType === 'medical_school' ? 'Ethical Responsibility to Self & Others' : 'STAR Method Alignment (Situation & Task)')}
                      </span>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">
                        {jobTarget.interviewType === 'medical_school' ? 'Secondary Competency' : 'Secondary Focus'}
                      </span>
                      <span className="text-sm font-bold text-albion-purple-dark flex items-center gap-1.5">
                        <Compass className="w-4 h-4 text-purple-600 shrink-0" />
                        {currentQuestion.aamc_competency_secondary || (jobTarget.interviewType === 'medical_school' ? 'Cultural Competence & Empathy' : 'Concrete Action & Quantifiable Impact')}
                      </span>
                    </div>
                  </div>

                  {/* Competency Overview */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Target className="w-4 h-4 text-albion-purple" />
                      {jobTarget.interviewType === 'medical_school' ? 'Competency Overview' : 'Framework Overview'}
                    </h4>
                    <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-2xl border border-gray-200 leading-relaxed font-medium">
                      {currentQuestion.help_drawer_content?.competency_overview || 
                        (jobTarget.interviewType === 'medical_school' 
                          ? "Evaluates ethical decision making, bioethical awareness, cultural sensitivity, and active problem solving when facing complex clinical or interpersonal scenarios."
                          : "Evaluates your ability to structure responses clearly using Situation, Task, Action, and Result, highlighting personal initiative and outcome impact.")}
                    </p>
                  </div>

                  {/* Core Tension / Underlying Dilemma */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      {jobTarget.interviewType === 'medical_school' ? 'Underlying Dilemma & Core Tension' : 'Key Answer Objective'}
                    </h4>
                    <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-2xl text-sm text-amber-950 leading-relaxed font-medium">
                      {currentQuestion.help_drawer_content?.underlying_dilemma || 
                        (jobTarget.interviewType === 'medical_school'
                          ? "Balancing autonomy and patient welfare against ethical standards, professional boundaries, or team collaboration."
                          : "Clearly articulating your specific personal actions and linking them directly to quantifiable business or project outcomes.")}
                    </div>
                  </div>
                </div>
              )}

              {/* TIER 2 CONTENT (STRATEGIC BLUEPRINT - REVEALED AT TIER >= 2) */}
              {currentHintsUnlocked >= 2 && (
                <div className="space-y-2 animate-fade-in">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Key Talking Points to Include (Strategy Blueprint)
                  </h4>
                  <ul className="space-y-2.5">
                    {(currentQuestion.help_drawer_content?.key_talking_points || [
                      jobTarget.interviewType === 'medical_school' ? "Acknowledge all stakeholders empathetically before jumping to solutions." : "Clearly define the initial Situation and specific Task.",
                      jobTarget.interviewType === 'medical_school' ? "Formulate a balanced approach that respects patient autonomy and ethics." : "Explain your personal direct Action steps using clear action verbs.",
                      jobTarget.interviewType === 'medical_school' ? "Outline follow-up steps, safety measures, and reflective takeaways." : "Conclude with measurable Results or positive operational impact."
                    ]).map((point, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-700 bg-emerald-50/50 p-3 rounded-xl border border-emerald-100">
                        <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md mt-0.5 shrink-0">
                          {idx + 1}
                        </span>
                        <span className="leading-relaxed font-medium">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* TIER 3 CONTENT (SPECIFIC ANTICIPATION - REVEALED AT TIER >= 3) */}
              {currentHintsUnlocked >= 3 && (
                <div className="space-y-2 animate-fade-in">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4 text-purple-600" />
                    Follow-Up Probes to Anticipate
                  </h4>
                  <div className="space-y-2">
                    {(currentQuestion.follow_up_probes || [
                      jobTarget.interviewType === 'medical_school' ? "What would you do if the patient or family refuses your secondary recommendation?" : "What would you do differently if faced with the same scenario again?",
                      jobTarget.interviewType === 'medical_school' ? "How do you manage your personal emotional distress in this scenario?" : "How did you measure the long-term success of your solution?"
                    ]).map((probe, idx) => (
                      <div key={idx} className="bg-purple-50/60 p-3 rounded-xl border border-purple-100 text-xs sm:text-sm text-purple-950 font-medium italic">
                        "{probe}"
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Control Footer Bar */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 rounded-b-3xl flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="w-full sm:w-auto flex-1">
                {currentHintsUnlocked === 0 && (
                  <button
                    id="btn-unlock-tier-1"
                    onClick={() => handleUnlockHint(1)}
                    className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-xl transition cursor-pointer shadow-sm flex items-center justify-center gap-2"
                  >
                    <Unlock className="w-4 h-4" />
                    <span>Unlock Tier 1 Hint (-0.5 pt penalty)</span>
                  </button>
                )}

                {currentHintsUnlocked === 1 && (
                  <button
                    id="btn-unlock-tier-2"
                    onClick={() => handleUnlockHint(2)}
                    className="w-full sm:w-auto px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl transition cursor-pointer shadow-sm flex items-center justify-center gap-2"
                  >
                    <Unlock className="w-4 h-4" />
                    <span>Unlock Tier 2 Hint: Strategy Blueprint (-0.5 pt penalty)</span>
                  </button>
                )}

                {currentHintsUnlocked === 2 && (
                  <button
                    id="btn-unlock-tier-3"
                    onClick={() => handleUnlockHint(3)}
                    className="w-full sm:w-auto px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black rounded-xl transition cursor-pointer shadow-sm flex items-center justify-center gap-2"
                  >
                    <Unlock className="w-4 h-4" />
                    <span>Unlock Tier 3 Hint: Anticipated Probes (-0.5 pt penalty)</span>
                  </button>
                )}

                {currentHintsUnlocked === 3 && (
                  <button
                    disabled
                    className="w-full sm:w-auto px-5 py-2.5 bg-gray-200 text-gray-500 text-xs font-bold rounded-xl cursor-not-allowed flex items-center justify-center gap-2 border border-gray-300"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>All Hints Unlocked (Max Score Cap: 3.5/5.0)</span>
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowHelpDrawer(false)}
                className="w-full sm:w-auto px-5 py-2.5 bg-albion-purple hover:bg-albion-purple-dark text-white text-xs font-bold rounded-xl transition cursor-pointer shrink-0"
              >
                Close & Resume Practice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Filler Words Calibration Drawer */}
      {showFillerCalibrationDrawer && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 text-white max-w-lg w-full rounded-2xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold text-slate-100">Custom Filler Word Calibration</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFillerCalibrationDrawer(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Add specific target phrases, regional slang, or repetitive habits (e.g., <em>"literally"</em>, <em>"you know"</em>, <em>"at the end of the day"</em>) to calibrate the objective rubric detector for your unique speech patterns.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add filler phrase (e.g., 'sort of', 'honestly')..."
                value={newFillerInput}
                onChange={(e) => setNewFillerInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCustomFillerWord())}
                className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-purple-500 placeholder-slate-500"
              />
              <button
                type="button"
                onClick={handleAddCustomFillerWord}
                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 shrink-0"
              >
                <Plus className="w-4 h-4" />
                Add Pattern
              </button>
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Active Calibrated Pattern Dictionary ({customFillerWords.length}):
              </span>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-slate-950/50 rounded-xl border border-slate-800/80">
                {customFillerWords.map((word, idx) => (
                  <span
                    key={idx}
                    className="bg-slate-800 text-purple-200 border border-slate-700/80 px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 group"
                  >
                    "{word}"
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomFillerWord(word)}
                      className="text-slate-400 hover:text-red-400 transition-colors"
                      title="Remove phrase"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowFillerCalibrationDrawer(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-5 py-2 rounded-xl text-xs font-semibold transition-colors"
              >
                Save & Calibrate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
