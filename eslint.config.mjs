import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Strictly ban explicit 'any'
      '@typescript-eslint/no-explicit-any': 'error',
      
      // Allow namespaces! They are the best practice for Apps Script global scope
      '@typescript-eslint/no-namespace': 'off',
      
      // TypeScript handles undefined checking perfectly with @types/google-apps-script.
      // We disable the ESLint rule to avoid falsely flagging SpreadsheetApp, etc.
      'no-undef': 'off',
      
      // Allow unused vars for globally accessed Apps Script functions, namespaces, and types
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          'varsIgnorePattern': '^(doPost|doGet|runScheduledMaintenance|.*(Service|Options|Record)|test.*|manual.*)$'
        }
      ]
    },
  }
);
