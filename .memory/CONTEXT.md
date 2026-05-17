# Lab Simulator — Project Context

## What This Is

A web-based liquid handling automation simulator for laboratory robots — lets users design, animate, and validate pipetting protocols visually.

**Last updated:** 2026-05-17

**Code repo:** `/Users/sej/lab-simulator/`
**Tech stack:** React 19 + TypeScript, Vite, Tailwind CSS 4, Konva/react-konva (canvas animation), XLSX (Excel import), localStorage (persistence), Vercel (deployment)

## Current State

- **Phase:** Active development — planning first specs
- **Active spec:** None yet

## Key Decisions Reference

- Plates rendered on a Konva canvas with drag-and-drop and grid snap
- Simulation deep-copies plate state — non-mutating execution
- Protocol steps are sequential; 8-channel pipette currently executes as single-channel (known gap)
- Data is localStorage only — no backend, no auth
- Smart import: detects existing plate names (case-insensitive) to avoid duplicates
