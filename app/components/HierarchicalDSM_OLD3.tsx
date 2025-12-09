'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { create } from 'grid';
import type { DSMData } from '../types/dsm';

const ZOOM_THRESHOLD_SHOW_HEADERS = 0.8;

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

export default function HierarchicalDSM({ data }: DSMMatrixProps) {
  const { files } = data;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1.0);

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
      path: '',
      name: '',
      isFile: false,
      children: new Map(),
      fileIndices: new Set(),
    };

    fileList.forEach((file, idx) => {
      const parts = file.split('/');
      let current = root;
      
      parts.forEach((part, i) => {
        current.fileIndices.add(idx);
        
        if (!current.children.has(part)) {
          current.children.set(part, {
            path: parts.slice(0, i + 1).join('/'),
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

    const traverse = (node: TreeNode, indent: number, parentId: string = '') => {
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

  // Only items shown in matrix
  const matrixItems = useMemo(() => {
    return displayItems.filter(item => item.showInMatrix);
  }, [displayItems]);

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

  // Get dependency color
  const getDependencyColor = useCallback((count: number, isCyclical: boolean): string => {
    if (count === 0) return '';
    
    if (isCyclical) {
      return 'rgb(239, 68, 68)'; // red-500
    }
    
    const normalized = (count - minDependencies) / (maxDependencies - minDependencies);
    
    // Green to Blue gradient
    const red = Math.round(34 + (59 - 34) * normalized);
    const green = Math.round(197 + (130 - 197) * normalized);
    const blue = Math.round(94 + (246 - 94) * normalized);
    
    return `rgb(${red}, ${green}, ${blue})`;
  }, [minDependencies, maxDependencies]);

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

  // Grid container ref
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<{ destroy?: () => void } | null>(null);

  // Initialize grid
  useEffect(() => {
    if (!gridContainerRef.current || matrixItems.length === 0) return;

    const container = gridContainerRef.current;
    container.innerHTML = '';

    // Create grid instance
    const grid = create();

    // Add columns
    const colDescriptors = [];
    const cellSize = Math.round(40 * zoom);
    const showHeaders = zoom >= ZOOM_THRESHOLD_SHOW_HEADERS;
    
    // Path column
    const pathCol = grid.colModel.create();
    pathCol.width = Math.round(500 * zoom);
    colDescriptors.push(pathCol);
    
    if (showHeaders) {
      // ID column
      const idCol = grid.colModel.create();
      idCol.width = Math.round(50 * zoom);
      colDescriptors.push(idCol);
    }
    
    // Matrix columns
    for (let i = 0; i < matrixItems.length; i++) {
      const col = grid.colModel.create();
      col.width = cellSize;
      colDescriptors.push(col);
    }
    grid.colModel.add(colDescriptors);

    // Add rows  
    const rowDescriptors = [];
    for (let r = 0; r < matrixItems.length; r++) {
      const row = grid.rowModel.create();
      row.height = Math.round(40 * zoom);
      rowDescriptors.push(row);
    }
    grid.rowModel.add(rowDescriptors);

    // Data model
    const dataDirtyClean = grid.makeDirtyClean();
    grid.dataModel = {
      get: (rowIdx: number, colIdx: number) => {
        const rowItem = matrixItems[rowIdx];
        if (!rowItem) return { value: '', formatted: '' };

        // Path column
        if (colIdx === 0) {
          const indent = '  '.repeat(rowItem.indent);
          const icon = rowItem.isDirectory ? (collapsed.has(rowItem.path) ? '▶ ' : '▼ ') : '';
          return { value: rowItem.path, formatted: indent + icon + rowItem.path };
        }

        // ID column
        if (showHeaders && colIdx === 1) {
          return { value: rowItem.id, formatted: rowItem.id };
        }

        // Matrix cells
        const matrixColIdx = showHeaders ? colIdx - 2 : colIdx - 1;
        const colItem = matrixItems[matrixColIdx];
        if (!colItem) return { value: '', formatted: '' };

        const isMainDiagonal = rowItem.path === colItem.path;
        const depCount = getDependencyCount(rowItem.fileIndices, colItem.fileIndices);
        const hasDependency = depCount > 0;

        if (isMainDiagonal && rowItem.fileIndices.length === 1) {
          const filePath = fileList[rowItem.fileIndices[0]];
          const complexity = files[filePath]?.complexity;
          if (complexity !== undefined) {
            return { value: complexity, formatted: complexity.toString() };
          }
        }

        if (hasDependency) {
          return { value: depCount, formatted: depCount.toString() };
        }

        return { value: '', formatted: '' };
      },
      getHeader: () => ({ value: '', formatted: '' }),
      isDirty: dataDirtyClean.isDirty
    };

    // Build the grid
    grid.build(container);
    
    gridRef.current = grid;

    return () => {
      if (gridRef.current) {
        gridRef.current.destroy?.();
      }
    };
  }, [matrixItems, displayItems, zoom, collapsed, getDependencyCount, getDependencyColor, fileList, files]);

  // Handle zoom
  // Handle zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setZoom(prev => Math.max(0.1, Math.min(1.0, prev + delta)));
    }
  };

  return (
    <div className="relative">
      <div className="mb-4 flex items-center gap-4">
        <span className="text-sm">Zoom: {Math.round(zoom * 100)}%</span>
        <button 
          onClick={() => setZoom(prev => Math.max(0.1, prev - 0.1))}
          className="px-2 py-1 bg-blue-500 text-white rounded text-sm"
        >
          -
        </button>
        <button 
          onClick={() => setZoom(prev => Math.min(1.0, prev + 0.1))}
          className="px-2 py-1 bg-blue-500 text-white rounded text-sm"
        >
          +
        </button>
      </div>
      
      <div 
        ref={gridContainerRef}
        onWheel={handleWheel}
        className="w-full border border-gray-300"
        style={{ height: '80vh' }}
      />
    </div>
  );
}
