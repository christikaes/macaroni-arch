export interface FileDependency {
  fileName: string;
  dependencies: number;
}

export interface FileData {
  dependencies: FileDependency[];
  complexity: number;
}

export interface TreeNode {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  children?: TreeNode[];
}

export interface DSMData {
  files: { [fileName: string]: FileData };
  fileTree: TreeNode[];
  recommendedModuleTree: TreeNode[];
}
