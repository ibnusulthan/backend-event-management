import { PrismaClient, TransactionStatus } from '@prisma/client';
import cron from 'node-cron';

const prisma = new PrismaClient();

export class TransactionExpiryService {
  private isRunning: boolean = false;

  start() {
    if (this.isRunning) {
      console.log('Transaction expiry service is already running');
      return;
    }

    // Run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        console.log('🕒 Running transaction expiry job...');
        await this.expirePendingTransactions();
        console.log('✅ Transaction expiry job completed');
      } catch (error) {
        console.error('❌ Transaction expiry job failed:', error);
      }
    });

    this.isRunning = true;
    console.log('✅ Transaction expiry service started');
  }

  stop() {
    this.isRunning = false;
    console.log('🛑 Transaction expiry service stopped');
  }

  private async expirePendingTransactions() {
    const expiredTransactions = await prisma.transaction.findMany({
      where: {
        status: 'PENDING' as TransactionStatus,
        expiryTime: { lt: new Date() },
        isDeleted: false
      },
      include: {
        voucher: true,
        items: {
          include: {
            ticketType: true
          }
        },
        coupon: true,
        user: {
          select: {
            id: true,
            latestPoint: true
          }
        }
      }
    });

    console.log(`📊 Found ${expiredTransactions.length} expired transactions to process`);

    for (const transaction of expiredTransactions) {
      try {
        await this.processExpiredTransaction(transaction);
      } catch (error) {
        console.error(`❌ Failed to process expired transaction ${transaction.id}:`, error);
      }
    }
  }

  private async processExpiredTransaction(transaction: any) {
    return await prisma.$transaction(async (tx) => {
      // Double check transaction status dengan optimistic locking
      const lockedTransaction = await tx.transaction.findUnique({
        where: { 
          id: transaction.id,
          status: 'PENDING' as TransactionStatus
        }
      });

      if (!lockedTransaction) {
        console.log(`ℹ️ Transaction ${transaction.id} already processed, skipping`);
        return;
      }

      // Update transaction status
      await tx.transaction.update({
        where: { 
          id: transaction.id,
          version: transaction.version || 1
        },
        data: { 
          status: 'EXPIRED' as TransactionStatus,
          failureReason: 'Transaction expired automatically',
          version: { increment: 1 }
        }
      });

      // Restore event and ticket quantities
      if (transaction.items && transaction.items.length > 0) {
        const totalTickets = transaction.items.reduce((sum: number, item: any) => sum + item.quantity, 0);
        
        console.log(`🔄 Restoring ${totalTickets} seats for event ${transaction.eventId}`);

        // Restore event seats dengan optimistic locking
        const eventResult = await tx.event.updateMany({
          where: { 
            id: transaction.eventId,
            version: transaction.event?.version || 1
          },
          data: {
            soldQuantity: { decrement: totalTickets },
            availableSeats: { increment: totalTickets },
            bookedSeats: { decrement: totalTickets },
            version: { increment: 1 }
          }
        });

        if (eventResult.count === 0) {
          console.warn(`⚠️ Event update conflict for ${transaction.eventId}`);
        }

        // Restore individual ticket type quantities
        for (const item of transaction.items) {
          console.log(`🔄 Restoring ${item.quantity} tickets for ${item.ticketType.name}`);
          
          const ticketResult = await tx.eventTicketType.updateMany({
            where: { 
              id: item.ticketTypeId,
              version: item.ticketType.version || 1
            },
            data: {
              soldQuantity: { decrement: item.quantity },
              availableQuantity: { increment: item.quantity },
              version: { increment: 1 }
            }
          });

          if (ticketResult.count === 0) {
            console.warn(`⚠️ Ticket type update conflict for ${item.ticketTypeId}`);
          }
        }
      }

      // Restore points jika digunakan
      if (transaction.pointsUsed > 0) {
        console.log(`🔄 Restoring ${transaction.pointsUsed} points for user ${transaction.userId}`);
        
        await this.restorePoints(tx, transaction.userId, transaction.pointsUsed);
      }

      // Restore voucher usage count
      if (transaction.voucherId) {
        console.log(`🔄 Restoring voucher usage count for voucher ${transaction.voucherId}`);
        
        const voucherResult = await tx.eventVoucher.updateMany({
          where: { 
            id: transaction.voucherId,
            version: transaction.voucher?.version || 1
          },
          data: { 
            usedCount: { decrement: 1 },
            version: { increment: 1 }
          }
        });

        if (voucherResult.count === 0) {
          console.warn(`⚠️ Voucher update conflict for ${transaction.voucherId}`);
        }
      }

      // Restore coupon jika digunakan
      if (transaction.couponId) {
        console.log(`🔄 Restoring coupon ${transaction.couponId}`);
        
        await tx.userCoupon.update({
          where: { id: transaction.couponId },
          data: { isUsed: false }
        });
      }

      console.log(`✅ Successfully expired transaction: ${transaction.id}`);
    });
  }

  private async restorePoints(prisma: any, userId: string, amount: number) {
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
        description: `Points restored from expired transaction`,
        referenceId: `restore_expired_${Date.now()}`
      }
    });
  }

  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }

  // Manual expire transaction untuk testing atau admin purposes
  async manuallyExpireTransaction(transactionId: string): Promise<boolean> {
    try {
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
        include: {
          voucher: true,
          items: {
            include: {
              ticketType: true
            }
          },
          coupon: true,
          event: {
            select: {
              version: true
            }
          }
        }
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== 'PENDING') {
        throw new Error(`Transaction status is ${transaction.status}, cannot expire`);
      }

      await this.processExpiredTransaction(transaction);
      return true;
    } catch (error) {
      console.error(`❌ Failed to manually expire transaction ${transactionId}:`, error);
      return false;
    }
  }

  // Get expiry statistics
  async getExpiryStats(): Promise<{
    pendingCount: number;
    expiredCount: number;
    nextExpiry: Date | null;
  }> {
    const now = new Date();
    
    const [pendingCount, expiredCount, nextExpiry] = await Promise.all([
      prisma.transaction.count({
        where: {
          status: 'PENDING' as TransactionStatus,
          expiryTime: { gt: now },
          isDeleted: false
        }
      }),
      
      prisma.transaction.count({
        where: {
          status: 'EXPIRED' as TransactionStatus,
          updatedAt: { 
            gte: new Date(now.getTime() - 24 * 60 * 60 * 1000)
          },
          isDeleted: false
        }
      }),
      
      prisma.transaction.findFirst({
        where: {
          status: 'PENDING' as TransactionStatus,
          expiryTime: { gt: now },
          isDeleted: false
        },
        select: {
          expiryTime: true
        },
        orderBy: {
          expiryTime: 'asc'
        }
      })
    ]);

    return {
      pendingCount,
      expiredCount,
      nextExpiry: nextExpiry?.expiryTime || null
    };
  }

  // Clean up old expired transactions (housekeeping)
  async cleanupOldExpiredTransactions(daysOld: number = 30): Promise<{ deletedCount: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    try {
      const result = await prisma.transaction.updateMany({
        where: {
          status: 'EXPIRED' as TransactionStatus,
          updatedAt: { lt: cutoffDate },
          isDeleted: false
        },
        data: {
          isDeleted: true,
          deletedAt: new Date()
        }
      });

      console.log(`🧹 Cleaned up ${result.count} expired transactions older than ${daysOld} days`);
      
      return { deletedCount: result.count };
    } catch (error) {
      console.error('❌ Failed to cleanup old expired transactions:', error);
      return { deletedCount: 0 };
    }
  }

  // Check for transactions that are about to expire (for notifications)
  async getTransactionsExpiringSoon(minutes: number = 30): Promise<any[]> {
    const expiryThreshold = new Date();
    expiryThreshold.setMinutes(expiryThreshold.getMinutes() + minutes);

    return await prisma.transaction.findMany({
      where: {
        status: 'PENDING' as TransactionStatus,
        expiryTime: { 
          lte: expiryThreshold,
          gt: new Date()
        },
        isDeleted: false,
        expiryWarningSent: false
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        },
        event: {
          select: {
            title: true,
            startDate: true
          }
        },
        items: {
          include: {
            ticketType: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        expiryTime: 'asc'
      }
    });
  }

  // Mark expiry warning as sent
  async markExpiryWarningSent(transactionId: string): Promise<void> {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { expiryWarningSent: true }
    });
  }

  // Health check untuk service
  async healthCheck(): Promise<{ healthy: boolean; message: string; stats?: any }> {
    try {
      const stats = await this.getExpiryStats();
      
      return {
        healthy: true,
        message: 'Transaction expiry service is running',
        stats
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Transaction expiry service health check failed: ${error}`
      };
    }
  }
}