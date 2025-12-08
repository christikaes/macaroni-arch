import { FileData } from "~/types/dsm";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

/**
 * Clone repository and get file list using git
 */
async function cloneAndListFiles(repoUrl: string): Promise<string[]> {
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

    return files;
  } finally {
    // Clean up temporary directory
    try {
      await execAsync(`rm -rf "${tmpDir}"`);
    } catch (error) {
      console.error('Failed to clean up temp directory:', error);
    }
  }
}

/**
 * Analyze repository and generate DSM data
 * Works with any Git repository (GitHub, GitLab, Bitbucket, self-hosted)
 */
export async function analyzeGitRepo(repoUrl: string): Promise<{ [fileName: string]: FileData }> {
  // Clone and get file list
  const files = await cloneAndListFiles(repoUrl);

  // Generate placeholder FileData for each file
  const fileData: { [fileName: string]: FileData } = {};
  
  files.forEach(file => {
    fileData[file] = {
      complexity: Math.floor(Math.random() * 15) + 1, // Random 1-15 for now
      dependencies: [], // TODO: Implement actual dependency analysis
    };
  });

  return fileData;
}
