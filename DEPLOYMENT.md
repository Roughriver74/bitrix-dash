# Инструкция по деплою

## Деплой на Vercel

### 1. Подготовка проекта

1. Форкните или клонируйте репозиторий
2. Создайте аккаунт на [Vercel](https://vercel.com), если его еще нет
3. Установите Vercel CLI (опционально):
   ```bash
   npm i -g vercel
   ```

### 2. Деплой через веб-интерфейс

1. Перейдите на https://vercel.com/new
2. Импортируйте ваш GitHub репозиторий
3. Выберите папку `bitrix-dashboard` как корневую
4. Нажмите "Deploy"

### 3. Настройка переменных окружения

**ВАЖНО**: На Vercel обязательно используйте переменные окружения для постоянной конфигурации!

#### Способ 1: Переменные окружения (рекомендуется)

1. В Vercel Dashboard перейдите в ваш проект
2. Нажмите Settings → Environment Variables
3. Добавьте две переменные:
   - **Name**: `BITRIX_WEBHOOK_URL`  
     **Value**: `https://ваш-домен/rest/123/токен/` (со слешем в конце!)
   - **Name**: `BITRIX_DEPARTMENT_NAME`  
     **Value**: `IT отдел` (или ваше название)
4. Нажмите Save
5. Перейдите в Deployments → нажмите три точки → Redeploy

#### Способ 2: Временная настройка через веб-интерфейс

1. Откройте ваш сайт
2. Перейдите на `/setup`
3. Введите данные
4. **⚠️ Внимание**: Настройки сохранятся только до перезапуска сервера!

### 4. Настройка кеширования (опционально)

Для использования кеширования через Redis:

1. Создайте бесплатный аккаунт на [Upstash](https://upstash.com)
2. Создайте новую Redis базу данных
3. В настройках проекта на Vercel добавьте переменные:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

## Деплой на VPS/VDS

### 1. Требования

- Node.js 18+
- PM2 (для production)
- Nginx (опционально, как reverse proxy)

### 2. Установка

```bash
# Клонирование репозитория
git clone https://github.com/Roughriver74/bitrix-dash.git
cd bitrix-dash/bitrix-dashboard

# Установка зависимостей
npm install

# Сборка проекта
npm run build
```

### 3. Запуск с PM2

```bash
# Установка PM2
npm install -g pm2

# Запуск приложения
pm2 start npm --name "bitrix-dashboard" -- start

# Сохранение конфигурации PM2
pm2 save
pm2 startup
```

### 4. Настройка Nginx (опционально)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Деплой через Docker

### 1. Dockerfile

```dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
```

### 2. Запуск контейнера

```bash
# Сборка образа
docker build -t bitrix-dashboard .

# Запуск контейнера
docker run -d -p 3000:3000 --name bitrix-dashboard bitrix-dashboard
```

## Настройка для production

### Рекомендации по безопасности

1. **HTTPS** - всегда используйте HTTPS в production
2. **Firewall** - ограничьте доступ только к необходимым портам
3. **Обновления** - регулярно обновляйте зависимости
4. **Мониторинг** - настройте мониторинг доступности

### Оптимизация производительности

1. **Кеширование** - используйте Redis для кеширования данных
2. **CDN** - используйте CDN для статических ресурсов
3. **Сжатие** - включите gzip сжатие на уровне веб-сервера

## Устранение проблем

### Ошибка подключения к Битрикс24

1. Проверьте правильность webhook URL
2. Убедитесь, что URL заканчивается на `/`
3. Проверьте права доступа вебхука

### Не отображается отдел

1. Проверьте точное название отдела в Битрикс24
2. Убедитесь, что у вебхука есть доступ к департаментам
3. Проверьте регистр букв в названии

### Проблемы с производительностью

1. Включите кеширование через Redis
2. Увеличьте интервал автообновления
3. Оптимизируйте количество запросов к API

## Обновление

Для обновления до последней версии:

```bash
# Получение изменений
git pull origin main

# Установка новых зависимостей
npm install

# Пересборка проекта
npm run build

# Перезапуск приложения (для PM2)
pm2 restart bitrix-dashboard
```