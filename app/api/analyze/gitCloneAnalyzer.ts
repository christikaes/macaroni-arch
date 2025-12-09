import { FileData } from "~/types/dsm";
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
import { calculateGoComplexity } from "./analyzers/go";
import { CODE_EXTENSIONS, EXCLUDED_DIRS } from "./analyzers/constants";

const execAsync = promisify(exec);

export type ProgressCallback = (message: string) => void;

// Performance configuration
const MAX_FILES_FOR_DETAILED_ANALYSIS = 300;
const CLONE_DEPTH = 1;

/**
 * Clone repository and analyze files using git
 * This approach requires git to be installed on the system.
 * Use this for non-GitHub repos or when you need full git history.
 */
async function cloneAndAnalyze(
  repoUrl: string,
  onProgress?: ProgressCallback
): Promise<{ files: string[]; tmpDir: string; branch: string }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'macaroni-'));
  
  console.log('[Git Clone] Starting clone:', { repoUrl, tmpDir });
  
  try {
    onProgress?.("Cloning repository... 0%");
    
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
      
      gitProcess.stderr.on('data', (data: Buffer) => {
        const output = data.toString();
        const progressMatch = output.match(/(\w+\s+\w+):\s+(\d+)%/);
        if (progressMatch && onProgress) {
          const phase = progressMatch[1];
          const percent = parseInt(progressMatch[2]);
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

    const { stdout } = await execAsync(`git -C "${tmpDir}" ls-files`, {
      maxBuffer: 10 * 1024 * 1024
    });

    const { stdout: branchOutput } = await execAsync(`git -C "${tmpDir}" rev-parse --abbrev-ref HEAD`);
    const branch = branchOutput.trim();

    const allFiles = stdout.split('\n').filter(file => file.trim() !== '');
    console.log('[Git Clone] Total files in repo:', allFiles.length);
    
    const files = allFiles
      .filter(file => !EXCLUDED_DIRS.some(dir => file.includes(dir)))
      .filter(file => CODE_EXTENSIONS.some(ext => file.endsWith(ext)))
      .sort((a, b) => {
        const aDir = path.dirname(a);
        const bDir = path.dirname(b);
        
        if (aDir === bDir) {
          const aBase = path.basename(a, path.extname(a));
          const bBase = path.basename(b, path.extname(b));
          
          const aIsIndex = aBase === 'index';
          const bIsIndex = bBase === 'index';
          
          if (aIsIndex && !bIsIndex) return -1;
          if (!aIsIndex && bIsIndex) return 1;
          
          return a.localeCompare(b);
        }
        
        return a.localeCompare(b);
      });

    console.log('[Git Clone] Files after filtering:', {
      total: files.length,
      branch,
      sampleFiles: files.slice(0, 5)
    });
    
    onProgress?.(`Found ${files.length} files`);
    return { files, tmpDir, branch };
  } catch (error) {
    try {
      await execAsync(`rm -rf "${tmpDir}"`);
    } catch (cleanupError) {
      console.error('Failed to clean up temp directory:', cleanupError);
    }
    throw error;
  }
}

/**
 * Analyze repository using git clone
 * Works with any Git repository (GitHub, GitLab, Bitbucket, self-hosted, etc.)
 * Requires git to be installed on the system.
 */
export async function analyzeGitRepoWithClone(
  repoUrl: string,
  onProgress?: ProgressCallback
): Promise<{ files: { [fileName: string]: FileData }; branch: string }> {
  let tmpDir = '';
  
  console.log('[Git Clone Analyzer] Starting analysis for:', repoUrl);
  
  try {
    const { files, tmpDir: clonedDir, branch } = await cloneAndAnalyze(repoUrl, onProgress);
    console.log('[Git Clone Analyzer] Clone complete, analyzing', files.length, 'files');
    console.log('[Git Clone Analyzer] Files in api/analyze (non-analyzers):', files.filter(f => f.includes('api/analyze') && !f.includes('analyzers')));
    tmpDir = clonedDir;

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

    console.log('[Git Clone Analyzer] Files grouped by language:', 
      Array.from(filesByAnalyzer.entries()).map(([key, fileList]) => ({ 
        analyzer: key, 
        count: fileList.length 
      }))
    );

    const allDependencies = new Map<string, Map<string, number>>();
    
    const totalFiles = Array.from(filesByAnalyzer.values()).reduce((sum, arr) => sum + arr.length, 0);
    const skipDetailedAnalysis = totalFiles > MAX_FILES_FOR_DETAILED_ANALYSIS;
    
    for (const [_analyzerKey, groupFiles] of filesByAnalyzer.entries()) {
      const analyzer = fileAnalyzerMap.get(groupFiles[0]);
      if (!analyzer) continue;
      
      const languageName = analyzer.extensions[0].toUpperCase();
      onProgress?.(`Analyzing ${groupFiles.length} ${languageName} files...`);
      
      if (skipDetailedAnalysis && analyzer.analyzeAll) {
        try {
          const deps = await analyzer.analyzeAll(groupFiles, tmpDir);
          for (const [file, fileDeps] of deps.entries()) {
            allDependencies.set(file, fileDeps);
          }
        } catch (error) {
          console.error(`Error in fast analysis mode:`, error);
        }
      } else {
        const deps = await analyzer.analyzeAll?.(groupFiles, tmpDir) ?? new Map<string, Map<string, number>>();
        for (const [file, fileDeps] of deps.entries()) {
          allDependencies.set(file, fileDeps);
        }
      }
    }

    onProgress?.("Compiling analysis...");

    const fileData: { [fileName: string]: FileData } = {};

    for (const file of files) {
      const fullPath = path.join(tmpDir, file);
      let content = '';
      let complexity = 1;
      
      try {
        content = await fs.readFile(fullPath, 'utf-8');
      } catch (error) {
        console.error(`Failed to read file ${file}:`, error);
      }

      const _analyzer = fileAnalyzerMap.get(file);
      
      if (content) {
        if (file.match(/\.(ts|tsx|js|jsx|vue)$/)) {
          complexity = calculateComplexity(content, file);
        } else if (file.endsWith('.py')) {
          complexity = calculatePythonComplexity(content);
        } else if (file.endsWith('.java')) {
          complexity = calculateJavaComplexity(content);
        } else if (file.endsWith('.cs')) {
          complexity = calculateCSharpComplexity(content);
        } else if (file.endsWith('.go')) {
          complexity = calculateGoComplexity(content);
        }
      }

      const depMap = allDependencies.get(file) || new Map<string, number>();
      const dependencies = Array.from(depMap.entries()).map(([fileName, count]) => ({
        fileName,
        dependencies: count,
      }));

      fileData[file] = {
        complexity,
        lineCount: content.split('\n').length,
        dependencies,
      };
    }

    console.log('[Git Clone Analyzer] Analysis complete:', {
      totalFilesAnalyzed: Object.keys(fileData).length,
      filesWithDependencies: Object.values(fileData).filter(f => f.dependencies.length > 0).length,
      sampleFile: Object.keys(fileData)[0]
    });

    return { files: fileData, branch };
  } finally {
    if (tmpDir) {
      try {
        await execAsync(`rm -rf "${tmpDir}"`);
      } catch (error) {
        console.error('Failed to clean up temp directory:', error);
      }
    }
  }
}
