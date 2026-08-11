# Frontend API Verification — Briefline CRM
**Date:** 2026-08-11
**Author:** FE developer (DOC-002)
**Purpose:** Referencia canónica de las APIs permitidas para los agentes de implementación. Todas las firmas fueron verificadas contra la documentación oficial vía Context7 MCP en la fecha indicada.

---

## 1. React Router v7 (Data Mode)

### Allowed APIs

- `createBrowserRouter(routes: RouteObject[], opts?: DOMRouterOpts): DataRouter`
  - Debe inicializarse **una vez, fuera del árbol de React** (nunca en estado de componente) y pasarse a `<RouterProvider>`.
  - `opts` soporta `basename`, `dataStrategy`, `future`, `getContext`, `hydrationData`.

- `RouterProvider` — renderiza el router:

  ```tsx
  import { createBrowserRouter } from "react-router";
  import { RouterProvider } from "react-router/dom"; // v7: import DOM desde "react-router/dom"

  const router = createBrowserRouter([
    {
      id: "index",
      path: "/",
      loader() {
        return { message: "Hello React Router!" };
      },
      Component() {
        let data = useLoaderData();
        return <h1>{data.message}</h1>;
      },
    },
  ]);

  ReactClient.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  );
  ```

- `useLoaderData<T = any>(): SerializeFrom<T>` — lee el resultado del loader de la ruta actual.

- `useActionData<T = any>(): SerializeFrom<T> | undefined` — resultado del action de la ruta actual (undefined si no hubo submit).

- `useFetcher<T = any>({ key }: { key?: string } = {}): FetcherWithComponents<SerializeFrom<T>>`
  - Retorna: `state` (`"idle" | "loading" | "submitting"`), `data`, `Form`, `load`, `submit`, `reset`.
  - Sirve para interacciones de datos concurrentes **sin provocar navegación**.

### Protected routes (patrón verificado)

Patrón A — guardia en el `loader` (canónico):

```tsx
import { redirect } from "react-router";

export async function loader({ request }: Route.LoaderArgs) {
  if (!isLoggedIn(request)) throw redirect("/login");
  // ...
}
```

Patrón B — middleware en data mode (v7):

```tsx
async function authMiddleware({ context }) {
  const user = await getUser();
  if (!user) {
    throw redirect("/login");
  }
  context.set(userContext, user);
}

// en la definición de rutas:
{
  path: "dashboard",
  middleware: [authMiddleware],
  loader: dashboardLoader,
  Component: Dashboard,
}
```

**Regla:** un middleware que lanza `redirect()` impide que las rutas hijas se rendericen — actúa como gate de auth a nivel de ruta. Si se usa middleware, añadir un `loader` (aunque retorne `null`) fuerza su ejecución en toda navegación client-side.

### Prohibited Patterns

- **NO usar `BrowserRouter` + `Routes`** (Declarative Mode / legado v6). Las rutas declarativas "do not support data loading or actions" — sin `loader`/`action` no hay data mode.
- **NO mezclar modos**: todo el árbol de rutas debe ser data mode (`createBrowserRouter`). Un `BrowserRouter` anidado o parcial rompe loaders/actions.
- **NO mantener el router en estado de React** (`useState`/`useMemo`): "Data Routers should not be held in React state; create once outside the React tree".

### Verified Against

- https://github.com/remix-run/react-router/blob/main/docs/api/data-routers/createBrowserRouter.md
- https://github.com/remix-run/react-router/blob/main/docs/api/hooks/useFetcher.md · `useLoaderData.md` · `useActionData.md`
- https://github.com/remix-run/react-router/blob/main/docs/api/utils/redirect.md
- https://github.com/remix-run/react-router/blob/main/docs/how-to/middleware.md
- https://github.com/remix-run/react-router/blob/main/docs/start/modes.md · https://github.com/remix-run/react-router/blob/main/docs/api/components/Route.md
- https://github.com/remix-run/react-router/blob/main/playground/data/src/main.tsx (ejemplo completo Vite + React)
- Versiones disponibles: 7.6.2, 7.9.4 (consultado 2026-08-11)

---

## 2. TanStack Query v5

### Allowed APIs

**v5 obliga a la object signature** (breaking change vs v4, sin argumentos posicionales):

```tsx
useQuery({ queryKey, queryFn, ...options })       // v4 era: useQuery(key, fn, options)
useMutation({ mutationFn, ...options })           // v4 era: useMutation(fn, options)
```

- `useQueryClient(queryClient?): QueryClient`
- `QueryClientProvider client={queryClient}` — configuración global vía `defaultOptions`:

  ```tsx
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: defaultQueryFn,
      },
    },
  });

  function App() {
    return (
      <QueryClientProvider client={queryClient}>
        <YourApp />
      </QueryClientProvider>
    );
  }
  ```

- `useMutation` — result: `mutate` (fire-and-forget, retorna `void`), `mutateAsync` (retorna `Promise<TData>`), `error: TError | null`, `reset: () => void`.
- Lifecycle callbacks (todos reciben `context` como 4º arg; el retorno de `onMutate` se pasa como 3º arg a los demás):

  ```typescript
  useMutation({
    mutationFn: addTodo,
    onMutate: (variables, context) => {
      // A mutation is about to happen!
      return { id: 1 } // rollback value
    },
    onError: (error, variables, onMutateResult, context) => { /* ... */ },
    onSuccess: (data, variables, onMutateResult, context) => { /* ... */ },
    onSettled: (data, error, variables, onMutateResult, context) => { /* ... */ },
  })
  ```

### Optimistic updates — patrón canónico (copia literal de la doc)

```tsx
const queryClient = useQueryClient()

useMutation({
  mutationFn: updateTodo,
  // When mutate is called:
  onMutate: async (newTodo, context) => {
    // Cancel any outgoing refetches
    // (so they don't overwrite our optimistic update)
    await context.client.cancelQueries({ queryKey: ['todos'] })

    // Snapshot the previous value
    const previousTodos = context.client.getQueryData(['todos'])

    // Optimistically update to the new value
    context.client.setQueryData(['todos'], (old) => [...old, newTodo])

    // Return a result with the snapshotted value
    return { previousTodos }
  },
  // If the mutation fails,
  // use the result returned from onMutate to roll back
  onError: (err, newTodo, onMutateResult, context) => {
    context.client.setQueryData(['todos'], onMutateResult.previousTodos)
  },
  // Always refetch after error or success:
  onSettled: (data, error, variables, onMutateResult, context) =>
    context.client.invalidateQueries({ queryKey: ['todos'] }),
})
```

Reglas del patrón: `cancelQueries` primero, snapshot con `getQueryData`, update con `setQueryData`, rollback en `onError` con el valor retornado por `onMutate`, `invalidateQueries` en `onSettled`.

Métodos de QueryClient verificados: `cancelQueries(filters?: QueryFilters, cancelOptions?: CancelOptions)` (no retorna nada; ejemplo `{ queryKey: ['posts'], exact: true }, { silent: true }`), `getQueryData`, `setQueryData`, `invalidateQueries`.

### queryKey conventions

- Array; el primer elemento es la entidad y luego identificadores: `['todos']`, `['todo', { id: 5 }]`.
- Los objetos dentro del key se serializan de forma estable (hash determinístico por estructura, no por orden de inserción).
- La misma queryKey en distintos componentes comparte cache y re-renders.

### staleTime / gcTime

- `gcTime` default: **5 minutos** en browser, `Infinity` en server (verificado en `packages/query-core/src/removable.ts`).
- `staleTime` default: **0 ms** (toda query se considera stale al instante; fuente: guía oficial de caching de TanStack v5). Configurar por query o en `defaultOptions.queries`.
- Diferencia conceptual: `staleTime` = cuánto tiempo la data se sirve sin refetch; `gcTime` = cuánto tiempo sobrevive la cache tras dejar de tener observadores.

### useSuspenseQuery vs useQuery

`useSuspenseQuery(options)` — mismo set de options que `useQuery` con estas excepciones:

- `throwOnError`: no aplica (efectivamente `true`).
- `enabled`: no aplica (siempre enabled).
- `placeholderData`: no disponible (data siempre definida).
- Return: `data` **garantizado definido**; `status` solo `"success" | "error"`; sin `isPlaceholderData`.
- **Caveat:** la cancelación de queries no está soportada con `useSuspenseQuery`.

**Decisión de proyecto:** usar `useQuery` por defecto (mayor flexibilidad: `enabled`, cancelación, placeholderData). Reservar `useSuspenseQuery` solo para rutas/paneles donde la data debe existir sí o sí y se combina con `Suspense` + ErrorBoundary. Nunca mezclar ambos hooks para la misma queryKey en el mismo flujo.

### Prohibited Patterns

- NO usar la firma posicional de v4 (`useQuery(key, fn, options)`) — rompe types y runtime en v5.
- NO usar `onMutate`/`onError`/`onSettled` sin la secuencia cancel → snapshot → update → rollback/invalidate.
- NO mezclar `useQuery` y `useSuspenseQuery` para la misma queryKey dentro del mismo árbol.

### Verified Against

- https://github.com/tanstack/query/blob/main/docs/framework/react/guides/migrating-to-v5.md
- https://github.com/tanstack/query/blob/main/docs/framework/react/guides/mutations.md · `guides/optimistic-updates.md` · `guides/default-query-function.md`
- https://github.com/tanstack/query/blob/main/docs/framework/react/reference/useSuspenseQuery.md
- https://github.com/tanstack/query/blob/main/docs/reference/QueryClient.md · `packages/query-core/src/removable.ts` · `packages/react-query/src/useMutation.ts`
- Versiones: v5.60.5 – v5.90.3 (consultado 2026-08-11)

---

## 3. Zod

### Allowed APIs (verificadas)

```ts
import { z } from "zod";

// Tipos básicos
const mySchema = z.string();
const n = z.number();          // Zod v4: no acepta Infinity/NaN por defecto
const b = z.boolean();
const d = z.date();            // valida instancias de Date, NO strings ISO
const FishEnum = z.enum(["Salmon", "Tuna", "Trout"]);

// parse (lanza ZodError) vs safeParse (no lanza)
mySchema.parse("tuna");                        // => "tuna"
mySchema.parse(12);                            // => throws ZodError
mySchema.safeParse("tuna");                    // => { success: true; data: "tuna" }
mySchema.safeParse(12);                        // => { success: false; error: ZodError }

// Objetos
const User = z.object({ username: z.string() });
User.parse({ username: "Ludwig" });

// Optional y Nullable (formas equivalentes)
const schema = z.optional(z.string());         // acepta string | undefined
const nullableString = z.string().nullable();  // string | null
const C = z.object({
  foo: z.string(),
  bar: z.number().optional(),                  // { foo: string; bar?: number | undefined }
});
```

### Inferencia de tipos

```ts
type User = z.infer<typeof User>;
// { username: string }

// Con transforms, z.infer ≡ z.output:
const stringToNumber = z.string().transform((val) => val.length);
type input = z.input<typeof stringToNumber>;   // string
type output = z.output<typeof stringToNumber>; // number
type inferred = z.infer<typeof stringToNumber>; // number  (¡es el OUTPUT!)
```

**Regla:** `z.infer` devuelve SIEMPRE el output type; usar `z.input`/`z.output` explícitamente cuando el schema tenga transforms (p. ej. en `useForm<TInput, any, TOutput>` de RHF).

### Notas de Zod v4 (si se migra de v3)

- Interno: desaparece la clase `ZodEffects`; los refinements viven dentro de los schemas como "checks" (no afecta las APIs de usuario).
- `z.number()` no acepta valores infinitos por defecto.
- `@hookform/resolvers` soporta `zod` y `zod/v4` indistintamente.

### Verified Against

- https://github.com/colinhacks/zod/blob/main/packages/docs-v3/home.md
- https://github.com/colinhacks/zod/blob/main/packages/docs/content/api.mdx
- https://github.com/colinhacks/zod/blob/main/packages/docs/content/v4/changelog.mdx
- https://github.com/colinhacks/zod/blob/main/packages/zod/src/v4/classic/tests/number.test.ts
- Versiones: v3.24.2, v4.0.1 (consultado 2026-08-11)

---

## 4. React Hook Form (v7)

### Allowed APIs

- `useForm<TFieldValues, TContext, TTransformedValues>()` → `UseFormReturn<TFieldValues, TContext, TTransformedValues>` con: `register`, `handleSubmit`, `watch`, `getValues`, `getFieldState`, `setError`, `clearErrors`, `setValue`, `setValues`, `trigger`, `formState`, `resetField`, `reset`, `resetDefaultValues`, `unregister`, `control`, `setFocus`, `subscribe`.

```tsx
import { useForm, SubmitHandler } from "react-hook-form";

type Inputs = {
  example: string
  exampleRequired: string
}

const {
  register,
  handleSubmit,
  watch,
  formState: { errors },
} = useForm<Inputs>()

const onSubmit: SubmitHandler<Inputs> = (data) => console.log(data)

// <input {...register("exampleRequired", { required: true })} />
// {errors.exampleRequired && <span>This field is required</span>}
```

- `register(name, { required, ...reglas HTML })` — validación estándar de HTML; los errores aparecen en `formState.errors.<name>.message`.
- `handleSubmit(onSubmit)` — valida antes de invocar `onSubmit`. **No captura errores lanzados dentro de `onSubmit`**: envolver las llamadas async en try/catch y usar `setError` en el catch para registrar errores de servidor (esto deja `formState.isSubmitSuccessful` en `false`).
- `setError(name, { type, message })` — un error por llamada; iterar para varios campos (`type: "manual"` para errores manuales).

### Integración con Zod: `zodResolver`

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod'; // or 'zod/v4'

const schema = z.object({
  name: z.string().min(1, { message: 'Required' }),
  age: z.number().min(10),
});

const App = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
  });

  return (
    <form onSubmit={handleSubmit((d) => console.log(d))}>
      <input {...register('name')} />
      {errors.name?.message && <p>{errors.name?.message}</p>}
      <input type="number" {...register('age', { valueAsNumber: true })} />
      {errors.age?.message && <p>{errors.age?.message}</p>}
      <input type="submit" />
    </form>
  );
};
```

- `zodResolver(schema, options?, config?)` — `options.errorMap` para mensajes custom; `config.mode` `'sync' | 'async'` (default `'async'`); `config.raw: true` retorna tipos de input sin transformar.
- Inferencia de tipos con schema:

  ```tsx
  // Automático (infiere el output type del schema)
  useForm({ resolver: zodResolver(schema) });

  // Forzado explícito
  useForm<z.input<typeof schema>, any, z.output<typeof schema>>({
    resolver: zodResolver(schema),
  });
  ```

- **Truco numérico:** para campos `number` en el schema usar `{ valueAsNumber: true }` en `register`, si no el input entrega string y falla la validación.

### Justificación de elección (RHF vs alternativas)

- **React Hook Form + @hookform/resolvers: SELECCIONADA.** Integración Zod de primera clase, TS estricto (genéricos para input/output), rendimiento (re-renders minimizados), es el estándar de facto con React 19.
- `remix-hook-form` (benchmark 98 en Context7): wrapper que promete integración con React Router data mode, pero añade dependencia extra y un paradigma que no necesitamos (no usamos actions/formularios de servidor).
- TanStack Form: ecosistema atractivo pero integración Zod menos madura (no usa `zodResolver` estándar).
- **Decisión:** mantener RHF + `@hookform/resolvers`. No introducir librerías de forms adicionales.

### Verified Against

- https://github.com/react-hook-form/documentation/blob/master/src/content/get-started.mdx · `ts.mdx` · `docs/useform/seterror.mdx` · `docs/useform/handlesubmit.mdx`
- https://github.com/react-hook-form/resolvers/blob/master/README.md · `_autodocs/api-reference/zod-resolver.md`
- Versiones: RHF v7.66.0, resolvers actual (consultado 2026-08-11)

---

## 5. dnd-kit — CRÍTICO: dos familias de API

**Hallazgo importante (2026-08-11):** dnd-kit tiene actualmente **dos familias incompatibles entre sí**:

| Familia | Paquetes | API | Estado |
|---|---|---|---|
| **Clásica** (usar esta) | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | `DndContext`, `useDraggable`, `useDroppable`, `SortableContext`, `useSortable`, `CSS.Transform` | Especificada en el plan del proyecto |
| Nueva | `@dnd-kit/react`, `@dnd-kit/dom` | `DragDropProvider`, `useDraggable({id}) → {ref}`, `useDroppable({id}) → {ref, isDropTarget}`, `useSortable({id, index}) → {ref}` | No usar |

**PROHIBIDO mezclar familias**: `useSortable` de `@dnd-kit/sortable` retorna `{attributes, listeners, setNodeRef, transform, transition}`; `useSortable` de `@dnd-kit/react/sortable` retorna `{ref}`. Son APIs y contratos distintos.

### Familia clásica — Allowed APIs (verificadas)

```javascript
import React, {useState} from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

const sensors = useSensors(
  useSensor(PointerSensor),
  useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  })
);

<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragStart={handleDragStart}
  onDragOver={handleDragOver}
  onDragEnd={handleDragEnd}
>
  <SortableContext items={items[columnId]} strategy={verticalListSortingStrategy}>
    {items[columnId].map((id) => <Item key={id} id={id} />)}
  </SortableContext>
  <DragOverlay>{activeItem}</DragOverlay>
</DndContext>
```

- `useDroppable({ id })` → `{ setNodeRef }` (y `isOver` en la familia clásica).
- `useSortable({ id })` → `{ attributes, listeners, setNodeRef, transform, transition }`:

  ```javascript
  import {useSortable} from '@dnd-kit/sortable';
  import {CSS} from '@dnd-kit/utilities';

  const {attributes, listeners, setNodeRef, transform, transition} = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  // <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
  ```

- Utilidades verificadas: `arrayMove`, `closestCenter`, `sortableKeyboardCoordinates`, `verticalListSortingStrategy`, `DragOverlay`, `useSensor`/`useSensors`.

### Accesibilidad (familia clásica)

- `KeyboardSensor` + `sortableKeyboardCoordinates` es el requisito de accesibilidad: habilita ordenar con teclado (espacio para levantar, flechas para mover, espacio para soltar, escape para cancelar).
- El core inyecta automáticamente: instrucciones para lectores de pantalla vía `aria-describedby` (texto por defecto: "To pick up a draggable item, press the space bar...") y anuncios en una live region ("Picked up draggable item X.").
- **NO omitir `KeyboardSensor`** al reemplazar los sensors por defecto: se pierde la navegación por teclado.
- Los anuncios custom (familia nueva) se configuran con `Accessibility.configure({ announcements })`; en la familia clásica el default es suficiente.

### Prohibited Patterns

- NO mezclar `@dnd-kit/core`/`@dnd-kit/sortable` con `@dnd-kit/react`/`@dnd-kit/dom` (ni los hooks ni los providers).
- NO importar `useSortable` desde `@dnd-kit/react/sortable` en un proyecto que usa `@dnd-kit/sortable`.
- NO quitar `KeyboardSensor` de los sensors.

### Verified Against

- https://github.com/clauderic/dnd-kit/blob/main/apps/docs/docs/react/guides/multiple-sortable-lists.mdx (App.js completo, familia clásica)
- https://github.com/clauderic/dnd-kit/blob/main/apps/docs/docs/react/hooks/use-sortable.mdx
- https://github.com/clauderic/dnd-kit/blob/main/packages/react/README.md (familia nueva — para distinguirla)
- https://github.com/clauderic/dnd-kit/blob/main/apps/docs/docs/extend/plugins/accessibility.mdx · `packages/dom/src/core/plugins/accessibility/defaults.ts`
- Versionado: `_dnd_kit_react_0_1_21` disponible (consultado 2026-08-11)

---

## 6. Testing Library + Vitest

### Testing Library (@testing-library/react)

- `render(ui)` → renderiza el componente; `screen` expone todas las queries ligadas a `document.body` (no hace falta desestructurar el retorno de render para las queries).
- Variantes de query: `getBy*` (lanza si no encuentra), `queryBy*` (retorna `null`), `findBy*` (async, espera hasta timeout). Aceptan regex: `screen.getByRole('button', { name: /edit profile/i })`.
- `waitFor(() => expect(...))` — reintenta el callback hasta que pasa o llega al timeout; para aserciones async:

  ```jsx
  await waitFor(() => {
    expect(screen.getByTestId('data')).toHaveTextContent('Hello from API')
  })
  ```

- `fireEvent` — dispara eventos sintéticos (change, click, keyDown, focus, blur) integrados con el sistema de eventos de React:

  ```jsx
  fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'john_doe' } })
  fireEvent.click(screen.getByRole('button', { name: /login/i }))
  ```

### user-event (@testing-library/user-event)

- **Preferir `userEvent.setup()` sobre `fireEvent`** para interacción real (simula el comportamiento del navegador: el click sobre un `<label>` reenvía focus y click al control asociado; un file input abre el diálogo; etc. `fireEvent` no hace eso).

  ```typescript
  const user = userEvent.setup()
  await user.click(button)
  await user.type(input, 'hello')          // alto nivel
  await user.keyboard('hello')             // equivalente de bajo nivel
  ```

- API disponible verificada: `click`, `dblClick`, `tripleClick`, `hover`, `unhover`, `tab`, `keyboard`, `copy`, `cut`, `paste`, `pointer`, `clear`, `deselectOptions`, `selectOptions`, `type`, `upload`.
- `user.pointer([{target: button}, '[MouseLeft]'])` = equivalente de bajo nivel de `user.click`.

### jest-dom (@testing-library/jest-dom)

```javascript
import '@testing-library/jest-dom'   // setup file o por archivo de test
// en TS con Vitest: importar en el setup file y declarar en tsconfig los types
// (o import '@testing-library/jest-dom/vitest')

expect(button).toBeInTheDocument()
expect(button).toBeVisible()
expect(button).toBeEnabled()        // o .not.toBeDisabled()
expect(button).toHaveClass('primary')
expect(el).toHaveTextContent('...') // normaliza whitespace; acepta string o regex
```

- Import alternativo por matchers: `import { toBeInTheDocument, toBeVisible } from '@testing-library/jest-dom/matchers'` + `expect.extend({...})` (no recomendado salvo necesidad).
- En tests RTL, los ejemplos oficiales usan `jest.fn()`; en este proyecto **sustituir por `vi.fn()`** de Vitest.

### Vitest

- `describe` / `it` / `expect` / `vi` se importan de `'vitest'` (o se configuran globals). Matchers: los de Chai/Jest (`toBe`, `toEqual`, `toHaveBeenCalled`, `toHaveBeenCalledTimes`, `toHaveBeenCalledWith`, `not.`).

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('delayed execution', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.clearAllMocks() })
  it('should execute the function', () => {
    executeAfterTwoHours(mock)
    vi.runAllTimers()
    expect(mock).toHaveBeenCalledTimes(1)
  })
})
```

- `vi.fn(implementation?)` — mock function; `fn.mock.calls[0]`, `fn.mock.results[1].value`, `fn.mockImplementation(...)`, `vi.isMockFunction(fn)`.
- `vi.mock('./example.js', () => ({ method: vi.fn() }))` — mocks de módulos, **hoisted** (se aplican antes de los imports).
- `vi.spyOn(exports, 'method').mockImplementation(() => {})` — espionaje de exports.
- Fake timers: `vi.useFakeTimers({ toFake: [...] | toNotFake: [...] })`, `vi.runAllTimers()`, `vi.advanceTimersByTime(ms)`, `vi.advanceTimersToNextTimer()`.

### Prohibited Patterns

- NO usar `fireEvent` cuando se puede usar `userEvent` (salvo casos puntuales de eventos sintéticos raros).
- NO usar queries sobre el retorno de `render()` si `screen` cubre el caso.
- NO olvidar `await` en `userEvent` (todas sus APIs retornan Promise).
- NO usar `jest.*` — el proyecto corre Vitest.

### Verified Against

- https://github.com/testing-library/react-testing-library/blob/main/README.md + docs (llms.txt de react-testing-library)
- https://github.com/testing-library/user-event/blob/main/_autodocs/api-reference/utility.md · `convenience.md` · `types.md` · `src/event/behavior/click.ts`
- https://github.com/testing-library/jest-dom/blob/main/_autodocs/README.md · `matcher-implementations.md` · `entry-points.md` · `configuration.md`
- https://github.com/vitest-dev/vitest/blob/main/docs/api/mock.md · `docs/guide/mocking.md` · `docs/guide/mocking/timers.md` · `docs/api/vi.md`
- Versiones: Vitest v3.x/v4.x, RTL v11 (consultado 2026-08-11)

---

## 7. axe-core

### Allowed APIs

- `axe.run()` — retorna `Promise<results>`; forma con callback: `axe.run(context, options, callback)` con `callback(err, results)`.

```javascript
// Todo el documento
axe.run(document, function (err, results) {
  if (err) throw err;
  console.log(results);
});

// Promesa
axe.run()
  .then(results => {
    if (results.violations.length) {
      throw new Error('Accessibility issues found');
    }
  })

// Contexto: elemento, selector CSS o array de selectores
await axe.run('nav, main');
await axe.run(['nav', '.sideBar', '#header']);
const appRoot = document.getElementById('app');
ReactDOM.createRoot(appRoot).render(MyApp);
await axe.run(appRoot);
```

- Opciones: `axe.run(document, options, callback)` — `{ rules: { 'link-in-text-block': { enabled: true } } }`; `resultTypes: ['violations']` limita el análisis (útil en páginas grandes).

### Estructura del resultado

`results`: `url`, `timestamp`, `testEngine`, `testEnvironment`, `passes[]`, `violations[]`, `inapplicable[]`, `incomplete[]` (estos dos últimos requieren revisión manual).

Cada ítem de `passes/violations/inapplicable/incomplete`: `description`, `help`, `helpUrl`, `id`, `impact` (`'minor' | 'moderate' | 'serious' | 'critical'` | `null`), `tags[]`, `nodes[]` — cada node: `html` (snippet), `impact`, `target` (selectores CSS), `any[]`, `all[]`, `none[]` (checks), y `relatedNodes[]` (`target`, `html`).

### Integración recomendada

- **Unit tests (Vitest + jsdom):** renderizar con RTL en `container` y correr `axe.run(container)`; assert `expect(results.violations).toEqual([])`. **Limitación:** jsdom no mide layout real, color contrast ni focus visual — solo detecta violaciones estructurales/DOM. Cubre reglas básicas, no es sustituto de un scan real.
- **E2E (Playwright) — recomendado como capa de cobertura real:** usar `@axe-core/playwright` con `AxeBuilder`:

  ```js
  const axe = new AxeBuilder({ page });
  axe.include('nav, main');                                   // scope
  axe.exclude('.ad-banner, iframe[src^="youtube.com"]');      // exclusiones
  const results = await axe.analyze();
  ```

- Regla práctica: si una regla es estructural (aria, roles, nombre accesible, jerarquía de headings) se cubre en unit; si depende de rendering/layout, solo e2e.

### Verified Against

- https://github.com/dequelabs/axe-core/blob/develop/doc/API.md
- https://github.com/dequelabs/axe-core/blob/develop/doc/context.md
- https://github.com/dequelabs/axe-core/blob/develop/README.md
- (Consultado 2026-08-11)

---

## Cross-cutting Rules

1. **No mixing Router modes:** todo el árbol con `createBrowserRouter` + `RouterProvider`; nunca `BrowserRouter` (v6 legacy). Loaders/actions solo existen en data mode.
2. **No mixing dnd-kit families:** `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (clásica) es la única familia permitida; prohibido importar de `@dnd-kit/react` / `@dnd-kit/dom`.
3. **TanStack Query v5:** solo object signature (`useQuery({ queryKey, queryFn })`, `useMutation({ mutationFn })`); prohibido el estilo v4 posicional. Patrón optimistic updates completo: cancel → snapshot → update → rollback → invalidate.
4. **useSuspenseQuery:** solo donde la data debe existir siempre y hay Suspense/ErrorBoundary; default de proyecto = `useQuery`.
5. **Formularios:** React Hook Form + `zodResolver` es la única stack de forms permitida. Mensajes de error: `formState.errors.<name>.message`; `setError` para errores de servidor (con try/catch en `onSubmit`).
6. **Zod:** `z.infer` = output type; usar `z.input`/`z.output` cuando hay transforms. `safeParse` para validación no-lanzante en runtime; `parse` para datos que deben ser válidos sí o sí.
7. **Testing:** preferir `userEvent.setup()` sobre `fireEvent`; queries accesibles por rol/texto (no testids salvo necesidad); Vitest con `vi.*` (no `jest.*`); jest-dom importado en el setup file.
8. **A11y:** `KeyboardSensor` + `sortableKeyboardCoordinates` obligatorio en todo DndContext; unit-level axe en jsdom (estructural) + scan e2e con `@axe-core/playwright` (completo).
9. **Versiones (pin sugerido):** react-router ^7, @tanstack/react-query ^5, zod ^3.24 (o ^4 con validación previa del equipo), react-hook-form ^7 + @hookform/resolvers, @dnd-kit/core ^6 + @dnd-kit/sortable + @dnd-kit/utilities (familia clásica), vitest ^3/^4 + @testing-library/react ^16 + @testing-library/user-event ^14 + @testing-library/jest-dom ^6, axe-core ^4.
