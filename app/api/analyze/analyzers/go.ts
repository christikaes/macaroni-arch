import * as path from "path";
import * as fs from "fs";
import { LanguageAnalyzer } from "./types";

/**
 * Calculate cyclomatic complexity for Go code
 */
export function calculateGoComplexity(content: string): number {
  let complexity = 1; // Base complexity

  // Remove comments and strings to avoid false positives
  const cleaned = content
    // Remove single-line comments
    .replace(/\/\/.*?$/gm, '')
    // Remove multi-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove strings
    .replace(/"(?:[^"\\]|\\.)*"/g, '')
    .replace(/`[^`]*`/g, ''); // Go raw strings

  // Count decision points
  complexity += (cleaned.match(/\bif\b/g) || []).length;
  complexity += (cleaned.match(/\bfor\b/g) || []).length;
  complexity += (cleaned.match(/\bswitch\b/g) || []).length;
  complexity += (cleaned.match(/\bcase\b/g) || []).length;
  complexity += (cleaned.match(/\bselect\b/g) || []).length; // Channel selection
  complexity += (cleaned.match(/&&/g) || []).length;
  complexity += (cleaned.match(/\|\|/g) || []).length;

  return complexity;
}

/**
 * Cache for Go package paths
 */
const packageCache = new Map<string, { packagePath: string; symbols: Set<string> }>();

/**
 * Extract package symbols (types, functions, constants, vars) from Go file
 */
function extractGoSymbols(content: string): Set<string> {
  const symbols = new Set<string>();
  
  // Extract type definitions (structs, interfaces, etc.)
  const typeRegex = /^\s*type\s+(\w+)/gm;
  let match;
  while ((match = typeRegex.exec(content)) !== null) {
    symbols.add(match[1]);
  }
  
  // Extract function names (exported functions start with capital letter)
  const funcRegex = /^\s*func\s+(?:\([^)]*\)\s*)?(\w+)/gm;
  while ((match = funcRegex.exec(content)) !== null) {
    const funcName = match[1];
    // Only add exported symbols (start with capital letter)
    if (funcName[0] === funcName[0].toUpperCase()) {
      symbols.add(funcName);
    }
  }
  
  // Extract const and var declarations
  const constVarRegex = /^\s*(?:const|var)\s+(\w+)/gm;
  while ((match = constVarRegex.exec(content)) !== null) {
    const name = match[1];
    // Only add exported symbols
    if (name[0] === name[0].toUpperCase()) {
      symbols.add(name);
    }
  }
  
  return symbols;
}

/**
 * Extract package name from Go file
 */
function extractPackageName(content: string): string {
  const packageMatch = content.match(/^\s*package\s+(\w+)/m);
  return packageMatch ? packageMatch[1] : '';
}

/**
 * Build cache of all Go packages with their symbols
 */
function buildGoPackageCache(allFiles: string[], baseDir: string): void {
  packageCache.clear();
  
  console.log(`[Go Analyzer] Building package cache for ${allFiles.length} Go files...`);
  
  for (const file of allFiles) {
    try {
      const fullPath = path.join(baseDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const symbols = extractGoSymbols(content);
      const packageName = extractPackageName(content);
      
      // Package path is the directory path
      const packagePath = path.dirname(file);
      
      packageCache.set(file, { packagePath, symbols });
      
      if (packageCache.size <= 5) {
        console.log(`[Go Analyzer] Cached: ${file} -> package: "${packageName}" (${packagePath}), symbols: ${symbols.size}`);
      }
    } catch {
      continue;
    }
  }
  
  console.log(`[Go Analyzer] Built cache with ${packageCache.size} files`);
}

/**
 * Resolve Go import to file paths
 */
function goImportToFilePaths(importPath: string, currentFile: string): string[] {
  const matches: string[] = [];
  
  // In Go, imports reference package paths, not individual files
  // We need to find all files in the matching package directory
  
  for (const [filePath, { packagePath }] of packageCache.entries()) {
    if (filePath === currentFile) continue;
    
    // Check if this file's package path matches the import
    // Import can be:
    // 1. Relative: "./package" or "../package"
    // 2. Absolute within module: "module/path/package"
    
    if (importPath.startsWith('.')) {
      // Relative import
      const currentDir = path.dirname(currentFile);
      const resolvedPath = path.normalize(path.join(currentDir, importPath));
      
      if (packagePath === resolvedPath) {
        matches.push(filePath);
      }
    } else {
      // Absolute import - match the end of the package path
      if (packagePath.endsWith(importPath) || importPath.includes(packagePath)) {
        matches.push(filePath);
      }
    }
  }
  
  return matches;
}

/**
 * Extract import statements from Go content
 */
function extractImports(content: string): Set<string> {
  const imports = new Set<string>();
  
  // Match single import: import "package/path"
  const singleImportRegex = /^\s*import\s+"([^"]+)"/gm;
  
  // Match grouped imports: import ( ... )
  const groupImportRegex = /import\s*\(\s*([\s\S]*?)\s*\)/g;
  
  let match;
  
  // Extract single imports
  while ((match = singleImportRegex.exec(content)) !== null) {
    const importPath = match[1];
    
    // Skip standard library (no dots in path for std lib like "fmt", "os", "net/http")
    if (isStandardLibrary(importPath)) {
      continue;
    }
    
    imports.add(importPath);
  }
  
  // Extract grouped imports
  while ((match = groupImportRegex.exec(content)) !== null) {
    const importBlock = match[1];
    const importLineRegex = /"([^"]+)"/g;
    
    let lineMatch;
    while ((lineMatch = importLineRegex.exec(importBlock)) !== null) {
      const importPath = lineMatch[1];
      
      if (isStandardLibrary(importPath)) {
        continue;
      }
      
      imports.add(importPath);
    }
  }
  
  return imports;
}

/**
 * Check if an import path is from the standard library
 */
function isStandardLibrary(importPath: string): boolean {
  // Standard library packages don't have dots in their paths
  // and are typically single words or paths like "net/http"
  // Project imports typically look like "github.com/user/repo/package"
  
  const stdLibPatterns = [
    'fmt', 'os', 'io', 'strings', 'strconv', 'errors', 'log', 'time',
    'math', 'sort', 'sync', 'context', 'encoding/', 'net/', 'crypto/',
    'database/', 'testing', 'runtime', 'reflect', 'regexp', 'bytes',
    'bufio', 'flag', 'path', 'filepath'
  ];
  
  // If it contains a domain (has dots), it's likely a third-party package
  if (importPath.includes('.')) {
    return false;
  }
  
  // Check if it matches standard library patterns
  return stdLibPatterns.some(pattern => 
    importPath === pattern || importPath.startsWith(pattern)
  );
}

export const goAnalyzer: LanguageAnalyzer = {
  extensions: ['.go'],
  analyze(filePath: string, content: string, _allFiles: string[]): string[] {
    const dependencies: string[] = [];
    
    console.log(`[Go Analyzer] Analyzing file: ${filePath}`);
    
    const imports = extractImports(content);
    
    console.log(`[Go Analyzer]   Imports: ${Array.from(imports).join(', ')}`);
    
    // Resolve imports to files
    for (const importPath of imports) {
      const resolvedFiles = goImportToFilePaths(importPath, filePath);
      dependencies.push(...resolvedFiles);
    }
    
    console.log(`[Go Analyzer]   Total dependencies: ${dependencies.length}`);
    
    return [...new Set(dependencies)];
  },
  
  async analyzeAll(files: string[], repoPath: string): Promise<Map<string, Map<string, number>>> {
    const dependencyMap = new Map<string, Map<string, number>>();
    
    console.log(`[Go Analyzer] analyzeAll called with ${files.length} files`);
    
    // Build package cache first
    buildGoPackageCache(files, repoPath);
    
    // Analyze each file
    for (const file of files) {
      const fullPath = path.join(repoPath, file);
      
      try {
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        const imports = extractImports(content);
        
        const fileDeps = new Map<string, number>();
        
        // Process imports
        for (const importPath of imports) {
          const resolvedFiles = goImportToFilePaths(importPath, file);
          
          // For each file in the imported package, check which symbols are actually used
          for (const dep of resolvedFiles) {
            const depInfo = packageCache.get(dep);
            if (!depInfo) continue;
            
            let usageCount = 0;
            
            // Count usage of exported symbols from this file
            for (const symbol of depInfo.symbols) {
              const symbolPattern = new RegExp(`\\b${symbol}\\b`, 'g');
              const matches = content.match(symbolPattern);
              if (matches) {
                usageCount += matches.length;
              }
            }
            
            // If symbols from this file are used, add it as a dependency
            if (usageCount > 0) {
              fileDeps.set(dep, usageCount);
            } else {
              // Even if no specific symbols matched, the package is imported so add it with count 1
              fileDeps.set(dep, 1);
            }
          }
        }
        
        if (fileDeps.size > 0) {
          dependencyMap.set(file, fileDeps);
          console.log(`[Go Analyzer] ${file} has ${fileDeps.size} dependencies`);
        }
      } catch (error) {
        console.error(`[Go Analyzer] Error analyzing ${file}:`, error);
      }
    }
    
    console.log(`[Go Analyzer] analyzeAll completed: ${dependencyMap.size} files with dependencies`);
    return dependencyMap;
  }
};
