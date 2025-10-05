import { Prisma, DiscountType } from '@prisma/client';
import { prisma } from '../utils/prisma';

export interface VoucherCreateRequest {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxUsage: number;
  minPurchaseAmount?: number;
  startDate: Date;
  endDate: Date;
  description?: string;
}

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

// FIX: Type-safe update interface
interface VoucherUpdateData {
  code?: string;
  discountType?: DiscountType;
  discountValue?: number;
  maxUsage?: number;
  minPurchaseAmount?: number;
  startDate?: Date;
  endDate?: Date;
  description?: string;
}

export class VoucherService {
  // ================== CREATE VOUCHER ==================
  async createVoucher(eventId: string, organizerId: string, voucherData: VoucherCreateRequest) {
    this.validateVoucherData(voucherData);

    return await prisma.$transaction(async (tx) => {
      const event = await tx.event.findFirst({
        where: {
          id: eventId,
          organizerId,
          isDeleted: false
        },
      });

      if (!event) {
        throw new Error('Event not found or access denied');
      }

      const existingVoucher = await tx.eventVoucher.findFirst({
        where: {
          code: voucherData.code.toUpperCase(),
          isDeleted: false
        },
      });

      if (existingVoucher) {
        throw new Error('Voucher code already exists');
      }

      if (voucherData.maxUsage <= 0 || voucherData.maxUsage > 100000) {
        throw new Error('Max usage must be between 1 and 100,000');
      }

      const voucher = await tx.eventVoucher.create({
        data: {
          eventId,
          code: voucherData.code.toUpperCase(),
          discountType: voucherData.discountType,
          discountValue: voucherData.discountValue,
          maxUsage: voucherData.maxUsage,
          minPurchaseAmount: voucherData.minPurchaseAmount || 0,
          startDate: voucherData.startDate,
          endDate: voucherData.endDate,
          description: voucherData.description,
          usedCount: 0,
          isDeleted: false,
          version: 1
        },
      });

      return voucher;
    });
  }

  // ================== GET EVENT VOUCHERS ==================
  async getEventVouchers(eventId: string, organizerId: string) {
    const event = await prisma.event.findFirst({
      where: {
        id: eventId,
        organizerId,
        isDeleted: false
      },
    });

    if (!event) {
      throw new Error('Event not found or access denied');
    }

    const vouchers = await prisma.eventVoucher.findMany({
      where: {
        eventId,
        isDeleted: false
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        maxUsage: true,
        usedCount: true,
        minPurchaseAmount: true,
        startDate: true,
        endDate: true,
        description: true,
        createdAt: true,
        version: true
      }
    });

    return vouchers;
  }

  // ================== GET ACTIVE VOUCHERS ==================
  async getActiveVouchers(eventId: string) {
    const now = new Date();
    
    const vouchers = await prisma.eventVoucher.findMany({
      where: {
        eventId,
        startDate: { lte: now },
        endDate: { gte: now },
        usedCount: { 
          lt: prisma.eventVoucher.fields.maxUsage 
        },
        isDeleted: false
      },
      select: {
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        maxUsage: true,
        usedCount: true,
        minPurchaseAmount: true,
        startDate: true,
        endDate: true,
        description: true,
      },
    });

    return vouchers;
  }

  // ================== UPDATE VOUCHER - TYPE-SAFE & SECURE ==================
  async updateVoucher(voucherId: string, organizerId: string, updateData: Partial<VoucherCreateRequest>) {
    // FIX: Gunakan type-safe sanitization
    const allowedUpdates = this.sanitizeVoucherUpdateTypeSafe(updateData);

    if (Object.keys(allowedUpdates).length === 0) {
      throw new Error('No valid fields to update');
    }

    // FIX: Validasi business logic sebelum transaction
    await this.validateVoucherUpdateData(voucherId, organizerId, allowedUpdates);

    return await withRetry(async () => {
      return await prisma.$transaction(async (tx) => {
        const voucher = await tx.eventVoucher.findFirst({
          where: {
            id: voucherId,
            event: {
              organizerId,
            },
            isDeleted: false
          },
          include: {
            event: {
              select: {
                id: true,
                title: true
              }
            },
          },
        });

        if (!voucher) {
          throw new Error('Voucher not found or access denied');
        }

        // FIX: Business logic validation - jika voucher sudah digunakan
        if (voucher.usedCount > 0) {
          const restrictedFields = ['code', 'discountType', 'discountValue', 'maxUsage'];
          const attemptedRestrictedUpdate = Object.keys(allowedUpdates).some(field => 
            restrictedFields.includes(field)
          );

          if (attemptedRestrictedUpdate) {
            throw new Error('Cannot update voucher code, discount, or max usage after voucher has been used');
          }
        }

        // FIX: Check duplicate code dengan validation
        if (allowedUpdates.code && allowedUpdates.code !== voucher.code) {
          const existingVoucher = await tx.eventVoucher.findFirst({
            where: {
              code: allowedUpdates.code.toUpperCase(),
              id: { not: voucherId },
              isDeleted: false
            },
          });

          if (existingVoucher) {
            throw new Error('Voucher code already exists');
          }
        }

        // FIX: Build update payload dengan type safety
        const updatePayload: Prisma.EventVoucherUpdateInput = {
          version: { increment: 1 }
        };

        // FIX: Type-safe assignment tanpa assertions berbahaya
        if (allowedUpdates.code !== undefined) {
          updatePayload.code = allowedUpdates.code.toUpperCase();
        }
        if (allowedUpdates.discountType !== undefined) {
          updatePayload.discountType = allowedUpdates.discountType;
        }
        if (allowedUpdates.discountValue !== undefined) {
          updatePayload.discountValue = allowedUpdates.discountValue;
        }
        if (allowedUpdates.maxUsage !== undefined) {
          updatePayload.maxUsage = allowedUpdates.maxUsage;
        }
        if (allowedUpdates.minPurchaseAmount !== undefined) {
          updatePayload.minPurchaseAmount = allowedUpdates.minPurchaseAmount;
        }
        if (allowedUpdates.startDate !== undefined) {
          updatePayload.startDate = allowedUpdates.startDate;
        }
        if (allowedUpdates.endDate !== undefined) {
          updatePayload.endDate = allowedUpdates.endDate;
        }
        if (allowedUpdates.description !== undefined) {
          updatePayload.description = allowedUpdates.description;
        }

        const updatedVoucher = await tx.eventVoucher.update({
          where: { 
            id: voucherId,
            version: voucher.version || 1
          },
          data: updatePayload
        });

        return updatedVoucher;
      });
    });
  }

  // ================== DELETE VOUCHER (SOFT DELETE) ==================
  async deleteVoucher(voucherId: string, organizerId: string) {
    return await prisma.$transaction(async (tx) => {
      const voucher = await tx.eventVoucher.findFirst({
        where: {
          id: voucherId,
          event: {
            organizerId,
          },
          isDeleted: false
        },
        include: {
          transactions: {
            where: {
              status: { 
                in: ['WAITING_FOR_PAYMENT', 'WAITING_FOR_CONFIRMATION', 'DONE', 'SUCCESS'] 
              }
            },
            take: 1
          }
        },
      });

      if (!voucher) {
        throw new Error('Voucher not found or access denied');
      }

      if (voucher.transactions.length > 0) {
        throw new Error('Cannot delete voucher that has been used in active transactions');
      }

      const deletedVoucher = await tx.eventVoucher.update({
        where: { 
          id: voucherId,
          version: voucher.version || 1
        },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          version: { increment: 1 }
        },
      });

      return { 
        message: 'Voucher deleted successfully',
        deletedVoucher: {
          id: deletedVoucher.id,
          code: deletedVoucher.code
        }
      };
    });
  }

  // ================== VALIDATE VOUCHER WITH LOCKING ==================
  async validateVoucher(code: string, eventId: string, totalAmount: number, userId?: string) {
    const now = new Date();
    
    return await withRetry(async () => {
      return await prisma.$transaction(async (tx) => {
        const voucher = await tx.eventVoucher.findFirst({
          where: {
            code: code.toUpperCase(),
            eventId,
            startDate: { lte: now },
            endDate: { gte: now },
            isDeleted: false
          }
        });

        if (!voucher) {
          throw new Error('Voucher not available');
        }

        if (voucher.usedCount >= voucher.maxUsage) {
          throw new Error('Voucher usage limit reached');
        }

        if (totalAmount < voucher.minPurchaseAmount) {
          throw new Error(`Minimum purchase amount for this voucher is ${voucher.minPurchaseAmount}`);
        }

        if (userId) {
          const existingUsage = await tx.transaction.findFirst({
            where: {
              userId,
              voucherId: voucher.id,
              status: { 
                in: ['WAITING_FOR_PAYMENT', 'WAITING_FOR_CONFIRMATION', 'DONE', 'SUCCESS'] 
              },
              isDeleted: false
            }
          });

          if (existingUsage) {
            throw new Error('You have already used this voucher');
          }
        }

        return voucher;
      });
    });
  }

  // ================== USE VOUCHER (INCREMENT USAGE) WITH LOCKING ==================
  async useVoucher(voucherId: string) {
    return await withRetry(async () => {
      return await prisma.$transaction(async (tx) => {
        const voucher = await tx.eventVoucher.findUnique({
          where: { 
            id: voucherId,
            isDeleted: false 
          }
        });

        if (!voucher) {
          throw new Error('Voucher not found');
        }

        if (voucher.usedCount >= voucher.maxUsage) {
          throw new Error('Voucher usage limit reached');
        }

        const updatedVoucher = await tx.eventVoucher.update({
          where: { 
            id: voucherId,
            version: voucher.version || 1,
            usedCount: { lt: voucher.maxUsage }
          },
          data: { 
            usedCount: { increment: 1 },
            version: { increment: 1 }
          },
        });

        return updatedVoucher;
      });
    });
  }

  // ================== UNUSE VOUCHER (DECREMENT USAGE) ==================
  async unuseVoucher(voucherId: string) {
    return await withRetry(async () => {
      return await prisma.$transaction(async (tx) => {
        const voucher = await tx.eventVoucher.findUnique({
          where: { 
            id: voucherId,
            isDeleted: false 
          }
        });

        if (!voucher) {
          throw new Error('Voucher not found');
        }

        if (voucher.usedCount <= 0) {
          throw new Error('Voucher usage count cannot be negative');
        }

        const updatedVoucher = await tx.eventVoucher.update({
          where: { 
            id: voucherId,
            version: voucher.version || 1
          },
          data: { 
            usedCount: { decrement: 1 },
            version: { increment: 1 }
          },
        });

        return updatedVoucher;
      });
    });
  }

  // ================== GET VOUCHER ANALYTICS ==================
  async getVoucherAnalytics(voucherId: string, organizerId: string) {
    const voucher = await prisma.eventVoucher.findFirst({
      where: {
        id: voucherId,
        event: {
          organizerId,
        },
        isDeleted: false
      },
      include: {
        event: {
          select: {
            title: true,
            id: true
          }
        },
        transactions: {
          where: {
            status: { 
              in: ['WAITING_FOR_PAYMENT', 'WAITING_FOR_CONFIRMATION', 'DONE', 'SUCCESS'] 
            },
            isDeleted: false
          },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        _count: {
          select: {
            transactions: {
              where: {
                status: { 
                  in: ['WAITING_FOR_PAYMENT', 'WAITING_FOR_CONFIRMATION', 'DONE', 'SUCCESS'] 
                },
                isDeleted: false
              }
            }
          }
        }
      },
    });

    if (!voucher) {
      throw new Error('Voucher not found or access denied');
    }

    const totalDiscount = voucher.transactions.reduce((sum, transaction) => {
      return sum + (transaction.voucherDiscount || 0);
    }, 0);

    const usageRate = voucher.maxUsage > 0 ? (voucher.usedCount / voucher.maxUsage) * 100 : 0;

    return {
      voucher: {
        id: voucher.id,
        code: voucher.code,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        maxUsage: voucher.maxUsage,
        usedCount: voucher.usedCount,
        minPurchaseAmount: voucher.minPurchaseAmount,
        startDate: voucher.startDate,
        endDate: voucher.endDate,
        description: voucher.description
      },
      analytics: {
        totalUsage: voucher.usedCount,
        remainingUsage: voucher.maxUsage - voucher.usedCount,
        usageRate: Math.round(usageRate * 100) / 100,
        totalDiscount: totalDiscount,
        transactionCount: voucher._count.transactions,
        recentTransactions: voucher.transactions.slice(0, 10).map(t => ({
          id: t.id,
          invoiceNumber: t.invoiceNumber,
          finalAmount: t.finalAmount,
          createdAt: t.createdAt
        }))
      },
      event: voucher.event
    };
  }

  // ================== VALIDATE VOUCHER DATA ==================
  private validateVoucherData(voucherData: VoucherCreateRequest) {
    if (!voucherData.code || voucherData.code.trim().length < 3) {
      throw new Error('Voucher code must be at least 3 characters long');
    }

    if (!/^[A-Z0-9_-]+$/i.test(voucherData.code)) {
      throw new Error('Voucher code can only contain letters, numbers, hyphens, and underscores');
    }

    this.validateDiscountValue(voucherData.discountValue, voucherData.discountType);

    if (voucherData.maxUsage <= 0 || voucherData.maxUsage > 100000) {
      throw new Error('Max usage must be between 1 and 100,000');
    }

    this.validateVoucherDates(voucherData.startDate, voucherData.endDate);

    if (voucherData.minPurchaseAmount && voucherData.minPurchaseAmount < 0) {
      throw new Error('Minimum purchase amount cannot be negative');
    }
  }

  // ================== VALIDATE DISCOUNT VALUE ==================
  private validateDiscountValue(discountValue: number, discountType: DiscountType) {
    if (discountType === 'PERCENTAGE') {
      if (discountValue <= 0 || discountValue > 100) {
        throw new Error('Percentage discount must be between 1 and 100');
      }
    } else {
      if (discountValue <= 0) {
        throw new Error('Fixed discount must be greater than 0');
      }
    }
  }

  // ================== VALIDATE VOUCHER DATES ==================
  private validateVoucherDates(startDate: Date, endDate: Date) {
    if (startDate >= endDate) {
      throw new Error('Voucher start date must be before end date');
    }

    if (endDate <= new Date()) {
      throw new Error('Voucher end date must be in the future');
    }

    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    
    if (endDate > oneYearFromNow) {
      throw new Error('Voucher validity cannot exceed 1 year');
    }
  }

  // ================== SANITIZE VOUCHER UPDATE - TYPE-SAFE VERSION ==================
  private sanitizeVoucherUpdateTypeSafe(updateData: Partial<VoucherCreateRequest>): VoucherUpdateData {
    const sanitized: VoucherUpdateData = {};
    
    // FIX: Type-safe field assignment dengan whitelist
    const allowedFields: (keyof VoucherUpdateData)[] = [
      'code',
      'discountType',
      'discountValue', 
      'maxUsage',
      'minPurchaseAmount',
      'startDate',
      'endDate',
      'description'
    ];
    
    allowedFields.forEach(field => {
      const value = updateData[field as keyof VoucherCreateRequest];
      if (value !== undefined) {
        // FIX: Type-safe assignment
        sanitized[field] = value as any;
      }
    });
    
    return sanitized;
  }

  // ================== VALIDATE VOUCHER UPDATE DATA ==================
  private async validateVoucherUpdateData(voucherId: string, organizerId: string, updateData: VoucherUpdateData) {
    const voucher = await prisma.eventVoucher.findFirst({
      where: {
        id: voucherId,
        event: { organizerId },
        isDeleted: false
      }
    });

    if (!voucher) {
      throw new Error('Voucher not found');
    }

    // Validasi dates
    if (updateData.startDate || updateData.endDate) {
      const startDate = updateData.startDate || voucher.startDate;
      const endDate = updateData.endDate || voucher.endDate;
      this.validateVoucherDates(startDate, endDate);
    }

    // Validasi discount value
    if (updateData.discountValue !== undefined) {
      const discountType = updateData.discountType || voucher.discountType;
      this.validateDiscountValue(updateData.discountValue, discountType);
    }

    // Validasi max usage
    if (updateData.maxUsage !== undefined && (updateData.maxUsage <= 0 || updateData.maxUsage > 100000)) {
      throw new Error('Max usage must be between 1 and 100,000');
    }
  }

  // ================== BULK DELETE EXPIRED VOUCHERS ==================
  async bulkDeleteExpiredVouchers(organizerId: string): Promise<{ deletedCount: number }> {
    const now = new Date();

    const result = await prisma.eventVoucher.updateMany({
      where: {
        event: {
          organizerId
        },
        endDate: { lt: now },
        isDeleted: false,
        usedCount: 0
      },
      data: {
        isDeleted: true,
        deletedAt: new Date()
      }
    });

    return { deletedCount: result.count };
  }

  // ================== GET VOUCHER USAGE HISTORY ==================
  async getVoucherUsageHistory(voucherId: string, organizerId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const voucher = await prisma.eventVoucher.findFirst({
      where: {
        id: voucherId,
        event: { organizerId },
        isDeleted: false
      }
    });

    if (!voucher) {
      throw new Error('Voucher not found or access denied');
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          voucherId,
          isDeleted: false
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true
            }
          },
          event: {
            select: {
              title: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: limit
      }),
      prisma.transaction.count({
        where: {
          voucherId,
          isDeleted: false
        }
      })
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
}