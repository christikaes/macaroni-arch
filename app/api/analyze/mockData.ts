import { FileData } from "~/types/dsm";

export const mockFiles: { [fileName: string]: FileData } = {
  "src/app/page.tsx": {
    complexity: 8,
    lineCount: 120,
    dependencies: [
      { fileName: "src/components/ui/Button.tsx", dependencies: 2 },
      { fileName: "src/components/ui/Input.tsx", dependencies: 1 },
      { fileName: "src/components/Header.tsx", dependencies: 1 },
      { fileName: "src/utils/helpers.ts", dependencies: 3 },
      { fileName: "src/utils/api.ts", dependencies: 2 },
      { fileName: "src/services/auth.ts", dependencies: 1 },
      { fileName: "src/types/index.ts", dependencies: 2 },
    ],
  },
  "src/app/layout.tsx": {
    complexity: 3,
    lineCount: 45,
    dependencies: [
      { fileName: "src/components/ui/Button.tsx", dependencies: 1 },
      { fileName: "src/components/Footer.tsx", dependencies: 1 },
      { fileName: "src/types/index.ts", dependencies: 1 },
    ],
  },
  "src/components/ui/Button.tsx": {
    complexity: 5,
    lineCount: 68,
    dependencies: [
      { fileName: "src/components/ui/Input.tsx", dependencies: 2 },
      { fileName: "src/utils/helpers.ts", dependencies: 1 },
      { fileName: "src/types/index.ts", dependencies: 1 },
    ],
  },
  "src/components/ui/Input.tsx": {
    complexity: 2,
    lineCount: 32,
    dependencies: [
      { fileName: "src/types/index.ts", dependencies: 1 },
    ],
  },
  "src/components/Header.tsx": {
    complexity: 4,
    lineCount: 54,
    dependencies: [
      { fileName: "src/components/ui/Input.tsx", dependencies: 1 },
    ],
  },
  "src/components/Footer.tsx": {
    complexity: 2,
    lineCount: 28,
    dependencies: [],
  },
  "src/utils/helpers.ts": {
    complexity: 12,
    lineCount: 156,
    dependencies: [
      { fileName: "src/types/index.ts", dependencies: 1 },
    ],
  },
  "src/utils/api.ts": {
    complexity: 6,
    lineCount: 89,
    dependencies: [
      { fileName: "src/utils/helpers.ts", dependencies: 1 },
      { fileName: "src/services/data.ts", dependencies: 1 },
      { fileName: "src/types/index.ts", dependencies: 1 },
    ],
  },
  "src/services/auth.ts": {
    complexity: 15,
    lineCount: 203,
    dependencies: [
      { fileName: "src/utils/api.ts", dependencies: 1 },
      { fileName: "src/services/data.ts", dependencies: 1 },
      { fileName: "src/types/index.ts", dependencies: 1 },
    ],
  },
  "src/services/data.ts": {
    complexity: 7,
    lineCount: 98,
    dependencies: [
      { fileName: "src/utils/api.ts", dependencies: 1 },
      { fileName: "src/services/auth.ts", dependencies: 2 }, // Cyclical with auth.ts
      { fileName: "src/types/index.ts", dependencies: 1 },
    ],
  },
  "src/types/index.ts": {
    complexity: 1,
    lineCount: 15,
    dependencies: [],
  },
};
