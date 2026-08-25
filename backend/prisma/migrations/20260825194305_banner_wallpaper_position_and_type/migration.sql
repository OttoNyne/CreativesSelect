-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "bannerUrl" TEXT,
    "bannerPosition" TEXT NOT NULL DEFAULT '50% 50%',
    "wallpaperUrl" TEXT,
    "wallpaperType" TEXT NOT NULL DEFAULT 'image',
    "wallpaperPosition" TEXT NOT NULL DEFAULT '50% 50%',
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "theme" TEXT NOT NULL DEFAULT '{}'
);
INSERT INTO "new_User" ("avatarUrl", "bannerUrl", "bio", "createdAt", "displayName", "email", "id", "isPrivate", "passwordHash", "theme", "username", "wallpaperUrl") SELECT "avatarUrl", "bannerUrl", "bio", "createdAt", "displayName", "email", "id", "isPrivate", "passwordHash", "theme", "username", "wallpaperUrl" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
