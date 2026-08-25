-- Esquema del backend de Urkiola Car Service.
--
-- Solo cuatro tablas. La verdad está en `comandos`: todo lo que ha pasado,
-- con quién y cuándo. `foto` es un atajo para no rehacer el histórico
-- entero cada vez que arranca el servidor, y se puede borrar sin perder
-- nada (se vuelve a construir sola, tarda más en arrancar y ya está).
--
-- El modelo relacional detallado (vehículos, movimientos, preparaciones…)
-- está descrito en docs/BACKEND-API.md y se montará encima de esto cuando
-- haga falta consultar desde fuera (informes, Power BI, Quiter). Para la
-- app no hace falta: pide el estado entero y lo tiene todo.

create table if not exists comandos (
  seq       bigserial primary key,
  id        text        not null unique,   -- idempotencia: el id lo pone el móvil
  tipo      text        not null,
  usuario   text,
  at        timestamptz not null,          -- cuándo lo hizo el operario
  recibido  timestamptz not null default now(),  -- cuándo llegó (puede ser horas después)
  payload   jsonb       not null
);

create index if not exists comandos_at_idx      on comandos (at);
create index if not exists comandos_usuario_idx on comandos (usuario);

create table if not exists foto (
  id             integer     primary key default 1,
  estado         jsonb       not null,
  hasta_comando  bigint      not null default 0,
  actualizado    timestamptz not null default now(),
  constraint foto_unica check (id = 1)
);

create table if not exists credenciales (
  usuario     text        primary key,
  email       text        not null unique,
  hash        text        not null,        -- scrypt, nunca la contraseña
  actualizado timestamptz not null default now()
);

create table if not exists tokens_push (
  token   text        primary key,
  usuario text        not null,
  at      timestamptz not null default now()
);

create index if not exists tokens_push_usuario_idx on tokens_push (usuario);

-- Enlaces de un solo uso para restablecer la contraseña. Se guarda el hash
-- del código, nunca el código: con la base de datos delante no se puede
-- entrar en una cuenta que tenga un enlace a medias.
create table if not exists enlaces_restablecer (
  hash    text        primary key,
  usuario text        not null,
  caduca  timestamptz not null,
  creado  timestamptz not null default now()
);

create index if not exists enlaces_usuario_idx on enlaces_restablecer (usuario);
