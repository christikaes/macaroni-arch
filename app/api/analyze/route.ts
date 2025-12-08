import { NextRequest, NextResponse } from "next/server";

export interface DSMCell {
  dependencies: number;
}

export interface FileNode {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  children?: FileNode[];
}

export interface DSMData {
  files: string[];
  matrix: { [fromFile: string]: { [toFile: string]: DSMCell } };
  fileTree: FileNode[];
}

export async function POST(request: NextRequest) {
  try {
    const { repoUrl } = await request.json();

    if (!repoUrl) {
      return NextResponse.json(
        { error: "Repository URL is required" },
        { status: 400 }
      );
    }

    // TODO: Implement actual repository analysis
    // For now, return mock DSM data with hierarchical structure
    const mockFiles = [
      "src/app/page.tsx",
      "src/app/layout.tsx",
      "src/components/ui/Button.tsx",
      "src/components/ui/Input.tsx",
      "src/components/Header.tsx",
      "src/components/Footer.tsx",
      "src/utils/helpers.ts",
      "src/utils/api.ts",
      "src/services/auth.ts",
      "src/services/data.ts",
      "src/types/index.ts",
    ];

    // Build file tree from flat file list
    const buildFileTree = (files: string[]): FileNode[] => {
      const root: { [key: string]: any } = {};

      files.forEach((file) => {
        const parts = file.split("/");
        let current = root;

        parts.forEach((part, index) => {
          if (!current[part]) {
            current[part] = index === parts.length - 1 ? null : {};
          }
          if (index < parts.length - 1) {
            current = current[part];
          }
        });
      });

      const convertToTree = (obj: any, prefix: string = ""): FileNode[] => {
        return Object.keys(obj).map((key) => {
          const fullPath = prefix ? `${prefix}/${key}` : key;
          const isDirectory = obj[key] !== null;

          return {
            name: key,
            fullPath,
            isDirectory,
            children: isDirectory ? convertToTree(obj[key], fullPath) : undefined,
          };
        });
      };

      return convertToTree(root);
    };

    const mockDSMData: DSMData = {
      files: mockFiles,
      fileTree: buildFileTree(mockFiles),
      matrix: {
        "src/app/page.tsx": {
          "src/components/ui/Button.tsx": { dependencies: 2 },
          "src/components/ui/Input.tsx": { dependencies: 1 },
          "src/components/Header.tsx": { dependencies: 1 },
          "src/utils/helpers.ts": { dependencies: 3 },
          "src/utils/api.ts": { dependencies: 2 },
          "src/services/auth.ts": { dependencies: 1 },
          "src/types/index.ts": { dependencies: 2 },
        },
        "src/app/layout.tsx": {
          "src/components/ui/Button.tsx": { dependencies: 1 },
          "src/components/Footer.tsx": { dependencies: 1 },
          "src/types/index.ts": { dependencies: 1 },
        },
        "src/components/ui/Button.tsx": {
          "src/components/ui/Input.tsx": { dependencies: 2 },
          "src/utils/helpers.ts": { dependencies: 1 },
          "src/types/index.ts": { dependencies: 1 },
        },
        "src/components/ui/Input.tsx": {
          "src/types/index.ts": { dependencies: 1 },
        },
        "src/components/Header.tsx": {
          "src/components/ui/Input.tsx": { dependencies: 1 },
        },
        "src/utils/helpers.ts": {
          "src/types/index.ts": { dependencies: 1 },
        },
        "src/utils/api.ts": {
          "src/utils/helpers.ts": { dependencies: 1 },
          "src/services/data.ts": { dependencies: 1 },
          "src/types/index.ts": { dependencies: 1 },
        },
        "src/services/auth.ts": {
          "src/utils/api.ts": { dependencies: 1 },
          "src/services/data.ts": { dependencies: 1 },
          "src/types/index.ts": { dependencies: 1 },
        },
        "src/services/data.ts": {
          "src/utils/api.ts": { dependencies: 1 },
          "src/types/index.ts": { dependencies: 1 },
        },
      },
    };

    return NextResponse.json(mockDSMData);
  } catch (error) {
    console.error("Error analyzing repository:", error);
    return NextResponse.json(
      { error: "Failed to analyze repository" },
      { status: 500 }
    );
  }
}
