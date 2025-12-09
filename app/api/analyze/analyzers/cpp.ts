import * as path from "path";
import * as fs from "fs";
import { LanguageAnalyzer } from "./types";

// Configuration toggles
const INCLUDE_TESTS = true;

// Store for counting includes per file
const includeCounts = new Map<string, Map<string, number>>();

// Store for complexity scores per file
const complexityScores = new Map<string, number>();

/**
 * Calculate cyclomatic complexity for C/C++ code using regex
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
 * Extract includes from C/C++ code using regex
 */
function extractIncludes(content: string): Map<string, number> {
  const includes = new Map<string, number>();
  
  // Match both #include "local.h" and #include <project/header.h>
  // We'll filter out system headers during resolution
  const quotePattern = /#include\s+"([^"]+)"/g;
  const anglePattern = /#include\s+<([^>]+)>/g;
  
  // Extract quoted includes
  let match;
  while ((match = quotePattern.exec(content)) !== null) {
    const includePath = match[1];
    includes.set(includePath, (includes.get(includePath) || 0) + 1);
  }
  
  // Extract angle bracket includes (these might be project headers)
  while ((match = anglePattern.exec(content)) !== null) {
    const includePath = match[1];
    // Skip obvious system headers
    if (!isSystemHeader(includePath)) {
      includes.set(includePath, (includes.get(includePath) || 0) + 1);
    }
  }
  
  return includes;
}

/**
 * Check if an include path looks like a system header
 */
function isSystemHeader(includePath: string): boolean {
  // Common system/standard library patterns
  const systemPatterns = [
    /^std/, // C++ standard library
    /^c[a-z]+$/, // C standard library (cstdio, cmath, etc.)
    /^[a-z_]+\.h$/, // C standard library (stdio.h, math.h, etc.)
    /^(algorithm|array|atomic|bitset|chrono|complex|condition_variable|deque|exception|forward_list|fstream|functional|future|initializer_list|iomanip|ios|iosfwd|iostream|istream|iterator|limits|list|locale|map|memory|mutex|new|numeric|optional|ostream|queue|random|ratio|regex|set|shared_mutex|sstream|stack|stdexcept|streambuf|string|string_view|system_error|thread|tuple|type_traits|typeindex|typeinfo|unordered_map|unordered_set|utility|valarray|variant|vector)$/,
    /^(assert|ctype|errno|float|inttypes|iso646|limits|locale|math|setjmp|signal|stdalign|stdarg|stdatomic|stdbool|stddef|stdint|stdio|stdlib|stdnoreturn|string|tgmath|threads|time|uchar|wchar|wctype)\.h$/,
    /^(windows|winapi|win32|posix|pthread|sys\/|linux\/|darwin\/)/, // Platform-specific
  ];
  
  return systemPatterns.some(pattern => pattern.test(includePath.toLowerCase()));
}

/**
 * Resolve include path relative to the including file
 */
function resolveIncludePath(
  fromFile: string,
  includePath: string,
  allFiles: string[]
): string | null {
  const dir = path.dirname(fromFile);
  
  // Strategy 1: Try relative to current file
  let resolved = path.join(dir, includePath);
  let normalized = path.normalize(resolved).replace(/^\/+/, '');
  
  if (allFiles.includes(normalized)) {
    return normalized;
  }
  
  // Strategy 2: Try from project root (many C++ projects use root-relative includes)
  if (allFiles.includes(includePath)) {
    return includePath;
  }
  
  // Strategy 3: Try with common header directories
  const commonDirs = ['include', 'src', 'lib', 'common', 'inc', 'headers'];
  for (const baseDir of commonDirs) {
    resolved = path.join(baseDir, includePath);
    normalized = path.normalize(resolved).replace(/^\/+/, '');
    if (allFiles.includes(normalized)) {
      return normalized;
    }
  }
  
  // Strategy 4: Try looking in subdirectories of common locations
  // Example: #include "SFML/Window.hpp" might be at include/SFML/Window.hpp
  for (const baseDir of commonDirs) {
    const pattern = new RegExp(`${baseDir}/.*${includePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    const match = allFiles.find(f => pattern.test(f));
    if (match) {
      return match;
    }
  }
  
  // Strategy 5: Try exact path match anywhere in the tree
  const exactMatches = allFiles.filter(f => f.endsWith('/' + includePath) || f === includePath);
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }
  
  // Strategy 6: Try filename-only match (last resort, may be ambiguous)
  const fileName = path.basename(includePath);
  const filenameMatches = allFiles.filter(f => path.basename(f) === fileName);
  
  // If there's only one match, use it
  if (filenameMatches.length === 1) {
    return filenameMatches[0];
  }
  
  // If multiple matches, prefer one in a similar directory structure
  if (filenameMatches.length > 1) {
    // Prefer matches that share path components with the include path
    const includeDir = path.dirname(includePath);
    if (includeDir && includeDir !== '.') {
      const bestMatch = filenameMatches.find(f => f.includes(includeDir));
      if (bestMatch) {
        return bestMatch;
      }
    }
    
    // Otherwise return the first match (better than nothing)
    return filenameMatches[0];
  }
  
  return null;
}

/**
 * Check if file is a test file
 */
function isTestFile(filePath: string): boolean {
  const lowerPath = filePath.toLowerCase();
  return (
    lowerPath.includes('test') ||
    lowerPath.includes('spec') ||
    lowerPath.includes('mock') ||
    lowerPath.includes('stub')
  );
}

// C/C++ analyzer
export const cppAnalyzer: LanguageAnalyzer = {
  extensions: ['.cpp', '.c', '.h', '.hpp', '.cc', '.cxx', '.hxx', '.hh'],
  analyze(filePath: string, content: string, allFiles: string[]): string[] {
    // Skip test files if configured
    if (!INCLUDE_TESTS && isTestFile(filePath)) {
      return [];
    }

    const dependencies: string[] = [];
    
    // Calculate and store complexity
    const complexity = calculateComplexity(content);
    complexityScores.set(filePath, complexity);
    
    // Extract includes
    const includes = extractIncludes(content);
    includeCounts.set(filePath, includes);
    
    // Resolve each include to actual files
    for (const [includePath, count] of includes.entries()) {
      const resolved = resolveIncludePath(filePath, includePath, allFiles);
      if (resolved && resolved !== filePath) {
        // Add the dependency multiple times if included multiple times
        for (let i = 0; i < count; i++) {
          dependencies.push(resolved);
        }
      }
    }
    
    return dependencies;
  },

  async analyzeAll(files: string[], repoPath: string): Promise<Map<string, Map<string, number>>> {
    const dependencyMap = new Map<string, Map<string, number>>();
    
    // Clear previous counts
    includeCounts.clear();
    complexityScores.clear();
    
    // Filter C++ files based on INCLUDE_TESTS configuration
    const cppFiles = INCLUDE_TESTS 
      ? files 
      : files.filter(f => !isTestFile(f));
    
    // Read all file contents
    const fileContents = new Map<string, string>();
    for (const file of cppFiles) {
      const fullPath = path.join(repoPath, file);
      
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        fileContents.set(file, content);
        
        // Extract includes and complexity
        const includes = extractIncludes(content);
        const complexity = calculateComplexity(content);
        
        if (includes.size > 0) {
          includeCounts.set(file, includes);
        }
        complexityScores.set(file, complexity);
      } catch (error) {
        console.error(`Failed to analyze ${file}:`, error);
      }
    }
    
    // Build dependency map with counts
    for (const file of cppFiles) {
      const fileCounts = includeCounts.get(file);
      if (!fileCounts || fileCounts.size === 0) continue;
      
      const depCountMap = new Map<string, number>();
      
      for (const [includePath, count] of fileCounts.entries()) {
        const resolvedFile = resolveIncludePath(file, includePath, cppFiles);
        
        if (resolvedFile && resolvedFile !== file) {
          depCountMap.set(resolvedFile, count);
        }
      }
      
      if (depCountMap.size > 0) {
        dependencyMap.set(file, depCountMap);
      }
    }
    
    console.log(`[CPP] Analyzed ${cppFiles.length} files, found ${dependencyMap.size} files with dependencies`);
    
    return dependencyMap;
  }
};
