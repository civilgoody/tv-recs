"use client";

import { useState } from "react";

// Define a type for the expected recommendation item from the API
interface Recommendation {
  title: string;
  imdbUrl: string;
}

export default function HomePage() {
  const [movieInput, setMovieInput] = useState<string>("");
  const [movies, setMovies] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddMovie = () => {
    if (movieInput.trim() !== "" && !movies.includes(movieInput.trim())) {
      setMovies([...movies, movieInput.trim()]);
      setMovieInput("");
      setError(null); // Clear error when user interacts
      setRecommendations([]); // Clear previous recommendations
    }
  };

  const handleRemoveMovie = (movieToRemove: string) => {
    setMovies(movies.filter((movie) => movie !== movieToRemove));
    setError(null);
    setRecommendations([]);
  };

  const handleSubmit = async () => {
    if (movies.length < 3) {
      alert("Please add at least 3 movies or shows.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setRecommendations([]);

    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ movies }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.recommendations && data.recommendations.length > 0) {
        setRecommendations(data.recommendations);
      } else {
        setError("No recommendations found, or an error occurred while fetching them.");
      }
    } catch (err) {
      console.error("Failed to fetch recommendations:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred while fetching recommendations.");
    }
    setIsLoading(false);
  };

  return (
    <main className="container mx-auto p-4 min-h-screen flex flex-col items-center bg-gray-900 text-white">
      <div className="w-full max-w-2xl p-8 space-y-8 bg-gray-800 shadow-xl rounded-lg mt-10 mb-10">
        <h1 className="text-4xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
          Movie & TV Show Recommender
        </h1>

        <div className="space-y-4">
          <p className="text-center text-gray-300">
            Tell us at least 3 movies or TV shows you like, and we&apos;ll suggest what to watch next!
          </p>
          <div className="flex space-x-2">
            <input
              type="text"
              value={movieInput}
              onChange={(e) => setMovieInput(e.target.value)}
              placeholder="Enter a movie or TV show"
              className="flex-grow p-3 border border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-gray-700 text-white placeholder-gray-400"
              onKeyPress={(e) => {
                if (e.key === "Enter" && movieInput.trim() !== "") {
                  handleAddMovie();
                }
              }}
              disabled={isLoading}
            />
            <button
              onClick={handleAddMovie}
              disabled={isLoading || movieInput.trim() === ""}
              className="px-6 py-3 bg-pink-600 hover:bg-pink-700 text-white font-semibold rounded-md shadow-md focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-opacity-50 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </div>

        {movies.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-gray-200">Your Liked Movies/Shows:</h2>
            <ul className="space-y-2">
              {movies.map((movie, index) => (
                <li
                  key={index}
                  className="flex justify-between items-center p-3 bg-gray-700 rounded-md shadow"
                >
                  <span className="text-gray-100">{movie}</span>
                  <button
                    onClick={() => handleRemoveMovie(movie)}
                    disabled={isLoading}
                    className="ml-4 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {movies.length >= 3 && (
          <div className="text-center pt-4">
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-60 transform transition hover:scale-105 duration-150 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Getting Suggestions...
                </div>
              ) : "Get Recommendations"}
            </button>
          </div>
        )}

        {isLoading && (
          <div className="mt-6 text-center">
             {/* Optional: could add a more prominent global loading indicator here too */}
          </div>
        )}

        {error && (
          <div className="mt-6 p-4 bg-red-900 border border-red-700 text-red-100 rounded-md text-center">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {!isLoading && recommendations.length > 0 && (
          <div className="mt-8 space-y-4">
            <h2 className="text-3xl font-semibold text-center text-gray-100">Here are your recommendations!</h2>
            <ul className="space-y-3">
              {recommendations.map((rec, index) => (
                <li key={index} className="p-4 bg-gray-700 rounded-lg shadow-md hover:bg-gray-600 transition duration-150">
                  <a 
                    href={rec.imdbUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lg font-semibold text-pink-400 hover:text-pink-300 hover:underline"
                  >
                    {rec.title}
                  </a>
                  <p className="text-sm text-gray-400 mt-1">
                    IMDB Link: <a href={rec.imdbUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline">{rec.imdbUrl}</a>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500">Powered by Gemini Flash Model</p>
        </div>
      </div>
    </main>
  );
}
