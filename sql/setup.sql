-- ============================================================================
-- Collections Prioritization Copilot: Snowflake setup
-- Synthetic data and illustrative logic only. Not a production collections
-- system, and not legal, regulatory, or compliance advice. Contact rules here
-- are illustrative, not a statement of any law.
-- ============================================================================
-- Run top to bottom in a Snowsight SQL worksheet. No edits or find-and-replace.
--
-- Requires: ACCOUNTADMIN (or USERADMIN + SECURITYADMIN) and SYSADMIN.
-- Cortex AI (AI_CLASSIFY, AI_COMPLETE, Cortex Agents) in your region or with
-- cross-region inference enabled. Standard Edition is enough.
--
-- Creates (sql/cleanup.sql drops all of it); changes nothing that already exists:
--   role       COLLECTIONS_COPILOT_ROLE   least-privilege pipeline + app role
--   warehouse  COLLECTIONS_COPILOT_WH     XSMALL, AUTO_SUSPEND = 60
--   database   COLLECTIONS_COPILOT        schemas RAW, ML, APP
--   RAW        CONFIG, REGIONS, ACCOUNTS, DELINQUENCY_DAILY, PAYMENTS,
--              CONTACT_ATTEMPTS, PROMISES_TO_PAY, HARDSHIP_PROGRAMS,
--              HARDSHIP_ENROLLMENTS, DISASTER_DECLARATIONS, CALL_TRANSCRIPTS,
--              function U (seeded uniform random)
--   ML         view SNAPSHOTS, dynamic tables ACCOUNT_FEATURES and CONTACT_PROFILE,
--              model ROLL_RISK_XGB (V1), procedures TRAIN_MODEL / SCORE_ACCOUNTS,
--              task SCORE_ACCOUNTS_TASK (created suspended), tables MODEL_EVAL, SCORES
--   APP        dynamic table TODAY_QUEUE, tables TRANSCRIPT_QA, ACCOUNT_ACTIONS,
--              views, semantic view COLLECTIONS_SV, agent COLLECTIONS_AGENT
-- ============================================================================

-- --------------------------------------------------------------------------
-- 0. Account-level: one least-privilege role for the pipeline and the app
-- --------------------------------------------------------------------------
USE ROLE ACCOUNTADMIN;
CREATE ROLE IF NOT EXISTS COLLECTIONS_COPILOT_ROLE
  COMMENT = 'Collections Prioritization Copilot example: owns only objects in COLLECTIONS_COPILOT';
GRANT ROLE COLLECTIONS_COPILOT_ROLE TO ROLE SYSADMIN;
SET my_user = CURRENT_USER();
GRANT ROLE COLLECTIONS_COPILOT_ROLE TO USER IDENTIFIER($my_user);
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE COLLECTIONS_COPILOT_ROLE; -- AI_CLASSIFY, AI_COMPLETE, Cortex Agents
GRANT EXECUTE TASK ON ACCOUNT TO ROLE COLLECTIONS_COPILOT_ROLE;           -- the scoring task

-- --------------------------------------------------------------------------
-- 1. Warehouse, database, schemas (SYSADMIN), with schema-scoped grants only
-- --------------------------------------------------------------------------
USE ROLE SYSADMIN;
CREATE WAREHOUSE IF NOT EXISTS COLLECTIONS_COPILOT_WH
  WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE
  COMMENT = 'Collections Prioritization Copilot example';
CREATE DATABASE IF NOT EXISTS COLLECTIONS_COPILOT COMMENT = 'Collections Prioritization Copilot example (synthetic data)';
CREATE SCHEMA IF NOT EXISTS COLLECTIONS_COPILOT.RAW;
CREATE SCHEMA IF NOT EXISTS COLLECTIONS_COPILOT.ML;
CREATE SCHEMA IF NOT EXISTS COLLECTIONS_COPILOT.APP;

GRANT USAGE, OPERATE ON WAREHOUSE COLLECTIONS_COPILOT_WH TO ROLE COLLECTIONS_COPILOT_ROLE;
GRANT USAGE ON DATABASE COLLECTIONS_COPILOT TO ROLE COLLECTIONS_COPILOT_ROLE;
GRANT USAGE, CREATE TABLE, CREATE VIEW, CREATE FUNCTION ON SCHEMA COLLECTIONS_COPILOT.RAW TO ROLE COLLECTIONS_COPILOT_ROLE;
GRANT USAGE, CREATE TABLE, CREATE VIEW, CREATE DYNAMIC TABLE, CREATE MODEL, CREATE PROCEDURE, CREATE TASK, CREATE STAGE
  ON SCHEMA COLLECTIONS_COPILOT.ML TO ROLE COLLECTIONS_COPILOT_ROLE;
GRANT USAGE, CREATE TABLE, CREATE VIEW, CREATE DYNAMIC TABLE, CREATE SEMANTIC VIEW, CREATE AGENT
  ON SCHEMA COLLECTIONS_COPILOT.APP TO ROLE COLLECTIONS_COPILOT_ROLE;

-- Everything below runs as the least-privilege role.
USE ROLE COLLECTIONS_COPILOT_ROLE;
USE WAREHOUSE COLLECTIONS_COPILOT_WH;
USE SCHEMA COLLECTIONS_COPILOT.RAW;

-- --------------------------------------------------------------------------
-- 2. Seeded synthetic data. U(i, k) is a deterministic uniform [0, 1) draw,
--    so every run produces the same rows. Daily history runs 2026-08-01 to
--    2026-11-15; the business clock is frozen at Monday 2026-11-16 08:00.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION U(I NUMBER, K STRING) RETURNS FLOAT
  AS 'MOD(ABS(HASH(I, K)), 1000000007)::FLOAT / 1000000007';

CREATE OR REPLACE TABLE CONFIG (AS_OF_DATE DATE, NOW_TS TIMESTAMP_NTZ, LENDER STRING, CALL_LIMIT_7D NUMBER) AS
SELECT '2026-11-15'::DATE, '2026-11-16 08:00:00'::TIMESTAMP_NTZ, 'Northwind Financial', 7;

CREATE OR REPLACE TABLE REGIONS (REGION_ID NUMBER, CITY STRING, STATE STRING, ZIP3 STRING) AS
SELECT column1, column2, column3, column4 FROM VALUES
 (0,'Columbus','OH','432'),(1,'Tampa','FL','336'),(2,'Phoenix','AZ','850'),(3,'Charlotte','NC','282'),
 (4,'Dallas','TX','752'),(5,'Lafayette','LA','705'),(6,'Atlanta','GA','303'),(7,'Denver','CO','802'),
 (8,'Indianapolis','IN','462'),(9,'Nashville','TN','372'),(10,'Sacramento','CA','958'),(11,'Kansas City','MO','641');

-- Hidden generator state (latent risk and contact preferences); dropped at the end of this section.
CREATE OR REPLACE TEMPORARY TABLE LATENT AS
WITH n AS (SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) AS I FROM TABLE(GENERATOR(ROWCOUNT => 30000)))
SELECT I, 'L' || LPAD(I, 6, '0') AS ACCOUNT_ID,
  CASE WHEN I BETWEEN 19001 AND 19240 THEN 0.35 WHEN I BETWEEN 18001 AND 18150 THEN 0.7 WHEN I BETWEEN 17001 AND 17180 THEN 0.3 ELSE U(I, 'risk') END AS R,
  CASE WHEN I BETWEEN 19001 AND 19240 THEN 0.85 ELSE U(I, 'resp') END AS Q,
  CASE WHEN I BETWEEN 19001 AND 19240 THEN 'SMS' WHEN U(I, 'pch') < 0.5 THEN 'CALL' WHEN U(I, 'pch') < 0.85 THEN 'SMS' ELSE 'EMAIL' END AS PREF_CHANNEL,
  CASE WHEN I BETWEEN 19001 AND 19240 THEN 'EVENING' WHEN U(I, 'pband') < 0.35 THEN 'MORNING' WHEN U(I, 'pband') < 0.65 THEN 'AFTERNOON' ELSE 'EVENING' END AS PREF_BAND,
  CASE WHEN I BETWEEN 17001 AND 19240 AND (I <= 17180 OR I > 18000) AND (I <= 18150 OR I > 19000) THEN TRUE
       ELSE U(I, 'del') < 0.05 + 0.22 * U(I, 'risk') END AS DELINQ
FROM n;

-- 30,000 auto and personal loans.
CREATE OR REPLACE TABLE ACCOUNTS AS
WITH f AS (SELECT INDEX AS I, VALUE::STRING AS N FROM TABLE(FLATTEN(INPUT => SPLIT('Ava,Liam,Maya,Noah,Iris,Owen,Lena,Ezra,Nora,Caleb,Ruth,Milo,Hazel,Jonah,Clara,Felix,Sofia,Theo,Leah,Adrian,Mira,Elias,June,Rowan,Esme,Silas,Talia,Jude,Priya,Marcus,Yara,Dmitri,Ines,Kofi,Mei,Rafael,Anya,Tomas,Leila,Victor', ',')))),
     l AS (SELECT INDEX AS I, VALUE::STRING AS N FROM TABLE(FLATTEN(INPUT => SPLIT('Abernell,Brightwater,Castellane,Dunmore,Everly,Farrowind,Galloway,Hartwell,Ivers,Jessup,Kincaid,Lindqvist,Marchetti,Nakamura,Okafor,Pemberton,Quill,Ravensdale,Sorensen,Thorne,Underhill,Valdez,Whitlock,Yardley,Zielinski,Ashcombe,Bellamy,Corwin,Delacroix,Ellsworth', ','))))
SELECT x.ACCOUNT_ID, f.N || ' ' || l.N AS CUSTOMER_NAME, f.N AS FIRST_NAME,
  IFF(U(x.I, 'prod') < 0.62, 'AUTO', 'PERSONAL') AS PRODUCT,
  r.CITY, r.STATE,
  IFF(x.I BETWEEN 17001 AND 17180, '705' || LPAD(1 + MOD(x.I, 20), 2, '0'), r.ZIP3 || LPAD(FLOOR(U(x.I, 'zip') * 100), 2, '0')) AS ZIP,
  ROUND(LEAST(830, GREATEST(520, 800 - x.R * 220 + (U(x.I, 'cs') - 0.5) * 40))) AS CREDIT_SCORE,
  ROUND(IFF(U(x.I, 'prod') < 0.62, 12000 + U(x.I, 'amt') * 36000, 3000 + U(x.I, 'amt') * 22000), -2) AS ORIGINAL_AMOUNT,
  FLOOR(x.R * 3 * U(x.I, 'prior')) AS PRIOR_DELINQ_12M,
  1 + MOD(x.I, 28) AS DUE_DAY,
  IFF(x.I BETWEEN 19001 AND 19240, TRUE, U(x.I, 'sms') < 0.72) AS SMS_CONSENT,
  IFF(U(x.I, 'lang') < 0.12, 'Spanish', 'English') AS PREFERRED_LANGUAGE,
  LPAD(MOD(ABS(HASH(x.I, 'last4')), 10000), 4, '0') AS LAST4,
  DATEADD(MONTH, -FLOOR(6 + U(x.I, 'open') * 40), '2026-08-01'::DATE) AS OPENED_ON
FROM LATENT x
JOIN REGIONS r ON r.REGION_ID = IFF(x.I BETWEEN 17001 AND 17180, 5, MOD(x.I * 7, 12))
JOIN f ON f.I = FLOOR(U(x.I, 'first') * 40) JOIN l ON l.I = FLOOR(U(x.I, 'last') * 30);
ALTER TABLE ACCOUNTS ADD COLUMN PRINCIPAL_BALANCE NUMBER(12, 2);
ALTER TABLE ACCOUNTS ADD COLUMN MONTHLY_PAYMENT NUMBER(10, 2);
UPDATE ACCOUNTS SET PRINCIPAL_BALANCE = ROUND(ORIGINAL_AMOUNT * (0.35 + U(TO_NUMBER(SUBSTR(ACCOUNT_ID, 2)), 'bal') * 0.6), 2);
UPDATE ACCOUNTS SET MONTHLY_PAYMENT = ROUND(ORIGINAL_AMOUNT / IFF(PRODUCT = 'AUTO', 60, 36) * 1.12, 2);

-- One delinquency episode per delinquent account. Cure odds fall with risk and
-- with broken promises, which is what the roll-risk model learns.
CREATE OR REPLACE TEMPORARY TABLE EPISODES AS
WITH e AS (
  SELECT x.*, a.MONTHLY_PAYMENT, a.ZIP,
    CASE WHEN x.I BETWEEN 19001 AND 19240 THEN DATEADD(DAY, MOD(x.I, 20), '2026-10-12'::DATE)
         WHEN x.I BETWEEN 18001 AND 18150 THEN DATEADD(DAY, MOD(x.I, 20), '2026-10-01'::DATE)
         WHEN x.I BETWEEN 17001 AND 17180 THEN DATEADD(DAY, MOD(x.I, 11), '2026-10-29'::DATE)
         ELSE DATEADD(DAY, FLOOR(U(x.I, 'start') * 209), '2026-04-15'::DATE) END AS START_DATE,
    IFF(x.I BETWEEN 17001 AND 19240, 0, FLOOR(U(x.I, 'np') * 3.3)) AS K,
    0.85 - 0.6 * x.R AS PK
  FROM LATENT x JOIN ACCOUNTS a ON a.ACCOUNT_ID = x.ACCOUNT_ID WHERE x.DELINQ),
k AS (
  SELECT e.*, (U(I, 'keep1') < PK) AS K1, (U(I, 'keep2') < PK) AS K2, (U(I, 'keep3') < PK) AS K3 FROM e),
b AS (
  SELECT k.*, IFF(K >= 1 AND NOT K1, 1, 0) + IFF(K >= 2 AND NOT K2, 1, 0) + IFF(K >= 3 AND NOT K3, 1, 0) AS BROKEN_PLAN,
         IFF(K >= 1 AND K1, 1, 0) + IFF(K >= 2 AND K2, 1, 0) + IFF(K >= 3 AND K3, 1, 0) AS KEPT_PLAN FROM k)
SELECT b.*,
  IFF(I BETWEEN 17001 AND 19240, FALSE,
      U(I, 'cure') < LEAST(0.97, GREATEST(0.03, 1.02 - 0.55 * R - 0.3 * BROKEN_PLAN + 0.06 * KEPT_PLAN + 0.4 * (Q - 0.5)))) AS CURED60,
  IFF(K = 0, 0, 6 + 13 * (K - 1)) AS LAST_PROMISE_OFFSET
FROM b;
ALTER TABLE EPISODES ADD COLUMN CURE_DATE DATE;
UPDATE EPISODES SET CURE_DATE = CASE
  WHEN CURED60 THEN DATEADD(DAY, LEAST(58, GREATEST(3 + FLOOR(POWER(U(I, 'cd'), 2) * 55), LAST_PROMISE_OFFSET + 8)), START_DATE)
  WHEN U(I, 'late') < 0.2 AND NOT (I BETWEEN 17001 AND 19240) THEN DATEADD(DAY, 61 + FLOOR(U(I, 'lcd') * 50), START_DATE) END;
UPDATE EPISODES SET CURE_DATE = NULL WHERE CURE_DATE > '2026-11-15';

-- Daily delinquency snapshot for every open loan: days past due and amount past due.
-- Loans are charged off and leave the servicing book after 120 days past due.
CREATE OR REPLACE TABLE DELINQUENCY_DAILY AS SELECT * FROM (
WITH d AS (SELECT DATEADD(DAY, SEQ4(), '2026-08-01'::DATE) AS AS_OF_DATE FROM TABLE(GENERATOR(ROWCOUNT => 107)))
SELECT a.ACCOUNT_ID, d.AS_OF_DATE,
  IFF(e.START_DATE IS NOT NULL AND d.AS_OF_DATE >= e.START_DATE AND (e.CURE_DATE IS NULL OR d.AS_OF_DATE < e.CURE_DATE),
      DATEDIFF(DAY, e.START_DATE, d.AS_OF_DATE) + 1, 0) AS DPD,
  ROUND(a.MONTHLY_PAYMENT * CEIL(DPD / 30), 2) AS PAST_DUE,
  a.PRINCIPAL_BALANCE AS BALANCE
FROM ACCOUNTS a CROSS JOIN d LEFT JOIN EPISODES e ON e.ACCOUNT_ID = a.ACCOUNT_ID) WHERE DPD <= 120;

-- Promises to pay from the history (the story promises are added below).
CREATE OR REPLACE TABLE PROMISES_TO_PAY (PROMISE_ID STRING, ACCOUNT_ID STRING, CREATED_DATE DATE, CHANNEL STRING,
  PROMISE_AMOUNT NUMBER(10, 2), DUE_DATE DATE, STATUS STRING, SOURCE STRING) AS
WITH j AS (SELECT column1 AS J FROM VALUES (1), (2), (3)),
p AS (
  SELECT e.ACCOUNT_ID, e.I, j.J, DATEADD(DAY, 6 + 13 * (j.J - 1), e.START_DATE) AS CREATED_DATE, e.MONTHLY_PAYMENT, e.CURE_DATE,
         CASE j.J WHEN 1 THEN e.K1 WHEN 2 THEN e.K2 ELSE e.K3 END AS KEPT, e.PREF_CHANNEL
  FROM EPISODES e JOIN j ON j.J <= e.K)
SELECT 'P' || LPAD(I, 6, '0') || J, ACCOUNT_ID, CREATED_DATE, IFF(PREF_CHANNEL = 'SMS', 'SMS', 'CALL'),
  ROUND(MONTHLY_PAYMENT * (0.5 + U(I * 10 + J, 'pamt') * 0.5), 2), DATEADD(DAY, 7, CREATED_DATE),
  CASE WHEN DATEADD(DAY, 7, CREATED_DATE) > '2026-11-15' THEN 'PENDING' WHEN KEPT THEN 'KEPT' ELSE 'BROKEN' END, 'HISTORY'
FROM p WHERE CREATED_DATE <= '2026-11-15' AND (CURE_DATE IS NULL OR CREATED_DATE < CURE_DATE);

-- (2) Broken promises: 150 accounts (L018001 to L018150) promised twice in late
--     October and November and broke both promises; none has cured.
INSERT INTO PROMISES_TO_PAY
SELECT 'P' || LPAD(I, 6, '0') || column1, ACCOUNT_ID, column2::DATE, 'CALL', ROUND(MONTHLY_PAYMENT * column3, 2), column4::DATE, 'BROKEN', 'HISTORY'
FROM EPISODES, (SELECT * FROM VALUES (1, '2026-10-27', 0.9, '2026-11-03'), (2, '2026-11-04', 0.6, '2026-11-10'))
WHERE I BETWEEN 18001 AND 18150;
-- (1) Evening texters promise by text.
INSERT INTO PROMISES_TO_PAY
SELECT 'P' || LPAD(I, 6, '0') || '1', ACCOUNT_ID, DATEADD(DAY, 9, START_DATE), 'SMS', ROUND(MONTHLY_PAYMENT * 0.5, 2), DATEADD(DAY, 16, START_DATE),
       IFF(DATEADD(DAY, 16, START_DATE) > '2026-11-15', 'PENDING', 'KEPT'), 'HISTORY'
FROM EPISODES WHERE I BETWEEN 19001 AND 19240 AND MOD(I, 3) = 0;

-- Payments: monthly installments when current, kept promises, and the cure payment.
CREATE OR REPLACE TABLE PAYMENTS AS
WITH m AS (SELECT column1 AS M FROM VALUES (8), (9), (10), (11)),
reg AS (
  SELECT a.ACCOUNT_ID, DATE_FROM_PARTS(2026, m.M, a.DUE_DAY) AS PAID_ON, a.MONTHLY_PAYMENT AS AMOUNT, 'INSTALLMENT' AS KIND
  FROM ACCOUNTS a CROSS JOIN m LEFT JOIN EPISODES e ON e.ACCOUNT_ID = a.ACCOUNT_ID
  WHERE DATE_FROM_PARTS(2026, m.M, a.DUE_DAY) <= '2026-11-15'
    AND (e.START_DATE IS NULL OR DATE_FROM_PARTS(2026, m.M, a.DUE_DAY) < DATEADD(DAY, -1, e.START_DATE)
         OR (e.CURE_DATE IS NOT NULL AND DATE_FROM_PARTS(2026, m.M, a.DUE_DAY) > e.CURE_DATE)))
SELECT 'PAY' || LPAD(ROW_NUMBER() OVER (ORDER BY PAID_ON, ACCOUNT_ID), 7, '0') AS PAYMENT_ID, ACCOUNT_ID, PAID_ON, AMOUNT, KIND FROM (
  SELECT * FROM reg
  UNION ALL SELECT ACCOUNT_ID, DUE_DATE, PROMISE_AMOUNT, 'PROMISE' FROM PROMISES_TO_PAY WHERE STATUS = 'KEPT'
  UNION ALL SELECT e.ACCOUNT_ID, e.CURE_DATE, ROUND(e.MONTHLY_PAYMENT * CEIL((DATEDIFF(DAY, e.START_DATE, e.CURE_DATE)) / 30), 2), 'CURE'
            FROM EPISODES e WHERE e.CURE_DATE IS NOT NULL);

-- Contact attempts during each episode: calls, texts, and emails with outcomes.
-- Customers answer far more often on their own preferred channel and time of day.
CREATE OR REPLACE TABLE CONTACT_ATTEMPTS AS
WITH o AS (SELECT SEQ4() AS OFF FROM TABLE(GENERATOR(ROWCOUNT => 121))),
a AS (
  SELECT e.ACCOUNT_ID, e.I, e.Q, e.PREF_CHANNEL, e.PREF_BAND, o.OFF, DATEADD(DAY, o.OFF, e.START_DATE) AS DAY, c.SMS_CONSENT,
         U(e.I * 1000 + o.OFF, 'ch') AS RC, U(e.I * 1000 + o.OFF, 'hr') AS RH
  FROM EPISODES e JOIN o ON o.OFF >= 2 JOIN ACCOUNTS c ON c.ACCOUNT_ID = e.ACCOUNT_ID
  WHERE DATEADD(DAY, o.OFF, e.START_DATE) <= '2026-11-15'
    AND (e.CURE_DATE IS NULL OR DATEADD(DAY, o.OFF, e.START_DATE) < e.CURE_DATE)
    AND U(e.I * 1000 + o.OFF, 'att') < IFF(e.I BETWEEN 19001 AND 19240, 0.6, 0.35)
    AND NOT (e.I BETWEEN 18001 AND 18150 AND DATEADD(DAY, o.OFF, e.START_DATE) >= '2026-11-09')),
c AS (
  SELECT a.*,
    -- The default strategy: mostly daytime calls. Story (1) accounts are called at 10am and texted only now and then, at 7pm.
    CASE WHEN I BETWEEN 19001 AND 19240 THEN IFF(RC < 0.88, 'CALL', 'SMS')
         WHEN RC < 0.68 OR NOT SMS_CONSENT THEN IFF(RC < 0.9, 'CALL', 'EMAIL') WHEN RC < 0.9 THEN 'SMS' ELSE 'EMAIL' END AS CHANNEL,
    CASE WHEN I BETWEEN 19001 AND 19240 THEN IFF(RC < 0.88, 10, 19) ELSE 9 + FLOOR(RH * 11) END AS HR
  FROM a),
r AS (
  SELECT c.*, CASE WHEN HR < 12 THEN 'MORNING' WHEN HR < 17 THEN 'AFTERNOON' ELSE 'EVENING' END AS BAND FROM c)
SELECT 'CA' || LPAD(I, 6, '0') || LPAD(OFF, 3, '0') AS ATTEMPT_ID, ACCOUNT_ID,
  DATEADD(SECOND, FLOOR(U(I * 1000 + OFF, 'sec') * 3300), DATEADD(HOUR, HR, DAY::TIMESTAMP_NTZ)) AS ATTEMPT_TS,
  CHANNEL, BAND AS TIME_BAND,
  CASE WHEN U(I * 1000 + OFF, 'reach') < CASE WHEN CHANNEL = PREF_CHANNEL AND BAND = PREF_BAND THEN 0.2 + 0.55 * Q
                                              WHEN CHANNEL = PREF_CHANNEL THEN 0.08 + 0.15 * Q ELSE 0.04 END
       THEN IFF(CHANNEL = 'CALL', 'RIGHT_PARTY_CONTACT', 'REPLIED')
       WHEN CHANNEL = 'CALL' THEN CASE WHEN U(I * 1000 + OFF, 'fail') < 0.7 THEN 'NO_ANSWER' WHEN U(I * 1000 + OFF, 'fail') < 0.96 THEN 'LEFT_MESSAGE' ELSE 'WRONG_NUMBER' END
       ELSE 'NO_REPLY' END AS OUTCOME,
  IFF(CHANNEL = 'CALL', 'Agent', 'Automated') AS AGENT_TYPE
FROM r;
-- The conversation where each promise was made.
INSERT INTO CONTACT_ATTEMPTS
SELECT 'CP' || SUBSTR(PROMISE_ID, 2), ACCOUNT_ID,
  DATEADD(MINUTE, IFF(CHANNEL = 'SMS', 19 * 60 + 12, 11 * 60 + 5) + MOD(ABS(HASH(PROMISE_ID)), 40), CREATED_DATE::TIMESTAMP_NTZ),
  CHANNEL, IFF(CHANNEL = 'SMS', 'EVENING', 'MORNING'), 'PROMISE_MADE', IFF(CHANNEL = 'CALL', 'Agent', 'Automated')
FROM PROMISES_TO_PAY;
-- Story (2) accounts get six calls in the last seven days (the illustrative limit is 7).
INSERT INTO CONTACT_ATTEMPTS
SELECT 'CX' || LPAD(e.I, 6, '0') || n, e.ACCOUNT_ID, DATEADD(MINUTE, 9 * 60 + 20 + n * 97, DATEADD(DAY, n, '2026-11-09')::TIMESTAMP_NTZ), 'CALL',
       CASE WHEN 9 * 60 + 20 + n * 97 < 720 THEN 'MORNING' WHEN 9 * 60 + 20 + n * 97 < 1020 THEN 'AFTERNOON' ELSE 'EVENING' END, IFF(e.I = 18004 AND n = 4, 'RIGHT_PARTY_CONTACT', IFF(MOD(n, 2) = 0, 'NO_ANSWER', 'LEFT_MESSAGE')), 'Agent'
FROM EPISODES e, (SELECT SEQ4() AS n FROM TABLE(GENERATOR(ROWCOUNT => 6)))
WHERE e.I BETWEEN 18001 AND 18150 AND (MOD(e.I, 5) = 4 OR n < 3);

-- (3) Disaster cluster: a synthetic flood declared on 2026-10-27 for 20 ZIP codes
--     around Lafayette, LA. 180 borrowers there fell behind right after.
CREATE OR REPLACE TABLE DISASTER_DECLARATIONS AS
SELECT 'DR-2026-14' AS EVENT_ID, 'Severe flooding (synthetic event)' AS EVENT_NAME, '2026-10-27'::DATE AS DECLARED_ON,
       '705' || LPAD(SEQ4() + 1, 2, '0') AS ZIP, 'LA' AS STATE
FROM TABLE(GENERATOR(ROWCOUNT => 20));

CREATE OR REPLACE TABLE HARDSHIP_PROGRAMS (PROGRAM_ID STRING, NAME STRING, DESCRIPTION STRING, ELIGIBILITY STRING) AS
SELECT * FROM VALUES
 ('DISASTER_FORBEARANCE', 'Disaster forbearance', 'Pause payments for up to 90 days and waive late fees for borrowers in a declared disaster area.',
  'Home ZIP is in a declared disaster area and the delinquency began no more than 30 days before the declaration.'),
 ('PAYMENT_DEFERRAL', 'Payment deferral', 'Move up to two missed payments to the end of the loan.',
  '15 to 89 days past due and no deferral in the last 12 months.'),
 ('REDUCED_PAYMENT_PLAN', 'Reduced payment plan', 'Six months of reduced payments while income recovers.',
  '1 to 89 days past due and two or more broken promises (an affordability signal).'),
 ('EXTENDED_TERM', 'Term extension', 'Extend an auto loan by up to 12 months to lower the payment.',
  'Auto loan, 30 to 89 days past due.');

CREATE OR REPLACE TABLE HARDSHIP_ENROLLMENTS (ACCOUNT_ID STRING, PROGRAM_ID STRING, ENROLLED_ON DATE, STATUS STRING, SOURCE STRING) AS
SELECT ACCOUNT_ID, 'PAYMENT_DEFERRAL', DATEADD(DAY, -FLOOR(U(I, 'enr') * 300), '2026-07-31'::DATE), 'COMPLETED', 'HISTORY'
FROM LATENT WHERE U(I, 'enrolled') < 0.012 AND NOT (I BETWEEN 17001 AND 19240);

-- Call transcript snippets for a sample of conversations, assembled from varied
-- lines. A few agents slip: a missing disclosure, threats, or third-party talk.
CREATE OR REPLACE TABLE CALL_TRANSCRIPTS AS
WITH c AS (
  SELECT ca.ATTEMPT_ID, ca.ACCOUNT_ID, ca.ATTEMPT_TS, ca.OUTCOME, a.FIRST_NAME, a.PRODUCT, a.LAST4, d.DPD, a.MONTHLY_PAYMENT,
         ABS(HASH(ca.ATTEMPT_ID)) AS H, U(ABS(HASH(ca.ATTEMPT_ID)) % 1000003, 'risky') AS RV
  FROM CONTACT_ATTEMPTS ca JOIN ACCOUNTS a ON a.ACCOUNT_ID = ca.ACCOUNT_ID
  JOIN DELINQUENCY_DAILY d ON d.ACCOUNT_ID = ca.ACCOUNT_ID AND d.AS_OF_DATE = ca.ATTEMPT_TS::DATE
  WHERE ca.CHANNEL = 'CALL' AND ca.OUTCOME IN ('RIGHT_PARTY_CONTACT', 'PROMISE_MADE') AND ca.ATTEMPT_TS >= '2026-10-01'
    AND ca.ACCOUNT_ID <> 'L018004'
  QUALIFY ROW_NUMBER() OVER (ORDER BY HASH(ca.ATTEMPT_ID, 'pick')) <= 380),
g AS (
  SELECT c.*, ARRAY_CONSTRUCT('Corin Malvey', 'Tessa Rundle', 'Idris Fenmore', 'Paloma Kerrish',
                'Bram Ostley', 'Juno Halvorsen', 'Wren Abernathy', 'Soren Pikett') AS AGENTS FROM c)
SELECT 'TR' || LPAD(ROW_NUMBER() OVER (ORDER BY ATTEMPT_TS, ATTEMPT_ID), 6, '0') AS TRANSCRIPT_ID, ATTEMPT_ID, ACCOUNT_ID, ATTEMPT_TS AS CALL_TS,
  AGENTS[H % 8]::STRING AS AGENT_NAME,
  'Agent: Hi, this is ' || SPLIT_PART(AGENTS[H % 8]::STRING, ' ', 1) || ' with Northwind Financial. Am I speaking with ' || FIRST_NAME || '?\n'
  || 'Customer: Yes, this is ' || FIRST_NAME || '.\n'
  || IFF(RV < 0.055, 'Agent: I''m calling about your ' || LOWER(PRODUCT) || ' loan. It''s ' || DPD || ' days late.\n',
         'Agent: Thanks. This is an attempt to collect a debt, and any information obtained will be used for that purpose. I''m calling about your '
         || LOWER(PRODUCT) || ' loan ending in ' || LAST4 || ', which is ' || DPD || ' days past due.\n')
  || CASE H % 6
       WHEN 0 THEN 'Customer: I know. My hours got cut at work last month and I''m behind on everything.\n'
       WHEN 1 THEN 'Customer: I had a medical bill come up and it wiped out my savings.\n'
       WHEN 2 THEN 'Customer: Sorry, I honestly forgot. I changed banks and the autopay didn''t move over.\n'
       WHEN 3 THEN 'Customer: My car needed a repair and I had to choose between that and the payment.\n'
       WHEN 4 THEN 'Customer: I was between jobs, but I start a new one next week.\n'
       ELSE 'Customer: Things have been tight since my partner moved out.\n' END
  || CASE FLOOR(H / 7) % 4
       WHEN 0 THEN 'Agent: I''m sorry to hear that, and thank you for telling me. Let''s look at what''s manageable for you right now.\n'
       WHEN 1 THEN 'Agent: That sounds stressful. There are a few options that might help, so let''s find one that fits.\n'
       WHEN 2 THEN 'Agent: Thanks for explaining. I''d like to help you get back on track without adding pressure.\n'
       ELSE 'Agent: I understand. Can we talk about what amount and date would work for you?\n' END
  || CASE WHEN RV >= 0.055 AND RV < 0.075 THEN 'Agent: If this isn''t paid today, we''ll have to send it to legal, and they can garnish your wages next week.\n'
          WHEN RV >= 0.075 AND RV < 0.09 THEN 'Agent: I already went over your past-due balance with your brother when he picked up earlier.\n'
          WHEN RV >= 0.09 AND RV < 0.1 THEN 'Agent: Honestly, people who don''t pay their bills are the reason rates go up for everyone.\n'
          WHEN RV >= 0.1 AND RV < 0.112 THEN 'Customer: Please don''t call me at work, I can''t take these calls there.\nAgent: We''ll keep calling whichever number reaches you.\n'
          ELSE '' END
  || IFF(OUTCOME = 'PROMISE_MADE',
         'Customer: I can pay $' || ROUND(MONTHLY_PAYMENT * 0.6)::INT::STRING || ' next Friday.\n'
         || 'Agent: Thank you. I''ve noted a promise to pay $' || ROUND(MONTHLY_PAYMENT * 0.6)::INT::STRING || ' by next Friday, and you''ll get a text confirmation.\n',
         'Customer: I can''t commit to a date yet.\nAgent: That''s okay. I''ll send you our hardship options by text, and you can reply any time.\n')
  || 'Agent: Is there anything else I can help with today?\nCustomer: No, that''s it. Thanks.' AS TRANSCRIPT,
  -- Synthetic ground truth for measuring the QA classifier (never shown to it).
  CASE WHEN RV < 0.055 THEN 'Missing disclosure' WHEN RV < 0.075 THEN 'Threat or false statement'
       WHEN RV < 0.09 THEN 'Third-party disclosure' WHEN RV < 0.1 THEN 'Abusive or demeaning language'
       WHEN RV < 0.112 THEN 'Ignored contact request' END AS PLANTED_ISSUE
FROM g;
-- (4) A call on L018004 (a story (2) account) where the agent threatens arrest and
--     wage garnishment, talks to a relative about the debt, and skips the disclosure.
INSERT INTO CALL_TRANSCRIPTS
SELECT 'TR900001', 'CX0180044', 'L018004', ATTEMPT_TS, 'Bram Ostley',
  'Agent: Is this ' || a.FIRST_NAME || '? This is Bram from Northwind Financial.\n'
  || 'Customer: Yes. I told the last person I''d pay on the tenth, but my hours got cut again.\n'
  || 'Agent: You''ve broken two promises now. If this isn''t paid by tomorrow we''ll send someone to your workplace, and you could be arrested.\n'
  || 'Customer: Arrested? For a car payment?\n'
  || 'Agent: I already told your sister how far behind you are, so your family knows. We''ll also garnish your wages next week.\n'
  || 'Customer: Please stop calling my sister. Can I set up something smaller?\n'
  || 'Agent: There''s nothing smaller. Pay the full $' || ROUND(a.MONTHLY_PAYMENT * 2)::INT::STRING || ' or it gets worse.\n'
  || 'Customer: Fine. I''ll try.',
  'Threat or false statement; Third-party disclosure; Missing disclosure'
FROM CONTACT_ATTEMPTS ca JOIN ACCOUNTS a ON a.ACCOUNT_ID = ca.ACCOUNT_ID WHERE ca.ATTEMPT_ID = 'CX0180044';

DROP TABLE LATENT;
DROP TABLE EPISODES;

-- Quick check of the data and the four stories
SELECT 'accounts' AS CHECK_NAME, COUNT(*) AS N FROM ACCOUNTS
UNION ALL SELECT 'open loans on Nov 15', COUNT(*) FROM DELINQUENCY_DAILY WHERE AS_OF_DATE = '2026-11-15'
UNION ALL SELECT 'delinquent on Nov 15', COUNT(*) FROM DELINQUENCY_DAILY WHERE AS_OF_DATE = '2026-11-15' AND DPD > 0
UNION ALL SELECT 'contact attempts', COUNT(*) FROM CONTACT_ATTEMPTS
UNION ALL SELECT 'promises', COUNT(*) FROM PROMISES_TO_PAY
UNION ALL SELECT 'transcripts', COUNT(*) FROM CALL_TRANSCRIPTS
UNION ALL SELECT 'story 1 evening SMS replies', COUNT(*) FROM CONTACT_ATTEMPTS WHERE ACCOUNT_ID BETWEEN 'L019001' AND 'L019240' AND CHANNEL = 'SMS' AND OUTCOME IN ('REPLIED', 'PROMISE_MADE')
UNION ALL SELECT 'story 2 accounts with 2 broken Nov promises', COUNT(*) FROM (SELECT ACCOUNT_ID FROM PROMISES_TO_PAY WHERE STATUS = 'BROKEN' AND DUE_DATE >= '2026-11-01' GROUP BY 1 HAVING COUNT(*) >= 2)
UNION ALL SELECT 'transcripts with a planted issue', COUNT(*) FROM CALL_TRANSCRIPTS WHERE PLANTED_ISSUE IS NOT NULL
UNION ALL SELECT 'story 3 delinquent in disaster ZIPs', COUNT(*) FROM DELINQUENCY_DAILY d JOIN ACCOUNTS a USING (ACCOUNT_ID) WHERE d.AS_OF_DATE = '2026-11-15' AND d.DPD > 0 AND a.ZIP IN (SELECT ZIP FROM DISASTER_DECLARATIONS);

-- --------------------------------------------------------------------------
-- 3. Point-in-time account features on a Dynamic Table. Training rows are
--    snapshots of past episodes at 10, 20, 30, and 45 days past due, labeled
--    by whether the account later rolled to 60+ DPD. Scoring rows are today's
--    accounts at 1 to 59 DPD. The table refreshes daily (TARGET_LAG 1 day).
-- --------------------------------------------------------------------------
USE SCHEMA COLLECTIONS_COPILOT.ML;
CREATE OR REPLACE VIEW SNAPSHOTS AS
WITH mx AS (SELECT ACCOUNT_ID, MAX(DPD) AS MAX_DPD FROM COLLECTIONS_COPILOT.RAW.DELINQUENCY_DAILY GROUP BY 1)
SELECT d.ACCOUNT_ID, d.AS_OF_DATE AS SNAP_DATE, d.DPD, d.PAST_DUE, 'TRAIN' AS PURPOSE, IFF(mx.MAX_DPD >= 60, 1, 0) AS LABEL
FROM COLLECTIONS_COPILOT.RAW.DELINQUENCY_DAILY d JOIN mx USING (ACCOUNT_ID)
WHERE d.DPD IN (10, 20, 30, 45) AND DATEADD(DAY, 1 - d.DPD, d.AS_OF_DATE) BETWEEN '2026-07-18' AND '2026-09-14'
UNION ALL
SELECT d.ACCOUNT_ID, d.AS_OF_DATE, d.DPD, d.PAST_DUE, 'SCORE', NULL
FROM COLLECTIONS_COPILOT.RAW.DELINQUENCY_DAILY d JOIN COLLECTIONS_COPILOT.RAW.CONFIG c ON d.AS_OF_DATE = c.AS_OF_DATE
WHERE d.DPD BETWEEN 1 AND 59;

CREATE OR REPLACE DYNAMIC TABLE ACCOUNT_FEATURES
  TARGET_LAG = '1 day' WAREHOUSE = COLLECTIONS_COPILOT_WH REFRESH_MODE = FULL
  COMMENT = 'Point-in-time roll-risk features per account snapshot (training and today)'
AS
WITH p AS (
  SELECT s.ACCOUNT_ID, s.SNAP_DATE, COUNT(*) AS MADE,
         COUNT_IF(pr.STATUS = 'BROKEN' AND pr.DUE_DATE <= s.SNAP_DATE) AS BROKEN,
         COUNT_IF(pr.STATUS = 'KEPT' AND pr.DUE_DATE <= s.SNAP_DATE) AS KEPT
  FROM SNAPSHOTS s JOIN COLLECTIONS_COPILOT.RAW.PROMISES_TO_PAY pr ON pr.ACCOUNT_ID = s.ACCOUNT_ID AND pr.CREATED_DATE <= s.SNAP_DATE
  GROUP BY 1, 2),
c AS (
  SELECT s.ACCOUNT_ID, s.SNAP_DATE, COUNT(*) AS ATTEMPTS,
         COUNT_IF(ca.OUTCOME IN ('RIGHT_PARTY_CONTACT', 'REPLIED', 'PROMISE_MADE')) AS REACHED,
         COUNT_IF(ca.CHANNEL = 'CALL' AND ca.ATTEMPT_TS >= DATEADD(DAY, -6, s.SNAP_DATE)) AS CALLS_7D
  FROM SNAPSHOTS s JOIN COLLECTIONS_COPILOT.RAW.CONTACT_ATTEMPTS ca ON ca.ACCOUNT_ID = s.ACCOUNT_ID
    AND ca.ATTEMPT_TS < DATEADD(DAY, 1, s.SNAP_DATE) AND ca.ATTEMPT_TS >= DATEADD(DAY, -29, s.SNAP_DATE)
  GROUP BY 1, 2),
pay AS (
  SELECT s.ACCOUNT_ID, s.SNAP_DATE, MAX(py.PAID_ON) AS LAST_PAID
  FROM SNAPSHOTS s JOIN COLLECTIONS_COPILOT.RAW.PAYMENTS py ON py.ACCOUNT_ID = s.ACCOUNT_ID AND py.PAID_ON <= s.SNAP_DATE
  GROUP BY 1, 2)
SELECT s.ACCOUNT_ID, s.SNAP_DATE, s.PURPOSE, s.LABEL,
  s.DPD::FLOAT AS DPD, s.PAST_DUE::FLOAT AS PAST_DUE, a.PRINCIPAL_BALANCE::FLOAT AS BALANCE, a.CREDIT_SCORE::FLOAT AS CREDIT_SCORE,
  IFF(a.PRODUCT = 'AUTO', 1, 0)::FLOAT AS IS_AUTO, a.PRIOR_DELINQ_12M::FLOAT AS PRIOR_DELINQ_12M,
  COALESCE(p.MADE, 0)::FLOAT AS PROMISES_MADE, COALESCE(p.BROKEN, 0)::FLOAT AS PROMISES_BROKEN, COALESCE(p.KEPT, 0)::FLOAT AS PROMISES_KEPT,
  COALESCE(c.ATTEMPTS, 0)::FLOAT AS ATTEMPTS_30D, (COALESCE(c.REACHED, 0) / GREATEST(COALESCE(c.ATTEMPTS, 0), 1))::FLOAT AS REACH_RATE_30D,
  COALESCE(c.CALLS_7D, 0)::FLOAT AS CALLS_7D,
  COALESCE(DATEDIFF(DAY, pay.LAST_PAID, s.SNAP_DATE), 120)::FLOAT AS DAYS_SINCE_PAYMENT
FROM SNAPSHOTS s
JOIN COLLECTIONS_COPILOT.RAW.ACCOUNTS a ON a.ACCOUNT_ID = s.ACCOUNT_ID
LEFT JOIN p ON p.ACCOUNT_ID = s.ACCOUNT_ID AND p.SNAP_DATE = s.SNAP_DATE
LEFT JOIN c ON c.ACCOUNT_ID = s.ACCOUNT_ID AND c.SNAP_DATE = s.SNAP_DATE
LEFT JOIN pay ON pay.ACCOUNT_ID = s.ACCOUNT_ID AND pay.SNAP_DATE = s.SNAP_DATE;

-- Contact profile: how often each account answers by channel and time of day,
-- smoothed so a handful of attempts doesn't look like certainty.
CREATE OR REPLACE DYNAMIC TABLE CONTACT_PROFILE
  TARGET_LAG = '1 day' WAREHOUSE = COLLECTIONS_COPILOT_WH REFRESH_MODE = FULL
  COMMENT = 'Reach rate per account, channel, and time band'
AS
SELECT ACCOUNT_ID, CHANNEL, TIME_BAND, COUNT(*) AS ATTEMPTS,
  COUNT_IF(OUTCOME IN ('RIGHT_PARTY_CONTACT', 'REPLIED', 'PROMISE_MADE')) AS REACHED,
  ROUND((COUNT_IF(OUTCOME IN ('RIGHT_PARTY_CONTACT', 'REPLIED', 'PROMISE_MADE')) + 0.3) / (COUNT(*) + 3), 4) AS REACH_RATE
FROM COLLECTIONS_COPILOT.RAW.CONTACT_ATTEMPTS GROUP BY 1, 2, 3;

-- --------------------------------------------------------------------------
-- 4. Roll-risk model: XGBoost trained in a Snowpark Python procedure and
--    logged to the Model Registry, then batch scored in the warehouse.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS MODEL_EVAL (MODEL_VERSION STRING, PAYLOAD VARIANT, CREATED_AT TIMESTAMP_NTZ);
CREATE TABLE IF NOT EXISTS SCORES (ACCOUNT_ID STRING, SNAP_DATE DATE, ROLL_RISK FLOAT, SCORED_AT TIMESTAMP_NTZ);

CREATE OR REPLACE PROCEDURE TRAIN_MODEL()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'snowflake-ml-python', 'xgboost', 'scikit-learn', 'pandas', 'numpy')
HANDLER = 'run'
AS
$$
import json, xgboost as xgb
from sklearn.metrics import roc_auc_score
from snowflake.ml.registry import Registry
from snowflake.ml.model import task

COLS = ['DPD', 'PAST_DUE', 'BALANCE', 'CREDIT_SCORE', 'IS_AUTO', 'PRIOR_DELINQ_12M', 'PROMISES_MADE', 'PROMISES_BROKEN',
        'PROMISES_KEPT', 'ATTEMPTS_30D', 'REACH_RATE_30D', 'CALLS_7D', 'DAYS_SINCE_PAYMENT']

def run(session):
    df = session.sql("SELECT *, MOD(ABS(HASH(ACCOUNT_ID, 'split')), 4) AS FOLD FROM COLLECTIONS_COPILOT.ML.ACCOUNT_FEATURES WHERE PURPOSE = 'TRAIN'").to_pandas()
    train, test = df[df.FOLD != 0], df[df.FOLD == 0]  # hold out a quarter of accounts
    clf = xgb.XGBClassifier(max_depth=4, learning_rate=0.08, n_estimators=250, subsample=0.9, colsample_bytree=0.9,
                            min_child_weight=5, random_state=7, n_jobs=1, eval_metric='auc')
    X = train[COLS].astype('float64')
    clf.fit(X, train.LABEL.astype(int))
    p = clf.predict_proba(test[COLS].astype('float64'))[:, 1]
    auc = float(roc_auc_score(test.LABEL.astype(int), p))
    imp = clf.get_booster().get_score(importance_type='gain'); tot = sum(imp.values())
    importance = sorted([{'feature': k, 'importance': round(v / tot, 4)} for k, v in imp.items()], key=lambda r: -r['importance'])
    # Roll rate by promise behavior at the snapshot (the broken-promise story), on all training rows.
    df['GROUP'] = df.PROMISES_BROKEN.map(lambda b: '2+ broken promises' if b >= 2 else ('1 broken promise' if b == 1 else 'No broken promises'))
    lift = [{'group': g, 'snapshots': int(len(x)), 'rollRate': round(float(x.LABEL.mean()), 4)} for g, x in df.groupby('GROUP')]

    reg = Registry(session=session, database_name='COLLECTIONS_COPILOT', schema_name='ML')
    try:
        reg.delete_model('ROLL_RISK_XGB')
    except Exception:
        pass
    reg.log_model(clf, model_name='ROLL_RISK_XGB', version_name='V1', sample_input_data=X.head(500),
                  task=task.Task.TABULAR_BINARY_CLASSIFICATION, conda_dependencies=['xgboost'], target_platforms=['WAREHOUSE'],
                  comment='XGBoost roll-to-60+ DPD model trained on synthetic delinquency snapshots',
                  metrics={'test_auc': round(auc, 4), 'train_rows': int(len(train))})
    payload = {'version': 'V1', 'algorithm': 'XGBoost classifier', 'label': 'Rolls to 60+ days past due',
               'trainingWindow': 'Episodes starting 2026-07-18 to 2026-09-14, snapshots at 10/20/30/45 DPD',
               'features': COLS, 'trainRows': int(len(train)), 'testRows': int(len(test)),
               'trainPositive': round(float(train.LABEL.mean()), 4), 'auc': round(auc, 4), 'importance': importance, 'brokenPromiseLift': lift}
    session.sql('TRUNCATE TABLE COLLECTIONS_COPILOT.ML.MODEL_EVAL').collect()
    session.sql('INSERT INTO COLLECTIONS_COPILOT.ML.MODEL_EVAL SELECT ?, PARSE_JSON(?), SYSDATE()', params=['V1', json.dumps(payload)]).collect()
    return {'auc': round(auc, 4), 'trainRows': int(len(train)), 'testRows': int(len(test))}
$$;

CALL TRAIN_MODEL();

CREATE OR REPLACE PROCEDURE SCORE_ACCOUNTS()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'snowflake-ml-python')
HANDLER = 'run'
AS
$$
from snowflake.ml.registry import Registry
import snowflake.snowpark.functions as F
COLS = ['DPD', 'PAST_DUE', 'BALANCE', 'CREDIT_SCORE', 'IS_AUTO', 'PRIOR_DELINQ_12M', 'PROMISES_MADE', 'PROMISES_BROKEN',
        'PROMISES_KEPT', 'ATTEMPTS_30D', 'REACH_RATE_30D', 'CALLS_7D', 'DAYS_SINCE_PAYMENT']
def run(session):
    mv = Registry(session=session, database_name='COLLECTIONS_COPILOT', schema_name='ML').get_model('ROLL_RISK_XGB').version('V1')
    df = session.sql("SELECT ACCOUNT_ID, SNAP_DATE, " + ", ".join(COLS) + " FROM COLLECTIONS_COPILOT.ML.ACCOUNT_FEATURES WHERE PURPOSE = 'SCORE'")
    out = mv.run(df, function_name='predict_proba')
    out.select('ACCOUNT_ID', 'SNAP_DATE', out['"output_feature_1"'].cast('FLOAT').alias('ROLL_RISK')) \
       .with_column('SCORED_AT', F.sysdate().cast('TIMESTAMP_NTZ')) \
       .write.save_as_table('COLLECTIONS_COPILOT.ML.SCORES', mode='truncate')
    return session.sql('SELECT COUNT(*) AS N FROM COLLECTIONS_COPILOT.ML.SCORES').collect()[0]['N']
$$;

CALL SCORE_ACCOUNTS();

CREATE OR REPLACE TASK SCORE_ACCOUNTS_TASK
  WAREHOUSE = COLLECTIONS_COPILOT_WH SCHEDULE = 'USING CRON 0 5 * * * UTC'
  COMMENT = 'Daily roll-risk scoring with ROLL_RISK_XGB. Created suspended; ALTER TASK ... RESUME to schedule it.'
  AS CALL COLLECTIONS_COPILOT.ML.SCORE_ACCOUNTS();

-- --------------------------------------------------------------------------
-- 5. Today's queue (a Dynamic Table): roll risk x expected recovery, the best
--    channel and time from the contact profile, hardship eligibility, a
--    suggested offer, and an illustrative limit of 7 calls in 7 days.
-- --------------------------------------------------------------------------
USE SCHEMA COLLECTIONS_COPILOT.APP;
CREATE OR REPLACE DYNAMIC TABLE TODAY_QUEUE
  TARGET_LAG = '1 day' WAREHOUSE = COLLECTIONS_COPILOT_WH REFRESH_MODE = FULL
  COMMENT = 'Ranked collections queue for the business date in RAW.CONFIG'
AS
WITH best AS (
  SELECT ACCOUNT_ID, CHANNEL AS BEST_CHANNEL, TIME_BAND AS BEST_BAND, REACH_RATE AS BEST_REACH_RATE, ATTEMPTS AS BEST_ATTEMPTS, REACHED AS BEST_REACHED
  FROM COLLECTIONS_COPILOT.ML.CONTACT_PROFILE QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_ID ORDER BY REACH_RATE DESC, ATTEMPTS DESC) = 1),
usual AS (
  SELECT ACCOUNT_ID, CHANNEL AS USUAL_CHANNEL, TIME_BAND AS USUAL_BAND, REACH_RATE AS USUAL_REACH_RATE, ATTEMPTS AS USUAL_ATTEMPTS
  FROM COLLECTIONS_COPILOT.ML.CONTACT_PROFILE QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_ID ORDER BY ATTEMPTS DESC, REACH_RATE) = 1),
q AS (
  SELECT s.ACCOUNT_ID, a.CUSTOMER_NAME, a.PRODUCT, a.CITY, a.STATE, a.ZIP, a.PREFERRED_LANGUAGE, a.SMS_CONSENT,
    f.DPD::INT AS DPD, f.PAST_DUE, f.BALANCE, f.PROMISES_BROKEN::INT AS PROMISES_BROKEN, f.CALLS_7D::INT AS CALLS_7D, cfg.CALL_LIMIT_7D,
    ROUND(s.ROLL_RISK, 4) AS ROLL_RISK,
    COALESCE(b.BEST_CHANNEL, 'CALL') AS BEST_CHANNEL, COALESCE(b.BEST_BAND, 'MORNING') AS BEST_BAND, COALESCE(b.BEST_REACH_RATE, 0.1) AS BEST_REACH_RATE,
    b.BEST_ATTEMPTS, b.BEST_REACHED, u.USUAL_CHANNEL, u.USUAL_BAND, u.USUAL_REACH_RATE, u.USUAL_ATTEMPTS,
    DATEADD(DAY, 1 - f.DPD::INT, cfg.AS_OF_DATE) AS DELINQ_START,
    dd.EVENT_NAME AS DISASTER_EVENT,
    (dd.ZIP IS NOT NULL AND DATEADD(DAY, 1 - f.DPD::INT, cfg.AS_OF_DATE) >= DATEADD(DAY, -30, dd.DECLARED_ON)) AS DISASTER_ELIGIBLE,
    EXISTS (SELECT 1 FROM COLLECTIONS_COPILOT.RAW.HARDSHIP_ENROLLMENTS h WHERE h.ACCOUNT_ID = s.ACCOUNT_ID AND h.PROGRAM_ID = 'PAYMENT_DEFERRAL'
            AND h.ENROLLED_ON >= DATEADD(DAY, -365, cfg.AS_OF_DATE)) AS RECENT_DEFERRAL
  FROM COLLECTIONS_COPILOT.ML.SCORES s
  JOIN COLLECTIONS_COPILOT.ML.ACCOUNT_FEATURES f ON f.ACCOUNT_ID = s.ACCOUNT_ID AND f.PURPOSE = 'SCORE'
  JOIN COLLECTIONS_COPILOT.RAW.ACCOUNTS a ON a.ACCOUNT_ID = s.ACCOUNT_ID
  CROSS JOIN COLLECTIONS_COPILOT.RAW.CONFIG cfg
  LEFT JOIN best b ON b.ACCOUNT_ID = s.ACCOUNT_ID
  LEFT JOIN usual u ON u.ACCOUNT_ID = s.ACCOUNT_ID
  LEFT JOIN COLLECTIONS_COPILOT.RAW.DISASTER_DECLARATIONS dd ON dd.ZIP = a.ZIP)
SELECT q.*,
  ARRAY_COMPACT(ARRAY_CONSTRUCT(
    IFF(DISASTER_ELIGIBLE, 'DISASTER_FORBEARANCE', NULL),
    IFF(DPD BETWEEN 15 AND 89 AND NOT RECENT_DEFERRAL, 'PAYMENT_DEFERRAL', NULL),
    IFF(PROMISES_BROKEN >= 2, 'REDUCED_PAYMENT_PLAN', NULL),
    IFF(PRODUCT = 'AUTO' AND DPD BETWEEN 30 AND 89, 'EXTENDED_TERM', NULL))) AS ELIGIBLE_PROGRAMS,
  CASE WHEN DISASTER_ELIGIBLE THEN 'DISASTER_FORBEARANCE' WHEN PROMISES_BROKEN >= 2 THEN 'REDUCED_PAYMENT_PLAN'
       WHEN PRODUCT = 'AUTO' AND DPD >= 30 THEN 'EXTENDED_TERM' WHEN DPD >= 15 AND ROLL_RISK >= 0.5 AND NOT RECENT_DEFERRAL THEN 'PAYMENT_DEFERRAL'
       ELSE 'PROMISE_TO_PAY' END AS SUGGESTED_OFFER,
  -- Contact plan: a call is only suggested while the account is under the call limit.
  CASE WHEN BEST_CHANNEL = 'CALL' AND CALLS_7D >= CALL_LIMIT_7D THEN IFF(SMS_CONSENT, 'SMS', 'EMAIL') ELSE BEST_CHANNEL END AS PLAN_CHANNEL,
  ROUND(PAST_DUE * BEST_REACH_RATE, 2) AS EXPECTED_RECOVERY,
  ROUND(PAST_DUE * BEST_REACH_RATE * ROLL_RISK, 2) AS PRIORITY_SCORE,
  ROW_NUMBER() OVER (ORDER BY PAST_DUE * BEST_REACH_RATE * ROLL_RISK DESC, ACCOUNT_ID) AS QUEUE_RANK
FROM q;

-- --------------------------------------------------------------------------
-- 6. Transcript QA. A deterministic rule checks the required debt collection
--    disclosure; AI_CLASSIFY (multi-label) reviews agent conduct; AI_COMPLETE
--    writes coaching notes for flagged calls. PLANTED_ISSUE is never shown to the model.
-- --------------------------------------------------------------------------
CREATE OR REPLACE TABLE TRANSCRIPT_QA AS
SELECT t.TRANSCRIPT_ID, AI_CLASSIFY(t.TRANSCRIPT, [
    {'label': 'Compliant', 'description': 'Agent stays respectful, makes no threats, respects contact requests, and discusses the debt only with the borrower'},
    {'label': 'Threat or false statement', 'description': 'Agent threatens arrest, lawsuits, wage garnishment, or workplace visits, or misstates consequences'},
    {'label': 'Third-party disclosure', 'description': 'Agent discussed the debt with someone other than the borrower, such as a relative'},
    {'label': 'Abusive or demeaning language', 'description': 'Agent insults, shames, or blames the borrower'},
    {'label': 'Ignored contact request', 'description': 'Borrower asks not to be contacted at a time or place and the agent dismisses it'}],
  {'task_description': 'Quality review of agent conduct on a debt collection call. Pick every label that applies.', 'output_mode': 'multi'}) AS QA,
  SYSDATE() AS REVIEWED_AT
FROM COLLECTIONS_COPILOT.RAW.CALL_TRANSCRIPTS t;
ALTER TABLE TRANSCRIPT_QA ADD COLUMN FLAGS ARRAY;
ALTER TABLE TRANSCRIPT_QA ADD COLUMN COACHING STRING;
UPDATE TRANSCRIPT_QA q SET FLAGS = ARRAY_CAT(
    IFF(t.TRANSCRIPT ILIKE '%attempt to collect a debt%', [], ['Missing disclosure']),
    ARRAY_EXCEPT(COALESCE(q.QA:labels::ARRAY, []), ['Compliant']))
FROM COLLECTIONS_COPILOT.RAW.CALL_TRANSCRIPTS t WHERE t.TRANSCRIPT_ID = q.TRANSCRIPT_ID;
UPDATE TRANSCRIPT_QA q SET COACHING = AI_COMPLETE('claude-sonnet-4-5',
  'You coach debt collection agents. Flags from automated QA: ' || ARRAY_TO_STRING(q.FLAGS, ', ') ||
  '. In at most 3 short bullets, quote the problem line, say why it is a compliance and customer risk, and give a better line to say instead. ' ||
  'Plain language, no legal citations. Synthetic transcript:\n' || t.TRANSCRIPT)
FROM COLLECTIONS_COPILOT.RAW.CALL_TRANSCRIPTS t WHERE t.TRANSCRIPT_ID = q.TRANSCRIPT_ID AND ARRAY_SIZE(q.FLAGS) > 0;

CREATE TABLE IF NOT EXISTS ACCOUNT_ACTIONS (ACTION_ID STRING, ACCOUNT_ID STRING, ACTION STRING, DETAIL VARIANT, ACTED_BY STRING, ACTED_AT TIMESTAMP_NTZ);

-- Views the app and the agent read.
CREATE OR REPLACE VIEW PORTFOLIO_DAILY AS
SELECT AS_OF_DATE, COUNT(*) AS ACCOUNTS, COUNT_IF(DPD > 0) AS DELINQUENT, ROUND(COUNT_IF(DPD > 0) / COUNT(*) * 100, 2) AS DELINQ_RATE, COUNT_IF(DPD >= 30) AS DPD30_PLUS, COUNT_IF(DPD >= 60) AS DPD60_PLUS,
       ROUND(COUNT_IF(DPD >= 30) / COUNT(*) * 100, 2) AS DPD30_RATE, ROUND(SUM(PAST_DUE), 2) AS PAST_DUE
FROM COLLECTIONS_COPILOT.RAW.DELINQUENCY_DAILY GROUP BY 1;

CREATE OR REPLACE VIEW ACCOUNT_STATUS AS
SELECT a.ACCOUNT_ID, a.CUSTOMER_NAME, a.PRODUCT, a.STATE, a.ZIP, d.DPD, d.PAST_DUE, a.PRINCIPAL_BALANCE AS BALANCE,
  CASE WHEN d.DPD = 0 THEN 'Current' WHEN d.DPD < 30 THEN '1-29' WHEN d.DPD < 60 THEN '30-59' WHEN d.DPD < 90 THEN '60-89' ELSE '90+' END AS DPD_BUCKET,
  q.ROLL_RISK, q.QUEUE_RANK, q.BEST_CHANNEL, q.BEST_BAND, q.SUGGESTED_OFFER, q.CALLS_7D,
  IFF(dd.ZIP IS NULL, 'No', 'Yes') AS IN_DISASTER_AREA, IFF(q.DISASTER_ELIGIBLE, 'Yes', 'No') AS DISASTER_ELIGIBLE
FROM COLLECTIONS_COPILOT.RAW.ACCOUNTS a
JOIN COLLECTIONS_COPILOT.RAW.DELINQUENCY_DAILY d ON d.ACCOUNT_ID = a.ACCOUNT_ID
JOIN COLLECTIONS_COPILOT.RAW.CONFIG c ON c.AS_OF_DATE = d.AS_OF_DATE
LEFT JOIN TODAY_QUEUE q ON q.ACCOUNT_ID = a.ACCOUNT_ID
LEFT JOIN COLLECTIONS_COPILOT.RAW.DISASTER_DECLARATIONS dd ON dd.ZIP = a.ZIP;

CREATE OR REPLACE VIEW PROMISES AS
SELECT PROMISE_ID, ACCOUNT_ID, CREATED_DATE, DUE_DATE, CHANNEL, PROMISE_AMOUNT, STATUS FROM COLLECTIONS_COPILOT.RAW.PROMISES_TO_PAY;

-- --------------------------------------------------------------------------
-- 7. Semantic view and Cortex Agent
-- --------------------------------------------------------------------------
CREATE OR REPLACE SEMANTIC VIEW COLLECTIONS_SV
  TABLES (
    ACCOUNTS AS ACCOUNT_STATUS PRIMARY KEY (ACCOUNT_ID) COMMENT = 'Every loan with its delinquency status on the business date (2026-11-15)',
    PROMISES AS PROMISES PRIMARY KEY (PROMISE_ID) COMMENT = 'Promises to pay made by borrowers, with whether each was kept'
  )
  RELATIONSHIPS (PROMISE_ACCOUNT AS PROMISES (ACCOUNT_ID) REFERENCES ACCOUNTS)
  DIMENSIONS (
    ACCOUNTS.ACCOUNT AS ACCOUNT_ID COMMENT = 'Loan account ID, for example L018004',
    ACCOUNTS.CUSTOMER AS CUSTOMER_NAME COMMENT = 'Borrower name (synthetic)',
    ACCOUNTS.PRODUCT AS PRODUCT COMMENT = 'AUTO or PERSONAL loan' SAMPLE_VALUES ('AUTO', 'PERSONAL'),
    ACCOUNTS.STATE AS STATE COMMENT = 'Borrower state',
    ACCOUNTS.ZIP AS ZIP COMMENT = 'Borrower ZIP code',
    ACCOUNTS.DPD_BUCKET AS DPD_BUCKET COMMENT = 'Days-past-due bucket' SAMPLE_VALUES ('Current', '1-29', '30-59', '60-89', '90+'),
    ACCOUNTS.DAYS_PAST_DUE AS DPD COMMENT = 'Days past due on 2026-11-15',
    ACCOUNTS.BEST_CHANNEL AS BEST_CHANNEL COMMENT = 'Channel this borrower answers most: CALL, SMS, or EMAIL',
    ACCOUNTS.BEST_TIME AS BEST_BAND COMMENT = 'Time of day this borrower answers most: MORNING, AFTERNOON, or EVENING',
    ACCOUNTS.SUGGESTED_OFFER AS SUGGESTED_OFFER COMMENT = 'Suggested offer code, for example REDUCED_PAYMENT_PLAN or DISASTER_FORBEARANCE',
    ACCOUNTS.IN_DISASTER_AREA AS IN_DISASTER_AREA COMMENT = 'Yes when the ZIP is in a declared disaster area' SAMPLE_VALUES ('Yes', 'No'),
    ACCOUNTS.DISASTER_ELIGIBLE AS DISASTER_ELIGIBLE COMMENT = 'Yes when eligible for disaster forbearance' SAMPLE_VALUES ('Yes', 'No'),
    PROMISES.PROMISE_STATUS AS STATUS COMMENT = 'KEPT, BROKEN, or PENDING' SAMPLE_VALUES ('KEPT', 'BROKEN', 'PENDING'),
    PROMISES.DUE_DATE AS DUE_DATE COMMENT = 'Date the promised payment was due',
    PROMISES.DUE_MONTH AS DATE_TRUNC('MONTH', DUE_DATE) COMMENT = 'Month the promised payment was due',
    PROMISES.PROMISE_CHANNEL AS CHANNEL COMMENT = 'Channel the promise was made on'
  )
  METRICS (
    ACCOUNTS.ACCOUNT_COUNT AS COUNT(ACCOUNT_ID) COMMENT = 'Number of loan accounts',
    ACCOUNTS.TOTAL_PAST_DUE AS SUM(PAST_DUE) COMMENT = 'Total amount past due in USD',
    ACCOUNTS.TOTAL_BALANCE AS SUM(BALANCE) COMMENT = 'Total principal balance in USD',
    ACCOUNTS.AVG_ROLL_RISK AS AVG(ROLL_RISK) COMMENT = 'Average model probability of rolling to 60+ DPD (accounts 1-59 DPD only)',
    PROMISES.PROMISE_COUNT AS COUNT(PROMISE_ID) COMMENT = 'Number of promises to pay',
    PROMISES.BROKEN_PROMISES AS COUNT_IF(STATUS = 'BROKEN') COMMENT = 'Number of broken promises',
    PROMISES.PROMISE_KEPT_RATE AS COUNT_IF(STATUS = 'KEPT') / NULLIF(COUNT_IF(STATUS IN ('KEPT', 'BROKEN')), 0) COMMENT = 'Share of resolved promises that were kept'
  )
  COMMENT = 'Synthetic consumer loan collections data. Today is 2026-11-16; "this month" means November 2026 (promise due dates).';

CREATE OR REPLACE AGENT COLLECTIONS_AGENT
  COMMENT = 'Collections assistant over synthetic loan accounts and promises to pay'
  FROM SPECIFICATION $$
  models:
    orchestration: auto
  orchestration:
    budget:
      seconds: 60
      tokens: 16000
  instructions:
    response: |
      You answer collections team questions about delinquent loans and promises to pay. Always query the data before answering.
      Be concise: lead with the answer (counts, names, amounts), then one or two sentences of context. List at most 10 accounts.
      Today is 2026-11-16 in this data set; "this month" means promises due in November 2026.
      The data is synthetic. Do not give legal advice.
    orchestration: Use the Analyst tool for every data question.
    sample_questions:
      - question: Which accounts broke promises twice this month?
      - question: How many delinquent accounts are in the declared disaster area, and how much is past due?
  tools:
    - tool_spec:
        type: cortex_analyst_text_to_sql
        name: Analyst
        description: Loan accounts with delinquency buckets, roll risk, best contact channel, offers, disaster flags, and promises to pay
  tool_resources:
    Analyst:
      semantic_view: COLLECTIONS_COPILOT.APP.COLLECTIONS_SV
      execution_environment:
        type: warehouse
        warehouse: COLLECTIONS_COPILOT_WH
  $$;

-- --------------------------------------------------------------------------
-- 8. Quick check: model quality, queue, and the four stories
-- --------------------------------------------------------------------------
SELECT 'model test AUC' AS CHECK_NAME, PAYLOAD:auc::STRING AS VALUE FROM COLLECTIONS_COPILOT.ML.MODEL_EVAL
UNION ALL SELECT 'accounts in today''s queue', COUNT(*)::STRING FROM TODAY_QUEUE
UNION ALL SELECT '(1) evening texters whose best plan is SMS EVENING', COUNT(*)::STRING FROM TODAY_QUEUE WHERE ACCOUNT_ID BETWEEN 'L019001' AND 'L019240' AND BEST_CHANNEL = 'SMS' AND BEST_BAND = 'EVENING'
UNION ALL SELECT '(2) avg roll risk, 2+ broken promises vs others', (SELECT ROUND(AVG(IFF(PROMISES_BROKEN >= 2, ROLL_RISK, NULL)), 3) || ' vs ' || ROUND(AVG(IFF(PROMISES_BROKEN < 2, ROLL_RISK, NULL)), 3) FROM TODAY_QUEUE)
UNION ALL SELECT '(3) disaster forbearance eligible', COUNT(*)::STRING FROM TODAY_QUEUE WHERE DISASTER_ELIGIBLE
UNION ALL SELECT '(4) flags on TR900001', ARRAY_TO_STRING(FLAGS, ', ') FROM TRANSCRIPT_QA WHERE TRANSCRIPT_ID = 'TR900001'
UNION ALL SELECT 'transcripts flagged', COUNT_IF(ARRAY_SIZE(FLAGS) > 0)::STRING FROM TRANSCRIPT_QA;
