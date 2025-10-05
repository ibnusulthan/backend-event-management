import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class PointService {
  // FIX: Deduct points dengan locking
  async deductPointsWithLock(userId: string, points: number, tx?: any) {
    const prismaClient = tx || prisma;

    const user = await prismaClient.user.findUnique({
      where: { id: userId },
      select: { latestPoint: true },
      lock: { mode: 'update' }
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.latestPoint < points) {
      throw new Error('Insufficient points');
    }

    if (points <= 0) {
      throw new Error('Points to deduct must be positive');
    }

    await prismaClient.user.update({
      where: { id: userId },
      data: { latestPoint: { decrement: points } }
    });

    // Create point history
    await prismaClient.pointHistory.create({
      data: {
        userId,
        points: -points,
        type: 'REDEEM',
        description: `Redeemed ${points} points for transaction`
      }
    });

    return points;
  }

  // FIX: Restore points dengan locking
  async restorePointsWithLock(userId: string, points: number, tx?: any) {
    const prismaClient = tx || prisma;

    await prismaClient.user.update({
      where: { id: userId },
      data: { latestPoint: { increment: points } }
    });

    // Create point history
    await prismaClient.pointHistory.create({
      data: {
        userId,
        points: points,
        type: 'RESTORE',
        description: `Restored ${points} points from failed transaction`
      }
    });
  }
}