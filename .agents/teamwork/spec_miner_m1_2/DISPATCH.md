# Spec Miner 2 State Directory
Milestone: M1
Agent: spec_miner_m1_2


## 2026-11-12T21:48:42Z
You are Explorer 2 (Registration Spec Miner) for Milestone 1: Vehicle Registration Validation Module.
Working directory: c:\Users\HP\Downloads\HSR CNG
State folder: c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\spec_miner_m1_2

Mandatory files to read:
1. c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\ORIGINAL_REQUEST.md
2. c:\Users\HP\Downloads\HSR CNG\PROJECT.md
3. c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\sub_orch_m1\SCOPE.md

Task:
- Mine and formalize the exact specifications for Indian vehicle registration formats required by the project:
  1. Normalization rules: convert to uppercase, strip all whitespace, hyphens, and non-alphanumeric characters (value.toUpperCase().replace(/[^A-Z0-9]/g, '')). Examples: "dl-01 ab 1234" -> "DL01AB1234", "22 bh 1234 aa" -> "22BH1234AA".
  2. Indian Standard State Series: ^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$
     - 2-letter state code (e.g. DL, HR, UP, MH, KA, GJ, RJ, PB, etc.)
     - 1 or 2 digit RTO code (e.g., DL1 or DL01, MH2 or MH02)
     - 0 to 3 series letters (e.g., DL011234, DL01A1234, DL01AB1234, HR26DQ5551)
     - Exactly 4-digit vehicle number (e.g. 1234, 0001)
  3. Bharat Series (BH Series): ^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$
     - 2-digit registration year (e.g. 21, 22, 23, 24, etc.)
     - "BH" code
     - Exactly 4-digit number (0001 to 9999)
     - 1 or 2 alphabet series letters (e.g. A, AA)
  4. Invalid cases: short strings, strings exceeding max length, arbitrary words ("CAR", "HELLO", "TEST1234"), invalid characters, missing digits.
  5. Bilingual error messages: Clear English and Hindi messages for invalid registration formats.
- Produce a comprehensive specification report in c:\Users\HP\Downloads\HSR CNG\.agents\teamwork\spec_miner_m1_2\handoff.md and message the orchestrator when complete. Do not write or modify source code.
