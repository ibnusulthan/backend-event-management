/*
  Warnings:

  - A unique constraint covering the columns `[userId,eventId]` on the table `reviews` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[transactionId,ticketTypeId]` on the table `transaction_items` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."coupon_templates" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."event_attendees" ADD COLUMN     "checkinCode" TEXT;

-- AlterTable
ALTER TABLE "public"."event_ticket_types" ADD COLUMN     "availableQuantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."event_vouchers" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."events" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "imagePublicId" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "soldQuantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."notifications" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "public"."referrals" ADD COLUMN     "rewardPoints" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."reviews" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."transaction_payments" ADD COLUMN     "paymentProofPublicId" TEXT;

-- AlterTable
ALTER TABLE "public"."transactions" ADD COLUMN     "failureReason" TEXT;

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "latestPoint" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."point_histories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "userId" TEXT,
    "userIp" TEXT,
    "userAgent" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "point_histories_userId_idx" ON "public"."point_histories"("userId");

-- CreateIndex
CREATE INDEX "point_histories_type_idx" ON "public"."point_histories"("type");

-- CreateIndex
CREATE INDEX "point_histories_referenceId_idx" ON "public"."point_histories"("referenceId");

-- CreateIndex
CREATE INDEX "point_histories_createdAt_idx" ON "public"."point_histories"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "public"."system_settings"("key");

-- CreateIndex
CREATE INDEX "system_settings_key_idx" ON "public"."system_settings"("key");

-- CreateIndex
CREATE INDEX "system_settings_isActive_idx" ON "public"."system_settings"("isActive");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "public"."audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_resource_idx" ON "public"."audit_logs"("resource");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "public"."audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "public"."audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "coupon_templates_name_idx" ON "public"."coupon_templates"("name");

-- CreateIndex
CREATE INDEX "coupon_templates_isActive_idx" ON "public"."coupon_templates"("isActive");

-- CreateIndex
CREATE INDEX "coupon_templates_createdAt_idx" ON "public"."coupon_templates"("createdAt");

-- CreateIndex
CREATE INDEX "event_attendees_attended_idx" ON "public"."event_attendees"("attended");

-- CreateIndex
CREATE INDEX "event_attendees_checkinCode_idx" ON "public"."event_attendees"("checkinCode");

-- CreateIndex
CREATE INDEX "event_ticket_types_eventId_idx" ON "public"."event_ticket_types"("eventId");

-- CreateIndex
CREATE INDEX "event_ticket_types_name_idx" ON "public"."event_ticket_types"("name");

-- CreateIndex
CREATE INDEX "event_vouchers_isDeleted_idx" ON "public"."event_vouchers"("isDeleted");

-- CreateIndex
CREATE INDEX "event_vouchers_createdAt_idx" ON "public"."event_vouchers"("createdAt");

-- CreateIndex
CREATE INDEX "events_organizerId_idx" ON "public"."events"("organizerId");

-- CreateIndex
CREATE INDEX "events_category_idx" ON "public"."events"("category");

-- CreateIndex
CREATE INDEX "events_location_idx" ON "public"."events"("location");

-- CreateIndex
CREATE INDEX "events_startDate_endDate_idx" ON "public"."events"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "events_isPublished_isDeleted_idx" ON "public"."events"("isPublished", "isDeleted");

-- CreateIndex
CREATE INDEX "events_createdAt_idx" ON "public"."events"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "public"."notifications"("type");

-- CreateIndex
CREATE INDEX "referrals_createdAt_idx" ON "public"."referrals"("createdAt");

-- CreateIndex
CREATE INDEX "reviews_rating_idx" ON "public"."reviews"("rating");

-- CreateIndex
CREATE INDEX "reviews_createdAt_idx" ON "public"."reviews"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_userId_eventId_key" ON "public"."reviews"("userId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_items_transactionId_ticketTypeId_key" ON "public"."transaction_items"("transactionId", "ticketTypeId");

-- CreateIndex
CREATE INDEX "transaction_payments_paymentDate_idx" ON "public"."transaction_payments"("paymentDate");

-- CreateIndex
CREATE INDEX "transactions_createdAt_idx" ON "public"."transactions"("createdAt");

-- CreateIndex
CREATE INDEX "user_coupons_createdAt_idx" ON "public"."user_coupons"("createdAt");

-- CreateIndex
CREATE INDEX "user_points_sourceType_idx" ON "public"."user_points"("sourceType");

-- CreateIndex
CREATE INDEX "user_points_createdAt_idx" ON "public"."user_points"("createdAt");

-- CreateIndex
CREATE INDEX "users_email_isActive_idx" ON "public"."users"("email", "isActive");

-- CreateIndex
CREATE INDEX "users_referralCode_idx" ON "public"."users"("referralCode");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "public"."users"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."point_histories" ADD CONSTRAINT "point_histories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
