"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SAMPLE_PROJECTS = [
  { name: "JavaScript", url: "https://github.com/tastejs/todomvc.git", emoji: "📜" },
  { name: "Python", url: "https://github.com/pallets/flask.git", emoji: "🐍" },
  { name: "Java", url: "", emoji: "☕", disabled: true },
  { name: "C#", url: "", emoji: "🎯", disabled: true },
];

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const router = useRouter();

  const handleAnalyze = () => {
    if (repoUrl.trim()) {
      router.push(`/analyze?repo=${encodeURIComponent(repoUrl)}`);
    }
  };

  const handleSampleProject = (url: string) => {
    if (url) {
      router.push(`/analyze?repo=${encodeURIComponent(url)}`);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-yellow-50 via-orange-50 to-yellow-100">
      {/* Header with Sample Projects */}
      <header className="w-full border-b-2 border-yellow-300 bg-white/50 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="mr-2 text-sm font-semibold text-orange-700">Sample Projects:</span>
            {SAMPLE_PROJECTS.map((project) => (
              <button
                key={project.name}
                onClick={() => handleSampleProject(project.url)}
                disabled={project.disabled}
                className={`rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition-all ${
                  project.disabled
                    ? "cursor-not-allowed bg-gray-200 text-gray-400"
                    : "bg-yellow-400 text-yellow-900 hover:bg-yellow-500 hover:shadow-md active:scale-95"
                }`}
                title={project.disabled ? "Coming soon" : `Analyze ${project.name} sample project`}
              >
                <span className="mr-1">{project.emoji}</span>
                {project.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 items-center justify-center px-8 py-16 text-center">
        <div className="flex flex-col items-center justify-center">
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
        </div>
      </main>
    </div>
  );
}
