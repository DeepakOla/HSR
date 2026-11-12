# Regulatory source notes

Last checked: 2026-11-12

Primary references used for reminder logic:
- https://www.peso.gov.in/web/en/approved-cng-cylinders-testing-station
- https://www.peso.gov.in/sites/default/files/2025-04/26250%20%281%29.pdf
- https://www.peso.gov.in/web/en/roles-responsibilities

Implementation note:
- Expiry checker asks for last periodic test date and computes next due date by adding 3 calendar years.
- If date is unknown, user should contact station/records; no legal advice or penalties are shown.
