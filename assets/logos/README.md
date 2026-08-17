# Vendor logo registry

Each file in this directory is a vendor brand mark, sourced from that vendor's official brand page and listed in `logos.json` with its `source` URL and `retrieved` date.

## Rules

- **Do not commit a mark you cannot cite.** Every `logos.json` entry needs a real, working `source` URL — the vendor's official brand asset page.
- **Never trace, redraw, screenshot, or scrape a mark.** Only official brand assets.
- **Never recolor.** Keep whatever colors the vendor ships.
- **Normalize to a 24px square viewBox** with no internal padding. SVG preferred; raster (PNG / WebP) is acceptable when the vendor's asset page only offers raster.

## Currently shipped

| Vendor | File | Source | Retrieved |
|---|---|---|---|
| Okta | `okta.webp` | https://www.okta.com/press-room/media-assets-guidelines/ | 2026-08-17 |

> **Note on Okta**: The source URL above is the vendor's press/media page but was not machine-verified at commit time — a person should confirm it matches Okta's current official brand asset location before this ships to customers.

## Pending Brand Team acquisition

The following are on the seed list but not yet in the registry. Add each by (1) obtaining the official SVG (or raster) from the vendor's brand page, (2) normalizing to a 24px viewBox with no internal padding, (3) adding the file to this directory, and (4) appending an entry to `logos.json` with source URL and retrieval date.

- Amazon Web Services (AWS)
- Microsoft Azure
- Google Cloud
- Snowflake
- Databricks
- Microsoft 365
- Salesforce
- GitHub
- Slack
- ServiceNow
- Splunk
- Box
- Workday
- SAP
- Oracle
- MongoDB
- Zscaler
- CrowdStrike
- Palo Alto Networks
- Varonis (own mark)
