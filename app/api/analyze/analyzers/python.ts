import * as path from "path";
import { LanguageAnalyzer } from "./types";
import { exec } from "child_process";
import { promisify } from "util";
import { PYTHON_EXTENSIONS } from "./constants";

const execAsync = promisify(exec);

// Configuration toggles
const INCLUDE_TESTS = true;

// Store for counting imports per file
const importCounts = new Map<string, Map<string, number>>();

/**
 * Run Python script to analyze imports using Python's AST module.
 */
async function analyzePythonFile(filePath: string): Promise<Map<string, number>> {
  // Use path relative to project root since __dirname doesn't work in Next.js API routes
  const analyzerScript = path.join(process.cwd(), 'app/api/analyze/analyzers/python_analyzer.py');
  
  try {
    const { stdout } = await execAsync(`python3 "${analyzerScript}" "${filePath}"`, {
      maxBuffer: 1024 * 1024 // 1MB buffer
    });
    
    const counts = JSON.parse(stdout) as Record<string, number>;
    return new Map(Object.entries(counts));
  } catch (error) {
    console.error(`Error analyzing Python file ${filePath}:`, error);
    return new Map();
  }
}

/**
 * Convert Python module path to file path.
 * Examples:
 * - .foo -> ./foo.py or ./foo/__init__.py
 * - ..bar -> ../bar.py or ../bar/__init__.py  
 * - foo.bar -> foo/bar.py
 */
function pythonModuleToFilePath(modulePath: string, currentFileDir: string, allFiles: string[]): string | null {
  // Handle relative imports (starting with .)
  if (modulePath.startsWith('.')) {
    // Count leading dots to determine relative level
    const dots = modulePath.match(/^\.+/)?.[0] || '';
    const moduleWithoutDots = modulePath.slice(dots.length);
    
    // Convert dots to relative path
    const relativePath = '../'.repeat(dots.length - 1) + moduleWithoutDots.replace(/\./g, '/');
    const resolvedPath = path.join(currentFileDir, relativePath);
    
    // Try different file extensions
    const possiblePaths = [
      resolvedPath + '.py',
      path.join(resolvedPath, '__init__.py')
    ];
    
    for (const testPath of possiblePaths) {
      const normalizedPath = path.normalize(testPath).replace(/^\/+/, '');
      if (allFiles.includes(normalizedPath)) {
        return normalizedPath;
      }
    }
  } else {
    // Handle absolute imports within the project
    // Try to match the module path to actual files
    const moduleParts = modulePath.split('.');
    
    // Try different combinations to find the file
    for (let i = moduleParts.length; i > 0; i--) {
      const possiblePath = moduleParts.slice(0, i).join('/');
      
      const testPaths = [
        possiblePath + '.py',
        path.join(possiblePath, '__init__.py'),
      ];
      
      for (const testPath of testPaths) {
        if (allFiles.includes(testPath)) {
          return testPath;
        }
      }
    }
  }
  
  return null;
}

// Python analyzer
export const pythonAnalyzer: LanguageAnalyzer = {
  extensions: PYTHON_EXTENSIONS.map(ext => `.${ext}`),
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
  },

  async analyzeAll(files: string[], repoPath: string): Promise<Map<string, Map<string, number>>> {
    const dependencyMap = new Map<string, Map<string, number>>();
    
    // Clear previous import counts
    importCounts.clear();
    
    // Filter Python files based on INCLUDE_TESTS configuration
    const pythonFiles = INCLUDE_TESTS 
      ? files 
      : files.filter(f => !f.includes('test_') && !f.includes('_test.py') && !f.endsWith('_test.py'));
    
    // Analyze each Python file to count imports
    for (const file of pythonFiles) {
      const fullPath = path.join(repoPath, file);
      
      try {
        const counts = await analyzePythonFile(fullPath);
        if (counts.size > 0) {
          importCounts.set(file, counts);
        }
      } catch (error) {
        console.error(`Failed to analyze ${file}:`, error);
      }
    }
    
    // Build dependency map with counts
    for (const file of pythonFiles) {
      const fileCounts = importCounts.get(file);
      if (!fileCounts || fileCounts.size === 0) continue;
      
      const fileDir = path.dirname(file);
      const depCountMap = new Map<string, number>();
      
      console.log(`Processing ${file}, found ${fileCounts.size} imports`);
      
      for (const [modulePath, count] of fileCounts.entries()) {
        const resolvedFile = pythonModuleToFilePath(modulePath, fileDir, pythonFiles);
        
        if (resolvedFile) {
          console.log(`  ${modulePath} -> ${resolvedFile} (count: ${count})`);
          depCountMap.set(resolvedFile, count);
        } else {
          console.log(`  ${modulePath} -> NOT RESOLVED`);
        }
      }
      
      if (depCountMap.size > 0) {
        dependencyMap.set(file, depCountMap);
      }
    }
    
    return dependencyMap;
  }
};