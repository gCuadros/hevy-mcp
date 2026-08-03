# hevy-mcp

MCP Server para Hevy (app de entrenamiento), modelo "conector estilo Strava": server remoto oficial-style, lectura + escritura de rutinas, con analítica computada en vivo sobre datos pedidos a Hevy en cada request (sin cache ni base de datos — decisión 2026-07-08, ver más abajo).

Plan completo (fuente de verdad, iterar ahí antes que acá): `PLAN.md` (raíz del repo, deliberadamente fuera de git — es la copia de trabajo de `~/Documents/hevy-mcp-plan.md`).

**Estado actual del proyecto: `STATUS.md`** (raíz del repo, fuera de git como `PLAN.md`). Qué está hecho, qué falta, cómo probarlo y por qué se tomó cada decisión — pensado para retomar el proyecto desde cero.

## Principio rector

El MCP calcula números; el LLM emite juicios. Toda la analítica (e1RM, volumen, PRs, consistencia) vive en `engine/` como librería pura, testeada con fixtures, sin I/O.

**Sin cache ni base de datos (decisión 2026-07-08).** Cada tool que necesita "todos los workouts/rutinas/templates" los pide en vivo a Hevy (paginado, `hevy/fetchAll.ts`), sin persistir nada en ningún sitio. Motivo: un MCP no se consulta continuamente como una app — Hevy ya resuelve el almacenamiento, no tiene sentido duplicarlo. Contrapartida asumida: llamadas repetidas a Hevy entre tools independientes dentro de la misma conversación (sin memoización cross-call), y latencia mayor en analítica que escanea todo el historial. Esto aplica a **ambos transportes** (stdio y HTTP) — no solo simplifica el conector remoto, elimina la necesidad de Postgres/vault de cache y hace el servidor remoto multi-tenant seguro por construcción (no hay nada que aislar entre usuarios, porque no se guarda nada).

## Decisiones de arquitectura

- **Repo simple, no monorepo.** Un solo `package.json`, un tsconfig, un vitest. Dos entrypoints del mismo paquete: `src/stdio.ts` (bin de `npx hevy-coach-mcp`, API key por env var) y `src/server.ts` (server remoto: abre el puerto y delega el enrutado en `src/http.ts` — OAuth 2.1 + PKCE, sirve `/connect`). Ambos comparten `mcp-server.ts`, `engine/`, `hevy/`.
- **Nombre del paquete npm: `hevy-coach-mcp`** (no `hevy-mcp`, ya cogido por otro autor; ni `hevy-mcp-server`, también cogido — verificado en vivo 2026-07-07). El repo de GitHub sigue llamándose `hevy-mcp`.
- **Lectura + analítica, y escritura solo de rutinas** (`create-routine`, `update-routine`, F8). El historial de entrenos no se escribe nunca: es la materia prima de toda la analítica y un error del modelo ahí desplaza récords y tendencias. No hay tool `sync` — no hay nada que sincronizar (ver "sin cache" más arriba).
- **API de Hevy:** requiere Hevy PRO + API key (header `api-key`). **No existe ningún endpoint DELETE** en toda la API: se puede crear y sobrescribir, nunca borrar. Eso es lo que hace asumible la escritura, y a la vez lo que obliga a no escribir nada a medias — de ahí que las tools de escritura resuelvan todos los nombres antes de mandar nada.
- Las tools de lectura son `readOnlyHint: true`; las de escritura lo declaran explícitamente como `false` (`update-routine` además `destructiveHint: true`) para que el cliente pida confirmación. Todas aceptan nombres humanos de ejercicios (desambiguación de IDs interna) y **nunca adivinan** ante ambigüedad. Ningún resource devuelve historial completo — eso va en tools con filtros.
- Errores accionables: 401 → mensaje para regenerar key; key revocada → estado `needs-reauth`, nunca fallo silencioso.
- La escritura llegó en F8, después de que el conector estuviera desplegado y probado en read-only. Sigue fuera: registrar o editar entrenos (`create-workout`), medidas corporales y ejercicios personalizados. Antes de añadir cualquiera de esas, revisar qué promete la página de conexión (`renderConnectPage`) y `docs/CONNECTOR.md` — la garantía de que el historial no se toca está escrita ahí y hay que mantenerla cierta.

## Convenciones

- **Gestor de paquetes: yarn (classic, v1).** No usar npm ni npx — `yarn add`, `yarn <script>`, `yarn dlx` en su lugar.
- TypeScript strict, `@modelcontextprotocol/sdk`, zod para validación de schemas del API.
- Tests con vitest. `engine/` se testea con fixtures contra cálculo manual (e1RM Epley/Brzycki, volumen, PRs, comparación de períodos). `adapter.ts` se testea con datos sucios/incompletos de la API real.
- Descripciones de tools son prescriptivas: explican *cuándo* usar la tool, no solo qué hace.

## Git y releases

- **Una rama por iteración/fase del plan**, PR en GitHub para mergear a `main`. Nunca commitear directo a `main`.
- **Nunca** agregar trailer `Co-Authored-By` de Claude — los commits de este repo son 100% del usuario.
- **Changelog vía [Changesets](https://github.com/changesets/changesets).** Cada PR con un cambio user-facing (tool nueva, fix, breaking change) corre `npm run changeset` y commitea el archivo generado en `.changeset/`. `CHANGELOG.md` se regenera solo al hacer `npm run version` — no editarlo a mano.
