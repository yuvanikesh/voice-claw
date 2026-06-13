# VoiceClaw

AI-powered voice agent builder for Indian businesses. Answer your customers in their language — automatically.

## Features

- Conversational onboarding — 6-question setup interview builds your agent config
- Live right-panel preview updates as you answer
- PDF & URL knowledge base ingestion
- Multi-language voice responses (Telugu, Hindi, Tamil, and more)
- Deploy-ready in minutes — no code required

## Run Locally

**Prerequisites:** Node.js 18+

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the env file and fill in your keys:
   ```bash
   cp .env.example .env
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) to start building.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Powers the onboarding assistant |
| `AI_API_KEY` | Optional | Override with a custom LLM provider key |
| `AI_MODEL` | Optional | Model to use with `AI_API_KEY` |
| `NEXT_PUBLIC_API_URL` | Optional | Point frontend to an external backend |
