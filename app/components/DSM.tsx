"use client";

import { useState, useMemo, Fragment, useCallback, useTransition } from "react";
import { DSMData, DisplayItem } from "~/types/dsm";
import Viewport from "./Viewport";

interface DSMMatrixProps {
  data: DSMData;
}

export default function DSMMatrix({ data }: DSMMatrixProps) {
  const { files, displayItems: serverDisplayItems, fileList } = data;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  
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
    startTransition(() => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
    });
  }, []);

  // Pre-calculate dependency counts in a lookup map for O(1) access
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

  // Calculate aggregated dependency count between two items using pre-calculated lookup
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

  // Calculate min and max dependency counts for gradient
  const { minDeps, maxDeps } = useMemo(() => {
    let min = Infinity;
    let max = 0;
    
    dependencyLookup.forEach((count) => {
      if (count > 0) {
        min = Math.min(min, count);
        max = Math.max(max, count);
      }
    });
    
    return { minDeps: min === Infinity ? 1 : min, maxDeps: max || 1 };
  }, [dependencyLookup]);

  // Calculate max complexity score for grey gradient on diagonal
  const maxComplexity = useMemo(() => {
    let max = 0;
    fileList.forEach((filePath) => {
      const complexity = files[filePath]?.complexity;
      if (complexity !== undefined) {
        max = Math.max(max, complexity);
      }
    });
    return max || 1;
  }, [fileList, files]);

  // Get background color based on dependency count (blue -> purple gradient)
  const getDependencyColor = useCallback((count: number): string => {
    if (count === 0) return 'rgb(255, 255, 255)'; // white for no dependencies
    
    // Normalize to 0-1 range
    const normalized = (count - minDeps) / (maxDeps - minDeps);
    
    // Blue (59, 130, 246) -> Purple (147, 51, 234)
    const red = Math.round(59 + (147 - 59) * normalized);
    const green = Math.round(130 - (130 - 51) * normalized);
    const blue = Math.round(246 - (246 - 234) * normalized);
    
    return `rgb(${red}, ${green}, ${blue})`;
  }, [minDeps, maxDeps]);

  // Get background color for complexity scores (light grey -> dark grey gradient)
  const getComplexityColor = useCallback((complexity: number): string => {
    if (complexity === 0) return 'rgb(243, 244, 246)'; // light grey for 0
    
    // Normalize to 0-1 range
    const normalized = complexity / maxComplexity;
    
    // Light grey (243, 244, 246) -> Dark grey (55, 65, 81)
    const value = Math.round(243 - (243 - 55) * normalized);
    
    return `rgb(${value}, ${value + 10}, ${value + 35})`;
  }, [maxComplexity]);

  // Get maximum indent level to determine number of hierarchy columns
  const maxIndent = useMemo(() => {
    return Math.max(...displayItems.map(item => item.indent));
  }, [displayItems]);

  const numHierarchyColumns = maxIndent + 1;

  // Calculate rowspans for merged cells
  const matrixItems = useMemo(() => {
    return displayItems.filter(item => item.showInMatrix);
  }, [displayItems]);

  // Memoize cell info calculations to avoid recalculating on every render
  const cellInfoCache = useMemo(() => {
    interface CellInfo {
      content: string;
      rowspan: number;
      isFirstInGroup: boolean;
      isFolder: boolean;
      folderPath: string;
      shouldRotate: boolean;
    }
    const cache = new Map<string, CellInfo>();
    
    matrixItems.forEach((rowItem, rowIdx) => {
      const pathParts = rowItem.path.split("/");
      
      for (let colIdx = 0; colIdx < numHierarchyColumns; colIdx++) {
        const cacheKey = `${rowIdx}-${colIdx}`;
        const cellContent = colIdx < pathParts.length ? pathParts[colIdx] : "";
        
        if (!cellContent) {
          cache.set(cacheKey, { content: "", rowspan: 0, isFirstInGroup: false, isFolder: false, folderPath: "", shouldRotate: false });
          continue;
        }

        // Check if this is the first row in a group with the same path up to this level
        const pathUpToHere = pathParts.slice(0, colIdx + 1).join("/");
        let isFirstInGroup = true;
        
        if (rowIdx > 0) {
          const prevPathParts = matrixItems[rowIdx - 1].path.split("/");
          const prevPathUpToHere = prevPathParts.slice(0, colIdx + 1).join("/");
          if (pathUpToHere === prevPathUpToHere) {
            isFirstInGroup = false;
          }
        }

        // Calculate rowspan
        let rowspan = 1;
        if (isFirstInGroup) {
          for (let i = rowIdx + 1; i < matrixItems.length; i++) {
            const nextPathParts = matrixItems[i].path.split("/");
            const nextPathUpToHere = nextPathParts.slice(0, colIdx + 1).join("/");
            if (pathUpToHere === nextPathUpToHere) {
              rowspan++;
            } else {
              break;
            }
          }
        }

        // Check if this represents a folder (not the last part of the path)
        const isFolder = colIdx < pathParts.length - 1;
        
        // Determine if text should be rotated: rotate if rowspan > 1 (merged cells with children below)
        const shouldRotate = rowspan > 1;

        cache.set(cacheKey, { content: cellContent, rowspan, isFirstInGroup, isFolder, folderPath: pathUpToHere, shouldRotate });
      }
    });
    
    return cache;
  }, [matrixItems, numHierarchyColumns]);

  const getCellInfo = useCallback((rowIdx: number, colIdx: number) => {
    return cellInfoCache.get(`${rowIdx}-${colIdx}`) || { content: "", rowspan: 0, isFirstInGroup: false, isFolder: false, folderPath: "", shouldRotate: false };
  }, [cellInfoCache]);

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

  return (
    <>
      <Viewport isPending={isPending}>
        <div className="relative rounded-lg bg-white p-20 text-center shadow-md mx-8">
          <div 
            style={{ 
              display: 'grid',
              gridTemplateColumns: `repeat(${numHierarchyColumns}, minmax(60px, auto)) 50px repeat(${matrixItems.length}, 30px)`,
              gridTemplateRows: `120px repeat(${matrixItems.length}, 30px)`,
            userSelect: 'none',
            backgroundImage: `
              linear-gradient(to right, rgba(250, 204, 21, 0.15) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(250, 204, 21, 0.15) 1px, transparent 1px)
            `,
            backgroundSize: `30px 30px`,
            backgroundPosition: `${numHierarchyColumns * 60 + 50}px 120px`
          }}
        >
        {/* Header row - hierarchy columns */}
        {Array.from({ length: numHierarchyColumns }).map((_, idx) => (
          <div
            key={`header-${idx}`}
            className="bg-yellow-100 text-xs font-semibold text-gray-700"
            style={{ 
              height: "120px", 
              padding: "0",
              border: "1px solid rgba(250, 204, 21, 0.5)",
              boxSizing: "border-box"
            }}
          />
        ))}
        
        {/* Header row - ID column */}
        <div
          key="header-id"
          className="bg-yellow-100 text-xs font-semibold text-gray-700"
          style={{ 
            width: "50px", 
            height: "120px", 
            padding: "0",
            border: "1px solid rgba(250, 204, 21, 0.5)",
            borderRight: "1px solid rgba(0, 0, 0, 0.5)",
            boxSizing: "border-box"
          }}
        />
        
        {/* Header row - matrix column headers */}
        {matrixItems.map((item, idx) => (
          <div
            key={`header-col-${idx}`}
            className="bg-yellow-100 text-xs font-semibold text-gray-700 cursor-pointer hover:bg-yellow-200"
            onMouseEnter={() => setHoveredCell({ row: -1, col: idx })}
            onMouseLeave={() => setHoveredCell(null)}
            style={{ 
              width: "30px", 
              height: "120px",
              padding: "4px 2px",
              border: "1px solid rgba(250, 204, 21, 0.5)",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            title={item.path}
          >
            <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
              {item.id}
            </div>
          </div>
        ))}

        {/* Folder background rectangles */}
        {(() => {
          // Build a map of folder rectangles to render
          const folderRectangles = new Map<string, { startRow: number; endRow: number; startCol: number; endCol: number; depth: number }>();
          
          // Collect all unique ancestor paths
          const ancestorPaths = new Set<string>();
          matrixItems.forEach(item => {
            getAncestorFolders(item).forEach(ancestor => ancestorPaths.add(ancestor));
          });
          
          // For each ancestor, calculate its bounding rectangle
          ancestorPaths.forEach(ancestorPath => {
            let minRow = Infinity;
            let maxRow = -1;
            let minCol = Infinity;
            let maxCol = -1;
            
            matrixItems.forEach((rowItem, rowIdx) => {
              const rowAncestors = getAncestorFolders(rowItem);
              if (!rowAncestors.includes(ancestorPath)) return;
              
              matrixItems.forEach((colItem, colIdx) => {
                const colAncestors = getAncestorFolders(colItem);
                if (!colAncestors.includes(ancestorPath)) return;
                
                minRow = Math.min(minRow, rowIdx);
                maxRow = Math.max(maxRow, rowIdx);
                minCol = Math.min(minCol, colIdx);
                maxCol = Math.max(maxCol, colIdx);
              });
            });
            
            if (minRow !== Infinity) {
              const depth = ancestorPath.split('/').length;
              folderRectangles.set(ancestorPath, {
                startRow: minRow,
                endRow: maxRow,
                startCol: minCol,
                endCol: maxCol,
                depth
              });
            }
          });
          
          // Render rectangles, sorted by depth (deepest first so they layer correctly)
          return Array.from(folderRectangles.entries())
            .sort((a, b) => a[1].depth - b[1].depth)
            .map(([path, rect], index) => {
              let mouseDownPos = { x: 0, y: 0 };
              
              return (
                <div
                  key={`folder-rect-${path}`}
                  title={path}
                  onMouseDown={(e) => {
                    mouseDownPos = { x: e.clientX, y: e.clientY };
                  }}
                  onClick={(e) => {
                    const dx = e.clientX - mouseDownPos.x;
                    const dy = e.clientY - mouseDownPos.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    // Only trigger click if mouse didn't move more than 5 pixels
                    if (distance < 5) {
                      toggleCollapse(path);
                    }
                  }}
                  onMouseEnter={() => setHoveredFolder(path)}
                  onMouseLeave={() => setHoveredFolder(null)}
                  style={{
                    gridColumn: `${rect.startCol + numHierarchyColumns + 2} / span ${rect.endCol - rect.startCol + 1}`,
                    gridRow: `${rect.startRow + 2} / span ${rect.endRow - rect.startRow + 1}`,
                    backgroundColor: 'rgba(250, 204, 21, 0.3)',
                    border: '2px solid rgba(0, 0, 0, 0.5)',
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                    zIndex: index,
                    boxSizing: 'border-box'
                  }}
                />
              );
            });
        })()}

        {/* Hover highlight overlays */}
        {hoveredCell && hoveredCell.row >= 0 && (
          <>
            {/* Row highlight */}
            <div
              style={{
                gridColumn: `${numHierarchyColumns + 2} / span ${matrixItems.length}`,
                gridRow: hoveredCell.row + 2,
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                pointerEvents: 'none',
                zIndex: 150,
                boxSizing: 'border-box'
              }}
            />
          </>
        )}
        {hoveredCell && hoveredCell.col >= 0 && (
          <>
            {/* Column highlight */}
            <div
              style={{
                gridColumn: hoveredCell.col + numHierarchyColumns + 2,
                gridRow: `2 / span ${matrixItems.length}`,
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                pointerEvents: 'none',
                zIndex: 150,
                boxSizing: 'border-box'
              }}
            />
          </>
        )}

        {/* Matrix rows */}
        {matrixItems.map((rowItem, rowIdx) => {
          const pathParts = rowItem.path.split("/");
          
          return (
            <Fragment key={`row-${rowIdx}`}>
              {/* Hierarchy columns for this row */}
              {Array.from({ length: numHierarchyColumns }).map((_, colIdx) => {
                const hierarchyCell = getCellInfo(rowIdx, colIdx);
                
                // Skip rendering if this cell is part of a merged group (but not the first)
                if (!hierarchyCell.isFirstInGroup) {
                  return null;
                }

                const isLastPart = colIdx === pathParts.length - 1;
                const isClickable = hierarchyCell.isFolder || (isLastPart && rowItem.isDirectory);
                const isLastHierarchyColumn = colIdx === numHierarchyColumns - 1;
                
                // If this is an empty cell and it's the last hierarchy column, render empty cell
                if (!hierarchyCell.content && isLastHierarchyColumn) {
                  return (
                    <div
                      key={`hierarchy-${rowIdx}-${colIdx}`}
                      className="bg-yellow-50"
                      style={{ 
                        minWidth: "40px",
                        border: "1px solid rgba(250, 204, 21, 0.5)",
                        boxSizing: "border-box"
                      }}
                    />
                  );
                }
                
                // Calculate grid span for cells that should span multiple columns
                let gridColumnSpan = 1;
                if (hierarchyCell.content && isLastPart) {
                  gridColumnSpan = numHierarchyColumns - colIdx;
                }
                
                // Calculate grid row span
                const gridRowSpan = hierarchyCell.rowspan;
                
                return (
                  <div
                    key={`hierarchy-${rowIdx}-${colIdx}`}
                    className={`bg-yellow-50 text-xs font-medium text-gray-800 ${
                      isClickable ? "cursor-pointer hover:bg-yellow-100" : ""
                    }`}
                    onClick={() => {
                      if (hierarchyCell.isFolder) {
                        toggleCollapse(hierarchyCell.folderPath);
                      } else if (isLastPart && rowItem.isDirectory) {
                        toggleCollapse(rowItem.path);
                      }
                    }}
                    style={{ 
                      padding: "2px 4px",
                      whiteSpace: "nowrap",
                      fontSize: "10px",
                      border: "1px solid rgba(250, 204, 21, 0.5)",
                      boxSizing: "border-box",
                      gridColumn: `${colIdx + 1} / span ${gridColumnSpan}`,
                      gridRow: `${rowIdx + 2} / span ${gridRowSpan}`
                    }}
                  >
                    {hierarchyCell.content && (
                      <div className={hierarchyCell.shouldRotate ? "flex items-center justify-center" : ""}>
                        {hierarchyCell.shouldRotate && (
                          <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                            <div className="flex items-center gap-1">
                              {hierarchyCell.isFolder && (
                                <span className="text-xs">
                                  {collapsed.has(hierarchyCell.folderPath) ? "▶" : "▼"}
                                </span>
                              )}
                              <span>{hierarchyCell.content}</span>
                            </div>
                          </div>
                        )}
                        {!hierarchyCell.shouldRotate && (
                          <div className="flex items-center gap-1">
                            {hierarchyCell.isFolder && (
                              <span className="text-xs">
                                {collapsed.has(hierarchyCell.folderPath) ? "▶" : "▼"}
                              </span>
                            )}
                            {isLastPart && rowItem.isDirectory && (
                              <span className="text-xs">
                                {collapsed.has(rowItem.path) ? "▶" : "▼"}
                              </span>
                            )}
                            <span>{hierarchyCell.content}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              
              {/* ID column - only render if this is first in group */}
              {(() => {
                const lastColIdx = pathParts.length - 1;
                const hierarchyCell = getCellInfo(rowIdx, lastColIdx);
                
                if (hierarchyCell.isFirstInGroup) {
                  return (
                    <div
                      key={`id-${rowIdx}`}
                      className="bg-yellow-50 text-center text-gray-500 cursor-pointer hover:bg-yellow-100"
                      onMouseEnter={() => setHoveredCell({ row: rowIdx, col: -1 })}
                      onMouseLeave={() => setHoveredCell(null)}
                      style={{
                        width: "50px",
                        height: "30px",
                        padding: "2px",
                        fontSize: "10px",
                        border: "1px solid rgba(250, 204, 21, 0.5)",
                        borderRight: "1px solid rgba(0, 0, 0, 0.5)",
                        boxSizing: "border-box",
                        gridRow: `${rowIdx + 2} / span ${hierarchyCell.rowspan}`,
                        gridColumn: numHierarchyColumns + 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      {rowItem.id}
                    </div>
                  );
                }
                return null;
              })()}
              
              {/* Matrix cells for this row */}
              {matrixItems.map((colItem, colIdx) => {
                const isMainDiagonal = rowItem.path === colItem.path;
                const depCount = getDependencyCount(
                  rowItem.fileIndices,
                  colItem.fileIndices
                );
                const hasDependency = depCount > 0;
                
                // Check for cyclical dependency (both directions exist)
                const reverseDepCount = !isMainDiagonal ? getDependencyCount(
                  colItem.fileIndices,
                  rowItem.fileIndices
                ) : 0;
                const isCyclical = hasDependency && reverseDepCount > 0;
                
                // Skip rendering diagonal cells for collapsed folders
                if (isMainDiagonal && rowItem.isDirectory) {
                  return null;
                }
                
                // Skip rendering cells with no dependencies and not on diagonal
                if (!isMainDiagonal && !hasDependency) {
                  return null;
                }
                
                // Get complexity score from files for single files
                let complexityScore: number | undefined;
                if (isMainDiagonal && rowItem.fileIndices.length === 1) {
                  const filePath = fileList[rowItem.fileIndices[0]];
                  complexityScore = files[filePath]?.complexity;
                }

                // Get all ancestor folders for both row and column items
                const rowAncestors = getAncestorFolders(rowItem);
                const colAncestors = getAncestorFolders(colItem);
                
                // Find common ancestor folders (intersection)
                const commonAncestors = rowAncestors.filter(ancestor => colAncestors.includes(ancestor));
                
                // For each common ancestor, check if this cell is at the boundary
                const borderClasses: string[] = [];
                
                // Use the deepest common ancestor (first in the list) for the main border
                if (commonAncestors.length > 0) {
                  const deepestCommon = commonAncestors[0];
                  
                  // Check if this is the first/last row/col for this ancestor group
                  const isFirstRow = rowIdx === 0 || !getAncestorFolders(matrixItems[rowIdx - 1]).includes(deepestCommon);
                  const isLastRow = rowIdx === matrixItems.length - 1 || !getAncestorFolders(matrixItems[rowIdx + 1]).includes(deepestCommon);
                  const isFirstCol = colIdx === 0 || !getAncestorFolders(matrixItems[colIdx - 1]).includes(deepestCommon);
                  const isLastCol = colIdx === matrixItems.length - 1 || !getAncestorFolders(matrixItems[colIdx + 1]).includes(deepestCommon);
                  
                  if (isFirstRow) borderClasses.push("border-t-2 border-t-black");
                  if (isLastRow) borderClasses.push("border-b-2 border-b-black");
                  if (isFirstCol) borderClasses.push("border-l-2 border-l-black");
                  if (isLastCol) borderClasses.push("border-r-2 border-r-black");
                }

                let bgColor = 'rgb(255, 255, 255)';
                let textColor = 'text-gray-800';
                if (isMainDiagonal && complexityScore !== undefined) {
                  bgColor = getComplexityColor(complexityScore);
                } else if (isCyclical) {
                  bgColor = 'rgb(239, 68, 68)'; // red for cyclical
                  textColor = 'text-white';
                } else if (hasDependency) {
                  bgColor = getDependencyColor(depCount);
                  // Use white text for all dependency cells (blue to purple gradient)
                  textColor = 'text-white';
                }

                // Build border styles with 50% transparency, avoiding shorthand/longhand conflicts
                const borderStyle: Record<string, string> = {
                  borderTop: "1px solid rgba(250, 204, 21, 0.5)",
                  borderBottom: "1px solid rgba(250, 204, 21, 0.5)",
                  borderLeft: "1px solid rgba(250, 204, 21, 0.5)",
                  borderRight: "1px solid rgba(250, 204, 21, 0.5)",
                  boxShadow: "inset 0 0 0 1px rgba(250, 204, 21, 0.5)"
                };
                if (borderClasses.includes("border-t-2 border-t-black")) borderStyle.boxShadow = "inset 0 2px 0 0 rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(250, 204, 21, 0.5)";
                if (borderClasses.includes("border-b-2 border-b-black")) borderStyle.boxShadow = "inset 0 -2px 0 0 rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(250, 204, 21, 0.5)";
                if (borderClasses.includes("border-l-2 border-l-black")) borderStyle.boxShadow = "inset 2px 0 0 0 rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(250, 204, 21, 0.5)";
                if (borderClasses.includes("border-r-2 border-r-black")) borderStyle.boxShadow = "inset -2px 0 0 0 rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(250, 204, 21, 0.5)";
                
                // Handle multiple thick borders
                if (borderClasses.length > 1) {
                  const shadows: string[] = ["inset 0 0 0 1px rgba(250, 204, 21, 0.5)"];
                  if (borderClasses.includes("border-t-2 border-t-black")) shadows.push("inset 0 2px 0 0 rgba(0, 0, 0, 0.5)");
                  if (borderClasses.includes("border-b-2 border-b-black")) shadows.push("inset 0 -2px 0 0 rgba(0, 0, 0, 0.5)");
                  if (borderClasses.includes("border-l-2 border-l-black")) shadows.push("inset 2px 0 0 0 rgba(0, 0, 0, 0.5)");
                  if (borderClasses.includes("border-r-2 border-r-black")) shadows.push("inset -2px 0 0 0 rgba(0, 0, 0, 0.5)");
                  borderStyle.boxShadow = shadows.join(", ");
                }

                // Remove border properties since we're using box-shadow
                delete borderStyle.borderTop;
                delete borderStyle.borderBottom;
                delete borderStyle.borderLeft;
                delete borderStyle.borderRight;

                return (
                  <div
                    key={`cell-${rowIdx}-${colIdx}`}
                    className={`matrix-cell text-center text-xs ${
                      hasDependency
                        ? isCyclical
                          ? "font-bold cursor-pointer"
                          : "font-semibold cursor-pointer"
                        : ""
                    } ${textColor}`}
                    data-row={rowIdx}
                    data-col={colIdx}
                    onMouseEnter={() => setHoveredCell({ row: rowIdx, col: colIdx })}
                    onMouseLeave={() => setHoveredCell(null)}
                    style={{
                      width: "30px", 
                      height: "30px",
                      minWidth: "30px",
                      minHeight: "30px",
                      maxWidth: "30px",
                      maxHeight: "30px",
                      padding: "0", 
                      fontSize: "10px",
                      boxSizing: "border-box",
                      backgroundColor: bgColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gridColumn: colIdx + numHierarchyColumns + 2, // +2 for hierarchy columns + ID column
                      gridRow: rowIdx + 2, // +2 for header row (1-indexed)
                      position: 'relative',
                      zIndex: 100,
                      ...borderStyle
                    }}
                    title={
                      isMainDiagonal
                        ? `${rowItem.path}${complexityScore !== undefined ? ` - Complexity: ${complexityScore}` : ''}`
                        : hasDependency
                        ? `${rowItem.path} → ${colItem.path}: ${depCount} dependencies${isCyclical ? ' ⚠️ CYCLICAL' : ''}`
                        : ''
                    }
                  >
                    {isMainDiagonal && complexityScore !== undefined ? complexityScore : (!isMainDiagonal && hasDependency ? depCount : "")}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>

      </div>
      </Viewport>

      {/* Hover info overlay - outside Viewport for fixed positioning */}
      {(hoveredCell || hoveredFolder) && (() => {
        if (hoveredFolder) {
          const folderName = hoveredFolder.split('/').pop() || hoveredFolder;
          return (
            <div 
              className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-300 shadow-lg p-4"
              style={{ zIndex: 9999 }}
            >
              <div className="max-w-7xl mx-auto">
                <div className="space-y-1">
                  <div className="font-semibold text-gray-900">Module: {folderName}</div>
                  <div className="text-sm text-gray-600">Path: {hoveredFolder}</div>
                  <div className="text-xs text-gray-500">Click to expand/collapse</div>
                </div>
              </div>
            </div>
          );
        }

        if (!hoveredCell) return null;

        // Handle header hovers (row or col is -1)
        if (hoveredCell.row < 0 || hoveredCell.col < 0) {
          if (hoveredCell.col >= 0) {
            // Column header hover
            const colItem = matrixItems[hoveredCell.col];
            return (
              <div 
                className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-300 shadow-lg p-4"
                style={{ zIndex: 9999 }}
              >
                <div className="max-w-7xl mx-auto">
                  <div className="space-y-1">
                    <div className="font-semibold text-gray-900">Column: {colItem.path}</div>
                    <div className="text-sm text-gray-600">ID: {colItem.id}</div>
                  </div>
                </div>
              </div>
            );
          } else if (hoveredCell.row >= 0) {
            // Row header hover
            const rowItem = matrixItems[hoveredCell.row];
            return (
              <div 
                className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-300 shadow-lg p-4"
                style={{ zIndex: 9999 }}
              >
                <div className="max-w-7xl mx-auto">
                  <div className="space-y-1">
                    <div className="font-semibold text-gray-900">Row: {rowItem.path}</div>
                    <div className="text-sm text-gray-600">ID: {rowItem.id}</div>
                  </div>
                </div>
              </div>
            );
          }
          return null;
        }

        const rowItem = matrixItems[hoveredCell.row];
        const colItem = matrixItems[hoveredCell.col];
        const isMainDiagonal = rowItem.path === colItem.path;
        const depCount = getDependencyCount(rowItem.fileIndices, colItem.fileIndices);
        const hasDependency = depCount > 0;
        const reverseDepCount = !isMainDiagonal ? getDependencyCount(colItem.fileIndices, rowItem.fileIndices) : 0;
        const isCyclical = hasDependency && reverseDepCount > 0;
        
        let complexityScore: number | undefined;
        let lineCount: number | undefined;
        if (isMainDiagonal && rowItem.fileIndices.length === 1) {
          const filePath = fileList[rowItem.fileIndices[0]];
          complexityScore = files[filePath]?.complexity;
          lineCount = files[filePath]?.lineCount;
        }

        return (
          <div 
            className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-300 shadow-lg p-4"
            style={{ zIndex: 9999 }}
          >
            <div className="max-w-7xl mx-auto">
              {isMainDiagonal ? (
                <div className="space-y-1">
                  <div className="font-semibold text-gray-900">{rowItem.path}</div>
                  {complexityScore !== undefined && (
                    <div className="text-sm text-gray-600">
                      Cyclomatic Complexity: {complexityScore}
                    </div>
                  )}
                  {lineCount !== undefined && (
                    <div className="text-sm text-gray-600">
                      Lines of Code: {lineCount}
                    </div>
                  )}
                  {rowItem.fileIndices.length > 1 && (
                    <div className="text-xs text-gray-500">Aggregated from {rowItem.fileIndices.length} files</div>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="font-semibold text-gray-900">
                    {rowItem.path} → {colItem.path}
                  </div>
                  {hasDependency && (
                    <div className="text-sm text-gray-600">
                      Dependencies: {depCount}
                      {isCyclical && <span className="ml-2 text-red-600 font-bold">⚠️ CYCLICAL</span>}
                    </div>
                  )}
                  {reverseDepCount > 0 && (
                    <div className="text-sm text-gray-600">
                      Reverse dependencies: {reverseDepCount}
                    </div>
                  )}
                  {!hasDependency && (
                    <div className="text-sm text-gray-500">No dependencies</div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );
}
