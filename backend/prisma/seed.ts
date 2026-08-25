import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "password123";

const USERS = [
  {
    username: "nova_paints",
    email: "nova@example.com",
    displayName: "Nova Reyes",
    bio: "Digital painter obsessed with neon cityscapes. Always taking commissions.",
    theme: { bgColor: "#1a0b2e", textColor: "#f5e6ff", accentColor: "#ff3cac", fontFamily: "Georgia, serif", layoutStyle: "grid" },
  },
  {
    username: "lyricist_lee",
    email: "lee@example.com",
    displayName: "Lee Osei",
    bio: "Songwriter and poet. Words first, melody second.",
    theme: { bgColor: "#0b1d2e", textColor: "#e6f3ff", accentColor: "#3ca9ff", fontFamily: "'Courier New', monospace", layoutStyle: "stacked" },
  },
  {
    username: "clay_and_co",
    email: "clay@example.com",
    displayName: "Priya Clay",
    bio: "Ceramicist. If it's not a little wonky it's not handmade.",
    theme: { bgColor: "#2e1a0b", textColor: "#fff3e6", accentColor: "#ffa53c", fontFamily: "Verdana, sans-serif", layoutStyle: "grid" },
  },
  {
    username: "synth_wren",
    email: "wren@example.com",
    displayName: "Wren Castillo",
    bio: "Bedroom producer making synthwave for people who miss the 80s they never lived through.",
    theme: { bgColor: "#0b2e1e", textColor: "#e6fff0", accentColor: "#3cffb0", fontFamily: "'Trebuchet MS', sans-serif", layoutStyle: "stacked" },
  },
  {
    username: "sketchy_sam",
    email: "sam@example.com",
    displayName: "Sam Delgado",
    bio: "Sketch a stranger a day. Portrait artist, comic nerd, coffee dependent.",
    theme: { bgColor: "#2e0b1a", textColor: "#ffe6f0", accentColor: "#ff3c6e", fontFamily: "Tahoma, sans-serif", layoutStyle: "grid" },
  },
  {
    username: "filmgrain_fox",
    email: "fox@example.com",
    displayName: "Fox Ibarra",
    bio: "Analog photography, mostly 35mm. Shooting the in-between moments.",
    theme: { bgColor: "#1a1a1a", textColor: "#f0f0f0", accentColor: "#c9a227", fontFamily: "Georgia, serif", layoutStyle: "stacked" },
  },
];

const POSTS: { username: string; content: string; isAiText?: boolean; isAiImage?: boolean }[] = [
  { username: "nova_paints", content: "Finished a new neon skyline piece tonight — three layers of glow effects. 🎨" },
  { username: "lyricist_lee", content: "New verse forming about leaving your hometown and still hearing it in your voice.", isAiText: true },
  { username: "clay_and_co", content: "Glazed six mugs today, only lost one to the kiln gods. Progress." },
  { username: "synth_wren", content: "Dropped a new synthwave loop — chasing that VHS-static feeling.", isAiImage: true },
  { username: "sketchy_sam", content: "Stranger #142: a guy on the train reading a paperback with a cracked spine." },
  { username: "filmgrain_fox", content: "Got a roll back from the lab — half the frames are light-leaked and somehow better for it." },
];

const GROUPS = [
  { name: "Night Owls Studio", description: "For anyone who does their best creative work after midnight.", createdBy: "nova_paints" },
  { name: "Analog & Lo-Fi", description: "Film photography, tape hiss, and anything that isn't perfectly clean.", createdBy: "filmgrain_fox" },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const created = new Map<string, { id: string }>();
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: {
        username: u.username,
        email: u.email,
        displayName: u.displayName,
        bio: u.bio,
        passwordHash,
        theme: JSON.stringify(u.theme),
      },
    });
    created.set(u.username, user);
  }

  for (const p of POSTS) {
    const author = created.get(p.username)!;
    const existing = await prisma.post.findFirst({ where: { authorId: author.id, content: p.content } });
    if (!existing) {
      await prisma.post.create({
        data: {
          authorId: author.id,
          content: p.content,
          isAiText: p.isAiText ?? false,
          isAiImage: p.isAiImage ?? false,
        },
      });
    }
  }

  const friendPairs: [string, string, "accepted" | "pending"][] = [
    ["nova_paints", "lyricist_lee", "accepted"],
    ["nova_paints", "clay_and_co", "accepted"],
    ["synth_wren", "sketchy_sam", "accepted"],
    ["filmgrain_fox", "nova_paints", "accepted"],
    ["sketchy_sam", "nova_paints", "pending"],
  ];
  for (const [reqUsername, addUsername, status] of friendPairs) {
    const requester = created.get(reqUsername)!;
    const addressee = created.get(addUsername)!;
    const existing = await prisma.friendship.findFirst({
      where: { requesterId: requester.id, addresseeId: addressee.id },
    });
    if (!existing) {
      await prisma.friendship.create({
        data: { requesterId: requester.id, addresseeId: addressee.id, status },
      });
    }
  }

  const novaTop = ["lyricist_lee", "clay_and_co", "filmgrain_fox"];
  const nova = created.get("nova_paints")!;
  for (let i = 0; i < novaTop.length; i++) {
    const target = created.get(novaTop[i])!;
    await prisma.topFriend.upsert({
      where: { ownerId_targetId: { ownerId: nova.id, targetId: target.id } },
      update: { position: i },
      create: { ownerId: nova.id, targetId: target.id, position: i },
    });
  }

  const testimonial = await prisma.profileComment.findFirst({
    where: { profileOwnerId: nova.id, authorId: created.get("lyricist_lee")!.id },
  });
  if (!testimonial) {
    await prisma.profileComment.create({
      data: {
        profileOwnerId: nova.id,
        authorId: created.get("lyricist_lee")!.id,
        content: "This person's color sense is unreal. Go look at the skyline series right now.",
      },
    });
  }

  for (const g of GROUPS) {
    const creator = created.get(g.createdBy)!;
    const existingGroup = await prisma.group.findFirst({ where: { name: g.name } });
    const group =
      existingGroup ??
      (await prisma.group.create({
        data: { name: g.name, description: g.description, createdById: creator.id },
      }));
    await prisma.groupMembership.upsert({
      where: { groupId_userId: { groupId: group.id, userId: creator.id } },
      update: {},
      create: { groupId: group.id, userId: creator.id, role: "admin" },
    });
  }

  console.log(`Seeded ${created.size} users, ${POSTS.length} posts, ${GROUPS.length} groups.`);
  console.log(`All demo accounts use the password: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
