"use client";

import { ReactNode } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface ViewportProps {
  children: ReactNode;
  isPending?: boolean;
}

export default function Viewport({ children, isPending = false }: ViewportProps) {
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 200px)" }}>
      <TransformWrapper>
        {({ zoomIn, zoomOut, resetTransform, instance }) => (
          <>
            {/* Zoom controls */}
            <div className="flex gap-2 mb-2 p-2 bg-gray-100 rounded">
              <button onClick={() => zoomOut()} className="px-3 py-1 bg-white border rounded hover:bg-gray-50">-</button>
              <button onClick={() => resetTransform()} className="px-3 py-1 bg-white border rounded hover:bg-gray-50">Fit</button>
              <button onClick={() => zoomIn()} className="px-3 py-1 bg-white border rounded hover:bg-gray-50">+</button>
              <span className="px-3 py-1 text-sm text-gray-600">{Math.round((instance?.transformState?.scale ?? 1) * 100)}%</span>
            </div>
            <TransformComponent
              wrapperStyle={{ 
                opacity: isPending ? 0.6 : 1, 
                transition: "opacity 0.2s",
                width: "100%",
                height: "100%"
              }}
            >
              {children}
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
