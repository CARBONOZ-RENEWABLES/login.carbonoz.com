import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedSubscriptionPlan() {
  const existingPlan = await prisma.subscriptionPlan.findFirst();
  
  if (!existingPlan) {
    await prisma.subscriptionPlan.create({
      data: {
        name: 'SolarAutopilot Pro',
        description: 'Full access to CARBONOZ SolarAutopilot platform',
        features: [
          'Full platform access',
          'SolarAutopilot integration',
          'Real-time monitoring',
          'Carbon intensity tracking',
          'Analytics & reports',
          'Priority support'
        ],
        priceMonthly: 9.99,
        priceYearly: 99.99,
        currency: 'USD',
        active: true,
      },
    });
    console.log('✅ Default subscription plan created with features');
  } else {
    console.log('ℹ️  Subscription plan already exists');
  }
}

seedSubscriptionPlan()
  .catch((e) => {
    console.error('Error seeding subscription plan:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
