'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import type { DSMData } from '../types/dsm';

interface HierarchicalDSMProps {
  data: DSMData;
}

interface DisplayItem {
  id: number;
  path: string;
  name: string;
  depth: number;
  isFolder: boolean;
  isCollapsed: boolean;
  fileIndices: number[];
  showInMatrix: boolean;
}

const BASE_CELL_SIZE = 40;
const HEADER_HEIGHT = 100;
const PATH_WIDTH = 500;
const ID_WIDTH = 50;
const ZOOM_THRESHOLD_SHOW_HEADERS = 0.8;

export default function HierarchicalDSM({ data }: HierarchicalDSMProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1.0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const { files } = data;

  // Build file list
  const fileList = useMemo(() => Object.keys(files).sort(), [files]);

  // Build hierarchical structure
  const displayItems = useMemo(() => {
    const items: DisplayItem[] = [];
    const folderMap = new Map<string, number[]>();

    // Group files by folder
    fileList.forEach((filePath, idx) => {
      const parts = filePath.split('/');
      for (let i = 0; i < parts.length - 1; i++) {
        const folderPath = parts.slice(0, i + 1).join('/');
        if (!folderMap.has(folderPath)) {
          folderMap.set(folderPath, []);
        }
        folderMap.get(folderPath)!.push(idx);
      }
    });

    // Build display items
    const processedPaths = new Set<string>();
    let idCounter = 1;

    const addItem = (path: string, depth: number) => {
      if (processedPaths.has(path)) return;
      processedPaths.add(path);

      const parts = path.split('/');
      const name = parts[parts.length - 1];
      const isFolder = folderMap.has(path);
      const isCollapsedFolder = collapsed.has(path);

      if (isFolder) {
        const fileIndices = folderMap.get(path)!;
        items.push({
          id: idCounter++,
          path,
          name,
          depth,
          isFolder: true,
          isCollapsed: isCollapsedFolder,
          fileIndices,
          showInMatrix: isCollapsedFolder,
        });

        if (!isCollapsedFolder) {
          // Add children
          const childPaths = new Set<string>();
          fileIndices.forEach(idx => {
            const filePath = fileList[idx];
            const fileParts = filePath.split('/');
            
            // Direct child folders
            if (fileParts.length > parts.length + 1) {
              const childFolderPath = fileParts.slice(0, parts.length + 1).join('/');
              childPaths.add(childFolderPath);
            }
            
            // Direct child files
            if (fileParts.length === parts.length + 1) {
              childPaths.add(filePath);
            }
          });

          Array.from(childPaths).sort().forEach(childPath => {
            addItem(childPath, depth + 1);
          });
        }
      } else {
        // It's a file
        const fileIdx = fileList.indexOf(path);
        items.push({
          id: idCounter++,
          path,
          name,
          depth,
          isFolder: false,
          isCollapsed: false,
          fileIndices: [fileIdx],
          showInMatrix: true,
        });
      }
    };

    // Start with root-level items
    const rootPaths = new Set<string>();
    fileList.forEach(filePath => {
      const parts = filePath.split('/');
      if (parts.length === 1) {
        rootPaths.add(filePath);
      } else {
        rootPaths.add(parts[0]);
      }
    });

    Array.from(rootPaths).sort().forEach(path => addItem(path, 0));

    return items;
  }, [fileList, collapsed]);

  // Only items shown in matrix
  const matrixItems = useMemo(() => {
    return displayItems.filter(item => item.showInMatrix);
  }, [displayItems]);

  // Calculate dependency count
  const getDependencyCount = useMemo(() => {
    return (fromIndices: number[], toIndices: number[]): number => {
      let count = 0;
      fromIndices.forEach(fromIdx => {
        const fromPath = fileList[fromIdx];
        const deps = files[fromPath]?.dependencies || [];
        toIndices.forEach(toIdx => {
          const toPath = fileList[toIdx];
          const depCount = deps.filter(d => d.fileName === toPath).reduce((sum, d) => sum + d.dependencies, 0);
          count += depCount;
        });
      });
      return count;
    };
  }, [fileList, files]);

  // Get dependency color
  const getDependencyColor = (count: number, isCyclical: boolean): string => {
    if (isCyclical) return 'rgb(239, 68, 68)'; // red-500
    
    const maxCount = 20;
    const normalized = Math.min(count / maxCount, 1);
    
    // Green to Blue gradient
    const startColor = { r: 34, g: 197, b: 94 }; // green-500
    const endColor = { r: 59, g: 130, b: 246 }; // blue-500
    
    const r = Math.round(startColor.r + (endColor.r - startColor.r) * normalized);
    const g = Math.round(startColor.g + (endColor.g - startColor.g) * normalized);
    const b = Math.round(startColor.b + (endColor.b - startColor.b) * normalized);
    
    return `rgb(${r}, ${g}, ${b})`;
  };

  // Toggle folder
  const toggleFolder = (path: string) => {
    setCollapsed(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  // Render with D3
  useEffect(() => {
    if (!svgRef.current || matrixItems.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const showHeaders = zoom >= ZOOM_THRESHOLD_SHOW_HEADERS;
    const cellSize = BASE_CELL_SIZE;
    const headerHeight = HEADER_HEIGHT;
    const pathWidth = PATH_WIDTH;
    const idWidth = ID_WIDTH;

    const matrixStartX = showHeaders ? pathWidth + idWidth : 0;
    const matrixStartY = showHeaders ? headerHeight : 0;
    const totalWidth = matrixStartX + matrixItems.length * cellSize;
    const totalHeight = matrixStartY + matrixItems.length * cellSize;

    svg.attr('width', totalWidth)
       .attr('height', totalHeight);

    const g = svg.append('g')
                 .attr('class', 'dsm-container');

    // Draw headers if zoomed in enough
    if (showHeaders) {
      // Path header
      g.append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', pathWidth)
        .attr('height', headerHeight)
        .attr('fill', '#fef3c7')
        .attr('stroke', '#d1d5db')
        .attr('stroke-width', 1);

      // ID header
      g.append('rect')
        .attr('x', pathWidth)
        .attr('y', 0)
        .attr('width', idWidth)
        .attr('height', headerHeight)
        .attr('fill', '#fef3c7')
        .attr('stroke', '#d1d5db')
        .attr('stroke-width', 1)
        .attr('stroke-right-width', 2);

      // Column headers
      matrixItems.forEach((item, idx) => {
        const x = matrixStartX + idx * cellSize;
        
        g.append('rect')
          .attr('x', x)
          .attr('y', 0)
          .attr('width', cellSize)
          .attr('height', headerHeight)
          .attr('fill', '#fef3c7')
          .attr('stroke', '#d1d5db')
          .attr('stroke-width', 1);

        g.append('text')
          .attr('x', x + cellSize / 2)
          .attr('y', headerHeight / 2)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('transform', `rotate(-90, ${x + cellSize / 2}, ${headerHeight / 2})`)
          .attr('font-size', '10px')
          .text(item.id)
          .attr('pointer-events', 'none');
      });

      // Row headers (path + ID)
      displayItems.forEach((item, idx) => {
        const y = matrixStartY + idx * cellSize;
        
        // Path cell
        const pathGroup = g.append('g')
          .attr('class', 'path-cell')
          .style('cursor', item.isFolder ? 'pointer' : 'default')
          .on('click', () => {
            if (item.isFolder) {
              toggleFolder(item.path);
            }
          });

        pathGroup.append('rect')
          .attr('x', 0)
          .attr('y', y)
          .attr('width', pathWidth)
          .attr('height', cellSize)
          .attr('fill', '#fffbeb')
          .attr('stroke', '#d1d5db')
          .attr('stroke-width', 1);

        pathGroup.append('text')
          .attr('x', 10 + item.depth * 20)
          .attr('y', y + cellSize / 2)
          .attr('dominant-baseline', 'middle')
          .attr('font-size', '12px')
          .text(`${item.isFolder ? (item.isCollapsed ? '▶' : '▼') : ''} ${item.name}`)
          .attr('pointer-events', 'none');

        // ID cell (only for matrix items)
        if (item.showInMatrix) {
          const matrixIdx = matrixItems.indexOf(item);
          if (matrixIdx >= 0) {
            g.append('rect')
              .attr('x', pathWidth)
              .attr('y', y)
              .attr('width', idWidth)
              .attr('height', cellSize)
              .attr('fill', '#fffbeb')
              .attr('stroke', '#d1d5db')
              .attr('stroke-width', 1);

            g.append('text')
              .attr('x', pathWidth + idWidth / 2)
              .attr('y', y + cellSize / 2)
              .attr('text-anchor', 'middle')
              .attr('dominant-baseline', 'middle')
              .attr('font-size', '10px')
              .text(item.id)
              .attr('pointer-events', 'none');
          }
        }
      });
    }

    // Draw matrix cells
    matrixItems.forEach((rowItem, rowIdx) => {
      matrixItems.forEach((colItem, colIdx) => {
        const x = matrixStartX + colIdx * cellSize;
        const y = matrixStartY + rowIdx * cellSize;
        
        const isMainDiagonal = rowItem.path === colItem.path;
        const depCount = getDependencyCount(rowItem.fileIndices, colItem.fileIndices);
        const hasDependency = depCount > 0;
        const reverseDepCount = !isMainDiagonal ? getDependencyCount(colItem.fileIndices, rowItem.fileIndices) : 0;
        const isCyclical = hasDependency && reverseDepCount > 0;

        let fillColor = 'white';
        let complexity: number | undefined;
        
        if (isMainDiagonal) {
          fillColor = '#d1d5db'; // gray-300
          if (rowItem.fileIndices.length === 1) {
            const filePath = fileList[rowItem.fileIndices[0]];
            complexity = files[filePath]?.complexity;
          }
        } else if (hasDependency) {
          fillColor = getDependencyColor(depCount, isCyclical);
        }

        const isHovered = hoveredCell?.row === rowIdx || hoveredCell?.col === colIdx;
        if (isHovered && !isMainDiagonal && !hasDependency) {
          fillColor = '#e0f2fe';
        }

        const cell = g.append('g')
          .attr('class', 'matrix-cell')
          .style('cursor', hasDependency ? 'pointer' : 'default');

        cell.append('rect')
          .attr('x', x)
          .attr('y', y)
          .attr('width', cellSize)
          .attr('height', cellSize)
          .attr('fill', fillColor)
          .attr('stroke', '#d1d5db')
          .attr('stroke-width', 0.5);

        // Add text for dependencies or complexity
        const displayText = isMainDiagonal && complexity !== undefined ? complexity.toString() : 
                           hasDependency ? depCount.toString() : '';
        
        if (displayText) {
          cell.append('text')
            .attr('x', x + cellSize / 2)
            .attr('y', y + cellSize / 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', zoom < 0.6 ? '0px' : zoom < 0.8 ? '8px' : '10px')
            .attr('fill', hasDependency ? 'white' : 'black')
            .attr('font-weight', isCyclical ? 'bold' : 'semibold')
            .text(displayText)
            .attr('pointer-events', 'none');
        }

        // Add hover handlers
        cell.on('mouseenter', (event: MouseEvent) => {
          setHoveredCell({ row: rowIdx, col: colIdx });
          
          const tooltipText = isMainDiagonal
            ? `${rowItem.path}${complexity !== undefined ? ` - Complexity: ${complexity}` : ''}`
            : hasDependency
            ? `${rowItem.path} → ${colItem.path}: ${depCount} dependencies${isCyclical ? ' ⚠️ CYCLICAL' : ''}`
            : '';
          
          if (tooltipText) {
            setTooltip({ x: event.pageX, y: event.pageY, text: tooltipText });
          }
        })
        .on('mousemove', (event: MouseEvent) => {
          if (tooltip) {
            setTooltip(prev => prev ? { ...prev, x: event.pageX, y: event.pageY } : null);
          }
        })
        .on('mouseleave', () => {
          setHoveredCell(null);
          setTooltip(null);
        });
      });
    });

  }, [matrixItems, displayItems, fileList, files, zoom, getDependencyCount, hoveredCell, tooltip]);

  // Handle zoom with wheel
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        setZoom(prev => Math.max(0.1, Math.min(1.0, prev + delta)));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div className="relative">
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
        ref={containerRef}
        className="overflow-auto border border-gray-300"
        style={{ 
          maxHeight: '80vh',
          maxWidth: '100%',
        }}
      >
        <div style={{ 
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
        }}>
          <svg ref={svgRef} />
        </div>
      </div>
    </div>
  );
}
