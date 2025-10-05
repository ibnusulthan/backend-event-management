import { Prisma, Event, EventTicketType, TransactionStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { EventFilterParams } from '../types';
import { uploadToCloudinary, deleteFromCloudinary } from '../utils/cloudinary';
import { sendWelcomeEmail } from '../utils/email'; // Import email functions

// Helper untuk case-insensitive search tanpa mode: 'insensitive'
const createCaseInsensitiveFilter = (field: string, value: string): any => {
  if (!value) return {};
  
  return {
    OR: [
      { [field]: { equals: value } },
      { [field]: { equals: value.toLowerCase() } },
      { [field]: { equals: value.toUpperCase() } },
      { [field]: { contains: value } },
      { [field]: { contains: value.toLowerCase() } },
      { [field]: { contains: value.toUpperCase() } },
    ]
  };
};

export class EventService {
  async getEvents(filters: EventFilterParams) {
    const {
      page = 1,
      limit = 10,
      search,
      category,
      location,
      startDate,
      endDate,
      minPrice,
      maxPrice,
    } = filters;

    const skip = (page - 1) * limit;

    const filtersArray: Prisma.EventWhereInput[] = [
      { isPublished: true },
      { isDeleted: false }
    ];

    if (search) {
      // FIX: Ganti mode: 'insensitive' dengan approach manual
      filtersArray.push({
        OR: [
          this.createSearchFilter('title', search),
          this.createSearchFilter('description', search),
          this.createSearchFilter('location', search),
        ],
      });
    }

    if (category) {
      // FIX: Ganti mode: 'insensitive' dengan approach manual
      filtersArray.push(this.createSearchFilter('category', category));
    }

    if (location) {
      // FIX: Ganti mode: 'insensitive' dengan approach manual
      filtersArray.push(this.createSearchFilter('location', location));
    }

    if (startDate) {
      filtersArray.push({ startDate: { gte: new Date(startDate) } });
    }

    if (endDate) {
      filtersArray.push({ endDate: { lte: new Date(endDate) } });
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      const priceFilter: Prisma.FloatFilter = {};
      if (minPrice !== undefined) priceFilter.gte = minPrice;
      if (maxPrice !== undefined) priceFilter.lte = maxPrice;
      filtersArray.push({ basePrice: priceFilter });
    }

    const where: Prisma.EventWhereInput = {
      AND: filtersArray,
    };

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          organizer: {
            select: {
              id: true,
              fullName: true,
              profilePicture: true,
            },
          },
          ticketTypes: {
            where: {
              isDeleted: false
            }
          },
          _count: {
            select: {
              reviews: {
                where: {
                  isActive: true
                }
              },
              attendees: {
                where: {
                  transaction: {
                    status: {
                      in: ['DONE', 'SUCCESS', 'CONFIRMED']
                    }
                  }
                }
              },
            },
          },
        },
        orderBy: { startDate: 'asc' },
        skip,
        take: limit,
      }),
      prisma.event.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getEventById(id: string) {
    const event = await prisma.event.findUnique({
      where: { 
        id,
        isDeleted: false
      },
      include: {
        organizer: {
          select: {
            id: true,
            fullName: true,
            profilePicture: true,
            // FIX: Jangan expose data sensitif organizer
          },
        },
        ticketTypes: {
          where: {
            isDeleted: false
          }
        },
        vouchers: {
          where: {
            startDate: { lte: new Date() },
            endDate: { gte: new Date() },
            isDeleted: false,
            // FIX: Filter usedCount < maxUsage di query level
            usedCount: { lt: prisma.eventVoucher.fields.maxUsage }
          },
        },
        reviews: {
          where: {
            isActive: true
          },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                profilePicture: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            attendees: {
              where: {
                transaction: {
                  status: {
                    in: ['DONE', 'SUCCESS', 'CONFIRMED']
                  }
                }
              }
            },
            reviews: {
              where: {
                isActive: true
              }
            },
          },
        },
      },
    });

    if (!event) {
      return null;
    }

    // FIX: Tidak perlu filter manual lagi karena sudah di query level
    return event;
  }

  // FIX: Create event dengan rollback mechanism dan validasi
  async createEvent(
    organizerId: string,
    eventData: {
      title: string;
      description: string;
      category: string;
      location: string;
      address: string;
      startDate: Date;
      endDate: Date;
      availableSeats: number;
      basePrice: number;
      isPublished: boolean;
      imageUrl?: string;
    },
    ticketTypes: {
      name: string;
      price: number;
      quantity: number;
      description?: string;
    }[],
    imageFile?: Express.Multer.File
  ) {
    this.validateEventData(eventData);

    let imageUrl = eventData.imageUrl;
    let cloudinaryPublicId: string | undefined;

    return await prisma.$transaction(async (tx) => {
      try {
        // FIX: Upload image dengan rollback mechanism
        if (imageFile) {
          try {
            console.log('📸 Uploading event image to Cloudinary...');
            const uploadResult = await uploadToCloudinary(imageFile);
            imageUrl = uploadResult.secure_url;
            cloudinaryPublicId = uploadResult.public_id;
            console.log('Event image uploaded:', imageUrl);
          } catch (error) {
            console.error('Failed to upload event image:', error);
            throw new Error('Failed to upload event image');
          }
        }

        // FIX: Check duplicate event title tanpa mode: 'insensitive'
        const existingEvent = await tx.event.findFirst({
          where: {
            OR: [
              { title: eventData.title },
              { title: eventData.title.toLowerCase() },
              { title: eventData.title.toUpperCase() }
            ],
            organizerId,
            isDeleted: false
          }
        });

        if (existingEvent) {
          throw new Error('Event with this title already exists');
        }

        const event = await tx.event.create({
          data: {
            title: eventData.title,
            description: eventData.description,
            category: eventData.category,
            location: eventData.location,
            address: eventData.address,
            startDate: eventData.startDate,
            endDate: eventData.endDate,
            availableSeats: eventData.availableSeats,
            basePrice: eventData.basePrice,
            isPublished: eventData.isPublished,
            imageUrl,
            imagePublicId: cloudinaryPublicId,
            organizerId,
            bookedSeats: 0,
            soldQuantity: 0,
            isDeleted: false,
            version: 1
          },
        });

        // FIX: Create ticket types dengan available quantity
        if (ticketTypes && ticketTypes.length > 0) {
          await tx.eventTicketType.createMany({
            data: ticketTypes.map(ticketType => ({
              name: ticketType.name,
              price: ticketType.price,
              quantity: ticketType.quantity,
              availableQuantity: ticketType.quantity,
              description: ticketType.description,
              eventId: event.id,
              soldQuantity: 0,
              isDeleted: false,
              version: 1
            })),
          });
        }

        // FIX: Kirim email notifikasi ke organizer (optional)
        try {
          const organizer = await tx.user.findUnique({
            where: { id: organizerId },
            select: { email: true, fullName: true }
          });
          
          if (organizer) {
            // Anda bisa buat function email khusus untuk event creation
            console.log(`📧 Event creation notification would be sent to: ${organizer.email}`);
          }
        } catch (emailError) {
          console.error('Failed to send event creation email:', emailError);
          // Jangan throw error, hanya log saja
        }

        console.log(`✅ Event created successfully: ${event.title} by organizer ${organizerId}`);
        return event;

      } catch (error) {
        // FIX: Rollback Cloudinary upload jika database operation gagal
        if (cloudinaryPublicId) {
          try {
            await deleteFromCloudinary(cloudinaryPublicId);
            console.log('Rollback: Deleted uploaded image from Cloudinary');
          } catch (rollbackError) {
            console.error('Failed to rollback Cloudinary upload:', rollbackError);
          }
        }
        throw error;
      }
    });
  }

  // FIX: Update event dengan validasi dan image management
  async updateEvent(
    id: string, 
    organizerId: string, 
    updateData: Partial<Event>,
    imageFile?: Express.Multer.File
  ) {
    // FIX: Get existing event dengan semua field yang diperlukan untuk validasi
    const existingEvent = await prisma.event.findFirst({
      where: { 
        id, 
        organizerId,
        isDeleted: false 
      }
    });

    if (!existingEvent) {
      throw new Error('Event not found or access denied');
    }

    let newImagePublicId: string | undefined;
    let oldImagePublicId = existingEvent.imagePublicId;

    return await prisma.$transaction(async (tx) => {
      try {
        // FIX: Upload new image jika provided
        if (imageFile) {
          try {
            console.log('Uploading updated event image to Cloudinary...');
            const uploadResult = await uploadToCloudinary(imageFile);
            updateData.imageUrl = uploadResult.secure_url;
            newImagePublicId = uploadResult.public_id;
            (updateData as any).imagePublicId = newImagePublicId;
            console.log('Event image updated:', uploadResult.secure_url);
          } catch (error) {
            console.error('Failed to upload event image:', error);
            throw new Error('Failed to upload event image');
          }
        }

        // FIX: Check duplicate title tanpa mode: 'insensitive'
        if (updateData.title && updateData.title !== existingEvent.title) {
          const duplicateEvent = await tx.event.findFirst({
            where: {
              OR: [
                { title: updateData.title },
                { title: updateData.title.toLowerCase() },
                { title: updateData.title.toUpperCase() }
              ],
              organizerId,
              id: { not: id },
              isDeleted: false
            }
          });

          if (duplicateEvent) {
            throw new Error('Another event with this title already exists');
          }
        }

        // FIX: Validasi update data menggunakan existingEvent
        if (updateData.startDate || updateData.endDate) {
          const startDate = updateData.startDate || existingEvent.startDate;
          const endDate = updateData.endDate || existingEvent.endDate;
          if (startDate >= endDate) {
            throw new Error('Event end date must be after start date');
          }
        }

        // FIX: Validasi available seats tidak kurang dari booked seats
        if (updateData.availableSeats !== undefined) {
          if (updateData.availableSeats < existingEvent.bookedSeats) {
            throw new Error(`Available seats cannot be less than booked seats (${existingEvent.bookedSeats})`);
          }
        }

        const updatedEvent = await tx.event.update({
          where: { 
            id, 
            organizerId,
            version: existingEvent.version || 1
          },
          data: {
            ...updateData,
            version: { increment: 1 }
          },
        });

        // FIX: Delete old image dari Cloudinary jika upload baru berhasil
        if (newImagePublicId && oldImagePublicId) {
          try {
            await deleteFromCloudinary(oldImagePublicId);
            console.log('Deleted old event image from Cloudinary');
          } catch (deleteError) {
            console.error('Failed to delete old image:', deleteError);
          }
        }

        console.log(`✅ Event updated successfully: ${id}`);
        return updatedEvent;

      } catch (error) {
        // FIX: Rollback new image upload jika database operation gagal
        if (newImagePublicId) {
          try {
            await deleteFromCloudinary(newImagePublicId);
            console.log('Rollback: Deleted new image from Cloudinary');
          } catch (rollbackError) {
            console.error('Failed to rollback Cloudinary upload:', rollbackError);
          }
        }
        throw error;
      }
    });
  }

  async getOrganizerEvents(organizerId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where: { 
          organizerId,
          isDeleted: false
        },
        include: {
          ticketTypes: {
            where: {
              isDeleted: false
            }
          },
          _count: {
            select: {
              transactions: {
                where: {
                  status: {
                    in: ['DONE', 'SUCCESS', 'CONFIRMED']
                  }
                }
              },
              attendees: {
                where: {
                  transaction: {
                    status: {
                      in: ['DONE', 'SUCCESS', 'CONFIRMED']
                    }
                  }
                }
              },
              reviews: {
                where: {
                  isActive: true
                }
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.event.count({ 
        where: { 
          organizerId,
          isDeleted: false 
        } 
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  // FIX: Event analytics dengan revenue calculation yang aman
  async getEventAnalytics(eventId: string, organizerId: string) {
    const event = await prisma.event.findFirst({
      where: { 
        id: eventId, 
        organizerId,
        isDeleted: false 
      },
      include: {
        ticketTypes: {
          where: {
            isDeleted: false
          },
          include: {
            _count: {
              select: {
                transactionItems: {
                  where: {
                    transaction: {
                      status: {
                        in: ['DONE', 'SUCCESS', 'CONFIRMED']
                      },
                      isDeleted: false
                    }
                  }
                },
              },
            },
          },
        },
        transactions: {
          where: {
            status: { in: ['DONE', 'SUCCESS', 'CONFIRMED'] },
            isDeleted: false,
            // FIX: Gunakan gte 0 untuk exclude null values
            finalAmount: { gte: 0 }
          },
          include: {
            items: true,
          },
        },
        attendees: {
          where: {
            transaction: {
              status: { in: ['DONE', 'SUCCESS', 'CONFIRMED'] },
              isDeleted: false
            }
          }
        },
        reviews: {
          where: {
            isActive: true
          },
          select: {
            rating: true,
          },
        },
      },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    // FIX: Revenue calculation yang aman - handle null/undefined
    const successfulTransactions = event.transactions || [];
    const totalRevenue = successfulTransactions.reduce(
      (sum, transaction) => sum + (transaction.finalAmount || 0),
      0
    );

    const averageRating =
      event.reviews.length > 0
        ? event.reviews.reduce((sum, review) => sum + review.rating, 0) / event.reviews.length
        : 0;

    const ticketSales = event.ticketTypes.map(ticketType => ({
      name: ticketType.name,
      sold: ticketType._count?.transactionItems || 0,
      total: ticketType.quantity,
      revenue: (ticketType._count?.transactionItems || 0) * (ticketType.price || 0),
    }));

    return {
      event: {
        id: event.id,
        title: event.title,
        bookedSeats: event.bookedSeats || 0,
        availableSeats: event.availableSeats || 0,
        soldQuantity: event.soldQuantity || 0,
      },
      analytics: {
        totalRevenue,
        averageRating: Math.round(averageRating * 10) / 10,
        totalTransactions: successfulTransactions.length,
        totalAttendees: event.attendees.length,
        totalReviews: event.reviews.length,
        ticketSales,
        occupancyRate: event.availableSeats > 0 
          ? Math.round(((event.bookedSeats || 0) / event.availableSeats) * 100) 
          : 0,
      },
    };
  }

  // FIX: Update event image dengan rollback mechanism
  async updateEventImage(eventId: string, organizerId: string, imageFile: Express.Multer.File) {
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

    let newImagePublicId: string | undefined;
    const oldImagePublicId = event.imagePublicId;

    return await prisma.$transaction(async (tx) => {
      try {
        const uploadResult = await uploadToCloudinary(imageFile);
        const imageUrl = uploadResult.secure_url;
        newImagePublicId = uploadResult.public_id;

        const updatedEvent = await tx.event.update({
          where: { 
            id: eventId,
            version: event.version || 1
          },
          data: { 
            imageUrl,
            imagePublicId: newImagePublicId,
            version: { increment: 1 }
          },
        });

        if (oldImagePublicId) {
          try {
            await deleteFromCloudinary(oldImagePublicId);
            console.log('Deleted old event image from Cloudinary');
          } catch (deleteError) {
            console.error('Failed to delete old image:', deleteError);
          }
        }

        return updatedEvent;

      } catch (error) {
        if (newImagePublicId) {
          try {
            await deleteFromCloudinary(newImagePublicId);
          } catch (rollbackError) {
            console.error('Failed to rollback Cloudinary upload:', rollbackError);
          }
        }
        throw error;
      }
    });
  }

  // FIX: Soft delete event dengan validasi
  async deleteEvent(eventId: string, organizerId: string): Promise<void> {
    const event = await prisma.event.findFirst({
      where: { 
        id: eventId, 
        organizerId,
        isDeleted: false 
      },
      include: {
        transactions: {
          where: {
            status: { in: ['DONE', 'SUCCESS', 'CONFIRMED'] }
          }
        }
      }
    });

    if (!event) {
      throw new Error('Event not found or access denied');
    }

    // FIX: Cek jika ada transaksi yang sukses
    if (event.transactions.length > 0) {
      throw new Error('Cannot delete event with successful transactions');
    }

    await prisma.$transaction(async (tx) => {
      // Soft delete event
      await tx.event.update({
        where: { 
          id: eventId,
          version: event.version || 1
        },
        data: { 
          isDeleted: true,
          deletedAt: new Date(),
          version: { increment: 1 }
        }
      });

      // FIX: Soft delete ticket types
      await tx.eventTicketType.updateMany({
        where: { eventId },
        data: {
          isDeleted: true,
          deletedAt: new Date()
        }
      });

      // FIX: Soft delete vouchers
      await tx.eventVoucher.updateMany({
        where: { eventId },
        data: {
          isDeleted: true,
          deletedAt: new Date()
        }
      });

      // FIX: Delete image dari Cloudinary
      if (event.imagePublicId) {
        try {
          await deleteFromCloudinary(event.imagePublicId);
          console.log('Deleted event image from Cloudinary');
        } catch (error) {
          console.error('Failed to delete event image from Cloudinary:', error);
        }
      }
    });

    console.log(`✅ Event soft deleted: ${eventId}`);
  }

  // FIX: Get events statistics untuk dashboard
  async getOrganizerEventsStats(organizerId: string) {
    const now = new Date();
    
    const [totalEvents, publishedEvents, upcomingEvents, totalRevenue, totalAttendees] = await Promise.all([
      prisma.event.count({
        where: {
          organizerId,
          isDeleted: false
        }
      }),
      
      prisma.event.count({
        where: {
          organizerId,
          isPublished: true,
          isDeleted: false
        }
      }),
      
      prisma.event.count({
        where: {
          organizerId,
          startDate: { gt: now },
          isDeleted: false
        }
      }),
      
      // FIX: Revenue calculation yang aman - gunakan gte 0 untuk exclude null values
      prisma.transaction.aggregate({
        where: {
          event: {
            organizerId,
            isDeleted: false
          },
          status: { in: ['DONE', 'SUCCESS', 'CONFIRMED'] },
          finalAmount: { gte: 0 }
        },
        _sum: {
          finalAmount: true
        }
      }),
      
      // FIX: Tambah total attendees count
      prisma.eventAttendee.count({
        where: {
          event: {
            organizerId,
            isDeleted: false
          },
          transaction: {
            status: { in: ['DONE', 'SUCCESS', 'CONFIRMED'] }
          }
        }
      })
    ]);

    return {
      totalEvents,
      publishedEvents,
      upcomingEvents,
      totalRevenue: totalRevenue._sum?.finalAmount || 0,
      totalAttendees,
      draftEvents: totalEvents - publishedEvents
    };
  }

  // FIX: Search events dengan advanced filtering TANPA mode: 'insensitive'
  async searchEvents(query: string, filters: {
    category?: string;
    location?: string;
    dateRange?: { start: Date; end: Date };
    priceRange?: { min: number; max: number };
  } = {}) {
    const where: Prisma.EventWhereInput = {
      isPublished: true,
      isDeleted: false,
      AND: [
        {
          OR: [
            this.createSearchFilter('title', query),
            this.createSearchFilter('description', query),
            this.createSearchFilter('category', query),
            this.createSearchFilter('location', query),
          ]
        }
      ]
    };

    if (filters.category) {
      (where.AND as Prisma.EventWhereInput[]).push(
        this.createSearchFilter('category', filters.category)
      );
    }

    if (filters.location) {
      (where.AND as Prisma.EventWhereInput[]).push(
        this.createSearchFilter('location', filters.location)
      );
    }

    if (filters.dateRange) {
      (where.AND as Prisma.EventWhereInput[]).push({
        OR: [
          {
            startDate: { gte: filters.dateRange.start },
            endDate: { lte: filters.dateRange.end }
          },
          {
            startDate: { lte: filters.dateRange.end },
            endDate: { gte: filters.dateRange.start }
          }
        ]
      });
    }

    if (filters.priceRange) {
      (where.AND as Prisma.EventWhereInput[]).push({
        basePrice: {
          gte: filters.priceRange.min,
          lte: filters.priceRange.max
        }
      });
    }

    return prisma.event.findMany({
      where,
      include: {
        organizer: {
          select: {
            id: true,
            fullName: true,
            profilePicture: true,
          },
        },
        ticketTypes: {
          where: {
            isDeleted: false
          },
          orderBy: { price: 'asc' },
          take: 1
        },
        _count: {
          select: {
            reviews: {
              where: {
                isActive: true
              }
            },
            attendees: {
              where: {
                transaction: {
                  status: {
                    in: ['DONE', 'SUCCESS', 'CONFIRMED']
                  }
                }
              }
            },
          },
        },
      },
      orderBy: {
        startDate: 'asc'
      },
      take: 50
    });
  }

  // FIX: Validasi event data
  private validateEventData(eventData: {
    title: string;
    description: string;
    startDate: Date;
    endDate: Date;
    availableSeats: number;
    basePrice: number;
  }) {
    if (!eventData.title || eventData.title.trim().length < 3) {
      throw new Error('Event title must be at least 3 characters long');
    }

    if (eventData.title.length > 100) {
      throw new Error('Event title cannot exceed 100 characters');
    }

    if (eventData.startDate >= eventData.endDate) {
      throw new Error('Event end date must be after start date');
    }

    if (eventData.availableSeats <= 0) {
      throw new Error('Available seats must be greater than 0');
    }

    if (eventData.availableSeats > 100000) {
      throw new Error('Available seats cannot exceed 100,000');
    }

    if (eventData.basePrice < 0) {
      throw new Error('Base price cannot be negative');
    }

    if (eventData.basePrice > 100000000) {
      throw new Error('Base price cannot exceed 100,000,000');
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const startDate = new Date(eventData.startDate);
    startDate.setHours(0, 0, 0, 0);
    
    if (startDate < now) {
      throw new Error('Event start date cannot be in the past');
    }
  }

  // FIX: Method untuk calculate revenue yang aman
  async calculateEventRevenue(eventId: string): Promise<number> {
    const revenue = await prisma.transaction.aggregate({
      where: {
        eventId,
        status: { in: ['DONE', 'SUCCESS', 'CONFIRMED'] },
        // FIX: Gunakan gte 0 untuk exclude null values
        finalAmount: { gte: 0 }
      },
      _sum: {
        finalAmount: true
      }
    });

    return revenue._sum?.finalAmount || 0;
  }

  // FIX: Update event seats dengan optimistic locking
  async updateEventSeats(eventId: string, quantity: number, operation: 'increment' | 'decrement') {
    return await prisma.$transaction(async (tx) => {
      const event = await tx.event.findUnique({
        where: { id: eventId },
        select: { 
          availableSeats: true, 
          bookedSeats: true,
          version: true 
        }
      });

      if (!event) {
        throw new Error('Event not found');
      }

      if (operation === 'decrement' && event.availableSeats < quantity) {
        throw new Error('Not enough seats available');
      }

      const updateData: Prisma.EventUpdateInput = {
        version: { increment: 1 }
      };

      if (operation === 'increment') {
        updateData.availableSeats = { increment: quantity };
        updateData.bookedSeats = { decrement: quantity };
        updateData.soldQuantity = { decrement: quantity };
      } else {
        updateData.availableSeats = { decrement: quantity };
        updateData.bookedSeats = { increment: quantity };
        updateData.soldQuantity = { increment: quantity };
      }

      const result = await tx.event.updateMany({
        where: { 
          id: eventId,
          version: event.version || 1
        },
        data: updateData
      });

      if (result.count === 0) {
        throw new Error('Event update conflict - please try again');
      }

      return tx.event.findUnique({
        where: { id: eventId }
      });
    });
  }

  // FIX: Bulk update events status (publish/unpublish)
  async bulkUpdateEventsStatus(organizerId: string, eventIds: string[], isPublished: boolean) {
    return await prisma.$transaction(async (tx) => {
      const result = await tx.event.updateMany({
        where: {
          id: { in: eventIds },
          organizerId,
          isDeleted: false
        },
        data: {
          isPublished,
          version: { increment: 1 }
        }
      });

      console.log(`✅ Bulk ${isPublished ? 'published' : 'unpublished'} ${result.count} events`);

      return {
        updatedCount: result.count,
        message: `Successfully ${isPublished ? 'published' : 'unpublished'} ${result.count} events`
      };
    });
  }

  // FIX: Helper method untuk case-insensitive search tanpa mode: 'insensitive'
  private createSearchFilter(field: string, value: string): Prisma.EventWhereInput {
    if (!value) return {};
    
    return {
      OR: [
        { [field]: { contains: value } },
        { [field]: { contains: value.toLowerCase() } },
        { [field]: { contains: value.toUpperCase() } },
        { [field]: { equals: value } },
        { [field]: { equals: value.toLowerCase() } },
        { [field]: { equals: value.toUpperCase() } }
      ]
    };
  }

  // FIX: Get featured events untuk homepage
  async getFeaturedEvents(limit: number = 6) {
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);

    return prisma.event.findMany({
      where: {
        isPublished: true,
        isDeleted: false,
        startDate: { 
          gte: new Date(),
          lte: oneWeekFromNow
        },
        availableSeats: { gt: 0 }
      },
      include: {
        organizer: {
          select: {
            id: true,
            fullName: true,
            profilePicture: true,
          },
        },
        ticketTypes: {
          where: {
            isDeleted: false
          },
          orderBy: { price: 'asc' },
          take: 1
        },
        _count: {
          select: {
            attendees: {
              where: {
                transaction: {
                  status: {
                    in: ['DONE', 'SUCCESS', 'CONFIRMED']
                  }
                }
              }
            },
          },
        },
      },
      orderBy: {
        startDate: 'asc'
      },
      take: limit
    });
  }

  // FIX: Get events by category
  async getEventsByCategory(category: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where: {
          isPublished: true,
          isDeleted: false,
          OR: [
            { category: { contains: category } },
            { category: { contains: category.toLowerCase() } },
            { category: { contains: category.toUpperCase() } }
          ]
        },
        include: {
          organizer: {
            select: {
              id: true,
              fullName: true,
              profilePicture: true,
            },
          },
          ticketTypes: {
            where: {
              isDeleted: false
            }
          },
          _count: {
            select: {
              attendees: {
                where: {
                  transaction: {
                    status: {
                      in: ['DONE', 'SUCCESS', 'CONFIRMED']
                    }
                  }
                }
              },
            },
          },
        },
        orderBy: { startDate: 'asc' },
        skip,
        take: limit,
      }),
      prisma.event.count({
        where: {
          isPublished: true,
          isDeleted: false,
          OR: [
            { category: { contains: category } },
            { category: { contains: category.toLowerCase() } },
            { category: { contains: category.toUpperCase() } }
          ]
        }
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }
}