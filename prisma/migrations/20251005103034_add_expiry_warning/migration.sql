-- AlterTable
ALTER TABLE "public"."transactions" ADD COLUMN     "expiryWarningSent" BOOLEAN NOT NULL DEFAULT false;
