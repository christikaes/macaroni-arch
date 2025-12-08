// Language-specific analyzer interface
export interface LanguageAnalyzer {
  extensions: string[];
  analyze(filePath: string, content: string, allFiles: string[], repoPath?: string): string[] | Promise<string[]>;
  // Optional bulk analysis method for better performance
  // Returns Map<file, Map<dependency, count>>
  analyzeAll?(files: string[], repoPath: string): Promise<Map<string, Map<string, number>>>;
}
