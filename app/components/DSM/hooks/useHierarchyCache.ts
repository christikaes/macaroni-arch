import { useMemo, useCallback } from "react";
import { DisplayItem } from "~/types/dsm";

export interface CellInfo {
  content: string;
  rowspan: number;
  isFirstInGroup: boolean;
  isFolder: boolean;
  folderPath: string;
  shouldRotate: boolean;
}

export function useHierarchyCache(
  matrixItems: DisplayItem[],
  numHierarchyColumns: number
) {
  // Memoize cell info calculations
  const cellInfoCache = useMemo(() => {
    const cache = new Map<string, CellInfo>();
    
    matrixItems.forEach((rowItem, rowIdx) => {
      const pathParts = rowItem.path.split("/");
      
      for (let colIdx = 0; colIdx < numHierarchyColumns; colIdx++) {
        const cacheKey = `${rowIdx}-${colIdx}`;
        const cellContent = colIdx < pathParts.length ? pathParts[colIdx] : "";
        
        if (!cellContent) {
          cache.set(cacheKey, { 
            content: "", 
            rowspan: 0, 
            isFirstInGroup: false, 
            isFolder: false, 
            folderPath: "", 
            shouldRotate: false 
          });
          continue;
        }

        const pathUpToHere = pathParts.slice(0, colIdx + 1).join("/");
        let isFirstInGroup = true;
        
        if (rowIdx > 0) {
          const prevPathParts = matrixItems[rowIdx - 1].path.split("/");
          const prevPathUpToHere = prevPathParts.slice(0, colIdx + 1).join("/");
          if (pathUpToHere === prevPathUpToHere) {
            isFirstInGroup = false;
          }
        }

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

        const isFolder = colIdx < pathParts.length - 1;
        const shouldRotate = rowspan > 1;

        cache.set(cacheKey, { 
          content: cellContent, 
          rowspan, 
          isFirstInGroup, 
          isFolder, 
          folderPath: pathUpToHere, 
          shouldRotate 
        });
      }
    });
    
    return cache;
  }, [matrixItems, numHierarchyColumns]);

  const getCellInfo = useCallback((rowIdx: number, colIdx: number): CellInfo => {
    return cellInfoCache.get(`${rowIdx}-${colIdx}`) || { 
      content: "", 
      rowspan: 0, 
      isFirstInGroup: false, 
      isFolder: false, 
      folderPath: "", 
      shouldRotate: false 
    };
  }, [cellInfoCache]);

  return { getCellInfo };
}
