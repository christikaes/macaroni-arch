import { DisplayItem } from "~/types/dsm";
import styles from "./DSM.module.css";

interface InfoOverlayProps {
  hoveredCell: { row: number; col: number } | null;
  hoveredFolder: string | null;
  matrixItems: DisplayItem[];
  getDependencyCount: (fromIndices: number[], toIndices: number[]) => number;
  files: Record<string, { complexity?: number; lineCount?: number; dependencies: Array<{ fileName: string; dependencies: number }> }>;
  fileList: string[];
  repoUrl?: string;
  branch?: string;
}

// Helper function to build GitHub file URL
function buildGitHubFileUrl(repoUrl: string, filePath: string, branch: string = 'master'): string | null {
  const githubMatch = repoUrl.match(/github\.com[\/:]([^/]+)\/([^/.]+)/);
  if (!githubMatch) return null;
  
  const owner = githubMatch[1];
  const repo = githubMatch[2].replace(/\.git$/, '');
  
  return `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`;
}

export function InfoOverlay({
  hoveredCell,
  hoveredFolder,
  matrixItems,
  getDependencyCount,
  files,
  fileList,
  repoUrl,
  branch,
}: InfoOverlayProps) {
  if (!hoveredCell && !hoveredFolder) return null;

  // Folder hover
  if (hoveredFolder) {
    const folderName = hoveredFolder.split("/").pop() || hoveredFolder;
    return (
      <div className={styles.infoOverlay}>
        <div className={styles.infoContent}>
          <div>
            <div className={styles.infoTitle}>Module: {folderName}</div>
            <div className={styles.infoText}>Path: {hoveredFolder}</div>
            <div className={styles.infoTextSmall}>Click to expand/collapse</div>
          </div>
        </div>
      </div>
    );
  }

  if (!hoveredCell) return null;

  // Header hovers
  if (hoveredCell.row < 0 || hoveredCell.col < 0) {
    if (hoveredCell.col >= 0) {
      const colItem = matrixItems[hoveredCell.col];
      const githubUrl = repoUrl ? buildGitHubFileUrl(repoUrl, colItem.path, branch || 'master') : null;
      return (
        <div className={styles.infoOverlay}>
          <div className={styles.infoContent}>
            <div>
              <div className={styles.infoTitle}>Column: {colItem.path}</div>
              <div className={styles.infoText}>ID: {colItem.id}</div>
              {githubUrl && (
                <div className={styles.infoTextSmall}>
                  <a href={githubUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'rgb(59, 130, 246)', textDecoration: 'underline' }}>
                    {githubUrl}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    } else if (hoveredCell.row >= 0) {
      const rowItem = matrixItems[hoveredCell.row];
      const githubUrl = repoUrl ? buildGitHubFileUrl(repoUrl, rowItem.path, branch || 'master') : null;
      return (
        <div className={styles.infoOverlay}>
          <div className={styles.infoContent}>
            <div>
              <div className={styles.infoTitle}>Row: {rowItem.path}</div>
              <div className={styles.infoText}>ID: {rowItem.id}</div>
              {githubUrl && (
                <div className={styles.infoTextSmall}>
                  <a href={githubUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'rgb(59, 130, 246)', textDecoration: 'underline' }}>
                    {githubUrl}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  // Cell hover
  const rowItem = matrixItems[hoveredCell.row];
  const colItem = matrixItems[hoveredCell.col];
  const isMainDiagonal = rowItem.path === colItem.path;
  const depCount = getDependencyCount(rowItem.fileIndices, colItem.fileIndices);
  const hasDependency = depCount > 0;
  const reverseDepCount = !isMainDiagonal
    ? getDependencyCount(colItem.fileIndices, rowItem.fileIndices)
    : 0;
  const isCyclical = hasDependency && reverseDepCount > 0;

  let complexityScore: number | undefined;
  let lineCount: number | undefined;
  if (isMainDiagonal && rowItem.fileIndices.length === 1) {
    const filePath = fileList[rowItem.fileIndices[0]];
    complexityScore = files[filePath]?.complexity;
    lineCount = files[filePath]?.lineCount;
  }

  const githubUrl = repoUrl ? buildGitHubFileUrl(repoUrl, rowItem.path, branch || 'master') : null;

  return (
    <div className={styles.infoOverlay}>
      <div className={styles.infoContent}>
        {isMainDiagonal ? (
          <div>
            <div className={styles.infoTitle}>
              {rowItem.path}
            </div>
            {complexityScore !== undefined && (
              <div className={styles.infoText}>
                Cyclomatic Complexity: {complexityScore}
              </div>
            )}
            {lineCount !== undefined && (
              <div className={styles.infoText}>Lines of Code: {lineCount}</div>
            )}
            {rowItem.fileIndices.length > 1 && (
              <div className={styles.infoTextSmall}>
                Aggregated from {rowItem.fileIndices.length} files
              </div>
            )}
            {githubUrl && (
              <div className={styles.infoTextSmall}>
                <a href={githubUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'rgb(59, 130, 246)', textDecoration: 'underline' }}>
                  {githubUrl}
                </a>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: '0.25rem' }}>
              <span className={styles.infoTitle}>
                {rowItem.path}
              </span>
              <span style={{ fontWeight: 600, color: 'rgb(17, 24, 39)', margin: '0 0.25rem' }}>→</span>
              <span className={styles.infoTitle}>
                {colItem.path}
              </span>
            </div>
            {hasDependency && (
              <div className={styles.infoText}>
                Dependencies: {depCount}
                {isCyclical && (
                  <span className={styles.infoCyclicalWarning}>⚠️ CYCLICAL</span>
                )}
              </div>
            )}
            {reverseDepCount > 0 && (
              <div className={styles.infoText}>
                Reverse dependencies: {reverseDepCount}
              </div>
            )}
            {!hasDependency && (
              <div className={styles.infoText} style={{ color: "rgb(107, 114, 128)" }}>
                No dependencies
              </div>
            )}
            {githubUrl && (
              <div className={styles.infoTextSmall}>
                <a href={githubUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'rgb(59, 130, 246)', textDecoration: 'underline' }}>
                  {githubUrl}
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
