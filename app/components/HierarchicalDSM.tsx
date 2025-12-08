"use client";

import { useState, useMemo } from "react";
import { DSMData } from "../api/analyze/route";

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
  const { files, matrix } = data;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
    files.forEach((file, idx) => {
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
  }, [files, collapsed]);

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
        if (matrix[fromIdx] && matrix[fromIdx][toIdx]) {
          total += matrix[fromIdx][toIdx].dependencies;
        }
      });
    });
    return total;
  };

  return (
    <div className="w-full overflow-auto">
      <div className="inline-block min-w-full">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-yellow-100 border border-yellow-400 p-2 text-xs font-semibold text-gray-700">
                File/Folder
              </th>
              {displayItems.filter(item => item.showInMatrix).map((item, idx) => (
                <th
                  key={idx}
                  className="border border-yellow-400 bg-yellow-100 p-2 text-xs font-semibold text-gray-700"
                  style={{ minWidth: "50px" }}
                  title={item.path}
                >
                  <div className="text-center py-1">
                    {item.id}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayItems.map((rowItem, rowIdx) => (
              <tr key={rowIdx}>
                <td
                  className={`sticky left-0 z-10 bg-yellow-50 border border-yellow-400 p-2 text-xs font-medium text-gray-800 whitespace-nowrap ${
                    rowItem.isDirectory ? "cursor-pointer hover:bg-yellow-100" : ""
                  }`}
                  onClick={() => rowItem.isDirectory && toggleCollapse(rowItem.path)}
                  style={{ paddingLeft: `${8 + rowItem.indent * 16}px` }}
                >
                  <span className="inline-block w-8 text-gray-500">
                    {rowItem.showInMatrix ? rowItem.id : ""}
                  </span>
                  {rowItem.isDirectory && (
                    <span className="mr-1 inline-block w-4">
                      {collapsed.has(rowItem.path) ? "▶" : "▼"}
                    </span>
                  )}
                  {rowItem.isDirectory && <span className="mr-1">📁</span>}
                  {!rowItem.isDirectory && <span className="mr-1">📄</span>}
                  {rowItem.displayName}
                </td>
                {rowItem.showInMatrix && displayItems.filter(item => item.showInMatrix).map((colItem, colIdx) => {
                  const isMainDiagonal = rowItem.path === colItem.path;
                  const depCount = getDependencyCount(
                    rowItem.fileIndices,
                    colItem.fileIndices
                  );
                  const hasDependency = depCount > 0;

                  return (
                    <td
                      key={colIdx}
                      className={`border border-yellow-400 p-2 text-center text-xs ${
                        isMainDiagonal
                          ? "bg-gray-300"
                          : hasDependency
                          ? "bg-orange-400 text-white font-semibold hover:bg-orange-500 cursor-pointer"
                          : "bg-white hover:bg-yellow-50"
                      }`}
                      style={{ minWidth: "50px", height: "40px" }}
                      title={
                        isMainDiagonal
                          ? rowItem.path
                          : `${rowItem.path} → ${colItem.path}: ${depCount} dependencies`
                      }
                    >
                      {!isMainDiagonal && hasDependency ? depCount : ""}
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
