# CARBONOZ API SERVER

## Api server connection : CARBONOZ Api Server

CARBONOZ API Server acts as the core backend service responsible for handling authentication, authorization, and processing data . The API server integrates with MongoDB to manage data storage, performs daily calculations, and schedules monthly tasks that communicate data to Redex for further analysis and reporting.

### Overview

The CARBONOZ API Server serves as the backbone of the CARBONOZ login system, handling essential tasks such as user authentication, data processing, and scheduled tasks. It interacts directly with energy data saved from the MongoDB , and processes it to generate reports and analytics.

Additionally, the API server facilitates integration with external services like Redex, ensuring that monthly energy data calculations are sent via cron jobs for long-term tracking and analysis. This allows system administrators and solar users to track their energy usage and environmental impact in a detailed and automated manner.
