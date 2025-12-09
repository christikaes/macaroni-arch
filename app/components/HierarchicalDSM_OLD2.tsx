"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { MultiGrid } from "react-virtualized";
import type { DSMData } from "~/types/dsm";

// Configuration constants
const ZOOM_THRESHOLD_SHOW_HEADERS = 0.8; // Zoom level at which headers become visible

interface CellProps {
  columnIndex: number;
  rowIndex: number;
  key: string;
  style: React.CSSProperties;
}

interface DSMMatrixProps {
  data: DSMData;
}

interface DisplayItem {
  path: string;
  displayName: string;
  indent: number;
  isDirectory: boolean;
  fileIndices: number[];
  id: string;
  showInMatrix: boolean;
}

export default function DSMMatrix({ data }: DSMMatrixProps) {
  const { files } = data;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [viewportSize, setViewportSize] = useState({ width: 1000, height: 800 });
  const [zoom, setZoom] = useState(0.1);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const gridRef = useRef<MultiGrid>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef({ scrollLeft: 0, scrollTop: 0 });
  const zoomRef = useRef(zoom);
  const recomputeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Update zoom ref whenever zoom changes
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const fileList = useMemo(() => Object.keys(files), [files]);

  // Build hierarchical display items
  const displayItems = useMemo(() => {
    const items: DisplayItem[] = [];
    
    interface TreeNode {
      path: string;
      name: string;
      isFile: boolean;
      children: Map<string, TreeNode>;
      fileIndices: Set<number>;
    }
    
    const root: TreeNode = {
      path: "",
      name: "",
      isFile: false,
      children: new Map(),
      fileIndices: new Set(),
    };

    fileList.forEach((file, idx) => {
      const parts = file.split("/");
      let current = root;
      
      parts.forEach((part, i) => {
        current.fileIndices.add(idx);
        
        if (!current.children.has(part)) {
          current.children.set(part, {
            path: parts.slice(0, i + 1).join("/"),
            name: part,
            isFile: i === parts.length - 1,
            children: new Map(),
            fileIndices: new Set(),
          });
        }
        current = current.children.get(part)!;
      });
      current.fileIndices.add(idx);
    });

    const traverse = (node: TreeNode, indent: number, parentId: string = "") => {
      const sortedChildren = Array.from(node.children.entries()).sort(
        ([nameA], [nameB]) => nameA.localeCompare(nameB)
      );

      sortedChildren.forEach(([, child], index) => {
        const id = parentId ? `${parentId}.${index + 1}` : `${index + 1}`;
        const isExpanded = !child.isFile && !collapsed.has(child.path);
        
        items.push({
          path: child.path,
          displayName: child.name,
          indent,
          isDirectory: !child.isFile,
          fileIndices: Array.from(child.fileIndices),
          id,
          showInMatrix: child.isFile || !isExpanded,
        });

        if (isExpanded) {
          traverse(child, indent + 1, id);
        }
      });
    };

    traverse(root, 0);
    return items;
  }, [fileList, collapsed]);

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

  // Calculate minimum zoom to fit entire matrix in viewport
  const minZoom = useMemo(() => {
    // Account for margins and controls: 100px margin + 250px for header/controls
    const availableWidth = viewportSize.width - 100;
    const availableHeight = viewportSize.height - 250;
    
    // Calculate total matrix size at zoom=1
    const totalWidth = 500 + 50 + (matrixItems.length * 40); // path + id + matrix columns
    const totalHeight = 100 + (matrixItems.length * 40); // header + matrix rows
    
    // Calculate zoom needed to fit
    const zoomForWidth = availableWidth / totalWidth;
    const zoomForHeight = availableHeight / totalHeight;
    
    // Use the smaller zoom to ensure both dimensions fit, but never less than the initial zoom (0.1)
    // This ensures the minimum zoom is based on the default zoom
    return Math.max(0.1, Math.min(zoomForWidth, zoomForHeight));
  }, [matrixItems.length, viewportSize]);

  // Update zoom to minZoom if it's less (when matrix shrinks)
  if (zoom < minZoom) {
    setZoom(minZoom);
  }

  // Reset grid cache when zoom or items change, but preserve scroll position
  useEffect(() => {
    if (gridRef.current) {
      // Clear any pending recompute
      if (recomputeTimeoutRef.current) {
        clearTimeout(recomputeTimeoutRef.current);
      }
      
      // Store current scroll position before recomputing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const grid = gridRef.current as any;
      const state = grid.state || {};
      if (state.scrollLeft !== undefined) scrollPositionRef.current.scrollLeft = state.scrollLeft;
      if (state.scrollTop !== undefined) scrollPositionRef.current.scrollTop = state.scrollTop;
      
      // Debounce recompute during zoom (immediate for matrixItems changes)
      const delay = matrixItems ? 0 : 16; // ~60fps
      
      recomputeTimeoutRef.current = setTimeout(() => {
        if (gridRef.current) {
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
      }, delay);
    }
    
    return () => {
      if (recomputeTimeoutRef.current) {
        clearTimeout(recomputeTimeoutRef.current);
      }
    };
  }, [zoom, matrixItems]);

  // Helper to get all ancestor folder paths for an item (from deepest to shallowest)
  const getAncestorFolders = useCallback((item: DisplayItem): string[] => {
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
    
    return ancestors;
  }, []);

  // Helper to render hierarchical path
  const renderPathWithConnectors = useCallback((item: DisplayItem) => {
    const pathParts = item.path.split("/");
    
    return (
      <div className="flex items-center whitespace-nowrap" style={{ fontFamily: "var(--font-geist-mono)", fontSize: zoom < ZOOM_THRESHOLD_SHOW_HEADERS ? "0" : zoom < 0.8 ? "10px" : "12px" }}>
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
  }, [collapsed, toggleCollapse, zoom]);

  // Handle pinch-to-zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastTouchDistance = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        lastTouchDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );

        if (lastTouchDistance > 0) {
          const delta = currentDistance / lastTouchDistance;
          setZoom(prev => Math.max(minZoom, Math.min(1, prev * delta)));
        }

        lastTouchDistance = currentDistance;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(prev => Math.max(minZoom, Math.min(1, prev * delta)));
      }
    };

    container.addEventListener('touchstart', handleTouchStart);
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('wheel', handleWheel);
    };
  }, [minZoom]);

  // Track viewport size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      setViewportSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    // Initial size
    updateSize();

    // Update on resize
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Cell renderer - uses ref for zoom to avoid recreation
  const Cell = useCallback(({ columnIndex, rowIndex, key, style }: CellProps) => {
    const currentZoom = zoomRef.current;
    const showHeaders = currentZoom >= ZOOM_THRESHOLD_SHOW_HEADERS;
    const pathColIndex = 0;
    const idColIndex = 1;
    const matrixStartCol = showHeaders ? 2 : 0;
    
    // Adjust indices when headers are hidden
    const adjustedRowIndex = showHeaders ? rowIndex : rowIndex + 1;
    const adjustedColumnIndex = showHeaders ? columnIndex : columnIndex + 2;
    
    // Dynamic border width based on zoom
    const cellBorderWidth = currentZoom < 0.3 ? 0.5 : currentZoom < ZOOM_THRESHOLD_SHOW_HEADERS ? 1 : 1;

    // Header row (only when headers are visible)
    if (showHeaders && adjustedRowIndex === 0) {
      // Path column header
      if (adjustedColumnIndex === pathColIndex) {
        return (
          <div key={key} style={{ ...style, borderWidth: cellBorderWidth }} className="bg-yellow-100 border-gray-300 flex items-center justify-center font-semibold">
            <span style={{ fontSize: currentZoom < ZOOM_THRESHOLD_SHOW_HEADERS ? "8px" : "10px" }}></span>
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
          <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: currentZoom < ZOOM_THRESHOLD_SHOW_HEADERS ? "8px" : "10px" }}>
            {currentZoom >= ZOOM_THRESHOLD_SHOW_HEADERS && item.id}
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

    // ID column (only when headers visible)
    if (showHeaders && adjustedColumnIndex === idColIndex) {
      return (
        <div key={key} style={{ ...style, borderWidth: cellBorderWidth, borderRightWidth: 2 }} className="bg-yellow-50 border-gray-300 border-r-black flex items-center justify-center text-xs px-1" title={rowItem.path}>
          <span style={{ fontSize: currentZoom < ZOOM_THRESHOLD_SHOW_HEADERS ? "0" : currentZoom < 0.8 ? "8px" : "10px" }}>
            {currentZoom >= ZOOM_THRESHOLD_SHOW_HEADERS && rowItem.id}
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
    
    // Dynamic border thickness based on zoom
    const borderWidth = currentZoom < 0.3 ? 1 : 2;
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
        <span style={{ fontSize: currentZoom < 0.6 ? "0" : currentZoom < 0.8 ? "8px" : "10px" }}>
          {isMainDiagonal && complexityScore !== undefined ? complexityScore : (!isMainDiagonal && hasDependency ? depCount : "")}
        </span>
      </div>
    );
  }, [matrixItems, getDependencyCount, fileList, files, renderPathWithConnectors, getAncestorFolders, getDependencyColor, hoveredCell, tooltip]);

  const showHeaders = zoom >= ZOOM_THRESHOLD_SHOW_HEADERS;
  const rowCount = matrixItems.length + (showHeaders ? 1 : 0); // +1 for header when visible
  const columnCount = matrixItems.length + (showHeaders ? 2 : 0); // path col + ID col + matrix cols when visible
  
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
          key={`grid-${zoom >= ZOOM_THRESHOLD_SHOW_HEADERS ? 'fixed' : 'nonfixed'}`}
          ref={gridRef}
          columnCount={columnCount}
          columnWidth={({ index }: { index: number }) => {
            if (zoom >= ZOOM_THRESHOLD_SHOW_HEADERS) {
              if (index === 0) return PATH_CELL_WIDTH;
              if (index === 1) return ID_CELL_WIDTH;
            }
            return CELL_SIZE;
          }}
          fixedColumnCount={zoom >= ZOOM_THRESHOLD_SHOW_HEADERS ? 2 : 0}
          fixedRowCount={zoom >= ZOOM_THRESHOLD_SHOW_HEADERS ? 1 : 0}
          height={actualHeight}
          rowCount={rowCount}
          rowHeight={({ index }: { index: number }) => (zoom >= ZOOM_THRESHOLD_SHOW_HEADERS && index === 0) ? HEADER_CELL_SIZE : CELL_SIZE}
          width={actualWidth}
          overscanRowCount={10}
          overscanColumnCount={5}
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
