# Latema static concept preview

This is a customer-facing design concept, not the operational parcel platform. The Vercel build contains static pages, route information, gallery photos, and WhatsApp links; it excludes the local server and staff portal. It does not save enquiries, verify customer identities, look up parcels, or show live vehicle locations.

## Deploy

1. Import this project into Vercel from its Git repository.
2. Keep the project root at the repository root and use the **Other** framework preset.
3. `vercel.json` supplies the build command and output folder; no environment variables are needed.
4. Deploy. To preview the production files locally, run `npm run build:static` and serve the `dist` folder with any static file server.

The customer pages are direct-linkable at `/`, `/routes`, `/parcels`, `/track`, `/about`, `/gallery`, and `/contact`. Update the supplied route data and verify contact details with Latema before presenting it as official information.
