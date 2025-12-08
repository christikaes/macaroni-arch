"use client";

import { useState, useMemo, Fragment } from "react";
import { DSMData } from "~/types/dsm";

interface DSMMatrixProps {
  data: DSMData;
}

interface DisplayItem {
  path: string;
  displayName: string;
  indent: number;
  isDirectory: boolean;
  fileIndices: number[];
  id: string; // Hierarchical ID like "1", "1.1", "1.1.1"
  showInMatrix: boolean; // Whether to show in matrix (files and collapsed folders only)
}

export default function DSMMatrix({ data }: DSMMatrixProps) {
  const { files, fileTree } = data;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  
  // Get file list from files object keys
  const fileList = useMemo(() => Object.keys(files), [files]);

  // Build hierarchical display items with proper IDs
  const displayItems = useMemo(() => {
    const items: DisplayItem[] = [];
    
    // Build a tree structure first
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

    // Build tree from files
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

    // Convert tree to flat list with IDs
    const traverse = (
      node: TreeNode,
      indent: number,
      parentId: string = ""
    ) => {
      const sortedChildren = Array.from(node.children.entries()).sort(
        ([nameA], [nameB]) => nameA.localeCompare(nameB)
      );

      sortedChildren.forEach(([, child], index) => {
        const id = parentId ? `${parentId}.${index + 1}` : `${index + 1}`;
        const isExpanded = !child.isFile && !collapsed.has(child.path);
        
        // Always add to items for left column display
        items.push({
          path: child.path,
          displayName: child.name,
          indent,
          isDirectory: !child.isFile,
          fileIndices: Array.from(child.fileIndices),
          id,
          showInMatrix: child.isFile || !isExpanded, // Only files and collapsed folders show in matrix
        });

        // Add children if expanded
        if (isExpanded) {
          traverse(child, indent + 1, id);
        }
      });
    };

    traverse(root, 0);
    return items;
  }, [fileList, collapsed]);

  const toggleCollapse = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Calculate aggregated dependency count between two items
  const getDependencyCount = (fromIndices: number[], toIndices: number[]): number => {
    let total = 0;
    fromIndices.forEach((fromIdx) => {
      toIndices.forEach((toIdx) => {
        const fromFile = fileList[fromIdx];
        const toFile = fileList[toIdx];
        const dep = files[fromFile]?.dependencies.find(d => d.fileName === toFile);
        if (dep) {
          total += dep.dependencies;
        }
      });
    });
    return total;
  };

  // Get maximum indent level to determine number of hierarchy columns
  const maxIndent = useMemo(() => {
    return Math.max(...displayItems.map(item => item.indent));
  }, [displayItems]);

  const numHierarchyColumns = maxIndent + 1;

  // Calculate rowspans for merged cells
  const matrixItems = useMemo(() => {
    return displayItems.filter(item => item.showInMatrix);
  }, [displayItems]);

  // Helper to get all ancestor folder paths for an item (from deepest to shallowest)
  const getAncestorFolders = (item: DisplayItem): string[] => {
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
  };

  const getCellInfo = (rowIdx: number, colIdx: number) => {
    const rowItem = matrixItems[rowIdx];
    const pathParts = rowItem.path.split("/");
    const cellContent = colIdx < pathParts.length ? pathParts[colIdx] : "";
    
    if (!cellContent) {
      return { content: "", rowspan: 0, isFirstInGroup: false, isFolder: false, folderPath: "", shouldRotate: false };
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

    return { content: cellContent, rowspan, isFirstInGroup, isFolder, folderPath: pathUpToHere, shouldRotate };
  };

  return (
    <div className="w-full overflow-auto">
      <div className="inline-block min-w-full">
        <table className="border-collapse">
          <thead>
            <tr>
              {Array.from({ length: numHierarchyColumns }).map((_, idx) => (
                <th
                  key={`header-${idx}`}
                  className={`sticky z-20 bg-yellow-100 border border-yellow-400 text-xs font-semibold text-gray-700`}
                  style={{ left: `${idx * 30}px`, minWidth: "30px", padding: "0" }}
                >
                </th>
              ))}
              <th
                key="header-id"
                className="sticky z-20 bg-yellow-100 border border-yellow-400 border-r border-r-black text-xs font-semibold text-gray-700"
                style={{ left: `${numHierarchyColumns * 40}px`, minWidth: "50px", padding: "0" }}
              >
              </th>
              {matrixItems.map((item, idx) => (
                <th
                  key={idx}
                  className="border border-yellow-400 bg-yellow-100 text-xs font-semibold text-gray-700"
                  style={{ minWidth: "50px", padding: "0" }}
                  title={item.path}
                >
                  <div className="text-center">
                    {item.id}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrixItems.map((rowItem, rowIdx) => (
              <tr key={rowIdx}>
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
                        style={{ left: `${colIdx * 20}px`, minWidth: `${20 * colspan}px`, padding: " 4px" }}
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
                          className="sticky z-10 bg-yellow-50 border border-yellow-400 border-r border-r-black text-xs text-center text-gray-500"
                          style={{ left: `${numHierarchyColumns * 40}px`, minWidth: "50px", padding: "2px" }}
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

                  return (
                    <td
                      key={colIdx}
                      className={`border border-yellow-400 p-2 text-center text-xs ${
                        isMainDiagonal
                          ? "bg-gray-300"
                          : hasDependency
                          ? isCyclical
                            ? "bg-orange-400 text-red-600 font-bold hover:bg-orange-500 cursor-pointer"
                            : "bg-orange-400 text-white font-semibold hover:bg-orange-500 cursor-pointer"
                          : "bg-white hover:bg-yellow-50"
                      } ${borderClasses.join(" ")}`}
                      style={{ minWidth: "50px", height: "40px" }}
                      title={
                        isMainDiagonal
                          ? `${rowItem.path}${complexityScore !== undefined ? ` - Complexity: ${complexityScore}` : ''}`
                          : hasDependency
                          ? `${rowItem.path} → ${colItem.path}: ${depCount} dependencies${isCyclical ? ' ⚠️ CYCLICAL' : ''}`
                          : ''
                      }
                    >
                      {isMainDiagonal && complexityScore !== undefined ? complexityScore : (!isMainDiagonal && hasDependency ? depCount : "")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
