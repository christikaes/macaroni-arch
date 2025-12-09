import { LanguageAnalyzer } from "./types";
import * as path from "path";
import madge from "madge";
import * as escomplex from "escomplex";
import { JS_EXTENSIONS, JS_FILE_EXTENSION_PATTERN, MADGE_EXCLUDE_PATTERNS, EXCLUDED_DIRS } from "./constants";

// Configuration toggles
const INCLUDE_TYPES = true;
const INCLUDE_TESTS = true;

// Store for counting imports per file
// Map<fileName, Map<specifier, count>>
const importCounts = new Map<string, Map<string, number>>();

// Track which files have been processed to avoid duplicate counts
const processedFiles = new Set<string>();

function ensureFileEntry(fileId: string): Map<string, number> {
  if (!importCounts.has(fileId)) {
    importCounts.set(fileId, new Map<string, number>());
  }
  return importCounts.get(fileId)!;
}

// Type definitions
type ASTNode = {
  type: string;
  body?: Array<{
    type: string;
    source?: { value?: string };
    specifiers?: Array<{ type: string }>;
  }>;
};

type ImportSpecifier = { type: string };

type DetectiveParams = {
  ast: unknown;
  walker: { walk: (ast: unknown, handlers: Record<string, (node: unknown) => void>) => void };
};

/**
 * Count the number of imported names in an import declaration.
 * Examples:
 * - import { a, b, c } from './foo' => 3
 * - import a from './foo' => 1
 * - import * as ns from './foo' => 1
 * - import './foo' => 0 (side-effect only)
 */
function countImportsInDeclaration(node: unknown): number {
  const n = node as { specifiers?: Array<ImportSpecifier> };
  if (!n.specifiers?.length) {
    return 0; // Side-effect only import
  }

  return n.specifiers.filter(spec => 
    spec.type === "ImportSpecifier" ||
    spec.type === "ImportDefaultSpecifier" ||
    spec.type === "ImportNamespaceSpecifier"
  ).length;
}

/**
 * Create a callback handler for madge's detective that processes AST and counts imports.
 * This handler is called after parsing each file.
 */
function makeOnAfterFile(fileName: string) {
  return (params: unknown) => {
    // Skip if we've already processed this file to avoid duplicate counts
    if (processedFiles.has(fileName)) {
      return;
    }
    processedFiles.add(fileName);

    const { ast } = params as DetectiveParams;
    const fileCounts = ensureFileEntry(fileName);
    const astNode = ast as ASTNode;
    
    if (astNode.type !== 'Program' || !astNode.body) {
      return;
    }

    // Process each import declaration in the file
    for (const node of astNode.body) {
      if (node.type !== 'ImportDeclaration' || !node.source?.value) {
        continue;
      }
      
      const specifier = node.source.value;
      const count = countImportsInDeclaration(node);
      fileCounts.set(specifier, count || 1);
    }
  };
}

/**
 * Create madge configuration with conditional exclude patterns and detective options.
 */
function createMadgeConfig(repoPath: string, onAfterFileHandler?: (params: unknown) => void) {
  // Combine directory exclusions (converted to regex) with file-level patterns
  const excludePatterns = [
    ...EXCLUDED_DIRS.map(dir => new RegExp(dir.replace('/', ''))),
    ...MADGE_EXCLUDE_PATTERNS,
  ];
  
  if (!INCLUDE_TESTS) {
    excludePatterns.push(/\.test\.(ts|js)$/, /\.spec\.(ts|js)$/);
  }

  const baseConfig = {
    fileExtensions: [...JS_EXTENSIONS],
    excludeRegExp: excludePatterns,
    tsConfig: undefined, // Don't require tsconfig.json
    webpackConfig: undefined,
    requireConfig: undefined,
  };

  if (!onAfterFileHandler) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    detectiveOptions: {
      ts: {
        skipTypeImports: !INCLUDE_TYPES,
        onAfterFile: onAfterFileHandler
      },
      tsx: {
        skipTypeImports: !INCLUDE_TYPES,
        jsx: true,
        onAfterFile: onAfterFileHandler
      },
      es6: {
        skipTypeImports: !INCLUDE_TYPES,
        onAfterFile: onAfterFileHandler
      }
    }
  };
}

/**
 * Normalize a file path by removing file extensions.
 */
function normalizeFilePath(filePath: string): string {
  return filePath.replace(JS_FILE_EXTENSION_PATTERN, '');
}

/**
 * Check if a module path matches a given file.
 */
function isModulePathMatch(modulePath: string, file: string, repoPath: string): boolean {
  const normalizedFile = normalizeFilePath(file);
  const normalizedModulePath = normalizeFilePath(modulePath);
  
  return modulePath === file ||
         modulePath === path.join(repoPath, file) ||
         modulePath === `./${file}` ||
         normalizedModulePath === normalizedFile ||
         modulePath.endsWith(`/${file}`) ||
         normalizedModulePath.endsWith(`/${normalizedFile}`);
}

/**
 * Find the madge module path key that corresponds to a file.
 */
function findModulePathKey(file: string, dependencies: { [key: string]: string[] }, repoPath: string): string | null {
  for (const modulePath of Object.keys(dependencies)) {
    if (isModulePathMatch(modulePath, file, repoPath)) {
      return modulePath;
    }
  }
  return null;
}

/**
 * Match a dependency path to a file in the project.
 */
function matchDependencyToFile(dep: string, files: string[], repoPath: string): string | null {
  return files.find(f => isModulePathMatch(dep, f, repoPath)) || null;
}

/**
 * Normalize an import specifier by removing path prefixes.
 */
function normalizeImportSpecifier(specifier: string): string {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return specifier.replace(/^\.\/?/, '').replace(/^\.\.\//, '');
  }
  if (specifier.startsWith('~/')) {
    return specifier.replace(/^~\//, 'src/app/');
  }
  return specifier;
}

/**
 * Find the import count for a dependency by matching its specifier to resolved paths.
 */
function findImportCount(dep: string, fileCounts: Map<string, number>): number {
  for (const [specifier, count] of fileCounts.entries()) {
    const normalized = normalizeImportSpecifier(specifier);
    const normalizedDep = normalizeFilePath(dep);
    
    if (normalizedDep.includes(normalized.replace(JS_FILE_EXTENSION_PATTERN, ''))) {
      return count;
    }
  }
  return 1; // Default count if no match found
}

/**
 * Build a map of file dependencies with their import counts.
 */
function buildDependencyCountMap(
  deps: string[],
  files: string[],
  repoPath: string,
  fileCounts: Map<string, number>
): Map<string, number> {
  const depCountMap = new Map<string, number>();
  
  for (const dep of deps) {
    const matchedFile = matchDependencyToFile(dep, files, repoPath);
    
    if (matchedFile) {
      const count = findImportCount(dep, fileCounts);
      depCountMap.set(matchedFile, count);
    }
  }
  
  return depCountMap;
}

/**
 * Calculate cyclomatic complexity for JavaScript/TypeScript code.
 * Uses escomplex library to analyze the code and return the aggregate complexity.
 * 
 * @param content - The source code content
 * @param filePath - Optional file path for context (used to determine if TS)
 * @returns The cyclomatic complexity score (defaults to 1 if analysis fails)
 */
export function calculateComplexity(content: string, filePath?: string): number {
  try {
    // Determine if this is TypeScript based on file extension
    const isTypeScript = filePath && /\.(ts|tsx)$/.test(filePath);
    
    // Determine if JSX is enabled
    const hasJsx = filePath ? /\.(tsx|jsx)$/.test(filePath) : false;
    
    // escomplex options
    const options = {
      // Parse as module (not script)
      sourceType: 'module' as const,
      // Enable JSX for .tsx and .jsx files
      jsx: hasJsx,
    };
    
    // Analyze the code
    const result = escomplex.analyse(content, options);
    
    // Return the aggregate cyclomatic complexity
    // This represents the sum of all function complexities in the file
    return Math.max(1, Math.round(result.aggregate.cyclomatic));
  } catch (error) {
    // If analysis fails (e.g., syntax error), return 0 to indicate no complexity data
    return 0;
  }
}

// JavaScript/TypeScript analyzer using madge
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
      // Clear previous import counts
      importCounts.clear();
      processedFiles.clear();
      
      const allDeps: { [key: string]: string[] } = {};
      
      // Analyze all files to get basic dependencies
      try {
        const result = await madge(repoPath, createMadgeConfig(repoPath));
        const obj = result.obj();
        
        if (obj && typeof obj === 'object') {
          Object.assign(allDeps, obj);
        } else {
          console.warn('Madge returned invalid dependency object');
        }
      } catch (madgeError) {
        console.error('Madge analysis failed on repository:', madgeError);
        // Continue with empty dependencies - will try individual file analysis
      }
      
      // Analyze each file individually with import counting
      for (const file of files) {
        const fullPath = path.join(repoPath, file);
        
        try {
          const onAfterFileHandler = makeOnAfterFile(file);
          
          await madge(fullPath, createMadgeConfig(repoPath, onAfterFileHandler));
        } catch {
          // Silently continue if individual file analysis fails
        }
      }

      const dependencies = allDeps;
      
      // Build a map with dependency counts
      for (const file of files) {
        const modulePathKey = findModulePathKey(file, dependencies, repoPath);
        if (!modulePathKey) continue;
        
        const deps = dependencies[modulePathKey];
        if (!deps?.length) continue;
        
        const fileCounts = importCounts.get(file) || new Map<string, number>();
        const depCountMap = buildDependencyCountMap(deps, files, repoPath, fileCounts);
        
        if (depCountMap.size > 0) {
          dependencyMap.set(file, depCountMap);
        }
      }
      
      return dependencyMap;
    } catch (error) {
      console.error(`Error analyzing files with madge:`, error);
      return dependencyMap;
    }
  }
};
