"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import HierarchicalDSM from "~/components/HierarchicalDSM";
import { DSMData } from "~/types/dsm";
import Link from "next/link";

export default function AnalyzePage() {
  const searchParams = useSearchParams();
  const repoUrl = searchParams.get("repo");
  const [dsmData, setDsmData] = useState<DSMData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string>("");

  useEffect(() => {
    if (repoUrl) {
      fetchDSMData(repoUrl);
    }
  }, [repoUrl]);

  const fetchDSMData = async (url: string) => {
    setLoading(true);
    setError(null);
    setProgressMessage("");

    const eventSource = new EventSource(`/api/analyze?repoUrl=${encodeURIComponent(url)}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "progress") {
        setProgressMessage(data.message);
      } else if (data.type === "complete") {
        setDsmData(data.data);
        setLoading(false);
        eventSource.close();
      } else if (data.type === "error") {
        setError(data.error);
        setLoading(false);
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      setError("Connection error occurred");
      setLoading(false);
      eventSource.close();
    };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-yellow-100 p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link
              href="/"
              className="mb-4 inline-flex items-center text-sm text-orange-600 hover:text-orange-700"
            >
              ← Back to Home
            </Link>
            <h1 className="text-4xl font-bold text-yellow-600">
              Design Structure Matrix
            </h1>
            {repoUrl && (
              <p className="mt-2 text-sm text-gray-600">
                Analyzing: <span className="font-medium">{repoUrl}</span>
              </p>
            )}
          </div>
          <div className="text-6xl">🍝😊</div>
        </div>

        {/* Content */}
        {!repoUrl && (
          <div className="rounded-lg bg-white p-8 text-center shadow-md">
            <p className="text-lg text-gray-600">
              No repository URL provided. Please go back to the home page and
              enter a repository URL.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-lg bg-yellow-500 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:bg-yellow-600"
            >
              Go to Home
            </Link>
          </div>
        )}

        {loading && (
          <div className="rounded-lg bg-white p-12 text-center shadow-md">
            <div className="mb-4 text-6xl">🍝</div>
            <p className="text-xl font-semibold text-gray-700">
              Analyzing repository...
            </p>
            {progressMessage && (
              <p className="mt-4 text-lg text-orange-600 font-medium animate-pulse">
                {progressMessage}
              </p>
            )}
            <p className="mt-2 text-gray-500">
              Untangling the spaghetti code!
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border-2 border-red-300 p-8 shadow-md">
            <p className="text-lg font-semibold text-red-700">Error: {error}</p>
            <button
              onClick={() => repoUrl && fetchDSMData(repoUrl)}
              className="mt-4 rounded-lg bg-red-500 px-6 py-2 font-semibold text-white transition-all hover:bg-red-600"
            >
              Retry
            </button>
          </div>
        )}

        {dsmData && !loading && !error && (
          <div className="rounded-lg bg-white p-6 shadow-lg">
            <div className="mb-4">
              <h2 className="text-2xl font-semibold text-gray-800">
                Dependency Matrix
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Rows represent files that depend on columns. Click folders to expand/collapse.
                Numbers show aggregated dependency counts.
              </p>
            </div>
            <HierarchicalDSM data={dsmData} />
          </div>
        )}
      </div>
    </div>
  );
}
