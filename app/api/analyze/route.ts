import { NextRequest, NextResponse } from "next/server";
import { mockFiles } from "./mockData";
import { DSMData, TreeNode } from "~/types/dsm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const repoUrl = searchParams.get("repoUrl");

    if (!repoUrl) {
      return NextResponse.json(
        { error: "Repository URL is required" },
        { status: 400 }
      );
    }

    // TODO: Implement actual repository analysis
    // For now, return mock DSM data with hierarchical structure
    
    // Build file tree from flat file list
    const buildFileTree = (fileList: string[]): TreeNode[] => {
      const root: { [key: string]: any } = {};

      fileList.forEach((file) => {
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

      const convertToTree = (obj: any, prefix: string = ""): TreeNode[] => {
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

    // Build recommended module tree (for now, same as file tree)
    const buildRecommendedModuleTree = (fileList: string[]): TreeNode[] => {
      // TODO: Implement logic to group files into recommended modules
      // For now, pass through to buildFileTree
      return buildFileTree(fileList);
    };

    const mockDSMData: DSMData = {
      files: mockFiles,
      fileTree: buildFileTree(Object.keys(mockFiles)),
      recommendedModuleTree: buildRecommendedModuleTree(Object.keys(mockFiles)),
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
