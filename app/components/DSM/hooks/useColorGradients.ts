import { useCallback } from "react";

export function useColorGradients(
  minDeps: number,
  maxDeps: number,
  maxComplexity: number
) {
  // Get background color based on dependency count (blue -> purple gradient)
  const getDependencyColor = useCallback((count: number): string => {
    if (count === 0) return 'rgb(255, 255, 255)';
    
    const normalized = (count - minDeps) / (maxDeps - minDeps);
    
    // Blue (59, 130, 246) -> Purple (147, 51, 234)
    const red = Math.round(59 + (147 - 59) * normalized);
    const green = Math.round(130 - (130 - 51) * normalized);
    const blue = Math.round(246 - (246 - 234) * normalized);
    
    return `rgb(${red}, ${green}, ${blue})`;
  }, [minDeps, maxDeps]);

  // Get background color for complexity scores (light grey -> dark grey gradient)
  const getComplexityColor = useCallback((complexity: number): string => {
    if (complexity === 0) return 'rgb(243, 244, 246)';
    
    const normalized = complexity / maxComplexity;
    
    // Light grey (243, 244, 246) -> Dark grey (55, 65, 81)
    const value = Math.round(243 - (243 - 55) * normalized);
    
    return `rgb(${value}, ${value + 10}, ${value + 35})`;
  }, [maxComplexity]);

  return {
    getDependencyColor,
    getComplexityColor,
  };
}
