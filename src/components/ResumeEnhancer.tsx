import React, { useState, useEffect, useRef } from 'react';
import { ResumeInfo } from '../types';
import { 
  UploadCloud, FileText, Send, CheckCircle2, AlertCircle, Sparkles, 
  Linkedin, Award, ArrowRight, Printer, RefreshCw, Check, ArrowLeft,
  ChevronRight, Info, Shield, HelpCircle, User, Briefcase, GraduationCap, Bot, Paperclip
} from 'lucide-react';

const loadPdfJs = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
    script.onload = () => {
      const pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
      resolve(pdfjsLib);
    };
    script.onerror = () => reject(new Error('Failed to load PDF parser from CDN library. Make sure you are connected to the internet.'));
    document.head.appendChild(script);
  });
};

const extractTextFromPdf = async (file: File): Promise<string> => {
  if (!file || file.size === 0) {
    throw new Error('The selected PDF file is empty. Please select a valid document.');
  }

  const arrayBuffer = await file.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength < 5) {
    throw new Error('The uploaded file is too small to be a valid PDF document.');
  }

  // Validate PDF magic bytes (%PDF-)
  const header = new Uint8Array(arrayBuffer.slice(0, 5));
  const headerStr = String.fromCharCode(...header);
  if (!headerStr.startsWith('%PDF-')) {
    throw new Error('The uploaded file does not have a valid PDF header (%PDF-). Please upload a valid .pdf or .docx document.');
  }

  try {
    const pdfjsLib = await loadPdfJs();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      stopAtErrors: false,
    });
    const pdf = await loadingTask.promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const items = textContent.items || [];
      
      const linesMap: { [y: number]: any[] } = {};
      const tolerance = 5;
      
      for (const item of items) {
        if (!item || typeof item.str !== 'string') continue;
        const x = item.transform ? item.transform[4] : 0;
        const y = item.transform ? item.transform[5] : 0;
        const text = item.str;
        
        let foundY = Object.keys(linesMap).map(Number).find(lineY => Math.abs(lineY - y) <= tolerance);
        if (foundY !== undefined) {
          linesMap[foundY].push({ text, x, y, width: item.width || 0, height: item.height || 0, transform: item.transform });
        } else {
          linesMap[y] = [{ text, x, y, width: item.width || 0, height: item.height || 0, transform: item.transform }];
        }
      }
      
      const sortedYKeys = Object.keys(linesMap).map(Number).sort((a, b) => b - a);
      let pageText = '';
      for (const yKey of sortedYKeys) {
        const lineItems = linesMap[yKey];
        lineItems.sort((a, b) => a.x - b.x);
        let lineText = '';
        let prevItem: any = null;
        for (const item of lineItems) {
          if (prevItem) {
            const prevWidth = prevItem.width || (prevItem.transform && prevItem.transform[0] ? (prevItem.text.length * prevItem.transform[0] * 0.45) : (prevItem.text.length * 6));
            const prevEnd = prevItem.x + prevWidth;
            const gap = item.x - prevEnd;
            if (gap > 2 && !prevItem.text.endsWith(' ') && !item.text.startsWith(' ')) {
              lineText += ' ';
            }
          }
          lineText += item.text;
          prevItem = item;
        }
        if (lineText.trim()) {
          pageText += lineText + '\n';
        }
      }
      fullText += pageText + '\n';
    }
    return fullText;
  } catch (err: any) {
    console.warn('PDF extraction error in ResumeEnhancer:', err);
    if (err?.message?.includes('Invalid PDF structure') || err?.name === 'InvalidPDFException') {
      throw new Error('The uploaded PDF has an invalid structure or is corrupted. Please re-save or export your document as a standard PDF or Word document (.docx).');
    }
    throw new Error(err?.message || 'Failed to extract text from the PDF file.');
  }
};

const loadMammoth = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).mammoth) {
      resolve((window as any).mammoth);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js';
    script.onload = () => {
      resolve((window as any).mammoth);
    };
    script.onerror = () => reject(new Error('Failed to load Microsoft Word parser. Make sure you are connected to the internet.'));
    document.head.appendChild(script);
  });
};

const extractTextFromDocx = async (file: File): Promise<string> => {
  const mammothLib = await loadMammoth();
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammothLib.extractRawText({ arrayBuffer });
  return result.value || '';
};

interface ResumeEnhancerProps {
  onSaveAndClose: (resume: ResumeInfo) => void;
  onBack: () => void;
  currentResume: ResumeInfo | null;
}

interface ChatMessage {
  id: string;
  sender: 'coach' | 'user';
  text: string;
  timestamp: Date;
  type?: 'intro' | 'upload_action' | 'analysis_report' | 'targeting_prompt' | 'targeting_options' | 'targeting_report' | 'deepening_prompt' | 'deepening_inputs' | 'final_report';
  data?: {
    report?: any;
    draft?: any;
    questions?: string[];
  };
}

export default function ResumeEnhancer({ onSaveAndClose, onBack, currentResume }: ResumeEnhancerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [resumeText, setResumeText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pastedText, setPastedText] = useState('');
  
  // Progress tracker state
  const [coachStep, setCoachStep] = useState<'upload' | 'analysis' | 'targeting_role' | 'targeting_industry' | 'deepening' | 'final'>('upload');

  // Interactive step memory
  const [analysisReport, setAnalysisReport] = useState<any | null>(null);
  const [activeDraft, setActiveDraft] = useState<any | null>(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState('');
  const [customRoleInput, setCustomRoleInput] = useState('');
  const [customIndustryInput, setCustomIndustryInput] = useState('');
  const [deepAnswers, setDeepAnswers] = useState<{ [key: number]: string }>({ 0: '', 1: '', 2: '' });
  const [finalResume, setFinalResume] = useState<any | null>(null);
  const [chatInput, setChatInput] = useState('');

  const handleSendChatMessage = async (presetText?: string) => {
    const textToSend = presetText || chatInput;
    if (!textToSend.trim() || isGenerating) return;
    setChatInput('');
    setIsGenerating(true);
    setErrorMsg(null);

    const userMsgId = `chat-user-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        text: textToSend.trim(),
        timestamp: new Date()
      }
    ]);

    try {
      const response = await fetch('/api/resume/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend.trim(),
          draft: finalResume || activeDraft,
          history: messages.map(m => ({ sender: m.sender, text: m.text }))
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      if (data.updatedDraft) {
        if (coachStep === 'final') {
          setFinalResume(data.updatedDraft);
        } else {
          setActiveDraft(data.updatedDraft);
        }
      }

      setMessages(prev => [
        ...prev,
        {
          id: `chat-coach-${Date.now()}`,
          sender: 'coach',
          text: data.reply || "I've processed your request.",
          timestamp: new Date(),
          type: data.updatedDraft ? 'analysis_report' : undefined,
          data: data.updatedDraft ? { draft: data.updatedDraft } : undefined
        }
      ]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error communicating with Resume Coach.');
      setMessages(prev => [
        ...prev,
        {
          id: `chat-err-${Date.now()}`,
          sender: 'coach',
          text: `⚠️ **Coach Error:** ${err.message || 'Unable to process chat query.'}`,
          timestamp: new Date()
        }
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages list grows
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // Initial welcome message & auto-load existing resume if real work experience entries exist
  useEffect(() => {
    const hasExistingExperiences = Boolean(
      currentResume &&
      currentResume.customExperiences &&
      currentResume.customExperiences.length > 0
    );

    if (hasExistingExperiences) {
      const candidateName = currentResume.name && currentResume.name !== 'Student Name' ? currentResume.name : 'Candidate';
      const initialDraft = {
        name: currentResume.name || 'Candidate Name',
        phone: currentResume.phone || '',
        email: currentResume.email || '',
        linkedin: currentResume.linkedin || '',
        summary: currentResume.summary || '',
        education: currentResume.education || 'Albion College',
        expectedGraduation: currentResume.expectedGraduation || '',
        majorMinor: currentResume.majorMinor || '',
        gpa: currentResume.gpa || '',
        skills: currentResume.skills || [],
        customExperiences: currentResume.customExperiences || [],
        customActivities: currentResume.customActivities || []
      };
      setActiveDraft(initialDraft);
      setCoachStep('targeting_role');
      setMessages([
        {
          id: 'welcome-loaded',
          sender: 'coach',
          text: `**Hello, ${candidateName}!** I am your Executive Resume Coach and Career Strategist.\n\nI have detected your active resume draft with **${initialDraft.customExperiences.length} work experience entries**.\n\nWe can continue tailoring this draft, or you can **upload a new resume file** / **paste new text** below to start fresh!\n\nIf you want to tailor your current draft, please select a target pathway below or type your target role, company, or industry in the chat box.`,
          timestamp: new Date(),
          type: 'analysis_report',
          data: { draft: initialDraft }
        }
      ]);
    } else {
      setMessages([
        {
          id: 'welcome',
          sender: 'coach',
          text: "Hello! I am your Executive Resume Coach and Career Strategist.\n\nI am here to help you tailor and polish your resume step-by-step through a collaborative, conversational approach. I will not make any assumptions about missing experience or generate critiques until you explicitly provide your document or text.\n\nTo begin, please **upload your current resume file** (PDF/Word) or **paste your draft resume text** below.",
          timestamp: new Date(),
          type: 'intro'
        }
      ]);
    }
  }, [currentResume]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const processFile = async (file: File) => {
    setIsGenerating(true);
    setErrorMsg(null);
    
    // Add user feedback message
    const userMsgId = `upload-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        text: `📎 Uploaded File: ${file.name} (Extracting content...)`,
        timestamp: new Date()
      }
    ]);

    try {
      let text = '';
      if (file.name.endsWith('.pdf')) {
        text = await extractTextFromPdf(file);
      } else if (file.name.endsWith('.docx')) {
        text = await extractTextFromDocx(file);
      } else {
        throw new Error('Unsupported format. Please upload a PDF or DOCX document.');
      }
      
      if (!text || !text.trim()) {
        throw new Error('Could not retrieve any plain text from the file structure.');
      }
      
      setResumeText(text);
      await analyzeResumeInitial(text);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error processing document.');
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          sender: 'coach',
          text: `⚠️ **Error Processing File:** ${err.message || 'Error reading text.'} Please try pasting your text manually instead.`,
          timestamp: new Date()
        }
      ]);
      setIsGenerating(false);
    }
  };

  const handlePasteSubmit = async () => {
    if (!pastedText.trim()) return;
    setIsGenerating(true);
    setErrorMsg(null);

    // Add user feedback message
    const userMsgId = `paste-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        text: `📝 Pasted raw resume draft text (${pastedText.trim().length} characters).`,
        timestamp: new Date()
      }
    ]);

    const textToAnalyze = pastedText;
    setPastedText('');
    setResumeText(textToAnalyze);
    await analyzeResumeInitial(textToAnalyze);
  };

  const analyzeResumeInitial = async (text: string) => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/resume/enhance-initial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText: text }),
      });
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setAnalysisReport(data.analysis);
      setActiveDraft(data.draft);
      setCoachStep('analysis');

      const greetingName = data.draft.name || 'Candidate';

      // Build initial audit chat bubble
      let coachFeedbackText = `**Awesome ${greetingName}! I've completed the initial translation and audit of your resume.**\n\n`;
      coachFeedbackText += `There's meaningful, high-impact background in your resume. We will elevate the structure, remove narrative phrasing, and make it standard for modern recruiters. Here is exactly what I'm going to improve right now:\n\n`;

      setMessages(prev => [
        ...prev,
        {
          id: `analysis-${Date.now()}`,
          sender: 'coach',
          text: coachFeedbackText,
          timestamp: new Date(),
          type: 'analysis_report',
          data: {
            report: data.analysis,
            draft: data.draft
          }
        }
      ]);
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during analysis.');
      setMessages(prev => [
        ...prev,
        {
          id: `error-ai-${Date.now()}`,
          sender: 'coach',
          text: `⚠️ **Coach Analysis Failed:** ${err.message || 'We could not reach the server.'} Please try re-submitting.`,
          timestamp: new Date()
        }
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const startTargetingPhase = () => {
    setCoachStep('targeting_role');
    setMessages(prev => [
      ...prev,
      {
        id: `targeting-prompt-${Date.now()}`,
        sender: 'coach',
        text: "### Make it even stronger\n\nThe draft above covers the structural improvements. To go further — targeting your summary, reordering your skills, and sharpening the language for a specific audience — I need two quick answers.\n\n**1 of 2 — Target Role:** What type of role are you primarily targeting in your upcoming career?",
        timestamp: new Date(),
        type: 'targeting_options'
      }
    ]);
  };

  const handleSelectRole = (roleId: string) => {
    setSelectedRole(roleId);
    setCoachStep('targeting_industry');
    
    // Add User response bubble
    setMessages(prev => [
      ...prev,
      {
        id: `role-res-${Date.now()}`,
        sender: 'user',
        text: `Q: What type of role are you primarily targeting in your career?\nA: ${roleId}`,
        timestamp: new Date()
      },
      {
        id: `ind-prompt-${Date.now()}`,
        sender: 'coach',
        text: "**2 of 2 — Target Environment:** What type of organization or industry are you most interested in?",
        timestamp: new Date(),
        type: 'targeting_options' // handles industry rendering
      }
    ]);
  };

  const handleSelectIndustry = async (industryId: string) => {
    setSelectedIndustry(industryId);
    setCoachStep('deepening');
    setIsGenerating(true);

    // Add user response bubble
    setMessages(prev => [
      ...prev,
      {
        id: `ind-res-${Date.now()}`,
        sender: 'user',
        text: `Q: What type of organisation or industry are you most interested in?\nA: ${industryId}`,
        timestamp: new Date()
      }
    ]);

    try {
      const response = await fetch('/api/resume/enhance-target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: activeDraft,
          targetRole: selectedRole,
          targetIndustry: industryId
        }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setActiveDraft(data.draft);
      setCoachStep('deepening');

      let matchFeedback = `**Great — targeting ${selectedRole} in a ${industryId} environment.**\n\n`;
      matchFeedback += `We are reframing your existing background to highlight transferable skills, relevant terminology, and core achievements for this pathway.\n\n`;
      matchFeedback += `Here is what I'm tailoring right now based on this target:`;

      setMessages(prev => [
        ...prev,
        {
          id: `target-report-${Date.now()}`,
          sender: 'coach',
          text: matchFeedback,
          timestamp: new Date(),
          type: 'targeting_report',
          data: {
            report: data.analysis,
            draft: data.draft,
            questions: data.questions || []
          }
        }
      ]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error customizing target draft.');
    } finally {
      setIsGenerating(false);
    }
  };

  const submitDeepeningAnswers = async (answers: { [key: number]: string }) => {
    setIsGenerating(true);
    setCoachStep('final');

    // Add User response bubble
    const userAnswersText = Object.entries(answers)
      .map(([idx, ans]) => `Q${Number(idx)+1} Detail: ${ans || 'Skipped/Default'}`)
      .join('\n');

    setMessages(prev => [
      ...prev,
      {
        id: `deep-res-${Date.now()}`,
        sender: 'user',
        text: `📝 Provided specific details to strengthen bullets:\n\n${userAnswersText}`,
        timestamp: new Date()
      }
    ]);

    try {
      const response = await fetch('/api/resume/enhance-finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: activeDraft,
          answers: answers
        }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setFinalResume(data.polishedDraft);

      setMessages(prev => [
        ...prev,
        {
          id: `final-report-${Date.now()}`,
          sender: 'coach',
          text: `**Outstanding! We have compiled your final recruiter-ready, ATS-compliant resume.**\n\nAll first-person narratives, passive filler words, and military/informal jargon have been translated, and your newly quantified metrics are seamlessly integrated. Below is your optimized CV, formatted perfectly to Times New Roman standards for linear ATS parsers.`,
          timestamp: new Date(),
          type: 'final_report',
          data: {
            draft: data.polishedDraft
          }
        }
      ]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error compiling final polished resume.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAndExit = (draftToSave: any) => {
    if (!draftToSave) return;
    const finalObj: ResumeInfo = {
      name: draftToSave.name || 'Student Name',
      education: draftToSave.education || 'Albion College',
      majorMinor: draftToSave.majorMinor || '',
      skills: draftToSave.skills || [],
      workExperience: (draftToSave.customExperiences || []).flatMap((e: any) => [
        `${e.company} (${e.location}) - ${e.role} (${e.dates})`,
        ...(e.bullets || [])
      ]),
      researchExperience: [],
      projects: [],
      leadership: (draftToSave.customActivities || []).flatMap((e: any) => [
        `${e.organization} (${e.dates})`,
        ...(e.bullets || [])
      ]),
      certifications: [],
      isParsed: true,
      phone: draftToSave.phone,
      email: draftToSave.email,
      linkedin: draftToSave.linkedin,
      summary: draftToSave.summary,
      gpa: draftToSave.gpa,
      expectedGraduation: draftToSave.expectedGraduation,
      customExperiences: draftToSave.customExperiences,
      customActivities: draftToSave.customActivities
    };
    onSaveAndClose(finalObj);
  };

  const handleExportWord = (draftToExport: any) => {
    if (!draftToExport) return;
    const experiences = draftToExport.customExperiences || [];
    const activities = draftToExport.customActivities || [];
    const skillsList = (draftToExport.skills || []).join(', ');

    const content = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>${draftToExport.name} - Resume</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          body {
            font-family: 'Times New Roman', Georgia, serif;
            font-size: 11pt;
            line-height: 1.25;
            color: #000000;
          }
          .center { text-align: center; }
          .name { font-size: 16pt; font-weight: bold; text-transform: uppercase; margin: 0; }
          .contact { font-size: 10pt; margin-top: 4px; margin-bottom: 12px; }
          .section-title {
            font-size: 11pt;
            font-weight: bold;
            text-transform: uppercase;
            border-bottom: 1px solid #000000;
            margin-top: 12px;
            margin-bottom: 6px;
            letter-spacing: 0.5px;
          }
          .table-row { width: 100%; margin-bottom: 2px; }
          .left { text-align: left; }
          .right { text-align: right; }
          ul { margin-top: 2px; margin-bottom: 4px; padding-left: 20px; }
          li { margin-bottom: 2px; text-align: justify; }
          p { margin: 0; margin-bottom: 4px; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="name">${draftToExport.name}</div>
          <div class="contact">
            ${[draftToExport.phone, draftToExport.email, draftToExport.linkedin].filter(Boolean).join(' | ')}
          </div>
        </div>

        ${draftToExport.summary ? `
          <div class="section-title">SUMMARY</div>
          <p style="text-align: justify;">${draftToExport.summary}</p>
        ` : ''}

        <div class="section-title">EDUCATION</div>
        <table class="table-row" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td class="left" style="font-weight: bold;">${draftToExport.education}</td>
            <td class="right" style="font-weight: bold;">${draftToExport.expectedGraduation}</td>
          </tr>
          <tr>
            <td class="left" style="font-style: italic;">${draftToExport.majorMinor}</td>
            <td class="right" style="font-weight: bold;">${draftToExport.gpa}</td>
          </tr>
        </table>

        ${activities.length > 0 ? `
          <div class="section-title">CAMPUS ACTIVITIES AND AWARDS</div>
          ${activities.map((act: any) => `
            <table class="table-row" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td class="left" style="font-weight: bold;">${act.organization}</td>
                <td class="right" style="font-weight: bold;">${act.dates}</td>
              </tr>
            </table>
            ${act.bullets && act.bullets.length > 0 ? `
              <ul>
                ${act.bullets.map((b: string) => `<li>${b}</li>`).join('')}
              </ul>
            ` : '<div style="margin-bottom: 4px;"></div>'}
          `).join('')}
        ` : ''}

        ${experiences.length > 0 ? `
          <div class="section-title">EXPERIENCE</div>
          ${experiences.map((exp: any) => `
            <table class="table-row" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td class="left" style="font-weight: bold;">${exp.company}</td>
                <td class="right" style="font-weight: bold;">${exp.location}</td>
              </tr>
              <tr>
                <td class="left" style="font-weight: bold; font-style: italic;">${exp.role}</td>
                <td class="right" style="font-style: italic;">${exp.dates}</td>
              </tr>
            </table>
            ${exp.bullets && exp.bullets.length > 0 ? `
              <ul>
                ${exp.bullets.map((b: string) => `<li>${b}</li>`).join('')}
              </ul>
            ` : '<div style="margin-bottom: 4px;"></div>'}
          `).join('')}
        ` : ''}

        ${skillsList ? `
          <div class="section-title">SKILLS</div>
          <p>${skillsList}</p>
        ` : ''}
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + content], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${draftToExport.name.trim().replace(/\s+/g, '_')}_Polished_Resume.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrintPDF = (draftToPrint: any) => {
    if (!draftToPrint) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up blocked. Please enable pop-ups to open the Print Preview.');
      return;
    }

    const experiences = draftToPrint.customExperiences || [];
    const activities = draftToPrint.customActivities || [];
    const skillsList = (draftToPrint.skills || []).join(', ');

    printWindow.document.write(`
      <html>
        <head>
          <title>${draftToPrint.name} - Resume</title>
          <style>
            @page {
              size: letter;
              margin: 0.75in;
            }
            body {
              font-family: 'Times New Roman', Georgia, serif;
              font-size: 11pt;
              line-height: 1.25;
              color: #000000;
              margin: 0;
              padding: 0;
            }
            .center { text-align: center; }
            .name { font-size: 16pt; font-weight: bold; text-transform: uppercase; margin: 0; padding: 0; letter-spacing: 0.5px; }
            .contact { font-size: 10pt; margin-top: 4px; margin-bottom: 12px; }
            .section-title {
              font-size: 11pt;
              font-weight: bold;
              text-transform: uppercase;
              border-bottom: 1px solid #000000;
              margin-top: 12px;
              margin-bottom: 6px;
              letter-spacing: 0.5px;
            }
            .table-row { width: 100%; margin-bottom: 2px; }
            .table-row td { font-size: 11pt; vertical-align: top; }
            .left { text-align: left; }
            .right { text-align: right; }
            ul { margin-top: 2px; margin-bottom: 4px; padding-left: 20px; }
            li { margin-bottom: 2px; text-align: justify; }
            p { margin: 0; margin-bottom: 4px; }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="name">${draftToPrint.name}</div>
            <div class="contact">
              ${[draftToPrint.phone, draftToPrint.email, draftToPrint.linkedin].filter(Boolean).join(' | ')}
            </div>
          </div>

          ${draftToPrint.summary ? `
            <div class="section-title">SUMMARY</div>
            <p style="text-align: justify;">${draftToPrint.summary}</p>
          ` : ''}

          <div class="section-title">EDUCATION</div>
          <table class="table-row" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td class="left" style="font-weight: bold;">${draftToPrint.education}</td>
              <td class="right" style="font-weight: bold;">${draftToPrint.expectedGraduation}</td>
            </tr>
            <tr>
              <td class="left" style="font-style: italic;">${draftToPrint.majorMinor}</td>
              <td class="right" style="font-weight: bold;">${draftToPrint.gpa}</td>
            </tr>
          </table>

          ${activities.length > 0 ? `
            <div class="section-title">CAMPUS ACTIVITIES AND AWARDS</div>
            ${activities.map((act: any) => `
              <table class="table-row" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td class="left" style="font-weight: bold;">${act.organization}</td>
                  <td class="right" style="font-weight: bold;">${act.dates}</td>
                </tr>
              </table>
              ${act.bullets && act.bullets.length > 0 ? `
                <ul>
                  ${act.bullets.map((b: string) => `<li>${b}</li>`).join('')}
                </ul>
              ` : '<div style="margin-bottom: 4px;"></div>'}
            `).join('')}
          ` : ''}

          ${experiences.length > 0 ? `
            <div class="section-title">EXPERIENCE</div>
            ${experiences.map((exp: any) => `
              <table class="table-row" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td class="left" style="font-weight: bold;">${exp.company}</td>
                  <td class="right" style="font-weight: bold;">${exp.location}</td>
                </tr>
                <tr>
                  <td class="left" style="font-weight: bold; font-style: italic;">${exp.role}</td>
                  <td class="right" style="font-style: italic;">${exp.dates}</td>
                </tr>
              </table>
              ${exp.bullets && exp.bullets.length > 0 ? `
                <ul>
                  ${exp.bullets.map((b: string) => `<li>${b}</li>`).join('')}
                </ul>
              ` : '<div style="margin-bottom: 4px;"></div>'}
            `).join('')}
          ` : ''}

          ${skillsList ? `
            <div class="section-title">SKILLS</div>
            <p>${skillsList}</p>
          ` : ''}

          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="flex flex-col h-[85vh] w-full bg-white overflow-hidden" id="resume-enhancer-chat-container">
      {/* Top Header Row */}
      <div className="bg-white py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition text-gray-700 hover:text-gray-900 cursor-pointer"
            title="Back to Suite Hub"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <div>
            <div className="flex items-center space-x-1.5">
              <Sparkles className="w-4 h-4 text-emerald-600 animate-pulse" />
              <h2 className="text-base font-display font-black text-gray-900">Conversational Resume Coach</h2>
            </div>
            <p className="text-xs text-gray-600 font-medium">Interactive 3-stage Career Optimization Feed</p>
          </div>
        </div>

        {/* Phase Tracker Dots */}
        <div className="hidden sm:flex items-center space-x-4 text-xs font-mono">
          <div className="flex items-center space-x-1">
            <span className={`w-2 h-2 rounded-full ${coachStep === 'upload' ? 'bg-purple-600 animate-ping' : 'bg-green-500'}`} />
            <span className={`text-[10px] font-bold ${coachStep === 'upload' ? 'text-purple-600' : 'text-gray-500'}`}>1. Import</span>
          </div>
          <ChevronRight className="w-3 h-3 text-gray-300" />
          <div className="flex items-center space-x-1">
            <span className={`w-2 h-2 rounded-full ${coachStep === 'targeting_role' || coachStep === 'targeting_industry' ? 'bg-purple-600 animate-ping' : coachStep === 'upload' ? 'bg-gray-200' : 'bg-green-500'}`} />
            <span className={`text-[10px] font-bold ${coachStep === 'targeting_role' || coachStep === 'targeting_industry' ? 'text-purple-600' : 'text-gray-500'}`}>2. Target</span>
          </div>
          <ChevronRight className="w-3 h-3 text-gray-300" />
          <div className="flex items-center space-x-1">
            <span className={`w-2 h-2 rounded-full ${coachStep === 'deepening' ? 'bg-purple-600 animate-ping' : (coachStep === 'final' ? 'bg-green-500' : 'bg-gray-200')}`} />
            <span className={`text-[10px] font-bold ${coachStep === 'deepening' ? 'text-purple-600' : 'text-gray-500'}`}>3. Quantify</span>
          </div>
        </div>
      </div>

      {/* Main Chat Feed (Scrollable) */}
      <div className="flex-1 overflow-y-auto py-6 space-y-6 bg-white">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
          >
            <div className={`flex items-start space-x-3 max-w-[85%] sm:max-w-[75%] ${msg.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
              {/* Avatar Icon */}
              <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                msg.sender === 'coach' ? 'bg-emerald-600 text-white' : 'bg-purple-600 text-white'
              }`}>
                {msg.sender === 'coach' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>

              {/* Message Bubble container */}
              <div className="space-y-3">
                {/* Text Bubble */}
                <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                  msg.sender === 'user' 
                    ? 'bg-purple-600 text-white rounded-tr-none font-medium shadow-sm' 
                    : 'bg-gray-50 text-gray-900 border border-gray-300 rounded-tl-none shadow-sm'
                }`}>
                  <div className="whitespace-pre-line space-y-2">
                    {msg.text.split('\n\n').map((paragraph, pIdx) => {
                      const isHeading = paragraph.startsWith('###') || paragraph.startsWith('**');
                      const cleanText = paragraph.replace(/###|\*\*/g, '');
                      const textColor = msg.sender === 'user' ? 'text-white' : 'text-gray-900';
                      if (isHeading) {
                        return <p key={pIdx} className={`font-bold ${textColor}`}>{cleanText}</p>;
                      }
                      return <p key={pIdx} className={`text-left font-normal ${textColor}`}>{cleanText}</p>;
                    })}
                  </div>
                </div>

                {/* INLINE CUSTOM FORMS / REPORT BLOCKS */}
                
                {/* 1. INITIAL ANALYSIS AUDIT REPORT */}
                {msg.type === 'analysis_report' && msg.data?.report && (
                  <div className="space-y-4 animate-fade-in pl-1">
                    <div className="glass-card p-5 rounded-2xl border border-gray-300 bg-white shadow-sm space-y-3">
                      <h4 className="text-xs font-bold text-gray-900 border-b border-gray-250 pb-2 flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-albion-gold" />
                        <span>Executive Resume Audit Report</span>
                      </h4>

                      <div className="grid grid-cols-1 gap-3.5 text-sm text-gray-900">
                        <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                          <span className="font-bold text-purple-900 block text-[11px] uppercase tracking-wider">● ATS Formatting</span>
                          <p className="mt-1 font-normal text-gray-900 leading-relaxed">{msg.data.report.atsFormatting}</p>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                          <span className="font-bold text-blue-900 block text-[11px] uppercase tracking-wider">● Language & Tone</span>
                          <p className="mt-1 font-normal text-gray-900 leading-relaxed">{msg.data.report.languageTone}</p>
                        </div>
                        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                          <span className="font-bold text-emerald-900 block text-[11px] uppercase tracking-wider">● Bullet Structure</span>
                          <p className="mt-1 font-normal text-gray-900 leading-relaxed">{msg.data.report.bulletStructure}</p>
                        </div>
                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                          <span className="font-bold text-amber-900 block text-[11px] uppercase tracking-wider">● Professional Summary</span>
                          <p className="mt-1 font-normal text-gray-900 leading-relaxed">{msg.data.report.summary}</p>
                        </div>
                        {(msg.data.report.clarityPolishing || msg.data.report.harmfulContent) && (
                          <div className="p-4 bg-teal-50 rounded-xl border border-teal-200">
                            <span className="font-bold text-teal-900 block text-[11px] uppercase tracking-wider">● Clarity & Tone Refined</span>
                            <p className="mt-1 font-normal text-gray-900 leading-relaxed">{msg.data.report.clarityPolishing || msg.data.report.harmfulContent}</p>
                          </div>
                        )}
                        {msg.data.report.education && (
                          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200">
                            <span className="font-bold text-indigo-900 block text-[11px] uppercase tracking-wider">● Education Reframing</span>
                            <p className="mt-1 font-normal text-gray-900 leading-relaxed">{msg.data.report.education}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Inline Draft Resume Preview Box */}
                    {msg.data.draft && (
                      <div className="bg-white border border-gray-300 rounded-2xl p-5 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                          <span className="text-[11px] font-mono font-bold text-gray-500">IMPROVED FIRST DRAFT PREVIEW</span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleExportWord(msg.data?.draft)}
                              className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded hover:bg-amber-100 transition cursor-pointer"
                            >
                              Download Word
                            </button>
                            <button
                              onClick={() => handlePrintPDF(msg.data?.draft)}
                              className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-1 rounded hover:bg-purple-100 transition cursor-pointer"
                            >
                              PDF Preview
                            </button>
                          </div>
                        </div>

                        {/* Miniature Preview Content */}
                        <div className="text-sm text-gray-900 space-y-2 border-l-2 border-emerald-600 pl-3">
                          <div className="font-bold text-gray-950 uppercase text-sm">{msg.data.draft.name}</div>
                          <p className="italic font-normal text-gray-950 leading-relaxed">{msg.data.draft.summary}</p>
                          <div className="text-xs text-gray-800">
                            <strong className="font-bold">Key Skills: </strong>
                            <span className="font-mono">{msg.data.draft.skills?.slice(0, 6).join(', ')}...</span>
                          </div>
                        </div>

                        {coachStep === 'analysis' && (
                          <button
                            onClick={startTargetingPhase}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs transition duration-150 shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>Target Resume for Specific Job</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. TARGETING CARDS OPTIONS WITH OPEN CUSTOM INPUT */}
                {msg.type === 'targeting_options' && (
                  <div className="space-y-4 pl-1 w-full max-w-lg animate-fade-in">
                    {/* Custom Role Input & Suggestion Chips */}
                    {coachStep === 'targeting_role' && (
                      <div className="bg-white border border-gray-300 p-4 rounded-2xl shadow-sm space-y-3">
                        <label className="block text-xs font-bold text-gray-800">
                          Type or search your target role / title:
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={customRoleInput}
                            onChange={(e) => setCustomRoleInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && customRoleInput.trim()) {
                                handleSelectRole(customRoleInput.trim());
                              }
                            }}
                            placeholder="e.g. Healthcare Operations, Pre-Med Clinical Scribe, Financial Analyst..."
                            className="flex-1 px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 bg-gray-50 font-medium"
                          />
                          <button
                            disabled={!customRoleInput.trim()}
                            onClick={() => handleSelectRole(customRoleInput.trim())}
                            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition shadow-sm cursor-pointer shrink-0"
                          >
                            Set Role
                          </button>
                        </div>

                        {/* Quick Presets */}
                        <div className="pt-2 border-t border-gray-150">
                          <p className="text-[11px] font-bold text-gray-500 mb-2">Popular Career Pathways:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              'Healthcare & Clinical Medicine',
                              'Operations & Supply Chain',
                              'Project & Program Lead',
                              'Software & Tech Innovation',
                              'Marketing & Data Analytics',
                              'Finance & Management Consulting'
                            ].map((preset) => (
                              <button
                                key={preset}
                                onClick={() => {
                                  setCustomRoleInput(preset);
                                  handleSelectRole(preset);
                                }}
                                className="px-2.5 py-1 text-xs font-semibold bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-lg transition cursor-pointer"
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Custom Industry Input & Suggestion Chips */}
                    {coachStep === 'targeting_industry' && (
                      <div className="bg-white border border-gray-300 p-4 rounded-2xl shadow-sm space-y-3">
                        <label className="block text-xs font-bold text-gray-800">
                          Type or search your target industry / environment:
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={customIndustryInput}
                            onChange={(e) => setCustomIndustryInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && customIndustryInput.trim()) {
                                handleSelectIndustry(customIndustryInput.trim());
                              }
                            }}
                            placeholder="e.g. Academic Medical Center, Biotech Venture, Public Policy NGO, Fortune 500..."
                            className="flex-1 px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 bg-gray-50 font-medium"
                          />
                          <button
                            disabled={!customIndustryInput.trim()}
                            onClick={() => handleSelectIndustry(customIndustryInput.trim())}
                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition shadow-sm cursor-pointer shrink-0"
                          >
                            Set Industry
                          </button>
                        </div>

                        {/* Quick Presets */}
                        <div className="pt-2 border-t border-gray-150">
                          <p className="text-[11px] font-bold text-gray-500 mb-2">Target Environment Presets:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              'Academic Medical Center & Hospital',
                              'Corporate & Large Enterprise',
                              'Tech Startup & Venture Capital',
                              'Government & Non-Profit Public Sector',
                              'Academic & Research Laboratory'
                            ].map((preset) => (
                              <button
                                key={preset}
                                onClick={() => {
                                  setCustomIndustryInput(preset);
                                  handleSelectIndustry(preset);
                                }}
                                className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-lg transition cursor-pointer"
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. TARGETING ALIGNMENT REPORT */}
                {msg.type === 'targeting_report' && msg.data?.report && (
                  <div className="space-y-4 animate-fade-in pl-1">
                    <div className="glass-card p-5 rounded-2xl border border-gray-300 bg-white shadow-sm space-y-3">
                      <h4 className="text-xs font-bold text-gray-900 border-b border-gray-250 pb-2">
                        Targeting & Alignment Summary
                      </h4>

                      <div className="grid grid-cols-1 gap-3.5 text-sm text-gray-900">
                        <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 shadow-sm">
                          <span className="font-bold text-purple-900 block text-[11px] uppercase tracking-wider">● Summary Reframe</span>
                          <p className="mt-1 font-normal text-gray-950 leading-relaxed">{msg.data.report.summaryReframe}</p>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 shadow-sm">
                          <span className="font-bold text-blue-900 block text-[11px] uppercase tracking-wider">● Skills Reordering</span>
                          <p className="mt-1 font-normal text-gray-950 leading-relaxed">{msg.data.report.skillsReordering}</p>
                        </div>
                        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 shadow-sm">
                          <span className="font-bold text-emerald-900 block text-[11px] uppercase tracking-wider">● Language Alignment</span>
                          <p className="mt-1 font-normal text-gray-950 leading-relaxed">{msg.data.report.languageAlignment}</p>
                        </div>
                        {msg.data.report.deemphasising && (
                          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 shadow-sm">
                            <span className="font-bold text-amber-900 block text-[11px] uppercase tracking-wider">● De-emphasising Low Relevance</span>
                            <p className="mt-1 font-normal text-gray-950 leading-relaxed">{msg.data.report.deemphasising}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Interactive Targeted Resume Preview */}
                    {msg.data.draft && (
                      <div className="bg-white border border-gray-300 rounded-2xl p-5 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                          <span className="text-[11px] font-mono font-bold text-gray-500">TARGETED DRAFT PREVIEW</span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleExportWord(msg.data?.draft)}
                              className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded hover:bg-amber-100 transition cursor-pointer"
                            >
                              Download Word
                            </button>
                            <button
                              onClick={() => handlePrintPDF(msg.data?.draft)}
                              className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-1 rounded hover:bg-purple-100 transition cursor-pointer"
                            >
                              PDF Preview
                            </button>
                          </div>
                        </div>

                        <div className="text-sm text-gray-900 space-y-2 border-l-2 border-emerald-600 pl-3">
                          <div className="font-bold text-gray-950 uppercase text-xs">{msg.data.draft.name}</div>
                          <div className="bg-emerald-100 text-emerald-900 font-mono text-[10px] px-2 py-0.5 rounded border border-emerald-200 inline-block font-bold">
                            Tuned for: {selectedRole} ({selectedIndustry})
                          </div>
                          <p className="italic font-normal text-gray-950 leading-relaxed">{msg.data.draft.summary}</p>
                        </div>

                        {coachStep === 'deepening' && msg.data.questions && msg.data.questions.length > 0 && (
                          <div className="space-y-4 border-t border-gray-250 pt-4">
                            <div className="space-y-1">
                              <h5 className="text-xs font-bold text-gray-900 flex items-center gap-1">
                                <Sparkles className="w-3.5 h-3.5 text-albion-gold animate-pulse" />
                                <span>Deepen with Quantitative Specifics:</span>
                              </h5>
                              <p className="text-xs text-gray-600 font-medium">
                                Corporate recruiters prioritize measurable results. Answer these 3 quick details from your draft bullets and I'll compile your final polished CV:
                              </p>
                            </div>

                            <div className="space-y-3 text-sm">
                              {msg.data.questions.map((q, qIdx) => (
                                <div key={qIdx} className="space-y-1.5 p-3.5 bg-gray-50 rounded-xl border border-gray-300">
                                  <p className="font-bold text-gray-900">{q}</p>
                                  <input
                                    type="text"
                                    placeholder="Type details (e.g., '15 recruits', '$50K logistics, URL') or leave blank..."
                                    value={deepAnswers[qIdx] || ''}
                                    onChange={(e) => setDeepAnswers({ ...deepAnswers, [qIdx]: e.target.value })}
                                    className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg outline-none focus:border-emerald-600 text-gray-950 font-medium placeholder:text-gray-400"
                                  />
                                </div>
                              ))}
                            </div>

                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => submitDeepeningAnswers({ 0: '', 1: '', 2: '' })}
                                className="px-3.5 py-2 text-xs font-bold text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition cursor-pointer"
                              >
                                Skip & Use Defaults
                              </button>
                              <button
                                onClick={() => submitDeepeningAnswers(deepAnswers)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2 rounded-xl text-xs transition duration-150 flex items-center gap-1 shadow-sm cursor-pointer"
                              >
                                <span>Save & Compile Final CV</span>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 4. FINAL POLISHED REPORT & RESUME CANVAS */}
                {msg.type === 'final_report' && msg.data?.draft && (
                  <div className="space-y-5 animate-fade-in pl-1 w-full max-w-xl">
                    {/* The Full Featured Times New Roman Sheet */}
                    <div className="bg-white border border-gray-400 rounded-2xl p-6 shadow-md font-serif text-black relative">
                      <div className="absolute top-2 right-2 bg-green-50 text-green-800 font-bold border border-green-300 rounded font-sans text-[9px] tracking-widest px-1.5 py-0.5 uppercase">
                        100% ATS Approved
                      </div>

                      <div className="text-center space-y-0.5">
                        <div className="text-base font-bold uppercase tracking-tight text-black">{msg.data.draft.name}</div>
                        <div className="text-[10px] font-sans text-gray-900 font-medium">
                          {[msg.data.draft.phone, msg.data.draft.email, msg.data.draft.linkedin].filter(Boolean).join(' | ')}
                        </div>
                      </div>

                      {msg.data.draft.summary && (
                        <div className="mt-3 text-[11px]">
                          <div className="font-bold border-b border-black uppercase pb-0.5 tracking-wider text-black">SUMMARY</div>
                          <p className="mt-1 text-justify font-normal leading-snug text-black">{msg.data.draft.summary}</p>
                        </div>
                      )}

                      <div className="mt-3 text-[11px]">
                        <div className="font-bold border-b border-black uppercase pb-0.5 tracking-wider text-black">EDUCATION</div>
                        <div className="mt-1 flex justify-between items-start">
                          <div>
                            <strong className="font-bold text-black">{msg.data.draft.education}</strong>
                            <div className="italic font-normal text-black">{msg.data.draft.majorMinor}</div>
                          </div>
                          <div className="text-right">
                            <strong className="text-black">{msg.data.draft.expectedGraduation}</strong>
                            <div className="font-mono text-[10px] font-bold text-black">{msg.data.draft.gpa}</div>
                          </div>
                        </div>
                      </div>

                      {msg.data.draft.customExperiences && msg.data.draft.customExperiences.length > 0 && (
                        <div className="mt-3 text-[11px]">
                          <div className="font-bold border-b border-black uppercase pb-0.5 tracking-wider text-black">EXPERIENCE</div>
                          {msg.data.draft.customExperiences.map((exp: any, expIdx: number) => (
                            <div key={expIdx} className="mt-1.5">
                              <div className="flex justify-between items-start font-bold text-black">
                                <span>{exp.company}</span>
                                <span>{exp.location}</span>
                              </div>
                              <div className="flex justify-between items-start italic font-bold text-black">
                                <span>{exp.role}</span>
                                <span className="font-normal text-black">{exp.dates}</span>
                              </div>
                              {exp.bullets && exp.bullets.length > 0 && (
                                <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                                  {exp.bullets.map((bul: string, bIdx: number) => (
                                    <li key={bIdx} className="text-justify font-normal leading-snug text-black">{bul}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {msg.data.draft.customActivities && msg.data.draft.customActivities.length > 0 && (
                        <div className="mt-3 text-[11px]">
                          <div className="font-bold border-b border-black uppercase pb-0.5 tracking-wider text-black">CAMPUS ACTIVITIES</div>
                          {msg.data.draft.customActivities.map((act: any, actIdx: number) => (
                            <div key={actIdx} className="mt-1.5">
                              <div className="flex justify-between items-start font-bold text-black">
                                <span>{act.organization}</span>
                                <span>{act.dates}</span>
                              </div>
                              {act.bullets && act.bullets.length > 0 && (
                                <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                                  {act.bullets.map((bul: string, bIdx: number) => (
                                    <li key={bIdx} className="text-justify font-normal leading-snug text-black">{bul}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {msg.data.draft.skills && msg.data.draft.skills.length > 0 && (
                        <div className="mt-3 text-[11px]">
                          <div className="font-bold border-b border-black uppercase pb-0.5 tracking-wider text-black">SKILLS</div>
                          <p className="mt-1 font-normal text-black">{msg.data.draft.skills.join(', ')}</p>
                        </div>
                      )}
                    </div>

                    {/* Final Action Controls block */}
                    <div className="glass-card p-4 rounded-2xl border border-gray-300 bg-emerald-50/10 shadow-sm flex flex-col sm:flex-row items-center gap-3">
                      <button
                        onClick={() => handleSaveAndExit(msg.data?.draft)}
                        className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4 text-white" />
                        <span>Lock & Save to Coach Profile</span>
                      </button>

                      <button
                        onClick={() => handleExportWord(msg.data?.draft)}
                        className="w-full sm:w-auto bg-white hover:bg-gray-50 text-amber-700 border border-amber-300 font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <FileText className="w-4 h-4 text-amber-600" />
                        <span>Download Word (.doc)</span>
                      </button>

                      <button
                        onClick={() => handlePrintPDF(msg.data?.draft)}
                        className="w-full sm:w-auto bg-white hover:bg-gray-50 text-purple-700 border border-purple-300 font-bold py-2.5 px-4 rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <Printer className="w-4 h-4 text-purple-600" />
                        <span>Print PDF / Save</span>
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        setCoachStep('upload');
                        setDeepAnswers({ 0: '', 1: '', 2: '' });
                        setResumeText('');
                        setPastedText('');
                        setMessages([
                          {
                            id: `restart-${Date.now()}`,
                            sender: 'coach',
                            text: "No problem! Let's optimize another resume. Upload your file (PDF/Word) or paste your rough text below.",
                            timestamp: new Date(),
                            type: 'intro'
                          }
                        ]);
                      }}
                      className="w-full text-center border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Optimize Another Resume</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Coach Typing Loader Indicator */}
        {isGenerating && (
          <div className="flex justify-start animate-fade-in">
            <div className="flex items-start space-x-3 max-w-[75%]">
              <div className="h-8 w-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm animate-pulse">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-white border border-gray-150 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center space-x-2">
                <span className="text-xs text-gray-500">Coach is reviewing details...</span>
                <div className="flex space-x-1">
                  <div className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Hidden Anchor for automatic scroll */}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Form Composer Area */}
      <div className="bg-white py-4 border-t border-gray-200 shrink-0">
        {errorMsg && (
          <div className="mb-3 bg-red-50 text-red-700 p-3 rounded-xl text-xs border border-red-100 flex items-center space-x-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {coachStep === 'upload' && !isGenerating ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
            {/* File Drag Box */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) await processFile(file);
              }}
              className={`border-2 border-dashed rounded-2xl p-4 text-center flex flex-col items-center justify-center min-h-[120px] transition ${
                isDragging 
                  ? 'border-emerald-600 bg-emerald-50/20' 
                  : 'border-gray-300 hover:border-emerald-500 hover:bg-gray-50'
              }`}
            >
              <UploadCloud className="w-6 h-6 text-emerald-600 mb-1.5 animate-bounce" />
              <h4 className="text-sm font-bold text-gray-900">Drag & Drop Resume File</h4>
              <p className="text-xs text-gray-600 mb-2 font-medium">Supports PDF & DOCX formats</p>
              <label className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-1.5 rounded-lg shadow-sm text-xs cursor-pointer transition">
                <span>Browse</span>
                <input
                  type="file"
                  accept=".pdf,.docx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Paste Box */}
            <div className="flex flex-col space-y-2">
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Or paste your existing resume draft/bullet points here..."
                className="w-full flex-1 min-h-[85px] p-2.5 text-sm bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-emerald-600 font-sans text-gray-900 resize-none"
              />
              <button
                onClick={handlePasteSubmit}
                disabled={!pastedText.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl text-sm transition duration-150 flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
              >
                <span>Submit Text Draft</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 animate-fade-in">
            {/* Quick Prompt Suggestions */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              <span className="text-[11px] font-bold text-gray-400 shrink-0 uppercase tracking-wider">Ask Coach:</span>
              {[
                'Make summary 2 sentences',
                'Add Python & SQL skills',
                'Emphasize leadership in experience',
                'How to explain job gap?'
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSendChatMessage(suggestion)}
                  disabled={isGenerating}
                  className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-lg shrink-0 transition text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {/* Chat Bar Input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && chatInput.trim()) {
                    handleSendChatMessage();
                  }
                }}
                placeholder="Ask the coach anything or request specific resume changes..."
                className="flex-1 px-4 py-2.5 text-sm bg-gray-50 border border-gray-300 rounded-xl outline-none focus:border-purple-600 focus:bg-white text-gray-900 font-medium placeholder:text-gray-400"
              />
              <button
                onClick={() => handleSendChatMessage()}
                disabled={!chatInput.trim() || isGenerating}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition duration-150 flex items-center gap-1.5 shadow-sm cursor-pointer shrink-0"
              >
                <span>Send</span>
                <Send className="w-3.5 h-3.5" />
              </button>

              {coachStep === 'final' && finalResume && (
                <button
                  onClick={() => handleSaveAndExit(finalResume)}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition shadow-sm cursor-pointer shrink-0"
                >
                  Save & Exit
                </button>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
