import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPlans() {
  console.log('🔍 Checking subscription plans...\n');
  
  const plans = await prisma.subscriptionPlan.findMany();
  
  if (plans.length === 0) {
    console.log('❌ No plans found! Running seeder...\n');
    
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
    
    console.log('✅ Plans created!\n');
    
    const newPlans = await prisma.subscriptionPlan.findMany();
    console.log('📋 Current plans:');
    newPlans.forEach(plan => {
      console.log(`  - ${plan.name}: $${plan.priceMonthly}/month${plan.priceYearly ? ` or $${plan.priceYearly}/year` : ''}`);
    });
  } else {
    console.log('✅ Plans already exist:\n');
    plans.forEach(plan => {
      console.log(`  - ${plan.name}: $${plan.priceMonthly}/month${plan.priceYearly ? ` or $${plan.priceYearly}/year` : ''}`);
    });
  }
}

checkPlans()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
