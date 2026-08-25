import { createApp } from "./app";
import { env } from "./config/env";
import { ensureUploadDirs } from "./middleware/upload";

ensureUploadDirs();

const app = createApp();

app.listen(env.port, () => {
  console.log(`CreativesSelect backend listening on http://localhost:${env.port}`);
});
