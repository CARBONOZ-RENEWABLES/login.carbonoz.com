# CARBONOZ API SERVER

## Api server connection : CARBONOZ Api Server

CARBONOZ API Server acts as the core backend service responsible for handling authentication, authorization, and processing data . The API server stores data in MongoDB and Redis, authenticates customers (Keycloak or, during the migration, passwords) and SolarBMS devices, and ingests SolarBMS data through a Redis stream. See ../docs/platform-architecture.md.

### Overview

The CARBONOZ API Server serves as the backbone of the CARBONOZ login system, handling essential tasks such as user authentication, data processing, and scheduled tasks. Energy data comes from SolarBMS installations (`POST /api/v1/ingest/solarbms`).

It integrates with Redex (device registration, certificates and a month-end production report built from SolarBMS data; the month-end job is currently not scheduled — see docs). This allows system administrators and solar users to track their energy usage and environmental impact in a detailed and automated manner.
