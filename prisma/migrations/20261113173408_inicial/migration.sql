-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'AWAITING_INFO', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationSource" AS ENUM ('ADMIN', 'REQUEST');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY_DAY', 'MONTHLY_NTH_WEEKDAY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RecurringStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ENDED');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('CANCELLED', 'MODIFIED');

-- CreateEnum
CREATE TYPE "BlockType" AS ENUM ('HOLIDAY', 'MAINTENANCE', 'OTHER');

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "capacity" INTEGER NOT NULL,
    "openTime" TEXT,
    "closeTime" TEXT,
    "weekdays" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[],
    "adminNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomEquipment" (
    "roomId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RoomEquipment_pkey" PRIMARY KEY ("roomId","equipmentId")
);

-- CreateTable
CREATE TABLE "ReservationRequest" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "protocol" TEXT NOT NULL,
    "accessCodeHash" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "participants" INTEGER NOT NULL,
    "needsProjector" BOOLEAN NOT NULL DEFAULT false,
    "otherEquipmentNotes" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicMessage" TEXT,
    "internalNotes" TEXT,
    "suggestion" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "availabilityLostAt" TIMESTAMP(3),
    "reservationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestEquipment" (
    "requestId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,

    CONSTRAINT "RequestEquipment_pkey" PRIMARY KEY ("requestId","equipmentId")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publicTitle" TEXT,
    "showPublicTitle" BOOLEAN NOT NULL DEFAULT false,
    "responsible" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "participants" INTEGER NOT NULL,
    "notes" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "ReservationSource" NOT NULL DEFAULT 'ADMIN',
    "createdById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationEquipment" (
    "reservationId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,

    CONSTRAINT "ReservationEquipment_pkey" PRIMARY KEY ("reservationId","equipmentId")
);

-- CreateTable
CREATE TABLE "RecurringMeeting" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "publicTitle" TEXT,
    "showPublicTitle" BOOLEAN NOT NULL DEFAULT true,
    "roomId" TEXT NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "monthDay" INTEGER,
    "nthWeek" INTEGER,
    "rrule" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "participants" INTEGER NOT NULL,
    "status" "RecurringStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedFrom" DATE,
    "suspendedUntil" DATE,
    "previousSeriesId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringEquipment" (
    "recurringMeetingId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,

    CONSTRAINT "RecurringEquipment_pkey" PRIMARY KEY ("recurringMeetingId","equipmentId")
);

-- CreateTable
CREATE TABLE "RecurrenceException" (
    "id" TEXT NOT NULL,
    "recurringMeetingId" TEXT NOT NULL,
    "originalDate" DATE NOT NULL,
    "type" "ExceptionType" NOT NULL,
    "newRoomId" TEXT,
    "newStartTime" TEXT,
    "newEndTime" TEXT,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurrenceException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityBlock" (
    "id" TEXT NOT NULL,
    "roomId" TEXT,
    "title" TEXT NOT NULL,
    "type" "BlockType" NOT NULL DEFAULT 'OTHER',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "unitName" TEXT NOT NULL DEFAULT 'Reservas de Salas',
    "headerSubtitle" TEXT DEFAULT 'Agenda de salas de reuniões',
    "footerText" TEXT,
    "logoData" BYTEA,
    "logoMimeType" TEXT,
    "logoUpdatedAt" TIMESTAMP(3),
    "defaultOpenTime" TEXT NOT NULL DEFAULT '07:00',
    "defaultCloseTime" TEXT NOT NULL DEFAULT '22:00',
    "minAdvanceMinutes" INTEGER NOT NULL DEFAULT 60,
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 180,
    "showPublicTitles" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT false,
    "notificationEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Room_name_key" ON "Room"("name");

-- CreateIndex
CREATE INDEX "Room_active_idx" ON "Room"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_key_key" ON "Equipment"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_name_key" ON "Equipment"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationRequest_sequence_key" ON "ReservationRequest"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationRequest_protocol_key" ON "ReservationRequest"("protocol");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationRequest_reservationId_key" ON "ReservationRequest"("reservationId");

-- CreateIndex
CREATE INDEX "ReservationRequest_status_sequence_idx" ON "ReservationRequest"("status", "sequence");

-- CreateIndex
CREATE INDEX "ReservationRequest_roomId_startAt_endAt_idx" ON "ReservationRequest"("roomId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "Reservation_roomId_startAt_endAt_idx" ON "Reservation"("roomId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "Reservation_status_startAt_idx" ON "Reservation"("status", "startAt");

-- CreateIndex
CREATE INDEX "RecurringMeeting_roomId_status_idx" ON "RecurringMeeting"("roomId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RecurrenceException_recurringMeetingId_originalDate_key" ON "RecurrenceException"("recurringMeetingId", "originalDate");

-- CreateIndex
CREATE INDEX "AvailabilityBlock_startAt_endAt_idx" ON "AvailabilityBlock"("startAt", "endAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "RoomEquipment" ADD CONSTRAINT "RoomEquipment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomEquipment" ADD CONSTRAINT "RoomEquipment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationRequest" ADD CONSTRAINT "ReservationRequest_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationRequest" ADD CONSTRAINT "ReservationRequest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEquipment" ADD CONSTRAINT "RequestEquipment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ReservationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEquipment" ADD CONSTRAINT "RequestEquipment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationEquipment" ADD CONSTRAINT "ReservationEquipment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationEquipment" ADD CONSTRAINT "ReservationEquipment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringMeeting" ADD CONSTRAINT "RecurringMeeting_previousSeriesId_fkey" FOREIGN KEY ("previousSeriesId") REFERENCES "RecurringMeeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringMeeting" ADD CONSTRAINT "RecurringMeeting_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringEquipment" ADD CONSTRAINT "RecurringEquipment_recurringMeetingId_fkey" FOREIGN KEY ("recurringMeetingId") REFERENCES "RecurringMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringEquipment" ADD CONSTRAINT "RecurringEquipment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurrenceException" ADD CONSTRAINT "RecurrenceException_recurringMeetingId_fkey" FOREIGN KEY ("recurringMeetingId") REFERENCES "RecurringMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurrenceException" ADD CONSTRAINT "RecurrenceException_newRoomId_fkey" FOREIGN KEY ("newRoomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityBlock" ADD CONSTRAINT "AvailabilityBlock_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- Proteções adicionais escritas manualmente (não geradas pelo Prisma)
-- =============================================================================

-- 1) Impede, no nível do banco de dados, duas reservas CONFIRMADAS da mesma
--    sala com horários sobrepostos — mesmo em aprovações simultâneas.
--    O intervalo é semiaberto '[)': 14h–16h não conflita com 16h–18h.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_no_overlap"
  EXCLUDE USING gist (
    "roomId" WITH =,
    tsrange("startAt", "endAt", '[)') WITH &&
  ) WHERE ("status" = 'CONFIRMED');

-- 2) Coerência de intervalos e valores.
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_valid_range" CHECK ("endAt" > "startAt");
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_participants_positive" CHECK ("participants" >= 1);
ALTER TABLE "ReservationRequest" ADD CONSTRAINT "ReservationRequest_valid_range" CHECK ("endAt" > "startAt");
ALTER TABLE "ReservationRequest" ADD CONSTRAINT "ReservationRequest_participants_positive" CHECK ("participants" >= 1);
ALTER TABLE "AvailabilityBlock" ADD CONSTRAINT "AvailabilityBlock_valid_range" CHECK ("endAt" > "startAt");
ALTER TABLE "Room" ADD CONSTRAINT "Room_capacity_positive" CHECK ("capacity" >= 1);
ALTER TABLE "RecurringMeeting" ADD CONSTRAINT "RecurringMeeting_valid_times" CHECK ("endTime" > "startTime");
ALTER TABLE "RecurringMeeting" ADD CONSTRAINT "RecurringMeeting_valid_dates" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_singleton" CHECK ("id" = 1);

-- 3) Datas são gravadas em UTC (as colunas TIMESTAMP não têm fuso). Garante
--    que valores padrão como CURRENT_TIMESTAMP também usem UTC, mesmo que o
--    servidor PostgreSQL esteja configurado em outro fuso.
DO $$ BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO ''UTC''', current_database());
END $$;
