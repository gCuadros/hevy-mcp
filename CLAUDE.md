# hevy-mcp

MCP Server para Hevy (app de entrenamiento), modelo "conector estilo Strava": server remoto oficial-style, read-only en v1, con analítica computada desde cache.

Plan completo (fuente de verdad, iterar ahí antes que acá): `~/Documents/hevy-mcp-plan.md`

## Principio rector

El MCP calcula números; el LLM emite juicios. Toda la analítica (e1RM, volumen, PRs, consistencia) vive en `engine/` como librería pura, testeada con fixtures, sin I/O.

## Decisiones de arquitectura

- **Repo simple, no monorepo.** Un solo `package.json`, un tsconfig, un vitest. Dos entrypoints del mismo paquete: `src/stdio.ts` (bin de `npx hevy-mcp`, API key por env var) y `src/http.ts` (server remoto: OAuth 2.1 + PKCE, sirve `/connect` y `/docs`). Ambos comparten `server.ts`, `engine/`, `store/`, `hevy/`.
- **v1 es solo lectura + analítica.** Sin escrituras irreversibles. La única excepción es `sync` (tool), que solo escribe en la cache propia (SQLite local / Postgres remoto tras la misma interfaz `store/db.ts`).
- **API de Hevy:** requiere Hevy PRO + API key (header `api-key`). Sin endpoint DELETE en v1 (irrelevante, read-only).
- Todas las tools son `readOnlyHint: true`. Aceptan nombres humanos de ejercicios (desambiguación de IDs interna). Ningún resource devuelve historial completo — eso va en tools con filtros.
- Errores accionables: 401 → mensaje para regenerar key; key revocada → estado `needs-reauth`, nunca fallo silencioso.
- Escrituras (`create-routine`, `apply-progression`, etc.) quedan para v2, deliberadamente pospuestas — toda escritura en Hevy es irreversible, el conector gana confianza primero en read-only.

## Convenciones

- TypeScript strict, `@modelcontextprotocol/sdk`, zod para validación de schemas del API, better-sqlite3 para cache local.
- Tests con vitest. `engine/` se testea con fixtures contra cálculo manual (e1RM Epley/Brzycki, volumen, PRs, comparación de períodos). `adapter.ts` se testea con datos sucios/incompletos de la API real.
- Descripciones de tools son prescriptivas: explican *cuándo* usar la tool, no solo qué hace.

## Git y releases

- **Una rama por iteración/fase del plan**, PR en GitHub para mergear a `main`. Nunca commitear directo a `main`.
- **Nunca** agregar trailer `Co-Authored-By` de Claude — los commits de este repo son 100% del usuario.
- `CHANGELOG.md` sigue [Keep a Changelog](https://keepachangelog.com/) — cada PR que aporte un cambio user-facing (tool nueva, fix, breaking change) suma una entrada en `[Unreleased]` antes de mergear. Crítico por ser proyecto open source.
