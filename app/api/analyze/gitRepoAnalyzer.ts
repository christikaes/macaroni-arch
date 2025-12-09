import { FileData, FileDependency } from "~/types/dsm";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { getAnalyzer } from "./analyzers";
import { calculateComplexity } from "./analyzers/javascript";
import { calculatePythonComplexity } from "./analyzers/python";
import { calculateJavaComplexity } from "./analyzers/java";
import { calculateCSharpComplexity } from "./analyzers/csharp";
import { calculateGoComplexity } from "./analyzers/go";
import { CODE_EXTENSIONS, EXCLUDED_DIRS } from "./analyzers/constants";

export type ProgressCallback = (message: string) => void;

// Performance configuration
const MAX_FILES_FOR_DETAILED_ANALYSIS = 300; // Skip individual file analysis if repo is too large

/**
 * Parse GitHub URL to extract owner and repo
 */
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const patterns = [
    /github\.com[\/:]([^\/]+)\/([^\/\.]+)/,
    /^([^\/]+)\/([^\/]+)$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
    }
  }
  
  return null;
}

/**
 * Fetch repository contents using GitHub API
 */
async function fetchGitHubRepo(
  repoUrl: string,
  onProgress?: ProgressCallback
): Promise<{ files: string[]; tmpDir: string; branch: string; fileContents: Map<string, string> }> {
  const parsed = parseGitHubUrl(repoUrl);
  
  if (!parsed) {
    throw new Error('Invalid GitHub URL. Please provide a valid GitHub repository URL.');
  }
  
  const { owner, repo } = parsed;
  
  // Create temporary directory
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'macaroni-'));
  
  try {
    onProgress?.("Fetching repository info...");
    
    // Get default branch
    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
    if (!repoResponse.ok) {
      throw new Error(`Failed to fetch repository: ${repoResponse.statusText}`);
    }
    const repoData = await repoResponse.json();
    const branch = repoData.default_branch || 'main';
    
    onProgress?.("Fetching file tree...");
    
    // Get tree recursively
    const treeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
    );
    
    if (!treeResponse.ok) {
      throw new Error(`Failed to fetch file tree: ${treeResponse.statusText}`);
    }
    
    const treeData = await treeResponse.json();
    
    // Filter code files and config files
    const codeFiles = treeData.tree
      .filter((item: any) => item.type === 'blob')
      .map((item: any) => item.path)
      .filter((file: string) => !EXCLUDED_DIRS.some(dir => file.includes(dir)))
      .filter((file: string) => CODE_EXTENSIONS.some(ext => file.endsWith(ext)));
    
    // Also include tsconfig.json for path resolution
    const configFiles = treeData.tree
      .filter((item: any) => item.type === 'blob')
      .map((item: any) => item.path)
      .filter((file: string) => file === 'tsconfig.json' || file.endsWith('/tsconfig.json'));
    
    const files = [...codeFiles, ...configFiles]
      .sort((a: string, b: string) => {
        // Custom sort to put index files first in each directory
        const aDir = path.dirname(a);
        const bDir = path.dirname(b);
        
        // If in same directory
        if (aDir === bDir) {
          const aBase = path.basename(a, path.extname(a));
          const bBase = path.basename(b, path.extname(b));
          
          // Check if either is an index file
          const aIsIndex = aBase === 'index';
          const bIsIndex = bBase === 'index';
          
          if (aIsIndex && !bIsIndex) return -1;
          if (!aIsIndex && bIsIndex) return 1;
          
          // Otherwise sort alphabetically
          return a.localeCompare(b);
        }
        
        // Different directories, sort by full path
        return a.localeCompare(b);
      });
    
    onProgress?.(`Found ${files.length} files`);
    
    // Fetch file contents
    const fileContents = new Map<string, string>();
    const totalFiles = files.length;
    
    onProgress?.(`Downloading files... 0/${totalFiles}`);
    
    // Fetch in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (file) => {
          try {
            const contentResponse = await fetch(
              `https://api.github.com/repos/${owner}/${repo}/contents/${file}?ref=${branch}`
            );
            
            if (contentResponse.ok) {
              const contentData = await contentResponse.json();
              
              // GitHub API returns base64 encoded content
              if (contentData.content) {
                const content = Buffer.from(contentData.content, 'base64').toString('utf-8');
                fileContents.set(file, content);
                
                // Write to temp directory for analyzers that need file paths
                const filePath = path.join(tmpDir, file);
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(filePath, content);
              }
            }
          } catch (error) {
            console.error(`Failed to fetch ${file}:`, error);
          }
        })
      );
      
      onProgress?.(`Downloading files... ${Math.min(i + batchSize, totalFiles)}/${totalFiles}`);
    }
    
    return { files, tmpDir, branch, fileContents };
  } catch (error) {
    // Clean up on error
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('Failed to clean up temp directory:', cleanupError);
    }
    throw error;
  }
}

/**
 * Analyze repository and generate DSM data
 * Works with GitHub repositories
 */
export async function analyzeGitRepo(
  repoUrl: string,
  onProgress?: ProgressCallback
): Promise<{ files: { [fileName: string]: FileData }; branch: string }> {
  let tmpDir = '';
  
  try {
    // Fetch repository using GitHub API
    const { files, tmpDir: clonedDir, branch } = await fetchGitHubRepo(repoUrl, onProgress);
    tmpDir = clonedDir;

    // Group files by language/analyzer
    const filesByAnalyzer = new Map<string, string[]>();
    const fileAnalyzerMap = new Map<string, ReturnType<typeof getAnalyzer>>();
    
    for (const file of files) {
      const analyzer = getAnalyzer(file);
      fileAnalyzerMap.set(file, analyzer);
      
      if (analyzer) {
        const analyzerKey = analyzer.extensions.join(',');
        if (!filesByAnalyzer.has(analyzerKey)) {
          filesByAnalyzer.set(analyzerKey, []);
        }
        filesByAnalyzer.get(analyzerKey)!.push(file);
      }
    }

    // Analyze dependencies by language group
    const allDependencies = new Map<string, Map<string, number>>();
    
    // Performance optimization: skip detailed individual file analysis for very large repos
    const totalFiles = Array.from(filesByAnalyzer.values()).reduce((sum, arr) => sum + arr.length, 0);
    const skipDetailedAnalysis = totalFiles > MAX_FILES_FOR_DETAILED_ANALYSIS;
    
    for (const [_analyzerKey, groupFiles] of filesByAnalyzer.entries()) {
      const analyzer = fileAnalyzerMap.get(groupFiles[0]);
      if (!analyzer) continue;
      
      const languageName = analyzer.extensions[0].toUpperCase();
      onProgress?.(`Analyzing ${groupFiles.length} ${languageName} files...`);
      
      // For large repos, only do basic dependency analysis (skip import counting)
      if (skipDetailedAnalysis && analyzer.analyzeAll) {
        try {
          // analyzeAll will skip individual file analysis internally for performance
          const deps = await analyzer.analyzeAll(groupFiles, tmpDir);
          for (const [file, fileDeps] of deps.entries()) {
            allDependencies.set(file, fileDeps);
          }
        } catch (error) {
          console.error(`Error in fast analysis mode:`, error);
        }
      } else {
        // Normal detailed analysis for smaller repos
        const deps = await analyzer.analyzeAll?.(groupFiles, tmpDir) ?? new Map<string, Map<string, number>>();
        for (const [file, fileDeps] of deps.entries()) {
          allDependencies.set(file, fileDeps);
        }
      }
    }

    // Generate FileData with actual dependency analysis
    onProgress?.("Compiling analysis...");
    const fileData: { [fileName: string]: FileData } = {};
    
    for (const file of files) {
      try {
        // Read file content for complexity calculation
        const filePath = path.join(tmpDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        
        // Get dependencies from analysis (Map<dependency, count>)
        const dependencyMap = allDependencies.get(file) ?? new Map<string, number>();
        
        // Convert to FileDependency format with actual import counts
        const dependencies: FileDependency[] = Array.from(dependencyMap.entries()).map(([depPath, count]) => ({
          fileName: depPath,
          dependencies: count // Use actual import count
        }));
        
        // Calculate line count (non-empty lines)
        const lineCount = content.split('\n').filter(line => line.trim().length > 0).length;
        
        // Calculate cyclomatic complexity
        let complexity = 0;
        const ext = path.extname(file).toLowerCase();
        const jsExtensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
        const pythonExtensions = ['.py'];
        const javaExtensions = ['.java'];
        const csharpExtensions = ['.cs'];
        const goExtensions = ['.go'];
        
        if (jsExtensions.includes(ext)) {
          complexity = calculateComplexity(content, file);
        } else if (pythonExtensions.includes(ext)) {
          complexity = calculatePythonComplexity(content);
        } else if (javaExtensions.includes(ext)) {
          const fullPath = path.join(tmpDir, file);
          complexity = calculateJavaComplexity(fullPath);
        } else if (csharpExtensions.includes(ext)) {
          complexity = calculateCSharpComplexity(content);
        } else if (goExtensions.includes(ext)) {
          complexity = calculateGoComplexity(content);
        }
        
        fileData[file] = {
          complexity,
          lineCount,
          dependencies,
        };
      } catch (error) {
        console.error(`Error analyzing file ${file}:`, error);
        fileData[file] = {
          complexity: 0,
          lineCount: 0,
          dependencies: [],
        };
      }
    }

    return { files: fileData, branch };
  } finally {
    // Clean up temporary directory
    if (tmpDir) {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch (error) {
        console.error('Failed to clean up temp directory:', error);
      }
    }
  }
}
