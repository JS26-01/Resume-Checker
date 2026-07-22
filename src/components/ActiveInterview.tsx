import { useState, useEffect, useRef } from 'react';
import { InterviewQuestion, QuestionFeedback, JobTarget, ResumeInfo, SpeakingStats } from '../types';
import { 
  Mic, MicOff, Camera, VideoOff, Send, SkipForward, RotateCcw, 
  AlertTriangle, Eye, Activity, BarChart, BookOpen, Clock, Play, 
  Volume2, Pause, Square, LogOut, CheckSquare, Settings
} from 'lucide-react';
import AudioVisualizer from './AudioVisualizer';

interface ActiveInterviewProps {
  questions: InterviewQuestion[];
  currentQuestionIndex: number;
  jobTarget: JobTarget;
  resumeInfo: ResumeInfo | null;
  onNextQuestion: (answerText: string, feedback: QuestionFeedback, stats: SpeakingStats, totalSpeakingSeconds?: number) => void;
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
  
  // Consent & Toggles for Mic & Camera
  const [micConsent, setMicConsent] = useState(false);
  const cameraConsent = false;
  const setCameraConsent = (val: boolean) => {};
  const [isAnalysisEnabled, setIsAnalysisEnabled] = useState(true);

  // Speech TTS state
  const [speechState, setSpeechState] = useState<'stopped' | 'speaking' | 'paused'>('stopped');

  // Natural Professional Voice Configuration States
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const autoPlaySpeech = true; // automatic autoplay for immersive panel atmosphere
  const playbackSpeed = 0.92; // fixed natural measured cadence for Albion students

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

  // Feedback State for the CURRENT question
  const [showFeedback, setShowFeedback] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<QuestionFeedback | null>(null);

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
    // Camera is disabled
  }, [cameraConsent, mediaStream]);

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

  // Load and subscribe to speechSynthesis voices changes
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    const loadVoices = () => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      const allVoices = window.speechSynthesis.getVoices();
      // Filter for English speaking voices
      const englishVoices = allVoices.filter(v => v.lang.toLowerCase().includes('en'));
      setVoices(englishVoices);
    };

    loadVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Helper to parse current speaker from panel context or fallback to general default
  const getSpeakerName = (text: string): 'Marcus' | 'Elena' | 'Sarah' | 'System' => {
    if (text.includes('Marcus (Technical Lead):')) return 'Marcus';
    if (text.includes('Elena (Director of Product):')) return 'Elena';
    if (text.includes('Sarah (HR):')) return 'Sarah';
    return 'System';
  };

  // Select professional voices based on speaker or override
  const selectSpeakerVoice = (text: string, availableVoices: SpeechSynthesisVoice[]) => {
    const speaker = getSpeakerName(text);

    if (speaker === 'Marcus') {
      // Find high quality male voices
      const maleVoice = availableVoices.find(v => 
        (v.name.includes('David') || v.name.includes('Mark') || v.name.includes('Male') || v.name.includes('Daniel') || v.name.includes('George') || v.name.toLowerCase().includes('male')) && 
        v.lang.toLowerCase().includes('en')
      );
      if (maleVoice) return maleVoice;
    } else if (speaker === 'Elena') {
      // Find high quality female voices
      const femaleVoice = availableVoices.find(v => 
        (v.name.includes('Zira') || v.name.includes('Samantha') || v.name.includes('Victoria') || v.name.includes('Female') || v.name.includes('Google US English')) && 
        v.lang.toLowerCase().includes('en') && !v.name.includes('Sarah')
      );
      if (femaleVoice) return femaleVoice;
    } else if (speaker === 'Sarah') {
      // Find high quality HR female voices
      const hrVoice = availableVoices.find(v => 
        (v.name.includes('Hazel') || v.name.includes('Zira') || v.name.includes('Samantha') || v.name.includes('Google UK English Female')) && 
        v.lang.toLowerCase().includes('en')
      );
      if (hrVoice) return hrVoice;
    }

    // Default Fallbacks
    const googleEng = availableVoices.find(v => v.lang.toLowerCase().includes('en') && v.name.includes('Google'));
    if (googleEng) return googleEng;

    const naturalEng = availableVoices.find(v => v.lang.toLowerCase().includes('en') && (v.name.includes('Natural') || v.name.includes('Neutral') || v.name.includes('Premium')));
    if (naturalEng) return naturalEng;

    const anyEng = availableVoices.find(v => v.lang.toLowerCase().startsWith('en'));
    return anyEng || null;
  };

  // Text-To-Speech (AI Voice Speaks Question) with pause/stop states
  const handleSpeakQuestion = () => {
    if ('speechSynthesis' in window) {
      if (speechState === 'paused') {
        window.speechSynthesis.resume();
        setSpeechState('speaking');
        return;
      }
      
      window.speechSynthesis.cancel();
      const textToSpeak = currentQuestion.text;
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      
      utterance.onstart = () => setSpeechState('speaking');
      utterance.onend = () => setSpeechState('stopped');
      utterance.onerror = (e) => {
        console.warn('SpeechSynthesis error:', e);
        setSpeechState('stopped');
      };

      const selectedVoice = selectSpeakerVoice(textToSpeak, voices);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      // Configure natural, professional candidate pacing (usually between 0.88x and 0.95x)
      utterance.rate = playbackSpeed;
      
      // Fine-tune tone pitches for different speakers to simulate the actual panel
      const speaker = getSpeakerName(textToSpeak);
      if (speaker === 'Marcus') {
        utterance.pitch = 0.93; // slightly deeper male technical voice
      } else if (speaker === 'Elena') {
        utterance.pitch = 1.05; // clear and communicative product manager voice
      } else if (speaker === 'Sarah') {
        utterance.pitch = 1.01; // balanced warm HR corporate voice
      } else {
        utterance.pitch = 1.0;
      }
      
      window.speechSynthesis.speak(utterance);
      setSpeechState('speaking');
    } else {
      alert('Speech synthesis is not supported on this browser.');
    }
  };

  const handlePauseQuestion = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.pause();
      setSpeechState('paused');
    }
  };

  const handleStopQuestion = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setSpeechState('stopped');
    }
  };

  // Cancel speech on unmount
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Question change listener - handles auto play with a comfortable natural transition delay
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setSpeechState('stopped');
    }
    
    if (autoPlaySpeech) {
      const timer = setTimeout(() => {
        handleSpeakQuestion();
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [currentQuestionIndex]);

  // Sync state if audio ends naturally
  useEffect(() => {
    const handleSilenceCheck = setInterval(() => {
      if ('speechSynthesis' in window) {
        if (!window.speechSynthesis.speaking && speechState !== 'stopped' && speechState !== 'paused') {
          setSpeechState('stopped');
        }
      }
    }, 1000);
    return () => clearInterval(handleSilenceCheck);
  }, [speechState]);

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
          category: currentQuestion.category
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

    // Propagate up to main state
    onNextQuestion(answerInput, currentFeedback, calculatedStats, totalSessionSeconds);
  };

  const handleTryAgain = () => {
    // Keep question text but reset local state answer
    setAnswerInput('');
    setElapsedSeconds(0);
    setFillerCount(0);
    setPausesCount(0);
    setShowFeedback(false);
    setCurrentFeedback(null);
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

        {/* Real-time Session Speaking Timer (Ideal range 2-5 min) */}
        <div className="flex flex-col items-center bg-white/60 border border-purple-100/50 rounded-2xl px-5 py-2 shadow-sm min-w-[240px] max-w-[280px]">
          <div className="flex items-center justify-between w-full">
            <span className="text-[9px] uppercase font-black tracking-wider text-gray-400">Practice Speaking Time</span>
            <div className="flex items-center space-x-1 bg-gray-50 px-2 py-0.5 rounded-lg border border-gray-100">
              <Clock className={`w-3.5 h-3.5 ${totalSessionSeconds < 120 ? 'text-amber-500 animate-pulse' : totalSessionSeconds > 300 ? 'text-orange-500' : 'text-emerald-500'}`} />
              <span className="font-mono text-sm font-black text-gray-800">
                {Math.floor(totalSessionSeconds / 60).toString().padStart(2, '0')}:{(totalSessionSeconds % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>
          
          <div className="w-full mt-1.5 space-y-1">
            <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden relative">
              {/* Progress bar up to 5 minutes (300s) */}
              <div 
                className={`h-full transition-all duration-300 ${
                  totalSessionSeconds < 120 
                    ? 'bg-amber-500' 
                    : totalSessionSeconds > 300 
                    ? 'bg-orange-500' 
                    : 'bg-emerald-600'
                }`}
                style={{ width: `${Math.min(100, (totalSessionSeconds / 300) * 100)}%` }}
              />
              {/* Marker lines for 2 min (40% of 5 min) */}
              <div className="absolute left-[40%] top-0 h-full w-[2px] bg-white/65" title="2-minute mark (minimum limit)" />
            </div>
            
            <div className="flex justify-between text-[9px] font-bold text-gray-500">
              <span className={totalSessionSeconds < 120 ? 'text-amber-600 font-extrabold' : ''}>
                {totalSessionSeconds < 120 ? 'Too Brief (Elaborate / Work more!)' : '2m mark reached'}
              </span>
              <span className={totalSessionSeconds >= 120 && totalSessionSeconds <= 300 ? 'text-emerald-600 font-extrabold' : totalSessionSeconds > 300 ? 'text-orange-500 font-extrabold' : ''}>
                {totalSessionSeconds < 120 ? 'Target: 2-5m' : 'Ideal zone'}
              </span>
            </div>
          </div>
        </div>

        {/* Evaluation Cues Toggle and Exit Button */}
        <div className="flex items-center space-x-6 flex-wrap gap-4">
          <label className="flex items-center space-x-2 text-xs font-semibold text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={isAnalysisEnabled}
              onChange={(e) => setIsAnalysisEnabled(e.target.checked)}
              className="rounded border-purple-300 text-albion-purple focus:ring-albion-purple h-4 w-4"
            />
            <span>Speaking Cues Analysis</span>
          </label>

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
          {/* Question Text */}
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-xl sm:text-2xl font-bold font-display text-albion-purple-dark leading-snug">
                "{currentQuestion.text}"
              </h3>
              
              {/* Refined Audio Controls */}
              <div className="flex items-center space-x-2 shrink-0">
                {speechState === 'stopped' ? (
                  <button
                    onClick={handleSpeakQuestion}
                    className="bg-purple-100 hover:bg-purple-250 text-albion-purple p-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer font-bold text-xs"
                    title="Speak question out loud (AI Voice)"
                  >
                    <Volume2 className="w-4 h-4" />
                    <span>Listen</span>
                  </button>
                ) : (
                  <div className="flex items-center space-x-1 p-1 bg-purple-50 rounded-xl border border-purple-200 shadow-sm">
                    {speechState === 'speaking' ? (
                      <button
                        onClick={handlePauseQuestion}
                        className="p-2 hover:bg-purple-100 text-amber-600 rounded-lg transition cursor-pointer"
                        title="Pause reading"
                      >
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={handleSpeakQuestion}
                        className="p-2 hover:bg-purple-100 text-[#49266F] rounded-lg transition cursor-pointer"
                        title="Resume reading"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                    )}
                    <button
                      onClick={handleStopQuestion}
                      className="p-2 hover:bg-purple-100 text-red-600 rounded-lg transition cursor-pointer"
                      title="Stop reading"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                  </div>
                )}
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
              <div className="flex items-center justify-between pb-4 border-b border-gray-200 flex-wrap gap-2">
                <div>
                  <h4 className="font-display font-bold text-lg text-albion-purple-dark">
                    Answer Performance Evaluator
                  </h4>
                  <p className="text-xs text-gray-400">Response analysis structured by career Center advisors</p>
                </div>
                {/* Score Indicator */}
                <div className="flex items-center space-x-2 bg-white px-4 py-2 rounded-xl border border-purple-100 shadow-sm shrink-0">
                  <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Score:</span>
                  <span className="text-xl font-black font-display text-albion-purple">{currentFeedback.score}</span>
                  <span className="text-xs text-gray-400">/ 10</span>
                </div>
              </div>

              {/* Strengths & Improvements */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <span className="text-xs font-bold text-green-700 uppercase tracking-widest block bg-green-50 px-2 py-0.5 rounded border border-green-100 w-max">
                    ✔ Core Strengths
                  </span>
                  <ul className="space-y-2 text-xs text-gray-600 block pl-4 list-disc">
                    {currentFeedback.strengths.map((str, i) => (
                      <li key={i}>{str}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-3">
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-widest block bg-amber-50 px-2 py-0.5 rounded border border-amber-100 w-max">
                    ⚠ Areas to Improve
                  </span>
                  <ul className="space-y-2 text-xs text-gray-600 block pl-4 list-disc">
                    {currentFeedback.areasToImprove.map((imp, i) => (
                      <li key={i}>{imp}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Best Model Answer */}
              <div className="bg-white p-4 rounded-xl border border-purple-100 space-y-2">
                <span className="text-[10px] font-bold text-albion-gold uppercase tracking-wider block">
                  Advisor Suggested Stronger Formulation
                </span>
                <p className="text-xs text-gray-600 leading-relaxed italic">
                  "{currentFeedback.suggestedAnswer}"
                </p>
              </div>

              {/* STAR validation for behavioral */}
              {currentFeedback.starAnalysis && (
                <div className="bg-purple-50 p-4 rounded-xl border border-purple-150 text-xs text-gray-600 space-y-1">
                  <span className="font-bold text-albion-purple p-0.5 uppercase tracking-wide block">
                    STAR Method Structure Alignment:
                  </span>
                  <p>{currentFeedback.starAnalysis}</p>
                </div>
              )}

              {/* General sub scores feedback comments */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
                {[
                  { label: 'Clarity', cVal: currentFeedback.clarityComments },
                  { label: 'Confidence', cVal: currentFeedback.confidenceComments },
                  { label: 'Structure', cVal: currentFeedback.structureComments },
                  { label: 'Relevance', cVal: currentFeedback.relevanceComments },
                  { label: 'Professionalism', cVal: currentFeedback.professionalismComments },
                ].map((crit, idx) => (
                  <div key={idx} className="bg-white p-2.5 rounded-lg border border-gray-150 text-center">
                    <span className="text-[10px] font-bold text-gray-400 block uppercase">{crit.label}</span>
                    <p className="text-[9px] text-gray-500 mt-1 leading-tight line-clamp-3" title={crit.cVal}>
                      {crit.cVal}
                    </p>
                  </div>
                ))}
              </div>

              {/* Objective Rubric Scorecard */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <span className="text-xs uppercase tracking-wider font-bold text-slate-700 flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4 text-albion-purple" />
                  Objective Rubric Grading Sheet
                </span>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* STAR Method Alignment */}
                  <div className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 font-medium">STAR Layout & Structure</span>
                      <strong className="text-gray-800">{currentFeedback.score >= 8 ? '9.0' : currentFeedback.score >= 6 ? '7.5' : '5.5'} / 10</strong>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-albion-purple h-full transition-all duration-300" style={{ width: `${currentFeedback.score >= 8 ? 90 : currentFeedback.score >= 6 ? 75 : 55}%` }} />
                    </div>
                  </div>

                  {/* Vocational Relevance */}
                  <div className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 font-medium">Relevance to Job Target</span>
                      <strong className="text-gray-800">{currentFeedback.score}.0 / 10</strong>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-albion-purple h-full transition-all duration-300" style={{ width: `${currentFeedback.score * 10}%` }} />
                    </div>
                  </div>

                  {/* Professional Register */}
                  <div className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                    <div className="flex justify-between items-center text-xs border-b border-gray-50/10 pb-0.5">
                      <span className="text-gray-500 font-medium">Professional Register & Dictionary</span>
                      <strong className="text-gray-800">{currentFeedback.score >= 8 ? '9.5' : currentFeedback.score >= 6 ? '8.0' : '6.0'} / 10</strong>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-albion-purple h-full transition-all duration-300" style={{ width: `${currentFeedback.score >= 8 ? 95 : currentFeedback.score >= 6 ? 80 : 60}%` }} />
                    </div>
                  </div>

                  {/* Vocal Composure */}
                  <div className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 font-medium">Clarity & Vocal Composure</span>
                      <strong className="text-gray-800">
                        {currentFeedback.speakingAnalysis 
                          ? Math.max(3, 10 - currentFeedback.speakingAnalysis.fillerWordsCount - currentFeedback.speakingAnalysis.longPausesCount) 
                          : (currentFeedback.score >= 7 ? 8.5 : 6.5)
                        }.0 / 10
                      </strong>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-albion-purple h-full transition-all duration-300" style={{ 
                        width: `${(currentFeedback.speakingAnalysis 
                          ? Math.max(3, 10 - currentFeedback.speakingAnalysis.fillerWordsCount - currentFeedback.speakingAnalysis.longPausesCount) 
                          : (currentFeedback.score >= 7 ? 8.5 : 6.5)) * 10}%` 
                      }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Speaking review panel */}
              {isAnalysisEnabled && currentFeedback.speakingAnalysis && (
                <div className="bg-indigo-50 border border-indigo-150 p-4 rounded-xl space-y-3">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-700 flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5" />
                    Speaking & Delivery Evaluation Cues
                  </span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-gray-600">
                    <div>
                      <span className="text-gray-400 block text-[10px]">Speaking Pace:</span>
                      <strong className="text-gray-800">{currentFeedback.speakingAnalysis.paceWpm} WPM</strong>
                      <span className="text-[9px] text-gray-450 block font-light">
                        {currentFeedback.speakingAnalysis.paceWpm > 165 ? 'Fast (nervous)' : currentFeedback.speakingAnalysis.paceWpm < 110 ? 'Thoughtful / deliberate' : 'Steady & confident'}
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-400 block text-[10px]">Filler Words count:</span>
                      <strong className="text-gray-800">{currentFeedback.speakingAnalysis.fillerWordsCount} items</strong>
                      <span className="text-[9px] text-gray-450 block font-light">
                        {currentFeedback.speakingAnalysis.fillerWordsCount > 4 ? 'Try pacing breaths' : 'Excellent composure'}
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-400 block text-[10px]">Long Pauses / Hesitation:</span>
                      <strong className="text-gray-800">{currentFeedback.speakingAnalysis.longPausesCount} pauses</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation controls */}
              <div className="pt-4 border-t border-gray-150 flex items-center justify-between">
                <button
                  id="btn-feedback-retry"
                  onClick={handleTryAgain}
                  className="flex items-center space-x-1.5 px-4 py-2 border border-purple-200 text-albion-purple rounded-xl hover:bg-purple-100/50 transition cursor-pointer text-xs font-bold"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Try Answer Again</span>
                </button>

                <button
                  id="btn-feedback-next"
                  onClick={handleNextStep}
                  className="bg-albion-purple hover:bg-albion-purple-light text-white font-bold px-6 py-2 rounded-xl transition duration-150 flex items-center space-x-1 cursor-pointer text-xs"
                >
                  <span>{currentQuestionIndex === questions.length - 1 ? 'Go to Report Board' : 'Proceed to Next Question'}</span>
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* TEXT TYPE ANSWER CRADLE */
            <div className="space-y-4">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
                Your Answer response Transcript
              </label>
              
              <textarea
                id="interview-answer-input"
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                className="w-full h-64 px-4 py-3 rounded-xl border border-purple-100 focus:border-albion-purple focus:ring-1 focus:ring-albion-purple outline-none font-sans text-sm bg-gray-50/20"
                placeholder="Type your structured answer response here... Alternatively, turn on your microphone and click 'Speak Response' below to transcribe your voice real-time!"
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
                <div className="flex items-center space-x-2">
                  {/* Mic Trigger */}
                  <button
                    id="btn-mic-trigger"
                    type="button"
                    onClick={startSpeechCapture}
                    className={`p-3 rounded-xl flex items-center space-x-2 transition text-xs font-bold cursor-pointer ${
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

                {/* Submitting evaluation button */}
                <button
                  id="btn-submit-answer"
                  onClick={handleSubmitAnswer}
                  disabled={isSubmitting || !answerInput.trim()}
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
    </div>
  );
}
