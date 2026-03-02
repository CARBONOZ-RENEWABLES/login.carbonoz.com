import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const existingPlans = await prisma.subscriptionPlan.findMany();
  
  if (existingPlans.length > 0) {
    console.log('⚠️  Subscription plans already exist. Skipping seeding.');
    return;
  }

  await prisma.subscriptionPlan.createMany({
    data: [
      {
        name: 'Monthly Plan',
        description: 'Full access to Carbonoz platform - billed monthly',
        priceMonthly: 9.99,
        currency: 'USD',
        active: true,
      },
      {
        name: 'Yearly Plan',
        description: 'Full access to Carbonoz platform - billed yearly (save 20%)',
        priceMonthly: 7.99,
        priceYearly: 95.88,
        currency: 'USD',
        active: true,
      },
    ],
  });

  console.log('✅ Subscription plans seeded successfully');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding subscription plans:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
