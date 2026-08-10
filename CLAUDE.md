# Summit

## Project

Summit is a branded multi-user cloud platform for Summit Construction Technology & Restoration Group, a commercial / high-end residential / historical restoration HVAC company.

## Purpose

A web application that lets field technicians, estimators, and admins collect HVAC project data (residential, commercial, industrial) and generate accurate load calculations following ACCA Manual J, Manual D, and Manual S, using auto-detected climate zone and NOAA/ASHRAE design temperatures based on project address.

## Roles

Three-tier role hierarchy:

- Field Tech
- Estimator
- Admin

## Brand

- **Palette:** Black / silver / bronze-gold
- **Taglines:**
  - "Restore. Protect. Perform."
  - "Built on Integrity. Engineered for Excellence."

## Current Status

Early setup phase. A working prototype already exists as a single-file React artifact (not yet in this folder) with:

- Full Manual J residential load calculations
- Manual D duct sizing
- Manual S equipment selection
- Commercial/Industrial load modules

This project folder is being set up to rebuild that prototype into a real production application.

## Planned Architecture

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) |
| Database | Supabase (Postgres) |
| Auth & roles | Supabase Auth with Row Level Security |
| File storage | Supabase Storage |
| Server-side compute | Supabase Edge Functions (for AI-based drawing extraction) |
| Hosting | Vercel |
| Version control | GitHub |
| PDF/report generation | Puppeteer via serverless function |
