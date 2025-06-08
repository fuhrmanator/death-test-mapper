import * as fs from 'fs';
import * as path from 'path';

interface Paragraph {
  id: number;
  text: string;
  choices: Choice[];
}

interface Choice {
  text: string;
  targetId: number;
}

// Load the OCR text
const ocrText = fs.readFileSync(path.join(__dirname, 'output', 'copied-text-from-pdf24-ocr.txt'), 'utf8');

// Skip the Fighter Table section
function preprocessText(text: string): string {
  // Find where the actual paragraphs start
  const firstParagraphMatch = /^1\.\s+Your party/m.exec(text);
  if (firstParagraphMatch) {
    return text.substring(firstParagraphMatch.index);
  }
  return text;
}

// Extract paragraphs using a line-by-line approach with better detection
function extractParagraphs(text: string): Paragraph[] {
  const processedText = preprocessText(text);
  const lines = processedText.split('\n');
  const paragraphs: Paragraph[] = [];
  
  let currentId: number | null = null;
  let currentText = '';
  let expectedNextId = 1; // Track expected next paragraph number
  
  // Process each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and page break markers
    if (!line || line === '--- Page Break ---') continue;
    
    // Check if this line starts a new paragraph
    const paragraphMatch = /^(\d+)\.\s+(.*)/.exec(line);
    
    if (paragraphMatch) {
      const potentialId = parseInt(paragraphMatch[1], 10);
      
      // Validate this is likely a real paragraph number by position and sequence
      const isLikelyParagraph = 
        potentialId >= 1 && 
        potentialId <= 167 && // Known range for Death Test
        paragraphMatch.index === 0; // Must be at start of line
      
      if (isLikelyParagraph) {
        // Save the previous paragraph if there was one
        if (currentId !== null && currentText) {
          paragraphs.push({
            id: currentId,
            text: currentText.trim(),
            choices: []
          });
        }
        
        // Start a new paragraph
        currentId = potentialId;
        expectedNextId = potentialId + 1; // Update expected next ID
        currentText = paragraphMatch[2];
      } else {
        // This was a false match - append to current text
        if (currentId !== null) {
          currentText += ' ' + line;
        }
      }
    } else if (currentId !== null) {
      // Continue the current paragraph
      currentText += ' ' + line;
    }
  }
  
  // Don't forget to add the final paragraph
  if (currentId !== null && currentText) {
    paragraphs.push({
      id: currentId,
      text: currentText.trim(),
      choices: []
    });
  }
  
  // Post-processing: Sort paragraphs by ID and detect gaps
  paragraphs.sort((a, b) => a.id - b.id);
  
  // Extract choices for each paragraph
  for (const paragraph of paragraphs) {
    paragraph.choices = extractChoices(paragraph.text);
  }
  
  return paragraphs;
}

// Extract navigation choices from paragraph text
function extractChoices(text: string): Choice[] {
  // These are common phrases used to indicate navigation
  const navigationPatterns = [
    /go to (\d+)/gi,
    /turn to (\d+)/gi, 
    /proceed to (\d+)/gi,
    /\((\d+)\)/g,  // Captures choices in parentheses
    /see (\d+)/gi,
    /He is at (\d+)/gi,
    /you're at (\d+)/gi,
    /you are at (\d+)/gi,
    /(\d+) if/gi,
    /you are now at (\d+)/gi,
    /Escapees are now at (\d+)/gi,
    /you're back at (\d+)/gi,
    /you are back at (\d+)/gi,
    /if you win,? go to (\d+)/gi,
    /if you lose,? go to (\d+)/gi,
    /if successful,? go to (\d+)/gi,
    /if you fail,? go to (\d+)/gi,
    /return to (\d+)/gi,
    /go back to (\d+)/gi,
    /move to (\d+)/gi,
    /go out (the .* door)?,? go to (\d+)/gi
  ];
  
  const choices: Choice[] = [];
  const seenTargets = new Set<number>();
  
  for (const pattern of navigationPatterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      const targetId = parseInt(match[1], 10);
      
      // Skip if target ID is invalid or we've already seen it
      if (isNaN(targetId) || targetId < 1 || targetId > 167 || seenTargets.has(targetId)) {
        continue;
      }
      
      // Get some context around the number to help filter false positives
      const contextStart = Math.max(0, match.index! - 15);
      const contextEnd = Math.min(text.length, match.index! + match[0].length + 15);
      const context = text.substring(contextStart, contextEnd);
      
      // Skip if this is likely a stat reference
      if (context.match(/ST\s*=|DX\s*=|IQ\s*=/i)) {
        continue;
      }
      
      seenTargets.add(targetId);
      choices.push({
        text: match[0],
        targetId
      });
    }
  }
  
  return choices;
}

// Add this function after extractParagraphs
function fixSpecialCases(paragraphs: Paragraph[]): void {
  // Map of paragraph IDs to manually add choices for
  const specialCases: Record<number, Choice[]> = {
    // For paragraph 108 (example)
    108: [
      { text: "west exit (112)", targetId: 112 },
      { text: "east exit (87)", targetId: 87 }
    ],
    // Add more special cases as needed
  };
  
  // Apply the fixes
  for (const [idStr, choices] of Object.entries(specialCases)) {
    const id = parseInt(idStr, 10);
    const paragraph = paragraphs.find(p => p.id === id);
    if (paragraph) {
      // Add any choices that don't already exist
      for (const choice of choices) {
        if (!paragraph.choices.some(c => c.targetId === choice.targetId)) {
          paragraph.choices.push(choice);
        }
      }
    }
  }
}

// Check for duplicated paragraph IDs (due to OCR errors)
function checkForDuplicates(paragraphs: Paragraph[]): void {
  const idCounts = new Map<number, number>();
  
  for (const paragraph of paragraphs) {
    idCounts.set(paragraph.id, (idCounts.get(paragraph.id) || 0) + 1);
  }
  
  const duplicates = Array.from(idCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([id, count]) => ({ id, count }));
    
  if (duplicates.length > 0) {
    console.log('Warning: Found duplicate paragraph IDs:');
    for (const dup of duplicates) {
      console.log(`  Paragraph ${dup.id} appears ${dup.count} times`);
    }
  }
}

// Identify and report dead-end paragraphs
function identifyDeadEnds(paragraphs: Paragraph[]): void {
  // Find paragraphs with no outgoing links
  const deadEnds = paragraphs.filter(p => p.choices.length === 0);
  
  // Known legitimate endings (victory/death)
  const knownEndings = new Set([167]); // Paragraph 167 is the scoring/victory paragraph
  
  // Filter out known endings
  const unexpectedDeadEnds = deadEnds.filter(p => !knownEndings.has(p.id));
  
  console.log(`Found ${deadEnds.length} total dead-end paragraphs`);
  console.log(`${knownEndings.size} are known legitimate endings`);
  console.log(`${unexpectedDeadEnds.length} might need investigation:`);
  
  // List the unexpected dead ends with their text
  if (unexpectedDeadEnds.length > 0) {
    console.log("\nUnexpected dead-end paragraphs:");
    unexpectedDeadEnds.forEach(p => {
      console.log(`\nParagraph ${p.id}:`);
      // Show a snippet of the paragraph text (first 100 chars)
      const snippet = p.text.length > 100 ? p.text.substring(0, 100) + '...' : p.text;
      console.log(`  ${snippet}`);
    });
    
    // Save to a separate file for easier review
    const deadEndsFile = path.join(__dirname, 'output', 'dead_ends.txt');
    const deadEndsText = unexpectedDeadEnds
      .map(p => `${p.id}. ${p.text}\n\n---\n\n`)
      .join('');
    fs.writeFileSync(deadEndsFile, deadEndsText);
    console.log(`\nSaved ${unexpectedDeadEnds.length} dead-end paragraphs to ${deadEndsFile}`);
  }
}

// Main process
function main() {
  console.log('Starting paragraph extraction...');
  
  // Extract paragraphs
  const paragraphs = extractParagraphs(ocrText);
  
  // Fix special cases
  fixSpecialCases(paragraphs);
  
  // Check for duplicates
  checkForDuplicates(paragraphs);
  
  // Identify dead-end paragraphs
  identifyDeadEnds(paragraphs);
  
  // Validate missing paragraphs
  const expectedIds = new Set(Array.from({ length: 167 }, (_, i) => i + 1));
  const foundIds = new Set(paragraphs.map(p => p.id));
  
  const missingIds = Array.from(expectedIds)
    .filter(id => !foundIds.has(id))
    .sort((a, b) => a - b);
    
  if (missingIds.length > 0) {
    console.log(`Missing ${missingIds.length} paragraphs: ${missingIds.join(', ')}`);
  }
  
  // Save paragraphs as JSON
  const outputFile = path.join(__dirname, 'output', 'paragraphs.json');
  fs.writeFileSync(outputFile, JSON.stringify(paragraphs, null, 2));
  console.log(`Saved ${paragraphs.length} paragraphs to ${outputFile}`);
  
  // Also save as plain text for easier review
  const textOutputFile = path.join(__dirname, 'output', 'paragraphs.txt');
  const textOutput = paragraphs
    .map(p => `${p.id}. ${p.text}\n\nLinks: ${p.choices.map(c => c.targetId).join(', ') || 'None'}\n\n---\n\n`)
    .join('');
  fs.writeFileSync(textOutputFile, textOutput);
  console.log(`Saved readable version to ${textOutputFile}`);
}

main();
