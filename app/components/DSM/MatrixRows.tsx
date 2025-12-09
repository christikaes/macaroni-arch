import { Fragment } from "react";
import { DisplayItem } from "~/types/dsm";
import { CellInfo } from "./hooks/useHierarchyCache";
import { useFolderHelpers } from "./hooks/useFolderHelpers";
import styles from "./DSM.module.css";

interface MatrixRowsProps {
  matrixItems: DisplayItem[];
  numHierarchyColumns: number;
  getCellInfo: (rowIdx: number, colIdx: number) => CellInfo;
  collapsed: Set<string>;
  toggleCollapse: (path: string) => void;
  setHoveredCell: (cell: { row: number; col: number } | null) => void;
  setHoveredFolder: (folder: string | null) => void;
  getDependencyCount: (fromIndices: number[], toIndices: number[]) => number;
  getDependencyColor: (count: number) => string;
  getComplexityColor: (complexity: number) => string;
  files: Record<string, { complexity?: number; lineCount?: number; dependencies: Array<{ fileName: string; dependencies: number }> }>;
  fileList: string[];
  repoUrl?: string;
  branch?: string;
}

// Helper function to build GitHub file URL
function buildGitHubFileUrl(repoUrl: string, filePath: string, branch: string = 'master'): string | null {
  // Check if it's a GitHub URL
  const githubMatch = repoUrl.match(/github\.com[\/:]([^/]+)\/([^/.]+)/);
  if (!githubMatch) return null;
  
  const owner = githubMatch[1];
  const repo = githubMatch[2].replace(/\.git$/, '');
  
  // Use the provided branch (from git clone) or default to master
  return `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`;
}

export function MatrixRows({
  matrixItems,
  numHierarchyColumns,
  getCellInfo,
  collapsed,
  toggleCollapse,
  setHoveredCell,
  setHoveredFolder,
  getDependencyCount,
  getDependencyColor,
  getComplexityColor,
  files,
  fileList,
  repoUrl,
  branch,
}: MatrixRowsProps) {
  const { getAncestorFolders } = useFolderHelpers();

  return (
    <>
      {matrixItems.map((rowItem, rowIdx) => {
        const pathParts = rowItem.path.split("/");

        return (
          <Fragment key={`row-${rowIdx}`}>
            {/* Hierarchy columns */}
            {Array.from({ length: numHierarchyColumns }).map((_, colIdx) => {
              const hierarchyCell = getCellInfo(rowIdx, colIdx);

              if (!hierarchyCell.isFirstInGroup) {
                return null;
              }

              const isLastPart = colIdx === pathParts.length - 1;
              const isClickable =
                hierarchyCell.isFolder || (isLastPart && rowItem.isDirectory);
              const isLastHierarchyColumn = colIdx === numHierarchyColumns - 1;

              if (!hierarchyCell.content && isLastHierarchyColumn) {
                return (
                  <div
                    key={`hierarchy-${rowIdx}-${colIdx}`}
                    className={styles.hierarchyCellEmpty}
                  />
                );
              }

              let gridColumnSpan = 1;
              if (hierarchyCell.content && isLastPart) {
                gridColumnSpan = numHierarchyColumns - colIdx;
              }

              const gridRowSpan = hierarchyCell.rowspan;

              return (
                <div
                  key={`hierarchy-${rowIdx}-${colIdx}`}
                  className={
                    isClickable
                      ? styles.hierarchyCellClickable
                      : styles.hierarchyCell
                  }
                  onClick={() => {
                    if (hierarchyCell.isFolder) {
                      toggleCollapse(hierarchyCell.folderPath);
                    } else if (isLastPart && rowItem.isDirectory) {
                      toggleCollapse(rowItem.path);
                    }
                  }}
                  onMouseEnter={() => {
                    if (hierarchyCell.isFolder) {
                      setHoveredFolder(hierarchyCell.folderPath);
                    } else if (isLastPart && rowItem.isDirectory) {
                      setHoveredFolder(rowItem.path);
                    }
                  }}
                  onMouseLeave={() => setHoveredFolder(null)}
                  style={{
                    gridColumn: `${colIdx + 1} / span ${gridColumnSpan}`,
                    gridRow: `${rowIdx + 2} / span ${gridRowSpan}`,
                  }}
                >
                  {hierarchyCell.content && (
                    <div
                      className={
                        hierarchyCell.shouldRotate
                          ? styles.flexContainerCenter
                          : ""
                      }
                    >
                      {hierarchyCell.shouldRotate && (
                        <div className={styles.verticalText}>
                          <div className={styles.flexContainer}>
                            {hierarchyCell.isFolder && (
                              <span className={styles.collapseIcon}>
                                {collapsed.has(hierarchyCell.folderPath)
                                  ? "▶"
                                  : "▼"}
                              </span>
                            )}
                            <span>{hierarchyCell.content}</span>
                          </div>
                        </div>
                      )}
                      {!hierarchyCell.shouldRotate && (
                        <div className={styles.flexContainer}>
                          {hierarchyCell.isFolder && (
                            <span className={styles.collapseIcon}>
                              {collapsed.has(hierarchyCell.folderPath)
                                ? "▶"
                                : "▼"}
                            </span>
                          )}
                          {isLastPart && rowItem.isDirectory && (
                            <span className={styles.collapseIcon}>
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

            {/* ID column */}
            {(() => {
              const lastColIdx = pathParts.length - 1;
              const hierarchyCell = getCellInfo(rowIdx, lastColIdx);

              if (hierarchyCell.isFirstInGroup) {
                return (
                  <div
                    key={`id-${rowIdx}`}
                    className={styles.idCell}
                    onMouseEnter={() =>
                      setHoveredCell({ row: rowIdx, col: -1 })
                    }
                    onMouseLeave={() => setHoveredCell(null)}
                    style={{
                      gridRow: `${rowIdx + 2} / span ${hierarchyCell.rowspan}`,
                      gridColumn: numHierarchyColumns + 1,
                    }}
                  >
                    {rowItem.id}
                  </div>
                );
              }
              return null;
            })()}

            {/* Matrix cells */}
            {matrixItems.map((colItem, colIdx) => {
              const isMainDiagonal = rowItem.path === colItem.path;
              const depCount = getDependencyCount(
                rowItem.fileIndices,
                colItem.fileIndices
              );
              const hasDependency = depCount > 0;

              const reverseDepCount = !isMainDiagonal
                ? getDependencyCount(colItem.fileIndices, rowItem.fileIndices)
                : 0;
              const isCyclical = hasDependency && reverseDepCount > 0;

              if (isMainDiagonal && rowItem.isDirectory) {
                return null;
              }

              if (!isMainDiagonal && !hasDependency) {
                return null;
              }

              let complexityScore: number | undefined;
              if (isMainDiagonal && rowItem.fileIndices.length === 1) {
                const filePath = fileList[rowItem.fileIndices[0]];
                complexityScore = files[filePath]?.complexity;
              }

              const rowAncestors = getAncestorFolders(rowItem);
              const colAncestors = getAncestorFolders(colItem);
              const commonAncestors = rowAncestors.filter((ancestor) =>
                colAncestors.includes(ancestor)
              );

              const borderClasses: string[] = [];

              if (commonAncestors.length > 0) {
                const deepestCommon = commonAncestors[0];

                const isFirstRow =
                  rowIdx === 0 ||
                  !getAncestorFolders(matrixItems[rowIdx - 1]).includes(
                    deepestCommon
                  );
                const isLastRow =
                  rowIdx === matrixItems.length - 1 ||
                  !getAncestorFolders(matrixItems[rowIdx + 1]).includes(
                    deepestCommon
                  );
                const isFirstCol =
                  colIdx === 0 ||
                  !getAncestorFolders(matrixItems[colIdx - 1]).includes(
                    deepestCommon
                  );
                const isLastCol =
                  colIdx === matrixItems.length - 1 ||
                  !getAncestorFolders(matrixItems[colIdx + 1]).includes(
                    deepestCommon
                  );

                if (isFirstRow) borderClasses.push("border-t-2 border-t-black");
                if (isLastRow) borderClasses.push("border-b-2 border-b-black");
                if (isFirstCol) borderClasses.push("border-l-2 border-l-black");
                if (isLastCol) borderClasses.push("border-r-2 border-r-black");
              }

              let bgColor = "rgb(255, 255, 255)";
              let textColor = "text-gray-800";
              if (isMainDiagonal && complexityScore !== undefined) {
                bgColor = getComplexityColor(complexityScore);
                textColor = "text-white";
              } else if (isCyclical) {
                bgColor = "rgb(239, 68, 68)";
                textColor = "text-white";
              } else if (hasDependency) {
                bgColor = getDependencyColor(depCount);
                textColor = "text-white";
              }

              const borderStyle: Record<string, string> = {
                borderTop: "1px solid rgba(250, 204, 21, 0.5)",
                borderBottom: "1px solid rgba(250, 204, 21, 0.5)",
                borderLeft: "1px solid rgba(250, 204, 21, 0.5)",
                borderRight: "1px solid rgba(250, 204, 21, 0.5)",
                boxShadow: "inset 0 0 0 1px rgba(250, 204, 21, 0.5)",
              };

              if (borderClasses.length > 1) {
                const shadows: string[] = [
                  "inset 0 0 0 1px rgba(250, 204, 21, 0.5)",
                ];
                if (borderClasses.includes("border-t-2 border-t-black"))
                  shadows.push("inset 0 2px 0 0 rgba(0, 0, 0, 0.5)");
                if (borderClasses.includes("border-b-2 border-b-black"))
                  shadows.push("inset 0 -2px 0 0 rgba(0, 0, 0, 0.5)");
                if (borderClasses.includes("border-l-2 border-l-black"))
                  shadows.push("inset 2px 0 0 0 rgba(0, 0, 0, 0.5)");
                if (borderClasses.includes("border-r-2 border-r-black"))
                  shadows.push("inset -2px 0 0 0 rgba(0, 0, 0, 0.5)");
                borderStyle.boxShadow = shadows.join(", ");
              } else if (borderClasses.length === 1) {
                if (borderClasses.includes("border-t-2 border-t-black"))
                  borderStyle.boxShadow =
                    "inset 0 2px 0 0 rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(250, 204, 21, 0.5)";
                if (borderClasses.includes("border-b-2 border-b-black"))
                  borderStyle.boxShadow =
                    "inset 0 -2px 0 0 rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(250, 204, 21, 0.5)";
                if (borderClasses.includes("border-l-2 border-l-black"))
                  borderStyle.boxShadow =
                    "inset 2px 0 0 0 rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(250, 204, 21, 0.5)";
                if (borderClasses.includes("border-r-2 border-r-black"))
                  borderStyle.boxShadow =
                    "inset -2px 0 0 0 rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(250, 204, 21, 0.5)";
              }

              delete borderStyle.borderTop;
              delete borderStyle.borderBottom;
              delete borderStyle.borderLeft;
              delete borderStyle.borderRight;

              const cellClass = isCyclical
                ? styles.matrixCellCyclical
                : hasDependency
                ? styles.matrixCellDependency
                : styles.matrixCell;

              // Build GitHub URL for the file if available
              const githubUrl = repoUrl && (isMainDiagonal || hasDependency)
                ? buildGitHubFileUrl(repoUrl, isMainDiagonal ? rowItem.path : rowItem.path, branch || 'master')
                : null;

              const handleClick = () => {
                if (githubUrl) {
                  window.open(githubUrl, '_blank', 'noopener,noreferrer');
                }
              };

              return (
                <div
                  key={`cell-${rowIdx}-${colIdx}`}
                  className={`${cellClass} ${textColor}`}
                  data-row={rowIdx}
                  data-col={colIdx}
                  onMouseEnter={() =>
                    setHoveredCell({ row: rowIdx, col: colIdx })
                  }
                  onMouseLeave={() => setHoveredCell(null)}
                  onClick={handleClick}
                  style={{
                    backgroundColor: bgColor,
                    gridColumn: colIdx + numHierarchyColumns + 2,
                    gridRow: rowIdx + 2,
                    cursor: githubUrl ? 'pointer' : 'default',
                    ...borderStyle,
                  }}
                  title={
                    isMainDiagonal
                      ? `${rowItem.path}${
                          complexityScore !== undefined
                            ? ` - Complexity: ${complexityScore}`
                            : ""
                        }`
                      : hasDependency
                      ? `${rowItem.path} → ${colItem.path}: ${depCount} dependencies${
                          isCyclical ? " ⚠️ CYCLICAL" : ""
                        }`
                      : ""
                  }
                >
                  {isMainDiagonal && complexityScore !== undefined
                    ? complexityScore
                    : !isMainDiagonal && hasDependency
                    ? depCount
                    : ""}
                </div>
              );
            })}
          </Fragment>
        );
      })}
    </>
  );
}
