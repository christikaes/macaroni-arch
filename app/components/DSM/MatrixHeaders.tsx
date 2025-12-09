import { DisplayItem } from "~/types/dsm";
import styles from "./DSM.module.css";

interface MatrixHeadersProps {
  numHierarchyColumns: number;
  matrixItems: DisplayItem[];
  setHoveredCell: (cell: { row: number; col: number } | null) => void;
}

export function MatrixHeaders({ 
  numHierarchyColumns, 
  matrixItems, 
  setHoveredCell 
}: MatrixHeadersProps) {
  return (
    <>
      {/* Hierarchy columns */}
      {Array.from({ length: numHierarchyColumns }).map((_, idx) => (
        <div key={`header-${idx}`} className={styles.headerCell} />
      ))}
      
      {/* ID column */}
      <div key="header-id" className={styles.headerCell} />
      
      {/* Matrix column headers */}
      {matrixItems.map((item, idx) => (
        <div
          key={`header-col-${idx}`}
          className={styles.headerCellColumn}
          onMouseEnter={() => setHoveredCell({ row: -1, col: idx })}
          onMouseLeave={() => setHoveredCell(null)}
          title={item.path}
        >
          <div className={styles.verticalText}>
            {item.id}
          </div>
        </div>
      ))}
    </>
  );
}
