"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const router = useRouter();

  const handleAnalyze = () => {
    if (repoUrl.trim()) {
      router.push(`/analyze?repo=${encodeURIComponent(repoUrl)}`);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-yellow-50 via-orange-50 to-yellow-100">
      <main className="flex flex-col items-center justify-center px-8 py-16 text-center">
        {/* Logo */}
        <div className="mb-8 text-9xl" aria-label="Macaroni Logo">
          🍝😊
        </div>

        {/* Title */}
        <h1 className="mb-6 text-7xl font-bold text-yellow-600 drop-shadow-lg">
          Macaroni Matrix
        </h1>

        {/* Tagline */}
        <p className="mb-12 max-w-2xl text-2xl font-medium text-orange-700">
          Code shouldn&apos;t be tangled like Spaghetti, it should be modular like
          Macaroni!
        </p>

        {/* Input and Button */}
        <div className="w-full max-w-2xl">
          <div className="flex flex-col gap-4 sm:flex-row">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="Enter repository URL..."
              className="flex-1 rounded-lg border-2 border-yellow-400 bg-white px-6 py-4 text-lg text-gray-800 placeholder-gray-400 shadow-md transition-all focus:border-yellow-500 focus:outline-none focus:ring-4 focus:ring-yellow-200"
            />
            <button
              onClick={handleAnalyze}
              className="rounded-lg bg-yellow-500 px-8 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:bg-yellow-600 hover:shadow-xl active:scale-95"
            >
              Analyze
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
