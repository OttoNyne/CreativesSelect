import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: required("JWT_SECRET"),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  aiProvider: process.env.AI_PROVIDER ?? "mock",
  nodeEnv: process.env.NODE_ENV ?? "development",
};
