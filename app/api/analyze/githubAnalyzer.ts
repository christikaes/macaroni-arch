import { FileData, FileDependency } from "~/types/dsm";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { getAnalyzer } from "./analyzers";

const execAsync = promisify(exec);

/**
 * Clone repository and analyze files
 */
async function cloneAndAnalyze(repoUrl: string): Promise<{ files: string[]; tmpDir: string }> {
  // Create temporary directory
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'macaroni-'));
  
  try {
    // Clone repository (shallow clone for speed)
    console.log(`Cloning repository: ${repoUrl}`);
    await execAsync(`git clone --depth 1 "${repoUrl}" "${tmpDir}"`, {
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    // Get list of all files using git ls-files
    const { stdout } = await execAsync(`git -C "${tmpDir}" ls-files`, {
      maxBuffer: 10 * 1024 * 1024
    });

    // Parse file list and filter by extension
    const codeExtensions = [
      '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.h', 
      '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.vue'
    ];

    const files = stdout
      .split('\n')
      .filter(file => file.trim() !== '')
      .filter(file => codeExtensions.some(ext => file.endsWith(ext)));

    return { files, tmpDir };
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
 * Works with any Git repository (GitHub, GitLab, Bitbucket, self-hosted)
 */
export async function analyzeGitRepo(repoUrl: string): Promise<{ [fileName: string]: FileData }> {
  let tmpDir = '';
  
  try {
    // Clone repository and get file list
    const { files, tmpDir: clonedDir } = await cloneAndAnalyze(repoUrl);
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

    // Analyze dependencies by language group (more efficient for dependency-cruiser)
    const allDependencies = new Map<string, string[]>();
    
    for (const [_analyzerKey, groupFiles] of filesByAnalyzer.entries()) {
      const analyzer = fileAnalyzerMap.get(groupFiles[0]);
      if (!analyzer) continue;
      
      console.log(`\nAnalyzing group with ${groupFiles.length} files`);
      console.log(`tmpDir: ${tmpDir}`);
      console.log(`Sample files in group:`, groupFiles.slice(0, 3));
      
      // Analyze all files of this type together
      const deps = await analyzer.analyzeAll?.(groupFiles, tmpDir) ?? new Map<string, string[]>();
      
      // Merge results
      for (const [file, fileDeps] of deps.entries()) {
        allDependencies.set(file, fileDeps);
      }
    }

    // Generate FileData with actual dependency analysis
    const fileData: { [fileName: string]: FileData } = {};
    
    for (const file of files) {
      try {
        // Read file content for complexity calculation
        const filePath = path.join(tmpDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        
        // Get dependencies from analysis
        const dependencyPaths = allDependencies.get(file) ?? [];
        
        // Convert to FileDependency format
        const dependencies: FileDependency[] = dependencyPaths.map(depPath => ({
          fileName: depPath,
          dependencies: 1 // Weight of dependency (can be enhanced later)
        }));
        
        // Calculate complexity (simple heuristic: lines of code / 10)
        const lines = content.split('\n').length;
        const complexity = Math.max(1, Math.min(15, Math.floor(lines / 10)));
        
        fileData[file] = {
          complexity,
          dependencies,
        };
      } catch (error) {
        console.error(`Error analyzing file ${file}:`, error);
        fileData[file] = {
          complexity: 1,
          dependencies: [],
        };
      }
    }

    return fileData;
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
