import { FileData, FileDependency } from "~/types/dsm";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { getAnalyzer } from "./analyzers";
import { calculateComplexity } from "./analyzers/javascript";
import { calculatePythonComplexity } from "./analyzers/python";
import { calculateJavaComplexity } from "./analyzers/java";
import { calculateCSharpComplexity } from "./analyzers/csharp";
import { CODE_EXTENSIONS, EXCLUDED_DIRS } from "./analyzers/constants";

const execAsync = promisify(exec);

export type ProgressCallback = (message: string) => void;

// Performance configuration
const MAX_FILES_FOR_DETAILED_ANALYSIS = 100; // Skip individual file analysis if repo is too large
const CLONE_DEPTH = 1; // Shallow clone depth

/**
 * Clone repository and analyze files
 */
async function cloneAndAnalyze(
  repoUrl: string,
  onProgress?: ProgressCallback
): Promise<{ files: string[]; tmpDir: string; branch: string }> {
  // Create temporary directory
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'macaroni-'));
  
  try {
    // Clone repository (shallow clone for speed, single branch, no tags)
    onProgress?.("Cloning repository... 0%");
    
    // Use spawn to capture progress from git clone
    const { spawn } = await import('child_process');
    await new Promise<void>((resolve, reject) => {
      const gitProcess = spawn('git', [
        'clone',
        '--depth', String(CLONE_DEPTH),
        '--single-branch',
        '--no-tags',
        '--progress',
        repoUrl,
        tmpDir
      ]);

      let lastProgress = 0;
      let lastPhase = '';
      
      // Git outputs progress to stderr
      gitProcess.stderr.on('data', (data: Buffer) => {
        const output = data.toString();
        // Look for progress patterns like "Receiving objects: 45% (123/456)" or "Resolving deltas: 93% (456/789)"
        const progressMatch = output.match(/(\w+\s+\w+):\s+(\d+)%/);
        if (progressMatch && onProgress) {
          const phase = progressMatch[1]; // e.g., "Receiving objects" or "Resolving deltas"
          const percent = parseInt(progressMatch[2]);
          // Only send updates for significant changes (every 5%) or phase changes
          if (percent - lastProgress >= 5 || percent === 100 || phase !== lastPhase) {
            const phaseText = phase === 'Resolving deltas' ? 'Processing files' : 'Downloading';
            onProgress(`Cloning repository... ${phaseText} ${percent}%`);
            lastProgress = percent;
            lastPhase = phase;
          }
        }
      });

      gitProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Git clone failed with code ${code}`));
        }
      });

      gitProcess.on('error', (err) => {
        reject(err);
      });
    });

    // Get list of all files using git ls-files
    const { stdout } = await execAsync(`git -C "${tmpDir}" ls-files`, {
      maxBuffer: 10 * 1024 * 1024
    });

    // Get the current branch name
    const { stdout: branchOutput } = await execAsync(`git -C "${tmpDir}" rev-parse --abbrev-ref HEAD`);
    const branch = branchOutput.trim();

    // Parse file list and filter by extension
    const files = stdout
      .split('\n')
      .filter(file => file.trim() !== '')
      .filter(file => !EXCLUDED_DIRS.some(dir => file.includes(dir)))
      .filter(file => CODE_EXTENSIONS.some(ext => file.endsWith(ext)));

    onProgress?.(`Found ${files.length} files`);
    return { files, tmpDir, branch };
  } catch (error) {
    // Clean up on error
    try {
      await execAsync(`rm -rf "${tmpDir}"`);
    } catch (cleanupError) {
      console.error('Failed to clean up temp directory:', cleanupError);
    }
    throw error;
  }
}

/**
 * Analyze repository and generate DSM data
 * Works with any Git repository (GitLab, Bitbucket, self-hosted, etc.)
 */
export async function analyzeGitRepo(
  repoUrl: string,
  onProgress?: ProgressCallback
): Promise<{ files: { [fileName: string]: FileData }; branch: string }> {
  let tmpDir = '';
  
  try {
    // Clone repository and get file list
    const { files, tmpDir: clonedDir, branch } = await cloneAndAnalyze(repoUrl, onProgress);
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
        
        if (jsExtensions.includes(ext)) {
          complexity = calculateComplexity(content, file);
        } else if (pythonExtensions.includes(ext)) {
          const fullPath = path.join(tmpDir, file);
          complexity = await calculatePythonComplexity(fullPath);
        } else if (javaExtensions.includes(ext)) {
          const fullPath = path.join(tmpDir, file);
          complexity = calculateJavaComplexity(fullPath);
        } else if (csharpExtensions.includes(ext)) {
          complexity = calculateCSharpComplexity(content);
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
        await execAsync(`rm -rf "${tmpDir}"`);
      } catch (error) {
        console.error('Failed to clean up temp directory:', error);
      }
    }
  }
}
