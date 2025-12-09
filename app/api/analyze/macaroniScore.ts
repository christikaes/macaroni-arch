import { DSMData } from "~/types/dsm";

export type MacaroniScoreLevel = 
  | "Spaghetti" 
  | "Fettuccine" 
  | "Penne" 
  | "Rigatoni" 
  | "Ziti" 
  | "Macaroni";

export interface MacaroniScore {
  level: MacaroniScoreLevel;
  score: number; // 0-100
  metrics: {
    avgDependenciesPerFile: number;
    maxDependenciesPerFile: number;
    avgComplexity: number;
    circularDependencyRatio: number;
  };
}

export const MACARONI_LEVELS = [
  {
    level: "Spaghetti" as MacaroniScoreLevel,
    emoji: "🍝",
    description: "Highly tangled, numerous cross-dependencies",
    minScore: 0,
    maxScore: 16,
  },
  {
    level: "Fettuccine" as MacaroniScoreLevel,
    emoji: "🍜",
    description: "Many entangled dependencies, needs refactoring",
    minScore: 17,
    maxScore: 33,
  },
  {
    level: "Penne" as MacaroniScoreLevel,
    emoji: "🥘",
    description: "Some structure emerging, room for improvement",
    minScore: 34,
    maxScore: 50,
  },
  {
    level: "Rigatoni" as MacaroniScoreLevel,
    emoji: "🍲",
    description: "Decent modularity, moderate coupling",
    minScore: 51,
    maxScore: 66,
  },
  {
    level: "Ziti" as MacaroniScoreLevel,
    emoji: "🥗",
    description: "Well-structured, minimal coupling",
    minScore: 67,
    maxScore: 83,
  },
  {
    level: "Macaroni" as MacaroniScoreLevel,
    emoji: "🧀",
    description: "Excellent modularity, clean architecture",
    minScore: 84,
    maxScore: 100,
  },
];

/**
 * Calculate the Macaroni Score for a codebase
 * Lower scores indicate tangled dependencies (Spaghetti)
 * Higher scores indicate good modularity (Macaroni)
 */
export function calculateMacaroniScore(data: DSMData): MacaroniScore {
  const files = Object.values(data.files);
  
  if (files.length === 0) {
    return {
      level: "Macaroni",
      score: 100,
      metrics: {
        avgDependenciesPerFile: 0,
        maxDependenciesPerFile: 0,
        avgComplexity: 0,
        circularDependencyRatio: 0,
      },
    };
  }

  // Calculate metrics
  const dependencyCounts = files.map(f => 
    f.dependencies.reduce((sum, d) => sum + d.dependencies, 0)
  );
  const avgDependencies = dependencyCounts.reduce((a, b) => a + b, 0) / files.length;
  const maxDependencies = Math.max(...dependencyCounts);
  
  const avgComplexity = files.reduce((sum, f) => sum + f.complexity, 0) / files.length;
  
  // Estimate circular dependencies (files that depend on each other)
  const circularCount = countCircularDependencies(data);
  const circularRatio = circularCount / files.length;

  // Calculate cross-module dependency ratio
  const crossModuleRatio = calculateCrossModuleDependencies(data);

  // Score calculation (0-100)
  // Lower dependencies = better score
  const dependencyScore = Math.max(0, 100 - (avgDependencies * 5));
  
  // Lower max dependencies = better score
  const maxDepScore = Math.max(0, 100 - (maxDependencies * 2));
  
  // Lower complexity = better score
  const complexityScore = Math.max(0, 100 - (avgComplexity * 3));
  
  // Lower circular dependencies = better score
  const circularScore = Math.max(0, 100 - (circularRatio * 200));

  // Heavily penalize cross-module dependencies (outside immediate folder)
  const crossModuleScore = Math.max(0, 100 - (crossModuleRatio * 150));

  // Weighted average with emphasis on cross-module dependencies
  const finalScore = Math.round(
    (dependencyScore * 0.2) +
    (maxDepScore * 0.15) +
    (complexityScore * 0.2) +
    (circularScore * 0.15) +
    (crossModuleScore * 0.3)
  );

  // Determine level
  const level = MACARONI_LEVELS.find(
    l => finalScore >= l.minScore && finalScore <= l.maxScore
  )?.level || "Spaghetti";

  return {
    level,
    score: finalScore,
    metrics: {
      avgDependenciesPerFile: Math.round(avgDependencies * 10) / 10,
      maxDependenciesPerFile: maxDependencies,
      avgComplexity: Math.round(avgComplexity * 10) / 10,
      circularDependencyRatio: Math.round(circularRatio * 100) / 100,
    },
  };
}

/**
 * Calculate the ratio of dependencies that cross module boundaries
 * A dependency crosses modules if it's not in the same immediate parent folder
 */
function calculateCrossModuleDependencies(data: DSMData): number {
  const fileNames = Object.keys(data.files);
  let totalDependencies = 0;
  let crossModuleDependencies = 0;

  for (const fileName of fileNames) {
    const fileModule = getModulePath(fileName);
    const deps = data.files[fileName].dependencies;

    for (const dep of deps) {
      if (dep.dependencies > 0) {
        totalDependencies += dep.dependencies;
        const depModule = getModulePath(dep.fileName);
        
        // If modules don't match, it's a cross-module dependency
        if (fileModule !== depModule) {
          crossModuleDependencies += dep.dependencies;
        }
      }
    }
  }

  return totalDependencies > 0 ? crossModuleDependencies / totalDependencies : 0;
}

/**
 * Get the module path (immediate parent folder) for a file
 * e.g., "src/components/Button.tsx" -> "src/components"
 */
function getModulePath(filePath: string): string {
  const parts = filePath.split('/');
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/');
}

/**
 * Count potential circular dependencies
 */
function countCircularDependencies(data: DSMData): number {
  let circularCount = 0;
  const fileNames = Object.keys(data.files);

  for (let i = 0; i < fileNames.length; i++) {
    const fileA = fileNames[i];
    const depsA = data.files[fileA].dependencies;

    for (const dep of depsA) {
      if (dep.dependencies > 0) {
        // Check if dep.fileName also depends on fileA
        const depsB = data.files[dep.fileName]?.dependencies || [];
        if (depsB.some(d => d.fileName === fileA && d.dependencies > 0)) {
          circularCount++;
        }
      }
    }
  }

  // Divide by 2 since we count each circular pair twice
  return Math.floor(circularCount / 2);
}
