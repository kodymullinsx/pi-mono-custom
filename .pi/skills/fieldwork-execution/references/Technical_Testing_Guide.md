# Technical Testing Guide

## Quick Reference Templates

### Code Documentation Tabular Format
| Column | Content |
|--------|---------|
| # | Line number or sequential identifier |
| Code Lines | Actual code being examined |
| TM Ref. | Tickmark reference (TM A, TM B) |
| Description | Code purpose or significance |

### Key Code Elements to Document
1. **Function Initialization**: Entry points, parameter definitions
2. **Control Flow Logic**: Conditionals, loops, error handling blocks
3. **Data Processing**: Transformations, validation rules, calculations
4. **Integration Points**: Database connections, API calls, interfaces
5. **Error Handling**: Exception mechanisms, logging, notifications

### Database Connection Validation Points
- **Server/Host**: Confirm production server (not dev/test)
- **Database Name**: Confirm production database name
- **Port**: Appropriate for database type (SQL Server 1433, PostgreSQL 5432)
- **Authentication**: Windows Authentication, SQL Authentication, OAuth
- **Connection Timeout**: Reasonable settings
- **Encryption**: SSL/TLS enabled where required

### Script Testing Four-Stage Approach
1. **Execution Walkthrough**: Observe execution, understand functionality, document key operations
2. **Input Validation**: Validate input checks and error handling
3. **Processing Logic**: Verify transformations and calculations
4. **Output Validation**: Confirm outputs are complete and accurate

### Error Handling Four-Component Framework
1. **Detection**: Try/catch blocks, validation checks, threshold monitoring
2. **Logging**: Completeness, detail, retention, access, format
3. **Notification**: Recipients, content, timing, reliability
4. **Resolution**: Procedures, escalation paths, tracking, root cause analysis

### Test Result First Sentence Standard
When documenting test results for each attribute, the first sentence MUST restate the testing objective:
```
To validate [testing attribute/objective], IAD [performed actions]...
```
Alternative openings: "To corroborate...", "Per corroborative inquiry with [persons] and inspection of [documentation], IAD..."

---

## Real-World Documentation Examples

### Script Testing Documentation

#### Script Execution Walkthrough

To validate the R and Python scripts used to perform the interest rate quality check for the Asset Liability Management model, IAD conducted a walkthrough with Paul Wang, Director - Market Risk Management, on 5/15/2024. During the walkthrough, IAD observed Paul execute both scripts and explain their functionality. First, IAD observed the execution of the R script (pull_out_data.r), which connects to the MIRA database to extract interest rate data. The script established a connection to the MIRA production database using the RODBC package and executed a series of SQL queries to retrieve interest rate data for various scenarios. Paul explained that the R script runs on a scheduled basis to extract the latest interest rate data from MIRA and save it to standardized CSV files stored on a shared network location. IAD verified that the script is executed in a controlled environment with appropriate access restrictions and that the output files are saved to a location accessible only to authorized personnel. The script includes comprehensive logging capabilities that record execution details, including timestamps, query parameters, and record counts, providing an audit trail of the data extraction process.

#### Input Validation Testing

To validate the input validation logic within the Python script (QC for Scenario Data.ipynb), IAD inspected the checks implemented to ensure data quality and consistency. The script begins with extensive data type validation that verifies the input files contain the expected columns and data types, raising exceptions if inconsistencies are detected. This prevents processing of malformed or incomplete data files that could lead to inaccurate results. The script also performs date range validation to confirm that the interest rate data covers the required forecast period (120 months), ensuring completeness of the analysis period. Additionally, scenario validation is implemented to verify that the scenario name in the input files matches the expected scenario being analyzed, preventing comparison of mismatched scenarios. For numerical fields, the script includes range checks that flag values outside of expected boundaries (e.g., interest rates below 0% or above 15%), helping to identify potential data anomalies. These validation checks operate sequentially, with each check dependent on the successful completion of previous validations, ensuring a robust validation process that prevents the script from processing incomplete or incorrect input data.

#### Processing Logic Testing

To validate the processing logic within the Python script, IAD analyzed the series of complex data transformations implemented to prepare the interest rate data for comparison and validation. The data loading phase (Lines 15-27) reads both the source data (from MIRA) and the output data (from Polypaths) into pandas DataFrames, establishing the foundation for subsequent analysis. The script then performs data normalization (Lines 30-45) to standardize date formats, interest rate representations, and scenario names, ensuring consistent comparison across datasets. This includes converting percentage values to decimal form, standardizing date formats to YYYY-MM-DD, and removing trailing zeros from numeric values. Once normalized, the data alignment process (Lines 48-62) ensures that both datasets have matching time periods and rate types by aligning the indices and columns, creating a common structure for comparison. Following alignment, the variance calculation (Lines 65-78) computes the difference between corresponding interest rates in the source and output datasets, producing both absolute and percentage differences to facilitate analysis. Finally, the threshold application phase (Lines 81-95) applies a materiality threshold of 0.001% to filter out insignificant variances, allowing the analysis to focus on meaningful discrepancies that require investigation. This sequential processing logic ensures a thorough and accurate comparison of interest rate data between systems.

#### Output Validation Testing

To validate the output generation capabilities of the Python script, IAD observed that the script generates multiple outputs designed to facilitate comprehensive validation of interest rate data. The primary output is a Delta Report, a CSV file containing all identified variances exceeding the materiality threshold, including detailed information about each variance: rate type, date, source value, output value, and both absolute and percentage differences. This report serves as the primary tool for analysts to investigate material discrepancies. Supporting the Delta Report is a Summary Log text file that documents the script execution time, number of variances detected, and the maximum variance identified, providing context for the analysis process. IAD validated that these outputs are stored in the designated folder on the TCST SharePoint site, with appropriate access controls to ensure data security while allowing authorized team members to review results. The TALMA team reviews these outputs as part of their ALM model validation process, with any material discrepancies requiring investigation and resolution before finalizing the model results. IAD reviewed several historical output files and observed that identified variances were documented with explanations and resolution actions, demonstrating effective use of the script's output for control purposes. Through inspection of these outputs and discussions with the TALMA team, IAD confirmed that the script effectively flags material discrepancies between input and output interest rates, enabling timely identification and resolution of data inconsistencies.

#### Reperformance Testing

To further validate the script's functionality, IAD, with the assistance of the Data Analytics team, reperformed the script execution using the same inputs used during the audit period. The reperformance began with obtaining copies of the input files used in the production environment, establishing an isolated test environment that replicated the production configuration, and executing both the R and Python scripts in sequence. The reperformance confirmed that the R script successfully connected to the MIRA database and retrieved the expected interest rate data, with the connection parameters correctly configured to access the production environment. Following data extraction, the Python script successfully processed the data through its transformation pipeline, with the data transformation steps correctly normalizing and aligning the datasets to enable accurate comparison. IAD verified that the variance calculations accurately identified discrepancies between source and output data, with calculated variance values matching those observed in the production environment. The materiality threshold was appropriately applied to filter insignificant variances, focusing attention on material discrepancies requiring investigation. Finally, the reperformance generated output reports containing the expected information in the correct format, with results that matched the original execution outputs. This comprehensive reperformance provided strong evidence of the script's reliability and accuracy in identifying interest rate discrepancies. No exceptions noted.

---

### Code Documentation Structure

#### Background and Context

The Alteryx New Investment Spread quality check is a critical semi-automated validation control within the Asset Liability Management (ALM) model process. This workflow is designed to validate that investment portfolio data used in the ALM model is complete and accurate, specifically checking that cash yield is properly configured by comparing interest rates and pricing, investment portfolio new product spreads from the model match the flat spread/dynamic spread input assumptions, excess reserves and petty cash earn the proper yield in model reporting, retail loan product pricing matches input assumptions, and various other pricing assumptions are consistent with expected values. The workflow is executed after the ALM model run but before results are finalized, providing a critical detective control to identify data inconsistencies that could affect the accuracy of financial forecasts and capital stress testing results. The quality check is particularly important because it validates key financial assumptions that directly impact the firm's interest rate risk modeling and capital adequacy projections. By identifying discrepancies between expected and actual values, the control enables the Treasury Capital Markets team to investigate and resolve issues before the ALM model results are used for financial reporting and regulatory submissions. The control's effectiveness is essential for maintaining the integrity of the firm's capital planning process and ensuring compliance with regulatory requirements for stress testing.

#### Code Architecture Overview

The New Investment Spread Alteryx workflow consists of four main architectural components that work together to provide comprehensive data validation capabilities. The data input component incorporates five distinct input sources feeding into the workflow: ALM model results for the selected scenario, Spreads and New Products CUSIPs Master List for BAU, Spreads and New Products CUSIPs Master List for CST, Polypaths CUSIP Mapping, and Transactions data files for each entity. Once data is ingested, the data processing component performs several transformation steps including data formatting to standardize field names and data types, data filtering to remove irrelevant records, and data joining to combine related information from different sources. These transformations prepare the data for the validation component, which implements multiple verification checks including cash yield verification comparing interest rates and pricing, investment portfolio spread comparison against input assumptions, retail loan product pricing validation, and IDA rate and expense validation. Finally, the output generation component produces comprehensive reports showing matched records confirming data consistency and variance reports highlighting discrepancies requiring investigation. The workflow is designed with a modular architecture that separates these four components, enabling maintenance and updates to individual components without affecting the entire workflow. Error handling is implemented throughout the workflow to ensure that data quality issues are properly identified and reported, with appropriate logging to document the validation process.

#### Technical Analysis

To validate the Alteryx workflow's effectiveness as a control, IAD performed an in-depth analysis of the workflow's technical components. The data connection configuration leverages a combination of direct database connections and file inputs to ensure comprehensive data coverage. The MIRA database connection is configured with appropriate authentication and uses the production instance (MIRAProd), with connection parameters that enforce secure communication and timeout handling to prevent processing delays. File inputs utilize relative paths to access standardized file locations on the TCST SharePoint site, with error handling to detect and report missing or inaccessible files. The data processing logic employs sophisticated transformation techniques to prepare data for comparison, including join operations that use both inner and left joins to combine data sets while maintaining data integrity. The inner joins ensure that only records with matching keys in both datasets are included, while left joins preserve all records from the primary dataset even when corresponding records are not found in the secondary dataset. Filter operations remove irrelevant records based on predefined criteria, including date ranges, product types, and entity codes, ensuring focused analysis on applicable data. Formula operations implement custom calculations to determine expected values based on input assumptions and model parameters, with appropriate rounding and formatting to enable accurate comparison. The validation rules implement several sophisticated techniques to identify discrepancies, including numeric comparisons with configurable tolerance thresholds (default: 0.0001) to accommodate minor rounding differences, date range validation ensuring data completeness across the forecast period, entity-level validation ensuring all required entities are included in the analysis, and CUSIP-level validation ensuring all required securities are processed. These technical components collectively ensure comprehensive and accurate validation of the investment spread data.

#### Control Effectiveness Assessment

Based on IAD's analysis of the Alteryx workflow, the New Investment Spread quality check effectively fulfills its control objectives through several key mechanisms. The control provides comprehensive data completeness validation by verifying that all required data elements are present in both input and output datasets, with missing data immediately flagged in the variance report for investigation. This ensures that the ALM model incorporates all necessary investment spread information in its calculations. The workflow also ensures data accuracy by implementing detailed comparison logic that evaluates actual values against expected values based on input assumptions, identifying any discrepancies that exceed defined thresholds. This comparison is performed at a granular level for each investment type and entity, providing thorough coverage of all portfolio components. Process integrity is maintained through the workflow's consistent execution framework, with standardized input sources, processing logic, and output formats that ensure repeatable validation across different scenarios and time periods. The error detection capabilities are particularly robust, with the workflow effectively identifying and categorizing discrepancies based on magnitude and type, enabling the TALMA team to prioritize investigation of significant variances. Additionally, the workflow generates comprehensive documentation that records both the validation process and any identified issues, supporting audit trail requirements and facilitating root cause analysis of data discrepancies. These characteristics collectively ensure that the New Investment Spread quality check serves as an effective detective control within the ALM model process, providing reasonable assurance that investment spread data used in financial forecasting and capital stress testing is complete and accurate. No exceptions noted.

---

### Common Code Testing Scenarios

#### Database Connection Testing

To validate the IT production environment connection for the MIRA database, IAD inspected the R Script (pull_out_data.r) and focused on the database connection configuration. IAD noted that the script establishes a connection to the MIRA production database using the RODBC package with specific production parameters, including server (VLMIRA,1713), database (MIRAPROD), and authentication method (Windows Authentication). The connection string (Lines 12-15) is hardcoded with these production parameters, preventing accidental connection to development or test environments. To ensure connection reliability, the script implements connection validation logic (Lines 18-25) that tests the connection with a simple query immediately after establishment, logs the connection status to provide an audit trail of connection attempts, and terminates execution with an appropriate error message if the connection fails. This prevents the script from proceeding with unreliable or non-existent database connections that could compromise data integrity. IAD also noted that the connection parameters align with the firm's database naming conventions for production environments and match the connection information documented in the Data Dictionary maintained by the Enterprise Data Management team. To further validate the connection configuration, IAD traced the server and database names to the Enterprise Database Inventory and confirmed their production status. Based on this comprehensive inspection of the connection parameters and validation logic, IAD confirmed that the R Script is configured to connect to the appropriate production environment for the MIRA database, ensuring that interest rate data is retrieved from the authoritative source. No exceptions noted.

#### Data Transformation Testing

To validate the data transformation functions within the Python Script, IAD analyzed the ingestion and transformation code blocks (Lines 35-98) responsible for preparing interest rate data for comparison. The script implements comprehensive data type conversion (Lines 36-42) that converts date strings to datetime objects using the pandas to_datetime function with explicit format parameters to handle different input formats consistently. Numeric strings are converted to floating-point values with appropriate handling for percentage representations, ensuring consistent data types for comparison operations. The data normalization process (Lines 45-55) standardizes interest rate values through systematic transformation, converting percentage representations (e.g., 5.25%) to decimal form (0.0525) to enable direct mathematical comparison, standardizing date formats to YYYY-MM-DD to ensure consistent temporal alignment, and removing trailing zeros from numeric values to prevent false discrepancies due to formatting differences. Once normalized, the data alignment functionality (Lines 58-68) ensures structural consistency between datasets by creating matching indices based on dates using pandas' reindex method, aligning column names for rate types through dictionary mapping to handle naming variations, and implementing sophisticated handling for missing values that distinguishes between legitimate zeros and missing data points. Finally, the tolerance application logic (Lines 71-78) implements a configurable materiality threshold (0.0001) that filters out insignificant variances below the threshold, ensuring that analytical focus remains on material discrepancies that warrant investigation. To validate these transformation functions, IAD reperformed the script execution with sample data obtained from the production environment and confirmed that the transformation functions correctly normalized and aligned the datasets, enabling accurate comparison between input and output values. The reperformance results matched the expected output based on manual calculations, providing assurance of the transformation logic's accuracy. No exceptions noted.

#### Application Configuration Testing

To validate the automated QA/QC checks within the Migraph application, IAD inspected the application's configuration and code components responsible for enforcing quality standards across model risk management workflows. IAD's inspection of the QA/QC Check Configuration (QAQCChecks.cs, Lines 15-85) revealed that the application implements a flexible, database-driven approach to quality checks, with all check definitions stored in the QAQCCheckConfig table in the ModelRiskManagement database. Each check has a unique identifier for reference and tracking, a detailed description explaining its purpose and validation criteria, a severity level (Critical, High, Medium, Low) that determines its impact on workflow progression, and a SQL query that performs the actual validation against the database. Checks are categorized by workflow type (Validation, Annual Review, Performance Monitoring) to ensure appropriate application based on the current task. IAD then analyzed the Check Execution Logic (QAQCValidator.cs, Lines 102-156) and confirmed that the application systematically executes all configured checks when a task is submitted, retrieving applicable checks based on the workflow type and task stage, recording execution results in the QAQCCheckResult table with detailed information about pass/fail status and specific validation messages, and preventing task completion when critical checks fail without appropriate override. Finally, IAD examined the Override Controls (QAQCOverride.cs, Lines 25-62) and noted that override privileges are restricted to users with the "LeadValidator" role, with all overrides comprehensively logged with user ID, timestamp, and justification to maintain accountability, and overridden checks flagged in workflow history for later review and reporting. Through this comprehensive code inspection and system observation, IAD confirmed that the Migraph application correctly implements automated QA/QC checks and enforces task completion requirements. However, IAD noted that users with the "MROAdmin" role can bypass these checks without being the assigned task owner, creating a segregation of duties concern that could potentially allow unauthorized modifications to model validation documentation. Exception noted.

#### Error Handling Testing

To validate the error handling mechanisms within the issue management data interface, IAD analyzed the code components responsible for error detection, logging, and resolution. IAD's inspection of the error detection functionality (ArchiveMyGRCData.cs, Lines 138-143) revealed a comprehensive approach to identifying potential issues during the interface process. The code attempts to establish database connections with robust error trapping using try/catch blocks, implements connection timeout handling to prevent indefinite waiting periods for unresponsive databases, and includes data validation checks that verify expected schema and data formats before initiating transfer operations. Connection failures and validation errors are immediately detected and channeled into established error handling processes. IAD then examined the error logging implementation (Logger.cs, Lines 50-78), noting that the application maintains detailed logs of all operational events, including errors. Each log entry includes a precise timestamp to facilitate chronological analysis, severity classification (Information, Warning, Error, Critical) to support prioritization, and comprehensive error messages that include both user-friendly descriptions and technical details. For exceptions, the log captures the complete stack trace to facilitate troubleshooting, and includes context information about the operation being performed when the error occurred. IAD also validated the error notification mechanisms (EmailUtil.cs, Lines 315-340), confirming that the code includes a dedicated EmailMyGRCArchiveFailure method specifically designed for interface errors. This method generates notifications with appropriate subject lines that clearly indicate the nature of the failure, routes emails to configured recipients (mroresearchdevelopment@schwab.com) responsible for system maintenance, and includes detailed error information and suggested resolution steps in the email body. However, IAD's assessment of error resolution processes identified significant gaps in the formal handling of interface errors. The code lacks automated retry mechanisms that would attempt to recover from temporary failures, has no documented escalation paths for persistent errors that would ensure management awareness of critical issues, and does not implement monitoring of error frequency or patterns that could identify systemic problems. Based on this comprehensive code analysis and system observation, IAD determined that while the application includes basic error handling capabilities, it lacks robust error management processes to ensure timely resolution of identified issues. Exception noted.

---

### Code Tabular Documentation Example

| # | Code Lines | TM Ref. | Description |
|---|------------|---------|-------------|
|136| public static void ArchiveMyGRCData() | TM A | Archive Process Initialization: Sets up the MyGRC data archiving process, including creating a MyGRCManager instance and determining the database connection status. |
|137| { | | |
|138| MyGRCManager myGRC = new MyGRCManager(null); | | |
|139| MyGRCConnectionStatus status = MyGRCManager.DetermineConnectionStatus(); | | |
|140| if (status == MyGRCConnectionStatus.Archive) | | |
|141| { | | |
|142| EmailMyGRCArchiveFailure(DateTime.Now, "tables", "Connection not established."); | | |
|143| } | | |
|144| else | TM B | Data Type Archiving Initiation: Triggers the archiving process for various data types by calling the GetAndArchiveData() method. |

**Sparse TM Assignment Rule (Critical):** Tickmark references and descriptions appear ONLY on the specific lines where a control event fires — entry points, validation gates, exception throws, HTTP status returns, or other audit-relevant logic. All other lines (braces, imports, declarations, boilerplate) leave the TM Ref. and Description columns blank. This sparse annotation style makes control-critical lines immediately visible to the reviewer and prevents the table from becoming a line-by-line commentary. In practice, a 20-line method may have only 2–3 TM rows.

**Named Documentation Sections:** When documenting a complete technical component, precede the code table with two prose sections:

- **Background and Context** — What the component does, why it exists, its role in the control environment, and its relationship to business processes. 2–4 sentences.
- **Code Architecture Overview** — High-level structure and components: inputs, processing layers, validation logic, outputs. 3–5 sentences connecting the architecture to control objectives.

These sections appear before any code tables and orient the reviewer before they encounter line-level detail.

**Referencing Code Tabs in Attribute Write-Ups:**
```
Refer to Tab '2. Code' for inspection of backend code logic to corroborate
IAD's understanding of the [process]. Within the code, IAD focused on three
key areas: 1) [Control mechanism 1] (TM A), 2) [Control mechanism 2] (TM B),
and 3) [Exception routing / gap evidence] (TM C, TM D).
```

---

## Test Environment vs. Production Testing

### When Test Environment Testing is Acceptable

**Appropriate Scenarios:**
- Positive/negative testing that cannot be performed safely in production
- Testing validation logic that could disrupt production data
- Testing error handling scenarios
- Testing boundary conditions and edge cases

**Not Acceptable When:**
- Testing configuration that differs between environments
- Validating access controls (must use production access lists)
- Confirming production data integrity
- Testing controls where environment-specific settings affect outcomes

### Standard Documentation Pattern

```
For [positive/negative] testing, IAD utilized the [test/UAT] environment. IAD confirmed 
through inquiry with [Name, Title] that the [system] test environment mirrors the production 
environment configuration, including [specific components] (Exhibit X, TM Y).

The test environment was used because [rationale]. IAD notes that [any limitations or 
additional validation performed to corroborate production equivalence].
```

**Example:**
```
For negative testing of the authorization limit controls, IAD utilized the Calypso UAT 
environment. IAD confirmed through inquiry with the Trading Systems Manager that the Calypso 
UAT environment mirrors the production environment configuration, including authorization 
limit thresholds by trader job class (Exhibit 3, TM A).

The test environment was used because executing trades exceeding authorization limits in 
production would create invalid transaction records requiring manual cleanup. IAD validated 
that the configuration settings in UAT matched production by comparing the authorization 
limit configuration exports from both environments (Exhibit 3, TM B).
```

---

## API and Integration Testing

### Standard API Testing Attributes

**Attribute A - API Schema/Mapping Validation**
Inspect the API documentation and mapping schema to confirm all required data elements are correctly mapped between source and target systems.

**Attribute B - Positive Testing**
Perform a positive test by submitting a valid API request and confirm the system accepts and processes it successfully with appropriate response codes (200, 201).

**Attribute C - Negative Testing**
Perform a negative test by submitting malformed requests, missing required fields, or invalid data types, and confirm the API properly rejects them with appropriate error codes (400, 401, 403, 404) and descriptive error messages.

**Attribute D - Error Handling**
Validate that API errors are logged with sufficient detail (timestamp, request ID, error type, error message) and appropriate personnel are notified of failures.

**Attribute E - Authentication & Authorization**
Test authentication mechanisms (API keys, OAuth tokens, certificates) and validate authorization controls restrict access to appropriate personnel and applications.

### API Testing Example

**Walkthrough Language:**
```
On [date], IAD met with [Name, Title] to understand the [Source] to [Target] API interface. 
Through corroborative inquiry and inspection, IAD confirmed that the API facilitates 
[real-time/batch] data transfer utilizing [REST/SOAP] architecture with [authentication method]. 
The API processes approximately [X] transactions daily, supporting [business process description].
```

**Testing Documentation:**
```
To validate the API data validation controls, IAD performed positive and negative testing:

Positive Test: IAD submitted a valid API request containing [required fields] and confirmed 
the API returned a successful response code (200) with the expected data payload (Exhibit X, TM A).

Negative Test: IAD submitted an API request with [missing required field / invalid data type] 
and confirmed the API rejected the request with error code 400 (Bad Request) and a descriptive 
error message identifying the specific validation failure (Exhibit X, TM B).

Based on testing performed, IAD determined that the API implements adequate data validation 
controls. No exceptions noted.
```

### Data Mapping Validation

When testing interfaces or APIs that transfer data between systems, document field mappings in tabular format:

| Source Field | Source Table/Schema | Target Field | Target Table/Schema | Transformation | Data Type | Notes |
|--------------|---------------------|--------------|---------------------|----------------|-----------|-------|
| ExceptionID | RT_Waiver | ExceptionID | MyGRC_RT_Waiver | Direct | INT | Primary key mapping |
| Owner_Name | RT_Waiver | DocumentOwner | MyGRC_RT_Waiver | Trim whitespace | VARCHAR(100) | Text standardization |
| Status_Code | RT_Waiver | Status | MyGRC_RT_Waiver | Map: 1→Open, 2→Approved | VARCHAR(20) | Controlled vocabulary |

For API request/response schemas, the same structure applies with Source = request body field and Target = downstream system or database field. Trace a haphazardly selected sample record end-to-end and confirm each mapped field matches.

### Exception Handler Registration Pattern (API/Spring Services)

When inspecting exception handlers in Spring Boot or similar frameworks, the registration list is the primary code evidence for HTTP status mapping. Document it in the code table and note both what IS registered (correct mappings) and what is ABSENT (gap evidence). The absence of an exception type from the 400 handler registration list is itself audit evidence — not just what the code does, but what it fails to handle.

---

## Alteryx Workflow Testing

### Key Testing Focus Areas

1. **Input Validation**: Validate input data sources are correct (production databases/files), confirm input filters and parameters are properly configured
2. **Transformation Logic**: Inspect transformation steps (formulas, joins, aggregations), validate calculations match business requirements, reperform sample calculations
3. **Output Validation**: Confirm output destinations are correct (production files/databases), validate output completeness and accuracy, test error handling for transformation failures
4. **Schedule & Execution**: Validate workflow schedule configuration, inspect execution logs for successful runs, confirm appropriate personnel monitoring for failures
5. **Change Management**: Validate workflow changes follow established procedures, inspect version history for audit period

### Standard Test Steps Template

```
Perform a walkthrough of the [Workflow Name] Alteryx workflow and inspect the workflow 
configuration to validate:

1. Inspect the input data sources to confirm the workflow connects to production 
   [databases/files] with appropriate filters and parameters. (Attribute A)
2. Inspect the transformation logic including [formulas, joins, aggregations] to confirm 
   calculations align with documented business requirements. (Attribute B)
3. Validate output destinations are configured for production [files/databases] and output 
   formatting meets downstream system requirements. (Attribute C)
4. Inspect workflow execution logs to confirm successful execution during the audit period 
   with appropriate error handling for transformation failures. (Attribute D)
5. Validate that workflow configuration changes follow the established change management 
   process. (Attribute E)
```

### Alteryx Error Handling Limitations

**Important Consideration**: Alteryx workflows may have inherent error handling limitations:
```
IAD noted that Alteryx workflows [may not/do not] generate error alerts when [specific condition - 
e.g., no input files are present in the expected directory]. Due to Alteryx system limitations, 
the workflow continues to execute and produce output even when [condition]. IAD validated that 
[compensating control or alternative detection mechanism].
```

---

## Edge Cases & Limitations

### Silent Processing Issues

Some systems may process data silently without generating errors even when issues occur:

**Common Silent Processing Scenarios:**
- Workflows continue despite missing input files
- Data is clamped or truncated without notification
- Validation bypassed for certain data types
- Default values substituted without logging

**Documentation When Silent Processing Identified:**
```
IAD noted that [system/workflow] does not generate error notifications when [condition - e.g., 
input files are missing from the expected directory]. The workflow continues to produce output 
even when [issue condition]. This represents a gap in error alerting due to [system limitations / 
design gap].
```

### Truncated Output

When system output is truncated:
```
Due to system limitations, the output was truncated. However, IAD live-observed that 
[validation results] and no error messages were displayed. This observation is 
corroborated by [alternative evidence source].
```

### Point-in-Time Evidence for Continuous Controls

```
IAD obtained point-in-time evidence for the [system] configuration screenshots on [date], 
which was after the end of the audit coverage period ([end date]). IAD gained reasonable 
assurance that the point-in-time evidence obtained was substantially the same as it would 
have been on [end date] because [justification - e.g., the certificate validity period 
began within the audit period, no changes were made per change management logs].
```

---

## Testing Documentation Best Practices

1. **Be Specific with Technical Details**: Include function names, class names, table names; reference line numbers when documenting code; specify exact error codes and messages

2. **Connect Technical Details to Control Objectives**: Explain how code/configuration achieves control objective; link validation checks to risk mitigation; describe implications of observed behavior

3. **Use Evidence Liberally**: Tickmark all significant technical details; provide exhibits showing configuration screens; include code snippets in tables with line numbers

4. **Maintain Professional Tone**: Use third-person perspective ("IAD"); employ action-oriented verbs; avoid assumptions about system behavior not directly observed

5. **Document Limitations**: Acknowledge vendor-managed systems; note reliance on documentation when code inspection not possible; identify scope of testing relative to full system functionality

---

## Walkthrough Key Phrases

**Opening:**
- "To gain an understanding of [process], IAD conducted a walkthrough with [Name, Title] on [date]."
- "[Name] informed IAD that [process description]..."
- "IAD observed [Name] [describe the action]..."

**Documenting Observations:**
- "IAD noted that [observation]..."
- "IAD confirmed that [validation]..."
- "[Name] explained that [business rationale]..."
- "IAD cross-referenced [items] and verified [result]..."

**Technical Details:**
- "The [component] is configured with [specific details] (TM A)."
- "[Name] demonstrated [action] by [description of demonstration]."
- "IAD observed [results] consistent with [expectation]."

**Closing:**
- "Through this walkthrough, IAD gained an understanding of [process]."
- "Based on the walkthrough and supporting evidence, IAD confirmed that [control objective]."
- "[Name] demonstrated sufficient competency and authority to [ensure/confirm] [control function]."

**Specificity Rule:** Always use the actual value, never a generic label.
- ✓ "VLMIRA,1713" — not "production server"
- ✓ "Lines 129–130" — not "singleton guard code"
- ✓ "HTTP 400 (BadRequest)" — not "an error response"

---

## Common Error Handling Deficiencies

When documenting error handling gaps, these five patterns are the most common:

1. **Silent Failures** — No try/catch blocks, no validation checks; errors occur without detection. Document: "The [system/script] does not generate error notifications when [condition]. Processing continues even when [issue]."

2. **Inadequate Error Messages** — Generic messages ("Error occurred") with no context, no operation being performed, no stack trace. Document: "Error messages lack sufficient detail for troubleshooting, as they do not include [specific elements]."

3. **Missing Escalation** — Notifications sent to unmonitored inboxes; no escalation for unacknowledged errors; no management visibility. Document: "No escalation path exists for errors that remain unresolved after [period]."

4. **No Recovery Mechanisms** — No retry logic for temporary failures; no backoff; no timeout handling; infinite loop risk. Document: "The [interface/script] lacks automated retry mechanisms that would recover from temporary [resource] failures."

5. **Inadequate Log Retention** — Logs deleted or archived too quickly; no centralized repository; logs inaccessible for troubleshooting. Document: "Logs are retained for [X days], which may be insufficient for [investigation/audit] purposes."

For each deficiency, state: what is missing, what the risk is, and whether it rises to an exception. If it does not rise to an exception (e.g., a compensating control exists), explain why.
