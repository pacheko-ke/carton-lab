DO $$
DECLARE
    foreign_key RECORD;
BEGIN
    FOR foreign_key IN
        SELECT conrelid::regclass AS table_name, conname
        FROM pg_constraint
        WHERE contype = 'f'
          AND confrelid = '"ProductionOrganization"'::regclass
    LOOP
        EXECUTE format(
            'ALTER TABLE %s DROP CONSTRAINT %I',
            foreign_key.table_name,
            foreign_key.conname
        );
    END LOOP;
END $$;

DO $$
DECLARE
    table_name TEXT;
    index_record RECORD;
    renamed_index TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'ProductionNotification',
        'ProductionEmployee',
        'ProductionRosterShift',
        'ProductionAttendance',
        'ProductionLeaveRequest',
        'ProductionSafetyTraining',
        'ProductionJob',
        'ProductionOperationSchedule',
        'ProductionOperationRun',
        'ProductionQualityInspection',
        'ProductionNonconformance',
        'ProductionTooling',
        'ProductionToolingEvent',
        'ProductionMachine',
        'ProductionMaintenancePlan',
        'ProductionMaintenanceTicket',
        'ProductionMaterial',
        'ProductionSupplier',
        'ProductionPurchaseOrder',
        'ProductionStockMovement',
        'ProductionPaperReel',
        'ProductionReelMovement',
        'ProductionWarehousePallet',
        'ProductionDispatch',
        'ProductionInvoice',
        'ProductionItem',
        'ProductionQuote'
    ]
    LOOP
        EXECUTE format(
            'ALTER TABLE %I RENAME COLUMN "organizationId" TO "workspaceId"',
            table_name
        );
        EXECUTE format(
            'UPDATE %I SET "workspaceId" = %L',
            table_name,
            'global-production'
        );
        EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN "workspaceId" SET DEFAULT %L',
            table_name,
            'global-production'
        );
    END LOOP;

    FOR index_record IN
        SELECT schemaname, indexname
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname LIKE '%organizationId%'
    LOOP
        renamed_index := replace(index_record.indexname, 'organizationId', 'workspaceId');
        IF NOT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = index_record.schemaname
              AND indexname = renamed_index
        ) THEN
            EXECUTE format(
                'ALTER INDEX %I.%I RENAME TO %I',
                index_record.schemaname,
                index_record.indexname,
                renamed_index
            );
        END IF;
    END LOOP;
END $$;

DROP TABLE "ProductionOrganization";
