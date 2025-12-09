# DSM Component Structure

This directory contains the refactored DSM (Dependency Structure Matrix) component, split into smaller, more manageable pieces.

## Structure

```
DSM/
├── index.tsx                  # Main DSM component
├── DSM.module.css            # All CSS styles
├── MatrixHeaders.tsx         # Column and row headers
├── FolderRectangles.tsx      # Folder background rectangles
├── HoverHighlights.tsx       # Row/column hover overlays
├── MatrixRows.tsx            # Matrix rows with hierarchy and cells
├── InfoOverlay.tsx           # Bottom info panel
└── hooks/
    ├── index.ts              # Hook exports
    ├── useDSMData.ts         # Data processing and filtering
    ├── useColorGradients.ts  # Color gradient calculations
    ├── useHierarchyCache.ts  # Hierarchy cell info caching
    └── useFolderHelpers.ts   # Folder path utilities
```

## Components

### Main Component (`index.tsx`)
- Orchestrates all sub-components
- Manages state (collapsed folders, hover states)
- Integrates custom hooks

### `MatrixHeaders`
- Renders hierarchy column headers
- Renders ID column header
- Renders matrix column headers with hover handlers

### `FolderRectangles`
- Calculates folder bounding boxes
- Renders clickable folder overlays
- Handles drag detection for folder expand/collapse

### `HoverHighlights`
- Renders row/column highlighting overlays
- Responds to cell and header hover states

### `MatrixRows`
- Renders hierarchy cells (file/folder paths)
- Renders ID cells
- Renders matrix cells with dependencies
- Handles folder borders and cell styling

### `InfoOverlay`
- Fixed bottom panel showing hover information
- Displays file metrics (complexity, LOC)
- Displays dependency information
- Shows folder information

## Hooks

### `useDSMData`
- Processes raw DSM data
- Filters display items based on collapsed state
- Pre-calculates dependency lookups
- Calculates matrix bounds (min/max deps, complexity)

### `useColorGradients`
- Generates blue→purple gradient for dependencies
- Generates grey gradient for complexity scores

### `useHierarchyCache`
- Caches hierarchy cell calculations
- Determines cell content, rowspan, and rotation
- Optimizes rendering performance

### `useFolderHelpers`
- Utility for getting ancestor folder paths
- Used by folder rectangles and border detection

## CSS Module

All styles are centralized in `DSM.module.css`:
- Grid layout styles
- Cell styles (headers, hierarchy, matrix)
- Interactive states (hover, clickable)
- Info overlay styles
- Color and typography

## Usage

```tsx
import DSM from "~/components/DSM";
import { DSMData } from "~/types/dsm";

function AnalyzePage() {
  const [dsmData, setDsmData] = useState<DSMData | null>(null);
  
  return <DSM data={dsmData} />;
}
```

## Benefits of Refactoring

1. **Maintainability**: Smaller, focused files are easier to understand and modify
2. **Reusability**: Hooks can be reused in other components if needed
3. **Testing**: Individual components and hooks can be tested in isolation
4. **Performance**: Memoization and caching are isolated in custom hooks
5. **Clarity**: CSS is centralized and separated from logic
