import * as path from "path";
import { LanguageAnalyzer } from "./types";

// Python analyzer
export const pythonAnalyzer: LanguageAnalyzer = {
  extensions: ['.py'],
  analyze(filePath: string, content: string, allFiles: string[]): string[] {
    const dependencies: string[] = [];
    const dir = path.dirname(filePath);
    
    // Match: import module, from module import ...
    const importRegex = /^(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))/gm;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const modulePath = match[1] || match[2];
      
      // Skip standard library and external packages (heuristic: relative imports start with .)
      if (!modulePath.startsWith('.')) {
        continue;
      }
      
      // Convert Python module path to file path
      const relativePath = modulePath.replace(/\./g, '/');
      const resolvedPath = path.join(dir, relativePath);
      
      const possiblePaths = [
        resolvedPath + '.py',
        path.join(resolvedPath, '__init__.py')
      ];
      
      for (const testPath of possiblePaths) {
        const normalizedPath = path.normalize(testPath).replace(/^\/+/, '');
        if (allFiles.includes(normalizedPath)) {
          dependencies.push(normalizedPath);
          break;
        }
      }
    }
    
    return [...new Set(dependencies)];
  }
};
