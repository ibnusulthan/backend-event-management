import { Prisma, TransactionStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { generateInvoiceNumber, calculateDiscount, addHours } from '../utils/helpers';
import { TransactionCreateRequest } from '../types';
import { uploadToCloudinary } from '../utils/cloudinary';
import { sendTransactionCreatedEmail, sendTransactionConfirmedEmail } from '../utils/email';

// Helper untuk retry mechanism
const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      if (error.code === 'P2034' && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
};

export class TransactionService {
  // ================== CREATE TRANSACTION ==================
  async createTransaction(userId: string, transactionData: TransactionCreateRequest) {
    const { eventId, ticketTypes, pointsUsed = 0, voucherCode, couponCode } = transactionData;

    return await withRetry(async () => {
      return await prisma.$transaction(async (tx) => {
        // Get event dengan optimistic locking
        const event = await tx.event.findFirst({
          where: { 
            id: eventId, 
            isPublished: true,
            isDeleted: false 
          },
          include: { 
            ticketTypes: {
              where: {
                isDeleted: false
              },
              select: {
                id: true,
                name: true,
                price: true,
                quantity: true,
                soldQuantity: true,
                availableQuantity: true,
                version: true
              }
            } 
          }
        });
        
        if (!event) throw new Error('Event not found or not published');

        // Validate tickets & calculate total
        let totalAmount = 0;
        const ticketUpdates: { 
          id: string; 
          quantity: number; 
          availableQuantity: number;
          version: number;
        }[] = [];
        
        for (const item of ticketTypes) {
          const ticketType = event.ticketTypes.find((t) => t.id === item.ticketTypeId);
          if (!ticketType) throw new Error(`Ticket type ${item.ticketTypeId} not found`);
          
          if (ticketType.availableQuantity < item.quantity) {
            throw new Error(`Not enough tickets available for ${ticketType.name}. Available: ${ticketType.availableQuantity}, Requested: ${item.quantity}`);
          }

          totalAmount += item.quantity * ticketType.price;
          ticketUpdates.push({ 
            id: ticketType.id, 
            quantity: item.quantity,
            availableQuantity: ticketType.availableQuantity,
            version: ticketType.version
          });
        }

        // Points deduction
        let pointsDiscount = 0;
        let pointsDeducted = 0;
        
        if (pointsUsed > 0) {
          pointsDeducted = await this.deductPointsWithLock(tx, userId, pointsUsed);
          pointsDiscount = Math.min(pointsDeducted, totalAmount);
        }

        // Voucher validation
        let voucherDiscount = 0;
        let appliedVoucher = null;
        
        if (voucherCode) {
          appliedVoucher = await this.validateAndUseVoucherWithLock(tx, voucherCode, eventId, userId);
          
          if (totalAmount < (appliedVoucher.minPurchaseAmount || 0)) {
            throw new Error(`Minimum purchase for voucher is ${appliedVoucher.minPurchaseAmount}`);
          }

          voucherDiscount = calculateDiscount(totalAmount, appliedVoucher.discountType, appliedVoucher.discountValue);
        }

        // Coupon validation
        let couponDiscount = 0;
        let appliedCoupon = null;
        
        if (couponCode) {
          appliedCoupon = await this.validateAndUseCouponWithLock(tx, couponCode, userId);
          const template = appliedCoupon.couponTemplate;

          if (totalAmount < template.minPurchaseAmount) {
            throw new Error(`Minimum purchase for coupon is ${template.minPurchaseAmount}`);
          }

          const maxDiscountSafe = template.maxDiscountAmount ?? undefined;
          couponDiscount = calculateDiscount(
            totalAmount,
            template.discountType,
            template.discountValue,
            maxDiscountSafe
          );
        }

        // Final amount calculation
        const finalAmount = this.calculateFinalAmountSafely(
          totalAmount, 
          pointsDiscount, 
          voucherDiscount, 
          couponDiscount
        );

        // Create transaction
        const transaction = await tx.transaction.create({
          data: {
            userId,
            eventId,
            invoiceNumber: generateInvoiceNumber(),
            totalAmount,
            pointsUsed: pointsDiscount,
            voucherId: appliedVoucher?.id ?? null,
            voucherDiscount,
            couponId: appliedCoupon?.id ?? null,
            couponDiscount,
            finalAmount,
            expiryTime: addHours(new Date(), 2),
            status: 'WAITING_FOR_PAYMENT' as TransactionStatus,
            items: {
              create: ticketTypes.map((item) => {
                const ticketType = event.ticketTypes.find((t) => t.id === item.ticketTypeId)!;
                return {
                  ticketTypeId: item.ticketTypeId,
                  quantity: item.quantity,
                  pricePerTicket: ticketType.price,
                  subtotal: item.quantity * ticketType.price,
                };
              }),
            },
          },
          include: {
            items: true,
            event: { 
              select: { 
                title: true, 
                organizer: { 
                  select: { 
                    fullName: true 
                  } 
                } 
              } 
            },
            user: { select: { email: true, fullName: true } },
          },
        });

        // Update tickets available quantity dengan optimistic locking
        for (const update of ticketUpdates) {
          const result = await tx.eventTicketType.updateMany({ 
            where: { 
              id: update.id,
              version: update.version
            }, 
            data: { 
              soldQuantity: { increment: update.quantity },
              availableQuantity: { decrement: update.quantity },
              version: { increment: 1 }
            } 
          });

          if (result.count === 0) {
            throw new Error('Ticket update conflict - please try again');
          }
        }

        // Update event booked seats dengan optimistic locking
        const totalTickets = ticketTypes.reduce((sum, item) => sum + item.quantity, 0);
        const eventResult = await tx.event.updateMany({ 
          where: { 
            id: eventId,
            version: event.version || 1
          }, 
          data: { 
            bookedSeats: { increment: totalTickets },
            availableSeats: { decrement: totalTickets },
            soldQuantity: { increment: totalTickets },
            version: { increment: 1 }
          } 
        });

        if (eventResult.count === 0) {
          throw new Error('Event update conflict - please try again');
        }

        // Mark coupon as used
        if (appliedCoupon) {
          await tx.userCoupon.update({ 
            where: { id: appliedCoupon.id }, 
            data: { isUsed: true } 
          });
        }

        // Email dengan retry mechanism (non-blocking)
        this.sendTransactionEmailWithRetry(
          transaction.user.email, 
          'TRANSACTION_CREATED', 
          transaction,
          3
        ).catch(error => {
          console.error('Failed to send transaction email after retries:', error);
        });

        console.log(`✅ Transaction created: ${transaction.invoiceNumber} for user ${userId}`);
        return transaction;
      });
    });
  }

  // ================== DEDUCT POINTS WITH LOCKING ==================
  private async deductPointsWithLock(prisma: Prisma.TransactionClient, userId: string, amount: number): Promise<number> {
    if (amount <= 0) return 0;

    // Get user points dengan optimistic locking
    const userPoints = await prisma.userPoint.findMany({
      where: { 
        userId, 
        isExpired: false, 
        expiryDate: { gte: new Date() },
        amount: { gt: 0 }
      },
      orderBy: { expiryDate: 'asc' }
    });

    const totalAvailablePoints = userPoints.reduce((sum, point) => sum + point.amount, 0);
    
    if (amount > totalAvailablePoints) {
      throw new Error(`Insufficient points. Available: ${totalAvailablePoints}, Requested: ${amount}`);
    }

    let remainingAmount = amount;

    // Deduct from oldest points first (FIFO)
    for (const point of userPoints) {
      if (remainingAmount <= 0) break;
      
      const deductAmount = Math.min(remainingAmount, point.amount);
      const newAmount = point.amount - deductAmount;
      
      await prisma.userPoint.update({ 
        where: { id: point.id }, 
        data: { amount: newAmount } 
      });
      
      remainingAmount -= deductAmount;
    }

    // Update user's latest point balance
    await prisma.user.update({
      where: { id: userId },
      data: {
        latestPoint: { decrement: amount }
      }
    });

    // Create point history record
    await prisma.pointHistory.create({
      data: {
        userId,
        points: -amount,
        type: 'REDEEM',
        description: `Points redeemed for transaction`,
        referenceId: `deduct_${Date.now()}`
      }
    });

    console.log(`✅ Deducted ${amount} points from user ${userId}`);
    return amount;
  }

  // ================== VALIDATE AND USE VOUCHER WITH LOCKING ==================
  private async validateAndUseVoucherWithLock(
    prisma: Prisma.TransactionClient, 
    voucherCode: string, 
    eventId: string, 
    userId: string
  ) {
    // Get voucher dengan optimistic locking
    const voucher = await prisma.eventVoucher.findFirst({
      where: { 
        code: voucherCode.toUpperCase(), 
        eventId, 
        startDate: { lte: new Date() }, 
        endDate: { gte: new Date() },
        isDeleted: false
      }
    });
    
    if (!voucher) throw new Error('Invalid or expired voucher');
    
    // Check usage count
    if (voucher.usedCount >= voucher.maxUsage) {
      throw new Error('Voucher usage limit reached');
    }

    // Check if user already used this voucher
    const existingUsage = await prisma.transaction.findFirst({
      where: {
        userId,
        voucherId: voucher.id,
        status: { in: ['WAITING_FOR_PAYMENT', 'WAITING_FOR_CONFIRMATION', 'DONE', 'SUCCESS'] as TransactionStatus[] }
      }
    });

    if (existingUsage) {
      throw new Error('You have already used this voucher');
    }

    // Increment used count dengan optimistic locking
    const result = await prisma.eventVoucher.updateMany({
      where: { 
        id: voucher.id,
        version: voucher.version || 1,
        usedCount: { lt: voucher.maxUsage }
      },
      data: { 
        usedCount: { increment: 1 },
        version: { increment: 1 }
      }
    });

    if (result.count === 0) {
      throw new Error('Voucher usage conflict - please try again');
    }

    console.log(`✅ Voucher ${voucherCode} applied for user ${userId}`);
    return { ...voucher, version: (voucher.version || 1) + 1 };
  }

  // ================== VALIDATE AND USE COUPON WITH LOCKING ==================
  private async validateAndUseCouponWithLock(
    prisma: Prisma.TransactionClient, 
    couponCode: string, 
    userId: string
  ) {
    // Get coupon
    const coupon = await prisma.userCoupon.findFirst({
      where: { 
        code: couponCode, 
        userId, 
        isUsed: false, 
        expiryDate: { gte: new Date() } 
      },
      include: { couponTemplate: true }
    });
    
    if (!coupon) throw new Error('Invalid or expired coupon');
    
    console.log(`✅ Coupon ${couponCode} applied for user ${userId}`);
    return coupon;
  }

  // ================== CALCULATE FINAL AMOUNT SAFELY ==================
  private calculateFinalAmountSafely(
    totalAmount: number, 
    pointsDiscount: number, 
    voucherDiscount: number, 
    couponDiscount: number
  ): number {
    const totalDiscount = pointsDiscount + voucherDiscount + couponDiscount;
    
    if (totalDiscount > totalAmount) {
      throw new Error(`Total discount cannot exceed total amount. Total: ${totalAmount}, Discount: ${totalDiscount}`);
    }

    const finalAmount = totalAmount - totalDiscount;
    
    if (finalAmount < 0) {
      throw new Error('Final amount calculation error: negative value');
    }

    return Math.max(0, finalAmount);
  }

  // ================== CONFIRM TRANSACTION ==================
  async confirmTransaction(transactionId: string, organizerId: string, isAccepted: boolean) {
    return await withRetry(async () => {
      return await prisma.$transaction(async (tx) => {
        // Get transaction dengan optimistic locking
        const transaction = await tx.transaction.findFirst({
          where: { 
            id: transactionId, 
            event: { organizerId }, 
            status: 'WAITING_FOR_CONFIRMATION' as TransactionStatus
          },
          include: { 
            event: true, 
            user: { select: { email: true, fullName: true } },
            items: true
          }
        });
        
        if (!transaction) throw new Error('Transaction not found or invalid status');

        const newStatus = isAccepted ? 'DONE' as TransactionStatus : 'REJECTED' as TransactionStatus;

        if (isAccepted) {
          const totalTickets = transaction.items.reduce((sum, item) => sum + item.quantity, 0);

          await tx.eventAttendee.create({
            data: {
              eventId: transaction.eventId,
              userId: transaction.userId,
              transactionId,
              ticketCount: totalTickets,
              totalPaid: transaction.finalAmount,
              checkinCode: this.generateCheckinCode()
            },
          });

          // Award points untuk transaksi sukses
          await this.awardLoyaltyPoints(tx, transaction.userId, transaction.finalAmount);

          console.log(`✅ Transaction ${transactionId} confirmed successfully`);

        } else {
          await this.rollbackTransaction(tx, transactionId);
          console.log(`❌ Transaction ${transactionId} rejected`);
        }

        const updatedTransaction = await tx.transaction.update({ 
          where: { id: transactionId }, 
          data: { 
            status: newStatus,
            failureReason: isAccepted ? null : 'Payment rejected by organizer'
          },
          include: {
            event: { select: { title: true } },
            user: { select: { email: true, fullName: true } }
          }
        });

        // Email dengan retry mechanism
        this.sendTransactionEmailWithRetry(
          updatedTransaction.user.email, 
          'TRANSACTION_CONFIRMED', 
          { ...updatedTransaction, isAccepted },
          3
        ).catch(error => {
          console.error('Failed to send confirmation email after retries:', error);
        });

        return updatedTransaction;
      });
    });
  }

  // ================== ROLLBACK TRANSACTION ==================
  private async rollbackTransaction(prisma: Prisma.TransactionClient, transactionId: string) {
    // Get transaction
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { 
        items: true, 
        voucher: true, 
        coupon: true 
      }
    });
    
    if (!transaction) {
      console.log(`ℹ️ Transaction ${transactionId} not found for rollback`);
      return;
    }

    console.log(`🔄 Rolling back transaction ${transactionId}`);

    // Restore ticket quantities
    for (const item of transaction.items) {
      await prisma.eventTicketType.update({ 
        where: { id: item.ticketTypeId }, 
        data: { 
          soldQuantity: { decrement: item.quantity },
          availableQuantity: { increment: item.quantity }
        } 
      });
    }

    // Restore event seats
    const totalTickets = transaction.items.reduce((sum, item) => sum + item.quantity, 0);
    await prisma.event.update({ 
      where: { id: transaction.eventId }, 
      data: { 
        bookedSeats: { decrement: totalTickets },
        availableSeats: { increment: totalTickets },
        soldQuantity: { decrement: totalTickets }
      } 
    });

    // Restore voucher usage
    if (transaction.voucherId) {
      await prisma.eventVoucher.update({ 
        where: { id: transaction.voucherId }, 
        data: { usedCount: { decrement: 1 } } 
      });
    }

    // Restore coupon
    if (transaction.couponId) {
      await prisma.userCoupon.update({ 
        where: { id: transaction.couponId }, 
        data: { isUsed: false } 
      });
    }

    // Restore points
    if (transaction.pointsUsed > 0) {
      await this.restorePointsWithLock(prisma, transaction.userId, transaction.pointsUsed);
    }

    console.log(`✅ Successfully rolled back transaction ${transactionId}`);
  }

  // ================== RESTORE POINTS WITH LOCKING ==================
  private async restorePointsWithLock(prisma: Prisma.TransactionClient, userId: string, amount: number) {
    if (amount <= 0) return;

    // Create new point record untuk restore
    await prisma.userPoint.create({ 
      data: { 
        userId, 
        amount, 
        sourceType: 'REFUND', 
        expiryDate: this.addMonths(new Date(), 3) 
      } 
    });

    // Update user's latest point balance
    await prisma.user.update({
      where: { id: userId },
      data: {
        latestPoint: { increment: amount }
      }
    });

    // Create point history record
    await prisma.pointHistory.create({
      data: {
        userId,
        points: amount,
        type: 'RESTORE',
        description: `Points restored from cancelled transaction`,
        referenceId: `restore_${Date.now()}`
      }
    });

    console.log(`✅ Restored ${amount} points to user ${userId}`);
  }

  // ================== AWARD LOYALTY POINTS ==================
  private async awardLoyaltyPoints(prisma: Prisma.TransactionClient, userId: string, amount: number) {
    const pointsEarned = Math.floor(amount / 10000);
    
    if (pointsEarned > 0) {
      await prisma.userPoint.create({
        data: {
          userId,
          amount: pointsEarned,
          sourceType: 'PURCHASE',
          expiryDate: this.addMonths(new Date(), 12)
        }
      });

      // Update user's latest point balance
      await prisma.user.update({
        where: { id: userId },
        data: {
          latestPoint: { increment: pointsEarned }
        }
      });

      await prisma.pointHistory.create({
        data: {
          userId,
          points: pointsEarned,
          type: 'EARN',
          description: `Points earned from transaction`,
          referenceId: `earn_${Date.now()}`
        }
      });

      console.log(`✅ Awarded ${pointsEarned} loyalty points to user ${userId}`);
    }
  }

  // ================== UPLOAD PAYMENT PROOF ==================
  async uploadPaymentProof(transactionId: string, userId: string, file: Express.Multer.File) {
    return await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: {
          id: transactionId,
          userId,
          status: 'WAITING_FOR_PAYMENT' as TransactionStatus,
        }
      });

      if (!transaction) {
        throw new Error('Transaction not found or invalid status');
      }

      // Cek expiry
      if (new Date() > transaction.expiryTime) {
        await this.expireTransaction(tx, transactionId);
        throw new Error('Transaction has expired');
      }

      // Upload ke Cloudinary
      const uploadResult = await uploadToCloudinary(file);
      const paymentProofUrl = uploadResult.secure_url;

      const payment = await tx.transactionPayment.upsert({
        where: { transactionId },
        update: {
          paymentProofUrl,
          paymentProofPublicId: uploadResult.public_id,
          updatedAt: new Date(),
        },
        create: {
          transactionId,
          paymentProofUrl,
          paymentProofPublicId: uploadResult.public_id,
        },
      });

      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'WAITING_FOR_CONFIRMATION' as TransactionStatus,
        },
      });

      console.log(`✅ Payment proof uploaded for transaction ${transactionId}`);
      return payment;
    });
  }

  // ================== EXPIRE TRANSACTION ==================
  private async expireTransaction(prisma: Prisma.TransactionClient, transactionId: string) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        items: true,
        voucher: true,
        coupon: true,
      }
    });

    if (!transaction || transaction.status !== 'WAITING_FOR_PAYMENT') {
      return;
    }

    console.log(`🕒 Expiring transaction ${transactionId}`);

    // Update status to expired
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { 
        status: 'EXPIRED' as TransactionStatus,
        failureReason: 'Transaction expired automatically'
      },
    });

    // Rollback the transaction
    await this.rollbackTransaction(prisma, transactionId);
  }

  // ================== EMAIL WITH RETRY MECHANISM ==================
  private async sendTransactionEmailWithRetry(
    email: string, 
    type: string, 
    transaction: any, 
    maxRetries: number = 3
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (type === 'TRANSACTION_CREATED') {
          await sendTransactionCreatedEmail(email, transaction);
        } else if (type === 'TRANSACTION_CONFIRMED') {
          const isAccepted = transaction.isAccepted !== false;
          await sendTransactionConfirmedEmail(email, transaction, isAccepted);
        }
        
        console.log(`✅ Email sent successfully to ${email} (attempt ${attempt})`);
        return;
        
      } catch (emailError: any) {
        console.error(`❌ Email attempt ${attempt} failed for ${email}:`, emailError);
        
        if (attempt === maxRetries) {
          await this.logEmailFailure(email, type, transaction.id, emailError);
          break;
        }
        
        await new Promise(resolve => 
          setTimeout(resolve, 1000 * Math.pow(2, attempt))
        );
      }
    }
  }

  private async logEmailFailure(email: string, type: string, transactionId: string, error: any) {
    console.error('EMAIL_FAILURE:', {
      email,
      type,
      transactionId,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }

  // ================== GENERATE CHECKIN CODE ==================
  private generateCheckinCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // ================== ADD MONTHS HELPER ==================
  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }

  // ================== GET USER TRANSACTIONS ==================
  async getUserTransactions(userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { 
          userId,
          isDeleted: false 
        },
        include: {
          event: { 
            select: { 
              id: true,
              title: true, 
              imageUrl: true, 
              startDate: true, 
              location: true,
              category: true
            } 
          },
          payment: true,
          items: { 
            include: { 
              ticketType: { 
                select: { 
                  name: true,
                  price: true
                } 
              } 
            } 
          },
          voucher: {
            select: {
              code: true,
              discountType: true,
              discountValue: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ 
        where: { 
          userId,
          isDeleted: false 
        } 
      }),
    ]);

    return { 
      transactions, 
      pagination: { 
        page, 
        limit, 
        total, 
        totalPages: Math.ceil(total / limit) 
      } 
    };
  }

  // ================== GET EVENT TRANSACTIONS ==================
  async getEventTransactions(eventId: string, organizerId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { 
          eventId, 
          event: { 
            organizerId,
            isDeleted: false 
          },
          isDeleted: false
        },
        include: {
          user: { 
            select: { 
              id: true, 
              fullName: true, 
              profilePicture: true
            } 
          },
          payment: true,
          items: { 
            include: { 
              ticketType: { 
                select: { 
                  name: true,
                  price: true
                } 
              } 
            } 
          },
          voucher: {
            select: {
              code: true,
              discountType: true,
              discountValue: true
            }
          },
          attendee: {
            select: {
              attended: true,
              attendedAt: true,
              checkinCode: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ 
        where: { 
          eventId, 
          event: { 
            organizerId,
            isDeleted: false 
          },
          isDeleted: false
        } 
      }),
    ]);

    return { 
      transactions, 
      pagination: { 
        page, 
        limit, 
        total, 
        totalPages: Math.ceil(total / limit) 
      } 
    };
  }

  // ================== GET TRANSACTION BY ID ==================
  async getTransactionById(transactionId: string, userId?: string) {
    const where: any = { 
      id: transactionId,
      isDeleted: false 
    };

    if (userId) {
      where.userId = userId;
    }

    const transaction = await prisma.transaction.findFirst({
      where,
      include: {
        event: {
          select: {
            id: true,
            title: true,
            imageUrl: true,
            startDate: true,
            location: true,
            organizer: {
              select: {
                id: true,
                fullName: true,
                profilePicture: true
              }
            }
          }
        },
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            profilePicture: true
          }
        },
        payment: true,
        items: {
          include: {
            ticketType: {
              select: {
                id: true,
                name: true,
                price: true,
                description: true
              }
            }
          }
        },
        voucher: {
          select: {
            code: true,
            discountType: true,
            discountValue: true
          }
        },
        coupon: {
          include: {
            couponTemplate: {
              select: {
                name: true,
                discountType: true,
                discountValue: true
              }
            }
          }
        },
        attendee: {
          select: {
            attended: true,
            attendedAt: true,
            checkinCode: true,
            ticketCount: true
          }
        }
      }
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    return transaction;
  }

  // ================== CANCEL TRANSACTION ==================
  async cancelTransaction(transactionId: string, userId: string) {
    return await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: {
          id: transactionId,
          userId,
          status: { in: ['WAITING_FOR_PAYMENT', 'WAITING_FOR_CONFIRMATION'] as TransactionStatus[] }
        },
        include: {
          items: true,
          voucher: true,
          coupon: true
        }
      });

      if (!transaction) {
        throw new Error('Transaction not found or cannot be cancelled');
      }

      const updatedTransaction = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'CANCELED' as TransactionStatus,
          failureReason: 'Cancelled by user'
        }
      });

      await this.rollbackTransaction(tx, transactionId);

      console.log(`✅ Transaction ${transactionId} cancelled by user ${userId}`);
      return updatedTransaction;
    });
  }
}