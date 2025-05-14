import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { NextRequest, NextResponse } from 'next/server';

const MODEL_NAME = "gemini-2.0-flash"; // Or your preferred Gemini Flash model
const API_KEY = process.env.GOOGLE_API_KEY;

if (!API_KEY) {
  console.error("GOOGLE_API_KEY is not set in environment variables.");
  // Optionally, you could throw an error here to prevent the app from starting
  // or handle it in a way that the API route returns a specific error.
}

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

// Define a type for the expected recommendation item
interface Recommendation {
  title: string;
  imdbUrl: string;
}

export async function POST(req: NextRequest) {
  if (!genAI) {
    return NextResponse.json({ error: "Server configuration error: API key not found." }, { status: 500 });
  }

  try {
    const body = await req.json();
    const userMovies: string[] = body.movies;

    if (!userMovies || userMovies.length < 3) {
      return NextResponse.json({ error: "Please provide at least 3 movies." }, { status: 400 });
    }

    const prompt = `
      Given the following movies and TV shows that a user likes: ${userMovies.join(", ")}.

      Please provide 6 new TV show or movie recommendations based on these preferences.
      For each recommendation, provide:
      1. The title of the movie or TV show.
      2. The full URL to its official IMDB page.

      Format the output as a valid JSON array of objects, where each object has a "title" and an "imdbUrl" key.
      For example:
      [
        {"title": "Recommended Show 1", "imdbUrl": "https://www.imdb.com/title/tt..."},
        {"title": "Recommended Movie 2", "imdbUrl": "https://www.imdb.com/title/tt..."}
      ]
      Ensure the JSON is well-formed and contains exactly 6 recommendations. Do not include any other text, explanations, or markdown formatting around the JSON.
      If you cannot find IMDB URLs or generate recommendations, return an empty array or a JSON array with fewer than 6 items if absolutely necessary, but prioritize providing 6.
    `;

    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const generationConfig = {
      temperature: 0.8, // Adjust for creativity vs. predictability
      topK: 1,
      topP: 1,
      maxOutputTokens: 2048, // Adjust as needed, ensure it's enough for JSON output
    };

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

    const responseText = result.response.text();
    
    // Attempt to parse the response as JSON
    try {
      // Sometimes the model might wrap the JSON in markdown ```json ... ```
      const cleanedResponseText = responseText.replace(/^```json\n|\n```$/g, '').trim();
      const recommendations: Recommendation[] = JSON.parse(cleanedResponseText);
      
      if (!Array.isArray(recommendations)) {
        console.error("LLM response was not a JSON array:", cleanedResponseText);
        return NextResponse.json({ error: "Failed to parse recommendations from LLM. Expected an array." }, { status: 500 });
      }

      // Optional: Validate structure of each recommendation
      const isValid = recommendations.every(r => typeof r.title === 'string' && typeof r.imdbUrl === 'string' && r.imdbUrl.startsWith('http'));
      if (!isValid && recommendations.length > 0) { // only error if there was some attempt at recommendations
          console.warn("Some recommendations might have an invalid structure:", recommendations);
          // Decide if you want to filter out invalid ones or return an error
      }

      return NextResponse.json({ recommendations }, { status: 200 });

    } catch (parseError) {
      console.error("Failed to parse LLM response as JSON:", responseText, parseError);
      return NextResponse.json({ error: "Failed to parse recommendations from LLM.", llmRawResponse: responseText }, { status: 500 });
    }

  } catch (error) {
    console.error("Error in /api/recommendations:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to get recommendations.", details: errorMessage }, { status: 500 });
  }
} 
