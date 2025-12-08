import { LanguageAnalyzer } from "./types";
import * as path from "path";

// JavaScript/TypeScript analyzer using madge
export const jsAnalyzer: LanguageAnalyzer = {
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.vue'],
  
  async analyze(_filePath: string, _content: string, _allFiles: string[], _repoPath?: string): Promise<string[]> {
    // This method is kept for interface compatibility but not used
    // Use analyzeAll instead for better performance
    return [];
  },
  
  async analyzeAll(files: string[], repoPath: string): Promise<Map<string, string[]>> {
    const dependencyMap = new Map<string, string[]>();
    
    try {
      console.log(`Analyzing ${files.length} JS/TS files in ${repoPath}`);
      console.log(`Sample files:`, files.slice(0, 3));
      
      // Dynamically import madge only when needed (server-side only)
      const madge = (await import('madge')).default;
      
      // Analyze the entire directory
      const result = await madge(repoPath, {
        fileExtensions: ['ts', 'tsx', 'js', 'jsx', 'vue'],
        excludeRegExp: [/node_modules/, /\.test\.(ts|js)$/, /\.spec\.(ts|js)$/],
        tsConfig: path.join(repoPath, 'tsconfig.json'),
        webpackConfig: undefined,
      });

      const dependencies = result.obj();
      console.log(`Found ${Object.keys(dependencies).length} modules with dependencies`);
      console.log('Sample dependency keys:', Object.keys(dependencies).slice(0, 3));
      console.log('Sample entry structure:', JSON.stringify(Object.entries(dependencies)[0], null, 2));
      
      // Build a map using just the file basenames or paths from repoPath
      for (const file of files) {
        // Find the matching module in madge results
        // Madge keys might be relative to repoPath or absolute
        const possibleKeys = [
          file, // exact match
          path.join(repoPath, file), // absolute path
          `./${file}`, // relative with ./
          file.replace(/\.(ts|tsx|js|jsx)$/, ''), // without extension
        ];
        
        let found = false;
        for (const [modulePath, deps] of Object.entries(dependencies)) {
          // Try to match the module path
          if (possibleKeys.includes(modulePath) || 
              modulePath === file ||
              modulePath.endsWith(`/${file}`) ||
              modulePath.endsWith(`/${file.replace(/\.(ts|tsx|js|jsx)$/, '')}`)) {
            
            found = true;
            console.log(`\n✓ Module FOUND: ${file} (key: ${modulePath})`);
            console.log(`  Raw deps array:`, deps);
            console.log(`  Has ${(deps as string[]).length} dependencies`);
            
            if ((deps as string[]).length > 0) {
              // Convert dependency paths to relative paths matching our files list
              const relativeDeps = (deps as string[])
                .map((dep: string) => {
                  console.log(`  Processing dep: ${dep}`);
                  // Try to find this dependency in our files list
                  for (const f of files) {
                    if (dep === f || 
                        dep.endsWith(`/${f}`) || 
                        dep === path.join(repoPath, f) ||
                        dep.endsWith(`/${f.replace(/\.(ts|tsx|js|jsx)$/, '')}`)) {
                      console.log(`    -> Matched to: ${f} ✓`);
                      return f;
                    }
                  }
                  console.log(`    -> Not in files list`);
                  return null;
                })
                .filter((dep): dep is string => dep !== null);
              
              console.log(`  Filtered deps (${relativeDeps.length}):`, relativeDeps);
              
              if (relativeDeps.length > 0) {
                dependencyMap.set(file, [...new Set(relativeDeps)]);
                console.log(`  ✓ Final dependencies: [${relativeDeps.join(', ')}]`);
              } else {
                console.log(`  ✗ No dependencies matched file list`);
              }
            }
            break;
          }
        }
        
        if (!found) {
          console.log(`  ✗ Module NOT FOUND: ${file}`);
        }
      }
      
      return dependencyMap;
    } catch (error) {
      console.error(`Error analyzing files with madge:`, error);
      return dependencyMap;
    }
  }
};
