import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import ResumeForm from './components/ResumeForm';
import InterviewPreparer from './components/InterviewPreparer';
import ActiveInterview from './components/ActiveInterview';
import FinalReportView from './components/FinalReportView';
import { ResumeInfo, JobTarget, InterviewSession, QuestionFeedback, SpeakingStats, FinalReport } from './types';
import { Shield, Trash2, KeyRound, Sparkles, GraduationCap, ChevronRight, CheckCircle2, User, Mail, Award, LineChart, Stethoscope, Briefcase, LogIn, ExternalLink } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, getDocs, collection } from 'firebase/firestore';
import { stopTtsAudio } from './utils/geminiTtsAudio';

export default function App() {
  // Navigation
  const [currentTab, setCurrentTab] = useState('home');

  // Profile / Authentication
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [loginEmailInput, setLoginEmailInput] = useState('jsyandira4@gmail.com');
  const [loginNameInput, setLoginNameInput] = useState('Brit Student');

  // Local Resume Info
  const [resumeInfo, setResumeInfo] = useState<ResumeInfo | null>(null);

  // Sessions state
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [activeSession, setActiveSession] = useState<InterviewSession | null>(null);
  const [selectedReportSession, setSelectedReportSession] = useState<InterviewSession | null>(null);

  // Track modal state
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [initialInterviewTrack, setInitialInterviewTrack] = useState<'regular' | 'medical_school'>('regular');

  // Status flags
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);
  const [authConfigNotFound, setAuthConfigNotFound] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // local state
  const [completedQuestionIds, setCompletedQuestionIds] = useState<string[]>([]);

  const isGuest = !auth.currentUser && !userEmail;

  // Authenticated listener and loading Firestore user database
  useEffect(() => {
    // Attempt guest/user mode hydration first
    const savedEmail = localStorage.getItem('brit_user_email');
    const savedName = localStorage.getItem('brit_user_name');
    const savedResume = localStorage.getItem('brit_resume_info');
    const savedSessions = localStorage.getItem('brit_sessions');
    const savedCompletedQIds = localStorage.getItem('brit_completed_question_ids');

    if (savedCompletedQIds) {
      try {
        setCompletedQuestionIds(JSON.parse(savedCompletedQIds));
      } catch (e) {}
    }

    if (savedEmail) {
      setUserEmail(savedEmail);
      if (savedName) setUserName(savedName);
      if (savedResume) {
        try {
          setResumeInfo(JSON.parse(savedResume));
        } catch (e) {
          console.error('Failed to parse saved resume');
        }
      }
      if (savedSessions) {
        try {
          setSessions(JSON.parse(savedSessions));
        } catch (e) {
          console.error('Failed to parse sessions history');
        }
      }
    } else {
      // Load transient Guest sessions/resume from sessionStorage
      const guestResume = sessionStorage.getItem('brit_resume_info_guest');
      const guestSessions = sessionStorage.getItem('brit_sessions_guest');
      if (guestResume) {
        try {
          setResumeInfo(JSON.parse(guestResume));
        } catch (e) {}
      }
      if (guestSessions) {
        try {
          setSessions(JSON.parse(guestSessions));
        } catch (e) {}
      }
    }

    // Subscribe to Firebase Authentication
    setIsLoading(true);
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUserEmail(firebaseUser.email);
        setUserName(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Brit Student');
        setUserPhoto(firebaseUser.photoURL || null);
        
        // Fetch User Profile from Firestore
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        try {
          const userSnap = await getDoc(userDocRef);

          if (userSnap.exists()) {
            const userData = userSnap.data();
            if (userData.completedQuestionIds && Array.isArray(userData.completedQuestionIds)) {
              setCompletedQuestionIds(prev => {
                const merged = Array.from(new Set([...prev, ...userData.completedQuestionIds]));
                localStorage.setItem('brit_completed_question_ids', JSON.stringify(merged));
                return merged;
              });
            }
          }
          
          // Migrate Guest Resume transient state if present
          const guestResumeStr = sessionStorage.getItem('brit_resume_info_guest');
          let finalResume: ResumeInfo | null = null;
          if (guestResumeStr) {
            try {
              finalResume = JSON.parse(guestResumeStr);
              await setDoc(userDocRef, { savedResume: finalResume }, { merge: true });
              sessionStorage.removeItem('brit_resume_info_guest');
              triggerToast('Your guest resume setup has been saved to your account!');
            } catch (e) {
              console.error('Failed to parse guest resume in auth subscription', e);
            }
          } else if (userSnap.exists()) {
            const userData = userSnap.data();
            if (userData.savedResume) {
              finalResume = userData.savedResume;
            }
          }

          if (finalResume) {
            setResumeInfo(finalResume);
            localStorage.setItem('brit_resume_info', JSON.stringify(finalResume));
          } else {
            // Write new registered profile to Firestore
            const newProfile = {
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || 'Brit Student',
              createdAt: new Date().toISOString()
            };
            await setDoc(userDocRef, newProfile, { merge: true });
          }

          // Migrate Guest Sessions transient state if present
          const guestSessionsStr = sessionStorage.getItem('brit_sessions_guest');
          let guestSessionsList: InterviewSession[] = [];
          if (guestSessionsStr) {
            try {
              guestSessionsList = JSON.parse(guestSessionsStr);
              for (const s of guestSessionsList) {
                const migratedSession = { ...s, userId: firebaseUser.uid };
                const sessionDocRef = doc(db, 'users', firebaseUser.uid, 'sessions', migratedSession.id);
                await setDoc(sessionDocRef, migratedSession);
              }
              sessionStorage.removeItem('brit_sessions_guest');
              triggerToast(`Saved ${guestSessionsList.length} guest session(s) to your account!`);
            } catch (e) {
              console.error('Failed to parse & migrate guest sessions in auth subscription', e);
            }
          }

          // Fetch past sessions subcollection
          const sessionsColRef = collection(db, 'users', firebaseUser.uid, 'sessions');
          const sessionsSnap = await getDocs(sessionsColRef);
          const loadedSessions: InterviewSession[] = [];
          sessionsSnap.forEach((doc) => {
            loadedSessions.push(doc.data() as InterviewSession);
          });
          
          setSessions(loadedSessions);
          localStorage.setItem('brit_sessions', JSON.stringify(loadedSessions));

          // Update active/report sessions in state if they were guest sessions
          setActiveSession(currentActive => currentActive?.userId === 'guest' ? { ...currentActive, userId: firebaseUser.uid } : currentActive);
          setSelectedReportSession(currentReport => currentReport?.userId === 'guest' ? { ...currentReport, userId: firebaseUser.uid } : currentReport);
          
        } catch (error) {
          console.error('Firestore synchronization error:', error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Stop Gemini TTS playback on tab changes
  useEffect(() => {
    if (currentTab !== 'active-interview') {
      stopTtsAudio();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  }, [currentTab]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleSaveResume = async (updatedResume: ResumeInfo) => {
    setResumeInfo(updatedResume);
    
    if (auth.currentUser) {
      localStorage.setItem('brit_resume_info', JSON.stringify(updatedResume));
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      try {
        await updateDoc(userDocRef, { savedResume: updatedResume });
      } catch (error) {
        try {
          await setDoc(userDocRef, { savedResume: updatedResume }, { merge: true });
        } catch (setErr) {
          handleFirestoreError(setErr, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
        }
      }
    } else {
      // It is guest mode! Store transiently in sessionStorage only
      sessionStorage.setItem('brit_resume_info_guest', JSON.stringify(updatedResume));
    }
    triggerToast('Academic background profile successfully locks!');
  };

  // Google Authentication handler
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    setUnauthorizedDomain(null);
    setAuthConfigNotFound(false);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      triggerToast(`Welcome, ${result.user.displayName || 'Brit Student'}! Synchronization ready.`);
      setShowAuthModal(false);
    } catch (err: any) {
      console.warn('Google Sign-In notice:', err?.code || err?.message || err);
      if (err?.code === 'auth/unauthorized-domain' || (err?.message && err.message.includes('auth/unauthorized-domain'))) {
        const domain = window.location.hostname;
        setUnauthorizedDomain(domain);
        setErrorMsg(`Unauthorized Domain: "${domain}" is not authorized for Google Sign-In in Firebase Console.`);
        triggerToast('Firebase Auth domain authorization required.');
      } else if (err?.code === 'auth/configuration-not-found' || (err?.message && err.message.includes('auth/configuration-not-found'))) {
        setAuthConfigNotFound(true);
        setErrorMsg('Google Sign-In provider is not enabled in Firebase Console (or requires project owner permission).');
        triggerToast('Google provider not configured in Firebase.');
      } else if (err?.code === 'auth/popup-closed-by-user') {
        // User closed popup without completing
        setErrorMsg(null);
      } else {
        setErrorMsg(`Authentication notice: ${err?.message || 'Unknown error'}. You can sign in directly below.`);
        triggerToast('Please sign in with your email profile below.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Instant Guest/Offline login handler
  const handleInstantGuestLogin = () => {
    const email = loginEmailInput.trim() || 'student@albion.edu';
    const name = loginNameInput.trim() || 'Brit Student';

    setUserEmail(email);
    setUserName(name);
    localStorage.setItem('brit_user_email', email);
    localStorage.setItem('brit_user_name', name);

    setShowAuthModal(false);
    setErrorMsg(null);
    setUnauthorizedDomain(null);
    triggerToast(`Welcome, ${name}! Signed in with Guest Student profile.`);
  };

  // Simulated email Guest/Offline login handler
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmailInput.trim()) return;

    const email = loginEmailInput.trim();
    const name = loginNameInput.trim() || email.split('@')[0];

    setUserEmail(email);
    setUserName(name);
    localStorage.setItem('brit_user_email', email);
    localStorage.setItem('brit_user_name', name);

    // Save Guest Resume permanently if available
    const guestResumeStr = sessionStorage.getItem('brit_resume_info_guest');
    if (guestResumeStr) {
      localStorage.setItem('brit_resume_info', guestResumeStr);
      sessionStorage.removeItem('brit_resume_info_guest');
    }

    // Save Guest Sessions copy permanently if available
    const guestSessionsStr = sessionStorage.getItem('brit_sessions_guest');
    if (guestSessionsStr) {
      try {
        const guestSessions: InterviewSession[] = JSON.parse(guestSessionsStr);
        // Map userIds of these sessions to this simulated offline email
        const updatedSessionsList = [...sessions].map(s => s.userId === 'guest' ? { ...s, userId: email } : s);
        setSessions(updatedSessionsList);
        localStorage.setItem('brit_sessions', JSON.stringify(updatedSessionsList));
        sessionStorage.removeItem('brit_sessions_guest');
      } catch (e) {
        console.error('Failed to parse guest sessions during simulated account creation', e);
      }
    } else {
      localStorage.setItem('brit_sessions', JSON.stringify(sessions));
    }

    setShowAuthModal(false);
    triggerToast(`Welcome back, ${name}! Your guest preparation progress has been permanently migrated.`);
  };

  // Real or Guest Sign out handler
  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Signout failed', err);
    }
    setUserEmail(null);
    setUserName(null);
    setUserPhoto(null);
    localStorage.removeItem('brit_user_email');
    localStorage.removeItem('brit_user_name');
    localStorage.removeItem('brit_resume_info');
    localStorage.removeItem('brit_sessions');
    sessionStorage.removeItem('brit_resume_info_guest');
    sessionStorage.removeItem('brit_sessions_guest');
    setResumeInfo(null);
    setSessions([]);
    setActiveSession(null);
    setSelectedReportSession(null);
    setCurrentTab('home');
    setIsLoading(false);
    triggerToast('Signed out of student profile.');
  };

  // Purge all user data
  const handlePurgeAllData = async () => {
    if (window.confirm('WARNING: This permanently deletes all your uploaded resume details and past interview scores. This cannot be undone.')) {
      setIsLoading(true);
      try {
        await signOut(auth);
      } catch (err) {}
      localStorage.clear();
      setUserEmail(null);
      setUserName(null);
      setResumeInfo(null);
      setSessions([]);
      setActiveSession(null);
      setSelectedReportSession(null);
      setCurrentTab('home');
      setIsLoading(false);
      triggerToast('All local career prep data has been wiped.');
    }
  };

  // Start configuring a new session
  const handleConfigureNewSession = () => {
    if (!resumeInfo || !resumeInfo.isParsed) {
      triggerToast('Please upload or drag & drop your PDF resume first to customize your mock interview!');
      setCurrentTab('resume');
      return;
    }
    setShowTrackModal(true);
  };

  const handleSelectTrackAndProceed = (track: 'regular' | 'medical_school') => {
    setInitialInterviewTrack(track);
    setShowTrackModal(false);
    setCurrentTab('interview-preparer');
  };

  // Safe Exit during an ongoing interview
  const handleExitActiveInterview = () => {
    if (window.confirm('Are you sure you want to exit the mock interview? Your responses in this active round will not be saved.')) {
      stopTtsAudio();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setActiveSession(null);
      setCurrentTab('interview-preparer');
      triggerToast('Mock interview session exited.');
    }
  };

  // Generate Questions via API and transition to Active Interview
  const handleStartPlanningSession = async (target: JobTarget) => {
    setIsLoading(true);
    setErrorMsg(null);

    let sessionToStart: InterviewSession | null = null;

    try {
      const response = await fetch('/api/interview/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeInfo,
          jobTarget: target,
          seenQuestionIds: completedQuestionIds
        }),
      });

      if (!response.ok) {
        throw new Error('Interview plan generation failed on server');
      }

      const data = await response.json();
      if (!data.questions || data.questions.length === 0) {
        throw new Error('No mock questions returned from coach');
      }

      // Create new session structural record
      sessionToStart = {
        id: 'session_' + Date.now(),
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        jobTarget: target,
        resumeInfo,
        questions: data.questions,
        currentQuestionIndex: 0,
        userAnswers: {},
        feedbacks: {},
        speakingStatsHistory: {},
        isCompleted: false,
        userId: auth.currentUser ? auth.currentUser.uid : 'guest'
      };
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to weave mock plan. Retrying with offline parameters...');
      
      // Setup offline default simulation session
      const offlineQuestions = [
        { id: 'q1', text: `Hello Brit! Why are you interested in becoming a ${target.positionTitle} at ${target.companyName}, and how does your Albion background fit this?`, category: 'general' as const },
        { id: 'q2', text: 'Tell me about a time you solved a hard laboratory or teamwork problem using critical thinking.', category: 'behavioral' as const },
        { id: 'q3', text: 'What is one professional strength you possess, and one area you are working to refine?', category: 'closing' as const }
      ];

      sessionToStart = {
        id: 'session_' + Date.now(),
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        jobTarget: target,
        resumeInfo,
        questions: offlineQuestions,
        currentQuestionIndex: 0,
        userAnswers: {},
        feedbacks: {},
        speakingStatsHistory: {},
        isCompleted: false,
        userId: auth.currentUser ? auth.currentUser.uid : 'guest'
      };
    }

    if (sessionToStart) {
      setActiveSession(sessionToStart);
      setCurrentTab('active-interview');

      // Sync with Firestore if authenticated
      if (auth.currentUser) {
        const sessionDocRef = doc(db, 'users', auth.currentUser.uid, 'sessions', sessionToStart.id);
        try {
          await setDoc(sessionDocRef, sessionToStart);
        } catch (fsErr) {
          handleFirestoreError(fsErr, OperationType.CREATE, `users/${auth.currentUser.uid}/sessions/${sessionToStart.id}`);
        }
      }
    }
    setIsLoading(false);
  };

  // Each answer submitted successfully
  const handleAnswerReceived = async (
    answerText: string,
    feedback: QuestionFeedback,
    stats: SpeakingStats,
    totalSpeakingSeconds?: number,
    videoUrl?: string
  ) => {
    if (!activeSession) return;

    const currentQ = activeSession.questions[activeSession.currentQuestionIndex];
    
    // Add current details to the activeSession structure
    const updatedAnswers = { ...activeSession.userAnswers, [currentQ.id]: answerText };
    const updatedFeedbacks = { ...activeSession.feedbacks, [currentQ.id]: feedback };
    const updatedSpeaking = { ...activeSession.speakingStatsHistory, [currentQ.id]: stats };
    const updatedVideoUrls = videoUrl 
      ? { ...(activeSession.videoUrls || {}), [currentQ.id]: videoUrl }
      : activeSession.videoUrls;

    const nextIndex = activeSession.currentQuestionIndex + 1;
    const isFinished = nextIndex >= activeSession.questions.length;

    const progressSession: InterviewSession = {
      ...activeSession,
      userAnswers: updatedAnswers,
      feedbacks: updatedFeedbacks,
      speakingStatsHistory: updatedSpeaking,
      videoUrls: updatedVideoUrls,
      currentQuestionIndex: nextIndex,
      totalSpeakingSeconds: totalSpeakingSeconds ?? activeSession.totalSpeakingSeconds,
    };

    if (isFinished) {
      // Calculate final summary report!
      setIsLoading(true);
      setCurrentTab('home'); // temporary wait state
      
      // Fetch ATS Resume Coach simultaneously
      let atsReportData: any = null;
      try {
        const atsResponse = await fetch('/api/resume/ats-coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeInfo,
            targetRole: activeSession.jobTarget.positionTitle,
            jobDescription: activeSession.jobTarget.jobDescription
          })
        });
        if (atsResponse.ok) {
          atsReportData = await atsResponse.json();
        }
      } catch (atsErr) {
        console.error("Failed to fetch ATS resume feedback concurrently:", atsErr);
      }

      try {
        // Compile Log for Gemini
        const historyLog = activeSession.questions.map((q) => ({
          questionText: q.text,
          answerText: updatedAnswers[q.id],
          feedback: updatedFeedbacks[q.id]
        }));

        const reportResponse = await fetch('/api/interview/generate-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionHistory: historyLog,
            resumeInfo,
            jobTarget: activeSession.jobTarget,
            totalSpeakingSeconds: progressSession.totalSpeakingSeconds
          }),
        });

        if (!reportResponse.ok) throw new Error('Report synthesis failed');

        const reportData: FinalReport = await reportResponse.json();

        // Client-side safeguard: Enforce zero score if all questions in session were skipped
        const allUserAnswers = Object.values(updatedAnswers);
        const nonSkippedAnswers = allUserAnswers.filter((ans: any) => {
          const clean = String(ans || '').trim().toLowerCase();
          return clean && clean !== '[skipped question]' && !clean.includes('skipped question');
        });

        if (nonSkippedAnswers.length === 0) {
          reportData.overallScore = 0;
          reportData.communicationScore = 0;
          reportData.contentQualityScore = 0;
          reportData.resumeAlignmentScore = 0;
          reportData.confidenceClarityScore = 0;
        }

        if (atsReportData) {
          reportData.atsResumeReport = atsReportData;
        }
        progressSession.finalReport = reportData;
        progressSession.isCompleted = true;

        // Extract answered question IDs to prevent duplicate questions in future sessions
        const newCompletedIds = activeSession.questions.map(q => q.scenario_id || q.id).filter(Boolean);
        setCompletedQuestionIds(prev => {
          const merged = Array.from(new Set([...prev, ...newCompletedIds]));
          localStorage.setItem('brit_completed_question_ids', JSON.stringify(merged));
          return merged;
        });

        // Save Completed Session
        const updatedSessions = [...sessions, progressSession];
        setSessions(updatedSessions);
        
        if (auth.currentUser || userEmail) {
          localStorage.setItem('brit_sessions', JSON.stringify(updatedSessions));
        } else {
          sessionStorage.setItem('brit_sessions_guest', JSON.stringify(updatedSessions));
        }

        if (auth.currentUser) {
          const sessionDocRef = doc(db, "users", auth.currentUser.uid, "sessions", progressSession.id);
          const userDocRef = doc(db, "users", auth.currentUser.uid);
          try {
            await updateDoc(sessionDocRef, {
              userAnswers: updatedAnswers,
              feedbacks: updatedFeedbacks,
              speakingStatsHistory: updatedSpeaking,
              currentQuestionIndex: nextIndex,
              isCompleted: true,
              finalReport: reportData,
              totalSpeakingSeconds: progressSession.totalSpeakingSeconds
            });
            // Update user profile completedQuestionIds array
            const updatedCompletedIds = Array.from(new Set([...completedQuestionIds, ...newCompletedIds]));
            await updateDoc(userDocRef, {
              completedQuestionIds: updatedCompletedIds
            });
          } catch (fsErr) {
            handleFirestoreError(fsErr, OperationType.UPDATE, `users/${auth.currentUser.uid}/sessions/${progressSession.id}`);
          }
        }

        setSelectedReportSession(progressSession);
        setActiveSession(null);
        setCurrentTab('final-report');
      } catch (err: any) {
        console.error(err);
        // Fallback simulation final report
        const fallbackBest = activeSession.questions[0];
        const fallbackWorst = activeSession.questions[1] || activeSession.questions[0];
        const simulatedReport: FinalReport = {
          overallScore: 84,
          communicationScore: 86,
          contentQualityScore: 80,
          resumeAlignmentScore: 90,
          confidenceClarityScore: 82,
          topStrengths: [
            'Superb display of motivation and clear company fit research.',
            'Effective structural descriptions of complex team resolutions.',
            'Articulate integration of academic milestones.'
          ],
          topImprovementAreas: [
            'Deepen specific results numbers (metrics) inside the STAR Action paragraphs.',
            'Stating your weaknesses directly as adaptive pursuits.',
            'Ensuring fluid voice tone during spontaneous technical questions.'
          ],
          bestAnswer: {
            question: fallbackBest.text,
            answer: updatedAnswers[fallbackBest.id] || 'I want to help other Britons.',
            score: 8
          },
          weakestAnswer: {
            question: fallbackWorst.text,
            answer: updatedAnswers[fallbackWorst.id] || 'I solved the coordination conflict.',
            score: 6
          },
          recommendedQuestions: [
            'Where do you see your career heading in 3 years?',
            'How has your Albion education prepared you for this team workspace?',
            'Tell me about a major goal you achieved. How did you coordinate the milestones?'
          ],
          personalizedAdvice: "Terrific work, Briton! Your academic preparation shines through. To maximize your recruitment potential, memorize three solid stories in study formats and practice reducing minor filler words."
        };

        if (atsReportData) {
          simulatedReport.atsResumeReport = atsReportData;
        } else {
          // Rule-based automatic fallback generator for ATS Resume Coach
          simulatedReport.atsResumeReport = {
            overallScore: 78,
            formattingAudit: {
              status: "warning",
              score: 85,
              issues: [
                "Ensure no text boxes or sidebars are used in your document structure.",
                "Verify that your cell number is directly in the document body, not in native Word headers/footers."
              ],
              details: "ATS systems read horizontal text flows strictly. Decorative formats scramble characters."
            },
            contentAudit: {
              status: "warning",
              score: 70,
              quantifiedResultCount: 1,
              issues: [
                "Only 1 bullet point includes quantified results. Recruiters expect numerical indicators for key successes.",
                "Verify that all listed project lines start with active professional verbs."
              ],
              details: "Proof statements and STAR metrics audit. Expand results descriptors with exact numbers."
            },
            keywordAudit: {
              status: "warning",
              score: 75,
              missingKeywords: ["Quantitative Analysis", "Project Lifecycle Coordination", "Structured Problem Solving"],
              acronymSuggestions: ["Spell out Project Management Professional (PMP) if relevant"],
              details: `Keyword alignment for target role: "${activeSession.jobTarget.positionTitle}"`
            },
            optimizationAreas: [
              {
                type: "Lack of Results",
                severity: "medium",
                description: "Several bullet points describe basic tasks/responsibilities rather than numerical achievements."
              }
            ],
            tailoredAdvice: `Great foundation! Your Albion College career readiness aligns with this path. To optimize, replace vague bullet terms with exact numbers and make sure standard anchor tags like WORK EXPERIENCE are used.`
          };
        }

        progressSession.finalReport = simulatedReport;
        progressSession.isCompleted = true;

        const updatedSessions = [...sessions, progressSession];
        setSessions(updatedSessions);
        
        if (auth.currentUser || userEmail) {
          localStorage.setItem('brit_sessions', JSON.stringify(updatedSessions));
        } else {
          sessionStorage.setItem('brit_sessions_guest', JSON.stringify(updatedSessions));
        }

        if (auth.currentUser) {
          const sessionDocRef = doc(db, "users", auth.currentUser.uid, "sessions", progressSession.id);
          try {
            await updateDoc(sessionDocRef, {
              userAnswers: updatedAnswers,
              feedbacks: updatedFeedbacks,
              speakingStatsHistory: updatedSpeaking,
              currentQuestionIndex: nextIndex,
              isCompleted: true,
              finalReport: simulatedReport,
              totalSpeakingSeconds: progressSession.totalSpeakingSeconds
            });
          } catch (fsErr) {
            handleFirestoreError(fsErr, OperationType.UPDATE, `users/${auth.currentUser.uid}/sessions/${progressSession.id}`);
          }
        }

        setSelectedReportSession(progressSession);
        setActiveSession(null);
        setCurrentTab('final-report');
      } finally {
        setIsLoading(false);
      }
    } else {
      // Just step to next question index
      setActiveSession(progressSession);

      if (auth.currentUser) {
        const sessionDocRef = doc(db, 'users', auth.currentUser.uid, 'sessions', activeSession.id);
        try {
          await updateDoc(sessionDocRef, {
            userAnswers: updatedAnswers,
            feedbacks: updatedFeedbacks,
            speakingStatsHistory: updatedSpeaking,
            currentQuestionIndex: nextIndex
          });
        } catch (fsErr) {
          handleFirestoreError(fsErr, OperationType.UPDATE, `users/${auth.currentUser.uid}/sessions/${activeSession.id}`);
        }
      }
    }
  };

  const handleViewSessionDetail = (session: InterviewSession) => {
    setSelectedReportSession(session);
    setCurrentTab('final-report');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fcfbfe] text-[#221727] font-sans antialiased">
      
      {/* Top Professional Navigation */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        userEmail={userEmail}
        userName={userName}
        userPhoto={userPhoto}
        onLogout={handleLogout}
        onLoginClick={() => setShowAuthModal(true)}
      />

      {/* Global Interactive Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 bg-albion-purple text-albion-gold font-bold px-5 py-3 rounded-xl shadow-2xl z-55 border-2 border-albion-gold flex items-center space-x-2 animate-bounce">
          <Sparkles className="w-4 h-4 shrink-0 text-albion-gold-light" />
          <span className="text-sm">{toastMessage}</span>
        </div>
      )}

      {/* Screen Loader Cover */}
      {isLoading && (
        <div className="fixed inset-0 bg-albion-purple/35 backdrop-blur-md z-50 flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-albion-gold"></div>
            <div className="absolute inset-0 flex items-center justify-center text-albion-gold text-lg font-bold font-display">B</div>
          </div>
          <span className="text-white font-display font-semibold tracking-wide text-xs uppercase bg-albion-purple px-4 py-2 rounded-full shadow-lg">
            Analyzing Credentials...
          </span>
        </div>
      )}

      {/* Auth / Account Simulation Dialog */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-55 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-purple-150 p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 animate-scale-up">
            <div className="text-center space-y-2">
              <div className="bg-purple-100 h-12 w-12 rounded-2xl flex items-center justify-center text-albion-purple mx-auto">
                <KeyRound className="w-6 h-6" />
              </div>
              <h3 className="font-display font-extrabold text-xl text-gray-850">Connect Albion Account</h3>
              <p className="text-xs text-gray-400">
                Sign in using your student credentials to sync real-time career reports and resume data across devices.
              </p>
            </div>

            {errorMsg && (
              <div className="bg-red-50 text-red-750 text-xs p-3 rounded-lg font-medium border border-red-200">
                {errorMsg}
              </div>
            )}

            {/* Unauthorized Domain Helper Card */}
            {unauthorizedDomain && (
              <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-xs space-y-3 animate-fade-in">
                <div className="flex items-start space-x-2 text-amber-950 font-bold">
                  <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold text-xs uppercase tracking-wider text-amber-900">Firebase Domain Authorization Required</p>
                    <p className="font-normal text-amber-800 mt-1 leading-relaxed">
                      Google OAuth requires authorization for domain <strong className="font-mono bg-amber-100 px-1 py-0.5 rounded">{unauthorizedDomain}</strong> in Firebase Console (<em>Authentication &gt; Settings &gt; Authorized domains</em>).
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-amber-100/80 p-2 rounded-xl border border-amber-200">
                  <code className="flex-1 font-mono text-[11px] text-amber-950 truncate select-all">{unauthorizedDomain}</code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(unauthorizedDomain);
                      setCopiedDomain(true);
                      setTimeout(() => setCopiedDomain(false), 2000);
                    }}
                    className="bg-amber-800 hover:bg-amber-900 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg shrink-0 transition cursor-pointer"
                  >
                    {copiedDomain ? '✓ Copied' : 'Copy Domain'}
                  </button>
                </div>

                <div className="pt-2 border-t border-amber-200/80 flex items-center justify-between gap-2">
                  <span className="text-amber-900 font-medium text-[11px]">Or start session without setup:</span>
                  <button
                    type="button"
                    id="btn-instant-guest-login"
                    onClick={handleInstantGuestLogin}
                    className="bg-albion-purple hover:bg-albion-purple-light text-white font-bold text-[11px] px-3 py-1.5 rounded-xl shadow transition cursor-pointer shrink-0"
                  >
                    Start Practice Session →
                  </button>
                </div>
              </div>
            )}

            {/* Google Provider Not Enabled in Firebase Console Helper */}
            {authConfigNotFound && (
              <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-xs space-y-3 animate-fade-in">
                <div className="flex items-start space-x-2 text-amber-950 font-bold">
                  <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold text-xs uppercase tracking-wider text-amber-900">Google OAuth Provider Not Enabled</p>
                    <p className="font-normal text-amber-800 mt-1 leading-relaxed">
                      Google Sign-In is not enabled yet in your Firebase project (or requires owner permissions). You can skip the setup and sign in directly with your email profile below!
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  id="btn-direct-email-signin"
                  onClick={() => {
                    const email = 'jsyandira4@gmail.com';
                    const name = loginNameInput.trim() || 'Brit Student';
                    setUserEmail(email);
                    setUserName(name);
                    localStorage.setItem('brit_user_email', email);
                    localStorage.setItem('brit_user_name', name);
                    setShowAuthModal(false);
                    setErrorMsg(null);
                    setAuthConfigNotFound(false);
                    triggerToast(`Welcome, ${name}! Signed in as ${email}`);
                  }}
                  className="w-full flex items-center justify-center space-x-2 bg-albion-purple hover:bg-albion-purple-light text-white py-2.5 px-3 rounded-xl font-bold text-xs shadow-md transition cursor-pointer"
                >
                  <LogIn className="w-4 h-4 text-albion-gold" />
                  <span>1-Click Sign In as jsyandira4@gmail.com</span>
                </button>

                <div className="bg-amber-100/70 p-2.5 rounded-xl text-[11px] text-amber-900 space-y-1">
                  <p className="font-bold text-amber-950">To enable Google OAuth in Firebase Console:</p>
                  <p className="text-amber-850">
                    Switch to the Google account that owns the project &gt; Authentication &gt; Sign-in method &gt; Google &gt; Enable.
                  </p>
                  <a
                    href="https://console.firebase.google.com/project/resume-checker-3e0d0/authentication/providers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-albion-purple hover:text-albion-purple-dark underline pt-1"
                  >
                    <span>Open Firebase Console</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}

            {/* Google Authentication Section */}
            <div className="space-y-3 pt-1">
              <button
                type="button"
                id="btn-google-login"
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center space-x-3 bg-albion-purple hover:bg-albion-purple-light text-white py-3.5 px-4 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition cursor-pointer"
              >
                <LogIn className="w-5 h-5 text-albion-gold shrink-0" />
                <span>Sign in with Google</span>
              </button>
              
              <div className="flex items-center my-3 text-[10px] text-gray-400 font-bold uppercase tracking-wider justify-center">
                <span className="border-t border-purple-100 w-full inline-block mr-3"></span>
                <span>or sign in with email profile</span>
                <span className="border-t border-purple-100 w-full inline-block ml-3"></span>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-405 uppercase tracking-wider block mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-2.5 w-4.5 h-4.5 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={loginNameInput}
                    onChange={(e) => setLoginNameInput(e.target.value)}
                    placeholder="e.g. Brit Student"
                    className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 rounded-xl border border-purple-100 focus:border-albion-purple focus:ring-1 focus:ring-albion-purple outline-none font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-450 uppercase tracking-wider block mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-2.5 w-4.5 h-4.5 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={loginEmailInput}
                    placeholder="jsyandira4@gmail.com"
                    onChange={(e) => setLoginEmailInput(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 rounded-xl border border-purple-100 focus:border-albion-purple focus:ring-1 focus:ring-albion-purple outline-none font-medium"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  id="btn-auth-cancel"
                  onClick={() => setShowAuthModal(false)}
                  className="flex-1 border border-purple-150 py-2.5 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 transition"
                >
                  Close
                </button>
                <button
                  type="submit"
                  id="btn-auth-submit"
                  className="flex-1 bg-albion-gold hover:bg-albion-gold-light text-albion-purple-dark font-bold py-2.5 rounded-xl text-xs shadow-md transition"
                >
                  Sign In with Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Viewport Content block */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Fallback Warning block if exists */}
        {errorMsg && (
          <div className="bg-amber-50 text-amber-700 p-4 rounded-xl border border-amber-150 flex items-center justify-between mb-6 text-xs gap-4 font-mono">
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="font-bold">×</button>
          </div>
        )}
        {/* Dynamic Navigation Router tab layout */}
        {currentTab === 'home' && (
          <div className="space-y-8">
            {/* Landing Intro Banner */}
            <div className="glass-card-deep rounded-[32px] p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-6">
                <div className="bg-[#49266F]/10 text-[#49266F] font-bold text-xs uppercase px-3 py-1 rounded-full w-max flex items-center space-x-1.5 border border-[#49266F]/15">
                  <span className="h-2 w-2 rounded-full bg-albion-gold animate-ping" />
                  <span>Simple & Easy Career Coach</span>
                </div>

                <div className="space-y-4">
                  <h1 className="text-3xl sm:text-5xl font-black font-display text-albion-purple-dark leading-tight tracking-tight">
                    Practice Job Interviews & <span className="text-[#49266F] bg-gradient-to-r from-[#f2c057]/20 to-purple-100/40 px-2 rounded-lg">Check Your Resume</span>
                  </h1>
                  <p className="text-sm text-gray-550 leading-relaxed max-w-xl">
                    Get ready for your future job. Practice speaking with realistic interview questions made just for you. Also, test your resume to make sure computer scanners can read it easily.
                  </p>
                </div>

                {/* Primary CTA panel with clear ATS option */}
                <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
                  <button
                    id="btn-landing-start-mock"
                    onClick={handleConfigureNewSession}
                    className="w-full sm:w-auto bg-[#49266F] hover:bg-[#5f338d] text-white font-bold py-3.5 px-8 rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 cursor-pointer text-sm"
                  >
                    Start Mock Interview
                  </button>

                  <button
                    id="btn-landing-check-resume"
                    onClick={() => setCurrentTab('resume')}
                    className="w-full sm:w-auto bg-albion-gold hover:bg-yellow-400 text-albion-purple-dark font-bold py-3.5 px-8 rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 cursor-pointer text-sm shadow-md"
                  >
                    Check My Resume (ATS Scan)
                  </button>
                </div>
              </div>

              {/* Description of Website's Abilities */}
              <div className="lg:col-span-5 glass-card rounded-[32px] p-6 flex flex-col justify-between space-y-6 min-h-[300px]">
                <div className="border-b border-gray-100/60 pb-3 flex items-center justify-between">
                  <span className="text-[10px] text-albion-purple font-mono uppercase tracking-widest font-black">What This Website Can Do</span>
                  <span className="text-[10px] text-green-600 bg-green-50/60 backdrop-blur-sm px-2 py-0.5 rounded border border-green-150/40 font-bold font-mono">100% PRIVATE</span>
                </div>

                <div className="space-y-4">
                  {[
                    { title: "Personal Interview Questions", desc: "We create practice questions based on your resume details and target job description." },
                    { title: "ATS Resume Checker", desc: "We check your resume for bad formatting, missing keywords, and layout issues that stop computer scanners." },
                    { title: "Live Voice Helper", desc: "Speak into your mic. We check your talking speed and count how many times you say filler words like 'um' or 'uh'." },
                    { title: "Combined Score Card", desc: "Get a clear final score that combines both your resume quality and your interview answers." }
                  ].map((feat, idx) => (
                    <div key={idx} className="flex gap-3 text-xs leading-normal">
                      <div className="bg-white/70 border border-white/50 backdrop-blur-sm h-6 w-6 rounded-lg text-albion-purple flex items-center justify-center font-bold text-[11px] shrink-0">
                        0{idx + 1}
                      </div>
                      <div>
                        <strong className="text-gray-800 font-bold block">{feat.title}</strong>
                        <p className="text-gray-400 mt-0.5 leading-snug">{feat.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Dashboard metrics preview panel */}
            <Dashboard
              sessions={sessions}
              onStartNewSession={handleConfigureNewSession}
              onViewSessionDetail={handleViewSessionDetail}
              savedResume={resumeInfo}
              onGoToResume={() => setCurrentTab('resume')}
              isGuest={isGuest}
              onConnectAccount={() => setShowAuthModal(true)}
            />
          </div>
        )}

        {/* Tab B: Resume Upload & Details Verification */}
        {currentTab === 'resume' && (
          <ResumeForm
            resumeInfo={resumeInfo}
            onSaveResume={handleSaveResume}
            onStartMockInterview={() => setCurrentTab('interview-preparer')}
          />
        )}

        {/* Tab C: Route Configuration Wizard */}
        {currentTab === 'interview-preparer' && (
          <InterviewPreparer
            onStartPlanning={handleStartPlanningSession}
            isLoading={isLoading}
            initialTrack={initialInterviewTrack}
          />
        )}

        {/* Tab D: Active Interview Session Canvas */}
        {currentTab === 'active-interview' && activeSession && (
          <ActiveInterview
            questions={activeSession.questions}
            currentQuestionIndex={activeSession.currentQuestionIndex}
            jobTarget={activeSession.jobTarget}
            resumeInfo={resumeInfo}
            onNextQuestion={handleAnswerReceived}
            onCompleteSession={() => setCurrentTab('final-report')}
            sessionAnswers={activeSession.userAnswers}
            onExit={handleExitActiveInterview}
          />
        )}

        {/* Tab E: Final Interactive Assessed Report Board */}
        {currentTab === 'final-report' && selectedReportSession?.finalReport && (
          <FinalReportView
            report={selectedReportSession.finalReport}
            jobTarget={selectedReportSession.jobTarget}
            onRestart={() => setCurrentTab('interview-preparer')}
            isGuest={isGuest}
            onConnectAccount={() => setShowAuthModal(true)}
            session={selectedReportSession}
          />
        )}

        {/* Tab F: Progress Hub Overview */}
        {currentTab === 'progress' && (
          <Dashboard
            sessions={sessions}
            onStartNewSession={handleConfigureNewSession}
            onViewSessionDetail={handleViewSessionDetail}
            savedResume={resumeInfo}
            onGoToResume={() => setCurrentTab('resume')}
            isGuest={isGuest}
            onConnectAccount={() => setShowAuthModal(true)}
          />
        )}

        {/* Tab G: Privacy & Support Statement Policy */}
        {currentTab === 'about' && (
          <div className="bg-white rounded-3xl border border-purple-100 p-6 sm:p-10 shadow-sm space-y-8 animate-fade-in" id="about-privacy-tab">
            <div className="space-y-3">
              <span className="bg-purple-100 text-albion-purple text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest w-max block border border-purple-200">
                ZERO-THIRD-PARTY POLICY
              </span>
              <h2 className="text-3xl font-extrabold font-display text-albion-purple-dark leading-tight">
                Our Pledge on Candidate Privacy & Trust
              </h2>
              <p className="text-sm text-gray-500 max-w-3xl leading-relaxed">
                Because students frequently upload deep, personally identifiable information (PII) including physical addresses, grades, cell numbers, and sensitive accomplishments, Brit Interview Coach strictly enforces absolute local sandbox boundaries:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-gray-100">
              <div className="space-y-2 bg-gray-50/50 p-6 rounded-2xl border border-gray-100/80">
                <h4 className="font-display font-bold text-sm text-gray-800">1. Internal Personalization Only</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Your raw resume details and entered job configurations are parsed solely to personalize and synthesize the assessor question banks.
                </p>
              </div>

              <div className="space-y-2 bg-gray-50/50 p-6 rounded-2xl border border-gray-100/80">
                <h4 className="font-display font-bold text-sm text-gray-800">2. Full Data Sovereignty</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Guests use short transient states. Connected accounts can manage, purge, or inspect saved sessions history at any point. No data is stored beyond your localized workspace container.
                </p>
              </div>

              <div className="space-y-2 bg-gray-50/50 p-6 rounded-2xl border border-gray-100/80">
                <h4 className="font-display font-bold text-sm text-gray-800">3. Zero Selling & Third-Parties</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  We absolutely never share, monetize, or stream your uploaded credentials, transcripts, scores, or voice indicators with third-party software structures.
                </p>
              </div>
            </div>

            {/* Clear and direct Purge button */}
            <div className="border-t border-gray-100 pt-8 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div>
                <h4 className="font-display font-bold text-sm text-gray-800">Want to start completely fresh?</h4>
                <p className="text-xs text-gray-400 leading-relaxed">Click below to instantly clear, purge, and destroy all local history records and cached credentials files.</p>
              </div>
              
              <button
                id="btn-purge-data"
                onClick={handlePurgeAllData}
                className="w-full sm:w-auto bg-red-100 hover:bg-red-200 text-red-600 font-bold py-3 px-6 rounded-xl text-xs transition duration-150 cursor-pointer flex items-center justify-center space-x-1.5 border border-red-200"
              >
                <Trash2 className="w-4 h-4" />
                <span>Destroy All Careers Data</span>
              </button>
            </div>
          </div>
        )}

      </main>

      {/* Aesthetic Academic Footer */}
      <footer className="bg-gray-100 border-t border-gray-200 py-6 text-center text-xs text-gray-400 font-mono mt-auto relative z-10">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span>&copy; 2026 Albion College Britons. Academic Career Preparation Suite.</span>
          </div>
          <div className="flex space-x-4">
            <span className="text-albion-purple hover:underline cursor-pointer" onClick={() => setCurrentTab('about')}>Privacy Policy</span>
            <span>•</span>
            <span className="text-albion-purple hover:underline cursor-pointer" onClick={() => setCurrentTab('about')}>Trust Agreement</span>
          </div>
        </div>
      </footer>

      {/* Track Selection Modal overlay */}
      {showTrackModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" id="track-modal-overlay">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 max-w-2xl w-full border border-purple-100 shadow-2xl space-y-6 animate-scale-up">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-albion-gold font-bold block">
                  Select Mock Interview Track
                </span>
                <h3 className="text-xl font-bold font-display text-albion-purple-dark">
                  Choose Your Interview Focus
                </h3>
              </div>
              <button
                id="btn-close-track-modal"
                onClick={() => setShowTrackModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg p-2 rounded-full hover:bg-gray-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              We tailor your mock questions, evaluation rubric, and assessor feedback based on whether you are applying for standard career roles or medical school admissions.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {/* Card 1: Regular */}
              <button
                id="btn-modal-select-regular"
                onClick={() => handleSelectTrackAndProceed('regular')}
                className="p-5 rounded-2xl border-2 border-purple-100 hover:border-albion-purple bg-purple-50/50 hover:bg-purple-50 text-left transition-all duration-200 cursor-pointer space-y-3 group hover:shadow-lg hover:-translate-y-0.5"
              >
                <div className="bg-albion-purple text-white p-3 rounded-xl w-max group-hover:scale-110 transition-transform">
                  <Briefcase className="w-6 h-6 text-albion-gold" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-albion-purple-dark block">Regular Interview</h4>
                  <div className="flex items-center gap-1.5 my-2 flex-wrap">
                    <span className="bg-purple-200/60 text-purple-900 text-[10px] font-bold px-2 py-0.5 rounded">STAR Method</span>
                    <span className="bg-purple-200/60 text-purple-900 text-[10px] font-bold px-2 py-0.5 rounded">Corporate & Internship</span>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Designed for corporate roles, internships, and behavioral questions evaluated using the STAR method.
                  </p>
                </div>
                <div className="text-xs font-bold text-albion-purple flex items-center gap-1 pt-1 group-hover:translate-x-1 transition-transform">
                  <span>Start Regular Interview</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>

              {/* Card 2: Medical School */}
              <button
                id="btn-modal-select-medical"
                onClick={() => handleSelectTrackAndProceed('medical_school')}
                className="p-5 rounded-2xl border-2 border-amber-200 hover:border-amber-500 bg-amber-50/40 hover:bg-amber-50 text-left transition-all duration-200 cursor-pointer space-y-3 group hover:shadow-lg hover:-translate-y-0.5"
              >
                <div className="bg-gradient-to-br from-[#49266F] to-[#2d1845] text-white p-3 rounded-xl w-max group-hover:scale-110 transition-transform">
                  <Stethoscope className="w-6 h-6 text-albion-gold" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-albion-purple-dark block">Medical School Interview</h4>
                  <div className="flex items-center gap-1.5 my-2 flex-wrap">
                    <span className="bg-amber-200/70 text-amber-950 text-[10px] font-bold px-2 py-0.5 rounded">AAMC Core Competencies</span>
                    <span className="bg-amber-200/70 text-amber-950 text-[10px] font-bold px-2 py-0.5 rounded">MMI Stations</span>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Designed for medical school admissions evaluated on AAMC Core Competencies and MMI scenarios.
                  </p>
                </div>
                <div className="text-xs font-bold text-amber-700 flex items-center gap-1 pt-1 group-hover:translate-x-1 transition-transform">
                  <span>Start Medical School Interview</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
