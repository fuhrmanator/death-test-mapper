# Death Test Mapper

## Overview

Death Test Mapper is a tool for visualizing and analyzing the structure of the Death Test dungeon adventure. It parses the numbered paragraphs and their connections to create a comprehensive map of the dungeon, identifying key pathways, dead ends, and room relationships.

## Features

- Extracts connections between numbered sections in the adventure
- Creates a graph representation of the dungeon structure
- Identifies dead ends, single-entry points, and unreachable areas
- Visualizes rooms with appropriate color coding
- Maps intersections and pathways between rooms

## Map Visualization

There are two main visualizations generated:
1. **Dungeon Map**: A complete map of the dungeon showing all connections and relationships of the numbered paragraphs.
2. **Room Map**: A detailed map of the rooms, showing how they connect to each other. This was created manually using PlantUML/GraphViz for clarity.

<details>
<summary><b>Spoiler (click to see the maps)</b></summary>

<!-- Once you generate the SVG/PNG files, place them here -->
<div>
  <!-- Example of how to embed the SVG -->
  <p>SVG Version:</p>
  <img src="output/dungeon_map.svg" alt="Death Test Dungeon Map SVG" width="100%">
  
  <!-- Example of how to embed the PNG -->
  <p>PNG Version:</p>
  <img src="output/dungeon_map.png" alt="Death Test Dungeon Map PNG" width="100%">

<p>HTML Version (Interactive):</p>
<p><strong>Important:</strong> The interactive visualization may not work properly when viewed through HTMLPreview. For the best experience:</p>
<ol>
  <li><a href="https://github.com/fuhrmanator/death-test-mapper/blob/main/output/dungeon_map.html">Download the HTML file</a> and open it locally in your browser</li>
  <li>Or clone the repository and open the file directly</li>
</ol>

  <p>Room Connections (created by hand using GraphViz):</p>
  <img src="output/room-map-dot.svg" alt="Death Test Room Connections" width="100%">
</div>

</details>

## How to Use

1. Install dependencies:

```bash
npm init -y npm install typescript ts-node @types/node --save-dev
```

2. Run the TypeScript configuration:

```bash
npx tsc --init
```

3. Run the mapper:

```bash
npx ts-node dungeon-mapper.ts
```

4. The output will be generated in the `output` directory

- `dungeon_map.dot` - GraphViz DOT file
- `dungeon_map.svg` - SVG visualization (if GraphViz is installed)
- `dungeon_map.html` - Interactive web visualization
- `dungeon_analysis.txt` - Analysis report

## Viewing the Room Map

The room map can be generated from the `room-map-dot.puml` file (which was created by hand) using PlantUML:
- Install PlantUML and/or the extension in VS Code
- Open the file and preview it
- Or use an online PlantUML server
- Or convert it to SVG locally:

```bash
plantuml -Tsvg room-map-dot.puml -o output
```

## Analysis Features

- **Dead Ends**: Rooms with no exits
- **Single Entry Nodes**: Rooms that can only be reached from one other room
- **Unreachable Nodes**: Rooms that cannot be reached from the start

## License

MIT License
