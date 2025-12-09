import { LanguageAnalyzer } from "./types";
import * as path from "path";
import * as fs from "fs";
import { JS_EXTENSIONS } from "./constants";
import * as babelParser from "@babel/parser";

// Type definitions for esprima (no @types package available)
interface EsprimaNode {
  type: string;
  loc?: { start?: { line: number } };
  id?: { name: string };
  operator?: string;
  test?: unknown;
  [key: string]: unknown;
}

interface EsprimaAST {
  type: string;
  body: EsprimaNode[];
}

interface EsprimaModule {
  parseModule(code: string, options?: { loc?: boolean; jsx?: boolean }): EsprimaAST;
  parseScript(code: string, options?: { loc?: boolean; jsx?: boolean }): EsprimaAST;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const esprima = require('esprima') as EsprimaModule;

/**
 * Extract import specifiers and their counts directly from source code using Babel parser
 */
function extractImportsFromSource(filePath: string): Map<string, number> {
  const importCounts = new Map<string, number>();
  
  try {
    const source = fs.readFileSync(filePath, 'utf-8');
    const ast = babelParser.parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      errorRecovery: true
    });
    
    for (const node of ast.program.body) {
      if (node.type === 'ImportDeclaration' && node.source?.value) {
        const importSpec = node.source.value;
        
        // Count the number of imported items
        let count = 0;
        for (const specifier of node.specifiers || []) {
          if (specifier.type === 'ImportSpecifier' || 
              specifier.type === 'ImportDefaultSpecifier' || 
              specifier.type === 'ImportNamespaceSpecifier') {
            count++;
          }
        }
        
        // Default to 1 if no specifiers (side-effect import)
        if (count === 0) count = 1;
        
        const existing = importCounts.get(importSpec) || 0;
        importCounts.set(importSpec, existing + count);
      }
    }
    
    return importCounts;
  } catch {
    return importCounts;
  }
}

/**
 * Load path aliases from tsconfig.json
 */
function loadPathAliases(repoPath: string): Map<string, string> {
  const aliases = new Map<string, string>();
  
  try {
    const tsconfigPath = path.join(repoPath, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
      return aliases;
    }
    
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
    const paths = tsconfig?.compilerOptions?.paths;
    
    if (!paths || typeof paths !== 'object') {
      return aliases;
    }
    
    // Convert paths like "~/*": ["./app/*"] to aliases
    for (const [alias, targets] of Object.entries(paths)) {
      if (Array.isArray(targets) && targets.length > 0) {
        // Remove the /* suffix from alias and target
        const aliasPrefix = alias.replace(/\/\*$/, '');
        const targetPath = (targets[0] as string).replace(/\/\*$/, '').replace(/^\.\//, '');
        aliases.set(aliasPrefix, targetPath);
      }
    }
    
    return aliases;
  } catch {
    return aliases;
  }
}

/**
 * Resolve an import specifier to a file path
 */
function resolveImportToFile(specifier: string, fromFile: string, repoPath: string, files: string[], pathAliases: Map<string, string>): string | null {
  // Handle relative imports
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const fromDir = path.dirname(path.join(repoPath, fromFile));
    const resolved = path.resolve(fromDir, specifier);
    const relative = path.relative(repoPath, resolved);
    
    // Try with various extensions
    for (const ext of ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']) {
      const withExt = relative + ext;
      if (files.includes(withExt)) {
        return withExt;
      }
    }
    
    // Try exact match
    if (files.includes(relative)) {
      return relative;
    }
  }
  
  // Handle path aliases from tsconfig
  for (const [aliasPrefix, targetPath] of pathAliases.entries()) {
    if (specifier.startsWith(aliasPrefix + '/')) {
      const withoutAlias = specifier.replace(aliasPrefix + '/', targetPath + '/');
      for (const ext of ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']) {
        const withExt = withoutAlias + ext;
        if (files.includes(withExt)) {
          return withExt;
        }
      }
    }
  }
  
  return null;
}

/**
 * Calculate cyclomatic complexity for JavaScript/TypeScript code.
 * Uses cyclomatic-complexity library with custom parsing to handle both
 * ES6 modules and regular scripts.
 * 
 * @param content - The source code content
 * @param filePath - Optional file path for context (used to determine if TS)
 * @returns The cyclomatic complexity score (defaults to 1 if analysis fails)
 */
export function calculateComplexity(content: string, filePath?: string): number {
  try {
    let ast;
    const isTypeScript = filePath && /\.tsx?$/.test(filePath);
    
    if (isTypeScript) {
      // Use Babel parser for TypeScript files
      try {
        const parsed = babelParser.parse(content, {
          sourceType: 'module',
          plugins: ['typescript', 'jsx']
        });
        ast = parsed.program as unknown as EsprimaAST;
      } catch (parseError) {
        console.error(`Failed to parse TypeScript ${filePath}:`, parseError);
        return 1;
      }
    } else {
      // Use esprima for JavaScript files
      try {
        // Try parsing as ES6 module first (supports import/export)
        ast = esprima.parseModule(content, { loc: true, jsx: true });
      } catch {
        try {
          // Fall back to script parsing (for non-module code)
          ast = esprima.parseScript(content, { loc: true, jsx: true });
        } catch (parseError) {
          console.error(`Failed to parse ${filePath}:`, parseError);
          return 1;
        }
      }
    }
    
    // Now manually calculate complexity by traversing the AST
    const functionComplexities: Array<{ name: string; complexity: number; line: number }> = [
      { name: "global", complexity: 0, line: 0 }
    ];
    const functionStack: Array<{ name: string; complexity: number; line: number }> = [
      { name: "global", complexity: 1, line: 0 }
    ];
    
    function traverse(node: EsprimaNode | EsprimaAST | null | undefined): void {
      if (!node || typeof node !== 'object') return;
      
      const n = node as EsprimaNode;
      
      switch (n.type) {
        case "FunctionDeclaration":
          if (n.id) {
            const newFunction = { name: n.id.name, complexity: 1, line: n.loc?.start?.line || 0 };
            functionStack.push(newFunction);
            functionComplexities.push(newFunction);
          }
          break;
        case "FunctionExpression":
        case "ArrowFunctionExpression":
          const functionName = n.id?.name || "anonymous";
          const newFunction = { name: functionName, complexity: 1, line: n.loc?.start?.line || 0 };
          functionStack.push(newFunction);
          functionComplexities.push(newFunction);
          break;
        case "IfStatement":
        case "ConditionalExpression":
        case "ForStatement":
        case "ForInStatement":
        case "ForOfStatement":
        case "WhileStatement":
        case "DoWhileStatement":
        case "CatchClause":
          if (functionStack.length > 0) {
            functionStack[functionStack.length - 1].complexity++;
          }
          break;
        case "LogicalExpression":
          if ((n.operator === "&&" || n.operator === "||") && functionStack.length > 0) {
            functionStack[functionStack.length - 1].complexity++;
          }
          break;
        case "SwitchCase":
          if (n.test && functionStack.length > 0) {
            functionStack[functionStack.length - 1].complexity++;
          }
          break;
      }
      
      // Traverse child nodes
      for (const key in n) {
        if (key === 'loc' || key === 'range' || key === 'comments') continue;
        const child = n[key];
        if (Array.isArray(child)) {
          child.forEach(c => traverse(c as EsprimaNode));
        } else if (child && typeof child === 'object') {
          traverse(child as EsprimaNode);
        }
      }
      
      // Pop function from stack when done
      if (n.type === "FunctionDeclaration" || 
          n.type === "FunctionExpression" || 
          n.type === "ArrowFunctionExpression") {
        functionStack.pop();
      }
    }
    
    traverse(ast);
    
    // Sum up all function complexities to get total file complexity
    const totalComplexity = functionComplexities.reduce((sum, fn) => sum + fn.complexity, 0);
    
    // If no functions found or total is 0, return 1 as baseline
    return totalComplexity > 0 ? totalComplexity : 1;
  } catch (error) {
    // If analysis fails (e.g., syntax error), return 1 as baseline
    console.error(`Failed to calculate complexity for ${filePath}:`, error);
    return 1;
  }
}

// JavaScript/TypeScript analyzer using Babel parser
export const jsAnalyzer: LanguageAnalyzer = {
  extensions: JS_EXTENSIONS.map(ext => `.${ext}`),
  
  async analyze(_filePath: string, _content: string, _allFiles: string[], _repoPath?: string): Promise<string[]> {
    // This method is kept for interface compatibility but not used
    // Use analyzeAll instead for better performance
    return [];
  },
  
  async analyzeAll(files: string[], repoPath: string): Promise<Map<string, Map<string, number>>> {
    const dependencyMap = new Map<string, Map<string, number>>();
    
    try {
      console.log('[JS Analyzer] Analyzing', files.length, 'files with Babel parser');
      
      // Load path aliases from tsconfig.json
      const pathAliases = loadPathAliases(repoPath);
      console.log('[JS Analyzer] Loaded path aliases:', Array.from(pathAliases.entries()));
      
      // Analyze each file to extract dependencies
      for (const file of files) {
        const fullPath = path.join(repoPath, file);
        
        if (!fs.existsSync(fullPath)) {
          continue;
        }
        
        try {
          // Extract imports from source with counts
          const importsBySpecifier = extractImportsFromSource(fullPath);
          
          // Resolve each import to a file
          const depCountMap = new Map<string, number>();
          
          for (const [importSpec, count] of importsBySpecifier.entries()) {
            const resolvedFile = resolveImportToFile(importSpec, file, repoPath, files, pathAliases);
            
            if (resolvedFile) {
              // Add the count for this import
              const currentCount = depCountMap.get(resolvedFile) || 0;
              depCountMap.set(resolvedFile, currentCount + count);
            }
          }
          
          if (depCountMap.size > 0) {
            dependencyMap.set(file, depCountMap);
          }
        } catch (error) {
          console.error(`[JS Analyzer] Error analyzing ${file}:`, error);
        }
      }
      
      console.log('[JS Analyzer] Analysis complete:', dependencyMap.size, 'files with dependencies');
      
      return dependencyMap;
    } catch (error) {
      console.error(`[JS Analyzer] Error analyzing files:`, error);
      return dependencyMap;
    }
  }
};
