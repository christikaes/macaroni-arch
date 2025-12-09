import * as path from "path";
import * as fs from "fs";
import { LanguageAnalyzer } from "./types";
import { JAVA_EXTENSIONS } from "./constants";

// Configuration toggles
const INCLUDE_TESTS = true;

// Store for counting imports per file
const importCounts = new Map<string, Map<string, number>>();

// Store for complexity scores per file
const complexityScores = new Map<string, number>();

/**
 * Calculate cyclomatic complexity for Java code using regex
 */
function calculateComplexity(content: string): number {
  let complexity = 1; // Base complexity

  // Remove comments and strings to avoid false positives
  const cleaned = content
    // Remove single-line comments
    .replace(/\/\/.*?$/gm, '')
    // Remove multi-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove strings
    .replace(/"(?:[^"\\]|\\.)*"/g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, '');

  // Count decision points
  complexity += (cleaned.match(/\bif\s*\(/g) || []).length;
  complexity += (cleaned.match(/\bfor\s*\(/g) || []).length;
  complexity += (cleaned.match(/\bwhile\s*\(/g) || []).length;
  complexity += (cleaned.match(/\bdo\s*\{/g) || []).length;
  complexity += (cleaned.match(/\bcase\s+/g) || []).length;
  complexity += (cleaned.match(/\bcatch\s*\(/g) || []).length;
  complexity += (cleaned.match(/\?[^:]*:/g) || []).length;
  complexity += (cleaned.match(/&&/g) || []).length;
  complexity += (cleaned.match(/\|\|/g) || []).length;

  return complexity;
}

/**
 * Extract imports from Java code using regex
 */
function extractImports(content: string): Map<string, number> {
  const imports = new Map<string, number>();
  const importPattern = /^\s*import\s+(?:static\s+)?([a-zA-Z_][\w.]*(?:\.\*)?)\s*;/gm;
  
  let match;
  while ((match = importPattern.exec(content)) !== null) {
    const importName = match[1];
    imports.set(importName, (imports.get(importName) || 0) + 1);
  }
  
  return imports;
}

/**
 * Convert Java import path to file path.
 * Examples:
 * - com.example.model.User -> com/example/model/User.java
 * - org.springframework.samples.petclinic.Owner -> src/main/java/org/springframework/samples/petclinic/Owner.java
 * - com.example.util.* -> null (wildcard imports skipped)
 */
function javaImportToFilePath(importPath: string, allFiles: string[]): string | null {
  // Skip wildcard imports
  if (importPath.endsWith('.*')) {
    return null;
  }

  // Skip standard library (but NOT project-specific packages like org.springframework.samples.petclinic)
  const externalPrefixes = ['java.', 'javax.', 'org.junit.', 'org.mockito.', 'org.apache.commons.', 'org.apache.log4j.'];
  if (externalPrefixes.some(prefix => importPath.startsWith(prefix))) {
    return null;
  }

  // Convert package name to file path: com.example.User -> com/example/User.java
  const packagePath = importPath.replace(/\./g, '/') + '.java';
  
  // Try to find the file by matching the package path at the end of file paths
  // This handles cases like src/main/java/com/example/User.java
  const match = allFiles.find(f => f.endsWith(packagePath));
  if (match) {
    return match;
  }
  
  // If no exact match, try matching just the class name (fallback)
  const className = importPath.split('.').pop();
  if (className) {
    const classMatch = allFiles.find(f => f.endsWith(`/${className}.java`));
    if (classMatch) {
      return classMatch;
    }
  }
  
  return null;
}

/**
 * Calculate cyclomatic complexity for a Java file.
 * @param filePath - The full path to the Java file
 * @returns The cyclomatic complexity score
 */
export function calculateJavaComplexity(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return calculateComplexity(content);
  } catch (error) {
    console.error(`Failed to calculate complexity for ${filePath}:`, error);
    return 1;
  }
}

// Java analyzer
export const javaAnalyzer: LanguageAnalyzer = {
  extensions: JAVA_EXTENSIONS.map(ext => `.${ext}`),
  
  analyze(filePath: string, content: string, allFiles: string[]): string[] {
    const dependencies: string[] = [];
    const imports = extractImports(content);
    
    for (const [importPath] of imports.entries()) {
      const resolvedFile = javaImportToFilePath(importPath, allFiles);
      if (resolvedFile) {
        dependencies.push(resolvedFile);
      }
    }
    
    return [...new Set(dependencies)];
  },

  async analyzeAll(files: string[], repoPath: string): Promise<Map<string, Map<string, number>>> {
    const dependencyMap = new Map<string, Map<string, number>>();
    
    // Clear previous counts
    importCounts.clear();
    complexityScores.clear();
    
    // Filter Java files based on INCLUDE_TESTS configuration
    const javaFiles = INCLUDE_TESTS 
      ? files 
      : files.filter(f => !f.includes('Test.java') && !f.includes('/test/'));
    
    // Analyze each Java file
    for (const file of javaFiles) {
      const fullPath = path.join(repoPath, file);
      
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const imports = extractImports(content);
        const complexity = calculateComplexity(content);
        
        if (imports.size > 0) {
          importCounts.set(file, imports);
        }
        complexityScores.set(file, complexity);
      } catch (error) {
        console.error(`Failed to analyze ${file}:`, error);
      }
    }
    
    // Build dependency map with counts
    for (const file of javaFiles) {
      const fileCounts = importCounts.get(file);
      if (!fileCounts || fileCounts.size === 0) continue;
      
      const depCountMap = new Map<string, number>();
      
      for (const [importPath, count] of fileCounts.entries()) {
        const resolvedFile = javaImportToFilePath(importPath, javaFiles);
        
        if (resolvedFile) {
          depCountMap.set(resolvedFile, count);
        }
      }
      
      if (depCountMap.size > 0) {
        dependencyMap.set(file, depCountMap);
      }
    }
    
    return dependencyMap;
  }
};
