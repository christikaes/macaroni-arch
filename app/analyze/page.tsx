"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import DSM from "~/components/DSM";
import { DSMData } from "~/types/dsm";
import Link from "next/link";

export default function AnalyzePage() {
  const searchParams = useSearchParams();
  const repoUrl = searchParams.get("repo");
  const [dsmData, setDsmData] = useState<DSMData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressMessages, setProgressMessages] = useState<string[]>([]);

  useEffect(() => {
    if (repoUrl) {
      fetchDSMData(repoUrl);
    }
  }, [repoUrl]);

  const fetchDSMData = async (url: string) => {
    setLoading(true);
    setError(null);
    setProgressMessages([]);

    const eventSource = new EventSource(`/api/analyze?repoUrl=${encodeURIComponent(url)}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "progress") {
        setProgressMessages(prev => {
          const newMessages = [...prev, data.message];
          // Keep only last 5 messages to avoid overwhelming the UI
          return newMessages.slice(-5);
        });
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
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <div className="w-full">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between px-8 pt-6">
          <div>
            <Link
              href="/"
              className="mb-4 inline-flex items-center text-sm text-yellow-400 hover:text-yellow-300"
            >
              Macaroni Arch
            </Link>
            <h1 className="text-4xl font-bold text-yellow-400">
              Macaroni Architecture Analysis of: {repoUrl ? repoUrl.split('/').pop()?.replace('.git', '') || repoUrl : 'Repository'}
            </h1>
            {repoUrl && (
              <p className="mt-2 text-sm text-gray-400">
                Analyzing: <span className="font-medium">{repoUrl}</span>
              </p>
            )}
          </div>
        </div>

        {/* Content */}
        {!repoUrl && (
          <div className="rounded-lg bg-white p-8 text-center shadow-md mx-8">
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
          <div className="rounded-lg bg-white p-12 text-center shadow-md mx-8">
            <div className="mb-4 text-6xl">🍝</div>
            <p className="text-xl font-semibold text-gray-700">
              Analyzing repository...
            </p>
            {progressMessages.length > 0 && (
              <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
                {progressMessages.map((msg, idx) => (
                  <p 
                    key={idx} 
                    className="text-sm text-orange-600 font-medium"
                    style={{ opacity: 0.5 + (idx / progressMessages.length) * 0.5 }}
                  >
                    {msg}
                  </p>
                ))}
              </div>
            )}
            <p className="mt-2 text-gray-500">
              Untangling the spaghetti code!
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border-2 border-red-300 p-8 shadow-md mx-8">
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
          <DSM data={dsmData} />
        )}
      </div>
    </div>
  );
}
