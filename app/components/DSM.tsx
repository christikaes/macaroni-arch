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
  const [isPending, startTransition] = useTransition();
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  
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
    <Viewport isPending={isPending}>
      <table className="border-collapse" style={{ userSelect: 'none' }}>
        <thead>
          <tr>
            {Array.from({ length: numHierarchyColumns }).map((_, idx) => (
              <th
                key={`header-${idx}`}
                className={`sticky top-0 z-20 bg-yellow-100 border border-yellow-400 text-xs font-semibold text-gray-700`}
                style={{ left: `${idx * 20}px`, width: "20px", padding: "0" }}
              >
              </th>
            ))}
            <th
              key="header-id"
              className="sticky top-0 z-20 bg-yellow-100 border border-yellow-400 border-r border-r-black text-xs font-semibold text-gray-700"
              style={{ left: `${numHierarchyColumns * 20}px`, width: "30px", padding: "0" }}
            >
            </th>
            {matrixItems.map((item, idx) => (
              <th
                key={idx}
                className="sticky top-0 border border-yellow-400 bg-yellow-100 text-xs font-semibold text-gray-700"
                  style={{ width: "30px", padding: "4px 2px", height: "120px" }}
                  title={item.path}
                >
                  <div className="flex items-center justify-center h-full">
                    <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                      {item.id}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrixItems.map((rowItem, rowIdx) => (
              <tr key={rowItem.path}>
                {Array.from({ length: numHierarchyColumns }).map((_, colIdx) => {
                  const cellInfo = getCellInfo(rowIdx, colIdx);
                  
                  // Skip rendering if this cell is part of a merged group (but not the first)
                  if (!cellInfo.isFirstInGroup) {
                    return null;
                  }

                  const pathParts = rowItem.path.split("/");
                  const isLastPart = colIdx === pathParts.length - 1;
                  const isClickable = cellInfo.isFolder || (isLastPart && rowItem.isDirectory);
                  const isLastHierarchyColumn = colIdx === numHierarchyColumns - 1;
                  
                  // If this is an empty cell and it's the last hierarchy column, skip it
                  // The content will be rendered in an earlier column
                  if (!cellInfo.content && isLastHierarchyColumn) {
                    return (
                      <td
                        key={`hierarchy-${colIdx}`}
                        className="sticky z-10 bg-yellow-50 border border-yellow-400"
                        style={{ left: `${colIdx * 40}px`, minWidth: "40px" }}
                      />
                    );
                  }
                  
                  // Calculate colspan for cells that should span to the separator line
                  let colspan = 1;
                  if (cellInfo.content && isLastPart) {
                    // This is the last part of the path, it should span remaining columns
                    colspan = numHierarchyColumns - colIdx;
                  }
                  
                  return (
                    <Fragment key={`hierarchy-${colIdx}`}>
                      <td
                        rowSpan={cellInfo.rowspan}
                        colSpan={colspan}
                        className={`sticky z-10 bg-yellow-50 border border-yellow-400 text-xs font-medium text-gray-800 ${
                          isClickable ? "cursor-pointer hover:bg-yellow-100" : ""
                        }`}
                        onClick={() => {
                          if (cellInfo.isFolder) {
                            toggleCollapse(cellInfo.folderPath);
                          } else if (isLastPart && rowItem.isDirectory) {
                            toggleCollapse(rowItem.path);
                          }
                        }}
                        style={{ left: `${colIdx * 20}px`, width: `${20 * colspan}px`, padding: "2px", fontSize: "10px" }}
                      >
                        {cellInfo.content && (
                          <div className={cellInfo.shouldRotate ? "flex items-center justify-center" : ""}>
                            {cellInfo.shouldRotate && (
                              <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                                <div className="flex items-center gap-1">
                                  {cellInfo.isFolder && (
                                    <span className="text-xs">
                                      {collapsed.has(cellInfo.folderPath) ? "▶" : "▼"}
                                    </span>
                                  )}
                                  <span>{cellInfo.content}</span>
                                </div>
                              </div>
                            )}
                            {!cellInfo.shouldRotate && (
                              <div className="flex items-center gap-1">
                                {cellInfo.isFolder && (
                                  <span className="text-xs">
                                    {collapsed.has(cellInfo.folderPath) ? "▶" : "▼"}
                                  </span>
                                )}
                                {isLastPart && rowItem.isDirectory && (
                                  <span className="text-xs">
                                    {collapsed.has(rowItem.path) ? "▶" : "▼"}
                                  </span>
                                )}
                                <span>{cellInfo.content}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      {isLastPart && cellInfo.isFirstInGroup && (
                        <td
                          rowSpan={cellInfo.rowspan}
                          className="sticky z-10 bg-yellow-50 border border-yellow-400 border-r border-r-black text-center text-gray-500"
                          style={{ left: `${numHierarchyColumns * 20}px`, width: "30px", padding: "2px", fontSize: "10px" }}
                        >
                          {rowItem.id}
                        </td>
                      )}
                    </Fragment>
                  );
                })}
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

                  const isHovered = hoveredCell && (hoveredCell.row === rowIdx || hoveredCell.col === colIdx);

                  return (
                    <td
                      key={colIdx}
                      onMouseEnter={() => setHoveredCell({ row: rowIdx, col: colIdx })}
                      onMouseLeave={() => setHoveredCell(null)}
                      className={`border border-yellow-400 text-center text-xs ${
                        isHovered
                          ? "bg-blue-200"
                          : hasDependency
                          ? isCyclical
                            ? "text-red-600 font-bold cursor-pointer"
                            : "text-orange-600 font-semibold cursor-pointer"
                          : ""
                      } bg-white ${borderClasses.join(" ")}`}
                      style={{ width: "30px", height: "30px", padding: "0", fontSize: "10px" }}
                      title={
                        isMainDiagonal
                          ? `${rowItem.path}${complexityScore !== undefined ? ` - Complexity: ${complexityScore}` : ''}`
                          : hasDependency
                          ? `${rowItem.path} → ${colItem.path}: ${depCount} dependencies${isCyclical ? ' ⚠️ CYCLICAL' : ''}`
                          : ''
                      }
                    >
                      <div className="flex items-center justify-center w-full h-full">
                        {isMainDiagonal && complexityScore !== undefined ? complexityScore : (!isMainDiagonal && hasDependency ? depCount : "")}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
    </Viewport>
  );
}
