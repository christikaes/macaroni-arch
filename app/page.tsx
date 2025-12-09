"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  SpaghettiIcon, 
  FettuccineIcon, 
  PenneIcon, 
  RigatoniIcon, 
  ZitiIcon, 
  MacaroniIcon 
} from "~/components/icons/PastaIcons";

const SAMPLE_PROJECTS = [
  { name: "JS | Redux", url: "https://github.com/reduxjs/redux" }, 
  // { name: "JS | TODOMVC", url: "https://github.com/tastejs/todomvc.git" }, 
  { name: "PY | Flask", url: "https://github.com/pallets/flask.git" },
  // { name: "PY | FastAPI", url: "https://github.com/fastapi/fastapi" },
  { name: "Java | SpringPetclinic", url: "https://github.com/spring-projects/spring-petclinic" },
  { name: "C# | eShopOnWeb", url: "https://github.com/dotnet-architecture/eShopOnWeb" },
  { name: "Go | Gorilla Mux", url: "https://github.com/gorilla/mux" },
  { name: "C++ | SFML", url: "https://github.com/SFML/SFML" },
  // { name: "Go | Docker CLI", url: "https://github.com/docker/cli" },
  // { name: "Java | SpringBoot", url: "https://github.com/spring-projects/spring-boot", disabled: true },
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
      {/* Main Content */}
      <main className="flex flex-1 items-center justify-center px-8 py-16 text-center">
        <div className="flex flex-col items-center justify-center">
        {/* Logo */}
        <div className="mb-8" aria-label="Macaroni Logo">
          <video 
            autoPlay 
            muted 
            playsInline
            className="w-64 h-64 mx-auto rounded-full object-cover"
          >
            <source src="/macaroni-architecture-logo.mp4" type="video/mp4" />
          </video>
        </div>

        {/* Title */}
        <h1 className="mb-6 text-7xl font-bold text-yellow-600">
          Macaroni Architecture
        </h1>

        {/* Tagline */}
        <p className="mb-6 max-w-2xl text-xl font-medium text-yellow-600">
          Code shouldn&apos;t be tangled like Spaghetti, it should be modular like
          Macaroni!
        </p>

        {/* Sample Projects - Badge Style */}
        <div className="mb-4 w-full max-w-2xl">
          <p className="mb-2 text-sm text-gray-600">Try a sample project:</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {SAMPLE_PROJECTS.map((project) => (
              <button
                key={project.name}
                onClick={() => handleSampleProject(project.url)}
                className="rounded-full bg-yellow-200 px-3 py-1 text-xs font-medium text-yellow-900 transition-all hover:bg-yellow-300 active:scale-95"
                title={`Analyze ${project.name} sample project`}
              >
                {project.name}
              </button>
            ))}
          </div>
        </div>

         {/* Input and Button */}
        <div className="mb-12 w-full max-w-2xl">
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

        {/* Macaroni Score Levels */}
        <div className="mb-12 w-full max-w-4xl">
          <h2 className="mb-6 text-l font-bold text-yellow-600">
            How Macaroni is your code?
          </h2>
          <div className="overflow-hidden rounded-lg border-2 border-yellow-400 bg-white shadow-lg">
            <table className="w-full">
              <thead className="bg-yellow-100">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-bold text-yellow-900">Level</th>
                  <th className="px-6 py-3 text-left text-sm font-bold text-yellow-900">Score</th>
                  <th className="px-6 py-3 text-left text-sm font-bold text-yellow-900">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-yellow-200">
                <tr className="hover:bg-yellow-50">
                  <td className="px-6 py-4 text-left">
                    <MacaroniIcon className="w-6 h-6 inline-block text-yellow-700" />
                    <span className="ml-2 font-semibold text-gray-900">Macaroni</span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-700">84-100</td>
                  <td className="px-6 py-4 text-sm text-gray-600">Excellent modularity, clean architecture</td>
                </tr>
                <tr className="hover:bg-yellow-50">
                  <td className="px-6 py-4 text-left">
                    <ZitiIcon className="w-6 h-6 inline-block text-yellow-700" />
                    <span className="ml-2 font-semibold text-gray-900">Ziti</span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-700">67-83</td>
                  <td className="px-6 py-4 text-sm text-gray-600">Well-structured, minimal coupling</td>
                </tr>
                <tr className="hover:bg-yellow-50">
                  <td className="px-6 py-4 text-left">
                    <RigatoniIcon className="w-6 h-6 inline-block text-yellow-700" />
                    <span className="ml-2 font-semibold text-gray-900">Rigatoni</span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-700">51-66</td>
                  <td className="px-6 py-4 text-sm text-gray-600">Decent modularity, moderate coupling</td>
                </tr>
                <tr className="hover:bg-yellow-50">
                  <td className="px-6 py-4 text-left">
                    <PenneIcon className="w-6 h-6 inline-block text-yellow-700" />
                    <span className="ml-2 font-semibold text-gray-900">Penne</span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-700">34-50</td>
                  <td className="px-6 py-4 text-sm text-gray-600">Some structure emerging, room for improvement</td>
                </tr>
                <tr className="hover:bg-yellow-50">
                  <td className="px-6 py-4 text-left">
                    <FettuccineIcon className="w-6 h-6 inline-block text-yellow-700" />
                    <span className="ml-2 font-semibold text-gray-900">Fettuccine</span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-700">17-33</td>
                  <td className="px-6 py-4 text-sm text-gray-600">Many entangled dependencies, needs refactoring</td>
                </tr>
                <tr className="hover:bg-yellow-50">
                  <td className="px-6 py-4 text-left">
                    <SpaghettiIcon className="w-6 h-6 inline-block text-yellow-700" />
                    <span className="ml-2 font-semibold text-gray-900">Spaghetti</span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-700">0-16</td>
                  <td className="px-6 py-4 text-sm text-gray-600">Highly tangled, numerous cross-dependencies</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        </div>
      </main>
    </div>
  );
}
