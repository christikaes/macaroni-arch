import * as path from "path";
import * as fs from "fs";
import { LanguageAnalyzer } from "./types";

/**
 * Calculate cyclomatic complexity for C# code
 */
export function calculateCSharpComplexity(content: string): number {
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
  complexity += (cleaned.match(/\bforeach\s*\(/g) || []).length;
  complexity += (cleaned.match(/\bwhile\s*\(/g) || []).length;
  complexity += (cleaned.match(/\bdo\s*\{/g) || []).length;
  complexity += (cleaned.match(/\bcase\s+/g) || []).length;
  complexity += (cleaned.match(/\bcatch\s*\(/g) || []).length;
  complexity += (cleaned.match(/\?[^:]*:/g) || []).length; // Ternary operators
  complexity += (cleaned.match(/&&/g) || []).length;
  complexity += (cleaned.match(/\|\|/g) || []).length;

  return complexity;
}

/**
 * Cache for file namespace+class mappings
 */
const namespaceCache = new Map<string, { namespace: string; className: string }>();

/**
 * Extract namespace and class name from C# file content
 */
function extractNamespaceAndClass(content: string, filePath: string): { namespace: string; className: string } {
  const namespaceMatch = content.match(/namespace\s+([\w.]+)/);
  const namespace = namespaceMatch ? namespaceMatch[1] : '';
  const className = path.basename(filePath, '.cs');
  return { namespace, className };
}

/**
 * Build a cache of all C# files with their namespaces
 */
function buildCSharpNamespaceCache(allFiles: string[], baseDir: string): void {
  namespaceCache.clear(); // Clear existing cache
  
  console.log(`[C# Analyzer] Building namespace cache for ${allFiles.length} C# files...`);
  
  for (const file of allFiles) {
    try {
      const fullPath = path.join(baseDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const { namespace, className } = extractNamespaceAndClass(content, file);
      namespaceCache.set(file, { namespace, className });
      
      // Log first 5 files for debugging
      if (namespaceCache.size <= 5) {
        console.log(`[C# Analyzer] Cached: ${file} -> namespace: "${namespace}", class: "${className}"`);
      }
    } catch {
      // Skip files we can't read
      continue;
    }
  }
  
  console.log(`[C# Analyzer] Built cache with ${namespaceCache.size} files`);
}

/**
 * Extract using statements and aliases from C# content
 */
function extractUsings(content: string): { 
  usings: Set<string>; 
  aliases: Map<string, string>;
  staticUsings: Set<string>;
} {
  const usings = new Set<string>();
  const aliases = new Map<string, string>();
  const staticUsings = new Set<string>();
  
  // Regular using: using Microsoft.eShopWeb;
  const usingRegex = /^\s*(?:global\s+)?using\s+(?!static\s)(?![\w]+\s*=\s*)([\w.]+)\s*;/gm;
  
  // Using alias: using ProjectAlias = Microsoft.eShopWeb.ApplicationCore;
  const aliasRegex = /^\s*(?:global\s+)?using\s+([\w]+)\s*=\s*([\w.]+)\s*;/gm;
  
  // Static using: using static Microsoft.eShopWeb.Constants;
  const staticUsingRegex = /^\s*(?:global\s+)?using\s+static\s+([\w.]+)\s*;/gm;
  
  let match;
  
  // Extract regular usings
  while ((match = usingRegex.exec(content)) !== null) {
    const usingStatement = match[1];
    
    // Skip framework namespaces
    if (usingStatement.startsWith('System') || 
        (usingStatement.startsWith('Microsoft') && !usingStatement.includes('eShopWeb')) ||
        usingStatement.startsWith('Xunit') ||
        usingStatement.startsWith('Moq')) {
      continue;
    }
    
    usings.add(usingStatement);
  }
  
  // Extract aliases
  while ((match = aliasRegex.exec(content)) !== null) {
    const alias = match[1];
    const fullNamespace = match[2];
    
    // Skip framework namespaces
    if (fullNamespace.startsWith('System') || 
        (fullNamespace.startsWith('Microsoft') && !fullNamespace.includes('eShopWeb')) ||
        fullNamespace.startsWith('Xunit') ||
        fullNamespace.startsWith('Moq')) {
      continue;
    }
    
    aliases.set(alias, fullNamespace);
    usings.add(fullNamespace); // Also add to usings for resolution
  }
  
  // Extract static usings
  while ((match = staticUsingRegex.exec(content)) !== null) {
    const staticUsing = match[1];
    
    // Skip framework namespaces
    if (staticUsing.startsWith('System') || 
        (staticUsing.startsWith('Microsoft') && !staticUsing.includes('eShopWeb')) ||
        staticUsing.startsWith('Xunit') ||
        staticUsing.startsWith('Moq')) {
      continue;
    }
    
    staticUsings.add(staticUsing);
    usings.add(staticUsing);
  }
  
  return { usings, aliases, staticUsings };
}

/**
 * Convert C# using statement to file paths by matching namespace+class
 * Returns array because a namespace using can reference multiple files
 */
function csharpUsingToFilePaths(usingStatement: string): string[] {
  // Look through all cached files to find ones whose namespace.className matches
  const matches: string[] = [];
  
  for (const [filePath, { namespace, className }] of namespaceCache.entries()) {
    const fullName = namespace ? `${namespace}.${className}` : className;
    
    // Check if the using statement matches:
    // 1. Exact match for a specific class: using Microsoft.eShopWeb.ApplicationCore.Entities.BasketAggregate.Basket;
    if (fullName === usingStatement) {
      console.log(`[C# Analyzer]     Exact class match: "${usingStatement}" -> "${filePath}"`);
      return [filePath];
    }
    
    // 2. Namespace match: using Microsoft.eShopWeb.ApplicationCore.Entities.BasketAggregate;
    //    This imports all classes from that namespace
    if (namespace === usingStatement) {
      matches.push(filePath);
    }
  }
  
  // If we found files in the namespace, return all of them
  if (matches.length > 0) {
    console.log(`[C# Analyzer]     Namespace match: "${usingStatement}" -> ${matches.length} files`);
    return matches;
  }
  
  // If no match found, log some potential near-matches for debugging
  const potentialMatches: string[] = [];
  for (const [filePath, { namespace, className }] of namespaceCache.entries()) {
    const fullName = namespace ? `${namespace}.${className}` : className;
    if (fullName.includes(usingStatement) || usingStatement.includes(fullName)) {
      potentialMatches.push(`${filePath} (${fullName})`);
    }
  }
  
  if (potentialMatches.length > 0 && potentialMatches.length <= 3) {
    console.log(`[C# Analyzer]     Near matches for "${usingStatement}": ${potentialMatches.join(', ')}`);
  }
  
  return [];
}

// C# analyzer
export const csharpAnalyzer: LanguageAnalyzer = {
  extensions: ['.cs'],
  analyze(filePath: string, content: string, _allFiles: string[]): string[] {
    const dependencies: string[] = [];
    
    console.log(`[C# Analyzer] Analyzing file: ${filePath}`);
    
    const { usings, aliases, staticUsings } = extractUsings(content);
    
    console.log(`[C# Analyzer]   Project usings: ${Array.from(usings).join(', ')}`);
    if (aliases.size > 0) {
      console.log(`[C# Analyzer]   Aliases: ${Array.from(aliases.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    }
    if (staticUsings.size > 0) {
      console.log(`[C# Analyzer]   Static usings: ${Array.from(staticUsings).join(', ')}`);
    }
    
    // Resolve each using to file(s)
    for (const usingStatement of usings) {
      const resolvedFiles = csharpUsingToFilePaths(usingStatement);
      for (const resolvedFile of resolvedFiles) {
        if (resolvedFile !== filePath) {
          console.log(`[C# Analyzer]   Added dependency: ${resolvedFile}`);
          dependencies.push(resolvedFile);
        }
      }
      
      if (resolvedFiles.length === 0) {
        console.log(`[C# Analyzer]   Could not resolve: ${usingStatement}`);
      }
    }
    
    console.log(`[C# Analyzer]   Total dependencies: ${dependencies.length}`);
    
    return [...new Set(dependencies)];
  },
  
  async analyzeAll(files: string[], repoPath: string): Promise<Map<string, Map<string, number>>> {
    const dependencyMap = new Map<string, Map<string, number>>();
    
    console.log(`[C# Analyzer] analyzeAll called with ${files.length} files`);
    
    // Build namespace cache first
    buildCSharpNamespaceCache(files, repoPath);
    
    // Analyze each file
    for (const file of files) {
      const fullPath = path.join(repoPath, file);
      
      try {
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        const { usings, aliases } = extractUsings(content);
        
        const fileDeps = new Map<string, number>();
        
        for (const usingStatement of usings) {
          const filesInNamespace = csharpUsingToFilePaths(usingStatement);
          
          for (const potentialDep of filesInNamespace) {
            if (potentialDep === file) continue;
            
            const depInfo = namespaceCache.get(potentialDep);
            if (!depInfo) continue;
            
            const { className } = depInfo;
            
            // Look for references to this class in the code
            const classRefPattern = new RegExp(`\\b${className}\\b(?![\\w])`, 'g');
            const matches = content.match(classRefPattern);
            
            if (matches && matches.length > 0) {
              fileDeps.set(potentialDep, matches.length);
            }
          }
        }
        
        // Also check for alias usage
        for (const [alias, fullNamespace] of aliases.entries()) {
          // If code uses the alias, resolve it to the full namespace
          const aliasPattern = new RegExp(`\\b${alias}\\.\\w+`, 'g');
          if (aliasPattern.test(content)) {
            const filesInNamespace = csharpUsingToFilePaths(fullNamespace);
            
            for (const potentialDep of filesInNamespace) {
              if (potentialDep === file) continue;
              
              const depInfo = namespaceCache.get(potentialDep);
              if (!depInfo) continue;
              
              const { className } = depInfo;
              
              // Check if the class is used with the alias
              const aliasClassPattern = new RegExp(`\\b${alias}\\.${className}\\b`, 'g');
              const matches = content.match(aliasClassPattern);
              
              if (matches && matches.length > 0) {
                fileDeps.set(potentialDep, (fileDeps.get(potentialDep) || 0) + matches.length);
              }
            }
          }
        }
        
        if (fileDeps.size > 0) {
          dependencyMap.set(file, fileDeps);
          console.log(`[C# Analyzer] ${file} has ${fileDeps.size} dependencies`);
        }
      } catch (error) {
        console.error(`[C# Analyzer] Error analyzing ${file}:`, error);
      }
    }
    
    console.log(`[C# Analyzer] analyzeAll completed: ${dependencyMap.size} files with dependencies`);
    return dependencyMap;
  }
};
