import { NextRequest } from "next/server";
import { DSMData, TreeNode } from "~/types/dsm";
import { analyzeGitRepo } from "./gitRepoAnalyzer";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const repoUrl = searchParams.get("repoUrl");

  if (!repoUrl) {
    return new Response(
      JSON.stringify({ error: "Repository URL is required" }),
      { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  // Create a streaming response using Server-Sent Events
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendProgress = (message: string) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "progress", message })}\n\n`)
        );
      };

      const sendError = (error: string) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", error })}\n\n`)
        );
        controller.close();
      };

      const sendComplete = (data: DSMData) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "complete", data })}\n\n`)
        );
        controller.close();
      };

      try {
        // Analyze Git repository with progress callbacks
        const files = await analyzeGitRepo(repoUrl, sendProgress);
        sendProgress("Building file tree...");
        
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

        const fileList = Object.keys(files);

        const dsmData: DSMData = {
          files,
          fileTree: buildFileTree(fileList),
          recommendedModuleTree: buildRecommendedModuleTree(fileList),
        };

        sendComplete(dsmData);
      } catch (error) {
        console.error("Error analyzing repository:", error);
        sendError(error instanceof Error ? error.message : "Failed to analyze repository");
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
