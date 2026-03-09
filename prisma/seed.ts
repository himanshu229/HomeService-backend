import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Categories
  const categories = await Promise.all([
    prisma.serviceCategory.upsert({
      where: { name: 'AC & Appliances' },
      update: {},
      create: { name: 'AC & Appliances', emoji: '❄️', description: 'AC, refrigerator, washing machine repair', color: '#1A73E8' },
    }),
    prisma.serviceCategory.upsert({
      where: { name: 'Plumbing' },
      update: {},
      create: { name: 'Plumbing', emoji: '🔧', description: 'Leaks, drainage, tap repair', color: '#34A853' },
    }),
    prisma.serviceCategory.upsert({
      where: { name: 'Electrical' },
      update: {},
      create: { name: 'Electrical', emoji: '⚡', description: 'Wiring, switches, fans, lights', color: '#FBBC05' },
    }),
    prisma.serviceCategory.upsert({
      where: { name: 'Cleaning' },
      update: {},
      create: { name: 'Cleaning', emoji: '🧹', description: 'Deep cleaning, bathroom, kitchen', color: '#FF6B35' },
    }),
  ]);

  // Services
  const acCategory = categories[0];
  const plumbingCategory = categories[1];
  const electricalCategory = categories[2];
  const cleaningCategory = categories[3];

  const services = [
    { name: 'AC Service & Cleaning', desc: 'Complete AC servicing including deep cleaning, gas check, and performance test', price: 599, duration: 90, emoji: '❄️', popular: true, category: acCategory.id },
    { name: 'AC Installation', desc: 'Professional AC installation with copper piping and testing', price: 1299, duration: 120, emoji: '🔨', popular: true, category: acCategory.id },
    { name: 'Refrigerator Repair', desc: 'All brands, major & minor faults', price: 499, duration: 60, emoji: '🧊', popular: false, category: acCategory.id },
    { name: 'Washing Machine Repair', desc: 'Top load & front load, all brands', price: 449, duration: 60, emoji: '🫧', popular: true, category: acCategory.id },
    { name: 'Tap Leakage Fix', desc: 'Fix dripping taps and leaky joints', price: 199, duration: 30, emoji: '💧', popular: true, category: plumbingCategory.id },
    { name: 'Drain Unclogging', desc: 'Kitchen & bathroom drain cleaning', price: 299, duration: 45, emoji: '🔧', popular: true, category: plumbingCategory.id },
    { name: 'Flush Tank Repair', desc: 'Fix running or broken flush tanks', price: 249, duration: 40, emoji: '🚽', popular: false, category: plumbingCategory.id },
    { name: 'Ceiling Fan Install', desc: 'Safe installation with testing', price: 299, duration: 45, emoji: '💨', popular: true, category: electricalCategory.id },
    { name: 'Switch & Socket Repair', desc: 'Fix faulty switches, sockets, and MCBs', price: 149, duration: 30, emoji: '⚡', popular: true, category: electricalCategory.id },
    { name: 'Full Home Deep Clean', desc: 'Comprehensive deep cleaning for 2BHK including kitchen, bathrooms, and living areas', price: 2499, duration: 240, emoji: '🧹', popular: true, category: cleaningCategory.id },
    { name: 'Bathroom Cleaning', desc: 'Deep scrubbing, tile cleaning, and sanitization', price: 499, duration: 60, emoji: '🚿', popular: true, category: cleaningCategory.id },
    { name: 'Kitchen Deep Clean', desc: 'Chimney, tiles, cabinet, sink cleaning', price: 799, duration: 90, emoji: '🍳', popular: false, category: cleaningCategory.id },
  ];

  for (const s of services) {
    await prisma.service.upsert({
      where: { id: `seed_${s.name.toLowerCase().replace(/ /g, '_')}` },
      update: {},
      create: {
        id: `seed_${s.name.toLowerCase().replace(/ /g, '_')}`,
        name: s.name,
        description: s.desc,
        price: s.price,
        duration: s.duration,
        emoji: s.emoji,
        popular: s.popular,
        warranty: '30 days',
        rating: 4.3 + Math.random() * 0.6,
        reviewCount: Math.floor(50 + Math.random() * 200),
        categoryId: s.category,
      },
    });
  }

  // Technicians
  const technicians = [
    { name: 'Rahul Sharma', phone: '9876543210', experience: 5, expertise: [acCategory.id, electricalCategory.id] },
    { name: 'Suresh Kumar', phone: '9876543211', experience: 7, expertise: [plumbingCategory.id] },
    { name: 'Mohan Patel', phone: '9876543212', experience: 3, expertise: [cleaningCategory.id] },
    { name: 'Ankit Verma', phone: '9876543213', experience: 6, expertise: [electricalCategory.id] },
    { name: 'Deepak Singh', phone: '9876543214', experience: 4, expertise: [acCategory.id] },
  ];

  for (const t of technicians) {
    await prisma.technician.upsert({
      where: { phone: t.phone },
      update: {},
      create: {
        name: t.name,
        phone: t.phone,
        experience: t.experience,
        expertise: t.expertise,
        rating: 4.2 + Math.random() * 0.7,
        reviewCount: Math.floor(20 + Math.random() * 80),
      },
    });
  }

  // ── Admin user ─────────────────────────────────────────────────────────────
  const adminPw = await bcrypt.hash('Admin@SummerFix2026', 10);
  await prisma.user.upsert({
    where: { email: 'admin@summerfix.in' },
    update: {},
    create: {
      name:       'Super Admin',
      email:      'admin@summerfix.in',
      phone:      '9000000000',
      password:   adminPw,
      role:       'ADMIN',
      isVerified: true,
    },
  });

  // ── Demo normal user ────────────────────────────────────────────────────────
  const hashedPw = await bcrypt.hash('Test@1234', 10);
  await prisma.user.upsert({
    where: { email: 'demo@summerfix.in' },
    update: {},
    create: {
      name:       'Demo User',
      email:      'demo@summerfix.in',
      phone:      '9000000001',
      password:   hashedPw,
      role:       'USER',
      isVerified: true,
      addresses: {
        create: {
          label:     'Home',
          street:    '42, MG Road, Sector 5',
          city:      'Gurugram',
          state:     'Haryana',
          pincode:   '122001',
          isDefault: true,
        },
      },
    },
  });

  console.log('✅ Seed complete!');
  console.log('');
  console.log('  🔐 ADMIN  → email: admin@summerfix.in  | password: Admin@SummerFix2026');
  console.log('  👤 USER   → email: demo@summerfix.in   | password: Test@1234');
  console.log('');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
