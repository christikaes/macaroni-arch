import { useMemo, useCallback } from "react";
import { DSMData, DisplayItem } from "~/types/dsm";

export function useDSMData(
  data: DSMData,
  collapsed: Set<string>
) {
  const { files, displayItems: serverDisplayItems, fileList } = data;

  // Filter and process display items based on collapsed state
  const displayItems = useMemo(() => {
    if (!serverDisplayItems) return [];
    
    const items: DisplayItem[] = [];
    let skipDepth: number | null = null;
    
    serverDisplayItems.forEach((item) => {
      if (skipDepth !== null && item.indent > skipDepth) {
        return;
      }
      
      if (skipDepth !== null && item.indent <= skipDepth) {
        skipDepth = null;
      }
      
      const isExpanded = !item.isDirectory || !collapsed.has(item.path);
      
      items.push({
        ...item,
        showInMatrix: item.isDirectory ? !isExpanded : true,
      });
      
      if (item.isDirectory && !isExpanded) {
        skipDepth = item.indent;
      }
    });
    
    return items;
  }, [serverDisplayItems, collapsed]);

  // Pre-calculate dependency counts in a lookup map
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

  // Calculate aggregated dependency count between two items
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

  // Calculate min and max dependency counts
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

  // Calculate max complexity score
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

  // Get maximum indent level
  const maxIndent = useMemo(() => {
    return Math.max(...displayItems.map(item => item.indent));
  }, [displayItems]);

  // Filter items to show in matrix
  const matrixItems = useMemo(() => {
    return displayItems.filter(item => item.showInMatrix);
  }, [displayItems]);

  return {
    files,
    fileList,
    displayItems,
    matrixItems,
    dependencyLookup,
    getDependencyCount,
    minDeps,
    maxDeps,
    maxComplexity,
    maxIndent,
    numHierarchyColumns: maxIndent + 1,
  };
}
