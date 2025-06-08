import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { execSync } from 'child_process';

// OCR.Space API key
const API_KEY = 'K86112922588957'; 
const API_URL = 'https://api.ocr.space/parse/image';
const PDF_PATH = 'C:\\Users\\Cris\\Downloads\\DT1_Steps.pdf';

// Define unique output directory for OCR.Space results
const OUTPUT_DIR = path.join(__dirname, 'output', 'ocr-space');
const IMAGES_DIR = path.join(OUTPUT_DIR, 'images');

interface OcrResponse {
  ParsedResults: {
    ParsedText: string;
    ErrorMessage: string;
    FileParseExitCode: number;
    ErrorDetails: string;
    TextOverlay: any;
    PageIndex: number;
  }[];
  OCRExitCode: number;
  IsErroredOnProcessing: boolean;
  ProcessingTimeInMilliseconds: string;
  SearchablePDFURL: string;
}

interface Paragraph {
  id: number;
  text: string;
  choices: Choice[];
}

interface Choice {
  text: string;
  targetId: number;
}

/**
 * Cleans up OCR text by fixing common issues
 */
function cleanOcrText(text: string): string {
  return text
    // Fix paragraph numbers (e.g. "171," to "171.")
    .replace(/(\d+),(\s+)/g, '$1.$2')
    // Fix broken paragraphs
    .replace(/(\d+)\s+\./g, '$1.')
    // Fix spaces in paragraph numbers
    .replace(/(\d+)\s+\./g, '$1.')
    // Remove extra whitespace
    .replace(/\s{2,}/g, ' ')
    // Fix quotes
    .replace(/''|``/g, '"')
    // Clean up line breaks
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Extract paragraphs from the OCR text
 */
function extractParagraphs(text: string): Paragraph[] {
  const paragraphRegex = /(\d+)\.\s+([\s\S]+?)(?=\d+\.|$)/g;
  const paragraphs: Paragraph[] = [];
  let match;
  
  while ((match = paragraphRegex.exec(text)) !== null) {
    const id = parseInt(match[1], 10);
    const content = match[2].trim();
    
    paragraphs.push({
      id,
      text: content,
      choices: extractChoices(content)
    });
  }
  
  return paragraphs;
}

/**
 * Extract navigation choices from paragraph text
 */
function extractChoices(text: string): Choice[] {
  const choicePatterns = [
    /turn to (\d+)/i,
    /go to (\d+)/i,
    /see (\d+)/i,
    /proceed to (\d+)/i,
    /paragraph (\d+)/i
  ];
  
  const choices: Choice[] = [];
  
  for (const pattern of choicePatterns) {
    const matches = Array.from(text.matchAll(new RegExp(pattern, 'gi')));
    for (const match of matches) {
      const targetId = parseInt(match[1], 10);
      choices.push({
        text: match[0],
        targetId
      });
    }
  }
  
  return choices;
}

/**
 * Convert a PDF page to PNG image using ImageMagick
 */
function convertPdfPageToPng(pdfPath: string, pageNumber: number, outputPath: string): boolean {
  try {
    const command = `magick -density 600 "${pdfPath}[${pageNumber}]" -quality 100 "${outputPath}"`;
    console.log(`Running conversion command: ${command}`);
    execSync(command);
    return fs.existsSync(outputPath);
  } catch (error) {
    console.error(`Error converting page ${pageNumber + 1} to PNG:`, error);
    return false;
  }
}

// Function to extract a single page from PDF
async function extractPdfPage(inputPath: string, pageNum: number): Promise<Uint8Array> {
  const pdfBytes = fs.readFileSync(inputPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  
  // Create a new document with just the one page
  const newPdfDoc = await PDFDocument.create();
  const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [pageNum]);
  newPdfDoc.addPage(copiedPage);
  
  return await newPdfDoc.save();
}

// Process a single PDF page with OCR.Space
async function processPage(pageBytes: Uint8Array, pageNumber: number): Promise<string> {
  console.log(`Processing page ${pageNumber} with OCR.Space...`);
  
  // First, save the single-page PDF
  const singlePagePdfPath = path.join(OUTPUT_DIR, `ocr-space-page-${pageNumber}.pdf`);
  fs.writeFileSync(singlePagePdfPath, pageBytes);
  
  // Convert the PDF page to PNG using ImageMagick
  const pngPath = path.join(IMAGES_DIR, `ocr-space-page-${pageNumber}.png`);
  const conversionSuccess = convertPdfPageToPng(singlePagePdfPath, 0, pngPath);
  
  if (conversionSuccess) {
    console.log(`Saved page ${pageNumber} as PNG image: ${pngPath}`);
  } else {
    console.warn(`Could not save page ${pageNumber} as PNG image`);
  }
  
  const base64Image = Buffer.from(pageBytes).toString('base64');
  console.log(`Page ${pageNumber} size: ${(pageBytes.length / 1024).toFixed(2)} KB`);
  
  const params = new URLSearchParams();
  params.append('apikey', API_KEY);
  params.append('base64Image', `data:application/pdf;base64,${base64Image}`);
  params.append('language', 'eng');
  params.append('OCREngine', '2');
  params.append('scale', 'true');
  params.append('detectOrientation', 'true');
  params.append('filetype', 'pdf');
  
  try {
    const response = await axios.post(
      API_URL,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 60000
      }
    );
    
    const ocrResult = response.data as OcrResponse;
    
    if (ocrResult.OCRExitCode !== 1 || ocrResult.IsErroredOnProcessing) {
      console.error(`Error processing page ${pageNumber}:`);
      console.error(JSON.stringify(ocrResult, null, 2));
      return '';
    }
    
    if (!ocrResult.ParsedResults || ocrResult.ParsedResults.length === 0) {
      console.error(`No results for page ${pageNumber}`);
      return '';
    }
    
    return ocrResult.ParsedResults[0].ParsedText || '';
  } catch (error) {
    console.error(`Error processing page ${pageNumber}:`, error);
    return '';
  }
}

// Main function to process the document page by page
async function processDocument(): Promise<void> {
  try {
    // Create output directory and subdirectory for OCR.Space
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    // Create images directory
    if (!fs.existsSync(IMAGES_DIR)) {
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
    }
    
    // Log the output directory
    console.log(`OCR.Space output will be saved to: ${OUTPUT_DIR}`);
    console.log(`Page images will be saved to: ${IMAGES_DIR}`);
    
    // Load PDF and determine page count
    const pdfBytes = fs.readFileSync(PDF_PATH);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();
    
    console.log(`PDF has ${pageCount} pages. Starting OCR.Space process...`);
    
    // Process each page individually
    let allText = '';
    
    for (let i = 0; i < pageCount; i++) {
      // Extract single page
      const pageBytes = await extractPdfPage(PDF_PATH, i);
      
      // Process the page
      const pageText = await processPage(pageBytes, i + 1);
      
      if (pageText) {
        // Save individual page text with ocr-space prefix
        const pageFile = path.join(OUTPUT_DIR, `ocr-space-page-${i + 1}.txt`);
        fs.writeFileSync(pageFile, pageText);
        console.log(`Page ${i + 1} saved to ${pageFile}`);
        
        // Add to combined text
        allText += pageText + '\n\n--- Page Break ---\n\n';
      } else {
        console.error(`Failed to process page ${i + 1}`);
      }
      
      // Add a delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Save and clean combined text
    if (allText) {
      // Save raw combined text
      const rawFile = path.join(OUTPUT_DIR, 'ocr-space-raw-text.txt');
      fs.writeFileSync(rawFile, allText);
      console.log(`Raw OCR.Space text saved to ${rawFile}`);
      
      // Clean the text
      const cleanedText = cleanOcrText(allText);
      const cleanedFile = path.join(OUTPUT_DIR, 'ocr-space-cleaned-text.txt');
      fs.writeFileSync(cleanedFile, cleanedText);
      console.log(`Cleaned OCR.Space text saved to ${cleanedFile}`);
      
      // Extract and save paragraphs
      const paragraphs = extractParagraphs(cleanedText);
      const paragraphsFile = path.join(OUTPUT_DIR, 'ocr-space-paragraphs.json');
      fs.writeFileSync(paragraphsFile, JSON.stringify(paragraphs, null, 2));
      console.log(`Extracted ${paragraphs.length} paragraphs with choices`);
      
      // Create a text version of the paragraphs for easy reading
      const paragraphsTextFile = path.join(OUTPUT_DIR, 'ocr-space-paragraphs.txt');
      const paragraphsText = paragraphs
        .map(p => `${p.id}. ${p.text}\n\nLinks: ${p.choices.map(c => c.targetId).join(', ') || 'None'}\n\n---\n\n`)
        .join('');
      fs.writeFileSync(paragraphsTextFile, paragraphsText);
      console.log(`Text version of paragraphs saved to ${paragraphsTextFile}`);
    }
  } catch (error) {
    console.error('Error processing document:', error);
  }
}

// Run the OCR process
processDocument().then(() => {
  console.log('OCR.Space processing job complete');
}).catch(err => {
  console.error('Unhandled error:', err);
});
