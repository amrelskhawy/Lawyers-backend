/**
 * List ALL Available Models
 * This uses the ListModels API endpoint to see exactly what your key can access
 */

import dotenv from "dotenv";

dotenv.config();

async function listAllModels() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error(" GEMINI_API_KEY not found in .env file");
        process.exit(1);
    }

    console.log("🔍 Fetching ALL available models from Google API...\n");
    console.log("API Key:", apiKey.substring(0, 15) + "...\n");

    try {
        // Call the ListModels API endpoint
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error(" API Error:", response.status, response.statusText);
            console.error("Response:", errorText);

            if (response.status === 400) {
                console.error("\n Your API key appears to be INVALID or MALFORMED");
                console.error("Please generate a new API key at: https://aistudio.google.com/apikey");
            }

            if (response.status === 403) {
                console.error("\n API key is valid but PERMISSION DENIED");
                console.error("Possible reasons:");
                console.error("1. Your region is blocked");
                console.error("2. API key restrictions are too strict");
                console.error("3. You need to enable the Gemini API in your Google Cloud project");
            }

            return;
        }

        const data = await response.json();

        if (!data.models || data.models.length === 0) {
            console.error("No models found for your API key!");
            console.error("This usually means:");
            console.error("1. Your API key is from Google Cloud (not AI Studio)");
            console.error("2. You need to enable the Generative Language API");
            console.error("3. Your region doesn't support Gemini");
            return;
        }

        console.log(`Found ${data.models.length} available models:\n`);

        data.models.forEach((model: any) => {
            const supportsGenerate = model.supportedGenerationMethods?.includes('generateContent');
            const icon = supportsGenerate ? '✅' : '❌';
            console.log(`${icon} ${model.name}`);
            console.log(`  Display Name: ${model.displayName}`);
            console.log(`  Supported Methods: ${model.supportedGenerationMethods?.join(', ')}`);
            console.log('');
        });

        // Show which models work for generateContent
        const workingModels = data.models.filter((m: any) =>
            m.supportedGenerationMethods?.includes('generateContent')
        );

        if (workingModels.length > 0) {
            console.log("\n Models you can use for chatbot (support generateContent):\n");
            workingModels.forEach((model: any) => {
                // Extract just the model name (e.g., "gemini-pro" from "models/gemini-pro")
                const modelName = model.name.split('/').pop();
                console.log(`   model: "${modelName}",`);
            });
        }

    } catch (error: any) {
        console.error("\n Network Error:", error.message);
        console.error("\n Possible issues:");
        console.error("1. No internet connection");
        console.error("2. Firewall blocking generativelanguage.googleapis.com");
        console.error("3. API endpoint is down (unlikely)");
    }
}

listAllModels();