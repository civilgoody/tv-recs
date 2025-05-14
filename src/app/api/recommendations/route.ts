import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { NextRequest, NextResponse } from 'next/server';

const GEMINI_MODEL_NAME = "gemini-2.0-flash";
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;

if (!GOOGLE_API_KEY) {
  console.error("CRITICAL: GOOGLE_API_KEY is not set in environment variables at module load.");
}
if (!TMDB_API_KEY) {
  console.error("CRITICAL: TMDB_API_KEY is not set in environment variables at module load.");
}

const genAI = GOOGLE_API_KEY ? new GoogleGenerativeAI(GOOGLE_API_KEY) : null;

interface Recommendation {
  title: string;
  imdbUrl: string;
}

interface TMDBMultiSearchResult {
  id: number;
  media_type: 'movie' | 'tv' | 'person';
  title?: string; // For movies
  name?: string;  // For TV shows and people
  popularity: number;
}

interface TMDBMovieDetails {
  imdb_id?: string;
  // ... other movie details if needed later
}

interface TMDBTvDetails {
  external_ids?: {
    imdb_id?: string;
  };
  // ... other TV details if needed later
}

async function getImdbUrlFromTmdb(title: string): Promise<string | null> {
  if (!TMDB_API_KEY) return null;

  try {
    // 1. Multi-search to find the TMDB ID and media type
    const searchUrl = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&page=1`;
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      console.error(`TMDB search API error for title "${title}": ${searchResponse.status} ${await searchResponse.text()}`);
      return null;
    }
    const searchData = await searchResponse.json();

    const topResult = searchData.results?.[0] as TMDBMultiSearchResult | undefined;
    if (!topResult || (topResult.media_type !== 'movie' && topResult.media_type !== 'tv')) {
      console.warn(`No suitable movie/TV show found on TMDB for title: "${title}"`);
      return null;
    }

    const tmdbId = topResult.id;
    const mediaType = topResult.media_type;

    // 2. Fetch details to get IMDB ID
    let detailsUrl = ''
    if (mediaType === 'movie') {
      detailsUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`;
    } else { // mediaType === 'tv'
      detailsUrl = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
    }
    
    const detailsResponse = await fetch(detailsUrl);
    if (!detailsResponse.ok) {
      console.error(`TMDB details API error for ${mediaType} ID ${tmdbId}: ${detailsResponse.status} ${await detailsResponse.text()}`);
      return null;
    }
    const detailsData = await detailsResponse.json();

    let imdbId: string | undefined | null = null;
    if (mediaType === 'movie') {
      imdbId = (detailsData as TMDBMovieDetails).imdb_id;
    } else { // mediaType === 'tv'
      imdbId = (detailsData as TMDBTvDetails).external_ids?.imdb_id ?? detailsData.imdb_id; // Some TV responses might have imdb_id at root
    }

    if (imdbId) {
      return `https://www.imdb.com/title/${imdbId}`;
    }
    console.warn(`IMDB ID not found on TMDB for ${mediaType} "${title}" (TMDB ID: ${tmdbId})`);
    return null;

  } catch (error) {
    console.error(`Error fetching IMDB URL from TMDB for title "${title}":`, error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  console.log(`API Route /api/recommendations POST request received at: ${new Date().toISOString()}`);
  if (!GOOGLE_API_KEY) {
    console.error("API Key is missing at the time of request.");
    return NextResponse.json({ error: "Server configuration error: Google API key not configured." }, { status: 500 });
  }
  if (!TMDB_API_KEY) {
    console.error("TMDB API Key is missing at the time of request.");
    return NextResponse.json({ error: "Server configuration error: TMDB API key not configured." }, { status: 500 });
  }
  console.log(`Google API Key Loaded: ${GOOGLE_API_KEY ? 'Yes, first 5 chars: ' + GOOGLE_API_KEY.substring(0,5) : 'No'}`);
  console.log(`TMDB API Key Loaded: ${TMDB_API_KEY ? 'Yes, first 5 chars: ' + TMDB_API_KEY.substring(0,5) : 'No'}`);

  if (!genAI) {
    console.error("genAI instance is not available. This likely means GOOGLE_API_KEY was missing at startup.");
    return NextResponse.json({ error: "Server configuration error: Google AI SDK not initialized." }, { status: 500 });
  }

  try {
    const body = await req.json();
    const userMovies: string[] = body.movies;

    if (!userMovies || userMovies.length < 3) {
      return NextResponse.json({ error: "Please provide at least 3 movies." }, { status: 400 });
    }

    // Updated prompt to only ask for titles
    const prompt = `
      Given the following movies and TV shows that a user likes: ${userMovies.join(", ")}.

      Please provide 6 new TV show or movie recommendations based on these preferences.
      List only the titles of the recommended movies or TV shows. Each title should be on a new line.
      Do not include numbers, dashes, or any other formatting before the titles. Just the titles.
      For example:
      Recommended Show 1
      Recommended Movie 2
      Another Recommendation
    `;

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });
    const generationConfig = { temperature: 0.8, topK: 1, topP: 1, maxOutputTokens: 1024 }; // Reduced max tokens as we only need titles
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];
    
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{text: prompt}]}],
        generationConfig,
        safetySettings
    });

    const llmResponseText = result.response.text();
    const recommendedTitles = llmResponseText.split('\n').map(title => title.trim()).filter(title => title.length > 0);

    if (recommendedTitles.length === 0) {
        console.error("LLM did not return any titles. Response:", llmResponseText);
        return NextResponse.json({ error: "The AI failed to suggest any movie titles. Please try again.", llmRawResponse: llmResponseText }, { status: 500 });
    }

    const recommendationsWithImdb: Recommendation[] = [];
    for (const title of recommendedTitles) {
      const imdbUrl = await getImdbUrlFromTmdb(title);
      if (imdbUrl) { // Only add if we found an IMDB URL
        recommendationsWithImdb.push({ title, imdbUrl });
      } else {
        // Optionally, push with a placeholder or a search link if TMDB fails
        // For now, we just skip it if no direct IMDB link is found.
        console.warn(`Skipping recommendation for "${title}" as no IMDB URL was found via TMDB.`);
      }
    }

    if (recommendationsWithImdb.length === 0 && recommendedTitles.length > 0) {
        console.error("LLM returned titles, but TMDB couldn't find IMDB URLs for any of them.");
        return NextResponse.json({ error: "Could not find IMDB details for the suggested titles. The titles might be too new or obscure.", llmTitles: recommendedTitles }, { status: 500 });
    }

    return NextResponse.json({ recommendations: recommendationsWithImdb }, { status: 200 });

  } catch (error) {
    console.error("Error in /api/recommendations POST handler:", error);
    if (error instanceof Error) {
        console.error("Error name:", error.name);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
        if ('cause' in error && error.cause) {
            console.error("Underlying cause:", error.cause);
        }
    }
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to get recommendations.", details: errorMessage }, { status: 500 });
  }
} 
