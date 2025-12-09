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
        initialScale={0.5}
        minScale={0.1}
        maxScale={5}
        wheel={{ 
          step: 0.1,
          disabled: true
        }}
        panning={{ 
          velocityDisabled: true,
          wheelPanning: true
        }}
        pinch={{ 
          disabled: false,
          step: 5
        }}
        doubleClick={{ 
          disabled: false,
          step: 0.7
        }}
        alignmentAnimation={{ disabled: true }}
        centerZoomedOut={false}
        limitToBounds={true}
        disablePadding={true}
      >
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
              wrapperClass="flex-1 overflow-hidden"
              contentClass="flex items-start justify-center"
              wrapperStyle={{ 
                opacity: isPending ? 0.6 : 1, 
                transition: "opacity 0.2s",
                border: "3px solid red",
                outline: "3px dashed blue",
                outlineOffset: "-6px",
                touchAction: "none"
              }}
            >
              <div
                style={{
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none',
                  border: "3px solid green",
                  touchAction: "none"
                }}
              >
                {children}
              </div>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
