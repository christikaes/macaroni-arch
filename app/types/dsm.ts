export interface FileDependency {
  fileName: string;
  dependencies: number;
}

export interface FileData {
  dependencies: FileDependency[];
  complexity: number;
  lineCount: number;
}

export interface DisplayItem {
  path: string;
  displayName: string;
  indent: number;
  isDirectory: boolean;
  fileIndices: number[];
  id: string;
  showInMatrix: boolean;
}

export interface DSMData {
  files: { [fileName: string]: FileData };
  displayItems: DisplayItem[];
  fileList: string[];
}
