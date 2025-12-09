import { LanguageAnalyzer } from "./types";

// Rust analyzer (placeholder - to be implemented)
export const rustAnalyzer: LanguageAnalyzer = {
  extensions: ['.rs'],
  analyze(_filePath: string, _content: string, _allFiles: string[]): string[] {
    // TODO: Implement Rust mod/use analysis
    return [];
  }
};
