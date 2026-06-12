ALTER TABLE project
    ADD COLUMN IF NOT EXISTS cli_all_permissions BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN project.cli_all_permissions IS
    'When true, Dev Studio CLI launch uses provider trust / bypass permission flags.';
