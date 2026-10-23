import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
export default ts.config(
  { ignores: ['dist/**', 'src/component/**', 'src/store/**', 'src/vendor/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } }, rules: { curly: ['error', 'all'] } },
);
