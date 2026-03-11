const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyUser() {
  try {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: 'elitedesire0@gmail.com' },
      include: {
        UserCredentials: true,
        UserInformation: true,
      },
    });

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('\n✅ User Found:');
    console.log('User ID:', user.id);
    console.log('Email:', user.email);
    console.log('\n📋 User Credentials:');
    if (user.UserCredentials && user.UserCredentials.length > 0) {
      user.UserCredentials.forEach((cred) => {
        console.log('  Client ID:', cred.clientId);
        console.log('  Client Secret:', cred.clientSecret);
        console.log('  Credentials User ID:', cred.userId);
      });
    } else {
      console.log('  No credentials found');
    }

    console.log('\n👤 User Information:');
    if (user.UserInformation && user.UserInformation.length > 0) {
      user.UserInformation.forEach((info) => {
        console.log('  Info ID:', info.id);
        console.log('  Info User ID:', info.userId);
        console.log('  Name:', info.firstName, info.lastName);
      });
    } else {
      console.log('  No user information found');
    }

    console.log('\n🔍 Summary:');
    console.log('The correct user ID to use in Grafana is:', user.id);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyUser();
