import * as path from "path";
import { LanguageAnalyzer } from "./types";

// C/C++ analyzer
export const cppAnalyzer: LanguageAnalyzer = {
  extensions: ['.cpp', '.c', '.h', '.hpp', '.cc', '.cxx'],
  analyze(filePath: string, content: string, allFiles: string[]): string[] {
    const dependencies: string[] = [];
    const dir = path.dirname(filePath);
    
    // Match #include "local.h" (not <system.h>)
    const includeRegex = /#include\s+"([^"]+)"/g;
    
    let match;
    while ((match = includeRegex.exec(content)) !== null) {
      const includePath = match[1];
      const resolvedPath = path.join(dir, includePath);
      const normalizedPath = path.normalize(resolvedPath).replace(/^\/+/, '');
      
      if (allFiles.includes(normalizedPath)) {
        dependencies.push(normalizedPath);
      }
    }
    
    return [...new Set(dependencies)];
  }
};
