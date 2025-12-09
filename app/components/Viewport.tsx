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
      <TransformWrapper
        initialScale={0.1}
        minScale={0.1}
        maxScale={3}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <div className="flex flex-col h-full">
            {/* Zoom controls */}
            <div className="flex gap-2 mb-2 p-2 bg-gray-100 rounded">
              <button onClick={() => zoomOut()} className="px-3 py-1 bg-white border rounded hover:bg-gray-50">-</button>
              <button onClick={() => resetTransform()} className="px-3 py-1 bg-white border rounded hover:bg-gray-50">Fit</button>
              <button onClick={() => zoomIn()} className="px-3 py-1 bg-white border rounded hover:bg-gray-50">+</button>
            </div>
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
          </div>
        )}
      </TransformWrapper>
    </div>
  );
}
