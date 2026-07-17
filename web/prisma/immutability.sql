-- Apply after `prisma db push`. Prisma does not model PostgreSQL triggers.
-- The application role may INSERT, but cannot rewrite legally significant history.
CREATE OR REPLACE FUNCTION reject_immutable_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bids_are_append_only ON bids;
CREATE TRIGGER bids_are_append_only
BEFORE UPDATE OR DELETE ON bids
FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

DROP TRIGGER IF EXISTS bid_events_are_append_only ON bid_events;
CREATE TRIGGER bid_events_are_append_only
BEFORE UPDATE OR DELETE ON bid_events
FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

DROP TRIGGER IF EXISTS verification_audit_is_append_only ON verification_audit_logs;
CREATE TRIGGER verification_audit_is_append_only
BEFORE UPDATE OR DELETE ON verification_audit_logs
FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

DROP TRIGGER IF EXISTS audit_events_are_append_only ON audit_events;
CREATE TRIGGER audit_events_are_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

DROP TRIGGER IF EXISTS logbook_exports_are_append_only ON bid_logbook_exports;
CREATE TRIGGER logbook_exports_are_append_only
BEFORE UPDATE OR DELETE ON bid_logbook_exports
FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

-- A bid insertion transaction must acquire pg_advisory_xact_lock(hashtext(listing_id::text)),
-- read the latest entry_hash, and insert previous_hash + the canonical payload hash.
-- Store generated PDFs in object storage with retention/object-lock enabled.
