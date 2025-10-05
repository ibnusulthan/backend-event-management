// prisma/seed.ts
import { PrismaClient, UserRole, DiscountType, TransactionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Clear existing data dengan urutan yang benar (mengikuti foreign key constraints)
  await prisma.transactionPayment.deleteMany();
  await prisma.transactionItem.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.eventAttendee.deleteMany();
  await prisma.review.deleteMany();
  await prisma.userCoupon.deleteMany();
  await prisma.couponTemplate.deleteMany();
  await prisma.eventVoucher.deleteMany();
  await prisma.eventTicketType.deleteMany();
  await prisma.event.deleteMany();
  await prisma.userPoint.deleteMany();
  await prisma.pointHistory.deleteMany();
  await prisma.referral.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.user.deleteMany();
  await prisma.systemSettings.deleteMany();
  await prisma.auditLog.deleteMany();

  console.log('✅ Database cleared');

  // Create users
  const hashedPassword = await bcrypt.hash('password123', 10);

  const users = await prisma.user.createMany({
    data: [
      {
        email: 'organizer1@example.com',
        password: hashedPassword,
        fullName: 'Budi Santoso',
        role: UserRole.ORGANIZER,
        profilePicture: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
        phoneNumber: '+6281234567890',
        referralCode: 'BUDI123',
        isVerified: true,
        latestPoint: 0,
        isActive: true,
      },
      {
        email: 'organizer2@example.com',
        password: hashedPassword,
        fullName: 'Sari Wijaya',
        role: UserRole.ORGANIZER,
        profilePicture: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face',
        phoneNumber: '+6281234567891',
        referralCode: 'SARI456',
        isVerified: true,
        latestPoint: 0,
        isActive: true,
      },
      {
        email: 'customer1@example.com',
        password: hashedPassword,
        fullName: 'Rina Melati',
        role: UserRole.CUSTOMER,
        profilePicture: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face',
        phoneNumber: '+6281234567892',
        referralCode: 'RINA789',
        isVerified: true,
        latestPoint: 5000,
        isActive: true,
      },
      {
        email: 'customer2@example.com',
        password: hashedPassword,
        fullName: 'Ahmad Fauzi',
        role: UserRole.CUSTOMER,
        profilePicture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
        phoneNumber: '+6281234567893',
        referralCode: 'AHMAD012',
        isVerified: true,
        latestPoint: 3000,
        isActive: true,
      },
      {
        email: 'admin@example.com',
        password: hashedPassword,
        fullName: 'Admin System',
        role: UserRole.ADMIN,
        profilePicture: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face',
        phoneNumber: '+6281234567894',
        referralCode: 'ADMIN345',
        isVerified: true,
        latestPoint: 0,
        isActive: true,
      },
    ],
  });

  console.log('✅ Users created');

  const userRecords = await prisma.user.findMany();
  const organizer1 = userRecords.find(u => u.email === 'organizer1@example.com')!;
  const organizer2 = userRecords.find(u => u.email === 'organizer2@example.com')!;
  const customer1 = userRecords.find(u => u.email === 'customer1@example.com')!;
  const customer2 = userRecords.find(u => u.email === 'customer2@example.com')!;
  const admin = userRecords.find(u => u.email === 'admin@example.com')!;

  // Create events with active dates
  const now = new Date();
  const oneWeekLater = new Date(now);
  oneWeekLater.setDate(now.getDate() + 7);
  
  const twoWeeksLater = new Date(now);
  twoWeeksLater.setDate(now.getDate() + 14);
  
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(now.getMonth() + 1);

  // Event 1 - Music Festival
  const event1 = await prisma.event.create({
    data: {
      organizerId: organizer1.id,
      title: 'Java Jazz Festival 2024',
      description: 'The biggest jazz festival in Southeast Asia featuring international and local artists. Enjoy amazing performances, food stalls, and great atmosphere.',
      category: 'Music',
      location: 'Jakarta International Expo, Kemayoran',
      address: 'JI. Benyamin Suaeb, Kemayoran, Central Jakarta',
      startDate: oneWeekLater,
      endDate: new Date(oneWeekLater.getTime() + 2 * 24 * 60 * 60 * 1000), // 2 days event
      imageUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&h=400&fit=crop',
      imagePublicId: 'event_jazz_festival',
      availableSeats: 5000,
      bookedSeats: 150,
      soldQuantity: 150,
      basePrice: 250000,
      isPublished: true,
      isDeleted: false,
      version: 1,
    },
  });

  // Event 2 - Tech Conference
  const event2 = await prisma.event.create({
    data: {
      organizerId: organizer1.id,
      title: 'Tech Summit Indonesia 2024',
      description: 'Annual technology conference featuring top speakers from Google, Microsoft, Gojek and more. Learn about AI, Blockchain, and Digital Transformation.',
      category: 'Technology',
      location: 'Balai Sidang Jakarta Convention Center',
      address: 'JI. Gatot Subroto, Senayan, South Jakarta',
      startDate: twoWeeksLater,
      endDate: new Date(twoWeeksLater.getTime() + 1 * 24 * 60 * 60 * 1000), // 1 day event
      imageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&h=400&fit=crop',
      imagePublicId: 'event_tech_summit',
      availableSeats: 2000,
      bookedSeats: 75,
      soldQuantity: 75,
      basePrice: 500000,
      isPublished: true,
      isDeleted: false,
      version: 1,
    },
  });

  // Event 3 - Food Festival
  const event3 = await prisma.event.create({
    data: {
      organizerId: organizer2.id,
      title: 'Indonesian Food Festival',
      description: 'Experience the rich culinary heritage of Indonesia. From street food to fine dining, taste authentic dishes from all over the archipelago.',
      category: 'Food & Drink',
      location: 'Lapangan Banteng, Central Jakarta',
      address: 'Lapangan Banteng, Central Jakarta',
      startDate: oneMonthLater,
      endDate: new Date(oneMonthLater.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days event
      imageUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&h=400&fit=crop',
      imagePublicId: 'event_food_festival',
      availableSeats: 3000,
      bookedSeats: 200,
      soldQuantity: 200,
      basePrice: 100000,
      isPublished: true,
      isDeleted: false,
      version: 1,
    },
  });

  // Event 4 - Workshop
  const event4 = await prisma.event.create({
    data: {
      organizerId: organizer2.id,
      title: 'Digital Marketing Masterclass',
      description: 'Learn advanced digital marketing strategies from industry experts. Hands-on workshop with real case studies and certification.',
      category: 'Workshop',
      location: 'CoHive Grand Indonesia',
      address: 'Grand Indonesia Mall, West Jakarta',
      startDate: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      endDate: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), // Same day
      imageUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop',
      imagePublicId: 'event_workshop',
      availableSeats: 100,
      bookedSeats: 25,
      soldQuantity: 25,
      basePrice: 750000,
      isPublished: true,
      isDeleted: false,
      version: 1,
    },
  });

  console.log('✅ Events created');

  // Create ticket types for each event
  // Event 1 - Jazz Festival
  const ticket1_1 = await prisma.eventTicketType.create({
    data: {
      eventId: event1.id,
      name: 'Regular 1-Day Pass',
      price: 250000,
      quantity: 2000,
      soldQuantity: 150,
      availableQuantity: 1850,
      description: 'Access to all stages for one day',
      isDeleted: false,
      version: 1,
    },
  });

  const ticket1_2 = await prisma.eventTicketType.create({
    data: {
      eventId: event1.id,
      name: 'VIP 2-Day Pass',
      price: 750000,
      quantity: 500,
      soldQuantity: 0,
      availableQuantity: 500,
      description: 'VIP access with premium seating and amenities for both days',
      isDeleted: false,
      version: 1,
    },
  });

  // Event 2 - Tech Summit
  const ticket2_1 = await prisma.eventTicketType.create({
    data: {
      eventId: event2.id,
      name: 'General Admission',
      price: 500000,
      quantity: 1500,
      soldQuantity: 75,
      availableQuantity: 1425,
      description: 'Access to all conference sessions',
      isDeleted: false,
      version: 1,
    },
  });

  const ticket2_2 = await prisma.eventTicketType.create({
    data: {
      eventId: event2.id,
      name: 'VIP Pass',
      price: 1500000,
      quantity: 300,
      soldQuantity: 0,
      availableQuantity: 300,
      description: 'VIP access with networking lunch and premium seating',
      isDeleted: false,
      version: 1,
    },
  });

  // Event 3 - Food Festival
  const ticket3_1 = await prisma.eventTicketType.create({
    data: {
      eventId: event3.id,
      name: 'Tasting Pass',
      price: 100000,
      quantity: 2000,
      soldQuantity: 200,
      availableQuantity: 1800,
      description: 'Includes 5 food tasting vouchers',
      isDeleted: false,
      version: 1,
    },
  });

  console.log('✅ Ticket types created');

  // Create vouchers
  const voucher1 = await prisma.eventVoucher.create({
    data: {
      eventId: event1.id,
      code: 'JAZZ20',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 20,
      maxUsage: 50,
      usedCount: 5,
      minPurchaseAmount: 300000,
      startDate: now,
      endDate: new Date(oneWeekLater.getTime() - 24 * 60 * 60 * 1000), // 1 day before event
      description: '20% discount for Jazz Festival',
      isDeleted: false,
      version: 1,
    },
  });

  const voucher2 = await prisma.eventVoucher.create({
    data: {
      eventId: event2.id,
      code: 'TECH100K',
      discountType: DiscountType.FIXED,
      discountValue: 100000,
      maxUsage: 30,
      usedCount: 2,
      minPurchaseAmount: 500000,
      startDate: now,
      endDate: new Date(twoWeeksLater.getTime() - 24 * 60 * 60 * 1000),
      description: 'Rp 100.000 discount for Tech Summit',
      isDeleted: false,
      version: 1,
    },
  });

  console.log('✅ Vouchers created');

  // Create coupon templates
  const couponTemplate1 = await prisma.couponTemplate.create({
    data: {
      name: 'Welcome Coupon',
      description: 'Special discount for new users',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 10,
      minPurchaseAmount: 100000,
      maxDiscountAmount: 50000,
      isActive: true,
    },
  });

  const couponTemplate2 = await prisma.couponTemplate.create({
    data: {
      name: 'Loyalty Coupon',
      description: 'Reward for loyal customers',
      discountType: DiscountType.FIXED,
      discountValue: 75000,
      minPurchaseAmount: 300000,
      isActive: true,
    },
  });

  console.log('✅ Coupon templates created');

  // Create user coupons
  const userCoupon1 = await prisma.userCoupon.create({
    data: {
      userId: customer1.id,
      couponTemplateId: couponTemplate1.id,
      code: 'WELCOME123',
      isUsed: false,
      expiryDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    },
  });

  const userCoupon2 = await prisma.userCoupon.create({
    data: {
      userId: customer2.id,
      couponTemplateId: couponTemplate2.id,
      code: 'LOYALTY456',
      isUsed: false,
      expiryDate: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
    },
  });

  console.log('✅ User coupons created');

  // Create sample transactions
  const transaction1 = await prisma.transaction.create({
    data: {
      userId: customer1.id,
      eventId: event1.id,
      invoiceNumber: `INV-${Date.now()}-001`,
      status: TransactionStatus.DONE,
      totalAmount: 500000,
      pointsUsed: 0,
      voucherId: voucher1.id,
      voucherDiscount: 100000,
      finalAmount: 400000,
      expiryTime: new Date(now.getTime() + 2 * 60 * 60 * 1000), // 2 hours from now
      isDeleted: false,
      version: 1,
    },
  });

  // Add transaction items
  await prisma.transactionItem.create({
    data: {
      transactionId: transaction1.id,
      ticketTypeId: ticket1_1.id,
      quantity: 2,
      pricePerTicket: 250000,
      subtotal: 500000,
    },
  });

  // Create transaction payment
  await prisma.transactionPayment.create({
    data: {
      transactionId: transaction1.id,
      paymentProofUrl: 'https://example.com/payment-proof-1.jpg',
      paymentProofPublicId: 'payment_1',
      paymentMethod: 'Bank Transfer',
      accountNumber: '1234567890',
      accountName: 'Rina Melati',
      paymentDate: new Date(),
    },
  });

  // Create event attendee
  await prisma.eventAttendee.create({
    data: {
      eventId: event1.id,
      userId: customer1.id,
      transactionId: transaction1.id,
      ticketCount: 2,
      totalPaid: 400000,
      attended: false,
      checkinCode: 'CHK' + Math.random().toString(36).substr(2, 8).toUpperCase(),
    },
  });

  // Create review
  await prisma.review.create({
    data: {
      userId: customer1.id,
      eventId: event1.id,
      transactionId: transaction1.id,
      rating: 5,
      comment: 'Amazing festival! Great performances and well organized. Will definitely come again next year!',
      isActive: true,
    },
  });

  // Create user points
  await prisma.userPoint.create({
    data: {
      userId: customer1.id,
      amount: 5000,
      sourceType: 'PURCHASE',
      sourceId: transaction1.id,
      expiryDate: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      isExpired: false,
    },
  });

  // Create point history
  await prisma.pointHistory.create({
    data: {
      userId: customer1.id,
      points: 5000,
      type: 'EARN',
      description: 'Points earned from transaction',
      referenceId: transaction1.id,
    },
  });

  // Create notifications
  await prisma.notification.createMany({
    data: [
      {
        userId: customer1.id,
        type: 'TRANSACTION_UPDATE',
        title: 'Transaction Completed',
        message: 'Your transaction INV-001 has been completed successfully',
        isRead: false,
        relatedId: transaction1.id,
      },
      {
        userId: organizer1.id,
        type: 'EVENT_UPDATE',
        title: 'New Transaction',
        message: 'New transaction received for Java Jazz Festival',
        isRead: false,
        relatedId: transaction1.id,
      },
    ],
  });

  // Create system settings
  await prisma.systemSettings.createMany({
    data: [
      {
        key: 'POINTS_PER_TRANSACTION',
        value: '100',
        description: 'Points earned per 100,000 IDR transaction',
        isActive: true,
      },
      {
        key: 'MAX_VOUCHER_USAGE',
        value: '5',
        description: 'Maximum voucher usage per user per event',
        isActive: true,
      },
      {
        key: 'TRANSACTION_EXPIRY_HOURS',
        value: '2',
        description: 'Transaction expiry time in hours',
        isActive: true,
      },
    ],
  });

  console.log('✅ All data created successfully');

  // Display summary
  console.log('\n🎉 Seed completed successfully!');
  console.log('='.repeat(50));
  console.log('📊 SEED SUMMARY:');
  console.log('='.repeat(50));
  console.log(`👥 Users: ${await prisma.user.count()}`);
  console.log(`📅 Events: ${await prisma.event.count()}`);
  console.log(`🎫 Ticket Types: ${await prisma.eventTicketType.count()}`);
  console.log(`🎁 Vouchers: ${await prisma.eventVoucher.count()}`);
  console.log(`💰 Transactions: ${await prisma.transaction.count()}`);
  console.log(`⭐ Reviews: ${await prisma.review.count()}`);
  console.log(`🏷️  Coupons: ${await prisma.userCoupon.count()}`);
  console.log('='.repeat(50));
  console.log('\n📧 Test Accounts:');
  console.log('   Organizer 1: organizer1@example.com / password123');
  console.log('   Organizer 2: organizer2@example.com / password123');
  console.log('   Customer 1:  customer1@example.com / password123');
  console.log('   Customer 2:  customer2@example.com / password123');
  console.log('   Admin:       admin@example.com / password123');
  console.log('\n🎟️  Active Vouchers:');
  console.log('   JAZZ20 - 20% off Jazz Festival (min purchase 300k)');
  console.log('   TECH100K - Rp 100.000 off Tech Summit (min purchase 500k)');
  console.log('\n🏷️  Active Coupons:');
  console.log('   WELCOME123 - 10% off (customer1)');
  console.log('   LOYALTY456 - Rp 75.000 off (customer2)');
  console.log('\n📍 Next Steps:');
  console.log('   1. Run: npm run dev');
  console.log('   2. Test with Postman collection');
  console.log('   3. Check database in Railway');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });