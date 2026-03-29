# Migration to Standard Clasp + TypeScript Setup

## Overview
This document details the migration plan for the AI Documentation Bot from raw native JavaScript (`.js`) files to a fully typed TypeScript (`.ts`) environment managed directly by Google Clasp.

The primary goals are to establish local type safety, enable rich autocomplete for Google Apps Script APIs (e.g., `SpreadsheetApp`, `UrlFetchApp`), and simplify the deployment workflow without the overhead of external bundlers like Vite or Webpack.

## 1. Environment Setup
1. **Node Repository Initialization**
   Initialize the repository to manage types and CLI tools.
   ```bash
   npm init -y
   ```
2. **Install Development Dependencies**
   Install TypeScript, the official Google Apps Script type definitions, and the Clasp CLI.
   ```bash
   npm install -D typescript @types/google-apps-script @google/clasp
   ```
3. **Authenticate Clasp (If not previously done)**
   Authorize the local environment to manage your Google Apps Script projects.
   ```bash
   npx clasp login
   ```

## 2. Configuration Files

### `tsconfig.json`
The TypeScript configuration must accommodate Google Apps Script's distinct execution environment (specifically, the lack of native ES Modules and reliance on global scope).
```json
{
  "compilerOptions": {
    "target": "ES2019",
    "module": "None",                      /* Important: GAS does not use import/export */
    "lib": ["ES2020"],
    "strict": true,
    "noImplicitAny": true,                 /* Enforce type annotations on all parameters */
    "esModuleInterop": true,
    "types": ["google-apps-script"],        /* Globals for autocomplete */
    "experimentalDecorators": true
  }
}
```

### `.clasp.json`
Configure Clasp to push ONLY the `src/` directory to the remote server.
```json
{
  "scriptId": "YOUR_APPS_SCRIPT_DOCUMENT_ID",
  "rootDir": "src/"
}
```

### `.claspignore`
Ensure Node modules, configurations, and documentation are not pushed to Google. (If `.clasp.json`'s `rootDir` is "src/", this strictly governs what inside `src/` is ignored, but it's good practice to secure the root).
```
**/**
!src/**
```

## 3. Code Migration Execution

1. **Rename Files to TypeScript**
   Rename all scripts in the `src` directory:
   - `src/Code.js` → `src/Code.ts`
   - `src/DatabaseService.js` → `src/DatabaseService.ts`
   - `src/GeminiService.js` → `src/GeminiService.ts`
   - `src/GitHubService.js` → `src/GitHubService.ts`
   - `src/TelegramService.js` → `src/TelegramService.ts`

2. **Handle the Global Map Architecture**
   Since Apps Script natively concatenates files in a global namespace, **do not** add ES module `import` or `export` syntax. All functions declared as `const` or `function` at the top level of any file remain directly accessible to each other across the `src/` directory.

3. **Type the Trigger Events**
   In `src/Code.ts`, type the entry point methods using the library definitions.
   ```typescript
   function doPost(e: GoogleAppsScript.Events.DoPost) {
       // Provides property autocomplete for the web app post event
   }
   
   function doGet(e: GoogleAppsScript.Events.DoGet) {
       // ...
   }
   ```

## 4. Workflows

### Package Scripts (Optional)
To streamline workflow commands, add standard scripts to `package.json`:
```json
"scripts": {
  "deploy": "clasp push",
  "open": "clasp open",
  "watch": "clasp push --watch"
}
```

### Deploying
The CI/CD or local workflow becomes:
1. Save changes to `.ts` files.
2. Run `npm run deploy` (or `npx clasp push`).
3. Clasp automatically transpiles `.ts` syntax, constructs Google Script (`.gs`) files, and updates the remote project.
