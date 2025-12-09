"use client";

import { useState, useCallback, useTransition } from "react";
import { DSMData } from "~/types/dsm";
import Viewport from "../Viewport";
import { useDSMData } from "./hooks/useDSMData";
import { useColorGradients } from "./hooks/useColorGradients";
import { useHierarchyCache } from "./hooks/useHierarchyCache";
import { MatrixHeaders } from "./MatrixHeaders";
import { FolderRectangles } from "./FolderRectangles";
import { HoverHighlights } from "./HoverHighlights";
import { MatrixRows } from "./MatrixRows";
import { InfoOverlay } from "./InfoOverlay";
import styles from "./DSM.module.css";

interface DSMMatrixProps {
  data: DSMData;
  repoUrl?: string;
}

export default function DSMMatrix({ data, repoUrl }: DSMMatrixProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    files,
    fileList,
    matrixItems,
    getDependencyCount,
    minDeps,
    maxDeps,
    maxComplexity,
    numHierarchyColumns,
  } = useDSMData(data, collapsed);

  const { getDependencyColor, getComplexityColor } = useColorGradients(
    minDeps,
    maxDeps,
    maxComplexity
  );

  const { getCellInfo } = useHierarchyCache(matrixItems, numHierarchyColumns);

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

  const gridStyle = {
    gridTemplateColumns: `repeat(${numHierarchyColumns}, minmax(60px, auto)) 50px repeat(${matrixItems.length}, 30px)`,
    gridTemplateRows: `100px repeat(${matrixItems.length}, 30px)`,
    backgroundImage: `
      linear-gradient(to right, rgba(250, 204, 21, 0.15) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(250, 204, 21, 0.15) 1px, transparent 1px)
    `,
    backgroundSize: `30px 30px`,
    backgroundPosition: `${numHierarchyColumns * 60 + 50}px 100px`,
  };

  return (
    <>
      <Viewport isPending={isPending}>
        <div className={styles.container}>
          <div className={styles.grid} style={gridStyle}>
            <MatrixHeaders
              numHierarchyColumns={numHierarchyColumns}
              matrixItems={matrixItems}
              setHoveredCell={setHoveredCell}
            />

            <FolderRectangles
              matrixItems={matrixItems}
              numHierarchyColumns={numHierarchyColumns}
              toggleCollapse={toggleCollapse}
              setHoveredFolder={setHoveredFolder}
              hoveredFolder={hoveredFolder}
            />

            <HoverHighlights
              hoveredCell={hoveredCell}
              numHierarchyColumns={numHierarchyColumns}
              matrixItems={matrixItems}
            />

            <MatrixRows
              matrixItems={matrixItems}
              numHierarchyColumns={numHierarchyColumns}
              getCellInfo={getCellInfo}
              collapsed={collapsed}
              toggleCollapse={toggleCollapse}
              setHoveredCell={setHoveredCell}
              setHoveredFolder={setHoveredFolder}
              getDependencyCount={getDependencyCount}
              getDependencyColor={getDependencyColor}
              getComplexityColor={getComplexityColor}
              files={files}
              fileList={fileList}
              repoUrl={repoUrl}
              branch={data.branch}
            />
          </div>
        </div>
      </Viewport>

      <InfoOverlay
        hoveredCell={hoveredCell}
        hoveredFolder={hoveredFolder}
        matrixItems={matrixItems}
        getDependencyCount={getDependencyCount}
        files={files}
        fileList={fileList}
        repoUrl={repoUrl}
        branch={data.branch}
      />
    </>
  );
}
