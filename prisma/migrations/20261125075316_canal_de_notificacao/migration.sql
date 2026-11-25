-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'BOTH');

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "requesterChannel" "NotificationChannel" NOT NULL DEFAULT 'WHATSAPP';
