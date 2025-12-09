import { NextRequest } from "next/server";
import { DSMData, DisplayItem } from "~/types/dsm";
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
      let isClosed = false;

      const sendProgress = (message: string) => {
        if (isClosed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "progress", message })}\n\n`)
          );
        } catch (error) {
          isClosed = true;
        }
      };

      const sendError = (error: string) => {
        if (isClosed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", error })}\n\n`)
          );
          controller.close();
          isClosed = true;
        } catch (err) {
          isClosed = true;
        }
      };

      const sendComplete = (data: DSMData) => {
        if (isClosed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "complete", data })}\n\n`)
          );
          controller.close();
          isClosed = true;
        } catch (error) {
          isClosed = true;
        }
      };

      try {
        // Analyze Git repository with progress callbacks
        const { files, branch } = await analyzeGitRepo(repoUrl, sendProgress);
        sendProgress("Building file tree...");
        
        // Build display items from file list
        const buildDisplayItems = (fileList: string[]): DisplayItem[] => {
          const items: DisplayItem[] = [];
          
          interface TreeNodeInternal {
            path: string;
            name: string;
            isFile: boolean;
            children: Map<string, TreeNodeInternal>;
            fileIndices: Set<number>;
          }
          
          const root: TreeNodeInternal = {
            path: "",
            name: "",
            isFile: false,
            children: new Map(),
            fileIndices: new Set(),
          };

          fileList.forEach((file, idx) => {
            const parts = file.split("/");
            let current = root;
            
            parts.forEach((part, i) => {
              current.fileIndices.add(idx);
              
              if (!current.children.has(part)) {
                current.children.set(part, {
                  path: parts.slice(0, i + 1).join("/"),
                  name: part,
                  isFile: i === parts.length - 1,
                  children: new Map(),
                  fileIndices: new Set(),
                });
              }
              current = current.children.get(part)!;
            });
            current.fileIndices.add(idx);
          });

          const traverse = (node: TreeNodeInternal, indent: number, parentId: string = "") => {
            const sortedChildren = Array.from(node.children.entries()).sort(
              ([nameA], [nameB]) => nameA.localeCompare(nameB)
            );

            sortedChildren.forEach(([, child], index) => {
              const id = parentId ? `${parentId}.${index + 1}` : `${index + 1}`;
              
              items.push({
                path: child.path,
                displayName: child.name,
                indent,
                isDirectory: !child.isFile,
                fileIndices: Array.from(child.fileIndices),
                id,
                showInMatrix: child.isFile, // Initially only files show in matrix
              });

              if (!child.isFile) {
                traverse(child, indent + 1, id);
              }
            });
          };

          traverse(root, 0);
          return items;
        };

        const fileList = Object.keys(files);

        const dsmData: DSMData = {
          files,
          displayItems: buildDisplayItems(fileList),
          fileList,
          branch,
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
