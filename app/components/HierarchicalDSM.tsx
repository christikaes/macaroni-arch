"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { MultiGrid } from "react-virtualized";
import type { DSMData, DisplayItem } from "~/types/dsm";

interface CellProps {
  columnIndex: number;
  rowIndex: number;
  key: string;
  style: React.CSSProperties;
}

interface DSMMatrixProps {
  data: DSMData;
}

export default function DSMMatrix({ data }: DSMMatrixProps) {
  const { files, displayItems: serverDisplayItems, fileList } = data;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const gridRef = useRef<MultiGrid>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef({ scrollLeft: 0, scrollTop: 0 });
  
  // Always use full zoom (1.0) - no zooming functionality
  const zoom = 1.0;

  // Build displayItems with collapse state applied
  const displayItems = useMemo(() => {
    if (!serverDisplayItems) return [];
    
    const items: DisplayItem[] = [];
    let skipDepth: number | null = null; // Track depth below which to skip items
    
    serverDisplayItems.forEach((item) => {
      // If we're skipping and current item is still deeper than skip threshold, skip it
      if (skipDepth !== null && item.indent > skipDepth) {
        return;
      }
      
      // We've reached same or shallower level, stop skipping
      if (skipDepth !== null && item.indent <= skipDepth) {
        skipDepth = null;
      }
      
      const isExpanded = !item.isDirectory || !collapsed.has(item.path);
      
      items.push({
        ...item,
        showInMatrix: item.isDirectory ? !isExpanded : true,
      });
      
      // If this is a collapsed directory, start skipping all children (deeper items)
      if (item.isDirectory && !isExpanded) {
        skipDepth = item.indent;
      }
    });
    
    return items;
  }, [serverDisplayItems, collapsed]);

  const toggleCollapse = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Pre-calculate dependency counts
  const dependencyLookup = useMemo(() => {
    const lookup = new Map<string, number>();
    
    fileList.forEach((fromFile) => {
      const deps = files[fromFile]?.dependencies || [];
      deps.forEach((dep) => {
        const key = `${fromFile}->${dep.fileName}`;
        lookup.set(key, dep.dependencies);
      });
    });
    
    return lookup;
  }, [fileList, files]);

  const getDependencyCount = useCallback((fromIndices: number[], toIndices: number[]): number => {
    let total = 0;
    fromIndices.forEach((fromIdx) => {
      const fromFile = fileList[fromIdx];
      toIndices.forEach((toIdx) => {
        const toFile = fileList[toIdx];
        const key = `${fromFile}->${toFile}`;
        const count = dependencyLookup.get(key);
        if (count) {
          total += count;
        }
      });
    });
    return total;
  }, [fileList, dependencyLookup]);

  // Calculate min and max dependency counts for color scaling
  const { minDependencies, maxDependencies } = useMemo(() => {
    let min = Infinity;
    let max = 0;
    
    dependencyLookup.forEach((count) => {
      if (count > 0) {
        min = Math.min(min, count);
        max = Math.max(max, count);
      }
    });
    
    return { 
      minDependencies: min === Infinity ? 1 : min, 
      maxDependencies: max || 1 
    };
  }, [dependencyLookup]);

  // Helper function to get color based on dependency count (green -> blue)
  const getDependencyColor = useCallback((count: number, isCyclical: boolean): string => {
    if (count === 0) return '';
    
    // Red for cyclical dependencies
    if (isCyclical) {
      return 'rgb(239, 68, 68)'; // Bright red
    }
    
    // Normalize to 0-1 range
    const normalized = (count - minDependencies) / (maxDependencies - minDependencies);
    
    // Green (34, 197, 94) -> Blue (59, 130, 246)
    // As count increases, we go from green (few) to blue (many)
    const red = Math.round(34 + (59 - 34) * normalized);
    const green = Math.round(197 + (130 - 197) * normalized);
    const blue = Math.round(94 + (246 - 94) * normalized);
    
    return `rgb(${red}, ${green}, ${blue})`;
  }, [minDependencies, maxDependencies]);

  // Only show files and collapsed folders in the matrix
  const matrixItems = useMemo(() => {
    return displayItems.filter(item => item.showInMatrix);
  }, [displayItems]);

  // Base cell size (will be scaled by zoom)
  const BASE_CELL_SIZE = 40;
  
  // Memoize cell size calculations
  const cellSizes = useMemo(() => ({
    CELL_SIZE: Math.round(BASE_CELL_SIZE * zoom),
    HEADER_CELL_SIZE: Math.round(100 * zoom),
    PATH_CELL_WIDTH: Math.round(500 * zoom),
    ID_CELL_WIDTH: Math.round(50 * zoom),
  }), [zoom]);
  
  const { CELL_SIZE, HEADER_CELL_SIZE, PATH_CELL_WIDTH, ID_CELL_WIDTH } = cellSizes;

  // Reset grid cache when items change, but preserve scroll position
  useEffect(() => {
    if (gridRef.current) {
      // Store current scroll position before recomputing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const grid = gridRef.current as any;
      const state = grid.state || {};
      if (state.scrollLeft !== undefined) scrollPositionRef.current.scrollLeft = state.scrollLeft;
      if (state.scrollTop !== undefined) scrollPositionRef.current.scrollTop = state.scrollTop;
      
      gridRef.current.recomputeGridSize();
      
      // Restore scroll position after recompute
      requestAnimationFrame(() => {
        if (gridRef.current) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const grid = gridRef.current as any;
          // MultiGrid uses forceUpdateGrids to sync scroll
          if (grid._bottomRightGrid) {
            grid._bottomRightGrid.scrollToPosition(scrollPositionRef.current);
          }
        }
      });
    }
  }, [matrixItems]);

  // Helper to get all ancestor folder paths for an item (from deepest to shallowest)
  const ancestorCacheRef = useRef(new Map<string, string[]>());
  
  const getAncestorFolders = useCallback((item: DisplayItem): string[] => {
    // Check cache first
    if (ancestorCacheRef.current.has(item.path)) {
      return ancestorCacheRef.current.get(item.path)!;
    }
    
    const parts = item.path.split("/");
    const ancestors: string[] = [];
    
    if (!item.isDirectory) {
      // For files, add parent directory
      ancestors.push(parts.slice(0, -1).join("/"));
      // Add all parent directories up the tree
      for (let i = parts.length - 2; i > 0; i--) {
        ancestors.push(parts.slice(0, i).join("/"));
      }
    } else {
      // For collapsed directories in matrix, add itself and parents
      ancestors.push(item.path);
      for (let i = parts.length - 1; i > 0; i--) {
        ancestors.push(parts.slice(0, i).join("/"));
      }
    }
    
    ancestorCacheRef.current.set(item.path, ancestors);
    return ancestors;
  }, []);

  // Helper to render hierarchical path
  const renderPathWithConnectors = useCallback((item: DisplayItem) => {
    const pathParts = item.path.split("/");
    
    return (
      <div className="flex items-center whitespace-nowrap" style={{ fontFamily: "var(--font-geist-mono)", fontSize: "12px" }}>
        {pathParts.map((part, idx) => {
          const folderPath = pathParts.slice(0, idx + 1).join("/");
          const isLast = idx === pathParts.length - 1;
          const isFolder = !isLast || item.isDirectory;
          
          return (
            <span key={idx} className="inline-flex items-center">
              {idx > 0 && <span className="text-gray-400">/</span>}
              {isFolder ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCollapse(folderPath);
                  }}
                  className="hover:bg-yellow-200 px-0.5 rounded text-blue-600 hover:text-blue-800 font-medium"
                  title={folderPath}
                >
                  {part}{collapsed.has(folderPath) ? "/..." : ""}
                </button>
              ) : (
                <span className="px-0.5">{part}</span>
              )}
            </span>
          );
        })}
      </div>
    );
  }, [collapsed, toggleCollapse]);

  // Cell renderer
  const Cell = useCallback(({ columnIndex, rowIndex, key, style }: CellProps) => {
    const showHeaders = true; // Always show headers
    const pathColIndex = 0;
    const idColIndex = 1;
    const matrixStartCol = 2;
    
    const adjustedRowIndex = rowIndex;
    const adjustedColumnIndex = columnIndex;
    
    const cellBorderWidth = 1;

    // Header row (only when headers are visible)
    if (showHeaders && adjustedRowIndex === 0) {
      // Path column header
      if (adjustedColumnIndex === pathColIndex) {
        return (
          <div key={key} style={{ ...style, borderWidth: cellBorderWidth }} className="bg-yellow-100 border-gray-300 flex items-center justify-center font-semibold">
            <span style={{ fontSize: "10px" }}></span>
          </div>
        );
      }
      // ID column header
      if (adjustedColumnIndex === idColIndex) {
        return <div key={key} style={{ ...style, borderWidth: cellBorderWidth, borderRightWidth: 2 }} className="bg-yellow-100 border-gray-300 border-r-black" />;
      }
      // Matrix column headers (vertical IDs)
      const matrixColIdx = adjustedColumnIndex - matrixStartCol;
      const item = matrixItems[matrixColIdx];
      return (
        <div key={key} style={{ ...style, borderWidth: cellBorderWidth }} className="bg-yellow-100 border-gray-300 flex items-center justify-center" title={item.path}>
          <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: "10px" }}>
            {item.id}
          </div>
        </div>
      );
    }

    const rowItem = matrixItems[adjustedRowIndex - 1];

    // Path column - hierarchical breadcrumb style (only when headers visible)
    if (showHeaders && adjustedColumnIndex === pathColIndex) {
      return (
        <div 
          key={key}
          style={{ ...style, overflow: 'hidden', borderWidth: cellBorderWidth }} 
          className="bg-yellow-50 border-gray-300 flex items-center px-2"
          title={rowItem.path}
        >
          {renderPathWithConnectors(rowItem)}
        </div>
      );
    }

    // ID column
    if (adjustedColumnIndex === idColIndex) {
      return (
        <div key={key} style={{ ...style, borderWidth: cellBorderWidth, borderRightWidth: 2 }} className="bg-yellow-50 border-gray-300 border-r-black flex items-center justify-center text-xs px-1" title={rowItem.path}>
          <span style={{ fontSize: "10px" }}>
            {rowItem.id}
          </span>
        </div>
      );
    }

    // Matrix cells
    const matrixColIdx = adjustedColumnIndex - matrixStartCol;
    const colItem = matrixItems[matrixColIdx];
    
    // Safety check: ensure both items exist
    if (!rowItem || !colItem) {
      return <div key={key} style={style} className="bg-white border-gray-300" />;
    }
    
    const isMainDiagonal = rowItem.path === colItem.path;
    const depCount = getDependencyCount(rowItem.fileIndices, colItem.fileIndices);
    const hasDependency = depCount > 0;
    
    const reverseDepCount = !isMainDiagonal ? getDependencyCount(colItem.fileIndices, rowItem.fileIndices) : 0;
    const isCyclical = hasDependency && reverseDepCount > 0;
    
    // Check if this cell's row or column is hovered
    const isRowHovered = hoveredCell && hoveredCell.row === adjustedRowIndex - 1;
    const isColHovered = hoveredCell && hoveredCell.col === matrixColIdx;
    const isHovered = isRowHovered || isColHovered;
    
    let complexityScore: number | undefined;
    if (isMainDiagonal && rowItem.fileIndices.length === 1) {
      const filePath = fileList[rowItem.fileIndices[0]];
      complexityScore = files[filePath]?.complexity;
    }

    // Calculate borders and backgrounds based on common ancestor folders
    const rowAncestors = getAncestorFolders(rowItem);
    const colAncestors = getAncestorFolders(colItem);
    const commonAncestors = rowAncestors.filter(ancestor => colAncestors.includes(ancestor));
    
    const borderWidth = 2;
    const borderClasses: string[] = [];
    
    if (commonAncestors.length > 0) {
      const deepestCommon = commonAncestors[0];
      
      const rowIdx = adjustedRowIndex - 1;
      const colIdx = matrixColIdx;
      
      const isFirstRow = rowIdx === 0 || !getAncestorFolders(matrixItems[rowIdx - 1]).includes(deepestCommon);
      const isLastRow = rowIdx === matrixItems.length - 1 || !getAncestorFolders(matrixItems[rowIdx + 1]).includes(deepestCommon);
      const isFirstCol = colIdx === 0 || !getAncestorFolders(matrixItems[colIdx - 1]).includes(deepestCommon);
      const isLastCol = colIdx === matrixItems.length - 1 || !getAncestorFolders(matrixItems[colIdx + 1]).includes(deepestCommon);
      
      // Subtle outline at boundaries (gray instead of black, fully opaque)
      if (isFirstRow) borderClasses.push(`border-t-[${borderWidth}px] border-t-black`);
      if (isLastRow) borderClasses.push(`border-b-[${borderWidth}px] border-b-black`);
      if (isFirstCol) borderClasses.push(`border-l-[${borderWidth}px] border-l-black`);
      if (isLastCol) borderClasses.push(`border-r-[${borderWidth}px] border-r-black`);
    }
    
    // Get dependency color if there's a dependency
    const dependencyColor = hasDependency ? getDependencyColor(depCount, isCyclical) : null;
    
    // Determine which background to apply
    let cellBackgroundColor = '';
    if (isMainDiagonal) {
      // Diagonal cells remain gray
      cellBackgroundColor = '';
    } else if (dependencyColor) {
      // Dependency cells get the gradient color
      cellBackgroundColor = dependencyColor;
    } else {
      // All other cells (including nesting) get white background
      cellBackgroundColor = 'white';
    }
    
    // Apply hover highlighting for white cells
    if (isHovered && cellBackgroundColor === 'white') {
      cellBackgroundColor = '#e0f2fe';
    }

    return (
      <div
        key={key}
        style={{ 
          ...style, 
          borderWidth: cellBorderWidth,
          backgroundColor: cellBackgroundColor || undefined,
        }}
        className={`border-gray-300 flex items-center justify-center ${
          isMainDiagonal
            ? "bg-gray-300"
            : hasDependency
            ? isCyclical
              ? "text-white font-bold cursor-pointer"
              : "text-white font-semibold cursor-pointer"
            : "bg-white"
        } ${borderClasses.join(" ")}`}
        onMouseEnter={(e) => {
          setHoveredCell({ row: adjustedRowIndex - 1, col: matrixColIdx });
          const tooltipText = isMainDiagonal
            ? `${rowItem.path}${complexityScore !== undefined ? ` - Complexity: ${complexityScore}` : ''}`
            : hasDependency
            ? `${rowItem.path} → ${colItem.path}: ${depCount} dependencies${isCyclical ? ' ⚠️ CYCLICAL' : ''}`
            : '';
          if (tooltipText) {
            setTooltip({ x: e.clientX, y: e.clientY, text: tooltipText });
          }
        }}
        onMouseMove={(e) => {
          if (tooltip) {
            setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
          }
        }}
        onMouseLeave={() => {
          setHoveredCell(null);
          setTooltip(null);
        }}
      >
        <span style={{ fontSize: "10px" }}>
          {isMainDiagonal && complexityScore !== undefined ? complexityScore : (!isMainDiagonal && hasDependency ? depCount : "")}
        </span>
      </div>
    );
  }, [matrixItems, getDependencyCount, fileList, files, renderPathWithConnectors, getAncestorFolders, getDependencyColor, hoveredCell, tooltip]);

  const showHeaders = true;
  const rowCount = matrixItems.length + 1; // +1 for header
  const columnCount = matrixItems.length + 2; // path col + ID col + matrix cols
  
  // Calculate actual width needed for the grid
  const gridWidth = (showHeaders ? PATH_CELL_WIDTH + ID_CELL_WIDTH : 0) + (matrixItems.length * CELL_SIZE);
  const maxWidth = typeof window !== 'undefined' ? window.innerWidth - 100 : 1200; // Leave some margin
  const actualWidth = Math.min(gridWidth, maxWidth);
  
  // Calculate actual height needed for the grid
  const gridHeight = HEADER_CELL_SIZE + (matrixItems.length * CELL_SIZE);
  const maxHeight = typeof window !== 'undefined' ? window.innerHeight - 100 : 600; // Leave space for header
  const actualHeight = Math.min(gridHeight, maxHeight);

  return (
    <div className="flex flex-col" style={{ width: `${actualWidth}px` }}>
      {tooltip && (
        <div 
          className="fixed z-50 px-2 py-1 bg-gray-900 text-white text-xs rounded shadow-lg pointer-events-none whitespace-nowrap"
          style={{ 
            left: `${tooltip.x + 10}px`, 
            top: `${tooltip.y + 10}px`,
            maxWidth: '400px',
          }}
        >
          {tooltip.text}
        </div>
      )}
      <div ref={containerRef} className="flex-1 overflow-hidden">
        <MultiGrid
          key="grid-fixed"
          ref={gridRef}
          columnCount={columnCount}
          columnWidth={({ index }: { index: number }) => {
            if (index === 0) return PATH_CELL_WIDTH;
            if (index === 1) return ID_CELL_WIDTH;
            return CELL_SIZE;
          }}
          fixedColumnCount={2}
          fixedRowCount={1}
          height={actualHeight}
          rowCount={rowCount}
          rowHeight={({ index }: { index: number }) => index === 0 ? HEADER_CELL_SIZE : CELL_SIZE}
          width={actualWidth}
          overscanRowCount={10}
          overscanColumnColumn={5}
          cellRenderer={Cell}
          classNameTopLeftGrid="bg-yellow-100"
          classNameTopRightGrid="bg-yellow-100"
          classNameBottomLeftGrid="bg-yellow-50"
          enableFixedColumnScroll
          enableFixedRowScroll
          hideTopRightGridScrollbar
          hideBottomLeftGridScrollbar
        />
      </div>
    </div>
  );
}
