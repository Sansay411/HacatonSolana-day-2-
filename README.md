# Aegis Funding Vault

## Что это

Aegis Funding Vault помогает выдавать деньги не вручную, а по понятным правилам.

Как это работает простыми словами:

1. Фаундер создает vault и кладет туда SOL.
2. Получатель не может просто забрать деньги.
3. Он отправляет запрос на расход с описанием цели.
4. Сервер проверяет запрос через Gemini и через жесткие правила.
5. После этого система принимает решение.
6. Решение записывается в сеть Solana.

Проект подходит для:

- грантов
- акселераторов
- стипендий
- контролируемых выплат командам

## Что уже работает

- создание vault
- пополнение vault
- отправка запроса на расход
- проверка запроса через AI
- запасной безопасный режим, если AI недоступен
- approve и reject в сети Solana
- история решений с понятным объяснением
- вход через Firebase
- подключение Solana кошелька

## Как устроен проект

### `programs/aegis_vault`

Смарт контракт на Anchor.
Он хранит vault, правила и запросы.

### `packages/backend`

Сервер.
Он получает запросы, обращается к Gemini, проверяет правила и отправляет итоговое решение в Solana.

### `packages/frontend`

Интерфейс.
Через него пользователь входит в продукт, подключает кошелек, создает vault и смотрит историю решений.

### `packages/shared`

Общие типы и константы.

## Что нужно для запуска

- Node.js 18 или новее
- Rust
- Solana CLI
- Anchor CLI 0.32.1

## Быстрый запуск

### 1. Установить зависимости

```bash
npm install
```

### 2. Собрать смарт контракт

```bash
anchor build
```

### 3. Подготовить backend

Скопируйте пример:

```bash
cp packages/backend/.env.example packages/backend/.env
```

Что нужно заполнить:

- `SOLANA_RPC_URL`
- `RISK_AUTHORITY_SECRET_KEY`
- `PROGRAM_ID`
- `GEMINI_API_KEY`

### 4. Подготовить frontend

Скопируйте пример:

```bash
cp packages/frontend/.env.example packages/frontend/.env
```

Во frontend уже лежат настройки Firebase.
Если у вас другой проект Firebase, замените их на свои.

### 5. Запустить backend

```bash
npm run dev:backend
```

### 6. Запустить frontend

В другом терминале:

```bash
npm run dev:frontend
```

### 7. Открыть проект

```text
http://localhost:5173/
```

## Проверка проекта

### Сборка смарт контракта

```bash
anchor build
```

### Тесты смарт контракта

```bash
anchor test
```

### Сборка frontend

```bash
cd packages/frontend
npm run build
```

### Сборка backend

```bash
cd packages/backend
npm run build
```
## Какие файлы важны

### Смарт контракт

- `programs/aegis_vault/src/lib.rs`

### Backend

- `packages/backend/src/index.ts`
- `packages/backend/src/solana/listener.ts`
- `packages/backend/src/routes/spend-request.ts`
- `packages/backend/src/ai/evaluateRequest.ts`

### Frontend

- `packages/frontend/src/App.tsx`
- `packages/frontend/src/pages/Landing.tsx`
- `packages/frontend/src/pages/CreateVault.tsx`
- `packages/frontend/src/pages/VaultDetail.tsx`

## Частые проблемы

### Не создается vault

Проверьте:

- подключен ли кошелек
- хватает ли SOL на создание аккаунтов и пополнение
- совпадает ли `RISK_AUTHORITY_SECRET_KEY` с backend

### Белый экран

Проверьте:

- создан ли `packages/frontend/.env`
- правильно ли заполнены данные Firebase

### Запрос висит без решения

Проверьте:

- запущен ли backend
- отвечает ли `http://localhost:3001/api/health`
- есть ли SOL у backend ключа на комиссии

