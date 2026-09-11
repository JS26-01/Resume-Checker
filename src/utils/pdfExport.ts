import html2pdf from 'html2pdf.js';

interface ExportPdfOptions {
  elementId: string;
  filename?: string;
  jobTitle?: string;
  companyName?: string;
}

// Convert OKLab (L, a, b, alpha) to rgba/rgb string
function oklabToRgba(L: number, a: number, b: number, alpha: number = 1): string {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 0.1291986454 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rLinear = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLinear = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLinear = +0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  const toGamma = (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 255;
    const val = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.min(255, Math.max(0, Math.round(val * 255)));
  };

  const r = toGamma(rLinear);
  const g = toGamma(gLinear);
  const bComp = toGamma(bLinear);

  if (alpha < 1) {
    return `rgba(${r}, ${g}, ${bComp}, ${alpha})`;
  }
  return `rgb(${r}, ${g}, ${bComp})`;
}

// Convert OKLCH (L, C, H, alpha) to rgba/rgb string
function oklchToRgba(L: number, C: number, H: number, alpha: number = 1): string {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  return oklabToRgba(L, a, b, alpha);
}

/**
 * Converts any modern color string (oklab, oklch, light-dark, etc.)
 * into standard rgb(r, g, b) or rgba(r, g, b, a) string.
 */
function convertModernColorsToRgb(str: string): string {
  if (!str) return str;
  if (!/oklch|oklab|light-dark|color\(/i.test(str)) return str;

  let result = str;

  // 1. Convert oklch(...)
  result = result.replace(/oklch\(\s*([\d.%]+)\s+([\d.%]+)\s+([\d.%]+)(?:\s*\/\s*([\d.%]+))?\s*\)/gi, (_, pL, pC, pH, pA) => {
    let L = parseFloat(pL);
    if (pL.endsWith('%')) L /= 100;
    let C = parseFloat(pC);
    if (pC.endsWith('%')) C /= 100;
    let H = parseFloat(pH);
    let alpha = 1;
    if (pA) {
      alpha = parseFloat(pA);
      if (pA.endsWith('%')) alpha /= 100;
    }
    return oklchToRgba(L, C, H, alpha);
  });

  // 2. Convert oklab(...)
  result = result.replace(/oklab\(\s*([\d.%]+)\s+([\d.%]+)\s+([\d.%]+)(?:\s*\/\s*([\d.%]+))?\s*\)/gi, (_, pL, pA_val, pB_val, pAlpha) => {
    let L = parseFloat(pL);
    if (pL.endsWith('%')) L /= 100;
    let a = parseFloat(pA_val);
    if (pA_val.endsWith('%')) a /= 100;
    let b = parseFloat(pB_val);
    if (pB_val.endsWith('%')) b /= 100;
    let alpha = 1;
    if (pAlpha) {
      alpha = parseFloat(pAlpha);
      if (pAlpha.endsWith('%')) alpha /= 100;
    }
    return oklabToRgba(L, a, b, alpha);
  });

  // 3. Convert light-dark(val1, val2) -> val1
  result = result.replace(/light-dark\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi, '$1');

  // 4. Fallback for any remaining unparsed oklch, oklab, or color(...) functions
  result = result.replace(/(?:oklch|oklab|color)\([^)]*\)/gi, 'rgb(73, 38, 111)');

  return result;
}

/**
 * Sanitizes all style tags and stylesheets in a document
 * to completely eliminate modern CSS color functions before html2canvas parsing.
 */
function sanitizeDocumentStyles(doc: Document) {
  // 1. Sanitize all <style> tags text content
  const styleTags = Array.from(doc.querySelectorAll('style'));
  styleTags.forEach((styleTag) => {
    if (styleTag.textContent && /oklch|oklab|light-dark|color\(/i.test(styleTag.textContent)) {
      styleTag.textContent = convertModernColorsToRgb(styleTag.textContent);
    }
  });

  // 2. Sanitize rules in CSSStyleSheets backwards
  try {
    const sheets = Array.from(doc.styleSheets);
    sheets.forEach((sheet) => {
      try {
        const rules = Array.from(sheet.cssRules || []);
        for (let i = rules.length - 1; i >= 0; i--) {
          const rule = rules[i];
          if (rule && rule.cssText && /oklch|oklab|light-dark|color\(/i.test(rule.cssText)) {
            const sanitized = convertModernColorsToRgb(rule.cssText);
            try {
              sheet.deleteRule(i);
              if (sanitized && !/oklch|oklab/i.test(sanitized)) {
                sheet.insertRule(sanitized, i);
              }
            } catch {
              // Ignore rule modification failures
            }
          }
        }
      } catch {
        // Cross-origin stylesheet security restrictions
      }
    });
  } catch {
    // Ignore stylesheet access errors
  }
}

export async function exportReportToPdf({
  elementId,
  filename = 'Career_Assessment_Report.pdf',
}: ExportPdfOptions): Promise<void> {
  const targetElement = document.getElementById(elementId);
  if (!targetElement) {
    throw new Error('Report container element not found.');
  }

  // Scroll to top of element to ensure full capture
  window.scrollTo(0, 0);

  // Pre-sanitize main document styles
  sanitizeDocumentStyles(document);

  // Ensure printable wrapper is used around the main diagnostic container
  // to preserve all custom CSS classes, background colors, gradients, and flex layouts
  const printableWrapper = targetElement.closest('.printable-diagnostic-wrapper') as HTMLElement | null;
  const elementToExport = printableWrapper || targetElement;

  // Options for html2pdf.js with html2canvas set to scale 2 and useCORS: true
  const opt = {
    margin: [8, 8, 8, 8],
    filename: filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2, // Scale set to 2 for high-resolution output
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: elementToExport.scrollWidth || 1200,
      onclone: (clonedDoc: Document) => {
        // 1. Hide .no-print elements in cloned document
        const noPrintEls = clonedDoc.querySelectorAll('.no-print');
        noPrintEls.forEach((el) => {
          (el as HTMLElement).style.display = 'none';
        });

        // 2. Sanitize all stylesheets and style tags in cloned document
        sanitizeDocumentStyles(clonedDoc);

        // 3. Process cloned elements to preserve custom CSS classes, background colors, gradients, and flex layouts
        const origEls = [elementToExport, ...Array.from(elementToExport.querySelectorAll('*'))] as HTMLElement[];
        const clonedTarget = clonedDoc.getElementById(elementId) || clonedDoc.querySelector('.printable-diagnostic-wrapper') || clonedDoc.body;
        const clonedEls = clonedTarget
          ? [clonedTarget as HTMLElement, ...Array.from(clonedTarget.querySelectorAll('*'))] as HTMLElement[]
          : Array.from(clonedDoc.querySelectorAll('*')) as HTMLElement[];

        const count = Math.min(origEls.length, clonedEls.length);
        for (let i = 0; i < count; i++) {
          const orig = origEls[i];
          const cloned = clonedEls[i];
          if (!orig || !cloned || !cloned.style) continue;

          try {
            const computed = window.getComputedStyle(orig);

            cloned.style.color = convertModernColorsToRgb(computed.color);
            if (computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)' && computed.backgroundColor !== 'transparent') {
              cloned.style.backgroundColor = convertModernColorsToRgb(computed.backgroundColor);
            }

            if (computed.backgroundImage && computed.backgroundImage !== 'none') {
              cloned.style.backgroundImage = convertModernColorsToRgb(computed.backgroundImage);
            }

            if (computed.borderColor) cloned.style.borderColor = convertModernColorsToRgb(computed.borderColor);
            if (computed.fill) cloned.style.fill = convertModernColorsToRgb(computed.fill);
            if (computed.stroke) cloned.style.stroke = convertModernColorsToRgb(computed.stroke);
            if (computed.boxShadow) cloned.style.boxShadow = convertModernColorsToRgb(computed.boxShadow);

            cloned.style.display = computed.display;
            cloned.style.flexDirection = computed.flexDirection;
            cloned.style.flexWrap = computed.flexWrap;
            cloned.style.alignItems = computed.alignItems;
            cloned.style.justifyContent = computed.justifyContent;
            cloned.style.gap = computed.gap;

            cloned.style.fontFamily = computed.fontFamily;
            cloned.style.fontSize = computed.fontSize;
            cloned.style.fontWeight = computed.fontWeight;
            cloned.style.lineHeight = computed.lineHeight;

            cloned.style.padding = computed.padding;
            cloned.style.margin = computed.margin;
            cloned.style.borderRadius = computed.borderRadius;
            cloned.style.opacity = computed.opacity;
          } catch {
            // Ignore individual element computed style errors
          }

          if (cloned.style.cssText && /oklch|oklab|light-dark|color\(/i.test(cloned.style.cssText)) {
            cloned.style.cssText = convertModernColorsToRgb(cloned.style.cssText);
          }
        }
      },
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
  };

  // Execute html2pdf.js PDF export
  const html2pdfFn = typeof html2pdf === 'function' ? html2pdf : (html2pdf as any).default;
  if (!html2pdfFn) {
    throw new Error('html2pdf library is unavailable.');
  }

  await html2pdfFn().set(opt).from(elementToExport).save();
}
