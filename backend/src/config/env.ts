import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  // Deliberately not named PORT: some dev-server launchers inject a PORT env
  // var for the "main" port across an entire process tree (e.g. concurrently
  // running frontend+backend together), which would otherwise clobber this.
  port: Number(process.env.BACKEND_PORT ?? 4000),
  jwtSecret: required("JWT_SECRET"),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  aiProvider: process.env.AI_PROVIDER ?? "mock",
  nodeEnv: process.env.NODE_ENV ?? "development",
};
