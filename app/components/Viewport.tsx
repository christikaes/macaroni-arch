"use client";

import { ReactNode } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface ViewportProps {
  children: ReactNode;
  isPending?: boolean;
}

export default function Viewport({ children, isPending = false }: ViewportProps) {
  return (
    <div className="flex flex-col relative" style={{ height: "calc(100vh - 200px)" }}>
      <TransformWrapper
        initialScale={0.1}
        minScale={0.1}
        maxScale={3}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <div className="flex flex-col h-full relative">
            <TransformComponent
              wrapperStyle={{ 
                opacity: isPending ? 0.6 : 1, 
                transition: "opacity 0.2s",
                width: "100%",
                flex: 1
              }}
            >
              {children}
            </TransformComponent>
            {/* Zoom controls */}
            <div className="absolute bottom-4 right-4 flex gap-1">
              <button onClick={() => zoomOut()} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50 shadow-sm">-</button>
              <button onClick={() => resetTransform()} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50 shadow-sm">Fit</button>
              <button onClick={() => zoomIn()} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50 shadow-sm">+</button>
            </div>
          </div>
        )}
      </TransformWrapper>
    </div>
  );
}
