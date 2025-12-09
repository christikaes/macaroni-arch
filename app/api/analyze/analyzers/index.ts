export type { LanguageAnalyzer } from "./types";
export { jsAnalyzer } from "./javascript";
export { pythonAnalyzer } from "./python";
export { cppAnalyzer } from "./cpp";
export { javaAnalyzer, goAnalyzer, rustAnalyzer, csharpAnalyzer } from "./placeholders";

import { LanguageAnalyzer } from "./types";
import { jsAnalyzer } from "./javascript";
import { pythonAnalyzer } from "./python";
import { cppAnalyzer } from "./cpp";
import { javaAnalyzer, goAnalyzer, rustAnalyzer, csharpAnalyzer } from "./placeholders";

// Analyzer registry
export const analyzers: LanguageAnalyzer[] = [
  jsAnalyzer,
  pythonAnalyzer,
  javaAnalyzer,
  cppAnalyzer,
  goAnalyzer,
  rustAnalyzer,
  csharpAnalyzer
];

// Get analyzer for a file based on extension
export function getAnalyzer(filePath: string): LanguageAnalyzer | null {
  for (const analyzer of analyzers) {
    if (analyzer.extensions.some(ext => filePath.endsWith(ext))) {
      return analyzer;
    }
  }
  return null;
}
