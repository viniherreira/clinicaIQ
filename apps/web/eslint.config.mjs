import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import jsxA11y from 'eslint-plugin-jsx-a11y';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    plugins: {
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/label-has-associated-control': [
        'error',
        { required: { some: ['nesting', 'id'] } },
      ],
      // O que o efeito devolve vira a "limpeza" que o React chama depois. No
      // Chrome novo, `scrollIntoView()` devolve uma Promise e a tela quebrava
      // ("u is not a function"). Efeito sempre com corpo `{ }`.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.name=/^use(Layout)?Effect$/] > ArrowFunctionExpression[expression=true], CallExpression[callee.name=/^use(Layout)?Effect$/][arguments.0.type='Identifier']",
          message: 'Escreva o efeito com corpo { }: o que ele devolve vira a limpeza que o React chama.',
        },
      ],
    },
  },
];

export default eslintConfig;
