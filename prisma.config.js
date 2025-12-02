const { defineConfig } = require('@prisma/config');

module.exports = defineConfig({
  prisma: {
    schema: 'prisma/schema.prisma',
  },
  datasource: {
    url: process.env.DATABASE_URL || 'file:./dev.db',
  },
});
