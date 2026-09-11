import { useState, useRef, useEffect } from 'react';
import { 
  Video, VideoOff, Mic, MicOff, Play, Pause, RotateCcw, 
  CheckCircle2, AlertCircle, Camera, UploadCloud, Mail, Sparkles, X, RefreshCw
} from 'lucide-react';

interface VideoResponseRecorderProps {
  questionText: string;
  questionId: string;
  onVideoApproved: (videoBlob: Blob, videoUrl: string, durationSeconds: number, transcriptText: string) => void;
  onFallbackToText: () => void;
  existingVideoUrl?: string | null;
  existingTranscript?: string;
}

export default function VideoResponseRecorder({
  questionText,
  questionId,
  onVideoApproved,
  onFallbackToText,
  existingVideoUrl,
  existingTranscript = ''
}: VideoResponseRecorderProps) {
  // Opt-in UI State
  const [hasOptedIn, setHasOptedIn] = useState<boolean | null>(existingVideoUrl ? true : null);

  // Stream & Recorder State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'preview'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Timers & Chunks
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Live Audio Transcript State
  const [transcriptText, setTranscriptText] = useState(existingTranscript || '');
  const recognitionRef = useRef<any>(null);

  // Video Element Refs
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  // Generated Video Blob & Object URL
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(existingVideoUrl || null);

  // Email Notification State
  const [emailInput, setEmailInput] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSentSuccess, setEmailSentSuccess] = useState(false);

  // Initialize Web Speech Recognition concurrently with video
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (e: any) => {
        let finalStr = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) {
            finalStr += e.results[i][0].transcript + ' ';
          }
        }
        if (finalStr) {
          setTranscriptText((prev) => (prev ? prev + ' ' + finalStr.trim() : finalStr.trim()));
        }
      };

      rec.onerror = (e: any) => {
        console.warn('Speech recognition notice during video capture:', e.error);
      };

      recognitionRef.current = rec;
    }
  }, []);

  // Initialize or Stop Camera Stream
  const startCamera = async () => {
    setCameraError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true
      });
      setStream(mediaStream);
      setIsCameraActive(true);
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('Unable to access camera or microphone. Please check browser permissions or switch to text answer.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
  };

  // Sync live video ref whenever stream updates
  useEffect(() => {
    if (liveVideoRef.current && stream) {
      liveVideoRef.current.srcObject = stream;
    }
  }, [stream, isCameraActive]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_e) {}
      }
    };
  }, [stream]);

  // Opt-In Handlers
  const handleAcceptOptIn = async () => {
    setHasOptedIn(true);
    await startCamera();
  };

  const handleDeclineOptIn = () => {
    setHasOptedIn(false);
    stopCamera();
    onFallbackToText();
  };

  // Start MediaRecorder AND Speech Recognition simultaneously
  const startRecording = () => {
    if (!stream) return;

    chunksRef.current = [];
    setRecordingSeconds(0);
    setRecordedBlob(null);
    setPreviewUrl(null);

    let mimeType = 'video/webm;codecs=vp9,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      if (MediaRecorder.isTypeSupported('video/webm')) {
        mimeType = 'video/webm';
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
      } else {
        mimeType = '';
      }
    }

    try {
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch (_e) {
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalBlob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
        const url = URL.createObjectURL(finalBlob);
        setRecordedBlob(finalBlob);
        setPreviewUrl(url);
        setRecordingState('preview');
        stopCamera();
      };

      recorder.start(200); // 200ms slice interval
      mediaRecorderRef.current = recorder;
      setRecordingState('recording');

      // Simultaneously trigger live speech-to-text recognition
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (_e) {
          // Already running
        }
      }

      // Recording timer
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (e: any) {
      console.error('Failed to start MediaRecorder:', e);
      alert('Could not start video recording. Please ensure camera/mic permissions are granted.');
    }
  };

  // Stop MediaRecorder and Speech Recognition simultaneously
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_e) {}
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Re-record Attempt
  const handleReRecord = async () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setRecordedBlob(null);
    setPreviewUrl(null);
    setRecordingState('idle');
    setRecordingSeconds(0);
    setTranscriptText('');
    await startCamera();
  };

  // Confirm and attach video + transcript to response
  const handleConfirmVideo = () => {
    if (recordedBlob && previewUrl) {
      onVideoApproved(recordedBlob, previewUrl, recordingSeconds, transcriptText);
    }
  };

  // Optional: Trigger automated email containing prompt & watch response link
  const handleSendEmailNotification = async () => {
    if (!emailInput.trim()) return;
    setSendingEmail(true);
    setEmailSentSuccess(false);

    try {
      const res = await fetch('/api/interview/send-video-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: emailInput.trim(),
          questionId,
          questionText,
          videoUrl: previewUrl || 'https://ais-dev-zp7kqjpekwxdkncvomrml2-772396752309.us-east1.run.app',
          durationSeconds: recordingSeconds
        })
      });

      if (res.ok) {
        setEmailSentSuccess(true);
      } else {
        alert('Could not dispatch notification email. Please check address.');
      }
    } catch (err) {
      console.error('Email error:', err);
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 border border-purple-800/60 text-white rounded-3xl p-6 shadow-2xl space-y-6">
      
      {/* 1. OPT-IN SELECTION PROMPT */}
      {hasOptedIn === null && (
        <div className="space-y-5 text-center max-w-xl mx-auto py-4 animate-fade-in">
          <div className="w-14 h-14 bg-purple-600/30 border border-purple-400/40 text-amber-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <Video className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <span className="bg-purple-900/80 text-purple-200 border border-purple-700 px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider">
              Optional Interview Feature
            </span>
            <h3 className="text-xl font-bold text-white font-display">
              Would you like to record a Video Response for this question?
            </h3>
            <p className="text-xs text-purple-200/80 leading-relaxed">
              Recording your response lets you practice eye contact, posture, body language, and vocal pacing just like in a live MMI or corporate panel interview.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              id="btn-optin-video-yes"
              type="button"
              onClick={handleAcceptOptIn}
              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Camera className="w-4 h-4 text-amber-300" />
              <span>Yes, Enable Camera & Record</span>
            </button>

            <button
              id="btn-optin-video-no"
              type="button"
              onClick={handleDeclineOptIn}
              className="w-full sm:w-auto px-6 py-3 bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <VideoOff className="w-4 h-4 text-slate-400" />
              <span>No, Continue with Text / Voice Answer</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. ACTIVE VIDEO RECORDING OR PREVIEW INTERFACE */}
      {hasOptedIn && (
        <div className="space-y-5 animate-fade-in">
          
          {/* Header Controls & Status */}
          <div className="flex items-center justify-between flex-wrap gap-3 border-b border-purple-800/60 pb-4">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${recordingState === 'recording' ? 'bg-red-500 animate-ping' : 'bg-emerald-400'}`} />
              <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>Unified Record & Transcribe Studio</span>
                {recordingState === 'recording' && (
                  <span className="bg-red-500 text-white text-[10px] font-mono px-2 py-0.5 rounded-full font-black animate-pulse">
                    REC & TRANSCRIBING ({recordingSeconds}s)
                  </span>
                )}
              </h4>
            </div>

            <button
              type="button"
              onClick={handleDeclineOptIn}
              className="text-xs text-purple-300 hover:text-white flex items-center gap-1.5 bg-purple-950 hover:bg-purple-900 border border-purple-800 px-3 py-1.5 rounded-lg transition"
            >
              <VideoOff className="w-3.5 h-3.5" />
              <span>Switch to Text-Only</span>
            </button>
          </div>

          {/* Multimodal Rules & Roles Compliance Callout */}
          <div className="bg-slate-900/90 border border-indigo-500/40 rounded-2xl p-4 text-xs space-y-2">
            <div className="flex items-center gap-2 text-albion-gold font-bold">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="uppercase tracking-wider font-mono text-[11px]">Unified Feature Specification: Record & Transcribe</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-[11px]">
              <div className="bg-purple-950/60 p-2.5 rounded-xl border border-purple-800/60 space-y-1">
                <span className="font-bold text-purple-300 block">🎙️ Audio / Speech-to-Text Pipeline</span>
                <p className="text-purple-100/80 leading-relaxed">
                  Audio is transcribed live to text. This transcript serves as the <strong>sole basis</strong> for content evaluation, STAR structure, and AI scoring.
                </p>
              </div>
              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 space-y-1">
                <span className="font-bold text-indigo-300 block">📹 Video Playback (Self-Reflection Aid)</span>
                <p className="text-slate-300/80 leading-relaxed">
                  Video feed is strictly a visual aid for student self-review. <strong>Zero visual metrics</strong> (eye tracking, facial expression, appearance) are evaluated or scored.
                </p>
              </div>
            </div>
          </div>

          {/* Camera Error Display */}
          {cameraError && (
            <div className="bg-red-950/80 border border-red-700 text-red-200 p-4 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-2 text-xs">
                <p className="font-semibold">{cameraError}</p>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" /> Retry Camera
                  </button>
                  <button
                    type="button"
                    onClick={handleDeclineOptIn}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg transition cursor-pointer"
                  >
                    Use Text Input
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Video Display Area: Live Feed OR Recorded Preview */}
          <div className="relative aspect-video bg-slate-950 rounded-2xl overflow-hidden border border-purple-800/80 shadow-inner flex items-center justify-center">
            
            {/* Live Camera Feed */}
            {recordingState !== 'preview' && (
              <>
                <video
                  ref={liveVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transform -scale-x-100 ${!isCameraActive ? 'hidden' : ''}`}
                />

                {!isCameraActive && !cameraError && (
                  <div className="text-center space-y-3 p-6">
                    <Camera className="w-10 h-10 text-purple-400/60 mx-auto animate-bounce" />
                    <p className="text-xs text-purple-300">Initializing camera feed...</p>
                    <button
                      type="button"
                      onClick={startCamera}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-md transition"
                    >
                      Enable Camera Feed
                    </button>
                  </div>
                )}

                {/* Live Overlay Timer Badge */}
                {recordingState === 'recording' && (
                  <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-red-500/80 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                    <span className="font-mono font-black text-sm text-red-400">{recordingSeconds}s</span>
                  </div>
                )}
              </>
            )}

            {/* Recorded Video Playback Preview */}
            {recordingState === 'preview' && previewUrl && (
              <video
                ref={previewVideoRef}
                src={previewUrl}
                controls
                playsInline
                className="w-full h-full object-contain bg-black"
              />
            )}
          </div>

          {/* Generated Audio Transcript Display & Edit Box */}
          <div className="bg-slate-950/90 border border-purple-800/80 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-purple-200 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                <Mic className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>Generated Audio Transcript (Speech-to-Text Pipeline)</span>
              </label>
              <span className="text-[10px] text-purple-300/70 font-mono bg-purple-900/60 px-2 py-0.5 rounded-full border border-purple-700/60">
                Evaluating Pipeline Input
              </span>
            </div>
            
            <textarea
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
              placeholder={recordingState === 'recording' ? "Listening... Your speech is being transcribed here in real-time..." : "Your recorded response transcript will appear here. You can also edit or polish it before submitting."}
              rows={3}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-400 font-sans leading-relaxed"
            />
            <p className="text-[10px] text-purple-300/70 italic">
              * The AI Content Evaluator processes this text transcript exclusively to score your answer structure and clarity.
            </p>
          </div>

          {/* Action Controls for Recording / Review */}
          <div className="space-y-4">
            
            {/* State: Idle / Camera Active -> Start Recording */}
            {recordingState === 'idle' && (
              <div className="flex items-center justify-center pt-2">
                <button
                  id="btn-start-video-record"
                  type="button"
                  onClick={startRecording}
                  disabled={!isCameraActive}
                  className="px-8 py-3.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-wider rounded-2xl shadow-xl transition flex items-center gap-2 cursor-pointer scale-105 hover:scale-110 active:scale-95"
                >
                  <span className="w-3 h-3 rounded-full bg-white animate-pulse" />
                  <span>Start Recording Answer</span>
                </button>
              </div>
            )}

            {/* State: Recording -> Stop Recording */}
            {recordingState === 'recording' && (
              <div className="flex items-center justify-center pt-2">
                <button
                  id="btn-stop-video-record"
                  type="button"
                  onClick={stopRecording}
                  className="px-8 py-3.5 bg-slate-800 hover:bg-slate-700 text-white border-2 border-red-500 font-extrabold text-xs uppercase tracking-wider rounded-2xl shadow-xl transition flex items-center gap-2 cursor-pointer animate-pulse"
                >
                  <span className="w-3.5 h-3.5 bg-red-500 rounded-sm" />
                  <span>Stop & Play Back Recording ({recordingSeconds}s)</span>
                </button>
              </div>
            )}

            {/* State: Preview -> Re-record / Approve / Send Email */}
            {recordingState === 'preview' && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between flex-wrap gap-3 bg-purple-950/60 p-4 rounded-2xl border border-purple-800/80">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Video Response Recorded ({recordingSeconds}s)
                    </span>
                    <p className="text-[11px] text-purple-200/80">
                      Play back your video above to review your posture, voice clarity, and posture.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      id="btn-rerecord-video"
                      type="button"
                      onClick={handleReRecord}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                      <span>Re-record Attempt</span>
                    </button>

                    <button
                      id="btn-confirm-video-attach"
                      type="button"
                      onClick={handleConfirmVideo}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                      <span>Approve & Attach Video</span>
                    </button>
                  </div>
                </div>

                {/* Optional Email Notification Box with Watch Link */}
                <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-purple-400" />
                      Send Transactional Email Notification (Optional)
                    </label>
                    {emailSentSuccess && (
                      <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Dispatched!
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="Enter advisor or recruiter email (e.g. mentor@albion.edu)..."
                      className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    />
                    <button
                      type="button"
                      disabled={sendingEmail || !emailInput.trim()}
                      onClick={handleSendEmailNotification}
                      className="px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition cursor-pointer shrink-0"
                    >
                      {sendingEmail ? 'Dispatching...' : 'Send Watch Link'}
                    </button>
                  </div>
                </div>

              </div>
            )}

          </div>

        </div>
      )}

    </div>
  );
}
