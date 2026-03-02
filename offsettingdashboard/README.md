# CARBONOZ LOGIN SYSTEM

## Overview

Welcome to the CARBONOZ Login System, the gateway to the CARBONOZ community! This portal allows users to register, log in, and access a wealth of insights and analytics related to their energy consumption and sustainability efforts. Designed with a professional and user-centric approach, the system empowers individuals and organizations to track, analyze, and optimize their energy usage while contributing to a greener future.

### Key Features

#### User Registration

. Seamless onboarding process for new users to join the CARBONOZ community.
. Secure account creation with email and password validation.

#### User Registration

. Secure authentication for registered users to access their personalized dashboards.
. Integrated session management for a smooth and safe experience.

#### Energy Analytics Dashboard

. View detailed insights into energy consumption patterns.
. Monitor historical data with interactive graphs for: Daily, weekly, monthly, and yearly energy usage.
. Metrics such as load, PV generation, grid interaction, and battery performance.

#### Sustainability Metrics

. Discover your contribution to reducing carbon footprints.
. Compare energy performance over time and against community benchmarks.

### Redex Information

The REDEX Information section outlines the mandatory and optional fields required for registering devices and related components in the CARBONOZ platform. This information ensures the proper setup and operation of devices within the system. Please ensure all mandatory fields marked with a \* are accurately filled.

#### Mandatory Fields

##### General Information

1. `Country Code (required)`: The ISO 3166 country code (e.g., "CN" for China).
2. `Grouped English Name (required)`: The English name of the grouped entity (e.g., organization or project).
3. `Grouped Local Name (required)`: The local name of the grouped entity for localization purposes.
4. `Province (required)`: The code of the province (e.g., "CN-AH" for Anhui Province in China).

##### Devices

For each registered device, the following fields must be completed:

1. `Installation Name (required)`: A unique name for the installation (e.g., "ChinaSolarDeveloper-AnhuiSheng-000001").
2. `Address (required)`: The full address of the installation site.
3. `Postal Code (required)`: The postal code of the installation site.
4. `Longitude (required)`: Geographical longitude in a valid decimal format.
5. `Latitude (required)`: Geographical latitude in a valid decimal format.
6. `Grid Connection Date (required)`: The date when the device was connected to the grid, formatted as "YYYY-MM-DD".
7. `Owner's Declaration Start Date (required)`: The start date of the owner’s declaration.
8. `Owner's Declaration End Date (required)`: The end date of the owner’s declaration.
9. `Domestic (required)`: Specifies whether the installation is domestic (true or false).

##### Optional Fields

1. `Timezone`: The timezone of the device, in UTC offset format (e.g., "UTC+08:00").
2. `Generation Data Frequency`: Frequency of data reporting (e.g., "Daily").
3. `Feed-In Tariff`: Specifies whether the installation uses a feed-in tariff (true or false).
4. `Percentage Renewable`: The percentage of energy generated that is renewable.

##### Inverters

Each device may include a list of inverters. For each inverter, the following fields are required:

1. `Remote Inv ID (required)`: The remote inverter ID (e.g., "RM1000020003386274014").
2. `Electronic Serial Number (required)`: The electronic serial number of the inverter.
3. `Brand Code (required)`: The code representing the inverter brand (e.g., "HW21").
4. `Other Brand Name`: If no brand code is available, the name of the brand can be provided.
5. `Installed Capacity (required)`: The capacity of the inverter in kilowatts (e.g., 10.9 kW).

### Assets Registration

This section ensures a comprehensive understanding of the necessary fields for asset registration and maintenance:

1. ` Asset Name`: The unique name of the asset (e.g., Solar Plant A).
2. `Asset Owner`: Name of the individual or company that owns the asset.
3. `Fuel Type`: The primary energy source of the asset (e.g., Solar, Wind).
4. `Country`:the country where the asset is located.
5. `Latitude`:titude coordinate for the asset's location (value must be between -90 and 90).
6. `Longitude`:Longitude coordinate for the asset's location (value must be between -180 and 180).
7. `Capacity Kwp`:he total power capacity of the asset in kilowatts peak (Kwp).
8. `Service`: The type of service provided by the asset (e.g., Power Generation).
9. `COD Date`: Commercial Operation Date (the date when the asset became operational).
10. `Amount of Inverters`:Total number of inverters installed in the asset.
11. `Amount of Panels`:Total number of solar panels in the asset (if applicable).
12. `Panel Brand`: The brand of the solar panels used.
13. `Panel Power (W)`:The power rating of each solar panel in watts.
14. `Amount of Batteries`:Total number of batteries in the system (optional).
15. `Battery Brand`:The brand of the batteries used (optional).
16. `Battery Model`:The model of the batteries used (optional).
17. `Inverter Brand`:The brand of the inverters used.
18. `Inverter Model`:The model of the inverters installed.
19. `Monitoring System Name`:Name of the monitoring system used for the asset.
20. `Monitoring System URL`:URL of the monitoring system interface.
21. `Building Photo Upload`:Upload a photo of the building or site where the asset is installed.
22. `Inverter Setup Photo Upload`:Upload a photo showing the inverter setup.
23. `Solar Panels Photo Upload`:Upload a photo showing the solar panels installed.
24. `Battery Serial Number 1`:Serial number of the first battery used in the system.
25. `Battery Serial Number 2`:Serial number of the second battery used in the system (if applicable).
26. `Battery Serial Number 3`:Serial number of the third battery used in the system (if applicable).
27. `Inverter Serial Number 1`:Serial number of the first inverter used in the system.
28. `Inverter Serial Number 2`:Serial number of the second inverter used in the system (if applicable).
29. `Inverter Serial Number 3`:Serial number of the third inverter used in the system (if applicable).

### User information Registration

This section provides a clear understanding of the necessary fields for managing user information effectively.

1. `First Name`:The user's given name, e.g., John.
2. `Last Name`:The user's family or surname, e.g., Doe.
3. `Street`:The street address where the user resides.
4. `City`:The city associated with the user's address.
5. `Telephone`:The user's phone number, used for contact purposes.
6. `Customer Language`:The preferred language of the user, chosen from a list of available languages.
7. `Customer Timezone`:The timezone in which the user is located, used for scheduling and communication purposes.

### User Agreement Section

This section ensures that all necessary agreements and verification documents are systematically captured and organized.

1. `Power Purchase Agreement`:Upload a file containing the agreement between the power producer and the purchaser outlining the terms of the power purchase. (Optional)

2. `Interconnection Agreement`:Upload a file containing the agreement for connecting the power system to the grid, including technical and operational details. (Optional)

3. `Commissioning Certification to Grid`:Upload a file with the certification confirming that the power system has been commissioned and is ready to connect to the grid. (Optional)

4. `Commissioning Certification or Inspection`:Upload a file with the certification or inspection report that verifies the system's commissioning and compliance with standards. (Optional)

5. `Power Quality Test`:Provide details or upload a file containing the results of the power quality tests conducted on the system. (Optional)

6. `ID Photo Upload or Company Certificate`:Upload a valid ID photo or a company certificate to verify the identity of the owner or entity associated with the asset.

### Meter evidence Registration

This section ensures that all critical information and visual proof related to the meter's installation or operation are properly recorded.

1. `Meter ID`:The unique identifier for the meter, such as its serial number or asset ID. (Optional)
2. `Meter Brand`:The brand or manufacturer of the meter, such as Siemens or Schneider. (Optional)
3. `Meter Type`:The type or model of the meter, e.g., Smart Meter or Analog Meter. (Optional)
4. `Metering Evidence Photo Upload`:Upload a photo showing evidence of the meter's installation or reading. (Required)

### Meter evidence Registration (Optional)

This section allows for a comprehensive understanding of the project's purpose, operation, and expected benefits, helping stakeholders grasp its significance and contribution

1. `Project Background`: Provide context or historical information about the project, including its motivation, initial goals, or the problem it aims to solve. (Optional)
2. `Project Description`: Offer a detailed explanation of the project's scope, objectives, and key features. This should include what the project does and how it operates. (Optional)
3. `Project Impact`: Outline the positive effects or changes the project intends to bring. This could include environmental, social, or economic impacts. (Optional)

##### Important Notes

All fields marked with `\*` in the application are mandatory.
Ensure that all data entries comply with the required formats and standards (e.g., ISO 3166 for country codes, valid decimal formats for geographical coordinates).
Proper and complete information is crucial for the successful registration of devices and accurate energy analytics.
By adhering to these guidelines, you ensure the effective registration and operation of your devices within the CARBONOZ ecosystem.
