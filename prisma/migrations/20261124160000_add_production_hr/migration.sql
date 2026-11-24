CREATE TABLE "ProductionEmployee" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "employeeNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "hiredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionEmployee_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionEmployee_status_check"
      CHECK ("status" IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE "ProductionRosterShift" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "shiftName" TEXT NOT NULL,
    "workCenter" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionRosterShift_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionRosterShift_time_check"
      CHECK ("endsAt" > "startsAt"),
    CONSTRAINT "ProductionRosterShift_break_check"
      CHECK ("breakMinutes" BETWEEN 0 AND 600),
    CONSTRAINT "ProductionRosterShift_status_check"
      CHECK ("status" IN ('PLANNED', 'ATTENDED'))
);

CREATE TABLE "ProductionAttendance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rosterShiftId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "clockedInAt" TIMESTAMP(3) NOT NULL,
    "clockedOutAt" TIMESTAMP(3),
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionAttendance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionAttendance_overtime_check"
      CHECK ("overtimeMinutes" BETWEEN 0 AND 1440),
    CONSTRAINT "ProductionAttendance_clockout_check"
      CHECK ("clockedOutAt" IS NULL OR "clockedOutAt" >= "clockedInAt")
);

CREATE TABLE "ProductionLeaveRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "leaveType" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ProductionLeaveRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionLeaveRequest_type_check"
      CHECK ("leaveType" IN ('ANNUAL', 'SICK', 'UNPAID', 'OTHER')),
    CONSTRAINT "ProductionLeaveRequest_status_check"
      CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED')),
    CONSTRAINT "ProductionLeaveRequest_dates_check"
      CHECK ("endsAt" >= "startsAt")
);

CREATE TABLE "ProductionSafetyTraining" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "trainingName" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT '',
    "completedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionSafetyTraining_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionSafetyTraining_expiry_check"
      CHECK ("expiresAt" IS NULL OR "expiresAt" >= "completedAt")
);

CREATE UNIQUE INDEX "ProductionEmployee_organizationId_employeeNo_key"
  ON "ProductionEmployee"("organizationId", "employeeNo");
CREATE INDEX "ProductionEmployee_organizationId_status_name_idx"
  ON "ProductionEmployee"("organizationId", "status", "name");
CREATE INDEX "ProductionRosterShift_organizationId_startsAt_status_idx"
  ON "ProductionRosterShift"("organizationId", "startsAt", "status");
CREATE INDEX "ProductionRosterShift_employeeId_startsAt_idx"
  ON "ProductionRosterShift"("employeeId", "startsAt");
CREATE UNIQUE INDEX "ProductionAttendance_rosterShiftId_key"
  ON "ProductionAttendance"("rosterShiftId");
CREATE INDEX "ProductionAttendance_organizationId_clockedInAt_idx"
  ON "ProductionAttendance"("organizationId", "clockedInAt");
CREATE INDEX "ProductionLeaveRequest_organizationId_status_startsAt_idx"
  ON "ProductionLeaveRequest"("organizationId", "status", "startsAt");
CREATE INDEX "ProductionLeaveRequest_employeeId_startsAt_endsAt_idx"
  ON "ProductionLeaveRequest"("employeeId", "startsAt", "endsAt");
CREATE INDEX "ProductionSafetyTraining_organizationId_expiresAt_idx"
  ON "ProductionSafetyTraining"("organizationId", "expiresAt");
CREATE INDEX "ProductionSafetyTraining_employeeId_completedAt_idx"
  ON "ProductionSafetyTraining"("employeeId", "completedAt");

ALTER TABLE "ProductionEmployee"
  ADD CONSTRAINT "ProductionEmployee_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionEmployee"
  ADD CONSTRAINT "ProductionEmployee_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionRosterShift"
  ADD CONSTRAINT "ProductionRosterShift_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionRosterShift"
  ADD CONSTRAINT "ProductionRosterShift_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "ProductionEmployee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionRosterShift"
  ADD CONSTRAINT "ProductionRosterShift_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionAttendance"
  ADD CONSTRAINT "ProductionAttendance_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionAttendance"
  ADD CONSTRAINT "ProductionAttendance_rosterShiftId_fkey"
  FOREIGN KEY ("rosterShiftId") REFERENCES "ProductionRosterShift"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionAttendance"
  ADD CONSTRAINT "ProductionAttendance_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionLeaveRequest"
  ADD CONSTRAINT "ProductionLeaveRequest_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionLeaveRequest"
  ADD CONSTRAINT "ProductionLeaveRequest_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "ProductionEmployee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionLeaveRequest"
  ADD CONSTRAINT "ProductionLeaveRequest_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionLeaveRequest"
  ADD CONSTRAINT "ProductionLeaveRequest_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionSafetyTraining"
  ADD CONSTRAINT "ProductionSafetyTraining_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionSafetyTraining"
  ADD CONSTRAINT "ProductionSafetyTraining_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "ProductionEmployee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionSafetyTraining"
  ADD CONSTRAINT "ProductionSafetyTraining_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
