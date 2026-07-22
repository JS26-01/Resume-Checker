import React, { useState } from 'react';
import { ResumeInfo, TemplateExperience, TemplateActivity } from '../types';
import { UploadCloud, FileText, Send, CheckCircle2, AlertCircle, Edit3, Plus, Trash2, GraduationCap, Linkedin, Sparkles, Award, TrendingUp, XCircle, AlertTriangle, Info, Lightbulb, Zap, ThumbsUp, RefreshCw, Check, Printer } from 'lucide-react';
import ResumeEnhancer from './ResumeEnhancer';
import ResumeToolsHub from './ResumeToolsHub';

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
    script.onerror = (e) => reject(new Error('Failed to load PDF parser from CDN library. Make sure you are connected to the internet.'));
    document.head.appendChild(script);
  });
};

const extractTextFromPdf = async (file: File): Promise<string> => {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items;
    
    // Group text items into lines based on Y-coordinate with a threshold tolerance
    const linesMap: { [y: number]: any[] } = {};
    const tolerance = 5; // tolerance in points/pixels for same-line alignment
    
    for (const item of items) {
      if (!item || typeof item.str !== 'string') continue;
      
      const x = item.transform ? item.transform[4] : 0;
      const y = item.transform ? item.transform[5] : 0;
      const text = item.str;
      
      // Find if we already have a line close to this Y coordinate
      let foundY = Object.keys(linesMap).map(Number).find(lineY => Math.abs(lineY - y) <= tolerance);
      
      if (foundY !== undefined) {
        linesMap[foundY].push({ text, x, y, width: item.width || 0, height: item.height || 0, transform: item.transform });
      } else {
        linesMap[y] = [{ text, x, y, width: item.width || 0, height: item.height || 0, transform: item.transform }];
      }
    }
    
    // Sort lines descending (highest Y coordinate is at the top of the PDF page)
    const sortedYKeys = Object.keys(linesMap)
      .map(Number)
      .sort((a, b) => b - a);
      
    let pageText = '';
    for (const yKey of sortedYKeys) {
      const lineItems = linesMap[yKey];
      
      // Sort items horizontally (left to right)
      lineItems.sort((a, b) => a.x - b.x);
      
      let lineText = '';
      let prevItem: any = null;
      for (const item of lineItems) {
        if (prevItem) {
          // Estimate item width if not provided
          const prevWidth = prevItem.width || (prevItem.transform && prevItem.transform[0] ? (prevItem.text.length * prevItem.transform[0] * 0.45) : (prevItem.text.length * 6));
          const prevEnd = prevItem.x + prevWidth;
          const gap = item.x - prevEnd;
          
          // Insert spacing if there's a visible horizontal gap and no existing space characters
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
    script.onerror = (e) => reject(new Error('Failed to load Microsoft Word parser. Make sure you are connected to the internet.'));
    document.head.appendChild(script);
  });
};

const extractTextFromDocx = async (file: File): Promise<string> => {
  const mammothLib = await loadMammoth();
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammothLib.extractRawText({ arrayBuffer });
  return result.value || '';
};

interface ResumeFormProps {
  resumeInfo: ResumeInfo | null;
  onSaveResume: (resume: ResumeInfo) => void;
  onStartMockInterview?: () => void;
}

export default function ResumeForm({ resumeInfo, onSaveResume, onStartMockInterview }: ResumeFormProps) {
  const [isParsing, setIsParsing] = useState(false);
  const [isExtractingFile, setIsExtractingFile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // States for ATS Resume Coach
  const [activeResumeSubTab, setActiveResumeSubTab] = useState<'profile' | 'ats-coach'>('profile');
  const [atsTargetRole, setAtsTargetRole] = useState('');
  const [atsReport, setAtsReport] = useState<any | null>(null);
  const [isAnalyzingAts, setIsAnalyzingAts] = useState(false);
  const [atsAnalysisError, setAtsAnalysisError] = useState<string | null>(null);

  // States for manual form edit
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(resumeInfo?.name || '');
  const [editedEducation, setEditedEducation] = useState(resumeInfo?.education || '');
  const [editedMajor, setEditedMajor] = useState(resumeInfo?.majorMinor || '');
  const [editedSkills, setEditedSkills] = useState<string[]>(resumeInfo?.skills || []);
  const [editedWork, setEditedWork] = useState<string[]>(resumeInfo?.workExperience || []);
  const [editedResearch, setEditedResearch] = useState<string[]>(resumeInfo?.researchExperience || []);
  const [editedProjects, setEditedProjects] = useState<string[]>(resumeInfo?.projects || []);
  const [editedLeadership, setEditedLeadership] = useState<string[]>(resumeInfo?.leadership || []);
  const [editedCerts, setEditedCerts] = useState<string[]>(resumeInfo?.certifications || []);

  const [newSkill, setNewSkill] = useState('');
  const [newWork, setNewWork] = useState('');
  const [newResearch, setNewResearch] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newLead, setNewLead] = useState('');
  const [newCert, setNewCert] = useState('');

  // States for High-Fidelity Resume Template Builder
  const [isTemplateBuilderActive, setIsTemplateBuilderActive] = useState(false);
  const [isEnhancerActive, setIsEnhancerActive] = useState(false);
  const [isToolsHubActive, setIsToolsHubActive] = useState(false);
  const [templateName, setTemplateName] = useState(resumeInfo?.name || 'Student Name');
  const [templatePhone, setTemplatePhone] = useState(resumeInfo?.phone || 'XXX-XXX-XXXX');
  const [templateEmail, setTemplateEmail] = useState(resumeInfo?.email || 'XXXX@college.edu');
  const [templateLinkedin, setTemplateLinkedin] = useState(resumeInfo?.linkedin || 'linkedin.com/in/studentname');
  const [templateSummary, setTemplateSummary] = useState(resumeInfo?.summary || 'Excellent people skills and strives for harmony and cooperation while working in groups. Open-minded and fearless in new tasks and with other ideas. Learns quickly with technology programs and is familiar with Microsoft Word, Microsoft Excel, and Microsoft PowerPoint');
  const [templateEducation, setTemplateEducation] = useState(resumeInfo?.education || 'Albion College, Albion, MI');
  const [templateExpectedGrad, setTemplateExpectedGrad] = useState(resumeInfo?.expectedGraduation || 'Expected Graduation: 05/2027');
  const [templateMajorMinor, setTemplateMajorMinor] = useState(resumeInfo?.majorMinor || 'Bachelor of Arts in Marketing Management');
  const [templateGpa, setTemplateGpa] = useState(resumeInfo?.gpa || 'GPA: 3.5');
  const [templateSkills, setTemplateSkills] = useState(resumeInfo?.skills?.join(', ') || 'Microsoft Word, Excel, PowerPoint, Photoshop, Illustrator, Freehand, Dreamweaver, Flash');

  const [templateExperiences, setTemplateExperiences] = useState<TemplateExperience[]>(resumeInfo?.customExperiences || [
    {
      company: 'XYZ Company',
      location: 'City, State',
      role: 'XYZ Team Member',
      dates: '01/2025-Present',
      bullets: [
        'Contribute to the college festivals by leading web development and publicity teams. Developed the websites, organized online events and coding hackathons, and managed registrations, achieving a 45% increase in participants',
        'Create and schedule 10+ posts/week, boosting event festival entries by 30% and podcast subscriptions by 40%',
        'Write three philanthropic blog posts weekly for a charity mobile application and an eco-friendly e-commerce project to increase the company website views by 18% in two weeks',
        'Edit raw footage, label time codes, and select background music specific to certain scenes for the Aspire TV original production titled "The Graduates", improving post-production efficiency by 20%'
      ]
    },
    {
      company: 'XYZ Company',
      location: 'City, State',
      role: 'XYZ Team Member',
      dates: '01/2024-12/2024',
      bullets: [
        'Facilitated engaging arts and crafts sessions for camp attendees, leveraging creative problem-solving skills and effective communication to enhance participant experience. Contributed to a 25% increase in camper satisfaction and program retention',
        'Led a cross-functional team to revamp the customer issue submission portal, leveraging customer insights to improve user experience, resulting in a 20% reduction in issue resolution time',
        'Conducted extensive A/B testing on promoted listings, optimizing placements and analyzing the impact on key metrics such as product clicks, favoriting, and adding to cart. Achieved a 233% increase in promoted listings revenue through data-driven optimization efforts',
        'Assisted with social media marketing and implemented comprehensive marketing strategies to showcase company services and expertise, growing our Instagram by 200%'
      ]
    }
  ]);

  const [templateActivities, setTemplateActivities] = useState<TemplateActivity[]>(resumeInfo?.customActivities || [
    {
      organization: 'Member, Carl A. Gerstacker Institute for Business and Management',
      dates: '08/2025-Present',
      bullets: [
        'Program of distinction with a focus on professional development and practical experience'
      ]
    },
    {
      organization: "Dean's List: 12/2023, 05/2024. 12/2024",
      dates: '',
      bullets: []
    }
  ]);

  const initTemplateBuilderStates = (info: ResumeInfo) => {
    setTemplateName(info.name || 'Student Name');
    setTemplatePhone(info.phone || 'XXX-XXX-XXXX');
    setTemplateEmail(info.email || 'XXXX@college.edu');
    setTemplateLinkedin(info.linkedin || 'linkedin.com/in/studentname');
    setTemplateSummary(info.summary || 'Excellent people skills and strives for harmony and cooperation while working in groups. Open-minded and fearless in new tasks and with other ideas. Learns quickly with technology programs and is familiar with Microsoft Word, Microsoft Excel, and Microsoft PowerPoint');
    setTemplateEducation(info.education || 'Albion College, Albion, MI');
    setTemplateExpectedGrad(info.expectedGraduation || 'Expected Graduation: 05/2027');
    setTemplateMajorMinor(info.majorMinor || 'Bachelor of Arts in Marketing Management');
    setTemplateGpa(info.gpa || 'GPA: 3.5');
    setTemplateSkills(info.skills?.join(', ') || 'Microsoft Word, Excel, PowerPoint, Photoshop, Illustrator, Freehand, Dreamweaver, Flash');
    
    if (info.customExperiences && info.customExperiences.length > 0) {
      setTemplateExperiences(info.customExperiences);
    } else {
      setTemplateExperiences([
        {
          company: 'XYZ Company',
          location: 'City, State',
          role: 'XYZ Team Member',
          dates: '01/2025-Present',
          bullets: [
            'Contribute to the college festivals by leading web development and publicity teams. Developed the websites, organized online events and coding hackathons, and managed registrations, achieving a 45% increase in participants',
            'Create and schedule 10+ posts/week, boosting event festival entries by 30% and podcast subscriptions by 40%',
            'Write three philanthropic blog posts weekly for a charity mobile application and an eco-friendly e-commerce project to increase the company website views by 18% in two weeks',
            'Edit raw footage, label time codes, and select background music specific to certain scenes for the Aspire TV original production titled "The Graduates", improving post-production efficiency by 20%'
          ]
        },
        {
          company: 'XYZ Company',
          location: 'City, State',
          role: 'XYZ Team Member',
          dates: '01/2024-12/2024',
          bullets: [
            'Facilitated engaging arts and crafts sessions for camp attendees, leveraging creative problem-solving skills and effective communication to enhance participant experience. Contributed to a 25% increase in camper satisfaction and program retention',
            'Led a cross-functional team to revamp the customer issue submission portal, leveraging customer insights to improve user experience, resulting in a 20% reduction in issue resolution time',
            'Conducted extensive A/B testing on promoted listings, optimizing placements and analyzing the impact on key metrics such as product clicks, favoriting, and adding to cart. Achieved a 233% increase in promoted listings revenue through data-driven optimization efforts',
            'Assisted with social media marketing and implemented comprehensive marketing strategies to showcase company services and expertise, growing our Instagram by 200%'
          ]
        }
      ]);
    }

    if (info.customActivities && info.customActivities.length > 0) {
      setTemplateActivities(info.customActivities);
    } else {
      setTemplateActivities([
        {
          organization: 'Member, Carl A. Gerstacker Institute for Business and Management',
          dates: '08/2025-Present',
          bullets: [
            'Program of distinction with a focus on professional development and practical experience'
          ]
        },
        {
          organization: "Dean's List: 12/2023, 05/2024. 12/2024",
          dates: '',
          bullets: []
        }
      ]);
    }
  };

  const handleExportWord = () => {
    const formattedSkills = templateSkills.split(',').map(s => s.trim()).filter(Boolean).join(', ');
    
    let docBody = `
      <div style="font-family:'Times New Roman', Times, serif; font-size:11pt; line-height:1.25; color:#000000; width:100%;">
        
        <!-- HEADER -->
        <p style="text-align:center; margin-bottom:2pt;">
          <strong style="font-size:16pt; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px;">${templateName}</strong>
        </p>
        <p style="text-align:center; font-size:10pt; margin-bottom:12pt; color:#000000;">
          ${[templatePhone, templateEmail, templateLinkedin].filter(Boolean).join(' | ')}
        </p>

        <!-- SUMMARY -->
        ${templateSummary ? `
          <p style="font-size:11pt; font-weight:bold; text-transform:uppercase; border-bottom:1px solid #000000; margin-top:12pt; margin-bottom:4pt; padding-bottom:1px;">SUMMARY</p>
          <p style="margin-bottom:8pt; text-align:justify;">${templateSummary}</p>
        ` : ''}

        <!-- EDUCATION -->
        <p style="font-size:11pt; font-weight:bold; text-transform:uppercase; border-bottom:1px solid #000000; margin-top:12pt; margin-bottom:4pt; padding-bottom:1px;">EDUCATION</p>
        <table border="0" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse; margin-bottom:2pt;">
          <tr>
            <td style="text-align:left; font-weight:bold; font-size:11pt; font-family:'Times New Roman', Times, serif;">${templateEducation}</td>
            <td style="text-align:right; font-weight:bold; font-size:11pt; font-family:'Times New Roman', Times, serif;">${templateExpectedGrad}</td>
          </tr>
          <tr>
            <td style="text-align:left; font-size:11pt; font-family:'Times New Roman', Times, serif; font-style: italic;">${templateMajorMinor}</td>
            <td style="text-align:right; font-weight:bold; font-size:11pt; font-family:'Times New Roman', Times, serif;">${templateGpa}</td>
          </tr>
        </table>

        <!-- CAMPUS ACTIVITIES -->
        ${templateActivities.length > 0 ? `
          <p style="font-size:11pt; font-weight:bold; text-transform:uppercase; border-bottom:1px solid #000000; margin-top:12pt; margin-bottom:4pt; padding-bottom:1px;">CAMPUS ACTIVITIES AND AWARDS</p>
          ${templateActivities.map(act => `
            <table border="0" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse; margin-bottom:2pt;">
              <tr>
                <td style="text-align:left; font-weight:bold; font-size:11pt; font-family:'Times New Roman', Times, serif;">${act.organization}</td>
                <td style="text-align:right; font-weight:bold; font-size:11pt; font-family:'Times New Roman', Times, serif;">${act.dates}</td>
              </tr>
            </table>
            ${act.bullets.length > 0 ? `
              <ul style="margin-top:2pt; margin-bottom:4pt; padding-left:15pt;">
                ${act.bullets.map(b => `
                  <li style="margin-bottom:2pt; font-size:11pt; font-family:'Times New Roman', Times, serif; text-align:justify;">${b}</li>
                `).join('')}
              </ul>
            ` : '<div style="margin-bottom:6pt;"></div>'}
          `).join('')}
        ` : ''}

        <!-- EXPERIENCE -->
        ${templateExperiences.length > 0 ? `
          <p style="font-size:11pt; font-weight:bold; text-transform:uppercase; border-bottom:1px solid #000000; margin-top:12pt; margin-bottom:4pt; padding-bottom:1px;">EXPERIENCE</p>
          ${templateExperiences.map(exp => `
            <table border="0" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse; margin-bottom:1pt;">
              <tr>
                <td style="text-align:left; font-weight:bold; font-size:11pt; font-family:'Times New Roman', Times, serif;">${exp.company}</td>
                <td style="text-align:right; font-weight:bold; font-size:11pt; font-family:'Times New Roman', Times, serif;">${exp.location}</td>
              </tr>
              <tr>
                <td style="text-align:left; font-weight:bold; font-style:italic; font-size:11pt; font-family:'Times New Roman', Times, serif;">${exp.role}</td>
                <td style="text-align:right; font-style:italic; font-size:11pt; font-family:'Times New Roman', Times, serif;">${exp.dates}</td>
              </tr>
            </table>
            ${exp.bullets.length > 0 ? `
              <ul style="margin-top:2pt; margin-bottom:4pt; padding-left:15pt;">
                ${exp.bullets.map(b => `
                  <li style="margin-bottom:2pt; font-size:11pt; font-family:'Times New Roman', Times, serif; text-align:justify;">${b}</li>
                `).join('')}
              </ul>
            ` : '<div style="margin-bottom:6pt;"></div>'}
          `).join('')}
        ` : ''}

        <!-- SKILLS -->
        ${formattedSkills ? `
          <p style="font-size:11pt; font-weight:bold; text-transform:uppercase; border-bottom:1px solid #000000; margin-top:12pt; margin-bottom:4pt; padding-bottom:1px;">SKILLS</p>
          <p style="font-size:11pt; font-family:'Times New Roman', Times, serif; text-align:justify;">${formattedSkills}</p>
        ` : ''}

      </div>
    `;

    const content = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          @page {
            size: 8.5in 11in;
            margin: 0.75in 0.75in 0.75in 0.75in;
          }
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 11pt;
            line-height: 1.25;
            color: #000000;
          }
        </style>
      </head>
      <body>
        ${docBody}
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + content], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${templateName.trim().replace(/\s+/g, '_')}_Albion_Resume_Template.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrintPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up blocked. Please enable pop-ups to open the Print Preview.');
      return;
    }

    const formattedSkills = templateSkills.split(',').map(s => s.trim()).filter(Boolean).join(', ');

    printWindow.document.write(`
      <html>
        <head>
          <title>${templateName} - Resume</title>
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
            .center {
              text-align: center;
            }
            .name {
              font-size: 16pt;
              font-weight: bold;
              text-transform: uppercase;
              margin: 0;
              padding: 0;
              letter-spacing: 0.5px;
            }
            .contact {
              font-size: 10pt;
              margin-top: 4px;
              margin-bottom: 12px;
            }
            .section-title {
              font-size: 11pt;
              font-weight: bold;
              text-transform: uppercase;
              border-bottom: 1px solid #000000;
              margin-top: 12px;
              margin-bottom: 6px;
              letter-spacing: 0.5px;
            }
            .table-row {
              width: 100%;
              margin-bottom: 2px;
            }
            .table-row td {
              font-size: 11pt;
              vertical-align: top;
            }
            .left {
              text-align: left;
            }
            .right {
              text-align: right;
            }
            ul {
              margin-top: 2px;
              margin-bottom: 4px;
              padding-left: 20px;
            }
            li {
              margin-bottom: 2px;
              text-align: justify;
            }
            p {
              margin: 0;
              margin-bottom: 4px;
            }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="name">${templateName}</div>
            <div class="contact">
              ${[templatePhone, templateEmail, templateLinkedin].filter(Boolean).join(' | ')}
            </div>
          </div>

          ${templateSummary ? `
            <div class="section-title">SUMMARY</div>
            <p style="text-align: justify;">${templateSummary}</p>
          ` : ''}

          <div class="section-title">EDUCATION</div>
          <table class="table-row" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td class="left" style="font-weight: bold;">${templateEducation}</td>
              <td class="right" style="font-weight: bold;">${templateExpectedGrad}</td>
            </tr>
            <tr>
              <td class="left" style="font-style: italic;">${templateMajorMinor}</td>
              <td class="right" style="font-weight: bold;">${templateGpa}</td>
            </tr>
          </table>

          ${templateActivities.length > 0 ? `
            <div class="section-title">CAMPUS ACTIVITIES AND AWARDS</div>
            ${templateActivities.map(act => `
              <table class="table-row" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td class="left" style="font-weight: bold;">${act.organization}</td>
                  <td class="right" style="font-weight: bold;">${act.dates}</td>
                </tr>
              </table>
              ${act.bullets.length > 0 ? `
                <ul>
                  ${act.bullets.map(b => `<li>${b}</li>`).join('')}
                </ul>
              ` : '<div style="margin-bottom: 4px;"></div>'}
            `).join('')}
          ` : ''}

          ${templateExperiences.length > 0 ? `
            <div class="section-title">EXPERIENCE</div>
            ${templateExperiences.map(exp => `
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
              ${exp.bullets.length > 0 ? `
                <ul>
                  ${exp.bullets.map(b => `<li>${b}</li>`).join('')}
                </ul>
              ` : '<div style="margin-bottom: 4px;"></div>'}
            `).join('')}
          ` : ''}

          ${formattedSkills ? `
            <div class="section-title">SKILLS</div>
            <p>${formattedSkills}</p>
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

  const handleConfirmTemplateBuild = () => {
    const workPoints: string[] = [];
    templateExperiences.forEach(exp => {
      workPoints.push(`${exp.company} (${exp.location}) - ${exp.role} (${exp.dates})`);
      exp.bullets.forEach(b => workPoints.push(b));
    });

    const leadPoints: string[] = [];
    templateActivities.forEach(act => {
      leadPoints.push(`${act.organization} ${act.dates ? `(${act.dates})` : ''}`);
      act.bullets.forEach(b => leadPoints.push(b));
    });

    const skillsArray = templateSkills.split(',').map(s => s.trim()).filter(Boolean);

    const resume: ResumeInfo = {
      name: templateName,
      phone: templatePhone,
      email: templateEmail,
      linkedin: templateLinkedin,
      summary: templateSummary,
      education: templateEducation,
      expectedGraduation: templateExpectedGrad,
      majorMinor: templateMajorMinor,
      gpa: templateGpa,
      skills: skillsArray,
      workExperience: workPoints,
      researchExperience: [],
      projects: [],
      leadership: leadPoints,
      certifications: [],
      isParsed: true,
      customExperiences: templateExperiences,
      customActivities: templateActivities,
    };

    onSaveResume(resume);
    setIsTemplateBuilderActive(false);
  };

  // States for LinkedIn Integration
  const [isConnectingLinkedin, setIsConnectingLinkedin] = useState(false);
  const [showLinkedinModal, setShowLinkedinModal] = useState(false);
  const [linkedinRedirectUri, setLinkedinRedirectUri] = useState('');
  const [simName, setSimName] = useState('');
  const [simEmail, setSimEmail] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);

  // Subscribe to LinkedIn callback messaging
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        return;
      }

      if (event.data?.type === 'LINKEDIN_AUTH_SUCCESS') {
        const info = event.data.resumeInfo;
        if (info) {
          onSaveResume(info);
          initEditStates(info);
          setIsEditing(true);
          setShowLinkedinModal(false);
        }
        setIsConnectingLinkedin(false);
      } else if (event.data?.type === 'LINKEDIN_AUTH_ERROR') {
        setErrorMsg(decodeURIComponent(event.data.error || 'LinkedIn connection failed.'));
        setIsConnectingLinkedin(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSaveResume]);

  const handleLinkedInConnect = async () => {
    setIsConnectingLinkedin(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/auth/linkedin/url?origin=${encodeURIComponent(window.location.origin)}`);
      if (!res.ok) {
        throw new Error('Failed to request LinkedIn auth configuration.');
      }
      const data = await res.json();
      setLinkedinRedirectUri(data.redirectUri || `${window.location.origin}/auth/linkedin/callback`);
      
      if (!data.isConfigured) {
        // Show credentials helper modal if credentials are missing in process.env
        setShowLinkedinModal(true);
        setIsConnectingLinkedin(false);
        return;
      }

      // Open OAuth provider url directly in popup as per constraints
      const width = 600;
      const height = 650;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      const authWindow = window.open(
        data.url,
        'linkedin_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!authWindow) {
        alert('Please allow popups for this site to verify and sync LinkedIn credentials.');
        setIsConnectingLinkedin(false);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to initialize LinkedIn connect.');
      setIsConnectingLinkedin(false);
    }
  };

  const handleLinkedInSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simName.trim()) return;

    setIsSimulating(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/linkedin/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: simName, email: simEmail || 'student@albion.edu' })
      });

      if (!res.ok) {
        throw new Error('Failed to simulate profile extraction.');
      }

      const data = await res.json();
      if (data.success && data.resumeInfo) {
        onSaveResume(data.resumeInfo);
        initEditStates(data.resumeInfo);
        setIsEditing(true);
        setShowLinkedinModal(false);
      } else {
        throw new Error('Simulation response invalid.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Simulation extraction failed.');
    } finally {
      setIsSimulating(false);
    }
  };

  const initEditStates = (info: ResumeInfo) => {
    setEditedName(info.name);
    setEditedEducation(info.education);
    setEditedMajor(info.majorMinor);
    setEditedSkills(info.skills);
    setEditedWork(info.workExperience);
    setEditedResearch(info.researchExperience);
    setEditedProjects(info.projects);
    setEditedLeadership(info.leadership);
    setEditedCerts(info.certifications);
  };

  const parseTextContent = async (text: string) => {
    setIsParsing(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/resume/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText: text }),
      });
      if (!response.ok) {
        throw new Error('Server returned error while parsing');
      }
      const data: ResumeInfo = await response.json();
      data.isParsed = true;
      onSaveResume(data);
      initEditStates(data);
      setIsEditing(true); // jump directly to form to let them correct details
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to automatically parse resume layout. Fallback profile created; please refine.');
      
      // Fallback with parsed structure
      const fallback: ResumeInfo = {
        name: 'Albion Student',
        education: 'Albion College',
        majorMinor: 'Economics / Communication',
        skills: ['Public Speaking', 'Critical Thinking', 'Business Writing'],
        workExperience: ['Campus Assistant at Albion College'],
        researchExperience: ['Research study draft details'],
        projects: ['Business Strategy Group Case study'],
        leadership: ['Albion Student Organization Representative'],
        certifications: ['Albion Leadership Pathways Completion'],
        isParsed: true,
      };
      onSaveResume(fallback);
      initEditStates(fallback);
      setIsEditing(true);
    } finally {
      setIsParsing(false);
    }
  };

  const handleAnalyzeAts = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!resumeInfo) return;

    setIsAnalyzingAts(true);
    setAtsAnalysisError(null);
    try {
      const response = await fetch('/api/resume/ats-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeInfo,
          targetRole: atsTargetRole.trim() || 'General Business / Internship Pathway'
        }),
      });

      if (!response.ok) {
        throw new Error('ATS Coach analysis service returned an error.');
      }

      const report = await response.json();
      setAtsReport(report);
    } catch (err: any) {
      console.error(err);
      setAtsAnalysisError(err?.message || 'Failed to analyze resume compatibility.');
    } finally {
      setIsAnalyzingAts(false);
    }
  };

  const handleExtractAndParse = async (file: File) => {
    setIsExtractingFile(true);
    setErrorMsg(null);

    try {
      let text = '';
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        text = await extractTextFromPdf(file);
      } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || file.name.toLowerCase().endsWith(".docx")) {
        text = await extractTextFromDocx(file);
      } else if (file.name.toLowerCase().endsWith(".doc")) {
        throw new Error("Legacy .doc format is unsupported. Please save your file as Word Document (.docx) or PDF and upload again.");
      } else {
        throw new Error("Compatible files include PDF (.pdf) or Microsoft Word (.docx).");
      }

      if (!text || !text.trim()) {
        throw new Error("No readable text could be extracted. Formats must be standard text layers, not flat scanned graphics/images.");
      }

      await parseTextContent(text);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to extract text from the file.");
    } finally {
      setIsExtractingFile(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleExtractAndParse(file);
  };

  const handleSaveFormChanges = () => {
    const updated: ResumeInfo = {
      name: editedName || 'Albion Student',
      education: editedEducation || 'Albion College',
      majorMinor: editedMajor || 'Undergraduate Minor',
      skills: editedSkills,
      workExperience: editedWork,
      researchExperience: editedResearch,
      projects: editedProjects,
      leadership: editedLeadership,
      certifications: editedCerts,
      isParsed: true,
    };
    onSaveResume(updated);
    setIsEditing(false);
  };

  const removeListItem = (setter: React.Dispatch<React.SetStateAction<string[]>>, list: string[], idx: number) => {
    setter(list.filter((_, i) => i !== idx));
  };

  const addListItem = (setter: React.Dispatch<React.SetStateAction<string[]>>, list: string[], val: string, valSetter: (v: string) => void) => {
    if (!val.trim()) return;
    setter([...list, val.trim()]);
    valSetter('');
  };

  if (isEnhancerActive) {
    return (
      <ResumeEnhancer
        onSaveAndClose={(polishedResume) => {
          onSaveResume(polishedResume);
          setIsEnhancerActive(false);
        }}
        onBack={() => setIsEnhancerActive(false)}
        currentResume={resumeInfo}
      />
    );
  }

  return (
    <div className="space-y-8" id="resume-container">
      {/* Intro Header */}
      <div className="glass-card-deep p-6 sm:p-8 rounded-[32px] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <span className="text-xs font-mono tracking-widest text-albion-gold font-bold uppercase block">
            Phase 1 of 2: Candidate Resume Setup
          </span>
          <h2 className="text-2xl font-bold text-albion-purple-dark flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-albion-purple" />
            Your Academic & Professional Profile
          </h2>
          <p className="text-gray-500 text-sm max-w-2xl leading-relaxed">
            By uploading or describing your background, the AI Interview Coach can craft hyper-targeted interview inquiries specific to your actual research, lab projects, work experiences, and campus roles inside the Brit interview canvas.
          </p>
        </div>
        
        {resumeInfo?.isParsed && !isEditing && (
          <button
            onClick={() => {
              if (resumeInfo) initEditStates(resumeInfo);
              setIsEditing(true);
            }}
            className="flex items-center space-x-2 bg-purple-50 hover:bg-purple-100 text-albion-purple-dark text-sm px-4 py-2 rounded-xl transition duration-200 border border-purple-200 cursor-pointer"
            id="btn-edit-parsed-resume"
          >
            <Edit3 className="w-4 h-4 text-albion-purple" />
            <span>Refine Credentials</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm border border-red-100 flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Container */}
      {isToolsHubActive ? (
        <ResumeToolsHub
          onSelectEnhancer={() => {
            setIsToolsHubActive(false);
            setIsEnhancerActive(true);
          }}
          onSelectBuilder={() => {
            setIsToolsHubActive(false);
            if (resumeInfo) initTemplateBuilderStates(resumeInfo);
            setIsTemplateBuilderActive(true);
          }}
          onBack={() => setIsToolsHubActive(false)}
        />
      ) : isEnhancerActive ? (
        <ResumeEnhancer
          onSaveAndClose={(polishedResume) => {
            onSaveResume(polishedResume);
            setIsEnhancerActive(false);
          }}
          onBack={() => setIsEnhancerActive(false)}
          currentResume={resumeInfo}
        />
      ) : isTemplateBuilderActive ? (
        <div className="space-y-6 animate-fade-in pb-12">
          {/* Header Controls */}
          <div className="glass-card p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 border border-purple-150">
            <div className="flex items-center gap-2.5">
              <div className="bg-purple-100 p-2 rounded-xl text-albion-purple">
                <Sparkles className="w-5 h-5 animate-pulse text-albion-gold" />
              </div>
              <div>
                <h3 className="font-display font-bold text-sm text-gray-800">
                  Interactive Albion Resume Builder
                </h3>
                <p className="text-[11px] text-gray-400">
                  Type your credentials on the left; the high-fidelity template on the right updates instantly!
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
              <button
                type="button"
                onClick={handleConfirmTemplateBuild}
                className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1 cursor-pointer transition shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Save as Coach Profile</span>
              </button>
              <button
                type="button"
                onClick={handleExportWord}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1 cursor-pointer transition shadow-sm"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Download Word (.doc)</span>
              </button>
              <button
                type="button"
                onClick={handlePrintPDF}
                className="bg-albion-purple hover:bg-[#341b50] text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1 cursor-pointer transition shadow-sm"
              >
                <Printer className="w-3.5 h-3.5 text-albion-gold" />
                <span>Print / Save PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setIsTemplateBuilderActive(false)}
                className="border border-gray-200 text-gray-500 hover:bg-gray-50 px-4 py-2 rounded-xl text-xs transition cursor-pointer"
              >
                Exit Builder
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Left Inputs Panel */}
            <div className="xl:col-span-5 space-y-6 max-h-[75vh] overflow-y-auto pr-2">
              
              {/* Contact Information */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3 shadow-sm">
                <h4 className="font-bold text-xs text-albion-purple-dark uppercase tracking-wider border-b border-gray-100 pb-1.5">
                  1. Contact Coordinates
                </h4>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Full Name</label>
                    <input
                      type="text"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-200 outline-none focus:border-albion-purple bg-gray-50/40"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Phone</label>
                      <input
                        type="text"
                        value={templatePhone}
                        onChange={(e) => setTemplatePhone(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-200 outline-none focus:border-albion-purple bg-gray-50/40"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Email</label>
                      <input
                        type="email"
                        value={templateEmail}
                        onChange={(e) => setTemplateEmail(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-200 outline-none focus:border-albion-purple bg-gray-50/40"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">LinkedIn URL</label>
                    <input
                      type="text"
                      value={templateLinkedin}
                      onChange={(e) => setTemplateLinkedin(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-200 outline-none focus:border-albion-purple bg-gray-50/40"
                    />
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3 shadow-sm">
                <h4 className="font-bold text-xs text-albion-purple-dark uppercase tracking-wider border-b border-gray-100 pb-1.5">
                  2. Summary Profile
                </h4>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Brief Statement</label>
                  <textarea
                    rows={4}
                    value={templateSummary}
                    onChange={(e) => setTemplateSummary(e.target.value)}
                    placeholder="Brief objective summary showcasing your academic drive and core competencies..."
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-200 outline-none focus:border-albion-purple bg-gray-50/40 resize-y"
                  />
                </div>
              </div>

              {/* Education */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3 shadow-sm">
                <h4 className="font-bold text-xs text-albion-purple-dark uppercase tracking-wider border-b border-gray-100 pb-1.5">
                  3. Education Background
                </h4>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">College/University</label>
                      <input
                        type="text"
                        value={templateEducation}
                        onChange={(e) => setTemplateEducation(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-200 outline-none focus:border-albion-purple bg-gray-50/40"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Graduation Date</label>
                      <input
                        type="text"
                        value={templateExpectedGrad}
                        onChange={(e) => setTemplateExpectedGrad(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-200 outline-none focus:border-albion-purple bg-gray-50/40"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Degree / Major & Minor</label>
                      <input
                        type="text"
                        value={templateMajorMinor}
                        onChange={(e) => setTemplateMajorMinor(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-200 outline-none focus:border-albion-purple bg-gray-50/40"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">GPA details</label>
                      <input
                        type="text"
                        value={templateGpa}
                        onChange={(e) => setTemplateGpa(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-200 outline-none focus:border-albion-purple bg-gray-50/40"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Campus Activities */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4 shadow-sm">
                <h4 className="font-bold text-xs text-albion-purple-dark uppercase tracking-wider border-b border-gray-100 pb-1.5">
                  4. Campus Activities & Awards
                </h4>
                <div className="space-y-4">
                  {templateActivities.map((act, actIdx) => (
                    <div key={actIdx} className="p-3 bg-gray-50/50 rounded-xl border border-gray-200/60 space-y-2 relative">
                      <button
                        type="button"
                        onClick={() => setTemplateActivities(templateActivities.filter((_, i) => i !== actIdx))}
                        className="absolute top-2 right-2 text-red-500 hover:text-red-700 text-xs font-bold font-mono"
                      >
                        &times;
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 uppercase">Title / Organization</label>
                          <input
                            type="text"
                            value={act.organization}
                            onChange={(e) => {
                              const next = [...templateActivities];
                              next[actIdx].organization = e.target.value;
                              setTemplateActivities(next);
                            }}
                            className="w-full px-2.5 py-1 text-xs rounded border bg-white outline-none focus:border-albion-purple"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 uppercase">Dates</label>
                          <input
                            type="text"
                            value={act.dates}
                            onChange={(e) => {
                              const next = [...templateActivities];
                              next[actIdx].dates = e.target.value;
                              setTemplateActivities(next);
                            }}
                            className="w-full px-2.5 py-1 text-xs rounded border bg-white outline-none focus:border-albion-purple"
                          />
                        </div>
                      </div>
                      
                      {/* Activity Bullets */}
                      <div className="space-y-1 mt-1.5">
                        <label className="text-[9px] font-bold text-gray-400 uppercase block">Activity Bullets</label>
                        {act.bullets.map((bullet, bIdx) => (
                          <div key={bIdx} className="flex gap-1 items-center">
                            <span className="text-gray-400 text-xs font-bold">•</span>
                            <input
                              type="text"
                              value={bullet}
                              onChange={(e) => {
                                const next = [...templateActivities];
                                next[actIdx].bullets[bIdx] = e.target.value;
                                setTemplateActivities(next);
                              }}
                              className="flex-1 px-2 py-1 text-xs rounded border bg-white outline-none focus:border-albion-purple"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...templateActivities];
                                next[actIdx].bullets = next[actIdx].bullets.filter((_, i) => i !== bIdx);
                                setTemplateActivities(next);
                              }}
                              className="text-red-400 hover:text-red-600 font-bold text-xs"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...templateActivities];
                            next[actIdx].bullets.push('New activity description details...');
                            setTemplateActivities(next);
                          }}
                          className="text-[9px] text-albion-purple hover:underline font-bold"
                        >
                          + Add Bullet Description
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setTemplateActivities([...templateActivities, { organization: 'Activity / Award Name', dates: 'Dates', bullets: ['Key active member responsibility'] }])}
                    className="w-full py-2 border border-dashed border-purple-200 text-albion-purple hover:bg-purple-50 text-xs font-bold rounded-xl transition"
                  >
                    + Add Campus Activity or Honor
                  </button>
                </div>
              </div>

              {/* Experience */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4 shadow-sm">
                <h4 className="font-bold text-xs text-albion-purple-dark uppercase tracking-wider border-b border-gray-100 pb-1.5">
                  5. Experience Details
                </h4>
                <div className="space-y-4">
                  {templateExperiences.map((exp, expIdx) => (
                    <div key={expIdx} className="p-3 bg-gray-50/50 rounded-xl border border-gray-200/60 space-y-2 relative">
                      <button
                        type="button"
                        onClick={() => setTemplateExperiences(templateExperiences.filter((_, i) => i !== expIdx))}
                        className="absolute top-2 right-2 text-red-500 hover:text-red-700 text-xs font-bold font-mono"
                      >
                        &times;
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 uppercase">Company Name</label>
                          <input
                            type="text"
                            value={exp.company}
                            onChange={(e) => {
                              const next = [...templateExperiences];
                              next[expIdx].company = e.target.value;
                              setTemplateExperiences(next);
                            }}
                            className="w-full px-2.5 py-1 text-xs rounded border bg-white outline-none focus:border-albion-purple"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 uppercase">Location (City, State)</label>
                          <input
                            type="text"
                            value={exp.location}
                            onChange={(e) => {
                              const next = [...templateExperiences];
                              next[expIdx].location = e.target.value;
                              setTemplateExperiences(next);
                            }}
                            className="w-full px-2.5 py-1 text-xs rounded border bg-white outline-none focus:border-albion-purple"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 uppercase">Job / Intern Title</label>
                          <input
                            type="text"
                            value={exp.role}
                            onChange={(e) => {
                              const next = [...templateExperiences];
                              next[expIdx].role = e.target.value;
                              setTemplateExperiences(next);
                            }}
                            className="w-full px-2.5 py-1 text-xs rounded border bg-white outline-none focus:border-albion-purple"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 uppercase">Employment Dates</label>
                          <input
                            type="text"
                            value={exp.dates}
                            onChange={(e) => {
                              const next = [...templateExperiences];
                              next[expIdx].dates = e.target.value;
                              setTemplateExperiences(next);
                            }}
                            className="w-full px-2.5 py-1 text-xs rounded border bg-white outline-none focus:border-albion-purple"
                          />
                        </div>
                      </div>
                      
                      {/* Bullets List */}
                      <div className="space-y-1 mt-1.5">
                        <label className="text-[9px] font-bold text-gray-400 uppercase block">Achievements / Contributions</label>
                        {exp.bullets.map((bullet, bIdx) => (
                          <div key={bIdx} className="flex gap-1 items-center">
                            <span className="text-gray-400 text-xs font-bold">•</span>
                            <input
                              type="text"
                              value={bullet}
                              onChange={(e) => {
                                const next = [...templateExperiences];
                                next[expIdx].bullets[bIdx] = e.target.value;
                                setTemplateExperiences(next);
                              }}
                              className="flex-1 px-2 py-1 text-xs rounded border bg-white outline-none focus:border-albion-purple"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...templateExperiences];
                                next[expIdx].bullets = next[expIdx].bullets.filter((_, i) => i !== bIdx);
                                setTemplateExperiences(next);
                              }}
                              className="text-red-400 hover:text-red-600 font-bold text-xs"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...templateExperiences];
                            next[expIdx].bullets.push('Describe high-impact contribution with performance metrics...');
                            setTemplateExperiences(next);
                          }}
                          className="text-[9px] text-albion-purple hover:underline font-bold"
                        >
                          + Add Contribution Bullet
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setTemplateExperiences([...templateExperiences, { company: 'Company Name', location: 'City, State', role: 'Role Title', dates: 'Dates', bullets: ['Key contribution details with metrics'] }])}
                    className="w-full py-2 border border-dashed border-purple-200 text-albion-purple hover:bg-purple-50 text-xs font-bold rounded-xl transition"
                  >
                    + Add Job or Intern Experience
                  </button>
                </div>
              </div>

              {/* Skills */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3 shadow-sm">
                <h4 className="font-bold text-xs text-albion-purple-dark uppercase tracking-wider border-b border-gray-100 pb-1.5">
                  6. Technical & Soft Skills
                </h4>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">List of Skills (Comma separated)</label>
                  <textarea
                    rows={3}
                    value={templateSkills}
                    onChange={(e) => setTemplateSkills(e.target.value)}
                    placeholder="e.g. Microsoft Word, Microsoft Excel, Microsoft PowerPoint, Photoshop, HTML..."
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-200 outline-none focus:border-albion-purple bg-gray-50/40 resize-y"
                  />
                </div>
              </div>

            </div>

            {/* Right Live Preview Panel */}
            <div className="xl:col-span-7 bg-slate-100/70 p-4 sm:p-6 rounded-3xl border border-gray-200 overflow-x-auto shadow-inner flex justify-center">
              <div
                id="printable-resume-area"
                className="w-full bg-white text-black p-10 sm:p-12 border border-gray-300 shadow-xl rounded-sm select-text text-left max-w-[210mm] min-h-[297mm] font-serif"
                style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: '10.5pt', lineHeight: '1.25' }}
              >
                {/* Name */}
                <div className="text-center">
                  <h1 className="font-bold uppercase tracking-wide m-0" style={{ fontSize: '15pt' }}>
                    {templateName || 'Student Name'}
                  </h1>
                  <div className="mt-1" style={{ fontSize: '10pt', color: '#111' }}>
                    {[templatePhone, templateEmail, templateLinkedin].filter(Boolean).join(' | ')}
                  </div>
                </div>

                {/* Summary */}
                {templateSummary && (
                  <div className="mt-4">
                    <h2 className="font-bold uppercase tracking-wider border-b border-black pb-0.5 m-0 mb-1.5" style={{ fontSize: '10.5pt' }}>
                      SUMMARY
                    </h2>
                    <p className="text-justify m-0 leading-relaxed font-serif" style={{ fontSize: '10.5pt' }}>
                      {templateSummary}
                    </p>
                  </div>
                )}

                {/* Education */}
                <div className="mt-4">
                  <h2 className="font-bold uppercase tracking-wider border-b border-black pb-0.5 m-0 mb-1.5" style={{ fontSize: '10.5pt' }}>
                    EDUCATION
                  </h2>
                  <table className="w-full border-0 border-collapse m-0" style={{ fontSize: '10.5pt' }}>
                    <tbody>
                      <tr>
                        <td style={{ textAlign: 'left', fontWeight: 'bold' }}>{templateEducation}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{templateExpectedGrad}</td>
                      </tr>
                      <tr>
                        <td style={{ textAlign: 'left', fontStyle: 'italic' }}>{templateMajorMinor}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{templateGpa}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Campus Activities */}
                {templateActivities.length > 0 && (
                  <div className="mt-4">
                    <h2 className="font-bold uppercase tracking-wider border-b border-black pb-0.5 m-0 mb-1.5" style={{ fontSize: '10.5pt' }}>
                      CAMPUS ACTIVITIES AND AWARDS
                    </h2>
                    {templateActivities.map((act, actIdx) => (
                      <div key={actIdx} className="mb-2">
                        <table className="w-full border-0 border-collapse m-0" style={{ fontSize: '10.5pt' }}>
                          <tbody>
                            <tr>
                              <td style={{ textAlign: 'left', fontWeight: 'bold' }}>{act.organization}</td>
                              <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{act.dates}</td>
                            </tr>
                          </tbody>
                        </table>
                        {act.bullets.length > 0 ? (
                          <ul className="list-disc pl-5 mt-0.5 space-y-0.5" style={{ fontSize: '10.5pt' }}>
                            {act.bullets.map((b, bIdx) => (
                              <li key={bIdx} className="text-justify leading-relaxed font-serif">
                                {b}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="h-1"></div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Experience */}
                {templateExperiences.length > 0 && (
                  <div className="mt-4">
                    <h2 className="font-bold uppercase tracking-wider border-b border-black pb-0.5 m-0 mb-1.5" style={{ fontSize: '10.5pt' }}>
                      EXPERIENCE
                    </h2>
                    {templateExperiences.map((exp, expIdx) => (
                      <div key={expIdx} className="mb-3">
                        <table className="w-full border-0 border-collapse m-0 font-serif" style={{ fontSize: '10.5pt' }}>
                          <tbody>
                            <tr>
                              <td style={{ textAlign: 'left', fontWeight: 'bold' }}>{exp.company}</td>
                              <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{exp.location}</td>
                            </tr>
                            <tr>
                              <td style={{ textAlign: 'left', fontWeight: 'bold', fontStyle: 'italic' }}>{exp.role}</td>
                              <td style={{ textAlign: 'right', fontStyle: 'italic' }}>{exp.dates}</td>
                            </tr>
                          </tbody>
                        </table>
                        {exp.bullets.length > 0 && (
                          <ul className="list-disc pl-5 mt-0.5 space-y-0.5 font-serif" style={{ fontSize: '10.5pt' }}>
                            {exp.bullets.map((b, bIdx) => (
                              <li key={bIdx} className="text-justify leading-relaxed font-serif">
                                {b}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Skills */}
                {templateSkills && (
                  <div className="mt-4">
                    <h2 className="font-bold uppercase tracking-wider border-b border-black pb-0.5 m-0 mb-1.5" style={{ fontSize: '10.5pt' }}>
                      SKILLS
                    </h2>
                    <p className="text-justify m-0 leading-relaxed font-serif" style={{ fontSize: '10.5pt' }}>
                      {templateSkills.split(',').map(s => s.trim()).filter(Boolean).join(', ')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : !resumeInfo?.isParsed && !isEditing ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Option A: Premium Dynamic File Drop & Upload Zone */}
          <div className="lg:col-span-5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  await handleExtractAndParse(file);
                }
              }}
              className={`relative border-2 border-dashed rounded-[28px] p-6 text-center flex flex-col items-center justify-center min-h-[380px] transition-all duration-300 ${
                isDragging
                  ? 'border-albion-purple bg-purple-50/40 scale-[1.01] shadow-md'
                  : 'border-purple-200 bg-white hover:bg-gray-50/50 hover:border-albion-gold'
              }`}
            >
              {/* Overlay loader when processing */}
              {(isExtractingFile || isParsing) && (
                <div className="absolute inset-0 bg-white/90 rounded-[28px] flex flex-col items-center justify-center p-6 space-y-4 z-10 animate-fade-in">
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-purple-100 border-t-albion-purple rounded-full animate-spin"></div>
                    <FileText className="w-6 h-6 text-albion-purple absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <div className="space-y-1 text-center">
                    <h4 className="font-bold text-gray-800">
                      {isExtractingFile ? 'Extracting Resume Text...' : 'Analyzing & Parsing Details...'}
                    </h4>
                    <p className="text-xs text-gray-500 max-w-sm">
                      {isExtractingFile 
                        ? 'Retrieving structures and semantic fields from file streams.'
                        : 'Mapping education, thesis milestones, and work achievements to Albion core competencies.'
                      }
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-6 max-w-sm">
                <div className="w-16 h-16 bg-purple-100/50 rounded-full flex items-center justify-center text-albion-purple mx-auto">
                  <UploadCloud className="w-8 h-8" />
                </div>
                
                <div className="space-y-2">
                  <h3 className="font-display font-bold text-base text-gray-800">
                    Upload PDF or Word Resume
                  </h3>
                  <p className="text-xs text-gray-500">
                    Drag and drop file here, or click browse
                  </p>
                  <p className="text-[10px] text-gray-400 font-mono">
                    Supported: .pdf, .docx
                  </p>
                </div>

                <div>
                  <label className="inline-flex items-center space-x-2 bg-albion-purple hover:bg-albion-purple-light text-white font-bold px-5 py-2.5 rounded-xl shadow-sm text-xs cursor-pointer transition">
                    <span>Choose File</span>
                    <input
                      type="file"
                      accept=".pdf,.docx"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={isExtractingFile || isParsing}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Option B: Connect to LinkedIn */}
          <div className="lg:col-span-4 glass-card-deep rounded-[28px] p-6 flex flex-col justify-between space-y-6 relative overflow-hidden min-h-[380px]">
            {isConnectingLinkedin && (
              <div className="absolute inset-0 bg-white/95 rounded-[28px] flex flex-col items-center justify-center p-6 space-y-4 z-10 animate-fade-in">
                <div className="relative">
                  <div className="w-12 h-12 border-4 border-purple-100 border-t-albion-purple rounded-full animate-spin"></div>
                  <Linkedin className="w-5 h-5 text-albion-purple absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div className="space-y-1 text-center">
                  <h4 className="font-bold text-gray-800 text-sm">
                    Connecting to LinkedIn...
                  </h4>
                  <p className="text-[10px] text-gray-500 max-w-xs">
                    Please approve permissions in the popup to authorize resume generation.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="bg-[#0077B5]/10 h-10 w-10 rounded-xl flex items-center justify-center text-[#0077B5]">
                <Linkedin className="w-6 h-6" />
              </div>
              <h3 className="font-display font-bold text-base text-gray-800 leading-tight">
                Import from LinkedIn
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Connect your LinkedIn.com profile to instantly extract your professional credentials, verified name, and accomplishments to bootstrap your coach!
              </p>
            </div>

            <button
              id="btn-connect-linkedin"
              onClick={handleLinkedInConnect}
              className="w-full bg-[#0077B5] hover:bg-[#005a8b] text-white font-bold py-3 rounded-xl text-center text-sm transition duration-150 cursor-pointer shadow-sm flex items-center justify-center gap-2"
            >
              <Linkedin className="w-4 h-4 text-white" />
              <span>Connect LinkedIn</span>
            </button>
          </div>

          {/* Option C: Continue without Resume */}
          <div className="lg:col-span-3 glass-card-deep rounded-[28px] p-6 flex flex-col justify-between space-y-6 min-h-[380px]">
            <div className="space-y-4">
              <div className="bg-albion-purple/10 h-10 w-10 rounded-xl flex items-center justify-center text-albion-purple">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-display font-bold text-base text-gray-800 leading-tight">
                No Resume Ready?
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                No problem, Albion! Instantly build a new CV, or launch our interactive Conversational Enhancer to optimize any existing text or draft.
              </p>
            </div>

            <button
              id="btn-resume-tools-suite"
              onClick={() => setIsToolsHubActive(true)}
              className="w-full bg-albion-purple hover:bg-[#341b50] text-white font-bold py-3 rounded-xl text-center text-xs transition duration-150 cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-4 h-4 text-albion-gold animate-pulse" />
              <span>Interactive Resume Tools</span>
            </button>
          </div>
        </div>
      ) : isEditing ? (
        // Form Layout (Manual Editing)
        <div className="glass-card rounded-[32px] p-6 sm:p-8 space-y-8 animate-fade-in">
          <div className="border-b border-gray-100 pb-4 flex items-center justify-between">
            <h3 className="font-display font-bold text-lg text-albion-purple-dark">
              Verify and Edit Extracted Information
            </h3>
            <span className="bg-green-50 text-green-700 text-xs px-2.5 py-1 rounded-full border border-green-100 font-medium font-mono">
              Successfully Extracted
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left side standard inputs */}
            <div className="space-y-5">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Full Name
                </label>
                <input
                  id="resume-edit-name"
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="w-full px-4 py-2 text-sm rounded-xl border border-purple-100 focus:border-albion-purple focus:ring-1 focus:ring-albion-purple outline-none bg-gray-5/50 font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Education Details
                </label>
                <input
                  id="resume-edit-education"
                  type="text"
                  value={editedEducation}
                  onChange={(e) => setEditedEducation(e.target.value)}
                  className="w-full px-4 py-2 text-sm rounded-xl border border-purple-100 focus:border-albion-purple focus:ring-1 focus:ring-albion-purple outline-none bg-gray-5/50 font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Major / Minor Concentrations
                </label>
                <input
                  id="resume-edit-major"
                  type="text"
                  value={editedMajor}
                  onChange={(e) => setEditedMajor(e.target.value)}
                  className="w-full px-4 py-2 text-sm rounded-xl border border-purple-100 focus:border-albion-purple focus:ring-1 focus:ring-albion-purple outline-none bg-gray-5/50 font-medium"
                />
              </div>

              {/* Skills section */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                  Key Skills & Capabilities ({editedSkills.length})
                </label>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {editedSkills.map((sk, index) => (
                    <span key={index} className="bg-purple-50 text-albion-purple text-xs px-2.5 py-1 rounded-lg border border-purple-200/50 flex items-center space-x-1.5">
                      <span>{sk}</span>
                      <button 
                        type="button" 
                        onClick={() => removeListItem(setEditedSkills, editedSkills, index)}
                        className="hover:text-red-600 font-bold font-mono ml-1 text-[10px]"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    placeholder="Add manual skill (e.g. D3.js)"
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-purple-100 outline-none focus:border-albion-purple text-gray-600"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addListItem(setEditedSkills, editedSkills, newSkill, setNewSkill);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => addListItem(setEditedSkills, editedSkills, newSkill, setNewSkill)}
                    className="bg-purple-100 hover:bg-purple-200 text-albion-purple p-2 rounded-lg cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Right side lists */}
            <div className="space-y-6">
              {/* Work Bullet points */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2 flex items-center justify-between">
                  <span>Work & Professional Experience</span>
                  <span className="text-[10px] text-gray-400 capitalize">Bulleted Achievements</span>
                </label>
                <div className="space-y-1.5 mb-3 max-h-44 overflow-y-auto pr-1">
                  {editedWork.map((item, index) => (
                    <div key={index} className="flex justify-between items-start gap-2 bg-gray-50/70 p-2 rounded-lg border border-gray-150">
                      <p className="text-xs text-gray-700 leading-tight">{item}</p>
                      <button 
                        type="button"
                        onClick={() => removeListItem(setEditedWork, editedWork, index)}
                        className="text-gray-400 hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newWork}
                    onChange={(e) => setNewWork(e.target.value)}
                    placeholder="Describe job and achievements..."
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-purple-100 outline-none focus:border-albion-purple"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addListItem(setEditedWork, editedWork, newWork, setNewWork);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => addListItem(setEditedWork, editedWork, newWork, setNewWork)}
                    className="bg-purple-100 text-albion-purple p-2 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Research bullets */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                  Lab & Research Projects
                </label>
                <div className="space-y-1.5 mb-3 max-h-44 overflow-y-auto pr-1">
                  {editedResearch.map((item, index) => (
                    <div key={index} className="flex justify-between items-start gap-2 bg-gray-50/70 p-2 rounded-lg border border-gray-150">
                      <p className="text-xs text-gray-700 leading-tight">{item}</p>
                      <button 
                        type="button"
                        onClick={() => removeListItem(setEditedResearch, editedResearch, index)}
                        className="text-gray-400 hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newResearch}
                    onChange={(e) => setNewResearch(e.target.value)}
                    placeholder="Add lab, thesis, or directed studies..."
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-purple-100 outline-none focus:border-albion-purple"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addListItem(setEditedResearch, editedResearch, newResearch, setNewResearch);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => addListItem(setEditedResearch, editedResearch, newResearch, setNewResearch)}
                    className="bg-purple-100 text-albion-purple p-2 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sub Categories block */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-gray-100">
            {/* Leadership */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                Clubs, Sports & Leadership
              </label>
              <div className="space-y-1 my-2 max-h-36 overflow-y-auto pr-1">
                {editedLeadership.map((item, index) => (
                  <div key={index} className="flex justify-between items-start bg-gray-50/50 p-1.5 rounded text-xs gap-1">
                    <span className="truncate text-gray-600">{item}</span>
                    <button type="button" onClick={() => removeListItem(setEditedLeadership, editedLeadership, index)} className="text-red-400 hover:text-red-600">×</button>
                  </div>
                ))}
              </div>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newLead}
                  onChange={(e) => setNewLead(e.target.value)}
                  placeholder="Club position..."
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-purple-100 outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addListItem(setEditedLeadership, editedLeadership, newLead, setNewLead);
                    }
                  }}
                />
                <button type="button" onClick={() => addListItem(setEditedLeadership, editedLeadership, newLead, setNewLead)} className="bg-purple-100 text-albion-purple p-2 rounded-lg">+</button>
              </div>
            </div>

            {/* Projects */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                Coursework Projects
              </label>
              <div className="space-y-1 my-2 max-h-36 overflow-y-auto pr-1">
                {editedProjects.map((item, index) => (
                  <div key={index} className="flex justify-between items-start bg-gray-50/50 p-1.5 rounded text-xs gap-1">
                    <span className="truncate text-gray-600">{item}</span>
                    <button type="button" onClick={() => removeListItem(setEditedProjects, editedProjects, index)} className="text-red-400 hover:text-red-600">×</button>
                  </div>
                ))}
              </div>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newProject}
                  onChange={(e) => setNewProject(e.target.value)}
                  placeholder="In-class challenge..."
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-purple-100 outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addListItem(setEditedProjects, editedProjects, newProject, setNewProject);
                    }
                  }}
                />
                <button type="button" onClick={() => addListItem(setEditedProjects, editedProjects, newProject, setNewProject)} className="bg-purple-100 text-albion-purple p-2 rounded-lg">+</button>
              </div>
            </div>

            {/* Certifications and Honors */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                Honors & Certifications
              </label>
              <div className="space-y-1 my-2 max-h-36 overflow-y-auto pr-1">
                {editedCerts.map((item, index) => (
                  <div key={index} className="flex justify-between items-start bg-gray-50/50 p-1.5 rounded text-xs gap-1">
                    <span className="truncate text-gray-600">{item}</span>
                    <button type="button" onClick={() => removeListItem(setEditedCerts, editedCerts, index)} className="text-red-400 hover:text-red-600">×</button>
                  </div>
                ))}
              </div>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newCert}
                  onChange={(e) => setNewCert(e.target.value)}
                  placeholder="Dean's List / Pathway..."
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-purple-100 outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addListItem(setEditedCerts, editedCerts, newCert, setNewCert);
                    }
                  }}
                />
                <button type="button" onClick={() => addListItem(setEditedCerts, editedCerts, newCert, setNewCert)} className="bg-purple-100 text-albion-purple p-2 rounded-lg">+</button>
              </div>
            </div>
          </div>

          {/* Action Control Panel */}
          <div className="border-t border-gray-100 pt-6 flex items-center justify-between gap-4">
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-600 transition"
              id="btn-resume-cancel"
            >
              Back to Overview
            </button>

            <button
              id="btn-resume-save"
              onClick={handleSaveFormChanges}
              className="bg-albion-purple hover:bg-albion-purple-light text-white font-bold px-6 py-2.5 rounded-xl shadow-md transition duration-200 cursor-pointer flex items-center space-x-2"
            >
              <CheckCircle2 className="w-4 h-4 text-albion-gold-light" />
              <span>Confirm & Lock Credentials</span>
            </button>
          </div>
        </div>
      ) : (
        // Extracted Display Card (Read state)
        <div className="space-y-6">
          {/* Mock Interview Prompt Quick Launch Banner */}
          {onStartMockInterview && (
            <div className="bg-gradient-to-r from-albion-purple to-albion-purple-dark text-white rounded-[24px] p-5 sm:p-6 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-purple-300/10 animate-fade-in">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="bg-albion-gold text-albion-purple-dark text-[10px] font-black uppercase px-2 py-0.5 rounded-full font-mono">
                    Ready to practice?
                  </span>
                  <Sparkles className="w-4 h-4 text-albion-gold animate-pulse" />
                </div>
                <h3 className="font-display font-bold text-base text-white">
                  Launch Interactive Mock Interview
                </h3>
                <p className="text-xs text-purple-100 max-w-xl">
                  Ready to test your credentials? Instantly launch a structured behavioral mock interview with our AI coach, customized specifically around your uploaded resume history and desired targets.
                </p>
              </div>
              <button
                id="btn-resume-start-mock"
                onClick={onStartMockInterview}
                className="w-full sm:w-auto bg-albion-gold hover:bg-albion-gold-light text-albion-purple-dark font-black py-3 px-6 rounded-xl text-xs transition duration-150 cursor-pointer shadow-md flex items-center justify-center gap-1.5 shrink-0 animate-pulse hover:animate-none"
              >
                <span>Start Mock Interview</span>
                <Send className="w-3.5 h-3.5 text-albion-purple-dark" />
              </button>
            </div>
          )}

          {/* Sub-Tab Navigation Bar */}
          <div className="flex border-b border-gray-150 gap-2">
            <button
              id="tab-resume-profile"
              onClick={() => setActiveResumeSubTab('profile')}
              className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 px-4 transition-all ${
                activeResumeSubTab === 'profile'
                  ? 'border-albion-purple text-albion-purple'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              Extracted Profile
            </button>
            <button
              id="tab-resume-coach"
              onClick={() => {
                setActiveResumeSubTab('ats-coach');
                if (!atsReport && atsTargetRole === '') {
                  setAtsTargetRole(resumeInfo.majorMinor || 'General Business');
                }
              }}
              className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 px-4 transition-all flex items-center gap-1.5 ${
                activeResumeSubTab === 'ats-coach'
                  ? 'border-albion-purple text-albion-purple'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <Award className="w-3.5 h-3.5 animate-bounce" />
              <span>ATS Resume Coach</span>
            </button>
          </div>

          {activeResumeSubTab === 'profile' ? (
            <div className="glass-card-deep rounded-[32px] p-6 sm:p-8 space-y-6 animate-fade-in">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-gray-150 gap-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{resumeInfo.name}</h2>
                  <div className="flex items-center space-x-2 text-xs text-albion-purple mt-1 font-mono">
                    <span>{resumeInfo.education}</span>
                    <span>•</span>
                    <span>{resumeInfo.majorMinor}</span>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-3 w-full sm:w-auto items-center">
                  <button
                    onClick={() => setIsToolsHubActive(true)}
                    className="w-full sm:w-auto text-center border border-emerald-600 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-albion-gold animate-pulse" />
                    <span>Interactive Resume Tools</span>
                  </button>
                  <button
                    onClick={() => {
                      initEditStates(resumeInfo);
                      setIsEditing(true);
                    }}
                    className="w-full sm:w-auto text-center border border-purple-150 bg-purple-50 text-albion-purple px-4 py-2 text-xs font-bold rounded-xl hover:bg-purple-100 transition"
                  >
                    Modify details
                  </button>
                  <button
                    onClick={() => {
                      const empty: ResumeInfo = {
                        name: '',
                        education: '',
                        majorMinor: '',
                        skills: [],
                        workExperience: [],
                        researchExperience: [],
                        projects: [],
                        leadership: [],
                        certifications: [],
                      };
                      onSaveResume(empty);
                      setIsEditing(false);
                    }}
                    className="text-xs font-semibold px-2 py-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                  >
                    Clear Profile
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left side list */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">My Top Capabilities</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {resumeInfo.skills.map((s, i) => (
                        <span key={i} className="bg-gray-50 border border-gray-200/60 text-gray-700 text-xs px-2.5 py-1 rounded-lg">
                          {s}
                        </span>
                      ))}
                      {resumeInfo.skills.length === 0 && <span className="text-xs italic text-gray-400">None declared</span>}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Work History</h4>
                    <ul className="space-y-2 text-xs text-gray-600 block pl-4 list-disc">
                      {resumeInfo.workExperience.map((we, i) => (
                        <li key={i}>{we}</li>
                      ))}
                      {resumeInfo.workExperience.length === 0 && <li className="italic text-gray-400 list-none">None declared</li>}
                    </ul>
                  </div>
                </div>

                {/* Right side list */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Research & Science Lab Experience</h4>
                    <ul className="space-y-2 text-xs text-gray-600 pl-4 list-disc block">
                      {resumeInfo.researchExperience.map((re, i) => (
                        <li key={i}>{re}</li>
                      ))}
                      {resumeInfo.researchExperience.length === 0 && <li className="italic text-gray-400 list-none">None declared</li>}
                    </ul>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Clubs & Honors</h4>
                      <ul className="space-y-1 text-xs text-gray-600 block">
                        {resumeInfo.leadership.map((l, i) => (
                          <li key={i} className="truncate">• {l}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Certs & Pathways</h4>
                      <ul className="space-y-1 text-xs text-gray-600 block">
                        {resumeInfo.certifications.map((c, i) => (
                          <li key={i} className="truncate">• {c}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ATS Resume Coach Interactive View */
            <div className="space-y-6 animate-fade-in">
              {/* Target Configuration card */}
              <div className="glass-card rounded-3xl p-6 border border-purple-100">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAnalyzeAts();
                  }}
                  className="space-y-4"
                >
                  <div className="flex flex-col md:flex-row md:items-end gap-4">
                    <div className="flex-1">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-albion-purple" />
                        <span>What is your target position / career pathway?</span>
                      </label>
                      <input
                        type="text"
                        value={atsTargetRole}
                        onChange={(e) => setAtsTargetRole(e.target.value)}
                        placeholder="e.g. Software Engineer, Financial Analyst, Marketing Coordinator, Research Assistant"
                        className="w-full px-4 py-2.5 text-sm rounded-xl border border-purple-100 focus:border-albion-purple focus:ring-1 focus:ring-albion-purple outline-none font-medium bg-white"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isAnalyzingAts}
                      className="bg-albion-purple hover:bg-albion-purple-light text-white font-bold px-6 py-2.5 rounded-xl shadow-md transition duration-200 cursor-pointer flex items-center justify-center space-x-2 shrink-0 disabled:opacity-50 min-h-[44px]"
                    >
                      {isAnalyzingAts ? (
                        <>
                          <RefreshCw className="w-4 h-4 text-white animate-spin" />
                          <span>Auditing Profile...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 text-albion-gold-light" />
                          <span>Audit with ATS Coach</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    The Coach maps your exact resume entries against <strong>O*NET Standard frameworks</strong> and strict machine-readable horizontal parsing criteria to audit keyword density, active outcomes, and potential rejections.
                  </p>
                </form>
              </div>

              {atsAnalysisError && (
                <div className="bg-red-50 text-red-700 text-xs p-4 rounded-xl border border-red-200 flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{atsAnalysisError}</span>
                </div>
              )}

              {isAnalyzingAts && (
                <div className="bg-white rounded-3xl border border-purple-100/60 p-12 text-center space-y-4 shadow-sm">
                  <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto text-albion-purple relative">
                    <div className="absolute inset-0 rounded-full border-4 border-purple-100 border-t-albion-purple animate-spin" />
                    <Sparkles className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-display font-bold text-gray-800 text-sm">Evaluating Modern ATS Guidelines...</h4>
                    <p className="text-xs text-gray-400 max-w-md mx-auto">
                      Analyzing bullet points for quantified outcomes, checking formatting layers, scanning for vague keyword blockers, and mapping competencies.
                    </p>
                  </div>
                </div>
              )}

              {atsReport && !isAnalyzingAts && (
                <div className="space-y-6 animate-fade-in">
                  {/* Top score & brief summary card */}
                  <div className="bg-white rounded-3xl border border-purple-100 p-6 flex flex-col sm:flex-row items-center gap-6 shadow-sm">
                    {/* Circle Score dial */}
                    <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle
                          cx="56"
                          cy="56"
                          r="48"
                          className="stroke-gray-100 fill-none"
                          strokeWidth="8"
                        />
                        <circle
                          cx="56"
                          cy="56"
                          r="48"
                          className={`fill-none transition-all duration-1000 ${
                            atsReport.overallScore >= 80
                              ? 'stroke-green-500'
                              : atsReport.overallScore >= 60
                              ? 'stroke-amber-500'
                              : 'stroke-red-500'
                          }`}
                          strokeWidth="8"
                          strokeDasharray={2 * Math.PI * 48}
                          strokeDashoffset={2 * Math.PI * 48 * (1 - atsReport.overallScore / 100)}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center">
                        <span className="text-2xl font-black text-gray-800 leading-none">{atsReport.overallScore}</span>
                        <span className="text-[9px] text-gray-400 uppercase tracking-widest font-mono">ATS Rating</span>
                      </div>
                    </div>

                    <div className="space-y-2 flex-1 text-center sm:text-left">
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                        <h4 className="font-display font-bold text-base text-gray-800">
                          Applicant Tracking Compatibility Profile
                        </h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          atsReport.overallScore >= 80
                            ? 'bg-green-50 text-green-700 border border-green-100'
                            : atsReport.overallScore >= 60
                            ? 'bg-amber-50 text-amber-700 border border-amber-100'
                            : 'bg-red-50 text-red-700 border border-red-100'
                        }`}>
                          {atsReport.overallScore >= 80 ? 'Highly Compatible' : atsReport.overallScore >= 60 ? 'Needs Refinement' : 'Critical Formatting Blockers'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        Based on machine-readable horizontal parsers and industry hiring guidelines (including resources from Harvard, MIT, and Ohio Northern Career Guides).
                      </p>
                    </div>
                  </div>

                  {/* Split Audit panels */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Panel 1: Formatting Audit */}
                    <div className="bg-white rounded-2xl border border-gray-150 p-5 space-y-4">
                      <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                        <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                          {atsReport.formattingAudit.status === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                          )}
                          <span>Formatting Scan</span>
                        </span>
                        <span className="text-xs font-mono font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded">
                          Score: {atsReport.formattingAudit.score}/100
                        </span>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="text-[11px] text-gray-500 bg-purple-50/50 p-2.5 rounded-xl border border-purple-100/50 leading-relaxed font-sans">
                          <strong>ATS Horizontal parsing layout rule:</strong> Parsers read strictly left-to-right, top-to-bottom. Side-by-side columns or text boxes scramble sentence sequences, hiding your keywords.
                        </div>

                        <div className="space-y-2">
                          <h5 className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Scanned Flags:</h5>
                          <ul className="space-y-1.5 text-xs text-gray-600 pl-4 list-disc block">
                            {atsReport.formattingAudit.issues.map((issue: string, idx: number) => (
                              <li key={idx} className="leading-tight">{issue}</li>
                            ))}
                            {atsReport.formattingAudit.issues.length === 0 && (
                              <li className="text-green-600 list-none font-bold">✓ Fully compliant vertical alignment.</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Panel 2: Content & Accomplishments Audit */}
                    <div className="bg-white rounded-2xl border border-gray-150 p-5 space-y-4">
                      <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                        <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                          {atsReport.contentAudit.status === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                          )}
                          <span>Bullet Points & Metrics</span>
                        </span>
                        <span className="text-xs font-mono font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded">
                          Score: {atsReport.contentAudit.score}/100
                        </span>
                      </div>

                      <div className="space-y-3">
                        <div className="text-[11px] text-gray-500 bg-purple-50/50 p-2.5 rounded-xl border border-purple-100/50 leading-relaxed font-sans">
                          <strong>Proof statement rule:</strong> Achievements must list <em>quantified results</em> (numbers, percentages, dollar amounts) rather than mere tasks. Quantified outcomes boost interview requests.
                        </div>

                        <div className="flex items-center justify-between text-xs font-medium text-gray-700 bg-green-50/50 border border-green-100 p-2 rounded-xl">
                          <span>Quantified metrics found:</span>
                          <span className="font-mono bg-green-100 text-green-800 font-bold px-2 py-0.5 rounded-lg text-xs">
                            {atsReport.contentAudit.quantifiedResultCount} points
                          </span>
                        </div>

                        <div className="space-y-2">
                          <h5 className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Improvement advice:</h5>
                          <ul className="space-y-1.5 text-xs text-gray-650 pl-4 list-disc block">
                            {atsReport.contentAudit.issues.map((issue: string, idx: number) => (
                              <li key={idx} className="leading-tight">{issue}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Panel 3: Industry Keyword Audit */}
                    <div className="bg-white rounded-2xl border border-gray-150 p-5 space-y-4">
                      <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                        <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                          <TrendingUp className="w-4 h-4 text-albion-purple" />
                          <span>Industry Keyword Match</span>
                        </span>
                        <span className="text-xs font-mono font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded">
                          Score: {atsReport.keywordAudit.score}/100
                        </span>
                      </div>

                      <div className="space-y-3">
                        <div className="text-[11px] text-gray-500 bg-purple-50/50 p-2.5 rounded-xl border border-purple-100/50 leading-relaxed font-sans">
                          <strong>Search Queries Matching rule:</strong> Corporate software systems filters look for highly specific occupational skills. Spell out both the acronym and full phrase to capture all searches.
                        </div>

                        <div className="space-y-2">
                          <h5 className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Suggested Keywords:</h5>
                          <div className="flex flex-wrap gap-1.5">
                            {atsReport.keywordAudit.missingKeywords.map((kw: string, idx: number) => (
                              <span key={idx} className="bg-gray-50 border border-gray-200 text-gray-700 text-[10px] px-2 py-0.5 rounded font-mono">
                                + {kw}
                              </span>
                            ))}
                          </div>
                        </div>

                        {atsReport.keywordAudit.acronymSuggestions && atsReport.keywordAudit.acronymSuggestions.length > 0 && (
                          <div className="space-y-1 bg-yellow-50/50 border border-yellow-100 p-2.5 rounded-xl text-[10px] text-yellow-800 leading-snug">
                            <strong>Acronym Suggestion:</strong>
                            <p>{atsReport.keywordAudit.acronymSuggestions[0]}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                   {/* Layout & Content Optimization Areas from the Research Paper */}
                  <div className="bg-amber-50/65 border border-amber-200 rounded-3xl p-6 space-y-4">
                    <div className="flex items-center space-x-2 text-amber-850">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                      <h4 className="font-display font-bold text-sm uppercase tracking-wider">
                        Key Optimization Areas (Research-Backed)
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {atsReport.optimizationAreas && atsReport.optimizationAreas.map((flag: any, idx: number) => (
                        <div key={idx} className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-800">{flag.type}</span>
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                              flag.severity === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {flag.severity} Priority
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
                            {flag.description}
                          </p>
                        </div>
                      ))}
                      {(!atsReport.optimizationAreas || atsReport.optimizationAreas.length === 0) && (
                        <p className="text-xs text-green-700 italic">No layout or alignment gaps detected. Excellent foundational clarity!</p>
                      )}
                    </div>
                  </div>

                  {/* Educational Good vs Bad reference section */}
                  <div className="bg-gray-50 border border-gray-200 rounded-3xl p-6 space-y-4">
                    <div className="space-y-1">
                      <h4 className="font-display font-bold text-sm text-gray-800">
                        Visual Learning: Good ATS Design vs. Common Failures
                      </h4>
                      <p className="text-xs text-gray-400">
                        To help you visualize, we've summarized standard resume architecture guidelines below:
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Good layout details */}
                      <div className="bg-white p-5 rounded-2xl border border-green-100 space-y-3 shadow-sm">
                        <div className="flex items-center gap-1.5 text-green-700 font-bold text-xs">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Strict ATS-Friendly Best Practices</span>
                        </div>
                        <ul className="space-y-2 text-xs text-gray-650 list-decimal pl-4 block">
                          <li><strong>Vertical Single Column:</strong> Sequential flow is easily parsed by reading software.</li>
                          <li><strong>Traditional Fonts:</strong> Use Arial, Calibri, Georgia, or Times New Roman.</li>
                          <li><strong>Standard Circle Bullets:</strong> Ensures text after bullet isn't deleted by formatting.</li>
                          <li><strong>Direct Contact Info:</strong> Email and phone typed directly inside the main document body, never inside native Word headers or footers (which parsers skip).</li>
                          <li><strong>Standard Categories:</strong> Use globally recognizable headers: SUMMARY, SKILLS, WORK EXPERIENCE, EDUCATION.</li>
                        </ul>
                      </div>

                      {/* Bad layout details */}
                      <div className="bg-white p-5 rounded-2xl border border-red-100 space-y-3 shadow-sm">
                        <div className="flex items-center gap-1.5 text-red-700 font-bold text-xs">
                          <XCircle className="w-4 h-4" />
                          <span>Typical Formatting Rejection Traps</span>
                        </div>
                        <ul className="space-y-2 text-xs text-gray-650 list-decimal pl-4 block">
                          <li><strong>Columns & Sidebars:</strong> Text is parsed horizontally across columns, leading to scrambled "word salads".</li>
                          <li><strong>Decorative Fonts:</strong> Custom graphic text layers are completely unreadable to parsers.</li>
                          <li><strong>Custom Shapes & Graphics:</strong> Diamond, arrow, or checkmark bullets break character encoding.</li>
                          <li><strong>Word Native Header Fields:</strong> Hidden information. Systems ingest empty fields, keeping contact details completely anonymous.</li>
                          <li><strong>Vague/Creative Headers:</strong> Creative section names like "My Journey" cause critical info to be completely misclassified.</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Tailored Advice Card */}
                  <div className="bg-[#49266F]/10 border border-[#49266F]/15 rounded-3xl p-6 space-y-3">
                    <div className="flex items-center gap-2 text-albion-purple">
                      <Lightbulb className="w-5 h-5 text-albion-gold shrink-0" />
                      <h4 className="font-display font-bold text-sm uppercase tracking-wider">
                        Tailored Strategic Advice (Liberal Arts Advantage)
                      </h4>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      {atsReport.tailoredAdvice}
                    </p>
                  </div>
                </div>
              )}

              {!atsReport && !isAnalyzingAts && (
                <div className="bg-white rounded-3xl border border-gray-150 p-12 text-center space-y-3 shadow-sm">
                  <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center text-albion-purple mx-auto">
                    <Award className="w-5 h-5" />
                  </div>
                  <h4 className="font-display font-bold text-sm text-gray-800">
                    No ATS Audit Generated
                  </h4>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto">
                    Configure your target pathway role in the audit field above and press the button to perform the instant diagnostic analysis.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* LinkedIn Configuration & Sandbox Simulator Modal */}
      {showLinkedinModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-6 relative border border-gray-100 animate-scale-in">
            <button
              onClick={() => setShowLinkedinModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 font-bold text-2xl font-mono p-1 cursor-pointer"
            >
              &times;
            </button>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="bg-[#0077B5]/10 p-2.5 rounded-xl text-[#0077B5]">
                  <Linkedin className="w-6 h-6" />
                </div>
                <h3 className="font-display font-bold text-lg text-gray-900">
                  LinkedIn Connection Required
                </h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                To enable live real-time authorization with LinkedIn.com, standard OAuth credentials must be set in your environment.
              </p>
            </div>

            {/* Instruction Steps */}
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-3 font-sans text-xs text-gray-650">
              <p>
                <strong>1. Create Developer Application:</strong> Go to{" "}
                <a
                  href="https://developer.linkedin.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-albion-purple hover:underline font-bold"
                >
                  developer.linkedin.com
                </a>{" "}
                to register your workspace client.
              </p>
              <div>
                <strong>2. Authorized Redirect URI:</strong>
                <span className="block mt-1 font-mono bg-white p-2 rounded border border-gray-200 text-[10px] break-all select-all font-bold text-albion-purple">
                  {linkedinRedirectUri}
                </span>
              </div>
              <div>
                <strong>3. Configure Settings Variables:</strong>
                <span className="block mt-1 space-y-1 font-mono text-[10px] text-gray-500">
                  <div>• <strong className="text-gray-700">LINKEDIN_CLIENT_ID</strong></div>
                  <div>• <strong className="text-gray-700">LINKEDIN_CLIENT_SECRET</strong></div>
                </span>
              </div>
            </div>

            {/* Sandbox Simulation alternative */}
            <div className="border-t border-gray-100 pt-5 space-y-4">
              <div className="space-y-1">
                <h4 className="font-display font-bold text-sm text-gray-800">
                  ⚡ Try LinkedIn Sandbox Simulator
                </h4>
                <p className="text-xs text-gray-400">
                  No registered app? Instantly simulate the full extraction process using our integrated Gemini AI generator.
                </p>
              </div>

              <form onSubmit={handleLinkedInSimulate} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                      LinkedIn Full Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Brit Albion"
                      value={simName}
                      onChange={(e) => setSimName(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 outline-none focus:border-albion-purple bg-gray-50/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                      LinkedIn Verified Email
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. brit@albion.edu"
                      value={simEmail}
                      onChange={(e) => setSimEmail(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 outline-none focus:border-albion-purple bg-gray-50/50"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSimulating}
                  className="w-full bg-[#0077B5] hover:bg-[#005a8b] text-white text-xs font-bold py-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSimulating ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Simulating Extraction with Gemini...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Extract Profile in Sandbox Mode</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
