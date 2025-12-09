import { DisplayItem } from "~/types/dsm";
import { useFolderHelpers } from "./hooks/useFolderHelpers";
import styles from "./DSM.module.css";

interface FolderRectanglesProps {
  matrixItems: DisplayItem[];
  numHierarchyColumns: number;
  toggleCollapse: (path: string) => void;
  setHoveredFolder: (path: string | null) => void;
}

export function FolderRectangles({
  matrixItems,
  numHierarchyColumns,
  toggleCollapse,
  setHoveredFolder,
}: FolderRectanglesProps) {
  const { getAncestorFolders } = useFolderHelpers();

  // Build a map of folder rectangles to render
  const folderRectangles = new Map<
    string,
    { startRow: number; endRow: number; startCol: number; endCol: number; depth: number }
  >();

  // Collect all unique ancestor paths
  const ancestorPaths = new Set<string>();
  matrixItems.forEach((item) => {
    getAncestorFolders(item).forEach((ancestor) => ancestorPaths.add(ancestor));
  });

  // For each ancestor, calculate its bounding rectangle
  ancestorPaths.forEach((ancestorPath) => {
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
      const depth = ancestorPath.split("/").length;
      folderRectangles.set(ancestorPath, {
        startRow: minRow,
        endRow: maxRow,
        startCol: minCol,
        endCol: maxCol,
        depth,
      });
    }
  });

  return (
    <>
      {Array.from(folderRectangles.entries())
        .sort((a, b) => a[1].depth - b[1].depth)
        .map(([path, rect], index) => {
          let mouseDownPos = { x: 0, y: 0 };

          return (
            <div
              key={`folder-rect-${path}`}
              title={path}
              className={styles.folderRect}
              onMouseDown={(e) => {
                mouseDownPos = { x: e.clientX, y: e.clientY };
              }}
              onClick={(e) => {
                const dx = e.clientX - mouseDownPos.x;
                const dy = e.clientY - mouseDownPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 5) {
                  toggleCollapse(path);
                }
              }}
              onMouseEnter={() => setHoveredFolder(path)}
              onMouseLeave={() => setHoveredFolder(null)}
              style={{
                gridColumn: `${rect.startCol + numHierarchyColumns + 2} / span ${
                  rect.endCol - rect.startCol + 1
                }`,
                gridRow: `${rect.startRow + 2} / span ${rect.endRow - rect.startRow + 1}`,
                zIndex: index,
              }}
            />
          );
        })}
    </>
  );
}
