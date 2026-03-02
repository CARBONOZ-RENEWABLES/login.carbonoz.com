import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedSubscriptionPlans() {
  console.log('🌱 Seeding subscription plans...');

  const plans = await prisma.subscriptionPlan.createMany({
    data: [
      {
        name: 'Monthly Pro',
        description: 'Full access to Carbonoz platform - Monthly billing',
        priceMonthly: 29.99,
        currency: 'USD',
        active: true,
      },
      {
        name: 'Yearly Pro',
        description: 'Full access to Carbonoz platform - Save 17% with yearly billing',
        priceMonthly: 24.99,
        priceYearly: 299.99,
        currency: 'USD',
        active: true,
      },
    ],
  });

  console.log(`✅ Created ${plans.count} subscription plans`);
}

seedSubscriptionPlans()
  .catch((e) => {
    console.error('❌ Error seeding subscription plans:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
