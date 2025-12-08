# Macaroni Matrix 🍝

A code dependency visualization tool using Design Structure Matrix (DSM) to help you understand and analyze your codebase structure.

## What is Macaroni Matrix?

Macaroni Matrix visualizes code dependencies in a hierarchical Design Structure Matrix format, making it easy to:
- Identify circular dependencies
- Understand module coupling
- View cyclomatic complexity scores
- Navigate through folder hierarchies
- Analyze code maintainability

## Features

- **Hierarchical DSM Visualization**: Interactive matrix showing file-to-file dependencies
- **Expand/Collapse Navigation**: Click on folders to drill down into your codebase structure
- **Cyclomatic Complexity**: View complexity scores on diagonal cells to identify complex code
- **Nested Folder Grouping**: Visual borders show hierarchical relationships between modules
- **Cell Merging**: Clean, compact display with merged cells for folder hierarchies
- **Yellow Theme**: Bright, easy-to-read interface

## Getting Started

### Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

### Usage

1. Enter a GitHub repository URL on the home page
2. Click "Analyze Repository"
3. Explore the interactive DSM:
   - **Rows/Columns**: Files and collapsed folders
   - **Numbers**: Dependency counts (how many times row depends on column)
   - **Diagonal (gray)**: Cyclomatic complexity score for that file
   - **Nested borders**: Show folder groupings
   - **Click folders**: Expand/collapse hierarchies

## Tech Stack

- **Next.js 16** with App Router
- **React 19** with hooks
- **TypeScript 5**
- **Tailwind CSS 4**

## Project Structure

```
app/
  ├── page.tsx              # Landing page with repo input
  ├── analyze/page.tsx      # DSM visualization page
  ├── components/
  │   └── HierarchicalDSM.tsx  # Main DSM component
  └── api/
      └── analyze/route.ts  # API endpoint (currently mock data)
```

## Cyclomatic Complexity

The diagonal cells show cyclomatic complexity scores:
- **1-5**: Low complexity (green in future color-coding)
- **6-10**: Moderate complexity (yellow)
- **11-20**: High complexity (orange)
- **20+**: Very high complexity (red)

## Future Enhancements

- Actual GitHub repository analysis
- Real dependency calculation from code parsing
- Color coding for complexity levels
- Export/share functionality
- Historical analysis and trends

## License

MIT
