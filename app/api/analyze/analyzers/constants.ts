/**
 * Shared constants for code analyzers
 */

// JavaScript/TypeScript file extensions
export const JS_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'vue'] as const;

// Python file extensions
export const PYTHON_EXTENSIONS = ['py'] as const;

// C++ file extensions
export const CPP_EXTENSIONS = ['cpp', 'c', 'h', 'hpp', 'cc', 'cxx', 'hxx', 'hh'] as const;

// Java file extensions
export const JAVA_EXTENSIONS = ['java'] as const;

// C# file extensions
export const CSHARP_EXTENSIONS = ['cs'] as const;

// Go file extensions
export const GO_EXTENSIONS = ['go'] as const;

// Other supported extensions (placeholder analyzers)
export const OTHER_EXTENSIONS = ['rs', 'rb', 'php', 'swift', 'kt', 'scala'] as const;

// All supported code file extensions (derived from language-specific extensions)
export const CODE_EXTENSIONS = [
  ...JS_EXTENSIONS.map(ext => `.${ext}`),
  ...PYTHON_EXTENSIONS.map(ext => `.${ext}`),
  ...CPP_EXTENSIONS.map(ext => `.${ext}`),
  ...JAVA_EXTENSIONS.map(ext => `.${ext}`),
  ...CSHARP_EXTENSIONS.map(ext => `.${ext}`),
  ...GO_EXTENSIONS.map(ext => `.${ext}`),
  ...OTHER_EXTENSIONS.map(ext => `.${ext}`),
] as const;

// File extension pattern for JS/TS files
export const JS_FILE_EXTENSION_PATTERN = /\.(ts|tsx|js|jsx)$/;

// Repository analysis configuration
export const MAX_REPO_SIZE_MB = 200; // Maximum repository size in MB
export const CLONE_DEPTH = 1; // Git clone depth (1 = shallow clone, latest commit only)

// Directories to exclude from analysis
export const EXCLUDED_DIRS = [
  'node_modules/',
  'bower_components/',
  'vendor/',
  'dist/',
  'build/',
  '.git/',
  'coverage/',
  '__pycache__/',
  '.venv/',
  'venv/',
] as const;

// Madge-specific exclude patterns (file-level patterns not covered by EXCLUDED_DIRS)
export const MADGE_EXCLUDE_PATTERNS = [
  /\.min\.js$/,      // Minified files
  /\.bundle\.js$/,   // Bundled files
] as const;
