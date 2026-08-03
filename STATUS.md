# Estado del proyecto — hevy-coach-mcp

> Documento de continuidad. Si eres un modelo de IA que retoma este proyecto sin
> contexto previo, **lee esto entero antes de tocar nada**. Recoge qué está hecho,
> qué falta y por qué se tomaron las decisiones que se tomaron.
>
> Última verificación real: **2026-08-01** (tests ejecutados, servidor probado en
> vivo contra la cuenta de Hevy del autor).

---

## 1. Qué es esto

Un servidor [MCP](https://modelcontextprotocol.io/) que da a un asistente de IA
acceso **de solo lectura** al historial de entrenamiento de [Hevy](https://www.hevyapp.com/),
y que además calcula la analítica encima: e1RM, PRs, volumen por grupo muscular,
consistencia, comparación de períodos.

**Principio rector: el MCP calcula los números, el LLM emite los juicios.**
Toda la aritmética vive en `src/engine/` como librería pura, sin I/O, testeada con
fixtures. El asistente nunca hace cuentas sobre los datos de entrenamiento; solo
interpreta resultados que se le entregan ya calculados.

Requiere **Hevy PRO** (es lo que desbloquea la API) y una API key
(app de Hevy → Settings → API).

Nombre del paquete npm: **`hevy-coach-mcp`** (`hevy-mcp` y `hevy-mcp-server` ya
estaban cogidos por otros autores, verificado en vivo el 2026-07-07). El repo de
GitHub sí se llama `hevy-mcp`.

---

## 2. Estado en una frase

**Funciona y está terminado en su modo local (stdio). El modo remoto (OAuth sobre
HTTP) está construido y mergeado pero todavía no desplegado ni probado end-to-end.**
Lo que queda es despliegue, documentación pública y difusión — no código de producto.

### Verificado el 2026-08-01

| Comprobación | Resultado |
|---|---|
| `yarn test --run` | **78 tests en 14 ficheros, todos en verde** (2,1 s) |
| `yarn build` | Compila sin errores (TS strict) |
| `claude mcp list` | `hevy-coach: ✔ Connected` — ya instalado en el Claude Code del autor |
| `health-check` en vivo | `{"status":"ok","hevyWorkoutCount":127}` |
| `get-consistency` en vivo | 127 workouts, 76 semanas, 1,67/semana, racha 5 semanas, hueco máximo 34 días |

O sea: **el servidor ya devuelve datos reales de la cuenta del autor.** Si la
sensación es "no lo he probado nunca", en realidad ya está conectado y
respondiendo; lo que falta es *usarlo* en una conversación normal (ver §3).

- Versión en `package.json`: **0.1.0**. No publicado en npm todavía (decisión
  deliberada: publicar cuando el MCP esté más maduro).
- 12 PRs mergeados a `main` (#1–#12).
- Rama actual con trabajo sin subir: **`f6/docs`**, 2 commits locales sin push.

---

## 3. Cómo probarlo tú mismo

### Ya está instalado

En el Claude Code del autor ya existe el servidor `hevy-coach`, apuntando al build
local (`node .../hevy-mcp/dist/stdio.js`). No hay que instalar nada: basta con
abrir una conversación de Claude Code y preguntar en lenguaje natural.

Si tocas el código, recuerda **recompilar** para que el servidor instalado use la
versión nueva:

```bash
yarn build
```

Y reinicia la sesión de Claude Code (el servidor stdio se arranca al abrir sesión).

### Preguntas para probarlo de verdad

Escríbelas tal cual en una conversación:

- «¿He mejorado en press de banca en las últimas 8 semanas?»
- «¿Qué grupos musculares estoy entrenando de menos?»
- «¿Cuáles son mis PRs actuales en los básicos?»
- «¿Cómo de constante he sido este año? ¿Cuál ha sido mi parón más largo?»
- «¿Debería hacer una descarga esta semana?»
- «Audita mi programa: ¿hay algo en mis rutinas que nunca entreno de verdad?»

### Probarlo a mano, sin cliente

Útil para depurar o para comprobar una tool concreta sin abrir un cliente MCP:

```bash
export $(grep -v '^#' .env.local | xargs)
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"health-check","arguments":{}}}' \
  | node dist/stdio.js 2>/dev/null | tail -1
```

Cambia `health-check` por cualquier otra tool y pasa sus argumentos en
`arguments`. `.env.local` (fuera de git) contiene `HEVY_API_KEY`.

### Instalarlo desde cero en otra máquina

```bash
claude mcp add hevy -e HEVY_API_KEY=tu_key -- npx hevy-coach-mcp
```

Esto solo funcionará cuando el paquete esté publicado en npm. Mientras tanto,
apunta al `dist/stdio.js` local como arriba.

---

## 4. Arquitectura

### Dos entrypoints, un solo paquete

Repo simple (no monorepo): un `package.json`, un `tsconfig`, un `vitest`.

- **`src/stdio.ts`** — modo local. Es el bin de `npx hevy-coach-mcp`. La API key
  llega por variable de entorno `HEVY_API_KEY` y nunca sale de la máquina salvo
  hacia la propia API de Hevy.
- **`src/http.ts`** — modo remoto. Streamable HTTP *stateless*
  (`sessionIdGenerator: undefined`), OAuth 2.1 + PKCE, sirve la página `/connect`.

Ambos comparten `mcp-server.ts`, `engine/` y `hevy/`. Toda la lógica de producto es
común; lo único que cambia es de dónde sale la credencial.

### Decisión 2026-07-08 — sin cache ni base de datos

**Cada tool que necesita "todos los workouts/rutinas/plantillas" los pide en vivo
a Hevy en cada llamada** (paginado, `src/hevy/fetchAll.ts`). No se persiste nada,
en ningún sitio, en **ninguno de los dos transportes**.

*Motivo:* un MCP no se consulta continuamente como una app. Hevy ya resuelve el
almacenamiento; duplicarlo no aporta nada y sí añade superficie de ataque y
mantenimiento.

*Contrapartidas asumidas conscientemente:* llamadas repetidas a Hevy entre tools
independientes dentro de la misma conversación (no hay memoización cross-call), y
más latencia en analítica que escanea todo el historial.

*Consecuencias:* desaparecen `store/`, la tool `sync`, la DEK por usuario y
Postgres. Y el servidor remoto es multi-tenant seguro **por construcción**: no hay
nada que aislar entre usuarios porque no se guarda nada.

### Decisión 2026-07-07 — sin vault: patrón "C+F" (credencial sellada en el token)

El servidor remoto es una **fachada de authorization server OAuth 2.1 embebida**.
La API key de Hevy del usuario se cifra (JWE, `jose`, `alg: dir`, `enc: A256GCM`)
**dentro del propio authorization code / access token / refresh token**.

Resultado: **cero estado de autenticación en servidor**. No hay vault, ni tabla de
sesiones, ni almacén de codes. En cada petición el servidor descifra la key del
token que acaba de recibir, llama a Hevy y la olvida al terminar.

- PKCE (S256) obligatorio; el `code_challenge` viaja dentro del code sellado.
- Rotación de claves con env vars sufijadas por `kid`:
  `TOKEN_SEALING_KEY_<kid>` + `TOKEN_SEALING_ACTIVE_KID`.
- **Revocación** = regenerar la API key en la app de Hevy. Eso mata todos los
  tokens emitidos, sin necesidad de lista de revocados.

> **`TOKEN_SEALING_KEY_v1` es un secreto del *servidor*, no de cada usuario.**
> Se genera una vez (32 bytes en base64) y se pone en Vercel. Los usuarios finales
> no lo ven ni lo gestionan: ellos solo pegan su propia API key de Hevy en la
> página `/connect`. Una sola clave de sellado protege las credenciales de todos.

### Contratos de las tools

1. Ninguna tool acepta la API key como argumento.
2. Todas son `readOnlyHint: true` y paralelizables.
3. Aceptan nombres humanos de ejercicios («banca inclinada», «RDL»); el servidor
   resuelve el ID. **Si el nombre es ambiguo, devuelve los candidatos y pregunta**
   en lugar de elegir — un acierto por azar corrompería en silencio todos los
   números que vienen después.
4. Ningún resource devuelve el historial completo; eso va en tools con filtros.
5. Errores accionables: 401 → «regenera tu key en Hevy → Settings → API»; key
   revocada → estado `needs-reauth`, nunca fallo silencioso.
6. Las descripciones de las tools son prescriptivas: explican **cuándo** usar la
   tool, no solo qué hace.

### v1 es solo lectura

No hay ninguna escritura. `create-routine`, `apply-progression`, etc. quedan
aplazadas a v2 **deliberadamente**: toda escritura en Hevy es irreversible y su
API no tiene endpoint DELETE. El conector se gana la confianza primero leyendo.

---

## 5. Mapa del repositorio

```
src/
  stdio.ts        entrypoint local (bin de npx)
  server.ts       entrypoint remoto: abre el puerto (lo que Vercel detecta)
  http.ts         enrutado remoto: OAuth + /connect + /mcp
  mcp-server.ts   registro de tools/resources/prompts (compartido)
  config.ts       carga de configuración
  format.ts       formateo de salidas de tools
  resources.ts    hevy://profile, routines, exercises, stats/summary, workouts/recent
  prompts.ts      weekly-review, program-audit, deload-check, prepare-session
  auth/
    metadata.ts   documentos .well-known de OAuth
    oauth.ts      /authorize, /token, PKCE
    token.ts      sellado/apertura JWE de la credencial
  domain/types.ts tipos de dominio en camelCase
  hevy/
    client.ts     cliente HTTP de la API de Hevy
    schemas.ts    validación zod de los DTOs snake_case de Hevy
    adapter.ts    snake_case sucio → tipos de dominio limpios
    fetchAll.ts   paginación completa
    testFixtures.ts
  engine/         e1rm, volume, records, consistency, compare, muscle-map
  tools/          read, analytics, health
docs/CONNECTOR.md página pública de conexión (en inglés)
```

`engine/` se testea con fixtures contra cálculo hecho a mano. `adapter.ts` se
testea con datos sucios e incompletos de la API real.

### Ficheros fuera de git, a propósito

- **`PLAN.md`** — plan completo y fuente de verdad para iterar. Es la copia de
  trabajo de `~/Documents/hevy-mcp-plan.md`. Está en `.gitignore`
  deliberadamente. *Este `STATUS.md` es el resumen público; `PLAN.md` es el
  cuaderno de trabajo.*
- **`.env.local`** — contiene `HEVY_API_KEY`.
- **`.vercel/`** — estado local del CLI de Vercel.

---

## 6. Fases: hecho y pendiente

### ✅ F1 — Fundaciones y cliente de Hevy (PRs #1, #2, #4)
Repo, TS strict, vitest, SDK de MCP, zod. Exploración de la API real con curl para
validar los shapes de verdad (la doc Swagger no es accesible programáticamente).
`hevy/client.ts` + `schemas.ts` + smoke test contra la cuenta real.

### ✅ F2 — Adapter y health-check
`adapter.ts` (datos sucios → dominio), `health-check`, `mcp-server.ts`, `stdio.ts`.
*Nota: el paso original incluía una base de datos y una tool `sync`; ambas
desaparecieron con la decisión del 2026-07-08.*

### ✅ F3 — Tools de lectura y resources (PR #5)
`get-workouts`, `get-workout`, `list-routines`, `get-routine`, `search-exercises`,
`get-exercise-history`. Los 5 resources `hevy://`.

### ✅ F4 — Motor analítico y sus tools (PRs #3, #6)
`engine/`: e1RM (Epley/Brzycki), volumen, records, consistencia, comparación,
mapa muscular. Tools: `get-progress`, `get-records`, `get-volume-report`,
`get-consistency`, `compare-periods`. Los 4 prompts.

### ✅ F5 — Modo remoto y despliegue (PRs #7–#12) — *código completo, deploy pendiente*
- ✅ #7 — release v1 local
- ✅ #8 — `http.ts`: Streamable HTTP stateless
- ✅ #9 — sellado de tokens (JWE)
- ✅ #10 — endpoints OAuth (`/authorize`, `/token`, `/register`, `.well-known/*`)
- ✅ #11 — arquitectura live-fetch, sin cache
- ✅ #12 — target de Vercel: `src/server.ts` abre el puerto y Vercel lo detecta
  como server entrypoint. Empezó siendo `api/handler.ts` + `vercel.json`, pero
  Vercel no llegaba a mirar el directorio `api/`: elegía el builder de servidor
  Node, buscaba un entrypoint en la raíz o en `src/` y fallaba con *No entrypoint
  found*. En vez de pelearse con la detección, se le da lo que pide.
- ⏳ **Pendiente: desplegar en Vercel.** Lo hace el autor a mano, con su cuenta
  personal. Variables de entorno necesarias en Vercel:
  - `TOKEN_SEALING_KEY_v1` — 32 bytes en base64. Generar con:
    `openssl rand -base64 32`
  - `TOKEN_SEALING_ACTIVE_KID` — opcional, por defecto `v1`
  - `PUBLIC_URL` — opcional; si falta se deduce de `x-forwarded-proto` + host
- ⏳ **Pendiente: probar la conexión remota** desde Claude Code
  (`claude mcp add --transport http hevy https://<url>/mcp`) y desde Claude.ai
  (Settings → Connectors → Add custom connector).

### 🔄 F6 — Documentación y difusión — *en curso*
- ✅ **`docs/CONNECTOR.md`** — página pública de conexión, en inglés, con el
  formato del artículo de Strava: qué es, comandos exactos por cliente, preguntas
  de ejemplo, limitaciones, privacidad y revocación. El README enlaza a ella.
  Hecho en la rama `f6/docs`, **sin subir todavía**.
- ✅ **URL del despliegue en `docs/CONNECTOR.md`**: `https://hevy-mcp-alpha.vercel.app`.
  Confirmada por el usuario como definitiva (2026-08-03) — es la que da Vercel y
  no hay intención de cambiarla.
- ⏳ Vídeo demo de ~60 s.
- ⏳ Publicar en: directorio de conectores de Claude, r/Hevyapp, Discord de Hevy,
  Glama, mcp.so, Smithery.
- ⏳ Email a Hevy presentando el conector.

### ✅ F8 — Escritura de rutinas
`create-routine` y `update-routine` en `src/tools/write.ts`. El cliente HTTP dejó
de ser solo-GET: `request()` acepta método y body.

Decisiones que conviene no deshacer sin pensarlo:
- **Solo rutinas.** El historial de entrenos no se escribe. Es la materia prima
  de e1RM, PRs, volumen y consistencia; una serie inventada por el modelo no
  ensucia solo el registro, desplaza las tendencias con las que luego decides.
- **Todo o nada.** Los nombres de ejercicio se resuelven *antes* de mandar nada.
  Sin DELETE en la API, una rutina construida a medias con los nombres que sí
  resolvieron habría que limpiarla a mano.
- **El PUT de Hevy reemplaza la rutina entera.** `update-routine` reconstruye el
  payload desde lo que Hevy tiene guardado, así que cambiar el título no borra
  los descansos ni los rangos de reps. Para eso hubo que añadir `rest_seconds` y
  `rep_range` a los schemas de lectura: zod los descartaba y el round-trip los
  habría perdido en silencio.
- **Sin reintentos en escritura ante 5xx.** Sin clave de idempotencia y sin
  DELETE, reintentar un POST que sí llegó deja una rutina duplicada que el
  usuario no puede borrar desde aquí. Los 429 sí se reintentan: ahí la petición
  se rechazó antes de hacer nada.
- **Límite conocido:** Hevy no devuelve las notas a nivel de rutina al leer, así
  que `update-routine` no puede conservarlas. Documentado en la descripción de la
  tool y en `docs/CONNECTOR.md`.

La promesa de "read-only" estaba escrita en cuatro sitios (página de conexión,
`docs/CONNECTOR.md`, `README.md`, `CLAUDE.md`) y se actualizó en todos. La
garantía que queda y hay que mantener cierta: **el historial de entrenos no se
toca, y nada se puede borrar.**

### Backlog explícito (no bloquea nada)
- Rate limiting anti-abuso en el modo remoto (sobrevive a la eliminación de la BD,
  desacoplado de ella).
- Publicar en npm (aplazado por el autor hasta que el MCP esté más maduro).
- Dominio propio en vez de `*.vercel.app`.
- Escrituras que siguen fuera a propósito: `create-workout`, medidas corporales,
  ejercicios personalizados, carpetas de rutinas.

---

## 7. Compatibilidad con clientes de IA

**Objetivo: que funcione desde cualquier cliente de IA.** A nivel de código ya
está resuelto — el servidor habla los dos transportes estándar de MCP (stdio y
Streamable HTTP), así que cualquier cliente conforme puede conectarse. Lo único
que cambia entre clientes es la sintaxis del fichero de configuración, y eso está
documentado cliente a cliente en `docs/CONNECTOR.md`.

Formatos verificados y documentados (2026-08-01): Claude Code, Claude Desktop,
Claude.ai, ChatGPT, OpenCode (`opencode.json`, `command` como array y
`environment` en vez de `env`), Codex CLI (`~/.codex/config.toml`, TOML), VS Code
Copilot (`.vscode/mcp.json`, clave `servers` y `type` obligatorio), Cursor,
Windsurf, más una sección genérica para el resto (Zed, Cline, Continue, Goose,
Gemini CLI, LibreChat).

### Pero hay dos bloqueos reales, y ninguno es de producto

1. **El paquete no está publicado en npm.** Todos los snippets locales usan
   `npx hevy-coach-mcp`, que hoy **no funciona para nadie salvo el autor** (que
   apunta a su `dist/` local). Publicar en npm desbloquea de golpe *todos* los
   clientes stdio: OpenCode, Codex, VS Code, Cursor, Zed, Cline, Goose, Gemini
   CLI, Windsurf, Claude Desktop y Claude Code. Estaba aplazado; deja de tener
   sentido aplazarlo si el objetivo es "cualquier cliente".
2. **El servidor remoto no está desplegado.** **ChatGPT y Claude.ai no pueden
   usar stdio en absoluto** — para ellos el modo remoto no es una alternativa,
   es la única vía. Sin despliegue, ambos quedan fuera.

Es decir: los dos pasos que quedaban como "difusión" son en realidad los que
gobiernan la cobertura de clientes. Uno cubre los clientes de escritorio/terminal,
el otro los de navegador.

### Limitaciones conocidas por cliente

- **ChatGPT:** las cuentas Free no admiten conectores custom; Plus y Pro sí, en
  modo solo lectura (que es justo lo que es este servidor). Hace falta activar
  *Developer mode* y habilitar el conector en cada conversación. Además, **Deep
  Research no lo verá**: ese modo solo invoca tools llamadas `search` y `fetch`,
  y este servidor expone tools de analítica. Añadir un par `search`/`fetch` sería
  un cambio pequeño si algún día se quiere soporte de Deep Research — está en
  backlog, sin hacer.
- **Clientes remotos sin OAuth:** `/mcp` solo acepta access tokens emitidos por
  su propio `/token` (se verifica con `unsealAccessToken`). **No** se puede pegar
  la API key de Hevy en una cabecera `Authorization: Bearer` y saltarse el flujo.
  Para esos clientes, la salida es el modo local. *Decisión abierta:* aceptar
  también un bearer con la API key en crudo sería trivial y no empeora la
  seguridad (esa key solo da lectura sobre la cuenta del propio usuario, y el
  servidor no guarda nada), y simplificaría mucho los clientes de terminal. No se
  ha implementado: es una decisión de producto, no un descuido.

## 8. Lo siguiente, en orden

1. **Subir `f6/docs` y abrir el PR.** El asistente no puede hacer push (no hay
   clave SSH en su sesión); lo ejecuta el autor:
   `git push -u origin f6/docs`
2. **Publicar en npm** (`hevy-coach-mcp`). Desbloquea todos los clientes locales.
3. **Desplegar en Vercel a mano**, con la cuenta personal, poniendo
   `TOKEN_SEALING_KEY_v1`. Desbloquea ChatGPT y Claude.ai.
4. **Sustituir los placeholders de URL** en `docs/CONNECTOR.md` y comprobar la
   conexión remota desde Claude Code, Claude.ai y ChatGPT.
5. Vídeo, publicación en directorios, email a Hevy.

---

## 9. Convenciones de trabajo (importante para quien retome esto)

- **Gestor de paquetes: yarn classic (v1).** No usar `npm` ni `npx`: `yarn add`,
  `yarn <script>`, `yarn dlx`.
- **Una rama por fase**, PR en GitHub para mergear a `main`. **Nunca commitear
  directo a `main`.**
- **Nunca añadir el trailer `Co-Authored-By` de Claude.** Los commits de este
  repo son 100 % del autor.
- **El email del committer debe ser el personal**, nunca el corporativo. Este
  repo es público; una fuga del email corporativo ya obligó una vez a reescribir
  el historial entero con `git filter-repo`. Verificar antes de commitear.
- **Changelog con [Changesets](https://github.com/changesets/changesets).** Cada
  PR con un cambio visible para el usuario añade un fichero en `.changeset/`
  (`yarn changeset`) — **justo antes de que la rama esté lista para mergear, no
  antes**. `CHANGELOG.md` se regenera solo con `yarn version`; no editarlo a mano.
- **El despliegue en Vercel lo hace el autor a mano.** El asistente no debe
  ejecutar `vercel login`, `vercel deploy` ni ninguna operación de cuenta: la
  sesión del CLI disponible en ese entorno pertenece a la empresa del autor, no
  a él.
- Iterar en `PLAN.md` antes que en `CLAUDE.md` o en este documento.

## 10. Estado del árbol de git

- Rama `main` en `9fb1eaf` (merge del PR #12).
- Rama `f6/docs` con 2 commits sin push: `docs/CONNECTOR.md` + enlace en el
  README, y su changeset (`.changeset/quiet-donkeys-smile.md`).
- Existen ramas locales de todas las fases ya mergeadas; se pueden borrar sin
  perder nada.
