import * as path from "path";
import * as fs from "fs";
import { LanguageAnalyzer } from "./types";

/**
 * Calculate cyclomatic complexity for Python code
 */
export function calculatePythonComplexity(content: string): number {
  let complexity = 1; // Base complexity

  // Remove comments and strings to avoid false positives
  const cleaned = content
    // Remove single-line comments
    .replace(/#.*?$/gm, '')
    // Remove docstrings and multi-line strings
    .replace(/"""[\s\S]*?"""/g, '')
    .replace(/'''[\s\S]*?'''/g, '')
    // Remove regular strings
    .replace(/"(?:[^"\\]|\\.)*"/g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, '');

  // Count decision points
  complexity += (cleaned.match(/\bif\b/g) || []).length;
  complexity += (cleaned.match(/\belif\b/g) || []).length;
  complexity += (cleaned.match(/\bfor\b/g) || []).length;
  complexity += (cleaned.match(/\bwhile\b/g) || []).length;
  complexity += (cleaned.match(/\bexcept\b/g) || []).length;
  complexity += (cleaned.match(/\band\b/g) || []).length;
  complexity += (cleaned.match(/\bor\b/g) || []).length;
  complexity += (cleaned.match(/\belse\b/g) || []).length;

  return complexity;
}

/**
 * Cache for Python module paths
 */
const moduleCache = new Map<string, { modulePath: string; symbols: Set<string> }>();

/**
 * Extract module symbols (classes, functions) from Python file
 */
function extractPythonSymbols(content: string): Set<string> {
  const symbols = new Set<string>();
  
  // Extract class names
  const classRegex = /^\s*class\s+(\w+)/gm;
  let match;
  while ((match = classRegex.exec(content)) !== null) {
    symbols.add(match[1]);
  }
  
  // Extract function/method names
  const funcRegex = /^\s*def\s+(\w+)/gm;
  while ((match = funcRegex.exec(content)) !== null) {
    symbols.add(match[1]);
  }
  
  return symbols;
}

/**
 * Build cache of all Python modules with their symbols
 */
function buildPythonModuleCache(allFiles: string[], baseDir: string): void {
  moduleCache.clear();
  
  console.log(`[Python Analyzer] Building module cache for ${allFiles.length} Python files...`);
  
  for (const file of allFiles) {
    try {
      const fullPath = path.join(baseDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const symbols = extractPythonSymbols(content);
      
      // Convert file path to module path (e.g., src/models/user.py -> src.models.user)
      const modulePath = file
        .replace(/\.py$/, '')
        .replace(/\/__init__$/, '')
        .split(path.sep)
        .join('.');
      
      moduleCache.set(file, { modulePath, symbols });
      
      if (moduleCache.size <= 5) {
        console.log(`[Python Analyzer] Cached: ${file} -> module: "${modulePath}", symbols: ${symbols.size}`);
      }
    } catch {
      continue;
    }
  }
  
  console.log(`[Python Analyzer] Built cache with ${moduleCache.size} modules`);
}

/**
 * Resolve Python import to file paths
 */
function pythonImportToFilePaths(importStatement: string, fromModule?: string, currentFile?: string): string[] {
  const matches: string[] = [];
  
  for (const [filePath, { modulePath, symbols }] of moduleCache.entries()) {
    // Skip the current file
    if (currentFile && filePath === currentFile) continue;
    
    // Handle "from X import Y" statements
    if (fromModule) {
      // Handle relative imports (from .module import X or from ..module import X)
      if (fromModule.startsWith('.')) {
        if (!currentFile) continue;
        
        const currentDir = path.dirname(currentFile);
        const dots = fromModule.match(/^\.+/)?.[0] || '';
        const moduleWithoutDots = fromModule.slice(dots.length);
        
        // Calculate the target directory
        let targetDir = currentDir;
        for (let i = 1; i < dots.length; i++) {
          targetDir = path.dirname(targetDir);
        }
        
        // Build the expected module path
        const expectedModule = moduleWithoutDots 
          ? `${targetDir}/${moduleWithoutDots}`.split(path.sep).filter(p => p).join('.')
          : targetDir.split(path.sep).filter(p => p).join('.');
        
        // Check if this file's module matches
        if (modulePath === expectedModule || modulePath.startsWith(expectedModule + '.')) {
          if (symbols.has(importStatement) || importStatement === '*') {
            matches.push(filePath);
          }
        }
      } else {
        // Absolute import: check if this file's module matches the from clause
        if (modulePath === fromModule || modulePath.startsWith(fromModule + '.')) {
          // Check if the imported symbol exists in this module
          if (symbols.has(importStatement) || importStatement === '*') {
            matches.push(filePath);
          }
        }
      }
    } else {
      // Handle "import X" statements
      if (modulePath === importStatement || modulePath.startsWith(importStatement + '.')) {
        matches.push(filePath);
      }
    }
  }
  
  return matches;
}

/**
 * Extract import statements from Python content
 */
function extractImports(content: string): {
  imports: Set<string>;
  fromImports: Map<string, Set<string>>;
} {
  const imports = new Set<string>();
  const fromImports = new Map<string, Set<string>>();
  
  // Match: import module
  // Match: import module as alias
  const importRegex = /^\s*import\s+([\w.]+)(?:\s+as\s+\w+)?/gm;
  
  // Match: from module import symbol
  // Match: from module import symbol as alias
  // Match: from module import symbol1, symbol2
  const fromImportRegex = /^\s*from\s+([\w.]+)\s+import\s+(.+)/gm;
  
  let match;
  
  // Extract regular imports
  while ((match = importRegex.exec(content)) !== null) {
    const moduleName = match[1];
    
    // Skip standard library and common third-party packages
    if (isStandardLibrary(moduleName)) {
      continue;
    }
    
    imports.add(moduleName);
  }
  
  // Extract from imports
  while ((match = fromImportRegex.exec(content)) !== null) {
    const moduleName = match[1];
    const importList = match[2];
    
    // Skip standard library
    if (isStandardLibrary(moduleName)) {
      continue;
    }
    
    // Parse imported symbols (handle "import a, b, c" and "import a as x, b as y")
    const symbols = importList
      .split(',')
      .map(s => s.trim().split(' as ')[0].trim())
      .filter(s => s);
    
    if (!fromImports.has(moduleName)) {
      fromImports.set(moduleName, new Set());
    }
    
    for (const symbol of symbols) {
      fromImports.get(moduleName)!.add(symbol);
    }
  }
  
  return { imports, fromImports };
}

/**
 * Check if a module is from standard library or common third-party packages
 */
function isStandardLibrary(moduleName: string): boolean {
  const stdLibPrefixes = [
    'sys', 'os', 're', 'json', 'datetime', 'collections', 'typing',
    'pathlib', 'io', 'time', 'random', 'math', 'logging', 'unittest',
    'argparse', 'subprocess', 'threading', 'multiprocessing', 'asyncio',
    // Common third-party
    'django', 'flask', 'numpy', 'pandas', 'requests', 'pytest',
    'sqlalchemy', 'redis', 'celery', 'boto3', 'pydantic'
  ];
  
  return stdLibPrefixes.some(prefix => moduleName === prefix || moduleName.startsWith(prefix + '.'));
}

export const pythonAnalyzer: LanguageAnalyzer = {
  extensions: ['.py'],
  analyze(filePath: string, content: string, _allFiles: string[]): string[] {
    const dependencies: string[] = [];
    
    console.log(`[Python Analyzer] Analyzing file: ${filePath}`);
    
    const { imports, fromImports } = extractImports(content);
    
    console.log(`[Python Analyzer]   Imports: ${Array.from(imports).join(', ')}`);
    console.log(`[Python Analyzer]   From imports: ${Array.from(fromImports.keys()).join(', ')}`);
    
    // Resolve regular imports
    for (const importModule of imports) {
      const resolvedFiles = pythonImportToFilePaths(importModule, undefined, filePath);
      dependencies.push(...resolvedFiles);
    }
    
    // Resolve from imports
    for (const [module, symbols] of fromImports.entries()) {
      for (const symbol of symbols) {
        const resolvedFiles = pythonImportToFilePaths(symbol, module, filePath);
        dependencies.push(...resolvedFiles);
      }
    }
    
    console.log(`[Python Analyzer]   Total dependencies: ${dependencies.length}`);
    
    return [...new Set(dependencies)];
  },
  
  async analyzeAll(files: string[], repoPath: string): Promise<Map<string, Map<string, number>>> {
    const dependencyMap = new Map<string, Map<string, number>>();
    
    console.log(`[Python Analyzer] analyzeAll called with ${files.length} files`);
    
    // Build module cache first
    buildPythonModuleCache(files, repoPath);
    
    // Analyze each file
    for (const file of files) {
      const fullPath = path.join(repoPath, file);
      
      try {
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        const { imports, fromImports } = extractImports(content);
        
        const fileDeps = new Map<string, number>();
        
        // Process regular imports
        for (const importModule of imports) {
          const resolvedFiles = pythonImportToFilePaths(importModule, undefined, file);
          for (const dep of resolvedFiles) {
            fileDeps.set(dep, (fileDeps.get(dep) || 0) + 1);
          }
        }
        
        // Process from imports and count actual symbol usage
        for (const [module, symbols] of fromImports.entries()) {
          for (const symbol of symbols) {
            if (symbol === '*') {
              // Wildcard import - add all files in module
              const resolvedFiles = pythonImportToFilePaths(symbol, module, file);
              for (const dep of resolvedFiles) {
                fileDeps.set(dep, (fileDeps.get(dep) || 0) + 1);
              }
            } else {
              // Specific symbol - count usage in code
              const resolvedFiles = pythonImportToFilePaths(symbol, module, file);
              
              for (const dep of resolvedFiles) {
                // Count how many times this symbol is used
                const symbolPattern = new RegExp(`\\b${symbol}\\b(?!\\()`, 'g');
                const matches = content.match(symbolPattern);
                
                if (matches && matches.length > 0) {
                  fileDeps.set(dep, (fileDeps.get(dep) || 0) + matches.length);
                }
              }
            }
          }
        }
        
        if (fileDeps.size > 0) {
          dependencyMap.set(file, fileDeps);
          console.log(`[Python Analyzer] ${file} has ${fileDeps.size} dependencies`);
        }
      } catch (error) {
        console.error(`[Python Analyzer] Error analyzing ${file}:`, error);
      }
    }
    
    console.log(`[Python Analyzer] analyzeAll completed: ${dependencyMap.size} files with dependencies`);
    return dependencyMap;
  }
};
