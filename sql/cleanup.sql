-- ============================================================================
-- Collections Prioritization Copilot: cleanup. Drops everything sql/setup.sql
-- created: the database (tables, views, dynamic tables, the model and its
-- version, procedures, the task, the semantic view, and the agent), the
-- warehouse, and the role. Nothing else is touched.
-- ============================================================================
-- Objects are owned by the example role, so drop them as that role first.
USE ROLE COLLECTIONS_COPILOT_ROLE;
ALTER TASK IF EXISTS COLLECTIONS_COPILOT.ML.SCORE_ACCOUNTS_TASK SUSPEND;
DROP AGENT IF EXISTS COLLECTIONS_COPILOT.APP.COLLECTIONS_AGENT;

USE ROLE SYSADMIN;
DROP DATABASE IF EXISTS COLLECTIONS_COPILOT;
DROP WAREHOUSE IF EXISTS COLLECTIONS_COPILOT_WH;

USE ROLE ACCOUNTADMIN;
DROP ROLE IF EXISTS COLLECTIONS_COPILOT_ROLE;
