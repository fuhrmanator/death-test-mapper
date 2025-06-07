import * as fs from 'fs';
import * as path from 'path';

// Define the Node and Graph interfaces
interface Node {
  id: number;
  text: string;
  outgoingEdges: number[];
  incomingEdges: number[];
}

interface Graph {
  nodes: Map<number, Node>;
}

// Parse the instructions text into a graph
function parseInstructions(text: string): Graph {
  const graph: Graph = { nodes: new Map() };
  
  // Split the text into lines
  const lines = text.split('\n');
  
  let currentNode: Node | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if this line starts a new instruction
    const instructionMatch = line.match(/^(\d+)\./);
    
    if (instructionMatch) {
      // If we were building a previous node, add it to the graph
      if (currentNode) {
        extractOutgoingLinks(currentNode);
        graph.nodes.set(currentNode.id, currentNode);
      }
      
      // Start a new node
      const id = parseInt(instructionMatch[1], 10);
      currentNode = {
        id,
        text: line.substring(instructionMatch[0].length).trim(),
        outgoingEdges: [],
        incomingEdges: []
      };
    } else if (currentNode) {
      // Add this line to the current node's text
      currentNode.text += ' ' + line;
    }
  }
  
  // Add the last node if there is one
  if (currentNode) {
    extractOutgoingLinks(currentNode);
    graph.nodes.set(currentNode.id, currentNode);
  }
  
  // Calculate incoming edges
  updateIncomingEdges(graph);
  
  return graph;
}

// Extract outgoing links from node text
function extractOutgoingLinks(node: Node): void {
  let match;
  
  // List of patterns to ignore (false positives)
  const ignorePatterns = [
    /map\s+at\s+(\d+)/gi,                     // "map at X"
    /see\s+map\s+at\s+(\d+)/gi,               // "see map at X"
    /map\s+below\s+at\s+(\d+)/gi,             // "map below at X"
    /map\s+at\s+number\s+(\d+)/gi,            // "map at number X"
  ];
  
  // Build a set of numbers to ignore for this node
  const numbersToIgnore = new Set<number>();
  for (const pattern of ignorePatterns) {
    while ((match = pattern.exec(node.text)) !== null) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num)) {
        numbersToIgnore.add(num);
      }
    }
  }
  
  // Look for various patterns that indicate links to other nodes
  const patterns = [
    /\b(?:go|return)\s+(?:back\s+)?(?:to|at)\s+(\d+)/gi,     // "go to X", "go back to X"
    /\byou\s+are\s+(?:now\s+)?at\s+(\d+)/gi,                 // "you are at X", "you are now at X"
    /\bare\s+(?:now\s+)?at\s+(\d+)/gi,                       // "are at X", "are now at X" 
    /\b(?:you|he|she|they)\s+are\s+(?:back|now)\s+at\s+(\d+)/gi, // "you are back at X", "they are now at X"
    /\bare\s+(?:back|now)\s+at\s+(\d+)/gi,                   // "are back at X", "are now at X"
    /\bstep(?:ped)?\s+out[^\.]*?(\d+)/gi,                    // "stepped out... X"
    /\b(?:is|are)\s+(?:now\s+)?at\s+(\d+)/gi,                // "is at X", "are at X"
    /\byou're\s+at\s+(\d+)/gi,                               // "you're at X"
    /\byou\s+(?:may|can|should)?\s+go\s+to\s+(\d+)/gi,       // "you may go to X"
    /\bthen\s+(?:go|proceed)\s+to\s+(\d+)/gi,                // "then go to X"
    /\b(?:to|and)\s+(?:go|proceed)\s+to\s+(\d+)/gi,          // "to go to X"
    /\((\d+)\)/g,                                            // Numbers in parentheses (X)
    /\bif[^\.]*?go\s+to\s+(\d+)/gi,                          // "If... go to X"
    /\bposition[^\.]*?go\s+to\s+(\d+)/gi,                    // "Position... go to X"
    /\bto\s+to\s+(\d+)/gi,                                   // Typo "to to X" (seen in some entries)
    /\bhe\s+is\s+(?:now\s+)?at\s+(\d+)/gi,                   // "he is at X", "he is now at X"
    /\bshe\s+is\s+(?:now\s+)?at\s+(\d+)/gi,                  // "she is at X", "she is now at X"
    /\bthey\s+are\s+(?:now\s+)?at\s+(\d+)/gi,                // "they are at X", "they are now at X"
    /\bis\s+now\s+at\s+(\d+)/gi,                             // "is now at X"
    /\bgive\s+him\s+that\s+and\s+go\s+to\s+(\d+)/gi,         // "give him that and go to X"
    /\bgoing\s+to\s+(\d+)/gi,                                // "going to X"
    /\band\s+(\d+)\s+if/gi,                                  // "and X if"
    /\go\s+to\s+(\d+)/gi,                                    // Catch any remaining "go to X"
  ];
  
  // Apply each pattern to find links
  for (const pattern of patterns) {
    while ((match = pattern.exec(node.text)) !== null) {
      const targetId = parseInt(match[1], 10);
      if (!isNaN(targetId) && !numbersToIgnore.has(targetId) && !node.outgoingEdges.includes(targetId)) {
        node.outgoingEdges.push(targetId);
      }
    }
  }
}

// Update incoming edges for all nodes
function updateIncomingEdges(graph: Graph): void {
  // First, clear all incoming edges
  for (const node of graph.nodes.values()) {
    node.incomingEdges = [];
  }
  
  // Then rebuild them
  for (const node of graph.nodes.values()) {
    for (const targetId of node.outgoingEdges) {
      let targetNode = graph.nodes.get(targetId);
      
      // Create placeholder nodes for targets that don't exist in the file
      if (!targetNode) {
        targetNode = {
          id: targetId,
          text: "Placeholder node",
          outgoingEdges: [],
          incomingEdges: []
        };
        graph.nodes.set(targetId, targetNode);
      }
      
      if (!targetNode.incomingEdges.includes(node.id)) {
        targetNode.incomingEdges.push(node.id);
      }
    }
  }
}

// Find nodes with no exits (dead ends)
function findDeadEnds(graph: Graph): number[] {
  return Array.from(graph.nodes.values())
    .filter(node => node.outgoingEdges.length === 0)
    .map(node => node.id)
    .sort((a, b) => a - b);
}

// Find nodes with only one entry
function findSingleEntryNodes(graph: Graph): number[] {
  return Array.from(graph.nodes.values())
    .filter(node => node.incomingEdges.length === 1)
    .map(node => node.id)
    .sort((a, b) => a - b);
}

// Find nodes with no entries (unreachable)
function findUnreachableNodes(graph: Graph): number[] {
  return Array.from(graph.nodes.values())
    .filter(node => node.incomingEdges.length === 0 && node.id !== 1) // Assuming node 1 is the start
    .map(node => node.id)
    .sort((a, b) => a - b);
}

// Generate DOT file for Graphviz visualization
function generateDotFile(graph: Graph): string {
  const deadEnds = new Set(findDeadEnds(graph));
  const singleEntry = new Set(findSingleEntryNodes(graph));
  const unreachable = new Set(findUnreachableNodes(graph));
  
  let dotContent = 'digraph DungeonMap {\n';
  dotContent += '  rankdir=LR;\n';  // Left to right layout
  dotContent += '  node [shape=box, fontname="Arial"];\n';
  
  // Add all nodes
  for (const node of graph.nodes.values()) {
    let style = '';
    
    if (deadEnds.has(node.id)) {
      style = ' [style=filled, fillcolor=red, label="' + node.id + ' (Dead End)"]';
    } else if (unreachable.has(node.id)) {
      style = ' [style=filled, fillcolor=orange, label="' + node.id + ' (Unreachable)"]';
    } else if (singleEntry.has(node.id)) {
      style = ' [style=filled, fillcolor=lightblue, label="' + node.id + ' (Single Entry)"]';
    } else {
      style = ' [label="' + node.id + '"]';
    }
    
    dotContent += `  node_${node.id}${style};\n`;
  }
  
  // Add all edges
  for (const node of graph.nodes.values()) {
    for (const targetId of node.outgoingEdges) {
      dotContent += `  node_${node.id} -> node_${targetId};\n`;
    }
  }
  
  dotContent += '}\n';
  return dotContent;
}

function generateHtmlVisualization(graph: Graph): string {
  const deadEnds = new Set(findDeadEnds(graph));
  const singleEntry = new Set(findSingleEntryNodes(graph));
  const unreachable = new Set(findUnreachableNodes(graph));

  // Create nodes and edges arrays for Cytoscape
  const nodes = Array.from(graph.nodes.values()).map(node => {
    let classes = '';
    if (deadEnds.has(node.id)) classes = 'deadEnd';
    else if (unreachable.has(node.id)) classes = 'unreachable';
    else if (singleEntry.has(node.id)) classes = 'singleEntry';
    
    return {
      data: { id: `node_${node.id}`, label: `${node.id}` },
      classes
    };
  });

  const edges = [];
  for (const node of graph.nodes.values()) {
    for (const targetId of node.outgoingEdges) {
      edges.push({
        data: {
          id: `edge_${node.id}_${targetId}`,
          source: `node_${node.id}`,
          target: `node_${targetId}`
        }
      });
    }
  }

  // Create HTML with embedded Cytoscape.js - with more robust script loading
  return `<!DOCTYPE html>
<html>
<head>
  <title>Dungeon Map Visualization</title>
  <!-- Load Cytoscape directly -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.23.0/cytoscape.min.js"></script>
  <style>
    /* Your existing styles */
  </style>
</head>
<body>
  <div class="controls">
    <!-- Your existing controls -->
  </div>
  <div id="cy-container">
    <div id="loading">Loading visualization...</div>
    <div id="cy"></div>
  </div>
  
  <script>
    // Store graph data as a global variable
    window.graphElements = {
      nodes: ${JSON.stringify(nodes)},
      edges: ${JSON.stringify(edges)}
    };
    
    // Initialize visualization when page loads
    window.onload = function() {
      // Check if Cytoscape loaded
      if (typeof cytoscape === 'undefined') {
        document.getElementById('loading').innerHTML = 
          'Error: Cytoscape library failed to load. Please download this file and open it locally.';
        return;
      }
      
      // Hide loading message
      document.getElementById('loading').style.display = 'none';
      
      // Initialize Cytoscape
      const cy = cytoscape({
        container: document.getElementById('cy'),
        elements: window.graphElements,
        style: [
          // Your existing style definitions
        ],
        layout: {
          // Your existing layout options
        }
      });
    };
  </script>
</body>
</html>`;
}

// Save analysis results to a file
function saveAnalysisResults(graph: Graph, filePath: string): void {
  const deadEnds = findDeadEnds(graph);
  const singleEntryNodes = findSingleEntryNodes(graph);
  const unreachableNodes = findUnreachableNodes(graph);
  
  let analysisText = 'Dungeon Map Analysis\n';
  analysisText += '=====================\n\n';
  
  analysisText += `Total Nodes: ${graph.nodes.size}\n\n`;
  
  analysisText += 'Dead Ends (Nodes with no exits):\n';
  analysisText += deadEnds.join(', ') + '\n\n';
  
  analysisText += 'Single Entry Nodes:\n';
  analysisText += singleEntryNodes.join(', ') + '\n\n';
  
  analysisText += 'Unreachable Nodes (No incoming edges, except start):\n';
  analysisText += unreachableNodes.join(', ') + '\n';
  
  fs.writeFileSync(filePath, analysisText);
}

// Main function to process the file
function processFile(filePath: string): void {
  try {
    // Read the file
    const text = fs.readFileSync(filePath, 'utf8');
    
    // Parse the instructions
    const graph = parseInstructions(text);
    
    // Create output directory if it doesn't exist
    const outputDir = path.join(path.dirname(filePath), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }
    
    // Generate DOT file for visualization
    const dotContent = generateDotFile(graph);
    fs.writeFileSync(path.join(outputDir, 'dungeon_map.dot'), dotContent);
    
    // Generate HTML visualization
    const htmlContent = generateHtmlVisualization(graph);
    fs.writeFileSync(path.join(outputDir, 'dungeon_map.html'), htmlContent);
    
    // Save analysis results
    saveAnalysisResults(graph, path.join(outputDir, 'dungeon_analysis.txt'));
    
    console.log('Processing complete! Files generated in the "output" directory:');
    console.log('- dungeon_map.dot (Graphviz format)');
    console.log('- dungeon_map.html (Interactive web visualization)');
    console.log('- dungeon_analysis.txt (Analysis results)');
    console.log('\nTo visualize the DOT file, install Graphviz and run:');
    console.log(`dot -Tpng ${path.join(outputDir, 'dungeon_map.dot')} -o ${path.join(outputDir, 'dungeon_map.png')}`);
    console.log('\nOr simply open dungeon_map.html in your browser for the interactive visualization!');
  } catch (error) {
    console.error('Error processing file:', error);
  }
}

// If running this script directly
if (require.main === module) {
  const filePath = process.argv[2] || 'DT1_steps.txt';
  processFile(filePath);
}

// Export functions for use in other modules
export {
  parseInstructions,
  findDeadEnds,
  findSingleEntryNodes,
  findUnreachableNodes,
  generateDotFile
};
