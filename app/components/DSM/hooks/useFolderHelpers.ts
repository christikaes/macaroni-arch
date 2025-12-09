import { useCallback } from "react";
import { DisplayItem } from "~/types/dsm";

export function useFolderHelpers() {
  // Get all ancestor folder paths for an item
  const getAncestorFolders = useCallback((item: DisplayItem): string[] => {
    const parts = item.path.split("/");
    const ancestors: string[] = [];
    
    if (!item.isDirectory) {
      ancestors.push(parts.slice(0, -1).join("/"));
      for (let i = parts.length - 2; i > 0; i--) {
        ancestors.push(parts.slice(0, i).join("/"));
      }
    } else {
      ancestors.push(item.path);
      for (let i = parts.length - 1; i > 0; i--) {
        ancestors.push(parts.slice(0, i).join("/"));
      }
    }
    
    return ancestors;
  }, []);

  return { getAncestorFolders };
}
