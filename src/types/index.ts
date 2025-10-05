import { Request } from 'express';
import { UserRole, TransactionStatus, DiscountType } from '@prisma/client';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
  };
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
  address?: string;
  referralCode?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface EventCreateRequest {
  title: string;
  description: string;
  category: string;
  location: string;
  address: string;
  startDate: Date;
  endDate: Date;
  imageUrl?: string;
  availableSeats: number;
  basePrice: number;
  ticketTypes: TicketTypeCreateRequest[];
}

export interface TicketTypeCreateRequest {
  name: string;
  price: number;
  quantity: number;
  description?: string;
}

export interface EventVoucherCreateRequest {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxUsage: number;
  minPurchaseAmount?: number;
  startDate: Date;
  endDate: Date;
  description?: string; // Tambahkan ini
}

export interface TransactionCreateRequest {
  eventId: string;
  ticketTypes: {
    ticketTypeId: string;
    quantity: number;
  }[];
  pointsUsed?: number;
  voucherCode?: string;
  couponCode?: string;
}

export interface ReviewCreateRequest {
  rating: number;
  comment?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  location?: string;
}

export interface EventFilterParams extends PaginationParams {
  startDate?: Date;
  endDate?: Date;
  minPrice?: number;
  maxPrice?: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DashboardStats {
  totalEvents: number;
  totalTransactions: number;
  totalRevenue: number;
  upcomingEvents: number;
}

// Tambahan types untuk fix
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

export interface TransactionUpdateRequest {
  status?: TransactionStatus;
  failureReason?: string;
}

export interface VoucherUpdateRequest {
  code?: string;
  discountType?: DiscountType;
  discountValue?: number;
  maxUsage?: number;
  minPurchaseAmount?: number;
  startDate?: Date;
  endDate?: Date;
  description?: string;
}