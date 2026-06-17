import * as dotenv from "dotenv";
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  GEMINI_API_KEY: requireEnv("GEMINI_API_KEY"),
  FIREBASE_PROJECT_ID: requireEnv("FIREBASE_PROJECT_ID"),
  FIREBASE_CLIENT_EMAIL: requireEnv("FIREBASE_CLIENT_EMAIL"),
  FIREBASE_PRIVATE_KEY: requireEnv("FIREBASE_PRIVATE_KEY"),
  PORT: process.env.PORT ?? "3001",
};
