const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const plans = [
    {
      name: 'Basic',
      description: 'Perfect for individuals getting started',
      features: ['Access to dashboard', 'Basic analytics', 'Email support', 'Up to 10 projects'],
      priceMonthly: 9.99,
      priceYearly: 99.99,
      currency: 'USD',
      active: true,
    },
    {
      name: 'Pro',
      description: 'For professionals and small teams',
      features: ['Everything in Basic', 'Advanced analytics', 'Priority support', 'Unlimited projects', 'API access'],
      priceMonthly: 29.99,
      priceYearly: 299.99,
      currency: 'USD',
      active: true,
    },
    {
      name: 'Enterprise',
      description: 'For large organizations',
      features: ['Everything in Pro', 'Dedicated support', 'Custom integrations', 'SLA guarantee', 'Training sessions'],
      priceMonthly: 99.99,
      priceYearly: 999.99,
      currency: 'USD',
      active: true,
    },
  ];

  for (const plan of plans) {
    const existing = await prisma.subscriptionPlan.findFirst({
      where: { name: plan.name },
    });

    if (!existing) {
      await prisma.subscriptionPlan.create({ data: plan });
      console.log(`Created plan: ${plan.name}`);
    } else {
      console.log(`Plan already exists: ${plan.name}`);
    }
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
