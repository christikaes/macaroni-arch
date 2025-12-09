// Type definitions for escomplex
declare module 'escomplex' {
  export interface ComplexityReport {
    aggregate: {
      cyclomatic: number;
      cyclomaticDensity: number;
      sloc: {
        physical: number;
        logical: number;
      };
      halstead: {
        bugs: number;
        difficulty: number;
        effort: number;
        length: number;
        time: number;
        vocabulary: number;
        volume: number;
      };
      params: number;
    };
    functions: Array<{
      name: string;
      line: number;
      cyclomatic: number;
      cyclomaticDensity: number;
      sloc: {
        physical: number;
        logical: number;
      };
      halstead: {
        bugs: number;
        difficulty: number;
        effort: number;
        length: number;
        time: number;
        vocabulary: number;
        volume: number;
      };
      params: number;
    }>;
  }

  export interface AnalyseOptions {
    sourceType?: 'module' | 'script';
    jsx?: boolean;
  }

  export function analyse(source: string, options?: AnalyseOptions): ComplexityReport;
}
