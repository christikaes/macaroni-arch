"use client";

import { DSMData } from "../api/analyze/route";

interface DSMMatrixProps {
  data: DSMData;
}

export default function DSMMatrix({ data }: DSMMatrixProps) {
  const { files, matrix } = data;

  return (
    <div className="w-full overflow-auto">
      <div className="inline-block min-w-full">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-yellow-100 border border-yellow-400 p-2 text-xs font-semibold text-gray-700">
                File
              </th>
              {files.map((file, idx) => (
                <th
                  key={idx}
                  className="border border-yellow-400 bg-yellow-100 p-2 text-xs font-semibold text-gray-700"
                  style={{ minWidth: "40px" }}
                >
                  <div
                    className="transform -rotate-45 whitespace-nowrap"
                    style={{
                      transformOrigin: "left bottom",
                      marginLeft: "20px",
                      marginBottom: "20px",
                    }}
                  >
                    {file}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {files.map((fromFile, rowIdx) => (
              <tr key={rowIdx}>
                <td className="sticky left-0 z-10 bg-yellow-50 border border-yellow-400 p-2 text-xs font-medium text-gray-800 whitespace-nowrap">
                  {fromFile}
                </td>
                {files.map((toFile, colIdx) => {
                  const isMainDiagonal = rowIdx === colIdx;
                  const cell = matrix[fromFile]?.[toFile];
                  const hasDependency = cell && cell.dependencies > 0;

                  return (
                    <td
                      key={colIdx}
                      className={`border border-yellow-400 p-2 text-center text-xs ${
                        isMainDiagonal
                          ? "bg-gray-300"
                          : hasDependency
                          ? "bg-orange-400 text-white font-semibold hover:bg-orange-500 cursor-pointer"
                          : "bg-white hover:bg-yellow-50"
                      }`}
                      style={{ minWidth: "40px", height: "40px" }}
                      title={
                        isMainDiagonal
                          ? fromFile
                          : `${fromFile} → ${toFile}: ${cell?.dependencies || 0} dependencies`
                      }
                    >
                      {!isMainDiagonal && hasDependency ? cell.dependencies : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
