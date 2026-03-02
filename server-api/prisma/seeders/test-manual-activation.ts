import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testManualActivation() {
  console.log('🧪 Testing Manual Subscription Activation\n');

  // Find a test user (or create one)
  let testUser = await prisma.user.findFirst({
    where: { email: 'test@carbonoz.com' }
  });

  if (!testUser) {
    console.log('Creating test user...');
    testUser = await prisma.user.create({
      data: {
        email: 'test@carbonoz.com',
        password: 'hashed_password_here',
        role: 'USER',
        activeStatus: true,
      }
    });
    console.log('✅ Test user created:', testUser.email);
  } else {
    console.log('✅ Test user found:', testUser.email);
  }

  // Check current subscription status
  console.log('\n📊 Current Status:');
  console.log('- manualAccessOverride:', testUser.manualAccessOverride);

  const subscription = await prisma.subscription.findFirst({
    where: { userId: testUser.id },
    orderBy: { createdAt: 'desc' },
    include: { plan: true }
  });

  if (subscription) {
    console.log('- Subscription:', subscription.status);
    console.log('- Plan:', subscription.plan.name);
    console.log('- End Date:', subscription.endDate);
  } else {
    console.log('- Subscription: None');
  }

  // Test manual activation
  console.log('\n🔧 Activating manual access override...');
  await prisma.user.update({
    where: { id: testUser.id },
    data: { manualAccessOverride: true }
  });

  const updatedUser = await prisma.user.findUnique({
    where: { id: testUser.id }
  });

  console.log('✅ Manual access activated:', updatedUser?.manualAccessOverride);

  console.log('\n📝 Test User Details:');
  console.log('- User ID:', testUser.id);
  console.log('- Email:', testUser.email);
  console.log('- Has Access:', updatedUser?.manualAccessOverride || (subscription?.status === 'ACTIVE' && subscription?.endDate > new Date()));

  console.log('\n✅ Test completed!');
  console.log('\nYou can now:');
  console.log('1. Login with this user');
  console.log('2. Access protected endpoints');
  console.log('3. Test subscription features');
}

testManualActivation()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
