import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as readline from 'readline';

const prisma = new PrismaClient();

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  const existing = await prisma.admin.findFirst();
  if (existing) {
    console.log(`✅ Admin already exists (${existing.email}) — skipping seed.`);
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const adminEmail    = (await ask(rl, '  Admin email    : ')).trim();
  const adminName     = (await ask(rl, '  Admin name     : ')).trim();
  const adminPassword = (await ask(rl, '  Admin password : ')).trim();
  rl.close();

  const adminPw = await bcrypt.hash(adminPassword, 10);
  await prisma.admin.create({
    data: {
      name:     adminName,
      email:    adminEmail,
      password: adminPw,
      role:     'SUPER_ADMIN',
    },
  });

  console.log('\n✅ Admin created!');
  console.log(`  🔐 email: ${adminEmail}  (role: SUPER_ADMIN)\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());


