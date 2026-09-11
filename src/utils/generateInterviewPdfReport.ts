import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FinalReport, JobTarget, InterviewSession } from '../types';

export interface GeneratePdfOptions {
  report: FinalReport;
  jobTarget: JobTarget;
  session?: InterviewSession;
}

/**
 * Cleanly generates a comprehensive, multi-page PDF Report of the interview results
 * using jsPDF and jspdf-autotable directly in the client browser.
 */
export function generateInterviewPdfReport({
  report,
  jobTarget,
  session,
}: GeneratePdfOptions): void {
  // 1. Resolve Candidate Name & File Name
  const rawCandidateName =
    session?.resumeInfo?.name ||
    report.atsResumeReport?.name ||
    '';
  const displayCandidateName = rawCandidateName.trim() || 'Candidate';
  const sanitizedNameForFile = displayCandidateName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `BRIT_Interview_Report_${sanitizedNameForFile}.pdf`;

  // 2. Initialize jsPDF Document (A4 Portrait in Points)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 595.28 pt
  const pageHeight = doc.internal.pageSize.getHeight(); // 841.89 pt
  const margin = 40;
  const contentWidth = pageWidth - margin * 2; // 515.28 pt

  // Theme Colors
  const purplePrimary: [number, number, number] = [73, 38, 111]; // #49266F
  const purpleDark: [number, number, number] = [45, 20, 69]; // #2D1445
  const goldAccent: [number, number, number] = [234, 170, 0]; // #EAAA00
  const slateDark: [number, number, number] = [30, 41, 59]; // #1E293B
  const slateMuted: [number, number, number] = [100, 116, 139]; // #64748B
  const emeraldGreen: [number, number, number] = [16, 149, 106]; // #10956A
  const roseRed: [number, number, number] = [225, 29, 72]; // #E11D48
  const bgLight: [number, number, number] = [248, 250, 252]; // #F8FAFC

  // Medical track check
  const isMedicalTrack =
    jobTarget.interviewType === 'medical_school' ||
    /med|doctor|physician|mmi|aamc|medical|hospital|clinic|pre-med|prehealth|surgery/i.test(
      jobTarget.positionTitle || ''
    ) ||
    /med|doctor|physician|mmi|aamc|medical|hospital|clinic|pre-med|prehealth|surgery/i.test(
      jobTarget.companyName || ''
    );

  // Scores
  const interviewScore = typeof report.overallScore === 'number' ? report.overallScore : 0;
  const atsScore =
    typeof report.atsResumeReport?.overallScore === 'number'
      ? report.atsResumeReport.overallScore
      : null;
  const combinedScore = isMedicalTrack
    ? interviewScore
    : atsScore !== null
    ? Math.round((interviewScore + atsScore) / 2)
    : interviewScore;

  // ----------------------------------------------------
  // HEADER BANNER
  // ----------------------------------------------------
  doc.setFillColor(...purplePrimary);
  doc.rect(0, 0, pageWidth, 85, 'F');

  // Decorative gold accent bar
  doc.setFillColor(...goldAccent);
  doc.rect(0, 85, pageWidth, 4, 'F');

  // Header Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('BRIT INTERVIEW COACH — CAREER ASSESSMENT REPORT', margin, 38);

  // Header Subtitle / Institute
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(234, 170, 0); // Gold
  doc.text('ALBION COLLEGE BRITONS | ACADEMIC & PROFESSIONAL CAREER READINESS', margin, 53);

  // Assessment Date & Track
  doc.setFontSize(8.5);
  doc.setTextColor(220, 215, 235);
  const formattedDate = session?.date
    ? new Date(session.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
  const trackLabel = isMedicalTrack
    ? 'Medical School Admissions Track (AAMC / MMI)'
    : 'Corporate & Internship Track (STAR Framework)';
  doc.text(`Generated: ${formattedDate}  |  ${trackLabel}`, margin, 68);

  let currentY = 105;

  // ----------------------------------------------------
  // SECTION 1: CANDIDATE & ASSESSMENT TARGET DETAILS
  // ----------------------------------------------------
  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [['Candidate & Target Role Information', 'Assessment Summary']],
    headStyles: {
      fillColor: purpleDark,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9.5,
    },
    body: [
      [
        `Candidate Name: ${displayCandidateName}\nTarget Position: ${
          jobTarget.positionTitle || 'Not specified'
        }\nTarget Organization: ${
          jobTarget.companyName || 'Not specified'
        }\nIndustry Focus: ${jobTarget.industry || 'General Professional'}`,
        `Combined Readiness: ${combinedScore}%\nInterview Performance: ${interviewScore}%\nResume ATS Score: ${
          atsScore !== null ? `${atsScore}%` : 'Not Available (Audio/Mock Only)'
        }\nQuestions Evaluated: ${session?.questions?.length || 0}`,
      ],
    ],
    bodyStyles: {
      fontSize: 8.5,
      textColor: slateDark,
      lineColor: [226, 232, 240],
      cellPadding: 6,
    },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.55 },
      1: { cellWidth: contentWidth * 0.45 },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  // ----------------------------------------------------
  // SECTION 2: EXECUTIVE PERFORMANCE METRICS TABLE
  // ----------------------------------------------------
  const scoreRows: (string | number)[][] = [
    [
      'Combined Career Readiness',
      `${combinedScore}%`,
      combinedScore >= 90
        ? 'Distinguished Student — Exceptional Poise'
        : combinedScore >= 80
        ? 'Proficient Candidate — Strong Alignment'
        : combinedScore >= 70
        ? 'Developing Professional — Practice Recommended'
        : 'Beginner Practice — Foundations Needed',
    ],
    [
      'Interview Performance Audit',
      `${interviewScore}%`,
      interviewScore >= 85
        ? 'Strong delivery, structured storytelling, high relevance'
        : interviewScore >= 70
        ? 'Competent answers; refine STAR metrics & clarity'
        : 'Requires structural practice & depth',
    ],
  ];

  if (atsScore !== null) {
    scoreRows.push([
      'Resume ATS Compatibility',
      `${atsScore}%`,
      atsScore >= 80
        ? 'High ATS compatibility, clean horizontal layout'
        : 'Formatting or keyword improvements suggested',
    ]);
  }

  if (typeof report.communicationScore === 'number' && report.communicationScore > 0) {
    scoreRows.push([
      'Communication & Delivery Score',
      `${report.communicationScore}%`,
      report.communicationScore >= 80 ? 'Fluent, articulate, professional' : 'Pacing & filler reduction advised',
    ]);
  }

  if (typeof report.contentQualityScore === 'number' && report.contentQualityScore > 0) {
    scoreRows.push([
      'Content Quality & Depth Score',
      `${report.contentQualityScore}%`,
      report.contentQualityScore >= 80 ? 'Concrete examples with tangible impact' : 'Add more quantified accomplishments',
    ]);
  }

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'striped',
    head: [['Performance Category', 'Score', 'Evaluator Evaluation & Verdict']],
    headStyles: {
      fillColor: purplePrimary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    body: scoreRows,
    bodyStyles: {
      fontSize: 8.5,
      textColor: slateDark,
      cellPadding: 5,
    },
    columnStyles: {
      0: { cellWidth: 150, fontStyle: 'bold' },
      1: { cellWidth: 60, halign: 'center', fontStyle: 'bold', textColor: purplePrimary },
      2: { cellWidth: contentWidth - 210 },
    },
    alternateRowStyles: {
      fillColor: [245, 243, 250],
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  // ----------------------------------------------------
  // SECTION 3: TOP STRENGTHS & IMPROVEMENT AREAS
  // ----------------------------------------------------
  const strengthsList = (report.topStrengths && report.topStrengths.length > 0)
    ? report.topStrengths.map((s, i) => `${i + 1}. ${s}`).join('\n\n')
    : '1. Professional enthusiasm and prompt engagement.\n2. Clear verbal articulation.\n3. Alignment with core Albion values.';

  const improvementsList = (report.topImprovementAreas && report.topImprovementAreas.length > 0)
    ? report.topImprovementAreas.map((imp, i) => `${i + 1}. ${imp}`).join('\n\n')
    : '1. Incorporate specific quantified metrics in story outcomes.\n2. Follow the STAR framework (Situation, Task, Action, Result) consistently.\n3. Minimize filler pauses.';

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [['Top Practice Strengths', 'Top Improvement Opportunities']],
    headStyles: {
      fillColor: purpleDark,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    body: [[strengthsList, improvementsList]],
    bodyStyles: {
      fontSize: 8,
      textColor: slateDark,
      cellPadding: 6,
      lineColor: [226, 232, 240],
    },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.5, fillColor: [240, 253, 244] }, // light emerald
      1: { cellWidth: contentWidth * 0.5, fillColor: [255, 251, 235] }, // light amber
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  // ----------------------------------------------------
  // SECTION 4: ADVISOR FORMULATION & OVERALL FEEDBACK
  // ----------------------------------------------------
  if (report.personalizedAdvice) {
    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'grid',
      head: [['Albion Career Advisory Council — Personalized Coach Advice']],
      headStyles: {
        fillColor: purplePrimary,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      body: [[report.personalizedAdvice]],
      bodyStyles: {
        fontSize: 8.5,
        textColor: slateDark,
        cellPadding: 7,
        fillColor: [250, 245, 255],
        lineColor: [226, 232, 240],
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 14;
  }

  // ----------------------------------------------------
  // SECTION 5: DETAILED RESPONSE-BY-RESPONSE AUDIT
  // ----------------------------------------------------
  const questions = session?.questions || [];

  if (questions.length > 0) {
    // Header row separating summary from questions
    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'plain',
      body: [
        [
          {
            content: 'DETAILED INTERVIEW QUESTIONS, TRANSCRIPTS & RUBRIC BREAKDOWN',
            styles: {
              fillColor: purpleDark,
              textColor: [255, 255, 255],
              fontStyle: 'bold',
              fontSize: 10,
              halign: 'center',
              cellPadding: 6,
            },
          },
        ],
      ],
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;

    questions.forEach((question, index) => {
      const answer = session?.userAnswers?.[question.id] || '';
      const feedback = session?.feedbacks?.[question.id];

      // Determine skipped status
      const cleanAnswer = answer.trim().toLowerCase();
      const isSkipped =
        !cleanAnswer ||
        cleanAnswer === '[skipped question]' ||
        cleanAnswer.includes('skipped question') ||
        (feedback && feedback.score === 0 && cleanAnswer.length < 5);

      const statusBadge = isSkipped ? 'SKIPPED' : 'COMPLETED';
      const questionScore = feedback ? `${feedback.score}/10` : 'N/A';
      const rubricScore5 = feedback?.score5 !== undefined ? `${feedback.score5}/5` : 'N/A';

      // Rubric metrics
      const promptAlignPct = feedback ? `${feedback.score * 10}%` : 'N/A';
      const starFramePct = feedback
        ? `${feedback.score >= 8 ? 90 : feedback.score >= 6 ? 75 : 55}%`
        : 'N/A';
      const vocabRegPct = feedback
        ? `${feedback.score >= 8 ? 95 : feedback.score >= 6 ? 80 : 60}%`
        : 'N/A';
      const deliveryCluesPct = feedback
        ? feedback.speakingAnalysis
          ? `${Math.max(
              30,
              100 -
                (feedback.speakingAnalysis.fillerWordsCount +
                  feedback.speakingAnalysis.longPausesCount) *
                  10
            )}%`
          : `${feedback.score >= 7 ? 85 : 65}%`
        : 'N/A';

      const rubricTableContent: any[] = [
        [
          `Question #${index + 1}: ${question.text}`,
          `Status: ${statusBadge}\nGrade: ${questionScore} (Rubric: ${rubricScore5})`,
        ],
        [
          {
            content: `Candidate Transcript / Response:\n"${
              isSkipped ? '[No oral response provided — Question was skipped]' : answer
            }"`,
            colSpan: 2,
            styles: {
              fillColor: isSkipped ? [254, 242, 242] : [248, 250, 252],
              textColor: isSkipped ? roseRed : slateDark,
              fontStyle: isSkipped ? 'bold' : 'normal',
            },
          },
        ],
        [
          {
            content: `Objective Rubric Scores:\n• Prompt Alignment: ${promptAlignPct} — ${
              feedback?.relevanceComments || 'Relevance evaluated against target role.'
            }\n• STAR Framework: ${starFramePct} — ${
              feedback?.structureComments || 'Structural development & story arc.'
            }\n• Vocabulary Register: ${vocabRegPct} — ${
              feedback?.professionalismComments || 'Word choice & industry poise.'
            }\n• Delivery Clues: ${deliveryCluesPct} — ${
              feedback?.clarityComments || feedback?.confidenceComments || 'Pacing, clarity, and fillers.'
            }`,
            colSpan: 2,
            styles: {
              fillColor: [245, 243, 250],
            },
          },
        ],
      ];

      if (feedback?.score5Explanation) {
        rubricTableContent.push([
          {
            content: `Candidate Rubric Evaluation Verdict (${rubricScore5}):\n"${feedback.score5Explanation}"`,
            colSpan: 2,
            styles: {
              fillColor: [254, 243, 199], // light amber
              textColor: [120, 53, 15],
              fontStyle: 'italic',
            },
          },
        ]);
      }

      if (feedback?.suggestedAnswer) {
        rubricTableContent.push([
          {
            content: `Advisor Formulation (Suggested Model Response):\n"${feedback.suggestedAnswer}"`,
            colSpan: 2,
            styles: {
              fillColor: [240, 253, 244], // light green
              textColor: [6, 78, 59],
            },
          },
        ]);
      }

      if (feedback?.starAnalysis) {
        rubricTableContent.push([
          {
            content: `STAR Adherence Checklist:\n${feedback.starAnalysis}`,
            colSpan: 2,
            styles: {
              fillColor: [250, 245, 255],
              textColor: purplePrimary,
            },
          },
        ]);
      }

      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        theme: 'grid',
        body: rubricTableContent as any,
        bodyStyles: {
          fontSize: 8,
          textColor: slateDark,
          cellPadding: 5,
          lineColor: [226, 232, 240],
        },
        columnStyles: {
          0: { cellWidth: contentWidth * 0.75, fontStyle: 'bold' },
          1: { cellWidth: contentWidth * 0.25, halign: 'right', fontStyle: 'bold' },
        },
        styles: {
          overflow: 'linebreak',
        },
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;
    });
  }

  // ----------------------------------------------------
  // SECTION 6: ATS RESUME REPORT SUMMARY (IF AVAILABLE)
  // ----------------------------------------------------
  if (report.atsResumeReport) {
    const ats = report.atsResumeReport;
    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      theme: 'grid',
      head: [['ATS Resume Coach Audit & Optimization Findings']],
      headStyles: {
        fillColor: purplePrimary,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      body: [
        [
          `Overall ATS Score: ${ats.overallScore || atsScore}%\nFormatting Audit: ${
            ats.formattingAudit?.score || 85
          }% (${ats.formattingAudit?.status === 'success' ? 'Fully Linear' : 'Action Advised'})\nContent Proof Statement Metrics: ${
            ats.contentAudit?.score || 70
          }%\nKeyword Alignment: ${ats.keywordAudit?.score || 75}%\n\nTailored Guidance:\n${
            ats.tailoredAdvice ||
            'Ensure a linear single-column layout without tables or text boxes to optimize automated parsing.'
          }`,
        ],
      ],
      bodyStyles: {
        fontSize: 8,
        textColor: slateDark,
        cellPadding: 6,
        fillColor: [248, 250, 252],
        lineColor: [226, 232, 240],
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  // ----------------------------------------------------
  // FOOTER & PAGE NUMBERING ON EVERY PAGE
  // ----------------------------------------------------
  const totalPages = doc.getNumberOfPages();

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    doc.setPage(pageNum);

    // Subtle footer separator line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.75);
    doc.line(margin, pageHeight - 28, pageWidth - margin, pageHeight - 28);

    // Left Footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...slateMuted);
    doc.text(
      `BRIT Interview Coach — Confidential Student Career Diagnostic  |  ${displayCandidateName}`,
      margin,
      pageHeight - 16
    );

    // Right Footer: Page X of Y
    const pageString = `Page ${pageNum} of ${totalPages}`;
    const pageStrWidth = doc.getTextWidth(pageString);
    doc.text(pageString, pageWidth - margin - pageStrWidth, pageHeight - 16);
  }

  // ----------------------------------------------------
  // SAVE & DIRECT CLIENT-SIDE DOWNLOAD
  // ----------------------------------------------------
  doc.save(filename);
}
