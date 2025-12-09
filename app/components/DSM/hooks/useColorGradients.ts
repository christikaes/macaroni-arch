import { useCallback } from "react";

export function useColorGradients(
  minDeps: number,
  maxDeps: number,
  maxComplexity: number
) {
  // Get background color based on dependency count (blue -> purple gradient)
  const getDependencyColor = useCallback((count: number): string => {
    if (count === 0) return 'rgb(255, 255, 255)';
    
    // Handle case where all dependencies have the same count
    if (minDeps === maxDeps) {
      return 'rgb(59, 130, 246)'; // Return base blue color
    }
    
    const normalized = (count - minDeps) / (maxDeps - minDeps);
    
    // Blue (59, 130, 246) -> Purple (147, 51, 234)
    const red = Math.round(59 + (147 - 59) * normalized);
    const green = Math.round(130 - (130 - 51) * normalized);
    const blue = Math.round(246 - (246 - 234) * normalized);
    
    return `rgb(${red}, ${green}, ${blue})`;
  }, [minDeps, maxDeps]);

  // Get background color for complexity scores (always dark grey)
  const getComplexityColor = useCallback((_complexity: number): string => {
    // Always use dark grey for complexity scores
    return 'rgb(55, 65, 81)';
  }, []);

  return {
    getDependencyColor,
    getComplexityColor,
  };
}
